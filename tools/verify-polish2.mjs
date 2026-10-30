// Checks for the polish2 slice: MediBase wording, Retention alias, company directory, human task
// links, mark-as-won without auto onboarding, next action after notes, package names, calendar
// overlap layout, count ranges and saved calendar views. Usage: node tools/verify-polish2.mjs
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
  await server.ssrLoadModule("/src/ph/pages/Sales/flowActions.ts");
  await server.ssrLoadModule("/src/ph/pages/Calendar/viewActions.ts");
  const P = await server.ssrLoadModule("/src/ph/pages/ClientPortal/data.ts");
  const W = await server.ssrLoadModule("/src/ph/pages/Work/shared.tsx");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };

  /* item 10, 11: wording and the Retention alias */
  check("OH tab says MediBase", M.PAGE_BY_ID.OccHealth.tabs.some((t) => t.label === "MediBase sessions"));
  eq("#/Sales/retention opens the Retention tab", M.parseHash("#/Sales/retention").tab, "recall");
  eq("#/Sales/recall still works", M.parseHash("#/Sales/recall").tab, "recall");
  eq("source filter says Retention", M.SALES_SOURCE_LABEL.recall, "Retention");

  /* item 37: no "(fictional)" in company or person names */
  check("no (fictional) in lead names", s.sales.leads.every((l) => !/fictional/i.test(l.company + l.contact.name + l.contact.role)));

  /* item 28: every company named anywhere has a record */
  const dir = M.companyDirectory(s);
  for (const n of ["LinkedIn", "Dornan Group", "IRFU", "Shannon Estuary Foods", "Cairn Homes", "ABP"]) check(`company record for ${n}`, !!M.companyForName(s, n), n);
  check("every lead company resolves", s.sales.leads.every((l) => !!M.companyForName(s, l.company)));
  check("every retention company resolves", M.salesRecalls(s).every((r) => !!M.companyForName(s, r.company)));
  check("every Irish Life company resolves", s.sales.ilh.every((b) => !!M.companyForName(s, b.company)));
  check("directory ids are unique", new Set(dir.map((c) => c.id)).size === dir.length);
  check("stored companies keep their ids", s.companies.every((c) => dir.some((d) => d.id === c.id && !d.derived)));
  check("derived links open Records", M.linkFor("company", M.companyForName(s, "Cairn Homes").id).page === "Records");

  /* item 28: tasks link by name, not id */
  const t6 = s.tasks.find((t) => t.linked.kind === "followup");
  check("follow up task shows a person", /^Follow up: [A-Z]/.test(W.refLabel(s, t6.linked)), W.refLabel(s, t6.linked));
  const tb = s.tasks.find((t) => t.linked.kind === "batch");
  check("batch task shows lab results, not the id", !/BATCH-/.test(W.refLabel(s, tb.linked)), W.refLabel(s, tb.linked));
  check("task status says To do", M.taskViews(s).some((v) => v.statusLabel === "To do") && !M.taskViews(s).some((v) => v.statusLabel === "Open"));

  /* items 23, 26: next action follows the notes; won does not start onboarding */
  run(act.setPersona("stephen"));
  const lead = s.sales.leads.find((l) => l.stage === "new" && !s.sales.proposals.some((p) => p.leadId === l.id));
  check("notes saved", run({ type: "salesFlow/saveNotes", leadId: lead.id, text: "Met HR. About 120 people over two days in March." }).ok);
  eq("next action moves to the proposal", s.sales.leads.find((l) => l.id === lead.id).nextAction, "Build the proposal from the meeting notes");
  const onbBefore = s.onboarding.onboardings.length;
  const w = run({ type: "salesFlow/markWon", leadId: lead.id });
  check("mark as won", w.ok && /Choose Occupational Health or Wellness/.test(w.message), w.message);
  eq("no onboarding until the type is chosen", s.onboarding.onboardings.length, onbBefore);

  /* item 25: client-facing package names */
  eq("package title", M.salesPackageTitle(s.sales.priceItems.find((i) => i.id === "gold1")), "Gold health screening (Gold 1)");
  const ups = M.salesUpsells({ packageId: "poc3", headcount: 50, flu: true, fluCount: 50, execCount: 1, locations: "", dates: "" }, s.sales.priceItems);
  check("upsell has no opaque programme name", ups.every((u) => !/POC3 programme|All Silver 1 components/.test(u.title + u.detail)), JSON.stringify(ups.map((u) => u.title)));

  /* item 18: a day added after the window is marked as added */
  const drafts = new Set(s.screeningDays.days.filter((d) => d.status !== "published").map((d) => d.sessionId));
  const fut = s.sessions.find((x) => x.programmeId === "PRG-IBM-26" && x.status === "scheduled" && x.date >= M.today(s) && !drafts.has(x.id));
  check("an upcoming IBM clinic", !!fut);
  check("inside the window it is not marked added", P.upcomingClinicDays(s, "PRG-IBM-26").filter((x) => x.id === fut.id).every((x) => !x.added));
  fut.date = "2026-11-20";
  check("a date after the window is marked added", P.upcomingClinicDays(s, "PRG-IBM-26").some((x) => x.id === fut.id && x.added));

  /* item 35: overlaps, count ranges */
  const ev = (id, start, end) => ({ id, kind: "clinic_session", title: id, date: "2026-10-05", start: "", allDay: false, time: { start, end }, staffIds: [], link: { page: "Home" }, openLabel: "" });
  const lay = M.calLayoutDay([ev("a", "09:00", "16:00"), ev("b", "09:00", "16:00"), ev("c", "09:00", "16:00"), ev("d", "09:00", "16:00"), ev("e", "17:00", "18:00")]);
  check("four at once share one cluster", new Set(["a", "b", "c", "d"].map((k) => lay.get(k).cluster)).size === 1 && lay.get("a").cols === 4);
  check("a later event starts a new cluster", lay.get("e").cluster !== lay.get("a").cluster && lay.get("e").cols === 1);
  check("more than three fold into a chip", 4 > M.CAL_MAX_SIDE_BY_SIDE && M.CAL_MIN_BLOCK_PX >= 80);
  eq("month counts cover only the month", M.calCountRange("month", "2026-10-15"), M.calRange("agenda", "2026-10-15"));
  eq("people view is one day", M.calRange("people", "2026-10-05"), { from: "2026-10-05", to: "2026-10-05" });

  /* calendar views */
  eq("persona default views", [M.calDefaultViewFor("stephen"), M.calDefaultViewFor("neil")], ["stephen-sales", "neil-ops"]);
  check("five ready-made views", ["everything", "neil-ops", "stephen-sales", "nurse-rota", "clinics-only"].every((id) => M.CAL_PRESET_VIEWS.some((v) => v.id === id)));
  check("preset groups exist", M.CAL_PRESET_VIEWS.every((v) => !v.params.types || v.params.types.split(",").every((g) => M.CAL_GROUP_BY_ID[g])));
  const sv = run({ type: "calview/save", name: "Monday clinics", params: { types: "clinics", view: "week", date: "2026-10-05", junk: "x" } });
  check("save a view", sv.ok && s.scheduled.views.length === 1, sv.message);
  eq("only view filters are kept", s.scheduled.views[0].params, { types: "clinics", view: "week" });
  check("duplicate name refused", !run({ type: "calview/save", name: "monday clinics", params: {} }).ok);
  check("preset name refused", !run({ type: "calview/save", name: "Everything", params: {} }).ok);
  check("rename", run({ type: "calview/rename", id: sv.id, name: "Clinic week" }).ok && s.scheduled.views[0].name === "Clinic week");
  check("presets cannot be deleted", !run({ type: "calview/delete", id: "everything" }).ok);
  check("delete", run({ type: "calview/delete", id: sv.id }).ok && s.scheduled.views.length === 0);
  run(act.setPersona("participant"));
  check("participant cannot save views", !run({ type: "calview/save", name: "Mine", params: {} }).ok);
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`verify-polish2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
