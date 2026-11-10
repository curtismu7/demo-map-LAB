# Demo Map

**Tier: Tool**

A one-page map of the demo family. One row for the Personal Agent demo, one for the Digital Worker agent, and one per Ping product (PingOne, PingFederate, PingGateway, PingOne Privilege, PingOne Authorize, PingOne Protect). Each row shows the standalone apps from the demo shelf that belong in it, as cards (name, kind chip Demo / Tester / Tool, a short description, an **Open** link and a Running / Not running / Needs setup chip where the shelf says so), and the AI-DEMO2 pages for that row as links. It is the standalone twin of AI-DEMO2's "Demo Map" page.

Open it: <http://127.0.0.1:7808/>

This app is scaffolded from env-map-LAB: the server safety modules (Host check, same-origin writes, netguard, health, shelf link), the Mock/Real toggle, the Docker and CI files and the vendored shared stylesheet are copied from it, with its identity (name, id, port, catalog text, tests) replaced. It is not a fork of its features: nothing of the environment map is here.

## Two modes (header toggle on every page)

| | Mock | Real (owner-run) |
| --- | --- | --- |
| What it shows | A **made-up** sample shelf, `data/sample-shelf.json`: 18 invented apps on `.example` hosts. | The apps on **your local demo shelf**, read live and read-only from `GET <SHELF_URL>/api/shelf`. |
| AI-DEMO2 page links | Built on the placeholder `https://ai-demo2.example`. | Built on `AI_DEMO2_URL` from your `.env`. |
| Where | Host or Docker. | Host only (`./scripts/run.sh`). Refused in the Docker image: its bind is not loopback and a container cannot reach the host's loopback shelf. |
| Network | None. | One request per page load, to the one loopback origin in `SHELF_URL` (http only, 127.0.0.1 / localhost / [::1]; no redirects, 5 s, 2 MB, JSON only). Nothing else. |

The toggle follows rule 19: `POST /api/mode` with exactly `{ "source": "mock" | "real" }`; `GET /api/info` returns `source`, `mode`, `realAvailable` and `realReason`. Real not configured: the button is disabled with a how-to tooltip and the server answers 409. Default: Real if configured, else Mock; `MODE=mock` forces Mock (the Docker image sets it). Switching reloads the map without a restart. If the shelf does not answer in Real, the page says so and shows nothing: it never shows Mock data as Real.

### Real: settings

Copy `.env.example` to `.env` beside `docker-compose.yml` (gitignored; never commit it) and set:

| Name | Meaning |
| --- | --- |
| `AI_DEMO2_URL` | The AI-DEMO2 site, a plain `http(s)` origin: no path, no credentials. Required for Real. |
| `SHELF_URL` | The local demo shelf, an `http` loopback origin. Default `http://127.0.0.1:4400`. |

Then start the shelf and run `./scripts/run.sh`. Settings come only from this app's own `.env` or the environment (the environment wins).

## The rows

`data/rows.json` (schema `demo-map-rows/1`) is the editable source of truth: for each row an `id`, `title`, `summary`, `match` (`ids`, `tags`, `pingProducts`) and `pages` (`label`, `path`). It is read on every request, so an edit shows on reload. The file is parsed as untrusted input (64 KB, depth 8, caps on every list, problems name a position and never echo a value).

An app belongs to a row when, case-insensitively, **any** of these holds:

- its id equals a `match.ids` entry, or contains one;
- one of its tags is in `match.tags`;
- one of its Ping products is in `match.pingProducts`.

An app can appear in several rows. Apps that match no row go under a final **More apps** row. A page link is `AI_DEMO2_URL` + the row's path.

## The page

Banner first (what is simulated), then the h1. A text filter narrows apps by name or description (and page links by label); each row shows its app count ("2 of 5 apps" while filtering) and collapses (open by default); Expand all / Collapse all sit next to the filter. Light and dark themes, usable at 375 px.

## Run

```sh
./scripts/run.sh                                  # host: install, build, doctor, start on http://127.0.0.1:7808/
HOST_PORT=7808 docker compose up --build -d       # OrbStack (never Docker Desktop): Mock only, published on 127.0.0.1
npm test                                          # server (node:test), web (vitest against the real server), repo scans
npm run doctor                                    # preflight, including the netguard self-test
npm run reset                                     # POST /api/reset on the running app: back to the launch mode
```

Behind the family lab-proxy the app answers to `LAB_ALLOWED_HOSTS` (compose sets `demo-map-lab.local.ping-devops.com`). `GET /api/health` returns `demo-health/1`.

See `docs/safety.md` for the defences and their tests, and `docs/talk-track.md` for a two-minute walk-through.
