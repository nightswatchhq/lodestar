/**
 * `/api/file-issue` contract, with the mirror and GitHub both mocked.
 *
 * The cases that matter are the ones where something must *not* reach GitHub: an answer missing a
 * required field, a template that is not one of the six, a bot that filled the honeypot, and a
 * deployment with no token. Each of those has to fail before the write, because the write is public
 * and cannot be taken back.
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

/** The mirror answers with the one template; anything else is the GitHub write. */
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
  return import('../file-issue/route');
}

function post(body: unknown) {
  return new Request('http://localhost/api/file-issue', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const GOOD = {
  template: '05-question.yml',
  title: 'How do I read a deployment ID from the gateway?',
  values: { question: 'Which of the two ids is the one that identifies the running code?' },
};

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv('LODESTAR_API_ORIGIN', 'https://api.example.test');
  vi.stubEnv('GRAPH_SUPPORT_ISSUE_TOKEN', 'ghp_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/file-issue', () => {
  it('opens the issue and answers with its number', async () => {
    mirrorThen(json({ number: 41, html_url: 'https://github.com/x/y/issues/41' }, 201));
    const { POST } = await route();

    const res = await POST(post(GOOD));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ number: 41 });

    const write = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/issues'));
    expect(write?.[1].method).toBe('POST');
    expect(write?.[1].headers.Authorization).toBe('Bearer ghp_test');

    const sent = JSON.parse(write?.[1].body);
    expect(sent.title).toBe(GOOD.title);
    expect(sent.labels).toEqual(['status/triage', 'kind/question']);
    expect(sent.body).toContain('### The question');
    // An unanswered optional is stated rather than dropped, same as GitHub's own form.
    expect(sent.body).toContain('### What you are trying to do\n\n_No response_');
  });

  it('says who the report belongs to, because the account is not theirs', async () => {
    mirrorThen(json({ number: 42, html_url: 'u' }, 201));
    const { POST } = await route();

    await POST(post({ ...GOOD, handle: '@reporter' }));
    const write = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/issues'));
    expect(JSON.parse(write?.[1].body).body).toContain('on behalf of @reporter');
  });

  it('refuses an answer missing a required field, without writing', async () => {
    mirrorThen(json({ number: 1 }, 201));
    const { POST } = await route();

    const res = await POST(post({ ...GOOD, values: {} }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'The question is required' });
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/issues'))).toBe(false);
  });

  it('refuses a title too short to find the thread by', async () => {
    mirrorThen(json({ number: 1 }, 201));
    const { POST } = await route();

    const res = await POST(post({ ...GOOD, title: 'broken' }));
    expect(res.status).toBe(400);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/issues'))).toBe(false);
  });

  it('refuses a template that is not one of the forms', async () => {
    mirrorThen(json({ number: 1 }, 201));
    const { POST } = await route();

    const res = await POST(post({ ...GOOD, template: '99-anything.yml' }));
    expect(res.status).toBe(400);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/issues'))).toBe(false);
  });

  it('drops a submission that filled the honeypot', async () => {
    mirrorThen(json({ number: 1 }, 201));
    const { POST } = await route();

    const res = await POST(post({ ...GOOD, website: 'http://spam.example' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('says filing is not configured rather than failing at GitHub', async () => {
    vi.stubEnv('GRAPH_SUPPORT_ISSUE_TOKEN', '');
    mirrorThen(json({ number: 1 }, 201));
    const { POST } = await route();

    const res = await POST(post(GOOD));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      chooserUrl: 'https://github.com/nightswatchhq/graph-support/issues/new/choose',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a GitHub refusal as a failure, not as a filed issue', async () => {
    mirrorThen(json({ message: 'Bad credentials' }, 401));
    const { POST } = await route();

    const res = await POST(post(GOOD));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('nothing was filed') });
  });

  it('falls back to the repository when the mirror is unreachable', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/support/templates')) return json({ error: 'down' }, 503);
      if (u.includes('/contents/.github/ISSUE_TEMPLATE')) {
        return json([
          { name: 'config.yml', download_url: 'https://raw.test/config.yml' },
          { name: '05-question.yml', download_url: 'https://raw.test/05-question.yml' },
        ]);
      }
      if (u === 'https://raw.test/05-question.yml') {
        return { ok: true, status: 200, text: async () => TEMPLATE_YAML, headers: new Headers() };
      }
      return json({ number: 43, html_url: 'u' }, 201);
    });
    const { POST } = await route();

    const res = await POST(post(GOOD));
    expect(res.status).toBe(200);
    // config.yml is the chooser's own settings, not a form.
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('config.yml'))).toBe(false);
  });
});
