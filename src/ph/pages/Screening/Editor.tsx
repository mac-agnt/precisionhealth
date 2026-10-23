/* Range editor (superadmins only). Starts from the version in force or the open draft. Every cohort
   has sex, age, ethnicity and pregnancy; every band has explicit limits, each marked included or
   excluded, and the word printed on the report. The generated sentence and the gap and overlap
   check update as you type. Saving creates or updates a draft; nothing is in use until published. */
import { useMemo, useState } from "react";
import {
  RR_BAND_META, RR_BAND_ORDER, RR_DEFAULT_LABEL, RR_ETHNICITIES, anyCohort, bandIssues, cohortOverlaps, rowSentence, today,
} from "../../model";
import type { RrBand, RrBandKey, RrBound, RrRow, RrTest, RrVersion } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, Checkbox, Field, Icon, Modal, Select, TextInput, Textarea } from "../../ui";
import { rrAct } from "./actions";
import { Callout, Swatch } from "./shared";

type Lim = { value: string; inclusive: boolean } | null;
type EdBand = { key: RrBandKey; min: Lim; max: Lim; label: string };
type EdRow = Omit<RrRow, "bands" | "cohort"> & { cohort: { sex: RrRow["cohort"]["sex"]; ageMin: string; ageMax: string; ethnicities: "any" | string[]; pregnancy: RrRow["cohort"]["pregnancy"] }; bands: EdBand[] };

const toLim = (b: RrBound | null): Lim => (b ? { value: String(b.value), inclusive: b.inclusive } : null);
const fromLim = (l: Lim): RrBound | null => (l && l.value.trim() !== "" ? { value: Number(l.value), inclusive: l.inclusive } : null);
const toEd = (r: RrRow): EdRow => ({ ...r, cohort: { ...r.cohort, ageMin: r.cohort.ageMin === null ? "" : String(r.cohort.ageMin), ageMax: r.cohort.ageMax === null ? "" : String(r.cohort.ageMax - 1) },
  bands: r.bands.map((b) => ({ key: b.key, label: b.label, min: toLim(b.min), max: toLim(b.max) })) });
/* The editor shows the oldest age included ("to 65"); storage keeps the first age excluded (66). */
const fromEd = (r: EdRow): RrRow => ({ ...r, cohort: { ...r.cohort, ageMin: r.cohort.ageMin.trim() === "" ? null : Number(r.cohort.ageMin), ageMax: r.cohort.ageMax.trim() === "" ? null : Number(r.cohort.ageMax) + 1 },
  bands: r.bands.map((b): RrBand => ({ key: b.key, label: b.label.trim(), min: fromLim(b.min), max: fromLim(b.max) })) });

