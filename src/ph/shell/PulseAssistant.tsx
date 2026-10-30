/* The Pulse button: a floating pulse icon on every screen. Type what you want to do in plain
   English ("set up IBM on 6 November", "import the lab file", "find Ronan") and Pulse either starts
   it or takes you straight to the right place. Deterministic intent matching, no live model:
   anything it does not recognise falls back to the Home answer engine (answerQuery). Ctrl or Cmd + J
   opens it from anywhere. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { answerQuery } from "../model";
import type { NavTarget, PhState } from "../model";
import { useNav } from "../nav-context";
import type { PhNav } from "../nav-context";
import { usePhState } from "../store";
import { Icon } from "../ui";
import type { GlyphName } from "../ui";
import { journeyClients, resolveClientKey } from "../pages/Journey/model";

interface Hit { id: string; icon: GlyphName; title: string; sub: string; run: () => void }

const SUGGESTIONS = [
  "Where is IBM, start to finish?",
  "Set up IBM, 6 November, lab bloods",
  "Import the lab file",
  "Show lab rows that need matching",
  "Find Ronan Walsh",
  "What's on this week?",
  "Open the nurse portal",
  "Start onboarding for a new client",
  "New inbound lead",
];

const has = (q: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, "i").test(q));
const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

function calendarTarget(): NavTarget {
  return { page: "Calendar", tab: "all" };
}

export function pulseHits(state: PhState, nav: PhNav, raw: string, close: () => void): Hit[] {
  const q = raw.trim();
  const go = (t: NavTarget) => () => { nav.go(t); close(); };
  const out: Hit[] = [];
  if (!q) return out;
  const companies = state.companies.filter((c) => c.name.length > 2 && new RegExp(`\\b${c.name.split(/[\s(]/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q));

  /* Doing things */
  if ((has(q, "set up", "setup", "book", "create", "new", "plan", "schedule") && has(q, "day", "screening", "clinic")) || (MONTHS.test(q) && companies.length && !has(q, "calendar", "what"))) {
    out.push({ id: "day", icon: "calendar", title: "Build this screening day", sub: `The agent drafts the day from "${q}" for you to check and save`, run: go({ page: "Clinics", tab: "days", params: { ask: q } }) });
  }
  if (has(q, "move", "change", "finish", "lunch", "room") && has(q, "day", "lunch", "room", "nurse", "finish")) {
    out.push({ id: "dayedit", icon: "edit", title: "Change a screening day", sub: "Open the day, then type the change in plain English", run: go({ page: "Clinics", tab: "days" }) });
  }
  if (has(q, "import", "csv", "lab file", "upload", "eurofins")) out.push({ id: "import", icon: "layers", title: "Import a lab file", sub: "Drop the CSV, Pulse matches name, date of birth and Precision ID", run: go({ page: "Results", tab: "imports" }) });
  if (has(q, "match", "mismatch", "queue", "flagged row", "need matching")) out.push({ id: "queue", icon: "alert", title: "Lab rows that need matching", sub: "Side by side with the closest patient", run: go({ page: "Results", tab: "imports", params: { view: "queue" } }) });
  if (has(q, "awaiting", "waiting for lab")) out.push({ id: "awaiting", icon: "clock", title: "Results awaiting the lab", sub: "Lab screens not yet matched", run: go({ page: "Results", tab: "inbox", params: { queue: "awaiting" } }) });
  if (has(q, "release", "approve", "review", "sign off")) out.push({ id: "review", icon: "shield", title: "Review and release results", sub: "Approve and release, logged with your name and time", run: go({ page: "Results", tab: "review" }) });
  if (has(q, "calendar", "what's on", "whats on", "this week", "next week", "diary", "schedule", "today")) out.push({ id: "cal", icon: "calendar", title: "Open the calendar", sub: "Everything scheduled across the business, with filters", run: go(calendarTarget()) });
  if (has(q, "lead", "enquiry", "inbound")) out.push({ id: "lead", icon: "flag", title: has(q, "new", "inbound") ? "Open the new inbound lead" : "Open the sales pipeline", sub: "First touch within 10 minutes", run: go(has(q, "new", "inbound") ? { page: "Sales", tab: "pipeline", params: { lead: "LD-0020" } } : { page: "Sales", tab: "pipeline" }) });
  if (has(q, "proposal", "quote", "price", "pricing")) out.push({ id: "prop", icon: "file", title: has(q, "price", "quote") ? "Price list and quick quote" : "Proposals", sub: "Priced from the price list", run: go({ page: "Sales", tab: has(q, "price", "quote") ? "price-list" : "proposals" }) });
  if (has(q, "onboard", "won", "dsa", "sla", "xero", "medibase")) out.push({ id: "onb", icon: "check", title: "Client onboarding", sub: "Occupational Health or Wellness, agreements, team, MediBase, Xero", run: go({ page: "Sales", tab: "onboarding" }) });
  if (has(q, "retention", "rebook", "recall", "renewal", "left the company", "feedback")) out.push({ id: "ret", icon: "refresh", title: "Retention", sub: "Results out emails, rebooking reminders, rebooking rate", run: go({ page: "Sales", tab: "recall" }) });
  if (has(q, "range", "reference", "neil's table")) out.push({ id: "ranges", icon: "flask", title: "Neil's reference ranges", sub: "The ranges behind every colour", run: go({ page: "Screening", tab: "ranges" }) });
  if (has(q, "test run", "simulate")) out.push({ id: "test", icon: "flask", title: "Test run a result", sub: "Pick a person, simulate results, create the report", run: go({ page: "Screening", tab: "check" }) });
  if (has(q, "form", "template", "jotform")) out.push({ id: "forms", icon: "file", title: "Forms and templates", sub: "Preview any form full screen", run: go({ page: "Programmes", tab: "forms-templates" }) });
  if (has(q, "flu", "vaccine")) out.push({ id: "flu", icon: "shield", title: "Flu", sub: "Bookings, stock and cold chain", run: go({ page: "Flu", tab: "overview" }) });
  if (has(q, "occupational", "oh client")) out.push({ id: "oh", icon: "users", title: "Occupational Health", sub: "Clients, agreements and sessions", run: go({ page: "OccHealth", tab: "clients" }) });
  if (has(q, "journey", "start to finish", "end to end", "where is", "where's", "lifecycle")) {
    const rest = q.replace(/\b(show|open|me|the|client|journey|start to finish|end to end|where is|where's|lifecycle|for|of|at|up to|with)\b/gi, " ").trim();
    const key = resolveClientKey(state, rest) || (companies[0] ? resolveClientKey(state, companies[0].name) : null) || "co-ibm";
    const name = journeyClients(state).find((c) => c.key === key)?.name || "IBM";
    out.unshift({ id: "journey", icon: "flag", title: `${name}, start to finish`, sub: "Every stage from first enquiry to next year's rebooking, with what happens next", run: go({ page: "Clients", tab: "journey", params: { who: key } }) });
  }
  if (has(q, "task", "to do", "todo")) out.push({ id: "tasks", icon: "list", title: "Tasks", sub: "Everything assigned to people", run: go({ page: "Work", tab: "tasks" }) });
  if (has(q, "nurse")) out.push({ id: "nurse", icon: "heart", title: "Open the nurse portal", sub: "Clinic day, check in, measurements, sign-off", run: () => { nav.openNursePortal?.(); close(); } });
  if (has(q, "client portal", "hr portal", "employer")) out.push({ id: "client", icon: "users", title: "Open the client (HR) portal", sub: "Dates, rooms and live counts", run: () => { nav.openClientPortal?.(); close(); } });
  if (has(q, "participant portal", "patient portal", "booking journey")) out.push({ id: "pp", icon: "user", title: "Open the participant portal", sub: "My results and booking", run: () => { nav.openPortal(); close(); } });

  /* Finding people and clients */
  const words = q.toLowerCase().replace(/[^a-z' -]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["find", "open", "show", "the", "for", "results", "result", "release", "patient", "participant"].includes(w));
  if (words.length) {
    const people = state.persons.filter((p) => words.some((w) => p.family.toLowerCase() === w || p.given.toLowerCase() === w)).slice(0, 4);
    people.forEach((p) => {
      const ep = state.episodes.filter((e) => e.personId === p.id).slice(-1)[0];
      out.push({ id: `p-${p.id}`, icon: "user", title: `${p.given} ${p.family}`, sub: `${p.id}, open their record`, run: go({ page: "Participants", tab: "directory", params: { person: p.id } }) });
      if (ep) out.push({ id: `e-${ep.id}`, icon: "chart", title: `${p.given} ${p.family}: results`, sub: `${ep.id} in Results`, run: go({ page: "Results", tab: "review", params: { episode: ep.id } }) });
    });
  }
  companies.slice(0, 2).forEach((c) => out.push({ id: `j-${c.id}`, icon: "flag", title: `${c.name}: client journey`, sub: "Where they are, start to finish", run: go({ page: "Clients", tab: "journey", params: { who: c.id } }) }));
  companies.slice(0, 3).forEach((c) => out.push({ id: `c-${c.id}`, icon: "home", title: c.name, sub: "Open the client record", run: go({ page: "Records", tab: "companies", params: { company: c.id } }) }));

  if (!out.length) {
    const a = answerQuery(state, q);
    const acts = a.actions.filter((x) => x.target);
    if (acts.length) acts.slice(0, 4).forEach((x, i) => out.push({ id: `a-${i}`, icon: "arrow", title: x.label, sub: i === 0 ? a.text.slice(0, 110) + (a.text.length > 110 ? "..." : "") : "", run: go(x.target!) }));
    else out.push({ id: "home", icon: "spark", title: "Ask Pulse on Home", sub: a.supported ? a.text.slice(0, 120) : "Pulse will answer with the records behind it", run: go({ page: "Home" }) });
  }
  const seen = new Set<string>();
  return out.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true))).slice(0, 7);
}

