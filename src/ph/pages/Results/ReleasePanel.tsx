/* Right-hand review controls, shared by Review and Corrections: the release checklist and
   release buttons, individual flag acknowledgement, the advice editor (manual first, with an
   optional Clinical Drafting preview), the participant preview summary and the released state.
   Every change goes through dispatch(act.*); the model rejects anything out of order. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ADVICE_FLAGGED, ADVICE_ROUTINE, act, fmtTime, fmtWhen, staffName } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, DemoTag, Icon, Pill, Select, Textarea } from "../../ui";
import type { Bundle } from "./EpisodePanels";
import { Banner, SecTitle } from "./shared";
import { hasUrgentFollowUp } from "./select";

/* ---- checklist ---- */
function CheckRow({ done, label, note, onToggle, disabled, reason }: { done: boolean; label: string; note?: ReactNode; onToggle?: () => void; disabled?: boolean; reason?: string }) {
  return (
    <li className="phr-check">
      {onToggle ? (
        <button type="button" className="phr-check-box" aria-pressed={done} aria-label={label} disabled={disabled} title={disabled ? reason : undefined} onClick={onToggle}>
          {done ? <Icon name="check" size={12} stroke={2.4} /> : null}
        </button>
      ) : (
        <span className="phr-check-box" role="img" aria-label={done ? "Done" : "Not done"} style={{ background: done ? "var(--ok-soft)" : "var(--track)", color: done ? "var(--ok)" : "var(--faint)" }}>
          <Icon name={done ? "check" : "clock"} size={12} stroke={2.2} />
        </span>
      )}
      <span style={{ color: done ? "var(--body)" : "var(--ink)", minWidth: 0 }}>
        {label}
        {note ? <span className="phr-sub" style={{ display: "block" }}>{note}</span> : null}
        {disabled && reason && !done ? <span className="phr-sub" style={{ display: "block" }}>{reason}</span> : null}
      </span>
    </li>
  );
}

export interface CheckState { key: string; label: string; done: boolean }

/** The checklist with its manual toggles. Returns the rows and the open items for the release button. */
function buildChecklist(b: Bundle, mode: "review" | "correction", canAct: boolean, previewSeen: boolean) {
  const id = b.episode.id;
  const draft = b.draft;
  const adviceText = draft ? draft.advice.trim() : "";
  const rows: ReactNode[] = [];
  const open: CheckState[] = [];
  for (const it of b.checklist) {
    if (!it.done) open.push({ key: it.key, label: it.label, done: false });
    if (it.key === "flags" && it.manual && !it.done) {
      rows.push(<CheckRow key={it.key} done={false} label={it.label} onToggle={canAct ? () => dispatch(act.ackFlags(id)) : undefined} note="Acknowledge after reviewing each flagged value." />);
    } else if (it.key === "advice") {
      rows.push(<CheckRow key={it.key} done={it.done} label={it.label} onToggle={canAct ? () => dispatch(act.toggleReviewCheck(id, "advice")) : undefined}
        disabled={!it.done && !adviceText} reason="Write or insert advice first." />);
    } else if (it.key === "preview") {
      rows.push(<CheckRow key={it.key} done={it.done} label={it.label} onToggle={canAct ? () => dispatch(act.toggleReviewCheck(id, "preview")) : undefined}
        disabled={!it.done && !previewSeen} reason="Open the participant preview first." />);
    } else {
      rows.push(<CheckRow key={it.key} done={it.done} label={it.label} note={it.note} />);
    }
  }
  if (mode === "correction") {
    const done = !!draft && !!draft.checklist.rereview;
    if (!done) open.push({ key: "rereview", label: "Re-review of the corrected report", done: false });
    rows.push(<CheckRow key="rereview" done={done} label="Re-review of the corrected report completed" onToggle={canAct && draft ? () => dispatch(act.toggleReviewCheck(id, "rereview")) : undefined}
      note="A correction always needs a fresh clinician review." disabled={!draft} reason="Start a correction first." />);
  }
  return { rows, open };
}

