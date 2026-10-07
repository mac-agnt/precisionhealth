/* The nurse form, "SISK Comprehensive (LAB) Screen V2", as one set of section components shared by
   the staff workspace (Clinics > Appointments) and the nurse portal. The client's section order,
   wording and option lists come from the model schema (NURSE_FORM_SECTIONS); visibility, missing
   fields, bands and the two automations run through the same model rules as the reducer, on the
   values on screen. Identity is confirmed with two identifiers before any clinical section opens.
   Colour is never the only signal: every band, state and selection also carries text or an icon. */
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AnalyteCode, Band, ClinicalCapture, Episode, MeasureKey, NurseFormCtx, NurseFormField, NurseFormSection, NurseFormValue, NurseSectionKey } from "../../model";
import {
  FIT_INFORMED_CHOICE_TEXT, IDENTITY_HELP, MEASURE_RULES, NURSE_FORM_SECTIONS, PROGRAMME_BY_ID, PSA_INFORMED_CHOICE_TEXT, REPORT_STATE_LABEL, act, ageOn, bmiCategory, bmiOf, bpCategory, ecgBand, expectedPanel,
  fitKitGiven, fmtDateLong, fmtDateTime, fmtNumericDate, fmtTime, isNurseReferral, ix, localTimeOf, measureError, needsEcgReview, nurseFieldValue, nurseFieldVisible,
  nurseFormMissing, nurseFormRows, nurseSectionVisible, parseIrishDate, psaTaken, urineBand, waistCategory,
} from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { BAND_LOOK } from "../../report/bands";
import { Button, DemoTag, EntityLink, Icon, Pill, RestrictedNotice, Select, TextInput, Textarea } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import type { ApptRow } from "./selectors";
import { captureRule, nextEpisodeNumber, pad4 } from "./selectors";
import { useWidth } from "./shared";
import { QuestionnaireReview } from "./Questionnaire";
import { LabRequestPreview, LabelPrintCopy, SpecimenLabelPreview } from "./LabelPreview";
import {
  MEASURE_HINT, formBmi, formErrors, fromCapture, numericValue, positiveDipstick, prefillFor, toCapture, useCaptureForm, useConfirmations,
} from "./captureForm";
import type { CaptureFormApi, FormMap, FormValues, MeasureField, SaveStatus, UrineKey } from "./captureForm";
import "../NursePortal/nurse.css";

/* ---------------------------------------------------------------------------------------------
   Small pieces
   --------------------------------------------------------------------------------------------- */

const BAND_TEXT: Record<Band, string> = { normal: "Normal", borderline: "Borderline", abnormal: "Outside range", not_tested: "Not tested" };

/** A band as the clinician viewer colours it, always with its word. */
export function BandChip({ band, word, title }: { band: Band; word?: string; title?: string }) {
  const look = BAND_LOOK[band];
  return <span className="nf-band" style={{ background: look.fill, color: look.ink }} title={title || look.label}>{word || BAND_TEXT[band]}</span>;
}

export const SECTION_LABEL: Record<NurseSectionKey, string> = {
  registration: "Registration",
  cv_risk: "Cardiovascular risk",
  bowel: "Bowel cancer risk",
  psa: "PSA (men over 45 / requested)",
  measurements: "Measurements",
  ecg: "ECG",
  urinalysis: "Urinalysis",
  closeout: "Close-out",
};
const CV_SUBHEAD: Record<string, string> = { ethnicity: "Background", diabetesType2: "Medical conditions", treatedHypertension: "Medications", famHistoryCvd: "History" };
const TRUE_FALSE = ["TRUE", "FALSE"];
const YES_NO = ["Yes", "No"];

function fmtValue(v: NurseFormValue | undefined, words: string[] = YES_NO): string {
  if (v === null || v === undefined || v === "") return "not answered";
  if (typeof v === "boolean") return v ? words[0] : words[1];
  return String(v);
}

