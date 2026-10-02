/* Communications selectors local to the Participants module. Counts come from the shared
   message records: logical reminders and provider attempts are kept apart, and report access
   is read from the report version, never from a delivery receipt. */
import { PROGRAMME_ORDER, fmtWeekdayDate, ix, memo, today } from "../../model";
import type { Booking, Message, MessageKind, PhState, ProgrammeId, ReportVersion } from "../../model";

export type CommsFilter = "all" | "reminders" | "failed" | "confirmation" | "report_available" | "invitation";
export const COMMS_FILTERS: Array<{ id: CommsFilter; label: string }> = [
  { id: "all", label: "All messages" },
  { id: "reminders", label: "Today's reminders" },
  { id: "failed", label: "Failed" },
  { id: "confirmation", label: "Confirmations" },
  { id: "report_available", label: "Report available" },
  { id: "invitation", label: "Invitations" },
];
export const isCommsFilter = (v: string | undefined): v is CommsFilter => !!v && COMMS_FILTERS.some((f) => f.id === v);

export function matchesFilter(state: PhState, m: Message, f: CommsFilter): boolean {
  switch (f) {
    case "all": return true;
    case "reminders": return m.kind === "reminder" && m.cohort === today(state);
    case "failed": return m.status === "failed";
    default: return m.kind === (f as MessageKind);
  }
}

/** The report version a report-available message announces. */
export function versionForMessage(state: PhState, m: Message): ReportVersion | null {
  if (m.kind !== "report_available") return null;
  const id = m.logicalId.replace(/^LM-A-/, "");
  return state.reportVersions.find((v) => v.id === id) || null;
}

/**
 * The text a participant would read. It is built from logistics only: date, time, site and
 * reference. Clinical details never appear in a subject or preview.
 */
export function messagePreview(state: PhState, m: Message): string {
  const I = ix(state);
  const b = m.bookingId ? I.bookingById.get(m.bookingId) : undefined;
  const s = b ? I.sessionById.get(b.sessionId) : undefined;
  const when = b && s ? `${fmtWeekdayDate(s.date)} at ${b.slotStart}, ${s.siteName}` : "";
  switch (m.kind) {
    case "confirmation":
      return /rescheduled|changed/i.test(m.subject)
        ? `Your Precision Health appointment is now ${when}. Reference ${b?.id ?? ""}. Your previous time has been released. Manage it in the portal.`
        : `Your Precision Health appointment is confirmed for ${when}. Reference ${b?.id ?? ""}. You can change it in the portal.`;
    case "reminder":
      return `Reminder: your Precision Health appointment is ${when}. Reference ${b?.id ?? ""}. Change it in the portal if you cannot attend.`;
    case "report_available":
      return "A document is ready in your Precision Health portal. Sign in to view it. This message does not contain any results.";
    case "invitation": {
      const draft = state.invitationDrafts.find((d) => d.status === "approved_simulated_sent" && d.recipientIds.includes(m.personId));
      return draft ? draft.message : "You are invited to a Precision Health screening session. Complete the questionnaire and consent in the portal, then choose a slot.";
    }
  }
}

export function attemptText(m: Message, i: number): string {
  const a = m.attempts[i];
  const kind = i === 0 ? "First send" : a.auto ? "Automatic retry" : "Manual retry";
  return `${kind}: ${a.outcome === "delivered" ? "delivered" : "failed"}${a.reason ? `. ${a.reason}` : ""}`;
}

export const lastFailureReason = (m: Message): string | null => {
  for (let i = m.attempts.length - 1; i >= 0; i--) if (m.attempts[i].outcome === "failed" && m.attempts[i].reason) return m.attempts[i].reason;
  return null;
};

/** Today's reminders resolved by a manual retry in this session, kept visible as history. */
export function retriedReminders(state: PhState): Message[] {
  const c = today(state);
  return state.messages.filter((m) => m.kind === "reminder" && m.cohort === c && m.status === "delivered" && m.attempts.some((a, i) => i > 0 && !a.auto));
}

/** Delivered and failed logical reminders per programme for a cohort date. */
export function cohortByProgramme(state: PhState, cohort?: string) {
  const c = cohort || today(state);
  return memo(state, "pd-cohort:" + c, () => {
    const I = ix(state);
    const rows = PROGRAMME_ORDER.map((id) => ({ id, name: I.programmeById.get(id)?.name || id, code: I.programmeById.get(id)?.clientName || id, logical: 0, delivered: 0, failed: 0 }));
    const by = new Map<ProgrammeId, (typeof rows)[number]>(rows.map((r) => [r.id, r]));
    for (const m of state.messages) {
      if (m.kind !== "reminder" || m.cohort !== c || !m.bookingId) continue;
      const b = I.bookingById.get(m.bookingId);
      const r = b ? by.get(b.programmeId) : undefined;
      if (!r) continue;
      r.logical++;
      if (m.status === "delivered") r.delivered++;
      if (m.status === "failed") r.failed++;
    }
    return rows;
  });
}

/**
 * Today's confirmed bookings that have no reminder in the cohort: bookings made inside 24 hours
 * of the clinic get one confirmation and no back-dated reminder.
 */
export function shortNoticeBookings(state: PhState): Booking[] {
  return memo(state, "pd-short", () => {
    const I = ix(state);
    const t = today(state);
    const withReminder = new Set(state.messages.filter((m) => m.kind === "reminder" && m.cohort === t && m.bookingId).map((m) => m.bookingId as string));
    return state.bookings.filter((b) => b.status === "confirmed" && I.sessionById.get(b.sessionId)?.date === t && !withReminder.has(b.id));
  });
}

export function messageCounts(state: PhState, list: Message[]): Record<CommsFilter, number> {
  const out = { all: 0, reminders: 0, failed: 0, confirmation: 0, report_available: 0, invitation: 0 } as Record<CommsFilter, number>;
  for (const m of list) for (const f of COMMS_FILTERS) if (matchesFilter(state, m, f.id)) out[f.id]++;
  return out;
}
