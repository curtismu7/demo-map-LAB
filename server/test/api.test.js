import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { installNetguard } from '../src/netguard.js';
import { ROWS_FILE } from '../src/source.js';
import { closedPort, demo, get, getJson, post, rawHttp, rm, sendJson, shelfDoc, tempDir, withFakeShelf, withServer } from './helpers.js';

const CANARY = 'CANARY-5be0';
const realEnv = (origin, extra = {}) => ({ AI_DEMO2_URL: 'https://ai-demo2.example', SHELF_URL: origin, ...extra });

test('GET /api/health is demo-health/1, GET only, no extra fields', async () => {
  await withServer(async (url) => {
    const r = await get(url, '/api/health');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const j = await r.json();
    assert.deepEqual(Object.keys(j).sort(), ['at', 'demo', 'runtime', 'schema', 'state']);
    assert.equal(j.schema, 'demo-health/1');
    assert.equal(j.state, 'ready');
    assert.equal(j.runtime, 'offline');
    assert.ok(!Number.isNaN(Date.parse(j.at)));
    assert.deepEqual(Object.keys(j.demo).sort(), ['id', 'name', 'version']);
    assert.equal(j.demo.id, 'demo-map-lab');
    assert.equal(j.demo.name, 'Demo Map');
    assert.match(j.demo.version, /^\d+\.\d+\.\d+$/);
    assert.ok(j.demo.name.length <= 80 && j.demo.version.length <= 32);
    assert.ok(JSON.stringify(j).length < 4096);
    const w = await post(url, '/api/health', {});
    assert.equal(w.status, 405);
    assert.equal(w.headers.get('allow'), 'GET');
  });
});

test('GET /api/info in Mock: mode, source, realAvailable false with a reason that names the setting but not a value', async () => {
  await withServer(async (url) => {
    const i = await getJson(url, '/api/info');
    assert.equal(i.mode, 'mock');
    assert.equal(i.source, 'mock');
    assert.equal(i.simulated, true);
    assert.equal(i.realAvailable, false);
    assert.match(i.realReason, /AI_DEMO2_URL is not set/);
    assert.match(i.contentLabel, /made-up sample shelf/);
  });
});

test('GET /api/map in Mock: the rows from data/rows.json plus More apps, built from the made-up sample', async () => {
  await withServer(async (url) => {
    const m = await getJson(url, '/api/map');
    assert.equal(m.source, 'mock');
    assert.equal(m.aiDemo2Base, 'https://ai-demo2.example');
    const defined = JSON.parse(fs.readFileSync(ROWS_FILE, 'utf8')).rows.map((r) => r.id);
    assert.deepEqual(m.rows.map((r) => r.id), [...defined, 'more-apps']);
    assert.ok(defined.length >= 8);
    assert.ok(defined.includes('authorize') && defined.includes('protect'));
    const n = defined.length;
    for (const r of m.rows.slice(0, n)) assert.ok(r.count >= 2, `${r.id} has at least 2 sample apps`);
    for (const [id, tag] of [['authorize', 'pingone-authorize'], ['protect', 'pingone-protect']]) {
      const apps = m.rows.find((r) => r.id === id).apps;
      assert.ok(apps.length >= 2 && apps.every((x) => x.tags.includes(tag)), `${id}: at least 2 sample apps, matched by the ${tag} tag`);
    }
    assert.equal(m.rows[n].count, 2);
    assert.deepEqual(m.rows[n].pages, []);
    assert.deepEqual(m.counts, { rows: n + 1, apps: 18, matched: 16, unmatched: 2, running: m.counts.running });
    assert.ok(m.counts.running > 0);
    const rowsOf = (id) => m.rows.filter((r) => r.apps.some((a) => a.id === id)).map((r) => r.id);
    assert.deepEqual(rowsOf('sample-gateway-claims'), ['pinggateway', 'authorize'], 'one app sits in two rows');
    for (const r of m.rows.slice(0, n)) for (const p of r.pages) assert.match(p.href, /^https:\/\/ai-demo2\.example\/[^/]/, 'page link = base + path');
    const file = JSON.parse(fs.readFileSync(ROWS_FILE, 'utf8')).rows[0];
    assert.deepEqual(m.rows[0].pages[0], { label: file.pages[0].label, href: `https://ai-demo2.example${file.pages[0].path}` });
    assert.deepEqual(m.warnings, []);
  });
});

test('Mock ignores AI_DEMO2_URL: the page links keep the placeholder base', async () => {
  await withServer(async (url) => {
    const m = await getJson(url, '/api/map');
    assert.equal(m.aiDemo2Base, 'https://ai-demo2.example');
  }, { env: { AI_DEMO2_URL: 'https://other.example', MODE: 'mock' } });
});

