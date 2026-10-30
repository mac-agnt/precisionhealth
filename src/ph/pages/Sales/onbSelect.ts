/* Onboarding and retention selectors: pure functions over PhState that read the sales, programme
   and onboarding slices. Used by the pages, the handlers and tools/verify-onboarding.mjs. */
import {
  ONB_DOC_TEMPLATES, ONB_TEAM, RET_DEFAULT_TEMPLATES, onbBlankDetails, ohMergeParagraph, persona, programmeCounts, retCompanyKey, retMerge,
  salesAllEngagements, salesRecalls, salesShiftMonths, today, daysBetween, fmtDateLong,
} from "../../model";
import type {
  LocalDate, OhDocPart, OnbDetails, OnbDocKind, OnbKind, Onboarding, PhState, ProgrammeId, RetContact, RetTemplateId, SalesLead, SalesRecall,
} from "../../model";

/** 26 November 2026, without the weekday. */
export const longDate = (d: string) => fmtDateLong(d).replace(/^[A-Za-z]+day /, "");

/* ---------------------------------------------------------------- onboarding */

export const onbById = (s: PhState, id: string | undefined) => (id ? s.onboarding.onboardings.find((o) => o.id === id) : undefined);
export const onbForLead = (s: PhState, leadId: string) => s.onboarding.onboardings.find((o) => o.leadId === leadId);

/** Won leads that have no onboarding yet. */
export function onbWonLeads(s: PhState): SalesLead[] {
  return s.sales.leads.filter((l) => l.stage === "won" && !onbForLead(s, l.id));
}

/** Occupational health when the lead asked for it, otherwise wellness (screening, flu, talks). */
export const onbSuggestedKind = (lead: SalesLead): OnbKind => (lead.services.includes("occupational_health") ? "oh" : "wellness");

const WELLNESS_FROM_LEAD: Record<string, string> = {
  health_screening: "Health screening days", flu: "Flu vaccination clinics", wellness_talk: "Wellness talks", executive: "Executive health assessments",
};

/** Details prefilled from a lead. HR contact is the lead contact when their role is HR or people. */
export function onbPrefill(lead: SalesLead | undefined, kind: OnbKind): OnbDetails {
  const d = onbBlankDetails();
  if (!lead) return d;
  const c = lead.contact;
  const role = c.role.replace(/\s*\(fictional\)/, "");
  d.companyName = lead.company;
  d.main = { name: c.name, email: c.email, phone: c.phone };
  if (/hr|people|wellbeing|welfare|human/i.test(role)) d.hr = { name: c.name, email: c.email, phone: c.phone };
  if (lead.invoiceName || lead.invoiceEmail) d.finance = { name: lead.invoiceName || "", email: lead.invoiceEmail || "", phone: "" };
  if (lead.qualifier.headcount) d.headcount = String(lead.qualifier.headcount);
  if (lead.qualifier.sites) d.sites = `${lead.qualifier.sites} site${lead.qualifier.sites === 1 ? "" : "s"}`;
  if (kind === "oh") {
    d.services = lead.services.includes("occupational_health") ? ["Pre-employment medicals", "Management referrals"] : [];
    d.referralManager = { name: c.name, email: c.email, phone: "" };
  } else {
    d.services = Array.from(new Set(lead.services.map((x) => WELLNESS_FROM_LEAD[x]).filter(Boolean)));
  }
  return d;
}

export interface OnbRenderedDoc { title: string; clientName: string; version: number; sections: Array<{ heading: string; paragraphs: OhDocPart[][] }> }
export function onbRenderDoc(o: Onboarding, kind: OnbDocKind): OnbRenderedDoc | null {
  const doc = o.docs[kind];
  if (!doc) return null;
  return {
    title: kind === "dsa" ? "Data Sharing Agreement" : "Service Level Agreement", clientName: doc.merged.clientName, version: doc.version,
    sections: ONB_DOC_TEMPLATES[kind].map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map((p) => ohMergeParagraph(p, doc.merged)) })),
  };
}

export const onbInvoiceDestination = (d: OnbDetails) => (d.invoiceTo === "ap_email" ? d.apEmail : "the client portal");

