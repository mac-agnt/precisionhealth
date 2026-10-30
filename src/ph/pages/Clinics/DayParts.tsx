/* Screening days: the day strip (appointments and breaks drawn to scale), the source note under
   each field (from your words, assumed, needs a person) and the form used both for the agent's
   draft and for manual set-up and edits. */
import type { ReactNode } from "react";
import {
  BREAK_LABEL, DAY_SCREEN_LABEL, PROGRAMME_BY_ID, PROGRAMME_ORDER, dayErrors, dayFit, dayFitSlots, daySlots, fmtDateLong, fmtHm, freeNurses,
  hhmmToMinutes, minutesToHhmm, nurseStaff, sessionBreaks, today,
} from "../../model";
import type { BreakKey, DayField, DayForm, FieldSource, Hhmm, ProgrammeId, StaffId } from "../../model";
import { usePhState } from "../../store";
import { Button, Icon, Select, TextInput, Textarea } from "../../ui";
import type { GlyphName } from "../../ui";

/* ---- the day strip ---- */
export function DayStrip({ form, booked = 0, height = 34 }: { form: DayForm; booked?: number; height?: number }) {
  const s = hhmmToMinutes(form.start), e = hhmmToMinutes(form.end);
  if (!(e > s)) return <div className="ph-dim" style={{ fontSize: 12 }}>Set a start and a finish to see the day.</div>;
  const offered = daySlots(form), fit = dayFitSlots(form);
  const breaks = sessionBreaks(form);
  const names = new Map<string, string>();
  (["first", "lunch", "afternoon"] as BreakKey[]).forEach((k) => { const b = form.breaks[k]; if (b) names.set(b.start, k === "lunch" ? "Lunch" : "Break"); });
  type Seg = { from: number; to: number; cls: string; label?: string; title: string };
  const segs: Seg[] = [];
  let t = s;
  const push = (from: number, to: number, cls: string, title: string, label?: string) => { if (to > from) segs.push({ from, to, cls, title, label }); };
  const events = [
    ...fit.map((x, i) => ({ a: hhmmToMinutes(x.start), b: hhmmToMinutes(x.end), kind: i < offered.length ? (i < booked ? "booked" : "appt") : "spare", label: "" })),
    ...breaks.map((b) => ({ a: hhmmToMinutes(b.start), b: hhmmToMinutes(b.end), kind: "break", label: names.get(b.start) || "Break" })),
  ].filter((x) => x.b > s && x.a < e).sort((x, y) => x.a - y.a);
  for (const ev of events) {
    const a = Math.max(ev.a, t), b = Math.min(ev.b, e);
    if (a > t) push(t, a, "sd-s-idle", `${minutesToHhmm(t)} to ${minutesToHhmm(a)}: not bookable`);
    if (b > a) {
      if (ev.kind === "break") push(a, b, "sd-s-break", `${minutesToHhmm(a)} to ${minutesToHhmm(b)}: ${ev.label.toLowerCase()}`, ev.label);
      else push(a, b, ev.kind === "booked" ? "sd-s-booked" : ev.kind === "appt" ? "sd-s-appt" : "sd-s-spare", `${minutesToHhmm(a)} to ${minutesToHhmm(b)}: ${ev.kind === "booked" ? "booked" : ev.kind === "appt" ? "appointment" : "fits, not offered"}`);
    }
    t = Math.max(t, b);
  }
  if (e > t) push(t, e, "sd-s-idle", `${minutesToHhmm(t)} to ${minutesToHhmm(e)}: not bookable`);
  const span = e - s;
  const ticks = [form.start, ...breaks.filter((b) => hhmmToMinutes(b.start) > s && hhmmToMinutes(b.end) <= e).map((b) => b.start), form.end];
  const spare = fit.length - offered.length;
  return (
    <div>
      <div className="sd-strip" style={{ height }} role="img" aria-label={`${offered.length} appointments from ${fmtHm(form.start)} to ${fmtHm(form.end)} with ${breaks.length} breaks`}>
        {segs.map((g) => <span key={g.from + g.cls} className={g.cls} style={{ flexGrow: g.to - g.from }} title={g.title}>{g.label && (g.to - g.from) / span > 0.09 ? g.label : ""}</span>)}
      </div>
      <div className="sd-ticks" aria-hidden="true">
        {ticks.map((x, i) => <span key={x + i} style={{ left: `${((hhmmToMinutes(x) - s) / span) * 100}%` }}>{fmtHm(x)}</span>)}
      </div>
      <div className="sd-strip-legend" style={{ marginTop: 8 }}>
        {booked ? <span><i className="sd-s-booked" />Booked</span> : null}
        <span><i className="sd-s-appt" />Appointment</span>
        {spare > 0 ? <span><i className="sd-s-spare" />Fits, not offered ({spare})</span> : null}
        <span><i className="sd-s-break" />Break</span>
      </div>
    </div>
  );
}

