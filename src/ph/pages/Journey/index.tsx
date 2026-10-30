/* Clients: every client, start to finish. The list on the left holds the client companies, the won
   and onboarding clients and new inbound leads, each with the stage it has reached. The right shows
   the selected client's twelve stages from first enquiry to next year's rebooking, each with its
   live status, the key facts, a button to the exact record and, when something is waiting, the next
   action right there. Deep link: #/Clients/journey?who=co-ibm (also LD-0020, ONB-001 or a name). */
import { useEffect, useMemo, useRef } from "react";
import { fmtDate } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import { Button, Icon, PageHeader, Pill, RestrictedNotice, Select } from "../../ui";
import type { Tone } from "../../ui";
import { J_STATUS_LABEL, journeyClients, journeyFor, resolveClientKey } from "./model";
import type { JAction, JStage, JStatus, Journey } from "./model";
import { useJourneyRun } from "./run";
import "./journey.css";

const TONE: Record<JStatus, Tone> = { done: "ok", history: "ok", progress: "info", todo: "neutral", na: "neutral", unrecorded: "neutral" };
const KIND_LABEL = { client: "Clients", lead: "Won and new business", onboarding: "Being onboarded" } as const;

export default function Clients() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const clients = useMemo(() => journeyClients(s), [s]);
  const key = resolveClientKey(s, nav.params.who) || "co-ibm";
  const j = useMemo(() => journeyFor(s, key), [s, key]);
  const pick = (k: string) => nav.setParams({ who: k });
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Clients" />
        <RestrictedNotice title="Not available in the participant preview">Clients is for Precision Health staff.</RestrictedNotice>
      </div>
    );
  }
  const groups = (["client", "onboarding", "lead"] as const).map((k) => ({ k, items: clients.filter((c) => c.kind === k) })).filter((g) => g.items.length);
  return (
    <div className="ph-page">
      <PageHeader title="Clients" sub="Every client from first enquiry to next year's rebooking, in one place. Pick a client to see where they are and what happens next." />
      <div className="jr">
        <aside className="jr-list" aria-label="Clients">
          <Select className="jr-pick" aria-label="Client" value={j?.client.key || key} onChange={(e) => pick(e.target.value)}>
            {groups.map((g) => <optgroup key={g.k} label={KIND_LABEL[g.k]}>{g.items.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</optgroup>)}
          </Select>
          {groups.map((g) => (
            <div key={g.k} className="jr-group">
              <div className="jr-group-h">{KIND_LABEL[g.k]}</div>
              {g.items.map((c) => <ClientRow key={c.key} k={c.key} name={c.name} sub={c.sub} on={c.key === j?.client.key} onPick={() => pick(c.key)} />)}
            </div>
          ))}
        </aside>
        <section className="jr-main" aria-live="polite">{j ? <JourneyView j={j} /> : null}</section>
      </div>
    </div>
  );
}

function ClientRow({ k, name, sub, on, onPick }: { k: string; name: string; sub: string; on: boolean; onPick: () => void }) {
  const s = usePhState();
  const j = journeyFor(s, k);
  if (!j) return null;
  const cur = j.stages[j.current];
  return (
    <button type="button" className={"jr-client" + (on ? " on" : "")} onClick={onPick} aria-pressed={on}>
      <span className="jr-client-name">{name}</span>
      <span className="jr-client-sub">{sub}</span>
      <span className="jr-client-stage"><span className="jr-mini" aria-hidden>{j.stages.map((st) => <i key={st.id} className={st.status === "done" || st.status === "history" ? "d" : st.status === "progress" ? "p" : ""} />)}</span>
        {cur.n}. {cur.short}</span>
    </button>
  );
}

function JourneyView({ j }: { j: Journey }) {
  const run = useJourneyRun();
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const cur = j.stages[j.current];
  const first = cur.actions[0] || cur.open;
  useEffect(() => { refs.current = {}; }, [j.client.key]);
  const jump = (id: string) => refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <>
      <div className="jr-hero">
        <div className="jr-hero-top">
          <div style={{ minWidth: 0 }}>
            <div className="jr-eyebrow">{j.client.sub || "Client"}</div>
            <h2 className="jr-name">{j.client.name}</h2>
          </div>
          <div className="jr-count"><b>{j.doneCount}</b><span>of 12 done</span></div>
        </div>
        <ol className="jr-over" aria-label="Stages">
          {j.stages.map((st, i) => (
            <li key={st.id}>
              <button type="button" className={`jr-over-step s-${st.status}${i === j.current ? " now" : ""}`} onClick={() => jump(st.id)} title={`${st.n}. ${st.title}: ${J_STATUS_LABEL[st.status]}`}>
                <span className="jr-over-dot">{st.status === "done" || st.status === "history" ? <Icon name="check" size={10} stroke={2.6} /> : st.n}</span>
                <span className="jr-over-label">{st.short}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="jr-now">
          <span className="jr-now-ico"><Icon name="arrow" size={16} /></span>
          <div className="jr-now-text"><b>Now: {cur.n}. {cur.title}</b><span>{cur.next || cur.facts[0]}</span></div>
          <Button variant="primary" onClick={() => run(first)}>{first.label}</Button>
        </div>
      </div>
      <ol className="jr-stages">
        {j.stages.map((st, i) => <StageCard key={st.id} st={st} now={i === j.current} innerRef={(el) => { refs.current[st.id] = el; }} />)}
      </ol>
      <div className="jr-loop"><Icon name="refresh" size={14} />Stage 12 loops back to stage 1: next year's screening starts as a new lead, three months before the anniversary.</div>
    </>
  );
}

function statusText(st: JStage): string {
  if (st.status === "done" && st.date) return `Done ${fmtDate(st.date)}`;
  return J_STATUS_LABEL[st.status];
}

function StageCard({ st, now, innerRef }: { st: JStage; now: boolean; innerRef: (el: HTMLElement | null) => void }) {
  const run = useJourneyRun();
  const acts: JAction[] = st.actions.length ? st.actions : [];
  const sameAsOpen = (a: JAction) => a.kind === "go" && st.open.kind === "go" && JSON.stringify(a.target) === JSON.stringify(st.open.target);
  return (
    <li ref={innerRef} className={`jr-stage s-${st.status}${now ? " now" : ""}`}>
      <span className="jr-num" aria-hidden>{st.status === "done" || st.status === "history" ? <Icon name="check" size={14} stroke={2.6} /> : st.n}</span>
      <div className="jr-card">
        <div className="jr-card-head">
          <h3><span className="jr-n">{st.n}.</span> {st.title}</h3>
          <Pill tone={TONE[st.status]} icon={st.status === "progress" ? "clock" : null}>{statusText(st)}</Pill>
        </div>
        {st.facts.length ? <ul className="jr-facts">{st.facts.map((f) => <li key={f}>{f}</li>)}</ul> : null}
        {st.next ? <div className="jr-next"><b>Next:</b> {st.next}</div> : null}
        <div className="jr-acts">
          {acts.map((a, i) => <Button key={a.label} size="sm" variant={i === 0 && (st.status === "progress" || st.status === "todo") ? "primary" : "secondary"} onClick={() => run(a)} title={a.kind === "act" && a.who ? `Needs ${a.who}` : undefined}>{a.label}</Button>)}
          {acts.some(sameAsOpen) ? null : <Button size="sm" variant="ghost" icon="arrow" onClick={() => run(st.open)}>{st.open.label}</Button>}
        </div>
      </div>
    </li>
  );
}