/** Radio buttons sized for touch. The selected option shows a tick as well as the colour. */
function Options({ labelledBy, options, words, value, onChange, disabled, grid, stack, render }: {
  labelledBy: string; options: Array<string | boolean>; words?: string[]; value: NurseFormValue; onChange: (v: string | boolean) => void; disabled?: boolean; grid?: boolean; stack?: boolean;
  render?: (o: string) => ReactNode;
}) {
  return (
    <div className={"nf-opts" + (grid ? " grid" : "") + (stack ? " stack" : "")} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((o, i) => {
        const on = value === o;
        return (
          <button key={String(o)} type="button" role="radio" aria-checked={on} className="nf-opt" disabled={disabled} onClick={() => onChange(o)}>
            <span className="nf-opt-tick" aria-hidden="true">{on ? <Icon name="check" size={13} stroke={2.4} /> : null}</span>
            <span className="nf-opt-text">{words ? words[i] : typeof o === "string" && render ? render(o) : String(o)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Several answers stored as one "a; b" string. "None of these" stands alone. */
function MultiChips({ labelledBy, options, value, onChange, disabled }: { labelledBy: string; options: string[]; value: NurseFormValue; onChange: (v: string | null) => void; disabled?: boolean }) {
  const cur = typeof value === "string" && value ? value.split("; ") : [];
  const toggle = (o: string) => {
    let next: string[];
    if (o === "None of these") next = cur.includes(o) ? [] : [o];
    else next = (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur.filter((x) => x !== "None of these"), o]);
    const ordered = options.filter((x) => next.includes(x));
    onChange(ordered.length ? ordered.join("; ") : null);
  };
  return (
    <div className="nf-opts stack" role="group" aria-labelledby={labelledBy}>
      {options.map((o) => {
        const on = cur.includes(o);
        return (
          <button key={o} type="button" role="checkbox" aria-checked={on} className="nf-opt" disabled={disabled} onClick={() => toggle(o)}>
            <span className="nf-opt-tick box" aria-hidden="true">{on ? <Icon name="check" size={13} stroke={2.4} /> : null}</span>
            <span className="nf-opt-text">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

const ecgAdviceLabel = (o: string): ReactNode => {
  const m = /^([A-Za-z]) (.*)$/.exec(o);
  return m ? <><strong className="nf-code">{m[1]}</strong> {m[2]}</> : o;
};

/* ---- questionnaire prefill marker ---- */
type MarkKind = "confirm" | "confirmed" | "changed" | "said" | "ask" | "booking";
interface Mark { kind: MarkKind; was?: NurseFormValue }

function markOf(field: NurseFormField, cur: NurseFormValue, prefill: FormMap, confirmed: (k: string) => boolean): Mark | null {
  if (field.prefillFrom === "booking" && field.store === "form") {
    const pre = prefill[field.key];
    return pre !== undefined && pre !== null && cur === pre ? { kind: "booking" } : null;
  }
  if (field.prefillFrom !== "questionnaire") return null;
  const pre = prefill[field.key];
  if (pre === undefined || pre === null) return { kind: "ask" };
  if (cur === null || cur === undefined || cur === "") return { kind: "said", was: pre };
  if (cur === pre) return { kind: confirmed(field.key) ? "confirmed" : "confirm" };
  return { kind: "changed", was: pre };
}

function PrefillMark({ mark, words, onConfirm, onUndo, onUse, disabled }: { mark: Mark; words: string[]; onConfirm: () => void; onUndo: () => void; onUse: () => void; disabled?: boolean }) {
  switch (mark.kind) {
    case "confirm":
      return (
        <span className="nf-mark confirm">
          <Icon name="file" size={12} />From questionnaire, confirm
          <button type="button" className="nf-mark-btn" disabled={disabled} onClick={onConfirm}>Confirm</button>
        </span>
      );
    case "confirmed":
      return (
        <span className="nf-mark ok">
          <Icon name="check" size={12} stroke={2.2} />Confirmed with participant
          <button type="button" className="nf-mark-btn ghost" disabled={disabled} onClick={onUndo} aria-label="Undo confirmation">Undo</button>
        </span>
      );
    case "changed":
      return <span className="nf-mark info"><Icon name="edit" size={12} />Changed at appointment. Questionnaire said {fmtValue(mark.was, words)}</span>;
    case "said":
      return (
        <span className="nf-mark confirm">
          <Icon name="file" size={12} />Questionnaire said {fmtValue(mark.was, words)}
          <button type="button" className="nf-mark-btn" disabled={disabled} onClick={onUse}>Use</button>
        </span>
      );
    case "ask":
      return <span className="nf-mark"><Icon name="info" size={12} />Not in the questionnaire, ask</span>;
    case "booking":
      return <span className="nf-mark"><Icon name="calendar" size={12} />From booking</span>;
  }
}

/* ---- one field ---- */
function FieldShell({ field, labelId, htmlFor, missing, error, help, mark, children, after, wide }: {
  field: NurseFormField; labelId: string; htmlFor?: string; missing: boolean; error?: string; help?: ReactNode; mark?: ReactNode; children: ReactNode; after?: ReactNode; wide?: boolean;
}) {
  return (
    <div className={"nf-field" + (missing ? " is-missing" : "") + (error ? " is-error" : "") + (wide ? " wide" : "")} data-field={field.key}>
      <div className="nf-field-head">
        <label className="nf-label" id={labelId} htmlFor={htmlFor}>
          {field.label}
          {!field.required ? <span className="nf-tag">Optional</span> : null}
        </label>
        {missing ? <span className="nf-need"><Icon name="clock" size={11} />To answer</span> : null}
        {mark}
      </div>
      {children}
      {error ? <div className="ph-err" role="alert">{error}</div> : help ? <div className="ph-help nf-help">{help}</div> : null}
      {after}
    </div>
  );
}

/* ---- measures ---- */
function MeasureRow({ field, m, onChange, disabled, error, missing, extra, provenance }: {
  field: NurseFormField; m: MeasureField; onChange: (f: MeasureField) => void; disabled: boolean; error?: string; missing: boolean; extra?: ReactNode; provenance?: boolean;
}) {
  const k = field.measureKey as MeasureKey;
  const r = MEASURE_RULES[k];
  const id = useId();
  const labelId = useId();
  const text = m.text.trim();
  const peakZero = k === "peakFlow" && m.mode === "value" && /^0+$/.test(text);
  const n = Number(text.replace(",", "."));
  const cmHeight = k === "heightM" && m.mode === "value" && /^\d{3}(\.\d)?$/.test(text) && n >= 100 && n <= 230;
  let msg: ReactNode = null;
  if (peakZero) {
    msg = (
      <div className="nf-hint">
        <Icon name="info" size={13} />
        <span>On the paper form 0 meant not done. Mark it Not done, so it is never read as a value.</span>
        <Button size="sm" disabled={disabled} onClick={() => onChange({ ...m, text: "", mode: "not_done" })}>Mark Not done</Button>
      </div>
    );
  } else if (cmHeight) {
    msg = (
      <div className="nf-hint">
        <Icon name="info" size={13} />
        <span>That looks like centimetres. Height is recorded in metres.</span>
        <Button size="sm" disabled={disabled} onClick={() => onChange({ ...m, text: (n / 100).toFixed(2) })}>Use {(n / 100).toFixed(2)} m</Button>
      </div>
    );
  } else if (error) msg = <div className="ph-err" role="alert">{error}</div>;
  else if (m.mode === "not_done") msg = <div className="ph-help nf-help">Recorded as not done. Not counted as a value.</div>;
  else if (m.mode === "declined") msg = <div className="ph-help nf-help">Recorded as declined by the participant. Not counted as a value.</div>;
  else if (field.help) msg = <div className="ph-help nf-help">{field.help}</div>;
  else if (!text) msg = <div className="ph-help nf-help">{MEASURE_HINT[k]}.</div>;
  const setMode = (mode: MeasureField["mode"]) => onChange({ ...m, mode: m.mode === mode ? "value" : mode, text: m.mode === mode ? m.text : "" });
  return (
    <div className={"nf-field nf-measure" + (missing ? " is-missing" : "") + (error && !peakZero && !cmHeight ? " is-error" : "")} data-field={field.key}>
      <div className="nf-field-head">
        <label className="nf-label" id={labelId} htmlFor={id}>{field.label}</label>
        <span className="nf-range">Accepted {r.min} to {r.max} {r.unit}</span>
        {missing ? <span className="nf-need"><Icon name="clock" size={11} />To answer</span> : null}
      </div>
      <div className="nf-mrow">
        <div className="nf-minput">
          <TextInput id={id} value={m.mode === "value" ? m.text : ""} placeholder={m.mode === "not_done" ? "Not done" : m.mode === "declined" ? "Declined" : ""}
            disabled={disabled || m.mode !== "value"} inputMode="decimal" autoComplete="off" invalid={!!error && !peakZero && !cmHeight} onChange={(e) => onChange({ ...m, text: e.target.value })} />
          <span className="nf-unit">{r.unit}</span>
        </div>
        <div className="nf-mstate" role="group" aria-labelledby={labelId}>
          <button type="button" className="nf-opt sm" aria-pressed={m.mode === "not_done"} disabled={disabled} onClick={() => setMode("not_done")}>
            <span className="nf-opt-tick" aria-hidden="true">{m.mode === "not_done" ? <Icon name="check" size={12} stroke={2.4} /> : null}</span>Not done
          </button>
          <button type="button" className="nf-opt sm" aria-pressed={m.mode === "declined"} disabled={disabled} onClick={() => setMode("declined")}>
            <span className="nf-opt-tick" aria-hidden="true">{m.mode === "declined" ? <Icon name="check" size={12} stroke={2.4} /> : null}</span>Declined
          </button>
        </div>
        {provenance ? (
          <Select aria-label={`${field.label}: source`} className="nf-prov" value={m.provenance} disabled={disabled} onChange={(e) => onChange({ ...m, provenance: e.target.value === "self_reported" ? "self_reported" : "measured" })}>
            <option value="measured">Measured</option>
            <option value="self_reported">Self-reported</option>
          </Select>
        ) : null}
      </div>
      {msg}
      {extra}
    </div>
  );
}

function CategoryLine({ band, word, children }: { band: Band; word: string; children?: ReactNode }) {
  return <div className="nf-cat"><BandChip band={band} word={word} />{children ? <span className="ph-faint">{children}</span> : null}</div>;
}

/** A repeat blood pressure reading, kept in Nurse comments so the first reading stays as recorded. */
function RepeatReading({ onAdd, at, disabled }: { onAdd: (line: string) => void; at: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sysId = useId(), diaId = useId();
  const add = () => {
    const s = Number(sys.trim()), d = Number(dia.trim());
    if (!/^\d+$/.test(sys.trim()) || !/^\d+$/.test(dia.trim())) { setErr("Enter both readings as whole numbers."); return; }
    const e = measureError("bpSys", s) || measureError("bpDia", d) || (s <= d ? "Systolic must be higher than diastolic." : null);
    if (e) { setErr(e); return; }
    onAdd(`Repeat blood pressure at ${at}: ${s}/${d} mmHg, measured.`);
    setSys(""); setDia(""); setErr(null); setOpen(false);
  };
  if (!open) return <div><Button size="sm" icon="plus" disabled={disabled} onClick={() => setOpen(true)}>Add a repeat reading</Button></div>;
  return (
    <div className="nf-sub">
      <div className="ph-faint" style={{ fontSize: 11.5, marginBottom: 8 }}>Repeat blood pressure. It is added to Nurse comments for the reviewing doctor; the first reading stays as recorded.</div>
      <div className="nf-inline">
        <div><label className="ph-label" htmlFor={sysId}>Systolic (mmHg)</label><TextInput id={sysId} value={sys} inputMode="numeric" onChange={(e) => setSys(e.target.value)} /></div>
        <div><label className="ph-label" htmlFor={diaId}>Diastolic (mmHg)</label><TextInput id={diaId} value={dia} inputMode="numeric" onChange={(e) => setDia(e.target.value)} /></div>
        <div className="ph-wrap"><Button size="sm" variant="primary" disabled={!sys.trim() || !dia.trim()} onClick={add}>Add to comments</Button><Button size="sm" variant="ghost" onClick={() => { setOpen(false); setErr(null); }}>Cancel</Button></div>
      </div>
      {err ? <div className="ph-err" role="alert">{err}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
   Save state
   --------------------------------------------------------------------------------------------- */
export function SavePill({ status, editable, dirty }: { status: SaveStatus; editable: boolean; dirty: boolean }) {
  if (!editable) return <Pill tone="neutral" icon="lock">Read only</Pill>;
  const map: Record<SaveStatus["kind"], { tone: Tone; icon: GlyphName; text: string }> = {
    idle: { tone: "neutral", icon: "dot", text: "Nothing saved yet" },
    pending: { tone: "neutral", icon: "clock", text: "Saving" },
    saved: { tone: "ok", icon: "check", text: status.kind === "saved" && status.at ? `Saved ${fmtTime(status.at)}` : "Saved" },
    invalid: { tone: "bad", icon: "alert", text: "Not saved: check a value" },
    error: { tone: "bad", icon: "x", text: "Save failed" },
    conflict: { tone: "warn", icon: "alert", text: "Save conflict" },
  };
  const m = dirty && status.kind === "saved" ? map.pending : map[status.kind];
  return <Pill tone={m.tone} icon={m.icon} title="Changes save automatically about a second after you stop typing">{m.text}</Pill>;
}

export function SaveProblems({ f }: { f: CaptureFormApi }) {
  if (f.status.kind === "conflict") {
    return (
      <div className="clx-banner warn" role="alert">
        <Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--ink)" }}>{f.status.message}</div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Your entries are still on this screen. Merging keeps every field you changed and takes the other copy for the rest.</div>
          <div className="ph-wrap" style={{ marginTop: 8 }}>
            <Button size="sm" variant="primary" icon="refresh" onClick={f.mergeAndSave}>Merge my edits and save</Button>
            <Button size="sm" variant="ghost" onClick={f.discardMine}>Discard my edits</Button>
          </div>
        </div>
      </div>
    );
  }
  if (f.stale) {
    return (
      <div className="clx-banner info" role="status">
        <Icon name="refresh" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--ink)" }}>This record was saved somewhere else since you opened it.</div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>{f.dirty ? "You have unsaved entries. Your next save will ask how to combine them." : "Load the latest copy before you continue."}</div>
          <div className="ph-wrap" style={{ marginTop: 8 }}>
            {f.dirty ? <Button size="sm" variant="primary" icon="refresh" onClick={f.mergeAndSave}>Merge my edits and save</Button> : null}
            <Button size="sm" variant={f.dirty ? "ghost" : "primary"} onClick={f.discardMine}>{f.dirty ? "Discard my edits" : "Load latest"}</Button>
          </div>
        </div>
      </div>
    );
  }
  if (f.status.kind === "error") {
    return <div className="clx-banner bad" role="alert"><Icon name="x" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>Save failed: {f.status.message} Your entries are kept on this screen.</span></div>;
  }
  if (f.status.kind === "invalid") {
    return <div className="clx-banner bad" role="alert"><Icon name="alert" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>Not saved: {f.status.message} Your entry is kept here until you correct it.</span></div>;
  }
  return null;
}

/* ---------------------------------------------------------------------------------------------
   Section state for the rail
   --------------------------------------------------------------------------------------------- */
export type SectionStateKind = "done" | "todo" | "error" | "na" | "locked";
export interface SectionState {
  section: NurseFormSection;
  label: string;
  applicable: boolean;
  locked: boolean;
  missing: Array<{ key: string; label: string }>;
  errorKeys: string[];
  toConfirm: string[];
  state: SectionStateKind;
  sub: string;
}

function sectionStates(synth: ClinicalCapture, ctx: NurseFormCtx, errors: Record<string, string>, identityOk: boolean, prefill: FormMap, confirmed: (k: string) => boolean): SectionState[] {
  const missingAll = nurseFormMissing(synth, ctx);
  return NURSE_FORM_SECTIONS.map((section) => {
    const applicable = nurseSectionVisible(section, synth, ctx);
    const locked = !identityOk && section.key !== "registration";
    const missing = missingAll.filter((m) => m.section === section.key).map((m) => ({ key: m.key, label: m.label }));
    if (section.key === "registration" && !identityOk) missing.unshift({ key: "identity", label: "Identity check" });
    const keys = new Set(section.fields.map((f) => f.key));
    const errorKeys = Object.keys(errors).filter((k) => keys.has(k) || (k === "bp" && section.key === "measurements"));
    const toConfirm = applicable ? section.fields.filter((f) => f.prefillFrom === "questionnaire" && nurseFieldVisible(f, synth, ctx)
      && markOf(f, nurseFieldValue(synth, f), prefill, confirmed)?.kind === "confirm").map((f) => f.key) : [];
    let state: SectionStateKind;
    let sub: string;
    if (!applicable) { state = "na"; sub = section.key === "psa" ? "Not applicable: men only" : "Not applicable"; }
    else if (locked) { state = "locked"; sub = "After the identity check"; }
    else if (errorKeys.length) { state = "error"; sub = "Check a value"; }
    else if (missing.length || toConfirm.length) {
      state = "todo";
      sub = [missing.length ? `${missing.length} to answer` : "", toConfirm.length ? `${toConfirm.length} to confirm` : ""].filter(Boolean).join(", ");
    } else { state = "done"; sub = "Done"; }
    return { section, label: SECTION_LABEL[section.key], applicable, locked, missing, errorKeys, toConfirm, state, sub };
  });
}

const STATE_GLYPH: Record<SectionStateKind, { icon: GlyphName; cls: string; text: string }> = {
  done: { icon: "check", cls: "ok", text: "Done" },
  todo: { icon: "clock", cls: "todo", text: "To do" },
  error: { icon: "alert", cls: "bad", text: "Check a value" },
  na: { icon: "x", cls: "na", text: "Not applicable" },
  locked: { icon: "lock", cls: "na", text: "Locked" },
};

/* ---------------------------------------------------------------------------------------------
   The capture: section rail, section content, completion
   --------------------------------------------------------------------------------------------- */
export interface NurseCaptureProps {
  row: ApptRow;
  draft: ClinicalCapture;
  variant: "staff" | "portal";
  /** Called after the appointment completes. */
  onCompleted?: (bookingId: string) => void;
  /** Open a task created by an automation. Without it the link navigates in the staff app. */
  onOpenTask?: (taskId: string) => void;
}

export function NurseCapture({ row, draft, variant, onCompleted, onOpenTask }: NurseCaptureProps) {
  const state = usePhState();
  const p = usePersona();
  const rule = captureRule(state, row.session);
  const editable = rule.ok;
  const ctx: NurseFormCtx = { sex: row.person.sex, age: ageOn(row.person.dob, row.session.date) };
  const f = useCaptureForm(row.booking.id, draft, editable, ctx);
  const values = editable ? f.values : fromCapture(draft);
  const synth = toCapture(values, draft);
  const errors = formErrors(values, ctx);
  const identityOk = draft.identity.every((x) => x.confirmed);
  const prefill = prefillFor(state, row);
  const conf = useConfirmations(row.booking.id);
  const sections = sectionStates(synth, ctx, errors, identityOk, prefill, conf.has);
  const [active, setActive] = useState<NurseSectionKey>(() => {
    if (!identityOk) return "registration";
    const first = sections.find((s) => s.applicable && s.state !== "done");
    return first ? first.section.key : "closeout";
  });
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const wide = width === 0 ? variant === "staff" : width >= 700;
  const topRef = useRef<HTMLDivElement>(null);
  const go = (k: NurseSectionKey) => { setActive(k); topRef.current?.scrollIntoView({ block: "start" }); };

  const disabled = !editable;
  const setForm = (key: string, v: NurseFormValue) => {
    f.update((x) => { const form = { ...x.form }; if (v === null || v === "") delete form[key]; else form[key] = v; return { ...x, form }; });
    const pre = prefill[key];
    if (pre !== undefined && pre !== null && v === pre) conf.confirm([key]);
  };
  const setMeasure = (k: MeasureKey, m: MeasureField) => f.update((x) => ({ ...x, measures: { ...x.measures, [k]: m } }));
  const setUrine = (k: UrineKey, v: string) => f.update((x) => ({ ...x, urine: { ...x.urine, [k]: v } }));
  const setNotes = (t: string) => f.update((x) => ({ ...x, notes: t }));

  const cur = sections.find((s) => s.section.key === active) || sections[0];
  const order = sections.filter((s) => s.applicable);
  const idx = order.findIndex((s) => s.section.key === cur.section.key);
  const prevSec = idx > 0 ? order[idx - 1] : null;
  const nextSec = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const doneCount = sections.filter((s) => s.applicable && s.state === "done").length;
  const applicableCount = order.length;

  const kit: Kit = { row, draft, synth, values, errors, ctx, editable, disabled, prefill, conf, f, setForm, setMeasure, setUrine, setNotes, identityOk, variant, go, onOpenTask, onCompleted, sections };

  return (
    <div className={`nf nf-${variant}${wide ? " nf-wide" : " nf-narrow"}`} ref={wrapRef}>
      <div ref={topRef} className="nf-anchor" />
      <div className="nf-top">
        <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="nf-progress"><strong>{doneCount} of {applicableCount}</strong> sections done</span>
          <span className="ph-grow" />
          {identityOk ? <Pill tone="ok" icon="shield">Identity confirmed</Pill> : <Pill tone="warn" icon="alert">Identity not confirmed</Pill>}
          <SavePill status={f.status} editable={editable} dirty={f.dirty} />
        </div>
        {!editable ? <RestrictedNotice title="Read only">{rule.reason}</RestrictedNotice> : null}
        {editable && f.restored ? <div className="clx-banner info"><Icon name="refresh" size={14} style={{ color: "var(--accent)", marginTop: 2 }} /><span>Unsaved entries from earlier in this session were restored.</span></div> : null}
        {editable ? <SaveProblems f={f} /> : null}
        <AutomationBanners kit={kit} />
      </div>

      <div className="nf-body">
        <nav className="nf-rail" aria-label="Nurse form sections">
          {sections.map((s) => {
            const g = STATE_GLYPH[s.state];
            return (
              <button key={s.section.key} type="button" className={`nf-rail-item ${g.cls}`} aria-current={s.section.key === cur.section.key ? "step" : undefined}
                disabled={!s.applicable} onClick={() => go(s.section.key)} title={`${s.label}: ${s.sub}`}>
                <span className={`nf-rail-ico ${g.cls}`} aria-hidden="true"><Icon name={g.icon} size={12} stroke={2.2} /></span>
                <span className="nf-rail-text">
                  <span className="nf-rail-label">{s.label}</span>
                  <span className="nf-rail-sub">{s.sub}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="nf-main">
          <div className="nf-sec-head">
            <div className="ph-grow" style={{ minWidth: 200 }}>
              <div className="nf-sec-kicker">{SECTION_LABEL[cur.section.key]}</div>
              <h2 className="nf-sec-title">{cur.section.title}</h2>
              {cur.section.note ? <div className="ph-dim nf-sec-note">{cur.section.note}</div> : null}
            </div>
            {cur.toConfirm.length && !cur.locked ? (
              <Button variant="secondary" icon="check" disabled={disabled} onClick={() => conf.confirm(cur.toConfirm)}
                title="Use after reading each answer back to the participant">Confirm {cur.toConfirm.length} answer{cur.toConfirm.length === 1 ? "" : "s"}</Button>
            ) : null}
          </div>

          {cur.locked ? (
            <div className="nf-gate">
              <Icon name="shield" size={18} />
              <div>
                <div style={{ color: "var(--ink)", fontWeight: 600 }}>Confirm identity first</div>
                <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 3 }}>Two identifiers, date of birth and booking reference, before anything clinical. A name match alone is never enough.</div>
                <div style={{ marginTop: 10 }}><Button variant="primary" icon="arrow" onClick={() => go("registration")}>Go to the identity check</Button></div>
              </div>
            </div>
          ) : (
            <SectionBody kit={kit} sec={cur} />
          )}

          <div className="nf-pager">
            {prevSec ? <Button variant="ghost" icon="chevronLeft" onClick={() => go(prevSec.section.key)}>{prevSec.label}</Button> : <span />}
            <span className="ph-grow" />
            {nextSec ? <Button variant={cur.state === "done" ? "primary" : "secondary"} onClick={() => go(nextSec.section.key)}>Next: {nextSec.label}<Icon name="chevronRight" size={14} /></Button> : null}
          </div>
          <div className="ph-faint nf-foot">
            {draft.savedAt ? `Last saved ${fmtTime(draft.savedAt)}.` : "Not saved yet."} {editable ? `Recording as ${p.name}, ${p.title}.` : `Viewing as ${p.name}.`}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Kit {
  row: ApptRow; draft: ClinicalCapture; synth: ClinicalCapture; values: FormValues; errors: Record<string, string>; ctx: NurseFormCtx; editable: boolean; disabled: boolean;
  prefill: FormMap; conf: ReturnType<typeof useConfirmations>; f: CaptureFormApi; identityOk: boolean; variant: "staff" | "portal";
  setForm: (key: string, v: NurseFormValue) => void; setMeasure: (k: MeasureKey, m: MeasureField) => void; setUrine: (k: UrineKey, v: string) => void; setNotes: (t: string) => void;
  go: (k: NurseSectionKey) => void; onOpenTask?: (taskId: string) => void; onCompleted?: (bookingId: string) => void; sections: SectionState[];
}

/* ---- automation banners, driven by the reducer's own rules ---- */
function AutomationBanners({ kit }: { kit: Kit }) {
  const state = usePhState();
  const { row, draft, synth, onOpenTask } = kit;
  const lead = ix(state).staffById.get(row.programme.clinicalLeadId);
  const leadName = lead ? lead.displayName : "the clinical lead";
  const ecg = needsEcgReview(synth);
  const raised = draft.ecgReview;
  const referral = isNurseReferral(synth);
  if (!ecg && !raised && !referral) return null;
  return (
    <div className="nf-autos">
      {raised ? (
        <div className="nf-auto warn" role="status">
          <Icon name="flag" size={15} />
          <span>
            <strong>ECG review requested at {fmtTime(raised.at)}.</strong> Task <TaskLink id={raised.taskId} onOpenTask={onOpenTask} /> for {leadName}. The ECG photo was shared to the clinical channel <DemoTag>Simulated</DemoTag>
            {!ecg ? <span className="nf-auto-sub">The answers no longer match the rule. Changing them does not withdraw the review, so tell the doctor.</span> : <span className="nf-auto-sub">Replaces sending photos to the Slack channel.</span>}
          </span>
        </div>
      ) : ecg ? (
        <div className="nf-auto warn" role="status">
          <Icon name="flag" size={15} />
          <span>
            <strong>Irregular ECG and irregular pulse: ECG photo will be shared to the clinical channel for doctor review.</strong>
            <span className="nf-auto-sub">Replaces sending photos to the Slack channel. Raised for {leadName} as soon as this is saved.</span>
          </span>
        </div>
      ) : null}
      {referral ? (
        <div className="nf-auto bad" role="status">
          <Icon name="alert" size={15} />
          <span>
            <strong>Doctor referral: {leadName} will be alerted on completion. Routine release is blocked.</strong>
            <span className="nf-auto-sub">Put the reason in Nurse comments. The doctor reviews this episode individually before any report is released.</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function TaskLink({ id, onOpenTask }: { id: string; onOpenTask?: (id: string) => void }) {
  if (onOpenTask) return <button type="button" className="ph-link ph-mono" onClick={() => onOpenTask(id)}>{id}</button>;
  return <span className="ph-mono"><EntityLink kind="task" id={id} /></span>;
}

/* ---- section bodies ---- */
function SectionBody({ kit, sec }: { kit: Kit; sec: SectionState }) {
  const { synth, ctx } = kit;
  if (!sec.applicable) {
    return (
      <div className="nf-gate muted">
        <Icon name="info" size={18} />
        <div className="ph-dim" style={{ fontSize: 13 }}>{sec.section.key === "psa" ? "Not applicable. The PSA questions are for men: over 45, or younger if he asks for the test." : "Not applicable for this participant."}</div>
      </div>
    );
  }
  const fields = sec.section.fields.filter((fd) => nurseFieldVisible(fd, synth, ctx));
  switch (sec.section.key) {
    case "registration": return <RegistrationBody kit={kit} fields={fields} sec={sec} />;
    case "measurements": return <MeasurementsBody kit={kit} fields={fields} sec={sec} />;
    case "bowel": return <BowelBody kit={kit} fields={fields} sec={sec} />;
    case "psa": return <PsaBody kit={kit} fields={fields} sec={sec} />;
    case "ecg": return <EcgBody kit={kit} fields={fields} sec={sec} />;
    case "urinalysis": return <UrineBody kit={kit} fields={fields} sec={sec} />;
    case "closeout": return <CloseoutBody kit={kit} fields={fields} sec={sec} />;
    case "cv_risk": return <Grouped kit={kit} fields={fields} sec={sec} sub={CV_SUBHEAD} />;
    default: return <div className="nf-grid">{fields.map((fd) => <Field key={fd.key} kit={kit} field={fd} sec={sec} />)}</div>;
  }
}

/** Generic field renderer for form, urine and notes fields. */
function Field({ kit, field, sec, after, hideHelp }: { kit: Kit; field: NurseFormField; sec: SectionState; after?: ReactNode; hideHelp?: boolean }) {
  const { synth, values, errors, disabled, prefill, conf, setForm, setUrine, setNotes, setMeasure } = kit;
  const id = useId();
  const labelId = useId();
  const missing = sec.missing.some((m) => m.key === field.key);
  const error = errors[field.key];
  if (field.store === "measure") {
    const k = field.measureKey as MeasureKey;
    return <MeasureRow field={field} m={values.measures[k]} onChange={(m) => setMeasure(k, m)} disabled={disabled} error={errors[k]} missing={missing} />;
  }
  const words = field.type === "boolean" ? (sec.section.key === "cv_risk" ? TRUE_FALSE : YES_NO) : YES_NO;
  const raw: NurseFormValue = field.store === "urine" ? (values.urine[field.urineKey as UrineKey] || null) : field.store === "notes" ? values.notes : (values.form[field.key] ?? null);
  const set = (v: NurseFormValue) => {
    if (field.store === "urine") setUrine(field.urineKey as UrineKey, v === null ? "" : String(v));
    else if (field.store === "notes") setNotes(v === null ? "" : String(v));
    else setForm(field.key, v);
  };
  const cur = nurseFieldValue(synth, field);
  const mk = markOf(field, cur, prefill, conf.has);
  const mark = mk ? (
    <PrefillMark mark={mk} words={words} disabled={disabled} onConfirm={() => conf.confirm([field.key])} onUndo={() => conf.undo(field.key)}
      onUse={() => { const pre = prefill[field.key]; if (pre !== undefined) setForm(field.key, typeof pre === "number" && field.type === "number" ? String(pre) : pre); }} />
  ) : undefined;
  const help = hideHelp ? undefined : field.help;
  let control: ReactNode;
  let htmlFor: string | undefined;
  switch (field.type) {
    case "boolean":
      control = <Options labelledBy={labelId} options={[true, false]} words={words} value={raw} onChange={set} disabled={disabled} />;
      break;
    case "choice": {
      const opts = field.options || [];
      if (opts.length > 12) {
        htmlFor = id;
        control = (
          <Select id={id} value={typeof raw === "string" ? raw : ""} disabled={disabled} onChange={(e) => set(e.target.value || null)}>
            <option value="">Choose</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        );
      } else if (field.key === "ecgAdvice") control = <Options labelledBy={labelId} options={opts} value={raw} onChange={set} disabled={disabled} grid render={ecgAdviceLabel} />;
      else control = <Options labelledBy={labelId} options={opts} value={raw} onChange={set} disabled={disabled} grid={opts.some((o) => o.length > 24)} />;
      break;
    }
    case "multi":
      control = <MultiChips labelledBy={labelId} options={field.options || []} value={raw} onChange={set} disabled={disabled} />;
      break;
    case "number":
      htmlFor = id;
      control = (
        <div className="nf-minput short">
          <TextInput id={id} value={raw === null ? "" : String(raw)} inputMode="numeric" autoComplete="off" invalid={!!error} disabled={disabled} onChange={(e) => set(e.target.value)} />
          {field.unit ? <span className="nf-unit">{field.unit}</span> : null}
        </div>
      );
      break;
    case "time":
      htmlFor = id;
      control = <TimeInput id={id} value={typeof raw === "string" ? raw : ""} onChange={(t) => set(t)} disabled={disabled} invalid={!!error} />;
      break;
    case "date":
    case "text": {
      htmlFor = id;
      const long = ["ecgComment", "medications", "nurseComments", "smokingHistory"].includes(field.key);
      const text = typeof raw === "string" ? raw : "";
      control = long
        ? <Textarea id={id} rows={field.key === "nurseComments" ? 3 : 2} maxLength={1000} value={text} disabled={disabled} onChange={(e) => set(e.target.value)} />
        : <TextInput id={id} type={field.key === "emailE" ? "email" : "text"} value={text} disabled={disabled} list={field.key === "ecgMachine" ? "nf-ecg-machines" : undefined} onChange={(e) => set(e.target.value)} />;
      break;
    }
  }
  return (
    <FieldShell field={field} labelId={labelId} htmlFor={htmlFor} missing={missing} error={error} help={help} mark={mark} after={after}
      wide={field.type === "text" || field.type === "multi" || field.key === "ecgAdvice" || (field.options || []).some((o) => o.length > 28)}>
      {control}
    </FieldShell>
  );
}

function TimeInput({ id, value, onChange, disabled, invalid }: { id: string; value: string; onChange: (t: string) => void; disabled: boolean; invalid: boolean }) {
  const state = usePhState();
  const now = localTimeOf(state.clock.nowUtc);
  return (
    <div className="nf-minput short">
      <TextInput id={id} value={value} placeholder="HH:MM" inputMode="numeric" autoComplete="off" disabled={disabled} invalid={invalid}
        onChange={(e) => onChange(e.target.value)} onBlur={(e) => { const t = e.target.value.trim(); if (/^\d{4}$/.test(t)) onChange(`${t.slice(0, 2)}:${t.slice(2)}`); else if (/^\d:\d{2}$/.test(t)) onChange(`0${t}`); }} />
      <Button size="sm" disabled={disabled} onClick={() => onChange(now)} title="Use the time on the demo clock, 24-hour">Now, {now}</Button>
    </div>
  );
}

function Grouped({ kit, fields, sec, sub }: { kit: Kit; fields: NurseFormField[]; sec: SectionState; sub?: Record<string, string> }) {
  const out: ReactNode[] = [];
  fields.forEach((fd) => {
    if (sub && sub[fd.key]) out.push(<div key={"h-" + fd.key} className="nf-subhead">{sub[fd.key]}</div>);
    out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} />);
  });
  return <div className="nf-grid">{out}</div>;
}

/* registration: identity first, then the record and the form fields */
function RegistrationBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const { row, draft, identityOk } = kit;
  const [showQ, setShowQ] = useState(false);
  const reviewed = !!draft.checklist.questionnaire;
  const recordVal = (k: NurseFormField["recordKey"]): string => {
    const pr = row.person;
    switch (k) {
      case "appointment": return `${fmtDateLong(row.session.date)}, ${row.booking.slotStart} to ${row.slotEnd}`;
      case "given": return pr.given;
      case "family": return pr.family;
      case "email": return pr.email;
      case "phone": return pr.phone;
      case "dob": return identityOk ? fmtNumericDate(pr.dob) : "Shown after the identity check";
      default: return "";
    }
  };
  const record = fields.filter((fd) => fd.store === "record");
  const rest = fields.filter((fd) => fd.store !== "record");
  const complete = row.membership?.questionnaire === "complete";
  return (
    <div className="ph-stack" style={{ gap: 16 }}>
      <IdentityPanel kit={kit} />
      <div>
        <div className="nf-subhead">From the booking</div>
        <dl className="nf-record">
          {record.map((fd) => <div key={fd.key}><dt>{fd.label}</dt><dd className={fd.recordKey === "dob" && !identityOk ? "ph-faint" : undefined}>{recordVal(fd.recordKey)}</dd></div>)}
        </dl>
      </div>
      <div className="nf-grid">{rest.map((fd) => <Field key={fd.key} kit={kit} field={fd} sec={sec} />)}</div>
      <div className="nf-sub">
        <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 8 }}>
          <Pill tone={complete ? "ok" : "warn"} icon={complete ? "check" : "alert"}>{complete ? "Pre-visit questionnaire submitted" : "Questionnaire not submitted"}</Pill>
          <span className="ph-faint" style={{ fontSize: 11.5 }}>{complete && row.booking.questionnaireCompletedAt ? fmtDateTime(row.booking.questionnaireCompletedAt) : ""}</span>
          <span className="ph-grow" />
          <Button size="sm" variant="ghost" icon={showQ ? "chevronDown" : "chevronRight"} aria-expanded={showQ} onClick={() => setShowQ(!showQ)}>{showQ ? "Hide answers" : "Show all answers"}</Button>
          <Button size="sm" variant={reviewed ? "ghost" : "secondary"} icon={reviewed ? "check" : undefined} disabled={kit.disabled} onClick={() => kit.f.runOwn(act.toggleChecklist(row.booking.id, "questionnaire"))}>
            {reviewed ? "Reviewed with participant" : "Mark reviewed"}
          </Button>
        </div>
        {showQ ? <div style={{ marginTop: 12 }}><QuestionnaireReview booking={row.booking} membership={row.membership} /></div> : null}
      </div>
    </div>
  );
}

function IdentityPanel({ kit }: { kit: Kit }) {
  const { row, draft, editable, f } = kit;
  const [dob, setDob] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const dobId = useId(), refId = useId();
  const confirmed = draft.identity.every((x) => x.confirmed);
  const dobFmt = dob.trim() && !parseIrishDate(dob) ? "Use dd/mm/yyyy, for example 09/06/1993." : null;
  const refFmt = ref.trim() && !/^PH-B-\d{4}$/i.test(ref.trim()) ? "Booking references look like PH-B-0001." : null;
  const submit = () => {
    const r = f.runOwn(act.confirmIdentity(row.booking.id, dob, ref));
    setErr(r.ok ? null : r.message || "Identity not confirmed.");
  };
  if (confirmed) {
    return (
      <div className="nf-id ok">
        <span className="nf-id-ico"><Icon name="shield" size={16} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>Identity confirmed with two identifiers</div>
          <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 2 }}>{draft.identity.map((x) => `${x.label} ${x.confirmedValue}`).join(", ")}. Read back by the participant and matched to the booking.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="nf-id">
      <span className="nf-id-ico warn"><Icon name="shield" size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: "var(--ink)", fontWeight: 600 }}>Identity check, before anything clinical</div>
        <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 2 }}>{IDENTITY_HELP} Ask the participant to state them; do not read them out.</div>
        {editable ? (
          <>
            <div className="nf-inline" style={{ marginTop: 12 }}>
              <div>
                <label className="ph-label" htmlFor={dobId}>Date of birth, as the participant states it</label>
                <TextInput id={dobId} value={dob} placeholder="dd/mm/yyyy" inputMode="numeric" autoComplete="off" invalid={!!dobFmt} onChange={(e) => setDob(e.target.value)} />
                {dobFmt ? <div className="ph-err" role="alert">{dobFmt}</div> : null}
              </div>
              <div>
                <label className="ph-label" htmlFor={refId}>Booking reference from their confirmation</label>
                <TextInput id={refId} value={ref} placeholder="PH-B-0000" autoComplete="off" invalid={!!refFmt} onChange={(e) => setRef(e.target.value)} />
                {refFmt ? <div className="ph-err" role="alert">{refFmt}</div> : null}
              </div>
              <div className="nf-inline-btn">
                <Button variant="primary" icon="shield" disabled={!dob.trim() || !ref.trim() || !!dobFmt || !!refFmt} onClick={submit}>Confirm identity</Button>
              </div>
            </div>
            {err ? <div className="clx-banner bad" style={{ marginTop: 10 }}><Icon name="x" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>{err}</span></div> : null}
            <div className="ph-row-flex" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
              <DemoTag>Demo helper</DemoTag>
              <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => setHint(!hint)} aria-expanded={hint}>{hint ? "Hide" : "Show"} the expected answers for the presenter</button>
              {hint ? <span className="ph-faint" style={{ fontSize: 11.5 }}>Date of birth {fmtNumericDate(row.person.dob)}, booking reference {row.booking.id}.</span> : null}
            </div>
          </>
        ) : <div className="ph-faint" style={{ fontSize: 12.5, marginTop: 8 }}>Not confirmed yet. The clinic nurse confirms two identifiers before anything clinical.</div>}
      </div>
    </div>
  );
}

/* bowel: informed choice for FIT when there are no risk factors */
function BowelBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const f = kit.synth.form;
  const risks = [["bloodInStool", "blood in stool"], ["bowelHabitChange", "change in bowel habit"], ["famHistoryBowel", "family history"]].filter(([k]) => f[k] === "Yes").map(([, t]) => t);
  const out: ReactNode[] = [];
  fields.forEach((fd) => {
    if (fd.key === "fitKit") {
      out.push(risks.length ? (
        <div key="risk" className="nf-callout ok"><Icon name="flag" size={14} /><span><strong>Risk factor recorded: {risks.join(", ")}.</strong> Offer the FIT kit.</span></div>
      ) : (
        <div key="ic" className="nf-callout"><Icon name="info" size={14} /><span><strong>No bowel risk factors recorded. Informed choice before a FIT kit:</strong> "{FIT_INFORMED_CHOICE_TEXT}"</span></div>
      ));
    }
    out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} hideHelp={fd.key === "fitInformedChoice"} />);
  });
  return <div className="nf-grid">{out}</div>;
}

/* PSA: men over 45, or younger men who ask; informed choice when there are no risk factors */
function PsaBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const { synth, ctx } = kit;
  const f = synth.form;
  const asked = ctx.age >= 46 || f.psaRequested === true;
  const symptoms = typeof f.psaSymptoms === "string" && f.psaSymptoms && f.psaSymptoms !== "None of these";
  const risk = f.psaFamilyHistory === true || f.psaAfroCaribbean === true || symptoms;
  const out: ReactNode[] = [];
  if (!asked) out.push(<div key="young" className="nf-callout"><Icon name="info" size={14} /><span>Aged {ctx.age}. PSA is offered to men over 45, or to a younger man who asks for it.</span></div>);
  fields.forEach((fd) => {
    if (fd.key === "psaTaken") {
      out.push(risk ? (
        <div key="risk" className="nf-callout ok"><Icon name="flag" size={14} /><span><strong>Risk factor recorded.</strong> Offer the PSA test.</span></div>
      ) : (
        <div key="ic" className="nf-callout"><Icon name="info" size={14} /><span><strong>No PSA risk factors recorded. Informed choice before the test:</strong> "{PSA_INFORMED_CHOICE_TEXT}"</span></div>
      ));
    }
    out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} hideHelp={fd.key === "psaInformedChoice"} />);
  });
  return <div className="nf-grid">{out}</div>;
}

/* measurements: BMI, blood pressure and waist categories live */
function MeasurementsBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const state = usePhState();
  const { values, draft, synth, errors, disabled, setMeasure, row } = kit;
  const bmi = formBmi(values, draft);
  const cat = bmiCategory(bmi.bmi);
  const h = numericValue(values, "heightM"), w = numericValue(values, "weightKg");
  const sys = numericValue(values, "bpSys"), dia = numericValue(values, "bpDia");
  const bp = bpCategory(sys, dia);
  const waist = numericValue(values, "waistCm");
  const sex = synth.form.sexAtBirth === "Male" ? "male" : synth.form.sexAtBirth === "Female" ? "female" : row.person.sex;
  const wc = waistCategory(waist, sex);
  const muscular = synth.form.muscularPhysique === "Yes";
  const out: ReactNode[] = [];
  fields.forEach((fd) => {
    if (fd.store === "calc") {
      out.push(
        <div key="bmi" className="nf-field wide nf-calc" data-field="bmi">
          <div className="nf-field-head"><span className="nf-label">BMI (calculated)</span><span className="nf-range">Never typed</span></div>
          <div className="nf-calc-row">
            <span className="nf-calc-val">{bmi.bmi !== null ? bmi.bmi.toFixed(1) : "Not calculated"}</span>
            {bmi.bmi !== null ? <span className="ph-faint">kg/m²</span> : null}
            {bmi.bmi !== null ? <BandChip band={cat.band} word={cat.word} /> : null}
          </div>
          <div className="ph-help nf-help">
            {bmi.bmi !== null && h !== null && w !== null ? `${w} kg ÷ (${h} m)², rounded half up to one decimal. Normal range 18-25.` : bmi.reason}
            {muscular && bmi.bmi !== null ? " Muscular physique recorded: BMI is less informative." : ""}
          </div>
        </div>,
      );
      return;
    }
    if (fd.store === "measure") {
      const k = fd.measureKey as MeasureKey;
      let extra: ReactNode = null;
      if (k === "waistCm" && waist !== null) extra = <CategoryLine band={wc.band} word={wc.word}>Less than {wc.limit} cm for a {sex === "male" ? "man" : "woman"}</CategoryLine>;
      if (k === "bpDia") {
        extra = (
          <>
            {sys !== null && dia !== null && !errors.bp ? <CategoryLine band={bp.band} word={bp.word}>{sys}/{dia} mmHg. Ideal below 120/80; review from 140/90.</CategoryLine> : null}
            {errors.bp ? <div className="ph-err" role="alert">{errors.bp}</div> : null}
            {kit.editable ? <div style={{ marginTop: 8 }}><RepeatReading disabled={disabled} at={fmtTime(state.clock.nowUtc)} onAdd={(line) => kit.setNotes(values.notes ? `${values.notes}\n${line}` : line)} /></div> : null}
          </>
        );
      }
      out.push(<MeasureRow key={fd.key} field={fd} m={values.measures[k]} onChange={(m) => setMeasure(k, m)} disabled={disabled} error={errors[k]}
        missing={sec.missing.some((x) => x.key === fd.key)} extra={extra} provenance={k === "heightM" || k === "weightKg"} />);
      return;
    }
    out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} />);
  });
  return <div className="nf-grid">{out}</div>;
}

const ECG_WORD: Record<Band, string> = { normal: "Normal ECG", borderline: "Borderline", abnormal: "Abnormal", not_tested: "Not done" };

function EcgBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const state = usePhState();
  const { synth } = kit;
  const band = ecgBand(synth);
  const machines = Array.from(new Set(state.episodes.map((e) => e.capture.form?.ecgMachine).filter((x): x is string => typeof x === "string" && !!x))).slice(0, 6);
  const out: ReactNode[] = fields.map((fd) => <Field key={fd.key} kit={kit} field={fd} sec={sec} />);
  return (
    <>
      <div className="nf-grid">{out}</div>
      <datalist id="nf-ecg-machines">{machines.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="nf-cat" style={{ marginTop: 14 }}>
        <span className="ph-dim" style={{ fontSize: 12 }}>ECG band</span>
        <BandChip band={band} word={ECG_WORD[band]} />
        {synth.form.ecg === "Not Done" ? <span className="ph-faint" style={{ fontSize: 12 }}>Say why in the ECG comment.</span> : null}
      </div>
    </>
  );
}

function UrineBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const { values } = kit;
  const out: ReactNode[] = fields.map((fd) => {
    if (fd.store === "urine") {
      const k = fd.urineKey as UrineKey;
      const v = values.urine[k];
      const band = urineBand(v, k);
      return <Field key={fd.key} kit={kit} field={fd} sec={sec} after={v ? <div className="nf-cat"><BandChip band={band} word={band === "not_tested" ? "Not done" : BAND_TEXT[band]} /></div> : null} />;
    }
    return <Field key={fd.key} kit={kit} field={fd} sec={sec} />;
  });
  return (
    <>
      <div className="nf-grid">{out}</div>
      {positiveDipstick(values) ? (
        <div className="nf-callout warn" style={{ marginTop: 12 }}><Icon name="flag" size={14} /><span>Positive dipstick. Kept as recorded for the doctor. Note anything relevant in Nurse comments{kit.synth.form.menstruating === true ? ", including that the participant is menstruating" : ""}.</span></div>
      ) : null}
    </>
  );
}

