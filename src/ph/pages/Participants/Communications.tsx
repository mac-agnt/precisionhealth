/* Participants, Communications: one timeline of confirmations, reminders, report-availability
   notices and invitations, with delivery exceptions and an explicit retry. Logical reminders
   and provider attempts are counted separately. A delivery receipt is not report access.
   All delivery is simulated (Esendex SMS and Email). Nothing is ever sent. */
import { useMemo, useState } from "react";
import {
  INTEGRATIONS, SERVICE_CONTACT_ROUTE, act, canViewEpisodeClinical, failedReminders, fmtDateTime, fmtShortDateTime, fmtTime, fmtWeekdayDate, ix,
  messagesSorted, personName, reminderStats, storyView,
} from "../../model";
import type { Id, Message } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePersona, usePhState } from "../../store";
import {
  Button, Card, CardHeader, Chip, DataTable, DemoTag, Drawer, EmptyState, EntityLink, Icon, Kpi, KpiStrip, PageHeader, Pill, SearchBox, Stacked,
} from "../../ui";
import type { Column } from "../../ui";
import {
  COMMS_FILTERS, attemptText, cohortByProgramme, isCommsFilter, lastFailureReason, matchesFilter, messageCounts, messagePreview, retriedReminders,
  shortNoticeBookings, versionForMessage,
} from "./comms";
import type { CommsFilter } from "./comms";
import { Facts, FilterChips, KIND_ICON, KIND_LABEL, MessageStatusPill, SectionTitle, cmp, useMeasure, withParams } from "./shared";

const channelText = (m: Message) => (m.channel === "sms" ? "SMS via Esendex" : "Email");

