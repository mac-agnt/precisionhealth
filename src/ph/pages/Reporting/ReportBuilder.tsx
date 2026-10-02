/* Report Builder: one defined cohort feeds the participation funnel, breakdowns, clinical
   indicators, narrative and exports. Disclosure control comes from the model selector; this screen
   never shows a suppressed count or a blocked subgroup. Martina completes the disclosure review,
   Neil approves the clinical narrative, approval freezes the snapshot behind every export. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AGE_BANDS, GENDER_LABEL, PROGRAMME_BY_ID, act, bandLabel, exportMetrics, fmtDate, fmtDateTime, isProgrammeLevel, staffName } from "../../model";
import type { CohortDef, EmployerMetrics, EmployerReport, GenderRecorded } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import {
  Button, Card, CardHeader, Checklist, DemoTag, EmptyState, EntityLink, Field, Funnel, Icon, Modal, PageHeader, Pill, RestrictedNotice, Select, Split, TextInput, Textarea,
} from "../../ui";
import { BreakdownBlock, IndicatorList, MethodologyList } from "./ReportParts";
import { blockReason, setCohortSafe, sizeText } from "./disclosure";
import { newerReleasesSafe, refreshSnapshotSafe } from "./snapshot";
import { Note, StatusPill } from "./common";

const GENDER_ORDER: GenderRecorded[] = ["woman", "man", "non_binary", "prefer_not_to_say", "not_recorded"];

export default function ReportBuilder() {
  const s = usePhState();
  const nav = useNav();
  const personaId = s.session.personaId;
  const reports = s.employerReports;
  const paramId = nav.params.report;
  const r = reports.find((x) => x.id === (paramId || reports[0]?.id));
  const firstId = reports[0]?.id;
  useEffect(() => {
    // Keep the address bar deep-linkable: #/Reporting/report-builder?report=ER-SISK-01.
    // nav is a new object on every render, so it is deliberately not a dependency.
    if (!paramId && firstId) nav.setParams({ ...nav.params, report: firstId });
  }, [paramId, firstId]);
  if (!r) {
    return (
      <div className="ph-page">
        <PageHeader title="Report Builder" />
        <Card pad={false}>
          <EmptyState title="Report not found" icon="file" action={<Button onClick={() => nav.go({ page: "Reporting", tab: "overview" })}>Back to Overview</Button>}>
            {paramId ? `There is no employer report with the id ${paramId}.` : "There are no employer reports yet."}
          </EmptyState>
        </Card>
      </div>
    );
  }
  // Keyed by persona too: switching role discards another person's unsaved narrative edits.
  return <BuilderFor key={`${r.id}:${personaId}`} r={r} />;
}

function BuilderFor({ r }: { r: EmployerReport }) {
  const s = usePhState();
  const p = usePersona();
  const prog = PROGRAMME_BY_ID[r.programmeId];
  // After approval the frozen snapshot is shown, so the builder matches the exports exactly.
  const m = exportMetrics(s, r);
  const canBuild = p.perms.has("reports.build");
  const canApprove = p.perms.has("reports.approve");
  const showClinical = canBuild || p.perms.has("clinical.view");
  const locked = r.status === "approved" || r.status === "exported";
  const [text, setText] = useState(r.narrative);
  useEffect(() => { setText(r.narrative); }, [r.narrative]);
  const dirty = text !== r.narrative;

  return (
    <div className="ph-page">
      <PageHeader eyebrow={`${r.id}, version ${r.version}`} title={r.title}
        sub={`${prog.name} for ${prog.clientName}. Reporting period ${fmtDate(r.periodStart)} to ${fmtDate(r.periodEnd)}. Released reports up to ${fmtDateTime(r.dataAsOf)}.`}
        actions={<><StatusPill status={r.status} /><DemoTag>Synthetic data</DemoTag></>} />
      <div className="ph-stack">
        {!canBuild ? (
          <RestrictedNotice title="Read only for this role">
            {p.name} ({p.roleLabel}) can view this disclosure-controlled draft but cannot change the cohort, edit the narrative or approve it.
            {showClinical ? "" : " Clinical indicators are shown to reporting and clinical roles only."}
          </RestrictedNotice>
        ) : null}
        <DisclosureBanner r={r} m={m} canBuild={canBuild} locked={locked} />
        <Split
          main={<Canvas r={r} m={m} showClinical={showClinical} text={text} setText={setText} canBuild={canBuild} />}
          side={<><CohortCard r={r} canBuild={canBuild} locked={locked} /><WorkflowCard r={r} m={m} canBuild={canBuild} canApprove={canApprove} dirty={dirty} /><SnapshotCard r={r} canBuild={canBuild} locked={locked} /></>}
        />
      </div>
    </div>
  );
}

/* ---- disclosure status ---- */
function DisclosureBanner({ r, m, canBuild, locked }: { r: EmployerReport; m: EmployerMetrics; canBuild: boolean; locked: boolean }) {
  const s = usePhState();
  const min = s.settings.minCohort, threshold = s.settings.suppressionThreshold;
  if (m.blocked) {
    const why = !canBuild ? "This role cannot change the cohort." : locked ? "The report is approved and frozen." : undefined;
    return (
      <div className="ph-card" role="alert" style={{ padding: "16px 18px", background: "var(--warn-soft)", borderColor: "var(--warn)" }}>
        <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <Icon name="lock" size={18} style={{ color: "var(--warn)", marginTop: 2 }} />
          <div className="ph-grow" style={{ minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Employer output blocked for this cohort</div>
            <div style={{ fontSize: 12.5, color: "var(--body)", marginTop: 4, lineHeight: 1.5 }}>{blockReason(m.size, min, threshold)}</div>
            <div className="ph-dim" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              Nothing from this selection is shown: no breakdowns, indicators or figures. The selection was logged for governance ({r.blockedAttempts} blocked {r.blockedAttempts === 1 ? "selection" : "selections"} on this report).
            </div>
          </div>
          <Button variant="primary" icon="layers" disabled={!canBuild || locked} title={why} onClick={() => dispatch(act.useProgrammeLevel(r.id))}>Use programme-level view</Button>
        </div>
      </div>
    );
  }
  const cells = m.breakdowns.flatMap((b) => b.cells);
  const hidden = cells.filter((c) => c.suppressed).length;
  return (
    <div className="ph-card-flat" style={{ padding: "12px 16px" }}>
      <div className="ph-row-flex" style={{ gap: 10, flexWrap: "wrap" }}>
        <Pill tone="ok" icon="shield">Disclosure check passed</Pill>
        <span style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.45 }}>
          {m.size} released reports in the cohort (employer output needs at least {min}). {hidden ? `${hidden} of ${cells.length} breakdown cells suppressed, with complementary suppression.` : "No breakdown cell needs suppression."}
        </span>
      </div>
    </div>
  );
}

