// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QosDeploymentRow, QosDeploymentsResponse, QosScoreResponse } from '@/lib/contracts/indexer-qos';

type Q<T> = { status: string; fetchStatus: string; data?: T; error?: Error };
let score: Q<QosScoreResponse>;
let deployments: Q<QosDeploymentsResponse>;

vi.mock('@/hooks/useNetworkStats', () => ({
  useIndexerQosScore: () => score,
  useIndexerQosDeployments: () => deployments,
}));

import { QosQualityPanel } from '../QosQualityPanel';

const ready = <T,>(data: T): Q<T> => ({ status: 'success', fetchStatus: 'idle', data });

const latest = {
  day: '2026-09-07', day_number: 2090, reliability: 0.974, lat_util: 0.731, fresh_util: 0.882, coverage: 0.999,
  served_gap: -0.28, efficiency: 12, q_score: 65.1, grade: 'B',
};

const row = (over: Partial<QosDeploymentRow>): QosDeploymentRow => ({
  deployment_id: 'QmWEfBuWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  queries: 1000, weight: 0.5, reliability: 1, reliability_used: 1, cohort_best_reliability: 1,
  lat_util: 1, fresh_util: 0.2, time_behind_sec: 35000, time_behind_own_sec: 35000, served_share: 0.4,
  q: 0.4, measured: true, drag: 0.05,
  ...over,
});

beforeEach(() => {
  score = ready({
    window_days: 30,
    latest,
    daily: [{ day: '2026-09-06', q_score: 64 }, { day: '2026-09-07', q_score: 65.1 }],
  });
  deployments = ready({ window_days: 30, total: null, deployments: [row({})] });
});

describe('QosQualityPanel', () => {
  it('shows the score, its grade and the four bars the old panel had', () => {
    render(<QosQualityPanel indexer="0x1" />);
    expect(screen.getByText('QoS Quality')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    for (const label of ['Reliability (Wilson)', 'Latency', 'Freshness', 'Coverage']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('97')).toBeInTheDocument();
  });

  it('flags a served-vs-allocated gap over 30 points and describes it as allocation share minus routing share', () => {
    const { unmount } = render(<QosQualityPanel indexer="0x1" />);
    expect(screen.getByText('-28%')).toBeInTheDocument();
    expect(screen.getByText(/Routing share above allocation share/)).toBeInTheDocument();
    expect(screen.getByText('allocation share minus routing share')).toBeInTheDocument();
    expect(screen.queryByText(/share of the gateway's queries/)).not.toBeInTheDocument();
    unmount();

    score = ready({ window_days: 30, latest: { ...latest, served_gap: 0.59 }, daily: [] });
    render(<QosQualityPanel indexer="0x1" />);
    expect(screen.getByText('+59%')).toBeInTheDocument();
    expect(screen.getByText(/gateway routes queries elsewhere/)).toBeInTheDocument();
  });

  it('names what holds the score down, by the axis that is failing, with the cohort marker', () => {
    deployments = ready({
      window_days: 30,
      total: null,
      deployments: [
        row({}),
        row({ deployment_id: 'QmXZ53Kzyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy', reliability: 0.5, reliability_used: 0.5, cohort_best_reliability: 0.6, fresh_util: 1, drag: 0.2 }),
        row({ deployment_id: 'QmHealthyzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', drag: 0.001 }),
      ],
    });
    render(<QosQualityPanel indexer="0x1" />);
    expect(screen.getByText('What is holding the score down')).toBeInTheDocument();
    expect(screen.getAllByTestId('qos-drag-row')).toHaveLength(2);
    expect(screen.getByText('~10 h behind')).toBeInTheDocument();
    expect(screen.getByText('serving errors')).toBeInTheDocument();
    expect(screen.getByText('cohort')).toBeInTheDocument();
  });

  /** History is recomputed for the window now; the old copy promised a cron that no longer exists. */
  it('no longer says history builds as a cron runs', () => {
    score = ready({ window_days: 30, latest, daily: [{ day: '2026-09-07', q_score: 65.1 }] });
    render(<QosQualityPanel indexer="0x1" />);
    expect(screen.queryByText(/History builds daily/)).not.toBeInTheDocument();
    expect(screen.getByText(/Fewer than two days in the window have a score/)).toBeInTheDocument();
  });

  it('keeps the old empty state and says when the read failed', () => {
    score = ready({ window_days: 30, latest: null, daily: [] });
    const { unmount } = render(<QosQualityPanel indexer="0x1" />);
    expect(screen.getByText(/No QoS quality score; the oracle records data only for queries the gateway routed/)).toBeInTheDocument();
    unmount();

    score = { status: 'error', fetchStatus: 'idle', error: new Error('QoS score failed: 503') };
    render(<QosQualityPanel indexer="0x1" />);
    expect(screen.getByText('QoS score failed: 503')).toBeInTheDocument();
  });
});
