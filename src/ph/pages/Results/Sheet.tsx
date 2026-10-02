/* Review sheet: a compact, colour-coded grid in the spirit of the clinician's current
   spreadsheet viewer, rebuilt in the Pulse glass style. Three columns of cells, each with a
   label, value, unit, source and a text flag, so colour is never the only signal.
   Green: within a displayed illustrative limit. Amber: review required.
   Grey: missing, not done, pending, not captured or not in this programme's panel (never normal).
   Plain: recorded or calculated with no displayed limit, so not interpreted here.
   QRISK3 shows the approved-integration-required state; no score is produced. */
import type { ReactNode } from "react";
import { ANALYTES, BP_REVIEW_LIMIT, ageOn, fmtDate, ix, localDateOf } from "../../model";
import type { AnalyteCode, ExpectedTestView, Measure } from "../../model";
import { usePhState } from "../../store";
import { DemoTag, Icon } from "../../ui";
import type { GlyphName } from "../../ui";
import type { Bundle } from "./EpisodePanels";
import { SecTitle, fmtValue } from "./shared";
import { rowIndex } from "./select";

type Look = "within" | "review" | "grey" | "plain";
interface Cell { label: string; value: ReactNode; unit?: string; source: string; flag: string; look: Look; title?: string }

const LOOK: Record<Look, { bg: string; fg: string; icon: GlyphName }> = {
  within: { bg: "var(--ok-soft)", fg: "var(--ok)", icon: "check" },
  review: { bg: "var(--warn-soft)", fg: "var(--warn)", icon: "flag" },
  grey: { bg: "var(--track)", fg: "var(--faint)", icon: "dot" },
  plain: { bg: "var(--surface-faint)", fg: "var(--dim)", icon: "info" },
};

