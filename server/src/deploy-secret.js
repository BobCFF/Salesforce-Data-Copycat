// ---------------------------------------------------------------------------
// Fallback secret for encrypting the stateless session cookie when the
// SESSION_SECRET environment variable is not set (e.g. a quick deploy where env
// vars have not been configured yet).
//
// This committed value is intentionally `null` — NO secret is stored in the
// repository. At deploy time the build step (scripts/gen-deploy-secret.mjs,
// run from vercel.json's buildCommand) OVERWRITES this file with a randomly
// generated secret *only in the ephemeral build*, so:
//   - all serverless instances of one deployment share the same key
//     (encrypted session cookies stay decryptable across cold starts), and
//   - the generated secret is never committed back to git.
//
// A new secret is generated on each deploy (existing sessions are invalidated;
// users simply log in again). Set a real SESSION_SECRET env var to control the
// key yourself — when it is set, this fallback is ignored entirely.
// ---------------------------------------------------------------------------
export const DEPLOY_FALLBACK_SECRET = null;
