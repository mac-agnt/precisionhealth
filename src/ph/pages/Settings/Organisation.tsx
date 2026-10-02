/* Settings, Organisation: public Precision Health details, the demo time zone and clock,
   the clinic day configuration (slots are derived, never typed) and the fictional programme
   configuration. Legal particulars are read-only here and are not changed anywhere else. */
import type { ReactNode } from "react";
import {
  BRAND, CLINIC_DAY, TZ, buildSlots, daysBetween, fmtDate, fmtDateLong, fmtNumericDate, fmtTime, hhmmToMinutes, programmeCounts, sessionCounts,
} from "../../model";
import type { Hhmm, PhState, Programme } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Card, CardHeader, DemoTag, EntityLink, Pill } from "../../ui";
import { BrandLogo } from "../../shell/Brand";
import { DefList, SettingsHeader } from "./common";

const BRAND_COLOURS: Array<{ name: string; hex: string; use: string }> = [
  { name: "Primary teal", hex: BRAND.teal, use: "Charts, selected navigation and restrained highlights." },
  { name: "Secondary sage", hex: BRAND.sage, use: "Secondary chart series and quiet highlights." },
  { name: "Pale mint", hex: BRAND.mint, use: "Soft accents." },
  { name: "Dark teal", hex: BRAND.darkTeal, use: "Primary buttons and selected text, with contrasting text." },
  { name: "Deep teal", hex: BRAND.deepTeal, use: "Deep accents." },
];

const SERVICES = ["Workplace screening", "Corporate wellness", "Occupational health", "Vaccination programmes", "Cardiac services", "Education and workshops", "Mobile onsite services"];

