/**
 * CLINILYNC Cloudflare Workers application entry.
 *
 * The complete Express API is mounted directly in the Worker; this is not
 * the old API_ORIGIN proxy. Hyperdrive owns origin connection pooling while
 * each Worker request receives its own pg.Client.
 */
import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../app.js';
import { configureRuntimeConfigFromBindings } from '../config/index.js';

interface HyperdriveBinding {
  connectionString: string;
}

interface Env {
  ENVIRONMENT?: string;
  APP_URL?: string;
  SESSION_SECRET?: string;
  CORS_ORIGINS?: string;
  EMAIL_FROM?: string;
  HYPERDRIVE?: HyperdriveBinding;
}

const runtimeEnv = env as unknown as Env;

const app = createApp({
  trustProxy: true,
  databaseConnectionString: () => runtimeEnv.HYPERDRIVE?.connectionString || '',
  configureRuntime: () => {
    const secret = runtimeEnv.SESSION_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('SESSION_SECRET must be configured as a Worker secret with at least 32 characters.');
    }
    configureRuntimeConfigFromBindings({
      env: runtimeEnv.ENVIRONMENT === 'production' ? 'production' : 'staging',
      appUrl: runtimeEnv.APP_URL || 'https://clinilync-staging.kelvinmkanda01.workers.dev',
      sessionSecret: secret,
      corsOrigins: (runtimeEnv.CORS_ORIGINS || runtimeEnv.APP_URL || '').split(',').map(value => value.trim()).filter(Boolean),
      emailFrom: runtimeEnv.EMAIL_FROM
    });
  },
  allowedOrigins: () => (runtimeEnv.CORS_ORIGINS || runtimeEnv.APP_URL || '').split(',').map(value => value.trim()).filter(Boolean)
});

// Cloudflare's Node HTTP adapter binds this Express listener to the Worker.
app.listen(3000);

export default httpServerHandler({ port: 3000 });
