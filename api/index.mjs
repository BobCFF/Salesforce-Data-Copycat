// Vercel serverless entrypoint.
//
// The Express app is a standard (req, res) handler, so Vercel can invoke it
// directly. `vercel.json` rewrites all /api/* requests to this function; the
// static client (client/dist) is served by Vercel's CDN.
//
// Uses the .mjs extension so Vercel treats it as an ES module regardless of the
// repo-root package.json "type".
import app from '../server/src/index.js';

export default app;
