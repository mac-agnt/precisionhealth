// Checks for the client journey (Clients page, JourneyStrip and the hand-offs between stages):
// every client has twelve stages with a status, every link opens a page and tab that exist, every
// next action runs, and the journey moves when the business moves (first touch, won, onboarding
// link, release, results-out email, next year's lead). Usage: node tools/verify-journey.mjs
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
  await server.ssrLoadModule("/src/ph/pages/Sales/actions.ts");
  await server.ssrLoadModule("/src/ph/pages/Sales/flowActions.ts");
  await server.ssrLoadModule("/src/ph/pages/Clinics/daysActions.ts");
  const O = (await server.ssrLoadModule("/src/ph/pages/Sales/onbActions.ts")).onbAct;
  const JA = await server.ssrLoadModule("/src/ph/pages/Journey/actions.ts");
  const J = await server.ssrLoadModule("/src/ph/pages/Journey/model.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const STATUSES = ["done", "history", "progress", "todo", "na", "unrecorded"];
  const pageOk = (t) => !!M.PAGE_BY_ID[t.page] && (!t.tab || M.PAGE_BY_ID[t.page].tabs.some((x) => x.id === t.tab));
  const st = (j, id) => j.stages.find((x) => x.id === id);

  /* ---------- registry ---------- */
  check("Clients page is in the rail", M.PAGES.some((p) => p.id === "Clients" && p.label === "Clients" && p.hint === "Every client, start to finish"));
  eq("Agents still sits directly under Home", M.PAGES.slice(0, 2).map((p) => p.id), ["Home", "Agents"]);
  eq("Clients sits right after Calendar", M.PAGES[M.PAGES.findIndex((p) => p.id === "Calendar") + 1].id, "Clients");
  check("Clients is a PH screen", M.isPhScreen("Clients", "journey"));
  eq("twelve stages", J.JOURNEY_STAGES.length, 12);

  /* ---------- every client, every stage, every link ---------- */
  const clients = J.journeyClients(s);
  eq("IBM is first in the list", clients[0].key, "co-ibm");
  for (const k of ["co-ibm", "co-sisk", "co-sf", "LD-0020", "LD-0013", "ONB-001", "ONB-002"]) check(`${k} is listed`, clients.some((c) => c.key === k));
  const checkJourney = (label, j) => {
    check(`${label}: journey exists`, !!j);
    if (!j) return;
    eq(`${label}: 12 stages numbered 1 to 12`, j.stages.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    check(`${label}: every stage has a status`, j.stages.every((x) => STATUSES.includes(x.status)), JSON.stringify(j.stages.map((x) => x.status)));
    check(`${label}: done stages carry a date`, j.stages.every((x) => x.status !== "done" || !!x.date), JSON.stringify(j.stages.filter((x) => x.status === "done" && !x.date).map((x) => x.id)));
    check(`${label}: every stage opens a record`, j.stages.every((x) => x.open && x.open.label));
    const targets = J.journeyTargets(j);
    const bad = targets.filter((t) => !pageOk(t));
    check(`${label}: every link targets a page and tab in PAGES`, bad.length === 0, JSON.stringify(bad));
    check(`${label}: every link survives a hash round trip`, targets.every((t) => { const b = M.parseHash(M.hashFor(t)); return b && b.page === t.page && Object.entries(t.params || {}).every(([k, v]) => b.params[k] === v); }));
    check(`${label}: no dashes in the copy`, !/[–—]/.test(JSON.stringify(j)));
    check(`${label}: no unmerged placeholders`, !/\{\w+\}|undefined|NaN/.test(JSON.stringify(j.stages.map((x) => [x.facts, x.next, x.open.label]))));
  };
  for (const c of clients) checkJourney(c.key, J.journeyFor(s, c.key));

  /* ---------- resolving a client ---------- */
  eq("IBM by name", J.resolveClientKey(s, "IBM"), "co-ibm");
  eq("Sisk by lower case name", J.resolveClientKey(s, "sisk"), "co-sisk");
  eq("Brennan by first word", J.resolveClientKey(s, "brennan"), "LD-0020");
  eq("LD-0020 by id", J.resolveClientKey(s, "LD-0020"), "LD-0020");
  eq("programme id to its client", J.journeyKeyForProgramme(s, "PRG-IBM-26"), "co-ibm");
  eq("onboarding id to itself when there is no lead", J.journeyKeyForOnb(s, "ONB-001"), "ONB-001");
  eq("unknown name resolves to nothing", J.resolveClientKey(s, "Nobody Ltd"), null);

  /* ---------- IBM: real numbers, never invented ---------- */
  let ibm = J.journeyFor(s, "co-ibm");
  const ibmC = M.programmeCounts(s, "PRG-IBM-26");
  eq("IBM sales stages are marked as before the demo", ibm.stages.slice(0, 4).map((x) => x.status), ["history", "history", "history", "history"]);
  eq("IBM programme set up, dated to its window", [st(ibm, "programme").status, st(ibm, "programme").date], ["done", "2026-10-01"]);
  check("IBM 6 Nov day is published and shown", st(ibm, "day").status === "done" && st(ibm, "day").facts.some((f) => /6 Nov 2026/.test(f) && /Training Room 1/.test(f)));
  check("IBM draft day asks for the room", st(ibm, "day").actions.some((a) => a.kind === "go" && a.target.params.day === "SD-0003"));
  check("IBM invite stage shows the real code and invited count", st(ibm, "invite").facts.includes("Invite code DEMO-IBM-26") && st(ibm, "invite").facts.includes(`${ibmC.invited} employees invited`));
  check("IBM booking stage uses programmeCounts", st(ibm, "booking").facts[0] === `${ibmC.booked} of ${ibmC.invited} booked`);
  check("IBM release stage uses programmeCounts", st(ibm, "release").facts[0] === `${ibmC.released} of ${ibmC.episodes} reports released`);
  check("IBM held lab row offers the matching queue", st(ibm, "results").actions.some((a) => a.kind === "go" && a.target.page === "Results" && a.target.params.view === "queue"));
  eq("IBM retention waits for the results-out email", st(ibm, "retention").status, "progress");
  const rOut = st(ibm, "retention").actions.find((a) => a.kind === "act" && a.action.type === "ret/sendResultsOut");
  check("IBM retention offers Send results-out email", !!rOut);

  /* ---------- every next action runs ---------- */
  run(act.setPersona("stephen"));
  for (const c of J.journeyClients(s)) {
    for (const x of J.journeyFor(s, c.key).stages) for (const a of x.actions.filter((y) => y.kind === "act")) {
      const r = reduce(s, a.action).result;
      check(`${c.key} stage ${x.n}: "${a.label}" runs`, r.ok, r.message);
    }
  }

  /* ---------- release moves stages 11 and 12 ---------- */
  run(act.setPersona("neil"));
  const routine = s.episodes.filter((e) => e.programmeId === "PRG-IBM-26" && e.reportState === "ready_for_review").map((e) => e.id).find((id) => M.routineEligibility(s, s.episodes.find((x) => x.id === id)).ok);
  check("an IBM report can be released routinely", !!routine);
  const before = M.programmeCounts(s, "PRG-IBM-26").released;
  const rel = run(act.releaseRoutine ? act.releaseRoutine(routine) : { type: "review/releaseRoutine", episodeId: routine });
  check("release works", rel.ok, rel.message);
  ibm = J.journeyFor(s, "co-ibm");
  const after = M.programmeCounts(s, "PRG-IBM-26");
  eq("released count went up by one", after.released, before + 1);
  check("stage 11 shows the new released count", st(ibm, "release").facts[0] === `${after.released} of ${after.episodes} reports released`, st(ibm, "release").facts[0]);
  check("stage 11 HR portal count follows", st(ibm, "release").facts[1].endsWith(`${after.released} released`));
  check("stage 12 counts the new report for HR", st(ibm, "retention").facts.some((f) => f === `${after.released} new reports released since HR was last told`), JSON.stringify(st(ibm, "retention").facts));
  run(act.setPersona("stephen"));
  const sent = run(rOut.action);
  check("results-out email sends", sent.ok, sent.message);
  ibm = J.journeyFor(s, "co-ibm");
  check("stage 12 records the email with feedback and invoice note", st(ibm, "retention").facts.some((f) => /^Results-out email sent .* to Mair/.test(f) && /feedback form and invoice note/.test(f)));
  check("stage 12 no longer offers results-out", !st(ibm, "retention").actions.some((a) => a.kind === "act" && a.action.type === "ret/sendResultsOut"));
  const nextYear = st(ibm, "retention").actions.find((a) => a.kind === "act" && a.action.type === "sales/createLead");
  check("stage 12 offers Start next year's screening", !!nextYear && nextYear.openResult === "lead");

  /* ---------- the loop closes: next year's lead ---------- */
  const nl = run(nextYear.action);
  check("next year's lead is created from the recall", nl.ok && /^LD-\d{4}$/.test(nl.id), nl.message);
  ibm = J.journeyFor(s, "co-ibm");
  check("stage 12 is done and points at the new lead", st(ibm, "retention").status === "done" && st(ibm, "retention").open.target.params.lead === nl.id);
  check("the new IBM lead stays under IBM, not a separate client", !J.journeyClients(s).some((c) => c.key === nl.id) && J.journeyKeyForLead(s, nl.id) === "co-ibm");
  eq("recall shows in pipeline", M.salesRecalls(s).find((r) => r.programmeId === "PRG-IBM-26").status, "in_pipeline");

  /* ---------- LD-0020: first touch moves stage 1 ---------- */
  let b = J.journeyFor(s, "LD-0020");
  eq("Brennan Build Group starts at stage 1", [b.current, st(b, "lead").status], [0, "progress"]);
  check("Brennan later stages are not started", b.stages.slice(1).every((x) => x.status === "todo"));
  const ft = run({ type: "salesFlow/logFirstTouch", leadId: "LD-0020", via: "call" });
  check("first touch logs", ft.ok, ft.message);
  b = J.journeyFor(s, "LD-0020");
  eq("stage 1 is done after the first touch", st(b, "lead").status, "done");
  eq("Brennan moves on to the proposal", b.current, 1);

  /* ---------- won, onboarding link, client form ---------- */
  const won = run({ type: "salesFlow/markWon", leadId: "LD-0012" });
  check("mark LD-0012 as won", won.ok, won.message);
  const ob = run(O.start("wellness", "LD-0012"));
  check("onboarding starts linked to the lead", ob.ok && s.onboarding.onboardings.find((o) => o.id === ob.id).leadId === "LD-0012");
  let pj = J.journeyFor(s, "LD-0012");
  eq("won and onboarding stages", [st(pj, "won").status, st(pj, "onboarding").status], ["done", "progress"]);
  check("onboarding stage opens that onboarding", st(pj, "onboarding").open.target.params.onb === ob.id);
  check("onboarding first asks for the link", st(pj, "onboarding").actions[0].label === "Send the onboarding link");
  check("client form cannot complete before the link is sent", !run(JA.journeyAct.clientCompletedOnb(ob.id)).ok);
  const ls = run(JA.journeyAct.sendOnbLink(ob.id));
  check("send onboarding link", ls.ok, ls.message);
  const o1 = s.onboarding.onboardings.find((o) => o.id === ob.id);
  check("link is a Precision Health onboarding URL", /^precisionhealth\.ie\/onboard\/wellness\/onb-\d{3}-/.test(o1.clientLink.url), o1.clientLink.url);
  check("link sending is simulated in the audit", s.activity.some((e) => e.verb === "onboarding.link_sent" && e.simulated));
  const cc = run(JA.journeyAct.clientCompletedOnb(ob.id));
  check("client completed the form", cc.ok, cc.message);
  const o2 = s.onboarding.onboardings.find((o) => o.id === ob.id);
  check("details saved with a CRO number and contacts", !!o2.detailsSavedAt && /^\d{4,7}$/.test(o2.details.croNumber) && !!o2.details.hr.email && !!o2.details.finance.email);
  eq("onboarding moves to agreements", M.onbCurrentStep(o2), "agreements");
  check("a second completion is refused", !run(JA.journeyAct.clientCompletedOnb(ob.id)).ok);
  pj = J.journeyFor(s, "LD-0012");
  check("journey shows the client filled in the form", st(pj, "onboarding").facts.some((f) => /^Client filled in the form/.test(f)));
  for (const o of createInitialState().onboarding.onboardings) eq(`client answers are valid for ${o.id}`, Object.keys(M.onbDetailsErrors(o.kind, JA.onbClientAnswers(o))), []);
  check("programme stage offers the set-up task", st(pj, "programme").actions.some((a) => a.kind === "programmeTask" && a.leadId === "LD-0012"));
  check("screening day stage prefills the agent box", st(pj, "day").actions.some((a) => a.kind === "go" && a.target.page === "Clinics" && a.target.tab === "days" && /PJ Edwards/.test(a.target.params.text)));
  check("participant cannot send onboarding links", (() => { const pid = s.session.portalPersonId; const t = reduce(s, act.setPersona("participant")).state; void pid; return !reduce(t, JA.journeyAct.sendOnbLink("ONB-001")).result.ok; })());
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`verify-journey: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