/* ---------------------------------------------------------------- email rendering */

export const senderName = (s: PhState) => { const p = persona(s); return p.isParticipant ? "Stephen Kelly" : p.name; };
export const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

export function retRender(s: PhState, id: RetTemplateId, values: Record<string, string>): { subject: string; body: string } {
  const t = s.onboarding.templates[id] || { ...RET_DEFAULT_TEMPLATES[id] };
  const v = { sender_name: senderName(s), ...values };
  return { subject: retMerge(t.subject, v), body: retMerge(t.body, v) };
}

export function onbWelcomeValues(s: PhState, o: Onboarding): Record<string, string> {
  const d = o.details;
  return { company: d.companyName, contact_first_name: firstName(d.main.name), contact_name: d.main.name, team_name: ONB_TEAM[o.kind].name, invoice_destination: onbInvoiceDestination(d), sender_name: senderName(s) };
}

/* ---------------------------------------------------------------- client contacts */

export interface RetClient {
  key: string;
  company: string;
  /** Contact on record from the latest engagement or programme. */
  base: RetContact;
  /** Who reminders go to now; null when the contact left and no one has been chosen. */
  current: RetContact | null;
  left: Array<{ name: string; email: string; leftOn: LocalDate }>;
}

function baseContacts(s: PhState): Map<string, { company: string; base: RetContact }> {
  const out = new Map<string, { company: string; base: RetContact }>();
  const latest = new Map<string, { screenedOn: string; company: string; base: RetContact }>();
  for (const e of salesAllEngagements(s)) {
    const k = retCompanyKey(e.company);
    const cur = latest.get(k);
    if (cur && cur.screenedOn >= e.screenedOn) continue;
    let role = "HR contact";
    if (e.programmeId) {
      const p = s.programmes.find((x) => x.id === e.programmeId);
      const ct = s.contacts.find((c) => c.companyId === p?.clientId);
      if (ct) role = ct.role;
    }
    latest.set(k, { screenedOn: e.screenedOn, company: e.company, base: { name: e.contactName, email: e.contactEmail, role: role.replace(/\s*\(fictional\)/, "") } });
  }
  for (const [k, v] of latest) out.set(k, { company: v.company, base: v.base });
  return out;
}

export function retClients(s: PhState): RetClient[] {
  const out: RetClient[] = [];
  for (const [key, { company, base }] of baseContacts(s)) {
    const ch = s.onboarding.contactChanges[key];
    const left = ch ? ch.left : [];
    const baseLeft = left.some((x) => x.email.toLowerCase() === base.email.toLowerCase());
    const current = ch ? ch.current : baseLeft ? null : base;
    out.push({ key, company, base, current, left });
  }
  return out.sort((a, b) => a.company.localeCompare(b.company));
}
export const retClientFor = (s: PhState, company: string) => retClients(s).find((c) => c.key === retCompanyKey(company));

/* ---------------------------------------------------------------- results out (on release) */

export interface RetReleaseItem {
  programmeId: ProgrammeId;
  programme: string;
  company: string;
  released: number;
  alreadyTold: number;
  newReports: number;
  contact: RetContact | null;
}

/** Programmes with released reports the client has not yet been told about. */
export function retReleaseQueue(s: PhState): RetReleaseItem[] {
  const out: RetReleaseItem[] = [];
  for (const p of s.programmes) {
    const released = programmeCounts(s, p.id).released;
    const told = s.onboarding.releaseNotified[p.id] || 0;
    if (released <= told) continue;
    out.push({ programmeId: p.id, programme: p.name, company: p.clientName, released, alreadyTold: told, newReports: released - told, contact: retClientFor(s, p.clientName)?.current || null });
  }
  return out;
}
export function retReleaseValues(s: PhState, it: RetReleaseItem): Record<string, string> {
  const p = s.programmes.find((x) => x.id === it.programmeId);
  return {
    company: it.company, contact_first_name: it.contact ? firstName(it.contact.name) : "there", contact_name: it.contact?.name || "",
    programme: it.programme, reports_released: String(it.released), feedback_link: `precisionhealth.ie/feedback/${(p?.code || "DEMO").toLowerCase()}`,
    invoice_destination: "your accounts team", sender_name: senderName(s),
  };
}

