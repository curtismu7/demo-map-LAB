import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SHELF_URL, modeFrom, parseSettings, readSettings, realConfig, shelfLinkUrl } from '../src/config.js';
import { rm, tempDir } from './helpers.js';

const OK = { SHELF_URL: 'http://127.0.0.1:4400' };
// The link base is optional now; the legacy name still works.
const WITH_LINK = { ...OK, LINK_BASE_URL: 'https://ai-demo2.example' };
const NOFILE = { file: false };

test('parseSettings keeps only our two names; quotes and comments are handled', () => {
  const s = parseSettings('# c\nLINK_BASE_URL="https://a.example"  \nexport SHELF_URL=http://127.0.0.1:4400 # note\nOTHER=1\nPATH=/bin\n');
  assert.deepEqual(s, { LINK_BASE_URL: 'https://a.example', SHELF_URL: 'http://127.0.0.1:4400' });
  assert.deepEqual(parseSettings(`LINK_BASE_URL=${'x'.repeat(400)}`), {});
  // The legacy name is not a SETTING_NAME: it is folded into LINK_BASE_URL by readSettings.
  assert.deepEqual(parseSettings('AI_DEMO2_URL=https://legacy.example'), {});
});

test('the environment wins over the .env file; unknown names are ignored; the file can be switched off', () => {
  const dir = tempDir({ '.env': 'AI_DEMO2_URL=https://file.example\nSHELF_URL=http://127.0.0.1:1111\nSECRET=nope\n' });
  try {
    const envFile = path.join(dir, '.env');
    assert.deepEqual(readSettings({ AI_DEMO2_URL: 'https://env.example' }, { envFile }), { LINK_BASE_URL: 'https://env.example', SHELF_URL: 'http://127.0.0.1:1111' }, 'the legacy AI_DEMO2_URL name folds into LINK_BASE_URL');
    assert.deepEqual(readSettings({}, { file: false, envFile }), {});
    assert.deepEqual(readSettings({ SECRET: 'x' }, { envFile: '/nonexistent/.env' }), {});
  } finally { rm(dir); }
});

test('Real is configured from the shelf alone; the link base is optional and normalised', () => {
  const c = realConfig({}, NOFILE);
  assert.equal(c.ok, false, 'a clean clone (no settings) is not Real');
  const c2 = realConfig({ SHELF_URL: 'http://127.0.0.1:4400' }, NOFILE);
  assert.deepEqual(c2, { ok: true, shelfOrigin: 'http://127.0.0.1:4400', aiDemo2Base: null });
  assert.equal(realConfig(WITH_LINK, NOFILE).aiDemo2Base, 'https://ai-demo2.example');
  assert.equal(realConfig({ SHELF_URL: 'http://localhost:5000/' }, NOFILE).shelfOrigin, 'http://localhost:5000');
  assert.equal(realConfig({ SHELF_URL: 'http://127.0.0.1:4400', AI_DEMO2_URL: 'https://legacy.example' }, NOFILE).aiDemo2Base, 'https://legacy.example', 'the legacy AI_DEMO2_URL name works');
  assert.equal(realConfig({ SHELF_URL: 'http://127.0.0.1:4400', LINK_BASE_URL: 'https://new.example', AI_DEMO2_URL: 'https://legacy.example' }, NOFILE).aiDemo2Base, 'https://new.example', 'LINK_BASE_URL wins over the legacy name');
});

test('Real is not configured with a bad link base or a non-loopback shelf; hints never echo a value', () => {
  const cases = [
    [{ SHELF_URL: 'http://127.0.0.1:4400', LINK_BASE_URL: 'https://x.example/app' }, /LINK_BASE_URL .*plain origin/],
    [{ SHELF_URL: 'http://127.0.0.1:4400', LINK_BASE_URL: 'https://user:pw@x.example' }, /LINK_BASE_URL/],
    [{ SHELF_URL: 'http://127.0.0.1:4400', LINK_BASE_URL: 'javascript:alert(1)' }, /LINK_BASE_URL/],
    [{ SHELF_URL: 'http://shelf.example:4400' }, /SHELF_URL .*loopback/],
    [{ SHELF_URL: 'https://127.0.0.1:4400' }, /SHELF_URL/],
    [{ SHELF_URL: 'http://127.0.0.1:4400/api/shelf' }, /SHELF_URL/],
  ];
  for (const [env, re] of cases) {
    const c = realConfig(env, NOFILE);
    assert.equal(c.ok, false, JSON.stringify(env));
    assert.match(c.problem, re);
    for (const v of Object.values(env)) assert.ok(!c.problem.includes(v), 'a setting value leaked into the hint');
  }
});

test('Real is off when the server is not bound to loopback (the Docker image), whatever the settings say', () => {
  const c = realConfig({ ...OK, DEMO_MAP_BIND: '0.0.0.0' }, NOFILE);
  assert.equal(c.ok, false);
  assert.match(c.problem, /not bound to loopback/);
  assert.equal(realConfig({ ...OK, DEMO_MAP_BIND: '127.0.0.1' }, NOFILE).ok, true);
});

test('the launch mode: Real when configured, else Mock; MODE forces; MODE=real needs Real; junk is refused', () => {
  assert.equal(modeFrom({}, NOFILE), 'mock');
  assert.equal(modeFrom(OK, NOFILE), 'real');
  assert.equal(modeFrom({ ...OK, MODE: 'mock' }, NOFILE), 'mock');
  assert.equal(modeFrom({ ...OK, MODE: 'real' }, NOFILE), 'real');
  assert.throws(() => modeFrom({ MODE: 'real' }, NOFILE), /MODE=real requested/);
  assert.throws(() => modeFrom({ MODE: 'hosted' }, NOFILE), /not available/);
});

test('the header Shelf link: a valid SHELF_URL origin only, else null', () => {
  assert.equal(shelfLinkUrl({ SHELF_URL: 'https://launcher.example:8443' }, NOFILE), 'https://launcher.example:8443');
  assert.equal(shelfLinkUrl({}, NOFILE), null);
  for (const v of ['javascript:alert(1)', 'https://u:p@x.example', 'https://x.example/path']) assert.equal(shelfLinkUrl({ SHELF_URL: v }, NOFILE), null, v);
});

test('the repo ships .env.example with both names commented and PORT 7808; no .env is committed', () => {
  const ex = fs.readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  assert.match(ex, /^PORT=7808$/m);
  assert.match(ex, /^# LINK_BASE_URL=/m);
  // The legacy name stays documented as a fallback.
  assert.match(ex, /AI_DEMO2_URL/);
  assert.match(ex, /^# SHELF_URL=http:\/\/127\.0\.0\.1:4400$/m);
});
