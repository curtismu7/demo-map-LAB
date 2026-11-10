import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UUID, isLoopbackHost, scanHosts } from '../server/src/safety.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the files the standalone rules ask for a Tool are present', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'LICENSE', 'Dockerfile', 'docker-compose.yml', '.env.example', '.gitignore', '.github/workflows/ci.yml', 'docs/shelf-entry.json', 'docs/safety.md', 'docs/talk-track.md', 'data/rows.json', 'data/sample-shelf.json', 'scripts/doctor.mjs', 'scripts/reset.mjs', 'scripts/run.sh', 'scripts/check-no-ai-attribution.sh', 'scripts/check-ui-standard.sh', 'scripts/standalone-ui.sha256', 'web/src/standalone-ui.css']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
});

test('the README declares the tier on its own line and says it is scaffolded from env-map-LAB', () => {
  const readme = read('README.md');
  assert.match(readme, /^\*\*Tier: Tool\*\*$/m);
  assert.match(readme, /scaffolded from env-map-LAB/i);
});

test('the shelf entry is valid and portable: Tool, port 7808, relative composeFile, health path, no catalogId, tags from the shelf tag list', () => {
  const e = JSON.parse(read('docs/shelf-entry.json')).demos[0];
  assert.equal(e.id, 'demo-map-lab');
  assert.equal(e.name, 'Demo Map');
  assert.equal(e.kind, 'Tool');
  assert.equal(e.healthPath, '/api/health');
  assert.equal(e.url, 'http://localhost:7808');
  assert.equal(e.composeFile, 'demo-map-LAB/docker-compose.yml');
  assert.ok(!path.isAbsolute(e.composeFile));
  assert.ok(!/\/Users\/|\/home\//.test(JSON.stringify(e)), 'no absolute home path');
  assert.equal(e.catalogId, undefined, 'no catalog row matches, so no catalogId');
  assert.deepEqual(e.pingProducts, []);
  assert.ok(e.description.length <= 300, `description is ${e.description.length} characters`);
  assert.ok(Array.isArray(e.tags) && e.tags.length > 0);
  const known = new Set(['learning', 'simulated', 'real']); // the shelf's data/tags.json ids this entry may use
  for (const t of e.tags) assert.ok(known.has(t), t);
});

test('the shelf entry tags exist in the shelf tag list when this checkout sits beside it', (t) => {
  const tagsFile = path.resolve(root, '../demo-shelf-LAB/data/tags.json');
  if (!fs.existsSync(tagsFile)) return t.skip('demo-shelf-LAB is not beside this checkout (CI)');
  const ids = new Set(JSON.parse(fs.readFileSync(tagsFile, 'utf8')).groups.flatMap((g) => g.tags.map((x) => x.id)));
  for (const tag of JSON.parse(read('docs/shelf-entry.json')).demos[0].tags) assert.ok(ids.has(tag), tag);
});

test('CI: GitHub-hosted runners, Node 26 only, gitleaks, forbidden strings, attribution check, UI standard, doctor on 7808', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(ci, /self-hosted/);
  assert.match(ci, /node: \[26\]/);
  assert.match(ci, /gitleaks detect/);
  assert.match(ci, /FORBIDDEN_STRINGS/);
  assert.match(ci, /check-no-ai-attribution\.sh/);
  assert.match(ci, /check-ui-standard\.sh/);
  assert.match(ci, /PORT=7808 npm run doctor/);
});

test('test scripts use a glob, never a directory (Node 22+)', () => {
  assert.equal(JSON.parse(read('server/package.json')).scripts.test, 'node --test test/*.test.js');
  assert.match(JSON.parse(read('package.json')).scripts.test, /node --test scripts\/\*\.test\.mjs/);
});

test('no other app\'s identity is left from the scaffold source', () => {
  const skip = new Set(['node_modules', 'dist', '.git', 'package-lock.json', 'standalone-ui.css']);
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (name === 'repo.test.mjs') continue;
      const t = fs.readFileSync(p, 'utf8');
      // The README and CLAUDE.md are allowed to name the scaffold source once, in its attribution line.
      const body = name === 'README.md' || name === 'CLAUDE.md' ? t.replace(/env-map-LAB/g, '') : t;
      if (/env-map|envmap|ENV_MAP|7805|Where Everything Runs/i.test(body)) hits.push(path.relative(root, p));
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});

test('the app makes no outbound reference: no CDN, no web font, no remote script in the web sources', () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (['node_modules', 'dist'].includes(name)) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (name === 'standalone-ui.css' || /\.test\./.test(name) || !/\.(m?js|jsx|css|html)$/.test(name)) continue;
      if (/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'web'));
  assert.deepEqual(hits, []);
});

test('no file renders HTML from a string (no dangerouslySetInnerHTML, innerHTML, eval or Function) and the UI uses no vm', () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (['node_modules', 'dist'].includes(name)) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(m?js|jsx)$/.test(name) || /\.test\./.test(name)) continue;
      const t = fs.readFileSync(p, 'utf8');
      if (/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(|node:vm/.test(t)) hits.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'web/src')); walk(path.join(root, 'server/src')); walk(path.join(root, 'scripts'));
  assert.deepEqual(hits, []);
});

test('real mode contacts one origin: the only network call in server/src is the shelf fetch, and it is redirect-manual', () => {
  const calls = [];
  for (const f of fs.readdirSync(path.join(root, 'server/src'))) {
    if (f === 'netguard.js') continue;
    const t = read(`server/src/${f}`);
    if (/\bfetch\(|fetchImpl\(|http\.request|https\.request|net\.connect|WebSocket/.test(t.replace(/\/\/.*$/gm, ''))) calls.push(f);
  }
  assert.deepEqual(calls, ['shelf.js']);
  assert.match(read('server/src/shelf.js'), /redirect: 'manual'/);
});

test('no shipped text carries a non-reserved host, a real-looking UUID or an AI-attribution credit', () => {
  const skip = new Set(['node_modules', 'dist', '.git', 'package-lock.json', 'coverage']);
  const hits = [];
  const credit = /[G]enerated with \[?[C]laude Code|[C]o-[A]uthored-[B]y:/i;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (name === 'check-no-ai-attribution.sh' || name === 'repo.test.mjs') continue;
      const t = fs.readFileSync(p, 'utf8');
      const rel = path.relative(root, p);
      if (credit.test(t)) hits.push(`${rel}: attribution`);
      if (UUID.test(t) && !/\.test\.(m?js|jsx)$/.test(name)) hits.push(`${rel}: uuid`);
      if (/\.(md|ya?ml)$/.test(name) || name.endsWith('.json') || name === '.env.example') {
        const bad = scanHosts(t).map((h) => h.replace(/[`'")\]}]+$/, '').replace(/:\d+$/, '')).filter((h) => !/^(github\.com|registry\.npmjs\.org|local\.ping-devops\.com|demo-map-lab\.local\.ping-devops\.com)$/.test(h) && !isLoopbackHost(h) && h !== '0.0.0.0');
        if (bad.length) hits.push(`${rel}: ${bad.join(', ')}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});

test('the attribution check script passes on this tree', () => {
  // The script needs a git repository; a source tarball without .git is out of scope.
  if (!fs.existsSync(path.join(root, '.git'))) return;
  execFileSync('bash', [path.join(root, 'scripts/check-no-ai-attribution.sh')], { cwd: root, stdio: 'pipe' });
});
