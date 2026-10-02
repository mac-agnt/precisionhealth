/* Participants, Directory: the synthetic roster with separate filters for invited, onboarding,
   upcoming booking and attended. 850 invitees, paginated. Not everyone here is a patient.
   The record drawer shows role-appropriate fields: operations see identity, membership,
   booking and communication status, never clinical content. */
import { useMemo, useState } from "react";
import {
  PROGRAMME_ORDER, canViewEpisodeClinical, directory, fmtDate, fmtNumericDate, fmtShortDateTime, fmtWeekdayDate, ix, personName,
  staffName,
} from "../../model";
import type { DirectoryRow, DirectoryStage, Id, PhState, ProgrammeId } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import {
  Button, Card, CardHeader, DataTable, DemoTag, Drawer, EmptyState, EntityLink, Icon, InfoTip, PageHeader, Pill, RestrictedNotice,
  SearchBox, Select, Stacked,
} from "../../ui";
import type { Column } from "../../ui";
import {
  Facts, FilterChips, KIND_ICON, KIND_LABEL, MessageStatusPill, STAGES, STAGE_BY_ID, SectionTitle, StagePill, StatusPill, clinicalStatus, cmp, holdLine,
  onboardingText, opsStatus, stageDetail, useMeasure, withParams,
} from "./shared";

const STAGE_IDS = STAGES.map((s) => s.id);
const DEMO_CASES: Array<{ id: Id; why: string }> = [
  { id: "PH-P-0001", why: "Routine report review and portal release" },
  { id: "PH-P-0501", why: "Report needing individual clinician review" },
  { id: "PH-P-0002", why: "Laboratory identity exception" },
  { id: "PH-P-0801", why: "Portal onboarding to booking" },
];

