/* Form templates (reusable versioned blocks, draft versions, publication approval) and
   employer reporting (defined cohort, disclosure control, narrative approval, frozen
   snapshot, print and PowerPoint previews). */
import type { CohortDef, FormTemplate, FormTemplateVersion } from "../types";
import { cohortKey, cohortLabel, defaultCohort, disclosureCheck, draftNarrative, employerMetrics, cohortEpisodes, isProgrammeLevel } from "../selectors/reporting";
import { PROGRAMME_BY_ID } from "../constants";
import { Ctx, pad } from "./ctx";
import type { Handler } from "./ctx";

const handlers: Record<string, Handler> = {};

/* ---- forms ---- */
function template(c: Ctx, id: string): FormTemplate | undefined { return c.s.forms.templates.find((t) => t.id === id); }
function draftOf(t: FormTemplate): FormTemplateVersion | undefined { return t.versions.find((v) => v.status === "draft"); }
function bump(version: string): string {
  const [maj, min] = version.split(".").map(Number);
  return `${maj}.${(min || 0) + 1}`;
}

handlers["form/createDraft"] = (c, a: { templateId: string }) => {
  const d = c.need("forms.edit", "edit form templates"); if (d) return d;
  const t = template(c, a.templateId);
  if (!t) return c.fail("Unknown template.");
  if (t.versions.some((v) => v.status === "pending_approval")) return c.fail("A version is awaiting publication approval. Decide it first.");
  const existing = draftOf(t);
  if (existing) return c.ok(`Draft v${existing.version} is already open.`, "info", existing.version);
  const cur = t.versions.find((v) => v.version === t.currentVersion)!;
  const highest = t.versions.map((v) => v.version).sort((x, y) => (Number(x.replace(".", "")) < Number(y.replace(".", "")) ? -1 : 1)).pop()!;
  const version = bump(highest);
  t.versions.push({ version, status: "draft", blocks: cur.blocks.map((b) => ({ ...b })), createdAt: c.stamp(), createdBy: c.persona().id as never, publishedAt: null, note: `Draft from v${cur.version}. Existing episodes keep their v${cur.version} snapshot.` });
  c.emit({ verb: "form.drafted", summary: `${c.first()} created draft v${version} of ${t.name}. Previously collected answers are unchanged.`, entity: { kind: "template", id: t.id } });
  return c.ok(`Draft v${version} created. Existing episodes keep their v${cur.version} snapshot.`, "ok", version);
};

handlers["form/addBlock"] = (c, a: { templateId: string; blockId: string }) => {
  const d = c.need("forms.edit", "edit form templates"); if (d) return d;
  const t = template(c, a.templateId);
  const v = t && draftOf(t);
  if (!t || !v) return c.fail("Create a draft version first.");
  if (v.blocks.some((b) => b.blockId === a.blockId)) return c.fail("That block is already in this form.");
  const blk = c.s.forms.blocks.find((b) => b.id === a.blockId);
  if (!blk) return c.fail("Unknown block.");
  v.blocks.push({ blockId: blk.id, version: blk.version, required: true });
  return c.ok(`${blk.name} ${blk.version} added.`, "info");
};

handlers["form/removeBlock"] = (c, a: { templateId: string; blockId: string }) => {
  const d = c.need("forms.edit", "edit form templates"); if (d) return d;
  const t = template(c, a.templateId);
  const v = t && draftOf(t);
  if (!t || !v) return c.fail("Create a draft version first.");
  v.blocks = v.blocks.filter((b) => b.blockId !== a.blockId);
  return c.ok("Block removed from the draft.", "info");
};

handlers["form/moveBlock"] = (c, a: { templateId: string; blockId: string; dir: -1 | 1 }) => {
  const d = c.need("forms.edit", "edit form templates"); if (d) return d;
  const t = template(c, a.templateId);
  const v = t && draftOf(t);
  if (!t || !v) return c.fail("Create a draft version first.");
  const i = v.blocks.findIndex((b) => b.blockId === a.blockId);
  const j = i + a.dir;
  if (i < 0 || j < 0 || j >= v.blocks.length) return c.fail("Cannot move further.");
  [v.blocks[i], v.blocks[j]] = [v.blocks[j], v.blocks[i]];
  return c.ok();
};

handlers["form/toggleRequired"] = (c, a: { templateId: string; blockId: string }) => {
  const d = c.need("forms.edit", "edit form templates"); if (d) return d;
  const t = template(c, a.templateId);
  const v = t && draftOf(t);
  const b = v?.blocks.find((x) => x.blockId === a.blockId);
  if (!t || !v || !b) return c.fail("Create a draft version first.");
  b.required = !b.required;
  return c.ok();
};

