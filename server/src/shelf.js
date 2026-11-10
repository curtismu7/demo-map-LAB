// The demo shelf's data (schema demo-shelf/1): validate it, and fetch it in Real mode.
// Real mode contacts exactly one origin, the local shelf on loopback: http only, no redirects, a size cap, a time cap, a JSON
// content type, a bounded parse and a fixed-shape walk. Anything fetched is untrusted: text is cleaned and length-capped, links
// are re-validated, and problems are fixed strings or positions, never the fetched text.
import { parseBounded } from './boundedJson.js';
import { parseOrigin } from './baseUrl.js';
import { cleanText } from './safety.js';

export const SHELF_SCHEMA = 'demo-shelf/1';
export const SHELF_LIMITS = { maxBytes: 2 * 1024 * 1024, timeoutMs: 5000, maxDepth: 12, maxDemos: 500, maxTags: 30, maxTagLength: 60, maxName: 120, maxDescription: 300, maxUrl: 2048, maxProblems: 10 };
export const KINDS = ['Demo', 'Tester', 'Tool'];

const APP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// An Open link must be a plain http(s) URL without credentials. Returns the normalised href, or null.
export function safeLink(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > SHELF_LIMITS.maxUrl || /[\s\u0000-\u001f\u007f\\]/.test(raw)) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || !u.hostname) return null;
  return u.href;
}

// The shelf's own status, reduced to what the card shows. Anything else is "no chip": the data does not say.
function runningFrom(status) {
  const s = isObj(status) && typeof status.state === 'string' ? status.state : '';
  if (s === 'ready') return 'running';
  if (s === 'down') return 'not-running';
  if (s === 'needs-setup') return 'needs-setup';
  return null;
}

function tagList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const t of value.slice(0, SHELF_LIMITS.maxTags)) {
    const s = typeof t === 'string' ? cleanText(t, SHELF_LIMITS.maxTagLength) : '';
    if (s) out.push(s);
  }
  return out;
}

// pingProducts entries are plain strings or objects with a "product" string.
function productList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const p of value.slice(0, SHELF_LIMITS.maxTags)) {
    const s = typeof p === 'string' ? p : isObj(p) && typeof p.product === 'string' ? p.product : '';
    const c = cleanText(s, SHELF_LIMITS.maxTagLength);
    if (c) out.push(c);
  }
  return out;
}

// { ok: true, apps, generatedAt, skipped, linksDropped } or { ok: false, problems }.
// apps: [{ id, name, kind, description, tags, products, open, running }], open = validated href or null.
export function validateShelf(doc) {
  if (!isObj(doc) || doc.schema !== SHELF_SCHEMA) return { ok: false, problems: [`shelf: schema must be ${SHELF_SCHEMA}`] };
  if (!Array.isArray(doc.demos)) return { ok: false, problems: ['shelf: demos must be a list'] };
  if (doc.demos.length > SHELF_LIMITS.maxDemos) return { ok: false, problems: [`shelf: more than ${SHELF_LIMITS.maxDemos} entries`] };
  const apps = []; const seen = new Set(); const problems = []; let skipped = 0; let linksDropped = 0;
  doc.demos.forEach((d, i) => {
    const skip = (why) => { skipped += 1; if (problems.length < SHELF_LIMITS.maxProblems) problems.push(`demos[${i}]: ${why}`); };
    if (!isObj(d)) return skip('not an object');
    if (typeof d.id !== 'string' || !APP_ID.test(d.id)) return skip('id is not a valid id');
    if (seen.has(d.id)) return skip('duplicate id');
    const name = typeof d.name === 'string' ? cleanText(d.name, SHELF_LIMITS.maxName) : '';
    if (!name) return skip('name is missing');
    if (!KINDS.includes(d.kind)) return skip('kind is not Demo, Tester or Tool');
    seen.add(d.id);
    const proxy = safeLink(d.proxyUrl); const direct = safeLink(d.url);
    // Prefer the lab-proxy address when the shelf has one, else the direct URL.
    const open = proxy || direct;
    if (!open && (d.proxyUrl !== undefined || d.url !== undefined)) linksDropped += 1;
    apps.push({
      id: d.id, name, kind: d.kind,
      description: cleanText(d.description, SHELF_LIMITS.maxDescription),
      tags: tagList(d.tags), products: productList(d.pingProducts),
      open, running: runningFrom(d.status),
    });
  });
  const generatedAt = typeof doc.generatedAt === 'string' ? cleanText(doc.generatedAt, 40) : '';
  return { ok: true, apps, generatedAt: generatedAt || null, skipped, linksDropped, problems };
}

// Parse shelf text (bounded), then validate. Used for the bundled sample and for the fetched body.
export function parseShelfText(text) {
  const parsed = parseBounded(text, SHELF_LIMITS);
  if (!parsed.ok) return { ok: false, code: 'bad_json', problems: [`shelf: ${parsed.problem}`] };
  const v = validateShelf(parsed.value);
  return v.ok ? v : { ...v, code: 'bad_shape' };
}

const FAIL = {
  bad_origin: 'The shelf address is not a loopback http origin, so it was not contacted.',
  unreachable: 'The local demo shelf did not answer. Start it (it listens on the address in SHELF_URL), or switch to Mock.',
  timeout: `The local demo shelf did not answer within ${SHELF_LIMITS.timeoutMs / 1000} seconds.`,
  redirect: 'The local demo shelf answered with a redirect, which is refused: Real mode only talks to the one origin.',
  http_status: 'The local demo shelf answered with an error status.',
  not_json: 'The local demo shelf did not answer with JSON.',
  too_large: `The local demo shelf answer is larger than ${SHELF_LIMITS.maxBytes} bytes, so it was refused.`,
  bad_json: 'The local demo shelf answer is not valid JSON of a safe size and depth.',
  bad_shape: 'The local demo shelf answer does not look like the demo-shelf/1 format.',
};
const fail = (code, problems = []) => ({ ok: false, code, detail: FAIL[code], problems });

async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!res.body) return '';
  const reader = res.body.getReader(); const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch { /* already closed */ } return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// GET <origin>/api/shelf. `fetchImpl` is injectable for tests; production uses the global (behind the netguard).
export async function fetchShelf(origin, { fetchImpl = (...a) => globalThis.fetch(...a), timeoutMs = SHELF_LIMITS.timeoutMs, maxBytes = SHELF_LIMITS.maxBytes } = {}) {
  const o = parseOrigin(origin, { loopbackOnly: true });
  if (!o.ok) return fail('bad_origin');
  let res;
  try {
    res = await fetchImpl(`${o.origin}/api/shelf`, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) { return fail(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'unreachable'); }
  if (res.redirected || (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') return fail('redirect');
  if (!res.ok) return fail('http_status');
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(res.headers.get('content-type') || '')) return fail('not_json');
  let text;
  try { text = await readCapped(res, maxBytes); } catch (e) { return fail(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'unreachable'); }
  if (text === null) return fail('too_large');
  const v = parseShelfText(text);
  return v.ok ? v : fail(v.code, v.problems);
}