/* ---- where a value came from ---- */
export type Sources = Partial<Record<DayField, FieldSource | "person">>;
const SRC: Record<FieldSource | "person", { icon: GlyphName; label: string }> = {
  said: { icon: "check", label: "From your words" },
  assumed: { icon: "spark", label: "Assumed" },
  needed: { icon: "alert", label: "Needs a person" },
  person: { icon: "edit", label: "Set by you" },
};
export function SourceNote({ src, why }: { src?: FieldSource | "person"; why?: string }) {
  if (!src) return null;
  const m = SRC[src];
  return (
    <div className={"sd-src " + src}>
      <Icon name={m.icon} size={12} stroke={2} />
      <div>{m.label}{why && src !== "person" ? <>: <span>{why}</span></> : null}</div>
    </div>
  );
}

/* ---- the form ---- */
const BREAK_MINUTES = [10, 15, 20, 30, 45, 60];
/** Clock times every 5 minutes from 6:00 to 21:00, shown the Irish way (9:00, 16:30). */
const TIMES: Hhmm[] = Array.from({ length: (21 - 6) * 12 + 1 }, (_, i) => minutesToHhmm(6 * 60 + i * 5));
function TimeSelect({ id, value, onChange, disabled, label }: { id?: string; value: string; onChange: (v: Hhmm) => void; disabled?: boolean; label?: string }) {
  const opts = value && !TIMES.includes(value as Hhmm) ? [...TIMES, value as Hhmm].sort() : TIMES;
  return (
    <Select id={id} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value as Hhmm)}>
      {!value ? <option value="">Time</option> : null}
      {opts.map((t) => <option key={t} value={t}>{fmtHm(t)}</option>)}
    </Select>
  );
}
const LENGTHS = [10, 15, 20, 30, 45, 60];

export interface EditorProps {
  form: DayForm;
  onChange: (f: DayForm, field: DayField) => void;
  sources?: Sources;
  why?: Partial<Record<DayField, string>>;
  notes?: string[];
  ownSessionId?: string | null;
  /** Shown above the actions in the summary panel. */
  footer?: ReactNode;
  actions: ReactNode;
  booked?: number;
  /** Hide the client and date (editing an existing day keeps them in the form, still editable). */
  idPrefix: string;
}

export function useDayCheck(form: DayForm, ownSessionId?: string | null) {
  const state = usePhState();
  return dayErrors(form, { today: today(state), sessions: state.sessions, ownSessionId: ownSessionId ?? null, staff: state.staff });
}