const yesNo = (v: string | number | boolean | undefined) => (v === undefined || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

function answerCell(label: string, v: string | number | boolean | undefined, unit?: string): Cell {
  const t = yesNo(v);
  return t === null
    ? { label, value: "Not answered", source: "Questionnaire", flag: "Missing", look: "grey" }
    : { label, value: t, unit, source: "Questionnaire, self-reported", flag: "Recorded", look: "plain" };
}

function measureCell(label: string, m: Measure, unit: string, decimals: number, source: string): Cell {
  if (m.state === "recorded" && m.value != null) return { label, value: m.value.toFixed(decimals), unit, source, flag: "No displayed limit", look: "plain" };
  return { label, value: m.state === "not_done" ? "Not done" : m.state === "declined" ? "Declined" : "Missing", source, flag: m.state === "not_done" ? "Not done" : m.state === "declined" ? "Declined" : "Missing", look: "grey" };
}

function bpCell(label: string, m: Measure, limit: number): Cell {
  if (m.state !== "recorded" || m.value == null) return measureCell(label, m, "mmHg", 0, "Nurse capture");
  const over = m.value >= limit;
  return { label, value: String(m.value), unit: "mmHg", source: `Nurse capture, limit <${limit}`, flag: over ? "Review required" : "Within limit", look: over ? "review" : "within" };
}

function labCell(t: ExpectedTestView | undefined, code: AnalyteCode, lineOf: (rowId: string) => string): Cell {
  const a = ANALYTES[code];
  const label = a.addOn ? `${a.name} (add-on)` : a.name;
  if (!t) return { label, value: a.addOn ? "Not ordered" : "Not in panel", source: "Not requested for this episode", flag: a.addOn ? "Not ordered" : "Not in panel", look: "grey" };
  if (t.status === "pending") return { label, value: "Not yet received", unit: a.unit, source: "Laboratory", flag: "Pending", look: "grey" };
  if (t.status === "quarantined") return { label, value: "Held in import", unit: a.unit, source: t.rowId ? `Import ${lineOf(t.rowId)}` : "Import", flag: "Not accounted for", look: "grey" };
  const o = t.observation!;
  const src = o.source.kind === "batch" ? `Eurofins ${lineOf(o.source.rowId)}, limit ${o.limitText}` : `Clinic, limit ${o.limitText}`;
  const unconfirmedUnit = !!o.unitDiscrepancy && !o.unitDiscrepancy.confirmed;
  if (unconfirmedUnit) return { label, value: fmtValue(o.code, o.value, o.unit), unit: o.unit, source: src, flag: "Unit to confirm", look: "grey", title: "Source unit differs from the template. Not converted until the laboratory confirms." };
  const review = o.flag === "review_required";
  const legacy = o.legacyDisplayedFlag === "normal" && review;
  return {
    label, value: fmtValue(o.code, o.value, o.unit), unit: o.unit, source: src + (o.version > 1 ? `, v${o.version}` : ""),
    flag: review ? "Review required" : "Within limit", look: review ? "review" : "within",
    title: legacy ? "The legacy summary displayed this as normal. Inconsistent with the displayed limit; raised by Data Quality." : undefined,
  };
}

const notInPanel = (label: string, what = "Not in this programme's panel"): Cell => ({ label, value: "Not in panel", source: what, flag: "Not in panel", look: "grey" });

function SheetCell({ c }: { c: Cell }) {
  const l = LOOK[c.look];
  return (
    <div className="phr-sheet-cell" style={{ background: l.bg }} title={c.title}>
      <div className="phr-sheet-label">{c.label}</div>
      <div className="phr-sheet-value">
        <span className="ph-num" style={{ color: c.look === "grey" ? "var(--dim)" : "var(--ink)", fontWeight: c.look === "grey" ? 500 : 600 }}>{c.value}</span>
        {c.unit && c.look !== "grey" ? <span className="phr-sheet-unit">{c.unit}</span> : null}
      </div>
      <div className="phr-sheet-flag" style={{ color: l.fg }}>
        <Icon name={l.icon} size={10} stroke={2.2} /> <span>{c.flag}</span>
      </div>
      <div className="phr-sheet-src">{c.source}</div>
    </div>
  );
}

export function ReviewSheet({ b }: { b: Bundle }) {
  const state = usePhState();
  const rows = rowIndex(state);
  const lineOf = (rowId: string) => { const r = rows.get(rowId); return r ? `line ${r.line}` : rowId; };
  const mem = (ix(state).membershipsByPerson.get(b.person.id) || [])[0];
  const a = mem ? mem.answers : {};
  const m = b.episode.capture.measures;
  const tests = new Map(b.tests.map((t) => [t.code, t]));
  const tc = tests.get("TC")?.observation, hdl = tests.get("HDL")?.observation;
  const nonHdl: Cell = tc && hdl && tc.unit === ANALYTES.TC.unit && hdl.unit === ANALYTES.HDL.unit
    ? { label: "Non-HDL cholesterol", value: (Math.round((tc.value - hdl.value) * 10) / 10).toFixed(1), unit: "mmol/L", source: "Calculated: total minus HDL", flag: "No displayed limit", look: "plain" }
    : { label: "Non-HDL cholesterol", value: "Not calculated", source: "Needs total and HDL cholesterol", flag: "Missing", look: "grey" };
  const urine = b.episode.capture.urine;
  const urineCell = (label: string, v: string | undefined): Cell => (v ? { label, value: v, source: "Point-of-care dipstick", flag: "No displayed limit", look: "plain" } : { label, value: "Not recorded", source: "Point-of-care dipstick", flag: "Missing", look: "grey" });
  const age = ageOn(b.person.dob, localDateOf(b.episode.collectedAt));
  const sexLabel = b.person.sex === "female" ? "Female" : b.person.sex === "male" ? "Male" : "Not recorded";
  const notes = b.episode.capture.notes.trim();
  const advice = b.draft ? b.draft.advice : b.released ? b.released.advice : "";

  const colA: Cell[] = [
    { label: "Name", value: b.name, source: "Booking record", flag: "Identity", look: "plain" },
    { label: "Unique ID", value: b.episode.id, source: `Person ${b.person.id}`, flag: "Identity", look: "plain" },
    { label: "Age at screen", value: String(age), unit: "years", source: "From date of birth", flag: "Recorded", look: "plain" },
    { label: "Sex recorded", value: sexLabel, source: "Booking record", flag: b.person.sex === "not_recorded" ? "Missing" : "Recorded", look: b.person.sex === "not_recorded" ? "grey" : "plain" },
    { label: "Date of screen", value: fmtDate(b.episode.collectedAt), source: b.session.siteName, flag: "Recorded", look: "plain" },
    { label: "QRISK3 score", value: "No score", source: "Approved integration required", flag: "Integration required", look: "grey" },
    { label: "QRISK3 heart age", value: "No heart age", source: "Approved integration required", flag: "Integration required", look: "grey" },
    answerCell("Family history of CVD", a.famCvd),
    answerCell("Diabetes", a.knownDiabetes),
    { label: "Hypertension treatment", value: "Not captured", source: "Not in the questionnaire", flag: "Not captured", look: "grey" },
    answerCell("Smoker", a.smoking),
    answerCell("Alcohol", a.alcohol, "units/week"),
    answerCell("Activity", a.activity, "days/week"),
    answerCell("Medications", a.medication),
  ];
  const colB: Cell[] = [
    bpCell("BP systolic", m.bpSys, BP_REVIEW_LIMIT.sys),
    bpCell("BP diastolic", m.bpDia, BP_REVIEW_LIMIT.dia),
    measureCell("Pulse", m.pulse, "bpm", 0, "Nurse capture"),
    b.bmi != null ? { label: "BMI", value: b.bmi.toFixed(1), unit: "kg/m²", source: "Calculated from height and weight", flag: "No displayed limit", look: "plain" } : { label: "BMI", value: "Not calculated", source: "Height or weight missing", flag: "Missing", look: "grey" },
    measureCell("Waist", m.waistCm, "cm", 0, "Nurse capture"),
    { label: "Bloods taken", value: b.specimens.length ? "Yes" : "No", source: b.specimens.map((s) => s.id).join(", ") || "No specimen", flag: b.specimens.length ? "Recorded" : "Missing", look: b.specimens.length ? "plain" : "grey" },
    labCell(tests.get("TC"), "TC", lineOf),
    labCell(tests.get("HDL"), "HDL", lineOf),
    nonHdl,
    labCell(tests.get("LDL"), "LDL", lineOf),
    labCell(tests.get("TG"), "TG", lineOf),
    labCell(tests.get("HBA1C"), "HBA1C", lineOf),
    urineCell("Urine protein", urine?.protein),
    urineCell("Urine glucose", urine?.glucose),
  ];
  const colC: Cell[] = [
    labCell(tests.get("VITD"), "VITD", lineOf),
    labCell(tests.get("FERR"), "FERR", lineOf),
    urineCell("Urine blood", urine?.blood),
    notInPanel("Urea"),
    notInPanel("Creatinine"),
    notInPanel("Liver tests (ALT, AST, GGT, bilirubin)"),
    notInPanel("Full blood count (Hb, white cells, platelets)"),
    notInPanel("Thyroid (TSH, free T4)"),
    notInPanel("Uric acid"),
    notInPanel("PSA"),
    notInPanel("FIT result"),
    notInPanel("ECG", "Not in this screening template"),
    notes ? { label: "Nurse comments", value: notes, source: "Nurse capture", flag: "Recorded", look: "plain" } : { label: "Nurse comments", value: "None recorded", source: "Nurse capture", flag: "Missing", look: "grey" },
    { label: "Identity at appointment", value: b.episode.capture.identity.every((x) => x.confirmed) ? "Confirmed" : "Not confirmed", source: "Date of birth and booking reference", flag: b.episode.capture.identity.every((x) => x.confirmed) ? "Recorded" : "Missing", look: b.episode.capture.identity.every((x) => x.confirmed) ? "plain" : "grey" },
  ];

  return (
    <section className="ph-card ph-pad-sm" aria-label="Review sheet">
      <SecTitle right={<DemoTag>Sample data</DemoTag>}>Review sheet</SecTitle>
      <div className="phr-sheet-legend" aria-label="Colour key">
        <span><i style={{ background: LOOK.within.bg, borderColor: LOOK.within.fg }} /> Within displayed limit</span>
        <span><i style={{ background: LOOK.review.bg, borderColor: LOOK.review.fg }} /> Review required</span>
        <span><i style={{ background: LOOK.grey.bg, borderColor: "var(--border-strong)" }} /> Missing, not done or not in panel</span>
        <span><i style={{ background: LOOK.plain.bg, borderColor: "var(--border-strong)" }} /> Recorded, no displayed limit</span>
      </div>
      <div className="phr-sheet">
        {[colA, colB, colC].map((col, i) => (
          <div key={i} className="phr-sheet-col">{col.map((c) => <SheetCell key={c.label} c={c} />)}</div>
        ))}
      </div>
      <div className="phr-sheet-advice">
        <span className="phr-sheet-advice-label" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>New advice</span>
        <div className="phr-sheet-advice-text">
          {advice.trim() ? advice : <span className="ph-faint">No advice written yet. Write it in the advice panel; the report cannot be released without it.</span>}
        </div>
      </div>
      <div className="phr-sub" style={{ marginTop: 8 }}>
        Illustrative flags; production rules require clinical approval. Only values with a displayed illustrative limit are coloured green or amber. Colour always comes with text.
      </div>
    </section>
  );
}
