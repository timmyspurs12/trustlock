## Inspiration

Freelancers wait 30–60+ days and still get stiffed. Clients pay upfront and pray. Existing escrow is locked inside marketplaces (Upwork/Fiverr, 10–20% fees) or run by human agents (escrow.com). There is no standalone, AI-verified, PayPal-native escrow for direct client–freelancer relationships.

PayPal's developer team is pushing exactly this direction — agentic commerce, the Agent Toolkit, and "pays contractors automatically when a job is marked complete." We asked: what if the agent could *prove* the work, not just mark it complete?

## What it does

TrustLock is escrow-like milestone protection powered by a PayPal authorization:

1. The client creates a milestone with structured acceptance criteria and funds it through PayPal. The money is **authorized — held, not captured** (Orders v2 `intent=AUTHORIZE` → buyer approves → server authorizes → funds held for 29 days).
2. The freelancer delivers and submits evidence (deliverable URL + notes).
3. An AI verification agent fetches the deliverable server-side and evaluates **every acceptance criterion** — PASS / FAIL / INCONCLUSIVE, each with cited evidence and a confidence score. It never invents criteria and never marks INCONCLUSIVE as PASS.
4. A **deterministic policy engine** — not the AI — decides whether the verdict may cause a payment: AUTO_RELEASE (confidence + amount caps), HUMAN_REVIEW, REQUEST_CHANGES, or REJECTED.
5. On approval, TrustLock captures the authorization (full or partial) with a stable `PayPal-Request-Id`, reads the capture back, and reconciles async settlement (`CAPTURE_PENDING` until PayPal reports `COMPLETED` — never shows PAID while PENDING).
6. Every decision is recorded in an append-only audit trail; an AG Studio dashboard gives real-time, self-serve analytics (with an AI assistant panel).

## How we built it

- **Stack:** Next.js 15 (App Router) · TypeScript · React 19 · PostgreSQL (Neon) · Tailwind v4.
- **PayPal:** direct REST integration (Orders v2 authorize/capture/void, Payments v2, transaction reporting, webhooks with signature verification) + the JavaScript SDK (`intent=authorize`) for buyer approval. Sandbox only — no real money moves.
- **AI:** Vercel AI SDK + Google Gemini (`generateObject` with a strict Zod schema for the structured verdict), with a model fallback chain for reliability.
- **Policy:** a pure, deterministic engine (`lib/policy/engine.ts`) — thresholds and caps, no LLM judgment on money movement.
- **Frontend:** a "Ledger & Trust" design system, an operational control-room milestone page, a live agent trace, and an AG Studio insights dashboard (custom layout, KPIs, charts, AI assistant).
- **Safety:** server-derived payment state, amount/ownership checks on every mutation, idempotent releases (unique constraints + stable idempotency keys), append-only audit tables (trigger-enforced).

## Challenges we ran into

- **Sandbox async settlement.** Captures can be accepted as `PENDING` and stay pending for minutes — we built a reconciler + webhook path so the UI never claims PAID before PayPal confirms.
- **Model availability.** `gemini-2.5-flash` was retired mid-build and `gemini-3.8-flash` was rate-limited — we probed availability live and shipped a fallback chain (`AI_MODEL` + `gemini-3.5-flash`).
- **Vercel build failures.** AG Studio is heavy (build OOM on small machines), and `next/font/google` failed at build time on Vercel — we self-hosted the fonts (`next/font/local`) and pinned build memory.
- **Honesty vs. demo pressure.** The agent marked criteria INCONCLUSIVE when text evidence couldn't establish them (e.g. mobile viewport) — we kept that behavior; it's the product's core differentiator.

## Accomplishments that we're proud of

- A **fully working, live-verified loop**: fund → hold → evidence → AI verification (RELEASE, 100% confidence, 5/5 criteria) → policy AUTO_RELEASE → PayPal capture → CAPTURE_PENDING, with a complete audit trail.
- **The honesty path**: the same system returns REQUEST_CHANGES and releases $0 when evidence is insufficient — no rubber-stamping.
- **No duplicate captures:** duplicate release requests are idempotent (proven at PayPal: exactly one capture per authorization).
- A premium, truthful UI — and an AG Studio dashboard with an AI assistant panel.

## What we learned

- PayPal's authorize → capture → void lifecycle is a genuinely underused escrow primitive — the 29-day hold, 3-day honor period, and single reauthorization (Day 4–29) map perfectly onto milestone work.
- Treating AI output as untrusted input (Zod + deterministic policy) is what makes autonomous payment release defensible.
- Judges don't run your code — the video and the write-up *are* the product.

## What's next for TrustLock

- Multi-milestone contracts, milestone reauthorization scheduling, and a void/cancel path.
- Partial-release remainder handling and dispute support.
- Real authentication and a freelancer payout rail (PayPal Payouts), then a production launch.
