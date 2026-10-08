import 'server-only';

/**
 * Server-only PayPal configuration.
 *
 * The client SECRET is read here and never leaves the server module graph.
 * (The client ID is public by design — it is returned to the browser so the
 * PayPal JS SDK can render the buyer-approval button. It cannot move money.)
 */

export const PAYPAL_ENVIRONMENT = (process.env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase();

function resolveBaseUrl(): string {
  const fromEnv = process.env.PAYPAL_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return PAYPAL_ENVIRONMENT === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function resolveWebBase(): string {
  return PAYPAL_ENVIRONMENT === 'production'
    ? 'https://www.paypal.com'
    : 'https://www.sandbox.paypal.com';
}

export const paypalConfig = {
  clientId: process.env.PAYPAL_CLIENT_ID?.trim() ?? '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() ?? '',
  baseUrl: resolveBaseUrl(),
  webBase: resolveWebBase(),
  webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() || '',
  environment: PAYPAL_ENVIRONMENT,
};

/** Buyer approval URL for a PayPal order (opens the sandbox checkout page). */
export function paypalCheckoutUrl(orderId: string): string {
  return `${paypalConfig.webBase}/checkoutnow?token=${orderId}`;
}

/** PayPal JS SDK script URL with intent=authorize (buyer approves; funds are held). */
export function paypalSdkUrl(clientId: string, currency: string): string {
  const params = new URLSearchParams({
    'client-id': clientId,
    currency,
    intent: 'authorize',
    components: 'buttons',
  });
  return `${paypalConfig.webBase}/sdk/js?${params.toString()}`;
}
