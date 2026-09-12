#!/usr/bin/env node
// Build-time generator for the session-cookie fallback secret.
//
// Runs during deploy (see vercel.json `buildCommand`). If SESSION_SECRET is set
// in the environment, we leave the committed `null` fallback in place — the env
// var is authoritative. Otherwise we write a freshly generated random secret
// into server/src/deploy-secret.js so the deployed bundle has a stable key
// shared by all serverless instances. The generated value lives only in the
// ephemeral build output and is never committed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(__dirname, '../server/src/deploy-secret.js');

if (process.env.SESSION_SECRET) {
  console.log('[gen-deploy-secret] SESSION_SECRET is set; using it (fallback left as null).');
  process.exit(0);
}

const secret = crypto.randomBytes(32).toString('hex');
const contents = `// AUTO-GENERATED AT BUILD TIME by scripts/gen-deploy-secret.mjs — do not commit.
// See the committed version of this file for why this exists.
export const DEPLOY_FALLBACK_SECRET = ${JSON.stringify(secret)};
`;
fs.writeFileSync(target, contents);
console.log('[gen-deploy-secret] Wrote a generated fallback session secret into deploy-secret.js.');
