/* Clinics, Bookings board: Stephen's Monday "Bookings Pending 2026" board with every column he
   showed (client, date, proposals, screening type, status, start time, staff onsite, staff email,
   service, blood code, address, Eircode, parking, room, contact on the day and phone, attendance
   and screening links). Pulse clinic sessions and board-only bookings sit side by side, grouped by
   status as on Monday. Status changes in place; Edit opens every column; Day brief shows the
   nurse day brief for one day and one nurse, field for field, to print or send.
   Deep links: #/Clinics/board, #/Clinics/board?brief=board:BRD-0004, #/Clinics/board?edit=board:BRD-0003 */
import { useMemo, useState } from "react";
import { BOARD_SCREENING_TYPES, act, BOARD_STATUSES, boardBrief, boardNeedsBloodCode, boardRows, boardStaffEmails, fmtDate, fmtWeekdayDate, isPocScreening, staffName, today } from "../../model";
import type { BoardRow, BoardScreeningType, BoardStatus, StaffId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, DataTable, DemoTag, Drawer, EmptyState, Field, Icon, Kpi, KpiStrip, Modal, PageHeader, Pill, SearchBox, Segmented, Select, TextInput } from "../../ui";
import type { Column, Tone } from "../../ui";
import { Portal } from "./shared";
import { opsAct } from "./opsActions";
import type { BoardPatch } from "./opsActions";
import "./board.css";

type When = "upcoming" | "past" | "all";
const STATUS_TONE: Record<BoardStatus, Tone> = { "Ready to go": "ok", "Working on it": "warn", Information: "info", "Quote in progress": "neutral" };

function copy(text: string) {
  try { void navigator.clipboard?.writeText(text); } catch { /* clipboard may be blocked; the toast still says what the link is */ }
  dispatch(act.toast("info", `Copied ${text} (demo link)`));
}

export function dateSummary(r: BoardRow): string {
  if (r.dates.length === 1) return fmtWeekdayDate(r.dates[0]);
  return `${r.dates.length} days, ${r.nextDate ? `next ${fmtWeekdayDate(r.nextDate)}` : `last ${fmtWeekdayDate(r.dates[r.dates.length - 1])}`}`;
}