handlers["form/submitPublication"] = (c, a: { templateId: string }) => {
  const d = c.need("forms.edit", "submit a form for publication"); if (d) return d;
  const t = template(c, a.templateId);
  const v = t && draftOf(t);
  if (!t || !v) return c.fail("There is no draft to submit.");
  if (!v.blocks.length && t.kind === "screening") return c.fail("Add at least one block before submitting.");
  v.status = "pending_approval";
  const n = c.nextNo("approval");
  c.s.approvals.push({ id: `APR-${pad(n, 4)}`, type: "form_publication", title: `${t.name} v${v.version} publication`, requestedBy: c.persona().id as never, reviewerId: "neil", status: "pending", target: { kind: "template", id: t.id }, createdAt: c.stamp(), decidedAt: null, decidedBy: null });
  c.emit({ verb: "form.submitted", summary: `${c.first()} submitted ${t.name} v${v.version} for publication approval.`, entity: { kind: "template", id: t.id } });
  return c.ok(`v${v.version} submitted. A clinical approver must approve it before future bookings use it.`, "ok");
};

handlers["form/decidePublication"] = (c, a: { approvalId: string; approve: boolean }) => {
  const d = c.need("forms.publish", "approve form publication"); if (d) return d;
  const ap = c.s.approvals.find((x) => x.id === a.approvalId && x.type === "form_publication");
  if (!ap || ap.status !== "pending") return c.fail("This publication was already decided.");
  const t = template(c, ap.target.id);
  const v = t?.versions.find((x) => x.status === "pending_approval");
  if (!t || !v) return c.fail("No version is awaiting approval.");
  ap.decidedAt = c.stamp();
  ap.decidedBy = c.persona().id as never;
  if (!a.approve) {
    ap.status = "rejected";
    v.status = "draft";
    c.emit({ verb: "form.rejected", summary: `${c.first()} returned ${t.name} v${v.version} to draft.`, entity: { kind: "template", id: t.id } });
    return c.ok("Returned to draft.", "info");
  }
  ap.status = "approved";
  t.versions.filter((x) => x.status === "published").forEach((x) => { x.status = "retired"; });
  v.status = "published";
  v.publishedAt = c.stamp();
  t.currentVersion = v.version;
  c.emit({ verb: "form.published", summary: `${c.first()} published ${t.name} v${v.version}. Future bookings use it. Historical episodes keep the version they were collected on.`, entity: { kind: "template", id: t.id } });
  return c.ok(`${t.name} v${v.version} published. Future bookings use it. Historical episodes keep their original version.`, "ok");
};

/* ---- employer reporting ---- */
function report(c: Ctx, id: string) { return c.s.employerReports.find((r) => r.id === id); }

