/* Settings, Governance: proposed requirements with truthful statuses (Required, To confirm,
   Sample evidence, Not started, Awaiting client approval). No certification badges and no
   compliance claim. Recording an owner never changes a status. The access-review register and
   the form-version history are derived live from the store, so team moves and new template
   versions show here straight away. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ANALYTES, BP_REVIEW_LIMIT, GOVERNANCE_STATUS_LABEL, LIMITS_DISCLAIMER, PLANNING_ASSUMPTIONS, ROLE_LABEL, act, fmtDate } from "../../model";
import type { FormTemplate, FormTemplateVersion, GovernanceItem, PhState, Staff } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Card, CardHeader, Chip, DataTable, EntityLink, Icon, Pill, Select, Split } from "../../ui";
import type { Column, GlyphName, Tone } from "../../ui";
import { SettingsHeader, YesNo, rolePerms, useEditBlock } from "./common";

type GStatus = GovernanceItem["status"];
/* Never green: none of these states is a pass. */
const STATUS_TONE: Record<GStatus, Tone> = { required: "warn", awaiting_client: "info", to_confirm: "info", not_started: "neutral", sample_evidence: "neutral" };
const STATUS_ICON: Record<GStatus, GlyphName> = { required: "alert", awaiting_client: "clock", to_confirm: "clock", not_started: "dot", sample_evidence: "file" };
const STATUS_ORDER: GStatus[] = ["required", "awaiting_client", "to_confirm", "not_started", "sample_evidence"];

const GROUPS: Array<{ id: GovernanceItem["group"]; title: string; blurb: string; panel?: { id: string; label: string } }> = [
  { id: "hosting", title: "Hosting and processors", blurb: "Proposed requirements from the supplier brief. Nothing in this demo is hosted for production." },
  { id: "retention", title: "Retention", blurb: "The retention decision is awaiting client approval." },
  { id: "access", title: "Access review", blurb: "Who can see what comes from the role matrix. The register is a sample, not a completed review.", panel: { id: "phs-access", label: "Access-review register (sample)" } },
  { id: "clinical_rules", title: "Clinical rules", blurb: "Classification limits and advice content need a named clinical rule owner.", panel: { id: "phs-limits", label: "Illustrative display limits" } },
  { id: "forms", title: "Form versions", blurb: "Every template version, derived from Programmes, Forms and Templates.", panel: { id: "phs-forms", label: "Form-version history" } },
  { id: "dpia", title: "DPIA and assurance evidence", blurb: "Evidence a corporate client security review will ask for." },
  { id: "security", title: "Security testing", blurb: "This prototype has not been independently tested." },
];

/* Evidence a reviewer will ask for, pointing at the register items that carry the status. */
const EVIDENCE: Array<{ id: string; label: string }> = [
  { id: "gov-dpia", label: "Data protection impact assessment" },
  { id: "gov-processors", label: "Processor and sub-processor list with data flows" },
  { id: "gov-assurance", label: "Security assurance evidence pack" },
  { id: "gov-hosting", label: "EU hosting region and provider" },
  { id: "gov-retention", label: "Approved retention period" },
  { id: "gov-access", label: "Access review record" },
  { id: "gov-rules", label: "Clinical rule sign-off" },
  { id: "gov-pentest", label: "Independent security test report" },
  { id: "gov-vuln", label: "Vulnerability management process" },
];

export function GovStatus({ status }: { status: GStatus }) {
  return <Pill tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>{GOVERNANCE_STATUS_LABEL[status]}</Pill>;
}

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start" });

