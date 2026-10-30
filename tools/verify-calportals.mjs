// Checks for "+ Schedule" on the Calendar and the Portals page: every action type really creates the
// thing in the store and shows on the calendar, items can move, be cancelled and be marked done with a
// history, emails count as sent when the clock passes, leave blocks a nurse, and the Portals page
// can create client portals, invite participants and add nurses. Usage: node tools/verify-calportals.mjs
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0, passed = 0;
const check = (name, cond, extra = "") => {
  if (cond) passed++;
  else { failed++; console.log("FAIL", name, extra); }
};
const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

try {
  const M = await server.ssrLoadModule("/src/ph/model/index.ts");
  const S = await server.ssrLoadModule("/src/ph/pages/Calendar/schedActions.ts");
  const P = await server.ssrLoadModule("/src/ph/pages/Portals/actions.ts");
  await server.ssrLoadModule("/src/ph/pages/Flu/actions.ts");
  await server.ssrLoadModule("/src/ph/pages/Clinics/daysActions.ts");
  const D = await server.ssrLoadModule("/src/ph/pages/Clinics/daysActions.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const ev = (id) => M.calendarEvents(s).find((e) => e.id === id);
  const evOf = (pred) => M.calendarEvents(s).filter(pred);
  const create = (form) => run(S.schedAct.create(form));

  /* ---------- baseline ---------- */
  check("scheduled slice seeded", s.scheduled.items.length === 2);
  check("seeded training on the calendar", !!ev("sched:SA-0001"));
  eq("seeded leave is one event per day", evOf((e) => e.id.startsWith("sched:SA-0002:")).map((e) => e.date), ["2026-10-12", "2026-10-13", "2026-10-14"]);
  check("team group exists", !!M.CAL_GROUP_BY_ID.team);
  check("new kinds known", ["sched_meeting", "sched_email", "sched_retention", "sched_training", "sched_leave"].every((k) => M.CAL_KIND_BY_ID[k]));
  check("baseline invited counts unchanged", M.programmeCounts(s, "PRG-SISK-26").invited === 500 && M.programmeCounts(s, "PRG-IBM-26").invited === 150);
  check("client name options include leads and clients", M.schedClientOptions(s).some((o) => o.leadId) && M.schedClientOptions(s).some((o) => o.name === "IBM"));

  /* ---------- meeting on a lead ---------- */
  const lead = s.sales.leads.find((l) => l.stage !== "lost" && l.stage !== "won");
  const hBefore = lead.history.length;
  let r = create({ kind: "meeting", date: "2026-10-08", start: "10:00", end: "11:00", client: lead.company, leadId: lead.id, contact: lead.contact.name, notes: "Walk through the proposal" });
  check("meeting created", r.ok, r.message);
  const mtg = s.scheduled.items.find((x) => x.id === r.id);
  check("meeting on calendar", !!ev(`sched:${mtg.id}`) && ev(`sched:${mtg.id}`).kind === "sched_meeting");
  eq("meeting times", [ev(`sched:${mtg.id}`).date, ev(`sched:${mtg.id}`).time], ["2026-10-08", { start: "10:00", end: "11:00" }]);
  check("meeting on the lead timeline", s.sales.leads.find((l) => l.id === lead.id).history.length === hBefore + 1);
  eq("meeting opens the lead", ev(`sched:${mtg.id}`).link, { page: "Sales", tab: "pipeline", params: { lead: lead.id } });
  eq("scheduled by neil", ev(`sched:${mtg.id}`).scheduledBy, "neil");
  check("missing client fails", !create({ kind: "meeting", date: "2026-10-08", start: "10:00" }).ok);
  check("end before start fails", !create({ kind: "call", date: "2026-10-08", start: "10:00", end: "09:00", client: "IBM" }).ok);

  /* ---------- move and history ---------- */
  r = run(S.schedAct.move(`sched:${mtg.id}`, "2026-10-09", "14:00"));
  check("meeting moved", r.ok, r.message);
  eq("moved keeps the length", [ev(`sched:${mtg.id}`).date, ev(`sched:${mtg.id}`).time], ["2026-10-09", { start: "14:00", end: "15:00" }]);
  check("move recorded in history", s.scheduled.items.find((x) => x.id === mtg.id).history.some((h) => /Moved from/.test(h.text)));
  r = run(S.schedAct.done(mtg.id));
  check("meeting marked done", r.ok && ev(`sched:${mtg.id}`).done);

  /* ---------- follow up email ---------- */
  r = create({ kind: "follow_up", date: "2026-10-05", start: "10:00", client: lead.company, leadId: lead.id, contact: lead.contact.name, contactEmail: lead.contact.email, template: "checkin" });
  check("follow up scheduled", r.ok, r.message);
  const fu = r.id;
  eq("follow up shows scheduled", ev(`sched:${fu}`).status, "Scheduled to send");
  check("scheduled emails are to do", M.calMatches(ev(`sched:${fu}`), { groups: M.CAL_GROUPS.map((g) => g.id), clients: [], people: [], q: "", mine: null, status: "todo" }));
  const s0 = s;
  run(act.setClock("1400"));
  eq("email counts as sent once the clock passes", ev(`sched:${fu}`).status, "Sent at the scheduled time");
  s = s0;
  r = run(S.schedAct.sendNow(fu));
  check("send now", r.ok && ev(`sched:${fu}`).status === "Sent");
  check("send now logs on the lead", s.sales.leads.find((l) => l.id === lead.id).history.some((h) => /Email: /.test(h.text)));
  check("sent email cannot be cancelled", !run(S.schedAct.cancel(fu)).ok);

  /* ---------- retention emails ---------- */
  const em0 = s.onboarding.emails.length;
  r = create({ kind: "results_out", date: "2026-10-20", start: "09:30", client: "IBM", contact: "HR", contactEmail: "hr@example.com" });
  check("results out scheduled", r.ok && ev(`sched:${r.id}`).kind === "sched_retention" && M.calGroupOf("sched_retention") === "retention");
  eq("results out opens Retention", ev(`sched:${r.id}`).link.page + "/" + ev(`sched:${r.id}`).link.tab, "Sales/recall");
  run(S.schedAct.sendNow(r.id));
  check("sent retention email lands in Retention history", s.onboarding.emails.length === em0 + 1);
  r = create({ kind: "rebooking", date: "2026-11-02", start: "09:00", client: "Sisk", contact: "Róisín Hegarty" });
  check("rebooking reminder scheduled", r.ok);
  const reb = r.id;
  r = run(S.schedAct.cancel(reb));
  check("cancel works", r.ok && !ev(`sched:${reb}`));
  check("cancel recorded", s.scheduled.items.find((x) => x.id === reb).history.some((h) => h.text === "Cancelled"));

  /* ---------- task ---------- */
  const t0 = s.tasks.length;
  r = create({ kind: "task", date: "2026-10-07", start: "12:00", title: "Call IBM about the room", staffIds: ["brenda"] });
  check("task created in Work", r.ok && s.tasks.length === t0 + 1, r.message);
  const task = s.tasks[s.tasks.length - 1];
  eq("task due time", [M.localDateOf(task.dueAt), M.localTimeOf(task.dueAt), task.ownerId], ["2026-10-07", "12:00", "brenda"]);
  check("task on calendar with scheduled by", ev(`task:${task.id}`)?.schedId === r.id && ev(`task:${task.id}`)?.scheduledBy === "neil");
  r = run(S.schedAct.move(`task:${task.id}`, "2026-10-08", "15:00"));
  check("task moved", r.ok && M.localDateOf(s.tasks.find((x) => x.id === task.id).dueAt) === "2026-10-08");
  const saTask = s.scheduled.items.find((x) => x.ref && x.ref.id === task.id);
  r = run(S.schedAct.done(saTask.id));
  check("task marked done", r.ok && s.tasks.find((x) => x.id === task.id).status === "done", r.message);

  /* ---------- flu ---------- */
  const f0 = s.flu.clinics.length;
  r = create({ kind: "flu", date: "2026-10-21", start: "09:00", client: "Acme Foods (fictional)", projected: 60, staffIds: [] });
  check("flu clinic created", r.ok && s.flu.clinics.length === f0 + 1, r.message);
  check("flu clinic on calendar", !!ev(`flu:${r.id}`) && ev(`flu:${r.id}`).scheduledBy === "neil");
  check("flu needs projected", !create({ kind: "flu", date: "2026-10-21", start: "09:00", client: "X Ltd" }).ok);
  r = run(S.schedAct.move(`flu:${r.id}`, "2026-10-22", "10:00"));
  check("flu moved", r.ok, r.message);

  /* ---------- occupational health ---------- */
  const oc = s.occHealth.clients[0];
  r = create({ kind: "oh", date: "2026-10-15", start: "09:00", end: "11:00", client: oc.name, staffIds: ["fiona"] });
  check("OH session created", r.ok, r.message);
  const diary = s.occHealth.diaries.find((d) => d.id === r.id);
  check("OH diary has 8 free slots", diary && diary.slots.length === 8 && diary.slots.every((x) => x.kind === "free"));
  check("OH on calendar", !!ev(`oh:${r.id}`));
  r = run(S.schedAct.move(`oh:${diary.id}`, "2026-10-16", "13:00"));
  check("OH moved with slots", r.ok && s.occHealth.diaries.find((d) => d.id === diary.id).slots[0].start === "13:00" && s.occHealth.diaries.find((d) => d.id === diary.id).end === "15:00");

  /* ---------- training and leave ---------- */
  r = create({ kind: "leave", date: "2026-10-26", endDate: "2026-10-28", staffIds: ["ciara"], title: "Holiday" });
  check("leave booked", r.ok, r.message);
  eq("leave one event per day", evOf((e) => e.id.startsWith(`sched:${r.id}:`)).length, 3);
  check("leave blocks a flu clinic", !create({ kind: "flu", date: "2026-10-27", start: "09:00", client: "Blocked Ltd", projected: 20, staffIds: ["ciara"] }).ok);
  check("leave blocks an OH session", !create({ kind: "oh", date: "2026-10-27", start: "09:00", end: "10:00", client: oc.name, staffIds: ["ciara"] }).ok);
  const form = M.draftFromRequest("Salesforce point of care day on 27 October with Ciara, 9 to 1, 12 appointments", { today: M.today(s), staff: s.staff, sessions: s.sessions, days: s.screeningDays.days }).form;
  const blocked = run(D.daysAct.save(form, "agent"));
  check("leave blocks a screening day", !blocked.ok && /leave/.test(blocked.message), blocked.message);
  r = create({ kind: "training", date: "2026-10-23", start: "10:00", end: "12:00", staffIds: ["aisling"], title: "Cold chain refresher" });
  check("training booked", r.ok && ev(`sched:${r.id}`).kind === "sched_training");
  check("training needs people", !create({ kind: "training", date: "2026-10-23", start: "10:00", end: "12:00" }).ok);

  /* ---------- filters ---------- */
  const base = { groups: M.CAL_GROUPS.map((g) => g.id), clients: [], people: [], q: "", mine: null };
  const mine = M.calendarEvents(s).filter((e) => M.calMatches(e, { ...base, byMe: "neil" }));
  check("scheduled by me filter", mine.length >= 6 && mine.every((e) => e.scheduledBy === "neil"));
  const done = M.calendarEvents(s).filter((e) => M.calMatches(e, { ...base, status: "done" }));
  check("done filter", done.length > 0 && done.every((e) => e.done));

  /* ---------- lead next action ---------- */
  const l2 = s.sales.leads.find((l) => l.nextActionOn && l.stage !== "won" && l.stage !== "lost");
  r = run(S.schedAct.leadLogCall(l2.id, "Spoke to the HR lead, keen on November", "2026-10-12"));
  check("log call on lead", r.ok && s.sales.leads.find((l) => l.id === l2.id).nextActionOn === "2026-10-12");
  r = run(S.schedAct.move(`lead:${l2.id}`, "2026-10-13"));
  check("lead next step moved", r.ok && ev(`lead:${l2.id}`).date === "2026-10-13");

  /* ---------- participant preview cannot schedule ---------- */
  const keep = s;
  run(act.setPersona("participant"));
  check("participant cannot schedule", !create({ kind: "call", date: "2026-10-08", start: "10:00", client: "IBM" }).ok);
  s = keep;

  /* ---------- every calendar link resolves ---------- */
  const pageIds = new Set(M.PAGES.map((p) => p.id));
  check("every event still links to a real page", M.calendarEvents(s).every((e) => pageIds.has(e.link.page)));
  check("no dashes in new titles", M.calendarEvents(s).filter((e) => e.schedId).every((e) => !/[–—]/.test(e.title + (e.detail || ""))));

  /* ---------- Portals ---------- */
  check("Portals page after Calendar", M.PAGES[M.PAGES.findIndex((p) => p.id === "Calendar") + 1].id === "Portals" && M.isPhScreen("Portals", "all"));
  let rows = M.clientPortalRows(s);
  eq("three client portals to start", rows.length, 3);
  const ibmRow = rows.find((x) => x.company === "IBM");
  eq("IBM code and counts", [ibmRow.code, ibmRow.status, ibmRow.counts.invited], ["DEMO-IBM-26", "live", 150]);
  r = run(P.portalsAct.createClient("Acme Foods (fictional)", "Spring Screening 2027", "Jane Doyle", "jane.doyle@example.com", false));
  check("client portal created", r.ok, r.message);
  rows = M.clientPortalRows(s);
  const acme = rows.find((x) => x.company === "Acme Foods (fictional)");
  eq("code like DEMO-IBM-26", [acme.code, acme.status, acme.link.endsWith(acme.code)], ["DEMO-ACME-26", "draft", true]);
  check("duplicate company refused", !run(P.portalsAct.createClient("IBM", "Again", "A Person", "a@example.com", true)).ok);
  check("go live", run(P.portalsAct.goLive(acme.id)).ok && M.clientPortalRows(s).find((x) => x.id === acme.id).status === "live");
  check("bad email refused", !run(P.portalsAct.createClient("Beta Ltd", "Autumn 2027", "Ann Lee", "nope", true)).ok);
  check("second code is unique", (() => { run(P.portalsAct.createClient("Acme Logistics", "Autumn 2027", "Tom Hart", "tom@example.com", true)); return M.clientPortalRows(s).find((x) => x.company === "Acme Logistics").code === "DEMO-ACME-26-2"; })());

  const n0 = s.persons.length;
  r = run(P.portalsAct.inviteParticipant("Orla", "Byrne", "orla.byrne@example.com", "1988-04-12", "PRG-IBM-26"));
  check("participant invited", r.ok && s.persons.length === n0 + 1, r.message);
  const pr = M.participantPortalRows(s);
  eq("new participant first in the list, invited", [pr[0].row.person.id, pr[0].journey, pr[0].isNew], [r.id, "invited", true]);
  eq("IBM invited count goes up", M.programmeCounts(s, "PRG-IBM-26").invited, 151);
  check("duplicate email refused", !run(P.portalsAct.inviteParticipant("Orla", "Byrne", "orla.byrne@example.com", "1988-04-12", "PRG-IBM-26")).ok);
  check("resend invite works on the new person", run(M.portalAct.resendInvitation(r.id)).ok);
  check("journeys cover released", M.participantPortalRows(s).some((x) => x.journey === "released"));

  r = run(P.portalsAct.addNurse("Sinead Walsh", "087 123 4567"));
  check("nurse added", r.ok, r.message);
  const nr = M.nursePortalRows(s).find((x) => x.name === "Sinead Walsh");
  check("nurse in nurse rows and nursing team", !!nr && nr.added && s.teams.find((t) => t.id === "nursing").memberIds.includes(nr.id));
  check("bad phone refused", !run(P.portalsAct.addNurse("Pat Kenny", "12345")).ok);
  check("new nurse can be put on an OH session", create({ kind: "oh", date: "2026-10-29", start: "09:00", end: "10:00", client: oc.name, staffIds: [nr.id] }).ok);
  check("nurse rows have upcoming days", M.nursePortalRows(s).some((x) => x.days.length > 0));
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`verify-calportals: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
