/**
 * `/api/issue-forms`: the forms the compose page renders.
 *
 * Its own route because the rate limiter buckets by path, so the read cannot share a budget sized
 * for writes. What it has to get right is saying whether filing is possible at all, since the page
 * offers the bounce-out to GitHub instead when it is not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cache', () => ({
  cached: (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
}));

vi.mock('@/lib/logger', () => ({
  log: { api: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } },
}));

const TEMPLATE_YAML = `
name: A question
description: You just want to know how something works.
title: "[question] "
labels: ["status/triage", "kind/question"]
body:
  - type: textarea
    id: question
    attributes:
      label: The question
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: What you are trying to do
`;

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  };
}

function mirrorThen(write: unknown) {
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/support/templates')) {
      return json({ templates: [{ file: '05-question.yml', yaml: TEMPLATE_YAML }] });
    }
    return write;
  });
}

async function route() {
  vi.resetModules();
  return import('../issue-forms/route');
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv('LODESTAR_API_ORIGIN', 'https://api.example.test');
  vi.stubEnv('GRAPH_SUPPORT_ISSUE_TOKEN', 'ghp_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/issue-forms', () => {
  it('reports whether filing is possible, so the page can say so', async () => {
    mirrorThen(json({}, 200));
    const { GET } = await route();

    const res = await GET();
    const body = await res.json();
    expect(body.canFile).toBe(true);
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].name).toBe('A question');
  });

  it('answers 503 when the forms cannot be read at all', async () => {
    mockFetch.mockResolvedValue(json({ error: 'down' }, 503));
    const { GET } = await route();

    const res = await GET();
    expect(res.status).toBe(503);
  });
});