export default function CommunicationsTab() {
  const nav = useNav();
  const state = usePhState();
  const p = usePersona();
  const params = nav.params;
  const I = ix(state);
  const [q, setQ] = useState(params.q || "");
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const filter: CommsFilter = isCommsFilter(params.filter) ? params.filter : "all";
  const personId = params.person && I.personById.has(params.person) ? params.person : null;

  const all = messagesSorted(state);
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((m) => {
      if (personId && m.personId !== personId) return false;
      if (!needle) return true;
      return `${personName(I.personById.get(m.personId))} ${m.personId} ${m.id} ${m.subject} ${m.destination} ${m.bookingId || ""}`.toLowerCase().includes(needle);
    });
  }, [all, personId, q, I]);
  const counts = useMemo(() => messageCounts(state, searched), [state, searched]);
  const rows = useMemo(() => searched.filter((m) => matchesFilter(state, m, filter)), [state, searched, filter]);

  const r = reminderStats(state);
  const story = storyView(state, "ST-05");
  const failed = failedReminders(state);
  const retried = retriedReminders(state);
  const shortNotice = shortNoticeBookings(state);
  const openMsg = (id: Id) => nav.setParams(withParams(params, { message: id }));
  const setFilter = (f: CommsFilter) => nav.setParams(withParams(params, { filter: f === "all" ? null : f }));

  const allCols: Column<Message>[] = [
    { key: "sent", header: "Sent", sort: (a, b) => cmp(a.at, b.at), cell: (m) => <span className="ph-num">{fmtShortDateTime(m.at)}</span> },
    { key: "person", header: "Person", sort: (a, b) => cmp(personName(I.personById.get(a.personId)), personName(I.personById.get(b.personId))), cell: (m) => <div className="pd-person" style={{ maxWidth: 180 }}><span className="pd-person-name">{personName(I.personById.get(m.personId))}</span><span className="pd-person-id">{m.personId}</span></div> },
    {
      key: "message", header: "Message", sort: (a, b) => cmp(a.kind, b.kind),
      cell: (m) => (
        <div className="pd-person" style={{ maxWidth: 270 }}>
          <span className="ph-row-flex" style={{ gap: 6, color: "var(--ink)" }}><Icon name={KIND_ICON[m.kind]} size={12} style={{ color: "var(--faint)" }} />{KIND_LABEL[m.kind]}</span>
          <span className="pd-person-id ph-trunc" title={m.subject}>{m.subject}</span>
        </div>
      ),
    },
    { key: "channel", header: "Channel", cell: (m) => <div className="pd-person"><span>{channelText(m)}</span><span className="pd-person-id">{m.destination}</span></div> },
    { key: "status", header: "Status", sort: (a, b) => cmp(a.status, b.status), cell: (m) => <MessageStatusPill status={m.status} /> },
    { key: "attempts", header: "Attempts", align: "right", sort: (a, b) => a.attempts.length - b.attempts.length, cell: (m) => <span className="ph-num" title="Provider attempts. Counted separately from logical messages.">{m.attempts.length}</span> },
  ];
  const keep = width && width < 540 ? ["sent", "person", "status"] : width && width < 700 ? ["sent", "person", "message", "status"] : width && width < 880 ? ["sent", "person", "message", "status", "attempts"] : null;
  const columns = keep ? allCols.filter((c) => keep.includes(c.key)) : allCols;
  const due = story.dueAt ? fmtTime(story.dueAt) : "";

  return (
    <div className="ph-page">
      <PageHeader
        title="Communications"
        sub="Confirmations, reminders, report-availability notices and invitations in one timeline. Subjects and previews never carry clinical details. Delivery is simulated: nothing is sent."
        actions={<DemoTag title="Esendex SMS and Email delivery are simulated in this demo.">Simulated delivery</DemoTag>}
      />
      <div className="ph-stack">
        <KpiStrip>
          <Kpi label="Today's reminders" value={r.logical} icon="clock" sub={`Logical reminders for confirmed appointments on ${fmtWeekdayDate(r.cohort)}`} hint="One logical reminder per confirmed appointment, however many provider attempts it took." onClick={() => setFilter("reminders")} />
          <Kpi label="Delivered" value={r.delivered} tone="ok" sub={`of ${r.logical} logical reminders`} onClick={() => setFilter("reminders")} />
          <Kpi label="Failed" value={r.failed} tone={r.failed ? "bad" : "ok"} sub={r.failed ? `${story.ownerName} reviews by ${due}` : "None outstanding"} onClick={() => setFilter("failed")} />
          <Kpi label="Provider attempts" value={r.attempts} icon="refresh" sub={`${r.autoRetries} automatic and ${r.manualRetries} manual retries. Not logical reminders.`} hint="Provider attempts are counted separately from the logical reminder cohort." />
          <Kpi label="Booked inside 24 hours" value={shortNotice.length} icon="calendar" sub="Today: one confirmation each, no back-dated reminder" hint="Bookings made after the reminder run get one confirmation. No reminder is fabricated." />
        </KpiStrip>

        <div className="ph-split">
          <div className="ph-stack">
            <Card>
              <CardHeader
                title="Delivery exceptions"
                sub={failed.length ? `${failed.length} of ${r.logical} logical reminders failed. Each keeps its own reason and verified destination. Owner ${story.ownerName}${due ? `, review by ${due}` : ""}.` : `All ${r.logical} logical reminders delivered.`}
                right={<DemoTag>Simulated</DemoTag>}
              />
              {failed.length || retried.length ? (
                <div className="pd-exceptions">
                  {failed.map((m) => <ExceptionCard key={m.id} m={m} onOpen={() => openMsg(m.id)} />)}
                  {retried.map((m) => <ExceptionCard key={m.id} m={m} onOpen={() => openMsg(m.id)} />)}
                </div>
              ) : (
                <EmptyState title="No delivery exceptions" icon="check">Every reminder in today's cohort was delivered at the first attempt.</EmptyState>
              )}
            </Card>

            <Card pad={false}>
              <div className="pd-filters">
                <SearchBox value={q} onChange={setQ} placeholder="Search person, ID, subject or destination" width={280} />
                {personId ? <Chip on onClick={() => nav.setParams(withParams(params, { person: null }))}>{personName(I.personById.get(personId))} <Icon name="x" size={11} /></Chip> : null}
                <FilterChips label="Message type" value={filter} onChange={setFilter} options={COMMS_FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }))} />
              </div>
              <div ref={wrapRef}>
                <DataTable
                  rows={rows}
                  columns={columns}
                  rowKey={(m) => m.id}
                  onRowClick={(m) => openMsg(m.id)}
                  selectedKey={params.message || null}
                  caption="Messages"
                  footerNote={<>messages. Each row is one logical message.</>}
                  empty={
                    <EmptyState title={filter === "invitation" ? "No invitations sent" : "No messages match"} icon="mail">
                      {filter === "invitation" ? "Invitation sends need approval first. The IBM list is awaiting a decision in Work, Approvals." : "Clear the search or choose another message type."}
                    </EmptyState>
                  }
                />
              </div>
            </Card>
          </div>

          <div className="ph-stack">
            <CohortCard />
            <Card>
              <CardHeader title="Rules this screen follows" />
              <ul className="ph-dim" style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 4 }}>
                <li>Clinical details never appear in a subject or preview.</li>
                <li>A retry adds a provider attempt. It never creates a second logical reminder.</li>
                <li>A delivery receipt is not report access. Report access is recorded when the participant opens the report.</li>
                <li>Bookings made inside 24 hours get one confirmation. No reminder is back-dated.</li>
                <li>Messages go only to the verified destination on record. Booking counts never change on retry.</li>
              </ul>
            </Card>
            <Card>
              <CardHeader title="Channels" sub="Statuses are explicitly simulated or unconfirmed." />
              {INTEGRATIONS.filter((x) => x.id === "esendex" || x.id === "email").map((x) => (
                <div key={x.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <span className="ph-h2" style={{ fontSize: 13 }}>{x.name}</span>
                  <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 6, marginTop: 4, fontSize: 11.5, color: x.tone === "warn" ? "var(--warn)" : "var(--accent)" }}>
                    <Icon name={x.tone === "warn" ? "alert" : "info"} size={12} style={{ marginTop: 2 }} />
                    <span>{x.statusLabel}</span>
                  </div>
                  <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>{x.note}</div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
      {params.message ? <MessageDrawer id={params.message} onClose={() => nav.setParams(withParams(params, { message: null }))} /> : null}
    </div>
  );
}

