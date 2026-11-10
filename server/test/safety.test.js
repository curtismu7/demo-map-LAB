import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DEFAULT_PORT, UUID, assertBindAllowed, bindHost, cleanText, isLoopbackHost, portProblem, resolvePort, scanHosts } from '../src/safety.js';
import { MOCK_FILE, ROWS_FILE } from '../src/source.js';

test('loopback names: 127.x, localhost and ::1 only', () => {
  for (const h of ['127.0.0.1', '127.255.0.3', 'localhost', 'LOCALHOST', '::1', '[::1]']) assert.equal(isLoopbackHost(h), true, h);
  for (const h of ['0.0.0.0', '128.0.0.1', '127.0.0.1.example', 'localhost.example', '192.0.2.1', '', '::', '127.0.0']) assert.equal(isLoopbackHost(h), false, h);
});

test('bind: loopback by default; anything else needs DEMO_MAP_BIND on purpose', () => {
  assert.equal(bindHost({}), '127.0.0.1');
  assert.equal(assertBindAllowed('127.0.0.1', {}), '127.0.0.1');
  assert.throws(() => assertBindAllowed('0.0.0.0', {}), /loopback only/);
  assert.equal(assertBindAllowed('0.0.0.0', { DEMO_MAP_BIND: '0.0.0.0' }), '0.0.0.0');
});

test('the one port is 7808; reserved ports and other ports are refused', () => {
  assert.equal(DEFAULT_PORT, 7808);
  assert.equal(resolvePort({}), 7808);
  assert.equal(resolvePort({ PORT: '7808' }), 7808);
  for (const p of [8080, 5173, 3900, 4000, 4400, 4510, 4600, 4601, 4840, 7809, 0]) assert.ok(portProblem(p), String(p));
  assert.ok(portProblem(1.5) && portProblem(NaN));
  assert.throws(() => resolvePort({ PORT: '4400' }), /reserved/);
});

test('cleanText strips control and bidi characters and caps the length', () => {
  assert.equal(cleanText('a\u0000b‮c​d'), 'a b c d');
  assert.equal(cleanText('x'.repeat(500), 10), 'xxxxxxxxxx');
  assert.equal(cleanText(null), '');
});

test('scanHosts finds non-reserved hosts, IPs and e-mail domains; .example, .invalid and loopback are clean', () => {
  assert.deepEqual(scanHosts('see https://a.example/x and http://127.0.0.1:1 and http://b.invalid'), []);
  assert.deepEqual(scanHosts('http://real.corp.net/x'), ['real.corp.net']);
  assert.deepEqual(scanHosts('10.1.2.3'), ['10.1.2.3']);
  assert.deepEqual(scanHosts('me@real.corp.net'), ['real.corp.net']);
});

test('the shipped data files name only reserved hosts, no UUID, no e-mail address, no @mention', () => {
  for (const f of [MOCK_FILE, ROWS_FILE]) {
    const text = fs.readFileSync(f, 'utf8');
    assert.deepEqual(scanHosts(text), [], f);
    assert.equal(UUID.test(text), false, f);
    assert.equal(/@/.test(text), false, f);
  }
});
