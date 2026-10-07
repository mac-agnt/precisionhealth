/* Local form state for the nurse form ("SISK Comprehensive (LAB) Screen V2"), shared by the staff
   workspace and the nurse portal. Values are kept as typed, validated per field and autosaved
   against a base revision. A save from elsewhere is detected, never overwritten silently, and can
   be merged field by field. Unsaved edits survive leaving the screen. Missing, not done and
   declined stay distinct, and a blank is never zero. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Action, ClinicalCapture, MeasureKey, NurseFormCtx, NurseFormField, NurseFormValue, PhState } from "../../model";
import {
  MEASURE_KEYS, MEASURE_RULES, NURSE_FORM_FIELDS, PROGRAMME_BY_ID, act, bmiOf, ix, measureError, membershipOf, nurseFieldVisible, nurseFormPrefill,
} from "../../model";
import { dispatch, getState } from "../../store";
import type { ApptRow } from "./selectors";

export type Mode = "value" | "not_done" | "declined";
export type Provenance = "measured" | "self_reported";
export interface MeasureField { text: string; mode: Mode; provenance: Provenance }
export interface UrineField { glucose: string; protein: string; blood: string; wcc: string }
/** Nurse-form fields stored on capture.form. Number fields hold the typed text until saved. */
export type FormMap = Record<string, NurseFormValue>;
export interface FormValues { measures: Record<MeasureKey, MeasureField>; urine: UrineField; notes: string; form: FormMap }

/** Client order on the nurse form: Glucose, Protein, Blood, WCC. */
export const URINE_KEYS = ["glucose", "protein", "blood", "wcc"] as const;
export type UrineKey = (typeof URINE_KEYS)[number];
export const URINE_LABEL: Record<UrineKey, string> = { glucose: "Glucose", protein: "Protein", blood: "Blood", wcc: "WCC" };
const POSITIVE = new Set(["+", "++", "+++"]);

/** Fields the nurse writes on capture.form. Advice is the doctor's field and is never sent. */
export const FORM_FIELDS: NurseFormField[] = NURSE_FORM_FIELDS.filter((f) => f.store === "form" && !f.readOnly);

export const MEASURE_HINT: Record<MeasureKey, string> = {
  heightM: "In metres, for example 1.65",
  weightKg: "In kilograms, for example 70.5",
  waistCm: "In centimetres, for example 88",
  bpSys: "Seated reading, for example 124",
  bpDia: "Seated reading, for example 78",
  pulse: "Beats per minute from the ECG machine, for example 68",
  peakFlow: "Litres per minute, for example 480",
};

const emptyMeasures = (): Record<MeasureKey, MeasureField> => {
  const m = {} as Record<MeasureKey, MeasureField>;
  for (const k of MEASURE_KEYS) m[k] = { text: "", mode: "value", provenance: "measured" };
  return m;
};
const emptyUrine = (): UrineField => ({ glucose: "", protein: "", blood: "", wcc: "" });
export const emptyValues = (): FormValues => ({ measures: emptyMeasures(), urine: emptyUrine(), notes: "", form: {} });

function formFromCapture(c: ClinicalCapture): FormMap {
  const out: FormMap = {};
  for (const f of FORM_FIELDS) {
    const v = c.form?.[f.key];
    if (v === undefined || v === null || v === "") continue;
    out[f.key] = f.type === "number" && typeof v === "number" ? String(v) : v;
  }
  return out;
}

export function fromCapture(c: ClinicalCapture): FormValues {
  const measures = emptyMeasures();
  for (const k of MEASURE_KEYS) {
    const m = c.measures[k];
    measures[k] = {
      text: m.state === "recorded" && m.value != null ? String(m.value) : "",
      mode: m.state === "not_done" ? "not_done" : m.state === "declined" ? "declined" : "value",
      provenance: m.provenance,
    };
  }
  // Urinalysis not done stores every dipstick as Not done. On screen they stay blank, so they are never preselected.
  const complete = c.form?.urinalysis !== "Not done";
  const urine = c.urine && complete ? { glucose: c.urine.glucose || "", protein: c.urine.protein || "", blood: c.urine.blood || "", wcc: c.urine.wcc || "" } : emptyUrine();
  return { measures, urine, notes: c.notes || "", form: formFromCapture(c) };
}

