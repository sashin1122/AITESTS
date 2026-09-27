# Idea evaluation: AI × Bitcoin web app

Goal (from README): a web app, preferably decentralised, that combines AI and
Bitcoin and brings in some income. Budget: R200 (roughly US$10–11).

## Constraints that drive the choice

- **R200 total.** No paid servers, no GPUs. Hosting has to fit a free tier,
  and most of the money should go to AI API credits.
- **AI calls cost money on every request.** Anything we give away for free
  loses money, so each AI request should be paid for before it runs.
- **Bitcoin payments must be tiny and instant.** On-chain fees kill small
  payments, so this means the Lightning Network (payments of a few sats,
  near-zero fees, settled in seconds).
- **Decentralised where it's cheap to be.** Nostr (an open social protocol
  built around keys and relays, with Lightning "zaps" built in) gives
  decentralised distribution for free. The AI itself will still run on a
  central API; running our own models isn't affordable.

## Scoring

Each idea is scored 1–5 (5 = best) on:

- **Cost:** how much of the R200 it needs, and ongoing running cost.
- **Speed:** how quickly a working, paid MVP can ship.
- **Income:** realistic chance of earning more than it costs.
- **Decentral.:** how decentralised it can be.
- **Risk (inverse):** 5 = low technical, legal and competitive risk.

| # | Idea | Cost | Speed | Income | Decentral. | Risk | **Total** |
|---|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Pay-per-prompt AI web tool (Lightning paywall, no accounts) | 5 | 5 | 3 | 2 | 4 | **19** |
| 2 | L402 AI API for developers and AI agents | 5 | 4 | 2 | 3 | 4 | **18** |
| 3 | Nostr AI bot paid by zaps | 5 | 4 | 2 | 5 | 3 | **19** |
| 4 | Nostr Data Vending Machine (NIP-90) provider | 5 | 3 | 2 | 5 | 3 | **18** |
| 5 | AI image generation for sats | 3 | 4 | 2 | 2 | 2 | **13** |
| 6 | Sats-for-data marketplace (people label or rate AI output for sats) | 2 | 2 | 2 | 4 | 2 | **12** |
| 7 | AI trading or "signals" bot | 4 | 3 | 1 | 1 | 1 | **10** |

## Notes per idea

### 1. Pay-per-prompt AI web tool
A web page where the user types a request, gets a Lightning invoice, pays a
few sats, and gets the AI result. No sign-up and no card.

- **For:** simplest to build; the value is obvious; every request is paid
  in advance, so we never lose money on it; runs on free hosting.
- **Against:** generic "chat with AI for sats" sites already exist (PPQ.ai,
  for example), and ChatGPT and Claude have free tiers. It needs a
  **specific useful task** rather than general chat to stand out.
- **Decentralisation:** low on its own, but the same backend can feed ideas 3 and 4.

### 2. L402 AI API
The same service offered as an HTTP API behind an L402 paywall (the server
answers `402 Payment Required` with a Lightning invoice; the client pays and
retries). AI agents that can pay for themselves are a growing niche.

- **For:** almost free extra work once idea 1 exists; no user interface needed.
- **Against:** the buyers are few (developers and agents with Lightning
  wallets) and they're discovered slowly. Better as an add-on than as the main product.

### 3. Nostr AI bot paid by zaps
A Nostr account that answers when it's mentioned and zapped (NIP-57).

- **For:** fully decentralised distribution, no website to host, and the
  Nostr audience already uses Lightning, so it's our target market.
- **Against:** zaps are tips, not enforced payments. Replying only after
  the zap arrives solves this but adds friction. Nostr's user base is small,
  and bots can get muted by users and relays.

### 4. Nostr Data Vending Machine (NIP-90)
NIP-90 is a Nostr standard for paid automated jobs: clients post a job
(summarise, translate, transcribe…), providers reply with a price and the
result.

- **For:** it's a built-in marketplace for exactly this service,
  decentralised by design, and it reuses the backend from idea 1.
- **Against:** the protocol and client support are still young, demand
  is thin, and we'd compete with other providers on price.

### 5. AI image generation for sats
- Image APIs cost much more per call than text, so the budget runs out
  quickly. The market is crowded, and content moderation is a real risk.

### 6. Sats-for-data marketplace
- Needs both buyers and workers from day one (a chicken-and-egg problem),
  plus fraud and quality control. Too heavy for this budget.

### 7. AI trading or "signals" bot
- Rejected. Real financial risk to us or users, possible regulatory trouble
  (in South Africa crypto is regulated as a financial product by the FSCA),
  and no real edge.

## Recommendation

**Build one small backend that sells AI tasks paid per request over
Lightning, then offer it through three storefronts:**

1. **Web app first (idea 1).** It's the quickest way to see whether anyone pays.
2. **Same endpoints behind L402 (idea 2).** Almost free to add.
3. **Nostr bot and DVM (ideas 3 and 4).** The decentralised channels,
   added once the core works.

Ideas 1, 2, 3 and 4 share about 80% of their code: take a request,
create a Lightning invoice, wait for payment, call the AI, return the
result. So this is one project with several ways in, not four projects.

### Pick a niche, not "chat"
Suggested first product: **"Summarise or translate anything for a few sats."**
Paste text or a URL and get a summary, TL;DR or translation back
(including local languages such as Afrikaans or isiZulu). It costs little
per call, the price is easy to set, it's useful to people who don't want a
subscription, and it maps directly onto NIP-90 job types for the Nostr
channel.

### Pricing rule
`price_in_sats = max(minimum_fee, estimated_API_cost × 2–3)`, recalculated
from the current BTC/ZAR (or BTC/USD) rate. Because payment always comes
before the AI call, every request makes a profit or at worst breaks even.

### Budget plan (R200)

| Item | Cost | Notes |
|------|------|-------|
| Hosting | R0 | Free tier (e.g. Cloudflare Workers/Pages, Deno Deploy, Render) |
| Lightning wallet with an API | R0 | A custodial wallet with an API or Nostr Wallet Connect (e.g. Coinos, Blink, Alby Hub) to start. Move to self-custody once there's volume |
| AI API credits | ~R150–200 | A small, fast, cheap model. Paid requests top this back up |
| Domain | R0 for now | Use the host's free subdomain. Buy a domain only if it takes off |

### Honest expectations
Early income will likely be **small (tens to hundreds of rands a month at
best)**. The Lightning-paying audience is small, and discovery on Nostr and
in Bitcoin communities takes time. The design keeps the downside near zero:
nothing runs until it's paid for, and hosting is free. So the real cost is
build time, and the main risk is that no one uses it, not losing money.

### Things to check before launch
- **Wallet custody:** a custodial wallet holds our sats. Withdraw regularly.
- **Tax:** SARS treats crypto income as taxable. Keep a simple log of
  earnings.
- **AI provider terms:** make sure reselling API output is allowed
  (generally it is, with usage-policy obligations passed on to users) and
  add basic abuse filtering.

## Next steps (MVP)

1. Choose the stack: a small TypeScript backend plus a static front end,
   deployable to a free tier.
2. Choose the wallet (custodial with an API, or Nostr Wallet Connect) and
   test creating and checking invoices.
3. Build `POST /summarise`: create invoice → poll for payment → call AI →
   return result.
4. Build a minimal web page with a QR code for the invoice.
5. Launch: post on Nostr and in Bitcoin communities (including South
   African ones), and measure paid requests per day.
6. If there's any uptake, add the L402 API, then the Nostr bot/DVM.
