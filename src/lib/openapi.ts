/**
 * kittiwake's OpenAPI document, reduced to what the API page shows.
 *
 * The document is generated from kittiwake's router. Routes it serves but does not describe sit
 * under `x-withheld` with a reason, which is what the page lists as internal.
 */

export type ApiParam = { name: string; in: string; required: boolean; description: string | null };

export type ApiRoute = {
  path: string;
  method: string;
  summary: string;
  params: ApiParam[];
  responses: string[];
};

export type InternalRoute = { path: string; reason: string };

export type ApiDoc = {
  title: string;
  version: string;
  description: string;
  server: string | null;
  routes: ApiRoute[];
  internal: InternalRoute[];
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function parseOpenApi(json: unknown): ApiDoc {
  const doc = obj(json);
  if (typeof doc.openapi !== 'string' || typeof doc.paths !== 'object' || doc.paths === null) {
    throw new Error('The API description is not an OpenAPI document.');
  }
  const info = obj(doc.info);
  const servers = Array.isArray(doc.servers) ? doc.servers : [];

  const routes: ApiRoute[] = [];
  for (const [path, item] of Object.entries(obj(doc.paths))) {
    for (const method of METHODS) {
      const op = obj(obj(item)[method]);
      if (!Object.keys(op).length) continue;
      const params = (Array.isArray(op.parameters) ? op.parameters : []).map((p): ApiParam => {
        const o = obj(p);
        return {
          name: str(o.name) ?? '',
          in: str(o.in) ?? '',
          required: o.required === true,
          description: str(o.description),
        };
      });
      routes.push({
        path,
        method: method.toUpperCase(),
        summary: str(op.summary) ?? str(op.description) ?? '',
        params: params.filter((p) => p.name),
        responses: Object.keys(obj(op.responses)).sort(),
      });
    }
  }
  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  const internal = (Array.isArray(doc['x-withheld']) ? doc['x-withheld'] : [])
    .map((w) => ({ path: str(obj(w).path) ?? '', reason: str(obj(w).reason) ?? '' }))
    .filter((w) => w.path)
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    title: str(info.title) ?? 'API',
    version: str(info.version) ?? '',
    description: str(info.description) ?? '',
    server: str(obj(servers[0]).url),
    routes,
    internal,
  };
}

/** Routes whose path or summary holds every word of the query. */
export function filterRoutes(routes: ApiRoute[], query: string): ApiRoute[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return routes;
  return routes.filter((r) => {
    const hay = `${r.path} ${r.summary}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
