// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a setting's value, needs no network.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }.
import fs from 'node:fs';
import { assertBindAllowed, bindHost, portProblem, scanHosts, DEFAULT_PORT, UUID } from './safety.js';
import { netguardSelfTest } from './netguard.js';
import { modeFrom, realConfig } from './config.js';
import { MOCK_FILE, ROWS_FILE, loadMockShelf } from './source.js';
import { loadRowsFile } from './rows.js';
import { buildMap } from './view.js';

export async function runChecks({ env = process.env, mockFile = MOCK_FILE, rowsFile = ROWS_FILE } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20 ? 'pass' : 'fail', `v${process.versions.node} (need >= 20; Node 26 is the CI and Docker version)`);

  const cfg = realConfig(env);
  try { add('mode', 'pass', `mode=${modeFrom(env)}${cfg.ok ? ' (Real configured)' : ' (Mock only)'}`); } catch (e) { add('mode', 'fail', e.message); }
  add('real-settings', 'info', cfg.ok ? 'Real is configured: AI_DEMO2_URL is a plain origin and the shelf is on loopback (values not shown)' : cfg.problem);

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.DEMO_MAP_BIND ? ' (DEMO_MAP_BIND opt-in; Real is off)' : ' (loopback)'}`); } catch (e) { add('bind', 'fail', e.message); }
  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  const problem = portProblem(port);
  add('port', problem ? 'fail' : 'pass', problem || `${port} is this app's one allocated port`);

  const rows = loadRowsFile(rowsFile);
  if (!rows.ok) add('rows', 'fail', `data/rows.json does not validate: ${rows.problems.slice(0, 3).join('; ')}`);
  else add('rows', 'pass', `${rows.rows.length} rows, ${rows.rows.reduce((n, r) => n + r.pages.length, 0)} AI-DEMO2 page links`);

  // The shipped (Mock) sample shelf: validates, builds against the rows, names only reserved hosts, carries no UUID.
  const mock = loadMockShelf(mockFile);
  if (!mock.ok) add('mock-shelf', 'fail', `data/sample-shelf.json does not validate: ${mock.problems.slice(0, 3).join('; ')}`);
  else {
    if (rows.ok) {
      const m = buildMap(rows.rows, mock.apps, 'https://ai-demo2.example');
      add('mock-shelf', mock.skipped ? 'fail' : 'pass', mock.skipped ? `${mock.skipped} sample entries were skipped` : `${m.counts.apps} sample apps in ${m.counts.rows} rows, ${m.counts.unmatched} under More apps`);
    }
    const text = fs.readFileSync(mockFile, 'utf8');
    const dirty = scanHosts(text).length || UUID.test(text);
    add('sanitized', dirty ? 'fail' : 'pass', dirty ? 'the sample shelf names a real-looking host or carries a UUID' : 'the sample shelf names only .example/.invalid hosts and carries no UUID');
  }

  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect (${ng.blocked}/7)` : ng.detail);
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
