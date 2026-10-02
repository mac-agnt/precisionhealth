/* Person timeline for Screening History: invitation, questionnaire and form version, bookings,
   appointment, measurements, calculations, specimens, observations, review, holds, report
   versions, report access, follow-up and messages. Every item carries its episode and
   programme, so one person can hold several episodes without programmes being merged.
   Clinical items are built only for a viewer who may see that episode's clinical content. */
import {
  ANALYTES, BP_REVIEW_LIMIT, FOLLOW_UP_OUTCOMES, HOLD_CATEGORY, HOLD_LABEL, bmiOf, fmtTime, fmtWeekdayDate, fmtWhen, ix, linkFor,
  staffName, versionsOf,
} from "../../model";
import type { Episode, Id, Iso, Measure, NavTarget, Observation, PhState, ProgrammeId } from "../../model";
import type { GlyphName, Tone } from "../../ui";
import { KIND_LABEL, holdReason } from "./shared";

export interface HistItem {
  id: string;
  at: Iso;
  icon: GlyphName;
  tone: Tone;
  title: string;
  detail: string;
  clinical: boolean;
  episodeId: Id | null;
  programmeId: ProgrammeId;
  target?: NavTarget;
}

function measureText(label: string, m: Measure, unit: string, decimals: number): string {
  if (m.state === "recorded" && m.value != null) return `${label} ${m.value.toFixed(decimals)} ${unit}`;
  return `${label} ${m.state === "not_done" ? "not done" : m.state === "declined" ? "declined" : "not recorded"}`;
}

export function observationText(o: Observation): string {
  const a = ANALYTES[o.code];
  const v = o.value.toFixed(a.decimals);
  if (o.unitDiscrepancy && !o.unitDiscrepancy.confirmed) return `${a.name} ${o.value} ${o.unit} as received (template unit ${o.unitDiscrepancy.expectedUnit}, awaiting laboratory confirmation)`;
  const conv = o.original && o.unitDiscrepancy?.confirmed ? `, converted from ${o.original.value} ${o.original.unit} as received` : "";
  return `${a.name} ${v} ${o.unit} (displayed limit ${o.limitText}${o.flag === "review_required" ? ", review required" : ""})${conv}`;
}

/**
 * Build the timeline for one person. canSee(episodeId) says whether the viewer may see that
 * episode's clinical content. Non-clinical viewers get workflow wording instead of reasons.
 */
