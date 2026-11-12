import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import http from "node:http";
import App, { BANNER } from "./App";
import { startLab } from "./testServer";

let lab; let shelves = [];
afterEach(async () => {
  cleanup(); await lab?.close(); lab = null; window.location.hash = ""; document.documentElement.removeAttribute("data-theme");
  for (const s of shelves) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  shelves = [];
});
beforeEach(() => { window.location.hash = ""; });

const click = (el) => fireEvent.click(el);
const REAL_BASE = "https://real-ai-demo2.example";

// A stand-in for the local shelf on a loopback port; the lab (a child process) reads it exactly as it would the real one.
async function fakeShelf(doc) {
  const s = http.createServer((_q, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(typeof doc === "string" ? doc : JSON.stringify(doc)); });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  shelves.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}
const closedOrigin = async () => {
  const s = http.createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port; await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}`;
};
const demo = (id, over = {}) => ({ id, name: `Name ${id}`, kind: "Demo", description: `About ${id}`, tags: [], url: `http://${id}.lab.example:7900`, ...over });
const rowTitles = () => [...document.querySelectorAll(".map-row__title .tw")].map((b) => b.textContent.replace(/^\S\s*/, "").trim());

describe("Mock", () => {
  it("banner first, then the h1; the rows render with counts; Real is disabled with a how-to tooltip", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.mock);
    expect(document.querySelector("main").firstElementChild).toBe(screen.getByTestId("banner"));
    expect(screen.getByTestId("banner").nextElementSibling.tagName).toBe("H1");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Demo Map");
    expect(screen.getByTestId("mode").textContent).toBe("Mock");
    expect(screen.getByTestId("mode-select")).toHaveValue("mock");
    expect(screen.getByTestId("mode-select").querySelector('option[value="real"]')).toBeDisabled();
    expect(screen.getByTestId("mode-select").querySelector('option[value="real"]').title).toMatch(/AI_DEMO2_URL/);
    expect(screen.getByTestId("real-hint").textContent).toMatch(/AI_DEMO2_URL is not set/);
    const titles = rowTitles();
    expect(titles).toHaveLength(9);
    expect(titles).toContain("PingOne Protect");
    expect(titles[0]).toBe("Personal Agent demo");
    expect(titles.at(-1)).toBe("More apps");
    expect(screen.getByTestId("count-personal-agent").textContent).toBe("2 apps");
    expect(screen.getByTestId("count-more-apps").textContent).toBe("2 apps");
    expect(screen.getByTestId("stamp").textContent).toMatch(/18 apps, 16 placed in 8 rows, 2 under More apps/);
  });

  it("every card shows its name, a kind chip, a description and an Open link that carries rel noopener noreferrer", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    const card = screen.getByTestId("app-sample-personal-agent-demo");
    expect(within(card).getByRole("heading", { level: 4 }).textContent).toBe("Sample Personal Agent");
    expect(within(card).getByTestId("kind").textContent).toBe("Demo");
    expect(card.querySelector(".app-card__desc").textContent).toMatch(/made-up personal agent/);
    const open = within(card).getByRole("link", { name: "Open Sample Personal Agent" });
    expect(open).toHaveAttribute("href", "https://launcher.example:8443/sample-personal-agent-demo/");
    expect(open).toHaveAttribute("target", "_blank");
    const rel = open.getAttribute("rel").split(/\s+/);
    expect(rel).toContain("noopener"); expect(rel).toContain("noreferrer");
    // Every external link on the page, app and AI-DEMO2 page links alike.
    const links = [...document.querySelectorAll("main a[href]")];
    expect(links.length).toBeGreaterThan(30);
    for (const a of links) {
      expect(a.getAttribute("href")).toMatch(/^https?:\/\//);
      expect(a.getAttribute("rel")).toMatch(/noopener/); expect(a.getAttribute("rel")).toMatch(/noreferrer/);
    }
  });

  it("status chips always carry a word, never colour alone: Running, Not running, Needs setup, and none when the data is silent", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    const words = (id) => within(screen.getByTestId(`app-${id}`)).queryByTestId("running")?.textContent.trim();
    expect(words("sample-personal-agent-demo")).toMatch(/Running$/);
    expect(words("sample-agent-connect")).toMatch(/Not running$/);
    expect(words("sample-worker-demo-audit")).toMatch(/Needs setup$/);
    expect(words("sample-idjag-inspector")).toBeUndefined();
    expect(screen.getAllByTestId("running").every((c) => /(Running|Not running|Needs setup)$/.test(c.textContent.trim()))).toBe(true);
  });

  it("an app that matches two rows is shown in both; each row lists its AI-DEMO2 pages as links on the placeholder base", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    expect(within(screen.getByTestId("row-pinggateway")).getByTestId("app-sample-gateway-claims")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-authorize")).getByTestId("app-sample-gateway-claims")).toBeInTheDocument();
    expect(screen.getAllByTestId("app-sample-gateway-claims")).toHaveLength(2);
    const pages = within(screen.getByTestId("row-personal-agent")).getAllByRole("link").filter((a) => a.getAttribute("href").startsWith("https://ai-demo2.example/"));
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expect(within(screen.getByTestId("row-more-apps")).queryByText("AI-DEMO2 pages")).toBeNull();
  });

  it("the filter narrows apps by name or description, shows 'x of y', hides empty rows, and clearing restores", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    const input = screen.getByTestId("filter");
    fireEvent.change(input, { target: { value: "gateway claims" } });
    expect(rowTitles()).toEqual([]);
    expect(screen.getByTestId("no-match")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "claims" } });
    expect(rowTitles()).toEqual(["PingGateway", "PingOne Authorize"]);
    expect(screen.getByTestId("count-pinggateway").textContent).toBe("1 of 2 apps");
    expect(screen.getAllByTestId(/^app-/)).toHaveLength(2);
    fireEvent.change(input, { target: { value: "ROTATES A SAMPLE AGENT KEY" } });
    expect(screen.getByTestId("app-sample-privilege-keys")).toBeInTheDocument();
    expect(rowTitles()).toEqual(["PingOne Privilege"]);
    fireEvent.change(input, { target: { value: "" } });
    expect(rowTitles()).toHaveLength(9);
    expect(screen.getByTestId("count-pinggateway").textContent).toBe("2 apps");
  });

  it("rows collapse and expand (default open); the count stays; Collapse all and Expand all work", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    const t = screen.getByTestId("toggle-pingone");
    expect(t).toHaveAttribute("aria-expanded", "true");
    const body = document.getElementById(t.getAttribute("aria-controls"));
    expect(body).toBeVisible();
    click(t);
    expect(t).toHaveAttribute("aria-expanded", "false");
    expect(body).not.toBeVisible();
    expect(screen.getByTestId("count-pingone").textContent).toBe("2 apps");
    click(t);
    expect(t).toHaveAttribute("aria-expanded", "true");
    expect(body).toBeVisible();
    click(screen.getByTestId("collapse-all"));
    expect([...document.querySelectorAll(".map-row__title .tw")].every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
    click(screen.getByTestId("expand-all"));
    expect([...document.querySelectorAll(".map-row__title .tw")].every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);
  });

  it("the theme picker sets data-theme and the page works without storage", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: "dark" } });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: "light" } });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("no outbound network attempt was made by the server", async () => {
    lab = await startLab();
    render(<App />);
    await screen.findByTestId("rows");
    expect(await lab.attempts()).toEqual([]);
  });
});