export default function PulseAssistant() {
  const state = usePhState();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const close = () => { setOpen(false); setQ(""); setSel(0); };
  const hits = useMemo(() => pulseHits(state, nav, q, close), [state, nav, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 30); }, [open]);
  useEffect(() => setSel(0), [q]);

  const fab: CSSProperties = { position: "fixed", right: 26, bottom: 18, zIndex: 60, width: 48, height: 48, borderRadius: 16, border: "1px solid var(--accent-line, transparent)", background: "var(--accent-fill, var(--accent))", color: "var(--on-accent, #fff)", boxShadow: "0 14px 34px rgba(0,0,0,.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <>
      <style>{CSS}</style>
      {open ? (
        <div className="pa-panel" role="dialog" aria-label="Pulse">
          <div className="pa-head">
            <span className="pa-logo"><PulseGlyph size={16} /></span>
            <div style={{ flex: 1 }}><div className="pa-title">Pulse</div><div className="pa-sub">Tell me what you want to do</div></div>
            <button type="button" className="pa-x" onClick={close} aria-label="Close Pulse"><Icon name="x" size={14} /></button>
          </div>
          <form className="pa-ask" onSubmit={(e) => { e.preventDefault(); hits[sel]?.run(); }}>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Set up IBM on 6 November"
              onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); } }} aria-label="What do you want to do?" />
            <button type="submit" className="pa-go" disabled={!hits.length} aria-label="Go"><Icon name="arrow" size={15} /></button>
          </form>
          <div className="pa-body">
            {q.trim() ? hits.map((h, i) => (
              <button key={h.id} type="button" className={`pa-hit${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={h.run}>
                <span className="pa-hit-i"><Icon name={h.icon} size={15} /></span>
                <span className="pa-hit-b"><span className="pa-hit-t">{h.title}</span>{h.sub ? <span className="pa-hit-s">{h.sub}</span> : null}</span>
                {i === sel ? <span className="pa-enter">Enter</span> : null}
              </button>
            )) : (
              <>
                <div className="pa-label">Try one of these</div>
                <div className="pa-chips">{SUGGESTIONS.map((s) => <button key={s} type="button" className="pa-chip" onClick={() => setQ(s)}>{s}</button>)}</div>
              </>
            )}
          </div>
          <div className="pa-foot">Ctrl or Cmd + J opens Pulse anywhere. Pulse never changes results.</div>
        </div>
      ) : null}
      <button type="button" style={fab} className="pa-fab" onClick={() => (open ? close() : setOpen(true))} title={open ? "Close Pulse" : "Ask Pulse to do something"} aria-label={open ? "Close Pulse" : "Ask Pulse"}>
        {open ? <Icon name="x" size={20} /> : <PulseGlyph size={26} />}
      </button>
    </>
  );
}

export function PulseGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-6 3.5 12 3-8 2 2h5" />
    </svg>
  );
}

const CSS = `
.pa-fab { transition: transform .2s ease, box-shadow .2s ease; }
.pa-fab:hover { transform: translateY(-2px); box-shadow: 0 18px 40px rgba(0,0,0,.36); }
.pa-fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.pa-panel { position: fixed; right: 24px; bottom: 78px; z-index: 61; width: min(420px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 120px)); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 30px 72px rgba(0,0,0,.28); overflow: hidden; animation: paIn .25s cubic-bezier(.16,1,.3,1) both; }
@keyframes paIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
.pa-head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px; }
.pa-logo { width: 32px; height: 32px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; flex: none; }
.pa-title { font-weight: 600; color: var(--ink); font-size: 14px; }
.pa-sub { font-size: 12px; color: var(--dim); }
.pa-x { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--border); background: none; color: var(--dim); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.pa-ask { display: flex; gap: 8px; padding: 0 14px 12px; }
.pa-ask input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-faint, var(--surface)); color: var(--ink); font: inherit; font-size: 14px; padding: 0 14px; outline: none; }
.pa-ask input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.pa-go { width: 44px; height: 44px; border-radius: 12px; border: 0; background: var(--accent); color: var(--on-accent, #fff); cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none; }
.pa-go:disabled { opacity: .4; cursor: default; }
.pa-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.pa-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); padding: 6px 6px 8px; }
.pa-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 6px 6px; }
.pa-chip { border: 1px solid var(--border); background: var(--surface); color: var(--body, var(--ink)); border-radius: 999px; padding: 6px 11px; font: inherit; font-size: 12.5px; cursor: pointer; }
.pa-chip:hover { border-color: var(--accent); color: var(--accent); }
.pa-hit { width: 100%; display: flex; align-items: center; gap: 11px; text-align: left; padding: 10px; border: 0; border-radius: 12px; background: none; color: inherit; font: inherit; cursor: pointer; }
.pa-hit.on { background: var(--accent-soft); }
.pa-hit-i { width: 32px; height: 32px; border-radius: 10px; background: var(--track, var(--accent-soft)); color: var(--accent); display: flex; align-items: center; justify-content: center; flex: none; }
.pa-hit-b { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pa-hit-t { color: var(--ink); font-weight: 500; font-size: 13.5px; }
.pa-hit-s { color: var(--dim); font-size: 12px; line-height: 1.4; }
.pa-enter { font-size: 10.5px; color: var(--faint); border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; flex: none; }
.pa-foot { font-size: 11px; color: var(--faint); padding: 9px 14px; border-top: 1px solid var(--border); }
@media (max-width: 600px) { .pa-panel { right: 16px; bottom: 86px; } }
`;
