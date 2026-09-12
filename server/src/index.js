import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import config from './config.js';
import { sessionMiddleware } from './session.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Stateless, encrypted cookie session (works on serverless).
app.use(sessionMiddleware);

// Basic rate limiting on the auth endpoints to slow credential guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/api/health', (req, res) => res.json({ ok: true, version: config.apiVersion }));

app.use('/api', authLimiter, authRoutes);
app.use('/api', dataRoutes);

// Optionally serve the built client (single-origin production deployment).
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }
  res.status(status).json({ error: err.message || 'Internal server error.' });
});

// Only bind a port when running as a long-lived process (local dev / node
// server). On serverless (Vercel) the app is imported and invoked per request.
if (!config.isServerless) {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Salesforce Data Copycat API listening on http://localhost:${config.port}`);
    if (config.oauthEnabled) console.log('OAuth2 login is enabled.');
  });
}

export default app;
