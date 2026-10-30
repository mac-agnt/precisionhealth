// Checks for the business calendar (Calendar page and Clinics, Schedule): the aggregator gathers
// every main kind, every event links to a real page, filters and ranges behave, and the IBM
// 6 November screening day is on 2026-11-06. Usage: node tools/verify-calendar.mjs
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
  const D = await server.ssrLoadModule("/src/ph/pages/Clinics/daysActions.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const evs = () => M.calendarEvents(s);
  const all = evs();
  const byKind = (k) => all.filter((e) => e.kind === k);

  /* ---------- registry ---------- */
  check("every kind has a known group", M.CAL_KINDS.every((k) => M.CAL_GROUP_BY_ID[k.group]), JSON.stringify(M.CAL_KINDS.filter((k) => !M.CAL_GROUP_BY_ID[k.group])));
  check("kind ids are unique", new Set(M.CAL_KINDS.map((k) => k.id)).size === M.CAL_KINDS.length);
  check("every kind has a colour and a label", M.CAL_KINDS.every((k) => /^#[0-9a-f]{6}$/i.test(k.color) && k.label));
  check("every group has at least one kind", M.CAL_GROUPS.every((g) => M.CAL_KINDS.some((k) => k.group === g.id)));

  /* ---------- counts per main kind ---------- */
  for (const k of ["screening_day", "clinic_session", "client_booking", "flu_clinic", "flu_delivery", "oh_session", "ilh_screening", "sales_action", "sales_meeting", "sales_followup", "sales_tender", "recall", "task", "report_deadline", "automation"]) {
    check(`has ${k} events`, byKind(k).length > 0, `${byKind(k).length}`);
  }

  /* ---------- shape and links ---------- */
  check("event ids are unique", new Set(all.map((e) => e.id)).size === all.length);
  const pageIds = new Set(M.PAGES.map((p) => p.id));
  const badLink = all.filter((e) => !pageIds.has(e.link.page) || (e.link.tab && !M.PAGE_BY_ID[e.link.page].tabs.some((t) => t.id === e.link.tab)));
  check("every event links to a page and tab that exist", badLink.length === 0, JSON.stringify(badLink.slice(0, 3).map((e) => [e.id, e.link])));
  const badSecondary = all.filter((e) => e.secondary && !pageIds.has(e.secondary.link.page));
  check("every secondary link is a page that exists", badSecondary.length === 0);
  check("every link survives a hash round trip", all.every((e) => { const back = M.parseHash(M.hashFor(e.link)); return back && back.page === e.link.page && Object.entries(e.link.params || {}).every(([k, v]) => back.params[k] === v); }));
  check("every event has a valid date and start", all.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.start.startsWith(e.date)));
  check("timed events have HH:MM times", all.filter((e) => !e.allDay).every((e) => /^\d{2}:\d{2}$/.test(e.time.start) && (!e.time.end || (/^\d{2}:\d{2}$/.test(e.time.end) && e.time.end >= e.time.start))));
  check("every event has an open label and a title", all.every((e) => e.title && e.openLabel));
  check("staff ids are real staff", all.every((e) => e.staffIds.every((id) => s.staff.some((x) => x.id === id))));
  check("sorted by date", all.every((e, i) => i === 0 || all[i - 1].date <= e.date));
  check("no dashes used as punctuation in titles", all.every((e) => !/[\u2013\u2014]/.test(e.title + (e.detail || ""))));

  /* ---------- one event per session, never per booking ---------- */
  const activeSessions = s.sessions.filter((x) => x.status !== "cancelled");
  eq("one clinic event per session", byKind("clinic_session").length + byKind("screening_day").length, activeSessions.length);
  check("sessions carry booked of capacity", byKind("clinic_session").every((e) => /^\d+ of \d+ booked$/.test(e.detail)));
  check("session links open the Schedule session", byKind("clinic_session").every((e) => e.link.page === "Clinics" && e.link.tab === "schedule" && e.link.params.session === e.sessionId));

  /* ---------- screening days ---------- */
  const ibm = all.find((e) => e.id === "day:SD-0001");
  check("IBM 6 Nov screening day present", !!ibm);
  eq("IBM 6 Nov screening day on 2026-11-06", [ibm?.date, ibm?.time?.start, ibm?.client, ibm?.kind, ibm?.status], ["2026-11-06", "09:00", "IBM", "screening_day", "Published"]);
  eq("IBM day opens Screening days", ibm?.link, { page: "Clinics", tab: "days", params: { day: "SD-0001" } });
  eq("IBM day secondary opens the session", ibm?.secondary?.link.params.session, "CLN-IBM-20261106");
  const draft = all.find((e) => e.id === "day:SD-0003");
  eq("draft day shows as draft and tentative", [draft?.status, draft?.tentative], ["Draft", true]);
  check("on 6 Nov the calendar has the IBM day", all.filter((e) => e.date === "2026-11-06").some((e) => e.kind === "screening_day" && e.client === "IBM"));

  /* ---------- a new day appears live ---------- */
  const before = evs().filter((e) => e.kind === "screening_day").length;
  const form = M.draftFromRequest("Salesforce point of care day on 25 November with Ciara, 9 to 1, 12 appointments", { today: M.today(s), staff: s.staff, sessions: s.sessions, days: s.screeningDays.days }).form;
  const saved = run(D.daysAct.save(form, "agent"));
  check("saving a screening day works", saved.ok, saved.message);
  const after = evs().filter((e) => e.kind === "screening_day");
  eq("new screening day appears in the calendar", after.length, before + 1);
  check("new day is a draft on its date", after.some((e) => e.date === form.date && e.status === "Draft"), JSON.stringify(after.map((e) => [e.date, e.status])));

  /* ---------- sales ---------- */
  check("lead events open the pipeline lead", byKind("sales_action").concat(byKind("sales_meeting")).every((e) => e.link.page === "Sales" && e.link.tab === "pipeline" && /^LD-\d+$/.test(e.link.params.lead)));
  check("inbound lead LD-0020 is on today", all.some((e) => e.id === "lead:LD-0020" && e.date === M.today(s)));
  check("follow up steps for sent proposals", byKind("sales_followup").length >= 4);
  check("recall dates present for retention", byKind("recall").some((e) => e.client === "Cairn Homes"));

  /* ---------- filters ---------- */
  const base = { groups: M.CAL_GROUPS.map((g) => g.id), clients: [], people: [], q: "", mine: null };
  eq("no filter keeps everything", all.filter((e) => M.calMatches(e, base)).length, all.length);
  const onlyFlu = all.filter((e) => M.calMatches(e, { ...base, groups: ["flu"] }));
  check("type filter keeps one group", onlyFlu.length > 0 && onlyFlu.every((e) => M.calGroupOf(e.kind) === "flu"));
  const ibmOnly = all.filter((e) => M.calMatches(e, { ...base, clients: ["IBM"] }));
  check("client filter", ibmOnly.length > 0 && ibmOnly.every((e) => e.client === "IBM"));
  const fiona = all.filter((e) => M.calMatches(e, { ...base, people: ["fiona"] }));
  check("person filter", fiona.length > 0 && fiona.every((e) => e.staffIds.includes("fiona")));
  const stephen = all.filter((e) => M.calMatches(e, { ...base, mine: "stephen" }));
  check("only mine", stephen.length > 0 && stephen.every((e) => e.staffIds.includes("stephen")));
  const search = all.filter((e) => M.calMatches(e, { ...base, q: "cairn" }));
  check("search", search.length > 0 && search.every((e) => JSON.stringify(e).toLowerCase().includes("cairn")));
  check("count except a dimension ignores that dimension", all.filter((e) => M.calMatches(e, { ...base, groups: [] }, "groups")).length === all.length);

  /* ---------- ranges ---------- */
  eq("month range covers whole weeks", M.calRange("month", "2026-11-06"), { from: "2026-10-26", to: "2026-12-06" });
  eq("week range", M.calRange("week", "2026-11-06"), { from: "2026-11-02", to: "2026-11-08" });
  eq("agenda range is the month", M.calRange("agenda", "2026-11-06"), { from: "2026-11-01", to: "2026-11-30" });
  eq("step month from 31 Jan", M.calStep("month", "2027-01-31", 1), "2027-02-28");
  eq("step week", M.calStep("week", "2026-11-06", -1), "2026-10-30");

  /* ---------- layout ---------- */
  const lay = M.calLayoutDay([
    { id: "a", allDay: false, time: { start: "09:00", end: "10:00" } },
    { id: "b", allDay: false, time: { start: "09:30", end: "10:30" } },
    { id: "c", allDay: false, time: { start: "11:00", end: "12:00" } },
  ]);
  eq("overlapping events share columns", [lay.get("a"), lay.get("b"), lay.get("c")], [{ col: 0, cols: 2 }, { col: 1, cols: 2 }, { col: 0, cols: 1 }]);

  /* ---------- nav ---------- */
  const idx = M.PAGES.findIndex((p) => p.id === "Calendar");
  eq("Agents directly under Home", [M.PAGES[0].id, M.PAGES[1].id], ["Home", "Agents"]);
  eq("Calendar sits directly after Dashboard", M.PAGES[idx - 1].id, "Dashboard");
  check("Calendar is a PH screen", M.isPhScreen("Calendar", "all"));
  eq("type words in links resolve to groups", ["clinic", "flu", "task", "flu_clinic", "recall", "nonsense"].map(M.calGroupFromParam), ["clinics", "flu", "tasks", "flu", "retention", null]);
  eq("calendar hash parses", M.parseHash("#/Calendar/all?view=week&date=2026-11-06&types=clinic,flu"), { page: "Calendar", tab: "all", params: { view: "week", date: "2026-11-06", types: "clinic,flu" } });

  /* ---------- participant sees no clinical tasks ---------- */
  run(act.setPersona("fiona"));
  const fionaTasks = M.calendarEvents(s).filter((e) => e.kind === "task");
  check("clinical tasks follow the task list rule", fionaTasks.every((e) => { const t = s.tasks.find((x) => "task:" + x.id === e.id); return t && M.visibleTasks(s).some((v) => v.task.id === t.id); }));
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`verify-calendar: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
