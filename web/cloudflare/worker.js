/**
 * Cloudflare Worker for the dashboard frontend.
 *
 * The Next.js app is exported as static files (STATIC_EXPORT=1, see
 * next.config.mjs) and served from Workers static assets. The one thing a
 * static export can't do is Next's rewrites — so /api/* and /auth/* are
 * proxied here to the FastAPI backend on Cloud Run, keeping every request
 * (including the Google OAuth round-trip) on this same origin so the
 * session cookie is scoped to this domain. See next.config.mjs for why.
 *
 * wrangler.jsonc routes only /api/* and /auth/* to this code
 * (run_worker_first); every other path is served straight from the assets.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      const target = new URL(url.pathname + url.search, env.BACKEND_URL);
      const headers = new Headers(request.headers);
      headers.delete('host');
      // The backend builds absolute URLs (OAuth redirect_uri) from
      // FRONTEND_URL, but forwarding the real host keeps logs honest.
      headers.set('x-forwarded-host', url.host);
      headers.set('x-forwarded-proto', 'https');

      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual', // pass OAuth redirects through to the browser untouched
      });

      // Streamed as-is: Server-Sent Events (/api/find live progress) flow
      // through without buffering.
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