handlers["report/setCohort"] = (c, a: { reportId: string; cohort: CohortDef }) => {
  const d = c.need("reports.build", "build employer reports"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if (r.status === "approved" || r.status === "exported") return c.fail("This report is approved. Changing the cohort would invalidate the approval. Create a new version first.");
  r.cohort = { ...a.cohort, programmeId: r.programmeId };
  c.inv();
  const size = cohortEpisodes(c.s, r.cohort, r.dataAsOf).length;
  const check = disclosureCheck(c.s, size);
  const key = cohortKey(r.cohort);
  if (check.blocked) {
    if (r.lastBlockedKey !== key) {
      r.blockedAttempts += 1;
      r.lastBlockedKey = key;
      c.emit({ verb: "export.blocked", actor: { kind: "system", id: "system", label: "Disclosure control" }, summary: `${PROGRAMME_BY_ID[r.programmeId].clientName} employer export blocked: selected cohort has ${size} participants.`, entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, storyId: "ST-06" });
    }
    return { ok: true, tone: "warn", message: check.reason };
  }
  return c.ok("Cohort applied.", "info");
};

handlers["report/useProgrammeLevel"] = (c, a: { reportId: string }) => {
  const d = c.need("reports.build", "build employer reports"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if (r.status === "approved" || r.status === "exported") return c.fail("This report is approved.");
  r.cohort = defaultCohort(r.programmeId);
  c.inv();
  return c.ok(`Programme-level view applied: ${cohortEpisodes(c.s, r.cohort, r.dataAsOf).length} released reports. No small group is shown.`, "ok");
};

handlers["report/setNarrative"] = (c, a: { reportId: string; text: string }) => {
  const d = c.need("reports.build", "edit the employer narrative"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if (r.status === "exported") return c.fail("This report was exported. Create a new version to change it.");
  r.narrative = a.text;
  r.narrativeSource = "manual";
  if (r.narrativeApproved || r.status === "approved") { r.narrativeApproved = false; r.status = "reviewed"; r.snapshot = null; r.approvedBy = null; r.approvedAt = null; }
  return c.ok();
};

handlers["report/draftNarrative"] = (c, a: { reportId: string }) => {
  const d = c.need("reports.build", "draft the employer narrative"); if (d) return d;
  if (!c.s.settings.aiDraftingOn) return c.fail("AI drafting preview is off. Write the narrative manually. The manual workflow is unaffected.");
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  const m = employerMetrics(c.s, r.programmeId, r.cohort, r.dataAsOf);
  if (m.blocked) return c.fail("The selected cohort is blocked. Use the programme-level view before drafting.");
  r.narrative = draftNarrative(m);
  r.narrativeSource = "draft_from_aggregates";
  r.narrativeApproved = false;
  c.emit({ verb: "agent.drafted", actor: { kind: "agent", id: "reporting", label: "Programme Reporting" }, summary: `Programme Reporting drafted a narrative for ${r.id} from the approved aggregate snapshot. Draft only, awaiting clinician review.`, entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, simulated: true });
  return c.ok("Narrative drafted from approved aggregates. It stays a draft until a clinician approves it.", "info");
};

handlers["report/markReviewed"] = (c, a: { reportId: string }) => {
  const d = c.need("reports.build", "complete the disclosure review"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if (r.status !== "draft") return c.fail("Disclosure review was already completed.");
  const size = cohortEpisodes(c.s, r.cohort, r.dataAsOf).length;
  const check = disclosureCheck(c.s, size);
  if (check.blocked) return c.fail(check.reason);
  if (!r.narrative.trim()) return c.fail("Add a narrative first. It can be written manually or drafted from approved aggregates.");
  r.status = "reviewed";
  c.emit({ verb: "report.reviewed", summary: `${c.first()} completed the disclosure review for ${r.id}: cohort ${isProgrammeLevel(r.cohort) ? "programme level" : cohortLabel(r.cohort, "")}, ${size} participants.`, entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, storyId: "ST-06" });
  return c.ok("Disclosure review complete. A clinician must now approve the narrative.", "ok");
};

handlers["report/approve"] = (c, a: { reportId: string }) => {
  const d = c.need("reports.approve", "approve the employer report"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if (r.status === "approved" || r.status === "exported") return c.fail("This report is already approved.");
  if (r.status !== "reviewed") return c.fail("Complete the disclosure review before clinician approval.");
  const m = employerMetrics(c.s, r.programmeId, r.cohort, r.dataAsOf);
  if (m.blocked) return c.fail(m.reason);
  if (!r.narrative.trim()) return c.fail("The narrative is empty.");
  r.narrativeApproved = true;
  r.status = "approved";
  r.approvedBy = c.persona().id as never;
  r.approvedAt = c.stamp();
  r.snapshot = { at: r.approvedAt, metrics: m };
  const ap = c.s.approvals.find((x) => x.type === "employer_report" && x.target.id === r.id && x.status === "pending");
  if (ap) { ap.status = "approved"; ap.decidedAt = r.approvedAt; ap.decidedBy = r.approvedBy; }
  c.emit({ verb: "report.approved", summary: `${c.first()} approved the clinical narrative and sign-off for ${r.id}. Snapshot frozen so PDF and PowerPoint previews match.`, entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, storyId: "ST-06" });
  return c.ok("Approved. The snapshot is frozen, so every export preview uses the same numbers.", "ok");
};

handlers["report/refreshSnapshot"] = (c, a: { reportId: string }) => {
  const d = c.need("reports.build", "refresh the report snapshot"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if (r.status === "approved" || r.status === "exported") return c.fail("This report is approved. Create a new version to refresh it.");
  r.dataAsOf = c.now;
  c.inv();
  return c.ok("Snapshot refreshed to include reports released since it was taken.", "info");
};

handlers["report/createExport"] = (c, a: { reportId: string; format: "pdf" | "pptx" }) => {
  const d = c.need("reports.export", "export employer reports"); if (d) return d;
  const r = report(c, a.reportId);
  if (!r) return c.fail("Unknown report.");
  if ((r.status !== "approved" && r.status !== "exported") || !r.snapshot) return c.fail("Only an approved report with a frozen snapshot can be exported.");
  if (r.snapshot.metrics.blocked) return c.fail(r.snapshot.metrics.reason);
  const existing = c.s.exports.find((e) => e.reportId === r.id && e.format === a.format && e.version === r.version);
  if (existing) return c.ok(`The ${a.format === "pdf" ? "print preview" : "PowerPoint preview"} for v${r.version} already exists.`, "info", existing.id);
  const n = c.nextNo("export");
  c.s.exports.push({ id: `EXP-${pad(n, 3)}`, reportId: r.id, format: a.format, version: r.version, createdAt: c.stamp(), createdBy: c.persona().id as never, kind: a.format === "pdf" ? "print_preview" : "pptx_preview" });
  r.status = "exported";
  c.emit({ verb: "report.exported", summary: `${c.first()} created the ${a.format === "pdf" ? "browser print preview (Save as PDF)" : "PowerPoint preview"} for ${r.id} v${r.version} from the approved snapshot.`, entity: { kind: "employer_report", id: r.id }, programmeId: r.programmeId, simulated: a.format === "pptx" });
  return c.ok(a.format === "pdf" ? "Print preview ready. Use Print, then Save as PDF." : "PowerPoint preview ready. This is a preview, not a downloadable .pptx file.", "ok");
};

export const programmeHandlers = handlers;
