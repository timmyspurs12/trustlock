import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { reconcileWebhookEvent } from '@/lib/db/milestones';
import { verifyWebhookSignature } from '@/lib/paypal/client';
import { paypalConfig } from '@/lib/paypal/config';

/**
 * POST /api/paypal/webhooks
 *
 * Receives PayPal webhook events. Signature verification uses PayPal's
 * official verification API (POST /v1/notifications/verify-webhook-signature).
 *
 * IMPORTANT: verification requires PAYPAL_WEBHOOK_ID. If it is not set, the
 * route returns 503 and does NOT process the event — an unverified payload
 * must never be trusted.
 *
 * To enable: create a webhook in the PayPal Developer dashboard (Sandbox →
 * Webhooks) pointing at this URL, or via POST /v1/notifications/webhooks, and
 * set PAYPAL_WEBHOOK_ID to its ID.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const transmissionId = req.headers.get('paypal-transmission-id');
  const transmissionTime = req.headers.get('paypal-transmission-time');
  const certUrl = req.headers.get('paypal-cert-url');
  const authAlgo = req.headers.get('paypal-auth-algo');
  const transmissionSig = req.headers.get('paypal-transmission-sig');

  if (!paypalConfig.webhookId) {
    return NextResponse.json(
      {
        error:
          'Webhook not configured: set PAYPAL_WEBHOOK_ID so signatures can be verified. Event NOT processed.',
      },
      { status: 503 }
    );
  }
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return NextResponse.json({ error: 'Missing PayPal webhook signature headers' }, { status: 400 });
  }

  try {
    const result = await verifyWebhookSignature({
      transmissionId,
      transmissionTime,
      certUrl,
      authAlgo,
      transmissionSig,
      webhookEvent: event,
    });
    if (result !== 'SUCCESS') {
      return NextResponse.json(
        { error: 'Webhook signature verification FAILED — event rejected' },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error('[webhooks] signature verification error:', err);
    return NextResponse.json({ error: 'Webhook signature verification error' }, { status: 502 });
  }

  try {
    await initDb();
    await reconcileWebhookEvent(event);
  } catch (err) {
    console.error('[webhooks] reconciliation failed:', err);
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true, id: event?.id ?? null });
}
