import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import App from "./App";
import { startLab } from "./testServer";

// The header shows this lab's own Verified / In progress mark, read from the same /api/shelf call the Shelf link makes (through the lab-proxy that
// call reaches the shelf, whose payload lists every demo with its mark). The lab's own /api/shelf has only { shelfUrl }, so there is no mark then.
let lab;
afterEach(async () => { cleanup(); await lab?.close(); lab = null; window.location.hash = ""; });

const mark = (status, label, extra = {}) => ({ status, label, note: "", updatedAt: "2026-11-15", source: "shipped", ...extra });
// startLab() has already routed fetch to the real lab process; answer /api/shelf with `payload` and leave every other call alone.
function withShelf(payload) {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (url === "/api/shelf" ? Promise.resolve(new Response(JSON.stringify(payload))) : real(url, init));
  return () => { globalThis.fetch = real; };
}
const header = async () => { await screen.findByTestId("rows"); return within(screen.getByRole("banner")); };

describe("verification mark in the header", () => {
  it("shows this lab's own mark beside the Shelf link, and no other lab's", async () => {
    lab = await startLab();
    const restore = withShelf({ shelfUrl: "http://shelf.example", demos: [
      { id: "other-lab", verification: mark("in-progress", "In progress") },
      { id: "demo-map-lab", verification: mark("verified", "Verified", { note: "Every row checked on the mock" }) },
    ] });
    try {
      render(<App />);
      const bar = await header();
      expect(await bar.findByText("Verified")).toBeInTheDocument();
      expect(bar.getByRole("link", { name: "Shelf" })).toBeInTheDocument();
      expect(bar.queryByText("In progress")).toBeNull();
      expect(document.querySelectorAll(".verify")).toHaveLength(1);
      expect(bar.getByText("Verified").closest(".verify")).toHaveAttribute("title", expect.stringContaining("Every row checked on the mock"));
    } finally { restore(); }
  });

  it("shows nothing when the lab is opened on its own port (its /api/shelf has no demos), the shelf has no mark for it, or the mark is none", async () => {
    lab = await startLab();
    for (const payload of [
      { shelfUrl: "http://shelf.example" },
      { shelfUrl: "http://shelf.example", demos: [{ id: "demo-map-lab", verification: null }] },
      { shelfUrl: "http://shelf.example", demos: [{ id: "demo-map-lab", verification: mark("none", "") }] },
    ]) {
      const restore = withShelf(payload);
      try {
        const { unmount } = render(<App />);
        const bar = await header();
        expect(await bar.findByRole("link", { name: "Shelf" })).toBeInTheDocument(); // the shelf answered, and still no badge
        expect(document.querySelector(".verify")).toBeNull();
        unmount();
      } finally { restore(); }
    }
  });

  it("is rendered by App.jsx once, with this lab's shelf id, and main.jsx loads its stylesheet", () => {
    const read = (f) => fs.readFileSync(path.join(process.cwd(), "src", f), "utf8");
    expect(read("App.jsx").match(/<VerifyMark\b/g)).toHaveLength(1);
    expect(read("App.jsx")).toContain('<VerifyMark id="demo-map-lab" />');
    expect(read("main.jsx")).toContain('import "./components/VerifyMark.css";');
  });
});
