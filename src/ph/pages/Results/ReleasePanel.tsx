/* Right-hand review controls, shared by Review and Corrections: the release checklist and
   release buttons, individual flag acknowledgement, the advice editor (manual first, with an
   optional Clinical Drafting preview), the participant preview summary and the released state.
   Every change goes through dispatch(act.*); the model rejects anything out of order. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ADVICE_FLAGGED, ADVICE_ROUTINE, HOLD_LABEL, act, fmtTime, fmtWhen, staffName } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, DemoTag, Icon, Pill, Select, Textarea } from "../../ui";
import { BAND_LOOK } from "../../report/bands";
import type { Bundle } from "./EpisodePanels";
import { Banner, SecTitle } from "./shared";
import { hasUrgentFollowUp } from "./select";
import { buildViewer } from "./Sheet";
import type { ViewerModel } from "./Sheet";

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
        disabled={!it.done && !previewSeen} reason="Preview the participant report first." />);
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

/* ---- the all normal shortcut ---- */
/**
 * Why the all normal shortcut is unavailable, in short lines. Starts from the model's
 * routineEligibility and adds the viewer's own checks (any borderline or abnormal cell, a nurse
 * referral, an ECG review, a pending test), so the shortcut can never be offered while the
 * sheet shows anything that is not normal.
 */
export function routineBlockers(b: Bundle, v: ViewerModel | null): string[] {
  const out: string[] = [];
  const st = b.episode.reportState;
  if (st === "on_hold") out.push(`On hold: ${b.episode.hold ? HOLD_LABEL[b.episode.hold.kind] : "hold open"}.`);
  else if (st === "released") out.push("Already released.");
  else if (st !== "ready_for_review") out.push("Not ready for review.");
  const pend = Array.from(new Set(b.tests.filter((t) => t.status !== "received").map((t) => t.name).concat(v ? v.pending.map((c) => c.label) : [])));
  if (pend.length) out.push(`Pending: ${pend.join(", ")}.`);
  if ((v && v.referral) || b.flags.some((f) => f.kind === "nurse_referral")) out.push("Nurse referral: significantly abnormal results, refer to doctor.");
  if (v && v.ecgReview) out.push("ECG review requested.");
  const flagged = b.flags.filter((f) => f.kind !== "nurse_referral");
  const covered = (c: { code?: string; key?: string }) => flagged.some((f) => (!!c.code && f.code === c.code) || (!!c.key && f.key === c.key));
  const abn = Array.from(new Set(flagged.map((f) => f.label).concat(v ? v.nonNormal.filter((c) => !covered(c)).map((c) => c.label) : [])));
  if (abn.length) out.push(`Borderline or abnormal: ${abn.join(", ")}.`);
  const known = /^(On hold|Already released|Not ready for review|Expected tests not accounted for|Review required)/;
  for (const r of b.routine.reasons) if (!known.test(r)) out.push(r.replace(/\.?$/, "."));
  return out;
}