/** Key-order independent comparison, so the same answers in a different order are not "unsaved". */
function canon(v: FormValues): string {
  const form = Object.keys(v.form).filter((k) => v.form[k] !== null && v.form[k] !== undefined && v.form[k] !== "").sort().map((k) => [k, v.form[k]]);
  return JSON.stringify([v.measures, v.urine, v.notes, form]);
}
export const sameValues = (a: FormValues, b: FormValues) => canon(a) === canon(b);

/** A typed number, null for blank, or "nan" for something that is not a number yet. */
export function parseNum(text: string): number | null | "nan" {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return "nan";
  const n = Number(t);
  return Number.isFinite(n) ? n : "nan";
}
const decimalsOf = (text: string) => { const t = text.trim().replace(",", "."); const i = t.indexOf("."); return i < 0 ? 0 : t.length - i - 1; };

/** The number for a field when it is recorded and valid, otherwise null. A blank is never zero. */
export function numericValue(v: FormValues, k: MeasureKey): number | null {
  const f = v.measures[k];
  if (f.mode !== "value") return null;
  const n = parseNum(f.text);
  if (n === null || n === "nan") return null;
  if (decimalsOf(f.text) > MEASURE_RULES[k].decimals) return null;
  return measureError(k, n) ? null : n;
}

/** A form value as the model stores it: number fields parsed, blank text as null. Invalid numbers become null. */
function storedValue(f: NurseFormField, raw: NurseFormValue | undefined): NurseFormValue {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  if (f.type === "number" && typeof raw === "string") {
    const n = parseNum(raw);
    return n === null || n === "nan" ? null : n;
  }
  return raw;
}

const SKELETON: ClinicalCapture = {
  status: "draft", identity: [], measures: {} as ClinicalCapture["measures"], urine: null, notes: "", form: {}, ecgReview: null, checklist: {}, savedAt: null, rev: 0, checkedInAt: null, completedAt: null,
};

/**
 * The record as it would be saved from what is on screen. The shared model rules (visibility,
 * missing fields, ECG review, referral, bands) run on it, so the screen and the reducer agree.
 */
export function toCapture(v: FormValues, base: ClinicalCapture = SKELETON): ClinicalCapture {
  const measures = { ...base.measures };
  for (const k of MEASURE_KEYS) {
    const f = v.measures[k];
    if (f.mode !== "value") { measures[k] = { value: null, state: f.mode, provenance: f.provenance }; continue; }
    const n = numericValue(v, k);
    measures[k] = n === null ? { value: null, state: "missing", provenance: f.provenance } : { value: n, state: "recorded", provenance: f.provenance };
  }
  const form: FormMap = { ...(base.form || {}) };
  for (const f of FORM_FIELDS) form[f.key] = storedValue(f, v.form[f.key]);
  return { ...base, measures, urine: urineOf(v), notes: v.notes, form };
}

function urineOf(v: FormValues): ClinicalCapture["urine"] {
  if (v.form.urinalysis === "Not done") return { glucose: "Not done", protein: "Not done", blood: "Not done", wcc: "Not done" };
  return URINE_KEYS.some((k) => !!v.urine[k]) ? { glucose: v.urine.glucose, protein: v.urine.protein, blood: v.urine.blood, wcc: v.urine.wcc } : null;
}

/** Field-level problems: not a number, too many decimals, outside entry limits, systolic not above diastolic, a time not as HH:MM. */
export function formErrors(v: FormValues, ctx?: NurseFormCtx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of MEASURE_KEYS) {
    const f = v.measures[k];
    if (f.mode !== "value") continue;
    const r = MEASURE_RULES[k];
    const n = parseNum(f.text);
    if (n === null) continue;
    if (n === "nan") { out[k] = `${r.label} must be a number.`; continue; }
    if (decimalsOf(f.text) > r.decimals) { out[k] = r.decimals === 0 ? `${r.label} takes whole numbers.` : `${r.label} takes up to ${r.decimals} decimal place${r.decimals === 1 ? "" : "s"}.`; continue; }
    const e = measureError(k, n);
    if (e) out[k] = e;
  }
  const s = numericValue(v, "bpSys"), d = numericValue(v, "bpDia");
  if (s !== null && d !== null && s <= d) out.bp = "Systolic must be higher than diastolic.";
  const synth = ctx ? toCapture(v) : null;
  for (const f of FORM_FIELDS) {
    if (f.type !== "number" && f.type !== "time") continue;
    const raw = v.form[f.key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (synth && ctx && !nurseFieldVisible(f, synth, ctx)) continue;
    if (f.type === "time") { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.trim())) out[f.key] = `${f.label} must be a time as HH:MM, 24-hour.`; continue; }
    const n = parseNum(raw);
    if (n === "nan" || n === null) { out[f.key] = `${f.label} must be a number.`; continue; }
    if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) out[f.key] = `${f.label} must be between ${f.min} and ${f.max}${f.unit ? " " + f.unit : ""}.`;
  }
  return out;
}

