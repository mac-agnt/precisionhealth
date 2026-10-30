// Checks for the nurse entry slice: the point-of-care clinic today, live bands from Neil's ranges,
// "What they told us", the same-day release path through the existing review and release, lab
// episodes reading as awaiting lab, and Ronan's report reaching the participant portal once released.
// Usage: node tools/verify-nurse.mjs
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
  const N = await server.ssrLoadModule("/src/ph/model/nurseEntry.ts");
  const P = await server.ssrLoadModule("/src/ph/pages/Portal/data.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const dmy = (iso) => iso.split("-").reverse().join("/");

  /* ---------- baseline unchanged ---------- */
  const T = M.totalCounts(s);
  eq("baseline counts unchanged", [T.booked, T.attended, T.released, T.ready, T.awaiting, s.sessions.length], [365, 225, 184, 21, 15, 19]);

  /* ---------- a point-of-care clinic today ---------- */
  const today = M.todaySessions(s);
  const poc = today.filter((x) => M.sessionUsesPoc(x));
  eq("one point-of-care clinic today", poc.map((x) => x.id), ["CLN-SF-20261005"]);
  check("the other clinics today are laboratory days", today.filter((x) => !M.sessionUsesPoc(x)).length === 2);
  const pocBookings = M.activeBookings(s, poc[0].id);
  check("the point-of-care clinic has participants to complete", pocBookings.length === 15 && pocBookings.every((b) => b.attendance === "booked"));
  check("anita runs the point-of-care clinic", poc[0].nurseId === "anita");

  /* ---------- live bands from Neil's ranges ---------- */
  const who = { sex: "male", age: 50, on: "2026-10-05" };
  eq("pulse 72 normal", N.liveBand("pulse", 72, who).band, "normal");
  eq("pulse 110 borderline", N.liveBand("pulse", 110, who).band, "borderline");
  eq("BMI 26.7 overweight borderline", [N.liveBand("bmi", 26.7, who).band, N.liveBand("bmi", 26.7, who).label], ["borderline", "OVERWEIGHT"]);
  eq("BMI 31 obese outside range", N.liveBand("bmi", 31, who).band, "abnormal");
  eq("BMI ethnicity range applies", N.liveBand("bmi", 24, { ...who, ethnicity: "Indian" }).band, "borderline");
  eq("waist 97 male borderline", N.liveBand("waist", 97, who).band, "borderline");
  eq("waist 97 female outside range", N.liveBand("waist", 97, { ...who, sex: "female" }).band, "abnormal");
  eq("systolic 118 normal, 138 mild and green, 150 borderline, 185 urgent", [118, 138, 150, 185].map((v) => N.liveBand("bpsys", v, who).band), ["normal", "normal", "borderline", "abnormal"]);
  check("systolic 185 is marked urgent", N.liveBand("bpsys", 185, who).urgent);
  eq("diastolic 95 borderline", N.liveBand("bpdia", 95, who).band, "borderline");
  eq("cholesterol 4.5 / 5.6 / 7.8", [4.5, 5.6, 7.8].map((v) => N.liveBand("tc", v, who).band), ["normal", "borderline", "abnormal"]);
  eq("HDL 1.3 normal", N.liveBand("hdl", 1.3, who).band, "normal");
  eq("HbA1c 38 / 44 / 50", [38, 44, 50].map((v) => N.liveBand("hba1c", v, who).band), ["normal", "borderline", "abnormal"]);
  check("height and weight are recorded only", N.liveBand("height", 1.78, who).recordedOnly && N.liveBand("weight", 86, who).recordedOnly);
  check("a blank value has no band", N.liveBand("tc", null, who) === null);
  check("the band names the version of the ranges", /Ranges v\d+, in force from/.test(N.liveBand("tc", 5.6, who).versionText) && /Normal/.test(N.liveBand("pulse", 72, who).normalText));
  eq("suggested outcome follows the band", [N.suggestedOutcome(N.liveBand("tc", 4.5, who)), N.suggestedOutcome(N.liveBand("tc", 5.6, who)), N.suggestedOutcome(N.liveBand("height", 1.7, who))], ["Normal", "Borderline", null]);
  /* The live band agrees with what the episode stores at completion. */
  const bctx = M.bandCtxFor(s.persons.find((p) => p.id === "PH-P-0501"), "2026-10-05T09:00:00.000Z");
  check("live band matches the stored band", [["tc", "TC", 5.6], ["hdl", "HDL", 0.9], ["hba1c", "HBA1C", 44]].every(([t, c, v]) => N.liveBand(t, v, { sex: "male", age: 50, on: "2026-10-05" }).band === M.bandFor(c, v, bctx)));

  /* ---------- what they told us ---------- */
  const told = N.whatTheyToldUs({ smokesCigarettes: "Yes", smokingAmount: "11-20 cigarettes per day", alcoholFrequency: "4 or more times per week", alcoholUnits: "5-6", exerciseDays: 0, diabetesType2: true, sle: false, famCvd: true, medications: "Ramipril 5mg", bloodInStool: true, bowelHabitChange: false }, "male");
  const flagged = told.flatMap((g) => g.items.filter((i) => i.flag).map((i) => i.key));
  eq("told us groups", told.map((g) => g.key), ["lifestyle", "history", "medications", "family", "symptoms"]);
  eq("told us flags", flagged.sort(), ["alcohol", "bloodInStool", "conditions", "exercise", "famCvd", "medications", "smoking"].sort());
  eq("nothing flagged for a healthy questionnaire", N.toldUsFlagCount(N.whatTheyToldUs({ smokesCigarettes: "No", alcoholFrequency: "Never", exerciseDays: 4, diabetesType2: false, famCvd: false, medications: "None" }, "female")), 0);
  const ronanAns = M.membershipOf(s, "PH-P-0501", "PRG-SF-26").answers;
  check("Ronan's questionnaire gives a told-us panel", N.whatTheyToldUs(ronanAns, "male").length >= 3);

  /* ---------- point of care: complete, ready the same day, release with the existing action ---------- */
  run(act.setPersona("anita"));
  const bk = pocBookings[0];
  const person = s.persons.find((p) => p.id === bk.personId);
  check("check in on the point-of-care form", run(act.checkIn(bk.id)).ok && s.captureDrafts[bk.id].variant === "poc");
  check("identity", run(act.confirmIdentity(bk.id, dmy(person.dob), bk.id)).ok);
  check("reviewed with participant tick", run(act.toggleChecklist(bk.id, "questionnaire")).ok && s.captureDrafts[bk.id].checklist.questionnaire === true);
  let cap = s.captureDrafts[bk.id];
  check("placeholder 10 with a machine error is refused", !run(act.saveCapture(bk.id, cap.rev, { form: { pocScreenType: "Standard Cardiovascular Risk", pocCholState: "Machine error", pocChol: 10 } })).ok);
  cap = s.captureDrafts[bk.id];
  check("impossible blood pressure refused", !run(act.saveCapture(bk.id, cap.rev, { measures: { bpSys: { value: 400, state: "recorded" } } })).ok);
  cap = s.captureDrafts[bk.id];
  const saved = run(act.saveCapture(bk.id, cap.rev, {
    measures: { heightM: { value: 1.78, state: "recorded" }, weightKg: { value: 86, state: "recorded" }, waistCm: { value: 97, state: "recorded" }, bpSys: { value: 138, state: "recorded" }, bpDia: { value: 86, state: "recorded" }, pulse: { value: 72, state: "recorded" } },
    form: { pocScreenType: "Standard Cardiovascular Risk", pocBpSysLeft: 134, pocBpDiaLeft: 84, pocBpOutcome: "Normal", pocSpo2: 98,
      pocCholState: "Recorded", pocChol: 5.6, pocCholOutcome: "Borderline", pocHdlState: "Recorded", pocHdl: 1.1, pocHdlOutcome: "Normal", pocHba1cState: "Recorded", pocHba1c: 44, pocHba1cOutcome: "Borderline",
      pocEcg: "Done", pocEcgResult: "A Normal rhythm", pocEcgOutcome: "Normal", approve: "Yes", medications: "nil" }, notes: "No problems with the screening.",
  }));
  check("point-of-care values saved", saved.ok, saved.message);
  const done = run(act.completeAppointment(bk.id));
  check("point-of-care appointment completed", done.ok, done.message);
  const ep = s.episodes.find((e) => e.bookingId === bk.id);
  eq("ready for review the same day, no specimen", [ep.reportState, ep.specimenIds.length, ep.capture.variant], ["ready_for_review", 0, "poc"]);
  eq("point-of-care results stored and banded", s.observations.filter((o) => o.episodeId === ep.id).map((o) => [o.code, o.value, o.band]), [["TC", 5.6, "borderline"], ["HDL", 1.1, "normal"], ["HBA1C", 44, "borderline"]]);
  check("nurse form read back on the point-of-care form", (() => { run(act.setPersona("neil")); const rows = M.nurseFormRows(s, ep.id); return !!rows && rows[0].section === "screen_type" && rows.some((r) => r.key === "pocChol" && r.value === "5.6"); })());
  /* Same-day release: the existing review and release action, nothing separate. */
  if (M.episodeFlags(s, ep).length) run(act.ackFlags(ep.id));
  run(act.setAdvice(ep.id, "Sample advice for a same-day release."));
  run(act.toggleReviewCheck(ep.id, "advice"));
  run(act.toggleReviewCheck(ep.id, "preview"));
  const rel = run(act.releaseReport(ep.id));
  check("same-day release with the existing release", rel.ok, rel.message);
  check("released the same day as collected", s.episodes.find((e) => e.id === ep.id).reportState === "released" && M.currentReleased(s, ep.id).releasedAt.slice(0, 10) === ep.collectedAt.slice(0, 10));

  /* ---------- laboratory day: completes into awaiting results ("Awaiting lab") ---------- */
  s = createInitialState();
  run(act.setPersona("liz"));
  const lab = M.todaySessions(s).find((x) => x.programmeId === "PRG-IBM-26");
  const lb = M.activeBookings(s, lab.id)[0];
  const lp = s.persons.find((p) => p.id === lb.personId);
  run(act.checkIn(lb.id)); run(act.confirmIdentity(lb.id, dmy(lp.dob), lb.id));
  check("lab clinic uses the lab form", !s.captureDrafts[lb.id].variant || s.captureDrafts[lb.id].variant === "lab");
  cap = s.captureDrafts[lb.id];
  run(act.saveCapture(lb.id, cap.rev, { measures: { heightM: { value: 1.7, state: "recorded" }, weightKg: { value: 70, state: "recorded" }, bpSys: { value: 120, state: "recorded" }, bpDia: { value: 78, state: "recorded" } } }));
  run(act.toggleChecklist(lb.id, "specimens")); run(act.toggleChecklist(lb.id, "labels"));
  check("lab appointment completed", run(act.completeAppointment(lb.id)).ok);
  const lep = s.episodes.find((e) => e.bookingId === lb.id);
  check("lab episode awaits the laboratory", lep.reportState === "awaiting_results" && lep.specimenIds.length === 1 && M.pendingTests(s, lep).length > 0);

  /* ---------- Ronan: admin review, then the portal once released ---------- */
  s = createInitialState();
  const ronan = s.episodes.find((e) => e.personId === "PH-P-0501");
  eq("Ronan's episode is in the review queue", [ronan.id, ronan.reportState], ["PH-E-0201", "ready_for_review"]);
  check("Ronan has a complete panel for review", M.pendingTests(s, ronan).length === 0 && s.observations.filter((o) => o.episodeId === "PH-E-0201").length > 20);
  check("Ronan's portal shows no report before release", P.participantVersions(s, "PH-E-0201").length === 0);
  run(act.setPersona("neil"));
  run(act.ackFlags("PH-E-0201")); run(act.setAdvice("PH-E-0201", "Sample advice. Please discuss with your GP.")); run(act.toggleReviewCheck("PH-E-0201", "advice")); run(act.toggleReviewCheck("PH-E-0201", "preview"));
  check("Ronan released from Review", run(act.releaseReport("PH-E-0201")).ok);
  run(act.setPortalPerson("PH-P-0501")); run(act.setPersona("participant"));
  const pd = P.portalData(s, "PH-P-0501");
  check("Ronan's released report appears in My results", pd.episodes.some((e) => e.id === "PH-E-0201") && P.participantVersions(s, "PH-E-0201").length === 1);
  check("Ronan opens it in the portal", run(act.viewReportInPortal("PH-E-0201")).ok);
  const relV = M.currentReleased(s, "PH-E-0201");
  const robs = M.versionObservations(s, relV).filter((o) => o.rangeVersion);
  check("each released result carries the range version it was judged against", robs.length > 20 && robs.every((o) => s.referenceRanges.versions.some((v) => v.id === o.rangeVersion)));
} finally {
  await server.close();
}
console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
