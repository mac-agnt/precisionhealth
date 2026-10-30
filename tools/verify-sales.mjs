// Checks for Stephen's sales workflow (src/ph/model/salesFlow.ts, src/ph/pages/Sales/flowActions.ts):
// first-touch clock, first reply, meeting notes parser, proposal builder pricing, deal discount,
// weekly follow ups and Mark as won. Usage: node tools/verify-sales.mjs
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
  const SA = (await server.ssrLoadModule("/src/ph/pages/Sales/actions.ts")).salesAct;
  const FA = (await server.ssrLoadModule("/src/ph/pages/Sales/flowActions.ts")).flowAct;
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };
  const LID = M.SALES_INBOUND_LEAD_ID;
  const lead = () => s.sales.leads.find((l) => l.id === LID);

  /* ---------- seed ---------- */
  check("inbound lead seeded", !!lead() && lead().stage === "new" && /@example\.com$/.test(lead().contact.email));
  const inb = M.salesInboundFor(s, LID);
  eq("inbound arrived 3 minutes before the clock", (Date.parse(s.clock.nowUtc) - Date.parse(inb.arrivedAt)) / 60000, 3);
  const c0 = M.salesTouchClock(inb, Date.parse(s.clock.nowUtc));
  eq("clock at demo time", [c0.label, c0.tone], ["07:00 left", "ok"]);
  eq("clock amber under 3 minutes", M.salesTouchClock(inb, Date.parse(inb.arrivedAt) + 8 * 60000).tone, "warn");
  const late = M.salesTouchClock(inb, Date.parse(inb.arrivedAt) + 11 * 60000 + 5000);
  eq("clock red and overdue", [late.tone, late.overdue, late.label], ["bad", true, "Overdue 01:05"]);
  eq("pending inbound", M.salesPendingInbound(s).map((x) => x.leadId), [LID]);
  check("sales slice still small", M.salesRecordCount(s.sales) < 300 && M.salesFlowRecordCount(s.salesFlow) < 100);
  check("no exclamation marks or dashes in flow copy", !/[!—–]/.test(JSON.stringify(s.salesFlow) + JSON.stringify(lead()) + M.SALES_SAMPLE_NOTES));
  check("deterministic", JSON.stringify(createInitialState().salesFlow) === JSON.stringify(createInitialState().salesFlow));
  /* seeded sent proposals: follow ups before the demo clock are marked sent */
  const occ = M.salesFollowSequence(s, "LD-0009");
  check("O'Callaghan sequence from v2 sent 29 Sep", occ && occ.proposalId === "PRP-0001" && occ.version === 2 && occ.steps[0].due === "2026-10-06" && occ.next.n === 1);
  const pj = M.salesFollowSequence(s, "LD-0012");
  check("PJ Edwards week 1 already sent", pj.steps[0].status === "sent" && pj.next.n === 2);
  eq("board label", M.salesNextFollowLabel(s, "LD-0012").text, "Next follow up: Fri 9 Oct");
  check("won lead has no follow ups", M.salesNextFollowLabel(s, "LD-0013") === null);

  /* ---------- sectors and the first reply ---------- */
  eq("sector of inbound", M.salesSectorOf(lead()), "construction");
  const refs = M.salesSectorReferences(s, lead());
  check("two construction references from existing clients", refs.length === 2 && refs.every((r) => ["Sisk", "Cairn Homes", "Dornan Group"].includes(r)), JSON.stringify(refs));
  eq("references deterministic", M.salesSectorReferences(createInitialState(), lead()), refs);
  eq("hotel references", M.salesSectorReferences(s, s.sales.leads.find((l) => l.id === "LD-0009")), ["Kerry Coast Hotels"]);
  const dr = M.salesFirstReplyDraft(s, lead());
  check("draft has brochure, booking link and references", dr.attachments[0].endsWith(".pdf") && dr.body.includes(M.SALES_BOOKING_LINK) && refs.every((r) => dr.body.includes(r)) && dr.body.startsWith("Hi Aoife"));

  run(act.setPersona("neil"));
  check("neil cannot send the first reply", !run(FA.sendFirstEmail(LID, dr.subject, dr.body, dr.attachments)).ok);
  run(act.setPersona("stephen"));
  check("short email refused", !run(FA.sendFirstEmail(LID, "Hi", "Too short", [])).ok);
  const liveAt = new Date(Date.parse(inb.arrivedAt) + 312000).toISOString();
  const r1 = run(FA.sendFirstEmail(LID, dr.subject, dr.body + "\n\nPS edited", dr.attachments, liveAt));
  check("first reply sent", r1.ok, r1.message);
  const inb2 = M.salesInboundFor(s, LID);
  eq("response time recorded", [inb2.responseSeconds, inb2.firstTouchVia], [312, "email"]);
  check("timer stops", M.salesPendingInbound(s).length === 0);
  check("first reply on the timeline and files", lead().history.some((h) => h.text.startsWith("Email: first reply sent")) && lead().files.some((f) => f.kind === "brochure") && s.salesFlow.emails[0].body.includes("PS edited"));
  check("first reply event simulated", s.activity.at(-1).verb === "sales.first_reply" && s.activity.at(-1).simulated);
  check("second first touch refused", !run(FA.logFirstTouch(LID, "call")).ok);
  eq("journey after reply", M.salesJourney(s, LID).current, "meeting");

  /* ---------- meeting notes parser ---------- */
  const f = M.salesParseNotes(M.SALES_SAMPLE_NOTES, s.sales.priceItems);
  eq("sample notes facts", [f.headcount, f.sites, f.packageId, f.alsoAsked, f.flu, f.fluCount, f.dates], [45, 2, "poc3", ["gold1"], true, 45, "The week of 16 November, or before Christmas"]);
  check("sample notes deal line", f.deal.length === 1 && /invoice per site/.test(f.deal[0]));
  const v1 = M.salesParseNotes("Spoke to Mary. Roughly forty-five people across three locations. They want Silver 2. No flu this year, done elsewhere. Early December.");
  eq("variation: words", [v1.headcount, v1.sites, v1.packageId, v1.flu, v1.dates], [45, 3, "silver2", false, "Early December"]);
  const v2 = M.salesParseNotes("Headcount: 120. Single site. Asked about bloods. Flu for about 100. w/c 9 Nov");
  eq("variation: headcount label", [v2.headcount, v2.sites, v2.packageId, v2.flu, v2.fluCount, v2.dates], [120, 1, "gold1", true, 100, "W/c 9 Nov"]);
  const v3 = M.salesParseNotes("40 to 50 staff, Gold 3 with ECG, plus 6 executive medicals for the directors. Flu not needed.");
  eq("variation: range and exec", [v3.headcount, v3.headcountHigh, v3.packageId, v3.exec, v3.flu], [40, 50, "gold3", 6, false]);
  eq("empty notes", M.salesParseNotes("").facts.length, 0);
  check("notes saved", run(FA.saveNotes(LID, M.SALES_SAMPLE_NOTES)).ok && s.salesFlow.notes[LID].text === M.SALES_SAMPLE_NOTES);
  check("same notes is nothing changed", !run(FA.saveNotes(LID, M.SALES_SAMPLE_NOTES)).ok);
  eq("journey after notes", M.salesJourney(s, LID).current, "proposal");

  /* ---------- proposal builder ---------- */
  const input = { packageId: "poc3", headcount: 45, flu: true, fluCount: 45, execCount: 0, locations: "Two sites: Naas office and Kildare site", dates: "Week of 16 November" };
  const cfg = M.salesBuilderConfig(input, s.sales.priceItems);
  const t = M.salesProposalTotals(cfg, s.sales.priceItems);
  eq("45 on POC3 with flu", [cfg.lines[0].days, t.programme, t.flu.high, t.totalHigh], [2, 3820, 675, 4495]);
  const ups = M.salesUpsells({ ...input, flu: false }, s.sales.priceItems);
  check("upsells offered", ups.some((u) => u.id === "flu" && u.delta === 675) && ups.some((u) => u.id === "upgrade-gold1" && u.delta === 2 * 3585 - 3820) && ups.some((u) => u.id === "exec"));
  check("silver to gold upsell", M.salesUpsells({ ...input, packageId: "silver2" }, s.sales.priceItems).some((u) => /Silver to Gold/.test(u.title)));
  const rb = run(FA.buildProposal(LID, input, "They want two sites, 10% multi-year discount, invoice per site."));
  check("proposal created", rb.ok && rb.id, rb.message);
  const P = () => s.sales.proposals.find((p) => p.id === rb.id);
  eq("proposal draft priced", M.salesNetTotals(s, P()).totals.totalHigh, 4495);
  eq("discount parsed", M.salesParseDiscount("They want two sites, 10% multi-year discount, invoice per site."), 10);
  eq("discount words", M.salesParseDiscount("ten per cent off for a three year deal"), 10);
  eq("no discount", M.salesParseDiscount("invoice per site, 2 sites"), null);
  const net = M.salesNetTotals(s, P());
  eq("net after 10%", [net.discountHigh, net.netHigh], [449.5, 4045.5]);
  const rb2 = run(FA.buildProposal(LID, { ...input, headcount: 50 }, ""));
  check("rebuild updates the same draft", rb2.ok && rb2.id === rb.id && P().versions.length === 1 && P().versions[0].config.participantsHigh === 50 && !s.salesFlow.instructions[rb.id]);
  run(FA.buildProposal(LID, input, "They want two sites, 10% multi-year discount, invoice per site."));
  check("refuses nonsense", !run(FA.buildProposal(LID, { ...input, headcount: 0 })).ok && !run(FA.buildProposal(LID, { ...input, packageId: "flu" })).ok);

  /* ---------- follow ups ---------- */
  check("no sequence before sending", M.salesFollowSequence(s, LID) === null);
  check("send proposal", run(SA.sendProposal(rb.id)).ok && lead().stage === "proposal_sent");
  const q = M.salesFollowSequence(s, LID);
  eq("four weekly steps", q.steps.map((x) => x.due), ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  eq("board label after send", M.salesNextFollowLabel(s, LID).text, "Next follow up: Mon 12 Oct");
  check("send week 1", run(FA.followUp(LID, 1, "send")).ok && M.salesFollowSequence(s, LID).steps[0].status === "sent");
  check("skip week 2", run(FA.followUp(LID, 2, "skip")).ok && M.salesFollowSequence(s, LID).next.n === 3);
  check("week 1 twice refused", !run(FA.followUp(LID, 1, "send")).ok);
  check("pause", run(FA.pauseFollowUps(LID, true)).ok && M.salesNextFollowLabel(s, LID).text === "Follow ups paused" && !run(FA.followUp(LID, 3, "send")).ok);
  check("resume", run(FA.pauseFollowUps(LID, false)).ok && M.salesNextFollowLabel(s, LID).text === "Next follow up: Mon 26 Oct");
  eq("journey while following up", M.salesJourney(s, LID).current, "follow");

  /* ---------- mark as won ---------- */
  run(act.setPersona("brenda"));
  check("brenda cannot mark won", !run(FA.markWon(LID)).ok);
  run(act.setPersona("stephen"));
  const w = run(FA.markWon(LID));
  check("mark as won", w.ok && w.message === "Onboarding started for Brennan Build Group." && lead().stage === "won" && w.id === LID, w.message);
  check("proposal accepted on win", M.salesLatestVersion(P()).status === "accepted");
  const qw = M.salesFollowSequence(s, LID);
  check("sequence stops when won", qw.stopped === "won" && qw.next === null && qw.steps[3].status === "stopped" && M.salesNextFollowLabel(s, LID) === null);
  check("won twice refused", !run(FA.markWon(LID)).ok);
  eq("journey won", M.salesJourney(s, LID).current, "won");
  /* lost stops too */
  s = createInitialState();
  run(act.setPersona("stephen"));
  run(SA.moveLead("LD-0012", "lost", "Went with another provider"));
  check("sequence stops when lost", M.salesFollowSequence(s, "LD-0012").stopped === "lost" && !run(FA.followUp("LD-0012", 2, "send")).ok);
  check("sales copy still clean after the flow", !/[—–]/.test(JSON.stringify(s.sales)));
} finally {
  await server.close();
}
console.log(`\n${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
