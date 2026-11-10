import assert from 'node:assert/strict';
import test from 'node:test';
import { ROWS_FILE } from '../src/source.js';
import { ROW_LIMITS, loadRowsFile, parseRows } from '../src/rows.js';

const CANARY = 'CANARY-9f3a';
const row = (over = {}) => ({ id: 'one', title: 'One', summary: 'S', match: { ids: ['a'], tags: ['t'], pingProducts: ['p'] }, pages: [{ label: 'L', path: '/x' }], ...over });
const doc = (rows, over = {}) => JSON.stringify({ schema: 'demo-map-rows/1', rows, ...over });
const bad = (text) => { const r = parseRows(text); assert.equal(r.ok, false, 'expected a refusal'); return r.problems; };

test('the shipped data/rows.json is valid: the 8 known rows are there, every row has an id, a title, pages', () => {
  const r = loadRowsFile(ROWS_FILE);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  for (const id of ['personal-agent', 'digital-worker', 'pingone', 'pingfederate', 'pinggateway', 'privilege', 'authorize', 'protect']) assert.ok(r.rows.some((x) => x.id === id), id);
  for (const x of r.rows) { assert.ok(x.title && x.pages.length > 0, x.id); assert.ok(Array.isArray(x.match.pingProducts)); }
});

test('a valid row comes back as a fresh, normalised object; match entries are lowercased; unknown keys are dropped', () => {
  const r = parseRows(doc([row({ match: { ids: [' Muse ', 'B'], tags: [], extra: 1 }, junk: 'x' })]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows[0].match, { ids: ['muse', 'b'], tags: [], pingProducts: [] });
  assert.equal(r.rows[0].junk, undefined);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['id', 'match', 'pages', 'summary', 'title']);
});

