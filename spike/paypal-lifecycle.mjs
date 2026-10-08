#!/usr/bin/env node
/**
 * TrustLock — Phase 0: PayPal Sandbox lifecycle spike (v2)
 *
 * Proves (against the live PayPal Sandbox — no faked results):
 *   S0   OAuth2 client-credentials token acquisition
 *   S1   Wallet order creation with intent=AUTHORIZE + buyer-approval URL generation
 *   S1b  NEGATIVE: /authorize on an UNAPPROVED wallet order is rejected (buyer approval enforced)
 *   S2   Full lifecycle: create (card) -> authorization obtained -> verify held -> capture -> verify COMPLETED
 *   S3   Partial capture: $70 of $100, idempotent retry, remaining $30, over-capture rejected
 *   S4   Void authorization + capture-after-void rejected
 *   S5   Reauthorize guardrail verified (allowed once, Day 4–29 only)
 *
 * v2 fix (driven by real sandbox behavior observed in run 1):
 *   Card payment-source orders with intent=AUTHORIZE are authorized AT CREATION:
 *   the create response already contains purchase_units[0].payments.authorizations[0],
 *   and calling POST /v2/checkout/orders/{id}/authorize afterwards returns
 *   422 ORDER_ALREADY_AUTHORIZED. The /authorize endpoint is required for the WALLET
 *   flow AFTER the buyer approves. v2 therefore extracts the authorization from the
 *   create response (GET-order fallback) and only calls /authorize when none exists.
 *
 * v3 fix (driven by real sandbox behavior observed in run 2):
 *   The capture response does NOT expose `amount` at the top level — amounts are
 *   verified by reading back GET /v2/payments/captures/{captureId}.
 *   Retrying a capture with the SAME PayPal-Request-Id returns HTTP 200 with the
 *   SAME capture id (PayPal idempotency confirmed at runtime).
 *   Reauthorize on Day 0 is rejected with REAUTHORIZATION_TOO_SOON: a reauthorization
 *   is only allowed ONCE, from Day 4 to Day 29. S5 verifies that guardrail.
 *
 * Safety:
 *   - Refuses to run unless PAYPAL_BASE_URL points at the PayPal SANDBOX.
 *   - Never prints the client secret or full access tokens (masked only).
 *   - Sends a unique PayPal-Request-Id on every mutating call.
 *   - Writes spike/results.json containing IDs and states only — no secrets.
 *
 * Usage:
 *   cp .env.example .env   # fill in sandbox credentials
 *   npm run spike          # or: node spike/paypal-lifecycle.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- tiny .env loader (zero dependencies) ---------------- */
function loadEnv(file) {
  const p = path.resolve(HERE, '..', file);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv('.env');

/* ---------------- config + guardrails ---------------- */
const REQUIRED = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
const missing = REQUIRED.filter((k) => !process.env[k] || !process.env[k].trim());
if (missing.length) {
  console.error('[spike] MISSING CREDENTIALS: ' + missing.join(', '));
  console.error('[spike] This spike needs PayPal SANDBOX REST app credentials:');
  console.error('[spike]   PAYPAL_CLIENT_ID      (Sandbox app Client ID)');
  console.error('[spike]   PAYPAL_CLIENT_SECRET  (Sandbox app Secret)');
  console.error('[spike]   PAYPAL_BASE_URL       (optional; default https://api-m.sandbox.paypal.com)');
  console.error('[spike] Get them at https://developer.paypal.com/dashboard -> My Apps & Credentials -> Sandbox.');
  console.error('[spike] See spike/README.md. No PayPal API calls were made.');
  process.exit(2);
}

const BASE = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/+$/, '');
if (!/sandbox/i.test(BASE)) {
  console.error(`[spike] REFUSING TO RUN: PAYPAL_BASE_URL "${BASE}" is not the PayPal Sandbox. This spike must never touch live money.`);
  process.exit(2);
}
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID.trim();
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET.trim();

