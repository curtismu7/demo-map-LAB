// Whether a row starts open. A row with many apps (the Real shelf has dozens under PingOne, PingFederate and Privilege) starts
// collapsed so the page stays short; a filter opens every row so no match is hidden. A click always wins over the default.
export const LARGE_ROW = 8;

// closed: { rowId: true|false } for rows the person has clicked (or Expand all / Collapse all); undefined = still the default.
export function isRowOpen(row, closed, filtering) {
  const chosen = closed[row.id];
  if (chosen !== undefined) return !chosen;
  return filtering || row.apps.length <= LARGE_ROW;
}