test('missing optional parts are fine: no summary, no match, no pages', () => {
  const r = parseRows(doc([{ id: 'bare', title: 'Bare' }]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows[0], { id: 'bare', title: 'Bare', summary: '', match: { ids: [], tags: [], pingProducts: [] }, pages: [] });
});

test('not JSON, wrong schema, no rows, rows not a list', () => {
  assert.match(bad('{nope')[0], /not valid JSON/);
  assert.match(bad(JSON.stringify({ schema: 'other/1', rows: [row()] }))[0], /schema must be demo-map-rows\/1/);
  assert.match(bad(JSON.stringify([]))[0], /schema/);
  assert.match(bad(doc([]))[0], /non-empty list/);
  assert.match(bad(JSON.stringify({ schema: 'demo-map-rows/1', rows: 'x' }))[0], /non-empty list/);
  assert.match(bad(doc(Array.from({ length: ROW_LIMITS.maxRows + 1 }, (_, i) => row({ id: `r${i}` }))))[0], /more than 30 rows/);
});

test('size cap is checked before parsing; deep nesting is refused without recursion', () => {
  assert.match(bad(doc([row({ summary: 'x'.repeat(ROW_LIMITS.maxBytes) })]))[0], /larger than 65536 bytes/);
  const deep = `{"schema":"demo-map-rows/1","rows":${'['.repeat(30_000)}${']'.repeat(30_000)}}`;
  assert.ok(deep.length < ROW_LIMITS.maxBytes, 'the hostile input is under the size cap, so only the depth check can stop it');
  assert.match(bad(deep)[0], /nested deeper than 8 levels/);
  assert.match(bad('x'.repeat(10) + '"'.repeat(3))[0], /not valid JSON/);
});

test('ids: bad shape and duplicates are refused', () => {
  for (const id of ['', 'UPPER', 'has space', '-lead', 'a'.repeat(41), 7, null]) assert.match(bad(doc([row({ id })]))[0], /rows\[0\]\.id: must be a short lowercase id/, String(id));
  assert.match(bad(doc([row(), row()]))[0], /rows\[1\]\.id: duplicate id/);
});

test('page paths: only a path starting with one "/" is accepted', () => {
  for (const path of ['//evil.example/x', 'https://evil.example/', 'javascript:alert(1)', 'no-slash', '/a b', '/a\nb', '', '/' + 'a'.repeat(ROW_LIMITS.maxPath), 5]) {
    assert.match(bad(doc([row({ pages: [{ label: 'L', path }] })]))[0], /pages\[0\]\.path/, JSON.stringify(path).slice(0, 30));
  }
  const ok = parseRows(doc([row({ pages: [{ label: 'L', path: '/a/b-c_d.e?x=1&y=2#frag' }, { label: 'Root', path: '/' }] })]));
  assert.equal(ok.ok, true);
  assert.equal(ok.rows[0].pages.length, 2);
  assert.match(bad(doc([row({ pages: [{ path: '/x' }] })]))[0], /label: required/);
});

test('caps on every list; empty or oversize match entries are refused (an empty one would match every id)', () => {
  assert.match(bad(doc([row({ match: { ids: Array.from({ length: ROW_LIMITS.maxEntries + 1 }, (_, i) => `a${i}`) } })]))[0], /more than 100 entries/);
  assert.match(bad(doc([row({ pages: Array.from({ length: ROW_LIMITS.maxPages + 1 }, () => ({ label: 'L', path: '/x' })) })]))[0], /more than 40 pages/);
  assert.match(bad(doc([row({ match: { ids: [''] } })]))[0], /match\.ids\[0\]/);
  assert.match(bad(doc([row({ match: { tags: ['  '] } })]))[0], /match\.tags\[0\]/);
  assert.match(bad(doc([row({ match: { pingProducts: ['x'.repeat(81)] } })]))[0], /pingProducts\[0\]/);
  assert.match(bad(doc([row({ match: { ids: 'a' } })]))[0], /match\.ids: must be a list/);
  assert.match(bad(doc([row({ match: 'x' })]))[0], /match: must be an object/);
});

test('problems name a position and never echo the value; they are capped', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row({ id: `Bad ${CANARY} ${i}`, title: CANARY, pages: [{ label: CANARY, path: `//${CANARY}` }] }));
  const problems = bad(doc(rows));
  assert.ok(problems.length <= ROW_LIMITS.maxProblems);
  assert.ok(!JSON.stringify(problems).includes(CANARY), 'a value from the file leaked into a problem');
  const p2 = bad(doc([row({ id: 'ok', pages: [{ label: CANARY, path: `javascript:${CANARY}` }], match: { ids: [`${CANARY}`.repeat(30)] } })]));
  assert.ok(!JSON.stringify(p2).includes(CANARY));
  const e = bad(`{"schema":"demo-map-rows/1","rows":[${CANARY}]}`);
  assert.ok(!JSON.stringify(e).includes(CANARY), 'a JSON syntax error must not echo the text');
});

test('hostile keys build no prototype pollution and nothing is spread from the file', () => {
  const text = '{"schema":"demo-map-rows/1","__proto__":{"polluted":1},"rows":[{"id":"a","title":"A","__proto__":{"polluted":2},"match":{"__proto__":{"ids":["z"]},"ids":["a"]},"constructor":{"prototype":{"polluted":3}}}]}';
  const r = parseRows(text);
  assert.equal(r.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(r.rows[0].polluted, undefined);
  assert.deepEqual(r.rows[0].match.ids, ['a']);
});

test('titles and summaries are cleaned of control and bidi characters and capped', () => {
  const r = parseRows(doc([row({ title: `A\u0007B‮C${'x'.repeat(200)}`, summary: 'y'.repeat(900) })]));
  assert.equal(r.ok, true);
  assert.ok(!/[\u0000-\u001f‮]/.test(r.rows[0].title));
  assert.equal(r.rows[0].title.length, ROW_LIMITS.maxTitle);
  assert.equal(r.rows[0].summary.length, ROW_LIMITS.maxSummary);
});

test('a rows file that cannot be read is a problem, not an exception', () => {
  const r = loadRowsFile('/nonexistent/rows.json');
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems, ['rows file: cannot be read']);
});