export function buildHistory(state: PhState, personId: Id, canSee: (episodeId: Id) => boolean): HistItem[] {
  const I = ix(state);
  const out: HistItem[] = [];
  const push = (x: Omit<HistItem, "id">) => out.push({ ...x, id: `${x.at}|${out.length}` });
  const now = state.clock.nowUtc;
  const tplName = (id: string) => state.forms.templates.find((t) => t.id === id)?.name || id;

  for (const m of I.membershipsByPerson.get(personId) || []) {
    const code = state.invitationCodes.find((c) => c.id === m.inviteCodeId);
    push({ at: m.invitedAt, icon: "mail", tone: "neutral", title: `Invited to ${I.programmeById.get(m.programmeId)?.name}`, detail: `Invitation code ${code ? code.code : "not recorded"}. Codes are created centrally. Invited is not booked.`, clinical: false, episodeId: null, programmeId: m.programmeId });
  }

  const bookings = (I.bookingsByPerson.get(personId) || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  if (bookings.length) {
    const first = bookings.reduce((x, b) => (b.questionnaireCompletedAt < x.questionnaireCompletedAt ? b : x), bookings[0]);
    push({ at: first.questionnaireCompletedAt, icon: "edit", tone: "neutral", title: "Questionnaire and consent completed", detail: `Form ${tplName(first.formTemplateId)} version ${first.formVersion}, consent ${first.consentVersion}. Completed before any booking was confirmed.`, clinical: false, episodeId: null, programmeId: first.programmeId });
  }
  for (const b of bookings) {
    const s = I.sessionById.get(b.sessionId)!;
    const later = b.status === "cancelled" ? (b.replacedBy ? ` Later rescheduled to ${b.replacedBy}; the replacement was reserved first.` : ` Later cancelled${b.cancelReason ? ` (${b.cancelReason})` : ""}; the slot was released.`) : "";
    push({
      at: b.createdAt, icon: "calendar", tone: b.status === "cancelled" ? "neutral" : "brand", title: b.replaces ? "Booking rescheduled" : "Booking confirmed",
      detail: `${b.id}: ${fmtWeekdayDate(s.date)} at ${b.slotStart}, ${s.siteName}. Booked via ${b.createdVia}.${later}`, clinical: false, episodeId: b.episodeId, programmeId: b.programmeId, target: linkFor("booking", b.id),
    });
  }

  for (const e of I.episodesByPerson.get(personId) || []) addEpisode(state, e, canSee(e.id), push, tplName, now);

  for (const m of state.messages.filter((x) => x.personId === personId)) {
    push({
      at: m.at, icon: m.channel === "sms" ? "sms" : "mail", tone: m.status === "failed" ? "bad" : "neutral", title: `${KIND_LABEL[m.kind]} ${m.status}`,
      detail: `${m.channel === "sms" ? "SMS via Esendex" : "Email"} to the verified destination ${m.destination}. ${m.attempts.length} provider attempt${m.attempts.length === 1 ? "" : "s"}. Simulated.${m.kind === "report_available" ? " The message carries no results." : ""}`,
      clinical: false, episodeId: m.episodeId, programmeId: I.personById.get(personId)!.programmeId, target: linkFor("message", m.id),
    });
  }

  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}

function addEpisode(state: PhState, e: Episode, canSee: boolean, push: (x: Omit<HistItem, "id">) => void, tplName: (id: string) => string, now: Iso) {
  const I = ix(state);
  const b = I.bookingById.get(e.bookingId);
  const s = I.sessionById.get(e.sessionId)!;
  const base = { episodeId: e.id, programmeId: e.programmeId };
  const epTarget = canSee ? linkFor("episode", e.id) : undefined;
  const cap = e.capture;

  push({
    ...base, at: cap.checkedInAt || e.collectedAt, icon: "check", tone: "ok", title: "Appointment attended",
    detail: `${fmtWeekdayDate(s.date)} at ${b?.slotStart || fmtTime(e.collectedAt)}, ${s.siteName}, nurse ${staffName(state, s.nurseId)}. Identity confirmed with two identifiers. Form snapshot ${tplName(e.formSnapshot.templateId)} version ${e.formSnapshot.version}, kept for this episode even if the template changes.`,
    clinical: false, target: epTarget,
  });

  if (canSee) {
    const m = cap.measures;
    const bp = m.bpSys.state === "recorded" && m.bpDia.state === "recorded" ? `blood pressure ${m.bpSys.value}/${m.bpDia.value} mmHg` : "blood pressure not recorded";
    const bpFlag = (m.bpSys.value ?? 0) >= BP_REVIEW_LIMIT.sys || (m.bpDia.value ?? 0) >= BP_REVIEW_LIMIT.dia;
    push({
      ...base, at: cap.completedAt || e.collectedAt, icon: "heart", tone: bpFlag ? "warn" : "neutral", title: "Nurse measurements recorded",
      detail: [measureText("Height", m.heightM, "m", 2) + (m.heightM.provenance === "self_reported" ? " (self-reported)" : ""), measureText("weight", m.weightKg, "kg", 1), measureText("waist", m.waistCm, "cm", 0), bp + (bpFlag ? ` (displayed limit ${BP_REVIEW_LIMIT.text}, review required)` : ""), measureText("pulse", m.pulse, "bpm", 0)].join(", ") + ".",
      clinical: true, target: epTarget,
    });
    const bmi = bmiOf(cap);
    push({
      ...base, at: cap.completedAt || e.collectedAt, icon: "chart", tone: "neutral", title: bmi != null ? `BMI calculated: ${bmi.toFixed(1)} kg/m²` : "BMI not calculated",
      detail: bmi != null ? "Calculated from the recorded height and weight, never typed. QRISK3 needs an approved integration and is not calculated." : "Height or weight was not recorded, so no BMI is shown. A missing value is never treated as zero.",
      clinical: true, target: epTarget,
    });
    for (const sp of state.specimens.filter((x) => x.episodeId === e.id)) {
      push({ ...base, at: sp.collectedAt, icon: "flask", tone: "neutral", title: `Specimen ${sp.id} collected`, detail: `${sp.type === "serum" ? "Serum" : sp.type === "edta" ? "EDTA" : "Urine"} specimen, label ${sp.labelPrinted ? "printed" : "not printed"}. Status: ${sp.status}.`, clinical: true, target: epTarget });
    }
    const obs = (I.obsByEpisode.get(e.id) || []).slice().sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1));
    const groups = new Map<string, Observation[]>();
    for (const o of obs) {
      const key = o.version > 1 ? `v|${o.id}` : `${o.source.kind === "batch" ? o.source.batchId : "clinic"}|${o.recordedAt.slice(0, 16)}`;
      const g = groups.get(key);
      if (g) g.push(o); else groups.set(key, [o]);
    }
    for (const [key, g] of groups) {
      const flagged = g.some((o) => o.flag === "review_required" || (o.unitDiscrepancy && !o.unitDiscrepancy.confirmed));
      const src = g[0].source;
      push({
        ...base, at: g[0].recordedAt, icon: "flask", tone: flagged ? "warn" : "neutral",
        title: key.startsWith("v|") ? `Source unit confirmed: ${ANALYTES[g[0].code].name}` : `Results received${src.kind === "batch" ? ` from ${src.batchId}` : ""}`,
        detail: g.map(observationText).join("; ") + ".", clinical: true, target: epTarget,
      });
    }
  }

  if (e.readyAt && e.reportState !== "awaiting_results") {
    push({ ...base, at: e.readyAt, icon: "eye", tone: "info", title: "Ready for clinician review", detail: `All expected results accounted for. Assigned to ${staffName(state, e.reviewAssigneeId || "neil")}. Every report is reviewed individually.`, clinical: false, target: epTarget });
  }
  if (e.hold) {
    const cat = HOLD_CATEGORY[e.hold.kind];
    if (canSee) push({ ...base, at: e.hold.since, icon: "alert", tone: "warn", title: `On hold: ${HOLD_LABEL[e.hold.kind]}`, detail: holdReason(e), clinical: true, target: epTarget });
    else push({ ...base, at: e.hold.since, icon: cat === "clinical_action" ? "lock" : "alert", tone: cat === "clinical_action" ? "neutral" : "warn", title: cat === "clinical_action" ? "Clinical action assigned" : cat === "data_quality" ? "Held for a data quality check" : "Held for an identity exception", detail: cat === "clinical_action" ? "A clinician owns this item. No clinical detail is shown to this role." : "The report cannot move to review until this is resolved.", clinical: false });
  }

  for (const v of versionsOf(state, e.id)) {
    if (v.status === "draft" || v.status === "in_review") {
      if (canSee) push({ ...base, at: v.createdAt, icon: "edit", tone: "info", title: `Report v${v.version} ${v.correctionReason ? "correction" : "draft"} in review`, detail: v.correctionReason ? `Reason: ${v.correctionReason} The released version stays unchanged until this one is re-reviewed and released.` : "Advice and release checklist in progress. Not visible to the participant.", clinical: true, target: epTarget });
      continue;
    }
    if (v.releasedAt) {
      const reason = v.correctionReason ? (canSee ? ` Correction reason: ${v.correctionReason}` : " Correction. The reason is visible to clinical roles.") : "";
      push({
        ...base, at: v.releasedAt, icon: "file", tone: v.status === "superseded" ? "neutral" : "ok", title: `Report v${v.version} released${v.status === "superseded" ? " (since superseded)" : ""}`,
        detail: `Released by ${staffName(state, v.releasedBy)}${v.releaseMode ? `, ${v.releaseMode === "routine" ? "routine release" : "individual review"}` : ""}.${v.supersedes ? ` Supersedes ${v.supersedes}, which is kept in the history.` : ""}${v.supersededBy ? ` Superseded by ${v.supersededBy}.` : ""}${reason}`,
        clinical: false, target: epTarget,
      });
    }
    if (v.participantNoticeAt && v.supersedes) push({ ...base, at: v.participantNoticeAt, icon: "send", tone: "neutral", title: `Participant told about v${v.version}`, detail: "Simulated notice without results. The earlier version stays in the portal history, marked superseded.", clinical: false });
    if (v.accessedAt) push({ ...base, at: v.accessedAt, icon: "eye", tone: "brand", title: `Report v${v.version} opened in the portal`, detail: "Report access is recorded separately from message delivery.", clinical: false });
  }

  if (canSee) {
    for (const f of I.followUpsByEpisode.get(e.id) || []) {
      const assigned = e.hold?.followUpId === f.id ? e.hold.since : f.dueAt;
      push({ ...base, at: assigned, icon: "flag", tone: f.status === "open" ? "warn" : "neutral", title: `Follow-up ${f.id}: ${f.kind === "urgent_clinical_contact" ? "urgent clinical contact" : "routine call-back"}`, detail: `Owner ${staffName(state, f.ownerId)}, due ${fmtWhen(f.dueAt, now)}. ${f.note}`, clinical: true, target: linkFor("followup", f.id) });
      f.attempts.forEach((a, i) => push({ ...base, at: a.at, icon: "phone", tone: "neutral", title: `Contact attempt ${i + 1} on ${f.id}`, detail: `${a.channel}, ${a.result.replace("_", " ")}${a.note ? `: ${a.note}` : ""}. An attempt does not close the follow-up.`, clinical: true, target: linkFor("followup", f.id) }));
      f.escalations.forEach((x) => push({ ...base, at: x.at, icon: "up", tone: "warn", title: `${f.id} escalated`, detail: x.note, clinical: true, target: linkFor("followup", f.id) }));
      if (f.outcome) push({ ...base, at: f.outcome.at, icon: "check", tone: "ok", title: `${f.id} closed with a documented outcome`, detail: `${FOLLOW_UP_OUTCOMES.find((o) => o.code === f.outcome!.code)?.label || f.outcome.code}. ${f.outcome.note} Acknowledged by ${staffName(state, f.outcome.acknowledgedBy)}.`, clinical: true, target: linkFor("followup", f.id) });
    }
  }
}
