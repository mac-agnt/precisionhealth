// Checks for Stephen's sales desk (src/ph/model/salesDesk.ts, src/ph/pages/Sales/deskActions.ts):
// deal value and probability, saved views, next best action, timeline, contacts, Today, Follow-ups,
// Expiring soon, forecast, bulk actions, email, meetings, the editable follow-up sequence and the rail.
// Usage: node tools/verify-sales10x.mjs
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
  const DA = (await server.ssrLoadModule("/src/ph/pages/Sales/deskActions.ts")).deskAct;
  const FA = (await server.ssrLoadModule("/src/ph/pages/Sales/flowActions.ts")).flowAct;
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const lead = (id) => s.sales.leads.find((l) => l.id === id);
  const deal = (id) => M.deskDeal(s, lead(id));
  run(act.setPersona("stephen"));

  /* ---------- seed ---------- */
  check("three desk deals seeded", ["LD-0021", "LD-0022", "LD-0023"].every((id) => !!lead(id)) && lead("LD-0022").ownerId === "martina");
  check("deterministic", JSON.stringify(createInitialState().salesDesk) === JSON.stringify(createInitialState().salesDesk));
  check("example.com only", s.salesDesk.contacts.every((c) => /@example\.com$/.test(c.email)) && ["LD-0021", "LD-0022", "LD-0023"].every((id) => /@example\.com$/.test(lead(id).contact.email)));
  check("no dashes in desk copy", !/[—–]/.test(JSON.stringify(s.salesDesk) + JSON.stringify(["LD-0021", "LD-0022", "LD-0023"].map(lead))));
  check("desk slice small", M.deskRecordCount(s.salesDesk) < 120);

  /* ---------- value, probability, age ---------- */
  const occ = deal("LD-0009");
  check("proposal value used", !occ.estimated && occ.value === 4495, JSON.stringify([occ.value, occ.estimated]));
  eq("following up is 60%", [occ.step, occ.prob], ["follow", 60]);
  const bal = deal("LD-0021");
  check("estimate from price list over 10k", bal.estimated && bal.value > 10000 && bal.step === "proposal", JSON.stringify([bal.value, bal.step]));
  eq("budget approved adds 10", bal.prob, 50);
  eq("weighted is value times chance", deal("LD-0022").weighted, Math.round(deal("LD-0022").value * deal("LD-0022").prob / 100));
  check("OH only estimate is the annual fee", deal("LD-0004").value === 525 && deal("LD-0004").estimated);
  eq("age in days", deal("LD-0001").age, 4);
  check("overdue flagged", deal("LD-0010").overdue && deal("LD-0010").dueIn === -2);
  check("inbound waiting is hot", deal("LD-0020").waiting && deal("LD-0020").hot);

  /* ---------- views and filters ---------- */
  const all = M.deskDeals(s);
  const f = (p) => all.filter((d) => M.deskMatches(d, M.deskFilterFrom(p), "stephen")).map((d) => d.lead.id);
  check("over 10k view", f({ view: "big" }).length >= 3 && f({ view: "big" }).every((id) => deal(id).value > 10000));
  check("my deals excludes Martina's", !f({ view: "mine" }).includes("LD-0022") && f({ view: "mine" }).includes("LD-0009"));
  check("occupational health view", f({ view: "oh" }).includes("LD-0004") && f({ view: "oh" }).includes("LD-0021") && !f({ view: "oh" }).includes("LD-0001"));
  check("search", JSON.stringify(f({ q: "shannonside" })) === JSON.stringify(["LD-0022"]));
  check("overdue only", f({ overdue: "1" }).every((id) => deal(id).overdue) && f({ overdue: "1" }).length === 2);
  eq("filters round trip in the URL", M.deskFilterParams(M.deskFilterFrom({ view: "hot", q: "x", svc: "flu", overdue: "1" }), { mode: "list" }), { mode: "list", view: "hot", q: "x", svc: "flu", overdue: "1" });

  /* ---------- next best action, research, timeline, docs ---------- */
  eq("NBA reply for inbound", M.deskNextBest(s, lead("LD-0020")).kind, "reply");
  eq("NBA build for Ballinacor", M.deskNextBest(s, lead("LD-0021")).kind, "build");
  eq("NBA notes for Boyne Valley (meeting booked)", M.deskNextBest(s, lead("LD-0023")).kind, "notes");
  eq("NBA send for the draft proposal", M.deskNextBest(s, lead("LD-0003")).kind, "send");
  const rs = M.deskResearch(s, lead("LD-0012"));
  check("research: construction references", rs.sector === "construction" && rs.references.length >= 2, JSON.stringify(rs));
  check("research: existing relationship for IRFU", M.deskResearch(s, lead("LD-0014")).relationship.length >= 1);
  const tl = M.deskTimeline(s, "LD-0022");
  check("timeline has future follow ups first", tl[0].future && tl.some((x) => x.kind === "proposal") && tl.some((x) => x.kind === "meeting"));
  check("documents include DSA and SLA", M.deskDocs(s, lead("LD-0009")).filter((d) => d.kind === "agreement").length === 2);

  /* ---------- contacts ---------- */
  check("several contacts with a left flag", M.deskContacts(s, "LD-0022").length === 3 && M.deskContacts(s, "LD-0022").some((c) => c.left));
  check("bad email refused", !run(DA.addContact("LD-0001", { name: "Ann", title: "HR", email: "nope", role: "champion" })).ok);
  check("contact added", run(DA.addContact("LD-0001", { name: "Ann Byrne", title: "HR Officer", email: "ann.byrne@example.com", role: "champion" })).ok && M.deskContacts(s, "LD-0001").length === 2);
  check("main contact leaves", run(DA.contactLeft("LD-0001", "LD-0001:main", true)).ok && M.deskNextBest(s, lead("LD-0001")).kind === "contact");
  const ann = s.salesDesk.contacts.find((c) => c.email === "ann.byrne@example.com");
  check("make main swaps", run(DA.makePrimary("LD-0001", ann.id)).ok && lead("LD-0001").contact.name === "Ann Byrne" && M.deskContacts(s, "LD-0001").some((c) => c.name === "Gráinne Lacey" && c.left));
  check("left contact cannot be made main", !run(DA.makePrimary("LD-0022", s.salesDesk.contacts.find((c) => c.name === "Gavin Stokes").id)).ok);

  /* ---------- Today ---------- */
  let T = M.deskToday(s);
  check("today has reply now first", T[0].group === "reply" && T[0].leadId === "LD-0020");
  check("today groups", ["calls", "followups", "awaiting", "rebook"].every((g) => T.some((x) => x.group === g)), JSON.stringify([...new Set(T.map((x) => x.group))]));
  const lc = T.find((x) => x.ref.kind === "lead" && x.leadId === "LD-0010");
  check("snooze moves the next step to the next working day", run(DA.today(lc.key, "snooze")).ok && lead("LD-0010").nextActionOn === "2026-10-06" && !M.deskToday(s).some((x) => x.key === lc.key));
  check("calendar follows the move", M.calendarEvents(s).some((e) => e.id === "lead:LD-0010" && e.date === "2026-10-06"));
  const l2 = M.deskToday(s).find((x) => x.ref.kind === "lead");
  check("done sets the next best step", run(DA.today(l2.key, "done")).ok && lead(l2.leadId).nextActionOn > "2026-10-05");
  check("reschedule refuses the past", !run(DA.today(M.deskToday(s).find((x) => x.ref.kind === "await").key, "reschedule", "2026-10-01")).ok);
  const aw = M.deskToday(s).find((x) => x.ref.kind === "await");
  check("chase logged", run(DA.today(aw.key, "done")).ok && /chased/.test(lead(aw.leadId).history.slice(-1)[0].text) && !M.deskToday(s).some((x) => x.key === aw.key));
  const rb = M.deskToday(s).find((x) => x.ref.kind === "recall");
  const schedN = s.scheduled.items.length;
  check("rebooking rescheduled into the calendar", run(DA.today(rb.key, "reschedule", "2026-10-12")).ok && s.scheduled.items.length === schedN + 1 && s.scheduled.items.slice(-1)[0].kind === "rebooking");
  check("touch item cannot be done blind", !run(DA.today("touch:LD-0020", "done")).ok);

  /* ---------- Follow-ups ---------- */
  const F = M.deskFollowUps(createInitialState());
  check("follow ups across kinds and whens", F.some((x) => x.kind === "sequence") && F.some((x) => x.kind === "next") && ["overdue", "today", "week", "later"].every((w) => F.some((x) => x.when === w)), JSON.stringify([...new Set(F.map((x) => x.when))]));
  eq("this week runs to Sunday", [M.deskWhen("2026-10-05", "2026-10-11"), M.deskWhen("2026-10-05", "2026-10-12")], ["week", "later"]);
  const sq = F.find((x) => x.key === "seq:LD-0010:2");
  check("sequence send", sq && run(DA.follow(sq.key, "send")).ok && M.salesFollowSequence(s, "LD-0010").steps[1].status === "sent");
  const sq2 = M.deskFollowUps(s).find((x) => x.kind === "sequence" && x.leadId === "LD-0012");
  const before = s.scheduled.items.length;
  check("sequence reschedule becomes a calendar email", run(DA.follow(sq2.key, "reschedule", "2026-10-14")).ok && s.scheduled.items.length === before + 1 && M.deskFollowUps(s).some((x) => x.kind === "scheduled" && x.due === "2026-10-14"));
  const sc = M.deskFollowUps(s).find((x) => x.kind === "scheduled");
  check("scheduled email snooze moves it", run(DA.follow(sc.key, "snooze")).ok && s.scheduled.items.find((x) => x.id === sc.schedId).date === "2026-10-15");
  check("scheduled email send", run(DA.follow(sc.key, "send")).ok && s.scheduled.items.find((x) => x.id === sc.schedId).status === "done");
  const nx = M.deskFollowUps(s).find((x) => x.kind === "next" && x.leadId === "LD-0002");
  check("next step reschedule", run(DA.follow(nx.key, "reschedule", "2026-10-20")).ok && lead("LD-0002").nextActionOn === "2026-10-20");

  /* ---------- Expiring soon ---------- */
  let E = M.deskExpiring(s);
  check("expiring kinds", ["proposal", "oh_fee", "programme", "ilh"].every((k) => E.some((x) => x.kind === k)), JSON.stringify([...new Set(E.map((x) => x.kind))]));
  check("quotes with no reply 14+", E.filter((x) => x.noReplyDays !== null).every((x) => x.noReplyDays >= 14) && E.some((x) => x.ref === "PRP-0003" && x.noReplyDays === 18));
  check("30 day window is a subset", M.deskExpiring(s, 30).every((x) => x.daysLeft <= 30) && M.deskExpiring(s, 30).length < E.length);
  check("lapsed programme shown", E.some((x) => x.kind === "programme" && x.daysLeft < 0));
  const ip = E.find((x) => x.ref === "PRP-0003");
  check("extend proposal validity 30 days", run(DA.expiry(ip.key, "extend")).ok && M.deskProposalExpiry(s, "PRP-0003") === "2026-11-16");
  check("reminder to the client", run(DA.expiry(ip.key, "remind")).ok && M.deskExpiring(s).find((x) => x.key === ip.key).reminded && s.salesDesk.emails.length >= 1);
  const pv = s.sales.proposals.find((p) => p.id === "PRP-0003").versions.length;
  check("renew drafts a new version", run(DA.expiry(ip.key, "renew")).ok && s.sales.proposals.find((p) => p.id === "PRP-0003").versions.length === pv + 1);
  const fee = M.deskExpiring(s).find((x) => x.ref === "CON-01");
  check("renew a fee rolls it a year", run(DA.expiry(fee.key, "renew")).ok && s.salesDesk.contracts.find((c) => c.id === "CON-01").renewsOn === "2027-10-12" && !M.deskExpiring(s).some((x) => x.ref === "CON-01"));
  const prg = M.deskExpiring(s).find((x) => x.kind === "programme" && x.daysLeft >= 0);
  const nLeads = s.sales.leads.length;
  const rr = run(DA.expiry(prg.key, "renew"));
  check("renew a programme opens a renewal deal", rr.ok && s.sales.leads.length === nLeads + 1 && lead(rr.id).source === "recall" && !M.deskExpiring(s).some((x) => x.key === prg.key));
  const ilh = M.deskExpiring(s).find((x) => x.kind === "ilh");
  check("mark lost needs a reason", !run(DA.expiry(ilh.key, "lost", "")).ok && run(DA.expiry(ilh.key, "lost", "Partner moved provider")).ok && !M.deskExpiring(s).some((x) => x.kind === "ilh"));

  /* ---------- bulk, email, meetings ---------- */
  check("bulk won refused", !run(DA.bulk(["LD-0001", "LD-0002"], "move", { stage: "won" })).ok);
  check("bulk lost needs reason", !run(DA.bulk(["LD-0006", "LD-0007"], "move", { stage: "lost" })).ok);
  check("bulk lost", run(DA.bulk(["LD-0006", "LD-0007"], "move", { stage: "lost", reason: "No budget" })).ok && lead("LD-0006").stage === "lost" && lead("LD-0007").stage === "lost");
  check("bulk owner", run(DA.bulk(["LD-0002", "LD-0005"], "owner", { owner: "martina" })).ok && lead("LD-0005").ownerId === "martina");
  const n8 = lead("LD-0008").nextActionOn;
  check("bulk push a week", run(DA.bulk(["LD-0008"], "snooze", { days: 7 })).ok && lead("LD-0008").nextActionOn > n8);
  check("short email refused", !run(DA.sendEmail("LD-0011", "chase", "Hi", "short")).ok);
  const d0 = M.deskEmailDraft(s, lead("LD-0011"), "chase");
  check("agent email sent and on the timeline", run(DA.sendEmail("LD-0011", "chase", d0.subject, d0.body)).ok && M.deskTimeline(s, "LD-0011").some((x) => x.kind === "email" && x.body === d0.body));
  check("meeting in the past refused", !run(DA.bookMeeting("LD-0023", { kind: "meeting", date: "2026-10-01", start: "10:00", minutes: 60, contact: "Paul Clarke" })).ok);
  check("meeting booked into the calendar", run(DA.bookMeeting("LD-0023", { kind: "meeting", date: "2026-10-08", start: "11:00", minutes: 45, contact: "Paul Clarke" })).ok
    && s.scheduled.items.some((x) => x.leadId === "LD-0023" && x.date === "2026-10-08" && x.end === "11:45") && lead("LD-0023").nextActionOn === "2026-10-08");

  /* ---------- sequences ---------- */
  check("bad merge field refused", !run(DA.saveFollowTemplate([{ wait: 5, subject: "Hello {name}", body: "Hi {first}, just checking in on the proposal." }])).ok);
  check("template saved", run(DA.saveFollowTemplate([{ wait: 3, subject: "Quick check, {company}", body: "Hi {first}, just checking the proposal {proposal} arrived.\n\n{signature}" }, { wait: 10, subject: "Anything more I can do?", body: "Hi {first}, anything more I can do for {company}?\n\n{signature}" }])).ok);
  const qOcc = M.salesFollowSequence(s, "LD-0009");
  eq("sequence uses the template", [qOcc.steps.length, qOcc.steps[0].due, qOcc.steps[0].subject], [2, "2026-10-02", "Quick check, O'Callaghan Collection"]);
  check("reset", run(DA.resetFollowTemplate()).ok && M.salesFollowSequence(s, "LD-0009").steps.length === 4);
  check("rebook pause hides it from Today", (() => { const r = M.deskToday(s).find((x) => x.ref.kind === "recall"); return !r || (run(DA.rebookPause(r.ref.id, true)).ok && !M.deskToday(s).some((x) => x.key === r.key)); })());

  /* ---------- forecast ---------- */
  const fc = M.deskForecast(s);
  eq("nine months", fc.months.length, 9);
  check("current month won counts the October wins", fc.months.find((m) => m.current).won >= 10740);
  check("targets", fc.months.find((m) => m.key === "2026-10").target === 35000 && run(DA.setTarget("2026-11", 40000)).ok && M.deskForecast(s).months.find((m) => m.key === "2026-11").target === 40000);
  check("target out of range refused", !run(DA.setTarget("2026-11", 5)).ok);
  check("win rates in range", fc.byService.concat(fc.bySource).every((r) => r.pct === null || (r.pct >= 0 && r.pct <= 100)) && fc.winRate > 0 && fc.winRate < 100);
  check("league sorted", fc.league.length >= 3 && fc.league.every((r, i) => i === 0 || fc.league[i - 1].pct >= r.pct));
  check("quarter adds up", fc.quarter.won === fc.months.filter((m) => m.key >= "2026-10" && m.key <= "2026-12").reduce((n, m) => n + m.won, 0));

  /* ---------- rights ---------- */
  run(act.setPersona("neil"));
  check("neil cannot work the desk", !run(DA.today(M.deskToday(s)[1]?.key || "x", "snooze")).ok && !run(DA.setTarget("2026-12", 30000)).ok && !run(DA.expiry("con:CON-02", "renew")).ok);
  run(act.setPersona("stephen"));

  /* ---------- rail and tabs ---------- */
  const rail = M.railEntriesFor("stephen");
  eq("Agents directly under Home", rail.slice(0, 2).map((r) => r.page), ["Home", "Agents"]);
  const tabs = rail.filter((r) => r.tab).map((r) => r.tab);
  check("rail sales items are real tabs", tabs.length >= 12 && tabs.every((t) => M.PAGE_BY_ID.Sales.tabs.some((x) => x.id === t)), JSON.stringify(tabs));
  check("follow-ups and expiring in the rail", tabs.includes("follow-ups") && tabs.includes("expiring"));
  eq("sections", [...new Set(rail.filter((r) => r.section).map((r) => r.section))], ["Work", "Deals", "Clients", "Reference"]);
  eq("neil has no custom rail", M.railEntriesFor("neil"), null);
  eq("deep links", [M.parseHash("#/Sales/follow-ups?kind=sequence").tab, M.parseHash("#/Sales/expiring?days=30").params.days, M.parseHash("#/Sales/followups").tab], ["follow-ups", "30", "follow-ups"]);
  eq("Sales default tab for others", M.defaultTab("Sales"), "pipeline");
} catch (e) {
  failed++;
  console.log("FAIL exception", e && e.stack || e);
}
await server.close();
console.log(`verify-sales10x: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
