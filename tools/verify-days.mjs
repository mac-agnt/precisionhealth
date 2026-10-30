// Checks for Screening days (Clinics, Screening days) and the client portal figures it feeds:
// the agent's parsing of requests, edits and HR emails, saving into real clinic sessions, publish,
// history, and live client portal counts. Usage: node tools/verify-days.mjs
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
  await server.ssrLoadModule("/src/ph/pages/Clinics/daysActions.ts");
  const P = await server.ssrLoadModule("/src/ph/pages/ClientPortal/data.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const ctx = () => ({ today: M.today(s), staff: s.staff, sessions: s.sessions, days: s.screeningDays.days });
  const day = (id) => s.screeningDays.days.find((d) => d.id === id);
  const sess = (id) => s.sessions.find((x) => x.id === id);

  /* ---------- seed ---------- */
  eq("three seeded days", s.screeningDays.days.map((d) => [d.id, d.programmeId, d.date, d.screen, d.status]), [
    ["SD-0001", "PRG-IBM-26", "2026-11-06", "lab", "published"], ["SD-0002", "PRG-SF-26", "2026-11-11", "poc", "published"], ["SD-0003", "PRG-IBM-26", "2026-11-19", "poc", "draft"]]);
  check("every seeded day has its clinic session", s.screeningDays.days.every((d) => sess(d.sessionId)));
  eq("IBM 6 Nov session slots and breaks", [M.sessionSlots(sess("CLN-IBM-20261106")).length, sess("CLN-IBM-20261106").breaks, sess("CLN-IBM-20261106").room],
    [24, [{ start: "10:30", end: "10:45" }, { start: "12:30", end: "13:00" }, { start: "14:30", end: "14:45" }], "Training Room 1, Building A"]);
  check("point of care day uses the POC form", M.sessionUsesPoc(sess("CLN-SF-20261111")) && !M.sessionUsesPoc(sess("CLN-IBM-20261106")));
  check("seeded sessions do not clash", M.scheduleOverlaps(s).length === 0, JSON.stringify(M.scheduleOverlaps(s)));
  check("new nurses on the nursing team", ["aisling", "ciara"].every((id) => s.staff.find((x) => x.id === id)?.role === "clinical_capture"));

  /* ---------- the agent: full request ---------- */
  const full = M.draftFromRequest(M.EXAMPLE_REQUEST, ctx());
  const f = full.form;
  eq("example: who and when", [f.programmeId, f.date, f.screen, f.nurseId], ["PRG-IBM-26", "2026-11-06", "lab", "aisling"]);
  eq("example: times", [f.start, f.end, f.breaks.first, f.breaks.lunch, f.breaks.afternoon], ["09:00", "16:30", { start: "10:30", minutes: 15 }, { start: "12:30", minutes: 30 }, { start: "14:30", minutes: 15 }]);
  eq("example: appointments", [f.appointments, f.slotMinutes, M.dayFit(f)], [20, 15, 26]);
  eq("example: room and logistics", [f.room, f.parking, f.notes], ["Room 2.14, Building B", "Parking at the front", "Bring the centrifuge."]);
  check("example: nothing assumed or needed", Object.values(full.source).every((x) => x === "said"), JSON.stringify(full.source));
  check("example: notes the second IBM room that day", full.notes.some((n) => /already has a day on 6 Nov/.test(n)));
  eq("example: valid", M.dayErrors(f, { today: M.today(s), sessions: s.sessions, staff: s.staff }), {});

  /* ---------- the agent: short request ---------- */
  const short = M.draftFromRequest("IBM, 6 November", ctx());
  eq("short: said", [short.source.programmeId, short.source.date], ["said", "said"]);
  eq("short: assumed", ["screen", "start", "end", "first", "lunch", "afternoon", "appointments", "slotMinutes"].map((k) => short.source[k]), Array(8).fill("assumed"));
  eq("short: needs a person", [short.source.nurseId, short.source.room], ["needed", "needed"]);
  eq("short: standard day", [short.form.start, short.form.end, short.form.appointments], ["09:00", "16:15", 25]);
  check("short: names free nurses", /Free that day: .*Aisling/.test(short.why.nurseId));
  check("short: cannot save without a nurse", !!M.dayErrors(short.form, { today: M.today(s), sessions: s.sessions, staff: s.staff }).nurseId);

  /* ---------- variations ---------- */
  const v1 = M.draftFromRequest("Salesforce on November 20th, point of care, 8:30 to 1pm, no lunch, 14 people, 20 minute appointments, nurse Ciara, boardroom", ctx());
  eq("variation parsed", [v1.form.programmeId, v1.form.date, v1.form.screen, v1.form.start, v1.form.end, v1.form.breaks.lunch, v1.form.appointments, v1.form.slotMinutes, v1.form.nurseId, v1.form.room],
    ["PRG-SF-26", "2026-11-20", "poc", "08:30", "13:00", null, 14, 20, "ciara", "Boardroom"]);
  const v2 = M.draftFromRequest("sisk 3/12 bloods, nurse Bridget", ctx());
  eq("unknown nurse needs a person", [v2.form.programmeId, v2.form.date, v2.form.nurseId, v2.source.nurseId], ["PRG-SISK-26", "2026-12-03", "", "needed"]);
  check("unknown nurse is named", /no nurse called Bridget/.test(v2.why.nurseId));
  const v3 = M.draftFromRequest("IBM 6 Nov, 30 appointments", ctx());
  check("too many appointments flagged", /only 25 fit/.test(v3.notes.join(" ")) && !!M.dayErrors({ ...v3.form, nurseId: "aisling" }, { today: M.today(s), staff: s.staff }).appointments);

  /* ---------- validation ---------- */
  const base = { ...f };
  const err = (patch) => M.dayErrors({ ...base, ...patch }, { today: M.today(s), sessions: s.sessions, staff: s.staff });
  check("finish before start rejected", !!err({ end: "08:00" }).end);
  check("break before the day rejected", !!err({ breaks: { ...base.breaks, first: { start: "08:30", minutes: 15 } } }).first);
  check("break after finish rejected", !!err({ breaks: { ...base.breaks, afternoon: { start: "16:25", minutes: 15 } } }).afternoon);
  check("overlapping breaks rejected", !!err({ breaks: { ...base.breaks, lunch: { start: "10:35", minutes: 30 } } }).lunch);
  check("past date rejected", !!err({ date: "2026-09-01" }).date);
  check("busy nurse rejected", /already at IBM/.test(err({ nurseId: "fiona" }).nurseId || ""));
  check("room clash rejected", !!err({ room: "Training Room 1, Building A" }).room);

  /* ---------- save creates a real clinic session ---------- */
  const before = s.sessions.length;
  check("participant preview cannot save", (() => { run(act.setPersona("participant")); const r = run({ type: "days/save", form: f, via: "agent" }); run(act.setPersona("neil")); return !r.ok; })());
  check("martina cannot save", (() => { run(act.setPersona("martina")); const r = run({ type: "days/save", form: f, via: "agent" }); run(act.setPersona("neil")); return !r.ok; })());
  const r1 = run({ type: "days/save", form: f, via: "agent" });
  check("neil saves the agent's draft", r1.ok && r1.id === "SD-0004", JSON.stringify(r1));
  const d4 = day("SD-0004");
  eq("new day is a draft with a new session", [d4.status, d4.sessionId, s.sessions.length - before], ["draft", "CLN-IBM-20261106-2", 1]);
  const ss = sess(d4.sessionId);
  eq("session carries the day", [ss.programmeId, ss.date, ss.room, ss.nurseId, ss.start, ss.end, ss.slotMinutes, M.sessionSlots(ss).length, ss.logistics.screeningType, ss.logistics.parking, ss.status],
    ["PRG-IBM-26", "2026-11-06", "Room 2.14, Building B", "aisling", "09:00", "16:30", 15, 20, "Bloods", "Parking at the front", "scheduled"]);
  eq("session breaks", ss.breaks, [{ start: "10:30", end: "10:45" }, { start: "12:30", end: "13:00" }, { start: "14:30", end: "14:45" }]);
  eq("first and last slot", [M.sessionSlots(ss)[0].start, M.sessionSlots(ss)[19].start], ["09:00", "14:45"]);
  check("no lunch slot", !M.sessionSlots(ss).some((x) => x.start >= "12:30" && x.start < "13:00"));
  check("IBM capacity grows by 20", M.programmeCounts(s, "PRG-IBM-26").capacity === 144);
  check("created logged in history and activity", d4.history[0].kind === "created" && d4.history[0].via === "agent" && s.activity[s.activity.length - 1].verb === "days.created");
  check("draft not on the client portal", !P.upcomingClinicDays(s, "PRG-IBM-26").some((x) => x.id === d4.sessionId));
  check("same day twice is refused (nurse busy)", !run({ type: "days/save", form: f, via: "agent" }).ok);

  /* ---------- plain English edits ---------- */
  const ectx = () => ({ ...ctx(), ownSessionId: day("SD-0004").sessionId });
  const e1 = M.editFromInstruction("move lunch to 1pm", M.formOf(day("SD-0004")), ectx());
  eq("edit lunch", e1.changes.map((c) => [c.label, c.from, c.to]), [["Lunch", "12:30 to 13:00 (30 min)", "13:00 to 13:30 (30 min)"]]);
  check("confirm lunch edit", run({ type: "days/save", dayId: "SD-0004", form: e1.form, via: "agent" }).ok);
  eq("session lunch moved", sess("CLN-IBM-20261106-2").breaks[1], { start: "13:00", end: "13:30" });
  const e2 = M.editFromInstruction("change the nurse to Ciara", M.formOf(day("SD-0004")), ectx());
  eq("edit nurse", e2.changes.map((c) => c.to), ["Ciara Nolan"]);
  run({ type: "days/save", dayId: "SD-0004", form: e2.form, via: "agent" });
  eq("session nurse", sess("CLN-IBM-20261106-2").nurseId, "ciara");
  eq("edit finish", M.editFromInstruction("finish at 5", M.formOf(day("SD-0004")), ectx()).form.end, "17:00");
  eq("edit point of care", M.editFromInstruction("make it point of care", M.formOf(day("SD-0004")), ectx()).form.screen, "poc");
  eq("edit room", M.editFromInstruction("room 3.01", M.formOf(day("SD-0004")), ectx()).form.room, "Room 3.01");
  const shorter = M.editFromInstruction("finish at 2pm", M.formOf(day("SD-0004")), ectx());
  check("shorter day trims appointments and says so", shorter.form.appointments === M.dayFit(shorter.form) && shorter.notes.some((n) => /Only \d+ appointments fit now/.test(n)));
  check("nonsense is not understood", !M.editFromInstruction("hello there", M.formOf(day("SD-0004")), ectx()).understood);
  check("unchanged save refused", !run({ type: "days/save", dayId: "SD-0004", form: M.formOf(day("SD-0004")), via: "form" }).ok);
  const hist = day("SD-0004").history;
  eq("history logs who and what", [hist.length, hist[1].by, hist[1].changes[0].label, hist[2].changes[0].to], [3, "Neil Reddy", "Lunch", "Ciara Nolan"]);

  /* ---------- HR email ---------- */
  const d3 = day("SD-0003");
  const mail = M.sampleHrReply(d3, "Mairéad Costello");
  const hr = M.readHrReply(mail, M.formOf(d3), ctx());
  eq("HR reply read", [hr.form.date, hr.form.room, hr.form.contactName, hr.form.contactPhone], ["2026-11-19", "Room 3.01, Building C", "Gráinne Walsh", "087 555 0142"]);
  check("HR reply shows what it found", hr.found.length >= 4);
  check("publish blocked until the room is confirmed", !run({ type: "days/publish", dayId: "SD-0003" }).ok);
  check("confirm HR reply", run({ type: "days/save", dayId: "SD-0003", form: hr.form, via: "hr_email" }).ok);
  eq("HR reply on the session", [sess(d3.sessionId).room, sess(d3.sessionId).logistics.contactName], ["Room 3.01, Building C", "Gráinne Walsh"]);
  eq("HR reply in history", day("SD-0003").history.at(-1).kind, "hr_reply");
  const hr2 = M.readHrReply("Hi, we can do Friday 20 November instead, in the Boardroom. Ask for Tom Byrne at reception on 01 555 0199.", M.formOf(day("SD-0003")), ctx());
  eq("free-text HR reply", [hr2.form.date, hr2.form.room, hr2.form.contactName, hr2.form.contactPhone], ["2026-11-20", "Boardroom", "Tom Byrne", "01 555 0199"]);
  check("date change is pointed out", hr2.notes.some((n) => /not 19 Nov/.test(n)));

  /* ---------- publish ---------- */
  check("publish", run({ type: "days/publish", dayId: "SD-0003" }).ok);
  eq("published by and status", [day("SD-0003").status, day("SD-0003").publishedBy, sess(d3.sessionId).logistics.status], ["published", "Neil Reddy", "Ready to go"]);
  check("publish logged", day("SD-0003").history.at(-1).kind === "published" && s.activity.at(-1).verb === "days.published");
  const portal = P.upcomingClinicDays(s, "PRG-IBM-26");
  const p19 = portal.find((x) => x.id === d3.sessionId);
  check("published day on the client portal", !!p19 && p19.room === "Room 3.01, Building C" && p19.poc && p19.start === "09:00" && p19.end === "16:15", JSON.stringify(p19));
  check("publishing the new day too", run({ type: "days/publish", dayId: "SD-0004" }).ok && P.upcomingClinicDays(s, "PRG-IBM-26").some((x) => x.id === "CLN-IBM-20261106-2"));
  check("unpublish takes it off", run({ type: "days/unpublish", dayId: "SD-0004" }).ok && !P.upcomingClinicDays(s, "PRG-IBM-26").some((x) => x.id === "CLN-IBM-20261106-2"));
  check("portal days carry no names", portal.every((x) => Object.keys(x).every((k) => ["id", "date", "site", "room", "slots", "available", "isToday", "start", "end", "poc", "added", "isNew"].includes(k))));

  /* ---------- client portal counts are live ---------- */
  const tile = (pid, key) => P.programmeFunnel(s, pid).tiles.find((t) => t.key === key).value;
  const rel0 = tile("PRG-SISK-26", "released");
  check("release one in review", run(act.releaseRoutine("PH-E-0101")).ok);
  eq("released count follows the release", [rel0, tile("PRG-SISK-26", "released")], ["126", "127"]);
  eq("other counts", ["invited", "booked", "attended"].map((k) => tile("PRG-SISK-26", k)), ["500", "240", "150"]);

  /* ---------- manual form with bookings protects booked people ---------- */
  run(act.setPersona("brenda"));
  const movable = s.bookings.find((b) => b.programmeId === "PRG-IBM-26" && b.status === "confirmed" && b.attendance === "booked" && b.sessionId === "CLN-IBM-20261012");
  const bk = movable ? run(act.rescheduleBooking(movable.id, "CLN-IBM-20261106-2", "09:00")) : { ok: false, message: "no movable IBM booking" };
  check("booked count shows on the day", M.activeBookings(s, "CLN-IBM-20261106-2").length === 1);
  if (bk.ok) {
    const lateStart = { ...M.formOf(day("SD-0004")), start: "09:30" };
    check("edit that drops a booked slot is refused", !run({ type: "days/save", dayId: "SD-0004", form: lateStart, via: "form" }).ok);
  } else check("booking on the new day", false, bk.message);
  run(act.setPersona("neil"));

  /* ---------- reset ---------- */
  s = createInitialState();
  eq("reset restores three days", s.screeningDays.days.length, 3);
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack || e);
} finally {
  await server.close();
}
console.log(`\n${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
