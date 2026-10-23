/* Change control: who may change ranges, the approval rule, which date decides the range, drafts
   waiting, and every version ever made across all tests, newest first. */
import { useNav } from "../../nav-context";
import { RR_EFFECTIVE_LABEL, RR_TEST_BY_ID, fmtDate } from "../../model";
import type { RrEffectiveBasis, StaffId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { Button, Card, CardHeader, DataTable, PageHeader, Pill, Select, Switch } from "../../ui";
import type { Column } from "../../ui";
import { rrAct } from "./actions";
import { isSuperadmin } from "./select";
import { Callout, VersionPill, staffNameOf, whoWhen } from "./shared";
import type { RrVersion } from "../../model";

export default function Changes() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const su = isSuperadmin(s, p.id);
  const st = s.referenceRanges.settings;
  const t0 = s.clock.nowUtc.slice(0, 10);
  const drafts = s.referenceRanges.versions.filter((v) => v.status === "draft");
  const all = s.referenceRanges.versions.slice().sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt) || b.version - a.version);
  const open = (testId: string) => nav.go({ page: "Screening", tab: "ranges", params: { test: testId } });

  const cols: Column<RrVersion>[] = [
    { key: "test", header: "Test", cell: (v) => <button type="button" className="ph-link" onClick={() => open(v.testId)}>{RR_TEST_BY_ID[v.testId]?.name || v.testId}</button> },
    { key: "ver", header: "Version", nowrap: true, cell: (v) => <span className="ph-num">v{v.version}</span> },
    { key: "status", header: "Status", cell: (v) => <VersionPill v={v} today={t0} /> },
    { key: "eff", header: "Effective", nowrap: true, cell: (v) => fmtDate(v.effectiveFrom) },
    { key: "why", header: "Reason and source", cell: (v) => <div style={{ fontSize: 12 }}>{v.reason}<div className="ph-faint">{v.source}</div></div> },
    { key: "who", header: "Drafted / decided", cell: (v) => <div style={{ fontSize: 12 }}>{whoWhen(s, v.createdBy, v.createdAt)}{v.publishedAt ? <div className="ph-faint">{v.status === "rejected" ? "Rejected" : "Published"}: {whoWhen(s, v.publishedBy, v.publishedAt)}</div> : null}</div> },
  ];

  return (
    <>
      <PageHeader eyebrow="Health Screening" title="Change control"
        sub="Ranges change only through a draft that a superadmin publishes. Every version is kept with who, when, why and the source, so any past result can be traced to the exact range used." />
      {!su ? <Callout tone="info">You can see everything here. Only superadmins ({st.superadmins.map((id) => staffNameOf(s, id)).join(", ")}) can change ranges or these settings.</Callout> : null}
      <div className="scr-grid-2" style={{ marginTop: su ? 0 : 14 }}>
        <Card>
          <CardHeader title="Superadmins" sub="The only people who can draft, publish or reject a range change." />
          <ul className="scr-list">{s.staff.map((x) => {
            const on = st.superadmins.includes(x.id);
            return <li key={x.id} className="ph-row-flex" style={{ gap: 10 }}>
              <span className="ph-grow"><span style={{ color: "var(--ink)", fontWeight: 500 }}>{x.name}</span> <span className="ph-faint">{x.title}</span></span>
              {on ? <Pill tone="brand" icon="shield">Superadmin</Pill> : null}
              {su ? <Button size="sm" onClick={() => dispatch(rrAct.setSuperadmin(x.id as StaffId, !on))}>{on ? "Remove" : "Make superadmin"}</Button> : null}
            </li>; })}</ul>
        </Card>
        <div className="ph-stack" style={{ gap: 14 }}>
          <Card>
            <CardHeader title="Second approval" sub="When on, the superadmin who drafts a change cannot publish it." right={<Switch on={st.secondApprover} label="Second approval" disabled={!su} onChange={(v) => dispatch(rrAct.setSecondApprover(v))} />} />
            <div className="ph-faint" style={{ fontSize: 12 }}>{st.superadmins.length < 2 ? "Needs at least two superadmins. With one, the same person drafts and publishes, and both steps are logged." : st.secondApprover ? "On: a second superadmin publishes every change." : "Off: one superadmin may draft and publish."}</div>
          </Card>
          <Card>
            <CardHeader title="Which date decides the range" sub="A result is judged against the version in force on this date." />
            <Select value={st.effectiveBasis} disabled={!su} onChange={(e) => dispatch(rrAct.setEffectiveBasis(e.target.value as RrEffectiveBasis))} aria-label="Which date decides the range">
              {(Object.keys(RR_EFFECTIVE_LABEL) as RrEffectiveBasis[]).map((k) => <option key={k} value={k}>{RR_EFFECTIVE_LABEL[k]}</option>)}
            </Select>
            <div className="ph-faint" style={{ fontSize: 12, marginTop: 8 }}>Default: sample collection date (to confirm). Released results always keep the version they were judged against.</div>
          </Card>
        </div>
      </div>
      <Card style={{ marginTop: 14 }}>
        <CardHeader title={`Drafts waiting (${drafts.length})`} sub="Not used for any result until published. Open one to see what it changes and which results it would re-band." />
        {drafts.length ? <ul className="scr-list">{drafts.map((d) => (
          <li key={d.id} className="ph-row-flex ph-wrap" style={{ gap: 10 }}>
            <span className="ph-grow"><strong style={{ color: "var(--ink)" }}>{RR_TEST_BY_ID[d.testId]?.name} v{d.version}</strong> <span className="ph-faint">effective {fmtDate(d.effectiveFrom)}</span><div>{d.reason}</div></span>
            <Button size="sm" onClick={() => open(d.testId)}>Review</Button>
          </li>))}</ul> : <div className="ph-faint">No drafts waiting.</div>}
      </Card>
      <Card style={{ marginTop: 14 }}>
        <CardHeader title="Every version" sub={`${all.length} versions across all tests. Version 1 of each test was loaded from Precision Health's table.`} />
        <DataTable rows={all} columns={cols} rowKey={(v) => v.id} pageSize={20} caption="All reference range versions" />
      </Card>
    </>
  );
}
