# Sats Summariser

The purpose of this project is to create some web app, preferebly decencralised that intersects the world of both AI and bitcoin to generate some form of income. start evaluating ideas and get going. a budget of R200 can be organised if necissasry.

See [EVALUATION.md](EVALUATION.md) for the ideas considered and why this one was picked.

## What it does

A web page where anyone can **summarise or translate text with AI and pay a few sats over Lightning**. There's no account and no card.

1. The customer pastes text and picks a task. The page shows the price in sats.
2. They request an invoice and pay it from any Lightning wallet (QR code or "Open in wallet").
3. The server confirms the payment with our wallet, and only then calls the AI.
4. The result appears on the page. Reloading the page or returning from the wallet app picks the job back up.

Prices are the **worst-case** AI cost (every output token used) × a markup, converted at the live BTC price, so a paid request never loses money.

## Run it locally (no wallet or API key needed)

```bash
npm install
npm run dev          # http://localhost:3000
```

With the defaults, payments and AI are both **mocked**. Use the "Simulate payment (dev)" button to walk through the whole flow.

```bash
npm test             # unit and end-to-end API tests
npm run typecheck
```

## Go live

1. **Wallet.** Use a wallet that supports [Nostr Wallet Connect](https://nwc.dev) (e.g. Alby Hub, Coinos or Primal). Create a connection with **only** the `make_invoice` and `lookup_invoice` permissions, so a leaked connection string can't spend your funds. Set `LIGHTNING_BACKEND=nwc` and `NWC_URL=...`.
2. **AI.** Create an Anthropic API key, add some credit, and set `AI_BACKEND=anthropic` and `ANTHROPIC_API_KEY=...`. The default model is `claude-opus-5`. Set `AI_MODEL=claude-haiku-4-5` for requests that cost about 5× less, and so quotes that are about 5× lower.
3. **Host.** Deploy to any free Node host (e.g. Render) with `npm install` as the build command and `npm start` as the start command. Set the variables from [.env.example](.env.example) in the host's dashboard.

## Limitations of this first version

- **In-memory state.** Jobs live in memory, so run a single instance. A restart loses unpaid invoices and results that haven't been collected yet. If a job has already been paid when the server restarts, the server log is the only record of it.
- **Manual refunds.** If the AI fails or declines after payment, the job shows a refund message and the server logs `REFUND NEEDED` with the job id, amount and payment hash. Refunds are sent by hand.
- **Text only.** Fetching URLs isn't supported yet; it needs protection against server-side request forgery (SSRF) first.
- **Basic rate limiting.** The limit is per IP address, in memory. It's enough to stop casual invoice spam, not a determined attacker.

## Project layout

```
src/
  server.ts          entry point, wires everything from env vars
  app.ts             HTTP routes (Hono) and static files
  jobs.ts            quote → invoice → payment → AI → result
  tasks.ts           input validation, prompts, token budgets
  pricing.ts         model rates, sats quotes, live BTC price
  lightning/         wallet backends: nwc (real), mock
  ai/                AI backends: anthropic (real), mock
public/              the web page (plain HTML/CSS/JS)
test/                node:test suites
```

## Next steps

- Run the same service as a Nostr bot / NIP-90 Data Vending Machine (see EVALUATION.md).
- Offer the same endpoints to developers and AI agents behind an L402 paywall.
- Persist jobs (SQLite) so restarts don't lose paid work.
