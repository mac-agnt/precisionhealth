/* Home right rail for Stephen: a new inbound lead with the live 10 minute first-touch countdown.
   Shown at the top of the widget rail for the sales owner. Clicking opens the lead in the Pipeline. */
import { SALES_SERVICE_LABEL, fmtTime, persona, salesInboundFor, salesRights } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Icon } from "../../ui";
import { TouchTimer } from "./LeadFlow";

export default function InboundLeadCard() {
  const s = usePhState();
  const nav = useNav();
  const p = persona(s);
  if (!salesRights(p).manage) return null;
  const items = (s.salesFlow?.inbound || [])
    .map((inb) => ({ inb, lead: s.sales.leads.find((l) => l.id === inb.leadId) }))
    .filter((x) => x.lead && (x.lead.stage === "new" || !x.inb.firstTouchAt) && x.lead.stage !== "lost")
    .sort((a, b) => Number(!!a.inb.firstTouchAt) - Number(!!b.inb.firstTouchAt) || (a.inb.arrivedAt < b.inb.arrivedAt ? -1 : 1))
    .slice(0, 2);
  if (!items.length) return null;
  return (
    <>
      <style>{CSS}</style>
      {items.map(({ inb, lead }) => {
        const L = lead!;
        const pending = !inb.firstTouchAt;
        return (
          <button key={inb.leadId} type="button" className={`ph-card ib-card${pending ? " live" : ""}`} onClick={() => nav.go({ page: "Sales", tab: "pipeline", params: { lead: L.id } })} aria-label={`Open new inbound lead ${L.company}`}>
            <span className="ib-head">
              {pending ? <span className="ib-pulse" aria-hidden="true" /> : <Icon name="check" size={13} />}
              <span className="ib-title">{pending ? "New inbound lead" : "Inbound lead answered"}</span>
              <TouchTimer inb={inb} />
            </span>
            <span className="ib-co">{L.company}</span>
            <span className="ib-sub">{L.contact.name} · {L.services.map((x) => SALES_SERVICE_LABEL[x]).join(", ")}{L.qualifier.headcount ? ` · about ${L.qualifier.headcount} people` : ""}</span>
            <span className="ib-enq">{L.enquiry}</span>
            <span className="ib-foot">
              <span>{pending ? `Arrived ${fmtTime(inb.arrivedAt)}. Reply within ${inb.slaMinutes} minutes.` : `Arrived ${fmtTime(inb.arrivedAt)}, first reply ${fmtTime(inb.firstTouchAt!)}.`}</span>
              <span className="ib-open">Open lead<Icon name="chevronRight" size={12} /></span>
            </span>
          </button>);
      })}
    </>
  );
}

const CSS = `
.ib-card { display: flex; flex-direction: column; gap: 6px; width: 100%; text-align: left; padding: 14px 16px 12px; font: inherit; color: inherit; cursor: pointer; border: 1px solid var(--border); transition: border-color .15s, transform .15s; }
.ib-card.live { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.ib-card:hover { transform: translateY(-1px); border-color: var(--accent); }
.ib-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ib-head { display: flex; align-items: center; gap: 8px; color: var(--ok); }
.ib-title { flex: 1; font-size: 13.5px; font-weight: 500; color: var(--ink); }
.ib-pulse { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 0 var(--accent); animation: ibPulse 1.6s infinite; flex: none; }
@keyframes ibPulse { 0% { box-shadow: 0 0 0 0 var(--accent-soft); } 70% { box-shadow: 0 0 0 9px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
@media (prefers-reduced-motion: reduce) { .ib-pulse { animation: none; } }
.ib-co { font-size: 15px; font-weight: 600; color: var(--ink); margin-top: 2px; }
.ib-sub { font-size: 11.5px; color: var(--dim); }
.ib-enq { font-size: 12px; color: var(--body); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ib-foot { display: flex; align-items: center; gap: 8px; justify-content: space-between; font-size: 11.5px; color: var(--faint); border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; }
.ib-open { display: inline-flex; align-items: center; gap: 3px; color: var(--accent); font-weight: 500; white-space: nowrap; }
`;