function CloseoutBody({ kit, fields, sec }: { kit: Kit; fields: NurseFormField[]; sec: SectionState }) {
  const out: ReactNode[] = [];
  fields.forEach((fd) => {
    if (fd.key === "advice") {
      out.push(<div key="advice" className="nf-callout wide"><Icon name="info" size={14} /><span><strong>Advice:</strong> not on the nurse form. Advice is the doctor's, written at review. Use Nurse comments instead.</span></div>);
      return;
    }
    if (fd.key === "nurseComments") {
      out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} after={!kit.values.notes.trim() && kit.editable && !isNurseReferral(kit.synth) ? (
        <div style={{ marginTop: 6 }}><button type="button" className="nf-chip" disabled={kit.disabled} onClick={() => kit.setNotes("No problems with the screening.")}>No problems with the screening.</button></div>
      ) : null} />);
      return;
    }
    if (fd.key === "medications") {
      const v = kit.values.form.medications;
      out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} after={!v && kit.editable ? (
        <div style={{ marginTop: 6 }}><button type="button" className="nf-chip" disabled={kit.disabled} onClick={() => kit.setForm("medications", "nil")}>nil</button></div>
      ) : null} />);
      return;
    }
    out.push(<Field key={fd.key} kit={kit} field={fd} sec={sec} />);
  });
  return (
    <div className="ph-stack" style={{ gap: 16 }}>
      <div className="nf-grid">{out}</div>
      <CompletionPanel kit={kit} />
    </div>
  );
}

