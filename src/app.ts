import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import QRCode from "qrcode";
import { TooManyPendingError, type JobService } from "./jobs.js";
import type { MockLightning } from "./lightning/mock.js";
import { LANGUAGES, SUMMARY_LENGTHS, ValidationError, parseTaskRequest } from "./tasks.js";

export interface AppDeps {
  jobs: JobService;
  maxInputChars: number;
  /** Present only when running on the mock wallet; enables the fake "pay" button. */
  mockLightning?: MockLightning;
  /** Invoices a single client may create per window. */
  rateLimit?: { max: number; windowMs: number };
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const limiter = new RateLimiter(deps.rateLimit?.max ?? 20, deps.rateLimit?.windowMs ?? 10 * 60 * 1000);

  app.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof TooManyPendingError) return c.json({ error: err.message }, 503);
    console.error(err);
    return c.json({ error: "Something went wrong, please try again." }, 500);
  });

  app.get("/api/options", (c) =>
    c.json({
      languages: LANGUAGES,
      lengths: SUMMARY_LENGTHS,
      maxInputChars: deps.maxInputChars,
      mockPayments: Boolean(deps.mockLightning),
    }),
  );

  // Price preview while the user types; creates no invoice.
  app.post("/api/price", async (c) => {
    const request = parseTaskRequest(await readJson(c), deps.maxInputChars);
    return c.json({ amountSats: await deps.jobs.quote(request) });
  });

  app.post("/api/jobs", async (c) => {
    if (!limiter.allow(clientIp(c))) return c.json({ error: "Too many requests, slow down a little." }, 429);
    const request = parseTaskRequest(await readJson(c), deps.maxInputChars);
    const job = await deps.jobs.create(request);
    return c.json({ ...job, qr: await invoiceQr(job.bolt11) }, 201);
  });

  app.get("/api/jobs/:id", async (c) => {
    const job = await deps.jobs.status(c.req.param("id"));
    if (!job) return c.json({ error: "Job not found" }, 404);
    // Include the QR while unpaid so a reloaded page can show it again.
    return c.json(job.status === "awaiting_payment" ? { ...job, qr: await invoiceQr(job.bolt11) } : job);
  });

  if (deps.mockLightning) {
    const mock = deps.mockLightning;
    app.post("/api/dev/pay/:id", async (c) => {
      const job = await deps.jobs.status(c.req.param("id"));
      if (!job) return c.json({ error: "Job not found" }, 404);
      mock.markPaid(paymentHashOf(job.bolt11, mock));
      return c.json({ ok: true });
    });
  }

  app.use("/*", serveStatic({ root: "./public" }));
  return app;
}

function invoiceQr(bolt11: string): Promise<string> {
  // Upper case lets the QR use its compact alphanumeric mode.
  return QRCode.toDataURL(`lightning:${bolt11}`.toUpperCase(), { margin: 1, width: 280 });
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }
}

function paymentHashOf(bolt11: string, mock: MockLightning): string {
  const hash = mock.hashForInvoice(bolt11);
  if (!hash) throw new ValidationError("Unknown mock invoice");
  return hash;
}

function clientIp(c: Context): string {
  // First hop of X-Forwarded-For when behind a hosting proxy (Render, Fly, etc.).
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Fixed-window counter per client; enough to stop casual invoice spam. */
class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt < now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }
}
