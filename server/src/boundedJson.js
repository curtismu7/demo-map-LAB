// Bounded JSON parsing for text we did not write (the rows file, the fetched shelf). A size cap before JSON.parse, and an
// iterative nesting check (no recursion, so a hostile "[[[[..." cannot overflow the stack). Problems are fixed strings:
// they never echo the text.
export function maxNesting(text) {
  let depth = 0; let max = 0; let inString = false; let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === 92) escaped = true; // backslash
      else if (c === 34) inString = false; // quote
      continue;
    }
    if (c === 34) inString = true;
    else if (c === 123 || c === 91) { depth += 1; if (depth > max) max = depth; } // { [
    else if (c === 125 || c === 93) depth -= 1; // } ]
  }
  return max;
}

// { ok: true, value } or { ok: false, problem }.
export function parseBounded(text, { maxBytes, maxDepth }) {
  if (typeof text !== 'string') return { ok: false, problem: 'not text' };
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return { ok: false, problem: `larger than ${maxBytes} bytes` };
  if (maxNesting(text) > maxDepth) return { ok: false, problem: `nested deeper than ${maxDepth} levels` };
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, problem: 'not valid JSON' }; }
}
