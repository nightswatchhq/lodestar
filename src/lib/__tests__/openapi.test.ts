import { describe, expect, it } from 'vitest';
import { filterRoutes, parseOpenApi } from '../openapi';

const doc = {
  openapi: '3.1.0',
  info: { title: 'Lodestar', version: '0.1.0', description: 'Reads.' },
  servers: [{ url: 'https://api.lodestar-dashboard.com' }],
  paths: {
    '/api/price': { get: { summary: 'The GRT price in USD, with its age.', responses: { '429': {}, '200': {} } } },
    '/api/indexer/{address}': {
      get: {
        summary: 'One indexer in full.',
        parameters: [{ name: 'address', in: 'path', required: true }, { in: 'query' }],
      },
    },
  },
  'x-withheld': [
    { path: '/api/whoami', reason: 'a diagnostic' },
    { reason: 'no path, so dropped' },
  ],
};

describe('parseOpenApi', () => {
  it('lists the described routes in path order with their parameters', () => {
    const api = parseOpenApi(doc);
    expect(api.server).toBe('https://api.lodestar-dashboard.com');
    expect(api.routes.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/indexer/{address}', 'GET /api/price']);
    expect(api.routes[0].params).toEqual([{ name: 'address', in: 'path', required: true, description: null }]);
    expect(api.routes[1].responses).toEqual(['200', '429']);
  });

  it('lists withheld routes as internal, with the reason', () => {
    expect(parseOpenApi(doc).internal).toEqual([{ path: '/api/whoami', reason: 'a diagnostic' }]);
  });

  it('refuses something that is not an OpenAPI document rather than showing no routes', () => {
    expect(() => parseOpenApi({ error: 'unavailable' })).toThrow();
    expect(() => parseOpenApi(null)).toThrow();
  });
});

describe('filterRoutes', () => {
  it('matches every word against path and summary', () => {
    const { routes } = parseOpenApi(doc);
    expect(filterRoutes(routes, 'grt price').map((r) => r.path)).toEqual(['/api/price']);
    expect(filterRoutes(routes, 'indexer').map((r) => r.path)).toEqual(['/api/indexer/{address}']);
    expect(filterRoutes(routes, '  ')).toHaveLength(2);
  });
});
