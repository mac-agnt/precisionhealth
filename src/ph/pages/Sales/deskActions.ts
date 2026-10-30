/* Sales desk actions, registered at import time: contacts at a company, targets, the Today list
   (done, snooze, reschedule), bulk actions on the pipeline list, agent-drafted emails, booking a
   meeting into the calendar, and the follow-up sequence template. Where a step already has a
   handler (send a follow up, move a calendar item, send a rebooking email) the desk runs that
   handler inside the same change, so everything stays in one place and in one history.
   Emails are simulated. Stephen owns sales; others see the desk read only. */
import "../Calendar/schedActions";
import "./flowActions";
import "./onbActions";
import "./actions";
import {
  DESK_ROLE_LABEL, SALES_STAGE_LABEL, addDays, deskExpiring, deskFollowUps, deskNextBest, deskNextWorkday, deskToday, fmtDate, salesRecalls, fmtWeekdayDate, handlerFor, localDateOf, registerHandlers, salesRights,
} from "../../model";
import type { ActionResult, Ctx, DeskEmailPurpose, DeskRole, SalesSeqStep, SalesStage, StaffId } from "../../model";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

function needManage(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (salesRights(p).manage) return null;
  return c.fail(`${p.name} cannot ${what}. Stephen Kelly owns sales: switch to Stephen from the avatar menu.`);
}
const leadOf = (c: Ctx, id: string) => c.s.sales.leads.find((l) => l.id === id);
const today = (c: Ctx) => localDateOf(c.now);
function run(c: Ctx, type: string, a: Record<string, unknown>): ActionResult {
  const h = handlerFor(type);
  if (!h) return c.fail("That step is not available yet. Open the page once and try again.");
  return h(c, { type, ...a });
}

