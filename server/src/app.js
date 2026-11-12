// One Express app. /api = health, shelf (the header link), info, the Mock/Real toggle (rule 19), the map, reset.
// Loopback Host check and same-origin writes on everything. Rows come from data/rows.json, read per request. Mock apps come
// from data/sample-shelf.json and make no network call at all; Real reads the local shelf (GET <SHELF_URL>/api/shelf, loopback
// only, read-only) per request. Serves web/dist when it exists. Nothing fetched is logged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { hostCheck, sameOriginWrites } from './safety.js';
import { createHealth } from './health.js';
import { MOCK_AI_DEMO2_BASE, modeFrom, realConfig } from './config.js';
import { MOCK_FILE, ROWS_FILE, loadMockShelf } from './source.js';
import { loadRowsFile, ROW_LIMITS } from './rows.js';
import { SHELF_LIMITS, fetchShelf } from './shelf.js';
import { buildMap } from './view.js';
import { mountShelfRoute } from './shelfLink.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST || path.resolve(HERE, '../../web/dist');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createApp({ health = createHealth(), env = process.env, useSettingsFile = true, mockFile = MOCK_FILE, rowsFile = ROWS_FILE, fetchImpl } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use(sameOriginWrites);
  app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP }); next(); });

  const settingsOpts = { file: useSettingsFile };
  const cfg = () => realConfig(env, settingsOpts); // read on every call: editing .env shows up without a restart
  const launchMode = () => { try { return modeFrom(env, settingsOpts); } catch { return 'mock'; } };
  let mode = modeFrom(env, settingsOpts);
  health.setRuntime?.(() => (mode === 'real' ? 'live' : 'offline'));
  // Real that has become unusable (setting removed) falls back to Mock rather than serving nothing.
  const current = () => {
    if (mode === 'real') { const c = cfg(); if (c.ok) return { source: 'real', cfg: c }; mode = 'mock'; }
    return { source: 'mock' };
  };

  const api = express.Router();
  api.use(express.json({ limit: '4kb' }));
  api.use('/health', health.router);
  mountShelfRoute(api, { env, settingsOpts });
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  api.get('/info', (_req, res) => {
    const c = cfg(); const cur = current();
    res.json({
      version: (() => { try { return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || null; } catch { return null; } })(),
      source: cur.source, mode: cur.source, simulated: cur.source === 'mock', realAvailable: c.ok, realReason: c.ok ? null : c.problem,
      limits: { rows: ROW_LIMITS.maxRows, shelfBytes: SHELF_LIMITS.maxBytes, shelfSeconds: SHELF_LIMITS.timeoutMs / 1000 },
      contentLabel: cur.source === 'real' ? 'the apps on your local demo shelf (read-only, loopback only)' : 'the made-up sample shelf shipped in this repo (data/sample-shelf.json)',
    });
  });

  // Rule 19: exactly { source: "mock"|"real" }; 409 when Real is not configured.
  api.post('/mode', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['mock', 'real'].includes(body.source)) {
      return res.status(400).json({ error: 'bad_source', detail: 'body must be exactly { source: "mock" | "real" }' });
    }
    const c = cfg();
    if (body.source === 'real' && !c.ok) return res.status(409).json({ error: 'real_not_configured', detail: c.problem });
    mode = body.source;
    return res.json({ source: mode });
  });

  // Reset (rule 3): back to the launch mode. Row collapse and the filter live in the browser.
  api.post('/reset', (_req, res) => { mode = launchMode(); res.json({ ok: true, source: current().source }); });

  api.get('/map', async (_req, res, next) => {
    try {
      const cur = current();
      const rows = loadRowsFile(rowsFile);
      if (!rows.ok) return res.status(422).json({ error: 'rows_invalid', source: cur.source, detail: 'data/rows.json does not validate, so nothing is shown.', problems: rows.problems });
      let shelf; let base;
      if (cur.source === 'real') {
        shelf = await fetchShelf(cur.cfg.shelfOrigin, fetchImpl ? { fetchImpl } : undefined);
        if (!shelf.ok) return res.status(502).json({ error: 'shelf_unavailable', code: shelf.code, source: 'real', detail: shelf.detail, problems: shelf.problems });
        base = cur.cfg.aiDemo2Base;
      } else {
        shelf = loadMockShelf(mockFile);
        if (!shelf.ok) return res.status(422).json({ error: 'shelf_invalid', source: 'mock', detail: 'data/sample-shelf.json does not validate, so nothing is shown.', problems: shelf.problems });
        base = MOCK_AI_DEMO2_BASE;
      }
      const warnings = [];
      if (shelf.skipped) warnings.push(`${shelf.skipped} shelf ${shelf.skipped === 1 ? 'entry was' : 'entries were'} skipped because ${shelf.skipped === 1 ? 'it' : 'they'} did not match the expected shape.`);
      if (shelf.linksDropped) warnings.push(`${shelf.linksDropped} app ${shelf.linksDropped === 1 ? 'has' : 'have'} no usable Open link (only plain http or https links are shown).`);
      res.json({ source: cur.source, generatedAt: shelf.generatedAt, aiDemo2Base: base, ...buildMap(rows.rows, shelf.apps, base), warnings });
    } catch (e) { next(e); }
  });

  api.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);
  // Errors become short JSON; Express's default handler would send an HTML stack trace with absolute file paths.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = Number(err?.status || err?.statusCode);
    if (status === 413) return res.status(413).json({ error: 'payload_too_large' });
    if (status >= 400 && status < 500) return res.status(status).json({ error: 'bad_request' });
    return res.status(500).json({ error: 'internal_error' });
  });

  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }
  return app;
}

export function startHttpServer({ port, host, app = createApp() } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}/` }));
    server.once('error', reject);
  });
}
