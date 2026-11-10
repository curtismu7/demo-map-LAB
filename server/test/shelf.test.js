import assert from 'node:assert/strict';
import test from 'node:test';
import { SHELF_LIMITS, fetchShelf, parseShelfText, safeLink, validateShelf } from '../src/shelf.js';
import { MOCK_FILE, loadMockShelf } from '../src/source.js';
import { closedPort, demo, sendJson, shelfDoc, withFakeShelf } from './helpers.js';

const CANARY = 'CANARY-77c1';

test('safeLink: only plain http(s) URLs without credentials survive', () => {
  assert.equal(safeLink('https://a.example/x?y=1'), 'https://a.example/x?y=1');
  assert.equal(safeLink(' http://a.example:7900 '), 'http://a.example:7900/');
  for (const v of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'vbscript:x', 'file:///etc/passwd', 'ftp://a.example', '//a.example', '/relative', 'a.example',
    'https://u:p@a.example', 'https://u@a.example', 'http://a.example/ x', 'http://a.example/\nx', 'http://a.example\\x', '', null, undefined, 4, {}, `https://a.example/${'x'.repeat(SHELF_LIMITS.maxUrl)}`]) {
    assert.equal(safeLink(v), null, String(v).slice(0, 30));
  }
});

test('validateShelf: a good entry is reduced to the fields the map shows', () => {
  const r = validateShelf(shelfDoc([demo('one', { kind: 'Tester', tags: ['a', 'b'], pingProducts: ['pingone', { product: 'pinggateway', state: 'ready', url: 'x' }, 5, { nope: 1 }], status: { state: 'ready', runtime: 'live' }, secret: 'x' })]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.apps, [{ id: 'one', name: 'Name of one', kind: 'Tester', description: 'About one', tags: ['a', 'b'], products: ['pingone', 'pinggateway'], open: 'http://one.lab.example:7900/', running: 'running' }]);
  assert.equal(r.generatedAt, '2026-11-10T09:00:00.000Z');
});

test('Open prefers proxyUrl, else url; an unsafe proxyUrl falls back to url; both unsafe gives no link', () => {
  const pick = (over) => validateShelf(shelfDoc([demo('one', over)])).apps[0].open;
  assert.equal(pick({ proxyUrl: 'https://launcher.example:8443/one/' }), 'https://launcher.example:8443/one/');
  assert.equal(pick({}), 'http://one.lab.example:7900/');
  assert.equal(pick({ proxyUrl: 'javascript:alert(1)' }), 'http://one.lab.example:7900/');
  const both = validateShelf(shelfDoc([demo('one', { proxyUrl: 'javascript:alert(1)', url: 'data:text/html,x' })]));
  assert.equal(both.apps[0].open, null);
  assert.equal(both.linksDropped, 1);
});

test('running state: ready, down and needs-setup map to chips; anything else gives no chip', () => {
  const run = (status) => validateShelf(shelfDoc([demo('one', { status })])).apps[0].running;
  assert.equal(run({ state: 'ready' }), 'running');
  assert.equal(run({ state: 'down', reason: 'unreachable' }), 'not-running');
  assert.equal(run({ state: 'needs-setup' }), 'needs-setup');
  for (const s of [{ state: 'weird' }, { state: 3 }, {}, 'ready', null, undefined, []]) assert.equal(run(s), null, JSON.stringify(s));
});

test('bad entries are skipped and counted, never echoed; the good ones stay', () => {
  const r = validateShelf(shelfDoc([
    demo('good'), 'not an object', null, demo('bad id with spaces'), demo(`${CANARY}/slash`), demo('dup'), demo('dup'),
    demo('noname', { name: '' }), demo('badkind', { kind: 'Weird' }), { ...demo('numname'), name: 5 }, demo('good2'),
  ]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.apps.map((a) => a.id), ['good', 'dup', 'good2']);
  assert.equal(r.skipped, 8);
  assert.ok(r.problems.length <= SHELF_LIMITS.maxProblems);
  assert.ok(r.problems.every((p) => /^demos\[\d+\]: /.test(p)));
  assert.ok(!JSON.stringify(r.problems).includes(CANARY));
});

test('wrong schema, demos not a list, too many entries', () => {
  assert.equal(validateShelf({ schema: 'demo-shelf/2', demos: [] }).ok, false);
  assert.equal(validateShelf({ demos: [] }).ok, false);
  assert.equal(validateShelf(null).ok, false);
  assert.equal(validateShelf([]).ok, false);
  assert.equal(validateShelf({ schema: 'demo-shelf/1', demos: {} }).ok, false);
  const big = validateShelf(shelfDoc(Array.from({ length: SHELF_LIMITS.maxDemos + 1 }, (_, i) => demo(`a${i}`))));
  assert.equal(big.ok, false);
  assert.ok(!JSON.stringify(big.problems).includes('a1'));
  assert.equal(validateShelf(shelfDoc([])).ok, true);
});

test('text from the shelf is cleaned and capped; lists are capped', () => {
  const r = validateShelf(shelfDoc([demo('one', { name: `N‮ame${'x'.repeat(300)}`, description: `D\u0000${'y'.repeat(900)}`, tags: Array.from({ length: 100 }, (_, i) => `t${i}`).concat(['z'.repeat(500)]) })]));
  const a = r.apps[0];
  assert.ok(!/[\u0000-\u001f‮]/.test(a.name + a.description));
  assert.equal(a.name.length, SHELF_LIMITS.maxName);
  assert.equal(a.description.length, SHELF_LIMITS.maxDescription);
  assert.equal(a.tags.length, SHELF_LIMITS.maxTags);
  assert.equal(validateShelf(shelfDoc([demo('one', { tags: ['z'.repeat(500)] })])).apps[0].tags[0].length, SHELF_LIMITS.maxTagLength);
});

test('parseShelfText: size cap, depth cap, bad JSON, bad shape; none of them echoes the text', () => {
  const text = JSON.stringify(shelfDoc([demo('one')]));
  assert.equal(parseShelfText(text).ok, true);
  assert.equal(parseShelfText(`{"schema":"demo-shelf/1","demos":${'['.repeat(30_000)}${']'.repeat(30_000)}}`).code, 'bad_json');
  assert.equal(parseShelfText(`{"${CANARY}":`).code, 'bad_json');
  const shape = parseShelfText(JSON.stringify({ schema: CANARY, demos: [] }));
  assert.equal(shape.code, 'bad_shape');
  assert.ok(!JSON.stringify(shape).includes(CANARY));
  assert.equal(parseShelfText('x'.repeat(SHELF_LIMITS.maxBytes + 1)).code, 'bad_json');
});

test('the bundled sample shelf is valid: 18 apps, every kind present, no entry skipped, no link dropped', () => {
  const r = loadMockShelf(MOCK_FILE);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.apps.length, 18);
  assert.equal(r.skipped, 0);
  assert.equal(r.linksDropped, 0);
  assert.deepEqual([...new Set(r.apps.map((a) => a.kind))].sort(), ['Demo', 'Tester', 'Tool']);
  assert.deepEqual(new Set(r.apps.map((a) => a.running)), new Set([null, 'needs-setup', 'not-running', 'running']));
  assert.ok(r.apps.every((a) => /^https?:\/\/[^/]*\.example(:\d+)?\//.test(a.open) || a.open === null));
});

// ---- fetchShelf: the one loopback origin, no redirects, caps -------------------------------------------------------------

test('fetchShelf: a loopback shelf answers; the request is GET /api/shelf only', async () => {
  await withFakeShelf(sendJson(shelfDoc([demo('one'), demo('two')])), async (origin, hits) => {
    const r = await fetchShelf(origin);
    assert.equal(r.ok, true);
    assert.deepEqual(r.apps.map((a) => a.id), ['one', 'two']);
    assert.deepEqual(hits, ['/api/shelf']);
  });
});

test('fetchShelf: a non-loopback or https origin is refused BEFORE any request is made', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not be called'); };
  for (const origin of ['http://shelf.example:4400', 'http://192.0.2.1:4400', 'https://127.0.0.1:4400', 'http://127.0.0.1.example', 'http://0.0.0.0:4400', 'http://127.0.0.1:4400/path', 'ftp://127.0.0.1', '', null]) {
    const r = await fetchShelf(origin, { fetchImpl });
    assert.equal(r.ok, false, String(origin));
    assert.equal(r.code, 'bad_origin', String(origin));
  }
  assert.equal(calls, 0);
});

test('fetchShelf: a redirect is refused and NOT followed', async () => {
  await withFakeShelf((_q, res) => { res.end('second server'); }, async (other, otherHits) => {
    await withFakeShelf((_q, res) => { res.writeHead(302, { location: `${other}/api/shelf` }); res.end(); }, async (origin) => {
      const r = await fetchShelf(origin);
      assert.equal(r.ok, false);
      assert.equal(r.code, 'redirect');
    });
    assert.deepEqual(otherHits, [], 'the redirect target was contacted');
  });
});

test('fetchShelf: oversize answers are refused (declared length, and an undeclared stream)', async () => {
  const body = JSON.stringify(shelfDoc([demo('one', { description: 'x'.repeat(250) })]));
  await withFakeShelf(sendJson(body, 200, { 'content-length': String(body.length) }), async (origin) => {
    const r = await fetchShelf(origin, { maxBytes: 200 });
    assert.equal(r.code, 'too_large');
  });
  await withFakeShelf((_q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write(body.slice(0, 100)); res.write(body.slice(100)); res.end(); }, async (origin) => {
    assert.equal((await fetchShelf(origin, { maxBytes: 200 })).code, 'too_large');
    assert.equal((await fetchShelf(origin)).ok, true, 'the same answer is fine under the real cap');
  });
});

test('fetchShelf: bad JSON, bad shape, wrong content type, error status, timeout, nothing listening', async () => {
  await withFakeShelf(sendJson(`{"a":"${CANARY}`), async (origin) => {
    const r = await fetchShelf(origin);
    assert.equal(r.code, 'bad_json');
    assert.ok(!JSON.stringify(r).includes(CANARY));
  });
  await withFakeShelf(sendJson({ schema: 'something-else', note: CANARY, demos: [] }), async (origin) => {
    const r = await fetchShelf(origin);
    assert.equal(r.code, 'bad_shape');
    assert.ok(!JSON.stringify(r).includes(CANARY));
  });
  await withFakeShelf((_q, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<h1>${CANARY}</h1>`); }, async (origin) => {
    const r = await fetchShelf(origin);
    assert.equal(r.code, 'not_json');
    assert.ok(!JSON.stringify(r).includes(CANARY));
  });
  await withFakeShelf(sendJson({ error: CANARY }, 500), async (origin) => {
    const r = await fetchShelf(origin);
    assert.equal(r.code, 'http_status');
    assert.ok(!JSON.stringify(r).includes(CANARY));
  });
  await withFakeShelf(() => { /* never answers */ }, async (origin) => {
    const t0 = Date.now();
    assert.equal((await fetchShelf(origin, { timeoutMs: 200 })).code, 'timeout');
    assert.ok(Date.now() - t0 < 3000);
  });
  const port = await closedPort();
  assert.equal((await fetchShelf(`http://127.0.0.1:${port}`)).code, 'unreachable');
});

test('fetchShelf: skipped entries and dropped links are reported as counts', async () => {
  await withFakeShelf(sendJson(shelfDoc([demo('ok'), demo('bad', { kind: 'Nope' }), demo('nolink', { url: 'javascript:alert(1)' })])), async (origin) => {
    const r = await fetchShelf(origin);
    assert.equal(r.ok, true);
    assert.equal(r.apps.length, 2);
    assert.equal(r.skipped, 1);
    assert.equal(r.linksDropped, 1);
    assert.equal(r.apps.find((a) => a.id === 'nolink').open, null);
  });
});
