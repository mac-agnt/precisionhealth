// Checks for programmes you can create and manage (Programmes, + New programme) and the nurse rota
// (Clinics, Nurse rota): programmes live in state, a new programme appears in every list, gets its
// client portal and invite code, the screening days agent accepts its client, and rota changes
// update the session, screening day, flu clinic and Meddbase records. Usage: node tools/verify-prog.mjs
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
  await server.ssrLoadModule("/src/ph/pages/Portals/actions.ts");
  await server.ssrLoadModule("/src/ph/pages/Calendar/schedActions.ts");
  const PA = await server.ssrLoadModule("/src/ph/pages/Programmes/progActions.ts");
  const PM = await server.ssrLoadModule("/src/ph/pages/Programmes/progModel.ts");
  const RA = await server.ssrLoadModule("/src/ph/pages/Clinics/rotaActions.ts");
  const RM = await server.ssrLoadModule("/src/ph/pages/Programmes/model.ts");
  const CP = await server.ssrLoadModule("/src/ph/pages/ClientPortal/data.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const base = M.totalCounts(s);

  /* ---------- programmes live in state, seeded three unchanged ---------- */
  eq("three seeded programmes in state", s.programmes.map((p) => p.id), ["PRG-SISK-26", "PRG-SF-26", "PRG-IBM-26"]);
  check("seeded programmes identical to the constant", JSON.stringify(s.programmes) === JSON.stringify(M.PROGRAMMES));
  eq("registry order", [...M.PROGRAMME_ORDER], ["PRG-SISK-26", "PRG-SF-26", "PRG-IBM-26"]);
  eq("programmeList", M.programmeList(s).map((p) => p.id), ["PRG-SISK-26", "PRG-SF-26", "PRG-IBM-26"]);
  eq("seeded programmes are live", s.programmes.map(M.programmeStatus), ["live", "live", "live"]);
  eq("client portals: three seeded", M.clientPortalRows(s).map((r) => r.company), ["Sisk", "Salesforce", "IBM"]);

  /* ---------- the form ---------- */
  const blank = PM.blankForm(s);
  check("blank form has errors", Object.keys(PM.progErrors(s, blank)).length >= 4);
  const svc = PM.serviceOptions(s).map((o) => o.id);
  eq("services from the price list", svc, ["lab", "poc3", "silver1", "silver2", "silver3", "gold1", "gold2", "gold3", "exec"]);
  const typed = PM.prefillFor(s, blank, "", "Acme Engineering");
  eq("typed client: name, code", [typed.companyName, typed.name.startsWith("Acme Engineering Point of Care Screening"), typed.inviteCode], ["Acme Engineering", true, "DEMO-ACME-26"]);
  const ibmPre = PM.prefillFor(s, blank, "co-ibm");
  eq("existing client prefill: HR and sites", [ibmPre.hrName, ibmPre.sites, ibmPre.headcount], ["Mairéad Costello", "IBM Dublin, Demo Screening Room", "150"]);
  check("existing client code avoids the one in use", ibmPre.inviteCode === "DEMO-IBM-26-2", ibmPre.inviteCode);

  /* ---------- create for a brand new client ---------- */
  const form = { ...typed, headcount: "120", sites: "Acme Dublin office; Acme Cork plant", hrName: "Orla Brennan", hrEmail: "orla.brennan@example.com", windowStart: "2026-10-26", windowEnd: "2026-11-27" };
  form.name = "Acme Engineering Health Screening 2026";
  eq("valid form", PM.progErrors(s, form), {});
  run(act.setPersona("martina"));
  check("martina cannot create programmes", !run(PA.progAct.create(form)).ok);
  run(act.setPersona("participant"));
  check("participant preview cannot create programmes", !run(PA.progAct.create(form)).ok);
  run(act.setPersona("stephen"));
  check("bad email refused", !run(PA.progAct.create({ ...form, hrEmail: "orla" })).ok);
  check("taken code refused", !run(PA.progAct.create({ ...form, inviteCode: "DEMO-IBM-26" })).ok);
  check("window end before start refused", !run(PA.progAct.create({ ...form, windowEnd: "2026-10-01" })).ok);
  const r1 = run(PA.progAct.create(form));
  check("created", r1.ok && r1.id === "PRG-ACME-26", JSON.stringify(r1));
  const acme = s.programmes.find((p) => p.id === "PRG-ACME-26");
  eq("programme fields", [acme.code, acme.clientName, acme.sites, acme.inviteCode, acme.setup.status, acme.setup.method, acme.setup.headcount, acme.setup.serviceId],
    ["ACME", "Acme Engineering", ["Acme Dublin office", "Acme Cork plant"], "DEMO-ACME-26", "draft", "poc", 120, "poc3"]);
  const co = s.companies.find((c) => c.id === acme.clientId);
  check("company record created", co && co.kind === "client" && co.name === "Acme Engineering" && co.programmeIds.includes("PRG-ACME-26"));
  check("HR contact on the company", s.contacts.some((c) => c.companyId === co.id && c.email === "orla.brennan@example.com"));
  const code = s.invitationCodes.find((c) => c.programmeId === "PRG-ACME-26");
  eq("invite code record", [code?.code, code?.status, code?.expiresOn, code?.linkText], ["DEMO-ACME-26", "active", "2026-11-27", "portal.precisionhealth.example.invalid/i/DEMO-ACME-26"]);
  check("activity event", s.activity.some((e) => e.verb === "programme.created" && e.programmeId === "PRG-ACME-26"));

  /* appears in lists */
  eq("registry follows state", [...M.PROGRAMME_ORDER], ["PRG-SISK-26", "PRG-SF-26", "PRG-IBM-26", "PRG-ACME-26"]);
  check("PROGRAMME_BY_ID knows it", M.PROGRAMME_BY_ID["PRG-ACME-26"]?.clientName === "Acme Engineering");
  check("ix index knows it", M.ix(s).programmeById.get("PRG-ACME-26")?.name === acme.name);
  check("programme register lists it", RM.programmeRows(s).some((r) => r.p.id === "PRG-ACME-26"));
  check("client portal page list (live)", CP.CLIENT_PROGRAMMES.includes("PRG-ACME-26"));
  const portal = M.clientPortalRows(s).find((r) => r.programmeId === "PRG-ACME-26");
  eq("client (HR) portal on the Portals page", [portal?.company, portal?.code, portal?.status, portal?.hrName, !!portal?.rec], ["Acme Engineering", "DEMO-ACME-26", "draft", "Orla Brennan", true]);
  eq("still four client portals (no duplicate)", M.clientPortalRows(s).length, 4);
  check("schedule client options include it", M.schedClientOptions(s).some((o) => o.name === "Acme Engineering"));
  check("portal content falls back to its own programme", M.portalContent(s, "PRG-ACME-26").welcome === undefined || !/Sisk/.test(JSON.stringify(M.portalContent(s, "PRG-ACME-26"))));
  eq("baseline counts unchanged by a new programme", [M.totalCounts(s).invited, M.totalCounts(s).booked, M.totalCounts(s).capacity, M.totalCounts(s).released], [base.invited, base.booked, base.capacity, base.released]);
  check("client portal funnel works for it", CP.programmeFunnel(s, "PRG-ACME-26").tiles.length === 4);

  /* go live from the Portals page puts the programme live too */
  const goLive = run({ type: "portals/goLive", id: portal.id });
  check("portals go live", goLive.ok, JSON.stringify(goLive));
  eq("programme live with its portal", s.programmes.find((p) => p.id === "PRG-ACME-26").setup.status, "live");
  check("set live again refused", !run(PA.progAct.setStatus("PRG-ACME-26", "live")).ok);
  check("back to draft (no bookings)", run(PA.progAct.setStatus("PRG-ACME-26", "draft")).ok);
  check("live again", run(PA.progAct.setStatus("PRG-ACME-26", "live")).ok && M.clientPortalRows(s).find((r) => r.programmeId === "PRG-ACME-26").status === "live");

  /* edit */
  const ef = PM.formFromProgramme(s, s.programmes.find((p) => p.id === "PRG-ACME-26"));
  const ed = run(PA.progAct.update("PRG-ACME-26", { ...ef, headcount: "140", windowEnd: "2026-12-04" }));
  check("edit saved", ed.ok, JSON.stringify(ed));
  eq("edit applied", [s.programmes.find((p) => p.id === "PRG-ACME-26").setup.headcount, s.programmes.find((p) => p.id === "PRG-ACME-26").windowEnd, s.invitationCodes.find((c) => c.programmeId === "PRG-ACME-26").expiresOn], [140, "2026-12-04", "2026-12-04"]);
  check("edit with no change refused", !run(PA.progAct.update("PRG-ACME-26", PM.formFromProgramme(s, s.programmes.find((p) => p.id === "PRG-ACME-26")))).ok);

  /* ---------- screening days agent accepts the new client ---------- */
  const ctx = () => ({ today: M.today(s), staff: s.staff, sessions: s.sessions, days: s.screeningDays.days, programmes: s.programmes });
  const d1 = M.draftFromRequest("Acme, 4 November, point of care, nurse Aisling, Boardroom 2", ctx());
  eq("agent reads the new client", [d1.form.programmeId, d1.form.date, d1.form.screen, d1.form.nurseId, d1.source.programmeId], ["PRG-ACME-26", "2026-11-04", "poc", "aisling", "said"]);
  const d1b = M.draftFromRequest("Acme Engineering 5 Nov", { today: M.today(s), staff: s.staff, sessions: s.sessions, days: s.screeningDays.days });
  eq("agent reads it without programmes passed (registry)", d1b.form.programmeId, "PRG-ACME-26");
  const none = M.draftFromRequest("5 November, lab", ctx());
  check("agent's question lists the new client", /Acme Engineering/.test(none.why.programmeId) && /IBM/.test(none.why.programmeId), none.why.programmeId);
  const ibm = M.draftFromRequest("IBM, 6 November", ctx());
  eq("IBM still IBM", ibm.form.programmeId, "PRG-IBM-26");
  const saved = run({ type: "days/save", form: { ...d1.form, appointments: 20 }, via: "agent" });
  check("day saved on the new programme", saved.ok, JSON.stringify(saved));
  const day = s.screeningDays.days.find((d) => d.id === saved.id);
  const sess = s.sessions.find((x) => x.id === day.sessionId);
  eq("session for the new programme", [sess?.id, sess?.programmeId, sess?.nurseId], ["CLN-ACME-20261104", "PRG-ACME-26", "aisling"]);
  check("published", run({ type: "days/publish", dayId: day.id }).ok);
  check("new programme counts: capacity from its day", M.programmeCounts(s, "PRG-ACME-26").capacity === 20);
  check("next screening day in the register", RM.programmeRows(s).find((r) => r.p.id === "PRG-ACME-26").next?.session.id === "CLN-ACME-20261104");

  /* second programme for an existing client: date picks the right one */
  const ibm27 = { ...PM.prefillFor(s, PM.blankForm(s), "co-ibm"), windowStart: "2027-03-01", windowEnd: "2027-03-31" };
  ibm27.name = "IBM Spring Screening 2027"; ibm27.inviteCode = "DEMO-IBM-27";
  const r2 = run(PA.progAct.create(ibm27));
  check("second IBM programme", r2.ok && r2.id === "PRG-IBM-27", JSON.stringify(r2));
  eq("no duplicate IBM company", s.companies.filter((c) => c.name === "IBM").length, 1);
  eq("agent: IBM in March goes to the 2027 programme", M.draftFromRequest("IBM, 10 March 2027", ctx()).form.programmeId, "PRG-IBM-27");
  eq("agent: IBM in November stays on 2026", M.draftFromRequest("IBM, 6 November", ctx()).form.programmeId, "PRG-IBM-26");

  /* from an onboarding */
  const onb = s.onboarding.onboardings[s.onboarding.onboardings.length - 1];
  const fromOnb = PM.prefillFor(s, PM.blankForm(s), `onb:${onb.id}`);
  eq("onboarding prefill", [fromOnb.companyName, fromOnb.onboardingId, fromOnb.hrName], [onb.details.companyName.trim(), onb.id, onb.details.hr.name.trim()]);
  check("onboarding appears in the client choices or is already a company", PM.clientChoices(s).some((c) => c.name === onb.details.companyName.trim()));

  /* ---------- nurse rota ---------- */
  s = createInitialState();
  run(act.setPersona("stephen"));
  const t = M.today(s);
  eq("demo today", t, "2026-10-05");
  eq("rota nurses", M.rotaNurses(s).map((x) => x.id), ["liz", "fiona", "anita", "aisling", "ciara", "ian"]);
  eq("week Monday to Sunday", M.rotaWeek("2026-10-08"), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  const today = M.rotaItemsOn(s, t);
  check("today's three clinics and the Meddbase session", ["session:CLN-SISK-20261005", "session:CLN-SF-20261005", "session:CLN-IBM-20261005", "oh:MDB-D1"].every((k) => today.some((x) => x.key === k)));
  eq("Sisk today: Fiona with Ian", M.rotaCellItems(s, "ian", t).map((x) => x.key), ["oh:MDB-D1", "session:CLN-SISK-20261005"]);
  /* seeded conflicts */
  const anita12 = M.rotaConflicts(s, "anita", "2026-10-12");
  check("Anita on leave 12 Oct but on a flu clinic", anita12.some((c) => c.kind === "leave" && c.keys.includes("flu:FLU-26-002")), JSON.stringify(anita12));
  check("Ian double-booked today (Meddbase and Sisk support)", M.rotaConflicts(s, "ian", t).some((c) => c.kind === "double"));
  check("no conflict for Liz today", M.rotaConflicts(s, "liz", t).length === 0);
  /* unstaffed */
  const un = M.rotaUnstaffed(s, "2026-10-12", "2026-10-18");
  check("Slaney Foods flu clinic is unstaffed", un.some((x) => x.key === "flu:FLU-26-001"));

  /* assign to an unstaffed flu clinic */
  const slaney = M.rotaItemsOn(s, "2026-10-12").find((x) => x.key === "flu:FLU-26-001");
  check("busy nurse refused (Fiona at Sisk 12 Oct)", !run(RA.rotaAct.assign(slaney.ref, "2026-10-12", "fiona")).ok);
  check("nurse on leave refused (Anita)", /leave/.test(run(RA.rotaAct.assign(slaney.ref, "2026-10-12", "anita")).message || ""));
  check("free nurse assigned", run(RA.rotaAct.assign(slaney.ref, "2026-10-12", "ciara")).ok);
  eq("flu clinic staff updated", s.flu.clinics.find((c) => c.id === "FLU-26-001").staffIds, ["ciara"]);
  check("no longer unstaffed", !M.rotaUnstaffed(s, "2026-10-12", "2026-10-12").some((x) => x.key === "flu:FLU-26-001"));

  /* resolve Anita's leave conflict by changing the nurse */
  const felt = M.rotaItemsOn(s, "2026-10-12").find((x) => x.key === "flu:FLU-26-002");
  const cands = M.rotaCandidates(s, felt);
  check("candidates: free nurses first, Fiona busy", cands.find((x) => x.staff.id === "fiona").busy && !cands.find((x) => x.staff.id === "aisling").busy);
  check("swap Anita for Aisling", run(RA.rotaAct.swap(felt.ref, "2026-10-12", "anita", "aisling")).ok);
  eq("flu clinic now Aisling", s.flu.clinics.find((c) => c.id === "FLU-26-002").staffIds, ["aisling"]);
  check("Anita's 12 Oct conflict gone", M.rotaConflicts(s, "anita", "2026-10-12").length === 0);

  /* change the nurse on a screening day: session, day and nurse portal follow */
  const ibmDay = M.rotaItemsOn(s, "2026-11-06").find((x) => x.key === "session:CLN-IBM-20261106");
  eq("IBM 6 Nov is a screening day with Fiona", [ibmDay.kind, ibmDay.leadId], ["screening_day", "fiona"]);
  check("change IBM 6 Nov nurse to Ciara", run(RA.rotaAct.swap(ibmDay.ref, "2026-11-06", "fiona", "ciara")).ok);
  eq("session.nurseId updated", s.sessions.find((x) => x.id === "CLN-IBM-20261106").nurseId, "ciara");
  const sd = s.screeningDays.days.find((d) => d.sessionId === "CLN-IBM-20261106");
  eq("screening day nurse updated with history", [sd.nurseId, sd.history[sd.history.length - 1].changes[0].to], ["ciara", "Ciara Nolan"]);
  const cal = M.calendarEvents ? null : null; void cal;
  /* today's IBM clinic: nurse portal follows */
  const ibmToday = M.rotaItemsOn(s, t).find((x) => x.key === "session:CLN-IBM-20261005");
  check("today's IBM: Liz to Aisling", run(RA.rotaAct.swap(ibmToday.ref, t, "liz", "aisling")).ok);
  const NP = await server.ssrLoadModule("/src/ph/pages/NursePortal/data.ts");
  eq("nurse portal: Aisling's clinic today", NP.nurseSessionToday(s, "aisling")?.id, "CLN-IBM-20261005");
  eq("nurse portal: Liz has no clinic today", NP.nurseSessionToday(s, "liz"), null);
  /* support */
  check("add Liz as support today", run(RA.rotaAct.assign(ibmToday.ref, t, "liz", "support")).ok);
  eq("supportIds", s.sessions.find((x) => x.id === "CLN-IBM-20261005").supportIds, ["liz"]);
  check("remove support", run(RA.rotaAct.remove(ibmToday.ref, t, "liz")).ok && s.sessions.find((x) => x.id === "CLN-IBM-20261005").supportIds.length === 0);
  /* remove the lead: unstaffed */
  const sisk8 = M.rotaItemsOn(s, "2026-10-08").find((x) => x.key === "session:CLN-SISK-20261008");
  check("remove Sisk 8 Oct nurse", run(RA.rotaAct.remove(sisk8.ref, "2026-10-08", "anita")).ok);
  check("Sisk 8 Oct now unstaffed", M.rotaUnstaffed(s, "2026-10-08", "2026-10-08").some((x) => x.key === "session:CLN-SISK-20261008"));
  check("assign from an empty cell", M.rotaOpenWork(s, "ciara", "2026-10-08").some((w) => w.item.key === "session:CLN-SISK-20261008" && w.as === "lead"));
  check("put Ciara on", run(RA.rotaAct.assign(sisk8.ref, "2026-10-08", "ciara")).ok && s.sessions.find((x) => x.id === "CLN-SISK-20261008").nurseId === "ciara");
  /* past items are locked */
  const past = M.rotaItemsOn(s, "2026-10-01").find((x) => x.ref.kind === "session");
  check("past clinic locked", past.locked && !run(RA.rotaAct.swap(past.ref, "2026-10-01", past.leadId, "ciara")).ok);
  /* Meddbase */
  const mdb = M.rotaItemsOn(s, "2026-10-06").find((x) => x.key === "oh:MDB-D2");
  check("Meddbase nurse change", run(RA.rotaAct.swap(mdb.ref, "2026-10-06", "anita", "fiona")).ok);
  eq("diary clinician updated", [s.occHealth.diaries.find((d) => d.id === "MDB-D2").clinicianStaffId, s.occHealth.diaries.find((d) => d.id === "MDB-D2").clinicianName], ["fiona", "Fiona Fenton"]);
  check("Meddbase has one nurse", !run(RA.rotaAct.assign(mdb.ref, "2026-10-06", "ciara", "support")).ok);
  /* leave creates a conflict that the rota flags */
  const lv = run({ type: "sched/create", form: { kind: "leave", date: "2026-10-15", staffIds: ["fiona"], title: "Annual leave" } });
  check("leave added", lv.ok, JSON.stringify(lv));
  check("Fiona's 15 Oct flu clinic flagged", M.rotaConflicts(s, "fiona", "2026-10-15").some((c) => c.kind === "leave"));
  check("rota changes need permission", (() => { run(act.setPersona("martina")); const r = run(RA.rotaAct.assign(slaney.ref, "2026-10-12", "liz", "support")); run(act.setPersona("stephen")); return !r.ok; })());
  check("rota activity written", s.activity.filter((e) => e.verb === "rota.changed").length >= 6);
  check("no clashes created among sessions", M.scheduleOverlaps(s).length === 0, JSON.stringify(M.scheduleOverlaps(s)));
} catch (e) {
  failed++;
  console.log("ERROR", e?.stack || e);
} finally {
  await server.close();
}
console.log(`verify-prog: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
