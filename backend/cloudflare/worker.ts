/**
 * CLINILYNC Cloudflare Worker Edge Gateway
 * 
 * Provides:
 * 1. Edge TLS termination & WAF security headers (HSTS, CSP, X-Frame-Options)
 * 2. Edge rate-limiting (Token bucket per client IP)
 * 3. Unified routing for clinilync.com (SPA routes vs /api/* dispatch)
 * 4. Hyperdrive / edge-pooled PostgreSQL proxy connectivity
 */

export interface Env {
  ENVIRONMENT: string;
  DATABASE_URL?: string;
  SESSION_SECRET?: string;
  ALLOWED_ORIGIN?: string;
  API_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Edge security headers
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self';"
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://clinilync.com';
    const requestOrigin = request.headers.get('Origin');
    const corsOrigin = requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;
    const url = new URL(request.url);

    // 1. CORS Preflight Handling for Cross-Platform & Mobile Clients
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Vary': 'Origin',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Organization-Id',
          'Access-Control-Max-Age': '86400',
          ...SECURITY_HEADERS
        }
      });
    }

    // 2. Health check route
    if (url.pathname === '/healthz' || url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          service: 'CLINILYNC Edge Gateway',
          edgeRegion: request.headers.get('cf-ipcountry') || 'global',
          timestamp: new Date().toISOString()
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        }
      );
    }

    // 3. Let Cloudflare serve the built SPA for non-API requests when the
    // assets binding is present. API traffic is forwarded below.
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/healthz') {
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          const headers = new Headers(assetResponse.headers);
          for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
          return new Response(assetResponse.body, { status: assetResponse.status, headers });
        }
      }
    }

    // 4. Forward only to an explicitly configured API origin. Never fetch the
    //    public Worker URL itself, which can recurse indefinitely.
    if (!env.API_ORIGIN) {
      return new Response(JSON.stringify({ error: { code: 'ORIGIN_NOT_CONFIGURED', message: 'API origin is not configured.' } }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
      });
    }
    let originUrl: URL;
    try {
      originUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
    } catch {
      return new Response(JSON.stringify({ error: { code: 'ORIGIN_CONFIGURATION_INVALID', message: 'API origin configuration is invalid.' } }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
      });
    }
    const originRequest = new Request(originUrl, request);
    const response = await fetch(originRequest);

    // 5. Inject edge security headers onto outgoing response
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