/* ---- specimens, labels, checklist and completion ---- */
function CompletionPanel({ kit }: { kit: Kit }) {
  const state = usePhState();
  const { row, draft, synth, f, identityOk, editable, sections, errors, go, onCompleted, conf } = kit;
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const bloods = synth.form.bloodsTaken;
  const specimens = !!draft.checklist.specimens, labels = !!draft.checklist.labels;
  const addOns = { psa: psaTaken(synth), fit: fitKitGiven(synth) };
  // Bloods not taken: no blood panel is expected; a FIT kit, if given, is still followed up.
  const tests: AnalyteCode[] = bloods === "No" ? (addOns.fit ? ["FIT"] : []) : expectedPanel(row.booking.formTemplateId, { psaTaken: addOns.psa, fitGiven: addOns.fit });
  const next = nextEpisodeNumber(state);
  const saveBlocked = f.status.kind === "conflict" || f.status.kind === "error" || f.stale;
  const lead = ix(state).staffById.get(row.programme.clinicalLeadId);
  const toggle = (key: "specimens" | "labels") => f.runOwn(act.toggleChecklist(row.booking.id, key));

  const blockers: Array<{ text: string; go?: NurseSectionKey }> = [];
  if (!identityOk) blockers.push({ text: "Confirm identity with two identifiers", go: "registration" });
  sections.forEach((s) => {
    if (!s.applicable) return;
    const n = s.missing.filter((m) => m.key !== "identity").length;
    if (n) blockers.push({ text: `${s.label}: ${n} to answer (${s.missing.filter((m) => m.key !== "identity").slice(0, 3).map((m) => m.label).join(", ")}${n > 3 ? ", and more" : ""})`, go: s.section.key });
  });
  const errSec = sections.find((s) => s.errorKeys.length);
  if (Object.keys(errors).length) blockers.push({ text: "Correct the highlighted value", go: errSec?.section.key });
  const confirmLeft = sections.reduce((n, s) => n + (s.applicable ? s.toConfirm.length : 0), 0);
  const confirmSec = sections.find((s) => s.applicable && s.toConfirm.length);
  if (confirmLeft) blockers.push({ text: `Confirm ${confirmLeft} questionnaire answer${confirmLeft === 1 ? "" : "s"} with the participant`, go: confirmSec?.section.key });
  if (bloods === "No" && !synth.notes.trim()) blockers.push({ text: "Bloods not taken: record the reason in Nurse comments", go: "closeout" });
  if (bloods === "Yes" && !specimens) blockers.push({ text: "Record the blood specimen as collected" });
  if (bloods === "Yes" && !labels) blockers.push({ text: "Check the specimen label and lab request" });
  if (saveBlocked) blockers.push({ text: "Resolve the save problem" });
  const canComplete = editable && blockers.length === 0;

  const complete = () => {
    if (!f.flush()) { setConfirming(false); setMsg("Not completed: the latest entries could not be saved."); return; }
    const r = dispatch(act.completeAppointment(row.booking.id));
    setConfirming(false);
    if (!r.ok) { setMsg(r.message || "Not completed."); return; }
    setMsg(null);
    onCompleted?.(row.booking.id);
  };

  const lockReason = "Confirm identity with two identifiers first.";
  const totalConfirm = sections.reduce((n, s) => n + (s.applicable ? s.section.fields.filter((fd) => fd.prefillFrom === "questionnaire" && conf.has(fd.key)).length : 0), 0);
  return (
    <div className="nf-complete">
      <h3 className="nf-complete-title">Specimens and sign-off</h3>
      {bloods === "Yes" ? (
        <div className="ph-stack" style={{ gap: 12 }}>
          <ul className="nf-spec">
            <li>
              <span className={"nf-spec-ico" + (specimens ? " ok" : "")}><Icon name={specimens ? "check" : "flask"} size={13} /></span>
              <span className="nf-spec-body">
                <strong>Blood specimen (serum)</strong>
                <span className="ph-faint">{tests.filter((t) => t !== "FIT").length} tests. Issued as <span className="ph-mono">PH-S-{pad4(next)}</span> on completion.</span>
              </span>
              <Button size="sm" variant={specimens ? "ghost" : "primary"} icon={specimens ? "check" : undefined} disabled={!editable || !identityOk} title={!identityOk ? lockReason : undefined} onClick={() => toggle("specimens")}>
                {specimens ? "Collected. Undo" : "Record collected"}
              </Button>
            </li>
            {addOns.psa ? <li><span className="nf-spec-ico"><Icon name="plus" size={13} /></span><span className="nf-spec-body"><strong>PSA</strong><span className="ph-faint">Added to the blood request because PSA taken is Yes.</span></span></li> : null}
            {addOns.fit ? <li><span className="nf-spec-ico"><Icon name="file" size={13} /></span><span className="nf-spec-body"><strong>FIT kit</strong><span className="ph-faint">Given to the participant. A separate sample, added to the expected tests.</span></span></li> : null}
          </ul>
          {identityOk ? (
            <div className="nf-label-row">
              <SpecimenLabelPreview row={row} episode={null} addOns={addOns} />
              <div className="ph-stack" style={{ gap: 8 }}>
                <Button size="sm" icon={sheet ? "chevronDown" : "file"} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>{sheet ? "Hide lab request" : "Show lab request"}</Button>
                {sheet ? <Button size="sm" icon="print" onClick={() => window.print()} title="Opens the browser print dialog for a local preview. Nothing is sent to a laboratory.">Print label and request</Button> : null}
                <Button size="sm" variant={labels ? "ghost" : "primary"} icon={labels ? "check" : undefined} disabled={!editable} onClick={() => toggle("labels")}>{labels ? "Label checked. Undo" : "Mark label and request checked"}</Button>
              </div>
            </div>
          ) : <div className="ph-faint" style={{ fontSize: 12 }}>{lockReason} Labels carry the participant's identifiers.</div>}
          {sheet && identityOk ? <><LabRequestPreview row={row} episode={null} addOns={addOns} /><LabelPrintCopy row={row} episode={null} addOns={addOns} /></> : null}
        </div>
      ) : bloods === "No" ? (
        <div className="nf-callout warn"><Icon name="alert" size={14} /><span>Bloods not taken. No specimen label or lab request is needed. Say why in Nurse comments.</span></div>
      ) : (
        <div className="ph-faint" style={{ fontSize: 12.5 }}>Answer "Bloods taken?" above. Yes opens the specimen label and lab request.</div>
      )}

      <div className="nf-checks">
        <CheckLine done={identityOk} text="Identity confirmed with two identifiers" />
        <CheckLine done={!sections.some((s) => s.applicable && s.missing.some((m) => m.key !== "identity"))} text="Every required question answered, or marked not done or declined" />
        <CheckLine done={!Object.keys(errors).length} text="Values within entry limits" note="Abnormal values are kept and flagged for the doctor, never forced into range." />
        <CheckLine done={confirmLeft === 0} text="Questionnaire answers confirmed with the participant" note={`${totalConfirm} confirmed${confirmLeft ? `, ${confirmLeft} left` : ""}`} />
        <CheckLine done={bloods === "Yes" && specimens && labels} text="Blood specimen recorded and label checked" />
        {editable ? <CheckLine done={!f.dirty && !saveBlocked && f.status.kind !== "invalid"} text="All changes saved" /> : null}
      </div>

      {editable ? (
        confirming ? (
          <div className="nf-confirm" role="group" aria-label="Confirm completion">
            <div style={{ color: "var(--ink)", fontWeight: 600 }}>Complete the appointment for {row.person.given} {row.person.family}?</div>
            <ul>
              {tests.length === 0
                ? <li>Episode <span className="ph-mono">PH-E-{pad4(next)}</span> is created and goes straight to the doctor's review of the nurse measurements. No blood panel is expected.</li>
                : <li>Episode <span className="ph-mono">PH-E-{pad4(next)}</span> is created in Awaiting results with {tests.length} expected tests{addOns.psa || addOns.fit ? `, including ${[addOns.psa ? "PSA" : "", addOns.fit ? "FIT" : ""].filter(Boolean).join(" and ")}` : ""}.</li>}
              <li>Specimen <span className="ph-mono">PH-S-{pad4(next)}</span> is recorded as collected.</li>
              {isNurseReferral(synth) ? <li>Doctor referral: a review task is created for {lead ? lead.displayName : "the clinical lead"}. Routine release is blocked.</li> : null}
              {needsEcgReview(synth) && !draft.ecgReview ? <li>ECG review: a task is created and the ECG photo is shared to the clinical channel (simulated).</li> : null}
              {draft.ecgReview ? <li>The ECG review task <span className="ph-mono">{draft.ecgReview.taskId}</span> is linked to the episode.</li> : null}
              <li>No report is released. The doctor reviews once the laboratory results arrive.</li>
            </ul>
            <div className="ph-wrap">
              <Button variant="ghost" onClick={() => setConfirming(false)}>Not yet</Button>
              <Button variant="primary" icon="check" disabled={!canComplete} onClick={complete}>Complete appointment</Button>
            </div>
          </div>
        ) : (
          <div className="nf-complete-act">
            <Button variant="primary" icon="check" disabled={!canComplete} onClick={() => setConfirming(true)} className="nf-big">Complete appointment</Button>
            {blockers.length ? (
              <div className="nf-blockers">
                <div className="ph-faint" style={{ fontSize: 12 }}>Still needed:</div>
                <ul>
                  {blockers.map((b, i) => (
                    <li key={i}>{b.go ? <button type="button" className="ph-link" onClick={() => go(b.go!)}>{b.text}</button> : b.text}</li>
                  ))}
                </ul>
              </div>
            ) : <div className="ph-faint" style={{ fontSize: 12 }}>Everything required is recorded. Completing never releases a report.</div>}
          </div>
        )
      ) : null}
      {msg ? <div className="clx-banner warn"><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{msg}</span></div> : null}
    </div>
  );
}

function CheckLine({ done, text, note }: { done: boolean; text: string; note?: string }) {
  return (
    <div className={"nf-check" + (done ? " done" : "")}>
      <span className="nf-check-ico" aria-label={done ? "Done" : "Not done"}><Icon name={done ? "check" : "clock"} size={12} stroke={2.2} /></span>
      <span>{text}{note ? <span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{note}</span> : null}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
   After completion: what the automations created, and the form read-only
   --------------------------------------------------------------------------------------------- */
export function AutomationReceipt({ episode: ep, onOpenTask, title }: { episode: Episode; onOpenTask?: (id: string) => void; title?: ReactNode }) {
  const state = usePhState();
  const person = ix(state).personById.get(ep.personId);
  const lead = ix(state).staffById.get(PROGRAMME_BY_ID[ep.programmeId].clinicalLeadId);
  const addOns = ep.expectedTests.filter((t) => t.addOn).map((t) => t.code);
  const specs = state.specimens.filter((x) => x.episodeId === ep.id);
  const ecgTask = ep.capture.ecgReview?.taskId || null;
  const refTask = ep.nurseReferral?.taskId || null;
  return (
    <div className="nf-receipt" role="status">
      <div className="nf-receipt-head">
        <span className="nf-id-ico ok"><Icon name="check" size={15} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>{title || `Completed: ${person ? `${person.given} ${person.family}` : ep.personId}`}</div>
          <div className="ph-faint" style={{ fontSize: 12 }}>{ep.capture.completedAt ? fmtDateTime(ep.capture.completedAt) : ""}. No report was released.</div>
        </div>
      </div>
      <ul className="nf-receipt-list">
        <li><Icon name="file" size={13} /><span>Episode <span className="ph-mono">{ep.id}</span>, Unique ID <span className="ph-mono">{ep.screeningRef}</span>, {ep.expectedTests.length} expected tests{addOns.length ? ` including ${addOns.join(" and ")}` : ""}. Report state: {REPORT_STATE_LABEL[ep.reportState]}.</span></li>
        {specs.map((s) => <li key={s.id}><Icon name="flask" size={13} /><span>Specimen <span className="ph-mono">{s.id}</span> ({s.type}) recorded as collected{s.labelPrinted ? ", label printed" : ""}.</span></li>)}
        {refTask ? <li className="bad"><Icon name="alert" size={13} /><span>Doctor referral: task <TaskLink id={refTask} onOpenTask={onOpenTask} /> for {lead ? lead.displayName : "the clinical lead"}. Routine release is blocked for this episode.</span></li> : null}
        {ecgTask ? <li className="warn"><Icon name="flag" size={13} /><span>ECG review: task <TaskLink id={ecgTask} onOpenTask={onOpenTask} />. ECG photo shared to the clinical channel <DemoTag>Simulated</DemoTag></span></li> : null}
        {!refTask && !ecgTask ? <li><Icon name="info" size={13} /><span>No referral and no ECG review were needed.</span></li> : null}
      </ul>
    </div>
  );
}

const ROW_BAND = (ep: Episode, key: string): { band: Band; word: string } | null => {
  const c = ep.capture;
  const m = (k: MeasureKey) => (c.measures[k].state === "recorded" ? c.measures[k].value : null);
  switch (key) {
    case "bmi": { const b = bmiOf(c); if (b === null) return null; const x = bmiCategory(b); return { band: x.band, word: x.word }; }
    case "bpDia": { const x = bpCategory(m("bpSys"), m("bpDia")); return x.band === "not_tested" ? null : { band: x.band, word: x.word }; }
    case "waistCm": { const v = m("waistCm"); if (v === null) return null; const sex = c.form?.sexAtBirth === "Male" ? "male" : c.form?.sexAtBirth === "Female" ? "female" : "not_recorded"; const x = waistCategory(v, sex); return { band: x.band, word: x.word }; }
    case "ecgAdvice": { const b = ecgBand(c); return { band: b, word: ECG_WORD[b] }; }
    case "urineGlucose": case "urineProtein": case "urineBlood": case "urineWcc": {
      const k = ({ urineGlucose: "glucose", urineProtein: "protein", urineBlood: "blood", urineWcc: "wcc" } as const)[key];
      const v = c.urine ? c.urine[k] : null;
      if (!v) return null;
      const b = urineBand(v, k);
      return { band: b, word: b === "not_tested" ? "Not done" : BAND_TEXT[b] };
    }
    default: return null;
  }
};

/** The completed nurse form, read-only, grouped by the client's sections. */
export function NurseFormReadOnly({ episode: ep }: { episode: Episode }) {
  const state = usePhState();
  const rows = nurseFormRows(state, ep.id);
  if (!rows) return <RestrictedNotice>The nurse form is visible to clinical roles assigned to this episode.</RestrictedNotice>;
  const groups: Array<{ title: string; rows: typeof rows }> = [];
  rows.forEach((r) => {
    if (r.key === "advice") return;
    const g = groups.find((x) => x.title === r.sectionTitle);
    if (g) g.rows.push(r); else groups.push({ title: r.sectionTitle, rows: [r] });
  });
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="nf-subhead">{g.title}</div>
          <div className="clx-qa">
            {g.rows.map((r) => {
              const band = ROW_BAND(ep, r.key);
              return [
                <span key={r.key + "l"}>{r.label}</span>,
                <span key={r.key + "v"} style={r.answered ? undefined : { color: "var(--faint)" }}>
                  {r.value}{band ? <> <BandChip band={band.band} word={band.word} /></> : null}
                </span>,
              ];
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
