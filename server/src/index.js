import { installNetguard } from './netguard.js';
import { startHttpServer, createApp } from './app.js';
import { allPassed, runChecks } from './doctor.js';
import { allowedExtraHosts, assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { modeFrom, realConfig } from './config.js';

allowedExtraHosts(); // a malformed LAB_ALLOWED_HOSTS stops the start before any socket or timer

installNetguard(); // before anything else can open a socket

const checks = await runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[demo-map] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
console.log(`[demo-map] starting in ${modeFrom()} mode`);
const host = assertBindAllowed(bindHost(), process.env);
const { url } = await startHttpServer({ port: resolvePort(), host, app: createApp() });
console.log(`[demo-map] at ${url} (${realConfig().ok ? 'Real available: the local shelf, loopback only, read-only' : 'Mock only: the made-up sample shelf'}; no other outbound network)`);
console.log(`[demo-map] health: ${url}api/health`);