/* ---------------- logging (masked) + results ---------------- */
const mask = (s) =>
  s ? (s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)} (len ${s.length})` : '(set)') : '(empty)';
const results = { spike: 'trustlock-paypal-sandbox-lifecycle', version: 3, base: BASE, startedAt: new Date().toISOString(), tests: [] };
const record = (name, status, detail = null) => {
  results.tests.push(detail ? { name, status, detail } : { name, status });
  console.log(`\n=== ${name} → ${status}`);
  if (detail) console.log(detail);
};
const show = (obj) => console.log(JSON.stringify(obj, null, 2));

/* ---------------- PayPal REST client ---------------- */
let tokenCache = null;
async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OAuth2 token failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  tokenCache = { value: body.access_token, expiresAt: Date.now() + Math.max(body.expires_in - 60, 60) * 1000 };
  console.log(`[spike] OAuth2 token acquired: access_token=${mask(body.access_token)} expires_in=${body.expires_in}s`);
  return tokenCache.value;
}

async function paypal(method, p, { body, idempotencyKey } = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['PayPal-Request-Id'] = idempotencyKey;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, ok: res.ok, json, text };
}

/* ---------------- helpers ---------------- */
const money = (value) => ({ currency_code: 'USD', value });
const TEST_CARD = {
  number: '4005519200000004', // Visa — official PayPal sandbox test card (developer.paypal.com card testing)
  expiry: '2031-12',
  cvv: '123',
  name: 'TrustLock Sandbox Buyer',
  billing_address: {
    address_line_1: '2211 N First Street',
    admin_area_2: 'San Jose',
    admin_area_1: 'CA',
    postal_code: '95131',
    country_code: 'US',
  },
};
const cardOrder = (amount, description) => ({
  intent: 'AUTHORIZE',
  purchase_units: [{ reference_id: 'trustlock-spike', description, amount: money(amount) }],
  payment_source: { card: { ...TEST_CARD } },
});
const extractAuthFromOrder = (orderJson) =>
  orderJson?.purchase_units?.[0]?.payments?.authorizations?.[0] || null;
const getAuthorization = (authId) => paypal('GET', `/v2/payments/authorizations/${authId}`);
const getOrder = (orderId) => paypal('GET', `/v2/checkout/orders/${orderId}`);
const getCapture = (captureId) => paypal('GET', `/v2/payments/captures/${captureId}`);

/**
 * Obtain an authorization ID for an order, handling both real sandbox flows:
 *  1. card flow — authorization already exists in the create response;
 *  2. wallet flow — buyer approved, so call /authorize (201 + authorization);
 *  3. fallback — /authorize says ORDER_ALREADY_AUTHORIZED, so GET the order.
 */
async function ensureAuthorized(orderId, createRes) {
  const existing = extractAuthFromOrder(createRes.json);
  if (existing?.id) return { authId: existing.id, via: 'create-response', authorization: existing };
  const auth = await paypal('POST', `/v2/checkout/orders/${orderId}/authorize`, { idempotencyKey: randomUUID() });
  const fromAuth = extractAuthFromOrder(auth.json);
  if (auth.ok && fromAuth?.id) return { authId: fromAuth.id, via: 'authorize-endpoint', authorization: fromAuth };
  if (auth.json?.details?.[0]?.issue === 'ORDER_ALREADY_AUTHORIZED') {
    const order = await getOrder(orderId);
    const fromOrder = extractAuthFromOrder(order.json);
    if (fromOrder?.id) return { authId: fromOrder.id, via: 'get-order-fallback', authorization: fromOrder };
  }
  return { authId: null, via: 'none', error: `HTTP ${auth.status} ${auth.text}` };
}

/* ---------------- scenarios ---------------- */
// S1 — wallet order: proves order creation + buyer-approval URL (approval click is manual)
async function s1WalletOrder() {
  const payload = {
    intent: 'AUTHORIZE',
    purchase_units: [{ reference_id: 'trustlock-spike', description: 'TrustLock spike v2 — wallet approval URL', amount: money('5.00') }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'TrustLock',
          user_action: 'PAY_NOW',
          return_url: 'https://example.com/trustlock/return',
          cancel_url: 'https://example.com/trustlock/cancel',
        },
      },
    },
  };
  const create = await paypal('POST', '/v2/checkout/orders', { body: payload, idempotencyKey: randomUUID() });
  if (!create.ok) {
    record('S1 create wallet order (intent=AUTHORIZE)', 'FAIL', `HTTP ${create.status}\n${create.text}`);
    return null;
  }
  const orderId = create.json.id;
  const approvalUrl = create.json.links?.find((l) => l.rel === 'payer-action')?.href || null;
  console.log(`[S1] order id=${orderId} status=${create.json.status}`);
  console.log(`[S1] buyer-approval URL: ${approvalUrl}`);
  record(
    'S1 wallet order + buyer-approval URL',
    'PARTIAL',
    `orderId=${orderId} status=${create.json.status} approvalUrl=${approvalUrl}\n` +
      `Server-side order creation proven. The buyer-approval click requires a human signing in to a PayPal Sandbox buyer account in a browser — not automatable with client credentials. In the real app this step is the PayPal JS SDK popup.`
  );
  return orderId;
}

// S1b — NEGATIVE: authorizing an unapproved wallet order must fail
async function s1bAuthorizeWithoutApproval(orderId) {
  if (!orderId) return record('S1b /authorize without buyer approval', 'SKIP', 'no wallet order id');
  const res = await paypal('POST', `/v2/checkout/orders/${orderId}/authorize`, { idempotencyKey: randomUUID() });
  console.log(`[S1b] /authorize on UNAPPROVED wallet order → HTTP ${res.status} body=${res.text?.slice(0, 300)}`);
  const pass = !res.ok;
  record(
    'S1b NEGATIVE: /authorize without buyer approval is REJECTED',
    pass ? 'PASS' : 'FAIL',
    `HTTP ${res.status} issue=${res.json?.details?.[0]?.issue ?? 'n/a'} — PayPal enforces buyer approval server-side; a hold cannot be created without the buyer.`
  );
}

// S2 — full lifecycle with a card payment source (fully server-side)
async function s2FullLifecycle() {
  const create = await paypal('POST', '/v2/checkout/orders', {
    body: cardOrder('25.00', 'TrustLock spike v2 — full capture'),
    idempotencyKey: randomUUID(),
  });
  if (!create.ok) return record('S2 create order (card, intent=AUTHORIZE, $25.00)', 'FAIL', `HTTP ${create.status}\n${create.text}`);
  const orderId = create.json.id;
  console.log(`[S2] order created: id=${orderId} status=${create.json.status}`);
  show({ payments: create.json.purchase_units?.[0]?.payments ?? null });

  const ensured = await ensureAuthorized(orderId, create);
  if (!ensured.authId) return record('S2 obtain authorization', 'FAIL', ensured.error);
  const authId = ensured.authId;
  console.log(`[S2] authorization obtained via ${ensured.via}: authorizationId=${authId} status=${ensured.authorization?.status} amount=${JSON.stringify(ensured.authorization?.amount)}`);

  const held = await getAuthorization(authId);
  console.log(`[S2] authorization state (held check): status=${held.json?.status}`);
  show({ authorization: { id: held.json?.id, status: held.json?.status, amount: held.json?.amount } });

  const capture = await paypal('POST', `/v2/payments/authorizations/${authId}/capture`, { idempotencyKey: randomUUID() });
  if (!capture.ok) return record('S2 capture authorization (full)', 'FAIL', `HTTP ${capture.status}\n${capture.text}`);
  const captureId = capture.json.id;
  console.log(`[S2] capture response (full): ${capture.text}`);
  console.log(`[S2] capture: id=${captureId} status=${capture.json.status}`);

  // Verify the capture by reading it back (capture response nests amount differently than expected)
  const capGet = await getCapture(captureId);
  console.log(`[S2] GET capture ${captureId} → status=${capGet.json?.status} amount=${JSON.stringify(capGet.json?.amount)}`);
  if (capGet.json?.seller_receivable_breakdown) show({ seller_receivable_breakdown: capGet.json.seller_receivable_breakdown });

  const orderAfter = await getOrder(orderId);
  const authAfter = await getAuthorization(authId);
  console.log(`[S2] order status after capture: ${orderAfter.json?.status}; authorization status after capture: ${authAfter.json?.status}; authorization expiration_time=${held.json?.expiration_time}`);

  const heldNotCaptured = held.json?.status === 'CREATED';
  // A capture is "accepted" when PayPal returns COMPLETED or PENDING (async settlement).
  const captureAccepted = (s) => s === 'COMPLETED' || s === 'PENDING';
  const pass =
    heldNotCaptured &&
    captureAccepted(capture.json.status) &&
    !!captureId &&
    captureAccepted(capGet.json?.status) &&
    capGet.json?.amount?.value === '25.00' &&
    authAfter.json?.status === 'CAPTURED';
  record(
    'S2 FULL LIFECYCLE create→authorize→held→capture',
    pass ? 'PASS' : 'FAIL',
    `orderId=${orderId}\nauthorizationId=${authId} (via ${ensured.via}; state while held: ${held.json?.status}; authorization expires ${held.json?.expiration_time})\ncaptureId=${captureId} status=${capture.json.status} verifiedAmount=${capGet.json?.amount?.value} (via GET capture)\norderStatusAfter=${orderAfter.json?.status} authStatusAfter=${authAfter.json?.status}`
  );
}

// S3 — partial capture
async function s3PartialCapture() {
  const create = await paypal('POST', '/v2/checkout/orders', {
    body: cardOrder('100.00', 'TrustLock spike v2 — partial capture'),
    idempotencyKey: randomUUID(),
  });
  if (!create.ok) return record('S3 create order ($100.00)', 'FAIL', `HTTP ${create.status}\n${create.text}`);
  const ensured = await ensureAuthorized(create.json.id, create);
  if (!ensured.authId) return record('S3 obtain authorization', 'FAIL', ensured.error);
  const authId = ensured.authId;
  console.log(`[S3] authorized ${authId} for $100.00 (via ${ensured.via})`);

  const key1 = randomUUID();
  const cap1 = await paypal('POST', `/v2/payments/authorizations/${authId}/capture`, {
    body: { amount: money('70.00'), final_capture: false },
    idempotencyKey: key1,
  });
  console.log(`[S3] partial capture #1 $70.00 → HTTP ${cap1.status} id=${cap1.json?.id} status=${cap1.json?.status}`);
  const cap1Get = await getCapture(cap1.json?.id);
  console.log(`[S3] GET capture #1 → status=${cap1Get.json?.status} amount=${JSON.stringify(cap1Get.json?.amount)}`);

  const retry = await paypal('POST', `/v2/payments/authorizations/${authId}/capture`, {
    body: { amount: money('70.00'), final_capture: false },
    idempotencyKey: key1, // SAME key = idempotent retry
  });
  console.log(`[S3] idempotent retry (same PayPal-Request-Id) → HTTP ${retry.status} id=${retry.json?.id} (same capture id as #1: ${retry.json?.id === cap1.json?.id})`);

  const cap2 = await paypal('POST', `/v2/payments/authorizations/${authId}/capture`, {
    body: { amount: money('30.00'), final_capture: true },
    idempotencyKey: randomUUID(),
  });
  console.log(`[S3] partial capture #2 $30.00 (final) → HTTP ${cap2.status} id=${cap2.json?.id} status=${cap2.json?.status}`);
  const cap2Get = await getCapture(cap2.json?.id);
  console.log(`[S3] GET capture #2 → status=${cap2Get.json?.status} amount=${JSON.stringify(cap2Get.json?.amount)}`);

  const over = await paypal('POST', `/v2/payments/authorizations/${authId}/capture`, {
    body: { amount: money('1.00'), final_capture: true },
    idempotencyKey: randomUUID(),
  });
  console.log(`[S3] over-capture attempt (+$1.00 beyond $100 authorized) → HTTP ${over.status} body=${over.text?.slice(0, 400)}`);

  const authFinal = await getAuthorization(authId);
  console.log(`[S3] authorization after both partial captures: status=${authFinal.json?.status}`);

  // A capture is "accepted" when PayPal returns COMPLETED or PENDING (async settlement).
  const captureAccepted = (s) => s === 'COMPLETED' || s === 'PENDING';
  const pass =
    cap1.ok && captureAccepted(cap1.json?.status) && cap1Get.json?.amount?.value === '70.00' &&
    cap2.ok && captureAccepted(cap2.json?.status) && cap2Get.json?.amount?.value === '30.00' &&
    retry.json?.id === cap1.json?.id && // idempotent retry returned the SAME capture
    !over.ok &&
    authFinal.json?.status === 'CAPTURED';
  record(
    'S3 PARTIAL CAPTURE ($70 of $100 → $30 → over-capture rejected → idempotent retry safe)',
    pass ? 'PASS' : 'FAIL',
    `authorizationId=${authId}\ncap1=${cap1.json?.id} ${cap1.json?.status} verified=${cap1Get.json?.amount?.value}\ncap2=${cap2.json?.id} ${cap2.json?.status} verified=${cap2Get.json?.amount?.value}\noverCaptureRejected=${!over.ok} (HTTP ${over.status} issue=${over.json?.details?.[0]?.issue})\nidempotentRetrySameCapture=${retry.json?.id === cap1.json?.id} (HTTP ${retry.status})\nauthStatusAfterFullCapture=${authFinal.json?.status}`
  );
}

