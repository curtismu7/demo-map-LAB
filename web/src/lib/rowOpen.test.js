import { describe, it, expect } from "vitest";
import { isRowOpen, LARGE_ROW } from "./rowOpen.js";

const row = (n, id = "r") => ({ id, apps: Array.from({ length: n }, (_, i) => ({ id: `a${i}` })) });

describe("isRowOpen", () => {
  it("a small row starts open, a large row starts collapsed", () => {
    expect(isRowOpen(row(LARGE_ROW), {}, false)).toBe(true);
    expect(isRowOpen(row(LARGE_ROW + 1), {}, false)).toBe(false);
    expect(isRowOpen(row(0), {}, false)).toBe(true);
  });
  it("a filter opens a large row so no match is hidden", () => {
    expect(isRowOpen(row(40), {}, true)).toBe(true);
  });
  it("a click wins over the default, in both directions, and over the filter", () => {
    expect(isRowOpen(row(40), { r: false }, false)).toBe(true);
    expect(isRowOpen(row(2), { r: true }, false)).toBe(false);
    expect(isRowOpen(row(40), { r: true }, true)).toBe(false);
  });
});
