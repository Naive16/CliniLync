import { config } from '../config/index.js';

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailDeliveryResult {
  accepted: boolean;
  provider: string;
  reason?: string;
}

/**
 * Staging-only verification delivery for controlled manual testing.
 * The raw link is written to private Render service logs, never returned by an API.
 * This is disabled unless NODE_ENV=staging, the feature flag is explicit,
 * and the recipient is on the staging allowlist.
 */
export function deliverStagingVerificationLink(email: string, verificationUrl: string): EmailDeliveryResult | null {
  if (config.env !== 'staging' || process.env.STAGING_EMAIL_VERIFICATION_LOG !== 'true') return null;
  const allowlist = (process.env.STAGING_EMAIL_VERIFICATION_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(email.trim().toLowerCase())) return null;

  console.info('[STAGING EMAIL VERIFICATION] One-time verification link (restricted staging logs):', verificationUrl);
  return { accepted: true, provider: 'staging-console' };
}

/**
 * Small provider boundary. Production must use a real provider; local/test
 * environments deliberately report an unavailable provider instead of
 * pretending that an email was sent.
 */
export async function sendTransactionalEmail(message: TransactionalEmail): Promise<EmailDeliveryResult> {
  if (!config.email.from) {
    return { accepted: false, provider: 'none', reason: 'EMAIL_FROM_NOT_CONFIGURED' };
  }

  if (config.email.provider === 'resend') {
    if (!config.email.apiKey) return { accepted: false, provider: 'resend', reason: 'RESEND_API_KEY_NOT_CONFIGURED' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.email.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!response.ok) return { accepted: false, provider: 'resend', reason: 'PROVIDER_REJECTED_MESSAGE' };
    return { accepted: true, provider: 'resend' };
  }

  if (config.email.provider === 'webhook') {
    if (!config.email.webhookUrl) return { accepted: false, provider: 'webhook', reason: 'EMAIL_WEBHOOK_URL_NOT_CONFIGURED' };
    const response = await fetch(config.email.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, ...message }),
    });
    if (!response.ok) return { accepted: false, provider: 'webhook', reason: 'PROVIDER_REJECTED_MESSAGE' };
    return { accepted: true, provider: 'webhook' };
  }

  return { accepted: false, provider: 'none', reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
}
