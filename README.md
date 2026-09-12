# Salesforce Data Copycat

A web app for **securely copying data between two Salesforce orgs** through a
**Windows Explorer–style** interface. Browse objects in a tree, build queries
visually (or with raw SOQL), sort and filter results in a grid, and copy the
selected data into a second org using the Bulk API.

![layout](https://img.shields.io/badge/UI-Windows%20Explorer%20style-blue) ![node](https://img.shields.io/badge/node-%3E%3D20-green)

---

## Features

- **Two independent org connections** — a *source* and a *target*, each logged
  in separately.
- **Secure authentication** — username + password (+ security token), a raw
  access token / session id, or OAuth2 web-server flow via a Connected App.
  Credentials live only in a server-side, HTTP-only session cookie — never in
  the browser and never written to disk.
- **Windows Explorer–style object tree** — standard and custom objects in
  collapsible folders with a live filter.
- **Visual query builder** — pick fields, add `WHERE` filters (with `AND`/`OR`
  logic and operators including `LIKE`, `IN`, comparisons and SOQL date
  literals), and `ORDER BY` sorting, with a live SOQL preview.
- **SOQL support** — every selection compiles to SOQL server-side with input
  validation and safe string-literal escaping.
- **Bulk API** — query and load large data volumes via Bulk API v2; small sets
  use the REST APIs automatically.
- **Sortable, filterable data grid** — click any column header to sort;
  per-column filter boxes narrow the visible rows.
- **Copy with insert / update / upsert** — choose the target object (defaults
  to the same name), the operation, and the external-Id field for upserts.
  System and non-writable fields are stripped automatically.

---

## Architecture

```
salesforce-data-copycat/
├── server/                # Express + jsforce API (Node, ESM)
│   └── src/
│       ├── index.js       # app bootstrap, security middleware, static hosting
│       ├── config.js      # env-driven configuration
│       ├── salesforce.js  # jsforce wrappers: login, describe, SOQL, bulk load
│       ├── connections.js # per-session source/target connection management
│       └── routes/
│           ├── auth.js     # connect / disconnect / status / OAuth
│           └── data.js     # objects / describe / query / copy
└── client/                # React + Vite single-page app
    └── src/
        ├── App.jsx         # Explorer layout + orchestration
        ├── api.js          # fetch wrapper (sends session cookie)
        └── components/     # ObjectTree, QueryBuilder, DataGrid, CopyPanel, ConnectionPanel
```

The client talks to the API at `/api/*`. In development Vite proxies that to
the server on port 4000 so the browser stays single-origin and the session
cookie is preserved.

---

## Getting started

### Prerequisites
- Node.js **20+**
- Access to two Salesforce orgs (or the same org twice, e.g. for a dry run)

### 1. Install
```bash
npm install
```
(installs both the `server` and `client` workspaces)

### 2. Configure the server
```bash
cp server/.env.example server/.env
# edit server/.env — at minimum set a long random SESSION_SECRET
```

### 3. Run in development
```bash
npm run dev
```
- API:    http://localhost:4000
- Client: http://localhost:5173  ← open this

### 4. Production build
```bash
npm run build      # builds the client into client/dist
npm start          # server serves the API *and* the built client on :4000
```
Set `COOKIE_SECURE=true` and a strong `SESSION_SECRET` when serving over HTTPS.

### 5. Deploy to Vercel

The app is Vercel-ready:

- `api/index.mjs` exposes the Express app as a serverless function; `vercel.json`
  rewrites `/api/*` to it and serves the built client (`client/dist`) from the CDN.
- Sessions use **stateless encrypted cookies** ([iron-session](https://github.com/vvo/iron-session)),
  so they survive across ephemeral/scaled serverless instances (an in-memory
  store would not).

Deploy by importing the GitHub repo into Vercel (build settings are picked up
from `vercel.json`), then **set a `SESSION_SECRET` environment variable** in the
Vercel project settings (Project → Settings → Environment Variables) and
redeploy. Until you do, a baked fallback secret in `server/src/deploy-secret.js`
is used so the deploy works out of the box — **rotate it** by setting the env var.

> **Serverless caveat — large Bulk copies.** Serverless functions have a maximum
> execution time (`maxDuration` is set to 60s in `vercel.json`; Vercel Hobby caps
> at 60s, Pro allows longer). Interactive browsing, querying, and small/medium
> copies work well, but a very large Bulk API load can exceed that limit and time
> out. For big data volumes, run the app as a normal long-lived Node process
> (`npm start`) or on a host without a hard request timeout.

---

## Connecting to an org

Each connection card offers two methods (plus OAuth if configured):

1. **Username / Password** — pick Production or Sandbox, then enter your
   username, password, and (if your org requires it) your **security token**.
   The token is appended to the password exactly as the Salesforce SOAP login
   expects.
2. **Access token** — paste an instance URL
   (`https://xxx.my.salesforce.com`) and a valid access token / session id
   (e.g. from `sf org display`). Handy for SSO orgs.
3. **OAuth2** — set `SF_OAUTH_CLIENT_ID`, `SF_OAUTH_CLIENT_SECRET` and
   `SF_OAUTH_REDIRECT_URI` from a Connected App to enable the *Log in with
   Salesforce* button.

## Copying data

1. Connect the **source** org (left) and **target** org (right).
2. Pick an object from the tree.
3. In the query builder choose fields, add filters and sorting, then
   **Run Query** to preview.
4. In the **Copy to Target** panel choose the target object, operation
   (insert / update / upsert), and Bulk API option, then run the copy.
5. Results show success / failure counts and per-row errors.

Only fields that are creatable (or updateable, for updates) on the target are
sent; `attributes`, nested relationship objects, and read-only/system fields
are removed automatically.

---

## Security notes

- Credentials and tokens are stored **only** in the server-side session
  (signed, HTTP-only cookie) and are never returned to the browser or logged.
- SOQL is assembled server-side; object/field names are validated against a
  strict allow-list pattern and string values are escaped for SOQL literals.
- `helmet`, CORS restricted to configured origins, and rate limiting on auth
  endpoints are enabled by default.
- The default session store is in-memory (fine for a single-instance tool).
  For multi-instance deployments, plug in a shared session store (Redis, etc.)
  in `server/src/index.js`.
- **Always run behind HTTPS in production** and set `COOKIE_SECURE=true`.

---

## Limitations / roadmap ideas

- No automatic reference (lookup/master-detail) re-parenting across orgs —
  copied Ids won't match; use external Ids + upsert for related data.
- In-memory session store (see note above).
- Field mapping is name-based; a visual source→target field mapping UI is a
  natural next step.
