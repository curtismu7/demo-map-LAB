// Which apps belong in which row. An app belongs to a row when ANY of these holds (case-insensitive):
//   - its id equals a match.ids entry, or contains one;
//   - one of its tags is in match.tags;
//   - one of its Ping products is in match.pingProducts.
// An app can sit in several rows. Apps that match no row go under a final "More apps" row.
export const MORE_ID = 'more-apps';

export function appMatches(app, match) {
  const id = app.id.toLowerCase();
  if (match.ids.some((e) => e && (id === e || id.includes(e)))) return true;
  if (app.tags.some((t) => match.tags.includes(t.toLowerCase()))) return true;
  if (app.products.some((p) => match.pingProducts.includes(p.toLowerCase()))) return true;
  return false;
}

const byName = (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// -> { rows: [{ id, title, summary, match, pages, apps }], unmatched: [app] }
export function matchRows(rows, apps) {
  const hit = new Set();
  const out = rows.map((r) => {
    const mine = apps.filter((a) => appMatches(a, r.match)).sort(byName);
    mine.forEach((a) => hit.add(a.id));
    return { ...r, apps: mine };
  });
  return { rows: out, unmatched: apps.filter((a) => !hit.has(a.id)).sort(byName) };
}
