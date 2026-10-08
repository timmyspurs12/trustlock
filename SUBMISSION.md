# TrustLock — Devpost Submission Package

**Hackathon:** PayPal AI Hackathon: Build what's next with PayPal and AI
**Deadline:** Thursday, **Nov 12, 2026, 12:00pm PT** (9:00pm WAT) — submit by **Nov 11**.
**Devpost:** https://paypalaihackathon.devpost.com/

## Submission requirements (from the Official Rules)

- [x] **Working demo** — hosted URL (see Deployment below) or complete run instructions (README).
- [x] **Public repo with a visible open-source LICENSE** — `LICENSE` (MIT) added at the repo root. Push to GitHub (public).
- [ ] **YouTube demo video, under 3 minutes, public** — script in [`DEMO.md`](DEMO.md).
- [x] **English** description.
- [x] **PayPal sandbox** — all money movement is sandbox-only; the app refuses non-sandbox base URLs.
- [x] **Meaningful PayPal + AI** — PayPal Orders v2 authorize/capture/void + AI evidence verification.

## Prize categories to select on the form

- **1st Place** ($12,000)
- **Best Use of PayPal + AI** ($5,000)
- **Best Use of Agentic Commerce** ($5,000)
- **Most Creative** ($5,000)
- **Most Impactful** ($5,000)
- **Best Demo Delivery** ($5,000)
- **Best Use of AG Grid** ($5,000 / $2,000 / 3×$1,000) — AG Studio dashboard on the Insights page + AI assistant panel

> Reminder: one project can win **one grand/honorable prize + one sponsor prize**. The realistic maximum is 1st Place + AG Grid 1st ($17,000); the strong path is an honorable mention + AG Grid 1st ($10,000).

## Ready-to-paste Devpost description

**Short (elevator pitch):**
> TrustLock is escrow-like milestone protection powered by PayPal authorization. A client funds a milestone into a PayPal hold — money authorized, not captured. When the freelancer delivers, an AI agent fetches the evidence and verifies every contractual acceptance criterion (PASS / FAIL / INCONCLUSIVE, with evidence and confidence). A deterministic policy engine — not the AI — decides whether funds may be released, and TrustLock captures the PayPal authorization only then. If evidence can't establish a criterion, the agent says INCONCLUSIVE and pays nothing. Every decision is recorded in an append-only audit trail.

**Long (project description):**
> **The problem.** Freelancers wait 30–60+ days and still get stiffed; clients pay upfront and pray. Existing escrow is locked inside marketplaces (Upwork/Fiverr, 10–20% fees) or run by human agents (escrow.com). There is no standalone, AI-verified, PayPal-native escrow for direct client–freelancer relationships.
>
> **The product.** TrustLock holds client funds in a PayPal authorization (Orders v2 `intent=AUTHORIZE` → buyer approves → server authorizes → funds held). The freelancer submits evidence (deliverable URL + notes). A verification agent (Gemini via the Vercel AI SDK) fetches the deliverable server-side and evaluates **every structured acceptance criterion** — PASS only with direct evidence, FAIL when contradicted, INCONCLUSIVE when the evidence can't establish it (e.g. visual viewport behavior). A deterministic policy engine (minimum confidence, auto-release cap, required-criteria gates) decides AUTO_RELEASE / HUMAN_REVIEW / REQUEST_CHANGES / REJECTED. Release captures the authorization with a stable `PayPal-Request-Id` (idempotent); captures that return PENDING are reconciled to PAID via webhooks + polling — never assumed. Every event lands in an append-only `agent_actions` audit trail.
>
> **Why it wins.** PayPal is the money rail, not a checkout button: authorize → hold → conditional capture → void, with buyer approval enforced server-side. The AI proposes; the policy engine decides; the server executes. And the system is honest by design — when evidence is insufficient, it refuses to pay.
>
> **Sponsor tools.** AG Studio powers the Insights dashboard (self-serve analytics over live TrustLock data) with an AI assistant panel (Studio Agent Framework) backed by Gemini through a server-side proxy. PayPal Agent Toolkit/MCP patterns informed the server-side PayPal module.
>
> **Stack.** Next.js 15 (App Router) · TypeScript · PostgreSQL · PayPal REST (Orders v2 / Payments v2) · PayPal JS SDK (intent=authorize) · Vercel AI SDK + Gemini · AG Studio · Tailwind v4. Sandbox only — no real money moves.

**What to inspect (judges):** the milestone page of "Website Delivery" (lifecycle, AI verification with per-criterion evidence, agent trace, PayPal panel showing capture PENDING), the "Landing page for the bakery client" milestone (INCONCLUSIVE → REQUEST CHANGES, $0 released), the Activity page (expandable audit events), and Insights (AG Studio dashboard + Edit mode AI assistant).

## Deployment guide (Vercel)

1. **Postgres:** create a free Postgres (Neon or Supabase). The schema (`lib/db/schema.sql`) auto-applies on first request.
2. **Env vars (Vercel project settings):**
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (sandbox app)
   - `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`, `PAYPAL_ENVIRONMENT=sandbox`
   - `DATABASE_URL=postgresql://...`
   - `GOOGLE_GENERATIVE_AI_API_KEY` (aistudio.google.com, free tier), `AI_MODEL=gemini-3.5-flash`
   - `PAYPAL_WEBHOOK_ID` — create a webhook at developer.paypal.com/dashboard (Sandbox → Webhooks) pointing at `https://<your-app>/api/paypal/webhooks` with events `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `CHECKOUT.ORDER.APPROVED`. Paste its ID here so webhook signature verification runs live.
   - `AG_STUDIO_LICENSE_KEY` — request the free 45-day AG Studio trial (ag-grid.com/studio) so the hosted demo has no watermark.
3. **Deploy:** `vercel --prod` (or the GitHub integration). Build note: AG Studio needs memory — on constrained CI set `NODE_OPTIONS=--max-old-space-size=3072`.
4. **Demo data:** create 1–2 milestones, fund them (sandbox buyer), submit evidence, run the review — the demo flow in `DEMO.md`.

## Manual steps remaining (owner actions)

1. **Push the repo to GitHub (public)** — `git remote add origin <url> && git push -u origin main`. Verify the LICENSE file is visible on the repo page.
2. **Record the demo video** (<3 min, public YouTube) using `DEMO.md`.
3. **Request the AG Studio 45-day trial license** (ag-grid.com/studio) → set `AG_STUDIO_LICENSE_KEY`.
4. **Deploy** (Vercel) and set the env vars above; register the PayPal sandbox webhook.
5. **Submit on Devpost by Nov 11, 2026** (deadline Nov 12, 12:00pm PT): paste the descriptions above, add the video + hosted URL + repo link, select the prize categories listed above.

## Verification commands (all green at last commit)

```bash
npm run build        # type-checked production build
npm run spike        # PayPal sandbox lifecycle regression (6 PASS · 1 PARTIAL)
npm run test:policy  # deterministic policy engine safety tests (10/10)
```

Security posture: `.env` gitignored and never committed; no PayPal secret or AI key in client code (the Studio AI assistant calls the server-side `/api/studio-ai` proxy); server-derived payment state; amount/ownership checks on every mutation; append-only audit tables (trigger-enforced).
