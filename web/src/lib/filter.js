// The text filter: case-insensitive substring over an app's name, description and id, and over a page's label.
// A row with no match is hidden while a filter is active. Pure.
const norm = (s) => String(s ?? "").toLowerCase();

export function filterRows(rows, query) {
  const q = norm(query).trim();
  if (!q) return rows.map((r) => ({ ...r, shown: r.apps, shownPages: r.pages }));
  return rows
    .map((r) => ({
      ...r,
      shown: r.apps.filter((a) => norm(a.name).includes(q) || norm(a.description).includes(q) || norm(a.id).includes(q)),
      shownPages: r.pages.filter((p) => norm(p.label).includes(q)),
    }))
    .filter((r) => r.shown.length > 0 || r.shownPages.length > 0);
}

// Only plain http(s) links are rendered as links. The server validated them already; this is the second check.
export const isWebLink = (href) => typeof href === "string" && /^https?:\/\/[^\s]+$/i.test(href);
