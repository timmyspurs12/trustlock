'use client';

import { useMemo, useState } from 'react';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { AgStudioAiModule, createAiHarness, studioTheme, type AgReportState } from 'ag-studio';
import type { StudioActivityRow, StudioMilestoneRow } from '@/lib/db/stats';
import { createStudioGeminiAdapter } from '@/lib/studio/geminiAdapter';

// One adapter instance for the Studio AI assistant (Gemini via /api/studio-ai).
const studioGeminiAdapter = createStudioGeminiAdapter();

/**
 * AG Studio dashboard over LIVE TrustLock data (milestones, payments, AI
 * reviews, audit activity). The pre-built layout shows funds held / captured /
 * pending, AI verdict distribution, and the milestone + activity grids.
 * Switch to Edit mode to build custom widgets or use the AI assistant.
 *
 * The license key is optional (a 45-day trial is available from AG Grid);
 * without it Studio runs with a console notice.
 */
export function StudioDashboard({
  milestones,
  activity,
  licenseKey,
}: {
  milestones: StudioMilestoneRow[];
  activity: StudioActivityRow[];
  licenseKey?: string;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const data = useMemo(
    () => ({
      sources: [
        { id: 'milestones', data: milestones },
        { id: 'activity', data: activity },
      ],
    }),
    [milestones, activity]
  );

  const initialState = useMemo<AgReportState>(
    () => ({
      selectedPageId: 'overview',
      pages: [
        {
          id: 'overview',
          widgets: {
            'kpi-held': {
              type: 'value',
              dataMapping: { value: [{ id: 'milestones.held', aggregation: 'sum' }] },
              format: { title: { enabled: true, text: 'Funds held (USD)' } },
            },
            'kpi-captured': {
              type: 'value',
              dataMapping: { value: [{ id: 'milestones.captured', aggregation: 'sum' }] },
              format: { title: { enabled: true, text: 'Funds captured (USD)' } },
            },
            'kpi-pending': {
              type: 'value',
              dataMapping: { value: [{ id: 'milestones.pending', aggregation: 'sum' }] },
              format: { title: { enabled: true, text: 'Pending settlement (USD)' } },
            },
            'kpi-autoreleased': {
              type: 'value',
              dataMapping: { value: [{ id: 'milestones.autoReleased', aggregation: 'sum' }] },
              format: { title: { enabled: true, text: 'Auto-released milestones' } },
            },
            'chart-funds': {
              type: 'column-chart-stacked',
              dataMapping: {
                categoryKey: [{ id: 'milestones.paymentState' }],
                valueKey: [
                  { id: 'milestones.held', aggregation: 'sum' },
                  { id: 'milestones.captured', aggregation: 'sum' },
                ],
              },
              format: { title: { enabled: true, text: 'Funds by payment state (USD)' } },
            },
            'chart-verdicts': {
              type: 'donut-chart',
              dataMapping: {
                categoryKey: [{ id: 'milestones.verdict' }],
                valueKey: [{ id: 'milestones.count', aggregation: 'sum' }],
              },
              format: { title: { enabled: true, text: 'AI verdicts (milestones)' } },
            },
            'grid-milestones': {
              type: 'grid',
              dataMapping: {
                cols: [
                  { id: 'milestones.title' },
                  { id: 'milestones.status' },
                  { id: 'milestones.paymentState' },
                  { id: 'milestones.amount', aggregation: 'sum' },
                  { id: 'milestones.held', aggregation: 'sum' },
                  { id: 'milestones.captured', aggregation: 'sum' },
                  { id: 'milestones.verdict' },
                  { id: 'milestones.confidence' },
                  { id: 'milestones.updatedAt' },
                ],
              },
              format: { title: { enabled: true, text: 'Milestones' } },
            },
            'grid-activity': {
              type: 'grid',
              dataMapping: {
                cols: [
                  { id: 'activity.at' },
                  { id: 'activity.type' },
                  { id: 'activity.actor' },
                  { id: 'activity.milestoneTitle' },
                  { id: 'activity.decision' },
                  { id: 'activity.amount', aggregation: 'sum' },
                ],
              },
              format: { title: { enabled: true, text: 'Audit activity' } },
            },
          },
          widgetLayout: {
            'kpi-held': { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 },
            'kpi-captured': { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 },
            'kpi-pending': { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 7 },
            'kpi-autoreleased': { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 7 },
            'chart-funds': { xTrack: 0, yTrack: 7, xSpan: 12, ySpan: 14 },
            'chart-verdicts': { xTrack: 12, yTrack: 7, xSpan: 12, ySpan: 14 },
            'grid-milestones': { xTrack: 0, yTrack: 21, xSpan: 24, ySpan: 16 },
            'grid-activity': { xTrack: 0, yTrack: 37, xSpan: 24, ySpan: 16 },
          },
        },
      ],
      panels: {
        filters: { collapsed: false },
        data: { collapsed: true },
        edit: { collapsed: true },
      },
    }),
    []
  );

  // Edit-mode panels include the AI assistant (Studio Agent Framework).
  const panelConfig = useMemo(
    () => ({ edit: { right: ['filters', 'edit', 'data', 'ai'] } }) as any,
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Self-serve analytics over live TrustLock data. Switch to <strong>Edit</strong> to build custom
          widgets or ask the AI assistant about your milestones.
        </p>
        <div className="flex rounded-md border border-line bg-card p-0.5 text-sm" role="tablist" aria-label="Studio mode">
          <button
            role="tab"
            aria-selected={mode === 'view'}
            onClick={() => setMode('view')}
            className={`rounded px-3 py-1 font-medium ${
              mode === 'view' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
            }`}
          >
            View
          </button>
          <button
            role="tab"
            aria-selected={mode === 'edit'}
            onClick={() => setMode('edit')}
            className={`rounded px-3 py-1 font-medium ${
              mode === 'edit' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-card" style={{ height: 780 }}>
        <AgStudioProvider modules={[AgStudioAiModule]} licenseKey={licenseKey || undefined}>
          <AgStudio
            key={mode}
            data={data}
            initialState={initialState}
            mode={mode}
            theme={studioTheme}
            panels={panelConfig}
            ai={({ api }: any) => createAiHarness(api, { adapter: studioGeminiAdapter, primary: 'lead' })}
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}