function RetryButton({ m, size }: { m: Message; size?: "sm" }) {
  const p = usePersona();
  const allowed = p.perms.has("bookings.manage");
  if (m.kind !== "reminder" || m.status !== "failed") return null;
  return (
    <Button
      size={size}
      variant="primary"
      icon="refresh"
      disabled={!allowed}
      title={allowed ? "Simulate one more delivery attempt to the verified destination." : `Retrying is an operations action. ${p.name} (${p.roleLabel}) can view delivery but cannot retry.`}
      onClick={() => dispatch(act.retryReminder(m.id))}
    >
      Retry delivery
    </Button>
  );
}

function ExceptionCard({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const state = usePhState();
  const p = usePersona();
  const I = ix(state);
  const person = I.personById.get(m.personId);
  const b = m.bookingId ? I.bookingById.get(m.bookingId) : undefined;
  const s = b ? I.sessionById.get(b.sessionId) : undefined;
  const isFailed = m.status === "failed";
  const allowed = p.perms.has("bookings.manage");
  return (
    <div className={"pd-exception" + (isFailed ? " failed" : "")}>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 8 }}>
        <div className="ph-grow">
          <EntityLink kind="person" id={m.personId}>{personName(person)}</EntityLink>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 2 }}>{m.personId}, {b ? I.programmeById.get(b.programmeId)?.clientName : ""}</div>
        </div>
        {isFailed ? <MessageStatusPill status="failed" /> : <Pill tone="ok" icon="refresh">Retried, delivered</Pill>}
      </div>
      <Facts rows={[
        ["Appointment", b && s ? <><EntityLink kind="booking" id={b.id} /> {fmtWeekdayDate(s.date)}, {b.slotStart}</> : "None"],
        ["Channel", `${channelText(m)} (simulated)`],
        ["Verified destination", <span className="ph-row-flex" style={{ gap: 5 }}><Icon name="check" size={12} style={{ color: "var(--ok)" }} /><span className="ph-num">{m.destination}</span></span>],
        [isFailed ? "Failure reason" : "Earlier failure", lastFailureReason(m) || "None"],
        ["Attempts", (
          <ul className="pd-attempts">
            {m.attempts.map((a, i) => (
              <li key={i}>
                <Icon name={a.outcome === "delivered" ? "check" : "x"} size={12} stroke={2} style={{ color: a.outcome === "delivered" ? "var(--ok)" : "var(--bad)", marginTop: 2 }} />
                <span><span className="ph-num">{fmtShortDateTime(a.at)}</span>. {attemptText(m, i)}</span>
              </li>
            ))}
          </ul>
        )],
      ]} />
      {isFailed ? (
        <div className="pd-callout" style={{ marginTop: 10 }}>
          <Icon name="phone" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
          <span><strong style={{ color: "var(--ink)", fontWeight: 600 }}>Permitted service-contact route.</strong> {SERVICE_CONTACT_ROUTE[m.channel]}</span>
        </div>
      ) : null}
      <div className="ph-wrap" style={{ marginTop: 12 }}>
        <RetryButton m={m} size="sm" />
        <Button size="sm" variant="ghost" icon="eye" onClick={onOpen}>View message</Button>
      </div>
      {isFailed && !allowed ? <div className="ph-help">Retrying is an operations action. {p.name} ({p.roleLabel}) can view delivery but cannot retry.</div> : null}
    </div>
  );
}

