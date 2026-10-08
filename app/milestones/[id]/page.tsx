import Link from 'next/link';
import { notFound } from 'next/navigation';
import { initDb } from '@/lib/db';
import { getMilestoneDetail } from '@/lib/db/milestones';
import { StateBadge } from '@/components/StateBadge';
import { FundButton } from '@/components/FundButton';
import { ConfirmAuthorizationButton } from '@/components/ConfirmAuthorizationButton';
import { EvidenceForm } from '@/components/EvidenceForm';
import { ReviewPanel } from '@/components/ReviewPanel';
import { HumanApprovalCard } from '@/components/HumanApprovalCard';
import { AgentTrace } from '@/components/AgentTrace';
import { paypalConfig, paypalCheckoutUrl, paypalSdkUrl } from '@/lib/paypal/config';

export const dynamic = 'force-dynamic';

export default async function MilestonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await initDb();
  const detail = await getMilestoneDetail(id);
  if (!detail) notFound();
  const { milestone, payment, actions, evidence, latestReview, latestRelease } = detail;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:underline">
            ← Milestones
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{milestone.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Created {new Date(milestone.createdAt).toLocaleString()} · {milestone.id}
          </p>
        </div>
        <StateBadge status={milestone.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</h2>
            <p className="mt-2 text-slate-800">{milestone.description || '—'}</p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Acceptance criteria
            </h2>
            <ul className="mt-3 space-y-2">
              {milestone.acceptanceCriteria.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="mt-0.5 font-mono text-xs text-slate-400">{c.id}</span>
                  <span className="text-sm text-slate-800">{c.description}</span>
                  {c.required && (
                    <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      required
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Phase 2: evidence submission */}
          {['AUTHORIZED', 'REQUEST_CHANGES'].includes(milestone.status) && (
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {milestone.status === 'REQUEST_CHANGES' ? 'Submit revised evidence' : 'Submit evidence'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                The AI verification agent will evaluate every acceptance criterion against your deliverable.
              </p>
              <div className="mt-4">
                <EvidenceForm milestoneId={milestone.id} />
              </div>
            </section>
          )}

          {milestone.status === 'EVIDENCE_SUBMITTED' && (
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-600">Evidence submitted. Running the AI verification agent…</p>
            </section>
          )}

          {latestReview && <ReviewPanel review={latestReview} release={latestRelease} />}

          {milestone.status === 'HUMAN_REVIEW' && latestReview && (
            <HumanApprovalCard milestoneId={milestone.id} review={latestReview} />
          )}

          <AgentTrace actions={actions} />

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit trail</h2>
            <ul className="mt-3 space-y-2">
              {actions.length === 0 && <li className="text-sm text-slate-400">No actions yet.</li>}
              {actions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-slate-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {a.actionType}
                  </span>
                  <span className="text-slate-500">{a.actor}</span>
                  {a.decision && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      {a.decision}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment</h2>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {milestone.amount.toFixed(2)}{' '}
              <span className="text-base font-medium text-slate-500">{milestone.currency}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Escrow-like hold powered by PayPal authorization — funds are held, not captured.
            </p>

            {milestone.status === 'DRAFT' && (
              <div className="mt-4 space-y-3">
                <FundButton
                  milestoneId={milestone.id}
                  sdkUrl={paypalSdkUrl(paypalConfig.clientId, milestone.currency)}
                />
                <p className="text-xs text-slate-400">Sandbox only. No real money moves.</p>
              </div>
            )}

            {milestone.status === 'FUNDING_PENDING' && payment && (
              <div className="mt-4 space-y-3">
                <a
                  href={paypalCheckoutUrl(payment.orderId)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-[#0070E0] px-3 py-2 text-center text-sm font-medium text-[#0070E0] hover:bg-blue-50"
                >
                  Open PayPal approval →
                </a>
                <ConfirmAuthorizationButton milestoneId={milestone.id} orderId={payment.orderId} />
                <p className="break-all font-mono text-xs text-slate-400">Order {payment.orderId}</p>
              </div>
            )}

            {milestone.status === 'AUTHORIZED' && payment && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="rounded-md bg-green-50 px-3 py-2 text-green-800">
                  ✓ Funds authorized and held by PayPal (not captured).
                </div>
                <dl className="space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between gap-2">
                    <dt>Authorization</dt>
                    <dd className="break-all font-mono">{payment.authorizationId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Held amount</dt>
                    <dd className="tabular-nums">
                      {payment.authorizedAmount.toFixed(2)} {payment.currency}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Hold expires</dt>
                    <dd>
                      {payment.authorizationExpiresAt
                        ? new Date(payment.authorizationExpiresAt).toLocaleString()
                        : '—'}
                    </dd>
                  </div>
                </dl>
                <p className="pt-2 text-xs text-slate-400">
                  Release happens only after AI verification + policy approval.
                </p>
              </div>
            )}

            {['CAPTURE_PENDING'].includes(milestone.status) && (
              <div className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                Release processing — the PayPal capture was accepted and is settling. Not paid yet.
              </div>
            )}

            {['PAID', 'PAID_PARTIAL'].includes(milestone.status) && latestRelease && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="rounded-md bg-green-50 px-3 py-2 text-green-800">
                  ✓ {milestone.status === 'PAID' ? 'Paid in full.' : 'Partially paid.'} Funds released to the freelancer.
                </div>
                <dl className="space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <dt>Released</dt>
                    <dd className="tabular-nums">${latestRelease.requestedAmount.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Capture</dt>
                    <dd className="break-all font-mono">{latestRelease.captureId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Status</dt>
                    <dd>{latestRelease.captureStatus}</dd>
                  </div>
                </dl>
              </div>
            )}

            {milestone.status === 'REQUEST_CHANGES' && (
              <div className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-800">
                Changes requested — submit revised evidence below.
              </div>
            )}
          </section>

          {evidence.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evidence submissions ({evidence.length})
              </h2>
              <ul className="mt-3 space-y-2 text-xs">
                {evidence.map((e, i) => (
                  <li key={e.id} className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="font-mono text-slate-400">v{evidence.length - i}</div>
                    <div className="break-all text-slate-700">{e.deliverableUrl}</div>
                    <div className="text-slate-400">{new Date(e.submittedAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
