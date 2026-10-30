/* Demo guide: every part of Pulse for Precision Health one click away, in the order to show it on a
   call, with the booking code ready to copy. Opens pages and portals through the app's own navigation. */
import { useState } from "react";
import type { NavTarget } from "../../model";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Icon, PageHeader, Pill } from "../../ui";
import type { GlyphName } from "../../ui";

const CODE = "DEMO-IBM-26";
interface Item { title: string; what: string; icon: GlyphName; to?: NavTarget; portal?: "ronan" | "booking" | "nurse" | "client"; isNew?: boolean }

const SIGN_OFF: Array<{ title: string; items: Item[] }> = [
  { title: "Priority 1: Neil's sign-off items", items: [
    { title: "1. Screening day setup", what: "Type a sentence, the agent builds the day. Edit in plain English, read the HR reply, publish to the client portal.", icon: "calendar", to: { page: "Clinics", tab: "days" }, isNew: true },
    { title: "2. Lab CSV import", what: "Drop the lab file. Name, date of birth and Precision ID must all match. Mismatches go to a side-by-side queue.", icon: "layers", to: { page: "Results", tab: "imports" }, isNew: true },
    { title: "2. Mismatch queue", what: "Each flagged lab row next to the closest patient, with Match or Reject. Also flagged on the admin home.", icon: "alert", to: { page: "Results", tab: "imports", params: { view: "queue" } }, isNew: true },
    { title: "3. Point of care, same day", what: "Nurse enters cholesterol and HbA1c on the day. Choose Anita's point of care clinic, complete, then release today.", icon: "heart", portal: "nurse", isNew: true },
    { title: "3. Awaiting lab", what: "Lab screens stay Awaiting lab until the CSV is matched.", icon: "clock", to: { page: "Results", tab: "inbox", params: { queue: "awaiting" } }, isNew: true },
    { title: "4. Approve and release", what: "Staff approve and release, logged with name and time. Agents can draft wording but never change results.", icon: "shield", to: { page: "Results", tab: "review" }, isNew: true },
  ] },
  { title: "Priority 2: Filling the gaps", items: [
    { title: "5. Nurse entry screen", what: "What the participant told us, reviewed with them, then measurements banded live from Neil's ranges.", icon: "edit", portal: "nurse", isNew: true },
    { title: "6. Client (HR) portal", what: "Published screening dates with the room, invite link and codes, and live invited, booked, attended and released counts.", icon: "users", portal: "client", isNew: true },
    { title: "7. Participant portal", what: "Ronan Walsh: room on the appointment card, his results, and how the green and yellow ranges are set.", icon: "user", portal: "ronan", isNew: true },
    { title: "Neil's reference ranges", what: "The ranges behind every colour, versioned, with a test run that builds a report.", icon: "flask", to: { page: "Screening", tab: "ranges" } },
  ] },
  { title: "Priority 3: Sales, onboarding, retention", items: [
    { title: "8. Inbound lead, 10 minute timer", what: "Work as Stephen: the new lead counts down on Home. Agent drafts the first email, notes feed the proposal.", icon: "flag", to: { page: "Sales", tab: "pipeline", params: { lead: "LD-0020" } }, isNew: true },
    { title: "8. Proposal generator", what: "Package, headcount, auto price, upsells and deal instructions. Then the weekly soft follow ups and Mark as won.", icon: "file", to: { page: "Sales", tab: "proposals" }, isNew: true },
    { title: "9. Onboarding", what: "Occupational Health or Wellness: details, DSA and SLA, team routing, MediBase task and Xero.", icon: "check", to: { page: "Sales", tab: "onboarding" }, isNew: true },
    { title: "10. Retention", what: "Results out emails to HR, rebooking reminders 3 months ahead, contact left company, rebooking rate, branded templates.", icon: "refresh", to: { page: "Sales", tab: "recall" }, isNew: true },
    { title: "11. Staff management", what: "Onboarding, contracts and training. Marked Phase 2.", icon: "users", to: { page: "Records", tab: "staff" } },
  ] },
];
const PLATFORM: Item[] = [
  { title: "Home", what: "Ask Pulse anything. Answers link to the records behind them.", icon: "home", to: { page: "Home" } },
  { title: "Doctor Review: Advice Codes", what: "The clinician viewer and NEW ADVICE box. Type a code like CHOL-HI to insert approved wording.", icon: "edit", to: { page: "Results", tab: "review", params: { episode: "PH-E-0201" } } },
  { title: "Price list", what: "Every package with a quick quote calculator.", icon: "chart", to: { page: "Sales", tab: "price-list" } },
  { title: "Flu", what: "Weekly bookings, vaccine stock against allocations, and the cold chain.", icon: "shield", to: { page: "Flu", tab: "overview" } },
  { title: "Occupational Health", what: "Client onboarding, agreements, questionnaires and MediBase sessions.", icon: "users", to: { page: "OccHealth", tab: "clients" } },
  { title: "Portal Administration", what: "Participant accounts, content, message templates and the portal log.", icon: "user", to: { page: "Participants", tab: "portal-admin" } },
  { title: "Automations", what: "How each flow runs today (Jotform, Esendex, Monday.com) and how Pulse runs it.", icon: "refresh", to: { page: "Work", tab: "automations" } },
  { title: "Form Builder", what: "Booking, consent and nurse forms built in Pulse instead of Jotform. Preview as a form.", icon: "file", to: { page: "Programmes", tab: "forms-templates" } },
  { title: "Systems & Integrations", what: "Every system Precision uses today and how each connects.", icon: "link", to: { page: "Settings", tab: "systems-integrations" } },
];
const PORTALS: Item[] = [
  { title: "Participant Portal: My Results", what: "Ronan Walsh's released report as clear charts. Choose My Results.", icon: "chart", portal: "ronan" },
  { title: "Participant Portal: Booking Journey", what: "Orla books her screening: code, details, consent, questionnaire, then a time slot.", icon: "calendar", portal: "booking" },
  { title: "Nurse Portal", what: "Clinic day: check in, what they told us, measurements, point of care results and sign-off.", icon: "heart", portal: "nurse" },
  { title: "Client / Employer Portal", what: "HR sees screening dates, rooms and programme figures only. No names, no individual results.", icon: "users", portal: "client" },
];
const ORDER = ["Screening day setup", "Lab CSV import", "Nurse portal (point of care)", "Approve and release", "Client portal", "Participant portal", "Sales and onboarding"];

