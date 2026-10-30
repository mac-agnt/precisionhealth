/* Records, Companies: everything held for one client, each linked to its record, plus the way into
   the client's start-to-finish journey. */
import { calendarEvents, fmtDate, programmeCounts, retCompanyKey, salesRecalls, today } from "../../model";
import type { Company, NavTarget, PhState } from "../../model";
import { useNav } from "../../nav-context";
import { Button } from "../../ui";
import { JourneyStrip } from "./JourneyStrip";
import { journeyKeyForCompany } from "./model";
import "./journey.css";

interface Row { label: string; detail: string; target: NavTarget }

export function companyRecords(s: PhState, c: Company): Array<{ group: string; rows: Row[] }> {
  const k = retCompanyKey(c.name);
  const leads = s.sales.leads.filter((l) => retCompanyKey(l.company) === k);
  const recalls = salesRecalls(s).filter((r) => retCompanyKey(r.company) === k);
  const ilh = s.sales.ilh.filter((b) => retCompanyKey(b.company) === k);
  const oh = (s.occHealth?.clients || []).filter((x) => retCompanyKey(x.name) === k);
  const props = s.sales.proposals.filter((p) => leads.some((l) => l.id === p.leadId));
  const onbs = s.onboarding.onboardings.filter((o) => retCompanyKey(o.details.companyName) === k || (o.leadId && leads.some((l) => l.id === o.leadId)));
  const progs = s.programmes.filter((p) => p.clientId === c.id);
  const days = s.screeningDays.days.filter((d) => progs.some((p) => p.id === d.programmeId));
  const emails = s.onboarding.emails.filter((e) => retCompanyKey(e.company) === k);
  const t = today(s);
  const events = calendarEvents(s).filter((e) => e.client && retCompanyKey(e.client) === k && e.date >= t).slice(0, 5);
  return [
    { group: "Leads", rows: leads.map((l) => ({ label: `${l.contact.name || l.company}, ${l.stage === "proposal_sent" ? "proposal sent" : l.stage}`, detail: `Received ${fmtDate(l.receivedOn)}`, target: { page: "Sales", tab: "pipeline", params: { lead: l.id } } })) },
    { group: "Proposals", rows: props.map((p) => ({ label: `${p.id} v${p.versions.length}`, detail: p.versions[p.versions.length - 1].status, target: { page: "Sales", tab: "proposals", params: { proposal: p.id } } })) },
    { group: "Onboarding", rows: onbs.map((o) => ({ label: o.id, detail: o.completedAt ? `Finished ${fmtDate(o.completedAt)}` : "In progress", target: { page: "Sales", tab: "onboarding", params: { onb: o.id } } })) },
    { group: "Programmes", rows: progs.map((p) => ({ label: p.name, detail: `${fmtDate(p.windowStart)} to ${fmtDate(p.windowEnd)}`, target: { page: "Programmes", tab: "programmes", params: { programme: p.id } } })) },
    { group: "Screening days", rows: [
      ...days.map((d) => ({ label: fmtDate(d.date), detail: d.status === "published" ? "Published" : "Draft", target: { page: "Clinics", tab: "days", params: { day: d.id } } as NavTarget })),
      ...progs.map((p) => s.sessions.filter((x) => x.programmeId === p.id && x.status !== "cancelled").sort((a, b) => (a.date < b.date ? -1 : 1))).filter((xs) => xs.length).map((xs) => ({ label: `${xs.length} clinic sessions`, detail: `${fmtDate(xs[0].date)} to ${fmtDate(xs[xs.length - 1].date)}`, target: { page: "Clinics", tab: "schedule", params: { session: xs[0].id } } as NavTarget })),
    ] },
    { group: "Results", rows: progs.map((p) => { const n = programmeCounts(s, p.id); return { label: `${n.released} released`, detail: `${n.ready} to review, ${n.awaiting} awaiting the lab`, target: { page: "Results", tab: "review" } as NavTarget }; }) },
    ...(recalls.length ? [{ group: "Rebooking", rows: recalls.map((r) => ({ label: `Anniversary ${fmtDate(r.recallOn)}`, detail: `Last screened ${fmtDate(r.screenedOn)}, ${r.packageText}`, target: { page: "Sales", tab: "recall", params: { recall: r.id } } as NavTarget })) }] : []),
    ...(ilh.length ? [{ group: "Irish Life Health", rows: ilh.map((b) => ({ label: b.item, detail: `${fmtDate(b.date)}, ${b.location}`, target: { page: "Sales", tab: "partners", params: { ilh: b.id } } as NavTarget })) }] : []),
    ...(oh.length ? [{ group: "Occupational health", rows: oh.map((x) => ({ label: x.name, detail: "Client and onboarding", target: { page: "OccHealth", tab: "clients", params: { client: x.id } } as NavTarget })) }] : []),
    { group: "Retention emails", rows: emails.map((e) => ({ label: e.subject, detail: `Sent ${fmtDate(e.sentAt)} to ${e.toName}`, target: { page: "Sales", tab: "recall" } as NavTarget })) },
    { group: "Coming up", rows: events.map((e) => ({ label: e.title, detail: fmtDate(e.date), target: e.link })) },
  ];
}

export function CompanyJourney({ c, state }: { c: Company; state: PhState }) {
  const nav = useNav();
  if (c.kind !== "client") return null;
  const groups = companyRecords(state, c);
  const key = state.companies.some((x) => x.id === c.id) ? c.id : journeyKeyForCompany(state, c.name);
  return (
    <div className="cj">
      {key ? <JourneyStrip client={key} compact /> : null}
      <div className="cj-top">
        <span className="ph-eyebrow ph-grow">Everything for {c.name}</span>
        {key ? <Button size="sm" variant="primary" icon="flag" onClick={() => nav.go({ page: "Clients", tab: "journey", params: { who: key } })}>Open client journey</Button> : null}
      </div>
      <dl className="cj-list">
        {groups.map((g) => (
          <div key={g.group} className="cj-row">
            <dt>{g.group}</dt>
            <dd>{g.rows.length ? g.rows.map((r, i) => (
              <button key={i} type="button" className="cj-link" onClick={() => nav.go(r.target)}><b>{r.label}</b><span>{r.detail}</span></button>
            )) : <span className="cj-none">None held in the demo</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
