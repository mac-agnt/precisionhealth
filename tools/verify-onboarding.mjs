// Checks for client onboarding and retention (Sales, Onboarding and Sales, Retention).
// Usage: node tools/verify-onboarding.mjs
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
  const A = (await server.ssrLoadModule("/src/ph/pages/Sales/onbActions.ts")).onbAct;
  const S = await server.ssrLoadModule("/src/ph/pages/Sales/onbSelect.ts");
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };

  /* ---------- seeds ---------- */
  const ob = s.onboarding;
  eq("two seeded onboardings, one of each", ob.onboardings.map((o) => o.kind), ["oh", "wellness"]);
  eq("OH seed waits on the SLA signature", M.onbCurrentStep(ob.onboardings[0]), "agreements");
  eq("Wellness seed waits on the team", M.onbCurrentStep(ob.onboardings[1]), "team");
  eq("OH has six steps, wellness five", [M.onbStepsFor("oh").length, M.onbStepsFor("wellness").length], [6, 5]);
  check("onboarding copy has no dashes", !/[—–]/.test(JSON.stringify(ob)));
  check("deterministic", JSON.stringify(createInitialState().onboarding) === JSON.stringify(createInitialState().onboarding));

  /* ---------- recall rule: three months ---------- */
  const jj = M.salesRecalls(s).find((r) => r.company === "J&J");
  eq("J&J reminder three months before the anniversary", [jj.recallOn, jj.planFrom], ["2027-02-05", "2026-11-05"]);
  const rem = S.retReminders(s);
  const jjr = rem.find((r) => r.recall.company === "J&J");
  eq("J&J reminder scheduled for 5 Nov to the named contact", [jjr.dueOn, jjr.state, jjr.contact.name], ["2026-11-05", "scheduled", "Treasa Moloney"]);
  check("rebooked clients get no reminder", !rem.some((r) => ["LinkedIn", "IRFU", "Dornan Group"].includes(r.recall.company)));
  check("seeded reminders show as sent", rem.filter((r) => r.state === "sent").length === 3);
  const athlone = rem.find((r) => r.recall.company === "Athlone Medtech Services");
  eq("Athlone reminder due now", [athlone.dueOn, athlone.state], ["2026-08-26", "due"]);

  /* ---------- rebooking rate ---------- */
  const rate = S.retRebookingRate(s);
  eq("rebooking rate: 2025 clients", [rate.year, rate.base, rate.rebooked, rate.pct], [2025, 11, 6, 55]);

  /* ---------- results out on release ---------- */
  let q = S.retReleaseQueue(s);
  eq("only IBM waiting for a results email at start", q.map((x) => [x.programmeId, x.newReports]), [["PRG-IBM-26", 18]]);
  run(act.setPersona("stephen"));
  const sent1 = run(A.sendResultsOut("PRG-IBM-26"));
  check("send results out", sent1.ok && S.retReleaseQueue(s).length === 0);
  const em = s.onboarding.emails.find((e) => e.id === sent1.id);
  check("results out goes to the IBM HR contact with feedback link and invoice note", em.toEmail === "mairead.costello@example.com" && /feedback/.test(em.body) && /invoice/i.test(em.body) && !/\{\w+\}/.test(em.body + em.subject));
  check("results out email is simulated in the audit", s.activity.some((e) => e.verb === "retention.results_out_sent" && e.simulated));
  run(act.setPersona("neil"));
  const ready = M.reviewQueue ? M.reviewQueue(s) : null;
  const routine = s.episodes.filter((e) => e.reportState === "ready_for_review").map((e) => e.id).find((id) => M.routineEligibility(s, s.episodes.find((x) => x.id === id)).ok);
  const rel = run(act.releaseRoutine ? act.releaseRoutine(routine) : { type: "review/releaseRoutine", episodeId: routine });
  check("a routine release is possible", rel.ok, rel.message);
  q = S.retReleaseQueue(s);
  check("a new release queues a results email for that programme", q.length === 1 && q[0].newReports === 1, JSON.stringify(q.map((x) => [x.programmeId, x.newReports])));
  void ready;

  /* ---------- onboarding end to end: OH from a won lead ---------- */
  s = createInitialState();
  run(act.setPersona("stephen"));
  check("cannot onboard a lead that is not won", !run(A.start("oh", "LD-0005")).ok);
  const st = run(A.start("wellness", "LD-0013"));
  const o = s.onboarding.onboardings.find((x) => x.id === st.id);
  check("start from won lead prefills", st.ok && o.leadId === "LD-0013" && o.details.companyName === "LinkedIn" && o.details.main.email === "orlagh.prendergast@example.com" && o.details.hr.name === "Orlagh Prendergast" && o.details.services.includes("Health screening days"));
  check("starting twice opens the same one", run(A.start("wellness", "LD-0013")).id === st.id && s.onboarding.onboardings.length === 3);
  check("won leads list excludes onboarded", !S.onbWonLeads(s).some((l) => l.id === "LD-0013"));
  const oh = run(A.start("oh", null));
  const id = oh.id;
  const g = () => s.onboarding.onboardings.find((x) => x.id === id);
  check("agreements need details first", !run(A.generateDoc(id, "dsa")).ok);
  const d = structuredClone(g().details);
  Object.assign(d, { companyName: "Test Freight (fictional)", croNumber: "12ab", services: ["Management referrals"], invoiceTo: "ap_email", apEmail: "not-an-email" });
  d.main = { name: "Ann Test", email: "ann@example.com", phone: "" }; d.hr = { name: "Bo Test", email: "bo@example.com", phone: "" }; d.finance = { name: "Cy Test", email: "cy@example.com", phone: "" };
  d.referralManager = { name: "Di Test", email: "", phone: "" };
  check("bad CRO rejected", !run(A.saveDetails(id, d)).ok);
  d.croNumber = "123456";
  check("bad AP email rejected", !run(A.saveDetails(id, d)).ok);
  d.apEmail = "ap@example.com";
  check("details saved", run(A.saveDetails(id, d)).ok && M.onbStepDone(g()).details);
  for (const k of ["dsa", "sla"]) {
    check(`${k} generated`, run(A.generateDoc(id, k)).ok && g().docs[k].status === "draft");
    check(`${k} cannot be signed before sending`, !run(A.signDoc(id, k)).ok);
    check(`${k} sent`, run(A.sendDoc(id, k)).ok && g().docs[k].status === "sent");
    check(`${k} signed`, run(A.signDoc(id, k)).ok && g().docs[k].status === "signed");
  }
  const doc = S.onbRenderDoc(g(), "sla");
  const text = doc.sections.map((x) => x.paragraphs.map((p) => p.map((y) => ("t" in y ? y.t : y.v)).join("")).join(" ")).join(" ");
  check("SLA merges the company, CRO and AP email", /Test Freight/.test(text) && /123456/.test(text) && /ap@example\.com/.test(text) && !/missing\]/.test(text));
  const tasks = s.tasks.length;
  check("route to OH ops creates a task for Fiona", run(A.route(id)).ok && s.tasks.length === tasks + 1 && s.tasks[s.tasks.length - 1].ownerId === "fiona" && s.tasks[s.tasks.length - 1].linked.kind === "onboarding");
  check("task visible in Work, Tasks", M.taskViews(s).some((t) => t.task.id === g().route.taskId));
  check("finish blocked until MediBase and Xero", !run(A.finish(id)).ok);
  g().medibase.ticks.forEach((_, i) => run(A.medibaseTick(id, i, true)));
  check("MediBase checklist done", M.onbStepDone(g()).medibase);
  check("wellness billing not allowed for OH", !run(A.setBilling(id, "per_programme")).ok);
  check("choose €1,050 retainer", run(A.setBilling(id, "retainer_1050")).ok && g().xero.billing === "retainer_1050");
  check("create in Xero", run(A.createXero(id)).ok && !!g().xero.contactRef);
  eq("OH billing codes", M.onbBillingCodes("oh", "retainer_1050").map((x) => x.code), ["OH-RET-1050", "OH-MB", "OH-XTRA"]);
  check("billing locked after Xero", !run(A.setBilling(id, "retainer_525")).ok);
  const fin = run(A.finish(id));
  const welcome = s.onboarding.emails.find((e) => e.id === g().welcomeEmailId);
  check("finish sends welcome email", fin.ok && !!g().completedAt && welcome && welcome.toEmail === "ann@example.com" && /Test Freight/.test(welcome.subject));
  eq("progress complete", M.onbProgress(g()), { done: 6, total: 6 });

  /* ---------- contacts left ---------- */
  const before = S.retReminders(s).find((r) => r.recall.company === "Athlone Medtech Services");
  check("Athlone contact is Kevin", before.contact.name === "Kevin Brophy");
  check("mark contact left without a replacement", run(A.contactLeft("Athlone Medtech Services", null)).ok);
  const mid = S.retReminders(s).find((r) => r.recall.company === "Athlone Medtech Services");
  check("reminder stops: no contact", mid.state === "no_contact" && !run(A.sendRebooking(mid.recall.id)).ok);
  check("left person cannot be chosen again", !run(A.setContact("Athlone Medtech Services", { name: "Kevin Brophy", role: "", email: "kevin.brophy@example.com" })).ok);
  check("choose a new contact", run(A.setContact("Athlone Medtech Services", { name: "Maeve Quigley", role: "HR Manager", email: "maeve.quigley@example.com" })).ok);
  const sendR = run(A.sendRebooking(mid.recall.id));
  const remEmail = s.onboarding.emails.find((e) => e.id === sendR.id);
  check("reminder goes to the new named contact", sendR.ok && remEmail.toEmail === "maeve.quigley@example.com" && /Maeve/.test(remEmail.body));
  check("reminder sent once", !run(A.sendRebooking(mid.recall.id)).ok);

  /* ---------- templates ---------- */
  check("template needs a subject", !run(A.saveTemplate("rebooking", "", "Hello there friend")).ok);
  check("edit template", run(A.saveTemplate("feedback", "Quick question, {contact_first_name}", "Hi {contact_first_name}, how did {company} find it?")).ok);
  const prev = S.retRender(s, "feedback", M.retSampleValues());
  eq("merge fields fill", prev.subject, "Quick question, Kevin");
  check("reset template", run(A.resetTemplate("feedback")).ok && s.onboarding.templates.feedback.subject === M.RET_DEFAULT_TEMPLATES.feedback.subject);

  /* ---------- participant preview ---------- */
  run(act.setPersona("participant"));
  check("participant cannot start onboarding", !run(A.start("oh", null)).ok);
} finally {
  await server.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
