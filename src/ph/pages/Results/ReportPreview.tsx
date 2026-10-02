/* Participant report preview: a concise advice page, lifestyle answers, the relevant test
   sections, explanation and limitations, and next steps. Sample content for a fictional
   participant. Statuses are text: "Review required", "Within the displayed limit",
   "Not yet received". Nothing is ever called normal, and a missing test stays missing. */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  ANALYTES, BP_REVIEW_LIMIT, BRAND, LIMITS_DISCLAIMER, QRISK3, bpFlagged, episodeBundle, fmtDate, fmtNumericDate, ix,
} from "../../model";
import type { AnalyteCode, ExpectedTestView, Measure, PhState } from "../../model";
import { usePhState } from "../../store";
import { Button, DemoTag, Icon, Pill } from "../../ui";
import { OverlayPortal, fmtValue } from "./shared";

const ANSWER_ROWS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "smoking", label: "Smoking status" },
  { key: "alcohol", label: "Alcohol", unit: "units per week" },
  { key: "activity", label: "Days with 30 minutes of activity", unit: "days per week" },
  { key: "sleep", label: "Sleep", unit: "hours per night" },
  { key: "famCvd", label: "Family history of heart disease before 60" },
  { key: "chestPain", label: "Chest pain or tightness on exertion" },
  { key: "knownDiabetes", label: "Diagnosed diabetes" },
  { key: "famCancer", label: "Close relative with cancer before 50" },
  { key: "medication", label: "Medication" },
  { key: "allergies", label: "Allergies" },
];

const SECTIONS: Array<{ id: string; title: string; codes: AnalyteCode[]; what: string; limits: string; next: string }> = [
  {
    id: "heart", title: "Heart health: cholesterol", codes: ["TC", "HDL", "LDL", "TG"],
    what: "Total cholesterol, HDL, LDL and triglycerides from your blood sample.",
    limits: "Triglycerides can read higher after a recent meal. Each value is one measurement on one day.",
    next: "Where a result says Review required, follow the advice above and discuss it with your GP.",
  },
  {
    id: "sugar", title: "Blood sugar: HbA1c", codes: ["HBA1C"],
    what: "HbA1c reflects your average blood sugar over roughly the last two to three months.",
    limits: "Some conditions affecting red blood cells can change the reading.",
    next: "A result marked Review required is discussed in your advice. Your GP can repeat the test.",
  },
  {
    id: "addon", title: "Additional tests", codes: ["VITD", "FERR"],
    what: "Optional tests chosen at booking, such as vitamin D or ferritin.",
    limits: "Levels can vary with season, diet and recent illness.",
    next: "Your advice explains whether anything needs to change.",
  },
];

function answerText(v: string | number | boolean | undefined, unit?: string): string {
  if (v === undefined || v === null || v === "") return "Not answered";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return unit ? `${v} ${unit}` : String(v);
}

function measureText(m: Measure, unit: string, decimals: number): string {
  if (m.state === "recorded" && m.value != null) return `${m.value.toFixed(decimals)} ${unit}`;
  return m.state === "not_done" ? "Not done" : m.state === "declined" ? "Declined" : "Missing";
}

function testStatus(t: ExpectedTestView): ReactNode {
  if (t.status === "pending") return <Pill tone="neutral" icon="clock">Not yet received</Pill>;
  if (t.status === "quarantined") return <Pill tone="warn" icon="alert">Not yet accounted for</Pill>;
  return t.observation!.flag === "review_required" ? <Pill tone="warn" icon="flag">Review required</Pill> : <Pill tone="neutral" icon="dot">Within the displayed limit</Pill>;
}