describe("Real", () => {
  it("the toggle switches both ways and reloads: Real shows the shelf's apps and the AI_DEMO2_URL page links, Mock the sample", async () => {
    const origin = await fakeShelf({ schema: "demo-shelf/1", generatedAt: "2026-11-10T09:00:00Z", demos: [demo("fx-personal-agent-demo-x", { name: "Fx Person", status: { state: "ready" } }), demo("fx-worker-demo-y", { name: "Fx Worker", kind: "Tool", status: { state: "down" } })] });
    lab = await startLab({ env: { AI_DEMO2_URL: REAL_BASE, SHELF_URL: origin, MODE: "mock" } });
    render(<App />);
    await screen.findByTestId("rows");
    expect(screen.getByTestId("mode").textContent).toBe("Mock");
    expect(screen.getByTestId("mode-select").querySelector('option[value="real"]')).toBeEnabled();
    fireEvent.change(screen.getByTestId("mode-select"), { target: { value: "real" } });
    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("Real"));
    await screen.findByTestId("app-fx-worker-demo-y");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.real);
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
    
    expect(within(screen.getByTestId("app-fx-personal-agent-demo-x")).getByTestId("running").textContent).toMatch(/Running$/);
    expect(within(screen.getByTestId("app-fx-worker-demo-y")).getByTestId("running").textContent).toMatch(/Not running$/);
    expect(screen.queryByTestId("app-sample-personal-agent-demo")).toBeNull();
    const pageLink = within(screen.getByTestId("row-personal-agent")).getAllByRole("link").find((a) => a.getAttribute("href").startsWith(REAL_BASE));
    expect(pageLink).toBeTruthy();
    expect(rowTitles()).toEqual(["Personal Agent demo", "Digital Worker agent", "PingOne", "PingFederate", "PingGateway", "PingOne Privilege", "PingOne Authorize", "PingOne Protect"]);
    expect(screen.getByTestId("empty-pingone").textContent).toMatch(/No standalone app/);
    expect(screen.getByTestId("count-personal-agent").textContent).toBe("1 app");
    fireEvent.change(screen.getByTestId("mode-select"), { target: { value: "mock" } });
    await screen.findByTestId("app-sample-personal-agent-demo");
    expect(screen.getByTestId("mode").textContent).toBe("Mock");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.mock);
    expect(screen.queryByTestId("app-fx-worker-demo-y")).toBeNull();
    expect(await lab.attempts()).toEqual([]);
  });

  it("hostile shelf text is rendered inert; a javascript: URL is dropped; the page still works", async () => {
    const origin = await fakeShelf({ schema: "demo-shelf/1", demos: [
      demo("hx-worker-demo", { name: "<img src=x onerror=alert(1)>", description: "<script>window.__pwned=1</script><b>bold</b>", url: "javascript:window.__pwned=2", proxyUrl: "data:text/html,<script>1</script>" }),
      demo("hx-two-worker-demo", { name: "Safe", url: "https://safe.example/a?x=<b>", description: "x" }),
      demo("hx-bad", { kind: "<b>Evil</b>" }),
    ] });
    lab = await startLab({ env: { AI_DEMO2_URL: REAL_BASE, SHELF_URL: origin } });
    render(<App />);
    const card = await screen.findByTestId("app-hx-worker-demo");
    expect(card.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(card.textContent).toContain("<script>window.__pwned=1</script><b>bold</b>");
    expect(card.querySelector("img, script, b")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByTestId("no-link").textContent).toBe("No link");
    expect([...document.querySelectorAll("a[href]")].some((a) => /^(javascript|data):/i.test(a.getAttribute("href")))).toBe(false);
    expect(screen.getAllByTestId("warning").map((w) => w.textContent).join(" ")).toMatch(/1 shelf entry was skipped/);
    expect(screen.queryByText(/Evil/)).toBeNull();
    const safe = within(screen.getByTestId("app-hx-two-worker-demo")).getByRole("link");
    expect(safe).toHaveAttribute("href", "https://safe.example/a?x=%3Cb%3E");
    expect(safe.getAttribute("rel")).toContain("noopener");
  });

  it("the shelf not answering shows a clear message and no rows; nothing from Mock is shown as Real; Mock still works", async () => {
    lab = await startLab({ env: { AI_DEMO2_URL: REAL_BASE, SHELF_URL: await closedOrigin() } });
    render(<App />);
    const err = await screen.findByTestId("map-error");
    expect(err.textContent).toMatch(/local demo shelf did not answer/);
    expect(err.textContent).toMatch(/Nothing is shown/);
    expect(screen.getByTestId("mode").textContent).toBe("Real");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER.real);
    expect(screen.queryByTestId("rows")).toBeNull();
    expect(screen.queryAllByTestId(/^app-/)).toHaveLength(0);
    fireEvent.change(screen.getByTestId("mode-select"), { target: { value: "mock" } });
    await screen.findByTestId("rows");
    expect(screen.queryByTestId("map-error")).toBeNull();
    expect(screen.getByTestId("mode").textContent).toBe("Mock");
  });

  it("a shelf answer that is not the expected format shows a fixed message, not the fetched text", async () => {
    const origin = await fakeShelf({ schema: "CANARY-text-from-shelf", demos: [] });
    lab = await startLab({ env: { AI_DEMO2_URL: REAL_BASE, SHELF_URL: origin } });
    render(<App />);
    const err = await screen.findByTestId("map-error");
    expect(err.textContent).toMatch(/does not look like the demo-shelf\/1 format/);
    expect(document.body.textContent).not.toContain("CANARY-text-from-shelf");
  });
});
