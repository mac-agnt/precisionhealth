/* Form creator actions registered by the Programmes module. Field edits are copy-on-write:
   the shared, clinically approved block is never edited in place. The first edit in a draft
   creates a draft block version used by that template draft only, so other templates and every
   collected answer keep their version. Also seeds the booking and consent form template. */
import type { FieldDef, FormBlock, FormTemplate, Handler } from "../../model";
import { registerHandlers } from "../../model";

export const COPY_SEP = "--";
export const isCopyOf = (id: string) => id.split(COPY_SEP)[0];
const copyId = (base: string, templateId: string, version: string) => `${base}${COPY_SEP}${templateId}-${version}`;
const bump = (v: string) => { const [a, b] = v.split(".").map(Number); return `${a}.${(b || 0) + 1}`; };

export type FieldPatch = Partial<Pick<FieldDef, "label" | "type" | "unit" | "required" | "min" | "max" | "options" | "showIf" | "absence">> & { clearShowIf?: boolean; clearRange?: boolean };

const editField: Handler<{ templateId: string; blockId: string; fieldKey: string; patch: FieldPatch }> = (c, a) => {
  const d = c.need("forms.edit", "edit form fields"); if (d) return d;
  const t = c.s.forms.templates.find((x) => x.id === a.templateId);
  const v = t?.versions.find((x) => x.status === "draft");
  if (!t || !v) return c.fail("Create a new version first. Published versions never change.");
  const ref = v.blocks.find((r) => r.blockId === a.blockId);
  if (!ref) return c.fail("That block is not in this draft.");
  let blk = c.s.forms.blocks.find((b) => b.id === ref.blockId);
  if (!blk) return c.fail("Unknown block.");
  const own = copyId(isCopyOf(blk.id), t.id, v.version);
  if (blk.id !== own) {
    const base = blk;
    const copy: FormBlock = { ...structuredClone(base), id: own, version: bump(base.version), approvedBy: "Draft, awaiting clinical approval" };
    c.s.forms.blocks.push(copy);
    ref.blockId = copy.id;
    ref.version = copy.version;
    c.emit({ verb: "form.block_drafted", entity: { kind: "template", id: t.id },
      summary: `${c.first()} started ${base.name} ${copy.version} in ${t.name} draft v${v.version}. ${base.name} ${base.version} is unchanged for other templates and for answers already collected.` });
    blk = copy;
  }
  const f = blk.fields.find((x) => x.key === a.fieldKey);
  if (!f) return c.fail("Unknown field.");
  const p = a.patch;
  if (p.label !== undefined) { if (!p.label.trim()) return c.fail("A field needs a label."); f.label = p.label.trim(); }
  if (p.type !== undefined) f.type = p.type;
  if (p.unit !== undefined) { if (p.unit.trim()) f.unit = p.unit.trim(); else delete f.unit; }
  if (p.required !== undefined) f.required = p.required;
  if (p.options !== undefined) { const o = p.options.map((x) => x.trim()).filter(Boolean); if (f.type === "choice" && !o.length) return c.fail("A choice field needs at least one option."); f.options = o; }
  if (p.clearRange) { delete f.min; delete f.max; }
  if (p.min !== undefined) f.min = p.min;
  if (p.max !== undefined) f.max = p.max;
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) return c.fail("The minimum must not be above the maximum.");
  if (p.absence !== undefined) f.absence = Array.from(new Set(["missing" as const, ...p.absence]));
  if (p.clearShowIf) delete f.showIf;
  if (p.showIf !== undefined) {
    if (p.showIf.key === f.key || !blk.fields.some((x) => x.key === p.showIf!.key)) return c.fail("A condition must use another question in the same block.");
    f.showIf = p.showIf;
  }
  return c.ok();
};