test('GET /api/map reports a rows file that does not validate (422, positions only)', async () => {
  const dir = tempDir({ 'rows.json': JSON.stringify({ schema: 'demo-map-rows/1', rows: [{ id: 'BAD', title: CANARY }] }) });
  try {
    await withServer(async (url) => {
      const r = await get(url, '/api/map');
      assert.equal(r.status, 422);
      const j = await r.json();
      assert.equal(j.error, 'rows_invalid');
      assert.match(j.problems[0], /rows\[0\]\.id/);
      assert.ok(!JSON.stringify(j).includes(CANARY));
    }, { rowsFile: `${dir}/rows.json` });
  } finally { rm(dir); }
});

test('the mode switch: both directions, 409 when Real is not configured, exact body only (rule 19)', async () => {
  await withFakeShelf(sendJson(shelfDoc([demo('one')])), async (origin) => {
    await withServer(async (url) => {
      assert.equal((await getJson(url, '/api/info')).source, 'real', 'the default is Real when configured');
      assert.deepEqual(await (await post(url, '/api/mode', { source: 'mock' })).json(), { source: 'mock' });
      assert.equal((await getJson(url, '/api/info')).source, 'mock');
      assert.equal((await getJson(url, '/api/map')).source, 'mock');
      assert.deepEqual(await (await post(url, '/api/mode', { source: 'real' })).json(), { source: 'real' });
      const m = await getJson(url, '/api/map');
      assert.equal(m.source, 'real');
      assert.equal((await getJson(url, '/api/health')).runtime, 'live');
      for (const body of [{}, { source: 'hosted' }, { source: 'mock', extra: 1 }, [], 'x', null, { source: ['mock'] }]) {
        assert.equal((await post(url, '/api/mode', body)).status, 400, JSON.stringify(body));
      }
      assert.equal((await post(url, '/api/mode', '{nope')).status, 400);
      assert.equal((await post(url, '/api/reset', {})).status, 200);
      assert.equal((await getJson(url, '/api/info')).source, 'real', 'reset returns to the launch mode');
    }, { env: realEnv(origin) });
  });
  await withServer(async (url) => {
    const r = await post(url, '/api/mode', { source: 'real' });
    assert.equal(r.status, 409);
    const j = await r.json();
    assert.equal(j.error, 'real_not_configured');
    assert.match(j.detail, /AI_DEMO2_URL/);
    assert.equal((await getJson(url, '/api/info')).source, 'mock');
  });
});

