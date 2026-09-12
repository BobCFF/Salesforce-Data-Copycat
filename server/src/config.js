import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const config = {
  port: Number(process.env.PORT) || 4000,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  sessionTtlMs: (Number(process.env.SESSION_TTL_MINUTES) || 120) * 60 * 1000,
  // The API version jsforce uses when talking to Salesforce.
  apiVersion: process.env.SF_API_VERSION || '60.0',
  oauth: {
    clientId: process.env.SF_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.SF_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.SF_OAUTH_REDIRECT_URI || 'http://localhost:4000/api/oauth/callback',
  },
};

config.oauthEnabled = Boolean(config.oauth.clientId && config.oauth.clientSecret);

if (!process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] SESSION_SECRET is not set — using an ephemeral secret. ' +
      'Sessions will not survive a server restart. Set SESSION_SECRET for production.'
  );
}

export default config;
