/* Advice library actions, registered at import time like ./actions. Every handler is
   permission-checked (clinical review edits the library, assigns reporters and writes advice),
   idempotent where a repeat makes sense, and records an activity event.

   advicelib/prepareDraft is the AI-assisted path: it writes a draft built only from approved
   snippets plus a personalised opening line into the episode's draft report version. It never
   releases anything: the advice reviewed and preview ticks are cleared, so the clinician must
   read, edit and tick the existing release checklist. It respects Settings, AI Controls. */
import {
  approvedVersion, draftVersion, findSnippet, isReporterId, lastApproved, pendingDraft, registerHandlers, snippetStatus, staffName,
} from "../../model";
import type { ActionResult, Ctx, Episode, ReporterId, SnippetUse, StaffId } from "../../model";
import { resultsHandlers } from "../../model/actions/results";
import { preparedDraftFor, reporterOf } from "./libraryModel";

export const LIB = {
  saveDraft: "advicelib/saveDraft",
  discardDraft: "advicelib/discardDraft",
  approve: "advicelib/approve",
  retire: "advicelib/retire",
  recordUse: "advicelib/recordUse",
  prepareDraft: "advicelib/prepareDraft",
  assignReporter: "advicelib/assignReporter",
} as const;

type Via = SnippetUse["via"];
const VIAS: Via[] = ["code", "slash", "suggested", "library", "prepared"];

/** Same rule as the shared review handlers: a ready episode, or a released one with a correction in review. */
function notReviewable(c: Ctx, ep: Episode | undefined): string | null {
  if (!ep) return "Unknown episode.";
  if (ep.reportState === "ready_for_review") return null;
  if (ep.reportState === "released") return draftVersion(c.s, ep.id) ? null : "This report is released. Start a correction first.";
  return ep.reportState === "on_hold" ? "This episode is on hold. Advice opens once the hold is resolved." : "This episode is awaiting results. Advice opens once every expected result is accounted for.";
}

function checkWording(text: string): string | null {
  if (text.length < 20) return "Write the full wording, at least 20 characters.";
  if (text.includes("!")) return "Approved wording does not use exclamation marks.";
  if (/[–—]/.test(text)) return "Use a comma, colon or full stop instead of a long dash.";
  return null;
}

