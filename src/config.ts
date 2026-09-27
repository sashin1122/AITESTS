// All settings come from environment variables so the same code runs locally
// (mock wallet + mock AI) and in production (real wallet + Claude).

export interface Config {
  port: number;
  lightning: "mock" | "nwc";
  nwcUrl?: string;
  ai: "mock" | "anthropic";
  model: string;
  /** Multiplier applied to the worst-case AI cost when quoting a price. */
  markup: number;
  /** Floor for any quote, in sats. */
  minSats: number;
  /** Used when the live BTC price can't be fetched. */
  btcUsdFallback: number;
  /** How long an unpaid invoice stays valid, in seconds. */
  invoiceExpirySecs: number;
  /** Longest input we accept, in characters. */
  maxInputChars: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}

export function loadConfig(): Config {
  const lightning = process.env.LIGHTNING_BACKEND ?? "mock";
  if (lightning !== "mock" && lightning !== "nwc") {
    throw new Error(`LIGHTNING_BACKEND must be "mock" or "nwc", got "${lightning}"`);
  }
  const nwcUrl = process.env.NWC_URL;
  if (lightning === "nwc" && !nwcUrl) {
    throw new Error("LIGHTNING_BACKEND=nwc needs NWC_URL (a nostr+walletconnect:// connection string)");
  }

  const ai = process.env.AI_BACKEND ?? "mock";
  if (ai !== "mock" && ai !== "anthropic") {
    throw new Error(`AI_BACKEND must be "mock" or "anthropic", got "${ai}"`);
  }

  return {
    port: num("PORT", 3000),
    lightning,
    nwcUrl,
    ai,
    model: process.env.AI_MODEL ?? "claude-opus-5",
    markup: num("PRICE_MARKUP", 2),
    minSats: num("MIN_SATS", 21),
    btcUsdFallback: num("BTC_USD_FALLBACK", 100_000),
    invoiceExpirySecs: num("INVOICE_EXPIRY_SECS", 600),
    maxInputChars: num("MAX_INPUT_CHARS", 20_000),
  };
}
