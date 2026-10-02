/* Settings, Systems & Integrations: the existing systems register. Each status is the exact
   simulated or unconfirmed text from the register. No credentials are requested, no live
   connection is claimed, FTP is not described as SFTP, no Gmail API or Microsoft Graph link is
   claimed, and Meddbase has no records or sync events. Activity comes from the shared feed. */
import { useRef } from "react";
import type { ReactNode } from "react";
import { INTEGRATIONS, activityFeed, batchStats, fmtShortDateTime, jobViews, reminderStats } from "../../model";
import type { ActivityView, IntegrationDef, Message, PhState } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Card, CardHeader, DemoTag, EmptyState, EntityLink, Icon, Pill, RestrictedNotice, Split, TONE } from "../../ui";
import type { GlyphName } from "../../ui";
import { ActivityList, DefList, SettingsHeader, rolesLabelFor } from "./common";

const BATCH_ID = "BATCH-20261002-01";
const STATUS_ICON: Record<IntegrationDef["tone"], GlyphName> = { info: "info", warn: "alert", neutral: "dot" };

/** The exact register status, wrapped rather than truncated, with icon and colour. */
function StatusLine({ def }: { def: IntegrationDef }) {
  const t = TONE[def.tone];
  return (
    <span style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "5px 9px", borderRadius: 10, background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4 }}>
      <Icon name={STATUS_ICON[def.tone]} size={12} stroke={2} style={{ marginTop: 1 }} />
      <span>{def.statusLabel}</span>
    </span>
  );
}

const eventsFor = (s: PhState, id: string): ActivityView[] => activityFeed(s).filter((v) => v.event.integrationId === id);
/** Why a system shows no events: by design, nothing yet, or hidden for this role. */
function noEventsText(s: PhState, id: string): string {
  if (id === "meddbase") return "No activity by design. Meddbase is outside this demo's integration scope.";
  if (id === "excel") return "No integration events. There is no live spreadsheet connector.";
  if (s.activity.some((e) => e.integrationId === id)) return "No activity visible to your role.";
  return "No simulated events yet in this session.";
}

