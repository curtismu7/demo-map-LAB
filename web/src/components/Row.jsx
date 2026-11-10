import React from "react";
import AppCard from "./AppCard.jsx";
import { isWebLink } from "../lib/filter.js";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One row of the map: a collapsible section (open by default; collapsed when it has more than LARGE_ROW apps, see lib/rowOpen.js) with its app cards and its AI-DEMO2 page links.
export default function Row({ row, open, onToggle, filtering }) {
  const bodyId = `row-body-${row.id}`;
  const apps = row.shown;
  const pages = row.shownPages;
  const appCount = filtering ? `${apps.length} of ${plural(row.apps.length, "app", "apps")}` : plural(row.apps.length, "app", "apps");
  return (
    <section className="map-row" data-testid={`row-${row.id}`} aria-labelledby={`row-title-${row.id}`}>
      <h2 className="map-row__title" id={`row-title-${row.id}`}>
        <button type="button" className="tw" aria-expanded={open} aria-controls={bodyId} data-testid={`toggle-${row.id}`} onClick={onToggle}>
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> {row.title}
        </button>
        <span className="count" data-testid={`count-${row.id}`}>{appCount}</span>
        {row.pages.length > 0 && <span className="count" data-testid={`pagecount-${row.id}`}>{plural(row.pages.length, "page", "pages")}</span>}
      </h2>
      {row.summary && <p className="map-row__summary">{row.summary}</p>}
      <div id={bodyId} hidden={!open}>
        {apps.length > 0
          ? <ul className="card-grid" aria-label={`${row.title} apps`}>{apps.map((a) => <AppCard key={a.id} app={a} />)}</ul>
          : <p className="muted" data-testid={`empty-${row.id}`}>{row.apps.length === 0 ? "No standalone app on the shelf belongs here yet." : "No app here matches the filter."}</p>}
        {row.pages.length > 0 && (
          <div className="pages">
            <h3 className="pages__title">AI-DEMO2 pages</h3>
            {pages.length > 0
              ? <ul className="pagelinks" aria-label={`${row.title} AI-DEMO2 pages`}>
                {pages.map((p) => <li key={p.href}>{isWebLink(p.href) ? <a href={p.href} target="_blank" rel="noopener noreferrer">{p.label}</a> : <span>{p.label}</span>}</li>)}
              </ul>
              : <p className="muted">No page here matches the filter.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
