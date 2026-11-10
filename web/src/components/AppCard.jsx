import React from "react";
import { isWebLink } from "../lib/filter.js";

const RUNNING = {
  running: { cls: "chip chip--ok", mark: "●", word: "Running" },
  "not-running": { cls: "chip chip--off", mark: "○", word: "Not running" },
  "needs-setup": { cls: "chip chip--warn", mark: "◐", word: "Needs setup" },
};

// One standalone app. Every string is rendered as React text (never as markup); the Open link is rendered only for a plain
// http(s) URL and always carries rel="noopener noreferrer".
export default function AppCard({ app }) {
  const run = RUNNING[app.running];
  return (
    <li className={`app-card app-card--${String(app.kind).toLowerCase()}`} data-testid={`app-${app.id}`}>
      <div className="app-card__head">
        <h4 className="app-card__name">{app.name}</h4>
      </div>
      <div className="app-card__chips">
        <span className="chip chip--kind" data-testid="kind">{app.kind}</span>
        {run && <span className={run.cls} data-testid="running" data-state={app.running}><span aria-hidden="true">{run.mark}</span> {run.word}</span>}
      </div>
      <p className="app-card__desc">{app.description}</p>
      {isWebLink(app.open)
        ? <a className="open-link" href={app.open} target="_blank" rel="noopener noreferrer" aria-label={`Open ${app.name}`}>Open</a>
        : <span className="muted" data-testid="no-link">No link</span>}
    </li>
  );
}
