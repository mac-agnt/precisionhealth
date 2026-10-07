/* Client (employer) portal preview. A separate responsive preview for the client's HR or wellbeing
   contact, like the participant portal: a full-viewport overlay with a client switcher and a
   device-width toggle. Aggregate figures only, from the shared selectors, with the employer
   reporting suppression rules. No names, no row-level data, no results, no drill-through.
   It does not change the demo persona; every figure here is persona-independent. */
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND, HEALTH_INFO_PATTERN, PROGRAMME_BY_ID, exportMetrics, fmtDate, fmtDateTime, fmtWeekdayDate, staffName } from "../../model";
import type { EmployerReport, ProgrammeId } from "../../model";
import { usePhState } from "../../store";
import { BrandLogo } from "../../shell/Brand";
import { Avatar, Button, Card, Chip, DemoTag, EmptyState, Icon, Pill, Segmented } from "../../ui";
import type { Tone } from "../../ui";
import { useMeasure } from "../Participants/shared";
import { PrintableReport } from "../Reporting/ExportViews";
import type { ExportInput } from "../Reporting/ExportViews";
import { usePrintOnly } from "../Portal/parts";
import "../Portal/portal.css";
import "./client.css";
import type { ClientView } from "./data";
import {
  CLIENT_PROGRAMMES, CLIENT_VIEWS, announcementText, bookingUptake, clientContact, isApprovedReport, precisionContacts, programmeFunnel, suppressionNotices, upcomingClinicDays,
} from "./data";

type DeviceId = "desktop" | "tablet" | "phone";
const DEVICES: Array<{ id: DeviceId; label: string; width: number }> = [
  { id: "desktop", label: "Desktop", width: 0 },
  { id: "tablet", label: "Tablet 768", width: 768 },
  { id: "phone", label: "Phone 375", width: 375 },
];
type Bp = "phone" | "tablet" | "desktop";

