/* Session drawer: summary, derived slots, booked participants and the local session editor.
   The editor previews the effect of every change first. Overlapping staff, room clashes and
   date moves with bookings are blocked; bookings that no longer fit are listed and only moved
   when the user explicitly confirms. Nothing is ever deleted. */
import { useEffect, useState } from "react";
import type { ClinicSession, StaffId } from "../../model";
import {
  act, activeBookings, fmtDate, fmtDateLong, hhmmToMinutes, plural, previewSessionEdit, sessionSlots, sessionStats, staffName, today,
} from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Checkbox, Field, Icon, Pill, RestrictedNotice, Select, TextInput } from "../../ui";
import {
  apptStatus, bookableMinutes, impactMoves, minutesLabel, placeLabel, roomClashes, staffConflicts,
} from "./selectors";
import { APPT_META, ApptPill, ClxDrawer, ProgTag, SlotTimeline } from "./shared";

export function SessionDrawer({ session, onClose }: { session: ClinicSession | undefined; onClose: () => void }) {
  return (
    <ClxDrawer open={!!session} onClose={onClose} width={680}
      title={session ? <SessionTitle session={session} /> : "Session"}
      sub={session ? `${session.id}, ${fmtDateLong(session.date)}, ${session.start} to ${session.end}` : undefined}>
      {session ? <SessionBody session={session} /> : null}
    </ClxDrawer>
  );
}

function SessionTitle({ session }: { session: ClinicSession }) {
  const state = usePhState();
  return <>{sessionStats(state, session.id).programme.name}</>;
}

function SessionBody({ session: s }: { session: ClinicSession }) {
  const state = usePhState();
  const nav = useNav();
  const st = sessionStats(state, s.id);
  const bk = activeBookings(state, s.id);
  const printer = state.resources.find((r) => r.id === s.printerId);
  const conflicts = staffConflicts(state, s);
  const clash = roomClashes(state, s);
  return (
    <div className="ph-stack" style={{ gap: 18 }}>
      <div className="ph-wrap" style={{ gap: 6 }}>
        <ProgTag code={st.programme.code} />
        {st.isPast ? <Pill tone="ok" icon="check">Completed</Pill> : st.isToday ? <Pill tone="info" icon="calendar">Today</Pill> : <Pill tone="neutral" icon="clock">Scheduled</Pill>}
        <Pill tone={st.available ? "info" : "neutral"} icon="calendar">{st.booked} of {st.slots} booked, {st.available} available</Pill>
        {conflicts.length || clash.length ? <Pill tone="warn" icon="alert">Overlap found</Pill> : <Pill tone="ok" icon="shield">No overlaps</Pill>}
      </div>

      <dl className="clx-kv" style={{ margin: 0 }}>
        <div><dt>Site and room</dt><dd>{placeLabel(s)}</dd></div>
        <div><dt>Nurse</dt><dd>{staffName(state, s.nurseId)}</dd></div>
        <div><dt>Support</dt><dd>{s.supportIds.length ? `${s.supportIds.map((id) => staffName(state, id)).join(", ")} (not a booked nurse)` : "None"}</dd></div>
        <div><dt>Label printer</dt><dd>{printer ? printer.name : "None"}</dd></div>
        <div><dt>Clinic day</dt><dd>{s.start} to {s.end}, {s.slotMinutes}-minute slots</dd></div>
        <div><dt>Breaks (not bookable)</dt><dd>{s.breaks.length ? s.breaks.map((b) => `${b.start} to ${b.end}`).join(", ") : "None"}</dd></div>
        <div><dt>Bookable slots</dt><dd>{st.slots}, from {minutesLabel(bookableMinutes(s))} of bookable time</dd></div>
        <div><dt>Attendance</dt><dd>{st.completed} completed, {st.checkedIn + st.inProgress} checked in, {st.notArrived} not arrived</dd></div>
      </dl>

      <div>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Slots</div>
        <SlotTimeline session={s} onSlot={(id) => nav.go({ page: "Clinics", tab: "appointments", params: { booking: id } })} />
      </div>

      <div>
        <div className="ph-row-flex" style={{ marginBottom: 8 }}>
          <div className="ph-eyebrow ph-grow">Booked participants ({bk.length})</div>
          <Button size="sm" icon="list" onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { date: s.date, session: s.id } })}>Open day list</Button>
        </div>
        {bk.length ? (
          <div style={{ maxHeight: 230, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
            {bk.map((b) => {
              const person = state.persons.find((x) => x.id === b.personId);
              const status = apptStatus(state, b, s);
              return (
                <button key={b.id} type="button" className="ph-row clx-uprow" style={{ gridTemplateColumns: "48px minmax(0,1fr) auto", padding: "7px 10px" }}
                  onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { booking: b.id } })} title={APPT_META[status].help}>
                  <span className="ph-num" style={{ fontSize: 12, color: "var(--ink)" }}>{b.slotStart}</span>
                  <span className="ph-trunc" style={{ fontSize: 12.5 }}>{person ? `${person.given} ${person.family}` : b.personId} <span className="ph-faint">{b.id}</span></span>
                  <ApptPill status={status} />
                </button>
              );
            })}
          </div>
        ) : <div className="ph-faint" style={{ fontSize: 12.5 }}>No bookings in this session.</div>}
      </div>

      {s.status === "scheduled" ? <SessionEditor session={s} /> : (
        <RestrictedNotice title="Completed sessions are history">This session has taken place. Its slots, assignments and attendance are kept as they were and cannot be edited.</RestrictedNotice>
      )}
    </div>
  );
}