/* ---- release card ---- */
export function ReleaseCard({ b, mode, canAct, previewSeen }: { b: Bundle; mode: "review" | "correction"; canAct: boolean; previewSeen: boolean }) {
  const state = usePhState();
  const id = b.episode.id;
  const { rows, open } = buildChecklist(b, mode, canAct, previewSeen);
  const last = b.versions.length ? b.versions[b.versions.length - 1].version : 0;
  const nextVersion = b.draft ? b.draft.version : last + 1;
  const urgent = hasUrgentFollowUp(state, b.episode);
  const routineReasons = b.routine.reasons;
  const routineOk = mode === "review" && b.routine.ok;
  const stateOk = mode === "review" ? b.episode.reportState === "ready_for_review" : !!b.draft && !!b.draft.correctionReason;
  const ready = stateOk && open.length === 0;
  const doneCount = rows.length - open.length;
  return (
    <Card pad="sm">
      <SecTitle right={<span className="phr-sub ph-num">{doneCount} of {rows.length} done</span>}>{mode === "review" ? "Release checklist" : "Correction checklist"}</SecTitle>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>{rows}</ul>
      {canAct ? (
        <div className="phr-gap" style={{ marginTop: 12 }}>
          <Button variant="primary" icon="send" disabled={!ready}
            title={ready ? undefined : open.length ? "Open items: " + open.map((x) => x.label).join("; ") : "Not ready for release"}
            onClick={() => dispatch(mode === "review" ? act.releaseReport(id) : act.releaseCorrection(id))}>
            {mode === "review" ? `Release report v${nextVersion}` : `Release corrected v${nextVersion}`}
          </Button>
          {!ready ? <div className="phr-sub">{stateOk ? `Complete the open items first: ${open.map((x) => x.label.toLowerCase()).join("; ")}.` : mode === "review" ? "Only an episode that is ready for review can be released." : "Start a correction with a reason first."}</div> : null}
          {mode === "review" ? (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <Button icon="check" disabled={!routineOk} onClick={() => dispatch(act.releaseRoutine(id))}
                title={routineOk ? "Releases this one episode. Never in bulk." : routineReasons.join(" ")}>
                Routine release, one click
              </Button>
              <div className="phr-sub" style={{ marginTop: 5 }}>
                {routineOk
                  ? "Available: every expected result is in, nothing is flagged and nothing is on hold. Uses your advice, or the approved routine wording if none is written. One episode per click, never in bulk."
                  : `Not available. ${routineReasons.join(" ")}`}
              </div>
              {urgent ? <div className="phr-sub" style={{ marginTop: 5, color: "var(--warn)" }}>A clinician-assigned urgent follow-up is recorded on this episode ({b.episode.followUpIds.join(", ")}). Check its outcome before choosing the release route.</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/* ---- review flags ---- */
export function FlagsCard({ b, canAct }: { b: Bundle; canAct: boolean }) {
  const state = usePhState();
  if (!b.flags.length) return null;
  const acked = !!b.draft && b.draft.flagAcknowledged;
  const legacy = b.observations.filter((o) => o.legacyDisplayedFlag === "normal" && o.flag === "review_required");
  const dq = state.dqIssues.filter((d) => d.episodeId === b.episode.id && d.kind === "flag_inconsistency");
  return (
    <Card pad="sm">
      <SecTitle right={<Pill tone="warn" icon="flag">{b.flags.length === 1 ? "1 flag" : `${b.flags.length} flags`}</Pill>}>Individual review required</SecTitle>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink)" }}>
        {b.flags.map((f, i) => <li key={i}>Review required: {f.text}</li>)}
      </ul>
      {legacy.length ? (
        <div style={{ marginTop: 10 }}>
          <Banner tone="warn" icon="alert">
            <b>Displayed flag corrected.</b> The legacy spreadsheet-style summary showed {legacy.map((o) => o.code).join(", ")} as normal although the value is above the displayed limit. Pulse shows Review required. Data Quality raised it; no replacement threshold is proposed.
            {dq.map((d) => (
              <div key={d.id} className="phr-row" style={{ marginTop: 6, gap: 6 }}>
                <span className="phr-mono">{d.id}</span>
                <Pill tone={d.status === "open" ? "warn" : "neutral"} icon={d.status === "open" ? "alert" : "check"}>{d.status === "open" ? "Open" : d.status === "acknowledged" ? "Acknowledged" : "Resolved"}</Pill>
                {d.status === "open" && canAct ? <Button size="sm" variant="ghost" onClick={() => dispatch(act.acknowledgeDq(d.id))}>Acknowledge item</Button> : null}
              </div>
            ))}
          </Banner>
        </div>
      ) : null}
      <div style={{ marginTop: 10 }}>
        {acked ? (
          <Banner tone="ok" icon="check">Flags acknowledged in draft v{b.draft!.version}. Your name is recorded against them at release.</Banner>
        ) : canAct ? (
          <Button icon="check" onClick={() => dispatch(act.ackFlags(b.episode.id))}>I have reviewed each flag individually</Button>
        ) : null}
      </div>
    </Card>
  );
}

/* ---- advice ---- */
const WORDING = [
  ...ADVICE_ROUTINE.map((t, i) => ({ id: `r${i}`, label: `Approved routine wording ${i + 1}`, text: t })),
  ...ADVICE_FLAGGED.map((t, i) => ({ id: `f${i}`, label: `Approved wording for flagged results ${i + 1}`, text: t })),
];

function AdviceEditor({ b, editable }: { b: Bundle; editable: boolean }) {
  const state = usePhState();
  const id = b.episode.id;
  const stored = b.draft ? b.draft.advice : b.released && b.episode.reportState === "released" ? b.released.advice : "";
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState<"idle" | "pending" | "saved">("idle");
  const sent = useRef(stored);
  const latest = useRef(stored);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);

  const flush = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    const v = latest.current;
    if (v === sent.current) return;
    sent.current = v;
    const r = dispatch(act.setAdvice(id, v), { silent: true });
    if (mounted.current) setStatus(r.ok ? "saved" : "idle");
  }, [id]);
  // Adopt changes that did not come from this editor, such as an accepted drafting preview.
  useEffect(() => {
    if (stored !== sent.current) { sent.current = stored; latest.current = stored; setText(stored); }
  }, [stored]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; flush(); }; }, [flush]);

  const change = (v: string) => {
    setText(v);
    latest.current = v;
    setStatus("pending");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };
  const ai = state.aiDrafts[id];
  const aiOn = state.settings.aiDraftingOn;
  const usedAi = !!ai && !!b.draft && b.draft.adviceSource === "ai_draft_approved" && b.draft.advice === ai.text;

  return (
    <div className="phr-gap">
      <Textarea rows={6} value={text} disabled={!editable} onChange={(e) => change(e.target.value)} onBlur={flush}
        aria-label="Advice for the participant" placeholder="Write advice for the participant in plain language. Do not include anything not supported by the results." />
      <div className="phr-row" style={{ justifyContent: "space-between" }}>
        <span className="phr-sub">{!editable ? "Read only" : status === "pending" ? "Saving draft" : status === "saved" ? "Draft saved" : b.draft ? `Draft v${b.draft.version}, ${b.draft.adviceSource === "ai_draft_approved" ? "from the drafting preview, edited by you" : "written by you"}` : "No draft yet"}</span>
        <span className="phr-sub ph-num">{text.trim().length} characters</span>
      </div>
      {editable ? (
        <Select value="" aria-label="Insert approved wording" onChange={(e) => { const w = WORDING.find((x) => x.id === e.target.value); if (w) { change(w.text); flush(); } }}>
          <option value="">Insert approved sample wording</option>
          {WORDING.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </Select>
      ) : null}
      {editable ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div className="phr-row" style={{ justifyContent: "space-between", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Clinical Drafting preview</span>
            <DemoTag>Optional, no model connected</DemoTag>
          </div>
          {!aiOn ? (
            <div className="phr-sub" style={{ marginTop: 6 }}>Switched off in Settings, AI Controls. Writing advice manually is unaffected.</div>
          ) : ai ? (
            <div className="phr-gap" style={{ marginTop: 8 }}>
              <div className="phr-csv" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12 }}>{ai.text}</div>
              <div className="phr-row" style={{ justifyContent: "space-between" }}>
                <span className="phr-sub">Prepared {fmtTime(ai.at)}. Demo content for you to edit and approve.</span>
                <Button size="sm" disabled={usedAi} onClick={() => { flush(); dispatch(act.acceptAiDraft(id)); }}>{usedAi ? "Copied into advice" : "Copy into advice"}</Button>
              </div>
            </div>
          ) : (
            <div className="phr-gap" style={{ marginTop: 6 }}>
              <div className="phr-sub">Drafts wording from this episode's own flag labels and approved content. It never diagnoses, invents values or decides urgency.</div>
              <div><Button size="sm" icon="spark" onClick={() => dispatch(act.aiDraft(id))}>Prepare a drafting preview</Button></div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AdviceCard({ b, editable, mode }: { b: Bundle; editable: boolean; mode: "review" | "correction" }) {
  return (
    <Card pad="sm">
      <SecTitle right={<span className="phr-sub">{mode === "correction" ? "Starts from the released advice" : "Clinician-owned"}</span>}>Advice</SecTitle>
      <AdviceEditor key={b.episode.id + ":" + mode} b={b} editable={editable} />
    </Card>
  );
}

/* ---- participant preview summary ---- */
export function PreviewCard({ b, onOpen, seen, mode }: { b: Bundle; onOpen: () => void; seen: boolean; mode: "review" | "correction" }) {
  const advice = b.draft ? b.draft.advice : b.released ? b.released.advice : "";
  const review = b.observations.filter((o) => o.flag === "review_required").length;
  const pend = b.tests.filter((t) => t.status !== "received").length;
  const visible = b.episode.reportState === "released" && !b.draft;
  return (
    <Card pad="sm">
      <SecTitle right={<Button size="sm" icon="eye" onClick={onOpen}>Open preview</Button>}>Participant report</SecTitle>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: "var(--body)" }}>
        <li>Advice page: {advice.trim() ? "written" : "not written yet"}</li>
        <li>Your answers: questionnaire, self-reported</li>
        <li>Test sections: {b.tests.length} expected tests{review ? `, ${review} marked Review required` : ""}{pend ? `, ${pend} not yet received` : ""}</li>
        <li>Body measurements, BMI calculated locally</li>
        <li>QRISK3: approved integration required, no score</li>
        <li>Explanation, limitations and next steps</li>
      </ul>
      <div className="phr-sub" style={{ marginTop: 8 }}>
        {visible ? "This version is visible to the participant in the portal." : mode === "correction" ? "The participant keeps seeing the released version until the correction is released." : "Not visible to the participant until it is released."}
        {seen ? " You opened this preview." : ""}
      </div>
    </Card>
  );
}

/* ---- released state ---- */
export function ReleasedCard({ b, onNext }: { b: Bundle; onNext?: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const v = b.released;
  if (!v) return null;
  const msg = state.messages.find((m) => m.logicalId === `LM-A-${v.id}`);
  return (
    <Card pad="sm">
      <SecTitle right={<Pill tone="ok" icon="check">Released</Pill>}>Report released</SecTitle>
      <div className="phr-gap">
        <div className="phr-note">
          v{v.version} released {fmtWhen(v.releasedAt!, state.clock.nowUtc)} by {staffName(state, v.releasedBy)}, {v.releaseMode === "routine" ? "as a routine report with no review flags" : "after individual review of flagged values"}.
          {v.flagAcknowledged ? " Review flags were acknowledged individually." : ""} The participant can now open it in the portal.
        </div>
        {msg ? (
          <div className="phr-banner">
            <Icon name={msg.channel === "sms" ? "sms" : "mail"} size={14} style={{ color: "var(--dim)", marginTop: 1 }} />
            <div className="ph-grow">
              Availability notice <span className="phr-mono">{msg.id}</span> by {msg.channel === "sms" ? "SMS" : "email"} to {msg.destination}: {msg.status}. It says a report is ready and contains no results. <DemoTag>Simulated</DemoTag>
            </div>
          </div>
        ) : null}
        <div className="phr-row">
          <Button icon="user" onClick={() => nav.openPortal(b.person.id)} title={p.isParticipant ? undefined : "Opens the participant portal preview as this participant"}>Participant portal preview</Button>
          <Button variant="ghost" onClick={() => nav.go({ page: "Results", tab: "corrections", params: { episode: b.episode.id } })}>Version history</Button>
          {onNext ? <Button variant="ghost" icon="arrow" onClick={onNext}>Next in queue</Button> : null}
        </div>
      </div>
    </Card>
  );
}
