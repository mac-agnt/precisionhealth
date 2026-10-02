/* Records, Companies: Precision Health, the three employer clients and the supplier and service
   records, linked to programmes, systems, contacts and activity from the shared store. Client
   names are real references; contacts, programme activity and dates are fictional. No contract
   amounts are held anywhere in this demo. */
import { useRef, useState } from "react";
import { INTEGRATIONS, activityFeed, batchStats, fmtDate, fmtShortDateTime, programmeCounts, reminderStats, sessionCounts } from "../../model";
import type { ActivityView, Company, CompanyKind, PhState } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Card, CardHeader, Chip, DataTable, DemoTag, EntityLink, Pill, RestrictedNotice, Split } from "../../ui";
import type { Column, GlyphName, Tone } from "../../ui";
import { ActivityList, DefList, SettingsHeader, rolesLabelFor } from "../Settings/common";

const KIND: Record<CompanyKind, { label: string; tone: Tone; icon: GlyphName }> = {
  self: { label: "Screening provider", tone: "brand", icon: "heart" },
  client: { label: "Employer client", tone: "info", icon: "users" },
  supplier: { label: "Laboratory supplier", tone: "neutral", icon: "flask" },
  service: { label: "Service provider", tone: "neutral", icon: "sms" },
};
type KindFilter = "all" | "client" | "partner" | "self";
const inFilter = (c: Company, f: KindFilter) => f === "all" || (f === "partner" ? c.kind === "supplier" || c.kind === "service" : c.kind === f);

/** Activity that belongs to a company: its programmes, its systems, or for Precision Health its staff. */
function companyEvents(s: PhState, c: Company): ActivityView[] {
  if (c.kind === "self") return activityFeed(s, { filter: "people" });
  if (c.kind === "client") return activityFeed(s).filter((v) => !!v.event.programmeId && c.programmeIds.includes(v.event.programmeId));
  return activityFeed(s).filter((v) => !!v.event.integrationId && c.integrationIds.includes(v.event.integrationId));
}

export default function Companies() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const detailRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<KindFilter>("all");
  if (!p.perms.has("logistics.view")) {
    return (
      <div className="ph-page">
        <SettingsHeader eyebrow="Records" gated={false} title="Companies" sub="Company relationship records." />
        <RestrictedNotice title="Not available in the participant preview">The participant preview shows the participant's own released data only.</RestrictedNotice>
      </div>
    );
  }
  const rows = s.companies.filter((c) => inFilter(c, filter));
  const paramId = s.companies.some((c) => c.id === nav.params.company) ? nav.params.company : null;
  const selected = s.companies.find((c) => c.id === paramId) || rows[0] || s.companies[0];
  const count = (f: KindFilter) => s.companies.filter((c) => inFilter(c, f)).length;
  const select = (id: string) => {
    nav.setParams({ company: id });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
    }
  };
  const cols: Column<Company>[] = [
    {
      key: "name", header: "Company",
      sort: (a, b) => a.name.localeCompare(b.name),
      cell: (c) => (
        <div>
          <div className="phs-strong">{c.name}</div>
          <div style={{ marginTop: 4 }}><Pill tone={KIND[c.kind].tone} icon={KIND[c.kind].icon}>{KIND[c.kind].label}</Pill></div>
        </div>
      ),
    },
    { key: "rel", header: "Relationship", nowrap: false, cell: (c) => <span className="ph-dim">{c.relationship}</span> },
    {
      key: "links", header: "Linked to", nowrap: false,
      cell: (c) => {
        const n = s.contacts.filter((x) => x.companyId === c.id).length;
        return (
          <div>
            <div className="ph-wrap" style={{ gap: "3px 8px" }}>
              {c.programmeIds.map((id) => <EntityLink key={id} kind="programme" id={id}>{s.programmes.find((x) => x.id === id)?.code || id}</EntityLink>)}
              {c.integrationIds.map((id) => <EntityLink key={id} kind="system" id={id}>{INTEGRATIONS.find((x) => x.id === id)?.name || id}</EntityLink>)}
            </div>
            <div className="phs-note">{n} contact{n === 1 ? "" : "s"}</div>
          </div>
        );
      },
    },
    {
      key: "act", header: "Latest activity", nowrap: false,
      cell: (c) => { const e = companyEvents(s, c)[0]; return e ? <span className="ph-num">{fmtShortDateTime(e.event.at)}</span> : <span className="ph-faint">None</span>; },
    },
  ];
  return (
    <div className="ph-page">
      <SettingsHeader
        eyebrow="Records"
        gated={false}
        title="Companies"
        sub="Precision Health, its employer clients and its supplier and service records. Client names are real references. Contacts, programme activity and dates are fictional. No contract amounts are held."
      />
      <div className="ph-stack">
        <div className="ph-wrap" style={{ gap: 6 }} role="group" aria-label="Filter by company type">
          {([
            { id: "all", label: "All" },
            { id: "client", label: "Employer clients" },
            { id: "partner", label: "Suppliers and services" },
            { id: "self", label: "Precision Health" },
          ] as Array<{ id: KindFilter; label: string }>).map((o) => (
            <Chip key={o.id} on={filter === o.id} onClick={() => setFilter(o.id)} count={count(o.id)}>{o.label}</Chip>
          ))}
        </div>
        <Split
          main={
            <Card pad={false}>
              <DataTable
                rows={rows}
                columns={cols}
                rowKey={(c) => c.id}
                selectedKey={selected?.id}
                onRowClick={(c) => select(c.id)}
                caption="Company relationship records"
                footerNote="company records."
              />
            </Card>
          }
          side={<div ref={detailRef} style={{ scrollMarginTop: 12 }}>{selected ? <CompanyDetail c={selected} state={s} /> : null}</div>}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="phs-note">{label}</div>
      <div className="ph-num phs-strong" style={{ fontSize: 15 }}>{value}</div>
    </div>
  );
}