/* ---- editor ---- */
interface EditForm { nurseId: StaffId; supportIds: StaffId[]; room: string; date: string; start: string; end: string; breaks: Array<{ start: string; end: string }> }
type ApplyPatch = { start?: string; end?: string; breaks?: Array<{ start: string; end: string }>; nurseId?: StaffId; supportIds?: StaffId[]; room?: string; date?: string };

const initForm = (s: ClinicSession): EditForm => ({
  nurseId: s.nurseId, supportIds: s.supportIds.slice(), room: s.room, date: s.date, start: s.start, end: s.end, breaks: s.breaks.map((b) => ({ start: b.start, end: b.end })),
});
const normBreaks = (b: Array<{ start: string; end: string }>) => b.map((x) => ({ start: x.start, end: x.end })).sort((x, y) => (x.start < y.start ? -1 : 1));
const okTime = (x: string) => /^\d{2}:\d{2}$/.test(x);

function SessionEditor({ session: s }: { session: ClinicSession }) {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const sKey = JSON.stringify(initForm(s));
  const [form, setFormRaw] = useState<EditForm>(() => initForm(s));
  const [moveOk, setMoveOk] = useState(false);
  const [lastMsg, setLastMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setFormRaw(initForm(s)); setMoveOk(false); }, [sKey]);
  const setForm = (f: EditForm) => { setFormRaw(f); setLastMsg(null); };

  const canManage = p.perms.has("bookings.manage");
  const t = today(state);
  const nurses = state.staff.filter((x) => x.role === "nursing_lead" || x.role === "clinical_capture");
  const supportPool = state.staff.filter((x) => x.team === "nursing" && x.id !== form.nurseId);
  const rooms = state.resources.filter((r) => r.kind === "room");

  /* local validation */
  const errs: string[] = [];
  const m = hhmmToMinutes;
  if (!okTime(form.start) || !okTime(form.end)) errs.push("Enter the start and end as HH:MM.");
  else if (m(form.start) >= m(form.end)) errs.push("The clinic must end after it starts.");
  const sortedBreaks = normBreaks(form.breaks);
  sortedBreaks.forEach((b, i) => {
    if (!okTime(b.start) || !okTime(b.end)) errs.push(`Break ${i + 1}: enter HH:MM times.`);
    else if (m(b.start) >= m(b.end)) errs.push(`Break ${i + 1} must end after it starts.`);
    else if (okTime(form.start) && okTime(form.end) && (m(b.start) < m(form.start) || m(b.end) > m(form.end))) errs.push(`Break ${i + 1} must sit inside the clinic hours.`);
    else if (i > 0 && okTime(sortedBreaks[i - 1].end) && m(b.start) < m(sortedBreaks[i - 1].end)) errs.push(`Breaks ${i} and ${i + 1} overlap.`);
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errs.push("Choose a date.");
  else if (form.date < t) errs.push("A session cannot move into the past.");
  if (form.supportIds.includes(form.nurseId)) errs.push("The nurse cannot also be a support resource.");

  /* the change as a patch */
  const patch: ApplyPatch = {};
  if (form.nurseId !== s.nurseId) patch.nurseId = form.nurseId;
  if (JSON.stringify(form.supportIds.slice().sort()) !== JSON.stringify(s.supportIds.slice().sort())) patch.supportIds = form.supportIds.slice();
  if (form.room !== s.room) patch.room = form.room;
  if (form.date !== s.date) patch.date = form.date;
  if (form.start !== s.start) patch.start = form.start;
  if (form.end !== s.end) patch.end = form.end;
  if (JSON.stringify(sortedBreaks) !== JSON.stringify(normBreaks(s.breaks))) patch.breaks = sortedBreaks;
  const changed = Object.keys(patch).length > 0;

  const pv = errs.length ? null : previewSessionEdit(state, s.id, {
    ...(patch.start ? { start: patch.start } : {}), ...(patch.end ? { end: patch.end } : {}), ...(patch.breaks ? { breaks: patch.breaks } : {}),
    ...(patch.nurseId ? { nurseId: patch.nurseId } : {}), ...(patch.supportIds ? { supportIds: patch.supportIds } : {}), ...(patch.date ? { date: patch.date } : {}),
  });
  const next: ClinicSession = { ...s, ...patch, breaks: patch.breaks || s.breaks, supportIds: patch.supportIds || s.supportIds };
  const conflicts = errs.length ? [] : staffConflicts(state, next);
  const clash = errs.length ? [] : roomClashes(state, next);
  const moves = pv ? impactMoves(state, s.id, pv) : [];
  const dateMoveBlocked = !!patch.date && !!pv && pv.booked > 0;
  const curSlots = sessionSlots(s).length;

  const blockers: string[] = [];
  if (!canManage) blockers.push(`${p.name} (${p.roleLabel}) can view sessions. Edits need the Manage bookings and edit sessions permission (Brenda, Liz or Stephen).`);
  if (!changed) blockers.push("No changes yet.");
  blockers.push(...errs);
  if (conflicts.length) blockers.push("A staff member would be in two clinics at the same time.");
  if (clash.length) blockers.push(`${next.room} is already in use by ${clash.map((c) => c.id).join(", ")} at that time.`);
  if (dateMoveBlocked) blockers.push(`This session has ${plural(pv!.booked, "booking")}, so its date cannot change here. Participants are never moved or deleted silently. Reschedule each one from the day list first.`);
  if (pv && pv.slots.length < pv.booked) blockers.push(`Only ${pv.slots.length} slots would remain for ${pv.booked} bookings.`);
  if (moves.some((x) => !x.to)) blockers.push("There are not enough free valid slots to keep every booking.");
  if (moves.length && !moveOk) blockers.push(`Confirm how the ${plural(moves.length, "impacted appointment")} should be handled.`);
  const canApply = blockers.length === 0;

  const apply = () => {
    const res = dispatch(act.applySession(s.id, patch, moves.length > 0 && moveOk));
    setLastMsg({ ok: res.ok, text: res.message || (res.ok ? "Session updated." : "Not applied.") });
  };

  const setBreak = (i: number, k: "start" | "end", v: string) => setForm({ ...form, breaks: form.breaks.map((b, j) => (j === i ? { ...b, [k]: v } : b)) });
  const disabled = !canManage;

  return (
    <div className="ph-card-flat" style={{ padding: "16px 16px 14px" }}>
      <div className="ph-row-flex" style={{ marginBottom: 12 }}>
        <Icon name="edit" size={15} style={{ color: "var(--accent)" }} />
        <h3 className="ph-h2 ph-grow">Edit session locally</h3>
        {changed ? <Button size="sm" variant="ghost" onClick={() => { setForm(initForm(s)); setMoveOk(false); }}>Reset</Button> : null}
      </div>
      {!canManage ? <div style={{ marginBottom: 12 }}><RestrictedNotice title="View only for this role">{blockers[0]}</RestrictedNotice></div> : null}

      <div className="clx-cq">
        <div className="clx-kv" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <Field label="Nurse (one booked nurse per clinic)">
            <Select value={form.nurseId} disabled={disabled} onChange={(e) => { const id = nurses.find((n) => n.id === e.target.value)?.id; if (id) setForm({ ...form, nurseId: id, supportIds: form.supportIds.filter((x) => x !== id) }); }}>
              {nurses.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </Select>
          </Field>
          <Field label="Room">
            <Select value={form.room} disabled={disabled} onChange={(e) => setForm({ ...form, room: e.target.value })}>
              {rooms.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              {!rooms.some((r) => r.name === form.room) ? <option value={form.room}>{form.room}</option> : null}
            </Select>
          </Field>
          <Field label="Date" help={activeBookings(state, s.id).length ? "A session with bookings keeps its date. The preview lists who would be affected." : undefined}>
            <TextInput type="date" value={form.date} disabled={disabled} min={t} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Starts">
            <TextInput type="time" step={900} value={form.start} disabled={disabled} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label="Ends">
            <TextInput type="time" step={900} value={form.end} disabled={disabled} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
          <Field label="Slot length" help="Set by the appointment type">
            <TextInput value={`${s.slotMinutes} minutes`} disabled readOnly />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="ph-label">Support resources (not booked nurses)</div>
          <div className="ph-wrap" style={{ gap: "6px 16px" }}>
            {supportPool.map((x) => (
              <Checkbox key={x.id} disabled={disabled} checked={form.supportIds.includes(x.id)} label={x.name}
                onChange={(on) => setForm({ ...form, supportIds: on ? form.supportIds.concat(x.id) : form.supportIds.filter((y) => y !== x.id) })} />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="ph-label">Breaks and unavailable times (never bookable)</div>
          <div className="ph-stack" style={{ gap: 6 }}>
            {form.breaks.map((b, i) => (
              <div key={i} className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
                <TextInput type="time" step={300} value={b.start} disabled={disabled} onChange={(e) => setBreak(i, "start", e.target.value)} style={{ width: 120 }} aria-label={`Break ${i + 1} start`} />
                <span className="ph-faint" style={{ fontSize: 12 }}>to</span>
                <TextInput type="time" step={300} value={b.end} disabled={disabled} onChange={(e) => setBreak(i, "end", e.target.value)} style={{ width: 120 }} aria-label={`Break ${i + 1} end`} />
                <Button size="sm" variant="ghost" icon="x" disabled={disabled} onClick={() => setForm({ ...form, breaks: form.breaks.filter((_, j) => j !== i) })}>Remove</Button>
              </div>
            ))}
            <div><Button size="sm" icon="plus" disabled={disabled} onClick={() => setForm({ ...form, breaks: form.breaks.concat({ start: "15:30", end: "15:45" }) })}>Add break</Button></div>
          </div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>Slots are generated around breaks. A session with booked participants is never changed silently: anyone affected is listed first and moved only when you confirm.</div>
        </div>
      </div>

      <SessionPreview session={s} next={errs.length ? null : next} />

      {changed ? (
        <div className="ph-stack" style={{ gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div className="ph-eyebrow">Impact preview</div>
          {pv ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>
                After this change: <strong style={{ color: "var(--ink)" }}>{pv.capacity} bookable slots</strong> (now {curSlots}), {plural(pv.booked, "booking")}.
                {pv.capacity !== curSlots ? ` Capacity ${pv.capacity > curSlots ? "rises" : "falls"} by ${Math.abs(pv.capacity - curSlots)}.` : " Capacity is unchanged."}
              </div>
              <ProposedSlots session={s} next={next} moves={moves} />
              {moves.length ? (
                <div className="clx-banner warn">
                  <Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "var(--ink)" }}>{plural(moves.length, "booked appointment")} would no longer fit. Nothing is deleted.</div>
                    <ul style={{ margin: "6px 0 8px", paddingLeft: 18 }}>
                      {moves.map((x) => (
                        <li key={x.booking.id}>{x.person ? `${x.person.given} ${x.person.family}` : x.booking.personId} ({x.booking.id}): {x.from} {x.to ? `moves to ${x.to}, the first free valid slot` : "has no free valid slot"}</li>
                      ))}
                    </ul>
                    <Checkbox checked={moveOk} disabled={disabled} onChange={setMoveOk} label={moves.length === 1 ? "Move this appointment as shown and send the participant a simulated notice" : `Move these ${moves.length} appointments as shown and send each participant a simulated notice`} />
                  </div>
                </div>
              ) : pv.booked && !dateMoveBlocked ? <div className="ph-faint" style={{ fontSize: 12 }}>Every booked appointment keeps its time.</div> : null}
              {conflicts.map((c) => (
                <div key={c.staffId + c.other.id} className="clx-banner bad">
                  <Icon name="x" size={14} style={{ color: "var(--bad)", marginTop: 2 }} />
                  <span>{staffName(state, c.staffId)} would be the {c.mine} here and is already the {c.theirs} at {c.other.id} ({placeLabel(c.other)}, {c.other.start} to {c.other.end}) on {fmtDate(c.other.date)}. Choose someone else.</span>
                </div>
              ))}
              {clash.map((c) => (
                <div key={"room" + c.id} className="clx-banner bad">
                  <Icon name="x" size={14} style={{ color: "var(--bad)", marginTop: 2 }} />
                  <span>{c.room} is already used by {c.id} ({c.start} to {c.end}) on {fmtDate(c.date)}.</span>
                </div>
              ))}
              {dateMoveBlocked ? (
                <div className="clx-banner bad">
                  <Icon name="lock" size={14} style={{ color: "var(--bad)", marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>Moving this session to {fmtDate(form.date)} would affect every booked participant, so the date change is blocked while bookings exist. Nobody is moved or deleted. Affected appointments:</div>
                    <div className="ph-wrap" style={{ gap: "4px 10px", marginTop: 6 }}>
                      {activeBookings(state, s.id).map((b) => {
                        const person = state.persons.find((x) => x.id === b.personId);
                        return <button key={b.id} type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Clinics", tab: "appointments", params: { booking: b.id } })}>{b.slotStart} {person ? `${person.given} ${person.family}` : b.personId}</button>;
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {errs.length ? <div className="clx-banner bad"><Icon name="alert" size={14} style={{ color: "var(--bad)", marginTop: 2 }} /><span>{errs.join(" ")}</span></div> : null}
          <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 10 }}>
            <Button variant="primary" icon="check" disabled={!canApply} onClick={apply} title={canApply ? "Apply the change shown in the preview" : blockers[0]}>Apply change</Button>
            <span className="ph-faint" style={{ fontSize: 11.5, flex: 1, minWidth: 180 }}>{canApply ? "Applies locally to the demo store and logs an activity event." : blockers[0]}</span>
          </div>
        </div>
      ) : null}
      {lastMsg ? <div className={"clx-banner " + (lastMsg.ok ? "info" : "warn")} style={{ marginTop: 12 }}><Icon name={lastMsg.ok ? "check" : "alert"} size={14} style={{ marginTop: 2, color: lastMsg.ok ? "var(--ok)" : "var(--warn)" }} /><span>{lastMsg.text}</span></div> : null}
    </div>
  );
}

/** The proposed slot layout: kept bookings, moved bookings and free slots. */
function ProposedSlots({ session, next, moves }: { session: ClinicSession; next: ClinicSession; moves: Array<{ booking: { id: string; slotStart: string }; to: string | null }> }) {
  const state = usePhState();
  const slots = sessionSlots(next);
  const kept = new Set(activeBookings(state, session.id).filter((b) => !moves.some((x) => x.booking.id === b.id)).map((b) => b.slotStart));
  const moved = new Set(moves.map((x) => x.to).filter((x): x is string => !!x));
  const start = hhmmToMinutes(next.start);
  const end = hhmmToMinutes(next.end);
  const segs: Array<{ key: string; mins: number; cls: string; title: string }> = [];
  let cursor = start;
  for (const sl of slots) {
    const a = hhmmToMinutes(sl.start);
    if (a > cursor) segs.push({ key: "g" + cursor, mins: a - cursor, cls: "clx-seg-break", title: "Break or gap, not bookable" });
    const isKept = kept.has(sl.start), isMoved = moved.has(sl.start);
    segs.push({ key: sl.start, mins: hhmmToMinutes(sl.end) - a, cls: isMoved ? "clx-seg-active" : isKept ? "clx-seg-booked" : "clx-seg-free", title: `${sl.start}: ${isMoved ? "moved booking" : isKept ? "booking kept" : "free"}` });
    cursor = hhmmToMinutes(sl.end);
  }
  if (end > cursor) segs.push({ key: "end", mins: end - cursor, cls: "clx-seg-break", title: "Gap, not bookable" });
  return (
    <div>
      <div className="clx-tl" aria-label="Proposed slots">
        {segs.map((g) => <span key={g.key} className={"clx-seg " + g.cls} style={{ flexGrow: g.mins }} title={g.title} />)}
      </div>
      <div className="clx-legend" style={{ marginTop: 6 }}>
        <span><span className="clx-swatch clx-seg-booked" />Booking kept</span>
        <span><span className="clx-swatch clx-seg-active" />Booking moved here</span>
        <span><span className="clx-swatch clx-seg-free" />Free</span>
        <span><span className="clx-swatch clx-seg-break" />Not bookable</span>
      </div>
    </div>
  );
}

/** Session preview: what the session offers with the values in the form. */
function SessionPreview({ session, next }: { session: ClinicSession; next: ClinicSession | null }) {
  const state = usePhState();
  const cfg = next || session;
  const slots = sessionSlots(cfg);
  const prog = state.programmes.find((x) => x.id === session.programmeId);
  const tpl = state.forms.templates.find((x) => x.id === prog?.templateId);
  const code = state.invitationCodes.find((c) => c.programmeId === session.programmeId && c.status === "active");
  const rows: Array<[string, string]> = [
    ["Questionnaire and clinical form", tpl ? `${tpl.name} v${tpl.currentVersion} for new bookings. Existing bookings keep their version.` : "To confirm"],
    ["Booking access", code ? `Invitation only, programme roster (${code.code})` : "Invitation only, programme roster"],
    ["Reminder", `${state.settings.reminderLeadHours} hours before (simulated). Inside that window, a confirmation only.`],
  ];
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Session preview{next ? "" : " (current values)"}</div>
      <div className="clx-kv" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 10 }}>
        <div><div className="clx-k">Available time</div><div className="clx-v ph-num" style={{ fontSize: 18, fontWeight: 600 }}>{slots.length * cfg.slotMinutes} <span className="ph-faint" style={{ fontSize: 11.5, fontWeight: 400 }}>minutes</span></div></div>
        <div><div className="clx-k">Capacity</div><div className="clx-v ph-num" style={{ fontSize: 18, fontWeight: 600 }}>{slots.length} <span className="ph-faint" style={{ fontSize: 11.5, fontWeight: 400 }}>appointments</span></div></div>
      </div>
      <div className="clx-qa">
        {rows.map(([k, v]) => [<span key={k + "k"}>{k}</span>, <span key={k + "v"}>{v}</span>])}
      </div>
    </div>
  );
}