/** Accent-insensitive search on name, person ID and email. Exact name or ID matches come first. */
const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function searchRows(rows: DirectoryRow[], q: string): DirectoryRow[] {
  const needle = fold(q.trim());
  if (!needle) return rows;
  const scored: Array<{ r: DirectoryRow; score: number }> = [];
  for (const r of rows) {
    const name = fold(personName(r.person));
    const hay = `${name} ${r.person.id.toLowerCase()} ${fold(r.person.email)}`;
    if (!hay.includes(needle)) continue;
    const words = name.split(" ");
    const score = name === needle || r.person.id.toLowerCase() === needle ? 0 : words.includes(needle) ? 1 : name.startsWith(needle) ? 2 : 3;
    scored.push({ r, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.r);
}

function apptText(state: PhState, r: DirectoryRow): string {
  const I = ix(state);
  if (r.stage === "upcoming" && r.nextBooking) {
    const s = I.sessionById.get(r.nextBooking.sessionId);
    return s ? `${fmtWeekdayDate(s.date)}, ${r.nextBooking.slotStart}` : r.nextWhen;
  }
  if (r.stage === "attended") {
    const ep = I.episodeById.get(r.episodeIds[r.episodeIds.length - 1]);
    const s = ep ? I.sessionById.get(ep.sessionId) : undefined;
    return s ? `Attended ${fmtDate(s.date)}` : "Attended";
  }
  return "Not booked";
}

export default function DirectoryTab() {
  const nav = useNav();
  const state = usePhState();
  const p = usePersona();
  const params = nav.params;
  const stage = (STAGE_IDS.includes(params.stage as DirectoryStage) ? params.stage : "all") as DirectoryStage;
  const programmeId = (PROGRAMME_ORDER as string[]).includes(params.programme) ? (params.programme as ProgrammeId) : "all";
  const [q, setQ] = useState(params.q || "");
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const clinicalViewer = p.perms.has("clinical.view");

  // Counts per stage respect the programme and search filters, so a badge never disagrees with the table.
  const base = useMemo(() => searchRows(directory(state, { programmeId }), q), [state, q, programmeId]);
  const counts = useMemo(() => {
    const c: Record<DirectoryStage, number> = { all: base.length, invited: 0, onboarding: 0, upcoming: 0, attended: 0 };
    base.forEach((r) => c[r.stage]++);
    return c;
  }, [base]);
  const rows = useMemo(() => (stage === "all" ? base : base.filter((r) => r.stage === stage)), [base, stage]);
  const selected = params.person || null;
  const I = ix(state);

  const open = (id: Id) => nav.setParams(withParams(params, { person: id }));
  const setStage = (s: DirectoryStage) => nav.setParams(withParams(params, { stage: s === "all" ? null : s }));
  const setProgramme = (v: string) => nav.setParams(withParams(params, { programme: v === "all" ? null : v }));

  const reportCell = (r: DirectoryRow) => {
    if (!r.episodeIds.length) return <span className="ph-faint">No episode yet</span>;
    const ep = I.episodeById.get(r.episodeIds[r.episodeIds.length - 1]);
    if (!ep) return null;
    return <StatusPill s={clinicalViewer && canViewEpisodeClinical(state, ep.id) ? clinicalStatus(ep) : opsStatus(ep)} />;
  };
  const failedSet = useMemo(() => new Set(state.messages.filter((m) => m.status === "failed").map((m) => m.personId)), [state]);
  const failedFor = (id: Id) => failedSet.has(id);

  const all: Column<DirectoryRow>[] = [
    {
      key: "person", header: "Person", sort: (a, b) => cmp(personName(a.person), personName(b.person)),
      cell: (r) => (
        <div className="pd-person" style={{ maxWidth: 220 }}>
          <span className="pd-person-name">{personName(r.person)}</span>
          <span className="pd-person-id">{r.person.id}</span>
        </div>
      ),
    },
    {
      key: "programme", header: "Programme", sort: (a, b) => cmp(a.programme.name, b.programme.name),
      cell: (r) => (
        <div className="pd-person" style={{ maxWidth: 210 }}>
          <span className="ph-trunc" style={{ color: "var(--body)" }}>{r.programme.name}</span>
          <span className="pd-person-id ph-trunc">{r.person.site}</span>
        </div>
      ),
    },
    {
      key: "status", header: "Status", sort: (a, b) => cmp(STAGE_IDS.indexOf(a.stage), STAGE_IDS.indexOf(b.stage)),
      cell: (r) => (
        <div className="pd-person" style={{ gap: 3, alignItems: "flex-start" }}>
          <StagePill stage={r.stage} />
          <span className="pd-person-id">{r.stage === "onboarding" ? onboardingText(r.membership) : apptText(state, r)}</span>
        </div>
      ),
    },
    { key: "report", header: <span>Report <InfoTip text={clinicalViewer ? "Report workflow state. Hold reasons show on hover." : "Workflow position only. Clinical content is not shown to this role."} /></span>, cell: reportCell },
    {
      key: "contact", header: "Contact",
      cell: (r) => (
        <span className="ph-row-flex" style={{ gap: 6 }}>
          <Icon name={r.membership.contactPreference === "sms" ? "sms" : "mail"} size={13} style={{ color: "var(--faint)" }} />
          {r.membership.contactPreference === "sms" ? "SMS" : "Email"}
          {failedFor(r.person.id) ? <Pill tone="bad" title="A message to this person failed delivery (simulated).">Failed</Pill> : null}
        </span>
      ),
    },
    { key: "open", header: <span className="ph-faint">Record</span>, align: "right", cell: (r) => <Button size="sm" variant="ghost" icon="chevronRight" onClick={(e) => { e.stopPropagation(); open(r.person.id); }} aria-label={`Open ${personName(r.person)}`}>Open</Button> },
  ];
  // Keep the identifier, status and primary action visible as the container narrows.
  const keep = width && width < 600 ? ["person", "status", "open"] : width && width < 760 ? ["person", "programme", "status", "open"] : width && width < 940 ? ["person", "programme", "status", "report", "open"] : null;
  const columns = keep ? all.filter((c) => keep.includes(c.key)) : all;

  const stageOpts = STAGES.map((s) => ({ id: s.id, label: s.label, count: counts[s.id] }));
  const progOpts = PROGRAMME_ORDER.map((id) => ({ id, name: I.programmeById.get(id)?.name || id }));

  return (
    <div className="ph-page">
      <PageHeader
        title="Participant directory"
        sub="Synthetic invitees across the three programme rosters. Invited is not booked, and booked is not attended. Search by name, person ID or email."
        actions={<DemoTag title="Every person here is a fictional demo record.">Fictional people</DemoTag>}
      />
      <div className="ph-stack">
        <Card pad={false}>
          <div className="pd-filters">
            <SearchBox value={q} onChange={setQ} placeholder="Search name, ID or email" width={250} />
            <Select value={programmeId} onChange={(e) => setProgramme(e.target.value)} aria-label="Programme" style={{ width: 220 }}>
              <option value="all">All programmes</option>
              {progOpts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <FilterChips label="Stage" value={stage} options={stageOpts} onChange={setStage} />
          </div>
          <div ref={wrapRef}>
            <Composition state={state} programmeId={programmeId} onStage={setStage} narrow={!!width && width < 720} />
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.person.id}
              onRowClick={(r) => open(r.person.id)}
              selectedKey={selected}
              caption="Participant directory"
              footerNote={<>{stage === "all" ? "invitees" : STAGE_BY_ID[stage].label.toLowerCase()}{programmeId !== "all" ? ` in ${I.programmeById.get(programmeId)?.name}` : ""}{q ? ` matching "${q}"` : ""}</>}
              empty={<EmptyState title="No one matches" icon="search">Try another name, person ID or email, or clear the stage and programme filters.</EmptyState>}
            />
          </div>
        </Card>
        <div className="ph-split-even">
          <ByProgramme state={state} onPick={(pid, s) => nav.setParams(withParams(params, { programme: pid, stage: s === "all" ? null : s }))} />
          <Card>
            <CardHeader title="Demonstration cases" sub="Named fictional people used in the walkthrough." right={<DemoTag>Fictional</DemoTag>} />
            {DEMO_CASES.map((c) => {
              const r = directory(state, { q: c.id })[0];
              if (!r) return null;
              return (
                <button key={c.id} type="button" className="pd-case" onClick={() => open(c.id)}>
                  <span className="ph-grow" style={{ minWidth: 0 }}>
                    <span className="pd-person-name" style={{ display: "block" }}>{personName(r.person)}</span>
                    <span className="ph-faint" style={{ fontSize: 11.5, display: "block" }}>{r.person.id}, {r.programme.clientName}. {clinicalViewer ? c.why : stageDetail(r)}</span>
                  </span>
                  <StagePill stage={r.stage} />
                </button>
              );
            })}
          </Card>
        </div>
      </div>
      {selected ? <PersonDrawer personId={selected} onClose={() => nav.setParams(withParams(params, { person: null }))} /> : null}
    </div>
  );
}

/** Roster arithmetic for the current programme filter: invited = not started + onboarding + booked. */
function Composition({ state, programmeId, onStage, narrow }: { state: PhState; programmeId: ProgrammeId | "all"; onStage: (s: DirectoryStage) => void; narrow: boolean }) {
  const rows = useMemo(() => directory(state, { programmeId }), [state, programmeId]);
  const c = { invited: 0, onboarding: 0, upcoming: 0, attended: 0 };
  rows.forEach((r) => c[r.stage]++);
  const booked = c.upcoming + c.attended;
  return (
    <div className={"pd-composition" + (narrow ? " narrow" : "")}>
      <Stacked total={rows.length} height={10} segments={[
        { label: "Not started", value: c.invited, color: "var(--border-strong)" },
        { label: "Onboarding", value: c.onboarding, color: "#f0c04b" },
        { label: "Upcoming", value: c.upcoming, color: "#97C2BC" },
        { label: "Attended", value: c.attended, color: "var(--accent)" },
      ]} />
      <div className="ph-dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
        <span className="ph-num" style={{ color: "var(--ink)" }}>{rows.length}</span> invited{programmeId === "all" ? "" : ` to ${ix(state).programmeById.get(programmeId)?.clientName}`} ={" "}
        <button type="button" className="ph-link ph-num" onClick={() => onStage("invited")}>{c.invited} not started</button> +{" "}
        <button type="button" className="ph-link ph-num" onClick={() => onStage("onboarding")}>{c.onboarding} onboarding</button> +{" "}
        <span className="ph-num" style={{ color: "var(--ink)" }}>{booked}</span> booked, and booked ={" "}
        <button type="button" className="ph-link ph-num" onClick={() => onStage("upcoming")}>{c.upcoming} upcoming</button> +{" "}
        <span style={{ whiteSpace: "nowrap" }}><button type="button" className="ph-link ph-num" onClick={() => onStage("attended")}>{c.attended} attended</button>.</span>{" "}
        A questionnaire draft is never counted as a booking.
      </div>
    </div>
  );
}

function ByProgramme({ state, onPick }: { state: PhState; onPick: (programmeId: ProgrammeId, stage: DirectoryStage) => void }) {
  const all = useMemo(() => directory(state, {}), [state]);
  const I = ix(state);
  return (
    <Card>
      <CardHeader title="By programme" sub="Select a number to filter the table." />
      <table className="pd-mini-table">
        <thead>
          <tr><th>Programme</th><th>Invited</th><th>Onboarding</th><th>Upcoming</th><th>Attended</th></tr>
        </thead>
        <tbody>
          {PROGRAMME_ORDER.map((pid) => {
            const rs = all.filter((r) => r.person.programmeId === pid);
            const n = (s: DirectoryStage) => rs.filter((r) => s === "all" || r.stage === s).length;
            return (
              <tr key={pid}>
                <td>{I.programmeById.get(pid)?.clientName}</td>
                {(["all", "onboarding", "upcoming", "attended"] as DirectoryStage[]).map((s) => (
                  <td key={s}><button type="button" onClick={() => onPick(pid, s)} aria-label={`${I.programmeById.get(pid)?.clientName}: ${STAGE_BY_ID[s].label}`}>{n(s)}</button></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/* ---- the record drawer ---- */
export function PersonDrawer({ personId, onClose }: { personId: Id; onClose: () => void }) {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const I = ix(state);
  const person = I.personById.get(personId);
  if (!person) {
    return (
      <Drawer open onClose={onClose} title="Unknown person">
        <EmptyState title="No record with this ID" icon="search">{personId} is not on any programme roster in this demo.</EmptyState>
      </Drawer>
    );
  }
  const m = (I.membershipsByPerson.get(personId) || [])[0];
  const prog = I.programmeById.get(person.programmeId)!;
  const code = m ? state.invitationCodes.find((c) => c.id === m.inviteCodeId) : undefined;
  const bookings = (I.bookingsByPerson.get(personId) || []).slice().sort((a, b) => cmp(a.createdAt, b.createdAt));
  const episodes = I.episodesByPerson.get(personId) || [];
  const msgs = state.messages.filter((x) => x.personId === personId).sort((a, b) => cmp(b.at, a.at));
  const row = directory(state, { q: personId })[0];
  const clinicalRole = p.perms.has("clinical.view");
  const name = personName(person);

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={name}
      sub={<>{person.id}, {prog.name}. Synthetic record: name, email and employer are never identity keys.</>}
      footer={
        <>
          <Button icon="user" onClick={() => nav.openPortal(person.id)} title="Opens the separate participant portal preview as this person. The demo acts as the participant while it is open.">Open portal preview</Button>
          {episodes.length ? <Button icon="layers" onClick={() => nav.go({ page: "Participants", tab: "screening-history", params: { person: person.id } })}>Screening history</Button> : null}
          <Button icon="mail" onClick={() => nav.go({ page: "Participants", tab: "communications", params: { person: person.id } })}>Messages</Button>
        </>
      }
    >
      <div className="ph-wrap" style={{ marginBottom: 16 }}>
        {row ? <StagePill stage={row.stage} /> : null}
        {row ? <span className="ph-dim" style={{ fontSize: 12 }}>{row.stage === "attended" ? apptText(state, row) : stageDetail(row)}</span> : null}
        <DemoTag>Fictional</DemoTag>
      </div>

      <section className="pd-sec">
        <SectionTitle>Identity</SectionTitle>
        <Facts rows={[
          ["Person ID", <span className="ph-mono">{person.id}</span>],
          ["Date of birth", fmtNumericDate(person.dob)],
          ["Email", person.email],
          ["Mobile", <span className="ph-num">{person.phone}</span>],
          ["Identity checks", "Two identifiers, such as date of birth and booking reference. A name match alone is never enough."],
        ]} />
      </section>

      <section className="pd-sec">
        <SectionTitle>Programme membership</SectionTitle>
        <Facts rows={[
          ["Programme", <EntityLink kind="programme" id={prog.id}>{prog.name}</EntityLink>],
          ["Site", person.site],
          ["Invitation code", code ? <><span className="ph-mono">{code.code}</span> <span className="ph-faint">({code.label})</span></> : "None"],
          m ? ["Invited", fmtDate(m.invitedAt)] : null,
          m ? ["Eligibility", m.eligible ? "Eligible: on the programme roster" : "Not eligible"] : null,
          m ? ["Questionnaire", m.questionnaire === "complete" ? "Complete" : m.questionnaire === "draft" ? onboardingText(m) : "Not started"] : null,
          m ? ["Consent", m.consent === "complete" ? `Complete (${m.consentVersion})` : "Not given yet"] : null,
        ]} />
      </section>

      <section className="pd-sec">
        <SectionTitle>Bookings</SectionTitle>
        {bookings.length ? (
          <div className="ph-stack" style={{ gap: 8, fontSize: 12.5 }}>
            {bookings.map((b) => {
              const s = I.sessionById.get(b.sessionId)!;
              const status = b.status === "cancelled" ? (b.replacedBy ? `Rescheduled to ${b.replacedBy}` : `Cancelled${b.cancelReason ? `: ${b.cancelReason}` : ""}`) : b.attendance === "completed" ? "Attended" : b.attendance === "booked" ? "Confirmed" : b.attendance.replace("_", " ");
              return (
                <div key={b.id} className="ph-card-flat" style={{ padding: "10px 12px" }}>
                  <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: "4px 10px" }}>
                    <EntityLink kind="booking" id={b.id} />
                    <span className="ph-grow ph-dim" style={{ fontSize: 12 }}>{fmtWeekdayDate(s.date)}, {b.slotStart}</span>
                    <Pill tone={b.status === "cancelled" ? "neutral" : b.attendance === "completed" ? "ok" : "brand"} icon={b.status === "cancelled" ? "x" : b.attendance === "completed" ? "check" : "calendar"}>{status}</Pill>
                  </div>
                  <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4 }}>{s.siteName}. Booked via {b.createdVia} on {fmtDate(b.createdAt)}. Form {b.formVersion}, consent {b.consentVersion}.</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ph-dim" style={{ fontSize: 12.5 }}>No booking. {m?.stage === "onboarding" ? "A questionnaire in progress is not a booking." : "Not started yet."}</div>
        )}
      </section>

      <section className="pd-sec">
        <SectionTitle right={<DemoTag>Simulated</DemoTag>}>Communication</SectionTitle>
        <Facts rows={[
          ["Contact preference", m ? (m.contactPreference === "sms" ? "SMS" : "Email") : "Not recorded"],
          ["Verified destination", m ? (m.contactPreference === "sms" ? person.phone : person.email.replace(/^(.)[^@]*/, "$1***")) : "None"],
        ]} />
        {msgs.length ? (
          <div className="ph-stack" style={{ gap: 6, marginTop: 10 }}>
            {msgs.slice(0, 5).map((x) => (
              <div key={x.id} className="ph-row-flex" style={{ fontSize: 12, gap: 8 }}>
                <Icon name={KIND_ICON[x.kind]} size={13} style={{ color: "var(--faint)" }} />
                <span className="ph-grow ph-trunc"><EntityLink kind="message" id={x.id}>{KIND_LABEL[x.kind]}</EntityLink> <span className="ph-faint">{fmtShortDateTime(x.at)}, {x.channel === "sms" ? "SMS" : "email"}</span></span>
                <MessageStatusPill status={x.status} />
              </div>
            ))}
            {msgs.length > 5 ? <div className="ph-faint" style={{ fontSize: 11.5 }}>{msgs.length - 5} older messages in Communications.</div> : null}
          </div>
        ) : <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 8 }}>No messages sent.</div>}
      </section>

      <section className="pd-sec">
        <SectionTitle>Screening episodes</SectionTitle>
        {!episodes.length ? (
          <div className="ph-dim" style={{ fontSize: 12.5 }}>No screening episode. An episode is created only when an appointment is completed.</div>
        ) : (
          <div className="ph-stack" style={{ gap: 8, fontSize: 12.5 }}>
            {episodes.map((ep) => {
              const s = I.sessionById.get(ep.sessionId)!;
              const canSee = canViewEpisodeClinical(state, ep.id);
              const versions = state.reportVersions.filter((v) => v.episodeId === ep.id && (v.status === "released" || v.status === "superseded"));
              return (
                <div key={ep.id} className="ph-card-flat" style={{ padding: "10px 12px" }}>
                  <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: "4px 10px" }}>
                    {canSee ? <EntityLink kind="episode" id={ep.id} /> : <span className="ph-dim">Screening episode</span>}
                    <span className="ph-grow ph-faint" style={{ fontSize: 12 }}>{I.programmeById.get(ep.programmeId)?.clientName}, attended {fmtDate(s.date)}</span>
                    <StatusPill s={canSee ? clinicalStatus(ep) : opsStatus(ep)} />
                  </div>
                  {canSee ? (
                    <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                      {ep.reportState === "on_hold" ? `${holdLine(ep)}. ` : ""}Form {ep.formSnapshot.version}. Reviewer {staffName(state, ep.reviewAssigneeId || "neil")}.
                      {versions.length ? ` Report versions: ${versions.map((v) => `v${v.version} ${v.status}`).join(", ")}.` : " No released report yet."}
                      {ep.followUpIds.length ? ` Follow-up: ${ep.followUpIds.join(", ")}.` : ""}
                    </div>
                  ) : (
                    <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                      {versions.length ? `Report released ${fmtDate(versions[versions.length - 1].releasedAt || versions[versions.length - 1].createdAt)}.` : "Report not released yet."}
                    </div>
                  )}
                </div>
              );
            })}
            {!clinicalRole ? (
              <RestrictedNotice title="Clinical content not shown for this role">
                {p.name} ({p.roleLabel}) sees workflow position only. Results, flags, advice, report content and follow-up detail are limited to clinical roles.
              </RestrictedNotice>
            ) : episodes.some((ep) => !canViewEpisodeClinical(state, ep.id)) ? (
              <RestrictedNotice title="Limited to your assigned sessions">
                {p.name} ({p.roleLabel}) sees clinical content only for sessions they were assigned to.
              </RestrictedNotice>
            ) : null}
          </div>
        )}
      </section>
    </Drawer>
  );
}