export function ClientPortalPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [programmeId, setProgrammeId] = useState<ProgrammeId>("PRG-SISK-26");
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [views, setViews] = useState<Partial<Record<ProgrammeId, ClientView>>>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [measureOverlay, overlayW] = useMeasure<HTMLDivElement>();
  const overlayEl = useRef<HTMLDivElement | null>(null);
  const stageEl = useRef<HTMLDivElement | null>(null);
  const setOverlay = useCallback((el: HTMLDivElement | null) => { overlayEl.current = el; measureOverlay(el); }, [measureOverlay]);

  useEffect(() => { if (open) overlayEl.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  const view = views[programmeId] || "overview";
  const setView = (v: ClientView) => { setViews((x) => ({ ...x, [programmeId]: v })); stageEl.current?.scrollTo({ top: 0 }); };
  const deviceW = DEVICES.find((x) => x.id === device)!.width;
  const compact = !!overlayW && overlayW < 760;
  const tight = !!overlayW && overlayW < 480;
  const controlsVisible = !compact || optionsOpen;

  return (
    <div className="pp-overlay" ref={setOverlay} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Client portal preview">
      <header className="pp-chrome">
        <div className="pp-chrome-title">
          <span className="cp-chrome-icon"><Icon name="users" size={15} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, color: "var(--ink)", fontSize: 13.5 }}>Client portal preview</span>
            <span className="ph-faint" style={{ display: "block", fontSize: 11 }}>{compact ? "Employer view, aggregate only" : "Employer view for the client's HR or wellbeing contact. Aggregate only. A simulation, not authentication."}</span>
          </span>
        </div>
        {compact ? <Button size="sm" variant="ghost" icon={optionsOpen ? "chevronDown" : "filter"} aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)}>Options</Button> : null}
        {compact ? <Button size="sm" variant="primary" icon="x" onClick={onClose}>Close</Button> : null}
        {controlsVisible ? (
          <>
            <div className="pp-chrome-group" role="group" aria-label="Client" style={compact ? { flexBasis: "100%" } : undefined}>
              <span className="ph-faint" style={{ fontSize: 11 }}>Client</span>
              {CLIENT_PROGRAMMES.map((id) => (
                <Chip key={id} on={programmeId === id} onClick={() => { setProgrammeId(id); stageEl.current?.scrollTo({ top: 0 }); }}>{PROGRAMME_BY_ID[id].clientName}</Chip>
              ))}
            </div>
            <div className="pp-chrome-group" style={compact ? { flexBasis: "100%" } : { marginLeft: "auto" }}>
              <Segmented label="Device width" value={device} onChange={(v) => setDevice(v)} options={DEVICES.map((x) => ({ id: x.id, label: x.label }))} />
              {!compact ? <Button size="sm" variant="primary" icon="x" onClick={onClose}>Close preview</Button> : null}
            </div>
          </>
        ) : null}
      </header>
      <div className={"pp-stage" + (tight ? " tight" : "")} ref={stageEl}>
        <div className="pp-stage-row">
          <div className={`pp-device pp-device-${device}`} style={deviceW ? { width: deviceW } : undefined}>
            <ClientApp key={programmeId} programmeId={programmeId} view={view} setView={setView} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientApp({ programmeId, view, setView }: { programmeId: ProgrammeId; view: ClientView; setView: (v: ClientView) => void }) {
  const threshold = usePhState().settings.suppressionThreshold;
  const [ref, width] = useMeasure<HTMLDivElement>();
  const bp: Bp = !width || width < 560 ? "phone" : width < 900 ? "tablet" : "desktop";
  const p = PROGRAMME_BY_ID[programmeId];
  const contact = clientContact(programmeId);
  const side = bp === "desktop";
  const nav = (cls: string) => (
    <nav className={cls} aria-label="Client portal sections">
      {CLIENT_VIEWS.map((v) => (
        <button key={v.id} type="button" className="pp-nav-btn" aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
          <Icon name={v.icon} size={14} />{v.label}
        </button>
      ))}
    </nav>
  );
  return (
    <div ref={ref} className={`pp-app cp-app pp-bp-${bp}${side ? " pp-with-side" : ""}`} data-bp={bp}>
      {side ? (
        <aside className="pp-sidebar">
          <BrandLogo height={36} />
          <div className="pp-sidebar-sub">Client portal</div>
          <div className="pp-eyebrow" style={{ margin: "22px 0 8px" }}>{p.clientName}</div>
          {nav("pp-sidenav")}
          <div className="pp-sidebar-foot">
            <strong>Aggregate only</strong>
            <span>Your organisation sees grouped figures, never an individual's details or results.</span>
          </div>
        </aside>
      ) : null}
      <div className="pp-body">
        <header className="pp-head">
          {side ? null : <BrandLogo height={bp === "phone" ? 28 : 32} />}
          <div className="ph-grow pp-crumb" style={{ minWidth: 0 }}>
            <span className="pp-crumb-a">Client portal</span>
            {bp === "phone" ? null : <><span aria-hidden="true">/</span><span>{p.clientName}</span></>}
          </div>
          {contact ? (
            <div className="pp-row" style={{ gap: 9, flex: "none" }}>
              {bp === "phone" ? null : (
                <div className="pp-head-name">
                  <span style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>{contact.name}</span>
                  <span className="pp-small">{contact.role}</span>
                </div>
              )}
              <Avatar name={contact.name} size={30} />
            </div>
          ) : null}
        </header>
        {side ? null : nav("pp-nav")}
        <main className="pp-main">
          <div className="cp-banner" role="note">
            <Icon name="shield" size={15} />
            <span><strong>Aggregate view. Your organisation never sees individual results.</strong> Groups smaller than {threshold} people are hidden. There is no list of names and no way to drill down to a person.</span>
          </div>
          {view === "share" ? <SharePage programmeId={programmeId} />
            : view === "reports" ? <ReportsPage programmeId={programmeId} />
              : view === "support" ? <SupportPage programmeId={programmeId} />
                : <OverviewPage programmeId={programmeId} go={setView} />}
        </main>
        <footer className="pp-foot">
          <span>Fictional design data. Client and contact names are demo labels. Aggregate figures only, from the synthetic dataset.</span>
          <span>Precision Health · Client portal</span>
        </footer>
      </div>
    </div>
  );
}

function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div>
      <div className="pp-eyebrow">{eyebrow}</div>
      <h1 className="pp-title">{title}</h1>
      {sub ? <p className="pp-lead">{sub}</p> : null}
    </div>
  );
}

