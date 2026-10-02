/* The one place state changes. reduce() clones the state, runs a handler on the clone and,
   if the handler fails, returns the original untouched. Components dispatch through the
   `act` creators, which keeps every action name and argument in one typed list. */
import type { CohortDef, PersonaId, PhState, StaffId, TeamId } from "./types";
import { Ctx } from "./actions/ctx";
import type { ActionResult, Handler } from "./actions/ctx";
import { resultsHandlers } from "./actions/results";
import { bookingHandlers } from "./actions/booking";
import { programmeHandlers } from "./actions/programmes";
import { coreHandlers } from "./actions/core";
import { invalidate } from "./selectors/core";
import type { MeasureKey } from "./capture";

export type Action = { type: string; [k: string]: unknown };

const HANDLERS: Record<string, Handler> = { ...coreHandlers, ...resultsHandlers, ...bookingHandlers, ...programmeHandlers };

/**
 * Let a page module add its own handlers without editing this file. Call it at import time and
 * dispatch the raw action: dispatch({ type: "mymodule/doThing", ... }). Handlers get the same
 * Ctx as the built-in ones and must be idempotent.
 */
export function registerHandlers(extra: Record<string, Handler>): void {
  Object.assign(HANDLERS, extra);
}

export function reduce(prev: PhState, action: Action): { state: PhState; result: ActionResult } {
  const handler = HANDLERS[action.type];
  if (!handler) return { state: prev, result: { ok: false, message: `Unknown action ${action.type}`, tone: "bad" } };
  const draft = structuredClone(prev) as PhState;
  const ctx = new Ctx(draft);
  let result: ActionResult;
  try {
    result = handler(ctx, action);
  } catch (e) {
    return { state: prev, result: { ok: false, message: "That action could not be completed.", tone: "bad" } };
  }
  invalidate(draft);
  if (!result.ok) return { state: prev, result };
  return { state: draft, result };
}

type Measures = Partial<Record<MeasureKey, { value: number | null; state: "recorded" | "missing" | "not_done" | "declined"; provenance?: "measured" | "self_reported" }>>;

