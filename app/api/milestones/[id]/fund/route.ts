import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getMilestone, getPaymentByMilestoneId, startFunding } from '@/lib/db/milestones';
import { fundSchema } from '@/lib/validation';
import { createAuthorizationOrder, PayPalError } from '@/lib/paypal/client';
import { paypalConfig, paypalCheckoutUrl } from '@/lib/paypal/config';

/**
 * POST /api/milestones/[id]/fund
 *
 * Creates the PayPal AUTHORIZE order for a milestone.
 *
 * AMOUNT PROTECTION: this endpoint accepts NO client input. The amount and
 * currency are read from the stored milestone — the browser only says
 * "fund milestone X". A strict empty schema rejects any smuggled fields.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await initDb();

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const parsed = fundSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Unexpected fields. The server controls the payment amount; the browser only requests funding for a milestone.' },
        { status: 400 }
      );
    }

    const milestone = await getMilestone(id);
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    if (milestone.status === 'AUTHORIZED') {
      return NextResponse.json({ error: 'Milestone is already authorized' }, { status: 409 });
    }

    // Idempotent re-entry: funding already started → return the existing order.
    if (milestone.status === 'FUNDING_PENDING') {
      const existing = await getPaymentByMilestoneId(id);
      if (existing) {
        return NextResponse.json(
          {
            orderId: existing.orderId,
            approvalUrl: paypalCheckoutUrl(existing.orderId),
            alreadyFunded: true,
            clientId: paypalConfig.clientId,
            currency: existing.currency,
            amount: existing.authorizedAmount,
            milestoneStatus: 'FUNDING_PENDING',
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: 'Funding already in progress but no order is recorded' },
        { status: 409 }
      );
    }

    // DRAFT → create the PayPal order with the SERVER-CONTROLLED amount.
    const origin =
      req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    let orderId: string;
    let approvalUrl: string | null;
    try {
      const created = await createAuthorizationOrder({
        amount: milestone.amount,
        currency: milestone.currency,
        description: `TrustLock milestone: ${milestone.title}`,
        referenceId: milestone.id,
        returnUrl: `${origin}/milestones/${id}?funded=1`,
        cancelUrl: `${origin}/milestones/${id}?cancelled=1`,
      });
      orderId = created.orderId;
      approvalUrl = created.approvalUrl;
    } catch (err) {
      if (err instanceof PayPalError) {
        return NextResponse.json(
          { error: 'PayPal order creation failed', issue: err.issue },
          { status: 502 }
        );
      }
      throw err;
    }

    await startFunding(id, {
      orderId,
      amount: milestone.amount,
      currency: milestone.currency,
    });

    return NextResponse.json(
      {
        orderId,
        approvalUrl: approvalUrl ?? paypalCheckoutUrl(orderId),
        clientId: paypalConfig.clientId,
        currency: milestone.currency,
        amount: milestone.amount,
        milestoneStatus: 'FUNDING_PENDING',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[api] POST /api/milestones/[id]/fund failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
