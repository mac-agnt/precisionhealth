/* "Requests from clients" on Clinics, Screening days: every open date request with its status and the
   suggested days, plus the ones decided in the last fortnight. Review opens Neil's decision dialog
   (?request=DR-0002); "Ask a client for dates" opens the ask dialog (?askdates=1 or a programme id). */
import { DR_STATUS_LABEL, DR_STATUS_TONE, PROGRAMME_BY_ID, drOpen, fmtDate, fmtDayMonth, fmtWeekdayDate } from "../../model";
import type { DateRequest, ProgrammeId } from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Icon, Pill } from "../../ui";
import { AskDatesDialog } from "./AskDialog";
import { DateRequestReview } from "./ReviewDialog";
import "./dq.css";

/** Open requests first (waiting for Neil at the top), then ones decided in the last 14 days. */
export function visibleRequests(list: DateRequest[], nowIso: string): DateRequest[] {
  const now = Date.parse(nowIso);
  const rank = (r: DateRequest) => (r.status === "suggested" ? 0 : r.status === "countered" ? 1 : r.status === "asked" ? 2 : 3);
  return list.filter((r) => drOpen(r) || (r.decidedAt && now - Date.parse(r.decidedAt) < 14 * 86400000))
    .slice().sort((a, b) => rank(a) - rank(b) || b.askedAt.localeCompare(a.askedAt));
}

export function ClientRequestsSection() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const list = visibleRequests(s.dateRequests.requests, s.clock.nowUtc);
  const waiting = list.filter((r) => r.status === "suggested").length;
  const set = (patch: Record<string, string>) => {
    const next: Record<string, string> = { ...nav.params, ...patch };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    nav.setParams(next);
  };
  const ask = nav.params.askdates;
  return (
    <section className="dq-section" aria-labelledby="dq-req-title">
      <div className="dq-section-head">
        <h2 id="dq-req-title" className="ph-grow">Requests from clients</h2>
        {waiting ? <Pill tone="warn" icon="clock">{waiting} waiting for {p.role === "clinical_review" ? "you" : "Neil"}</Pill> : null}
        <Button size="sm" icon="send" onClick={() => set({ askdates: "1" })}>Ask a client for dates</Button>
      </div>
      {list.length ? (
        <div className="dq-list">
          {list.map((r) => <RequestRow key={r.id} r={r} onOpen={() => set({ request: r.id })} />)}
        </div>
      ) : <p className="dq-hint">No open requests. Ask a client to suggest dates: they pick days a nurse is free in their portal, and Neil approves them.</p>}
      <DateRequestReview id={nav.params.request} onClose={() => set({ request: "" })} />
      <AskDatesDialog open={!!ask} programmeId={ask && ask !== "1" && PROGRAMME_BY_ID[ask as ProgrammeId] ? (ask as ProgrammeId) : ""} onClose={() => set({ askdates: "" })} />
    </section>
  );
}

function RequestRow({ r, onOpen }: { r: DateRequest; onOpen: () => void }) {
  const prog = PROGRAMME_BY_ID[r.programmeId];
  const picks = r.status === "countered" && r.counter ? r.counter.picks : r.picks;
  const sub = r.status === "asked" ? `Asked ${fmtDate(r.askedAt.slice(0, 10))}. ${r.contactName} has not picked dates yet.`
    : r.status === "suggested" ? `${r.contactName} suggested ${picks.length} ${picks.length === 1 ? "date" : "dates"}${r.room ? `, ${r.room}` : ""}.`
      : r.status === "countered" ? `You proposed ${picks.length === 1 ? "a new date" : "new dates"}. Waiting for ${r.contactName}.`
        : r.status === "approved" ? `${r.dayIds.length} screening ${r.dayIds.length === 1 ? "day" : "days"} created${r.dayIds.length < r.daysNeeded ? `, ${r.daysNeeded - r.dayIds.length} more to find` : ""}.` : `Declined: ${r.declineReason}`;
  return (
    <button type="button" className={`dq-row${r.status === "suggested" ? " needs" : ""}`} onClick={onOpen} aria-label={`${prog.clientName} date request ${r.id}, ${DR_STATUS_LABEL[r.status]}. Open`}>
      <span className="dq-row-t">
        <b>{prog.clientName} <span style={{ color: "var(--faint)", fontWeight: 500, fontSize: 12 }}>{r.id}</span></b>
        <span>{r.daysNeeded} {r.daysNeeded === 1 ? "day" : "days"}, {r.screen === "poc" ? "point of care" : "lab bloods"}, {fmtDayMonth(r.from)} to {fmtDayMonth(r.to)}</span>
      </span>
      <span className="dq-row-t">
        {picks.length && r.status !== "approved" && r.status !== "declined" ? <span className="dq-chips">{picks.map((x) => <span key={x.date} className="dq-chip"><Icon name="calendar" size={11} />{fmtWeekdayDate(x.date)}</span>)}</span> : null}
        <span>{sub}</span>
      </span>
      <span className="dq-row-end">
        <Pill tone={DR_STATUS_TONE[r.status]} icon={r.status === "approved" ? "check" : r.status === "declined" ? "x" : "clock"}>{DR_STATUS_LABEL[r.status]}</Pill>
        <span className={`ph-btn ph-btn-sm${r.status === "suggested" ? " ph-btn-primary" : ""}`} aria-hidden="true">{r.status === "suggested" ? "Review" : "Open"}</span>
      </span>
    </button>
  );
}
