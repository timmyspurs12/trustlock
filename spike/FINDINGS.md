# Phase 0 Spike — Runtime-Confirmed PayPal Sandbox Findings

All findings below were **executed against the live PayPal Sandbox** on 2026-10-08
(`npm run spike`, spike v3). Tally: **6 PASS, 1 PARTIAL, 0 FAIL**.
Full machine-readable output: `results.json` (gitignored; IDs and states only, no secrets).

## Confirmed lifecycle behaviors

| # | Behavior | Runtime evidence |
|---|---|---|
| 1 | **Card orders authorize at creation.** An order with `intent=AUTHORIZE` + `payment_source.card` returns with the authorization already inside `purchase_units[0].payments.authorizations[0]` (`status: CREATED`). Order status is `COMPLETED`. Calling `POST /v2/checkout/orders/{id}/authorize` afterwards → `422 ORDER_ALREADY_AUTHORIZED`. |
| 2 | **Wallet orders need buyer approval first.** `payment_source.paypal` → order status `PAYER_ACTION_REQUIRED` + `payer-action` link (`https://www.sandbox.paypal.com/checkoutnow?token=...`). Calling `/authorize` **before** approval → `422 ORDER_NOT_APPROVED`. After approval (JS SDK), `/authorize` returns `201` + authorization — PayPal's standard documented flow. |
| 3 | **Held state is real and readable.** `GET /v2/payments/authorizations/{id}` → `status: CREATED`, amount intact. This is the "funds held" state TrustLock shows as AUTHORIZED. |
| 4 | **Full capture works.** `POST /v2/payments/authorizations/{id}/capture` → `201`, capture `id`, `status: COMPLETED`. After capture the authorization reads `CAPTURED`. |
| 5 | **Capture response has no top-level `amount`.** Verify captured amounts via `GET /v2/payments/captures/{captureId}` → returns `amount` and `seller_receivable_breakdown` (gross / paypal_fee / net). Observed: $25.00 gross → $1.14 fee → $23.86 net. |
| 6 | **Partial capture works.** $100 authorized → capture $70.00 (`final_capture:false`) → `201 COMPLETED`, verified $70.00 via GET capture → capture remaining $30.00 (`final_capture:true`) → `201 COMPLETED`, verified $30.00. Authorization then reads `CAPTURED`. |
| 7 | **Over-capture is rejected.** Capturing beyond the authorized total → `422 AUTHORIZATION_ALREADY_CAPTURED`. |
| 8 | **Idempotent retry is safe.** Repeating a capture with the **same `PayPal-Request-Id`** → `HTTP 200` with the **same capture id** — no duplicate capture. (Different key = new capture.) |
| 9 | **Void works.** `POST /v2/payments/authorizations/{id}/void` → `204`; authorization then reads `VOIDED`. Capture-after-void → `422` rejected. No money ever moved. |
| 10 | **Authorization validity is exactly 29 days.** Created `2026-10-08T13:31:30Z` → `expiration_time: 2026-11-06T13:31:30Z`. |
| 11 | **Reauthorize guardrail.** Day-0 reauthorize → `422 REAUTHORIZATION_TOO_SOON`: *"A reauthorization is only allowed once from Day 4 to Day 29 since the date of the original authorization."* Capture success is best within the 3-day honor period. |
| 12 | **Card-source authorizations are `seller_protection: NOT_ELIGIBLE`** in sandbox (AVS `A`, CVV `M`, response `0000`). Wallet-funded payments are the path with buyer/seller protection — another reason the production flow uses the PayPal wallet, not cards. |

## Production flow TrustLock should implement (corrected by the spike)

1. **Fund (wallet):** create order `intent=AUTHORIZE` (`payment_source.paypal`, JS SDK v6) → buyer approves in popup → **server calls `POST /v2/checkout/orders/{id}/authorize`** → store `purchase_units[0].payments.authorizations[0].id` → milestone = AUTHORIZED (held).
2. **Release:** policy check → `POST /v2/payments/authorizations/{id}/capture` (full or partial amount) → verify via `GET /v2/payments/captures/{id}` → milestone = PAID.
3. **Cancel:** `POST /v2/payments/authorizations/{id}/void` → VOIDED.
4. **Long milestones:** capture best within 3-day honor period; a single reauthorization is allowed Day 4–29; hard expiry Day 29 → surface `AUTHORIZATION_EXPIRING`, schedule reauthorize, else void + recollect.
5. **Idempotency:** unique `PayPal-Request-Id` per logical capture + app-level unique constraint; on timeout/ambiguity, GET authorization/capture before retrying.
6. **Reconciliation:** webhooks `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED` (v2 spelling), `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CHECKOUT.ORDER.APPROVED` — plus polling fallback (sandbox webhook delivery can lag).

## Test IDs from the passing run (sandbox-only, disposable)

- S2 full: order `6P753074EJ574513K` · authorization `9LU619389U9167526` (CREATED → CAPTURED) · capture `9DX41393EN931662R` ($25.00 COMPLETED)
- S3 partial: authorization `68485053DT319492S` · captures `4UM611604G628135A` ($70.00) + `4WX49679LC541752G` ($30.00)
- S4 void: authorization `4A188492W6140894F` (CREATED → VOIDED)
- S5 reauthorize guardrail: authorization `7HF347251R8001017` (voided after test)