export default function Board() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const t = today(state);
  const manage = !p.isParticipant && p.perms.has("bookings.manage");
  const rows = useMemo(() => boardRows(state, t), [state, t]);
  const [when, setWhen] = useState<When>("upcoming");
  const [status, setStatus] = useState<BoardStatus | "all">("all");
  const [q, setQ] = useState("");
  const find = (key: string | undefined) => (key ? rows.find((r) => r.key === key) || null : null);
  const briefRow = find(nav.params.brief);
  const editRow = find(nav.params.edit);
  const open = (k: "brief" | "edit", r: BoardRow) => nav.setParams({ [k]: r.key });
  const close = () => nav.setParams({});

  const timed = rows.filter((r) => (when === "all" ? true : when === "upcoming" ? !!r.nextDate : !r.nextDate));
  const query = q.trim().toLowerCase();
  const shown = timed.filter((r) => (status === "all" || r.logistics.status === status)
    && (!query || `${r.client} ${r.logistics.service} ${r.logistics.screeningType} ${r.logistics.eircode || ""} ${r.logistics.contactName || ""} ${r.id}`.toLowerCase().includes(query)));
  const upcoming = rows.filter((r) => r.nextDate);
  const attention = upcoming.filter((r) => r.flags.length);
  const briefsDue = upcoming.filter((r) => r.flags.some((f) => f.key === "brief"));

  return (
    <div className="ph-page brd">
      <PageHeader title="Bookings board" eyebrow="Bookings Pending 2026"
        sub="Every booking with the columns from the Monday board, grouped by status. Change the status here, fill in what is missing, and print or send the nurse day brief. Contacts, addresses and Eircodes are fictional."
        actions={<DemoTag>Sample data</DemoTag>} />
      <div className="ph-stack">
        {!manage ? <div className="brd-note"><Icon name="lock" size={14} />{p.name} can view the board. Stephen, Liz and Brenda change it and send briefs. Switch role from the persona menu to try it.</div> : null}
        <KpiStrip>
          <Kpi label="Upcoming bookings" value={upcoming.length} sub={`${upcoming.filter((r) => r.logistics.status === "Ready to go").length} ready to go`} icon="calendar" onClick={() => { setWhen("upcoming"); setStatus("all"); }} />
          <Kpi label="Working on it" value={upcoming.filter((r) => r.logistics.status === "Working on it").length} sub="Still being arranged" tone="warn" onClick={() => { setWhen("upcoming"); setStatus("Working on it"); }} />
          <Kpi label="Needs something" value={attention.length} sub="Missing nurse, blood code, contact or address" tone={attention.length ? "warn" : "ok"} icon="alert" onClick={() => { setWhen("upcoming"); setStatus("all"); setQ(""); }} />
          <Kpi label="Briefs to send" value={briefsDue.length} sub="Days in the next 4 days without a brief" icon="send" />
        </KpiStrip>
        <div className="brd-filters">
          <Segmented label="When" value={when} onChange={setWhen} options={[{ id: "upcoming", label: "Upcoming", count: upcoming.length }, { id: "past", label: "Done", count: rows.length - upcoming.length }, { id: "all", label: "All", count: rows.length }]} />
          <div className="ph-wrap" style={{ gap: 6 }}>
            <Chip on={status === "all"} onClick={() => setStatus("all")}>Every status</Chip>
            {BOARD_STATUSES.map((s) => <Chip key={s} on={status === s} onClick={() => setStatus(status === s ? "all" : s)} count={timed.filter((r) => r.logistics.status === s).length}>{s}</Chip>)}
          </div>
          <span className="ph-grow" />
          <SearchBox value={q} onChange={setQ} placeholder="Client, Eircode, contact" width={240} />
        </div>
        {BOARD_STATUSES.filter((s) => status === "all" || status === s).map((s) => {
          const group = shown.filter((r) => r.logistics.status === s);
          if (!group.length) return null;
          return (
            <Card key={s} pad={false}>
              <div className="brd-group"><Pill tone={STATUS_TONE[s]}>{s}</Pill><span className="ph-dim">{group.length} booking{group.length === 1 ? "" : "s"}</span></div>
              <BoardTable rows={group} manage={manage} onBrief={(r) => open("brief", r)} onEdit={(r) => open("edit", r)} />
            </Card>
          );
        })}
        {!shown.length ? <Card pad={false}><EmptyState title="No bookings match">Try another status or clear the search.</EmptyState></Card> : null}
      </div>
      {briefRow ? <BriefModal row={briefRow} manage={manage} onClose={close} /> : null}
      {editRow ? <EditDrawer row={editRow} manage={manage} onClose={close} /> : null}
    </div>
  );
}