export const positiveDipstick = (v: FormValues) => (["glucose", "protein", "blood"] as const).some((k) => POSITIVE.has(v.urine[k]));

/** The save patch. Every nurse-form field is sent; fields hidden by the other answers are cleared. */
export function toPatch(v: FormValues, ctx?: NurseFormCtx) {
  const measures: Partial<Record<MeasureKey, { value: number | null; state: "recorded" | "missing" | "not_done" | "declined"; provenance: Provenance }>> = {};
  for (const k of MEASURE_KEYS) {
    const f = v.measures[k];
    if (f.mode !== "value") { measures[k] = { value: null, state: f.mode, provenance: f.provenance }; continue; }
    const n = parseNum(f.text);
    measures[k] = n === null || n === "nan" ? { value: null, state: "missing", provenance: f.provenance } : { value: n, state: "recorded", provenance: f.provenance };
  }
  const synth = ctx ? toCapture(v) : null;
  const form: FormMap = {};
  for (const f of FORM_FIELDS) {
    let val = storedValue(f, v.form[f.key]);
    if (val !== null && synth && ctx && !nurseFieldVisible(f, synth, ctx)) val = null;
    form[f.key] = val;
  }
  const u = urineOf(v);
  return { measures, urine: u ? { protein: u.protein, glucose: u.glucose, blood: u.blood, wcc: u.wcc } : null, notes: v.notes, form };
}

/** BMI from the values on screen, using the shared kg/m2 rule and rounding. */
export function formBmi(v: FormValues, cap: ClinicalCapture): { bmi: number | null; reason: string } {
  const h = numericValue(v, "heightM"), w = numericValue(v, "weightKg");
  const synthetic: ClinicalCapture = {
    ...cap,
    measures: {
      ...cap.measures,
      heightM: { value: h, state: h === null ? "missing" : "recorded", provenance: v.measures.heightM.provenance },
      weightKg: { value: w, state: w === null ? "missing" : "recorded", provenance: v.measures.weightKg.provenance },
    },
  };
  const bmi = bmiOf(synthetic);
  if (bmi !== null) return { bmi, reason: "" };
  const why = (k: MeasureKey) => {
    const f = v.measures[k], label = MEASURE_RULES[k].label.toLowerCase();
    if (f.mode === "not_done") return `${label} not done`;
    if (f.mode === "declined") return `${label} declined`;
    if (!f.text.trim()) return `${label} not recorded`;
    return `${label} is not a valid value`;
  };
  const parts = [h === null ? why("heightM") : "", w === null ? why("weightKg") : ""].filter(Boolean);
  return { bmi: null, reason: `Not calculated: ${parts.join(" and ")}. A blank is not zero.` };
}

/** Keep every field this form changed since its base; take the other copy for the rest. */
export function merge3(base: FormValues, mine: FormValues, theirs: FormValues): FormValues {
  const same = <T,>(a: T, b: T) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const pick = <T,>(b: T, m: T, t: T): T => (!same(m, b) ? m : t);
  const measures = {} as Record<MeasureKey, MeasureField>;
  for (const k of MEASURE_KEYS) measures[k] = pick(base.measures[k], mine.measures[k], theirs.measures[k]);
  const urine: UrineField = { ...theirs.urine };
  for (const k of URINE_KEYS) urine[k] = pick(base.urine[k], mine.urine[k], theirs.urine[k]);
  const form: FormMap = {};
  const keys = new Set([...Object.keys(base.form), ...Object.keys(mine.form), ...Object.keys(theirs.form)]);
  keys.forEach((k) => {
    const v = pick<NurseFormValue | undefined>(base.form[k], mine.form[k], theirs.form[k]);
    if (v !== undefined && v !== null && v !== "") form[k] = v;
  });
  return { measures, urine, notes: pick(base.notes, mine.notes, theirs.notes), form };
}

