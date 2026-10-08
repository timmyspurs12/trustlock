import 'server-only';
import { randomUUID } from 'node:crypto';
import { paypalConfig } from './config';

/**
 * TrustLock PayPal service module (server-only).
 *
 * Direct REST integration adapted from the PROVEN Phase 0 spike
 * (spike/paypal-lifecycle.mjs — 6 PASS, 1 PARTIAL, 0 FAIL against the live
 * sandbox). No PayPal SDK package: plain fetch, fully typed, fully auditable.
 *
 * Rules enforced here:
 *  - every mutation sends a unique PayPal-Request-Id (idempotency key)
 *  - secrets never leave this module (logging masks tokens)
 *  - refuses to run against a non-sandbox base URL unless
 *    PAYPAL_ENVIRONMENT=production is set deliberately
 */

export class PayPalError extends Error {
  status: number;
  issue?: string;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'PayPalError';
    this.status = status;
    const d: any = details;
    this.issue = Array.isArray(d?.details) ? d.details[0]?.issue : undefined;
    this.details = details;
  }
}

export interface PayPalAmount {
  currency_code: string;
  value: string;
}

export interface PayPalAuthorization {
  id: string;
  status: string;
  amount: PayPalAmount;
  expiration_time?: string;
  create_time?: string;
  update_time?: string;
  seller_protection?: { status: string };
}

export interface PayPalOrder {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: Array<{
    reference_id?: string;
    description?: string;
    amount?: PayPalAmount;
    payments?: {
      authorizations?: PayPalAuthorization[];
      captures?: Array<{ id: string; status: string; amount?: PayPalAmount }>;
    };
  }>;
  links?: Array<{ rel: string; href: string; method: string }>;
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
}

export function extractAuthorization(order: PayPalOrder): PayPalAuthorization | null {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0] ?? null;
}

export function getApprovalUrl(order: PayPalOrder): string | null {
  return order.links?.find((l) => l.rel === 'payer-action')?.href ?? null;
}

/* ---------------- OAuth2 token (cached) ---------------- */

let tokenCache: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (!paypalConfig.clientId || !paypalConfig.clientSecret) {
    throw new Error('PayPal credentials missing: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox)');
  }
  if (paypalConfig.environment !== 'production' && !/sandbox/i.test(paypalConfig.baseUrl)) {
    throw new Error(
      `Refusing PayPal call: base URL "${paypalConfig.baseUrl}" is not the sandbox. ` +
        'Set PAYPAL_ENVIRONMENT=production deliberately to go live.'
    );
  }
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;

  const res = await fetch(`${paypalConfig.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${paypalConfig.clientId}:${paypalConfig.clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new PayPalError(`OAuth2 token failed: HTTP ${res.status}`, res.status, body);
  tokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(body.expires_in - 60, 60) * 1000,
  };
  return tokenCache.value;
}

/* ---------------- low-level fetch ---------------- */

interface FetchOptions {
  body?: unknown;
  /** Idempotency key. Strongly recommended for every mutation. */
  idempotencyKey?: string;
}

export async function paypalFetch<T = any>(method: string, path: string, options: FetchOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (options.idempotencyKey) headers['PayPal-Request-Id'] = options.idempotencyKey;

  const res = await fetch(`${paypalConfig.baseUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new PayPalError(`PayPal ${method} ${path} failed: HTTP ${res.status}`, res.status, json ?? text);
  }
  return json as T;
}

/* ---------------- Orders v2: the escrow-like hold ---------------- */

/**
 * Create an order with intent=AUTHORIZE (wallet payment source).
 * The buyer approves in the PayPal JS SDK popup; only then may the server
 * call authorizeOrder(). Funds are HELD — nothing is captured.
 */
export async function createAuthorizationOrder(input: {
  amount: number;
  currency: string;
  description: string;
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ order: PayPalOrder; orderId: string; approvalUrl: string | null }> {
  const order = await paypalFetch<PayPalOrder>('POST', '/v2/checkout/orders', {
    idempotencyKey: randomUUID(),
    body: {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description,
          amount: { currency_code: input.currency, value: input.amount.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'TrustLock',
            user_action: 'PAY_NOW',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  return { order, orderId: order.id, approvalUrl: getApprovalUrl(order) };
}

/**
 * Complete the authorization AFTER buyer approval.
 * Empty POST (documented delayed-capture pattern). A stable idempotency key
 * (`authorize:{orderId}`) makes retries safe: PayPal allows only ONE
 * authorization per order and returns ORDER_ALREADY_AUTHORIZED otherwise.
 */
export async function authorizeOrder(orderId: string): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>('POST', `/v2/checkout/orders/${orderId}/authorize`, {
    idempotencyKey: `authorize:${orderId}`,
  });
}

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>('GET', `/v2/checkout/orders/${orderId}`);
}

/* ---------------- Payments v2: authorization lifecycle ---------------- */

export async function getAuthorization(authorizationId: string): Promise<PayPalAuthorization> {
  return paypalFetch<PayPalAuthorization>('GET', `/v2/payments/authorizations/${authorizationId}`);
}

/**
 * Capture (release) a held authorization — full or partial.
 * Phase 2 will call this only after the verification agent + policy engine approve.
 */
export async function captureAuthorization(
  authorizationId: string,
  input: { amount?: number; currency: string; finalCapture?: boolean; idempotencyKey: string }
): Promise<{ id: string; status: string }> {
  const body: Record<string, unknown> = { final_capture: input.finalCapture ?? false };
  if (input.amount !== undefined) {
    body.amount = { currency_code: input.currency, value: input.amount.toFixed(2) };
  }
  return paypalFetch('POST', `/v2/payments/authorizations/${authorizationId}/capture`, {
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

/** Void a held authorization. No money ever moves. */
export async function voidAuthorization(authorizationId: string, idempotencyKey: string = randomUUID()): Promise<void> {
  await paypalFetch('POST', `/v2/payments/authorizations/${authorizationId}/void`, { idempotencyKey });
}

/** Reauthorize to extend a hold. PayPal allows this ONCE, from Day 4 to Day 29. */
export async function reauthorizeAuthorization(
  authorizationId: string,
  idempotencyKey: string = randomUUID()
): Promise<PayPalAuthorization> {
  return paypalFetch<PayPalAuthorization>('POST', `/v2/payments/authorizations/${authorizationId}/reauthorize`, {
    idempotencyKey,
  });
}

export async function getCapture(captureId: string): Promise<{ id: string; status: string; amount?: PayPalAmount }> {
  return paypalFetch('GET', `/v2/payments/captures/${captureId}`);
}

/* ---------------- Webhooks: signature verification ---------------- */

/**
 * Verify a webhook event using PayPal's official verification API.
 * Requires PAYPAL_WEBHOOK_ID (create a webhook in the PayPal Developer
 * dashboard or via POST /v1/notifications/webhooks).
 */
export async function verifyWebhookSignature(input: {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  webhookEvent: unknown;
}): Promise<'SUCCESS' | 'FAILURE'> {
  if (!paypalConfig.webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID is not configured — webhook signature verification cannot run');
  }
  const body = await paypalFetch<{ verification_status?: string }>('POST', '/v1/notifications/verify-webhook-signature', {
    body: {
      transmission_id: input.transmissionId,
      transmission_time: input.transmissionTime,
      cert_url: input.certUrl,
      auth_algo: input.authAlgo,
      transmission_sig: input.transmissionSig,
      webhook_id: paypalConfig.webhookId,
      webhook_event: input.webhookEvent,
    },
  });
  return body.verification_status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE';
}