test('Real: apps come from the local shelf, the page links use AI_DEMO2_URL, unsafe links are dropped, the shelf is asked once per map', async () => {
  const shelf = shelfDoc([
    demo('sample-personal-agent-demo', { status: { state: 'ready' }, proxyUrl: 'https://launcher.example:8443/p/' }),
    demo('hostile', { name: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', tags: ['pingone'], url: 'javascript:alert(1)' }),
    demo('broken', { kind: 'Nope' }),
  ]);
  await withFakeShelf(sendJson(shelf), async (origin, hits) => {
    await withServer(async (url) => {
      const i = await getJson(url, '/api/info');
      assert.equal(i.source, 'real');
      assert.equal(i.realAvailable, true);
      assert.equal(i.realReason, null);
      const m = await getJson(url, '/api/map');
      assert.equal(m.source, 'real');
      assert.equal(m.aiDemo2Base, 'https://real-ai-demo2.example');
      assert.deepEqual(hits, ['/api/shelf']);
      assert.equal(m.rows[0].apps[0].open, 'https://launcher.example:8443/p/');
      assert.equal(m.rows[0].apps[0].running, 'running');
      assert.equal(m.rows[0].pages[0].href, `https://real-ai-demo2.example${JSON.parse(fs.readFileSync(ROWS_FILE, 'utf8')).rows[0].pages[0].path}`);
      const hostile = m.rows.find((r) => r.id === 'pingone').apps[0];
      assert.equal(hostile.open, null);
      assert.equal(hostile.name, '<img src=x onerror=alert(1)>', 'text is data: kept as text for the UI to render inertly');
      assert.equal(m.warnings.length, 2);
      assert.match(m.warnings.join(' '), /1 shelf entry was skipped/);
      assert.match(m.warnings.join(' '), /no usable Open link/);
      assert.ok(!JSON.stringify(m.warnings).includes('Nope'));
    }, { env: realEnv(origin, { AI_DEMO2_URL: 'https://real-ai-demo2.example' }) });
  });
});

test('Real with the shelf unreachable: a clear 502 message, no rows, and never the Mock data as if it were Real', async () => {
  const port = await closedPort();
  await withServer(async (url) => {
    const r = await get(url, '/api/map');
    assert.equal(r.status, 502);
    const j = await r.json();
    assert.equal(j.error, 'shelf_unavailable');
    assert.equal(j.code, 'unreachable');
    assert.equal(j.source, 'real');
    assert.match(j.detail, /did not answer/);
    assert.equal(j.rows, undefined);
    assert.ok(!JSON.stringify(j).includes(String(port)), 'the address is not echoed');
    assert.equal((await getJson(url, '/api/info')).source, 'real', 'still Real: it did not silently switch to Mock');
  }, { env: realEnv(`http://127.0.0.1:${port}`) });
});

test('Real with a hostile shelf answer: bad shape is a 502 with fixed text, nothing fetched is echoed', async () => {
  await withFakeShelf(sendJson({ schema: CANARY, demos: 'x' }), async (origin) => {
    await withServer(async (url) => {
      const r = await get(url, '/api/map');
      assert.equal(r.status, 502);
      const text = await r.text();
      assert.ok(!text.includes(CANARY));
      assert.equal(JSON.parse(text).code, 'bad_shape');
    }, { env: realEnv(origin) });
  });
});

test('Real with a non-loopback SHELF_URL is not available: the toggle is refused and nothing is contacted', async () => {
  const guard = installNetguard();
  try {
    await withServer(async (url) => {
      const i = await getJson(url, '/api/info');
      assert.equal(i.realAvailable, false);
      assert.match(i.realReason, /SHELF_URL .*loopback/);
      assert.equal((await post(url, '/api/mode', { source: 'real' })).status, 409);
      assert.equal((await getJson(url, '/api/map')).source, 'mock');
    }, { env: { AI_DEMO2_URL: 'https://ai-demo2.example', SHELF_URL: 'http://shelf.example:4400' } });
    assert.deepEqual(guard.attempts, []);
  } finally { guard.restore(); }
});

test('Real that loses its setting falls back to Mock instead of serving nothing', async () => {
  await withFakeShelf(sendJson(shelfDoc([demo('one')])), async (origin) => {
    const env = realEnv(origin);
    await withServer(async (url) => {
      assert.equal((await getJson(url, '/api/map')).source, 'real');
      delete env.AI_DEMO2_URL;
      const m = await getJson(url, '/api/map');
      assert.equal(m.source, 'mock');
    }, { env });
  });
});

test('netguard: zero outbound attempts across every Mock endpoint and the Real fetch (loopback is not outbound)', async () => {
  const guard = installNetguard();
  try {
    await withServer(async (url) => {
      for (const p of ['/api/health', '/api/info', '/api/map', '/api/shelf']) assert.equal((await get(url, p)).status, 200, p);
      await post(url, '/api/mode', { source: 'mock' });
      await post(url, '/api/reset', {});
    });
    assert.deepEqual(guard.attempts, [], 'Mock made an outbound attempt');
    await withFakeShelf(sendJson(shelfDoc([demo('one')])), async (origin) => {
      await withServer(async (url) => { assert.equal((await get(url, '/api/map')).status, 200); }, { env: realEnv(origin) });
    });
    assert.deepEqual(guard.attempts, [], 'Real reached beyond loopback');
  } finally { guard.restore(); }
});

test('GET /api/shelf (the header link): the SHELF_URL origin, else null', async () => {
  await withServer(async (url) => { assert.deepEqual(await getJson(url, '/api/shelf'), { shelfUrl: null }); });
  await withServer(async (url) => { assert.deepEqual(await getJson(url, '/api/shelf'), { shelfUrl: 'https://launcher.example:8443' }); }, { env: { SHELF_URL: 'https://launcher.example:8443' } });
});

test('Host check: a non-loopback Host is refused with JSON; loopback names work', async () => {
  await withServer(async (url) => {
    const port = new URL(url).port;
    for (const host of ['evil.example', `evil.example:${port}`, '192.0.2.1', 'localhost.evil.example']) {
      const r = await rawHttp(`${url}/api/health`, { headers: { host } });
      assert.equal(r.status, 403, host);
      assert.match(r.text, /bad_host/);
    }
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) assert.equal((await rawHttp(`${url}/api/health`, { headers: { host } })).status, 200, host);
  });
});

test('same-origin writes: a cross-origin Origin or Sec-Fetch-Site is refused; no change is made', async () => {
  await withServer(async (url) => {
    const bad = [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }];
    for (const h of bad) {
      assert.equal((await post(url, '/api/mode', { source: 'mock' }, h)).status, 403, JSON.stringify(h));
      assert.equal((await post(url, '/api/reset', {}, h)).status, 403);
    }
    assert.equal((await post(url, '/api/mode', { source: 'mock' }, { 'sec-fetch-site': 'same-origin' })).status, 200);
  });
});

test('errors are short JSON, never an HTML stack; unknown API paths are 404 JSON; oversize bodies are 413', async () => {
  await withServer(async (url) => {
    const nf = await get(url, '/api/nope');
    assert.equal(nf.status, 404);
    assert.deepEqual(await nf.json(), { error: 'not_found' });
    const big = await post(url, '/api/mode', { source: 'mock', pad: 'x'.repeat(10_000) });
    assert.equal(big.status, 413);
    assert.deepEqual(await big.json(), { error: 'payload_too_large' });
    const r = await get(url, '/api/map');
    const h = r.headers;
    assert.equal(h.get('x-content-type-options'), 'nosniff');
    assert.equal(h.get('x-frame-options'), 'DENY');
    assert.match(h.get('content-security-policy'), /script-src 'self'/);
    assert.equal(h.get('x-powered-by'), null);
  });
});

test('the real rows file is the default source of truth (ROWS_FILE is data/rows.json)', () => {
  assert.match(ROWS_FILE, /data[\\/]rows\.json$/);
});
