import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SHELF_URL, modeFrom, parseSettings, readSettings, realConfig, shelfLinkUrl } from '../src/config.js';
import { rm, tempDir } from './helpers.js';

const OK = { AI_DEMO2_URL: 'https://ai-demo2.example' };
const NOFILE = { file: false };

test('parseSettings keeps only our two names; quotes and comments are handled', () => {
  const s = parseSettings('# c\nAI_DEMO2_URL="https://a.example"  \nexport SHELF_URL=http://127.0.0.1:4400 # note\nOTHER=1\nPATH=/bin\n');
  assert.deepEqual(s, { AI_DEMO2_URL: 'https://a.example', SHELF_URL: 'http://127.0.0.1:4400' });
  assert.deepEqual(parseSettings(`AI_DEMO2_URL=${'x'.repeat(400)}`), {});
});

test('the environment wins over the .env file; unknown names are ignored; the file can be switched off', () => {
  const dir = tempDir({ '.env': 'AI_DEMO2_URL=https://file.example\nSHELF_URL=http://127.0.0.1:1111\nSECRET=nope\n' });
  try {
    const envFile = path.join(dir, '.env');
    assert.deepEqual(readSettings({ AI_DEMO2_URL: 'https://env.example' }, { envFile }), { AI_DEMO2_URL: 'https://env.example', SHELF_URL: 'http://127.0.0.1:1111' });
    assert.deepEqual(readSettings({}, { file: false, envFile }), {});
    assert.deepEqual(readSettings({ SECRET: 'x' }, { envFile: '/nonexistent/.env' }), {});
  } finally { rm(dir); }
});

test('Real is configured with AI_DEMO2_URL; the shelf defaults to 127.0.0.1:4400 and is normalised', () => {
  const c = realConfig(OK, NOFILE);
  assert.deepEqual(c, { ok: true, shelfOrigin: new URL(DEFAULT_SHELF_URL).origin, aiDemo2Base: 'https://ai-demo2.example' });
  assert.equal(realConfig({ ...OK, SHELF_URL: 'http://localhost:5000/' }, NOFILE).shelfOrigin, 'http://localhost:5000');
});

test('Real is not configured without AI_DEMO2_URL, with a bad one, or with a non-loopback shelf; hints never echo a value', () => {
  const cases = [
    [{}, /AI_DEMO2_URL is not set/],
    [{ AI_DEMO2_URL: 'https://x.example/app' }, /AI_DEMO2_URL .*plain origin/],
    [{ AI_DEMO2_URL: 'https://user:pw@x.example' }, /AI_DEMO2_URL/],
    [{ AI_DEMO2_URL: 'javascript:alert(1)' }, /AI_DEMO2_URL/],
    [{ ...OK, SHELF_URL: 'http://shelf.example:4400' }, /SHELF_URL .*loopback/],
    [{ ...OK, SHELF_URL: 'https://127.0.0.1:4400' }, /SHELF_URL/],
    [{ ...OK, SHELF_URL: 'http://127.0.0.1:4400/api/shelf' }, /SHELF_URL/],
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
  assert.match(ex, /^# AI_DEMO2_URL=/m);
  assert.match(ex, /^# SHELF_URL=http:\/\/127\.0\.0\.1:4400$/m);
});
