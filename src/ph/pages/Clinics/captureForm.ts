/* Local form state for the nurse workspace. Values are kept as typed, validated per field and
   autosaved against a base revision. A save from elsewhere is detected, never overwritten
   silently, and can be merged field by field. Unsaved edits survive leaving the screen. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ClinicalCapture, MeasureKey } from "../../model";
import { MEASURE_KEYS, MEASURE_RULES, act, bmiOf, measureError } from "../../model";
import { dispatch, getState } from "../../store";

export type Mode = "value" | "not_done" | "declined";
export type Provenance = "measured" | "self_reported";
export interface MeasureField { text: string; mode: Mode; provenance: Provenance }
export interface UrineField { protein: string; glucose: string; blood: string }
export interface FormValues { measures: Record<MeasureKey, MeasureField>; urine: UrineField; notes: string }

export const URINE_KEYS = ["protein", "glucose", "blood"] as const;
export type UrineKey = (typeof URINE_KEYS)[number];
export const URINE_LABEL: Record<UrineKey, string> = { protein: "Protein", glucose: "Glucose", blood: "Blood" };
export const URINE_RESULTS = ["Negative", "Trace", "+", "++", "+++"];
export const URINE_ABSENT = ["Not done", "Declined"];
const POSITIVE = new Set(["+", "++", "+++"]);

export const MEASURE_HINT: Record<MeasureKey, string> = {
  heightM: "In metres, for example 1.65",
  weightKg: "In kilograms, for example 70.5",
  waistCm: "In centimetres, for example 88",
  bpSys: "Seated reading, for example 124",
  bpDia: "Seated reading, for example 78",
  pulse: "Beats per minute, for example 68",
};

const emptyMeasures = (): Record<MeasureKey, MeasureField> => {
  const m = {} as Record<MeasureKey, MeasureField>;
  for (const k of MEASURE_KEYS) m[k] = { text: "", mode: "value", provenance: k === "heightM" ? "self_reported" : "measured" };
  return m;
};
export const emptyValues = (): FormValues => ({ measures: emptyMeasures(), urine: { protein: "", glucose: "", blood: "" }, notes: "" });

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
  return { measures, urine: c.urine ? { protein: c.urine.protein || "", glucose: c.urine.glucose || "", blood: c.urine.blood || "" } : { protein: "", glucose: "", blood: "" }, notes: c.notes || "" };
}
export const sameValues = (a: FormValues, b: FormValues) => JSON.stringify(a) === JSON.stringify(b);

/** A typed number, null for blank, or "nan" for something that is not a number yet. */
export function parseNum(text: string): number | null | "nan" {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return "nan";
  const n = Number(t);
  return Number.isFinite(n) ? n : "nan";
}
const decimalsOf = (text: string) => { const t = text.trim().replace(",", "."); const i = t.indexOf("."); return i < 0 ? 0 : t.length - i - 1; };

/** Field-level problems: not a number, too many decimals, outside entry limits, systolic not above diastolic. */
export function formErrors(v: FormValues): Partial<Record<MeasureKey | "bp", string>> {
  const out: Partial<Record<MeasureKey | "bp", string>> = {};
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
  return out;
}

/** The number for a field when it is recorded and valid, otherwise null. A blank is never zero. */
export function numericValue(v: FormValues, k: MeasureKey): number | null {
  const f = v.measures[k];
  if (f.mode !== "value") return null;
  const n = parseNum(f.text);
  if (n === null || n === "nan") return null;
  if (decimalsOf(f.text) > MEASURE_RULES[k].decimals) return null;
  return measureError(k, n) ? null : n;
}

export const positiveDipstick = (v: FormValues) => URINE_KEYS.some((k) => POSITIVE.has(v.urine[k]));

/** Required items still missing. Not done and declined count as accounted for. */
export function formMissing(v: FormValues, urineRequired: boolean): string[] {
  const out: string[] = [];
  for (const k of MEASURE_KEYS) {
    const r = MEASURE_RULES[k], f = v.measures[k];
    if (r.required && f.mode === "value" && !f.text.trim()) out.push(`${r.label} (${r.unit})`);
  }
  if (urineRequired) for (const k of URINE_KEYS) if (!v.urine[k]) out.push(`Urine ${URINE_LABEL[k].toLowerCase()}`);
  if (positiveDipstick(v) && !v.notes.trim()) out.push("Nurse note for the positive dipstick result");
  return out;
}

export function toPatch(v: FormValues) {
  const measures: Partial<Record<MeasureKey, { value: number | null; state: "recorded" | "missing" | "not_done" | "declined"; provenance: Provenance }>> = {};
  for (const k of MEASURE_KEYS) {
    const f = v.measures[k];
    if (f.mode !== "value") { measures[k] = { value: null, state: f.mode, provenance: f.provenance }; continue; }
    const n = parseNum(f.text);
    measures[k] = n === null || n === "nan" ? { value: null, state: "missing", provenance: f.provenance } : { value: n, state: "recorded", provenance: f.provenance };
  }
  const anyUrine = URINE_KEYS.some((k) => !!v.urine[k]);
  return { measures, urine: anyUrine ? { ...v.urine } : null, notes: v.notes };
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
  const pick = <T,>(b: T, m: T, t: T): T => (JSON.stringify(m) !== JSON.stringify(b) ? m : t);
  const measures = {} as Record<MeasureKey, MeasureField>;
  for (const k of MEASURE_KEYS) measures[k] = pick(base.measures[k], mine.measures[k], theirs.measures[k]);
  const urine: UrineField = { ...theirs.urine };
  for (const k of URINE_KEYS) urine[k] = pick(base.urine[k], mine.urine[k], theirs.urine[k]);
  return { measures, urine, notes: pick(base.notes, mine.notes, theirs.notes) };
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

export function useCaptureForm(bookingId: string, cap: ClinicalCapture, editable: boolean) {
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
  const own = useRef(new Set<number>());

  /** The stored record moved past this form's base revision, and not because of this form. */
  const stale = cap.rev !== st.baseRev && !own.current.has(cap.rev);

  const save = useCallback((): boolean => {
    const cur = ref.current;
    if (!editableRef.current) return false;
    const errs = formErrors(cur.values);
    const first = Object.values(errs)[0];
    if (first) { setStatus({ kind: "invalid", message: first }); return false; }
    const res = dispatch(act.saveCapture(bookingId, cur.baseRev, toPatch(cur.values)), { silent: true });
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
    const first = Object.values(formErrors(st.values))[0];
    if (first) { setStatus({ kind: "invalid", message: first }); return; }
    setStatus({ kind: "pending" });
    const h = window.setTimeout(() => { save(); }, 600);
    return () => window.clearTimeout(h);
  }, [st.values, st.dirty, editable, save]);

  /* Leaving the screen: save valid edits now, otherwise keep them for later. */
  useEffect(() => () => {
    const cur = ref.current;
    if (!cur.dirty) { held.delete(bookingId); return; }
    if (editableRef.current && statusRef.current.kind !== "conflict" && !Object.keys(formErrors(cur.values)).length) {
      const res = dispatch(act.saveCapture(bookingId, cur.baseRev, toPatch(cur.values)), { silent: true });
      if (res.ok) { held.delete(bookingId); return; }
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
      const after = getState().captureDrafts[bookingId]?.rev;
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