registerHandlers({
  [LIB.saveDraft]: (c: Ctx, a: { code: string; text: string; note?: string }): ActionResult => {
    const d = c.need("clinical.review", "edit the advice library"); if (d) return d;
    const s = findSnippet(c.s.adviceLibrary, a.code || "");
    if (!s) return c.fail(`${a.code} is not in the advice library.`);
    const text = (a.text || "").trim();
    const bad = checkWording(text); if (bad) return c.fail(bad);
    const note = (a.note || "").trim();
    const draft = pendingDraft(s);
    const base = lastApproved(s);
    const by = c.persona().id as StaffId;
    if (!draft && base && base.text === text) return c.fail(`No change from the approved wording, v${base.version}.`);
    let n: number;
    if (draft) {
      if (draft.text === text && (!note || draft.note === note)) return c.ok(`Draft v${draft.version} of ${s.code} is unchanged.`, "info", s.code);
      draft.text = text;
      if (note) draft.note = note;
      draft.editedBy = by;
      draft.editedAt = c.stamp();
      n = draft.version;
    } else {
      n = Math.max(0, ...s.versions.map((x) => x.version)) + 1;
      s.versions.push({ version: n, text, status: "draft", note: note || "Wording change.", editedBy: by, editedAt: c.stamp(), approvedBy: null, approvedAt: null });
    }
    const cur = approvedVersion(s);
    c.emit({ verb: "advice.library.draft", summary: `${c.first()} saved draft v${n} of ${s.code} (${s.title}) in the advice library. ${cur ? `v${cur.version} stays in use until the draft is approved.` : "It cannot be inserted until it is approved."}` });
    return c.ok(`Draft v${n} of ${s.code} saved. ${cur ? `v${cur.version} stays in use until a clinical reviewer approves it.` : "Approve it to make it available in the advice box."}`, "ok", s.code);
  },

  [LIB.discardDraft]: (c: Ctx, a: { code: string }): ActionResult => {
    const d = c.need("clinical.review", "edit the advice library"); if (d) return d;
    const s = findSnippet(c.s.adviceLibrary, a.code || "");
    if (!s) return c.fail(`${a.code} is not in the advice library.`);
    const draft = pendingDraft(s);
    if (!draft) return c.fail(`${s.code} has no draft to discard.`);
    if (s.versions.length === 1) return c.fail(`${s.code} has no approved version to fall back to. Edit the draft or approve it.`);
    s.versions = s.versions.filter((x) => x !== draft);
    c.emit({ verb: "advice.library.discarded", summary: `${c.first()} discarded draft v${draft.version} of ${s.code} in the advice library. The approved wording is unchanged.` });
    return c.ok(`Draft v${draft.version} of ${s.code} discarded.`, "info", s.code);
  },

  [LIB.approve]: (c: Ctx, a: { code: string }): ActionResult => {
    const d = c.need("clinical.review", "approve advice wording"); if (d) return d;
    const s = findSnippet(c.s.adviceLibrary, a.code || "");
    if (!s) return c.fail(`${a.code} is not in the advice library.`);
    const draft = pendingDraft(s);
    if (!draft) return c.fail(`${s.code} has no draft waiting for approval.`);
    const at = c.stamp();
    const prev = approvedVersion(s);
    const wasRetired = !!s.retired;
    for (const x of s.versions) if (x.status === "approved" || x.status === "retired") x.status = "superseded";
    draft.status = "approved";
    draft.approvedBy = c.persona().id as StaffId;
    draft.approvedAt = at;
    s.retired = null;
    c.emit({ verb: "advice.library.approved", summary: `${c.first()} approved ${s.code} v${draft.version} (${s.title})${prev ? `, replacing v${prev.version}` : ""}${wasRetired ? ". The snippet is back in use" : ""}. Advice already written keeps the version it was inserted from.` });
    return c.ok(`${s.code} v${draft.version} approved. It is now the wording codes expand to.`, "ok", s.code);
  },

  [LIB.retire]: (c: Ctx, a: { code: string; reason: string }): ActionResult => {
    const d = c.need("clinical.review", "retire advice wording"); if (d) return d;
    const s = findSnippet(c.s.adviceLibrary, a.code || "");
    if (!s) return c.fail(`${a.code} is not in the advice library.`);
    if (snippetStatus(s) !== "approved") return c.fail(`Only an approved snippet can be retired. ${s.code} is ${snippetStatus(s)}.`);
    if (pendingDraft(s)) return c.fail(`Approve or discard the draft of ${s.code} first.`);
    const reason = (a.reason || "").trim();
    if (reason.length < 8) return c.fail("Record why the snippet is being retired.");
    const cur = approvedVersion(s)!;
    cur.status = "retired";
    s.retired = { at: c.stamp(), by: c.persona().id as StaffId, reason };
    c.emit({ verb: "advice.library.retired", summary: `${c.first()} retired ${s.code} v${cur.version} in the advice library. Reason: ${reason.replace(/[.\s]+$/, "")}.` });
    return c.ok(`${s.code} retired. Typing the code no longer expands it.`, "info", s.code);
  },

  [LIB.recordUse]: (c: Ctx, a: { episodeId: string; code: string; via: Via }): ActionResult => {
    const d = c.need("clinical.review", "insert approved advice"); if (d) return d;
    const ep = c.ix().episodeById.get(a.episodeId);
    const why = notReviewable(c, ep); if (why) return c.fail(why);
    if (!VIAS.includes(a.via)) return c.fail("Unknown insertion route.");
    const s = findSnippet(c.s.adviceLibrary, a.code || "");
    if (!s) return c.fail(`${a.code} is not in the advice library.`);
    const ver = approvedVersion(s);
    if (!ver) return c.fail(s.retired ? `${s.code} was retired: ${s.retired.reason}` : `${s.code} is a draft and has not been approved yet.`);
    c.s.adviceLibrary.uses.push({ episodeId: ep!.id, code: s.code, version: ver.version, via: a.via, at: c.stamp(), by: c.persona().id as StaffId });
    c.emit({
      verb: "advice.snippet.inserted", summary: `${c.first()} inserted ${s.code} v${ver.version} (${s.title}) into the advice for ${ep!.id}.`,
      entity: { kind: "episode", id: ep!.id }, programmeId: ep!.programmeId, personId: ep!.personId, restricted: true, publicSummary: "Approved advice snippet inserted on a clinical episode",
    });
    return c.ok(`${s.code} v${ver.version} inserted.`, "info", s.code);
  },

  [LIB.prepareDraft]: (c: Ctx, a: { episodeId: string }): ActionResult => {
    const d = c.need("clinical.review", "prepare report advice"); if (d) return d;
    if (!c.s.settings.aiDraftingOn) return c.fail("Prepare draft is switched off in Settings, AI Controls. Codes and manual advice still work.");
    const ep = c.ix().episodeById.get(a.episodeId);
    const why = notReviewable(c, ep); if (why) return c.fail(why);
    const prep = preparedDraftFor(c.s, ep!.id);
    if (!prep) return c.fail("No approved snippet matches this episode. Write the advice manually.");
    const existing = draftVersion(c.s, ep!.id);
    const lib = c.s.adviceLibrary;
    if (existing && existing.advice === prep.text && lib.prepared[ep!.id]?.reportVersionId === existing.id) {
      return c.ok("This draft is already prepared from the approved snippets. Review it, then tick Advice reviewed.", "info");
    }
    const setAdvice = resultsHandlers["review/setAdvice"];
    if (!setAdvice) return c.fail("Advice editing is not available in this build.");
    const r = setAdvice(c, { episodeId: ep!.id, text: prep.text });
    if (!r.ok) return r;
    c.inv();
    const draft = draftVersion(c.s, ep!.id);
    if (!draft) return c.fail("No draft report version to write into.");
    // Recorded as the drafting path. Changed advice is reviewed and previewed again before release.
    draft.adviceSource = "ai_draft_approved";
    draft.checklist.advice = false;
    draft.checklist.preview = false;
    const at = c.stamp();
    const by = c.persona().id as StaffId;
    lib.prepared[ep!.id] = { episodeId: ep!.id, reportVersionId: draft.id, at, by, opening: prep.opening, codes: prep.codes };
    for (const x of prep.codes) lib.uses.push({ episodeId: ep!.id, code: x.code, version: x.version, via: "prepared", at, by });
    c.emit({
      verb: "agent.drafted", actor: { kind: "agent", id: "drafting", label: "Clinical Drafting" },
      summary: `Clinical Drafting prepared advice for ${ep!.id} v${draft.version} from ${prep.codes.length} approved snippets (${prep.codes.map((x) => `${x.code} v${x.version}`).join(", ")}) and a personalised opening line, at ${c.first()}'s request. Draft only, review required. Nothing was released.`,
      entity: { kind: "episode", id: ep!.id }, programmeId: ep!.programmeId, personId: ep!.personId, restricted: true,
      publicSummary: "Advice draft prepared from approved snippets on a clinical episode", simulated: true,
    });
    return c.ok("Draft prepared from approved snippets. Review and edit it, then tick Advice reviewed in the release checklist.", "info");
  },

  [LIB.assignReporter]: (c: Ctx, a: { episodeId: string; reporter: ReporterId }): ActionResult => {
    const d = c.need("clinical.review", "assign reporters"); if (d) return d;
    if (!isReporterId(a.reporter)) return c.fail("Choose Dr Neil Reddy or Liz Bawle.");
    const ep = c.ix().episodeById.get(a.episodeId);
    if (!ep) return c.fail("Unknown episode.");
    if (ep.reportState !== "ready_for_review") return c.fail("Only an episode in the review queue can be assigned a reporter.");
    const name = staffName(c.s, a.reporter);
    if (reporterOf(c.s, ep) === a.reporter) return c.ok(`${ep.id} is already assigned to ${name}.`, "info");
    const fallback: ReporterId = ep.reviewAssigneeId === "liz" ? "liz" : "neil";
    if (a.reporter === fallback) delete c.s.adviceLibrary.reporters[ep.id];
    else c.s.adviceLibrary.reporters[ep.id] = a.reporter;
    const note = a.reporter === "liz" ? " Assignment only: the nursing lead role cannot edit advice or release in this build, so release stays with the clinical reviewer." : "";
    c.emit({
      verb: "review.reporter.assigned", summary: `${c.first()} assigned ${ep.id} to ${name} for reporting.${note}`,
      entity: { kind: "episode", id: ep.id }, programmeId: ep.programmeId,
    });
    return c.ok(`${ep.id} assigned to ${name}.${note}`, "ok");
  },
});

/** Typed action creators for the library. dispatch(libAct.approve("CHOL-HI")). */
export const libAct = {
  saveDraft: (code: string, text: string, note?: string) => ({ type: LIB.saveDraft, code, text, note }),
  discardDraft: (code: string) => ({ type: LIB.discardDraft, code }),
  approve: (code: string) => ({ type: LIB.approve, code }),
  retire: (code: string, reason: string) => ({ type: LIB.retire, code, reason }),
  recordUse: (episodeId: string, code: string, via: Via) => ({ type: LIB.recordUse, episodeId, code, via }),
  prepareDraft: (episodeId: string) => ({ type: LIB.prepareDraft, episodeId }),
  assignReporter: (episodeId: string, reporter: ReporterId) => ({ type: LIB.assignReporter, episodeId, reporter }),
};