/** Typed action creators. dispatch(act.releaseReport("PH-E-0101")). */
export const act = {
  /* session and settings */
  setPersona: (personaId: PersonaId) => ({ type: "session/setPersona", personaId }),
  setPortalPerson: (personId: string) => ({ type: "session/setPortalPerson", personId }),
  setClock: (preset: string) => ({ type: "session/setClock", preset }),
  toast: (tone: "ok" | "info" | "warn" | "bad", text: string) => ({ type: "ui/toast", tone, text }),
  dismissToast: (id: number) => ({ type: "ui/dismissToast", id }),
  setAiDrafting: (on: boolean) => ({ type: "settings/aiDrafting", on }),
  assignTeam: (staffId: StaffId, team: TeamId) => ({ type: "settings/assignTeam", staffId, team }),
  setGovernanceOwner: (id: string, owner: string) => ({ type: "governance/setOwner", id, owner }),
  completeTask: (taskId: string) => ({ type: "task/complete", taskId }),
  addTask: (title: string, ownerId: StaffId, dueAt: string | null) => ({ type: "task/add", title, ownerId, dueAt }),
  viewReportInPortal: (episodeId: string) => ({ type: "portal/viewReport", episodeId }),
  /* laboratory imports */
  loadSampleCsv: (batchId: string) => ({ type: "import/loadSample", batchId }),
  commitImportPreview: () => ({ type: "import/commitPreview" }),
  resolveRow: (rowId: string, episodeId: string, checks: string[], reason: string) => ({ type: "import/resolveRow", rowId, episodeId, checks, reason }),
  confirmUnit: (episodeId: string, reason: string) => ({ type: "import/confirmUnit", episodeId, reason }),
  acknowledgeDq: (id: string) => ({ type: "dq/acknowledge", id }),
  /* review, release, corrections */
  setAdvice: (episodeId: string, text: string) => ({ type: "review/setAdvice", episodeId, text }),
  toggleReviewCheck: (episodeId: string, key: "advice" | "preview" | "rereview") => ({ type: "review/toggleCheck", episodeId, key }),
  ackFlags: (episodeId: string) => ({ type: "review/ackFlags", episodeId }),
  aiDraft: (episodeId: string) => ({ type: "review/aiDraft", episodeId }),
  acceptAiDraft: (episodeId: string) => ({ type: "review/acceptAiDraft", episodeId }),
  releaseReport: (episodeId: string) => ({ type: "review/release", episodeId }),
  releaseRoutine: (episodeId: string) => ({ type: "review/releaseRoutine", episodeId }),
  startCorrection: (episodeId: string, reason: string) => ({ type: "correction/start", episodeId, reason }),
  releaseCorrection: (episodeId: string) => ({ type: "correction/release", episodeId }),
  /* follow-up and reminders */
  logAttempt: (followUpId: string, channel: "phone" | "sms" | "email", result: "no_answer" | "voicemail" | "spoke" | "wrong_number", note: string) => ({ type: "followup/attempt", followUpId, channel, result, note }),
  escalateFollowUp: (followUpId: string, note: string) => ({ type: "followup/escalate", followUpId, note }),
  closeFollowUp: (followUpId: string, outcomeCode: string, note: string, acknowledge: boolean) => ({ type: "followup/close", followUpId, outcomeCode, note, acknowledge }),
  retryReminder: (messageId: string) => ({ type: "reminder/retry", messageId }),
  /* portal and bookings */
  portalSaveDraft: (personId: string, sectionsDone?: number, answers?: Record<string, string | number | boolean>) => ({ type: "portal/saveDraft", personId, sectionsDone, answers }),
  portalComplete: (personId: string, consent: { service: boolean; data: boolean; sms?: boolean }) => ({ type: "portal/completeQuestionnaire", personId, consent }),
  createBooking: (personId: string, sessionId: string, slotStart: string) => ({ type: "booking/create", personId, sessionId, slotStart }),
  rescheduleBooking: (bookingId: string, sessionId: string, slotStart: string) => ({ type: "booking/reschedule", bookingId, sessionId, slotStart }),
  cancelBooking: (bookingId: string, reason?: string) => ({ type: "booking/cancel", bookingId, reason }),
  /* nurse workspace */
  checkIn: (bookingId: string) => ({ type: "clinic/checkIn", bookingId }),
  confirmIdentity: (bookingId: string, dob: string, reference: string) => ({ type: "clinic/confirmIdentity", bookingId, dob, reference }),
  saveCapture: (bookingId: string, baseRev: number, patch: { measures?: Measures; urine?: { protein: string; glucose: string; blood: string } | null; notes?: string }) => ({ type: "clinic/saveCapture", bookingId, baseRev, ...patch }),
  toggleChecklist: (bookingId: string, key: "specimens" | "labels" | "questionnaire") => ({ type: "clinic/toggleChecklist", bookingId, key }),
  completeAppointment: (bookingId: string) => ({ type: "clinic/complete", bookingId }),
  /* sessions and invitations */
  applySession: (sessionId: string, patch: { start?: string; end?: string; breaks?: Array<{ start: string; end: string }>; nurseId?: string; supportIds?: string[]; room?: string; date?: string }, moveImpacted = false) => ({ type: "session/apply", sessionId, patch, moveImpacted }),
  createCode: (programmeId: string, label: string, expiresOn: string, eligibility: string) => ({ type: "invite/createCode", programmeId, label, expiresOn, eligibility }),
  revokeCode: (codeId: string) => ({ type: "invite/revokeCode", codeId }),
  prepareInvitationDraft: (programmeId: string, title: string, recipientIds: string[], message: string) => ({ type: "invite/prepareDraft", programmeId, title, recipientIds, message }),
  decideInvitation: (draftId: string, approve: boolean, confirmedRecipientIds?: string[]) => ({ type: "invite/decide", draftId, approve, confirmedRecipientIds }),
  /* forms */
  createFormDraft: (templateId: string) => ({ type: "form/createDraft", templateId }),
  addFormBlock: (templateId: string, blockId: string) => ({ type: "form/addBlock", templateId, blockId }),
  removeFormBlock: (templateId: string, blockId: string) => ({ type: "form/removeBlock", templateId, blockId }),
  moveFormBlock: (templateId: string, blockId: string, dir: -1 | 1) => ({ type: "form/moveBlock", templateId, blockId, dir }),
  toggleBlockRequired: (templateId: string, blockId: string) => ({ type: "form/toggleRequired", templateId, blockId }),
  submitFormPublication: (templateId: string) => ({ type: "form/submitPublication", templateId }),
  decideFormPublication: (approvalId: string, approve: boolean) => ({ type: "form/decidePublication", approvalId, approve }),
  /* employer reporting */
  setCohort: (reportId: string, cohort: CohortDef) => ({ type: "report/setCohort", reportId, cohort }),
  useProgrammeLevel: (reportId: string) => ({ type: "report/useProgrammeLevel", reportId }),
  setNarrative: (reportId: string, text: string) => ({ type: "report/setNarrative", reportId, text }),
  draftNarrative: (reportId: string) => ({ type: "report/draftNarrative", reportId }),
  markReportReviewed: (reportId: string) => ({ type: "report/markReviewed", reportId }),
  approveReport: (reportId: string) => ({ type: "report/approve", reportId }),
  refreshSnapshot: (reportId: string) => ({ type: "report/refreshSnapshot", reportId }),
  createExport: (reportId: string, format: "pdf" | "pptx") => ({ type: "report/createExport", reportId, format }),
};
