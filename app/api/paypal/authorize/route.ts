import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { completeAuthorization, getMilestone, getPaymentByOrderId } from '@/lib/db/milestones';
import { authorizeSchema } from '@/lib/validation';
import { amountsEqual, toPayPalAmount } from '@/lib/money';
import {
  authorizeOrder,
  extractAuthorization,
  getAuthorization,
  getOrder,
  PayPalError,
} from '@/lib/paypal/client';

/**
 * POST /api/paypal/authorize
 *
 * Receives an APPROVED PayPal order ID from the browser, then — server-side —
 * verifies the order with PayPal, authorizes it (funds become HELD), verifies
 * the authorization, and only then persists AUTHORIZED.
 *
 * The client can NEVER assert a state, an authorization ID, or an amount.
 * Everything is derived from PayPal + the database.
 */
export async function POST(req: Request) {
  try {
    await initDb();
    const body = await req.json().catch(() => null);
    const parsed = authorizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { orderId, milestoneId } = parsed.data;

    // 1. The order must be one WE created, bound to THIS milestone.
    const payment = await getPaymentByOrderId(orderId);
    if (!payment) {
      return NextResponse.json({ error: 'Unknown PayPal order for TrustLock' }, { status: 404 });
    }
    if (payment.milestoneId !== milestoneId) {
      return NextResponse.json(
        { error: 'This PayPal order does not belong to the given milestone' },
        { status: 403 }
      );
    }

    // 2. Idempotency: already authorized → return the existing state, no new PayPal call.
    if (payment.trustlockStatus === 'AUTHORIZED' && payment.authorizationId) {
      return NextResponse.json({
        status: 'AUTHORIZED',
        alreadyAuthorized: true,
        authorizationId: payment.authorizationId,
        authorizedAmount: payment.authorizedAmount,
        authorizationExpiresAt: payment.authorizationExpiresAt,
      });
    }

    const milestone = await getMilestone(milestoneId);
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    // 3. Verify with PayPal: the buyer must have approved the order.
    let order;
    try {
      order = await getOrder(orderId);
    } catch (err) {
      if (err instanceof PayPalError) {
        return NextResponse.json(
          { error: 'Could not verify the order with PayPal', issue: err.issue },
          { status: 502 }
        );
      }
      throw err;
    }
    if (order.status !== 'APPROVED') {
      return NextResponse.json(
        {
          error: 'Buyer has not approved this order yet',
          paypalOrderStatus: order.status,
          code: 'ORDER_NOT_APPROVED',
        },
        { status: 409 }
      );
    }

    // 4. AMOUNT PROTECTION: the PayPal order must match the stored milestone.
    const orderAmount = order.purchase_units?.[0]?.amount;
    if (
      !orderAmount ||
      !amountsEqual(orderAmount.value, milestone.amount) ||
      orderAmount.currency_code !== milestone.currency
    ) {
      return NextResponse.json(
        {
          error: 'PayPal order amount/currency does not match the milestone',
          expected: { amount: toPayPalAmount(milestone.amount), currency: milestone.currency },
          got: orderAmount ?? null,
        },
        { status: 422 }
      );
    }

    // 5. Server-side authorization (PayPal enforces buyer approval again here).
    let authorization = null;
    try {
      const authOrder = await authorizeOrder(orderId);
      authorization = extractAuthorization(authOrder);
    } catch (err) {
      if (err instanceof PayPalError && err.issue === 'ORDER_NOT_APPROVED') {
        return NextResponse.json(
          { error: 'Buyer has not approved this order yet', code: 'ORDER_NOT_APPROVED' },
          { status: 409 }
        );
      }
      if (err instanceof PayPalError && err.issue === 'ORDER_ALREADY_AUTHORIZED') {
        // Race safety: someone else completed it — read the existing authorization.
        const fresh = await getOrder(orderId);
        authorization = extractAuthorization(fresh);
      } else if (err instanceof PayPalError) {
        return NextResponse.json(
          { error: 'PayPal rejected the authorization', issue: err.issue },
          { status: 502 }
        );
      } else {
        throw err;
      }
    }

    if (!authorization?.id) {
      return NextResponse.json(
        { error: 'PayPal did not return an authorization', paypalOrderStatus: order.status },
        { status: 502 }
      );
    }

    // 6. Verify the authorization: must be CREATED (held) with the right amount.
    let authState;
    try {
      authState = await getAuthorization(authorization.id);
    } catch (err) {
      if (err instanceof PayPalError) {
        return NextResponse.json(
          { error: 'Could not read the authorization from PayPal', issue: err.issue },
          { status: 502 }
        );
      }
      throw err;
    }
    if (authState.status !== 'CREATED') {
      return NextResponse.json(
        {
          error: 'Authorization is not in a held (CREATED) state',
          paypalAuthorizationStatus: authState.status,
        },
        { status: 502 }
      );
    }
    if (
      !amountsEqual(authState.amount?.value, milestone.amount) ||
      authState.amount?.currency_code !== milestone.currency
    ) {
      return NextResponse.json(
        {
          error: 'Authorized amount does not match the milestone',
          got: authState.amount ?? null,
        },
        { status: 422 }
      );
    }

    // 7. Persist: TrustLock state becomes AUTHORIZED (money held, not captured).
    const updated = await completeAuthorization({
      orderId,
      authorizationId: authorization.id,
      authorizationExpiresAt: authState.expiration_time ?? authorization.expiration_time ?? null,
      paypalRequestId: `authorize:${orderId}`,
    });

    return NextResponse.json({
      status: 'AUTHORIZED',
      authorizationId: updated.authorizationId,
      authorizedAmount: updated.authorizedAmount,
      currency: updated.currency,
      authorizationExpiresAt: updated.authorizationExpiresAt,
    });
  } catch (err) {
    console.error('[api] POST /api/paypal/authorize failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
