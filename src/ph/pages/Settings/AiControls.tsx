/* Settings, AI Controls: the optional drafting preview, the locked human-approval rule, the
   permitted data scope and the prohibited actions. Demo content, no model connected: no AI API is
   called. Turning the preview off leaves manual advice and manual employer narrative fully
   usable, and the live counts below show where manual authoring already happens. */
import { AGENT_DEFS, act, activityFeed, linkFor } from "../../model";
import type { ReportVersion } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, DemoTag, EntityLink, Icon, Pill, Split, Switch } from "../../ui";
import { ActivityList, SettingsHeader, rolesLabelFor, useEditBlock } from "./common";

const PROHIBITED = [
  "Releasing a report on its own, including the all-normal shortcut",
  "Diagnosis, urgency or triage decisions",
  "Identity matching, fuzzy matching or resolving conflicting identifiers",
  "Sending any message without human confirmation",
  "Inventing measurements or replacement clinical thresholds",
  "Committing clinical data outside the authorised workflow",
];

const SOURCE_LABEL: Record<ReportVersion["adviceSource"], string> = {
  manual: "Written or edited by a clinician in Results, Review",
  ai_draft_approved: "From the drafting preview, then edited and approved by a clinician",
  sample_template: "Approved sample advice content (seeded history)",
};