export default function Governance() {
  const s = usePhState();
  const nav = useNav();
  const block = useEditBlock();
  const [filter, setFilter] = useState<GStatus | "all">("all");
  const items = s.settings.governance;
  const selected = nav.params.item || null;
  useEffect(() => {
    if (!selected) return;
    setFilter("all");
    const t = requestAnimationFrame(() => document.getElementById(`gov-${selected}`)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(t);
  }, [selected]);
  const count = (st: GStatus) => items.filter((i) => i.status === st).length;
  const shown = (i: GovernanceItem) => filter === "all" || i.status === filter;
  return (
    <div className="ph-page">
      <SettingsHeader
        title="Governance"
        sub="Proposed requirements and their truthful status. This prototype is not certified, has not been independently tested and makes no compliance claim."
      />
      <div className="ph-stack">
        <div className="ph-card-flat" style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Icon name="shield" size={17} style={{ color: "var(--accent)", marginTop: 1 }} />
          <div className="phs-body">
            Statuses mean exactly what they say. <span className="phs-strong">Required</span> is a requirement, not a pass. <span className="phs-strong">Sample evidence</span> is illustrative only. Recording an owner never changes a status until evidence exists.
          </div>
        </div>
        <Split
          main={
            <Card>
              <CardHeader title="Governance register" sub={block || "Record an owner where one is known. The status stays as it is."} right={block ? <Pill tone="neutral" icon="lock">View only</Pill> : null} />
              <div className="ph-wrap" style={{ gap: 6, marginBottom: 14 }} role="group" aria-label="Filter by status">
                <Chip on={filter === "all"} onClick={() => setFilter("all")} count={items.length}>All</Chip>
                {STATUS_ORDER.filter((st) => count(st) > 0).map((st) => (
                  <Chip key={st} on={filter === st} onClick={() => setFilter(st)} count={count(st)}>{GOVERNANCE_STATUS_LABEL[st]}</Chip>
                ))}
              </div>
              <div className="ph-stack" style={{ gap: 20 }}>
                {GROUPS.map((g) => {
                  const list = items.filter((i) => i.group === g.id && shown(i));
                  if (!list.length) return null;
                  return (
                    <section key={g.id} aria-label={g.title}>
                      <div className="ph-row-flex" style={{ alignItems: "flex-start", marginBottom: 6 }}>
                        <div className="ph-grow">
                          <div className="ph-eyebrow">{g.title}</div>
                          <div className="phs-note" style={{ marginTop: 3 }}>{g.blurb}</div>
                        </div>
                        {g.panel ? <button type="button" className="ph-link" style={{ fontSize: 12, flex: "none" }} onClick={() => scrollToId(g.panel!.id)}>{g.panel.label}</button> : null}
                      </div>
                      <div>
                        {list.map((i) => <GovItem key={i.id} item={i} state={s} selected={selected === i.id} block={block} />)}
                      </div>
                      {g.id === "retention" ? <RetentionNote /> : null}
                    </section>
                  );
                })}
              </div>
            </Card>
          }
          side={
            <>
              <Card>
                <CardHeader title="DPIA and assurance evidence checklist" sub="Status of each piece of evidence. None is complete in this prototype." />
                <ul className="phs-list">
                  {EVIDENCE.map((e) => {
                    const it = items.find((x) => x.id === e.id);
                    if (!it) return null;
                    return (
                      <li key={e.id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10 }}>
                        <button type="button" className="ph-link ph-grow" style={{ fontSize: 12.5, color: "var(--body)" }} onClick={() => nav.setParams({ item: e.id })}>{e.label}</button>
                        <GovStatus status={it.status} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Planning assumptions, to confirm" sub="Provisional sizing from the supplier brief. These are not executive KPIs." />
                <ul className="phs-list">
                  {PLANNING_ASSUMPTIONS.map((a) => (
                    <li key={a.label}>
                      <div className="phs-small ph-faint">{a.label}</div>
                      <div className="phs-body" style={{ marginTop: 2 }}>{a.value}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          }
        />
        <AccessRegister state={s} />
        <DisplayLimits />
        <FormHistory state={s} />
      </div>
    </div>
  );
}

function ownerOptions(s: PhState) {
  return [
    ...s.staff.map((x) => ({ value: x.name, label: `${x.name}, ${x.title}` })),
    ...s.teams.map((t) => ({ value: t.name, label: `${t.name} team` })),
  ];
}

function GovItem({ item, state, selected, block }: { item: GovernanceItem; state: PhState; selected: boolean; block: string | null }) {
  const opts = ownerOptions(state);
  const known = !item.owner || opts.some((o) => o.value === item.owner);
  return (
    <div id={`gov-${item.id}`} className={"phs-gov-item" + (selected ? " sel" : "")}>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div className="ph-grow" style={{ minWidth: 200 }}>
          <div className="phs-strong" style={{ fontSize: 13 }}>{item.title}</div>
          <div className="phs-small ph-dim" style={{ marginTop: 3 }}>{item.detail}</div>
        </div>
        <GovStatus status={item.status} />
      </div>
      <div className="ph-row-flex" style={{ marginTop: 9, flexWrap: "wrap", gap: 8 }}>
        <span className="phs-small ph-faint">Owner</span>
        {item.owner ? <span className="phs-small phs-strong">{item.owner}</span> : <Pill tone="neutral" icon="alert" title="No actual owner was supplied">Owner to confirm</Pill>}
        {!block ? (
          <Select aria-label={`Record an owner for ${item.title}`} value={item.owner || ""} onChange={(e) => dispatch(act.setGovernanceOwner(item.id, e.target.value))} style={{ width: 230, maxWidth: "100%", height: 28, fontSize: 12 }}>
            <option value="">Owner to confirm</option>
            {!known && item.owner ? <option value={item.owner}>{item.owner}</option> : null}
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        ) : null}
      </div>
    </div>
  );
}

function RetentionNote() {
  return (
    <div className="ph-card-flat" style={{ padding: "11px 14px", marginTop: 8 }}>
      <div className="phs-body">
        The sample booking consent mentions a two-year period. It is flagged for review and is not applied to any record. Records carry no retention date until the client approves a period.
      </div>
      <div style={{ marginTop: 6, fontSize: 12 }}><EntityLink kind="file" id="file-consent">Open the sample booking consent</EntityLink></div>
    </div>
  );
}

/* ---- access-review register (sample), derived from the role matrix and current teams ---- */
const ACCESS_CHECKS: Array<{ key: string; perm: "clinical.view" | "imports.view" | "clinical.review" | "settings.edit"; label: string; title: string }> = [
  { key: "clin", perm: "clinical.view", label: "Clinical values", title: "View clinical values, results and reports" },
  { key: "imp", perm: "imports.view", label: "Imports", title: "View import batches and counts" },
  { key: "rel", perm: "clinical.review", label: "Release", title: "Review, release and correct individual reports" },
  { key: "set", perm: "settings.edit", label: "Settings", title: "Change settings and AI controls" },
];
function AccessRegister({ state }: { state: PhState }) {
  const teamName = (x: Staff) => state.teams.find((t) => t.id === x.team)?.name || x.team;
  const cols: Column<Staff>[] = [
    { key: "who", header: "Profile", nowrap: false, cell: (x) => <><EntityLink kind="staff" id={x.id}>{x.name}</EntityLink><div className="phs-note">{x.title}</div></> },
    { key: "role", header: "Role", nowrap: false, cell: (x) => ROLE_LABEL[x.role] },
    { key: "team", header: "Team", nowrap: false, cell: (x) => teamName(x) },
    ...ACCESS_CHECKS.map((c): Column<Staff> => ({ key: c.key, header: <span title={c.title}>{c.label}</span>, cell: (x) => <YesNo yes={rolePerms(x.role).has(c.perm)} /> })),
  ];
  return (
    <div id="phs-access" style={{ scrollMarginTop: 12 }}>
      <Card pad={false}>
        <div className="ph-pad" style={{ paddingBottom: 4 }}>
          <CardHeader
            title="Access-review register (sample)"
            sub="Illustrative entries built from the role matrix and current teams. No access review has been completed."
            right={<Pill tone="neutral" icon="file">Sample entries</Pill>}
          />
        </div>
        <div className="phs-cq">
          <div className="phs-wide-only">
            <DataTable rows={state.staff} columns={cols} rowKey={(x) => x.id} caption="Access-review register, sample entries" footerNote="profiles. Sample evidence only." />
          </div>
          <div className="phs-narrow-only ph-pad" style={{ paddingTop: 6 }}>
            <ul className="phs-list">
              {state.staff.map((x) => (
                <li key={x.id}>
                  <div className="ph-row-flex" style={{ gap: 8 }}>
                    <span className="ph-grow" style={{ fontSize: 13 }}><EntityLink kind="staff" id={x.id}>{x.name}</EntityLink></span>
                    <span className="phs-note">{ROLE_LABEL[x.role]}, {teamName(x)}</span>
                  </div>
                  <div className="ph-wrap" style={{ gap: "4px 14px", marginTop: 5 }}>
                    {ACCESS_CHECKS.map((c) => <span key={c.key} className="phs-small" title={c.title}><span className="ph-faint">{c.label} </span><YesNo yes={rolePerms(x.role).has(c.perm)} /></span>)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DisplayLimits() {
  const rows = Object.values(ANALYTES);
  return (
    <div id="phs-limits" style={{ scrollMarginTop: 12 }}>
      <Card pad={false}>
        <div className="ph-pad" style={{ paddingBottom: 4 }}>
          <CardHeader title="Illustrative display limits" sub={LIMITS_DISCLAIMER} right={<Pill tone="neutral" icon="clock">Awaiting a clinical rule owner</Pill>} />
        </div>
        <div className="ph-tablewrap">
          <table className="ph-table phs-table">
            <thead><tr><th>Measure</th><th>Unit</th><th>Displayed limit</th><th>Panel</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.code}>
                  <td className="phs-strong">{a.name}</td>
                  <td className="ph-mono">{a.unit}</td>
                  <td className="ph-mono">{a.limit.text}</td>
                  <td>{a.addOn ? "Add-on" : "Core panel"}</td>
                  <td><span className="phs-note">Illustrative, to validate</span></td>
                </tr>
              ))}
              <tr>
                <td className="phs-strong">Blood pressure</td>
                <td className="ph-mono">mmHg</td>
                <td className="ph-mono">{BP_REVIEW_LIMIT.text}</td>
                <td>Nurse form</td>
                <td><span className="phs-note">Illustrative, to validate</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---- form-version history, derived from the templates in the store ---- */
const VERSION_STATUS: Record<FormTemplateVersion["status"], { label: string; tone: Tone; icon: GlyphName }> = {
  published: { label: "Published", tone: "info", icon: "check" },
  pending_approval: { label: "Awaiting approval", tone: "warn", icon: "clock" },
  draft: { label: "Draft", tone: "neutral", icon: "edit" },
  retired: { label: "Retired", tone: "neutral", icon: "dot" },
};
function FormHistory({ state }: { state: PhState }) {
  const rows = state.forms.templates.flatMap((t) => t.versions.map((v) => ({ t, v })))
    .sort((a, b) => (a.v.createdAt < b.v.createdAt ? 1 : a.v.createdAt > b.v.createdAt ? -1 : a.t.name < b.t.name ? -1 : 1));
  const who = (id: string) => state.staff.find((x) => x.id === id)?.name || id;
  const cols: Column<{ t: FormTemplate; v: FormTemplateVersion }>[] = [
    { key: "tpl", header: "Template", nowrap: false, cell: (r) => <><EntityLink kind="template" id={r.t.id}>{r.t.name}</EntityLink><div className="phs-note">{r.v.blocks.length} block{r.v.blocks.length === 1 ? "" : "s"}</div></> },
    { key: "ver", header: "Version", cell: (r) => <><span className="ph-num">v{r.v.version}</span>{r.t.currentVersion === r.v.version ? <div className="phs-note">Current</div> : null}</> },
    { key: "status", header: "Status", cell: (r) => { const m = VERSION_STATUS[r.v.status]; return <Pill tone={m.tone} icon={m.icon}>{m.label}</Pill>; } },
    {
      key: "dates", header: "Created and published", nowrap: false,
      cell: (r) => <><div>{fmtDate(r.v.createdAt)}, {who(r.v.createdBy)}</div><div className="phs-note">{r.v.publishedAt ? `Published ${fmtDate(r.v.publishedAt)}` : "Not published"}</div></>,
    },
    { key: "note", header: "Note", nowrap: false, cell: (r) => <span className="ph-dim">{r.v.note}</span> },
  ];
  const content: ReactNode = (
    <DataTable rows={rows} columns={cols} rowKey={(r) => `${r.t.id}@${r.v.version}`} pageSize={12} caption="Form-version history" footerNote="template versions. Historical episodes keep the version they were captured with." />
  );
  return (
    <div id="phs-forms" style={{ scrollMarginTop: 12 }}>
      <Card pad={false}>
        <div className="ph-pad" style={{ paddingBottom: 4 }}>
          <CardHeader title="Form-version history" sub="Published, pending and retired versions of every template. New versions appear here when Forms and Templates publishes them." />
        </div>
        {content}
      </Card>
    </div>
  );
}
