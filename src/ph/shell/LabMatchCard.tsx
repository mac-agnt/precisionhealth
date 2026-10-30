/* Top priority card for the Home widget rail: lab rows waiting for a person to match them to a
   patient. Shown above every other card while anything is waiting; hidden when the queue is empty.
   Lives in the rail, never in the Home centre column. */
import { fmtWhen, ix, labQueue, persona } from "../model";
import { useNav } from "../nav-context";
import { usePhState } from "../store";
import { Button, Icon, Pill } from "../ui";

export default function LabMatchCard() {
  const state = usePhState();
  const nav = useNav();
  const p = persona(state);
  const items = labQueue(state);
  if (!items.length || !p.perms.has("imports.view")) return null;
  const I = ix(state);
  const open = (params: Record<string, string> = { view: "queue" }) => nav.go({ page: "Results", tab: "imports", params });
  const word = (d: { name: boolean; dob: boolean; id: boolean }) => [d.name ? "name" : null, d.dob ? "date of birth" : null, d.id ? "Precision ID" : null].filter(Boolean).join(", ");
  return (
    <section className="ph-card lab-home-card" style={{ padding: "14px 16px 12px", borderLeft: "3px solid var(--warn)" }} aria-label="Lab rows need matching">
      <div className="ph-row-flex" style={{ gap: 8, marginBottom: 4 }}>
        <Icon name="alert" size={15} style={{ color: "var(--warn)" }} />
        <div className="ph-grow" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{items.length} lab {items.length === 1 ? "row needs" : "rows need"} matching</div>
        <Pill tone="warn" icon={null}>Top priority</Pill>
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45, marginBottom: 6 }}>These results are not on any record yet. Name, date of birth and Precision ID must all agree before they attach.</div>
      {items.slice(0, 3).map((q) => {
        const who = q.candidate ? I.personById.get(q.candidate.personId) : null;
        return (
          <button key={q.key} type="button" onClick={() => open()} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 6px", margin: "0 -6px", borderRadius: 10, border: 0, borderTop: "1px solid var(--border)", background: "none", cursor: "pointer", font: "inherit", color: "inherit" }}>
            <div className="ph-row-flex" style={{ fontSize: 12.5 }}>
              <span className="ph-grow ph-trunc" style={{ color: "var(--ink)" }}>{q.file.surname}{q.file.given ? `, ${q.file.given}` : ""}</span>
              <span className="ph-faint" style={{ fontSize: 11 }}>{fmtWhen(q.receivedAt, state.clock.nowUtc)}</span>
            </div>
            <div className="ph-faint ph-trunc" style={{ fontSize: 11, marginTop: 2 }}>{who ? `Closest: ${who.given} ${who.family}. Differs: ${word(q.diff)}` : "No patient found in Pulse"}</div>
          </button>
        );
      })}
      <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="primary" icon="arrow" onClick={() => open()}>Open the matching queue</Button>
      </div>
    </section>
  );
}
