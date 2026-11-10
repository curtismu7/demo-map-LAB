// Where the data comes from. Rows: data/rows.json (the editable definitions). Mock apps: data/sample-shelf.json (made up, bundled).
// Real apps: the local shelf, fetched per request (shelf.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseShelfText } from './shelf.js';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
export const ROWS_FILE = path.join(DATA, 'rows.json');
export const MOCK_FILE = path.join(DATA, 'sample-shelf.json');

export function loadMockShelf(file = MOCK_FILE) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { ok: false, code: 'bad_json', problems: ['sample shelf: cannot be read'] }; }
  return parseShelfText(text);
}