registerHandlers({
  /* ---------------------------------------------------------------- contacts */
  "desk/addContact": (c, a: { leadId: string; name: string; title: string; email: string; phone?: string; role: DeskRole; primary?: boolean }) => {
    const d = needManage(c, "add contacts"); if (d) return d;
    const lead = leadOf(c, a.leadId); if (!lead) return c.fail("Unknown lead.");
    const name = String(a.name || "").trim();
    const email = String(a.email || "").trim();
    if (name.length < 2) return c.fail("Add the contact's name.");
    if (!EMAIL.test(email)) return c.fail("Add a valid email address.");
    if (!DESK_ROLE_LABEL[a.role]) return c.fail("Choose their role in the deal.");
    const desk = c.s.salesDesk;
    if (lead.contact.email.toLowerCase() === email.toLowerCase() || desk.contacts.some((x) => x.leadId === lead.id && x.email.toLowerCase() === email.toLowerCase())) return c.fail("That person is already on this deal.");
    desk.seq.contact += 1;
    const id = `CT-${pad(desk.seq.contact, 3)}`;
    desk.contacts.push({ id, leadId: lead.id, name, title: String(a.title || "").trim() || "Contact", email, phone: String(a.phone || "").trim(), role: a.role, left: false, leftOn: null });
    lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: ${name} (${DESK_ROLE_LABEL[a.role].toLowerCase()}) added as a contact.` });
    if (a.primary) {
      const r = swapPrimary(c, lead.id, id);
      if (!r.ok) return r;
    }
    c.emit({ verb: "sales.contact_added", summary: `${c.first()} added ${name} as a contact at ${lead.company}.` });
    return c.ok(`${name} added to ${lead.company}${a.primary ? " as the main contact" : ""}.`, "ok", id);
  },
  "desk/contactLeft": (c, a: { leadId: string; key: string; left: boolean }) => {
    const d = needManage(c, "update contacts"); if (d) return d;
    const lead = leadOf(c, a.leadId); if (!lead) return c.fail("Unknown lead.");
    const desk = c.s.salesDesk;
    const t = today(c);
    let name = lead.contact.name;
    if (a.key === `${lead.id}:main`) {
      if (a.left) desk.primaryLeft[lead.id] = t; else delete desk.primaryLeft[lead.id];
    } else {
      const ct = desk.contacts.find((x) => x.id === a.key && x.leadId === lead.id);
      if (!ct) return c.fail("Unknown contact.");
      ct.left = !!a.left; ct.leftOn = a.left ? t : null; name = ct.name;
    }
    lead.history.push({ at: c.stamp(), by: c.persona().id, text: a.left ? `Note: ${name} has left ${lead.company}.` : `Note: ${name} is back at ${lead.company}.` });
    c.emit({ verb: "sales.contact_left", summary: `${c.first()} marked ${name} at ${lead.company} as ${a.left ? "left the company" : "still there"}.` });
    return c.ok(a.left ? `${name} marked as left. Make someone else the main contact.` : `${name} marked as still at ${lead.company}.`, "info");
  },
  "desk/makePrimary": (c, a: { leadId: string; contactId: string }) => {
    const d = needManage(c, "change the main contact"); if (d) return d;
    return swapPrimary(c, a.leadId, a.contactId);
  },

  /* ---------------------------------------------------------------- targets */
  "desk/setTarget": (c, a: { month: string; amount: number }) => {
    const d = needManage(c, "set sales targets"); if (d) return d;
    if (!/^\d{4}-\d{2}$/.test(String(a.month))) return c.fail("Choose a month.");
    const n = Math.round(Number(a.amount));
    if (!Number.isFinite(n) || n < 1000 || n > 1000000) return c.fail("Enter a monthly target between €1,000 and €1,000,000.");
    c.s.salesDesk.targets[a.month] = n;
    c.emit({ verb: "sales.target_set", summary: `${c.first()} set the ${a.month} sales target to €${n.toLocaleString("en-IE")}.` });
    return c.ok("Target saved.");
  },

  /* ---------------------------------------------------------------- Today */
  "desk/today": (c, a: { key: string; op: "done" | "snooze" | "reschedule"; date?: string }) => {
    const d = needManage(c, "work the Today list"); if (d) return d;
    const item = deskToday(c.s).find((x) => x.key === a.key);
    if (!item) return c.fail("That item is no longer on today's list.");
    const t = today(c);
    const to = a.op === "snooze" ? deskNextWorkday(t) : a.date;
    if (a.op !== "done" && (!isDate(to) || to <= t)) return c.fail("Choose a day after today.");
    const desk = c.s.salesDesk;
    const lead = item.leadId ? leadOf(c, item.leadId) : undefined;
    const when = to ? fmtWeekdayDate(to) : "";
    switch (item.ref.kind) {
      case "touch": return c.fail("Open the deal and send the first reply. The 10 minute clock is running.");
      case "lead": {
        if (!lead) return c.fail("Unknown lead.");
        if (a.op === "done") return leadDone(c, lead);
        lead.nextActionOn = to!;
        lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: next step moved to ${when}.` });
        c.emit({ verb: "sales.next_step_moved", summary: `${c.first()} moved the next step for ${lead.company} to ${fmtDate(to!)}.` });
        return c.ok(`${lead.company} moved to ${when}. The calendar shows it there.`, "info");
      }
      case "follow": {
        if (!lead) return c.fail("Unknown lead.");
        if (a.op === "done") return run(c, "salesFlow/followUp", { leadId: lead.id, step: item.ref.n, action: "send" });
        const sk = run(c, "salesFlow/followUp", { leadId: lead.id, step: item.ref.n, action: "skip" });
        if (!sk.ok) return sk;
        const r = run(c, "sched/create", { form: { kind: "follow_up", date: to, start: "09:00", client: lead.company, leadId: lead.id, contact: lead.contact.name, contactEmail: lead.contact.email, template: "proposal", staffIds: [c.persona().id] } });
        if (!r.ok) return r;
        return c.ok(`Follow up for ${lead.company} moved to ${when} at 09:00. It is in the calendar.`, "info");
      }
      case "sched": {
        if (a.op === "done") return run(c, "sched/done", { id: item.ref.id });
        return run(c, "sched/move", { calId: `sched:${item.ref.id}`, date: to });
      }
      case "await": {
        if (!lead) return c.fail("Unknown lead.");
        if (a.op === "done") {
          lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Call: chased a decision on the proposal with ${lead.contact.name}.` });
          desk.today[a.key] = { done: c.stamp() };
          c.emit({ verb: "sales.activity", simulated: true, summary: `${c.first()} chased ${lead.company} for a decision on the proposal.` });
          return c.ok(`Chase logged on ${lead.company}.`);
        }
        desk.today[a.key] = { until: to! };
        return c.ok(`${lead.company} will be back on Today on ${when}.`, "info");
      }
      case "recall": {
        if (a.op === "done") {
          const r = run(c, "ret/sendRebooking", { recallId: item.ref.id });
          if (r.ok) desk.today[a.key] = { done: c.stamp() };
          return r;
        }
        const r = run(c, "sched/create", { form: { kind: "rebooking", date: to, start: "09:00", client: item.company, contact: null, staffIds: [c.persona().id] } });
        if (!r.ok) return r;
        desk.today[a.key] = { until: to! };
        return c.ok(`Rebooking email for ${item.company} scheduled for ${when} at 09:00. It is in the calendar.`, "info");
      }
    }
    return c.fail("Unknown item.");
  },

  /* ---------------------------------------------------------------- follow-ups */
  "desk/follow": (c, a: { key: string; op: "send" | "done" | "snooze" | "reschedule"; date?: string }) => {
    const d = needManage(c, "work the follow ups"); if (d) return d;
    const item = deskFollowUps(c.s).find((x) => x.key === a.key);
    if (!item) return c.fail("That follow up is no longer open.");
    const t = today(c);
    const base = item.due > t ? item.due : t;
    const to = a.op === "snooze" ? deskNextWorkday(base) : a.date;
    if ((a.op === "snooze" || a.op === "reschedule") && (!isDate(to) || to <= t)) return c.fail("Choose a day after today.");
    const lead = item.leadId ? leadOf(c, item.leadId) : undefined;
    const when = to ? fmtWeekdayDate(to) : "";
    if (item.kind === "sequence") {
      if (!lead) return c.fail("Unknown lead.");
      if (a.op === "send") return run(c, "salesFlow/followUp", { leadId: lead.id, step: item.n, action: "send" });
      const sk = run(c, "salesFlow/followUp", { leadId: lead.id, step: item.n, action: "skip" });
      if (!sk.ok) return sk;
      if (a.op === "done") {
        lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: follow up ${item.n} done another way (call or reply in person).` });
        return c.ok(`Follow up ${item.n} for ${lead.company} marked done.`);
      }
      const r = run(c, "sched/create", { form: { kind: "follow_up", date: to, start: "09:00", client: lead.company, leadId: lead.id, contact: lead.contact.name, contactEmail: lead.contact.email, template: "proposal", staffIds: [c.persona().id] } });
      if (!r.ok) return r;
      return c.ok(`Follow up for ${lead.company} moved to ${when} at 09:00. It is in the calendar.`, "info");
    }
    if (item.kind === "next") {
      if (!lead) return c.fail("Unknown lead.");
      if (a.op === "send") return c.fail("Write the email from the deal: use Send on the row.");
      if (a.op === "done") return leadDone(c, lead);
      lead.nextActionOn = to!;
      lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: next step moved to ${when}.` });
      c.emit({ verb: "sales.next_step_moved", summary: `${c.first()} moved the next step for ${lead.company} to ${fmtDate(to!)}.` });
      return c.ok(`${lead.company} moved to ${when}. The calendar shows it there.`, "info");
    }
    if (a.op === "send") return run(c, "sched/sendNow", { id: item.schedId });
    if (a.op === "done") return run(c, "sched/cancel", { id: item.schedId });
    return run(c, "sched/move", { calId: `sched:${item.schedId}`, date: to });
  },

  /* ---------------------------------------------------------------- expiring soon */
  "desk/expiry": (c, a: { key: string; op: "renew" | "remind" | "extend" | "lost"; reason?: string }) => {
    const d = needManage(c, "work renewals"); if (d) return d;
    const item = deskExpiring(c.s, 400).find((x) => x.key === a.key);
    if (!item) return c.fail("That item is no longer on the list.");
    const desk = c.s.salesDesk;
    const m = desk.expiry[a.key] || (desk.expiry[a.key] = {});
    const t = today(c);
    const ext = addDays(item.expires > t ? item.expires : t, 30);
    if (a.op === "lost") {
      const reason = String(a.reason || "").trim();
      if (reason.length < 3) return c.fail("Give a short reason.");
      if (item.kind === "proposal" && item.leadId) return run(c, "sales/moveLead", { leadId: item.leadId, stage: "lost", reason });
      m.lost = reason;
      c.emit({ verb: "sales.renewal_lost", summary: `${c.first()} marked ${item.company} (${item.title}) as not renewing: ${reason}` });
      return c.ok(`${item.company} marked as not renewing.`, "info");
    }
    if (a.op === "extend") {
      m.extendedTo = ext;
      const lead = item.leadId ? leadOf(c, item.leadId) : undefined;
      if (lead) lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: ${item.kind === "proposal" ? `proposal ${item.ref} validity extended` : "renewal date extended"} to ${fmtWeekdayDate(ext)}.` });
      c.emit({ verb: "sales.renewal_extended", summary: `${c.first()} extended ${item.company} (${item.title}) to ${fmtDate(ext)}.` });
      return c.ok(`${item.company} extended to ${fmtWeekdayDate(ext)}.`, "info");
    }
    if (a.op === "remind") {
      if (item.kind === "programme") {
        const r = run(c, "ret/sendRebooking", { recallId: item.ref });
        if (r.ok) { m.remindedAt = c.stamp(); return r; }
      }
      m.remindedAt = c.stamp();
      const lead = item.leadId ? leadOf(c, item.leadId) : undefined;
      const subject = item.kind === "proposal" ? `Your Precision Health proposal is valid until ${fmtWeekdayDate(item.expires)}` : `${item.company}: your renewal is coming up`;
      if (lead) {
        desk.seq.email += 1;
        desk.emails.push({ id: `DE-${pad(desk.seq.email, 3)}`, leadId: lead.id, at: c.stamp(), by: c.persona().id, to: lead.contact.email, subject, body: `Hi ${lead.contact.name.split(" ")[0]},\n\nA quick note that our proposal ${item.ref} holds its prices until ${fmtWeekdayDate(item.expires)}. If you would like to go ahead, or need anything changed, just reply and I will look after it.\n\nKind regards,\nStephen Kelly`, purpose: "chase" });
        lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Email: "${subject}" sent to ${lead.contact.email}.` });
      }
      c.emit({ verb: "sales.renewal_reminder", simulated: true, integrationId: "email", summary: `${c.first()} sent ${item.contactName} at ${item.company} a reminder: "${subject}". Simulated: no email was sent.` });
      return c.ok(`Reminder sent to ${item.contactName}. Simulated.`);
    }
    /* renew */
    if (item.kind === "proposal") {
      const r = run(c, "sales/newProposalVersion", { proposalId: item.ref });
      if (!r.ok) return r;
      delete desk.expiry[a.key];
      return c.ok(`New version of ${item.ref} drafted at today's prices. Check it and send it from the deal.`, "ok", item.leadId || undefined);
    }
    if (item.kind === "programme") {
      const rc = salesRecalls(c.s).find((r) => r.id === item.ref);
      if (!rc) return c.fail("Unknown client.");
      const r = run(c, "sales/createLead", { company: rc.company, fictionalCompany: rc.fictionalCompany, services: [rc.service], contactName: rc.contactName, contactEmail: rc.contactEmail || `${rc.contactName.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, source: "recall", enquiry: `Renewal of last year's programme (${rc.packageText}), screened ${fmtDate(rc.screenedOn)}.`, headcount: rc.participants, origin: { kind: "recall", id: rc.id } });
      if (!r.ok) return r;
      return c.ok(`Renewal deal for ${rc.company} added to the pipeline.`, "ok", r.id);
    }
    const con = desk.contracts.find((x) => x.id === item.ref);
    if (!con) return c.fail("Unknown agreement.");
    const from = item.expires;
    con.startedOn = from;
    con.renewsOn = addDays(from, 365);
    delete desk.expiry[a.key];
    c.emit({ verb: "sales.renewed", simulated: !!con.amount, integrationId: con.amount ? "xero" : null, summary: `${c.first()} renewed ${con.company}: ${con.title} to ${fmtDate(con.renewsOn)}${con.amount ? `. Xero invoice for ${con.amount} euro drafted. Simulated` : ""}.` });
    return c.ok(`${con.company} renewed to ${fmtDate(con.renewsOn)}${con.amount ? ". Xero invoice drafted (simulated)" : ""}.`);
  },

  /* ---------------------------------------------------------------- bulk */
  "desk/bulk": (c, a: { leadIds: string[]; op: "move" | "snooze" | "owner" | "follow"; stage?: SalesStage; days?: number; owner?: StaffId; reason?: string }) => {
    const d = needManage(c, "change leads in bulk"); if (d) return d;
    const ids = Array.from(new Set(a.leadIds || []));
    if (!ids.length) return c.fail("Tick at least one deal.");
    const leads = ids.map((id) => leadOf(c, id)).filter(Boolean) as NonNullable<ReturnType<typeof leadOf>>[];
    if (leads.length !== ids.length) return c.fail("One of those deals no longer exists.");
    let done = 0;
    const skipped: string[] = [];
    if (a.op === "move") {
      if (!a.stage || !SALES_STAGE_LABEL[a.stage]) return c.fail("Choose a stage.");
      if (a.stage === "won") return c.fail("Mark deals as won one at a time, so each one starts its own onboarding.");
      if (a.stage === "lost" && String(a.reason || "").trim().length < 3) return c.fail("Give a reason for losing these deals.");
      for (const l of leads) {
        if (l.stage === a.stage) { skipped.push(l.company); continue; }
        const r = run(c, "sales/moveLead", { leadId: l.id, stage: a.stage, reason: a.reason });
        if (r.ok) done++; else skipped.push(l.company);
      }
      if (!done) return c.fail(`Nothing moved: ${skipped.join(", ")} ${skipped.length === 1 ? "is" : "are"} already there or cannot move.`);
      return c.ok(`${done} deal${done === 1 ? "" : "s"} moved to ${SALES_STAGE_LABEL[a.stage]}${skipped.length ? `. Skipped ${skipped.join(", ")}` : ""}.`);
    }
    if (a.op === "snooze") {
      const n = Math.max(1, Math.min(60, Math.round(Number(a.days) || 7)));
      const t = today(c);
      for (const l of leads) {
        if (l.stage === "won" || l.stage === "lost") { skipped.push(l.company); continue; }
        const from = l.nextActionOn && l.nextActionOn > t ? l.nextActionOn : t;
        l.nextActionOn = deskNextWorkday(from, Math.max(1, Math.round((n * 5) / 7)));
        if (!l.nextAction) l.nextAction = "Check in";
        l.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: next step moved to ${fmtWeekdayDate(l.nextActionOn)}.` });
        done++;
      }
      if (!done) return c.fail("Only open deals have next steps to move.");
      c.emit({ verb: "sales.bulk_snooze", summary: `${c.first()} moved the next step on ${done} deal${done === 1 ? "" : "s"} by about ${n} days.` });
      return c.ok(`Next steps moved on ${done} deal${done === 1 ? "" : "s"}${skipped.length ? `. Skipped closed deals: ${skipped.join(", ")}` : ""}.`);
    }
    if (a.op === "owner") {
      const who = c.s.staff.find((s) => s.id === a.owner);
      if (!who) return c.fail("Choose who should own them.");
      for (const l of leads) {
        if (l.ownerId === who.id) { skipped.push(l.company); continue; }
        l.ownerId = who.id;
        l.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: owner changed to ${who.name}.` });
        done++;
      }
      if (!done) return c.fail(`${who.name} already owns ${leads.length === 1 ? "that deal" : "those deals"}.`);
      c.emit({ verb: "sales.bulk_owner", summary: `${c.first()} gave ${done} deal${done === 1 ? "" : "s"} to ${who.name}.` });
      return c.ok(`${done} deal${done === 1 ? "" : "s"} now owned by ${who.name}.`);
    }
    if (a.op === "follow") {
      for (const l of leads) {
        const item = deskToday(c.s).find((x) => x.ref.kind === "follow" && x.leadId === l.id);
        if (!item) { skipped.push(l.company); continue; }
        const r = run(c, "salesFlow/followUp", { leadId: l.id, step: item.ref.n, action: "send" });
        if (r.ok) done++; else skipped.push(l.company);
      }
      if (!done) return c.fail("None of those deals has a follow up due today.");
      return c.ok(`${done} follow up${done === 1 ? "" : "s"} sent${skipped.length ? `. Nothing due for ${skipped.join(", ")}` : ""}.`);
    }
    return c.fail("Unknown bulk action.");
  },

  /* ---------------------------------------------------------------- email and meetings */
  "desk/sendEmail": (c, a: { leadId: string; purpose: DeskEmailPurpose; subject: string; body: string; to?: string }) => {
    const d = needManage(c, "email clients"); if (d) return d;
    const lead = leadOf(c, a.leadId); if (!lead) return c.fail("Unknown lead.");
    const subject = String(a.subject || "").trim();
    const body = String(a.body || "").trim();
    if (subject.length < 3) return c.fail("Add a subject.");
    if (body.length < 20) return c.fail("The email is too short to send.");
    const to = String(a.to || lead.contact.email).trim();
    if (!EMAIL.test(to)) return c.fail("Choose who it goes to.");
    const desk = c.s.salesDesk;
    desk.seq.email += 1;
    const at = c.stamp();
    desk.emails.push({ id: `DE-${pad(desk.seq.email, 3)}`, leadId: lead.id, at, by: c.persona().id, to, subject, body, purpose: a.purpose });
    lead.history.push({ at, by: c.persona().id, text: `Email: "${subject}" sent to ${to}.` });
    c.emit({ verb: "sales.email_sent", simulated: true, integrationId: "email", summary: `${c.first()} emailed ${lead.company}: "${subject}". Simulated: no email was sent.` });
    return c.ok(`Email sent to ${to}. Simulated.`);
  },
  "desk/bookMeeting": (c, a: { leadId: string; kind: "meeting" | "call"; date: string; start: string; minutes: number; contact: string; notes?: string }) => {
    const d = needManage(c, "book meetings"); if (d) return d;
    const lead = leadOf(c, a.leadId); if (!lead) return c.fail("Unknown lead.");
    if (!isDate(a.date) || a.date < today(c)) return c.fail("Choose today or a later day.");
    if (!isTime(a.start)) return c.fail("Choose a start time.");
    const mins = Math.max(15, Math.min(240, Math.round(Number(a.minutes) || 60)));
    const [h, m] = a.start.split(":").map(Number);
    const endM = h * 60 + m + mins;
    const end = `${pad(Math.min(23, Math.floor(endM / 60)), 2)}:${pad(endM % 60, 2)}`;
    const contact = String(a.contact || lead.contact.name).trim();
    const r = run(c, "sched/create", { form: { kind: a.kind === "call" ? "call" : "meeting", date: a.date, start: a.start, end, client: lead.company, leadId: lead.id, contact, contactEmail: lead.contact.email, notes: a.notes || "", staffIds: [c.persona().id] } });
    if (!r.ok) return r;
    lead.nextAction = `${a.kind === "call" ? "Call" : "Meeting"} with ${contact.split(" ")[0]}`;
    lead.nextActionOn = a.date;
    return c.ok(`${a.kind === "call" ? "Call" : "Meeting"} with ${contact} booked for ${fmtWeekdayDate(a.date)} at ${a.start}. It is in the calendar and on the deal.`, "ok", r.id);
  },

  /* ---------------------------------------------------------------- sequences */
  "desk/saveFollowTemplate": (c, a: { steps: SalesSeqStep[] }) => {
    const d = needManage(c, "edit the follow-up sequence"); if (d) return d;
    const steps = (a.steps || []).map((x) => ({ wait: Math.round(Number(x.wait)), subject: String(x.subject || "").trim(), body: String(x.body || "").trim() }));
    if (steps.length < 1 || steps.length > 6) return c.fail("A sequence has between one and six emails.");
    for (const [i, x] of steps.entries()) {
      if (!Number.isFinite(x.wait) || x.wait < 1 || x.wait > 60) return c.fail(`Email ${i + 1}: wait between 1 and 60 days.`);
      if (x.subject.length < 3) return c.fail(`Email ${i + 1}: add a subject.`);
      if (x.body.length < 20) return c.fail(`Email ${i + 1}: the message is too short.`);
      const bad = (x.subject + x.body).match(/\{([a-z_]+)\}/g)?.find((m) => !["{first}", "{company}", "{proposal}", "{signature}"].includes(m));
      if (bad) return c.fail(`Email ${i + 1}: ${bad} is not a merge field. Use {first}, {company}, {proposal} or {signature}.`);
    }
    c.s.salesDesk.follow = { steps, updatedAt: c.stamp(), updatedBy: c.persona().name };
    c.emit({ verb: "sales.sequence_saved", summary: `${c.first()} updated the weekly follow-up sequence (${steps.length} emails).` });
    return c.ok("Sequence saved. Deals already in it pick up the new wording and timing.");
  },
  "desk/resetFollowTemplate": (c) => {
    const d = needManage(c, "edit the follow-up sequence"); if (d) return d;
    if (!c.s.salesDesk.follow) return { ok: false, tone: "info", message: "The sequence is already the original." };
    c.s.salesDesk.follow = null;
    c.emit({ verb: "sales.sequence_reset", summary: `${c.first()} put the weekly follow-up sequence back to the original.` });
    return c.ok("Back to the original sequence.", "info");
  },
  "desk/rebookPause": (c, a: { recallId: string; paused: boolean }) => {
    const d = needManage(c, "pause rebooking"); if (d) return d;
    if (!/^RC-/.test(String(a.recallId))) return c.fail("Unknown client.");
    if (a.paused) c.s.salesDesk.rebookPaused[a.recallId] = true; else delete c.s.salesDesk.rebookPaused[a.recallId];
    return c.ok(a.paused ? "Rebooking paused for this client." : "Rebooking resumed.", "info");
  },
});