/* ---- questionnaire prefill and the nurse's confirmation ---- */

/** The values the participant's pre-visit questionnaire and booking put on the nurse form at check-in. */
export function prefillFor(state: PhState, row: ApptRow): FormMap {
  const m = membershipOf(state, row.person.id, row.programme.id);
  const nurse = ix(state).staffById.get(row.session.nurseId);
  return nurseFormPrefill(m?.answers || {}, { site: row.person.site, employer: PROGRAMME_BY_ID[row.programme.id].clientName, sex: row.person.sex, clinician: nurse ? nurse.name : null });
}

/* Which questionnaire answers the nurse has confirmed with the participant, by booking. Held for the
   demo session in memory and shared by the staff workspace and the nurse portal. */
const confirmed = new Map<string, Set<string>>();
const confirmListeners = new Set<() => void>();
let confirmVersion = 0;
function confirmChanged() { confirmVersion++; confirmListeners.forEach((l) => l()); }
function subscribeConfirm(l: () => void) { confirmListeners.add(l); return () => { confirmListeners.delete(l); }; }
export function useConfirmations(bookingId: string) {
  useSyncExternalStore(subscribeConfirm, () => confirmVersion, () => confirmVersion);
  const set = confirmed.get(bookingId) || new Set<string>();
  return {
    has: (key: string) => set.has(key),
    confirm: (keys: string[]) => {
      const next = new Set(confirmed.get(bookingId) || []);
      keys.forEach((k) => next.add(k));
      confirmed.set(bookingId, next);
      confirmChanged();
    },
    undo: (key: string) => {
      const next = new Set(confirmed.get(bookingId) || []);
      next.delete(key);
      confirmed.set(bookingId, next);
      confirmChanged();
    },
  };
}

/* ---- the hook ---- */
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saved"; at: string | null }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

interface Held { values: FormValues; base: FormValues; baseRev: number; dirty: boolean; checkedInAt: string | null }
/** Unsaved local edits by booking, kept while the user is elsewhere in the app. */
const held = new Map<string, Held>();

