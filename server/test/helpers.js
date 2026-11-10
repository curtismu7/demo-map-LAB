import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp, startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';

// Never the developer's .env and never process.env: createApp gets an explicit env and useSettingsFile: false.
export const NOENV = {};

export async function withServer(fn, { env = NOENV, ...rest } = {}) {
  const health = createHealth({ intervalMs: 3_600_000 });
  await health.ready;
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, env, useSettingsFile: false, ...rest }) });
  try { await fn(url.replace(/\/$/, '')); } finally { health.stop(); await new Promise((r) => server.close(r)); }
}

export const post = (url, p, body, headers = {}) => fetch(`${url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
export const get = (url, p, headers = {}) => fetch(`${url}${p}`, { headers });
export const getJson = async (url, p) => (await get(url, p)).json();

// A temporary folder outside the repo, filled with { name: text } files. Returns its path; remove with rm().
export function tempDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-map-test-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
export const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// A small valid shelf document. `over` replaces top-level fields.
export const shelfDoc = (demos, over = {}) => ({ schema: 'demo-shelf/1', generatedAt: '2026-11-10T09:00:00.000Z', demos, ...over });
export const demo = (id, over = {}) => ({ id, name: `Name of ${id}`, kind: 'Demo', description: `About ${id}`, tags: [], url: `http://${id}.lab.example:7900`, ...over });

// A loopback stand-in for the local shelf. `handler(req, res)` answers; returns the origin, and closes after fn.
export async function withFakeShelf(handler, fn) {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); handler(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await fn(origin, hits); } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}
export const sendJson = (body, status = 200, headers = {}) => (_req, res) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

// A loopback port that nothing listens on.
export async function closedPort() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

// fetch cannot set Host; node:http can.
export function rawHttp(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent: false }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