/** The report body. versionLabel says which version this is and whether the participant can see it. */
export function ReportCanvas({ episodeId, advice, versionLabel, reviewer, compact }: { episodeId: string; advice: string; versionLabel: ReactNode; reviewer?: string; compact?: boolean }) {
  const state: PhState = usePhState();
  const b = episodeBundle(state, episodeId);
  if (!b) return null;
  const mem = (ix(state).membershipsByPerson.get(b.person.id) || [])[0];
  const answers = mem ? mem.answers : {};
  const m = b.episode.capture.measures;
  const bpText = m.bpSys.state === "recorded" && m.bpDia.state === "recorded" && m.bpSys.value != null && m.bpDia.value != null ? `${m.bpSys.value}/${m.bpDia.value} mmHg` : measureText(m.bpSys, "mmHg", 0);
  const bpFlag = bpFlagged(b.episode.capture);
  const sections = SECTIONS.map((s) => ({ ...s, tests: b.tests.filter((t) => s.codes.includes(t.code)) })).filter((s) => s.tests.length);

  return (
    <article className={"phr-paper" + (compact ? " phr-paper-mini" : "")} aria-label="Participant report preview">
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div className="ph-grow" style={{ minWidth: 200 }}>
          <div className="ph-eyebrow">{BRAND.org}</div>
          <div style={{ fontSize: compact ? 14 : 17, fontWeight: 600, color: "var(--ink)", marginTop: 3 }}>Health screening report</div>
          <div className="phr-sub" style={{ marginTop: 3 }}>{versionLabel}</div>
        </div>
        <div className="phr-row" style={{ flex: "none" }}><DemoTag>Sample content</DemoTag><DemoTag>Fictional participant</DemoTag></div>
      </div>

      <table className="phr-tbl" style={{ marginTop: 12 }}>
        <tbody>
          <tr><td style={{ width: "38%" }} className="ph-faint">Name</td><td>{b.name}</td></tr>
          <tr><td className="ph-faint">Date of birth</td><td>{fmtNumericDate(b.person.dob)}</td></tr>
          <tr><td className="ph-faint">Screening date</td><td>{fmtDate(b.episode.collectedAt)}, {b.session.siteName}</td></tr>
          <tr><td className="ph-faint">Programme</td><td>{b.programme.name}</td></tr>
        </tbody>
      </table>

      {compact ? null : (
        <p style={{ marginTop: 12 }}>
          This report summarises your screening. Screening is a snapshot of one day, so please share it with your GP, who can place it alongside your full medical record.
        </p>
      )}

      <h4>Your advice</h4>
      {advice.trim() ? <p style={{ whiteSpace: "pre-wrap" }}>{advice}</p> : <p className="ph-faint">Advice not written yet. The report cannot be released without it.</p>}
      {reviewer ? <p className="phr-sub">Advice reviewed by {reviewer}.</p> : null}

      {compact ? null : (
        <>
          <h4>Your answers</h4>
          <p className="phr-sub">Self-reported in the booking questionnaire.</p>
          <table className="phr-tbl">
            <tbody>
              {ANSWER_ROWS.map((r) => <tr key={r.key}><td style={{ width: "58%" }}>{r.label}</td><td>{answerText(answers[r.key], r.unit)}</td></tr>)}
            </tbody>
          </table>
        </>
      )}

      {sections.map((s) => (
        <section key={s.id}>
          <h4>{s.title}</h4>
          {compact ? null : <p className="phr-sub" style={{ marginBottom: 6 }}><b style={{ color: "var(--body)" }}>What is measured.</b> {s.what} <b style={{ color: "var(--body)" }}>Limitations.</b> {s.limits}</p>}
          <div className="phr-tblwrap">
            <table className="phr-tbl">
              <thead><tr><th>Test</th><th className="num">Your result</th><th>Displayed limit</th><th>Status</th></tr></thead>
              <tbody>
                {s.tests.map((t) => (
                  <tr key={t.code}>
                    <td>{ANALYTES[t.code].name}</td>
                    <td className="num">{t.observation ? `${fmtValue(t.code, t.observation.value, t.observation.unit)} ${t.observation.unit}` : "Not available"}</td>
                    <td>{ANALYTES[t.code].limit.text} {ANALYTES[t.code].unit}</td>
                    <td>{testStatus(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {compact ? null : <p className="phr-sub" style={{ marginTop: 6 }}><b style={{ color: "var(--body)" }}>Next steps.</b> {s.next}</p>}
        </section>
      ))}

      <h4>Body measurements</h4>
      <div className="phr-tblwrap">
        <table className="phr-tbl">
          <thead><tr><th>Measure</th><th className="num">Your result</th><th>Note</th></tr></thead>
          <tbody>
            <tr><td>Blood pressure</td><td className="num">{bpText}</td><td>{bpFlag ? <Pill tone="warn" icon="flag">Review required</Pill> : <Pill tone="neutral" icon="dot">Within the displayed limit</Pill>} <span className="phr-sub">Displayed limit {BP_REVIEW_LIMIT.text} mmHg</span></td></tr>
            <tr><td>Body mass index (BMI)</td><td className="num">{b.bmi != null ? `${b.bmi.toFixed(1)} kg/m²` : "Not calculated"}</td><td className="phr-sub">{b.bmi != null ? "Calculated from your height and weight." : "Height or weight was not recorded."}</td></tr>
            <tr><td>Waist</td><td className="num">{measureText(m.waistCm, "cm", 0)}</td><td className="phr-sub">Measured at the appointment.</td></tr>
          </tbody>
        </table>
      </div>

      <h4>Cardiovascular risk score</h4>
      <p>{QRISK3.title}: not shown. An approved integration is required before any score or heart age can appear in a report.</p>

      {compact ? null : (
        <>
          <h4>Explanation and limitations</h4>
          <p>Every screening test can occasionally miss a condition or suggest one that is not there. If you notice new symptoms, contact your GP even if this report raises no concern.</p>
          <p className="phr-sub">{LIMITS_DISCLAIMER}</p>
          <h4>Next steps</h4>
          <p>Bring this report to your next GP visit. For questions about the report, contact {BRAND.org} at {BRAND.email} or {BRAND.phone}.</p>
        </>
      )}
      <p className="phr-sub" style={{ marginTop: 12, marginBottom: 0 }}>Fictional participant and sample content for demonstration. Not a medical report.</p>
    </article>
  );
}

/** Centred dialog that stays centred after its entrance animation. Escape and the backdrop close it. */
export function Dialog({ open, onClose, title, children, footer, width = 860 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open]);
  if (!open) return null;
  return (
    <OverlayPortal>
      <div className="ph-scrim" />
      <div className="phr-dialog-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) close.current(); }}>
        <div className="phr-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ width: `min(${width}px, 100%)` }}>
          <div className="phr-dialog-head">
            <h2 className="ph-h1" style={{ fontSize: 16, flex: 1 }}>{title}</h2>
            <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" onClick={() => close.current()} aria-label="Close"><Icon name="x" size={15} /></button>
          </div>
          <div className="phr-dialog-body">{children}</div>
          {footer ? <div className="phr-dialog-foot">{footer}</div> : null}
        </div>
      </div>
    </OverlayPortal>
  );
}

/** Full participant report preview. */
export function PreviewModal({ open, onClose, episodeId, advice, versionLabel, reviewer, footer }: { open: boolean; onClose: () => void; episodeId: string; advice: string; versionLabel: ReactNode; reviewer?: string; footer?: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} title="Participant report preview" width={860}
      footer={<>{footer}<Button onClick={onClose}>Close preview</Button></>}>
      <ReportCanvas episodeId={episodeId} advice={advice} versionLabel={versionLabel} reviewer={reviewer} />
    </Dialog>
  );
}