const saveDraft: Handler<{ templateId: string }> = (c, a) => {
  const d = c.need("forms.edit", "save form drafts"); if (d) return d;
  const t = c.s.forms.templates.find((x) => x.id === a.templateId);
  const v = t?.versions.find((x) => x.status === "draft");
  if (!t || !v) return c.fail("There is no draft to save.");
  c.emit({ verb: "form.saved", entity: { kind: "template", id: t.id }, summary: `${c.first()} saved ${t.name} draft v${v.version} (${v.blocks.length} blocks). Not used for bookings until it is approved.` });
  return c.ok(`Draft v${v.version} saved. New bookings keep using v${t.currentVersion} until a clinical approver publishes it.`, "ok");
};

/* ---- booking and consent form (seeded once, the same shape as the clinical templates) ---- */
const BOOKING_BLOCKS: FormBlock[] = [
  { id: "blk-booking", name: "Booking details", version: "1.0", summary: "Site, preferred date and contact preference for the booking request.", approvedBy: "Programme Operations",
    fields: [
      { key: "site", label: "Clinic site", type: "choice", options: ["Sisk Dublin Site A", "Sisk Dublin Site B", "Salesforce Dublin", "IBM Dublin"], required: true, absence: ["missing"] },
      { key: "prefDate", label: "Preferred clinic date", type: "date", required: true, absence: ["missing"] },
      { key: "prefTime", label: "Preferred time of day", type: "choice", options: ["Morning", "Afternoon", "No preference"], required: false, absence: ["missing"] },
      { key: "contactPref", label: "Contact preference", type: "choice", options: ["Email", "SMS"], required: true, absence: ["missing"] },
      { key: "access", label: "Access or support needs", type: "text", required: false, absence: ["missing", "declined"] },
    ] },
  { id: "blk-consent", name: "Consent", version: "1.0", summary: "Separate consent choices. Both required consents must be given before a booking can be confirmed.", approvedBy: "Clinical Review",
    fields: [
      { key: "consentService", label: "I agree to take part in the screening service described", type: "boolean", required: true, absence: ["missing"] },
      { key: "consentData", label: "I agree that Precision Health may process my health information for this service", type: "boolean", required: true, absence: ["missing"] },
      { key: "consentSms", label: "Send me appointment messages by SMS (Esendex)", type: "boolean", required: false, absence: ["missing"] },
    ] },
];
export const BOOKING_TEMPLATE_ID = "tpl-booking-consent";
const BOOKING_TEMPLATE: FormTemplate = {
  id: BOOKING_TEMPLATE_ID, name: "Booking and consent form", kind: "screening", currentVersion: "1.0",
  purpose: "Per-site booking request and consent (BC-3). The health questionnaire and both required consents must be complete before a booking is confirmed.",
  versions: [{ version: "1.0", status: "published", createdAt: "2026-09-01T09:00:00.000Z", createdBy: "brenda", publishedAt: "2026-09-04T09:00:00.000Z",
    note: "Replaces the separate per-site booking and consent forms used today.", blocks: [{ blockId: "blk-booking", version: "1.0", required: true }, { blockId: "blk-consent", version: "1.0", required: true }] }],
};

const seed: Handler<Record<string, never>> = (c) => {
  if (c.s.forms.templates.some((t) => t.id === BOOKING_TEMPLATE_ID)) return c.ok();
  for (const b of BOOKING_BLOCKS) if (!c.s.forms.blocks.some((x) => x.id === b.id)) c.s.forms.blocks.push(structuredClone(b));
  c.s.forms.templates.push(structuredClone(BOOKING_TEMPLATE));
  return c.ok();
};

registerHandlers({ "prgForms/editField": editField, "prgForms/saveDraft": saveDraft, "prgForms/seed": seed });

export const formAct = {
  editField: (templateId: string, blockId: string, fieldKey: string, patch: FieldPatch) => ({ type: "prgForms/editField", templateId, blockId, fieldKey, patch }),
  saveDraft: (templateId: string) => ({ type: "prgForms/saveDraft", templateId }),
  seed: () => ({ type: "prgForms/seed" }),
};
