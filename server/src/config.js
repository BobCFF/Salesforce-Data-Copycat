import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { DEPLOY_FALLBACK_SECRET } from './deploy-secret.js';

dotenv.config();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

// True when running on a serverless platform (Vercel) where the process is
// ephemeral and stateless — sessions must live in an encrypted cookie.
const isServerless = Boolean(process.env.VERCEL);

// Resolve the secret used to encrypt the session cookie:
//   1. SESSION_SECRET env var (preferred everywhere)
//   2. a baked deploy fallback (so serverless instances share one key)
//   3. an ephemeral random value (local dev only)
let sessionSecret = process.env.SESSION_SECRET;
let sessionSecretSource = 'env';
if (!sessionSecret) {
  if (typeof DEPLOY_FALLBACK_SECRET === 'string' && DEPLOY_FALLBACK_SECRET.length >= 32) {
    // Generated at build time (see scripts/gen-deploy-secret.mjs).
    sessionSecret = DEPLOY_FALLBACK_SECRET;
    sessionSecretSource = 'baked-fallback';
  } else {
    // Local dev, or a serverless deploy where the build step did not run.
    sessionSecret = crypto.randomBytes(32).toString('hex');
    sessionSecretSource = 'ephemeral';
  }
}

// iron-session requires a password of at least 32 characters. Hash shorter
// secrets up to a stable 64-char hex string.
const sessionPassword =
  sessionSecret.length >= 32 ? sessionSecret : crypto.createHash('sha256').update(sessionSecret).digest('hex');

const config = {
  isServerless,
  port: Number(process.env.PORT) || 4000,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sessionSecret,
  sessionPassword,
  // Cookies must be Secure on serverless (HTTPS); configurable locally.
  cookieSecure: bool(process.env.COOKIE_SECURE, isServerless),
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

if (sessionSecretSource === 'ephemeral') {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] SESSION_SECRET is not set — using an ephemeral secret. ' +
      'Sessions will not survive a server restart. Set SESSION_SECRET for production.'
  );
} else if (sessionSecretSource === 'baked-fallback') {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] SESSION_SECRET is not set — using the baked deploy fallback secret. ' +
      'Set a real SESSION_SECRET env var in your hosting provider and rotate the fallback.'
  );
}

export default config;