/* ---- the report canvas ---- */
function CanvasSection({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ padding: "16px 18px", borderTop: "1px solid var(--border)", minWidth: 0 }}>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="ph-grow" style={{ minWidth: 200 }}>
          <h3 className="ph-h2">{title}</h3>
          {sub ? <div className="ph-dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{sub}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function BlockedPlaceholder() {
  return (
    <div className="ph-card-flat ph-row-flex" style={{ padding: "14px 16px", gap: 10, alignItems: "flex-start" }}>
      <Icon name="lock" size={15} style={{ color: "var(--dim)", marginTop: 1 }} />
      <span className="ph-dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Hidden because the selected cohort is blocked for employer output. Use the programme-level view to see the breakdowns.</span>
    </div>
  );
}

function Canvas({ r, m, showClinical, text, setText, canBuild }: { r: EmployerReport; m: EmployerMetrics; showClinical: boolean; text: string; setText: (t: string) => void; canBuild: boolean }) {
  const s = usePhState();
  const threshold = s.settings.suppressionThreshold;
  return (
    <Card pad={false}>
      <div style={{ padding: "16px 18px 4px" }}>
        <CardHeader title="Report canvas" sub={`${m.cohortLabel}. ${m.blocked ? "Blocked for employer output" : `${m.size} released reports`}. Data as of ${fmtDateTime(m.asOf)}.`}
          right={<DemoTag>Sample data</DemoTag>} />
      </div>
      <CanvasSection title="Participation" sub="Programme level. Each rate uses the step before it as its denominator.">
        <Funnel steps={m.funnel} />
        <Note>Overall attendance ({m.attendedOverall}) is not the report cohort. Only the {m.reportEligible} released reports are eligible; reports in review, awaiting results or on hold are excluded.</Note>
      </CanvasSection>
      <CanvasSection title="Who is in the cohort" sub={m.blocked ? undefined : `Each breakdown uses the ${m.size} released reports in the cohort as its denominator.`}>
        {m.blocked ? <BlockedPlaceholder /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
            {m.breakdowns.map((b) => <BreakdownBlock key={b.id} b={b} />)}
          </div>
        )}
      </CanvasSection>
      <CanvasSection title="Clinical indicators" sub="Displayed limits are illustrative sample content, clinician-owned, and not diagnoses." right={<DemoTag>Sample data</DemoTag>}>
        {!showClinical
          ? <RestrictedNotice title="Not shown to this role">Aggregate clinical indicators are visible to reporting and clinical roles.</RestrictedNotice>
          : m.blocked ? <BlockedPlaceholder /> : <IndicatorList items={m.clinical} threshold={threshold} />}
      </CanvasSection>
      <CanvasSection title="Narrative" sub="Written by programme reporting, approved by a clinician before any export.">
        <NarrativeEditor r={r} m={m} text={text} setText={setText} canBuild={canBuild} />
      </CanvasSection>
      <CanvasSection title="Methodology">
        <MethodologyList items={m.methodology} />
      </CanvasSection>
    </Card>
  );
}

