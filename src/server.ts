import { serve } from "@hono/node-server";
import { AnthropicAi } from "./ai/anthropic.js";
import { MockAi } from "./ai/mock.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { JobService } from "./jobs.js";
import { MockLightning } from "./lightning/mock.js";
import { NwcLightning } from "./lightning/nwc.js";
import { BtcPrice, MODEL_RATES } from "./pricing.js";

const config = loadConfig();
if (!MODEL_RATES[config.model]) {
  throw new Error(`AI_MODEL "${config.model}" has no price in MODEL_RATES (known: ${Object.keys(MODEL_RATES).join(", ")})`);
}

const mockLightning = config.lightning === "mock" ? new MockLightning() : undefined;
const lightning = mockLightning ?? new NwcLightning(config.nwcUrl!);
const ai = config.ai === "anthropic" ? new AnthropicAi(config.model) : new MockAi();

const jobs = new JobService(lightning, ai, new BtcPrice(config.btcUsdFallback), {
  model: config.model,
  markup: config.markup,
  minSats: config.minSats,
  invoiceExpirySecs: config.invoiceExpirySecs,
});

const app = createApp({ jobs, maxInputChars: config.maxInputChars, mockLightning });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
  console.log(`Lightning: ${config.lightning}, AI: ${config.ai} (${config.model}), markup x${config.markup}`);
  if (mockLightning) console.log("Mock wallet: payments are fake. Set LIGHTNING_BACKEND=nwc for real ones.");
});
