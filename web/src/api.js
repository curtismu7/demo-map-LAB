// Same-origin JSON calls. Errors carry the HTTP status, the server's fixed message and, for data that does not validate,
// the (bounded) list of problems. The server never puts fetched text in them.
export async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) { const e = new Error(body?.detail || body?.error || `HTTP ${r.status}`); e.status = r.status; e.problems = Array.isArray(body?.problems) ? body.problems : []; throw e; }
  return body;
}

// POST /api/mode: the rule 19 Mock/Real toggle. 409 when Real is not configured.
export async function setMode(source) {
  const r = await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

// POST /api/reset (rule 3): the server is back to its launch mode.
export async function postReset() {
  const r = await fetch("/api/reset", { method: "POST" });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

export const getMap = () => getJson("/api/map");
