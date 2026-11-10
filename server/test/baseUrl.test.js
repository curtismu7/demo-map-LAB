import assert from 'node:assert/strict';
import test from 'node:test';
import { pageHref, parseOrigin } from '../src/baseUrl.js';

test('a plain http(s) origin is accepted and normalised (default port and trailing slash dropped)', () => {
  assert.deepEqual(parseOrigin('https://ai-demo2.example'), { ok: true, origin: 'https://ai-demo2.example' });
  assert.deepEqual(parseOrigin(' https://ai-demo2.example/ '), { ok: true, origin: 'https://ai-demo2.example' });
  assert.deepEqual(parseOrigin('http://host.example:8443'), { ok: true, origin: 'http://host.example:8443' });
  assert.deepEqual(parseOrigin('HTTPS://Host.Example:443'), { ok: true, origin: 'https://host.example' });
});

test('a path, query, fragment, credentials, other scheme, junk or empty value is refused', () => {
  for (const v of ['https://x.example/app', 'https://x.example/app/', 'https://x.example?a=1', 'https://x.example#f', 'https://user:pw@x.example', 'https://user@x.example',
    'ftp://x.example', 'javascript:alert(1)', 'x.example', '//x.example', 'https://', 'https://x .example', 'https://x.example\\evil', 'https://x.exa\nmple', '', '   ', null, undefined, 5, {}, `https://${'a'.repeat(300)}.example`]) {
    const r = parseOrigin(v);
    assert.equal(r.ok, false, String(v).slice(0, 40));
    assert.ok(typeof r.problem === 'string' && !r.problem.includes('x.example'), 'problem must not echo the value');
  }
});

test('loopbackOnly: http on 127.0.0.1, localhost or [::1] only', () => {
  for (const v of ['http://127.0.0.1:4400', 'http://localhost:4400', 'http://[::1]:4400', 'http://127.0.0.2:1']) assert.equal(parseOrigin(v, { loopbackOnly: true }).ok, true, v);
  for (const v of ['https://127.0.0.1:4400', 'http://192.0.2.1:4400', 'http://shelf.example:4400', 'http://127.0.0.1.example:4400', 'http://0.0.0.0:4400', 'http://localhost.example', 'http://[::2]:4400', 'http://2130706433:4400x']) assert.equal(parseOrigin(v, { loopbackOnly: true }).ok, false, v);
  assert.equal(parseOrigin('https://shelf.example').ok, true, 'without loopbackOnly any host is fine');
});

test('pageHref is origin + path', () => {
  assert.equal(pageHref('https://b.example', '/a/b?x=1'), 'https://b.example/a/b?x=1');
});
