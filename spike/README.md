# Phase 0 Spike — PayPal Sandbox Lifecycle

`paypal-lifecycle.mjs` proves the exact payment lifecycle TrustLock depends on, against the **live PayPal Sandbox**. No mocked results: every PASS/FAIL comes from a real API response. **Latest run: 6 PASS, 1 PARTIAL, 0 FAIL.** Runtime-confirmed behaviors are documented in [`FINDINGS.md`](FINDINGS.md).

## What it proves

| # | Scenario | Result (latest run) |
|---|---|---|
| S0 | OAuth2 client-credentials token | PASS |
| S1 | Create wallet order (`intent=AUTHORIZE`) + buyer-approval URL | PARTIAL (approval click is a manual browser step with a sandbox buyer account) |
| S1b | NEGATIVE: `/authorize` on an unapproved wallet order | PASS — rejected `422 ORDER_NOT_APPROVED` (buyer approval enforced server-side) |
| S2 | Full lifecycle (card payment source): create → authorization obtained → verified held (`CREATED`) → capture → verified `COMPLETED` ($25.00 via GET capture) | PASS |
| S3 | Partial capture: $70 of $100 → idempotent retry (same `PayPal-Request-Id` → same capture id) → remaining $30 → over-capture rejected (`AUTHORIZATION_ALREADY_CAPTURED`) | PASS |
| S4 | Void authorization → `VOIDED` → capture-after-void rejected | PASS |
| S5 | Reauthorize guardrail: Day-0 reauthorize rejected `REAUTHORIZATION_TOO_SOON` (allowed once, Day 4–29) | PASS |

The card scenarios (S2–S5) are fully server-side and need **no browser**: they use PayPal's official sandbox test card via a `payment_source.card` order. The spike discovered that **card orders with `intent=AUTHORIZE` are authorized at creation** (the authorization is already in the create response; a later `/authorize` call returns `ORDER_ALREADY_AUTHORIZED`). The production funding flow uses the **wallet** path: create → buyer approves (JS SDK) → server `/authorize` → authorization.

## Credentials required (exact)

| Variable | What it is | Where to get it |
|---|---|---|
| `PAYPAL_CLIENT_ID` | Sandbox REST app Client ID | [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard) → My Apps & Credentials → **Sandbox** toggle → Create App (or an existing app) |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST app Secret | Same screen → Show |
| `PAYPAL_BASE_URL` | Optional; defaults to `https://api-m.sandbox.paypal.com` | Leave as sandbox |

For the **manual** wallet-approval step (S1): a PayPal Sandbox **personal (buyer) test account** — Dashboard → Accounts → Sandbox. Not needed for S2–S5.

## How to run

```bash
cp .env.example .env   # then fill in PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
npm run spike          # or: node spike/paypal-lifecycle.mjs
```

## Safety properties

- **Refuses to run** unless `PAYPAL_BASE_URL` points at the PayPal **Sandbox** (this spike must never touch live money).
- **Never prints** the client secret or full access tokens (masked only).
- Sends a **unique `PayPal-Request-Id`** on every mutating call (idempotency key).
- Writes `spike/results.json` with **IDs and states only — no secrets** (gitignored).
- All payment operations are server-side. No frontend, no database, no dependencies.