export function DayEditor({ form, onChange, sources = {}, why = {}, notes = [], ownSessionId, actions, booked = 0, idPrefix, footer }: EditorProps) {
  const state = usePhState();
  const errs = useDayCheck(form, ownSessionId);
  const fit = dayFit(form);
  const nurses = nurseStaff(state);
  const free = form.date ? freeNurses(state, form.date, form.start, form.end, ownSessionId) : nurses;
  const set = <K extends keyof DayForm>(k: K, v: DayForm[K], field: DayField = k as DayField) => onChange({ ...form, [k]: v }, field);
  const setBreak = (k: BreakKey, v: DayForm["breaks"][BreakKey]) => onChange({ ...form, breaks: { ...form.breaks, [k]: v } }, k);
  const id = (k: string) => `${idPrefix}-${k}`;
  const F = ({ k, label, children, wide }: { k: DayField; label: string; children: ReactNode; wide?: boolean }) => (
    <div className={"sd-field" + (sources[k] === "needed" && errs[k] ? " needed" : "") + (wide ? " wide" : "")}>
      <label className="ph-label" htmlFor={id(k)}>{label}</label>
      {children}
      {errs[k] && sources[k] !== "needed" && !(["programmeId", "date", "nurseId"].includes(k) && !form[k as "date"]) ? <div className="ph-err" role="alert">{errs[k]}</div> : null}
      <SourceNote src={sources[k]} why={why[k]} />
    </div>
  );
  const issues = Object.entries(errs).filter(([k]) => !(sources[k as DayField] === "needed" && (k === "nurseId" || k === "programmeId" || k === "date"))) as Array<[DayField, string]>;
  const needs = (Object.keys(sources) as DayField[]).filter((k) => sources[k] === "needed" && (errs[k] || (k === "room" && !form.room.trim())));
  const breakField = (k: BreakKey) => {
    const b = form.breaks[k];
    return F({ k, label: BREAK_LABEL[k], children: (
        <div className="sd-break">
          <TimeSelect id={id(k)} value={b?.start || ""} disabled={!b} label={`${BREAK_LABEL[k]} start`}
            onChange={(v) => setBreak(k, { start: v, minutes: b?.minutes || 15 })} />
          <Select value={b ? String(b.minutes) : "none"} aria-label={`${BREAK_LABEL[k]} length`}
            onChange={(e) => setBreak(k, e.target.value === "none" ? null : { start: b?.start || (k === "first" ? "10:30" : k === "lunch" ? "12:30" : "14:30"), minutes: Number(e.target.value) })}>
            <option value="none">No break</option>
            {Array.from(new Set([...BREAK_MINUTES, b?.minutes || 15])).sort((x, y) => x - y).map((m) => <option key={m} value={m}>{m} min</option>)}
          </Select>
        </div>
    ) });
  };
  return (
    <div className="sd-editor">
      <div className="sd-fields">
        <div>
          <div className="sd-group-title">Who and when</div>
          <div className="sd-grid">
            {F({ k: "programmeId", label: "Client", children: (
              <Select id={id("programmeId")} value={form.programmeId} onChange={(e) => set("programmeId", e.target.value as ProgrammeId)}>
                <option value="">Choose the client</option>
                {PROGRAMME_ORDER.map((p) => <option key={p} value={p}>{PROGRAMME_BY_ID[p].clientName}</option>)}
              </Select>) })}
            {F({ k: "date", label: form.date ? `Date: ${fmtDateLong(form.date)}` : "Date", children:<TextInput id={id("date")} type="date" value={form.date} min={today(state)} onChange={(e) => set("date", e.target.value)} /> })}
            {F({ k: "screen", label: "Screen type", children: (
              <div className="sd-seg" role="group" aria-label="Screen type" id={id("screen")}>
                {(["lab", "poc"] as const).map((x) => (
                  <button key={x} type="button" aria-pressed={form.screen === x} onClick={() => set("screen", x)}>
                    <Icon name={x === "lab" ? "flask" : "heart"} size={13} />{DAY_SCREEN_LABEL[x]}
                  </button>
                ))}
              </div>) })}
            {F({ k: "nurseId", label: "Nurse", children: (
              <>
                <Select id={id("nurseId")} value={form.nurseId} onChange={(e) => set("nurseId", e.target.value as StaffId)}>
                  <option value="">Choose the nurse</option>
                  {nurses.map((n) => <option key={n.id} value={n.id}>{n.name}{form.date && !free.some((x) => x.id === n.id) ? " (busy that day)" : ""}</option>)}
                </Select>
                {!form.nurseId && free.length ? (
                  <div className="sd-quick">{free.slice(0, 5).map((n) => <button key={n.id} type="button" onClick={() => set("nurseId", n.id)}>{n.name.split(" ")[0]}</button>)}</div>
                ) : null}
              </>) })}
          </div>
        </div>
        <div>
          <div className="sd-group-title">Times and breaks</div>
          <div className="sd-grid three">
            {F({ k: "start", label: "Start", children: <TimeSelect id={id("start")} value={form.start} onChange={(v) => set("start", v)} /> })}
            {breakField("first")}
            {breakField("lunch")}
            {breakField("afternoon")}
            {F({ k: "end", label: "Finish", children: <TimeSelect id={id("end")} value={form.end} onChange={(v) => set("end", v)} /> })}
          </div>
        </div>
        <div>
          <div className="sd-group-title">Appointments</div>
          <div className="sd-grid">
            {F({ k: "appointments", label: "Number of appointments", children: (
              <>
                <TextInput id={id("appointments")} inputMode="numeric" value={form.appointments === null ? "" : String(form.appointments)}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("appointments", v === "" ? null : Math.min(999, Number(v))); }} />
                {fit > 0 && form.appointments !== fit ? <div className="sd-quick"><button type="button" onClick={() => set("appointments", fit)}>Use all {fit} that fit</button></div> : null}
              </>) })}
            {F({ k: "slotMinutes", label: "Appointment length", children: (
              <Select id={id("slotMinutes")} value={String(form.slotMinutes)} onChange={(e) => set("slotMinutes", Number(e.target.value))}>
                {Array.from(new Set([...LENGTHS, form.slotMinutes])).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </Select>) })}
          </div>
        </div>
        <div>
          <div className="sd-group-title">Where and logistics</div>
          <div className="sd-grid">
            {F({ k: "room", label: "Room and location", wide: true, children: <TextInput id={id("room")} value={form.room} placeholder="For example Room 2.14, Building B. Leave blank if HR has not confirmed it yet." onChange={(e) => set("room", e.target.value)} /> })}
            {F({ k: "parking", label: "Parking", children: <TextInput id={id("parking")} value={form.parking} placeholder="Where the nurse parks" onChange={(e) => set("parking", e.target.value)} /> })}
            {F({ k: "contactName", label: "Contact on the day", children: <TextInput id={id("contactName")} value={form.contactName} placeholder="Name" onChange={(e) => set("contactName", e.target.value)} /> })}
            {F({ k: "notes", label: "Logistics notes for the nurse", children: <Textarea id={id("notes")} rows={2} value={form.notes} placeholder="For example: bring the centrifuge" onChange={(e) => set("notes", e.target.value)} /> })}
            {F({ k: "contactPhone", label: "Contact phone", children: <TextInput id={id("contactPhone")} value={form.contactPhone} inputMode="tel" placeholder="087 555 0142" onChange={(e) => set("contactPhone", e.target.value)} /> })}
          </div>
        </div>
      </div>

      <aside className="sd-summary" aria-label="The day at a glance">
        <div>
          <div className="sd-group-title" style={{ marginBottom: 6 }}>The day at a glance</div>
          <div className="sd-fit">
            <span className="sd-fit-n">{form.appointments ?? 0}</span>
            <span className="sd-fit-l">appointment{form.appointments === 1 ? "" : "s"} of {form.slotMinutes} min</span>
          </div>
          <div style={{ marginTop: 6 }}>
            {errs.appointments && form.appointments !== null ? <span className="sd-fit-bad"><Icon name="alert" size={13} />Only {fit} fit</span>
              : <span className="sd-fit-ok"><Icon name="check" size={13} stroke={2} />{fit} appointment{fit === 1 ? "" : "s"} fit in this day</span>}
          </div>
        </div>
        <DayStrip form={form} booked={booked} />
        <div className="sd-sumline">
          {form.programmeId ? <b>{PROGRAMME_BY_ID[form.programmeId].clientName}</b> : <b>Client not chosen</b>}
          {form.date ? <>, {fmtDateLong(form.date)}</> : null}. {DAY_SCREEN_LABEL[form.screen]}, {fmtHm(form.start)} to {fmtHm(form.end)}.
          {" "}{form.room.trim() ? form.room.trim() : "Room to be confirmed"}.
        </div>
        {notes.length ? <ul className="sd-notes">{notes.map((n) => <li key={n}><Icon name="spark" size={13} />{n}</li>)}</ul> : null}
        {needs.length || issues.length ? (
          <ul className="sd-issues">
            {needs.map((k) => <li key={"n" + k}><Icon name="alert" size={12} /><span><b>Needs a person:</b> {k === "room" ? "the room. You can save without it and confirm it later from the HR email." : (why[k] || errs[k])}</span></li>)}
            {issues.filter(([k]) => !needs.includes(k)).map(([k, v]) => <li key={k}><Icon name="alert" size={12} /><span>{v}</span></li>)}
          </ul>
        ) : <div className="sd-fit-ok"><Icon name="shield" size={13} />Times in order, breaks inside the day, nobody double-booked.</div>}
        {footer}
        <div className="sd-actions">{actions}</div>
      </aside>
    </div>
  );
}

export const hasBlockingErrors = (errs: Partial<Record<DayField, string>>) => Object.keys(errs).length > 0;