/* ---- release card ---- */
export function ReleaseCard({ b, mode, canAct, previewSeen }: { b: Bundle; mode: "review" | "correction"; canAct: boolean; previewSeen: boolean }) {
  const state = usePhState();
  const id = b.episode.id;
  const { rows, open } = buildChecklist(b, mode, canAct, previewSeen);
  const last = b.versions.length ? b.versions[b.versions.length - 1].version : 0;
  const nextVersion = b.draft ? b.draft.version : last + 1;
  const urgent = hasUrgentFollowUp(state, b.episode);
  const blockers = mode === "review" ? routineBlockers(b, buildViewer(state, b)) : [];
  const routineOk = mode === "review" && b.routine.ok && blockers.length === 0;
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
            {mode === "review" ? `Finalise and release v${nextVersion}` : `Release corrected v${nextVersion}`}
          </Button>
          {!ready ? <div className="phr-sub">{stateOk ? `Complete the open items first: ${open.map((x) => x.label.toLowerCase()).join("; ")}.` : mode === "review" ? "Only an episode that is ready for review can be released." : "Start a correction with a reason first."}</div> : null}
          {mode === "review" ? <RoutineShortcut id={id} ok={routineOk} blockers={blockers} urgent={urgent ? b.episode.followUpIds.join(", ") : null} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

function RoutineShortcut({ id, ok, blockers, urgent }: { id: string; ok: boolean; blockers: string[]; urgent: string | null }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <Button icon={ok ? "check" : "lock"} disabled={!ok} onClick={() => dispatch(act.releaseRoutine(id))}
        title={ok ? "Releases this one episode with the approved routine wording if no advice is written. Never in bulk." : blockers.join(" ")}>
        {ok ? "All normal: approve and release" : "All normal shortcut unavailable"}
      </Button>
      {ok ? (
        <div className="phr-sub" style={{ marginTop: 5 }}>Every value on the sheet is normal, every expected result is in and nothing is on hold. One episode per click, never in bulk.</div>
      ) : (
        <>
          <div className="phr-sub" style={{ marginTop: 5 }}>Needs individual review:</div>
          <ul className="phr-blockers">{blockers.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      {urgent ? <div className="phr-sub" style={{ marginTop: 5, color: "var(--warn)" }}>A clinician-assigned urgent follow-up is recorded on this episode ({urgent}). Check its outcome before choosing the release route.</div> : null}
    </div>
  );
}

/** Release is not available: on hold or awaiting results. Shows why, including the shortcut blockers. */
export function ReleaseUnavailableCard({ b, onNext }: { b: Bundle; onNext?: () => void }) {
  const state = usePhState();
  const st = b.episode.reportState;
  const blockers = routineBlockers(b, buildViewer(state, b));
  return (
    <Card pad="sm">
      <SecTitle right={<Pill tone={st === "on_hold" ? "warn" : "neutral"} icon={st === "on_hold" ? "flag" : "clock"}>{st === "on_hold" ? "On hold" : "Awaiting results"}</Pill>}>Release not available</SecTitle>
      <div className="phr-note">
        {st === "on_hold" ? "Resolve the hold first; the episode then joins the review queue for individual review." : "Expected results are still missing. Missing tests are never treated as normal."}
      </div>
      <div style={{ marginTop: 10 }}>
        <Button icon="lock" disabled title={blockers.join(" ")}>All normal shortcut unavailable</Button>
        <ul className="phr-blockers">{blockers.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      {onNext ? <div style={{ marginTop: 10 }}><Button size="sm" icon="arrow" onClick={onNext}>Back to the queue</Button></div> : null}
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
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, lineHeight: 1.45, color: "var(--ink)" }}>
        {b.flags.map((f, i) => (
          <li key={i}>
            {f.band ? <span className="phr-band-chip" style={{ background: BAND_LOOK[f.band].fill, color: BAND_LOOK[f.band].ink }}>{BAND_LOOK[f.band].label}</span> : null} {f.text}
          </li>
        ))}
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

/**
 * The clinician's advice editor. Saves the draft through act.setAdvice after a short pause and on
 * blur, and reports every keystroke through onTextChange so the report preview shows the text as
 * typed. variant "sheet" is the NEW ADVICE box under the results viewer, with the optional
 * drafting preview behind a secondary button; "card" is the stacked editor used in Corrections.
 */
export function AdviceEditor({ b, editable, variant = "card", onTextChange, readOnlyNote }: {
  b: Bundle; editable: boolean; variant?: "sheet" | "card"; onTextChange?: (text: string) => void; readOnlyNote?: string;
}) {
  const state = usePhState();
  const id = b.episode.id;
  const stored = b.draft ? b.draft.advice : b.released && b.episode.reportState === "released" ? b.released.advice : "";
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState<"idle" | "pending" | "saved">("idle");
  const [aiOpen, setAiOpen] = useState(false);
  const sent = useRef(stored);
  const latest = useRef(stored);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);
  const report = useRef(onTextChange);
  report.current = onTextChange;

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
    if (stored !== sent.current) { sent.current = stored; latest.current = stored; setText(stored); report.current?.(stored); }
  }, [stored]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; flush(); }; }, [flush]);

  const change = (v: string) => {
    setText(v);
    latest.current = v;
    report.current?.(v);
    setStatus("pending");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };
  const ai = state.aiDrafts[id];
  const aiOn = state.settings.aiDraftingOn;
  const usedAi = !!ai && !!b.draft && b.draft.adviceSource === "ai_draft_approved" && b.draft.advice === ai.text;
  const statusText = !editable ? (readOnlyNote || "Read only")
    : status === "pending" ? "Saving draft"
    : status === "saved" ? "Draft saved"
    : b.draft ? `Draft v${b.draft.version}, ${b.draft.adviceSource === "ai_draft_approved" ? "from the drafting preview, edited by you" : "written by you"}`
    : "No draft yet";
  const insert = editable ? (
    <Select value="" aria-label="Insert approved wording" onChange={(e) => { const w = WORDING.find((x) => x.id === e.target.value); if (w) { change(w.text); flush(); } }}>
      <option value="">Insert approved sample wording</option>
      {WORDING.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
    </Select>
  ) : null;
  const aiPreview = ai ? (
    <div className="phr-gap" style={{ gap: 8 }}>
      <div className="phr-csv" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12 }}>{ai.text}</div>
      <div className="phr-row" style={{ justifyContent: "space-between" }}>
        <span className="phr-sub">Prepared {fmtTime(ai.at)}. Demo content for you to edit and approve. It never diagnoses, invents values or decides urgency.</span>
        <Button size="sm" disabled={usedAi} onClick={() => { flush(); dispatch(act.acceptAiDraft(id)); }}>{usedAi ? "Copied into advice" : "Copy into advice"}</Button>
      </div>
    </div>
  ) : null;

  if (variant === "sheet") {
    return (
      <div className="phr-gap" style={{ gap: 0 }}>
        <textarea className="phr-vw-advice-input" rows={4} value={text} disabled={!editable} onChange={(e) => change(e.target.value)} onBlur={flush}
          aria-label="New advice for the participant"
          placeholder={editable ? "Write the participant's advice in plain language. Only what the results support." : "No advice written."} />
        <div className="phr-vw-advice-bar">
          <span className="phr-sub">{statusText}</span>
          <span className="phr-sub ph-num">{text.trim().length} characters</span>
          <span className="ph-grow" />
          {insert ? <div style={{ minWidth: 0, flex: "0 1 260px" }}>{insert}</div> : null}
          {editable ? (
            <Button size="sm" variant="ghost" icon="spark" disabled={!aiOn} aria-expanded={aiOpen}
              title={aiOn ? "Optional. Prepares a draft from this episode's own flags for you to edit." : "Switched off in Settings, AI Controls. Writing advice manually is unaffected."}
              onClick={() => { if (!ai) dispatch(act.aiDraft(id)); setAiOpen((o) => !o || !ai); }}>
              Draft with AI, optional
            </Button>
          ) : null}
        </div>
        {editable && aiOpen && ai ? <div className="phr-vw-advice-ai">{aiPreview}</div> : null}
      </div>
    );
  }

  return (
    <div className="phr-gap">
      <Textarea rows={6} value={text} disabled={!editable} onChange={(e) => change(e.target.value)} onBlur={flush}
        aria-label="Advice for the participant" placeholder="Write advice for the participant in plain language. Do not include anything not supported by the results." />
      <div className="phr-row" style={{ justifyContent: "space-between" }}>
        <span className="phr-sub">{statusText}</span>
        <span className="phr-sub ph-num">{text.trim().length} characters</span>
      </div>
      {insert}
      {editable ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div className="phr-row" style={{ justifyContent: "space-between", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Draft with AI</span>
            <DemoTag>Optional, no model connected</DemoTag>
          </div>
          {!aiOn ? (
            <div className="phr-sub" style={{ marginTop: 6 }}>Switched off in Settings, AI Controls. Writing advice manually is unaffected.</div>
          ) : ai ? <div style={{ marginTop: 8 }}>{aiPreview}</div> : (
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

export function AdviceCard({ b, editable, mode, onTextChange }: { b: Bundle; editable: boolean; mode: "review" | "correction"; onTextChange?: (text: string) => void }) {
  return (
    <Card pad="sm">
      <SecTitle right={<>{b.draft ? <Pill tone="info" icon="edit">Draft</Pill> : null}<span className="phr-sub">{mode === "correction" ? "Starts from the released advice" : "Clinician-owned"}</span></>}>Participant advice</SecTitle>
      <AdviceEditor key={b.episode.id + ":" + mode} b={b} editable={editable} onTextChange={onTextChange} />
    </Card>
  );
}

/* ---- participant preview summary ---- */
export function PreviewCard({ b, onOpen, seen, mode }: { b: Bundle; onOpen: () => void; seen: boolean; mode: "review" | "correction" }) {
  const advice = b.draft ? b.draft.advice : b.released ? b.released.advice : "";
  const review = b.observations.filter((o) => o.flag === "review_required").length;
  const pend = b.tests.filter((t) => t.status !== "received").length;
  const q = b.episode.qrisk;
  const visible = b.episode.reportState === "released" && !b.draft;
  return (
    <Card pad="sm">
      <SecTitle>Participant report</SecTitle>
      <div style={{ marginBottom: 8 }}><Button size="sm" icon="eye" onClick={onOpen}>Preview participant report</Button></div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: "var(--body)" }}>
        <li>Advice page: {advice.trim() ? "written" : "not written yet"}</li>
        <li>Lifestyle questionnaire answers, self-reported</li>
        <li>Test pages: {b.tests.length} laboratory tests{review ? `, ${review} borderline or abnormal` : ""}{pend ? `, ${pend} not yet received` : ""}</li>
        <li>Blood pressure, BMI, waist, ECG and urinalysis</li>
        <li>QRISK3: {q && q.eligible && q.score10y != null ? "licensed engine, sample output" : q && !q.eligible ? "not calculated for this participant" : "awaiting the licensed engine"}</li>
        <li>What is tested, limitations and what to do, per topic</li>
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