/** A next step done: logged on the deal, and the agent's next best action becomes the new next step in two working days. */
function leadDone(c: Ctx, lead: NonNullable<ReturnType<typeof leadOf>>): ActionResult {
  const was = lead.nextAction || "Next step";
  lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: done, "${was}".` });
  lead.nextAction = "";
  const nb = deskNextBest(c.s, lead);
  lead.nextAction = nb.title;
  lead.nextActionOn = deskNextWorkday(today(c), 2);
  c.emit({ verb: "sales.next_step_done", summary: `${c.first()} did "${was}" for ${lead.company}. Next: ${nb.title} by ${fmtDate(lead.nextActionOn)}.` });
  return c.ok(`Done. Next step for ${lead.company}: ${nb.title}, ${fmtWeekdayDate(lead.nextActionOn)}.`);
}

function swapPrimary(c: Ctx, leadId: string, contactId: string): ActionResult {
  const lead = leadOf(c, leadId); if (!lead) return c.fail("Unknown lead.");
  const desk = c.s.salesDesk;
  const ct = desk.contacts.find((x) => x.id === contactId && x.leadId === leadId);
  if (!ct) return c.fail("Unknown contact.");
  if (ct.left) return c.fail(`${ct.name} has left the company. Choose someone who is still there.`);
  const old = lead.contact;
  const oldLeft = desk.primaryLeft[leadId] || null;
  lead.contact = { name: ct.name, role: ct.title, email: ct.email, phone: ct.phone };
  ct.name = old.name; ct.title = old.role; ct.email = old.email; ct.phone = old.phone; ct.left = !!oldLeft; ct.leftOn = oldLeft; ct.role = ct.role === "finance" ? "finance" : "decision_maker";
  delete desk.primaryLeft[leadId];
  lead.history.push({ at: c.stamp(), by: c.persona().id, text: `Note: ${lead.contact.name} is now the main contact.` });
  c.emit({ verb: "sales.contact_primary", summary: `${c.first()} made ${lead.contact.name} the main contact at ${lead.company}.` });
  return c.ok(`${lead.contact.name} is now the main contact. Emails and follow ups go to them.`);
}

export const deskAct = {
  addContact: (leadId: string, f: { name: string; title: string; email: string; phone?: string; role: DeskRole; primary?: boolean }) => ({ type: "desk/addContact", leadId, ...f }),
  contactLeft: (leadId: string, key: string, left: boolean) => ({ type: "desk/contactLeft", leadId, key, left }),
  makePrimary: (leadId: string, contactId: string) => ({ type: "desk/makePrimary", leadId, contactId }),
  setTarget: (month: string, amount: number) => ({ type: "desk/setTarget", month, amount }),
  today: (key: string, op: "done" | "snooze" | "reschedule", date?: string) => ({ type: "desk/today", key, op, date }),
  bulk: (leadIds: string[], op: "move" | "snooze" | "owner" | "follow", extra: { stage?: SalesStage; days?: number; owner?: StaffId; reason?: string } = {}) => ({ type: "desk/bulk", leadIds, op, ...extra }),
  sendEmail: (leadId: string, purpose: DeskEmailPurpose, subject: string, body: string, to?: string) => ({ type: "desk/sendEmail", leadId, purpose, subject, body, to }),
  bookMeeting: (leadId: string, f: { kind: "meeting" | "call"; date: string; start: string; minutes: number; contact: string; notes?: string }) => ({ type: "desk/bookMeeting", leadId, ...f }),
  saveFollowTemplate: (steps: SalesSeqStep[]) => ({ type: "desk/saveFollowTemplate", steps }),
  resetFollowTemplate: () => ({ type: "desk/resetFollowTemplate" }),
  rebookPause: (recallId: string, paused: boolean) => ({ type: "desk/rebookPause", recallId, paused }),
  follow: (key: string, op: "send" | "done" | "snooze" | "reschedule", date?: string) => ({ type: "desk/follow", key, op, date }),
  expiry: (key: string, op: "renew" | "remind" | "extend" | "lost", reason?: string) => ({ type: "desk/expiry", key, op, reason }),
};
