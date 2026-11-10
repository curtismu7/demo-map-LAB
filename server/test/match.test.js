import assert from 'node:assert/strict';
import test from 'node:test';
import { MORE_ID, appMatches, matchRows } from '../src/match.js';
import { buildMap } from '../src/view.js';

const app = (id, over = {}) => ({ id, name: id.toUpperCase(), kind: 'Demo', description: '', tags: [], products: [], open: null, running: null, ...over });
const row = (id, match = {}, pages = []) => ({ id, title: id, summary: '', match: { ids: [], tags: [], pingProducts: [], ...match }, pages });

test('ids: equal, or the app id contains the entry; case-insensitive', () => {
  const m = { ids: ['muse', 'worker-demo'], tags: [], pingProducts: [] };
  assert.equal(appMatches(app('muse'), m), true);
  assert.equal(appMatches(app('MUSE'), m), true);
  assert.equal(appMatches(app('my-muse-lab'), m), true);
  assert.equal(appMatches(app('digital-worker-demo'), m), true);
  assert.equal(appMatches(app('mus'), m), false, 'an entry must be inside the id, not the other way round');
  assert.equal(appMatches(app('worker'), m), false);
});

test('tags and pingProducts match case-insensitively, whole entries only', () => {
  const m = { ids: [], tags: ['pingone'], pingProducts: ['pinggateway'] };
  assert.equal(appMatches(app('a', { tags: ['PingOne'] }), m), true);
  assert.equal(appMatches(app('a', { tags: ['ping'] }), m), false, 'tags are not substring-matched');
  assert.equal(appMatches(app('a', { tags: ['pingone-privilege'] }), m), false);
  assert.equal(appMatches(app('a', { products: ['PingGateway'] }), m), true);
  assert.equal(appMatches(app('a', { products: ['pinggateway-x'] }), m), false);
  assert.equal(appMatches(app('a', { tags: ['pinggateway'] }), m), false, 'a tag does not satisfy a pingProducts entry');
});

test('empty match lists match nothing; an empty entry never matches every id', () => {
  assert.equal(appMatches(app('anything', { tags: ['x'], products: ['y'] }), { ids: [], tags: [], pingProducts: [] }), false);
  assert.equal(appMatches(app('anything'), { ids: [''], tags: [], pingProducts: [] }), false);
});

test('an app that matches two rows appears in both; the rest of the apps stay where they belong', () => {
  const rows = [row('r1', { tags: ['t1'] }), row('r2', { tags: ['t2'] }), row('r3', { ids: ['zzz'] })];
  const apps = [app('both', { tags: ['t1', 't2'] }), app('only1', { tags: ['t1'] }), app('only2', { tags: ['t2'] })];
  const { rows: out, unmatched } = matchRows(rows, apps);
  assert.deepEqual(out.map((r) => r.apps.map((a) => a.id)), [['both', 'only1'], ['both', 'only2'], []]);
  assert.deepEqual(unmatched, []);
});

test('apps matching no row are returned as unmatched; rows are sorted by app name', () => {
  const rows = [row('r1', { tags: ['t1'] })];
  const apps = [app('zeta', { tags: ['t1'] }), app('alpha', { tags: ['t1'] }), app('lost-b'), app('lost-a')];
  const { rows: out, unmatched } = matchRows(rows, apps);
  assert.deepEqual(out[0].apps.map((a) => a.id), ['alpha', 'zeta']);
  assert.deepEqual(unmatched.map((a) => a.id), ['lost-a', 'lost-b']);
});

test('buildMap: a final "More apps" row only when something is unmatched; counts add up; page links are base + path', () => {
  const rows = [row('r1', { tags: ['t1'] }, [{ label: 'Page', path: '/p?x=1' }]), row('r2', { tags: ['t2'] })];
  const apps = [app('a', { tags: ['t1', 't2'], running: 'running' }), app('b', { tags: ['t2'] }), app('c')];
  const m = buildMap(rows, apps, 'https://base.example');
  assert.deepEqual(m.rows.map((r) => r.id), ['r1', 'r2', MORE_ID]);
  assert.deepEqual(m.rows.map((r) => r.count), [1, 2, 1]);
  assert.deepEqual(m.rows[0].pages, [{ label: 'Page', href: 'https://base.example/p?x=1' }]);
  assert.equal(m.rows[2].title, 'More apps');
  assert.deepEqual(m.rows[2].pages, []);
  assert.deepEqual(m.counts, { rows: 3, apps: 3, matched: 2, unmatched: 1, running: 1 });
  const none = buildMap(rows, [app('a', { tags: ['t1'] })], 'https://base.example');
  assert.deepEqual(none.rows.map((r) => r.id), ['r1', 'r2']);
});