function CohortCard() {
  const state = usePhState();
  const r = reminderStats(state);
  const rows = cohortByProgramme(state);
  return (
    <Card>
      <CardHeader title="Today's reminder cohort" sub={`${r.logical} logical reminders, sent 24 hours before each clinic`} />
      <Stacked total={r.logical} segments={[
        { label: "Delivered", value: r.delivered, color: "var(--accent)" },
        { label: "Failed", value: r.failed, color: "var(--bad)" },
        ...(r.queued ? [{ label: "Queued", value: r.queued, color: "var(--border-strong)" }] : []),
      ]} />
      <table className="pd-mini-table" style={{ marginTop: 12 }}>
        <thead><tr><th>Clinic today</th><th>Logical</th><th>Delivered</th><th>Failed</th></tr></thead>
        <tbody>
          {rows.filter((x) => x.logical > 0).map((x) => (
            <tr key={x.id}><td>{x.code}</td><td>{x.logical}</td><td>{x.delivered}</td><td style={x.failed ? { color: "var(--bad)" } : undefined}>{x.failed}</td></tr>
          ))}
          <tr><td style={{ color: "var(--ink)" }}>Total</td><td style={{ color: "var(--ink)" }}>{r.logical}</td><td style={{ color: "var(--ink)" }}>{r.delivered}</td><td style={{ color: "var(--ink)" }}>{r.failed}</td></tr>
        </tbody>
      </table>
      <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.45 }}>
        {r.attempts} provider attempts in total, counted separately. Retrying a reminder changes delivered and failed once and leaves the {r.logical} logical reminders and every booking count unchanged.
      </div>
    </Card>
  );
}

