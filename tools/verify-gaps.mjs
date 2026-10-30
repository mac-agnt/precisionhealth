// Checks for the last gaps from Stephen's 2 Oct walkthrough: the Bookings Pending board (rows,
// status and column edits, staff email, day brief), the End of Day and Mileage form, subsistence
// and hotel requests with approval, tenders, Irish Life web-app intake, lead invoicing, lapsed
// clients, named reporters and the Flu contacts and notes boards. Usage: node tools/verify-gaps.mjs
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
  await server.ssrLoadModule("/src/ph/pages/Clinics/opsActions.ts");
  await server.ssrLoadModule("/src/ph/pages/Flu/boardsActions.ts");
  await server.ssrLoadModule("/src/ph/pages/Flu/actions.ts");
  await server.ssrLoadModule("/src/ph/pages/Sales/actions.ts");
  await server.ssrLoadModule("/src/ph/pages/Results/libraryActions.ts");
  const LM = await server.ssrLoadModule("/src/ph/pages/Results/libraryModel.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const as = (id) => run(act.setPersona(id));
  const t = M.today(s);

  /* ---------- seed ---------- */
  eq("gaps seed sizes", [s.gaps.expenses.length, s.gaps.fluContacts.length, s.gaps.fluNotes.length], [4, 4, 3]);
  const rows = M.boardRows(s, t);
  const sessionsWithLogistics = s.sessions.filter((x) => x.logistics && x.status !== "cancelled").length;
  eq("board rows are sessions plus board items", rows.length, sessionsWithLogistics + s.nurseOps.board.length);
  check("upcoming rows first", rows.findIndex((r) => !r.nextDate) === -1 || rows.slice(rows.findIndex((r) => !r.nextDate)).every((r) => !r.nextDate));
  const cairn = rows.find((r) => r.key === "board:BRD-0003");
  check("Cairn flags missing contact", cairn && cairn.flags.some((f) => f.key === "contact"), JSON.stringify(cairn?.flags));
  eq("staff email defaults to staff onsite", M.boardStaffEmails(s, ["liz", "neil"], s.nurseOps.board[3].logistics), ["demo.liz@precisionhealth.ie", "neil.reddy@precisionhealth.ie"]);
  const abp = rows.find((r) => r.key === "board:BRD-0004");
  const brief = M.boardBrief(s, abp, "2026-10-28", "liz");
  eq("brief lines", brief.lines.map((l) => l.label), ["Company", "Date", "Company contact", "Company contact phone", "Address", "Eircode", "Parking", "Room name", "Start time", "Attendance list", "Screen type", "Screening link", "Accommodation"]);
  check("brief arrive by 07:30", brief.arriveBy === "07:30" && brief.rules[0].includes("07:30"));
  check("brief accommodation", /Cahir/.test(brief.lines.find((l) => l.key === "accommodation").value));

  /* ---------- board actions ---------- */
  as("neil");
  check("Neil cannot change the board", !run({ type: "ops/setBoardStatus", kind: "board", id: "BRD-0003", status: "Ready to go" }).ok);
  as("stephen");
  check("status change", run({ type: "ops/setBoardStatus", kind: "board", id: "BRD-0003", status: "Ready to go" }).ok && s.nurseOps.board.find((b) => b.id === "BRD-0003").logistics.status === "Ready to go");
  check("same status is no change", !run({ type: "ops/setBoardStatus", kind: "board", id: "BRD-0003", status: "Ready to go" }).ok);
  check("bad Eircode refused", !run({ type: "ops/updateBoardRow", kind: "board", id: "BRD-0003", patch: { eircode: "12345" } }).ok);
  const up = run({ type: "ops/updateBoardRow", kind: "board", id: "BRD-0003", patch: { contactName: "Gearóid Lynch", contactPhone: "087 555 0199", eircode: "d18xh55", staffEmail: "agency.nurse@example.com" } });
  check("edit board row", up.ok, up.message);
  const b3 = s.nurseOps.board.find((b) => b.id === "BRD-0003");
  eq("edited values", [b3.logistics.contactName, b3.logistics.eircode, b3.logistics.staffEmail], ["Gearóid Lynch", "D18 XH55", "agency.nurse@example.com"]);
  eq("explicit staff email wins", M.boardStaffEmails(s, b3.staffIds, b3.logistics), ["agency.nurse@example.com"]);
  check("Cairn contact flag cleared", !M.boardRows(s, t).find((r) => r.key === "board:BRD-0003").flags.some((f) => f.key === "contact"));
  check("assign staff onsite to a board booking", run({ type: "ops/updateBoardRow", kind: "board", id: "BRD-0005", patch: { staffIds: ["aisling"] } }).ok && s.nurseOps.board.find((b) => b.id === "BRD-0005").staffIds.join() === "aisling");
  check("board staff must be clinical", !run({ type: "ops/updateBoardRow", kind: "board", id: "BRD-0005", patch: { staffIds: ["brenda"] } }).ok);
  check("no nurse flag cleared", !M.boardRows(s, t).find((r) => r.key === "board:BRD-0005").flags.some((f) => f.key === "nurse"));
  check("brief accommodation has no doubled note", !/Separate confirmation sent/.test(M.boardBrief(s, abp, "2026-10-28", "liz").lines.find((l) => l.key === "accommodation").value));
  check("session start time not changed from the board", !run({ type: "ops/updateBoardRow", kind: "session", id: "CLN-SISK-20261012", patch: { start: "08:00" } }).ok);
  check("session blood code edit", run({ type: "ops/updateBoardRow", kind: "session", id: "CLN-SISK-20261022", patch: { bloodCode: "PH-SISK26" } }).ok && s.sessions.find((x) => x.id === "CLN-SISK-20261022").logistics.bloodCode === "PH-SISK26");
  const nb = s.nurseOps.briefs.length;
  const br = run({ type: "ops/sendBrief", kind: "board", id: "BRD-0003", date: "2026-10-20", staffId: "fiona", subject: "x" });
  check("send brief", br.ok && s.nurseOps.briefs.length === nb + 1, br.message);
  check("brief not sent twice", !run({ type: "ops/sendBrief", kind: "board", id: "BRD-0003", date: "2026-10-20", staffId: "fiona", subject: "x" }).ok);
  check("brief for a past day refused", !run({ type: "ops/sendBrief", kind: "session", id: "CLN-SISK-20260914", date: "2026-09-14", staffId: "fiona", subject: "x" }).ok);
  check("brief for someone not onsite refused", !run({ type: "ops/sendBrief", kind: "board", id: "BRD-0003", date: "2026-10-21", staffId: "anita", subject: "x" }).ok);

  /* ---------- End of Day ---------- */
  const base = { staffId: "anita", date: "2026-10-01", clientLocation: "Sisk, Sisk Dublin Site B", programmeId: "PRG-SISK-26", sessionId: "CLN-SISK-20261001", boardItemId: null, jobType: "lab_screening", dayLength: "full",
    screensCompleted: 24, dnaCount: 1, vaccinesAdministered: null, preVaccineTempC: null, intermediateVaccineTempC: null, postVaccineTempC: null, vaccineBatch: null, issues: "None.", outsideDublin: false, mileageKm: null, psaCount: null, fitKitCount: null };
  as("fiona");
  check("a nurse cannot submit for another nurse", !run({ type: "ops/submitEod", input: base }).ok);
  as("anita");
  const neod = s.nurseOps.endOfDay.length;
  check("future date refused", !run({ type: "ops/submitEod", input: { ...base, date: "2026-12-01" } }).ok);
  check("mileage needs outside Dublin", !run({ type: "ops/submitEod", input: { ...base, mileageKm: 40 } }).ok);
  const e1 = run({ type: "ops/submitEod", input: { ...base, outsideDublin: true, mileageKm: 100 } });
  check("Anita submits her missing form", e1.ok && s.nurseOps.endOfDay.length === neod + 1, e1.message);
  const sub = s.nurseOps.endOfDay.find((e) => e.id === e1.id);
  eq("pay line with mileage", M.eodPayLine(sub), { day: 300, mileage: 43, total: 343, label: "Lab screening (bloods), full day €300.00 + 100 km at €0.43 = €43.00" });
  check("duplicate refused", !run({ type: "ops/submitEod", input: base }).ok);
  as("liz");
  const flu = run({ type: "ops/submitEod", input: { ...base, staffId: "fiona", sessionId: null, programmeId: null, date: "2026-10-03", clientLocation: "Irish Life Health flu clinic, Dublin 2", jobType: "flu_vaccination", screensCompleted: null, vaccinesAdministered: 60, preVaccineTempC: 4.1, intermediateVaccineTempC: 5, postVaccineTempC: 5.5, vaccineBatch: "TBC" } });
  check("nursing lead submits for a nurse", flu.ok && s.nurseOps.endOfDay.find((e) => e.id === flu.id).submittedBy === "liz", flu.message);
  check("flu needs temperatures", !run({ type: "ops/submitEod", input: { ...base, staffId: "fiona", sessionId: null, date: "2026-10-04", clientLocation: "Flu clinic", jobType: "flu_vaccination", screensCompleted: null, vaccinesAdministered: 30, vaccineBatch: "TBC" } }).ok);

  /* ---------- subsistence and hotel ---------- */
  as("anita");
  const sx = run({ type: "ops/requestExpense", input: { kind: "subsistence", staffId: "anita", date: "2026-10-01", clientLocation: "Sisk, Site B", target: null, meals: ["lunch", "dinner", "lunch"], nights: 0, area: "", note: "" } });
  check("subsistence claim", sx.ok, sx.message);
  eq("subsistence amount", s.gaps.expenses.find((e) => e.id === sx.id).amount, 48);
  check("one claim per day", !run({ type: "ops/requestExpense", input: { kind: "subsistence", staffId: "anita", date: "2026-10-01", clientLocation: "x", target: null, meals: ["lunch"], nights: 0, area: "", note: "" } }).ok);
  check("hotel in the past refused", !run({ type: "ops/requestExpense", input: { kind: "hotel", staffId: "anita", date: "2026-09-01", clientLocation: "x", target: null, meals: [], nights: 1, area: "Cork", note: "" } }).ok);
  const hx = run({ type: "ops/requestExpense", input: { kind: "hotel", staffId: "anita", date: "2026-11-11", clientLocation: "Dornan Group, Limerick", target: { kind: "board", id: "BRD-0006" }, meals: [], nights: 1, area: "Limerick city", note: "" } });
  check("hotel request", hx.ok, hx.message);
  check("nurse cannot approve", !run({ type: "ops/decideExpense", id: hx.id, approve: true }).ok);
  as("stephen");
  check("book before approval refused", !run({ type: "ops/bookHotel", id: hx.id, hotel: "Riverside Hotel (fictional)" }).ok);
  check("decline needs a reason", !run({ type: "ops/decideExpense", id: sx.id, approve: false, note: "" }).ok);
  check("approve claim", run({ type: "ops/decideExpense", id: sx.id, approve: true }).ok && s.gaps.expenses.find((e) => e.id === sx.id).status === "approved");
  check("approve hotel", run({ type: "ops/decideExpense", id: hx.id, approve: true }).ok);
  check("book hotel", run({ type: "ops/bookHotel", id: hx.id, hotel: "Riverside Hotel Limerick (fictional)" }).ok && s.gaps.expenses.find((e) => e.id === hx.id).status === "booked");
  check("booked hotel reaches the board and the brief", /Riverside Hotel Limerick/.test(s.nurseOps.board.find((b) => b.id === "BRD-0006").logistics.accommodation || ""));
  as("liz");
  const lx = run({ type: "ops/requestExpense", input: { kind: "subsistence", staffId: "liz", date: "2026-10-02", clientLocation: "IBM", target: null, meals: ["lunch"], nights: 0, area: "", note: "" } });
  check("approver cannot approve their own", lx.ok && !run({ type: "ops/decideExpense", id: lx.id, approve: true }).ok);

  /* ---------- tenders ---------- */
  as("neil");
  check("Neil cannot pass on a tender", !run({ type: "sales/setTenderStatus", tenderId: "TW-02", status: "not_bidding" }).ok);
  as("stephen");
  check("Not for us", run({ type: "sales/setTenderStatus", tenderId: "TW-02", status: "not_bidding" }).ok && s.sales.tenders.find((x) => x.id === "TW-02").status === "not_bidding");
  const tl = run({ type: "sales/createLead", company: "A regional council (fictional)", fictionalCompany: true, services: ["health_screening"], contactName: "", contactEmail: "", source: "tender", enquiry: "Tender", origin: { kind: "tender", id: "TW-01" } });
  check("Make it a lead", tl.ok && s.sales.tenders.find((x) => x.id === "TW-01").leadId === tl.id && s.sales.tenders.find((x) => x.id === "TW-01").status === "preparing", tl.message);

  /* ---------- invoicing on a lead ---------- */
  const lead = s.sales.leads[0].id;
  check("bad invoice email refused", !run({ type: "sales/updateLead", leadId: lead, patch: { invoiceEmail: "not an email" } }).ok);
  check("invoice details saved", run({ type: "sales/updateLead", leadId: lead, patch: { invoiceName: "Example Ltd", invoiceEmail: "ap@example.com", companyDetails: "Reg 123456" } }).ok
    && s.sales.leads[0].invoiceName === "Example Ltd" && s.sales.leads[0].invoiceEmail === "ap@example.com");

  /* ---------- Irish Life web-app intake ---------- */
  const nIlh = s.sales.ilh.length;
  check("accept ILH booking form submission", run({ type: "sales/ilhAddFromIntake", ref: "ILH-WEB-2291" }).ok && s.sales.ilh.length === nIlh + 1);
  check("not accepted twice", !run({ type: "sales/ilhAddFromIntake", ref: "ILH-WEB-2291" }).ok);
  const nFlu = s.flu.clinics.length;
  const fl = run({ type: "flu/intakeIlh" });
  check("accept ILH Flu booking form submission", fl.ok && s.flu.clinics.length === nFlu + 1, fl.message);
  check("lifestyle checkpoint weekly group", s.sales.ilh.filter((b) => b.group === "lifestyle" && !b.archived).length >= 7);

  /* ---------- lapsed clients ---------- */
  const lapsed = M.salesRecalls(s).filter((r) => r.lapsed);
  check("lapsed clients listed", lapsed.length > 0);
  const out = run({ type: "sales/draftOutreach", recallId: lapsed[0].id, kind: "lapsed" });
  check("Reach out drafts a win-back email", out.ok && M.salesRecalls(s).find((r) => r.id === lapsed[0].id).outreachId === out.id);

  /* ---------- named reporters ---------- */
  as("neil");
  const ready = M.reviewQueueAll(s);
  const before = LM.reporterWorkload(s);
  eq("reporter counts add up", before.reduce((n, r) => n + r.ready, 0), ready.length);
  const ep = ready.find((i) => LM.reporterOf(s, i.episode) === "neil").episode.id;
  check("Assign to Liz", run({ type: "advicelib/assignReporter", episodeId: ep, reporter: "liz" }).ok && LM.reporterOf(s, s.episodes.find((e) => e.id === ep)) === "liz");
  eq("Liz view grows by one", LM.reporterWorkload(s).find((r) => r.id === "liz").ready, before.find((r) => r.id === "liz").ready + 1);
  as("stephen");
  check("only clinical review assigns", !run({ type: "advicelib/assignReporter", episodeId: ep, reporter: "neil" }).ok);

  /* ---------- flu contacts and notes ---------- */
  as("brenda");
  check("contact needs email or phone", !run({ type: "flu2/saveContact", id: null, contact: { company: "X", name: "Y", role: "", email: "", phone: "", note: "" } }).ok);
  const fc = run({ type: "flu2/saveContact", id: null, contact: { company: "Navan Print Works", name: "Yvonne Clinton", role: "HR", email: "yvonne.clinton@example.com", phone: "", note: "" } });
  check("add contact", fc.ok && s.gaps.fluContacts.length === 5);
  check("edit contact", run({ type: "flu2/saveContact", id: fc.id, contact: { company: "Navan Print Works", name: "Yvonne Clinton", role: "HR manager", email: "yvonne.clinton@example.com", phone: "046 555 0100", note: "" } }).ok && s.gaps.fluContacts.find((c) => c.id === fc.id).phone === "046 555 0100");
  const fn = run({ type: "flu2/saveNote", id: null, title: "Training", body: "Anaphylaxis refresher for all vaccinators.", pinned: false });
  check("add note", fn.ok && s.gaps.fluNotes.length === 4);
  check("pin note", run({ type: "flu2/saveNote", id: fn.id, title: "Training", body: "Anaphylaxis refresher for all vaccinators.", pinned: true }).ok && s.gaps.fluNotes.find((n) => n.id === fn.id).pinned);
  as("liz");
  check("Liz may add notes", run({ type: "flu2/saveNote", id: null, title: "Liz", body: "Cold chain check done." }).ok);
  check("Liz may not edit contacts", !run({ type: "flu2/saveContact", id: fc.id, contact: { company: "A", name: "B", role: "", email: "a@b.ie", phone: "", note: "" } }).ok);
  as("fiona");
  check("a nurse cannot edit flu boards", !run({ type: "flu2/saveNote", id: null, title: "x", body: "yyy" }).ok);

  /* ---------- baseline untouched ---------- */
  const fresh = createInitialState();
  const T = M.totalCounts(fresh);
  eq("baseline counts unchanged", [T.invited, T.booked, T.released, T.ready], [850, 365, 185, 20]);
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