function CompanyDetail({ c, state }: { c: Company; state: PhState }) {
  const p = usePersona();
  const nav = useNav();
  const contacts = state.contacts.filter((x) => x.companyId === c.id);
  const events = companyEvents(state, c);
  const total = programmeCounts(state);
  return (
    <Card>
      <CardHeader
        title={c.name}
        sub={c.relationship}
        right={<Pill tone={KIND[c.kind].tone} icon={KIND[c.kind].icon}>{KIND[c.kind].label}</Pill>}
      />
      <div className="phs-body">{c.note}</div>
      <div className="ph-wrap" style={{ marginTop: 8, gap: 6 }}>
        {c.kind === "client" ? <DemoTag title="Client name is a real reference. Everything operational is fictional.">Fictional activity</DemoTag> : null}
        {c.kind === "self" ? <DemoTag title="From the public website">Public details</DemoTag> : null}
        {c.kind === "supplier" || c.kind === "service" ? <DemoTag>Simulated integration</DemoTag> : null}
      </div>
      <div style={{ marginTop: 14 }}>
        <DefList items={[
          c.website ? { label: "Website", value: <span className="ph-mono">{c.website}</span> } : null,
          { label: "Commercial terms", value: "Not held in this demo. No contract amounts, prices or margins." },
        ]} />
      </div>

      {c.programmeIds.length ? (
        <div style={{ marginTop: 18 }}>
          <div className="ph-eyebrow" style={{ marginBottom: 8 }}>{c.kind === "self" ? "Programmes delivered" : "Programmes"}</div>
          <ul className="phs-list">
            {c.programmeIds.map((pid) => {
              const pr = state.programmes.find((x) => x.id === pid);
              if (!pr) return null;
              const pc = programmeCounts(state, pid);
              const sc = sessionCounts(state, pid);
              const reports = state.employerReports.filter((r) => r.programmeId === pid);
              return (
                <li key={pid}>
                  <EntityLink kind="programme" id={pid}>{pr.name}</EntityLink>
                  <div className="phs-note">{fmtDate(pr.windowStart)} to {fmtDate(pr.windowEnd)}, {sc.total} clinic sessions ({sc.upcoming} upcoming)</div>
                  <div className="phs-cols-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
                    <Stat label="Invited" value={pc.invited} />
                    <Stat label="Booked" value={pc.booked} />
                    <Stat label="Attended" value={pc.attended} />
                    <Stat label="Released" value={pc.released} />
                  </div>
                  {reports.length ? (
                    <div className="phs-small" style={{ marginTop: 6 }}>
                      {reports.map((r) => <div key={r.id}>Employer report <EntityLink kind="employer_report" id={r.id}>{r.id}</EntityLink>: <span className="ph-dim">{r.status}, aggregate only</span></div>)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {c.kind === "self" ? <div className="phs-note" style={{ marginTop: 8 }}>Across all programmes: {total.invited} invited, {total.booked} booked, {total.attended} attended, {total.released} reports released.</div> : null}
        </div>
      ) : null}

      {c.integrationIds.length ? (
        <div style={{ marginTop: 18 }}>
          <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Systems</div>
          <ul className="phs-list">
            {c.integrationIds.map((id) => {
              const def = INTEGRATIONS.find((x) => x.id === id);
              if (!def) return null;
              return (
                <li key={id}>
                  <EntityLink kind="system" id={id}>{def.name}</EntityLink>
                  <div className="phs-note">{def.statusLabel}</div>
                  {id === "eurofins" ? <EurofinsLine state={state} canSee={p.perms.has("imports.view")} /> : null}
                  {id === "esendex" ? <EsendexLine state={state} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <div className="ph-row-flex" style={{ marginBottom: 8 }}>
          <span className="ph-eyebrow ph-grow">Contacts</span>
          {contacts.length ? <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Records", tab: "contacts" })}>Open Contacts</button> : null}
        </div>
        {contacts.length ? (
          <ul className="phs-list">
            {contacts.map((ct) => (
              <li key={ct.id}>
                <div className="ph-row-flex" style={{ gap: 8 }}>
                  <span className="ph-grow phs-strong phs-small">{ct.name}</span>
                  {ct.provenance === "public" ? <Pill tone="info" icon="check" title="From the public website">Public</Pill> : <Pill tone="neutral" icon="user" title="A demo character">Fictional</Pill>}
                </div>
                <div className="phs-note">{ct.role}</div>
                <div className="phs-small ph-mono" style={{ color: "var(--body)" }}>{ct.email}{ct.phone ? `, ${ct.phone}` : ""}</div>
                {ct.provenance === "fictional" ? <div className="phs-note">No access to individual clinical results. Receives authorised aggregate reporting only.</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="phs-note">No contacts are held for this record.</div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>{c.kind === "self" ? "Recent staff actions" : "Recent activity"}</div>
        <ActivityList items={events} limit={5} empty="No activity visible to your role." />
      </div>
    </Card>
  );
}

function EurofinsLine({ state, canSee }: { state: PhState; canSee: boolean }) {
  if (!canSee) return <div className="phs-note" style={{ marginTop: 4 }}>Batch counts need the {rolesLabelFor("imports.view")} role.</div>;
  const b = batchStats(state, "BATCH-20261002-01");
  return (
    <div className="phs-small" style={{ marginTop: 4, color: "var(--body)" }}>
      Latest batch <EntityLink kind="batch" id={b.batch.id}>{b.batch.id}</EntityLink>: {b.imported} rows imported, {b.duplicates} duplicates, {b.quarantined} held. {state.batches.length} batches in the store.
    </div>
  );
}

function EsendexLine({ state }: { state: PhState }) {
  const sms = state.messages.filter((m) => m.provider === "Esendex");
  const r = reminderStats(state);
  return (
    <div className="phs-small" style={{ marginTop: 4, color: "var(--body)" }}>
      {sms.length} simulated SMS messages, {sms.filter((m) => m.status === "failed").length} failed. Today's reminders: {r.delivered} of {r.logical} delivered.
    </div>
  );
}
