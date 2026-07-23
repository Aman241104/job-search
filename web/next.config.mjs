// Proxies /api/* and /auth/* through this same origin instead of calling
// the backend's own domain directly. This isn't just about credentials:
// 'include' — a cookie set on job-serach-api's domain is stored under THAT
// domain in the browser's cookie jar and will never be attached to a
// request whose target is this Vercel domain, no matter what server-side
// proxying happens, since cookie attachment is decided purely by the
// request's perceived target host. The ENTIRE OAuth dance (not just /me)
// has to go through this same origin for the session cookie to end up
// scoped here in the first place: /auth/google/login issues Authlib's CSRF
// state via Starlette's SessionMiddleware (itself a cookie) — if login and
// callback aren't both proxied through the same host, that state cookie
// set during /login never reaches /callback either, and the whole flow
// 401s. See app.py's google_login — it sends Google an explicit
// FRONTEND_URL-based redirect_uri (not the dynamically-computed one) to
// match.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/auth/:path*', destination: `${BACKEND_URL}/auth/:path*` },
    ];
  },
};

export default nextConfig;
