// Checks for the Dashboard (src/ph/pages/Dashboard): tab ids and old-id routing, the default tab per
// persona (Stephen opens Sales, everyone else Operations), and that the Sales and Operations
// selectors return sane, live numbers. Usage: node tools/verify-dash.mjs
import { createServer } from "vite";
import { readFileSync, readdirSync } from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0, passed = 0;
const check = (name, cond, extra = "") => {
  if (cond) passed++;
  else { failed++; console.log("FAIL", name, extra); }
};
const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

try {
  const M = await server.ssrLoadModule("/src/ph/model/index.ts");
  const D = await server.ssrLoadModule("/src/ph/pages/Dashboard/select.ts");
  const SA = (await server.ssrLoadModule("/src/ph/pages/Sales/actions.ts")).salesAct;
  const FA = (await server.ssrLoadModule("/src/ph/pages/Sales/flowActions.ts")).flowAct;
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };

  /* ---------- tabs and routing ---------- */
  eq("dashboard tabs", M.PAGE_BY_ID.Dashboard.tabs.map((t) => t.id), ["sales", "operations", "executive"]);
  eq("old clinic-operations id opens operations", M.resolveTab("Dashboard", "clinic-operations"), "operations");
  eq("old clinical-delivery id opens operations", M.resolveTab("Dashboard", "clinical-delivery"), "operations");
  eq("executive kept", M.resolveTab("Dashboard", "executive"), "executive");
  eq("old hash parses to operations", M.parseHash("#/Dashboard/clinical-delivery").tab, "operations");
  eq("hash for an old id writes the new id", M.hashFor({ page: "Dashboard", tab: "clinic-operations" }), "#/Dashboard/operations");
  eq("other pages unchanged", M.resolveTab("Sales", "onboarding"), "onboarding");
  eq("unknown tab falls back to the first tab elsewhere", M.resolveTab("Results", "nope"), "inbox");
  eq("default by persona", ["stephen", "neil", "brenda", "martina", "liz"].map(D.dashDefaultTab), ["sales", "operations", "operations", "operations", "operations"]);
  eq("tab for page", [D.dashTabFor("sales", "neil"), D.dashTabFor("", "stephen"), D.dashTabFor("clinical-delivery", "stephen"), D.dashTabFor(undefined, "neil")], ["sales", "sales", "operations", "operations"]);

  /* The page module registers the persona default with the router. Same module graph as the app. */
  await server.ssrLoadModule("/src/ph/pages/Dashboard/index.tsx");
  const store = await server.ssrLoadModule("/src/ph/store.ts");
  store.resetDemo();
  eq("baseline persona is Neil, Dashboard opens Operations", [store.getState().session.personaId, M.defaultTab("Dashboard"), M.parseHash("#/Dashboard").tab], ["neil", "operations", "operations"]);
  store.dispatch(act.setPersona("stephen"), { silent: true });
  eq("Stephen: Dashboard opens Sales", [M.defaultTab("Dashboard"), M.parseHash("#/Dashboard").tab, M.hashFor({ page: "Dashboard" })], ["sales", "sales", "#/Dashboard/sales"]);
  eq("Stephen can still deep link to Operations", M.parseHash("#/Dashboard/operations").tab, "operations");
  store.dispatch(act.setPersona("brenda"), { silent: true });
  eq("Brenda: Operations", M.defaultTab("Dashboard"), "operations");
  store.resetDemo();
  eq("other pages keep their first tab", [M.defaultTab("Sales"), M.defaultTab("Results")], ["pipeline", "inbox"]);

  /* ---------- sales: period ---------- */
  const P = D.salesPeriodStats(s, "30d");
  eq("30 day window", [P.from, P.to], ["2026-09-06", "2026-10-05"]);
  check("30 days: leads", P.leads.length >= 10 && P.leads.every((l) => l.receivedOn >= P.from && l.receivedOn <= P.to), String(P.leads.length));
  check("30 days: first touch sane", P.touched > 0 && P.touched <= P.leads.length && P.withinTarget <= P.touched && P.touchPct >= 0 && P.touchPct <= 100 && P.avgTouchSec > 0, JSON.stringify([P.touched, P.withinTarget, P.touchPct, P.avgTouchSec]));
  eq("30 days: one lead waiting (Brennan Build)", P.waiting, 1);
  check("30 days: meetings", P.meetings > 0 && P.meetings <= s.sales.leads.length, String(P.meetings));
  check("30 days: proposals sent with value", P.proposalsSent.length >= 3 && P.proposalsValue > 0 && P.proposalsSent.every((x) => x.value >= 0), JSON.stringify(P.proposalsSent.map((x) => x.proposal.id)));
  check("30 days: won", P.won.length >= 1 && P.wonValue > 0 && P.winRate >= 0 && P.winRate <= 100, JSON.stringify([P.won.map((w) => w.lead.id), P.wonValue, P.winRate]));
  const PM = D.salesPeriodStats(s, "month");
  eq("this month window", [PM.from, PM.to], ["2026-10-01", "2026-10-05"]);
  check("this month is a subset of 30 days", PM.leads.length <= P.leads.length && PM.leads.every((l) => P.leads.includes(l)));
  check("touch average uses recorded minutes", D.firstTouchFor(s, s.sales.leads.find((l) => l.id === "LD-0001")).seconds === 360);

  /* ---------- sales: pipeline, needs, onboarding, retention, revenue ---------- */
  const pipe = D.pipelineByStage(s);
  eq("pipeline stages", pipe.map((r) => r.stage), ["new", "proposal_sent", "won", "lost"]);
  eq("pipeline counts add up to every lead", pipe.reduce((n, r) => n + r.count, 0), s.sales.leads.length);
  check("proposal stage has value", pipe[1].count === 4 && pipe[1].value > 0, JSON.stringify(pipe[1]));
  const N = D.salesNeeds(s);
  eq("needs: inbound waiting", N.inbound.map((x) => x.lead.id), [M.SALES_INBOUND_LEAD_ID]);
  eq("needs: proposals waiting", N.proposals.map((x) => x.lead.id).sort(), ["LD-0009", "LD-0010", "LD-0011", "LD-0012"]);
  check("needs: follow-ups this week counted from the sequences", N.followUpsThisWeek >= 1 && N.followUpsThisWeek <= N.proposals.length, String(N.followUpsThisWeek));
  check("needs: next steps are new leads only", N.actions.length > 0 && N.actions.every((a) => a.lead.stage === "new" && a.lead.id !== M.SALES_INBOUND_LEAD_ID));
  eq("needs: stuck onboardings", N.stuck.map((x) => [x.o.id, x.step]).sort(), [["ONB-001", "agreements"], ["ONB-002", "team"]]);
  check("needs: stuck text names the unsigned SLA", /SLA/.test(N.stuck.find((x) => x.o.id === "ONB-001").what));
  const O = D.onboardingRows(s);
  eq("onboarding: wellness", O.wellness.map((r) => r.id), ["ONB-002"]);
  check("onboarding: OH includes Sales onboarding and OH form clients", O.oh.some((r) => r.id === "ONB-001") && O.oh.filter((r) => r.source === "occ").length === M.ohSummary(s).onboarding, String(O.oh.length));
  check("onboarding: links", O.oh.concat(O.wellness).every((r) => (r.source === "sales" ? r.link.params.onb === r.id : r.link.params.client === r.id)));
  const R = D.retentionStats(s);
  check("retention: rate sane", R.rate.base > 0 && R.rate.pct >= 0 && R.rate.pct <= 100, JSON.stringify([R.rate.rebooked, R.rate.base]));
  check("retention: reminders within 3 months and unsent", R.remindersDue.every((r) => r.state !== "sent" && r.dueOn <= "2027-01-05"));
  eq("retention: contacts who left", R.left.map((x) => [x.company, x.replaced]), [["ABP", true]]);
  const V = D.revenueStats(s);
  check("revenue: won this year splits into screening and other", V.wonYear > 0 && V.wonScreening + V.wonOther === V.wonYear, JSON.stringify(V));
  eq("revenue: Irish Life awaiting payment", [V.ilhAwaitingCount, V.ilhAwaiting], [3, 2940]);
  eq("revenue: OH recurring from completed OH clients", [V.ohActive, V.ohActiveClients], [M.ohSummary(s).yearlyFees, M.ohSummary(s).fullyCompleted]);
  check("revenue: OH pending includes the 525 retainer", V.ohPending >= 525 && V.ohPendingClients === M.ohSummary(s).onboarding + 1);
  const up = D.salesUpcomingDays(s);
  check("screening days this month: after today, within October", up.length > 0 && up.every((r) => r.session.date > "2026-10-05" && r.session.date <= "2026-10-31"), String(up.length));

  /* ---------- live: the dashboard moves when Stephen works ---------- */
  run(act.setPersona("stephen"));
  const r1 = run(FA.logFirstTouch(M.SALES_INBOUND_LEAD_ID, "call", new Date(Date.parse(s.clock.nowUtc) + 60000).toISOString()));
  check("first touch logged", r1.ok, r1.message);
  const P2 = D.salesPeriodStats(s, "30d");
  eq("after the call nobody is waiting", [P2.waiting, P2.touched, D.salesNeeds(s).inbound.length], [0, P.touched + 1, 0]);
  check("in-time reply lifts or keeps the rate", P2.withinTarget === P.withinTarget + 1);
  const r2 = run(SA.moveLead("LD-0011", "won"));
  check("won a lead", r2.ok, r2.message);
  const P3 = D.salesPeriodStats(s, "30d");
  eq("won count and value move", [P3.won.length, P3.wonValue > P2.wonValue], [P2.won.length + 1, true]);
  eq("pipeline moves", D.pipelineByStage(s).map((r) => r.count).slice(1, 3), [pipe[1].count - 1, pipe[2].count + 1]);
  check("revenue this year moves", D.revenueStats(s).wonYear > V.wonYear);

  /* ---------- operations ---------- */
  s = createInitialState();
  const X = D.opsStats(s);
  eq("today: three clinics, one point of care", [X.today.length, X.todayPoc, X.todayLab], [3, 1, 2]);
  check("today: booked within capacity", X.todayBooked > 0 && X.todayBooked <= X.todayCapacity, JSON.stringify([X.todayBooked, X.todayCapacity]));
  eq("today matches the day stats", [X.todayBooked, X.todayCapacity], [M.todayStats(s).booked, M.todayStats(s).capacity]);
  eq("results: lab rows, awaiting lab, ready, over 48 hours", [X.labRows.length, X.awaitingLab, X.ready, X.over48], [M.labQueue(s).length, M.awaitingLabEpisodes(s).length, 20, 6]);
  check("results: released last 7 days sane", X.releasedWeek >= 0 && X.releasedWeek <= M.totalCounts(s).released && X.sameDayPoc <= X.releasedWeek, JSON.stringify([X.releasedWeek, X.sameDayPoc]));
  check("next 14 days: future only", X.next14.length > 0 && X.next14.every((r) => r.session.date > "2026-10-05" && r.session.date <= "2026-10-19") && X.next14Booked <= X.next14Capacity);
  eq("quality: range questions open", X.rangeQuestions, M.RR_QUESTIONS.length);
  eq("quality: data quality holds", X.dataQuality, M.holdCounts(s).dataQuality);
  eq("quality: follow-ups", X.followUps, M.openFollowUps(s).length);
  eq("delivery per client", X.programmes.map((p) => [p.client, p.invited, p.booked, p.attended, p.released]), [["Sisk", 500, 240, 150, 126], ["Salesforce", 200, 80, 50, 41], ["IBM", 150, 45, 25, 18]]);
  check("delivery bars never exceed invited", X.programmes.every((p) => p.booked <= p.invited && p.attended <= p.booked && p.released <= p.attended));
  /* releasing a report moves the 7 day count */
  run(act.setPersona("neil"));
  const ep = M.reviewQueue(s).find((i) => i.routine);
  if (ep) {
    const rr = run(act.releaseRoutine(ep.episode.id));
    if (rr.ok) eq("release moves ready and released", [D.opsStats(s).ready, D.opsStats(s).releasedWeek], [X.ready - 1, X.releasedWeek + 1]);
    else console.log("note: release not run here:", rr.message);
  }

  /* ---------- copy ---------- */
  const dir = "src/ph/pages/Dashboard";
  for (const f of readdirSync(dir)) {
    const text = readFileSync(`${dir}/${f}`, "utf8");
    check(`no em or en dashes in ${f}`, !/[–—]/.test(text));
  }
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