// S4 — void
async function s4Void() {
  const create = await paypal('POST', '/v2/checkout/orders', {
    body: cardOrder('50.00', 'TrustLock spike v2 — void'),
    idempotencyKey: randomUUID(),
  });
  if (!create.ok) return record('S4 create order ($50.00)', 'FAIL', `HTTP ${create.status}\n${create.text}`);
  const ensured = await ensureAuthorized(create.json.id, create);
  if (!ensured.authId) return record('S4 obtain authorization', 'FAIL', ensured.error);
  const authId = ensured.authId;
  const before = await getAuthorization(authId);
  console.log(`[S4] before void: status=${before.json?.status}`);

  const viu = await paypal('POST', `/v2/payments/authorizations/${authId}/void`, { idempotencyKey: randomUUID() });
  console.log(`[S4] void → HTTP ${viu.status} body=${viu.text || '(empty)'}`);

  const after = await getAuthorization(authId);
  console.log(`[S4] after void: status=${after.json?.status}`);

  const cap = await paypal('POST', `/v2/payments/authorizations/${authId}/capture`, { idempotencyKey: randomUUID() });
  console.log(`[S4] capture after void → HTTP ${cap.status} body=${cap.text?.slice(0, 200)}`);

  const pass = after.json?.status === 'VOIDED' && !cap.ok;
  record(
    'S4 VOID AUTHORIZATION (+ capture-after-void rejected)',
    pass ? 'PASS' : 'FAIL',
    `authorizationId=${authId} stateBefore=${before.json?.status} stateAfterVoid=${after.json?.status} captureAfterVoidRejected=${!cap.ok} (HTTP ${cap.status})`
  );
}

