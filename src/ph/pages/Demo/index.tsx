/* Demo guide: every part of Pulse for Precision Health one click away, in the order to show it on a
   call, with the booking code ready to copy. Opens pages and portals through the app's own navigation. */
import { useState } from "react";
import type { NavTarget } from "../../model";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Icon, PageHeader, Pill } from "../../ui";
import type { GlyphName } from "../../ui";

const CODE = "DEMO-IBM-26";
interface Item { title: string; what: string; icon: GlyphName; to?: NavTarget; portal?: "participant-results" | "booking" | "nurse" | "client"; isNew?: boolean }

const PLATFORM: Item[] = [
  { title: "Home", what: "Ask Pulse anything. Answers link to the records behind them.", icon: "home", to: { page: "Home" } },
  { title: "Health Screening", what: "Neil's reference ranges, versioned, with a live test run of the results process.", icon: "flask", to: { page: "Screening", tab: "check" }, isNew: true },
  { title: "Sales CRM", what: "Every lead and client in one filterable list, plus pipeline, proposals, price list, recall and Irish Life Health.", icon: "chart", to: { page: "Sales", tab: "crm" }, isNew: true },
  { title: "Doctor Review: Advice Codes", what: "The clinician viewer and NEW ADVICE box. Type a code like CHOL-HI to insert approved wording.", icon: "edit", to: { page: "Results", tab: "review", params: { episode: "PH-E-0201" } } },
  { title: "Lab Import", what: "The Eurofins batch: 114 imported, 3 duplicates skipped, 3 identity exceptions for a person to resolve.", icon: "layers", to: { page: "Results", tab: "imports", params: { batch: "BATCH-20261002-01" } } },
  { title: "Flu", what: "Weekly bookings, vaccine stock against allocations, and the cold chain.", icon: "shield", to: { page: "Flu", tab: "overview" } },
  { title: "Occupational Health", what: "Client onboarding, agreements, questionnaires and Meddbase sessions.", icon: "users", to: { page: "OccHealth", tab: "clients" } },
  { title: "Portal Administration", what: "Participant accounts, content, message templates and the portal log.", icon: "user", to: { page: "Participants", tab: "portal-admin" } },
  { title: "Automations", what: "16 flows: how each runs today (Jotform, Esendex, Monday.com) and how Pulse runs it.", icon: "refresh", to: { page: "Work", tab: "automations" } },
  { title: "Form Builder", what: "Booking, consent and nurse forms built in Pulse instead of Jotform.", icon: "file", to: { page: "Programmes", tab: "forms-templates" } },
  { title: "Systems & Integrations", what: "Every system Precision uses today and how each connects.", icon: "link", to: { page: "Settings", tab: "systems-integrations" } },
];
const PORTALS: Item[] = [
  { title: "Participant Portal: My Results", what: "Eamon Gordon's released report as clear charts. Choose My Results.", icon: "chart", portal: "participant-results" },
  { title: "Participant Portal: Booking Journey", what: "Orla books her screening: code, details, consent, questionnaire, then a time slot.", icon: "calendar", portal: "booking" },
  { title: "Nurse Portal", what: "Clinic day: check in, the nurse form section by section, sign-off and courier manifest.", icon: "heart", portal: "nurse" },
  { title: "Client / Employer Portal", what: "HR sees programme figures and approved reports only. No names, no individual results.", icon: "users", portal: "client" },
];
const ORDER = ["Home", "Health Screening (Test run)", "Doctor Review", "Participant Portal: My Results", "Booking Journey", "Nurse Portal", "Employer Portal", "Sales CRM"];

export default function Demo() {
  const nav = useNav();
  const [copied, setCopied] = useState(false);
  const open = (i: Item) => {
    if (i.to) return nav.go(i.to);
    if (i.portal === "participant-results") return nav.openPortal("PH-P-0095");
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
          <h2 className="ph-h1" style={{ fontSize: 15, margin: "4px 0 10px" }}>Staff platform</h2>
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