export default function AiControls() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const block = useEditBlock();
  const on = s.settings.aiDraftingOn;
  const versions = s.reportVersions;
  const bySource = (Object.keys(SOURCE_LABEL) as Array<ReportVersion["adviceSource"]>).map((k) => ({ k, n: versions.filter((v) => v.adviceSource === k).length }));
  const narratives = s.employerReports;
  const pendingDrafts = Object.keys(s.aiDrafts).length;
  const changes = activityFeed(s).filter((v) => v.event.verb === "settings.ai");
  const canReview = p.perms.has("clinical.review");
  const canBuild = p.perms.has("reports.build");
  return (
    <div className="ph-page">
      <SettingsHeader
        title="AI Controls"
        sub="An optional drafting preview, clearly marked. Demo content, no model connected. A human approves everything, and the core workflow is complete without AI."
        actions={<DemoTag title="No AI API is called. Drafts are deterministic, prewritten demo content.">Demo content, no model connected</DemoTag>}
      />
      <div className="ph-stack">
        <Split
          main={
            <Card>
              <CardHeader title="Controls" sub={block || "Changes are written to Activity."} right={block ? <Pill tone="neutral" icon="lock">View only</Pill> : null} />
              <div>
                <div className="phs-control">
                  <div className="phs-cmain">
                    <div className="phs-strong" style={{ fontSize: 13 }}>Clinical Drafting preview</div>
                    <div className="phs-small ph-dim" style={{ marginTop: 3 }}>Drafts advice wording from a selected fictional episode and approved content, for a clinician to edit and approve. Programme Reporting drafts employer narrative from the aggregate snapshot under the same switch.</div>
                  </div>
                  <div className="phs-cside">
                    {on ? <Pill tone="info" icon="spark">Preview on</Pill> : <Pill tone="neutral" icon="dot">Preview off</Pill>}
                    <Switch on={on} onChange={(v) => dispatch(act.setAiDrafting(v))} label="Clinical Drafting preview" disabled={!!block} />
                  </div>
                </div>
                <div className="phs-control">
                  <div className="phs-cmain">
                    <div className="phs-strong" style={{ fontSize: 13 }}>Human approval required</div>
                    <div className="phs-small ph-dim" style={{ marginTop: 3 }}>Every draft is edited and approved by a person before it is used. A draft is never released, sent or exported on its own. This control cannot be turned off.</div>
                  </div>
                  <div className="phs-cside">
                    <Pill tone="neutral" icon="lock">Locked on</Pill>
                    <Switch on onChange={() => undefined} label="Human approval required (locked on)" disabled />
                  </div>
                </div>
                <div className="phs-control">
                  <div className="phs-cmain">
                    <div className="phs-strong" style={{ fontSize: 13 }}>Model and provider</div>
                    <div className="phs-small ph-dim" style={{ marginTop: 3 }}>No AI API is called. Every draft is deterministic, prewritten demo content.</div>
                  </div>
                  <div className="phs-cside"><DemoTag>Demo content, no model connected</DemoTag></div>
                </div>
                <div className="phs-control">
                  <div className="phs-cmain">
                    <div className="phs-strong" style={{ fontSize: 13 }}>Permitted data scope</div>
                    <ul className="phs-bullets" style={{ marginTop: 8 }}>
                      {AGENT_DEFS.map((a) => (
                        <li key={a.id}><Icon name="check" size={13} style={{ color: "var(--accent)" }} /><span><span className="phs-strong">{a.name}:</span> {a.scope.join(", ")}.</span></li>
                      ))}
                      <li><Icon name="lock" size={13} style={{ color: "var(--faint)" }} /><span>Participant free text never reaches employer output. Agent output shown to a person is filtered by that person's role.</span></li>
                    </ul>
                  </div>
                </div>
                <div className="phs-control">
                  <div className="phs-cmain">
                    <div className="phs-strong" style={{ fontSize: 13 }}>Prohibited for every agent</div>
                    <ul className="phs-bullets" style={{ marginTop: 8 }}>
                      {PROHIBITED.map((x) => <li key={x}><Icon name="x" size={13} style={{ color: "var(--bad)" }} /><span>{x}</span></li>)}
                    </ul>
                  </div>
                  <div className="phs-cside"><Pill tone="neutral" icon="lock">Always prohibited</Pill></div>
                </div>
              </div>
            </Card>
          }
          side={
            <>
              <Card>
                <CardHeader title="The manual workflow stays complete" sub={on ? "With the preview on or off, these manual paths are always available." : "The preview is off. These manual paths are unaffected."} />
                <ul className="phs-list">
                  <li>
                    <div className="phs-strong" style={{ fontSize: 12.5 }}>Manual advice</div>
                    <div className="phs-small ph-dim" style={{ marginTop: 2 }}>Results, Review keeps a manual advice editor for every episode. With the preview off, a request for a draft is refused and nothing else changes.</div>
                    <div style={{ marginTop: 6 }}>
                      <Button size="sm" icon="edit" onClick={() => nav.go(linkFor("episode", "PH-E-0101"))}>Write advice for PH-E-0101</Button>
                      {!canReview ? <div className="phs-note" style={{ marginTop: 4 }}>Needs the {rolesLabelFor("clinical.review")} role to edit.</div> : null}
                    </div>
                  </li>
                  <li>
                    <div className="phs-strong" style={{ fontSize: 12.5 }}>Manual employer narrative</div>
                    <div className="phs-small ph-dim" style={{ marginTop: 2 }}>Reporting, Report Builder keeps a manual narrative editor. A clinician still approves the narrative before export.</div>
                    <div style={{ marginTop: 6 }}>
                      <Button size="sm" icon="edit" onClick={() => nav.go(linkFor("employer_report", "ER-SISK-01"))}>Write the ER-SISK-01 narrative</Button>
                      {!canBuild ? <div className="phs-note" style={{ marginTop: 4 }}>Needs the {rolesLabelFor("reports.build")} role to edit.</div> : null}
                    </div>
                  </li>
                </ul>
              </Card>
              <Card>
                <CardHeader title="Where report advice comes from" sub={`Across ${versions.length} report versions in the store. The counts move as reports are written and released.`} />
                <ul className="phs-list">
                  {bySource.map((b) => (
                    <li key={b.k} className="ph-row-flex">
                      <span className="ph-grow phs-small" style={{ color: "var(--body)" }}>{SOURCE_LABEL[b.k]}</span>
                      <span className="ph-num phs-strong">{b.n}</span>
                    </li>
                  ))}
                  <li className="ph-row-flex">
                    <span className="ph-grow phs-small" style={{ color: "var(--body)" }}>Drafts waiting for a clinician to edit and approve</span>
                    <span className="ph-num phs-strong">{pendingDrafts}</span>
                  </li>
                  {narratives.map((r) => (
                    <li key={r.id} className="ph-row-flex">
                      <span className="ph-grow phs-small" style={{ color: "var(--body)" }}>
                        <EntityLink kind="employer_report" id={r.id}>{r.id}</EntityLink> narrative: {r.narrativeSource === "manual" ? "written manually" : "drafted from aggregates"}
                      </span>
                      {r.narrativeApproved ? <Pill tone="info" icon="check">Approved</Pill> : <Pill tone="neutral" icon="clock">Not approved</Pill>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Recent AI control changes" />
                <ActivityList items={changes} limit={5} empty="No changes in this session." />
              </Card>
            </>
          }
        />
        <Card pad={false}>
          <div className="ph-pad" style={{ paddingBottom: 4 }}>
            <CardHeader title="The seven agents" sub="What each agent may and may not do. Agent actions are visible, simulated preparation or validation, never an unverifiable automation claim." />
          </div>
          <div className="phs-agents" role="list" aria-label="The seven agents">
            {AGENT_DEFS.map((a) => (
              <div key={a.id} className="phs-agent" role="listitem">
                <div>
                  <span style={{ fontSize: 13 }}><EntityLink kind="agent" id={a.id}>{a.name}</EntityLink></span>
                  <div style={{ marginTop: 5 }}>
                    {a.optional ? (on ? <Pill tone="info" icon="spark">Optional preview, on</Pill> : <Pill tone="neutral" icon="dot">Optional preview, off</Pill>) : <Pill tone="neutral" icon="dot">Simulated</Pill>}
                  </div>
                </div>
                <div className="phs-small ph-dim">{a.job}</div>
                <div>
                  <div className="ph-eyebrow" style={{ marginBottom: 5 }}>May do</div>
                  <ul className="phs-bullets">{a.mayDo.map((x) => <li key={x} style={{ fontSize: 12 }}><Icon name="check" size={12} style={{ color: "var(--accent)" }} /><span>{x}</span></li>)}</ul>
                </div>
                <div>
                  <div className="ph-eyebrow" style={{ marginBottom: 5 }}>May not do</div>
                  <ul className="phs-bullets">{a.mayNotDo.map((x) => <li key={x} style={{ fontSize: 12 }}><Icon name="x" size={12} style={{ color: "var(--bad)" }} /><span>{x}</span></li>)}</ul>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
