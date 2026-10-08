# TrustLock

**Escrow-like milestone protection powered by PayPal authorization.**

A client funds a freelance milestone through PayPal; the money is *authorized (held)*, not captured. When the freelancer submits a deliverable, an AI verification agent checks it against the milestone's acceptance criteria, a policy engine decides whether funds may be released, and only then does TrustLock capture the PayPal authorization — in full, in part, or not at all (void).

Built for the **PayPal AI Hackathon 2026** (Devpost). All money movement runs against the **PayPal Sandbox** — no real funds.

> Terminology note: a PayPal authorization hold is *not* regulated escrow. TrustLock is a **programmable payment mandate**: user-granted, policy-bounded, auditable release of held funds.

## Phase status

- **Phase 0 — payment primitive spike: GO** (6 PASS · 1 PARTIAL · 0 FAIL against the live sandbox). See [`spike/README.md`](spike/README.md) and [`spike/FINDINGS.md`](spike/FINDINGS.md). `npm run spike` remains a permanent regression test.
- **Phase 1 — payment foundation: GO.** Next.js 15 + PostgreSQL + server-side PayPal REST + PayPal JS SDK (buyer approval). Flow: create milestone → fund (server creates `intent=AUTHORIZE` order) → buyer approves → server authorizes → funds HELD (`AUTHORIZED`). Live-verified: $100.00 held, not captured.
- **Phase 2 — AI verification → policy → release: in progress.** The core product loop: freelancer submits evidence → the AI agent evaluates **every structured acceptance criterion** against fetched evidence (Zod-validated, criterion-by-criterion, INCONCLUSIVE when evidence is insufficient) → a **deterministic policy engine** decides whether release is permitted → controlled PayPal capture → reconciliation (`CAPTURE_PENDING` vs `PAID`). The AI never calls PayPal directly. Run the policy safety tests with `npm run test:policy`.

## AI verification loop (Phase 2)

```
AUTHORIZED milestone (funds held)
  → POST /api/milestones/[id]/evidence     freelancer submits deliverable URL + notes
  → POST /api/milestones/[id]/review       server fetches evidence, AI agent evaluates
                                           each criterion (PASS/FAIL/INCONCLUSIVE + evidence)
  → policy engine (lib/policy/engine.ts)   AUTO_RELEASE | HUMAN_REVIEW | REQUEST_CHANGES | REJECTED
  → AUTO_RELEASE → POST capture (server)   idempotent, stable PayPal-Request-Id
  → reconcile                              CAPTURE_PENDING until PayPal reports COMPLETED → PAID
```

The demo fixture at `/demo/deliverable` is a real, inspectable page the agent verifies against the demo milestone's criteria.

## Run it locally

Prerequisites: Node ≥ 18.18, PostgreSQL, and PayPal **sandbox** app credentials.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    fill in PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (sandbox app)
#    and DATABASE_URL (default: postgresql://trustlock:trustlock@127.0.0.1:5432/trustlock)

# 3. (Local PostgreSQL setup — one time)
#    sudo apt-get install postgresql
#    sudo pg_ctlcluster 17 main start
#    sudo -u postgres psql -c "CREATE USER trustlock WITH PASSWORD 'trustlock';"
#    sudo -u postgres psql -c "CREATE DATABASE trustlock OWNER trustlock;"
#    The schema (lib/db/schema.sql) is applied automatically on first request.

# 4. Run
npm run dev        # or: npm run build && npm start
```

Then: create a milestone → **Fund** → approve in the PayPal sandbox popup with a **sandbox buyer account** → the server authorizes → the milestone becomes `AUTHORIZED` (funds held, not captured).

## Architecture

```
Browser (Next.js client)
  → POST /api/milestones            create milestone (DRAFT) with structured acceptance criteria (JSONB)
  → POST /api/milestones/[id]/fund  server creates PayPal order, intent=AUTHORIZE (amount from DB only)
  → PayPal JS SDK popup            buyer approves (sandbox buyer account)
  → POST /api/paypal/authorize      server: verify order with PayPal → /authorize → verify CREATED → AUTHORIZED
  → POST /api/paypal/webhooks       signature-verified events + reconciliation (needs PAYPAL_WEBHOOK_ID)
Server (Next.js API routes, server-only modules)
  → lib/paypal/client.ts            direct REST integration (adapted from the Phase 0 spike)
  → lib/db/*                        PostgreSQL: milestones, paypal_payments, agent_actions (append-only)
PayPal Sandbox (api-m.sandbox.paypal.com) — all money movement
```

## Safety properties

- The browser can never set a payment state, an authorization ID, or an amount — the server derives everything from PayPal and the database.
- The fund endpoint accepts no client input; the amount always comes from the stored milestone.
- Every PayPal mutation sends a unique `PayPal-Request-Id`; the authorize call is idempotent per order.
- `lib/paypal/*` and `lib/db/*` are `server-only`; the client secret never reaches the browser.
- The app refuses to call PayPal against a non-sandbox base URL unless `PAYPAL_ENVIRONMENT=production` is set deliberately.
- `agent_actions` is append-only (trigger-enforced) — the future AI agent's decisions are auditable.

## Regression test

```bash
npm run spike
```

Proves the full PayPal sandbox lifecycle (create → authorize → capture → partial capture → void → reauthorize guardrail) against live sandbox credentials.
