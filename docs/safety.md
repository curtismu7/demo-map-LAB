# Safety

What Demo Map does to stay safe, and the test that pins each part.

| Risk | Defence | Test |
| --- | --- | --- |
| Reached from another machine | Binds `127.0.0.1` unless `DEMO_MAP_BIND` is set; Docker publishes `127.0.0.1:7808` only, one port | `server/test/safety.test.js`, `scripts/compose.test.mjs` |
| DNS rebinding | Host must be loopback or on `LAB_ALLOWED_HOSTS` | `server/test/api.test.js` (Host check), `server/test/launcher.test.js` |
| Cross-site mode switch or reset | Writes must be same-origin (`Origin`, `Sec-Fetch-Site`) | `server/test/api.test.js` |
| Real mode talking to anything but the local shelf | The one fetch is `GET <SHELF_URL>/api/shelf`; `SHELF_URL` must be an `http` loopback origin (no path, no credentials), checked before every request; no redirects (`redirect: 'manual'`, a 3xx is refused and not followed); 5 s timeout; 2 MB cap enforced while streaming; `application/json` only | `server/test/shelf.test.js` (fetchShelf), `server/test/config.test.js`, `scripts/repo.test.mjs` (the only network call is in `shelf.js`) |
| Real mode inside the container | Real is refused when the bind is not loopback (the Docker image); Docker is Mock only | `server/test/config.test.js`, `scripts/compose.test.mjs` |
| Hostile shelf answer | Bounded parse (size cap, iterative depth check), fixed-shape walk into fresh objects (no `__proto__` merge), caps on every list, text cleaned of control and bidi characters and length-capped, problems are positions and fixed sentences, never fetched text | `server/test/shelf.test.js`, `server/test/api.test.js` |
| Hostile row definitions | `data/rows.json` is parsed the same way (64 KB, depth 8, 30 rows, 40 pages a row, 100 match entries); page paths must be one `/`-rooted path | `server/test/rows.test.js` |
| Script or markup in a name or description | All text is rendered as React text; no `innerHTML`; strict CSP (`script-src 'self'`) | `web/src/App.test.jsx` (hostile shelf), `scripts/repo.test.mjs` |
| A `javascript:` or `data:` Open link | Only plain `http(s)` URLs without credentials survive the server check, and the UI checks again; links carry `rel="noopener noreferrer"` and open in a new tab | `server/test/shelf.test.js` (safeLink), `web/src/App.test.jsx`, `web/src/lib/filter.test.js` |
| A bad AI-DEMO2 base | `AI_DEMO2_URL` must be a plain `http(s)` origin: no path, query, fragment or credentials | `server/test/baseUrl.test.js` |
| Outbound calls | Netguard refuses every non-loopback socket, DNS lookup, fetch and UDP send; Mock makes no call at all; no CDN, no web font | `server/test/netguard.test.js`, the zero-attempt tests in `server/test/api.test.js` and `web/src/App.test.jsx`, `scripts/repo.test.mjs` |
| Settings leaking | Settings come from this app's own `.env` (gitignored) or the environment; hints never echo a value; nothing fetched is logged | `server/test/config.test.js`, `server/test/api.test.js` |
| Unsanitized sample | The doctor and tests reject non-reserved hosts, UUIDs and e-mail addresses in `data/sample-shelf.json` and `data/rows.json` | `server/test/safety.test.js` |