/* ---- narrative: manual editing always works; drafting is an optional preview ---- */
function NarrativeEditor({ r, m, text, setText, canBuild }: { r: EmployerReport; m: EmployerMetrics; text: string; setText: (t: string) => void; canBuild: boolean }) {
  const s = usePhState();
  const [unlocked, setUnlocked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const approved = r.status === "approved", exported = r.status === "exported";
  const editable = canBuild && !exported && (!approved || unlocked);
  const dirty = text !== r.narrative;
  const reviewer = staffName(s, r.reviewerId);
  const save = () => {
    const res = dispatch(act.setNarrative(r.id, text));
    if (res.ok) { setSaved(true); setUnlocked(false); }
  };
  const draftBlock = !canBuild ? "This role cannot draft the narrative."
    : !s.settings.aiDraftingOn ? "The AI drafting preview is off in Settings, AI Controls. Manual editing works as normal."
      : approved || exported ? "The report is approved. Its narrative is frozen with the snapshot."
        : m.blocked ? "Use the programme-level view before drafting."
          : dirty ? "Save or discard your changes first. Drafting replaces the text."
            : null;
  return (
    <div>
      <div className="ph-wrap" style={{ marginBottom: 10 }}>
        {r.narrativeSource === "draft_from_aggregates"
          ? <><Pill tone="info" icon="spark">Drafted from approved aggregates</Pill><DemoTag>Simulated</DemoTag></>
          : <Pill tone="neutral" icon="edit">Written manually</Pill>}
        {r.narrativeApproved
          ? <Pill tone="ok">Approved by {staffName(s, r.approvedBy)}</Pill>
          : <Pill tone="warn">Draft until a clinician approves</Pill>}
      </div>
      <Field label="Narrative for the employer" htmlFor="phr-narrative" help="Aggregate statements only. Never name individuals, small groups or free text.">
        <Textarea id="phr-narrative" rows={7} value={text} readOnly={!editable} aria-readonly={!editable}
          onChange={(e) => { setText(e.target.value); setSaved(false); }} style={{ opacity: editable ? 1 : 0.85 }} />
      </Field>
      {canBuild ? (
        <div className="ph-wrap" style={{ marginTop: 10 }}>
          {editable ? <Button variant="primary" icon="check" disabled={!dirty} onClick={save}>Save narrative</Button> : null}
          {editable && dirty ? <Button variant="ghost" onClick={() => setText(r.narrative)}>Discard changes</Button> : null}
          {approved && !unlocked ? <Button icon="edit" onClick={() => setConfirm(true)}>Edit narrative</Button> : null}
          <Button icon="spark" disabled={!!draftBlock} title={draftBlock || undefined} onClick={() => dispatch(act.draftNarrative(r.id))}>Draft from approved aggregates</Button>
          {saved && !dirty ? <span className="ph-row-flex" style={{ gap: 5, fontSize: 12, color: "var(--ok)" }}><Icon name="check" size={12} stroke={2.2} />Saved</span> : null}
        </div>
      ) : null}
      {canBuild && draftBlock && !exported ? <div className="ph-help">{draftBlock}</div> : null}
      {exported ? <div className="ph-help">Exported. The narrative is part of the exported snapshot and cannot change in this version.</div> : null}
      {r.narrativeSource === "draft_from_aggregates" && !r.narrativeApproved
        ? <Note icon="spark">The Programme Reporting agent drafted this from the approved aggregate snapshot only. It stays a draft until {reviewer} approves it.</Note> : null}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Edit the approved narrative"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Keep approval</Button><Button variant="primary" onClick={() => { setUnlocked(true); setConfirm(false); }}>Edit</Button></>}>
        <p className="ph-dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
          Saving a change withdraws the clinician approval and unfreezes the snapshot. {reviewer} must approve the report again before any export.
        </p>
      </Modal>
    </div>
  );
}

/* ---- cohort definition ---- */
function CohortCard({ r, canBuild, locked }: { r: EmployerReport; canBuild: boolean; locked: boolean }) {
  const s = usePhState();
  const p = usePersona();
  const prog = PROGRAMME_BY_ID[r.programmeId];
  const c = r.cohort;
  const disabled = !canBuild || locked;
  const [dateErr, setDateErr] = useState<string | null>(null);
  const apply = (patch: Partial<CohortDef>) => {
    const next: CohortDef = { ...c, ...patch };
    if (next.from && next.to && next.from > next.to) { setDateErr("The start date is after the end date. Nothing was changed."); return; }
    setDateErr(null);
    dispatch(setCohortSafe(r.id, next));
  };
  const why = !canBuild ? `${p.name} (${p.roleLabel}) cannot change the cohort.` : locked ? "The report is approved, so the cohort is frozen with the snapshot." : null;
  return (
    <Card>
      <CardHeader title="Cohort definition" sub="One defined cohort feeds every chart, table, narrative figure and export." />
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Programme" htmlFor="phr-prog" help="Fixed for this report.">
          <TextInput id="phr-prog" value={prog.name} readOnly disabled />
        </Field>
        <Field label="Site" htmlFor="phr-site">
          <Select id="phr-site" value={c.site} disabled={disabled} onChange={(e) => apply({ site: e.target.value })}>
            <option value="all">All sites</option>
            {prog.sites.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="Age at screening" htmlFor="phr-age">
          <Select id="phr-age" value={c.ageBand} disabled={disabled} onChange={(e) => apply({ ageBand: e.target.value as CohortDef["ageBand"] })}>
            <option value="all">All ages</option>
            {AGE_BANDS.map((b) => <option key={b} value={b}>{bandLabel(b)}</option>)}
          </Select>
        </Field>
        <Field label="Gender (as recorded)" htmlFor="phr-gender">
          <Select id="phr-gender" value={c.gender} disabled={disabled} onChange={(e) => apply({ gender: e.target.value as CohortDef["gender"] })}>
            <option value="all">All recorded genders</option>
            {GENDER_ORDER.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
          </Select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <Field label="Screened from" htmlFor="phr-from">
            <TextInput id="phr-from" type="date" min={prog.windowStart} max={prog.windowEnd} value={c.from || ""} disabled={disabled} onChange={(e) => apply({ from: e.target.value || null })} />
          </Field>
          <Field label="Screened to" htmlFor="phr-to">
            <TextInput id="phr-to" type="date" min={prog.windowStart} max={prog.windowEnd} value={c.to || ""} disabled={disabled} onChange={(e) => apply({ to: e.target.value || null })} />
          </Field>
        </div>
        {dateErr ? <div className="ph-err" role="alert">{dateErr}</div> : null}
        <div className="ph-wrap">
          <Button icon="layers" disabled={disabled || isProgrammeLevel(c)} onClick={() => dispatch(act.useProgrammeLevel(r.id))}>Programme-level view</Button>
          {isProgrammeLevel(c) ? <Pill tone="info" icon="check">Programme level</Pill> : null}
        </div>
      </div>
      <Note icon={why ? "lock" : "shield"}>
        {why || `No counts appear next to filter options, so a small group cannot be found by browsing. Selections under ${s.settings.minCohort} are blocked and logged; cells under ${s.settings.suppressionThreshold} are suppressed.`}
      </Note>
    </Card>
  );
}

/* ---- disclosure review and clinician approval ---- */
function WorkflowCard({ r, m, canBuild, canApprove, dirty }: { r: EmployerReport; m: EmployerMetrics; canBuild: boolean; canApprove: boolean; dirty: boolean }) {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const reviewer = staffName(s, r.reviewerId), coordinator = staffName(s, r.coordinatorId);
  const approval = s.approvals.find((a) => a.type === "employer_report" && a.target.id === r.id);
  const approved = r.status === "approved" || r.status === "exported";
  const items = [
    { label: "Cohort defined and large enough for employer output", done: !m.blocked },
    { label: "Narrative written", done: !!r.narrative.trim() },
    { label: `Disclosure review by programme reporting (${coordinator})`, done: r.status !== "draft" },
    { label: `Clinical narrative approved and signed off (${reviewer})`, done: approved, note: approved && r.approvedAt ? `By ${staffName(s, r.approvedBy)}, ${fmtDateTime(r.approvedAt)}` : undefined },
    { label: "Print and PowerPoint previews from the frozen snapshot", done: r.status === "exported" },
  ];
  const reviewBlock = !canBuild ? `${p.name} (${p.roleLabel}) cannot complete the disclosure review.`
    : m.blocked ? "Use the programme-level view first. A blocked cohort cannot pass disclosure review."
      : !r.narrative.trim() ? "Write and save a narrative first."
        : dirty ? "Save the narrative first."
          : null;
  const approveBlock = r.status === "draft" ? "Complete the disclosure review first."
    : !canApprove ? `Only a clinical reviewer can approve. ${reviewer} approves this report.`
      : m.blocked ? "The cohort is blocked."
        : dirty ? "Save the narrative first."
          : null;
  return (
    <Card>
      <CardHeader title="Review and approval" sub={`${coordinator} coordinates the disclosure review. ${reviewer} approves the clinical narrative.`} />
      <Checklist items={items} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {r.status === "draft" ? (
          <>
            <Button variant="primary" icon="shield" disabled={!!reviewBlock} title={reviewBlock || undefined} onClick={() => dispatch(act.markReportReviewed(r.id))}>Complete disclosure review</Button>
            {reviewBlock ? <div className="ph-help" style={{ marginTop: 0 }}>{reviewBlock}</div> : null}
          </>
        ) : null}
        {!approved ? (
          <>
            <Button variant={r.status === "reviewed" ? "primary" : "secondary"} icon="check" disabled={!!approveBlock} title={approveBlock || undefined} onClick={() => dispatch(act.approveReport(r.id))}>Approve narrative and freeze snapshot</Button>
            {approveBlock ? <div className="ph-help" style={{ marginTop: 0 }}>{approveBlock}</div> : null}
          </>
        ) : (
          <>
            <div className="ph-dim" style={{ fontSize: 12, lineHeight: 1.5 }}>Snapshot frozen. The cohort, figures and narrative behind every export are locked.</div>
            <Button variant="primary" icon="print" onClick={() => nav.go({ page: "Reporting", tab: "exports", params: { report: r.id } })}>Open export previews</Button>
          </>
        )}
      </div>
      {approval ? <Note icon="check">Approval request <EntityLink kind="approval" id={approval.id} /> in Work, Approvals tracks the same steps ({approval.status}).</Note> : null}
    </Card>
  );
}

/* ---- snapshot and governance ---- */
function SnapshotCard({ r, canBuild, locked }: { r: EmployerReport; canBuild: boolean; locked: boolean }) {
  const s = usePhState();
  const newer = newerReleasesSafe(s, r);
  const threshold = s.settings.suppressionThreshold;
  return (
    <Card>
      <CardHeader title="Snapshot and governance" />
      <div style={{ display: "grid", gap: 9, fontSize: 12.5 }}>
        <div className="ph-row-flex"><span className="ph-grow ph-dim">Released reports up to</span><span className="ph-num" style={{ color: "var(--ink)" }}>{fmtDateTime(r.dataAsOf)}</span></div>
        <div className="ph-row-flex"><span className="ph-grow ph-dim">Frozen snapshot</span><span className="ph-num" style={{ color: "var(--ink)" }}>{r.snapshot ? fmtDateTime(r.snapshot.at) : "Not yet, frozen at approval"}</span></div>
        {r.snapshot ? <div className="ph-row-flex"><span className="ph-grow ph-dim">Snapshot cohort</span><span className="ph-num" style={{ color: "var(--ink)" }}>{sizeText(r.snapshot.metrics.size, threshold)} released reports</span></div> : null}
        <div className="ph-row-flex"><span className="ph-grow ph-dim">Blocked selections logged</span><span className="ph-num" style={{ color: "var(--ink)" }}>{r.blockedAttempts}</span></div>
      </div>
      {newer ? (
        <div style={{ marginTop: 12 }}>
          <Pill tone="info" icon="refresh">{newer} newer released {newer === 1 ? "report" : "reports"}</Pill>
          <div className="ph-dim" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
            {locked
              ? `Approved snapshots stay frozen. A new version would be needed to include ${newer === 1 ? "it" : "them"}.`
              : `Released since the snapshot was taken. Refresh to include ${newer === 1 ? "it" : "them"}; the disclosure check runs again.`}
          </div>
          {!locked ? <div style={{ marginTop: 8 }}><Button size="sm" icon="refresh" disabled={!canBuild} onClick={() => dispatch(refreshSnapshotSafe(r.id))}>Refresh snapshot</Button></div> : null}
        </div>
      ) : <Note icon="check">No reports have been released since the snapshot time.</Note>}
      <Note icon="spark">The <EntityLink kind="agent" id="reporting">Programme Reporting agent</EntityLink> works from this aggregate snapshot only. It cannot see participant free text or approve its own draft.</Note>
    </Card>
  );
}
