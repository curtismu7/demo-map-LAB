import React from "react";
import { getMap, getJson, setMode } from "./api";
import { THEMES, applyTheme, savedTheme } from "./theme";
import { filterRows } from "./lib/filter.js";
import ShelfLink from "./components/ShelfLink.jsx";
import Row from "./components/Row.jsx";
import { isRowOpen } from "./lib/rowOpen.js";

export const BANNER = {
  mock: "Mock: a made-up sample shelf (invented apps on .example hosts). Nothing is read from your demo shelf and nothing is fetched from the network. The AI-DEMO2 page links point at a placeholder address.",
  real: "Real: the apps on your local demo shelf, read live and read-only from this machine, with AI-DEMO2 page links built on your AI_DEMO2_URL. Running and not-running come from the shelf itself.",
  unknown: "Mode unknown: the server did not answer. Nothing is shown until it does.",
};

export default function App() {
  const [info, setInfo] = React.useState(undefined); // undefined = loading, null = failed
  const [map, setMap] = React.useState(undefined);   // undefined = loading, null = failed
  const [mapError, setMapError] = React.useState(null);
  const [epoch, setEpoch] = React.useState(0);       // bumped on every mode switch: the data reloads
  const [switchError, setSwitchError] = React.useState("");
  const [theme, setTheme] = React.useState(savedTheme);
  const [query, setQuery] = React.useState("");
  const [closed, setClosed] = React.useState({});    // row id -> true when collapsed, false when opened; unset = the default (isRowOpen)

  React.useEffect(() => { applyTheme(theme); }, [theme]);
  React.useEffect(() => {
    let alive = true;
    setMap(undefined); setMapError(null);
    getJson("/api/info").then((i) => { if (alive) setInfo(i); }, () => { if (alive) setInfo(null); });
    getMap().then((m) => { if (alive) setMap(m); }, (e) => { if (alive) { setMap(null); setMapError(e); } });
    return () => { alive = false; };
  }, [epoch]);

  const real = info?.source === "real";
  async function switchTo(source) {
    setSwitchError("");
    const r = await setMode(source);
    if (!r.ok) setSwitchError(r.body?.detail || `Could not switch (HTTP ${r.status}).`);
    setEpoch((e) => e + 1);
  }

  const realHint = info && !info.realAvailable ? info.realReason || "Real is not configured. Mock keeps working." : "";
  const banner = info === undefined ? "Loading..." : info === null ? BANNER.unknown : real ? BANNER.real : BANNER.mock;
  const filtering = query.trim() !== "";
  const rows = React.useMemo(() => (map?.rows ? filterRows(map.rows, query) : []), [map, query]);
  const setAll = (isClosed) => setClosed(Object.fromEntries((map?.rows || []).map((r) => [r.id, isClosed])));

  return (
    <div className="app">
      <a className="skip-link" href="#main" data-testid="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="shell-bar">
        <span className="shell-brand"><span className="shell-logo" aria-hidden="true">DM</span> Demo Map <span className="shell-badge" data-testid="mode">{info ? (real ? "Real" : "Mock") : "..."}</span></span>
        <span className="shell-spacer" />
        <span className="shell-right">
          {info && (
            <span className="seg" role="group" aria-label="Data source">
              <button type="button" aria-pressed={!real} data-testid="mode-mock" onClick={() => switchTo("mock")} title="Show the made-up sample shelf shipped in this repo">Mock</button>
              <button type="button" aria-pressed={real} data-testid="mode-real" disabled={!info.realAvailable && !real} aria-describedby={realHint ? "real-hint" : undefined}
                title={info.realAvailable ? "Show the apps on your local demo shelf (read-only, loopback only)" : realHint}
                onClick={() => switchTo("real")}>Real</button>
            </span>
          )}
          <ShelfLink />
          <label className="shell-theme">Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value)} data-testid="theme">
              {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </span>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        <div className="banner" role="note" data-testid="banner" data-state={real ? "live" : undefined}>{banner}</div>
        <h1 className="page-title">Demo Map</h1>
        <p className="lede">The demo family on one page: for the Personal Agent demo, the Digital Worker agent and each Ping product, the standalone apps that belong there and the AI-DEMO2 pages to open next to them.</p>
        {realHint && <p className="muted" id="real-hint" data-testid="real-hint">{realHint}</p>}
        {switchError && <p className="field-error" role="alert" data-testid="switch-error">{switchError}</p>}
        <div className="toolbar">
          <label className="filter">
            <span className="filter__label">Filter</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="App name or description" data-testid="filter" autoComplete="off" spellCheck={false} />
          </label>
          <span className="toolbar__buttons">
            <button type="button" data-testid="expand-all" onClick={() => setAll(false)}>Expand all</button>
            <button type="button" data-testid="collapse-all" onClick={() => setAll(true)}>Collapse all</button>
          </span>
        </div>
        {map && <p className="meta" data-testid="stamp">{map.counts.apps} apps, {map.counts.matched} placed in {map.counts.rows - (map.counts.unmatched ? 1 : 0)} rows, {map.counts.unmatched} under More apps, {map.counts.running} running{map.generatedAt ? `. Shelf data from ${map.generatedAt}.` : "."}</p>}
        {map?.warnings?.map((w) => <p key={w} className="notice" data-testid="warning">{w}</p>)}
        {map === null ? (
          <div className="field-error" role="alert" data-testid="map-error">
            {mapError?.message || "The map could not be loaded."} Nothing is shown.
            {mapError?.problems?.length > 0 && <ul>{mapError.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        ) : map === undefined ? <p className="muted" data-testid="loading">Loading...</p>
          : (
            <div className="rows" data-testid="rows">
              {rows.map((r) => <Row key={r.id} row={r} filtering={filtering} open={isRowOpen(r, closed, filtering)} onToggle={() => setClosed((c) => ({ ...c, [r.id]: isRowOpen(r, c, filtering) }))} />)}
              {rows.length === 0 && <p className="muted" data-testid="no-match">Nothing matches the filter.</p>}
            </div>
          )}
      </main>
    </div>
  );
}
