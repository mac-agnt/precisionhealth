/* Field editor: label, type, unit, required or optional, absence options (not done, declined),
   conditional rule and validation for the selected field. Edits apply to the open draft only,
   through the copy-on-write action, and commit when an input loses focus. */
import { useEffect, useState } from "react";
import type { FieldDef, FormBlock, FormTemplate, FormTemplateVersion } from "../../model";
import { dispatch } from "../../store";
import { Checkbox, Field, Select, Switch, TextInput } from "../../ui";
import { Note } from "./common";
import { formAct } from "./formActions";
import type { FieldPatch } from "./formActions";
import { conditionText } from "./model";

const TYPES: FieldDef["type"][] = ["number", "text", "choice", "boolean", "date"];

export function FieldEditor({ template, version, block, field, editable, reason, sharedNames }: {
  template: FormTemplate; version: FormTemplateVersion; block: FormBlock; field: FieldDef; editable: boolean; reason: string | null; sharedNames: string[];
}) {
  const [label, setLabel] = useState(field.label);
  const [unit, setUnit] = useState(field.unit || "");
  const [min, setMin] = useState(field.min !== undefined ? String(field.min) : "");
  const [max, setMax] = useState(field.max !== undefined ? String(field.max) : "");
  const [opts, setOpts] = useState((field.options || []).join(", "));
  useEffect(() => {
    setLabel(field.label); setUnit(field.unit || ""); setOpts((field.options || []).join(", "));
    setMin(field.min !== undefined ? String(field.min) : ""); setMax(field.max !== undefined ? String(field.max) : "");
  }, [field.key, field.label, field.unit, field.min, field.max, field.options, block.id]);

  const edit = (patch: FieldPatch) => { dispatch(formAct.editField(template.id, block.id, field.key, patch)); };
  const isDraftCopy = block.id.includes("--");
  const earlier = block.fields.slice(0, block.fields.findIndex((f) => f.key === field.key)).filter((f) => f.type === "boolean" || f.type === "choice");
  const trig = field.showIf ? block.fields.find((f) => f.key === field.showIf!.key) : undefined;
  const valueOptions = (f: FieldDef | undefined) => (!f ? [] : f.type === "boolean" ? ["Yes", "No"] : f.options || []);
  const toValue = (f: FieldDef, s: string): string | boolean => (f.type === "boolean" ? s === "Yes" : s);
  const fromValue = (v: string | boolean | undefined) => (v === true ? "Yes" : v === false ? "No" : v || "");
  const commitRange = () => {
    const lo = min.trim() === "" ? undefined : Number(min), hi = max.trim() === "" ? undefined : Number(max);
    if ((lo !== undefined && !Number.isFinite(lo)) || (hi !== undefined && !Number.isFinite(hi))) return;
    if (lo === undefined && hi === undefined) { if (field.min !== undefined || field.max !== undefined) edit({ clearRange: true }); return; }
    if (lo !== field.min || hi !== field.max) edit({ clearRange: true, min: lo, max: hi });
  };
  const dis = !editable;

  return (
    <div className="ph-stack" style={{ gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{field.label}</div>
        <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 2 }}>{block.name} {block.version}, {template.name} v{version.version}</div>
      </div>
      {!editable && reason ? <Note tone="neutral" icon="lock">{reason}</Note> : null}
      {editable && !isDraftCopy ? (
        <Note tone="info" icon="layers">
          Your first change creates {block.name} {nextOf(block.version)} for this draft only.{sharedNames.length ? ` ${sharedNames.join(", ")} keep ${block.name} ${block.version}.` : ""} Answers already collected never change.
        </Note>
      ) : null}
      {editable && isDraftCopy ? <Note tone="ok" icon="edit">Editing {block.name} {block.version}, a draft block version used only by this draft. The shared library keeps the approved version for every other template.</Note> : null}
      <Field label="Label" htmlFor="prg-fe-label">
        <TextInput id="prg-fe-label" value={label} disabled={dis} onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { if (label.trim() && label !== field.label) edit({ label }); else setLabel(field.label); }} />
      </Field>
      <div className="prg-two-fixed">
        <Field label="Type" htmlFor="prg-fe-type">
          <Select id="prg-fe-type" value={field.type} disabled={dis || field.key === "bmi"} onChange={(e) => edit({ type: e.target.value as FieldDef["type"] })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Unit" htmlFor="prg-fe-unit" help={field.type === "number" ? "Shown beside the answer." : "Numbers only."}>
          <TextInput id="prg-fe-unit" value={unit} disabled={dis || field.type !== "number"} placeholder="None" onChange={(e) => setUnit(e.target.value)}
            onBlur={() => { if (unit !== (field.unit || "")) edit({ unit }); }} />
        </Field>
      </div>
      <div className="ph-row-flex" style={{ gap: 10 }}>
        <Switch on={field.required} disabled={dis} onChange={(v) => edit({ required: v })} label={`${field.label} is required`} />
        <span style={{ fontSize: 12.5, color: "var(--body)" }}>{field.required ? "Required" : "Optional"}</span>
      </div>
      <div>
        <div className="ph-label">If there is no answer</div>
        <div className="ph-stack" style={{ gap: 6 }}>
          <Checkbox checked disabled onChange={() => undefined} label="Missing" hint="Always recorded as missing, never as zero or normal." />
          <Checkbox checked={field.absence.includes("not_done")} disabled={dis} onChange={(v) => edit({ absence: v ? [...field.absence, "not_done"] : field.absence.filter((x) => x !== "not_done") })} label="Not done" />
          <Checkbox checked={field.absence.includes("declined")} disabled={dis} onChange={(v) => edit({ absence: v ? [...field.absence, "declined"] : field.absence.filter((x) => x !== "declined") })} label="Declined" />
        </div>
      </div>
      {field.type === "number" ? (
        <div className="prg-two-fixed">
          <Field label="Minimum" htmlFor="prg-fe-min">
            <TextInput id="prg-fe-min" type="number" step="any" value={min} disabled={dis} onChange={(e) => setMin(e.target.value)} onBlur={commitRange} />
          </Field>
          <Field label="Maximum" htmlFor="prg-fe-max">
            <TextInput id="prg-fe-max" type="number" step="any" value={max} disabled={dis} onChange={(e) => setMax(e.target.value)} onBlur={commitRange} />
          </Field>
        </div>
      ) : null}
      {field.type === "choice" ? (
        <Field label="Options" htmlFor="prg-fe-opts" help="Separate options with commas.">
          <TextInput id="prg-fe-opts" value={opts} disabled={dis} onChange={(e) => setOpts(e.target.value)}
            onBlur={() => { if (opts !== (field.options || []).join(", ")) edit({ options: opts.split(",") }); }} />
        </Field>
      ) : null}
      <div>
        <div className="ph-label">Conditional rule</div>
        <div className="prg-two-fixed">
          <Select aria-label="Show this question when" value={field.showIf?.key || ""} disabled={dis || !earlier.length}
            onChange={(e) => {
              const k = e.target.value;
              if (!k) { edit({ clearShowIf: true }); return; }
              const f = block.fields.find((x) => x.key === k)!;
              edit({ showIf: { key: k, equals: toValue(f, valueOptions(f)[0] || "") } });
            }}>
            <option value="">Always shown</option>
            {earlier.map((f) => <option key={f.key} value={f.key}>When {f.label}</option>)}
          </Select>
          <Select aria-label="Equals" value={fromValue(field.showIf?.equals)} disabled={dis || !trig}
            onChange={(e) => trig && edit({ showIf: { key: trig.key, equals: toValue(trig, e.target.value) } })}>
            {!trig ? <option value="">No condition</option> : valueOptions(trig).map((o) => <option key={o} value={o}>is {o}</option>)}
          </Select>
        </div>
        <div className="ph-help">{field.showIf ? `Shown when ${conditionText(field, block.fields)}.` : earlier.length ? "Shown to everyone." : "No earlier yes or no, or choice, question in this block to depend on."}</div>
      </div>
    </div>
  );
}

function nextOf(v: string) { const [a, b] = v.split(".").map(Number); return `${a}.${(b || 0) + 1}`; }
