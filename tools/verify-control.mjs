// Checks for Neil's Control panel (src/ph/pages/Dashboard/control): the rows per service, the
// filters, Neil's rights across every service, and that every inline action really changes the
// store and moves the count it belongs to. Usage: node tools/verify-control.mjs
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
  const C = await server.ssrLoadModule("/src/ph/pages/Dashboard/control/select.ts");
  const { controlAct } = await server.ssrLoadModule("/src/ph/pages/Dashboard/control/actions.ts");
  const { fluAct } = await server.ssrLoadModule("/src/ph/pages/Flu/actions.ts");
  const { ohAct } = await server.ssrLoadModule("/src/ph/pages/OccHealth/actions.ts");
  const { rotaAct } = await server.ssrLoadModule("/src/ph/pages/Clinics/rotaActions.ts");
  const { opsAct } = await server.ssrLoadModule("/src/ph/pages/Clinics/opsActions.ts");
  const { daysAct } = await server.ssrLoadModule("/src/ph/pages/Clinics/daysActions.ts");
  const { onbAct } = await server.ssrLoadModule("/src/ph/pages/Sales/onbActions.ts");
  const { rrAct } = await server.ssrLoadModule("/src/ph/pages/Screening/actions.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const rows = () => C.controlRows(s);
  const of = (group) => rows().filter((r) => r.group === group);
  const t = M.today(s);

  /* ---------- tab and baseline ---------- */
  eq("dashboard tab label", M.PAGE_BY_ID.Dashboard.tabs.map((x) => x.label), ["Sales", "Control panel", "Executive"]);
  eq("tab id kept", M.PAGE_BY_ID.Dashboard.tabs[1].id, "operations");
  eq("baseline persona is Neil", s.session.personaId, "neil");
  eq("Neil manages flu", M.fluAccessFor("neil"), "manage");
  eq("Neil manages occupational health", M.ohAccess(s), "manage");
  check("Neil approves expenses", M.EXPENSE_APPROVERS.includes("neil"));
  const base = rows();
  check("every row has a known service and group", base.every((r) => C.SERVICES.includes(r.service) && C.GROUPS[r.service].some((g) => g.id === r.group)));
  eq("row ids are unique", new Set(base.map((r) => r.id)).size, base.length);
  eq("lab rows", of("lab").length, M.labQueue(s).length);
  eq("ready for review", of("review").length, M.reviewStats(s).ready);
  eq("urgent follow-ups", of("followup").length, M.openFollowUps(s).length);
  eq("results waiting", of("enter").length, M.awaitingLabEpisodes(s).length);
  eq("range questions", of("rrq").length, M.RR_QUESTIONS.length);
  check("draft screening day listed even beyond 14 days", of("day").some((r) => r.screeningDay && r.screeningDay.id === "SD-0003" && r.day.status === "draft"));
  eq("one stock row", of("stock").length, 1);
  check("stock row warns: nothing on hand, clinics allocated", of("stock")[0].stock.onHand === 0 && of("stock")[0].stock.allocated > 0 && of("stock")[0].urgent);
  check("cold chain alerts without follow-up", of("cold").length >= 1 && of("cold").every((r) => r.row.excursions.length && !r.row.followUps.length));
  eq("next Irish Life booking to accept", of("ilh").map((r) => r.sample.company), ["Lough Ree Credit Union"]);
  eq("MediBase sessions this week", of("ohSession").map((r) => r.diary.id), ["MDB-D1", "MDB-D2", "MDB-D3"]);
  check("OH agreements to sign", of("ohAgreement").length >= 3);
  check("clients onboarding", of("ohClient").length >= 5);
  eq("rota conflicts", of("conflict").length, M.rotaConflictsBetween(s, t, M.addDays(t, 13)).length);
  eq("unstaffed work", of("unstaffed").map((r) => r.item.key), ["flu:FLU-26-001"]);
  eq("expenses waiting", of("expense").map((r) => r.expense.id), ["EXP-0002", "EXP-0004"]);
  check("missing End of Day forms", of("eod").length > 0 && of("eod").every((r) => r.eod.date < t && !r.chasedAt));
  check("flu clinics in the next 14 days are not due yet", of("flu").length > 0 && of("flu").every((r) => !r.canRecord && r.clinic.date <= M.addDays(t, 13)));

  /* ---------- filters and counts ---------- */
  const cnt = C.serviceCounts(base);
  eq("counts add up", C.SERVICES.reduce((n, x) => n + cnt[x].open, 0), base.filter(C.isOpen).length);
  eq("service filter", C.filterRows(base, { service: "flu", client: "", urgent: false }).every((r) => r.service === "flu"), true);
  const ibm = C.filterRows(base, { service: "all", client: "IBM", urgent: false });
  check("client filter", ibm.length > 0 && ibm.every((r) => r.client === "IBM"), String(ibm.length));
  check("urgent filter", C.filterRows(base, { service: "all", client: "", urgent: true }).every((r) => r.urgent));
  check("client options sorted and unique", (() => { const o = C.clientOptions(base); return o.length > 3 && o.join() === [...new Set(o)].sort((a, b) => a.localeCompare(b)).join(); })());
  check("service filter guard", C.isServiceFilter("oh") && C.isServiceFilter("all") && !C.isServiceFilter("nope"));

  /* ---------- screening actions ---------- */
  const lab = of("lab").find((r) => r.item.candidate && r.item.source === "feed");
  check("a feed row with a candidate", !!lab);
  check("match needs both checks", !run(act.resolveRow(lab.item.row.id, lab.item.candidate.id, ["specimen"], "Checked against the collection record")).ok);
  check("match", run(act.resolveRow(lab.item.row.id, lab.item.candidate.id, ["specimen", "dob"], "Lab confirmed a typing error in the name")).ok);
  eq("lab count down by one", of("lab").length, base.filter((r) => r.group === "lab").length - 1);

  const rv = of("review").find((r) => r.routine);
  if (rv) {
    const n = of("review").length;
    check("release routine", run(act.releaseRoutine(rv.episode.id)).ok);
    eq("review count down by one", of("review").length, n - 1);
  } else check("a routine report to release", false);

  const fu = of("followup")[0];
  check("log call", run(act.logAttempt(fu.fu.followUp.id, "phone", "no_answer", "")).ok);
  eq("call count shows", of("followup").find((r) => r.id === fu.id).fu.attempts, fu.fu.attempts + 1);
  check("escalate", run(act.escalateFollowUp(fu.fu.followUp.id, "No answer twice, escalating.")).ok);
  eq("escalation shows", of("followup").find((r) => r.id === fu.id).fu.followUp.escalations.length, 1);

  check("answer range question", run(rrAct.answerQuestion(of("rrq")[0].q.id, "Agreed.")).ok);
  eq("questions down by one", of("rrq").length, M.RR_QUESTIONS.length - 1);

  check("draft without a room cannot publish", !run(daysAct.publish("SD-0003")).ok && of("day").find((r) => r.screeningDay?.id === "SD-0003").blocked);
  const sd3 = s.screeningDays.days.find((d) => d.id === "SD-0003");
  check("room confirmed", run(daysAct.save({ ...M.formOf(sd3), room: "Room 3.01" }, "form", "SD-0003")).ok && !of("day").find((r) => r.screeningDay?.id === "SD-0003").blocked);
  check("publish draft day", run(daysAct.publish("SD-0003")).ok);
  check("published day is no longer a draft", of("day").every((r) => r.day.status !== "draft"));
  const dayWithNurse = of("day").find((r) => r.rota && !r.rota.locked && r.rota.leadId);
  if (dayWithNurse) {
    const free = M.rotaCandidates(s, dayWithNurse.rota).find((c) => !c.on && !c.busy);
    check("change nurse on a screening day", !!free && run(rotaAct.swap(dayWithNurse.rota.ref, dayWithNurse.rota.date, dayWithNurse.rota.leadId, free.staff.id)).ok);
    eq("new nurse shows", of("day").find((r) => r.id === dayWithNurse.id).day.session.nurseId, free.staff.id);
  }

  /* ---------- flu actions ---------- */
  const flu0 = s.flu.clinics.length;
  check("accept Irish Life booking", run(fluAct.intakeIlh()).ok);
  eq("flu clinic added", s.flu.clinics.length, flu0 + 1);
  eq("next Irish Life booking moves on", of("ilh").map((r) => r.sample.company), ["Moyvalley Foods"]);
  const st0 = of("stock")[0].stock;
  check("order vaccines", run(fluAct.addOrder("Corrib Pharma Distribution (fictional)", 500, M.addDays(t, 14), "From the control panel")).ok);
  eq("on order goes up", of("stock")[0].stock.onOrder, st0.onOrder + 500);
  const next = of("stock")[0].nextOrderId;
  const order = s.flu.orders.find((o) => o.id === next);
  check("record delivery", run(fluAct.recordDelivery(order.id, t, order.sampleBatch.code, order.sampleBatch.expiry)).ok);
  eq("stock on hand", of("stock")[0].stock.onHand, order.quantity);
  eq("batch available for actuals", C.fluBatchesLeft(s).map((b) => b.remaining), [order.quantity]);
  const cold = of("cold")[0];
  const coldN = of("cold").length;
  check("acknowledge needs a note", !run(fluAct.logFollowUp(cold.row.key, "rechecked", "ok", 0)).ok);
  check("acknowledge cold chain alert", run(fluAct.logFollowUp(cold.row.key, "rechecked", "Thermometer checked, reading confirmed in range on recheck.", 0)).ok);
  eq("cold chain alert gone", of("cold").length, coldN - 1);
  const un = of("unstaffed")[0];
  const nurse = M.rotaCandidates(s, un.item).find((c) => !c.busy && !c.on && c.staff.id !== "ian");
  check("assign a nurse to unstaffed flu clinic", !!nurse && run(rotaAct.assign(un.item.ref, un.item.date, nurse.staff.id, "lead")).ok);
  eq("unstaffed list empty", of("unstaffed").length, 0);
  check("flu clinic shows the nurse", of("flu").find((r) => r.clinic.id === "FLU-26-001").clinic.staffIds.includes(nurse.staff.id));

  /* ---------- occupational health actions ---------- */
  const ses = of("ohSession")[0];
  check("send questionnaires to MediBase", run(ohAct.sendToMeddbase(ses.toSend)).ok);
  eq("nothing left to send for that session", of("ohSession")[0].toSend.length, 0);
  const missing = ses.missing[0];
  check("chase a questionnaire", run(ohAct.chaseQuestionnaire(missing)).ok);
  check("chase only once", !run(ohAct.chaseQuestionnaire(missing)).ok);
  const ag = of("ohAgreement").find((r) => r.kind === "ohAgreement" && r.stage === "generated");
  if (ag) {
    check("send agreement", run(ohAct.sendAgreement(ag.oh.id, "both")).ok);
    eq("stage moves to sent", of("ohAgreement").find((r) => r.id === ag.id).stage, "sent");
    check("mark signed", run(ohAct.markSigned(ag.oh.id, "both")).ok);
    check("signed agreement leaves the list", !of("ohAgreement").some((r) => r.id === ag.id));
  } else check("a generated agreement", false);
  const doc = of("ohAgreement").find((r) => r.kind === "onbDoc");
  if (doc) {
    const okDoc = doc.status === "draft" ? run(onbAct.sendDoc(doc.onb.id, doc.doc)).ok && run(onbAct.signDoc(doc.onb.id, doc.doc)).ok : run(onbAct.signDoc(doc.onb.id, doc.doc)).ok;
    check("onboarding agreement signed", okDoc && !of("ohAgreement").some((r) => r.id === doc.id));
  }

  /* ---------- team actions ---------- */
  check("approve subsistence", run(opsAct.decideExpense("EXP-0002", true)).ok);
  check("decline needs a reason", !run(opsAct.decideExpense("EXP-0004", false, "")).ok);
  check("decline hotel", run(opsAct.decideExpense("EXP-0004", false, "Day trip, no overnight needed")).ok);
  eq("no claims waiting", of("expense").length, 0);
  const eod = of("eod")[0];
  check("chase End of Day form", run(controlAct.chaseEod(eod.eod.key, eod.eod.staffId, eod.eod.date, eod.eod.label)).ok);
  check("chased date shows", !!of("eod").find((r) => r.id === eod.id).chasedAt);
  check("only one reminder a day", !run(controlAct.chaseEod(eod.eod.key, eod.eod.staffId, eod.eod.date, eod.eod.label)).ok);
  check("future days cannot be chased", !run(controlAct.chaseEod("x", eod.eod.staffId, M.addDays(t, 2), "x")).ok);
  check("chase writes activity", s.activity.some((e) => e.verb === "eod.chased" && e.simulated));
  run(act.setPersona("participant"));
  check("participant preview cannot chase", !run(controlAct.chaseEod(of("eod")[1]?.eod.key || "k", eod.eod.staffId, eod.eod.date, eod.eod.label)).ok);
  run(act.setPersona("neil"));

  /* ---------- counts move ---------- */
  const after = C.serviceCounts(rows());
  check("screening count went down", after.screening.open < cnt.screening.open, JSON.stringify([cnt.screening, after.screening]));
  check("team count went down", after.team.open < cnt.team.open, JSON.stringify([cnt.team, after.team]));
  check("flu urgent count went down", after.flu.urgent < cnt.flu.urgent, JSON.stringify([cnt.flu, after.flu]));
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`verify-control: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