function BoardTable({ rows, manage, onBrief, onEdit }: { rows: BoardRow[]; manage: boolean; onBrief: (r: BoardRow) => void; onEdit: (r: BoardRow) => void }) {
  const state = usePhState();
  const L = (r: BoardRow) => r.logistics;
  const miss = (text: string) => <span className="brd-miss">{text}</span>;
  const cols: Column<BoardRow>[] = [
    { key: "client", header: "Client", nowrap: false, cell: (r) => (
      <div className="brd-cell" style={{ minWidth: 200, maxWidth: 240 }}>
        <div className="brd-strong">{r.client} <span className="ph-faint ph-mono" style={{ fontSize: 10.5 }}>{r.id}</span></div>
        <div className="brd-sub">{L(r).service}</div>
        {r.flags.length ? <div className="brd-flags">{r.flags.map((f) => <span key={f.key} className="brd-flag"><Icon name="alert" size={11} />{f.text}</span>)}</div> : null}
        <div className="brd-rowact">
          <Button size="sm" icon="print" onClick={() => onBrief(r)}>Day brief</Button>
          <Button size="sm" variant="ghost" icon={manage ? "edit" : "eye"} onClick={() => onEdit(r)}>{manage ? "Edit" : "Open"}</Button>
        </div>
      </div>) },
    { key: "status", header: "Status", cell: (r) => manage ? (
      <Select aria-label={`Status for ${r.client}`} value={L(r).status} onChange={(e) => dispatch(opsAct.setBoardStatus(r.kind, r.id, e.target.value as BoardStatus))} style={{ width: 140 }}>
        {BOARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>) : <Pill tone={STATUS_TONE[L(r).status]}>{L(r).status}</Pill> },
    { key: "date", header: "Date and start", nowrap: false, cell: (r) => (
      <div className="brd-cell" style={{ minWidth: 150 }}>
        <div>{dateSummary(r)}</div>
        <div className="brd-sub">{r.start ? `${r.start}${r.end ? ` to ${r.end}` : ""}` : miss("Start time to confirm")}</div>
        <div className="brd-sub">Room: {r.room || "to confirm"}</div>
      </div>) },
    { key: "type", header: "Screening type", nowrap: false, cell: (r) => (
      <div className="brd-cell" style={{ minWidth: 150 }}>
        <div>{L(r).screeningType}</div>
        <div className="brd-sub">{isPocScreening(L(r).screeningType) ? "Point of care, no lab" : boardNeedsBloodCode(L(r).screeningType) ? (L(r).bloodCode ? <>Blood code <span className="ph-mono">{L(r).bloodCode}</span></> : miss("Blood code missing")) : "No bloods"}</div>
      </div>) },
    { key: "staff", header: "Staff onsite", nowrap: false, cell: (r) => (
      <div className="brd-cell" style={{ minWidth: 170 }}>
        {r.staffIds.length ? <div>{r.staffIds.map((id) => staffName(state, id)).join(", ")}</div> : miss("No nurse assigned")}
        <div className="brd-sub brd-break">{boardStaffEmails(state, r.staffIds, L(r)).join(", ") || "No staff email"}</div>
      </div>) },
    { key: "where", header: "Address and parking", nowrap: false, cell: (r) => (
      <div className="brd-cell" style={{ minWidth: 210, maxWidth: 260 }}>
        <div>{L(r).address || miss("Address to confirm")}</div>
        <div className="brd-sub">Eircode {L(r).eircode ? <span className="ph-mono">{L(r).eircode}</span> : miss("missing")}</div>
        <div className="brd-sub">{L(r).parking || "Parking to confirm"}</div>
      </div>) },
    { key: "contact", header: "Contact on the day", nowrap: false, cell: (r) => (
      <div className="brd-cell" style={{ minWidth: 140 }}>
        <div>{L(r).contactName || miss("No contact")}</div>
        <div className="brd-sub">{L(r).contactPhone || (L(r).contactName ? miss("No phone") : "")}</div>
      </div>) },
    { key: "links", header: "Links", cell: (r) => (
      <div className="brd-links">
        {L(r).attendanceLink ? <button type="button" onClick={() => copy(L(r).attendanceLink!)} title="Live attendance table. Do not print."><Icon name="list" size={12} />Attendance</button> : null}
        {L(r).screeningLink ? <button type="button" onClick={() => copy(L(r).screeningLink!)} title={isPocScreening(L(r).screeningType) ? "POC Screen with QRISK form" : "Comprehensive (LAB) nurse form"}><Icon name="file" size={12} />Screening form</button> : null}
        {L(r).proposalsLink ? <button type="button" onClick={() => copy(L(r).proposalsLink!)} title="The proposal for this client"><Icon name="link" size={12} />Proposal</button> : null}
      </div>) },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.key} minWidth={1240} caption="Bookings board" pageSize={50} />;
}

/* ---------------------------------------------------------------- nurse day brief */

export function BriefModal({ row, manage, onClose }: { row: BoardRow; manage: boolean; onClose: () => void }) {
  const state = usePhState();
  const t = today(state);
  const dates = row.dates.filter((d) => d >= t);
  const choices = dates.length ? dates : row.dates;
  const [date, setDate] = useState(row.nextDate || choices[0]);
  const [staffId, setStaffId] = useState<StaffId | "">(row.staffIds[0] || "");
  const brief = boardBrief(state, row, date, (staffId || row.staffIds[0] || "") as StaffId);
  const sent = state.nurseOps.briefs.find((b) => b.status === "scheduled" && b.target.kind === row.kind && b.target.id === row.id && b.target.date === date && b.staffId === staffId);
  const past = date < t;
  const missing = brief.lines.filter((l) => l.missing);
  const body = (
    <div className="brd-brief">
      <div className="brd-brief-subject">{brief.subject}</div>
      <p>{staffId ? brief.intro : "You are booked to carry out Health Screening for:"}</p>
      <dl>{brief.lines.map((l) => (
        <div key={l.key} className={l.missing ? "miss" : undefined}><dt>{l.label}</dt><dd>{l.value}{l.note ? <span> ({l.note})</span> : null}</dd></div>
      ))}</dl>
      <ul>{brief.rules.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
  return (
    <Modal open onClose={onClose} title={`Nurse day brief: ${row.client}`} width={680}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button icon="print" onClick={() => window.print()} title="Opens the print dialog with just this brief">Print day brief</Button>
        {manage ? (sent ? <Pill tone="ok" icon="check">Sent to {staffName(state, sent.staffId)}</Pill>
          : <Button variant="primary" icon="send" disabled={!staffId || past} title={past ? "That day has passed" : !staffId ? "Assign a nurse first" : undefined}
            onClick={() => dispatch(opsAct.sendBrief(row.kind, row.id, date, staffId as StaffId, brief.subject))}>Send to {staffId ? staffName(state, staffId).split(" ")[0] : "nurse"}</Button>) : null}
      </>}>
      <div className="ph-stack" style={{ gap: 12 }}>
        <div className="brd-brief-pick">
          {choices.length > 1 ? <Field label="Day"><Select value={date} onChange={(e) => setDate(e.target.value)}>{choices.map((d) => <option key={d} value={d}>{fmtWeekdayDate(d)}</option>)}</Select></Field> : <Field label="Day"><div className="brd-static">{fmtWeekdayDate(date)}</div></Field>}
          <Field label="Nurse">{row.staffIds.length ? <Select value={staffId} onChange={(e) => setStaffId(e.target.value as StaffId)}>{row.staffIds.map((id) => <option key={id} value={id}>{staffName(state, id)}</option>)}</Select> : <div className="brd-static brd-miss">No nurse assigned yet</div>}</Field>
        </div>
        {missing.length ? <div className="brd-note warn"><Icon name="alert" size={14} />{missing.length} line{missing.length === 1 ? "" : "s"} say "To confirm": {missing.map((l) => l.label.toLowerCase()).join(", ")}. {manage ? "Fill them in with Edit before sending." : ""}</div> : null}
        {body}
        <div className="ph-faint" style={{ fontSize: 11.5 }}>Sent by email and WhatsApp at 18:00 the evening before. <DemoTag>Simulated</DemoTag> {row.briefs.length ? `Briefs sent for this booking: ${row.briefs.map((b) => `${staffName(state, b.staffId).split(" ")[0]} for ${fmtDate(b.target.date)}`).join(", ")}.` : "No brief sent for this booking yet."}</div>
      </div>
      <Portal><div className="ph-printable ph-print-only brd-print"><h1>Precision Health: nurse day brief</h1>{body}</div></Portal>
    </Modal>
  );
}

/* ---------------------------------------------------------------- edit every column */

function EditDrawer({ row, manage, onClose }: { row: BoardRow; manage: boolean; onClose: () => void }) {
  const state = usePhState();
  const L = row.logistics;
  const [f, setF] = useState({
    screeningType: L.screeningType, service: L.service, bloodCode: L.bloodCode || "", start: row.start || "", room: row.room || "", address: L.address || "", eircode: L.eircode || "",
    parking: L.parking || "", contactName: L.contactName || "", contactPhone: L.contactPhone || "", staffEmail: L.staffEmail || "", attendanceLink: L.attendanceLink || "",
    screeningLink: L.screeningLink || "", proposalsLink: L.proposalsLink || "", accommodation: L.accommodation || "",
  });
  const [staffIds, setStaffIds] = useState<StaffId[]>(row.staffIds);
  const toggleStaff = (id: StaffId) => setStaffIds(staffIds.includes(id) ? staffIds.filter((x) => x !== id) : [...staffIds, id]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const patch: BoardPatch = { ...f, screeningType: f.screeningType as BoardScreeningType };
    if (row.kind === "session") delete patch.start;
    else patch.staffIds = staffIds;
    const r = dispatch(opsAct.updateBoardRow(row.kind, row.id, patch));
    if (r.ok) onClose();
  };
  const derived = (row.kind === "session" ? row.staffIds : staffIds).map((id) => state.staff.find((s) => s.id === id)?.email).filter(Boolean).join(", ");
  const blood = boardNeedsBloodCode(f.screeningType as BoardScreeningType);
  return (
    <Drawer open onClose={onClose} width={620} title={`${row.client}, ${dateSummary(row)}`}
      sub={<>{row.kind === "session" ? "Pulse clinic session" : "Board booking"} {row.id}. {row.note}</>}
      footer={manage ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Save</Button></> : <Button onClick={onClose}>Close</Button>}>
      <fieldset disabled={!manage} className="brd-form">
        <div className="brd-section">The day</div>
        <Field label="Screening type"><Select value={f.screeningType} onChange={set("screeningType")}>{BOARD_SCREENING_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Service"><TextInput value={f.service} onChange={set("service")} /></Field>
        <Field label="Blood code" help={blood ? "Written on the blood form so the lab runs this client's tests." : "Not needed: no lab bloods on this screen."}><TextInput value={f.bloodCode} onChange={set("bloodCode")} placeholder={blood ? "For example PH-SISK26" : ""} invalid={blood && !f.bloodCode.trim()} /></Field>
        <Field label="Start time" help={row.kind === "session" ? "Change session times on Clinics, Schedule so appointments move with them." : undefined}><TextInput value={f.start} onChange={set("start")} disabled={row.kind === "session"} placeholder="09:30" /></Field>
        <Field label="Room name"><TextInput value={f.room} onChange={set("room")} /></Field>
        <div className="brd-section">Where</div>
        <Field label="Client address"><TextInput value={f.address} onChange={set("address")} /></Field>
        <Field label="Eircode"><TextInput value={f.eircode} onChange={set("eircode")} placeholder="D02 XW64" /></Field>
        <Field label="Parking"><TextInput value={f.parking} onChange={set("parking")} /></Field>
        <div className="brd-section">People</div>
        <Field label="Contact on the day"><TextInput value={f.contactName} onChange={set("contactName")} /></Field>
        <Field label="Contact's phone"><TextInput value={f.contactPhone} onChange={set("contactPhone")} /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Staff onsite" help={row.kind === "session" ? "Change who is onsite for a clinic session on Clinics, Schedule." : "Tap to add or remove."}>
          {row.kind === "session" ? <div className="brd-static">{row.staffIds.map((id) => staffName(state, id)).join(", ")}</div>
            : <div className="ph-wrap" style={{ gap: 6, paddingTop: 4 }}>{state.staff.filter((x) => ["nursing_lead", "clinical_capture", "wellness_support", "clinical_review"].includes(x.role)).map((x) => <Chip key={x.id} on={staffIds.includes(x.id)} onClick={() => manage && toggleStaff(x.id)}>{x.name}</Chip>)}</div>}
        </Field></div>
        <Field label="Staff email" help={derived ? `Leave blank to use ${derived}.` : "For a rota or agency nurse without a Pulse login."}><TextInput value={f.staffEmail} onChange={set("staffEmail")} placeholder={derived || "name@example.com"} /></Field>
        <div className="brd-section">Links and accommodation</div>
        <Field label="Attendance link"><TextInput value={f.attendanceLink} onChange={set("attendanceLink")} /></Field>
        <Field label="Screening link"><TextInput value={f.screeningLink} onChange={set("screeningLink")} /></Field>
        <Field label="Proposal"><TextInput value={f.proposalsLink} onChange={set("proposalsLink")} /></Field>
        <Field label="Accommodation" help="Filled in when a hotel is booked from End of day, Hotel requests."><TextInput value={f.accommodation} onChange={set("accommodation")} placeholder="Not booked" /></Field>
      </fieldset>
    </Drawer>
  );
}
