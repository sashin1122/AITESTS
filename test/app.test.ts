import assert from "node:assert/strict";
import { test } from "node:test";
import { MockAi } from "../src/ai/mock.js";
import { AiRefusedError, type AiBackend } from "../src/ai/types.js";
import { createApp } from "../src/app.js";
import { JobService } from "../src/jobs.js";
import { MockLightning } from "../src/lightning/mock.js";
import { BtcPrice } from "../src/pricing.js";

const offline = (async () => { throw new Error("offline"); }) as typeof fetch;

function setup(ai: AiBackend = new MockAi(), rateLimit?: { max: number; windowMs: number }) {
  const lightning = new MockLightning();
  const jobs = new JobService(lightning, ai, new BtcPrice(100_000, 60_000, offline), {
    model: "claude-opus-5",
    markup: 2,
    minSats: 21,
    invoiceExpirySecs: 600,
    retryDelayMs: 1,
  });
  const app = createApp({ jobs, maxInputChars: 20_000, mockLightning: lightning, rateLimit });
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { app, post };
}

async function waitFor(app: ReturnType<typeof setup>["app"], id: string, status: string) {
  for (let i = 0; i < 100; i++) {
    const job = (await (await app.request(`/api/jobs/${id}`)).json()) as { status: string; result?: string; error?: string };
    if (job.status === status) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`job never reached ${status}`);
}

test("full flow: invoice, payment, result", async () => {
  let aiCalls = 0;
  const countingAi: AiBackend = { complete: (s, u) => { aiCalls++; return new MockAi().complete(s, u); } };
  const { app, post } = setup(countingAi);

  const res = await post("/api/jobs", { task: "summarise", text: "Bitcoin is a peer-to-peer electronic cash system." });
  assert.equal(res.status, 201);
  const job = (await res.json()) as { id: string; status: string; amountSats: number; qr: string };
  assert.equal(job.status, "awaiting_payment");
  assert.ok(job.amountSats >= 21);
  assert.match(job.qr, /^data:image\/png;base64,/);

  // Unpaid: no AI call yet.
  const unpaid = (await (await app.request(`/api/jobs/${job.id}`)).json()) as { status: string };
  assert.equal(unpaid.status, "awaiting_payment");
  assert.equal(aiCalls, 0);

  assert.equal((await post(`/api/dev/pay/${job.id}`, {})).status, 200);
  const done = (await waitFor(app, job.id, "done"));
  assert.match(done.result ?? "", /mock Summary/);

  // Polling again doesn't run (or charge for) the AI twice.
  await app.request(`/api/jobs/${job.id}`);
  assert.equal(aiCalls, 1);
});

test("price preview matches the invoice amount", async () => {
  const { post } = setup();
  const body = { task: "translate", text: "Good morning", targetLanguage: "Afrikaans" };
  const { amountSats } = (await (await post("/api/price", body)).json()) as { amountSats: number };
  const job = (await (await post("/api/jobs", body)).json()) as { amountSats: number };
  assert.equal(job.amountSats, amountSats);
});

test("invalid input is a 400", async () => {
  const { post } = setup();
  const res = await post("/api/jobs", { task: "translate", text: "hi", targetLanguage: "Klingon" });
  assert.equal(res.status, 400);
});

test("unknown job is a 404", async () => {
  const { app } = setup();
  assert.equal((await app.request("/api/jobs/nope")).status, 404);
});

test("a refusal after payment fails the job with a refund note", async () => {
  const refusing: AiBackend = { complete: async () => { throw new AiRefusedError("no"); } };
  const { app, post } = setup(refusing);
  const job = (await (await post("/api/jobs", { task: "summarise", text: "x" })).json()) as { id: string };
  await post(`/api/dev/pay/${job.id}`, {});
  const failed = (await waitFor(app, job.id, "failed"));
  assert.match(failed.error ?? "", /refund/);
});

test("transient AI errors are retried", async () => {
  let calls = 0;
  const flaky: AiBackend = {
    complete: async () => {
      if (++calls < 3) throw new Error("overloaded");
      return { text: "ok", truncated: false };
    },
  };
  const { app, post } = setup(flaky);
  const job = (await (await post("/api/jobs", { task: "summarise", text: "x" })).json()) as { id: string };
  await post(`/api/dev/pay/${job.id}`, {});
  await waitFor(app, job.id, "done");
  assert.equal(calls, 3);
});

test("invoice creation is rate limited per client", async () => {
  const { post } = setup(new MockAi(), { max: 2, windowMs: 60_000 });
  const body = { task: "summarise", text: "x" };
  assert.equal((await post("/api/jobs", body)).status, 201);
  assert.equal((await post("/api/jobs", body)).status, 201);
  assert.equal((await post("/api/jobs", body)).status, 429);
});
