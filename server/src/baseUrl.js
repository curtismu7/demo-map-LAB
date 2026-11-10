// Origin validation for the two configured URLs: AI_DEMO2_URL (the base the page links are built on) and SHELF_URL (the one
// local origin Real mode may contact). Plain origins only: no path, query, fragment or credentials. Problems never echo the value.
import { isLoopbackHost } from './safety.js';

// { ok: true, origin } or { ok: false, problem }. loopbackOnly = http on a loopback name only.
export function parseOrigin(value, { loopbackOnly = false } = {}) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { ok: false, problem: 'is empty' };
  if (raw.length > 200 || /[\s\u0000-\u001f\u007f\\]/.test(raw) || /[?#@]/.test(raw)) return { ok: false, problem: 'is not a plain origin (no path, query, fragment or credentials)' };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, problem: 'is not a URL' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, problem: 'must be http or https' };
  if (u.username || u.password || !u.hostname) return { ok: false, problem: 'must not carry credentials' };
  if (u.pathname !== '/') return { ok: false, problem: 'is not a plain origin (no path, query, fragment or credentials)' };
  if (loopbackOnly) {
    if (u.protocol !== 'http:') return { ok: false, problem: 'must be http on a loopback host (127.0.0.1, localhost or [::1])' };
    if (!isLoopbackHost(u.hostname)) return { ok: false, problem: 'must be a loopback host (127.0.0.1, localhost or [::1])' };
  }
  return { ok: true, origin: u.origin };
}

// Build the AI-DEMO2 page link: the validated origin plus a path that rows.js already validated.
export const pageHref = (origin, pagePath) => `${origin}${pagePath}`;