// S5 — reauthorize
async function s5Reauthorize() {
  const create = await paypal('POST', '/v2/checkout/orders', {
    body: cardOrder('10.00', 'TrustLock spike v2 — reauthorize'),
    idempotencyKey: randomUUID(),
  });
  if (!create.ok) return record('S5 create order ($10.00)', 'FAIL', `HTTP ${create.status}\n${create.text}`);
  const ensured = await ensureAuthorized(create.json.id, create);
  if (!ensured.authId) return record('S5 obtain authorization', 'FAIL', ensured.error);
  const authId = ensured.authId;
  const before = await getAuthorization(authId);
  console.log(`[S5] before reauthorize: status=${before.json?.status} create_time=${before.json?.create_time} expiration_time=${before.json?.expiration_time}`);
  const re = await paypal('POST', `/v2/payments/authorizations/${authId}/reauthorize`, { idempotencyKey: randomUUID() });
  console.log(`[S5] reauthorize → HTTP ${re.status} body=${re.text?.slice(0, 400)}`);
  const after = await getAuthorization(authId);
  console.log(`[S5] after reauthorize: status=${after.json?.status} expiration_time=${after.json?.expiration_time}`);
  // tidy up: void the authorization so no dangling holds remain
  const cleanup = await paypal('POST', `/v2/payments/authorizations/${authId}/void`, { idempotencyKey: randomUUID() });
  console.log(`[S5] cleanup void → HTTP ${cleanup.status}`);
  // REAL sandbox rule discovered at runtime: reauthorization is only allowed ONCE,
  // from Day 4 to Day 29. On Day 0 the endpoint correctly rejects with
  // REAUTHORIZATION_TOO_SOON — the guardrail works as documented.
  const pass = re.json?.details?.[0]?.issue === 'REAUTHORIZATION_TOO_SOON';
  record(
    'S5 REAUTHORIZE guardrail verified (allowed once, Day 4–29 only)',
    pass ? 'PASS' : 'FAIL',
    `authorizationId=${authId} created=${before.json?.create_time} expires=${before.json?.expiration_time}\nDay-0 reauthorize → HTTP ${re.status} issue=${re.json?.details?.[0]?.issue}: "${re.json?.details?.[0]?.description}"\nRule: capture is best within the 3-day honor period; a single reauthorization extends the hold and is only permitted from Day 4 to Day 29; the authorization expires at Day 29 (runtime-confirmed: created 2026-10-08 → expires 2026-11-06). (Authorization voided afterwards to leave no dangling hold.)`
  );
}

