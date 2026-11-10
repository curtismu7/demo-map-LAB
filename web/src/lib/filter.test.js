import { describe, expect, it } from "vitest";
import { filterRows, isWebLink } from "./filter.js";

const app = (id, name, description = "") => ({ id, name, description });
const rows = [
  { id: "a", title: "A", apps: [app("one", "Alpha Gateway", "routes"), app("two", "Beta", "has a GATEWAY word")], pages: [{ label: "Gateway routes", href: "https://x.example/g" }, { label: "Other", href: "https://x.example/o" }] },
  { id: "b", title: "B", apps: [app("three", "Gamma", "nothing")], pages: [] },
  { id: "c", title: "C", apps: [], pages: [{ label: "Only page", href: "https://x.example/p" }] },
];

describe("filterRows", () => {
  it("no query keeps every row and every app and page", () => {
    const out = filterRows(rows, "  ");
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(out[0].shown).toHaveLength(2);
    expect(out[0].shownPages).toHaveLength(2);
  });
  it("matches name, description and id, case-insensitively, and hides rows with no match", () => {
    const out = filterRows(rows, "gateway");
    expect(out.map((r) => r.id)).toEqual(["a"]);
    expect(out[0].shown.map((a) => a.id)).toEqual(["one", "two"]);
    expect(out[0].shownPages.map((p) => p.label)).toEqual(["Gateway routes"]);
    expect(filterRows(rows, "THREE").map((r) => r.id)).toEqual(["b"]);
  });
  it("a page label match keeps a row that has no matching app", () => {
    const out = filterRows(rows, "only page");
    expect(out.map((r) => r.id)).toEqual(["c"]);
    expect(out[0].shown).toEqual([]);
  });
  it("a filter is a plain substring, not a pattern", () => {
    expect(filterRows(rows, ".*")).toEqual([]);
    expect(filterRows(rows, "(")).toEqual([]);
  });
});

describe("isWebLink", () => {
  it("accepts http(s) only", () => {
    expect(isWebLink("https://a.example/x")).toBe(true);
    expect(isWebLink("HTTP://a.example")).toBe(true);
    for (const v of ["javascript:alert(1)", "data:text/html,x", "//a.example", "/x", "https://a b", "", null, undefined, 3]) expect(isWebLink(v)).toBe(false);
  });
});