/* ---------------------------------------------------------------- rebooking reminders */

/** Neil and Stephen's rule: the rebooking reminder goes three months before the anniversary. */
export const RET_REMINDER_MONTHS = 3;

export type RetReminderState = "sent" | "due" | "scheduled" | "no_contact";
export interface RetReminder {
  recall: SalesRecall;
  dueOn: LocalDate;
  daysToDue: number;
  state: RetReminderState;
  contact: RetContact | null;
  emailId: string | null;
}

/** One reminder per client recall, for clients who have not already rebooked or started talking to us. */
export function retReminders(s: PhState): RetReminder[] {
  const t = today(s);
  const out: RetReminder[] = [];
  for (const r of salesRecalls(s)) {
    if (r.status === "rebooked" || r.status === "in_pipeline" || r.lapsed) continue;
    const dueOn = salesShiftMonths(r.recallOn, -RET_REMINDER_MONTHS);
    const emailId = s.onboarding.rebookSent[r.id] || null;
    const contact = retClientFor(s, r.company)?.current || null;
    const state: RetReminderState = emailId ? "sent" : !contact ? "no_contact" : dueOn <= t ? "due" : "scheduled";
    out.push({ recall: r, dueOn, daysToDue: daysBetween(t, dueOn), state, contact, emailId });
  }
  const rank: Record<RetReminderState, number> = { no_contact: 0, due: 1, scheduled: 2, sent: 3 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === "sent" ? (a.dueOn < b.dueOn ? 1 : -1) : a.dueOn < b.dueOn ? -1 : 1));
}
export function retReminderValues(s: PhState, r: RetReminder): Record<string, string> {
  return {
    company: r.recall.company, contact_first_name: r.contact ? firstName(r.contact.name) : "there", contact_name: r.contact?.name || "",
    last_screened: longDate(r.recall.screenedOn), anniversary: longDate(r.recall.recallOn), sender_name: senderName(s),
  };
}

/* ---------------------------------------------------------------- rebooking rate */

export interface RetRateRow { company: string; screenedOn: LocalDate; anniversary: LocalDate; rebooked: boolean; how: string }
export interface RetRate { year: number; base: number; rebooked: number; pct: number; rows: RetRateRow[] }

/**
 * Of the clients screened last calendar year, how many have booked again: a later screening or
 * programme, or a won lead received after that screening.
 */
export function retRebookingRate(s: PhState): RetRate {
  const year = Number(today(s).slice(0, 4)) - 1;
  const all = salesAllEngagements(s);
  const firstLastYear = new Map<string, { company: string; screenedOn: LocalDate }>();
  for (const e of all) {
    if (!e.screenedOn.startsWith(String(year))) continue;
    const k = retCompanyKey(e.company);
    const cur = firstLastYear.get(k);
    if (!cur || e.screenedOn > cur.screenedOn) firstLastYear.set(k, { company: e.company, screenedOn: e.screenedOn });
  }
  const rows: RetRateRow[] = [];
  for (const [k, v] of firstLastYear) {
    const later = all.filter((e) => retCompanyKey(e.company) === k && e.screenedOn > v.screenedOn).sort((a, b) => (a.screenedOn < b.screenedOn ? -1 : 1))[0];
    const won = s.sales.leads.find((l) => retCompanyKey(l.company) === k && l.stage === "won" && l.receivedOn >= v.screenedOn);
    const how = later ? `Screened again ${longDate(later.screenedOn)}` : won ? `Rebooked, lead ${won.id} won` : "";
    rows.push({ company: v.company, screenedOn: v.screenedOn, anniversary: salesShiftMonths(v.screenedOn, 12), rebooked: !!how, how });
  }
  rows.sort((a, b) => Number(b.rebooked) - Number(a.rebooked) || a.company.localeCompare(b.company));
  const rebooked = rows.filter((r) => r.rebooked).length;
  return { year, base: rows.length, rebooked, pct: rows.length ? Math.round((rebooked / rows.length) * 100) : 0, rows };
}