/* ---- programme overview ---- */
function OverviewPage({ programmeId, go }: { programmeId: ProgrammeId; go: (v: ClientView) => void }) {
  const state = usePhState();
  const p = PROGRAMME_BY_ID[programmeId];
  const f = programmeFunnel(state, programmeId);
  const up = bookingUptake(state, programmeId);
  const days = upcomingClinicDays(state, programmeId);
  const threshold = state.settings.suppressionThreshold;
  return (
    <>
      <PageHead eyebrow="Programme overview" title={p.name} sub={`${fmtDate(p.windowStart)} to ${fmtDate(p.windowEnd)} · ${p.sites.join(" and ")}. Live figures at ${fmtDateTime(state.clock.nowUtc)}.`} />
      <div className="cp-tiles">
        {f.tiles.map((t) => (
          <div key={t.key} className="cp-tile">
            <div className="pp-eyebrow">{t.label}</div>
            <div className="cp-tile-value">{t.value}</div>
            <div className="pp-small">{t.rate ? <><strong style={{ color: "var(--ink)" }}>{t.rate}</strong> </> : null}{t.sub}</div>
          </div>
        ))}
      </div>
      <div className="pp-callout" role="note">
        <Icon name="info" size={14} style={{ marginTop: 2, color: "var(--accent)" }} />
        <span>{f.notBooked} invited employees have not booked yet. A reminder to everyone helps; we never tell you who. <button type="button" className="ph-link" onClick={() => go("share")}>Share the booking link</button></span>
      </div>
      <div className="pp-grid pp-grid-main">
        <Card>
          <h2 className="pp-h3" style={{ fontSize: 15 }}>Booking uptake by week</h2>
          <p className="pp-small" style={{ marginTop: 0 }}>Confirmed bookings by the week they were made. The weeks add up to the {up.total} booked above.</p>
          {up.weeks.length ? (
            <ul className="cp-bars" aria-label="Bookings made per week">
              {up.weeks.map((w) => (
                <li key={w.weekStart} className="cp-bar-row">
                  <span className="cp-bar-label">{w.label}</span>
                  <span className="cp-bar-track" aria-hidden="true">
                    {w.suppressed ? <span className="cp-bar-supp" /> : <span className="cp-bar-fill" style={{ width: `${((w.count || 0) / up.max) * 100}%` }} />}
                  </span>
                  <span className="cp-bar-value">{w.suppressed ? `fewer than ${threshold}${w.complementary ? "*" : ""}` : w.count}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No bookings yet" icon="calendar">Bookings appear here as employees book.</EmptyState>}
          {up.anySuppressed ? <p className="pp-small" style={{ margin: "10px 0 0" }}>Weeks with fewer than {threshold} bookings are hidden. * Also hidden so the hidden week cannot be worked out from the total.</p> : null}
        </Card>
        <Card>
          <h2 className="pp-h3" style={{ fontSize: 15 }}>Upcoming clinic days</h2>
          <p className="pp-small" style={{ marginTop: 0 }}>Free capacity per site. Who has booked is never shown.</p>
          {days.length ? (
            <ul className="cp-days">
              {days.map((x) => {
                const pct = x.slots ? Math.round(((x.slots - x.available) / x.slots) * 100) : 0;
                return (
                  <li key={x.id} className="cp-day">
                    <div className="pp-row" style={{ flexWrap: "wrap", gap: 6 }}>
                      <span className="ph-grow" style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtWeekdayDate(x.date)}{x.isToday ? " (today)" : ""}</span>
                      <span className="pp-small"><strong style={{ color: "var(--ink)" }}>{x.available}</strong> of {x.slots} free</span>
                    </div>
                    <div className="pp-small">{x.site}{x.room ? ` · ${x.room}` : ""}</div>
                    <div className="cp-cap" role="img" aria-label={`${pct}% of times taken, ${x.available} free`}><span style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="No clinic days left" icon="calendar">All clinic days for this programme have taken place.</EmptyState>}
        </Card>
      </div>
      <p className="pp-small" style={{ margin: 0 }}>These are the same figures Precision Health sees on its programme dashboard. A count below {threshold} is shown as "fewer than {threshold}". Released reports are counted once a doctor has released them to the participant.</p>
    </>
  );
}

/* ---- share booking link ---- */
function SharePage({ programmeId }: { programmeId: ProgrammeId }) {
  const state = usePhState();
  const p = PROGRAMME_BY_ID[programmeId];
  const contact = clientContact(programmeId);
  const codes = state.invitationCodes.filter((c) => c.programmeId === programmeId && c.status === "active");
  const main = codes.find((c) => c.code === p.inviteCode) || codes[0];
  const link = main ? main.linkText : `portal.precisionhealth.example.invalid/i/${p.inviteCode}`;
  const minutes = 15;
  const text = announcementText({
    client: p.clientName, window: `${fmtDate(p.windowStart)} and ${fmtDate(p.windowEnd)}`, place: p.sites.join(" or "), link, code: main?.code || p.inviteCode, minutes,
    sender: contact?.name || `${p.clientName} HR`, role: (contact?.role || "").replace(/\s*\(fictional\)/, ""), support: BRAND.email,
  });
  const clean = !HEALTH_INFO_PATTERN.test(text);
  const [copied, setCopied] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const copy = (what: string) => {
    if (what === "text") { textRef.current?.focus(); textRef.current?.select(); }
    setCopied(what);
  };
  return (
    <>
      <PageHead eyebrow="Share booking link" title="Invite your employees to book" sub="Send the link and code to everyone on the programme. Each person books privately and you never see who has booked." />
      <div className="pp-grid pp-grid-2">
        <Card>
          <h2 className="pp-h3">Booking link and code</h2>
          <div className="cp-code" aria-label="Programme invitation code">{main?.code || p.inviteCode}</div>
          <div className="cp-link">{link}</div>
          <p className="pp-small" style={{ margin: "8px 0 0" }}>{main ? `${main.label}. Valid until ${fmtDate(main.expiresOn)}.` : ""} Fictional address: the link does not open.</p>
          <div className="pp-wrap" style={{ marginTop: 12 }}>
            <Button icon="link" onClick={() => copy("link")}>Copy link</Button>
            <Button onClick={() => copy("code")}>Copy code</Button>
          </div>
          {copied === "link" || copied === "code" ? <p className="pp-small" role="status" style={{ margin: "8px 0 0" }}>Copied (simulated). In the live portal the {copied} goes to your clipboard.</p> : null}
          {codes.length > 1 ? (
            <>
              <hr className="pp-hr" />
              <h3 className="pp-h3">Other active codes</h3>
              <ul className="pp-small" style={{ margin: 0, paddingLeft: 18 }}>
                {codes.filter((c) => c !== main).map((c) => <li key={c.id}><strong style={{ color: "var(--ink)" }}>{c.code}</strong>: {c.label}, valid until {fmtDate(c.expiresOn)}</li>)}
              </ul>
            </>
          ) : null}
        </Card>
        <Card>
          <h2 className="pp-h3">Please keep it voluntary and private</h2>
          <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            <li>Taking part is each employee's choice.</li>
            <li>Please don't ask colleagues whether they booked, attended or what their report said.</li>
            <li>Send reminders to everyone on the programme, never to named individuals.</li>
            <li>Booking questions go to Precision Health at {BRAND.email}.</li>
          </ul>
        </Card>
      </div>
      <Card>
        <div className="pp-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <h2 className="pp-h3 ph-grow" style={{ margin: 0 }}>Ready-to-send announcement</h2>
          {clean ? <Pill tone="ok" icon="check">Checked: no health information</Pill> : <Pill tone="warn" icon="alert">Contains health wording</Pill>}
        </div>
        <label className="ph-label" htmlFor="cp-announce">Email or intranet text</label>
        <textarea id="cp-announce" ref={textRef} className="ph-input cp-announce" readOnly value={text} rows={18} />
        <div className="pp-wrap" style={{ marginTop: 10 }}>
          <Button variant="primary" icon="send" onClick={() => copy("text")}>Copy text</Button>
          {copied === "text" ? <span className="pp-small" role="status">Copied (simulated). The text is selected, so you can also copy it yourself.</span> : <DemoTag>Simulated</DemoTag>}
        </div>
      </Card>
    </>
  );
}

/* ---- reports ---- */
const REPORT_STATUS: Record<EmployerReport["status"], { label: string; tone: Tone }> = {
  draft: { label: "Draft, awaiting clinical approval", tone: "neutral" },
  reviewed: { label: "Disclosure reviewed, awaiting clinical approval", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  exported: { label: "Approved and exported", tone: "ok" },
};

function ReportsPage({ programmeId }: { programmeId: ProgrammeId }) {
  const state = usePhState();
  const p = PROGRAMME_BY_ID[programmeId];
  const reports = state.employerReports.filter((r) => r.programmeId === programmeId).slice().sort((a, b) => b.version - a.version);
  const [print, printNode] = usePrintOnly();
  const threshold = state.settings.suppressionThreshold;
  return (
    <>
      <PageHead eyebrow="Reports" title="Programme reports" sub={`Aggregate reports for ${p.name}, prepared by Precision Health from released reports only. A report reaches you only after a Precision Health doctor approves it.`} />
      {!reports.length ? (
        <Card>
          <EmptyState title="No programme report yet" icon="file">Precision Health prepares an aggregate report from released results. It appears here once a doctor has approved it, usually at the end of the programme.</EmptyState>
        </Card>
      ) : reports.map((r) => {
        const approved = isApprovedReport(r);
        const st = REPORT_STATUS[r.status];
        const m = approved ? exportMetrics(state, r) : null;
        const x: ExportInput | null = m ? {
          report: r, metrics: m, programmeName: p.name, clientName: p.clientName, approverName: staffName(state, r.approvedBy),
          threshold, snapshotAt: r.snapshot ? r.snapshot.at : r.dataAsOf,
        } : null;
        return (
          <Card key={r.id}>
            <div className="pp-row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
              <div className="ph-grow" style={{ minWidth: 0 }}>
                <h2 className="pp-h3" style={{ fontSize: 15, margin: 0 }}>{r.title}</h2>
                <div className="pp-small">{fmtDate(r.periodStart)} to {fmtDate(r.periodEnd)} · Version {r.version}</div>
              </div>
              <Pill tone={st.tone} icon={approved ? "check" : "clock"}>{st.label}</Pill>
            </div>
            {approved && m && x ? (
              <>
                <div className="cp-report-meta">
                  <div><span className="pp-small">Cohort</span><strong>{m.cohortLabel}</strong></div>
                  <div><span className="pp-small">Released reports in the cohort</span><strong>{m.sizeLabel}</strong></div>
                  <div><span className="pp-small">Approved by</span><strong>{x.approverName}{r.approvedAt ? `, ${fmtDate(r.approvedAt)}` : ""}</strong></div>
                  <div><span className="pp-small">Snapshot</span><strong>{fmtDateTime(x.snapshotAt)}</strong></div>
                </div>
                <div className="cp-notices" role="note">
                  <div className="pp-row" style={{ gap: 6, color: "var(--ink)", fontWeight: 600, fontSize: 12.5 }}><Icon name="shield" size={13} />Small-group protection</div>
                  <ul>{suppressionNotices(m, threshold).map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
                <div className="pp-wrap" style={{ marginTop: 12 }}>
                  <Button variant="primary" icon="down" onClick={() => print(<div className="cp-print-paper"><PrintableReport x={x} /></div>)}>Download PDF</Button>
                  <span className="pp-small">Opens your browser's print dialogue. Choose Save as PDF there.</span>
                </div>
              </>
            ) : (
              <div className="cp-awaiting">
                <Icon name="clock" size={14} />
                <span><strong>Awaiting clinical approval.</strong> A Precision Health doctor checks every figure and the small-group protection before the report is released to you. No figures are shown until then.</span>
              </div>
            )}
          </Card>
        );
      })}
      <p className="pp-small" style={{ margin: 0 }}>Every report uses released results only. Groups smaller than {threshold} are hidden, and a report needs at least {state.settings.minCohort} people. No report contains names, individual rows or personal results.</p>
      {printNode}
    </>
  );
}

/* ---- support ---- */
function SupportPage({ programmeId }: { programmeId: ProgrammeId }) {
  const p = PROGRAMME_BY_ID[programmeId];
  const contact = clientContact(programmeId);
  const people = precisionContacts();
  return (
    <>
      <PageHead eyebrow="Support" title="Precision Health contacts" sub="Who to talk to about your programme." />
      <div className="pp-grid pp-grid-2">
        {people.map((c) => (
          <Card key={c.id}>
            <div className="pp-row" style={{ gap: 10, alignItems: "flex-start" }}>
              <Avatar name={c.name} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontWeight: 600 }}>{c.name}</div>
                <div className="pp-small">{c.role}</div>
                <div className="pp-small" style={{ marginTop: 6 }}><a className="ph-link" href={`mailto:${c.email}`}>{c.email}</a></div>
                {c.phone ? <div className="pp-small">{c.phone}</div> : null}
              </div>
            </div>
          </Card>
        ))}
        <Card>
          <h2 className="pp-h3">We can help with</h2>
          <ul className="pp-small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>Clinic days, sites and capacity</li>
            <li>Invitation codes and the booking link</li>
            <li>When the programme report will be ready</li>
          </ul>
          <h2 className="pp-h3" style={{ marginTop: 14 }}>We can't share</h2>
          <p className="pp-small" style={{ margin: 0 }}>Whether a named employee booked or attended, or anything from their report. Please ask employees to contact us directly with personal questions.</p>
        </Card>
      </div>
      {contact ? (
        <Card>
          <h2 className="pp-h3">Signed in as</h2>
          <p className="pp-small" style={{ margin: 0 }}>{contact.name}, {contact.role}, {p.clientName}. {contact.email}. This contact has no clinical access.</p>
        </Card>
      ) : null}
    </>
  );
}
