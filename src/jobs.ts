import { randomBytes } from "node:crypto";
import { AiRefusedError, type AiBackend } from "./ai/types.js";
import type { LightningBackend } from "./lightning/types.js";
import { BtcPrice, quoteSats } from "./pricing.js";
import { buildPrompt, inputTokenBudget, outputTokenBudget, type TaskRequest } from "./tasks.js";

export type JobStatus = "awaiting_payment" | "processing" | "done" | "failed" | "expired";

interface Job {
  id: string;
  request: TaskRequest;
  amountSats: number;
  paymentHash: string;
  bolt11: string;
  status: JobStatus;
  createdAt: number;
  expiresAt: number;
  result?: string;
  truncated?: boolean;
  error?: string;
}

/** What the customer sees. Never includes their input text. */
export interface JobView {
  id: string;
  status: JobStatus;
  amountSats: number;
  bolt11: string;
  expiresAt: number;
  result?: string;
  truncated?: boolean;
  error?: string;
}

export interface JobServiceOptions {
  model: string;
  markup: number;
  minSats: number;
  invoiceExpirySecs: number;
  /** Cap on unpaid jobs held in memory, to stop invoice spam filling it. */
  maxPendingJobs?: number;
  /** How long finished jobs are kept so the customer can reload the result. */
  retentionMs?: number;
  aiAttempts?: number;
  retryDelayMs?: number;
}

export class TooManyPendingError extends Error {}

/**
 * Keeps jobs in memory: quote → invoice → payment → AI call → result.
 * The AI only runs after the wallet confirms payment, and only once per job.
 * A restart loses in-flight jobs, which is acceptable for a single small server.
 */
export class JobService {
  private readonly jobs = new Map<string, Job>();
  private readonly maxPending: number;
  private readonly retentionMs: number;
  private readonly aiAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly lightning: LightningBackend,
    private readonly ai: AiBackend,
    private readonly price: BtcPrice,
    private readonly opts: JobServiceOptions,
  ) {
    this.maxPending = opts.maxPendingJobs ?? 1000;
    this.retentionMs = opts.retentionMs ?? 24 * 60 * 60 * 1000;
    this.aiAttempts = opts.aiAttempts ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 2000;
  }

  async quote(request: TaskRequest): Promise<number> {
    return quoteSats({
      model: this.opts.model,
      inputTokens: inputTokenBudget(request),
      outputTokens: outputTokenBudget(request),
      btcUsd: await this.price.usd(),
      markup: this.opts.markup,
      minSats: this.opts.minSats,
    });
  }

  async create(request: TaskRequest): Promise<JobView> {
    this.prune();
    const pending = [...this.jobs.values()].filter((j) => j.status === "awaiting_payment").length;
    if (pending >= this.maxPending) throw new TooManyPendingError("Server is busy, try again shortly");

    const amountSats = await this.quote(request);
    const memo = request.task === "summarise" ? "AI summary" : `AI translation to ${request.targetLanguage}`;
    const invoice = await this.lightning.createInvoice(amountSats, memo, this.opts.invoiceExpirySecs);

    const job: Job = {
      id: randomBytes(16).toString("hex"),
      request,
      amountSats,
      paymentHash: invoice.paymentHash,
      bolt11: invoice.bolt11,
      status: "awaiting_payment",
      createdAt: Date.now(),
      expiresAt: invoice.expiresAt,
    };
    this.jobs.set(job.id, job);
    return view(job);
  }

  /** Returns the job's current state, checking the wallet if it's still unpaid. */
  async status(id: string): Promise<JobView | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    if (job.status === "awaiting_payment") {
      let paid = false;
      try {
        paid = await this.lightning.isPaid(job.paymentHash);
      } catch (err) {
        console.warn(`Invoice lookup failed for job ${id}: ${(err as Error).message}`);
      }
      // Re-check the status: another request may have moved the job on while we awaited.
      if (paid && job.status === "awaiting_payment") {
        job.status = "processing";
        void this.run(job);
      } else if (!paid && job.status === "awaiting_payment" && Date.now() > job.expiresAt) {
        job.status = "expired";
      }
    }
    return view(job);
  }

  private async run(job: Job): Promise<void> {
    const { system, user } = buildPrompt(job.request);
    for (let attempt = 1; attempt <= this.aiAttempts; attempt++) {
      try {
        const out = await this.ai.complete(system, user, outputTokenBudget(job.request));
        job.result = out.text;
        job.truncated = out.truncated;
        job.status = "done";
        return;
      } catch (err) {
        const refused = err instanceof AiRefusedError;
        console.error(`AI call failed for paid job ${job.id} (attempt ${attempt}): ${(err as Error).message}`);
        if (refused || attempt === this.aiAttempts) {
          job.status = "failed";
          job.error = refused
            ? "The AI declined this request."
            : "The AI service failed after payment.";
          // Logged so the operator can refund manually.
          console.error(`REFUND NEEDED: job ${job.id}, ${job.amountSats} sats, payment_hash ${job.paymentHash}`);
          return;
        }
        await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
      }
    }
  }

  private prune(): void {
    const cutoff = Date.now() - this.retentionMs;
    for (const [id, job] of this.jobs) {
      const staleUnpaid = job.status === "awaiting_payment" && Date.now() > job.expiresAt + 60_000;
      if (job.createdAt < cutoff || staleUnpaid) this.jobs.delete(id);
    }
  }
}

function view(job: Job): JobView {
  return {
    id: job.id,
    status: job.status,
    amountSats: job.amountSats,
    bolt11: job.bolt11,
    expiresAt: job.expiresAt,
    ...(job.result !== undefined && { result: job.result, truncated: job.truncated }),
    ...(job.error !== undefined && { error: `${job.error} Your payment is logged under job ${job.id} for a refund.` }),
  };
}
