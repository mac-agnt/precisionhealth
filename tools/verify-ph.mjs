// Targeted checks for the Precision Health demo model: baseline arithmetic and the
// state transitions in the brief. No test framework and no new dependency: the model is
// loaded through Vite's SSR loader.  Usage: node tools/verify-ph.mjs
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
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };

  /* ---------- baseline arithmetic ---------- */
  const T = M.totalCounts(s);
  eq("invited", T.invited, 850); eq("capacity", T.capacity, 475); eq("booked", T.booked, 365); eq("attended", T.attended, 225);
  eq("upcoming", T.upcoming, 140); eq("released", T.released, 184); eq("ready", T.ready, 21); eq("awaiting", T.awaiting, 15); eq("held", T.onHold, 5);
  eq("not started", T.notStarted, 480); eq("drafts", T.drafts, 5);
  eq("states partition", T.released + T.ready + T.awaiting + T.onHold, T.episodes);
  eq("booked pct", Math.round(T.bookedPct * 10) / 10, 76.8);
  const P = (id) => M.programmeCounts(s, id);
  eq("sisk", [P("PRG-SISK-26").invited, P("PRG-SISK-26").capacity, P("PRG-SISK-26").booked, P("PRG-SISK-26").attended, P("PRG-SISK-26").released, P("PRG-SISK-26").ready, P("PRG-SISK-26").awaiting, P("PRG-SISK-26").onHold], [500, 300, 240, 150, 126, 12, 9, 3]);
  eq("sf", [P("PRG-SF-26").invited, P("PRG-SF-26").capacity, P("PRG-SF-26").booked, P("PRG-SF-26").attended, P("PRG-SF-26").released, P("PRG-SF-26").ready, P("PRG-SF-26").awaiting, P("PRG-SF-26").onHold], [200, 100, 80, 50, 40, 6, 3, 1]);
  eq("ibm", [P("PRG-IBM-26").invited, P("PRG-IBM-26").capacity, P("PRG-IBM-26").booked, P("PRG-IBM-26").attended, P("PRG-IBM-26").released, P("PRG-IBM-26").ready, P("PRG-IBM-26").awaiting, P("PRG-IBM-26").onHold], [150, 75, 45, 25, 18, 3, 3, 1]);
  eq("sessions", [s.sessions.length, s.sessions.filter((x) => x.programmeId === "PRG-SISK-26").length, s.sessions.filter((x) => x.programmeId === "PRG-SF-26").length, s.sessions.filter((x) => x.programmeId === "PRG-IBM-26").length], [19, 12, 4, 3]);
  check("25 slots per session", s.sessions.every((x) => M.sessionSlots(x).length === 25));
  const slots = M.sessionSlots(s.sessions[0]);
  check("breaks not bookable", !slots.some((x) => ["10:30", "12:30", "12:45", "14:30"].includes(x.start)) && slots.some((x) => x.start === "10:45") && slots.some((x) => x.start === "13:00"));
  check("no slot starts inside a break", slots.every((x) => !(x.start >= "10:30" && x.start < "10:45") && !(x.start >= "12:30" && x.start < "13:00") && !(x.start >= "14:30" && x.start < "14:45")));
  eq("first and last slot", [slots[0].start, slots[24].start, slots[24].end], ["09:00", "16:00", "16:15"]);
  const D = M.todayStats(s);
  eq("today", [D.booked, D.capacity, D.available, Math.round(D.pct)], [45, 75, 30, 60]);
  eq("today per clinic", M.todaySessions(s).map((x) => M.sessionStats(s, x.id).booked).sort(), [10, 15, 20]);
  eq("today checked in", [D.checkedIn, D.completed], [0, 0]);
  const B = M.batchStats(s, "BATCH-20261002-01");
  eq("batch rows", [B.rows, B.imported, B.duplicates, B.quarantined, B.specimens], [120, 114, 3, 3, 24]);
  const R = M.reminderStats(s);
  eq("reminders", [R.logical, R.delivered, R.failed, R.attempts], [45, 43, 2, 47]);
  const RS = M.reviewStats(s);
  eq("review", [RS.ready, RS.routine, RS.flagged, RS.aged], [21, 14, 7, 6]);
  const H = M.holdCounts(s);
  eq("holds", [H.total, H.identity, H.dataQuality, H.clinicalAction], [5, 3, 1, 1]);
  eq("held people", M.holdQueue(s).map((h) => h.person.family).sort(), ["Daly", "Doyle", "Keane", "Quinn", "Ryan"]);

  /* employer cohort */
  const rep = s.employerReports[0];
  const met = M.employerMetrics(s, rep.programmeId, rep.cohort, rep.dataAsOf);
  eq("sisk cohort", met.size, 126);
  eq("age bands", met.breakdowns[0].cells.map((c) => c.count), [28, 29, 38, 31]);
  eq("age total", met.breakdowns[0].cells.reduce((n, c) => n + c.count, 0), 126);
  eq("overall attendance vs eligible", [met.attendedOverall, met.reportEligible], [150, 126]);
  const six = M.employerMetrics(s, rep.programmeId, { ...rep.cohort, site: "Sisk Dublin Site B", ageBand: "55+" }, rep.dataAsOf);
  eq("six-person cohort", [six.size, six.blocked, six.breakdowns.length, six.clinical.length], [6, true, 0, 0]);
  const g = met.breakdowns.find((b) => b.id === "gender").cells;
  check("gender suppressed without counts", g.filter((c) => c.suppressed).every((c) => c.count === null) && g.some((c) => c.suppressed));
  const sx = met.breakdowns.find((b) => b.id === "sex").cells;
  check("complementary suppression on sex", sx.filter((c) => c.suppressed).length >= 2 && sx.some((c) => c.complementary));
  check("no hidden count leaks in JSON", !JSON.stringify(six).includes('"count"'));

  /* named cases */
  const ep = (id) => s.episodes.find((e) => e.id === id);
  eq("aisling", [ep("PH-E-0101").personId, ep("PH-E-0101").reportState], ["PH-P-0001", "ready_for_review"]);
  eq("aisling BMI", M.bmiOf(ep("PH-E-0101").capture), 22.5);
  check("aisling routine", M.routineEligibility(s, ep("PH-E-0101")).ok);
  const ronanObs = M.latestObservations(s, "PH-E-0201").find((o) => o.code === "LDL");
  eq("ronan ldl", [ronanObs.value, ronanObs.limitText, ronanObs.flag], [3.2, "<3.0", "review_required"]);
  check("ronan not routine", !M.routineEligibility(s, ep("PH-E-0201")).ok);
  eq("holds by person", ["PH-E-0102", "PH-E-0202", "PH-E-0301", "PH-E-0103", "PH-E-0104"].map((id) => ep(id).hold.kind),
    ["identity_dob_mismatch", "identity_unknown_specimen", "identity_candidates", "urgent_follow_up", "source_unit_discrepancy"]);
  check("orla is a draft and not booked", s.memberships.find((m) => m.personId === "PH-P-0801").stage === "onboarding");
  eq("reminder failures programme", s.messages.filter((m) => m.status === "failed").map((m) => m.programmeId || s.persons.find((p) => p.id === m.personId).programmeId).sort(), ["PRG-SF-26", "PRG-SISK-26"]);
  check("failed reminder people are booked", s.messages.filter((m) => m.status === "failed").every((m) => s.memberships.find((x) => x.personId === m.personId).consent === "complete"));
  check("stories all open at baseline", M.storyViews(s).every((x) => x.open));
  check("synthetic emails only", s.persons.every((p) => /@example\.(com|invalid)$/.test(p.email)));

  /* ---------- permissions ---------- */
  run(act.setPersona("brenda"));
  check("brenda cannot release", !run(act.releaseReport("PH-E-0101")).ok);
  check("brenda cannot see clinical", !M.can(s, "clinical.view"));
  check("brenda cannot start correction", !run(act.startCorrection("PH-E-0105", "Reason text here")).ok);
  check("clinical task hidden from brenda", M.visibleTasks(s).every((t) => !t.task.clinical));
  check("story ST-04 minimal for brenda", M.storyView(s, "ST-04").headline === "Clinical action assigned");
  check("brenda search hides episodes", M.globalSearch(s, "PH-E-0101").every((h) => h.group !== "Episodes"));
  check("brenda onto hides clinical nodes", M.ontologyModel(s).entities.every((e) => !e.clinical));
  run(act.setPersona("neil"));
  check("neil sees clinical", M.can(s, "clinical.review"));

  /* ---------- Ciara resolution and re-upload ---------- */
  const rePre = M.reuploadPreview(s, "BATCH-20261002-01");
  eq("re-upload baseline", [rePre.alreadySeen, rePre.unresolved, rePre.newRows], [117, 3, 0]);
  // The count was 1088 when every episode had only the five core results. With the full Comprehensive
  // panel the baseline holds more observations, so the re-upload is checked against the count before it.
  const obsBeforeReupload = s.observations.length;
  run(act.loadSampleCsv("BATCH-20261002-01"));
  const c1 = run(act.commitImportPreview());
  check("commit preview ok", c1.ok);
  check("second commit blocked", !run(act.commitImportPreview()).ok);
  eq("no new observations", s.observations.length, obsBeforeReupload);
  const ciaraRow = s.importRows.find((r) => r.quarantine?.reason === "dob_mismatch");
  run(act.setPersona("fiona"));
  check("fiona cannot resolve identity", !run(act.resolveRow(ciaraRow.id, "PH-E-0102", ["specimen", "dob"], "Verified with requisition")).ok);
  run(act.setPersona("brenda"));
  check("one identifier is not enough", !run(act.resolveRow(ciaraRow.id, "PH-E-0102", ["specimen"], "Verified with requisition")).ok);
  check("reason required", !run(act.resolveRow(ciaraRow.id, "PH-E-0102", ["specimen", "dob"], "")).ok);
  const res = run(act.resolveRow(ciaraRow.id, "PH-E-0102", ["specimen", "dob"], "DOB and specimen ID confirmed against the collection record."));
  check("ciara resolved", res.ok, res.message);
  const B2 = M.batchStats(s, "BATCH-20261002-01");
  eq("batch after ciara", [B2.imported, B2.duplicates, B2.quarantined], [115, 3, 2]);
  eq("ciara ready", s.episodes.find((e) => e.id === "PH-E-0102").reportState, "ready_for_review");
  eq("totals after ciara", [M.totalCounts(s).ready, M.totalCounts(s).onHold, M.programmeCounts(s, "PRG-SISK-26").ready], [22, 4, 13]);
  check("resolution is documented", s.importRows.find((r) => r.id === ciaraRow.id).resolution.reason.length > 5 && s.activity[s.activity.length - 1].verb === "import.resolved");
  check("row committed once", !run(act.resolveRow(ciaraRow.id, "PH-E-0102", ["specimen", "dob"], "Duplicate click should fail")).ok && s.observations.filter((o) => o.source.rowId === ciaraRow.id).length === 1);
  const rePost = M.reuploadPreview(s, "BATCH-20261002-01");
  eq("re-upload after ciara", [rePost.alreadySeen, rePost.unresolved, rePost.newRows], [118, 2, 0]);
  eq("story ST-01 still open", M.storyView(s, "ST-01").open, true);
  const niamhRow = s.importRows.find((r) => r.quarantine?.reason === "unknown_specimen");
  check("wrong episode rejected", !run(act.resolveRow(niamhRow.id, "PH-E-0102", ["specimen", "dob"], "Wrong episode chosen on purpose")).ok);
  const eoinRow = s.importRows.find((r) => r.quarantine?.reason === "multiple_candidates");
  check("eoin has two candidates", eoinRow.quarantine.candidateEpisodeIds.length === 2);
  check("resolve niamh", run(act.resolveRow(niamhRow.id, "PH-E-0202", ["specimen", "dob"], "Corrected O to zero and confirmed DOB.")).ok);
  check("resolve eoin", run(act.resolveRow(eoinRow.id, "PH-E-0301", ["specimen", "dob"], "Picked the episode matching the requisition.")).ok);
  eq("story ST-01 resolved", M.storyView(s, "ST-01").open, false);
  s = createInitialState();

  /* ---------- Aisling release, Ronan, portal ---------- */
  run(act.setPersona("neil"));
  check("release blocked without checklist", !run(act.releaseReport("PH-E-0101")).ok);
  run(act.setAdvice("PH-E-0101", "Sample advice for demonstration."));
  run(act.toggleReviewCheck("PH-E-0101", "advice"));
  run(act.toggleReviewCheck("PH-E-0101", "preview"));
  check("aisling released", run(act.releaseReport("PH-E-0101")).ok);
  eq("totals after release", [M.totalCounts(s).released, M.totalCounts(s).ready], [185, 20]);
  eq("review stats after release", [M.reviewStats(s).ready, M.reviewStats(s).routine], [20, 13]);
  check("release is idempotent", !run(act.releaseReport("PH-E-0101")).ok && M.currentReleased(s, "PH-E-0101") && s.reportVersions.filter((v) => v.episodeId === "PH-E-0101").length === 1);
  check("release event", s.activity.some((e) => e.summary === "Neil released report PH-E-0101 v1."));
  check("availability notice has no results", s.messages.filter((m) => m.episodeId === "PH-E-0101").every((m) => !/\d/.test(m.subject)));
  check("report access separate from delivery", M.currentReleased(s, "PH-E-0101").accessedAt === null);
  check("staff view is not logged as participant access", !run(act.viewReportInPortal("PH-E-0101")).ok && M.currentReleased(s, "PH-E-0101").accessedAt === null);
  run(act.setPortalPerson("PH-P-0002")); run(act.setPersona("participant"));
  check("participant cannot open another person's report", !run(act.viewReportInPortal("PH-E-0101")).ok);
  run(act.setPortalPerson("PH-P-0001"));
  run(act.viewReportInPortal("PH-E-0101"));
  check("access recorded", !!M.currentReleased(s, "PH-E-0101").accessedAt);
  run(act.setPersona("neil"));
  check("routine shortcut blocked for ronan", !run(act.releaseRoutine("PH-E-0201")).ok);
  check("routine shortcut blocked for held", !run(act.releaseRoutine("PH-E-0103")).ok);
  run(act.setAdvice("PH-E-0201", "Sample advice. Please discuss with your GP."));
  run(act.toggleReviewCheck("PH-E-0201", "advice"));
  run(act.toggleReviewCheck("PH-E-0201", "preview"));
  check("ronan release needs flag acknowledgement", !run(act.releaseReport("PH-E-0201")).ok);
  run(act.ackFlags("PH-E-0201"));
  check("ronan released after acknowledgement", run(act.releaseReport("PH-E-0201")).ok);
  eq("ronan release mode", M.currentReleased(s, "PH-E-0201").releaseMode, "individual");
  const routine = M.reviewQueue(s).find((i) => i.routine);
  check("one-click routine release", run(act.releaseRoutine(routine.episode.id)).ok && M.currentReleased(s, routine.episode.id).releaseMode === "routine");

  /* correction */
  check("correction needs a released episode", !run(act.startCorrection("PH-E-0102", "A reason that is long enough")).ok);
  check("correction start", run(act.startCorrection("PH-E-0101", "Unit label corrected on the participant report.")).ok);
  eq("v1 untouched during correction", M.currentReleased(s, "PH-E-0101").version, 1);
  check("correction release needs re-review", !run(act.releaseCorrection("PH-E-0101")).ok);
  run(act.setAdvice("PH-E-0101", "Corrected sample advice."));
  run(act.toggleReviewCheck("PH-E-0101", "advice"));
  run(act.toggleReviewCheck("PH-E-0101", "preview"));
  run(act.toggleReviewCheck("PH-E-0101", "rereview"));
  check("correction released", run(act.releaseCorrection("PH-E-0101")).ok);
  eq("v1 superseded v2 released", M.versionsOf(s, "PH-E-0101").map((v) => v.status), ["superseded", "released"]);
  s = createInitialState();

  /* ---------- follow-up ---------- */
  run(act.setPersona("neil"));
  check("attempt keeps it open", run(act.logAttempt("FU-0001", "phone", "no_answer", "")).ok && s.followUps[0].status === "open");
  check("cannot close without acknowledgement", !run(act.closeFollowUp("FU-0001", "reached_advice_given", "Spoke with the participant", false)).ok);
  check("cannot close with a bogus outcome", !run(act.closeFollowUp("FU-0001", "sms_delivered", "Delivered SMS", true)).ok);
  check("reached outcome needs a spoke attempt", !run(act.closeFollowUp("FU-0001", "reached_advice_given", "Spoke with the participant", true)).ok);
  run(act.logAttempt("FU-0001", "phone", "spoke", "Reached"));
  check("closes with outcome", run(act.closeFollowUp("FU-0001", "reached_advice_given", "Spoke with the participant and gave advice", true)).ok);
  eq("maeve moved on", ep("PH-E-0103").reportState, "ready_for_review");
  s = createInitialState();
  run(act.setPersona("brenda"));
  check("brenda cannot act on follow-up", !run(act.logAttempt("FU-0001", "phone", "no_answer", "")).ok);

  /* ---------- reminders ---------- */
  run(act.setPersona("brenda"));
  const failed = M.failedReminders(s)[0];
  check("retry ok", run(act.retryReminder(failed.id)).ok);
  const R2 = M.reminderStats(s);
  eq("reminders after retry", [R2.logical, R2.delivered, R2.failed, R2.attempts], [45, 44, 1, 48]);
  check("retry idempotent", !run(act.retryReminder(failed.id)).ok && M.reminderStats(s).delivered === 44);
  eq("booking counts unchanged by retry", M.totalCounts(s).booked, 365);
  s = createInitialState();

  /* ---------- Orla: onboarding to booking to appointment ---------- */
  const ibmToday = M.todaySessions(s).find((x) => x.programmeId === "PRG-IBM-26");
  const free = M.freeSlots(s, ibmToday.id);
  eq("ibm free slots", free.length, 15);
  const slot = free.find((f) => f.start === "11:15") || free[5];
  check("staff without bookings.manage cannot book", !run(act.setPersona("martina")) || !run(act.createBooking("PH-P-0802", ibmToday.id, slot.start)).ok);
  run(act.setPersona("participant"));
  check("participant cannot act for another person", !run(act.portalSaveDraft("PH-P-0802", 5, {})).ok && !run(act.cancelBooking(s.bookings.find((b) => b.personId !== "PH-P-0801" && b.status === "confirmed" && b.attendance === "booked").id)).ok);
  check("participant cannot add tasks or acknowledge DQ", !run(act.addTask("x", "neil", null)).ok && !run(act.acknowledgeDq("DQ-0001")).ok);
  const before = run(act.createBooking("PH-P-0801", ibmToday.id, slot.start));
  check("booking blocked before consent and questionnaire", !before.ok && /required questionnaire and consent/.test(before.message));
  check("cannot complete with sections missing", !run(act.portalComplete("PH-P-0801", { service: true, data: true })).ok);
  run(act.portalSaveDraft("PH-P-0801", 5, { famCvd: false }));
  check("required consent enforced", !run(act.portalComplete("PH-P-0801", { service: true, data: false })).ok);
  check("questionnaire complete", run(act.portalComplete("PH-P-0801", { service: true, data: true, sms: true })).ok);
  check("break not bookable", !run(act.createBooking("PH-P-0801", ibmToday.id, "10:30")).ok);
  const taken = M.slotGrid(s, ibmToday.id).find((x) => x.booking);
  check("double booking prevented", !run(act.createBooking("PH-P-0801", ibmToday.id, taken.start)).ok);
  const book = run(act.createBooking("PH-P-0801", ibmToday.id, slot.start));
  check("orla booked", book.ok, book.message);
  eq("counts after booking", [P("PRG-IBM-26").booked, M.totalCounts(s).booked, M.sessionStats(s, ibmToday.id).booked, M.todayStats(s).booked, M.todayStats(s).available, M.totalCounts(s).drafts], [46, 366, 11, 46, 29, 4]);
  eq("reminder cohort unchanged", M.reminderStats(s).logical, 45);
  check("no episode created by booking", M.totalCounts(s).episodes === 225 && M.totalCounts(s).attended === 225);
  check("second active booking blocked", !run(act.createBooking("PH-P-0801", ibmToday.id, M.freeSlots(s, ibmToday.id)[0].start)).ok);
  const orlaBooking = s.bookings.find((b) => b.personId === "PH-P-0801" && b.status === "confirmed");
  // reschedule: replacement reserved first, original released
  const slot2 = M.freeSlots(s, ibmToday.id)[0];
  check("reschedule ok", run(act.rescheduleBooking(orlaBooking.id, ibmToday.id, slot2.start)).ok);
  eq("capacity unchanged by reschedule", [M.totalCounts(s).booked, M.sessionStats(s, ibmToday.id).booked], [366, 11]);
  const orlaNow = s.bookings.find((b) => b.personId === "PH-P-0801" && b.status === "confirmed");
  eq("reschedule chain", [s.bookings.find((b) => b.id === orlaBooking.id).status, orlaNow.replaces], ["cancelled", orlaBooking.id]);
  // nurse workspace
  check("participant feeds are empty", M.activityFeed(s).length === 0 && M.directoryRows(s).length === 0 && M.storyViews(s).length === 0 && M.answerQuery(s, "Aisling Byrne").scenario === "restricted");
  run(act.setPersona("fiona"));
  check("fiona cannot check in at a clinic she is not assigned to", !run(act.confirmIdentity(orlaNow.id, "09/06/1993", orlaNow.id)).ok);
  run(act.setPersona("liz"));
  check("check in", run(act.checkIn(orlaNow.id)).ok);
  eq("checked in count", M.todayStats(s).checkedIn, 1);
  check("wrong dob rejected", !run(act.confirmIdentity(orlaNow.id, "10/06/1993", orlaNow.id)).ok);
  check("specimen blocked before identity", !run(act.toggleChecklist(orlaNow.id, "specimens")).ok);
  check("identity confirmed", run(act.confirmIdentity(orlaNow.id, "09/06/1993", orlaNow.id)).ok);
  let cap = s.captureDrafts[orlaNow.id];
  check("invalid height rejected", !run(act.saveCapture(orlaNow.id, cap.rev, { measures: { heightM: { value: 25, state: "recorded" } } })).ok);
  cap = s.captureDrafts[orlaNow.id];
  const stale = run(act.saveCapture(orlaNow.id, cap.rev - 1, { measures: { heightM: { value: 1.65, state: "recorded" } } }));
  check("save conflict surfaced", !stale.ok && stale.conflict === true);
  check("blank recorded value is missing", run(act.saveCapture(orlaNow.id, cap.rev, { measures: { heightM: { value: null, state: "recorded" } } })).ok && M.captureMissing(s.captureDrafts[orlaNow.id]).includes("heightM"));
  cap = s.captureDrafts[orlaNow.id];
  check("save measures", run(act.saveCapture(orlaNow.id, cap.rev, { measures: { heightM: { value: 1.65, state: "recorded" }, weightKg: { value: 70, state: "recorded" }, bpSys: { value: 188, state: "recorded" }, bpDia: { value: 104, state: "recorded" } } })).ok);
  check("legitimate abnormal bp accepted", s.captureDrafts[orlaNow.id].measures.bpSys.value === 188);
  eq("bmi", M.bmiOf(s.captureDrafts[orlaNow.id]), 25.7);
  check("cannot complete without specimen and labels", !run(act.completeAppointment(orlaNow.id)).ok);
  run(act.toggleChecklist(orlaNow.id, "specimens"));
  run(act.toggleChecklist(orlaNow.id, "labels"));
  const done = run(act.completeAppointment(orlaNow.id));
  check("appointment completed", done.ok, done.message);
  eq("after completion", [M.totalCounts(s).attended, M.totalCounts(s).episodes, M.totalCounts(s).awaiting, M.totalCounts(s).released, M.totalCounts(s).booked], [226, 226, 16, 184, 366]);
  eq("not released", s.episodes.find((e) => e.bookingId === orlaNow.id).reportState, "awaiting_results");
  // Every expected test of the programme's panel stays pending and visible: the full Comprehensive (LAB) panel now, not five core tests.
  eq("pending tests stay visible", M.pendingTests(s, s.episodes.find((e) => e.bookingId === orlaNow.id)).length, M.COMPREHENSIVE_PANEL.length);
  const orlaEp = s.episodes.find((e) => e.bookingId === orlaNow.id).id;
  check("liz cannot load results without imports.view", run(act.setPersona("anita")) && !run(act.deliverSampleResults(orlaEp)).ok);
  run(act.setPersona("neil"));
  check("sample results delivered", run(act.deliverSampleResults(orlaEp)).ok && s.episodes.find((e) => e.id === orlaEp).reportState === "ready_for_review");
  check("delivery idempotent", !run(act.deliverSampleResults(orlaEp)).ok);
  run(act.ackFlags(orlaEp)); run(act.setAdvice(orlaEp, "Sample advice for Orla.")); run(act.toggleReviewCheck(orlaEp, "advice")); run(act.toggleReviewCheck(orlaEp, "preview"));
  check("orla released", run(act.releaseReport(orlaEp)).ok);
  run(act.setPersona("participant"));
  check("orla portal report", run(act.viewReportInPortal(orlaEp)).ok && !!M.currentReleased(s, orlaEp).accessedAt);
  // cancellation updates capacity
  s = createInitialState();
  run(act.setPersona("brenda"));
  const someBooking = M.activeBookings(s, ibmToday.id)[0];
  check("cancel ok", run(act.cancelBooking(someBooking.id, "Participant request")).ok);
  eq("capacity after cancel", [M.totalCounts(s).booked, M.sessionStats(s, ibmToday.id).booked], [364, 9]);
  const failedRem = M.failedReminders(s)[0];
  check("cancel withdraws a failed reminder", run(act.cancelBooking(failedRem.bookingId, "Participant request")).ok && s.messages.find((m) => m.id === failedRem.id).status === "cancelled" && !run(act.retryReminder(failedRem.id)).ok);
  eq("reminder counts after cancel", [M.reminderStats(s).logical, M.reminderStats(s).failed], [44, 1]);
  const future = M.freeSlots(s, "CLN-IBM-20261012")[0];
  const ib = s.bookings.find((b) => b.sessionId === "CLN-IBM-20261005" && b.status === "confirmed");
  run(act.rescheduleBooking(ib.id, "CLN-IBM-20261012", future.start));
  const nb = s.bookings.find((b) => b.replaces === ib.id);
  check("future booking queues one reminder", s.messages.filter((m) => m.bookingId === nb.id && m.kind === "reminder" && m.status === "queued").length === 1);
  check("cancel cancels the queued reminder", run(act.cancelBooking(nb.id, "Test")).ok && s.messages.filter((m) => m.bookingId === nb.id && m.status === "queued").length === 0);
  eq("baseline reminders untouched", M.reminderStats(createInitialState()).logical, 45);
  s = createInitialState();

  /* ---------- session edits ---------- */
  run(act.setPersona("brenda"));
  const sisk8 = s.sessions.find((x) => x.id === "CLN-SISK-20261008");
  const pv = M.previewSessionEdit(s, sisk8.id, { end: "15:00" });
  const late = M.activeBookings(s, sisk8.id).filter((b) => b.slotStart >= "14:45").length;
  check("shortening the day impacts bookings, none deleted", pv.impacted.length === late && late > 0 && !pv.ok && M.activeBookings(s, sisk8.id).length === 14);
  check("nurse overlap detection", M.scheduleOverlaps(s).length === 0 && !run(act.applySession("CLN-SF-20261005", { supportIds: ["fiona"] })).ok);
  check("non-nurse rejected", !run(act.applySession("CLN-IBM-20261012", { nurseId: "martina" })).ok);
  check("completed session cannot be edited", !run(act.applySession("CLN-SISK-20260914", { nurseId: "liz" })).ok && !M.previewSessionEdit(s, "CLN-SISK-20260914", { nurseId: "liz" }).ok);
  const overlapSession = M.previewSessionEdit(s, "CLN-IBM-20261005", { nurseId: "fiona" });
  check("overlap flagged for today", overlapSession.overlaps.length > 0);
  check("overlap blocks apply", !run(act.applySession("CLN-IBM-20261005", { nurseId: "fiona" })).ok);
  const dateMove = run(act.applySession("CLN-SISK-20261012", { date: "2026-10-13" }));
  check("date move with bookings blocked", !dateMove.ok);
  const shorten = M.previewSessionEdit(s, "CLN-SISK-20261008", { end: "12:00" });
  check("impact listed before applying", shorten.impacted.length > 0);
  const shortenRes = run(act.applySession("CLN-SISK-20261008", { end: "12:00" }));
  check("silent deletion impossible", shorten.impacted.length === 0 || !shortenRes.ok);
  s = createInitialState();

  /* ---------- forms ---------- */
  run(act.setPersona("brenda"));
  check("brenda cannot edit forms", !run(act.createFormDraft("tpl-comprehensive-lab")).ok);
  run(act.setPersona("liz"));
  const histBefore = JSON.stringify(s.episodes[0].formSnapshot);
  check("draft created", run(act.createFormDraft("tpl-comprehensive-lab")).ok);
  const tpl = () => s.forms.templates.find((t) => t.id === "tpl-comprehensive-lab");
  const draft = tpl().versions.find((v) => v.status === "draft");
  eq("draft version", draft.version, "2.1");
  check("add block", run(act.addFormBlock("tpl-comprehensive-lab", "blk-ecg")).ok);
  check("duplicate block rejected", !run(act.addFormBlock("tpl-comprehensive-lab", "blk-ecg")).ok);
  check("reorder", run(act.moveFormBlock("tpl-comprehensive-lab", "blk-ecg", -1)).ok);
  eq("current unchanged until approved", tpl().currentVersion, "2.0");
  check("submit", run(act.submitFormPublication("tpl-comprehensive-lab")).ok);
  check("liz cannot approve", !run(act.decideFormPublication(s.approvals[s.approvals.length - 1].id, true)).ok);
  run(act.setPersona("neil"));
  check("neil approves", run(act.decideFormPublication(s.approvals[s.approvals.length - 1].id, true)).ok);
  eq("new current version", tpl().currentVersion, "2.1");
  eq("historical episodes keep their snapshot", JSON.stringify(s.episodes[0].formSnapshot), histBefore);
  check("blood pressure 1.2 shared by three templates", ["tpl-comprehensive-lab", "tpl-cardiovascular", "tpl-sports-cardiac"].every((id) => s.forms.templates.find((t) => t.id === id).versions.some((v) => v.blocks.some((b) => b.blockId === "blk-bp" && b.version === "1.2"))));
  s = createInitialState();

  /* ---------- employer report ---------- */
  run(act.setPersona("martina"));
  const leak = run(act.setCohort("ER-SISK-01", { programmeId: "PRG-SISK-26", site: "all", ageBand: "all", gender: "non_binary", from: null, to: null }));
  check("small cohort size never stated", /fewer than 5/.test(leak.message) && !/\b3 participants/.test(JSON.stringify(s.activity.slice(-2))) && M.reportMetrics(s, s.employerReports[0]).size === 0 && M.reportMetrics(s, s.employerReports[0]).sizeHidden);
  const blocked = run(act.setCohort("ER-SISK-01", { programmeId: "PRG-SISK-26", site: "Sisk Dublin Site B", ageBand: "55+", gender: "all", from: null, to: null }));
  check("six-person cohort blocked", blocked.tone === "warn" && /6 participants/.test(blocked.message) && s.activity.some((e) => e.summary === "Sisk employer export blocked: selected cohort has 6 participants."));
  check("export blocked before approval", !run(act.createExport("ER-SISK-01", "pdf")).ok);
  check("programme level view works", run(act.useProgrammeLevel("ER-SISK-01")).ok);
  eq("cohort restored", M.employerMetrics(s, "PRG-SISK-26", s.employerReports[0].cohort, s.employerReports[0].dataAsOf).size, 126);
  check("narrative draft", run(act.draftNarrative("ER-SISK-01")).ok && s.employerReports[0].narrativeSource === "draft_from_aggregates");
  check("martina cannot approve narrative", !run(act.approveReport("ER-SISK-01")).ok);
  check("mark reviewed", run(act.markReportReviewed("ER-SISK-01")).ok);
  run(act.setPersona("neil"));
  check("approve", run(act.approveReport("ER-SISK-01")).ok);
  check("snapshot frozen", s.employerReports[0].snapshot.metrics.size === 126);
  check("pdf and pptx previews", run(act.createExport("ER-SISK-01", "pdf")).ok && run(act.createExport("ER-SISK-01", "pptx")).ok);
  check("exports from one snapshot", M.exportMetrics(s, s.employerReports[0]) === s.employerReports[0].snapshot.metrics);
  s = createInitialState();
  run(act.setPersona("martina"));
  run(act.setAiDrafting(false));
  run(act.setPersona("neil"));
  run(act.setAiDrafting(false));
  check("ai off blocks drafting preview only", !run(act.draftNarrative("ER-SISK-01")).ok && !run(act.aiDraft("PH-E-0101")).ok);
  run(act.setNarrative("ER-SISK-01", "Manual narrative written without AI."));
  check("manual narrative works with ai off", s.employerReports[0].narrative.startsWith("Manual narrative"));
  run(act.setAiDrafting(true));
  s = createInitialState();

  /* ---------- invitations ---------- */
  run(act.setPersona("brenda"));
  check("brenda creates a code", run(act.createCode("PRG-IBM-26", "Late joiners", "2026-10-12", "")).ok);
  eq("code count", s.invitationCodes.length, 7);
  run(act.setPersona("liz"));
  check("nurses cannot create codes", !run(act.createCode("PRG-IBM-26", "Nope", "2026-10-12", "")).ok);
  run(act.setPersona("stephen"));
  const draftIbm = s.invitationDrafts[0];
  s.memberships.find((m) => m.personId === draftIbm.recipientIds[0]).stage = "booked";
  check("approval enforces its prerequisites", !run(act.decideInvitation(draftIbm.id, true, draftIbm.recipientIds)).ok);
  s.memberships.find((m) => m.personId === draftIbm.recipientIds[0]).stage = "onboarding";
  check("send needs confirmed recipients", !run(act.decideInvitation(draftIbm.id, true, [])).ok);
  const sendOk = run(act.decideInvitation(draftIbm.id, true, draftIbm.recipientIds));
  check("simulated send", sendOk.ok && s.messages.filter((m) => m.kind === "invitation").length === draftIbm.recipientIds.length);
  check("send is idempotent", !run(act.decideInvitation(draftIbm.id, true, draftIbm.recipientIds)).ok);
  eq("sending does not change bookings", M.totalCounts(s).booked, 365);
  eq("ST-03 resolved after the decision", M.storyView(s, "ST-03").open, false);

  /* ---------- agents: suggested questions and record links ---------- */
  s = createInitialState();
  for (const a of M.AGENT_DEFS) {
    for (const q of M.agentSuggestions(s, a.id)) {
      const r = M.agentReply(s, a.id, q);
      check(`chip resolves in scope: ${a.id} / ${q}`, !r.text.startsWith("that is outside"), r.text);
      check(`chip answer links to a record: ${a.id} / ${q}`, (r.links || []).length > 0);
    }
    const links = M.agentThread(s, a.id).flatMap((t) => [...(t.links || []), ...(t.lines || []).filter((l) => l.target).map((l) => ({ target: l.target }))]);
    check(`agent thread has record links: ${a.id}`, links.length > 0);
    check(`agent thread links target real pages: ${a.id}`, links.every((l) => M.PAGE_BY_ID[l.target.page] && (!l.target.tab || M.PAGE_BY_ID[l.target.page].tabs.some((t) => t.id === l.target.tab))));
  }

  /* every suggested question is answerable by the role that is shown it */
  for (const id of ["neil", "liz", "fiona", "anita", "ian", "brenda", "stephen", "martina"]) {
    s = createInitialState();
    run(act.setPersona(id));
    for (const q of M.suggestedPrompts(s)) {
      const a = M.answerQuery(s, q);
      check(`prompt answerable by ${id}: ${q}`, a.supported && a.scenario !== "restricted" && a.scenario !== "unsupported", a.scenario);
    }
    for (const ag of M.AGENT_DEFS) {
      for (const q of M.agentSuggestions(s, ag.id)) {
        const a = M.answerQuery(s, q);
        check(`agent chip answerable by ${id}: ${ag.id} / ${q}`, a.supported && a.scenario !== "restricted" && a.scenario !== "unsupported", a.scenario);
      }
    }
  }
  s = createInitialState();
  run(act.setPersona("anita"));
  check("anita cannot read PH-E-0201 values", !/3\.2/.test(M.answerQuery(s, "Why was LDL 3.2 shown as normal?").text) && !M.activityFeed(s).some((v) => /3\.2/.test(v.text)) && !JSON.stringify(M.agentThread(s, "quality")).includes("3.2") && !M.personTimeline(s, "PH-P-0501").some((t) => /mmol/.test(t.detail)));
  check("anita sees only own release approvals", M.approvalViews(s).filter((a) => a.type === "report_release" && a.visible).every((a) => M.canViewEpisodeClinical(s, a.target.id)));
  run(act.setPersona("brenda"));
  check("brenda hold shows clinical action only", M.holdQueue(s).find((h) => h.category === "clinical_action").label === "Clinical action assigned" && M.batchRows(s, "BATCH-20261002-01").every((r) => r.valueText === ""));
  s = createInitialState();
  run(act.setPersona("ian"));
  check("support cannot read lab import detail", M.answerQuery(s, "Show the three lab import exceptions.").scenario === "restricted");
  check("nurse cannot read employer report detail", (run(act.setPersona("fiona")), M.answerQuery(s, "Prepare the Sisk programme report.").scenario === "restricted"));

  /* ---------- analyte catalogue and the illustrative rule set ---------- */
  s = createInitialState();
  const B4 = (code, v, ctx) => M.bandFor(code, v, ctx);
  const male = { sex: "male", age: 55 }, female = { sex: "female", age: 40 };
  eq("panel size", [Object.keys(M.ANALYTES).length, M.COMPREHENSIVE_PANEL.length, M.CALCULATED_ANALYTES.length], [32, 28, 2]);
  check("every analyte in a report group", Object.values(M.ANALYTES).every((a) => M.ANALYTE_GROUPS.some((g) => g.key === a.group)));
  eq("rule set label", M.RULE_SET_LABEL, "Illustrative rule set v0.1. Clinician-owned. To be replaced by Precision Health's approved rules.");
  eq("TC bands", [4.9, 5.0, 6.0, 6.1].map((v) => B4("TC", v)), ["normal", "borderline", "borderline", "abnormal"]);
  eq("HbA1c bands", [41, 42, 47, 48].map((v) => B4("HBA1C", v)), ["normal", "borderline", "borderline", "abnormal"]);
  eq("HbA1c words", ["normal", "borderline", "abnormal"].map((b) => M.reportFlagWord("HBA1C", b)), ["NORMAL", "HIGHER RISK", "RAISED"]);
  eq("HDL bands", [1.1, 1.0, 0.9, 0.8].map((v) => B4("HDL", v)), ["normal", "borderline", "borderline", "abnormal"]);
  eq("HDL low word", M.reportFlagWord("HDL", "abnormal", M.bandDetail("HDL", 0.8).direction), "LOW");
  eq("LDL 10 percent rule", [2.9, 3.0, 3.3, 3.4].map((v) => B4("LDL", v)), ["normal", "borderline", "borderline", "abnormal"]);
  eq("TG limit is <2.0", [1.9, 2.0].map((v) => B4("TG", v)), ["normal", "borderline"]);
  eq("haemoglobin by sex", [B4("HB", 12.5, female), B4("HB", 12.5, male)], ["normal", "borderline"]);
  eq("ferritin by sex", [B4("FERR", 170, male), B4("FERR", 170, female)], ["normal", "abnormal"]);
  eq("PSA by age", [B4("PSA", 2.5, { sex: "male", age: 45 }), B4("PSA", 2.5, { sex: "male", age: 55 })], ["abnormal", "normal"]);
  eq("FIT qualitative", [B4("FIT", 0), B4("FIT", 1), M.reportFlagWord("FIT", "abnormal")], ["normal", "abnormal", "POSITIVE"]);
  eq("not tested", [B4("TC", null), M.reportFlagWord("TC", "not_tested")], ["not_tested", "NOT TESTED"]);
  check("flagFor follows the band", [["LDL", 3.2], ["TC", 4.9], ["VITD", 45], ["CA", 2.4]].every(([c, v]) => M.flagFor(c, v) === (["borderline", "abnormal"].includes(B4(c, v)) ? "review_required" : "none")));
  eq("BP words", [[118, 76], [139, 84], [148, 94], [165, 102], [182, 100]].map(([a, b]) => M.bpCategory(a, b).word), ["IDEAL", "MILD", "RAISED", "SIGNIFICANTLY RAISED", "IMMEDIATE TREATMENT"]);
  eq("BP below 140/90 is not flagged (client viewer shows 128/86 green)", [M.bpCategory(128, 86).band, M.bpCategory(139, 84).band, M.bpCategory(140, 84).band], ["normal", "normal", "abnormal"]);
  eq("BMI words and bands", [22, 26.3, 28.7, 31, 17].map((v) => M.bmiCategory(v).word + "/" + M.bmiCategory(v).band), ["NORMAL/normal", "OVERWEIGHT/borderline", "OVERWEIGHT/abnormal", "OBESE/abnormal", "UNDERWEIGHT/borderline"]);
  eq("relative risk bands", [0.9, 1.0, 1.5, 1.6].map((v) => M.relativeRiskBand(v)), ["normal", "borderline", "borderline", "abnormal"]);

  /* ---------- baseline data: bands, panels, batches, unique IDs, QRISK3 ---------- */
  check("observation flag follows its band", s.observations.every((o) => (o.unitDiscrepancy && !o.unitDiscrepancy.confirmed) ? o.band === "not_tested" && o.flag === "none" : o.flag === (["borderline", "abnormal"].includes(o.band) ? "review_required" : "none")));
  const queue = M.reviewQueueAll(s);
  check("routine ready episodes are all normal across the whole panel", queue.filter((i) => i.routine).every((i) => !i.flags.length && M.panelResults(s, i.episode.id).every((r) => r.band === "normal")));
  check("flagged ready episodes have out-of-range laboratory results", queue.filter((i) => i.flagged).every((i) => i.flags.some((f) => f.kind === "observation")));
  check("routine releases are all normal", s.reportVersions.filter((v) => v.releaseMode === "routine").every((v) => !M.episodeFlags(s, s.episodes.find((e) => e.id === v.episodeId)).length));
  check("some releases are routine", s.reportVersions.filter((v) => v.releaseMode === "routine").length > 20);
  check("ready and released episodes have every expected test", s.episodes.filter((e) => e.reportState === "ready_for_review" || e.reportState === "released").every((e) => M.pendingTests(s, e).length === 0));
  check("every episode expects the full Comprehensive panel", s.episodes.every((e) => M.COMPREHENSIVE_PANEL.every((c) => e.expectedTests.some((t) => t.code === c))));
  check("PSA and FIT only when the nurse form says so", s.episodes.every((e) => e.expectedTests.some((t) => t.code === "PSA") === (e.capture.form.psaTaken === "Yes") && e.expectedTests.some((t) => t.code === "FIT") === (e.capture.form.fitKit === "Yes")));
  check("PSA only for men", s.episodes.filter((e) => e.expectedTests.some((t) => t.code === "PSA")).every((e) => s.persons.find((p) => p.id === e.personId).sex === "male"));
  check("awaiting episodes show what is pending", s.episodes.filter((e) => e.reportState === "awaiting_results").every((e) => M.pendingTests(s, e).length > 0));
  check("baseline batch holds only lipid and HbA1c rows", M.batchRowsAll(s, "BATCH-20261002-01").every((r) => M.CORE_PANEL.includes(r.analyteCode)));
  const EXT = M.batchStats(s, "BATCH-20261002-02");
  eq("extended batch", [EXT.batch.kind, EXT.batch.status, EXT.batch.filename, EXT.quarantined, EXT.duplicates, EXT.rows === EXT.imported], ["extended", "complete", "eurofins_extended_2026-10-02_demo.csv", 0, 0, true]);
  check("extended batch has no core rows", M.batchRowsAll(s, "BATCH-20261002-02").every((r) => !M.CORE_PANEL.includes(r.analyteCode)));
  check("every observation points at a real row", (() => { const rows = new Set(s.importRows.map((r) => r.id)); return s.observations.every((o) => o.source.kind !== "batch" || rows.has(o.source.rowId)); })());
  const refs = s.episodes.map((e) => e.screeningRef);
  check("screening refs unique in COMP0 format", new Set(refs).size === refs.length && refs.every((r) => /^COMP0\d{4}$/.test(r)));
  const ageAt = (e) => M.ageOn(s.persons.find((p) => p.id === e.personId).dob, M.localDateOf(e.collectedAt));
  check("QRISK3 not calculated under 25", s.episodes.filter((e) => ageAt(e) < 25).every((e) => e.qrisk && !e.qrisk.eligible && e.qrisk.score10y === null && e.qrisk.reason === "Not calculated under 25"));
  check("QRISK3 sample outputs labelled", s.episodes.every((e) => !e.qrisk || e.qrisk.source === "licensed_engine_sample"));
  const withQ = s.episodes.filter((e) => e.qrisk && e.qrisk.relativeRisk !== null);
  check("heart age follows relative risk", withQ.length > 150 && withQ.every((e) => e.qrisk.relativeRisk === 1 || (e.qrisk.relativeRisk > 1) === (e.qrisk.heartAge > ageAt(e))));
  const avgRR = (l) => l.reduce((n, e) => n + e.qrisk.relativeRisk, 0) / l.length;
  check("smokers have higher QRISK3 relative risk", avgRR(withQ.filter((e) => /cigarettes per day/.test(String(e.capture.form.smoking)))) > avgRR(withQ.filter((e) => e.capture.form.smoking === "No")));
  check("awaiting without lipids has no QRISK3 numbers", s.episodes.filter((e) => e.reportState === "awaiting_results" && !M.latestObservations(s, e.id).some((o) => o.code === "TC")).every((e) => e.qrisk.score10y === null));
  eq("QRISK3 default display", M.QRISK3.state, "licensed_engine_sample");
  const ldl = M.latestObservations(s, "PH-E-0201").find((o) => o.code === "LDL");
  eq("ronan ldl band", [ldl.band, ldl.legacyDisplayedFlag], ["borderline", "normal"]);
  const aisCalc = M.latestObservations(s, "PH-E-0101").filter((o) => o.source.kind === "calc").map((o) => [o.code, o.value]);
  eq("calculated non-HDL and ratio", aisCalc, [["NONHDL", 2.8], ["TCHDL", 2.75]]);
  const maeve = s.episodes.find((e) => e.id === "PH-E-0103");
  check("maeve nurse referral", !!maeve.nurseReferral && maeve.capture.form.approve === M.NURSE_REFERRAL_VALUE && M.episodeFlags(s, maeve).some((f) => f.kind === "nurse_referral"));
  check("seeded nurse forms are valid", s.episodes.every((e) => !Object.keys(M.nurseFormErrors(e.capture, { sex: s.persons.find((p) => p.id === e.personId).sex, age: ageAt(e) })).length));
  check("seeded nurse forms complete where sex is recorded", s.episodes.filter((e) => s.persons.find((p) => p.id === e.personId).sex !== "not_recorded").every((e) => M.nurseFormMissing(e.capture, { sex: s.persons.find((p) => p.id === e.personId).sex, age: ageAt(e) }).length === 0));

  /* ---------- questionnaire, report content and the report document ---------- */
  eq("questionnaire sections", M.QUESTIONNAIRE_SECTIONS.map((x) => x.key), ["lifestyle", "heart", "cancer", "medication"]);
  eq("lifestyle questions", M.SECTION_QUESTIONS.lifestyle.length, 15);
  const siskMan = s.episodes.find((e) => e.programmeId === "PRG-SISK-26" && e.reportState === "released" && s.persons.find((p) => p.id === e.personId).sex === "male");
  const life = M.lifestyleAnswersForReport(s, siskMan.personId);
  check("lifestyle rows for the report", life.length === 14 && life.some((r) => r.question.includes("that Sisk has to offer")) && life.some((r) => r.question === "Do you examine your testicles?") && life.every((r) => r.answered));
  const rf = M.riskFactorSummary(s, "PH-E-0201");
  check("viewer answers derivable", rf && rf.smoker !== null && rf.familyHistoryCvd !== null && rf.diabetes !== null && rf.hypertensionTreatment !== null && typeof rf.alcoholUnitsPerWeek === "number");
  eq("advice signature", M.ADVICE_SIGNATURE, "Advice provided by Dr Neil Reddy (MCRN demo-0000)");
  const doc = M.reportDocument(s, siskMan.id);
  check("report document released", doc && doc.versionStatus === "released" && doc.header.screeningRef === siskMan.screeningRef && doc.advice.written && doc.header.clinician === "Dr Neil Reddy");
  eq("report sections for a man", doc.sections.map((x) => x.key).filter((k) => ["breast_cervical", "testicular"].includes(k)), ["testicular"]);
  check("report rows never call a missing result normal", doc.sections.flatMap((x) => x.rows).every((r) => r.status === "resulted" || (r.flagWord === "" && r.band === "not_tested")));
  check("blood pressure table in the report", doc.sections.find((x) => x.key === "blood_pressure").table.length === 5);
  const awaitEp = s.episodes.find((e) => e.reportState === "awaiting_results" && M.pendingTests(s, e).length >= M.COMPREHENSIVE_PANEL.length);
  const awaitDoc = M.reportDocument(s, awaitEp.id);
  check("pending tests shown as pending", awaitDoc.sections.flatMap((x) => x.rows).filter((r) => r.code && M.COMPREHENSIVE_PANEL.includes(r.code)).every((r) => r.status === "pending" && r.resultText === "Awaiting result"));
  run(act.setPersona("participant")); run(act.setPortalPerson(siskMan.personId));
  check("participant sees own released report only", !!M.reportDocument(s, siskMan.id) && !M.reportDocument(s, "PH-E-0201"));
  run(act.setPersona("brenda"));
  check("operations cannot read the report", M.reportDocument(s, siskMan.id) === null && M.panelResults(s, siskMan.id) === null);
  run(act.setPersona("neil"));

  /* ---------- nurse form: prefill, validation, referral, ECG review, PSA and FIT ---------- */
  s = createInitialState();
  run(act.setPersona("liz"));
  const ibmNow = M.todaySessions(s).find((x) => x.programmeId === "PRG-IBM-26");
  const ibmBookings = M.activeBookings(s, ibmNow.id).map((b) => ({ b, p: s.persons.find((x) => x.id === b.personId) }));
  const dmy = (iso) => iso.split("-").reverse().join("/");
  const ready = (bk) => { run(act.checkIn(bk.b.id)); run(act.confirmIdentity(bk.b.id, dmy(bk.p.dob), bk.b.id)); };
  const rev = (id) => s.captureDrafts[id].rev;
  const baseMeasures = { heightM: { value: 1.75, state: "recorded" }, weightKg: { value: 72, state: "recorded" }, bpSys: { value: 124, state: "recorded" }, bpDia: { value: 78, state: "recorded" } };
  const first = ibmBookings[0];
  ready(first);
  const pre = s.captureDrafts[first.b.id].form;
  check("check-in prefills the nurse form", pre.employer === "IBM" && pre.company === first.p.site && pre.walkIn === "No" && pre.screeningClinician === "Liz Bawle" && typeof pre.famHistoryCvd === "boolean");
  check("invalid option rejected", !run(act.saveCapture(first.b.id, rev(first.b.id), { form: { urinalysis: "Maybe" } })).ok);
  check("unknown form field rejected", !run(act.saveCapture(first.b.id, rev(first.b.id), { form: { madeUp: "x" } })).ok);
  check("advice is the doctor's field", !run(act.saveCapture(first.b.id, rev(first.b.id), { form: { advice: "Nurse advice" } })).ok);
  check("old dipstick wording rejected", !run(act.saveCapture(first.b.id, rev(first.b.id), { urine: { protein: "Negative", glucose: "Nil", blood: "Nil", wcc: "Nil" } })).ok);
  check("client dipstick options accepted", run(act.saveCapture(first.b.id, rev(first.b.id), { urine: { protein: "Nil", glucose: "Nil", blood: "+", wcc: ">100" } })).ok);
  const tasksBefore = s.tasks.length;
  check("irregular ECG with regular pulse raises nothing", run(act.saveCapture(first.b.id, rev(first.b.id), { form: { ecg: "Done", ecgAdvice: "J Irregular heart rate", manualPulse: "Regular" } })).ok && s.tasks.length === tasksBefore);
  check("irregular ECG and pulse saved", run(act.saveCapture(first.b.id, rev(first.b.id), { measures: baseMeasures, form: { manualPulse: "Irregular", approve: M.NURSE_REFERRAL_VALUE }, notes: "Participant felt light-headed during the ECG." })).ok);
  const ecgTask = s.tasks.find((t) => t.title === "ECG review requested");
  check("ECG review task for the clinician", !!ecgTask && ecgTask.ownerId === "neil" && ecgTask.clinical && ecgTask.linked.kind === "booking" && s.captureDrafts[first.b.id].ecgReview.taskId === ecgTask.id);
  check("ECG photo shared to the clinical channel (simulated)", s.activity.some((e) => e.verb === "clinic.ecg_review" && e.summary.includes("ECG photo shared to clinical channel (simulated, replaces Slack)") && e.restricted));
  run(act.saveCapture(first.b.id, rev(first.b.id), { form: { ecgComment: "Light-headed during ECG." } }));
  eq("ECG review raised once", s.tasks.filter((t) => t.title === "ECG review requested").length, 1);
  run(act.toggleChecklist(first.b.id, "specimens")); run(act.toggleChecklist(first.b.id, "labels"));
  const doneRef = run(act.completeAppointment(first.b.id));
  check("referral appointment completed", doneRef.ok, doneRef.message);
  const refEp = s.episodes.find((e) => e.bookingId === first.b.id);
  const refTask = s.tasks.find((t) => t.id === refEp.nurseReferral?.taskId);
  check("nurse referral creates a doctor review task", !!refTask && refTask.title === "Nurse referral: review before release" && refTask.ownerId === "neil" && refTask.linked.kind === "episode" && refTask.linked.id === refEp.id);
  check("nurse referral activity", s.activity.some((e) => e.verb === "clinic.nurse_referral" && e.entity && e.entity.id === refEp.id));
  check("completion still never releases", refEp.reportState === "awaiting_results" && !M.currentReleased(s, refEp.id));
  check("ECG task follows the episode", s.tasks.find((t) => t.id === ecgTask.id).linked.id === refEp.id);
  check("new episode gets the next unique ID", refEp.screeningRef === "COMP02826");
  run(act.setPersona("neil"));
  run(act.deliverSampleResults(refEp.id));
  check("referred episode is ready but not routine", refEp && s.episodes.find((e) => e.id === refEp.id).reportState === "ready_for_review" && !M.routineEligibility(s, s.episodes.find((e) => e.id === refEp.id)).ok);
  check("routine shortcut blocked by the referral", !run(act.releaseRoutine(refEp.id)).ok && M.episodeFlags(s, s.episodes.find((e) => e.id === refEp.id)).some((f) => f.kind === "nurse_referral"));
  check("referral task is open until release", M.taskViews(s).find((t) => t.task.id === refTask.id).status === "open");
  run(act.ackFlags(refEp.id)); run(act.setAdvice(refEp.id, "Sample advice after the nurse referral.")); run(act.toggleReviewCheck(refEp.id, "advice")); run(act.toggleReviewCheck(refEp.id, "preview"));
  check("referred episode released individually", run(act.releaseReport(refEp.id)).ok && M.currentReleased(s, refEp.id).releaseMode === "individual");
  check("referral task done after release", M.taskViews(s).find((t) => t.task.id === refTask.id).status === "done");
  check("in-session QRISK3 waits for the engine", s.episodes.find((e) => e.id === refEp.id).qrisk.score10y === null);
  run(act.setPersona("liz"));
  const man = ibmBookings.find((x) => x.p.sex === "male" && x.b.id !== first.b.id);
  ready(man);
  const manAge = M.ageOn(man.p.dob, M.today(s));
  check("PSA and FIT decisions saved", run(act.saveCapture(man.b.id, rev(man.b.id), { measures: baseMeasures, form: { ...(manAge <= 45 ? { psaRequested: true } : {}), psaTaken: "Yes", fitKit: "Yes", approve: "Yes" } })).ok);
  run(act.toggleChecklist(man.b.id, "specimens")); run(act.toggleChecklist(man.b.id, "labels"));
  check("PSA and FIT appointment completed", run(act.completeAppointment(man.b.id)).ok);
  const manEp = s.episodes.find((e) => e.bookingId === man.b.id);
  check("PSA and FIT added to expected tests", ["PSA", "FIT"].every((c) => manEp.expectedTests.some((t) => t.code === c && t.addOn)) && manEp.expectedTests.length === M.COMPREHENSIVE_PANEL.length + 2);
  check("no referral without the referral answer", manEp.nurseReferral === null && s.tasks.filter((t) => t.title === "Nurse referral: review before release").length === 1);
  run(act.setPersona("neil"));
  run(act.deliverSampleResults(manEp.id));
  const manFit = M.latestObservations(s, manEp.id).find((o) => o.code === "FIT");
  check("sample FIT and PSA results arrive classified", !!manFit && manFit.valueText === "Negative" && manFit.band === "normal" && M.latestObservations(s, manEp.id).some((o) => o.code === "PSA" && o.band === "normal"));
  check("sample results all normal", M.latestObservations(s, manEp.id).every((o) => o.band === "normal") && M.episodeFlags(s, s.episodes.find((e) => e.id === manEp.id)).every((f) => f.kind === "blood_pressure"));
  check("mild blood pressure alone does not need individual review", !M.episodeFlags(s, s.episodes.find((e) => e.id === manEp.id)).some((f) => f.kind === "blood_pressure" && f.band === "borderline"));

  /* ---------- nurse form: bloods not taken ---------- */
  run(act.setPersona("liz"));
  const nob = ibmBookings.find((x) => x.b.id !== first.b.id && x.b.id !== man.b.id && !s.episodes.some((e) => e.bookingId === x.b.id));
  ready(nob);
  check("bloods not taken saved", run(act.saveCapture(nob.b.id, rev(nob.b.id), { measures: baseMeasures, form: { bloodsTaken: "No", fitKit: "No", approve: "Yes" } })).ok);
  check("bloods not taken needs a reason in nurse comments", !run(act.completeAppointment(nob.b.id)).ok);
  run(act.saveCapture(nob.b.id, rev(nob.b.id), { notes: "Participant declined venepuncture today." }));
  const specBefore = s.specimens.length;
  check("bloods not taken completes without a specimen", run(act.completeAppointment(nob.b.id)).ok && s.specimens.length === specBefore);
  const nobEp = s.episodes.find((e) => e.bookingId === nob.b.id);
  check("no blood panel expected and straight to review", nobEp.expectedTests.length === 0 && nobEp.reportState === "ready_for_review" && nobEp.specimenIds.length === 0);
  run(act.setPersona("neil"));
  const nobDoc = M.reportDocument(s, nobEp.id);
  const nobChol = nobDoc.sections.find((x) => x.key === "cholesterol").rows;
  check("report says blood tests not done, never normal", nobChol.every((r) => r.status === "not_done" && r.resultText.startsWith("Not done")));
  check("QRISK3 explains the missing blood sample", /no blood sample/.test(nobEp.qrisk.reason || ""));

  /* ---------- reset ---------- */
  s = createInitialState();
  eq("reset restores the baseline", [M.totalCounts(s).released, M.totalCounts(s).ready, M.totalCounts(s).booked, M.batchStats(s, "BATCH-20261002-01").imported], [184, 21, 365, 114]);
  const s2 = createInitialState();
  eq("deterministic fixtures", JSON.stringify(s.persons.slice(0, 40)) + s.bookings.length, JSON.stringify(s2.persons.slice(0, 40)) + s2.bookings.length);
} finally {
  await server.close();
}
console.log(`\n${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
