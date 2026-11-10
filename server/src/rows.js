// The row definitions (data/rows.json, schema demo-map-rows/1): which standalone apps belong in which row, and which AI-DEMO2
// pages each row links to. This file is the editable source of truth, so it is parsed like any untrusted input: size cap,
// iterative depth check, a fixed-shape walk into fresh objects (nothing from the file is spread or merged), caps on every
// list, and problems that name a position, never the value.
import fs from 'node:fs';
import { parseBounded } from './boundedJson.js';
import { cleanText } from './safety.js';

export const ROWS_SCHEMA = 'demo-map-rows/1';
export const ROW_LIMITS = { maxBytes: 65_536, maxDepth: 8, maxRows: 30, maxPages: 40, maxEntries: 100, maxEntryLength: 80, maxTitle: 80, maxSummary: 300, maxLabel: 100, maxPath: 200, maxProblems: 20 };

const ROW_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A path on the AI-DEMO2 site: starts with one "/", then URL-safe characters. No scheme, no "//", no whitespace.
const PAGE_PATH = /^\/(?!\/)[A-Za-z0-9._~\-/%?=&#]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function stringList(value, where, problems) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { problems.push(`${where}: must be a list`); return []; }
  if (value.length > ROW_LIMITS.maxEntries) { problems.push(`${where}: more than ${ROW_LIMITS.maxEntries} entries`); return []; }
  const out = [];
  value.forEach((v, i) => {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (!s || s.length > ROW_LIMITS.maxEntryLength || /[\u0000-\u001f\u007f]/.test(s)) problems.push(`${where}[${i}]: must be a short non-empty string`);
    else out.push(s);
  });
  return out;
}

// { ok: true, rows } or { ok: false, problems }. Rows: { id, title, summary, match: { ids, tags, pingProducts }, pages: [{ label, path }] }.
export function parseRows(text) {
  const parsed = parseBounded(text, ROW_LIMITS);
  if (!parsed.ok) return { ok: false, problems: [`rows file: ${parsed.problem}`] };
  const doc = parsed.value;
  if (!isObj(doc) || doc.schema !== ROWS_SCHEMA) return { ok: false, problems: [`rows file: schema must be ${ROWS_SCHEMA}`] };
  if (!Array.isArray(doc.rows) || doc.rows.length < 1) return { ok: false, problems: ['rows file: rows must be a non-empty list'] };
  if (doc.rows.length > ROW_LIMITS.maxRows) return { ok: false, problems: [`rows file: more than ${ROW_LIMITS.maxRows} rows`] };

  const problems = []; const rows = []; const seen = new Set();
  doc.rows.forEach((r, i) => {
    const at = `rows[${i}]`;
    if (!isObj(r)) { problems.push(`${at}: must be an object`); return; }
    if (typeof r.id !== 'string' || !ROW_ID.test(r.id)) { problems.push(`${at}.id: must be a short lowercase id`); return; }
    if (seen.has(r.id)) { problems.push(`${at}.id: duplicate id`); return; }
    seen.add(r.id);
    const title = typeof r.title === 'string' ? cleanText(r.title, ROW_LIMITS.maxTitle) : '';
    if (!title) { problems.push(`${at}.title: required`); return; }
    const summary = r.summary === undefined ? '' : typeof r.summary === 'string' ? cleanText(r.summary, ROW_LIMITS.maxSummary) : (problems.push(`${at}.summary: must be text`), '');
    const m = r.match === undefined ? {} : r.match;
    if (!isObj(m)) { problems.push(`${at}.match: must be an object`); return; }
    const match = {
      ids: stringList(m.ids, `${at}.match.ids`, problems),
      tags: stringList(m.tags, `${at}.match.tags`, problems),
      pingProducts: stringList(m.pingProducts, `${at}.match.pingProducts`, problems),
    };
    const pages = [];
    if (r.pages !== undefined) {
      if (!Array.isArray(r.pages)) problems.push(`${at}.pages: must be a list`);
      else if (r.pages.length > ROW_LIMITS.maxPages) problems.push(`${at}.pages: more than ${ROW_LIMITS.maxPages} pages`);
      else {
        r.pages.forEach((p, j) => {
          const label = isObj(p) && typeof p.label === 'string' ? cleanText(p.label, ROW_LIMITS.maxLabel) : '';
          const pagePath = isObj(p) && typeof p.path === 'string' ? p.path : '';
          if (!label) problems.push(`${at}.pages[${j}].label: required`);
          else if (pagePath.length > ROW_LIMITS.maxPath || !PAGE_PATH.test(pagePath)) problems.push(`${at}.pages[${j}].path: must be a path starting with one "/"`);
          else pages.push({ label, path: pagePath });
        });
      }
    }
    rows.push({ id: r.id, title, summary, match, pages });
  });
  if (problems.length) return { ok: false, problems: problems.slice(0, ROW_LIMITS.maxProblems) };
  return { ok: true, rows };
}

export function loadRowsFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { ok: false, problems: ['rows file: cannot be read'] }; }
  return parseRows(text);
}