export function RangeEditor({ test, base, onClose }: { test: RrTest; base: RrVersion | null; onClose: () => void }) {
  const s = usePhState();
  const isDraft = base?.status === "draft";
  const [rows, setRows] = useState<EdRow[]>(() => (base?.rows.length ? base.rows : [{ id: "new-1", cohort: anyCohort(), status: "set", bands: [] } as RrRow]).map(toEd));
  const [eff, setEff] = useState(isDraft ? base!.effectiveFrom : today(s));
  const [reason, setReason] = useState(isDraft ? base!.reason : "");
  const [source, setSource] = useState(isDraft ? base!.source : "");
  const parsed = useMemo(() => rows.map(fromEd), [rows]);
  const numbersOk = parsed.every((r) => r.bands.every((b) => [b.min, b.max].every((x) => !x || Number.isFinite(x.value))));
  const issues = numbersOk ? parsed.flatMap((r) => bandIssues(r, test.decimals).map((i) => i.text)).concat(cohortOverlaps(parsed)) : [];

  const setRow = (i: number, f: (r: EdRow) => EdRow) => setRows((rs) => rs.map((r, n) => (n === i ? f(structuredClone(r)) : r)));
  const save = () => { if (dispatch(rrAct.saveDraft(test.id, parsed, eff, reason, source)).ok) onClose(); };

  return (
    <Modal open onClose={onClose} width={900} title={`${isDraft ? `Edit draft version ${base!.version}` : "Propose a change"}: ${test.name}`}
      footer={<><span className="ph-faint ph-grow" style={{ fontSize: 12, alignSelf: "center" }}>Saved as a draft. Not used for any result until a superadmin publishes it.</span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!numbersOk}>Save draft</Button></>}>
      <div className="ph-stack" style={{ gap: 14, maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
        <div className="scr-grid-2">
          <Field label="Takes effect from" help="Results with a sample date on or after this use the new range."><TextInput type="date" value={eff} onChange={(e) => setEff(e.target.value)} /></Field>
          <Field label="Source" help="For example: Eurofins bulletin 14 Oct 2026."><TextInput value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where the new numbers come from" /></Field>
        </div>
        <Field label="Reason for the change" help="Kept in the audit trail with your name."><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Laboratory changed the upper reference limit for TSH." /></Field>

        {rows.map((r, i) => (
          <div className="scr-ed-row" key={i}>
            <div className="ph-row-flex" style={{ marginBottom: 8, gap: 8 }}>
              <strong style={{ fontSize: 12.5, color: "var(--ink)" }}>Cohort {i + 1}</strong>
              <span className="ph-grow" />
              <Select value={r.status} onChange={(e) => setRow(i, (x) => ({ ...x, status: e.target.value as RrRow["status"] }))} style={{ width: 170 }} aria-label="Range status">
                <option value="set">Range set</option><option value="not_set">Range not set yet</option><option value="not_applicable">Not applicable</option>
              </Select>
              {rows.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))} aria-label="Remove cohort"><Icon name="x" size={13} /></Button> : null}
            </div>
            <div className="scr-ed-cohort">
              <Field label="Sex"><Select value={r.cohort.sex} onChange={(e) => setRow(i, (x) => { x.cohort.sex = e.target.value as EdRow["cohort"]["sex"]; return x; })}><option value="any">Everyone</option><option value="male">Male</option><option value="female">Female</option></Select></Field>
              <Field label="Age from"><TextInput inputMode="numeric" value={r.cohort.ageMin} onChange={(e) => setRow(i, (x) => { x.cohort.ageMin = e.target.value.replace(/\D/g, ""); return x; })} placeholder="Any" /></Field>
              <Field label="Age to"><TextInput inputMode="numeric" value={r.cohort.ageMax} onChange={(e) => setRow(i, (x) => { x.cohort.ageMax = e.target.value.replace(/\D/g, ""); return x; })} placeholder="Any" /></Field>
              <Field label="Ethnicity"><Select value={r.cohort.ethnicities === "any" ? "any" : "some"} onChange={(e) => setRow(i, (x) => { x.cohort.ethnicities = e.target.value === "any" ? "any" : []; return x; })}><option value="any">All ethnicities</option><option value="some">Specific groups</option></Select></Field>
              <Field label="Pregnancy"><Select value={r.cohort.pregnancy} onChange={(e) => setRow(i, (x) => { x.cohort.pregnancy = e.target.value as EdRow["cohort"]["pregnancy"]; return x; })}><option value="any">Any</option><option value="not_pregnant">Not pregnant</option><option value="pregnant">Pregnant</option></Select></Field>
            </div>
            {r.cohort.ethnicities !== "any" ? (
              <div className="scr-eth">{RR_ETHNICITIES.map((e) => {
                const list = r.cohort.ethnicities as string[];
                return <Checkbox key={e} label={e} checked={list.includes(e)} onChange={(on) => setRow(i, (x) => { const l = x.cohort.ethnicities as string[]; x.cohort.ethnicities = on ? [...l, e] : l.filter((y) => y !== e); return x; })} />;
              })}</div>) : null}

            {r.status === "set" && test.kind === "qualitative" ? (
              <Field label="Expected (normal) result"><TextInput value={r.expected || ""} onChange={(e) => setRow(i, (x) => ({ ...x, expected: e.target.value }))} /></Field>
            ) : null}
            {r.status === "set" && test.kind !== "qualitative" ? (
              <div style={{ marginTop: 8 }}>
                {RR_BAND_ORDER.map((k) => r.bands.find((b) => b.key === k)).filter((b): b is EdBand => !!b).map((b) => {
                  const bi = r.bands.indexOf(b);
                  const upd = (f: (x: EdBand) => void) => setRow(i, (x) => { f(x.bands[bi]); return x; });
                  return (
                    <div className="scr-ed-band" key={b.key}>
                      <span className="ph-row-flex" style={{ gap: 7, fontSize: 12 }}><Swatch k={b.key} />{RR_BAND_META[b.key].name}</span>
                      <LimitInput label="From" lim={b.min} lower onChange={(l) => upd((x) => { x.min = l; })} />
                      <LimitInput label="To" lim={b.max} onChange={(l) => upd((x) => { x.max = l; })} />
                      <TextInput value={b.label} onChange={(e) => upd((x) => { x.label = e.target.value.toUpperCase(); })} aria-label="Word printed on the report" placeholder="Printed word" />
                      <Button size="sm" variant="ghost" onClick={() => setRow(i, (x) => ({ ...x, bands: x.bands.filter((_, n) => n !== bi) }))} aria-label={`Remove ${RR_BAND_META[b.key].name}`}><Icon name="x" size={13} /></Button>
                    </div>);
                })}
                <div className="ph-row-flex ph-wrap" style={{ gap: 6, marginTop: 8 }}>
                  {RR_BAND_ORDER.filter((k) => !r.bands.some((b) => b.key === k)).map((k) => (
                    <Button key={k} size="sm" icon="plus" onClick={() => setRow(i, (x) => ({ ...x, bands: [...x.bands, { key: k, min: null, max: null, label: RR_DEFAULT_LABEL[k] }] }))}>{RR_BAND_META[k].name}</Button>))}
                </div>
              </div>) : null}
            {numbersOk ? <p className="scr-sentence" style={{ marginTop: 10 }}><span className="ph-faint">Reads as: </span>{rowSentence(test, fromEd(r))}</p> : null}
          </div>
        ))}
        <div><Button icon="plus" onClick={() => setRows((rs) => [...rs, { id: `new-${rs.length + 1}`, cohort: { sex: "any", ageMin: "", ageMax: "", ethnicities: "any", pregnancy: "any" }, status: "set", bands: [] }])}>Add a cohort</Button></div>
        {!numbersOk ? <Callout tone="bad">Some limits are not numbers.</Callout>
          : issues.length ? <Callout tone="warn"><strong>Check before saving:</strong> {issues.join(" ")}</Callout>
          : <Callout tone="ok">No gaps or overlaps between bands, and no cohort clashes.</Callout>}
      </div>
    </Modal>
  );
}

function LimitInput({ label, lim, lower, onChange }: { label: string; lim: Lim; lower?: boolean; onChange: (l: Lim) => void }) {
  const inc = lim ? lim.inclusive : true;
  return (
    <div className="scr-lim">
      <Select value={lim ? (inc ? "inc" : "exc") : "none"} aria-label={`${label}: included or excluded`}
        onChange={(e) => onChange(e.target.value === "none" ? null : { value: lim?.value || "", inclusive: e.target.value === "inc" })}>
        <option value="none">{lower ? "No min" : "No max"}</option>
        <option value="inc">{lower ? "≥" : "≤"}</option>
        <option value="exc">{lower ? ">" : "<"}</option>
      </Select>
      <TextInput inputMode="decimal" disabled={!lim} value={lim?.value || ""} aria-label={`${label} value`} placeholder={lim ? "Value" : "Open"}
        onChange={(e) => onChange({ value: e.target.value.replace(/[^\d.\-]/g, ""), inclusive: inc })} />
    </div>
  );
}
