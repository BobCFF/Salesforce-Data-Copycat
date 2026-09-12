import { getIronSession } from 'iron-session';
import config from './config.js';

// Stateless, encrypted session stored entirely in a signed+encrypted cookie.
// This works across ephemeral serverless instances (Vercel) where an in-memory
// session store would lose data between requests.
const sessionOptions = {
  password: config.sessionPassword,
  cookieName: 'sfcopycat.sid',
  ttl: Math.floor(config.sessionTtlMs / 1000),
  cookieOptions: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  },
};

// Express middleware that attaches an iron-session instance to req.session.
// Handlers mutate req.session and must call `await req.session.save()` to
// persist changes (writes the Set-Cookie header before the response is sent).
export async function sessionMiddleware(req, res, next) {
  try {
    req.session = await getIronSession(req, res, sessionOptions);
    next();
  } catch (err) {
    next(err);
  }
}
