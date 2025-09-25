import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const settingsPayload = {
  result: {
    data: { theme: 'dark', timezone: 'Europe/Brussels', notifications: true },
  },
};
const okPayload = { result: { data: { ok: true } } };

export const server = setupServer(
  // Direct path-style calls
  http.get('/api/trpc/settings.get', () => HttpResponse.json(settingsPayload)),
  http.post('/api/trpc/settings.get', () => HttpResponse.json(settingsPayload)),
  http.post('/api/trpc/settings.update', () => HttpResponse.json(okPayload)),

  // Generic router endpoint (supports single or batch payloads)
  http.post('/api/trpc', async ({ request }) => {
    const body = await request.json().catch(() => null);
    const calls = Array.isArray(body) ? body : body ? [body] : [];
    const has = (p: string) =>
      calls.some(
        (c: { path?: string; params?: { path?: string } }) =>
          c?.path === p || c?.params?.path === p
      );
    if (has('settings.get')) return HttpResponse.json(settingsPayload);
    if (has('settings.update')) return HttpResponse.json(okPayload);
    return HttpResponse.json({ result: { data: null } });
  }),

  // Catch any GET /api/trpc/:path as a fallback
  http.get('/api/trpc/:path', ({ params }) => {
    const path = String(params.path || '');
    if (path.includes('settings.get'))
      return HttpResponse.json(settingsPayload);
    return HttpResponse.json({ result: { data: null } });
  })
);
