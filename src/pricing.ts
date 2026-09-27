// Turns a request into a price in sats. The quote covers the worst case
// (every output token used) times a markup, so a paid request can't lose money.

/** US dollars per million tokens (Anthropic first-party API rates). */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const SATS_PER_BTC = 100_000_000;

export function worstCaseUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_RATES[model];
  if (!rates) throw new Error(`No price known for model "${model}"; add it to MODEL_RATES`);
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export function usdToSats(usd: number, btcUsd: number): number {
  return (usd / btcUsd) * SATS_PER_BTC;
}

export interface QuoteInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  btcUsd: number;
  markup: number;
  minSats: number;
}

export function quoteSats(q: QuoteInput): number {
  const sats = usdToSats(worstCaseUsd(q.model, q.inputTokens, q.outputTokens) * q.markup, q.btcUsd);
  return Math.max(q.minSats, Math.ceil(sats));
}

/** Live BTC/USD price from mempool.space, cached, with a configured fallback. */
export class BtcPrice {
  private cached?: { usd: number; at: number };

  constructor(
    private readonly fallbackUsd: number,
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async usd(): Promise<number> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.usd;
    try {
      const res = await this.fetchImpl("https://mempool.space/api/v1/prices", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const usd = Number(((await res.json()) as { USD?: unknown }).USD);
      if (!Number.isFinite(usd) || usd <= 0) throw new Error("no USD price in response");
      this.cached = { usd, at: Date.now() };
      return usd;
    } catch (err) {
      // Serve a stale price if we have one; otherwise the configured fallback.
      console.warn(`BTC price fetch failed (${(err as Error).message}); using ${this.cached ? "cached" : "fallback"} price`);
      return this.cached?.usd ?? this.fallbackUsd;
    }
  }
}
