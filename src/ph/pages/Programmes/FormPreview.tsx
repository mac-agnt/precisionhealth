/* Live preview of a template version as the form a nurse or participant would complete.
   Conditional questions appear when their trigger answer is given. Every field shows its
   unit, whether it is required, and the distinct absence reasons (missing, not done,
   declined): an absent value is never stored as zero or treated as normal. Preview answers
   stay in this component and are never saved. */
import { useState } from "react";
import type { FieldDef, FormBlock, FormTemplateVersion } from "../../model";
import { roundHalfUp } from "../../model";
import { Button, Icon, Pill, Select, TextInput } from "../../ui";
import { Note } from "./common";
import { ABSENCE_LABEL, conditionText } from "./model";

type Answer = string | boolean;
type Absence = "missing" | "not_done" | "declined";

function numberError(f: FieldDef, raw: string): string | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Enter a number.";
  if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return `Outside the allowed range, ${f.min} to ${f.max}${f.unit ? " " + f.unit : ""}.`;
  return null;
}

export function FormPreview({ version, blocks, participant }: { version: FormTemplateVersion; blocks: FormBlock[]; participant?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [absent, setAbsent] = useState<Record<string, Absence | "">>({});
  const set = (k: string, v: Answer) => setAnswers((a) => ({ ...a, [k]: v }));

  const sections = version.blocks.map((ref) => {
    const blk = blocks.find((b) => b.id === ref.blockId);
    const live = !!blk && blk.version === ref.version;
    return { ref, blk, live };
  });

  // Live BMI from recorded height and weight. Calculated, never typed.
  const h = Number(answers.heightM), w = Number(answers.weightKg);
  const bmi = !absent.heightM && !absent.weightKg && answers.heightM !== undefined && answers.weightKg !== undefined && answers.heightM !== "" && answers.weightKg !== "" && h >= 1 && h <= 2.3 && w >= 25 && w <= 300
    ? roundHalfUp(w / (h * h), 1) : null;

  const visible = (f: FieldDef) => !f.showIf || answers[f.showIf.key] === f.showIf.equals;
  let reqTotal = 0, reqDone = 0, condTotal = 0, condShown = 0;
  for (const sct of sections) {
    if (!sct.live || !sct.blk) continue;
    for (const f of sct.blk.fields) {
      if (f.showIf) { condTotal++; if (visible(f)) condShown++; }
      if (!visible(f) || !f.required || !sct.ref.required) continue;
      reqTotal++;
      const v = answers[f.key];
      const valid = v !== undefined && v !== "" && !(f.type === "number" && typeof v === "string" && numberError(f, v));
      if (absent[f.key] || valid) reqDone++;
    }
  }

  const field = (f: FieldDef, siblings: FieldDef[]) => {
    const ab = absent[f.key] || "";
    const computed = f.key === "bmi";
    const raw = answers[f.key];
    const err = f.type === "number" && typeof raw === "string" && !ab ? numberError(f, raw) : null;
    const id = `pv-${version.version}-${f.key}`;
    const cond = conditionText(f, siblings);
    return (
      <div key={f.key} className="prg-pv-q" data-cond={f.showIf ? "1" : "0"}>
        <div className="prg-pv-label">
          <label htmlFor={id}>{f.label}</label>
          {f.unit && (computed || f.type !== "number") ? <span className="prg-tag">{f.unit}</span> : null}
          {f.required ? <span className="prg-tag prg-tag-on">Required</span> : <span className="prg-tag">Optional</span>}
          {cond ? <Pill tone="info" icon="link">Shown because {cond}</Pill> : null}
        </div>
        <div className="prg-pv-row">
          <div className="prg-pv-input">
            {computed ? (
              <span className="ph-num" style={{ fontSize: 13, color: bmi != null ? "var(--ink)" : "var(--faint)" }} id={id}>
                {bmi != null ? `${bmi} ${f.unit || ""}` : "Calculated from height and weight"}
              </span>
            ) : f.type === "number" ? (
              <TextInput id={id} type="number" inputMode="decimal" step="any" value={typeof raw === "string" ? raw : ""} disabled={!!ab} invalid={!!err}
                onChange={(e) => set(f.key, e.target.value)} placeholder={f.min !== undefined ? `${f.min} to ${f.max}` : ""} style={{ maxWidth: 160 }} />
            ) : f.type === "choice" ? (
              <Select id={id} value={typeof raw === "string" ? raw : ""} disabled={!!ab} onChange={(e) => set(f.key, e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">Choose</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : f.type === "boolean" && participant && f.key.startsWith("consent") ? (
              <label className="ph-row-flex" style={{ gap: 8, fontSize: 12.5, color: "var(--body)", cursor: "pointer" }}>
                <input id={id} type="checkbox" checked={raw === true} onChange={(e) => set(f.key, e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
                {f.required ? "Required consent" : "Optional"}
              </label>
            ) : f.type === "boolean" ? (
              <span className="ph-wrap" style={{ gap: 6 }} role="group" aria-label={f.label} id={id}>
                <button type="button" className="prg-yn" aria-pressed={raw === true} disabled={!!ab} onClick={() => set(f.key, true)}>Yes</button>
                <button type="button" className="prg-yn" aria-pressed={raw === false} disabled={!!ab} onClick={() => set(f.key, false)}>No</button>
              </span>
            ) : (
              <TextInput id={id} type={f.type === "date" ? "date" : "text"} value={typeof raw === "string" ? raw : ""} disabled={!!ab} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.unit && !computed && f.type === "number" ? <span className="prg-unit">{f.unit}</span> : null}
          </div>
          {participant ? (
            !computed && f.absence.includes("declined") ? (
              <label className="ph-row-flex" style={{ gap: 6, fontSize: 11.5, color: "var(--dim)", cursor: "pointer" }}>
                <input type="checkbox" checked={ab === "declined"} onChange={(e) => setAbsent((a) => ({ ...a, [f.key]: e.target.checked ? "declined" : "" }))} style={{ accentColor: "var(--accent)" }} />
                Prefer not to answer
              </label>
            ) : null
          ) : !computed ? (
            <div className="prg-absence">
              <Select aria-label={`${f.label}: value or absence reason`} value={ab} onChange={(e) => setAbsent((a) => ({ ...a, [f.key]: e.target.value as Absence | "" }))} style={{ height: 30, fontSize: 12 }}>
                <option value="">Value given</option>
                {f.absence.map((r) => <option key={r} value={r}>{ABSENCE_LABEL[r]}</option>)}
              </Select>
            </div>
          ) : null}
        </div>
        {err ? <div className="ph-err" role="alert">{err}</div> : null}
        {ab ? <div className="ph-help">Stored as {ABSENCE_LABEL[ab].toLowerCase()}. It is never converted to zero or shown as normal.</div> : null}
      </div>
    );
  };

  if (!sections.length) return <Note tone="neutral">This version has no blocks to preview.</Note>;

  return (
    <div className="ph-stack" style={{ gap: 12 }}>
      <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="ph-grow" style={{ minWidth: 200, fontSize: 12, color: "var(--dim)", lineHeight: 1.45 }}>
          {participant ? "What the participant sees, live as you edit. " : ""}Preview only: nothing is saved, no episode is created and nothing is sent.
          {participant && version.blocks.some((b) => b.blockId.startsWith("blk-consent")) ? " A booking is confirmed only when the questionnaire and both required consents are complete." : ""}
        </div>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => { setAnswers({}); setAbsent({}); }}>Clear answers</Button>
      </div>
      <div className="ph-wrap" style={{ gap: 8 }}>
        <Pill tone={reqDone === reqTotal ? "ok" : "neutral"} icon={reqDone === reqTotal ? "check" : "clock"}>Required answered or marked absent: {reqDone} of {reqTotal}</Pill>
        <Pill tone="info" icon="link">Conditional questions showing: {condShown} of {condTotal}</Pill>
      </div>
      {sections.map(({ ref, blk, live }, i) => (
        <section key={ref.blockId} className="prg-pv-sec" aria-label={blk ? blk.name : ref.blockId}>
          <div className="ph-row-flex" style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span className="prg-sec-no">{i + 1}</span>
            <span className="ph-grow" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, minWidth: 0 }}>{blk?.name || ref.blockId} <span className="ph-faint" style={{ fontWeight: 400 }}>{ref.version}</span></span>
            <span className={"prg-tag" + (ref.required ? " prg-tag-on" : "")}>{ref.required ? "Required section" : "Optional section"}</span>
          </div>
          {!blk || !live ? (
            <div className="ph-faint" style={{ fontSize: 12, padding: "8px 0 10px" }}>
              Archived block version {ref.version}. Its field definitions are kept with this retired template version and are not previewed here.
            </div>
          ) : (
            <>
              {blk.fields.map((f) => visible(f) ? field(f, blk.fields) : (
                <div key={f.key} className="prg-hidden-q">
                  <Icon name="eye" size={12} style={{ marginTop: 2, flex: "none" }} />
                  <span>Conditional question hidden until {conditionText(f, blk.fields)}: {f.label}{f.unit ? ` (${f.unit})` : ""}</span>
                </div>
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}