export default function Organisation() {
  const s = usePhState();
  const nav = useNav();
  const self = s.companies.find((c) => c.kind === "self");
  const leaders = s.contacts.filter((c) => self && c.companyId === self.id && c.provenance === "public" && c.id !== "ct-general");
  const now = s.clock.nowUtc;
  const moved = s.clock.preset !== "baseline";
  return (
    <div className="ph-page">
      <SettingsHeader
        gated={false}
        title="Organisation"
        sub="Public Precision Health details, the demo time zone and the fictional programme configuration. Legal particulars are read-only in this demo."
      />
      <div className="ph-stack">
        <div className="ph-split-even">
          <Card>
            <CardHeader
              title="Public company details"
              sub="Taken from the public website. Branding context, not verification of contracting details."
              right={<DemoTag title="Public website details, checked 2 October 2026">Public source</DemoTag>}
            />
            <div className="ph-row-flex" style={{ marginBottom: 14 }}>
              <BrandLogo height={44} />
              <div className="phs-note">Public logo, shown at its own proportions. A PH monogram replaces it if the image cannot load.</div>
            </div>
            <DefList items={[
              { label: "Trading name", value: <span className="phs-strong">{BRAND.org}</span> },
              { label: "Name on the public website", value: BRAND.legalName },
              { label: "Company number", value: <>{BRAND.companyNumber}<div className="phs-note">Listed in the website footer. Not verified for contracting.</div></> },
              { label: "Public location", value: BRAND.address },
              { label: "General contact", value: <>{BRAND.email}<br />{BRAND.phone}</> },
              { label: "Website", value: <span className="ph-mono">{BRAND.website}</span> },
              { label: "Public leadership", value: leaders.length ? leaders.map((c) => <div key={c.id}>{c.name}, {c.role}</div>) : "None listed" },
              { label: "Public services", value: SERVICES.map((x, i) => (i ? x.toLowerCase() : x)).join(", ") + "." },
              { label: "Occupational-health platform", value: <>Meddbase is named on the public website. Its replacement or integration has not been agreed. <EntityLink kind="system" id="meddbase">See the systems register</EntityLink></> },
            ]} />
          </Card>

          <div className="ph-stack">
            <Card>
              <CardHeader title="Product and brand layer" sub="Pulse keeps its visual system. Precision Health is applied as an accent layer." />
              <DefList items={[
                { label: "Organisation label", value: BRAND.org },
                { label: "Product label", value: BRAND.product },
                { label: "Browser title", value: <span className="ph-mono">{BRAND.title}</span> },
                { label: "Default persona", value: "Dr Neil Reddy, Medical Director" },
                { label: "Demo label", value: <DemoTag>{BRAND.demoLabel}</DemoTag> },
              ]} />
              <div style={{ marginTop: 16 }}>
                <div className="ph-eyebrow" style={{ marginBottom: 10 }}>Colours observed in the public website theme</div>
                <div className="phs-cols-2" style={{ gap: 12 }}>
                  {BRAND_COLOURS.map((c) => (
                    <div key={c.hex} className="phs-colour">
                      <span style={{ background: c.hex }} aria-hidden="true" />
                      <div style={{ minWidth: 0 }}>
                        <div className="phs-small phs-strong">{c.name} <span className="ph-mono ph-faint" style={{ fontWeight: 400 }}>{c.hex}</span></div>
                        <div className="phs-note">{c.use}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="phs-note" style={{ marginTop: 10 }}>Implementation values, not an approved brand manual. Clinical warning and error colours are never replaced by brand colours.</div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Demo time and formats"
                right={moved ? <Pill tone="warn" icon="clock">Clock moved</Pill> : <Pill tone="neutral" icon="clock">Baseline clock</Pill>}
              />
              <DefList items={[
                { label: "Display time zone", value: <>{TZ}<div className="phs-note">Timestamps are kept in UTC internally and shown in Dublin time.</div></> },
                { label: "Demo clock", value: <>{fmtDateLong(now)}, {fmtTime(now)}<div><button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Settings", tab: "experience" })}>Change it in Experience</button></div></> },
                { label: "Dates", value: `${fmtDate(now)} or ${fmtNumericDate(now)}` },
                { label: "Times", value: `24-hour, for example ${fmtTime(now)}` },
                { label: "Currency", value: "EUR. No prices, margins, turnover or contract amounts are modelled." },
              ]} />
            </Card>
          </div>
        </div>

        <ClinicDay state={s} />
        <ProgrammeConfig state={s} />
        <AppointmentTypes state={s} />
      </div>
    </div>
  );
}

/* ---- clinic day: the configuration that every slot is derived from ---- */
function ClinicDay({ state }: { state: PhState }) {
  const nav = useNav();
  const cfg = CLINIC_DAY;
  const slots = buildSlots(cfg.start, cfg.end, cfg.breaks, cfg.slotMinutes);
  const start = hhmmToMinutes(cfg.start), end = hhmmToMinutes(cfg.end);
  const open = end - start;
  const breakMin = cfg.breaks.reduce((n, b) => n + hhmmToMinutes(b.end) - hhmmToMinutes(b.start), 0);
  const bookable = slots.length * cfg.slotMinutes;
  // Lay slots and breaks out in time order, with any unused minutes shown as gaps.
  const marks = [
    ...slots.map((x) => ({ kind: "slot" as const, s: hhmmToMinutes(x.start), e: hhmmToMinutes(x.end), label: `${x.start} to ${x.end}, slot ${x.index + 1}` })),
    ...cfg.breaks.map((b) => ({ kind: "break" as const, s: hhmmToMinutes(b.start), e: hhmmToMinutes(b.end), label: `${b.start} to ${b.end}, break` })),
  ].sort((a, b) => a.s - b.s);
  const segs: Array<{ kind: "slot" | "break" | "gap"; minutes: number; label: string }> = [];
  let cursor = start;
  for (const m of marks) {
    if (m.s > cursor) segs.push({ kind: "gap", minutes: m.s - cursor, label: "Not bookable" });
    segs.push({ kind: m.kind, minutes: m.e - m.s, label: m.label });
    cursor = Math.max(cursor, m.e);
  }
  if (cursor < end) segs.push({ kind: "gap", minutes: end - cursor, label: "Not bookable" });
  const ticks: Array<{ t: Hhmm; at: number }> = [cfg.start, ...cfg.breaks.map((b) => b.start), cfg.end].map((t) => ({ t, at: ((hhmmToMinutes(t) - start) / open) * 100 }));
  const live = state.sessions.filter((x) => x.status !== "cancelled");
  const standard = live.filter((x) => x.start === cfg.start && x.end === cfg.end && x.slotMinutes === cfg.slotMinutes
    && x.breaks.length === cfg.breaks.length && x.breaks.every((b, i) => b.start === cfg.breaks[i].start && b.end === cfg.breaks[i].end)).length;
  return (
    <Card>
      <CardHeader
        title="Clinic day configuration"
        sub="Bookable slots are derived from this window, the breaks and the slot length. Breaks are never bookable."
        right={<button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Clinics", tab: "schedule" })}>Edit sessions in Clinics, Schedule</button>}
      />
      <div className="phs-day" role="img" aria-label={`Clinic day ${cfg.start} to ${cfg.end}: ${slots.length} slots of ${cfg.slotMinutes} minutes and ${cfg.breaks.length} breaks`}>
        {segs.map((g, i) => <span key={i} className={g.kind === "slot" ? "phs-slot" : g.kind === "break" ? "phs-break" : "phs-gap"} style={{ flex: g.minutes }} title={g.label} />)}
      </div>
      <div className="phs-ticks" aria-hidden="true">
        {ticks.map((k, i) => (
          <span key={k.t} style={{ left: `${k.at}%`, transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{k.t}</span>
        ))}
      </div>
      <div className="phs-cols-3" style={{ marginTop: 14 }}>
        <DefList items={[
          { label: "Clinic window", value: `${cfg.start} to ${cfg.end} (${open} minutes)` },
          { label: "Breaks", value: cfg.breaks.map((b) => `${b.start} to ${b.end}`).join(", ") + ` (${breakMin} minutes)` },
        ]} />
        <DefList items={[
          { label: "Slot length", value: `${cfg.slotMinutes} minutes` },
          { label: "Bookable", value: `${bookable} minutes, ${slots.length} slots` },
        ]} />
        <DefList items={[
          { label: "Sessions on this pattern", value: `${standard} of ${live.length} scheduled sessions` },
          { label: "Per nurse", value: `${slots.length} appointments a day on this pattern. It matches the workflow example in the recording and is not a platform capacity limit.` },
        ]} />
      </div>
    </Card>
  );
}

/* ---- programme configuration, transposed so three programmes compare side by side ---- */
function ProgrammeConfig({ state }: { state: PhState }) {
  const progs = state.programmes;
  const staff = (id: string) => <EntityLink kind="staff" id={id}>{state.staff.find((x) => x.id === id)?.name || id}</EntityLink>;
  const tplName = (id: string) => state.forms.templates.find((t) => t.id === id);
  const rows: Array<{ label: string; cell: (p: Programme) => ReactNode }> = [
    { label: "Programme ID", cell: (p) => <span className="ph-mono">{p.id}</span> },
    { label: "Client record", cell: (p) => <EntityLink kind="company" id={p.clientId}>{p.clientName}</EntityLink> },
    { label: "Window", cell: (p) => <>{fmtDate(p.windowStart)} to {fmtDate(p.windowEnd)}<div className="phs-note">{daysBetween(p.windowStart, p.windowEnd) + 1} days</div></> },
    { label: "Sites", cell: (p) => p.sites.map((x) => <div key={x}>{x}</div>) },
    { label: "Clinic sessions", cell: (p) => { const c = sessionCounts(state, p.id); return <>{c.total}<div className="phs-note">{c.past} past, {c.today} today, {c.upcoming} upcoming</div></>; } },
    { label: "Capacity", cell: (p) => { const c = programmeCounts(state, p.id); const sc = sessionCounts(state, p.id); return <>{c.capacity} slots<div className="phs-note">Across {sc.total} sessions, each derived from the clinic day</div></>; } },
    { label: "Appointment type", cell: (p) => { const a = state.appointmentTypes.find((x) => x.id === p.appointmentTypeId); return a ? `${a.name}, ${a.minutes} minutes` : p.appointmentTypeId; } },
    { label: "Form template", cell: (p) => { const t = tplName(p.templateId); return <EntityLink kind="template" id={p.templateId}>{t ? `${t.name} v${t.currentVersion}` : p.templateId}</EntityLink>; } },
    { label: "Invitation code", cell: (p) => { const active = state.invitationCodes.filter((c) => c.programmeId === p.id && c.status === "active").length; return <><span className="ph-mono">{p.inviteCode}</span><div className="phs-note">{active} active code{active === 1 ? "" : "s"}, created centrally by administrators</div></>; } },
    { label: "Eligibility", cell: (p) => p.eligibility },
    { label: "Programme owner", cell: (p) => staff(p.ownerId) },
    { label: "Clinical lead", cell: (p) => staff(p.clinicalLeadId) },
    { label: "Reporting lead", cell: (p) => staff(p.reportingLeadId) },
    { label: "Operations lead", cell: (p) => staff(p.opsLeadId) },
  ];
  return (
    <Card pad={false}>
      <div className="ph-pad" style={{ paddingBottom: 4 }}>
        <CardHeader
          title="Programme configuration"
          sub="Client names are real references. Dates, sites, rooms, codes and assignments are fictional demo content."
          right={<DemoTag>Fictional configuration</DemoTag>}
        />
      </div>
      <div className="phs-cq">
        {/* Wide cards compare the three programmes side by side; narrow cards stack one programme at a time. */}
        <div className="phs-wide-only ph-tablewrap">
          <table className="ph-table phs-table">
            <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Programme configuration, one column per programme</caption>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Setting</th>
                {progs.map((p) => <th key={p.id}><EntityLink kind="programme" id={p.id}>{p.name}</EntityLink></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {progs.map((p) => <td key={p.id}>{r.cell(p)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="phs-narrow-only ph-pad" style={{ paddingTop: 6 }}>
          <ul className="phs-list">
            {progs.map((p) => (
              <li key={p.id}>
                <div className="phs-strong" style={{ fontSize: 13, marginBottom: 8 }}><EntityLink kind="programme" id={p.id}>{p.name}</EntityLink></div>
                <DefList items={rows.map((r) => ({ key: r.label, label: r.label, value: r.cell(p) }))} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function AppointmentTypes({ state }: { state: PhState }) {
  return (
    <Card pad={false}>
      <div className="ph-pad" style={{ paddingBottom: 4 }}>
        <CardHeader title="Appointment types" sub="An appointment type sets the duration, questionnaire and nurse form. Vaccination and training reuse the scheduling pattern only." />
      </div>
      <div className="ph-tablewrap">
        <table className="ph-table phs-table">
          <thead>
            <tr><th>Type</th><th style={{ textAlign: "right" }}>Minutes</th><th>Template</th><th>Note</th></tr>
          </thead>
          <tbody>
            {state.appointmentTypes.map((a) => {
              const t = state.forms.templates.find((x) => x.id === a.templateId);
              return (
                <tr key={a.id}>
                  <td>
                    <div className="phs-strong">{a.name}</div>
                    <div style={{ marginTop: 4 }}>{a.kind === "screening" ? <Pill tone="info" icon="flask">Screening</Pill> : <Pill tone="neutral" icon="calendar">Scheduling only</Pill>}</div>
                  </td>
                  <td className="num">{a.minutes}</td>
                  <td><EntityLink kind="template" id={a.templateId}>{t ? `${t.name} v${t.currentVersion}` : a.templateId}</EntityLink></td>
                  <td className="ph-dim">{a.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