export default function Systems() {
  const s = usePhState();
  const nav = useNav();
  const detailRef = useRef<HTMLDivElement>(null);
  const selectedId = INTEGRATIONS.some((i) => i.id === nav.params.system) ? nav.params.system : INTEGRATIONS[0].id;
  const def = INTEGRATIONS.find((i) => i.id === selectedId)!;
  const visibleEvents = activityFeed(s).filter((v) => !!v.event.integrationId).length;
  const select = (id: string) => {
    nav.setParams({ system: id });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
    }
  };
  return (
    <div className="ph-page">
      <SettingsHeader
        gated={false}
        title="Systems & Integrations"
        sub="The existing systems register. Every status is simulated or still to be confirmed. No credentials are requested or stored, and no live connection is claimed."
      />
      <div className="ph-stack">
        <div className="ph-card-flat ph-wrap" style={{ padding: "11px 16px", gap: "8px 22px" }}>
          <span className="phs-small"><span className="phs-strong ph-num">{INTEGRATIONS.length}</span> <span className="ph-dim">systems in the register</span></span>
          <span className="phs-small"><span className="phs-strong ph-num">{visibleEvents}</span> <span className="ph-dim">simulated integration events visible to your role</span></span>
          <span className="phs-small ph-row-flex" style={{ gap: 6 }}><Icon name="lock" size={13} style={{ color: "var(--faint)" }} /><span className="ph-dim">No credentials requested or stored</span></span>
        </div>
        <Split
          main={
            <div className="phs-sys-grid">
              {INTEGRATIONS.map((d) => {
                const ev = eventsFor(s, d.id);
                const latest = ev[0];
                return (
                  <button key={d.id} type="button" className="phs-pick" aria-pressed={d.id === selectedId} onClick={() => select(d.id)}>
                    <span className="ph-row-flex" style={{ alignItems: "flex-start" }}>
                      <span className="phs-strong ph-grow" style={{ fontSize: 13.5 }}>{d.name}</span>
                      <Icon name="chevronRight" size={14} style={{ color: "var(--faint)", marginTop: 2 }} />
                    </span>
                    <StatusLine def={d} />
                    <span className="phs-small" style={{ display: "block", color: "var(--body)" }}><span className="ph-faint">Purpose. </span>{d.purpose}</span>
                    <span className="phs-small" style={{ display: "block", color: "var(--body)" }}><span className="ph-faint">Data boundary. </span>{d.boundary}</span>
                    <span className="phs-note" style={{ display: "block" }}>
                      {latest ? <>{ev.length} simulated event{ev.length === 1 ? "" : "s"}. Latest {fmtShortDateTime(latest.event.at)}: {latest.text}</> : noEventsText(s, d.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          }
          side={
            <div ref={detailRef} style={{ scrollMarginTop: 12 }}>
              <SystemDetail def={def} state={s} />
            </div>
          }
        />
      </div>
    </div>
  );
}

function SystemDetail({ def, state }: { def: IntegrationDef; state: PhState }) {
  const companies = state.companies.filter((c) => c.integrationIds.includes(def.id));
  const events = eventsFor(state, def.id);
  return (
    <Card>
      <CardHeader title={def.name} sub="Register entry" right={<DemoTag>Simulated</DemoTag>} />
      <StatusLine def={def} />
      <div style={{ marginTop: 14 }}>
        <DefList items={[
          { label: "Purpose", value: def.purpose },
          { label: "Data boundary", value: def.boundary },
          { label: "Note", value: def.note },
          { label: "Credentials", value: "None requested or stored. No live connection is claimed." },
          companies.length ? { label: "Linked records", value: companies.map((c) => <div key={c.id}><EntityLink kind="company" id={c.id}>{c.name}</EntityLink></div>) } : null,
        ]} />
      </div>
      <div style={{ marginTop: 16 }}><Extras id={def.id} state={state} /></div>
      <div style={{ marginTop: 18 }}>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Relevant activity</div>
        <ActivityList items={events} limit={8} empty={noEventsText(state, def.id)} />
      </div>
    </Card>
  );
}

function Extras({ id, state }: { id: string; state: PhState }) {
  switch (id) {
    case "jotform": return <JotformMapping state={state} />;
    case "eurofins": return <EurofinsPanel state={state} />;
    case "gworkspace": return <WorkspacePanel state={state} />;
    case "excel": return <ExcelPanel state={state} />;
    case "monday": return (
      <Section title="Operational reference">
        <DefList items={[
          { label: "Used for", value: "Business operations and nurse coordination. It is not the patient clinical record." },
          { label: "Clinical values", value: "Never included in sample events." },
          { label: "Connection", value: "Whether and how it connects to Pulse has not been agreed." },
        ]} />
      </Section>
    );
    case "esendex": return <MessagesPanel state={state} provider="Esendex" title="SMS delivery history" />;
    case "email": return <MessagesPanel state={state} provider="Email" title="Email delivery history" />;
    case "meddbase": return (
      <div className="ph-card-flat">
        <EmptyState title="No Meddbase records or sync events" icon="layers">
          Meddbase is an existing separate occupational-health system named on the public website. It is outside this screening demo's integration scope. Its replacement or integration has not been agreed.
        </EmptyState>
      </div>
    );
  }
  return null;
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div>
      <div className="ph-row-flex" style={{ marginBottom: 8 }}><span className="ph-eyebrow ph-grow">{title}</span>{right}</div>
      {children}
    </div>
  );
}

function JotformMapping({ state }: { state: PhState }) {
  const nav = useNav();
  const tpl = state.forms.templates.find((t) => t.id === "tpl-comprehensive-lab");
  const cur = tpl?.versions.find((v) => v.version === tpl.currentVersion);
  const blocks = (cur?.blocks || []).map((b) => `${state.forms.blocks.find((x) => x.id === b.blockId)?.name || b.blockId} ${b.version}`);
  const rows: Array<{ from: string; to: ReactNode }> = [
    { from: "Booking and consent form (sample site form)", to: <>Portal onboarding. Consent and the pre-screening questionnaire are completed before a booking can be confirmed.</> },
    { from: "Comprehensive (LAB) Screen V2 nurse-data form", to: <>{tpl ? <EntityLink kind="template" id={tpl.id}>{tpl.name} v{tpl.currentVersion}</EntityLink> : "Comprehensive template"}, built from approved blocks: {blocks.join(", ")}.</> },
    { from: "Report-related forms", to: <><button type="button" className="ph-link" onClick={() => nav.go({ page: "Results", tab: "review" })}>Results, Review</button>: advice, the release checklist and versioned participant reports.</> },
    { from: "Prefilled links between steps", to: "One shared booking and episode record, so fields are not re-keyed between steps." },
  ];
  return (
    <Section title="Transition mapping to Pulse forms">
      <ul className="phs-list">
        {rows.map((r) => (
          <li key={r.from}>
            <div className="phs-small ph-faint">Jotform today: {r.from}</div>
            <div className="phs-body" style={{ marginTop: 3 }}><Icon name="arrow" size={12} style={{ verticalAlign: "-1px", marginRight: 6, color: "var(--accent)" }} />{r.to}</div>
          </li>
        ))}
      </ul>
      <div className="phs-note" style={{ marginTop: 8 }}>Transition mapping only. The agreed end state does not assume permanent two-way synchronisation.</div>
    </Section>
  );
}

function EurofinsPanel({ state }: { state: PhState }) {
  const p = usePersona();
  const b = batchStats(state, BATCH_ID);
  const job = jobViews(state).find((j) => j.id === "JOB-IMPORT-EUROFINS");
  return (
    <Section title="Laboratory results source">
      <DefList items={[
        { label: "Transport", value: "FTP-accessible CSV, as described today. It is not described as SFTP." },
        { label: "Direct API", value: "A later option. No live API is claimed or built." },
      ]} />
      <div style={{ marginTop: 12 }}>
        {p.perms.has("imports.view") ? (
          <DefList items={[
            { label: "Latest batch", value: <><EntityLink kind="batch" id={b.batch.id}>{b.batch.id}</EntityLink><div className="phs-note ph-mono">{b.batch.filename}</div></> },
            { label: "Rows", value: `${b.rows} observation rows: ${b.imported} imported, ${b.duplicates} duplicates skipped, ${b.quarantined} held for identity resolution` },
            { label: "Specimens", value: `${b.specimens} specimen records, counted separately from rows and people` },
            job ? { label: "Scheduled import", value: <>{job.cadence}, last run {job.lastRunAt ? fmtShortDateTime(job.lastRunAt) : "never"}<div className="phs-note">{job.lastResult}</div></> } : null,
          ]} />
        ) : (
          <RestrictedNotice title="Import batches are not shown for this role">
            Batch and row counts need the View import batches and counts capability ({rolesLabelFor("imports.view")}).
          </RestrictedNotice>
        )}
      </div>
    </Section>
  );
}

function WorkspacePanel({ state }: { state: PhState }) {
  const job = jobViews(state).find((j) => j.id === "JOB-GW-WATCH");
  return (
    <Section title="File holding location">
      <DefList items={[
        { label: "Holds", value: "Result files and documents today." },
        { label: "Exposed here", value: "File metadata only. No Drive contents are shown." },
        job ? { label: "Folder watcher", value: <>{job.cadence}, last run {job.lastRunAt ? fmtShortDateTime(job.lastRunAt) : "never"}<div className="phs-note">{job.lastResult}</div></> } : null,
        { label: "Email", value: "Using Google Workspace for files does not imply an email integration." },
      ]} />
    </Section>
  );
}

function ExcelPanel({ state }: { state: PhState }) {
  const nav = useNav();
  const p = usePersona();
  const issues = state.dqIssues.filter((i) => i.kind === "flag_inconsistency");
  const open = issues.filter((i) => i.status !== "resolved");
  return (
    <Section title="Legacy rules to validate">
      <div className="phs-body">
        Legacy spreadsheet classifications are converted into approved templates and rules only after the clinical rule owner validates them. There is no live spreadsheet connector.
      </div>
      <div style={{ marginTop: 10 }} className="phs-small">
        <span className="phs-strong ph-num">{open.length}</span> <span className="ph-dim">open legacy display-flag inconsistenc{open.length === 1 ? "y" : "ies"} raised by Data Quality.</span>
      </div>
      {p.perms.has("clinical.view") ? (
        <ul className="phs-list" style={{ marginTop: 8 }}>
          {open.map((i) => (
            <li key={i.id}>
              <div className="phs-small phs-strong">{i.id}: {i.title}</div>
              <div className="phs-note">{i.detail}</div>
              {i.episodeId ? <div style={{ fontSize: 12 }}><EntityLink kind="episode" id={i.episodeId}>{i.episodeId}</EntityLink></div> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="phs-note" style={{ marginTop: 6 }}>Details name clinical values, so only clinical roles see them.</div>
      )}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Settings", tab: "governance", params: { item: "gov-rules" } })}>Clinical rule owner in Governance</button>
      </div>
    </Section>
  );
}

function MessagesPanel({ state, provider, title }: { state: PhState; provider: Message["provider"]; title: string }) {
  const msgs = state.messages.filter((m) => m.provider === provider);
  const delivered = msgs.filter((m) => m.status === "delivered").length;
  const failed = msgs.filter((m) => m.status === "failed").length;
  const touched = msgs.filter((m) => m.attempts.some((a) => a.outcome === "failed"));
  const r = reminderStats(state);
  return (
    <Section title={title} right={<DemoTag>Delivery simulation</DemoTag>}>
      <DefList items={[
        { label: `Through ${provider}`, value: `${msgs.length} messages: ${delivered} delivered, ${failed} failed` },
        { label: "Today's reminders", value: `${r.logical} logical reminders across both channels: ${r.delivered} delivered, ${r.failed} failed. ${r.attempts} provider attempts, counted separately.` },
        provider === "Email" ? { label: "Provider", value: "Production provider and transport to confirm. No Gmail API or Microsoft Graph connection is claimed." } : { label: "Sending", value: "No messages are sent. Delivery and retries are simulated." },
      ]} />
      <div style={{ marginTop: 12 }}>
        <div className="phs-small ph-dim" style={{ marginBottom: 6 }}>Failures and retry history</div>
        {touched.length ? (
          <ul className="phs-list">
            {touched.map((m) => (
              <li key={m.id}>
                <div className="ph-row-flex" style={{ gap: 8 }}>
                  <span className="ph-grow ph-trunc phs-small"><EntityLink kind="message" id={m.id}>{m.logicalId}</EntityLink> <span className="ph-faint">to {m.destination}</span></span>
                  {m.status === "failed" ? <Pill tone="bad">Failed</Pill> : m.status === "delivered" ? <Pill tone="ok">Delivered after retry</Pill> : <Pill tone="neutral">{m.status}</Pill>}
                </div>
                <ul className="phs-bullets" style={{ marginTop: 6 }}>
                  {m.attempts.map((a, i) => (
                    <li key={i} style={{ fontSize: 12 }}>
                      <Icon name={a.outcome === "delivered" ? "check" : "x"} size={12} style={{ color: a.outcome === "delivered" ? "var(--ok)" : "var(--bad)" }} />
                      <span><span className="ph-num">{fmtShortDateTime(a.at)}</span>: {a.outcome === "delivered" ? "Delivered" : "Failed"}{a.reason ? `, ${a.reason}` : ""}{i === 0 ? " (first attempt)" : a.auto ? " (automatic retry)" : " (manual retry)"}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="phs-note">No failed deliveries through {provider}.</div>
        )}
      </div>
    </Section>
  );
}
