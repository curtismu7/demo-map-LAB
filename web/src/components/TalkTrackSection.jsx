import React from "react";
import talkTrack from "../../../docs/talk-track.md?raw";

// The talk track (docs/talk-track.md) as the presenter's script. Plain text only: headings, numbered steps and paragraphs.
export default function TalkTrackSection() {
  const [open, setOpen] = React.useState(false);
  const lines = talkTrack.split("\n");
  return (
    <section className="talk" data-testid="talk-track">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Talk track</button>
      {open && (
        <>
          <p className="muted">The script in <code>docs/talk-track.md</code>.</p>
          {lines.map((l, i) => {
            if (!l.trim()) return null;
            if (/^#{1,3}\s/.test(l)) return <h3 key={i}>{l.replace(/^#+\s*/, "")}</h3>;
            return <p key={i} className={/^\d+\./.test(l) ? "talk__step" : ""}>{l}</p>;
          })}
        </>
      )}
    </section>
  );
}
