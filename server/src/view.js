// The map: rows computed from the row definitions and a list of validated apps. Pure.
import { MORE_ID, matchRows } from './match.js';
import { pageHref } from './baseUrl.js';

export const MORE_ROW = { id: MORE_ID, title: 'More apps', summary: 'Apps on the shelf that match none of the rows above.' };

// -> { rows: [{ id, title, summary, count, apps, pages: [{ label, href }] }], counts }
export function buildMap(rows, apps, aiDemo2Base) {
  const { rows: matched, unmatched } = matchRows(rows, apps);
  const out = matched.map((r) => ({
    id: r.id, title: r.title, summary: r.summary, count: r.apps.length, apps: r.apps,
    pages: r.pages.map((p) => ({ label: p.label, href: pageHref(aiDemo2Base, p.path) })),
  }));
  if (unmatched.length) out.push({ ...MORE_ROW, count: unmatched.length, apps: unmatched, pages: [] });
  const placed = new Set(matched.flatMap((r) => r.apps.map((a) => a.id)));
  return {
    rows: out,
    counts: {
      rows: out.length, apps: apps.length, matched: placed.size, unmatched: unmatched.length,
      running: apps.filter((a) => a.running === 'running').length,
    },
  };
}
