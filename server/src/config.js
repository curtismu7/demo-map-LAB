// Settings for Real mode (rule 19). Two names, read from the process environment and from this app's own .env beside
// docker-compose.yml (owner rule 2026-11-09; never ~/Documents or a shared file). The environment wins. The .env is gitignored.
//   AI_DEMO2_URL  the AI-DEMO2 site the page links are built on (a plain http(s) origin). Required for Real.
//   SHELF_URL     the local demo shelf Real reads (a loopback http origin). Default http://127.0.0.1:4400.
// Real is refused off a loopback bind (the Docker image: a container cannot reach the host's loopback shelf, and Docker is Mock only).
// Hints never echo a setting's value.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindHost, isLoopbackHost } from './safety.js';
import { parseOrigin } from './baseUrl.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ENV_FILE = path.join(REPO_ROOT, '.env');
export const SETTING_NAMES = ['AI_DEMO2_URL', 'SHELF_URL'];
export const DEFAULT_SHELF_URL = 'http://127.0.0.1:4400';
export const MOCK_AI_DEMO2_BASE = 'https://ai-demo2.example';
const MAX_VALUE = 300;
const HOWTO = 'Copy .env.example to .env beside docker-compose.yml, set AI_DEMO2_URL (and SHELF_URL if your shelf is not on 127.0.0.1:4400), start the shelf, and run on the host with ./scripts/run.sh. Mock keeps working.';

// KEY=value lines, optional quotes, '#' comments. Only our names are kept.
export function parseSettings(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    if (raw.length > 4096) continue;
    const m = /^\s*(?:export\s+)?([A-Z0-9_]{1,80})\s*=\s*(.*)$/.exec(raw);
    if (!m || !SETTING_NAMES.includes(m[1])) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (v.length <= MAX_VALUE) out[m[1]] = v;
  }
  return out;
}

export function readSettings(env = process.env, { file = true, envFile = ENV_FILE } = {}) {
  let fromFile = {};
  if (file) { try { fromFile = parseSettings(fs.readFileSync(envFile, 'utf8')); } catch { /* no file */ } }
  const out = {};
  for (const n of SETTING_NAMES) { const v = env[n] !== undefined && env[n] !== '' ? String(env[n]) : fromFile[n]; if (v && v.length <= MAX_VALUE) out[n] = v; }
  return out;
}

// { ok: true, shelfOrigin, aiDemo2Base } or { ok: false, problem }.
export function realConfig(env = process.env, opts) {
  if (!isLoopbackHost(bindHost(env))) return { ok: false, problem: 'Real is off: this server is not bound to loopback (DEMO_MAP_BIND is set, as in the Docker image), and a container cannot reach the local shelf. Run on the host with ./scripts/run.sh. Mock keeps working.' };
  const s = readSettings(env, opts);
  if (!s.AI_DEMO2_URL) return { ok: false, problem: `Real is not configured: AI_DEMO2_URL is not set. ${HOWTO}` };
  const base = parseOrigin(s.AI_DEMO2_URL);
  if (!base.ok) return { ok: false, problem: `Real is not configured: AI_DEMO2_URL ${base.problem}. ${HOWTO}` };
  const shelf = parseOrigin(s.SHELF_URL || DEFAULT_SHELF_URL, { loopbackOnly: true });
  if (!shelf.ok) return { ok: false, problem: `Real is not configured: SHELF_URL ${shelf.problem}. ${HOWTO}` };
  return { ok: true, shelfOrigin: shelf.origin, aiDemo2Base: base.origin };
}

export const realAvailableFrom = (env = process.env, opts) => realConfig(env, opts).ok;

// The launch mode (env MODE). Default: Real if configured, else Mock. The Docker image sets MODE=mock.
export function modeFrom(env = process.env, opts) {
  if (env.MODE === undefined || env.MODE === '') return realAvailableFrom(env, opts) ? 'real' : 'mock';
  if (env.MODE !== 'mock' && env.MODE !== 'real') throw new Error(`MODE=${String(env.MODE).slice(0, 20)} is not available: this app has mock and real modes`);
  if (env.MODE === 'real' && !realAvailableFrom(env, opts)) throw new Error('MODE=real requested but Real is not configured (AI_DEMO2_URL / SHELF_URL)');
  return env.MODE;
}

// The header "Shelf" button: the SHELF_URL setting when it is a plain http(s) origin, else nothing (the button stays hidden).
export function shelfLinkUrl(env = process.env, opts) {
  const v = readSettings(env, opts).SHELF_URL;
  const o = v ? parseOrigin(v) : null;
  return o?.ok ? o.origin : null;
}
