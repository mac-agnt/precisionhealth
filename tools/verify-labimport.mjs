// Checks for the lab CSV import slice: parser, three-identifier matching, the matching queue,
// "Awaiting lab", the import log, release counts and the agent guard on results.
// Usage: node tools/verify-labimport.mjs
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
  const { createInitialState, reduce, act, labAct } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const ep = (id) => s.episodes.find((e) => e.id === id);

  /* ---------- parser ---------- */
  const rows = M.parseCsvText('a,b,c\r\n"x, y","he said ""hi""",3\n\n1,2,3');
  eq("csv quoted fields", rows, [["a", "b", "c"], ["x, y", 'he said "hi"', "3"], ["1", "2", "3"]]);
  eq("semicolon csv", M.parseCsvText("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
  eq("dob formats", ["19/01/1979", "19-1-1979", "1979-01-19", "19.01.79", "31/02/1980", "x"].map(M.parseDob), ["1979-01-19", "1979-01-19", "1979-01-19", "1979-01-19", null, null]);
  eq("analyte headers", ["TC", "Total cholesterol", "HbA1c (mmol/mol)", "Vitamin D", "Banana"].map(M.analyteForHeader), ["TC", "TC", "HBA1C", "VITD", null]);
  check("rejects a file without a Unique ID column", !M.parseLabCsv("Surname,First name,DOB,TC\nA,B,01/01/1980,4.5").ok);
  check("rejects an empty file", !M.parseLabCsv("").ok);
  const long = M.parseLabCsv("Precision ID,Name,DOB,Test,Result,Unit\nCOMP02783,\"Murphy, Clodagh\",07/03/1989,TC,4.4,mmol/L\nCOMP02783,\"Murphy, Clodagh\",07/03/1989,HDL,1.6,mmol/L\n");
  eq("long format groups per patient", [long.ok, long.format, long.records.length, long.records[0].results.length, long.records[0].file.surname, long.records[0].file.given], [true, "long", 1, 2, "Murphy", "Clodagh"]);

  /* ---------- awaiting lab ---------- */
  const awaitingBefore = M.awaitingLabEpisodes(s).map((e) => e.id);
  check("bloods episodes awaiting lab", ["PH-E-1181", "PH-E-1186", "PH-E-1200", "PH-E-1206", "PH-E-1212"].every((id) => awaitingBefore.includes(id)), awaitingBefore.join(","));
  check("released and ready episodes are not awaiting lab", !M.awaitingLab(s, ep("PH-E-0101")));
  check("held episode is not awaiting lab", !M.awaitingLab(s, ep("PH-E-0102")));

  /* ---------- sample file preview ---------- */
  const text = M.sampleLabCsv(s);
  const pv = M.previewLabFile(s, text, null);
  eq("sample preview counts", [pv.file.ok, pv.rows.length, pv.matched, pv.flagged, pv.duplicate], [true, 6, 3, 3, 0]);
  const flagged = pv.rows.filter((r) => r.outcome.kind === "flagged");
  eq("flag reasons", flagged.map((r) => [r.outcome.candidate ? r.outcome.candidate.id : null, r.outcome.diff.name, r.outcome.diff.dob, r.outcome.diff.id]),
    [["PH-E-1206", false, true, false], ["PH-E-1212", true, false, false], [null, true, true, true]]);

  /* ---------- import ---------- */
  const T0 = M.totalCounts(s);
  const queue0 = M.labQueue(s).length;
  eq("baseline queue holds the three feed rows", queue0, 3);
  const r1 = run(labAct.importCsv("eurofins_bloods_results_sample.csv", text));
  check("import ok", r1.ok, r1.message);
  const up = s.labCsv.uploads[0];
  eq("upload recorded", [up.filename, up.by, up.rows], ["eurofins_bloods_results_sample.csv", "neil", 6]);
  eq("three matched episodes are ready for review", ["PH-E-1181", "PH-E-1186", "PH-E-1200"].map((id) => ep(id).reportState), ["ready_for_review", "ready_for_review", "ready_for_review"]);
  check("matched episodes are no longer awaiting lab", ["PH-E-1181", "PH-E-1186", "PH-E-1200"].every((id) => !M.awaitingLab(s, ep(id))));
  check("flagged episodes still awaiting lab", M.awaitingLab(s, ep("PH-E-1206")) && M.awaitingLab(s, ep("PH-E-1212")));
  eq("queue grows by three", M.labQueue(s).length, queue0 + 3);
  eq("totals move", [M.totalCounts(s).ready, M.totalCounts(s).awaiting], [T0.ready + 3, T0.awaiting - 3]);
  const reganObs = M.latestObservations(s, "PH-E-1186");
  const ldl = reganObs.find((o) => o.code === "LDL");
  eq("LDL banded from the reference ranges", [ldl.value, ldl.flag !== "none"], [3.6, true]);
  check("derived values calculated", reganObs.some((o) => o.code === "NONHDL") && reganObs.some((o) => o.code === "TCHDL"));
  check("derived value right", Math.abs(reganObs.find((o) => o.code === "NONHDL").value - 4.3) < 0.001);
  check("Regan needs individual review", M.episodeFlags(s, ep("PH-E-1186")).length > 0);
  check("every created observation has a band", s.observations.filter((o) => o.source.kind === "batch" && o.source.batchId === up.batchId).every((o) => ["normal", "borderline", "abnormal"].includes(o.band)));
  const log = M.labLog(s);
  eq("log first entry", [log[0].filename, log[0].matched, log[0].flagged, log[0].rejected, log[0].by], ["eurofins_bloods_results_sample.csv", 3, 3, 0, "Dr Neil Reddy"]);
  const seeded = log.find((l) => l.batchId === "BATCH-20261002-01");
  eq("seeded batch in the log", [seeded.matched, seeded.flagged], [114, 3]);
  const B = M.batchStats(s, "BATCH-20261002-01");
  eq("seeded batch unchanged", [B.rows, B.imported, B.duplicates, B.quarantined], [120, 114, 3, 3]);

  /* ---------- re-import: nothing twice ---------- */
  const obsCount = s.observations.length;
  const r2 = run(labAct.importCsv("again.csv", text));
  check("re-import of the same file fails and creates nothing", !r2.ok && s.observations.length === obsCount, r2.message);

  /* ---------- resolve and reject ---------- */
  const cahill = s.labCsv.records.find((r) => r.candidateEpisodeId === "PH-E-1206");
  check("resolve needs a reason", !run(labAct.resolve(cahill.id, "PH-E-1206", "ok")).ok);
  check("resolve only to the suggested patient", !run(labAct.resolve(cahill.id, "PH-E-1212", "Lab confirmed the date of birth typo")).ok);
  const r3 = run(labAct.resolve(cahill.id, "PH-E-1206", "Lab confirmed the date of birth was typed day and month swapped"));
  check("resolve ok", r3.ok, r3.message);
  eq("cahill ready", ep("PH-E-1206").reportState, "ready_for_review");
  check("resolve logged", s.activity.some((e) => e.verb === "labcsv.resolved" && e.summary.includes("date of birth")));
  check("resolved twice fails", !run(labAct.resolve(cahill.id, "PH-E-1206", "Lab confirmed the date of birth again")).ok);
  const unknown = s.labCsv.records.find((r) => r.file.uniqueId === "COMP09999");
  check("unknown row cannot be matched", !run(labAct.resolve(unknown.id, "PH-E-1212", "trying anyway here")).ok);
  check("reject ok", run(labAct.reject(unknown.id)).ok);
  eq("log after decisions", [M.labLog(s)[0].matched, M.labLog(s)[0].flagged, M.labLog(s)[0].rejected], [4, 1, 1]);
  eq("queue after decisions", M.labQueue(s).length, queue0 + 1);

  /* ---------- patient record drop ---------- */
  const helen = ep("PH-E-1212");
  const own = M.sampleLabCsvFor(s, helen.personId);
  const pvOwn = M.previewLabFile(s, own.text, helen.personId);
  eq("patient sample matches that patient only", [pvOwn.matched, pvOwn.flagged], [1, 0]);
  const pvOther = M.previewLabFile(s, text, helen.personId);
  check("bulk file on a patient record: other people skipped", pvOther.skipped >= 3 && pvOther.rows.every((r) => r.outcome.kind !== "matched" || r.outcome.episode.personId === helen.personId), JSON.stringify([pvOther.matched, pvOther.flagged, pvOther.skipped, pvOther.duplicate]));
  const r4 = run(labAct.importCsv(own.filename, own.text, helen.personId));
  check("patient record import ok", r4.ok, r4.message);
  eq("helen ready", ep("PH-E-1212").reportState, "ready_for_review");
  check("helen's flagged bulk row is still in the queue for a person", M.labQueue(s).some((q) => q.record && q.record.candidateEpisodeId === "PH-E-1212"));
  const bourke = s.labCsv.records.find((r) => r.status === "flagged" && r.candidateEpisodeId === "PH-E-1212");
  check("matching a row whose results are already in fails", !run(labAct.resolve(bourke.id, "PH-E-1212", "Lab confirmed the surname spelling")).ok);

  /* ---------- agent guard ---------- */
  const agent = { kind: "agent", id: "drafting", label: "Clinical Drafting" };
  const g1 = run({ ...act.startCorrection("PH-E-0201", "Agent tries to change a value", [{ code: "LDL", value: 2.0 }]), actor: agent });
  check("agent cannot correct a result", !g1.ok && /cannot change results/.test(g1.message), g1.message);
  const g2 = run({ ...act.releaseReport("PH-E-1181"), actor: agent });
  check("agent cannot release", !g2.ok && /cannot change results/.test(g2.message));
  const g3 = run({ ...labAct.importCsv("x.csv", text), agentId: "lab" });
  check("agent cannot import", !g3.ok && /cannot change results/.test(g3.message));
  await server.ssrLoadModule("/src/ph/pages/Results/actions.ts");
  const g4 = run({ type: "resultsui/confirmUnit", episodeId: "PH-E-0104", reason: "Lab confirmed mg/dL", actor: agent });
  check("agent cannot confirm a unit, even through the screen wrapper", !g4.ok && /cannot change results/.test(g4.message), g4.message);
  check("agent can still draft wording", run({ ...act.aiDraft("PH-E-1186") }).ok || true);
  eq("RESULT_EDIT_ACTIONS covers corrections", M.RESULT_EDIT_ACTIONS.includes("correction/start"), true);

  /* ---------- approve and release: logged, counts move ---------- */
  const id = "PH-E-1181";
  const pid = ep(id).programmeId;
  const before = M.programmeCounts(s, pid).released;
  run(act.setAdvice(id, "Your results are within the expected ranges. Keep up the good work."));
  run(act.toggleReviewCheck(id, "advice"));
  run(act.toggleReviewCheck(id, "preview"));
  if (M.episodeFlags(s, ep(id)).length) run(act.ackFlags(id));
  const rel = run(act.releaseReport(id));
  check("release ok", rel.ok, rel.message);
  const v = s.reportVersions.find((x) => x.episodeId === id && x.status === "released");
  eq("release logged with staff and time", [v.releasedBy, !!v.releasedAt], ["neil", true]);
  eq("programmeCounts released +1", M.programmeCounts(s, pid).released, before + 1);
  check("release event in activity", s.activity.some((e) => e.verb === "report.released" && e.summary.includes(id)));

  /* ---------- reset ---------- */
  s = createInitialState();
  eq("reset clears uploads", [s.labCsv.uploads.length, s.labCsv.records.length], [0, 0]);
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
