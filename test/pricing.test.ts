import assert from "node:assert/strict";
import { test } from "node:test";
import { BtcPrice, quoteSats, worstCaseUsd } from "../src/pricing.js";

test("worst-case cost uses per-million-token rates", () => {
  // 1M input at $5 + 1M output at $25
  assert.equal(worstCaseUsd("claude-opus-5", 1_000_000, 1_000_000), 30);
});

test("unknown model is rejected", () => {
  assert.throws(() => worstCaseUsd("gpt-whatever", 1, 1), /No price known/);
});

test("quote applies markup, rounds up and converts at the BTC price", () => {
  // $0.01 * 2 markup = $0.02 at $100k/BTC = 20 sats
  const sats = quoteSats({ model: "claude-haiku-4-5", inputTokens: 0, outputTokens: 2000, btcUsd: 100_000, markup: 2, minSats: 1 });
  assert.equal(sats, 20);
});

test("quote never goes below the minimum", () => {
  const sats = quoteSats({ model: "claude-haiku-4-5", inputTokens: 1, outputTokens: 1, btcUsd: 100_000, markup: 2, minSats: 21 });
  assert.equal(sats, 21);
});

test("BTC price falls back when the fetch fails, and caches successes", async () => {
  let calls = 0;
  const failing = new BtcPrice(90_000, 60_000, (async () => { throw new Error("offline"); }) as typeof fetch);
  assert.equal(await failing.usd(), 90_000);

  const working = new BtcPrice(90_000, 60_000, (async () => {
    calls++;
    return new Response(JSON.stringify({ USD: 123_456 }));
  }) as typeof fetch);
  assert.equal(await working.usd(), 123_456);
  assert.equal(await working.usd(), 123_456);
  assert.equal(calls, 1);
});