function MessageDrawer({ id, onClose }: { id: Id; onClose: () => void }) {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const I = ix(state);
  const m = state.messages.find((x) => x.id === id);
  if (!m) {
    return (
      <Drawer open onClose={onClose} title="Unknown message">
        <EmptyState title="No message with this ID" icon="mail">{id} is not in the simulated message log.</EmptyState>
      </Drawer>
    );
  }
  const person = I.personById.get(m.personId);
  const mem = (I.membershipsByPerson.get(m.personId) || [])[0];
  const b = m.bookingId ? I.bookingById.get(m.bookingId) : undefined;
  const s = b ? I.sessionById.get(b.sessionId) : undefined;
  const v = versionForMessage(state, m);
  const sameLogical = state.messages.filter((x) => x.logicalId === m.logicalId).length;
  const consentSms = mem ? (mem.answers.consentSms ?? (mem.draft ? mem.draft.answers.consentSms : undefined)) : undefined;
  return (
    <Drawer
      open
      onClose={onClose}
      width={580}
      title={m.subject}
      sub={<>{m.id}, {KIND_LABEL[m.kind].toLowerCase()} to {personName(person)}. Simulated: nothing was sent.</>}
      footer={
        <>
          <RetryButton m={m} />
          <Button icon="user" onClick={() => nav.go({ page: "Participants", tab: "directory", params: { person: m.personId } })}>Person record</Button>
        </>
      }
    >
      <div className="ph-wrap" style={{ marginBottom: 14 }}>
        <MessageStatusPill status={m.status} />
        <Pill tone="neutral" icon={m.channel === "sms" ? "sms" : "mail"}>{channelText(m)}</Pill>
        <DemoTag>Simulated</DemoTag>
      </div>

      <section className="pd-sec">
        <SectionTitle>Preview</SectionTitle>
        <div className="pd-preview">{messagePreview(state, m)}</div>
        <div className="ph-help">Logistics only. Clinical details never appear in a subject or preview.</div>
      </section>

      <section className="pd-sec">
        <SectionTitle>Delivery</SectionTitle>
        <Facts rows={[
          ["Person", <EntityLink kind="person" id={m.personId}>{personName(person)} ({m.personId})</EntityLink>],
          ["Logical message", <><span className="ph-mono">{m.logicalId}</span><span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{sameLogical === 1 ? "One logical message, however many provider attempts." : `${sameLogical} records share this logical ID.`}</span></>],
          ["Channel and provider", `${channelText(m)}, simulated`],
          ["Verified destination", <span className="ph-num">{m.destination}</span>],
          ["Sent", fmtDateTime(m.at)],
          m.cohort ? ["Cohort", `Reminders for ${fmtWeekdayDate(m.cohort)}`] : null,
          b && s ? ["Appointment", <><EntityLink kind="booking" id={b.id} /> {fmtWeekdayDate(s.date)}, {b.slotStart}, {s.siteName}{b.status === "cancelled" ? " (since cancelled)" : ""}</>] : null,
          [m.status === "failed" ? "Failure reason" : "Earlier failure", lastFailureReason(m) || "None"],
        ]} />
      </section>

      <section className="pd-sec">
        <SectionTitle>Attempt history</SectionTitle>
        <ul className="pd-attempts">
          {m.attempts.map((a, i) => (
            <li key={i}>
              <Icon name={a.outcome === "delivered" ? "check" : "x"} size={12} stroke={2} style={{ color: a.outcome === "delivered" ? "var(--ok)" : "var(--bad)", marginTop: 2 }} />
              <span><span className="ph-num">{fmtDateTime(a.at)}</span>. {attemptText(m, i)}</span>
            </li>
          ))}
        </ul>
        {m.status === "failed" ? (
          <div className="pd-callout" style={{ marginTop: 12 }}>
            <Icon name="phone" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
            <span><strong style={{ color: "var(--ink)", fontWeight: 600 }}>Permitted service-contact route.</strong> {SERVICE_CONTACT_ROUTE[m.channel]}</span>
          </div>
        ) : null}
      </section>

      {m.kind === "report_available" ? (
        <section className="pd-sec">
          <SectionTitle>Report access</SectionTitle>
          <Facts rows={[
            ["Report version", v ? (m.episodeId && canViewEpisodeClinical(state, m.episodeId) ? <EntityLink kind="report" id={v.id}>{v.id}</EntityLink> : <span className="ph-mono">{v.id}</span>) : "Not found"],
            ["Delivery receipt", m.status === "delivered" ? `Delivered ${fmtDateTime(m.attempts[m.attempts.length - 1].at)} (simulated)` : "Not delivered"],
            ["Opened in the portal", v?.accessedAt ? fmtDateTime(v.accessedAt) : "Not opened yet"],
          ]} />
          <div className="ph-help">A delivery receipt is separate from report access. Access is recorded only when the participant opens the report in the portal.</div>
        </section>
      ) : null}

      <section className="pd-sec">
        <SectionTitle>Contact preferences</SectionTitle>
        <Facts rows={[
          ["Current preference", mem ? (mem.contactPreference === "sms" ? "SMS" : "Email") : "Not recorded"],
          ["SMS consent", consentSms === true ? "Given" : consentSms === false ? "Not given" : mem?.consent === "complete" ? `Covered by booking consent ${mem.consentVersion || "BC-3"}, which names Esendex` : "No consent given yet"],
          ["Note", "A message uses the preference at the time it is sent. Changing the preference does not resend anything."],
        ]} />
      </section>
      {m.kind === "reminder" && m.status === "failed" && !p.perms.has("bookings.manage") ? (
        <div className="ph-help" style={{ marginTop: 14 }}>Retrying is an operations action. {p.name} ({p.roleLabel}) can view delivery but cannot retry.</div>
      ) : null}
    </Drawer>
  );
}