export function useCaptureForm(bookingId: string, cap: ClinicalCapture, editable: boolean, ctx: NurseFormCtx) {
  const [restored] = useState(() => {
    const h = held.get(bookingId);
    return !!h && h.checkedInAt === cap.checkedInAt && h.baseRev <= cap.rev && h.dirty;
  });
  const [st, setSt] = useState<Held>(() => {
    const h = held.get(bookingId);
    if (h && h.checkedInAt === cap.checkedInAt && h.baseRev <= cap.rev) return h;
    held.delete(bookingId);
    const v = fromCapture(cap);
    return { values: v, base: v, baseRev: cap.rev, dirty: false, checkedInAt: cap.checkedInAt };
  });
  const [status, setStatus] = useState<SaveStatus>(() => (cap.savedAt ? { kind: "saved", at: cap.savedAt } : { kind: "idle" }));
  const ref = useRef(st);
  ref.current = st;
  const statusRef = useRef(status);
  statusRef.current = status;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const own = useRef(new Set<number>());

  /** The stored record moved past this form's base revision, and not because of this form. */
  const stale = cap.rev !== st.baseRev && !own.current.has(cap.rev);

  const save = useCallback((): boolean => {
    const cur = ref.current;
    if (!editableRef.current) return false;
    const first = Object.values(formErrors(cur.values, ctxRef.current))[0];
    if (first) { setStatus({ kind: "invalid", message: first }); return false; }
    const res = dispatch(act.saveCapture(bookingId, cur.baseRev, toPatch(cur.values, ctxRef.current)), { silent: true });
    if (res.ok) {
      const after = getState().captureDrafts[bookingId];
      const rev = after ? after.rev : cur.baseRev + 1;
      own.current.add(rev);
      const saved = cur.values;
      const next = { ...cur, base: saved, baseRev: rev, dirty: !sameValues(ref.current.values, saved) };
      ref.current = next;
      setSt((s) => ({ ...s, base: saved, baseRev: rev, dirty: !sameValues(s.values, saved) }));
      setStatus({ kind: "saved", at: after ? after.savedAt : null });
      return true;
    }
    if (res.conflict) { setStatus({ kind: "conflict", message: res.message || "Save conflict." }); return false; }
    setStatus({ kind: "error", message: res.message || "Not saved." });
    return false;
  }, [bookingId]);

  /* Autosave about 600 ms after the last change. Paused while a conflict waits for a decision. */
  useEffect(() => {
    if (!editable || !st.dirty) return;
    if (statusRef.current.kind === "conflict") return;
    const first = Object.values(formErrors(st.values, ctxRef.current))[0];
    if (first) { setStatus({ kind: "invalid", message: first }); return; }
    setStatus({ kind: "pending" });
    const h = window.setTimeout(() => { save(); }, 600);
    return () => window.clearTimeout(h);
  }, [st.values, st.dirty, editable, save]);

  /* Leaving the screen: save valid edits now, otherwise keep them for later. */
  useEffect(() => () => {
    const cur = ref.current;
    if (!cur.dirty) { held.delete(bookingId); return; }
    if (editableRef.current && statusRef.current.kind !== "conflict" && !Object.keys(formErrors(cur.values, ctxRef.current)).length) {
      const live = getState().captureDrafts[bookingId];
      if (live && live.rev === cur.baseRev) {
        const res = dispatch(act.saveCapture(bookingId, cur.baseRev, toPatch(cur.values, ctxRef.current)), { silent: true });
        if (res.ok) { held.delete(bookingId); return; }
      }
    }
    held.set(bookingId, cur);
  }, [bookingId]);

  const update = useCallback((fn: (v: FormValues) => FormValues) => {
    setSt((s) => { const values = fn(s.values); return { ...s, values, dirty: !sameValues(values, s.base) }; });
  }, []);

  /** Run one of this form's own actions (identity, checklist). It keeps the base revision in step. */
  const runOwn = useCallback((action: Action) => {
    const before = getState().captureDrafts[bookingId]?.rev;
    const res = dispatch(action);
    if (res.ok) {
      const live = getState().captureDrafts[bookingId];
      if (live?.savedAt && statusRef.current.kind === "idle") setStatus({ kind: "saved", at: live.savedAt });
      const after = live?.rev;
      if (after !== undefined && after !== before && ref.current.baseRev === before) {
        own.current.add(after);
        ref.current = { ...ref.current, baseRev: after };
        setSt((s) => (s.baseRev === before ? { ...s, baseRev: after } : s));
      }
    }
    return res;
  }, [bookingId]);

  /** Save now if there is anything unsaved. */
  const flush = useCallback((): boolean => (ref.current.dirty ? save() : true), [save]);

  const mergeAndSave = useCallback(() => {
    const latest = getState().captureDrafts[bookingId];
    if (!latest) return;
    const theirs = fromCapture(latest);
    const cur = ref.current;
    const merged = merge3(cur.base, cur.values, theirs);
    const next: Held = { ...cur, values: merged, base: theirs, baseRev: latest.rev, dirty: !sameValues(merged, theirs) };
    ref.current = next;
    setSt(next);
    setStatus({ kind: "saved", at: latest.savedAt });
    statusRef.current = { kind: "saved", at: latest.savedAt };
    if (next.dirty) save();
  }, [bookingId, save]);

  const discardMine = useCallback(() => {
    const latest = getState().captureDrafts[bookingId];
    if (!latest) return;
    const v = fromCapture(latest);
    const next: Held = { ...ref.current, values: v, base: v, baseRev: latest.rev, dirty: false };
    ref.current = next;
    setSt(next);
    setStatus({ kind: "saved", at: latest.savedAt });
  }, [bookingId]);

  /** Demo control: another tab saves this record, so this form now holds an older revision. */
  const simulateOtherTab = useCallback(() => {
    const c = getState().captureDrafts[bookingId];
    if (!c) return;
    const line = "Note saved from another tab (simulated).";
    dispatch(act.saveCapture(bookingId, c.rev, { notes: c.notes ? `${c.notes}\n${line}` : line }), { silent: true });
  }, [bookingId]);

  return { values: st.values, dirty: st.dirty, baseRev: st.baseRev, status, stale, restored, update, save, flush, runOwn, mergeAndSave, discardMine, simulateOtherTab };
}
export type CaptureFormApi = ReturnType<typeof useCaptureForm>;
