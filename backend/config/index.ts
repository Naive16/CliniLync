/**
 * CLINILYNC Centralized Configuration Service
 * 
 * Manages environment configurations across development, staging, and production.
 * Ensures zero hardcoded secrets and validates required infrastructure parameters.
 */

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface AppConfig {
  env: Environment;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  appName: string;
  appUrl: string;
  email: {
    provider: 'resend' | 'webhook' | 'none';
    apiKey?: string;
    webhookUrl?: string;
    from?: string;
  };
  database: {
    url?: string;
    maxConnections: number;
    ssl: boolean;
  };
  auth: {
    sessionSecret: string;
    tokenExpirySeconds: number;
    saltIterations: number;
  };
  security: {
    corsOrigins: string[];
    rateLimitPerMinute: number;
  };
  cloudflare: {
    accountId?: string;
    zoneId?: string;
    r2BucketName?: string;
  };
}

function resolveEnv(): Environment {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (['production', 'staging', 'test'].includes(env)) {
    return env as Environment;
  }
  return 'development';
}

const currentEnv = resolveEnv();

export const config: AppConfig = {
  env: currentEnv,
  isProduction: currentEnv === 'production',
  isDevelopment: currentEnv === 'development',
  isTest: currentEnv === 'test',
  port: Number(process.env.PORT) || 3000,
  appName: 'CLINILYNC',
  appUrl: process.env.APP_URL || 'https://clinilync.com',
  email: {
    provider: process.env.EMAIL_PROVIDER === 'resend'
      ? 'resend'
      : process.env.EMAIL_PROVIDER === 'webhook'
        ? 'webhook'
        : 'none',
    apiKey: process.env.RESEND_API_KEY,
    webhookUrl: process.env.EMAIL_WEBHOOK_URL,
    from: process.env.EMAIL_FROM,
  },
  database: {
    url: process.env.DATABASE_URL,
    maxConnections: Number(process.env.DB_MAX_CONNECTIONS) || 20,
    ssl: process.env.DATABASE_SSL === 'true' || currentEnv === 'production',
  },
  auth: {
    sessionSecret: process.env.SESSION_SECRET || 'clinilync-dev-ephemeral-session-secret-change-in-prod',
    tokenExpirySeconds: Number(process.env.SESSION_EXPIRY_SECONDS) || 86400, // 24 hours
    saltIterations: 100000,
  },
  security: {
    corsOrigins: (process.env.CORS_ORIGINS || 'https://clinilync.com').split(',').map(s => s.trim()),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 120,
  },
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    r2BucketName: process.env.CLOUDFLARE_R2_BUCKET,
  },
};

export function validateRuntimeConfig(): void {
  const requiredForHostedRuntime = config.env === 'staging' || config.env === 'production';
  if (!requiredForHostedRuntime) return;

  const missing: string[] = [];
  if (!config.database.url || config.database.url.includes('example') || config.database.url.includes('dummy')) missing.push('DATABASE_URL');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-this-to-a-cryptographically-secure-random-string-in-production') missing.push('SESSION_SECRET');
  if (!process.env.APP_URL || !/^https:\/\//i.test(process.env.APP_URL)) missing.push('APP_URL (HTTPS URL)');
  if (!process.env.CORS_ORIGINS) missing.push('CORS_ORIGINS');
  if (!config.email.from) missing.push('EMAIL_FROM');
  if (config.email.provider === 'resend' && !config.email.apiKey) missing.push('RESEND_API_KEY');
  if (config.email.provider === 'webhook' && !config.email.webhookUrl) missing.push('EMAIL_WEBHOOK_URL');

  if (missing.length > 0) {
    throw new Error(`Hosted runtime configuration is incomplete: ${missing.join(', ')}`);
  }
}