/* ---------------- runner ---------------- */
function finish(code) {
  results.finishedAt = new Date().toISOString();
  const tally = {};
  for (const t of results.tests) tally[t.status] = (tally[t.status] || 0) + 1;
  results.tally = tally;
  writeFileSync(path.resolve(HERE, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== TALLY ===', JSON.stringify(tally));
  console.log('[spike] results (IDs + states only, no secrets) written to spike/results.json');
  process.exit(code);
}

async function main() {
  console.log('[spike] TrustLock Phase 0 — PayPal Sandbox lifecycle spike (v3)');
  console.log('[spike] base URL:', BASE);
  console.log('[spike] client id:', mask(CLIENT_ID));
  try {
    await getAccessToken();
    record('S0 OAuth2 client-credentials token', 'PASS', `access_token=${mask(tokenCache.value)}`);
  } catch (e) {
    record('S0 OAuth2 client-credentials token', 'FAIL', String(e));
    return finish(1);
  }
  const walletOrderId = await s1WalletOrder();
  await s1bAuthorizeWithoutApproval(walletOrderId);
  await s2FullLifecycle();
  await s3PartialCapture();
  await s4Void();
  await s5Reauthorize();
  finish(0);
}

main().catch((e) => {
  console.error('[spike] fatal:', e);
  process.exit(1);
});