export default function Demo() {
  const nav = useNav();
  const [copied, setCopied] = useState(false);
  const open = (i: Item) => {
    if (i.to) return nav.go(i.to);
    if (i.portal === "ronan") return nav.openPortal("PH-P-0501");
    if (i.portal === "booking") return nav.openPortal("PH-P-0801");
    if (i.portal === "nurse") return nav.openNursePortal?.();
    if (i.portal === "client") return nav.openClientPortal?.();
  };
  const copy = () => { try { void navigator.clipboard.writeText(CODE); setCopied(true); } catch { /* clipboard unavailable */ } };
  const card = (i: Item) => (
    <button key={i.title} type="button" className="dg-card" onClick={() => open(i)}>
      <span className="dg-icon"><Icon name={i.icon} size={17} /></span>
      <span className="dg-body"><span className="dg-title">{i.title}{i.isNew ? <Pill tone="brand" style={{ marginLeft: 8 }}>New</Pill> : null}</span><span className="dg-what">{i.what}</span></span>
      <span className="dg-open">Open <Icon name="arrow" size={13} /></span>
    </button>);
  return (
    <div className="ph-page">
      <style>{`
        .dg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
        .dg-card { display: flex; align-items: center; gap: 14px; text-align: left; padding: 14px 16px; border-radius: var(--r-md, 14px); border: 1px solid var(--border); background: var(--surface); color: inherit; font: inherit; cursor: pointer; transition: border-color .15s, transform .15s; }
        .dg-card:hover { border-color: var(--accent); transform: translateY(-1px); }
        .dg-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .dg-icon { flex: none; width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
        .dg-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .dg-title { color: var(--ink); font-weight: 600; font-size: 13.5px; display: flex; align-items: center; }
        .dg-what { color: var(--dim); font-size: 12px; line-height: 1.45; }
        .dg-open { flex: none; color: var(--accent); font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
        .dg-code { font-family: var(--mono, ui-monospace, monospace); font-size: 22px; font-weight: 600; letter-spacing: .06em; color: var(--ink); }
        .dg-order { display: flex; flex-wrap: wrap; gap: 6px 4px; align-items: center; font-size: 12.5px; color: var(--body); }
      `}</style>
      <PageHeader eyebrow="Demo" title="Demo guide" sub="Everything in Pulse for Precision Health, one click away. Synthetic data only: nothing is sent, uploaded or stored outside this browser tab." />
      <div className="ph-stack" style={{ gap: 16 }}>
        <div className="flu-grid-2" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 14 }}>
          <Card>
            <CardHeader title="Suggested order for the call" />
            <div className="dg-order">{ORDER.map((o, i) => <span key={o} className="ph-row-flex" style={{ gap: 4 }}><span className="ph-num ph-faint">{i + 1}.</span>{o}{i < ORDER.length - 1 ? <Icon name="chevronRight" size={12} style={{ color: "var(--faint)" }} /> : null}</span>)}</div>
          </Card>
          <Card>
            <CardHeader title="Booking journey demo code" right={<Button size="sm" icon={copied ? "check" : "file"} onClick={copy}>{copied ? "Copied" : "Copy"}</Button>} />
            <div className="dg-code">{CODE}</div>
          </Card>
        </div>
        <div>
          {SIGN_OFF.map((g) => (
            <div key={g.title} style={{ marginBottom: 16 }}>
              <h2 className="ph-h1" style={{ fontSize: 15, margin: "4px 0 10px" }}>{g.title}</h2>
              <div className="dg-grid">{g.items.map(card)}</div>
            </div>))}
          <h2 className="ph-h1" style={{ fontSize: 15, margin: "4px 0 10px" }}>Everything else</h2>
          <div className="dg-grid">{PLATFORM.map(card)}</div>
        </div>
        <div>
          <h2 className="ph-h1" style={{ fontSize: 15, margin: "4px 0 10px" }}>User portals</h2>
          <div className="dg-grid">{PORTALS.map(card)}</div>
          <div className="ph-faint" style={{ fontSize: 12, marginTop: 8 }}>Portals open over the platform. Close a portal to come back here.</div>
        </div>
      </div>
    </div>
  );
}
