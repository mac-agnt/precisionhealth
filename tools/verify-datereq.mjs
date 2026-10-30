// Checks for client date requests: staff ask, the client (HR) suggests dates in the client portal from
// real nurse availability, Neil approves (creating screening days), proposes another date or declines.
// Covers availability (leave, clinics, weekends, Irish bank holidays), every rule, who may decide,
// the client portal, the calendar, the control panel and the journey. Usage: node tools/verify-datereq.mjs
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
let failed = 0, passed = 0;
const check = (name, cond, extra = "") => {
  if (cond) passed++;
  else { failed++; console.log("FAIL", name, extra); }
};
const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

try {
  const M = await server.ssrLoadModule("/src/ph/model/index.ts");
  const { drAct } = await server.ssrLoadModule("/src/ph/pages/DateRequests/actions.ts");
  const P = await server.ssrLoadModule("/src/ph/pages/ClientPortal/data.ts");
  const C = await server.ssrLoadModule("/src/ph/pages/Dashboard/control/select.ts");
  const J = await server.ssrLoadModule("/src/ph/pages/Journey/model.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const as = (persona, a) => { run(act.setPersona(persona)); const r = run(a); run(act.setPersona("neil")); return r; };
  const req = (id) => s.dateRequests.requests.find((r) => r.id === id);
  const cal = () => M.calendarEvents(s).filter((e) => e.kind === "date_request");
  const ctl = () => C.controlRows(s).filter((r) => r.group === "datereq");

  /* ---------- seed ---------- */
  eq("two seeded requests", s.dateRequests.requests.map((r) => [r.id, r.programmeId, r.status, r.daysNeeded]), [["DR-0001", "PRG-IBM-26", "asked", 2], ["DR-0002", "PRG-SF-26", "suggested", 1]]);
  eq("IBM request goes to the IBM HR contact", [req("DR-0001").contactName, req("DR-0001").contactEmail], ["Mairéad Costello", "mairead.costello@example.com"]);
  eq("client portal shows the IBM request", M.drForProgramme(s, "PRG-IBM-26")?.id, "DR-0001");
  eq("no request for Sisk", M.drForProgramme(s, "PRG-SISK-26"), null);
  check("every seeded log entry has who and when", s.dateRequests.requests.every((r) => r.log.length && r.log.every((e) => e.at && e.by && e.text)));
  const base = createInitialState();
  eq("baseline counts unchanged", [base.sessions.length, base.screeningDays.days.length, base.activity.length], [s.sessions.length, s.screeningDays.days.length, s.activity.length]);

  /* ---------- availability ---------- */
  eq("weekend is never offered", M.drDayInfo(s, "2026-11-07", null).state, "weekend");
  eq("Irish bank holiday is never offered", [M.drDayInfo(s, "2026-10-26", null).state, M.drDayInfo(s, "2026-10-26", null).label], ["holiday", "Bank holiday: October bank holiday"]);
  eq("Christmas is a bank holiday", M.drDayInfo(s, "2026-12-25", null).state, "holiday");
  eq("today and before are not offered", [M.drDayInfo(s, M.today(s), null).state, M.drDayInfo(s, "2026-10-01", null).state], ["past", "past"]);
  eq("outside the window", M.drDayInfo(s, "2026-12-01", req("DR-0001")).state, "outside");
  check("a free weekday is pickable", M.drDayInfo(s, "2026-11-12", req("DR-0001")).pickable && M.drDayInfo(s, "2026-11-12", null).free === 5);
  check("a nurse on a flu clinic is busy that day", M.drNurses(s, "2026-11-17", "09:00", "16:30").some((x) => x.staff.id === "anita" && !x.free && /flu clinic/.test(x.reason)));
  const n13 = M.drNurses(s, "2026-10-13", "09:00", "16:30");
  check("nurse on leave is not free and says why", n13.some((x) => x.staff.id === "anita" && !x.free && /leave/.test(x.reason)));
  const n6 = M.drNurses(s, "2026-11-06", "09:00", "16:30");
  check("nurse on a screening day is not free", n6.some((x) => x.staff.id === "fiona" && !x.free));
  eq("free nurses listed first", n6[n6.length - 1].free, false);
  eq("6 Nov: Fiona on IBM, Anita on a flu clinic", M.drDayInfo(s, "2026-11-06", null).free, 3);
  eq("full day 9 to 16:30, morning 9:30 to 13:30", [M.drHours({ part: "full", start: "09:00" }), M.drHours({ part: "morning", start: "09:30" })], [{ start: "09:00", end: "16:30" }, { start: "09:30", end: "13:30" }]);
  eq("month grid starts on Monday", M.drMonthGrid("2026-11").slice(0, 7), [null, null, null, null, null, null, "2026-11-01"]);
  eq("month helpers", [M.drAddMonths("2026-12", 1), M.drAddMonths("2026-01", -1), M.monthLabel("2026-11")], ["2027-01", "2025-12", "November 2026"]);
  const f = M.drDayForm({ ...req("DR-0002"), picks: [] }, { date: "2026-11-18", part: "morning", start: "09:30" }, "aisling");
  check("morning day keeps only the first break and fits appointments", f.breaks.lunch === null && f.breaks.afternoon === null && f.breaks.first && f.appointments === M.dayFit(f) && f.appointments > 10);
  eq("day form carries the client's room and contact", [f.room, f.contactName, f.contactPhone, f.screen], ["Wellness Room 4.12, Level 4", "Emma Kinsella", "085 555 0198", "poc"]);
  check("no dashes in the seeded copy", !JSON.stringify(s.dateRequests).match(/[\u2013\u2014]/));

  /* ---------- calendar and control panel at seed ---------- */
  eq("suggested dates are tentative calendar items", cal().map((e) => [e.date, e.tentative, e.status]), [["2026-11-17", true, "Waiting for Neil"], ["2026-11-18", true, "Waiting for Neil"]]);
  check("calendar item opens the request", cal().every((e) => e.link.page === "Clinics" && e.link.tab === "days" && e.link.params.request === "DR-0002"));
  check("calendar kind belongs to clinics", M.CAL_KIND_BY_ID.date_request?.group === "clinics");
  eq("control panel lists the request waiting for Neil", ctl().map((r) => [r.req.id, r.client, r.service]), [["DR-0002", "Salesforce", "screening"]]);
  check("datereq group is in the screening service", C.GROUPS.screening.some((g) => g.id === "datereq"));

  /* ---------- who may decide ---------- */
  const approveSf = drAct.approve("DR-0002", [{ date: "2026-11-17", nurseId: "ciara" }], true);
  check("cannot approve a nurse who is on a flu clinic", (() => { const r = run(drAct.approve("DR-0002", [{ date: "2026-11-17", nurseId: "anita" }], true)); return !r.ok && /flu clinic/.test(r.message); })());
  check("Stephen cannot approve", !as("stephen", approveSf).ok && req("DR-0002").status === "suggested");
  check("Brenda cannot approve", !as("brenda", approveSf).ok);
  check("participant preview cannot approve", !as("participant", approveSf).ok);
  check("an agent cannot approve", (() => { const r = run({ ...approveSf, agentId: "watchdog" }); return !r.ok && /Agents cannot/.test(r.message); })());
  check("an agent actor cannot approve", !run({ ...approveSf, actor: { kind: "agent" } }).ok);
  check("an agent cannot decline", !run({ ...drAct.decline("DR-0002", "Fully booked that month."), agentId: "x" }).ok);
  check("Stephen cannot decline or propose", !as("stephen", drAct.decline("DR-0002", "Fully booked that month.")).ok && !as("stephen", drAct.counter("DR-0002", [{ date: "2026-11-24", part: "full", start: "09:00", nurseId: "ciara" }])).ok);
  check("approve only suggested dates", !run(drAct.approve("DR-0002", [{ date: "2026-11-20", nurseId: "anita" }], true)).ok);
  check("approve needs a nurse", !run(drAct.approve("DR-0002", [{ date: "2026-11-17", nurseId: "" }], true)).ok);
  check("approve needs a free nurse", !run(drAct.approve("DR-0002", [{ date: "2026-11-17", nurseId: "nobody" }], true)).ok);
  check("approve needs at least one date", !run(drAct.approve("DR-0002", [], true)).ok);

  /* ---------- Neil approves Salesforce ---------- */
  const daysBefore = s.screeningDays.days.length, actBefore = s.activity.length;
  const ok = run(approveSf);
  check("Neil approves", ok.ok, ok.message);
  const sf = req("DR-0002");
  eq("request approved by Neil", [sf.status, sf.decidedBy, sf.dayIds.length], ["approved", "Neil Reddy", 1]);
  const sfDay = s.screeningDays.days.find((d) => d.id === sf.dayIds[0]);
  eq("screening day created and published", [sfDay.programmeId, sfDay.date, sfDay.status, sfDay.nurseId, sfDay.room, sfDay.contactName, sfDay.screen, sfDay.start, sfDay.end],
    ["PRG-SF-26", "2026-11-17", "published", "ciara", "Wellness Room 4.12, Level 4", "Emma Kinsella", "poc", "09:00", "16:30"]);
  check("clinic session created for the day", s.sessions.some((x) => x.id === sfDay.sessionId && x.nurseId === "ciara" && x.room === "Wellness Room 4.12, Level 4"));
  eq("one new day", s.screeningDays.days.length, daysBefore + 1);
  check("day history says where it came from", /DR-0002/.test(sfDay.history[0].summary) && sfDay.history.some((h) => h.kind === "published"));
  check("logged with who and when", sf.log.at(-1).kind === "approved" && sf.log.at(-1).by === "Neil Reddy" && sf.log.at(-1).at && /Ciara Nolan/.test(sf.log.at(-1).text));
  check("activity event written", s.activity.length > actBefore && s.activity.at(-1).verb === "dr.approved");
  check("client portal lists the confirmed day with the room", P.upcomingClinicDays(s, "PRG-SF-26").some((d) => d.date === "2026-11-17" && d.room.includes("Wellness Room 4.12") && d.isNew));
  eq("portal shows the approved request", M.drForProgramme(s, "PRG-SF-26")?.status, "approved");
  eq("calendar: tentative items gone, screening day shown", [cal().length, M.calendarEvents(s).some((e) => e.kind === "screening_day" && e.date === "2026-11-17" && !e.tentative)], [0, true]);
  eq("control panel row cleared", ctl().length, 0);
  eq("Ciara now busy on 17 Nov", M.drNurses(s, "2026-11-17", "09:00", "16:30").find((x) => x.staff.id === "ciara").free, false);
  check("cannot approve twice", !run(approveSf).ok);

  /* ---------- staff ask ---------- */
  check("Martina cannot ask", !as("martina", drAct.ask("PRG-SISK-26", 1, "2026-11-02", "2026-11-30", "lab")).ok);
  check("window must be in the future", !run(drAct.ask("PRG-SISK-26", 1, "2026-10-01", "2026-11-30", "lab")).ok);
  check("window end after start", !run(drAct.ask("PRG-SISK-26", 1, "2026-11-30", "2026-11-02", "lab")).ok);
  check("1 to 5 days", !run(drAct.ask("PRG-SISK-26", 6, "2026-11-02", "2026-11-30", "lab")).ok && !run(drAct.ask("PRG-SISK-26", 0, "2026-11-02", "2026-11-30", "lab")).ok);
  check("window must hold enough free days", !run(drAct.ask("PRG-SISK-26", 2, "2026-11-07", "2026-11-08", "lab")).ok);
  check("only one open request per client", !run(drAct.ask("PRG-IBM-26", 1, "2026-11-02", "2026-11-30", "lab")).ok);
  const ask = as("stephen", drAct.ask("PRG-SISK-26", 1, "2026-11-02", "2026-11-30", "poc", "One more day for site B."));
  check("Stephen asks Sisk", ask.ok && ask.id === "DR-0003", ask.message);
  const sk = req("DR-0003");
  eq("ask recorded", [sk.status, sk.askedBy, sk.contactName, sk.screen, sk.message], ["asked", "Stephen Kelly", "Róisín Hegarty", "poc", "One more day for site B."]);
  check("ask emits a simulated email event", s.activity.at(-1).verb === "dr.asked" && s.activity.at(-1).simulated === true);
  eq("Sisk portal now shows the request", M.drForProgramme(s, "PRG-SISK-26")?.status, "asked");
  check("asked requests are not on the calendar", cal().length === 0);

  /* ---------- client suggests ---------- */
  const pick = (date, part = "full", start = "09:00") => ({ date, part, start });
  check("needs at least one day", !run(drAct.suggest("DR-0001", [], "Room 3.01, Building C", "Gráinne Walsh")).ok);
  check("weekend refused", !run(drAct.suggest("DR-0001", [pick("2026-11-07")], "Room 3.01, Building C", "Gráinne Walsh")).ok);
  check("outside the window refused", !run(drAct.suggest("DR-0001", [pick("2026-12-01")], "Room 3.01, Building C", "Gráinne Walsh")).ok);
  check("up to days needed plus two", !run(drAct.suggest("DR-0001", ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16"].map((d) => pick(d)), "Room 3.01, Building C", "Gráinne Walsh")).ok);
  check("room needed", !run(drAct.suggest("DR-0001", [pick("2026-11-10")], "", "Gráinne Walsh")).ok);
  check("contact needed", !run(drAct.suggest("DR-0001", [pick("2026-11-10")], "Room 3.01, Building C", "")).ok);
  check("bad phone refused", !run(drAct.suggest("DR-0001", [pick("2026-11-10")], "Room 3.01, Building C", "Gráinne Walsh", "call me")).ok);
  check("bad start refused", !run(drAct.suggest("DR-0001", [pick("2026-11-10", "full", "13:00")], "Room 3.01, Building C", "Gráinne Walsh")).ok);
  const sug = run(drAct.suggest("DR-0001", [pick("2026-11-12", "morning", "09:30"), pick("2026-11-10")], "Room 3.01, Building C", "Gráinne Walsh", "087 555 0142", "Parking at the front."));
  check("IBM HR suggests dates (any persona: it is the client portal)", sug.ok, sug.message);
  const ib = req("DR-0001");
  eq("suggestion stored in date order", [ib.status, ib.picks.map((p) => p.date), ib.room, ib.siteContactName], ["suggested", ["2026-11-10", "2026-11-12"], "Room 3.01, Building C", "Gráinne Walsh"]);
  check("logged as the client", ib.log.at(-1).side === "client" && ib.log.at(-1).by === "Mairéad Costello");
  check("cannot suggest twice", !run(drAct.suggest("DR-0001", [pick("2026-11-10")], "Room 3.01, Building C", "Gráinne Walsh")).ok);
  eq("tentative items on the suggested days", cal().map((e) => e.date), ["2026-11-10", "2026-11-12"]);
  eq("control panel shows IBM", ctl().map((r) => r.req.id), ["DR-0001"]);

  /* ---------- journey stage 6 ---------- */
  const st = (j, id) => j.stages.find((x) => x.id === id);
  let ibm = J.journeyFor(s, "co-ibm");
  check("journey stage 6 opens the request to review", st(ibm, "day").actions.some((a) => a.kind === "go" && a.target.params.request === "DR-0001"));
  const sfJ = J.journeyFor(s, "co-sf");
  check("journey stage 6 offers Ask the client for dates", st(sfJ, "day").actions.some((a) => a.kind === "go" && a.target.params.askdates === "PRG-SF-26"));

  /* ---------- Neil proposes another date; the client accepts with one click ---------- */
  check("counter needs a free nurse", !run(drAct.counter("DR-0001", [{ ...pick("2026-11-06"), nurseId: "fiona" }])).ok);
  check("counter no more than days needed", !run(drAct.counter("DR-0001", ["2026-11-16", "2026-11-17", "2026-11-18"].map((d) => ({ ...pick(d), nurseId: "ciara" })))).ok);
  check("counter refuses a bank holiday", !run(drAct.counter("DR-0001", [{ ...pick("2026-12-25"), nurseId: "ciara" }])).ok);
  const ctr = run(drAct.counter("DR-0001", [{ ...pick("2026-11-24"), nurseId: "ciara" }, { ...pick("2026-11-25", "morning", "08:30"), nurseId: "liz" }], "The 10th is tight for us, these suit better."));
  check("Neil proposes other dates", ctr.ok, ctr.message);
  eq("countered with nurses", [req("DR-0001").status, req("DR-0001").counter.picks.map((p) => [p.date, p.nurseId])], ["countered", [["2026-11-24", "ciara"], ["2026-11-25", "liz"]]]);
  eq("calendar shows the proposed dates", cal().map((e) => [e.date, e.status]), [["2026-11-24", "Waiting for the client"], ["2026-11-25", "Waiting for the client"]]);
  eq("control panel no longer waits on Neil", ctl().length, 0);
  check("approve refused while countered", !run(drAct.approve("DR-0001", [{ date: "2026-11-10", nurseId: "ciara" }], true)).ok);
  const daysN = s.screeningDays.days.length;
  const acc = run(drAct.acceptCounter("DR-0001"));
  check("client accepts with one click", acc.ok, acc.message);
  const ibDays = req("DR-0001").dayIds.map((id) => s.screeningDays.days.find((d) => d.id === id));
  eq("two published days with the client's room", ibDays.map((d) => [d.date, d.status, d.nurseId, d.room, d.start, d.end]),
    [["2026-11-24", "published", "ciara", "Room 3.01, Building C", "09:00", "16:30"], ["2026-11-25", "published", "liz", "Room 3.01, Building C", "08:30", "12:30"]]);
  eq("days added", s.screeningDays.days.length, daysN + 2);
  check("accepted is logged as the client", req("DR-0001").log.at(-1).kind === "accepted" && req("DR-0001").log.at(-1).side === "client");
  check("portal lists both days", ["2026-11-24", "2026-11-25"].every((d) => P.upcomingClinicDays(s, "PRG-IBM-26").some((x) => x.date === d && x.room.includes("Room 3.01"))));
  check("cannot accept twice", !run(drAct.acceptCounter("DR-0001")).ok);

  /* ---------- suggest other dates, then decline ---------- */
  run(drAct.suggest("DR-0003", [pick("2026-11-10")], "Site office, Block B", "Pádraig Ryan"));
  run(drAct.counter("DR-0003", [{ ...pick("2026-11-11"), nurseId: "aisling" }]));
  const back = run(drAct.rejectCounter("DR-0003"));
  check("client can ask to suggest other dates", back.ok && req("DR-0003").status === "asked");
  check("decline needs a reason", !run(drAct.decline("DR-0003", "no")).ok);
  const dec = run(drAct.decline("DR-0003", "We are fully booked in November. We will be in touch about January."));
  check("Neil declines with a reason", dec.ok && req("DR-0003").status === "declined" && /January/.test(req("DR-0003").declineReason));
  eq("client portal shows the decline", M.drForProgramme(s, "PRG-SISK-26")?.status, "declined");
  check("cannot decline twice", !run(drAct.decline("DR-0003", "Fully booked in November.")).ok);
  check("a new request can follow a declined one", as("stephen", drAct.ask("PRG-SISK-26", 1, "2027-01-11", "2027-01-29", "lab")).ok);

  /* ---------- approve as draft ---------- */
  run(drAct.suggest("DR-0004", [pick("2027-01-12")], "Site office, Block B", "Pádraig Ryan"));
  check("bank holidays in 2027 are known", M.drDayInfo(s, "2027-03-17", null).state === "holiday" && M.drDayInfo(s, "2027-03-29", null).state === "holiday");
  const dr = run(drAct.approve("DR-0004", [{ date: "2027-01-12", nurseId: "aisling" }], false));
  check("approve as draft", dr.ok && s.screeningDays.days.find((d) => d.id === req("DR-0004").dayIds[0]).status === "draft");
  check("draft day is not on the client portal", !P.upcomingClinicDays(s, "PRG-SISK-26").some((d) => d.date === "2027-01-12"));
  check("draft day is tentative on the calendar", M.calendarEvents(s).some((e) => e.kind === "screening_day" && e.date === "2027-01-12" && e.tentative));

  /* ---------- replay: the action log rebuilds the same state ---------- */
  check("state survives a structured clone (persistable)", JSON.stringify(structuredClone(s.dateRequests)) === JSON.stringify(s.dateRequests));
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
