// Checks for the app shell slice: the sales Home for Stephen, sentence-case agent previews,
// the persona switch toast, at most two toasts and theme-token band colours.
// Usage: node tools/verify-shell.mjs
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0, passed = 0;
const check = (name, cond, extra = "") => {
  if (cond) passed++;
  else { failed++; console.log("FAIL", name, extra); }
};

try {
  const M = await server.ssrLoadModule("/src/ph/model/index.ts");
  const B = await server.ssrLoadModule("/src/ph/report/bands.ts");
  const { createInitialState, reduce, act } = M;
  let s = createInitialState();
  const run = (a) => { const r = reduce(s, a); s = r.state; return r.result; };

  /* ---------- Neil keeps the clinical Home ---------- */
  const neil = M.suggestedPrompts(s);
  check("neil first prompt is the clinics briefing", neil[0] === "What needs my attention before today's clinics?", neil[0]);
  check("neil has no sales prompts", !neil.some((q) => /lead|proposal|onboard|rebook/i.test(q)));
  check("neil is not a sales Home", !M.salesHomeFor(s));

  /* ---------- Stephen gets a sales Home ---------- */
  const r = run(act.setPersona("stephen"));
  check("persona toast is short", r.message === "Now viewing as Stephen Kelly", r.message);
  check("stephen is a sales Home", M.salesHomeFor(s));
  const prompts = M.suggestedPrompts(s);
  check("stephen prompts are about sales", prompts.length === 5 && prompts.slice(1).every((q) => /lead|proposal|onboard|rebook/i.test(q)), JSON.stringify(prompts));
  const want = { "Which leads need a reply today?": "sales_leads", "Which proposals are waiting on the client?": "sales_proposals", "How are the client onboardings going?": "sales_onboarding", "Which clients are due to rebook?": "sales_rebooking" };
  for (const [q, sc] of Object.entries(want)) {
    const a = M.answerQuery(s, q);
    check(`answer ${sc}`, a.supported && a.scenario === sc, a.scenario);
    check(`answer ${sc} has a primary link to Sales`, a.actions.some((x) => x.primary && x.target && x.target.page === "Sales"));
    check(`answer ${sc} has rows`, (a.rows || []).length > 0);
    check(`answer ${sc} has no dashes`, !/[–—]/.test(a.text));
  }
  const lead = M.answerQuery(s, "Which leads need a reply today?");
  check("leads answer starts with the inbound lead", /Brennan Build Group/.test(lead.text), lead.text);
  const brief = M.answerQuery(s, "What needs my attention this morning?");
  check("stephen briefing leads with sales", brief.scenario === "briefing" && /inbound lead/.test(brief.text), brief.text);
  const open = M.salesOpenLeads(s);
  check("open leads sorted overdue first", open.length > 0 && open[0].overdue);
  check("open leads exclude won and lost", open.every((v) => v.lead.stage === "new" || v.lead.stage === "proposal_sent"));
  run(act.setPersona("brenda"));
  check("brenda sees no sales prompts", !M.suggestedPrompts(s).some((q) => /proposal|onboard|rebook/i.test(q)));
  check("brenda asking about leads is scoped", M.answerQuery(s, "Which leads need a reply today?").scenario === "restricted");

  /* ---------- agent previews in sentence case ---------- */
  s = createInitialState();
  for (const a of M.AGENT_DEFS) {
    const p = M.agentPreview(s, a.id);
    check(`agent preview sentence case: ${a.id}`, /^[A-Z0-9]/.test(p) && !/[.!?]\s+[a-z]/.test(p), p);
  }

  /* ---------- toasts ---------- */
  for (let i = 0; i < 5; i++) run(act.toast("ok", "Toast " + i));
  check("at most two toasts", s.toasts.length === 2, String(s.toasts.length));
  check("newest replaces oldest", s.toasts.map((t) => t.text).join("|") === "Toast 3|Toast 4");

  /* ---------- band colours come from theme tokens ---------- */
  const looks = Object.values(B.BAND_LOOK);
  check("band fills are theme tokens", looks.every((l) => /^var\(--band-/.test(l.fill) && /^var\(--band-/.test(l.ink)));
  const css = readFileSync(new URL("../src/styles/pulse.css", import.meta.url), "utf8");
  for (const k of ["normal", "borderline", "abnormal", "critical", "none"]) check(`pulse.css defines --band-${k}`, (css.match(new RegExp(`--band-${k}:`, "g")) || []).length >= 2);
  check("no bright yellow band left", !/#FFF200|#E9C500|#92D050/i.test(readFileSync(new URL("../src/ph/report/bands.ts", import.meta.url), "utf8") + readFileSync(new URL("../src/ph/pages/Results/results.css", import.meta.url), "utf8")));
} catch (e) {
  failed++;
  console.log("ERROR", e && e.stack ? e.stack : e);
} finally {
  await server.close();
}
console.log(`verify-shell: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
