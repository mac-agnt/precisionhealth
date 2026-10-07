/* Portal admin, Accounts: every invitee's portal account, derived from their records. Status is
   Not invited, Invited, Registered, MFA enrolled or Locked, and the statuses always add up to the
   roster. The row drawer holds the audited account actions. Report columns show dates only:
   never a result value, so operations staff can run accounts without clinical access. */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ACCOUNT_STATUS_HELP, ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_ORDER, ACCESS_KIND_LABEL, ASSISTED_METHOD_LABEL, DELIVERY_MODE_LABEL, PROGRAMME_ORDER,
  accessLog, accountRow, accountRows, accountStatusCounts, fmtDate, fmtShortDateTime, fmtWeekdayDate, ix, personName, portalAct, portalContent, staffName,
} from "../../model";
import type { AccountRow, AssistedMethod, Id, PhState, PortalAccountStatus, ProgrammeId } from "../../model";
import { useNav } from "../../nav-context";
import { usePersona, usePhState } from "../../store";
import {
  Button, Card, Checkbox, DataTable, DemoTag, Drawer, EmptyState, Field, Icon, Kpi, KpiStrip, Pill, RestrictedNotice, SearchBox, Select, TextInput,
} from "../../ui";
import type { Column, GlyphName } from "../../ui";
import { Facts, FilterChips, SectionTitle, cmp, useMeasure, withParams } from "./shared";
import { AccountStatusPill, ActionPanel, Note, ReasonField, runAction } from "./PortalAdminParts";

type StatusFilter = "all" | PortalAccountStatus | "withdrawn" | "needs_mfa";
const STATUS_FILTERS: StatusFilter[] = ["all", ...ACCOUNT_STATUS_ORDER, "withdrawn"];
const isStatusFilter = (v: string | undefined): v is StatusFilter => !!v && (STATUS_FILTERS as string[]).includes(v);
const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function bookingText(r: AccountRow): ReactNode {
  if (r.booking.kind === "none" || !r.booking.date) return <span className="ph-faint">Not booked</span>;
  if (r.booking.kind === "attended") return <span>Attended {fmtDate(r.booking.date)}</span>;
  return <span>{fmtWeekdayDate(r.booking.date)}, {r.booking.time}</span>;
}
function questionnaireText(r: AccountRow): string {
  if (r.questionnaire === "complete") return "Complete";
  if (r.questionnaire === "draft") return `${r.sectionsDone} of ${r.sectionsTotal} sections`;
  return "Not started";
}
function ReleasedCell({ r }: { r: AccountRow }) {
  if (r.report.releasedAt) return <Pill tone="ok" icon="check" title="Release date only. Report content is never shown here.">Released {fmtDate(r.report.releasedAt)}</Pill>;
  if (r.booking.kind === "attended") return <span className="ph-faint">Not released</span>;
  return <span className="ph-faint">No screening yet</span>;
}
function ViewedCell({ r }: { r: AccountRow }) {
  if (!r.report.releasedAt && !r.report.viewedAt) return <span className="ph-faint">n/a</span>;
  return r.report.viewedAt
    ? <span title="Opened in the portal. Recorded separately from the report-available message."><Icon name="eye" size={12} style={{ color: "var(--ok)", verticalAlign: "-2px", marginRight: 4 }} />Yes, {fmtDate(r.report.viewedAt)}</span>
    : <span className="ph-dim">No</span>;
}

export default function AccountsView() {
  const nav = useNav();
  const state = usePhState();
  const params = nav.params;
  const [q, setQ] = useState(params.q || "");
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const programmeId = (PROGRAMME_ORDER as string[]).includes(params.programme) ? (params.programme as ProgrammeId) : "all";
  const status: StatusFilter = isStatusFilter(params.status) ? params.status : "all";
  const I = ix(state);

  const all = accountRows(state);
  const base = useMemo(() => {
    const needle = fold(q.trim());
    return all.filter((r) => {
      if (programmeId !== "all" && r.programme.id !== programmeId) return false;
      if (!needle) return true;
      return fold(`${personName(r.person)} ${r.person.id} ${r.person.email}`).includes(needle);
    });
  }, [all, programmeId, q]);
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: base.length, not_invited: 0, invited: 0, registered: 0, mfa_enrolled: 0, locked: 0, withdrawn: 0, needs_mfa: 0 };
    base.forEach((r) => { c[r.status]++; if (r.withdrawn) c.withdrawn++; });
    return c;
  }, [base]);
  const rows = useMemo(() => (status === "all" ? base : status === "withdrawn" ? base.filter((r) => r.withdrawn) : base.filter((r) => r.status === status)), [base, status]);
  const totals = accountStatusCounts(state, programmeId);
  const setStatus = (s: StatusFilter) => nav.setParams(withParams(params, { status: s === "all" ? null : s }));
  const open = (id: Id) => nav.setParams(withParams(params, { person: id }));

  const cols: Column<AccountRow>[] = [
    { key: "person", header: "Person", sort: (a, b) => cmp(personName(a.person), personName(b.person)),
      cell: (r) => <div className="pd-person" style={{ maxWidth: 200 }}><span className="pd-person-name">{personName(r.person)}</span><span className="pd-person-id">{r.person.id}</span></div> },
    { key: "programme", header: "Programme", sort: (a, b) => cmp(a.programme.clientName, b.programme.clientName),
      cell: (r) => <div className="pd-person" style={{ maxWidth: 170 }}><span className="ph-trunc">{r.programme.clientName}</span><span className="pd-person-id ph-trunc">{r.person.site}</span></div> },
    { key: "status", header: "Account", sort: (a, b) => cmp(ACCOUNT_STATUS_ORDER.indexOf(a.status), ACCOUNT_STATUS_ORDER.indexOf(b.status)),
      cell: (r) => (
        <div className="pd-person" style={{ gap: 3, alignItems: "flex-start", maxWidth: 240 }}>
          <span className="ph-wrap" style={{ gap: 4 }}><AccountStatusPill status={r.status} />{r.withdrawn ? <Pill tone="neutral" icon="x">Withdrawn</Pill> : null}</span>
          <span className="pd-person-id ph-trunc" title={r.statusDetail} style={{ maxWidth: 240 }}>{r.statusDetail}</span>
        </div>
      ) },
    { key: "consent", header: "Consent", sort: (a, b) => cmp(a.consentVersion || "", b.consentVersion || ""),
      cell: (r) => r.consentVersion ? <span title={`Consent form ${r.consentVersion}, privacy notice ${r.privacyVersion}`}>{r.consentVersion} <span className="ph-faint">· {r.privacyVersion}</span></span> : <span className="ph-faint">Not yet</span> },
    { key: "questionnaire", header: "Questionnaire", sort: (a, b) => a.sectionsDone - b.sectionsDone, cell: (r) => <span className={r.questionnaire === "complete" ? undefined : "ph-dim"}>{questionnaireText(r)}</span> },
    { key: "booking", header: "Booking", sort: (a, b) => cmp((a.booking.date || "") + (a.booking.time || ""), (b.booking.date || "") + (b.booking.time || "")), cell: bookingText },
    { key: "released", header: "Report released", sort: (a, b) => cmp(a.report.releasedAt || "", b.report.releasedAt || ""), cell: (r) => <ReleasedCell r={r} /> },
    { key: "viewed", header: "Viewed", sort: (a, b) => cmp(a.report.viewedAt || "", b.report.viewedAt || ""), cell: (r) => <ViewedCell r={r} /> },
    { key: "open", header: <span className="ph-faint">Account</span>, align: "right", cell: (r) => <Button size="sm" variant="ghost" icon="chevronRight" onClick={(e) => { e.stopPropagation(); open(r.person.id); }} aria-label={`Open the portal account of ${personName(r.person)}`}>Open</Button> },
  ];
  const keep = width && width < 560 ? ["person", "status", "open"] : width && width < 760 ? ["person", "status", "booking", "open"] : width && width < 1000 ? ["person", "status", "consent", "booking", "released", "open"] : width && width < 1180 ? ["person", "programme", "status", "consent", "booking", "released", "viewed", "open"] : null;
  const columns = keep ? cols.filter((c) => keep.includes(c.key)) : cols;
  const label = (s: StatusFilter) => (s === "all" ? "All" : s === "withdrawn" ? "Withdrawn" : s === "needs_mfa" ? "Needs MFA" : ACCOUNT_STATUS_LABEL[s]);
  const kpi = (s: PortalAccountStatus, icon: GlyphName, sub: string, tone?: "ok" | "warn" | "bad" | "info") => (
    <Kpi key={s} label={ACCOUNT_STATUS_LABEL[s]} value={totals[s]} icon={icon} tone={tone} sub={sub} hint={ACCOUNT_STATUS_HELP[s]} onClick={() => setStatus(s)} />
  );

  return (
    <div className="ph-stack">
      <KpiStrip>
        {kpi("not_invited", "mail", "No usable code or link")}
        {kpi("invited", "send", "Code or link sent, no account")}
        {kpi("registered", "user", "Account, second factor to set up", totals.registered ? "warn" : undefined)}
        {kpi("mfa_enrolled", "shield", "Account with a second factor", "ok")}
        {kpi("locked", "lock", totals.locked ? "Sign-in blocked until unlocked" : "No locked accounts", totals.locked ? "bad" : undefined)}
      </KpiStrip>
      <div className="pa-sum ph-dim">
        <span className="ph-num" style={{ color: "var(--ink)" }}>{totals.total}</span> invitees{programmeId === "all" ? " on the three rosters" : ` on ${I.programmeById.get(programmeId)?.name}`} ={" "}
        {ACCOUNT_STATUS_ORDER.map((s, i) => (
          <span key={s}>{i ? " + " : ""}<button type="button" className="ph-link ph-num" onClick={() => setStatus(s)}>{totals[s]} {ACCOUNT_STATUS_LABEL[s].toLowerCase()}</button></span>
        ))}
        . Worked out from each person's invitation, questionnaire, consent, bookings and portal sign-in record, so it always matches the directory.
      </div>
      <Card pad={false}>
        <div className="pd-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, ID or email" width={240} />
          <Select value={programmeId} onChange={(e) => nav.setParams(withParams(params, { programme: e.target.value === "all" ? null : e.target.value }))} aria-label="Programme" style={{ width: 210 }}>
            <option value="all">All programmes</option>
            {PROGRAMME_ORDER.map((id) => <option key={id} value={id}>{I.programmeById.get(id)?.name}</option>)}
          </Select>
          <FilterChips label="Account status" value={status} onChange={setStatus} options={STATUS_FILTERS.map((s) => ({ id: s, label: label(s), count: counts[s] }))} />
        </div>
        <div ref={wrapRef}>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.person.id}
            onRowClick={(r) => open(r.person.id)}
            selectedKey={params.person || null}
            caption="Participant portal accounts"
            initialSort={{ key: "status", dir: -1 }}
            footerNote={<>portal accounts{status === "all" ? "" : `, ${label(status).toLowerCase()}`}{programmeId !== "all" ? ` in ${I.programmeById.get(programmeId)?.clientName}` : ""}{q ? ` matching "${q}"` : ""}.</>}
            empty={<EmptyState title={status === "not_invited" ? "Everyone has a usable invitation" : "No accounts match"} icon={status === "not_invited" ? "check" : "search"}>{status === "not_invited" ? "Every person shown has an active programme code or a personal link. Revoking a code in Programmes, Invitations moves people here until they get a new link." : "Try another name, person ID or email, or clear the filters."}</EmptyState>}
          />
        </div>
      </Card>
      {params.person ? <AccountDrawer personId={params.person} onClose={() => nav.setParams(withParams(params, { person: null }))} /> : null}
    </div>
  );
}

type ActionId = "resend" | "reset" | "lock" | "unlock" | "assisted" | "contact" | "preview" | "withdraw";

/* ---- the account drawer ---- */
export function AccountDrawer({ personId, onClose }: { personId: Id; onClose: () => void }) {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const row = accountRow(state, personId);
  const [open, setOpen] = useState<ActionId | null>(null);
  if (!row) {
    return (
      <Drawer open onClose={onClose} title="Unknown person">
        <EmptyState title="No portal account with this ID" icon="search">{personId} is not on any programme roster in this demo.</EmptyState>
      </Drawer>
    );
  }
  const r = row.record;
  const name = personName(row.person);
  const canAdmin = p.perms.has("portal.admin");
  const content = portalContent(state, row.programme.id);
  const code = row.membership.inviteCodeId ? state.invitationCodes.find((x) => x.id === row.membership.inviteCodeId) : undefined;
  const history = accessLog(state).filter((x) => x.personId === personId).slice(0, 8);
  const hasAccount = row.status === "registered" || row.status === "mfa_enrolled" || row.status === "locked";
  const previewBlocked = !!row.report.releasedAt && !p.perms.has("clinical.view");

  const actions: Array<{ id: ActionId; label: string; icon: GlyphName; off: string | null; danger?: boolean }> = [
    { id: "resend", label: "Resend invitation", icon: "send", off: row.withdrawn ? "Withdrawn from the programme." : hasAccount ? "Already has an account." : null },
    { id: "reset", label: "Reset sign-in and MFA", icon: "refresh", off: hasAccount ? null : "No account to reset yet." },
    row.status === "locked"
      ? { id: "unlock", label: "Unlock account", icon: "lock", off: null }
      : { id: "lock", label: "Lock account", icon: "lock", off: null, danger: true },
    { id: "assisted", label: "Assisted onboarding", icon: "phone", off: row.withdrawn ? "Withdrawn from the programme." : hasAccount ? "Already has an account." : null },
    { id: "contact", label: "Update contact details", icon: "edit", off: null },
    { id: "preview", label: "Preview as participant", icon: "eye", off: previewBlocked ? "Has a released report with clinical values. A clinical role does this preview." : null },
    { id: "withdraw", label: "Withdraw from programme", icon: "x", off: row.withdrawn ? "Already withdrawn." : null, danger: true },
  ];

  return (
    <Drawer open onClose={onClose} width={620} title={name}
      sub={<>{row.person.id}, {row.programme.name}, {row.person.site}. Portal account derived from the participant's own records.</>}>
      <div className="ph-wrap" style={{ marginBottom: 14 }}>
        <AccountStatusPill status={row.status} />
        {row.withdrawn ? <Pill tone="neutral" icon="x">Withdrawn</Pill> : null}
        {r.assisted ? <Pill tone="info" icon="phone">Assisted onboarding</Pill> : null}
        <DemoTag>Fictional</DemoTag>
      </div>
      <p className="ph-dim" style={{ fontSize: 12.5, margin: "0 0 16px", lineHeight: 1.5 }}>{row.statusDetail}</p>

      <section className="pd-sec">
        <SectionTitle>Account and sign-in</SectionTitle>
        <Facts rows={[
          ["Status", <>{ACCOUNT_STATUS_LABEL[row.status]}<span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{ACCOUNT_STATUS_HELP[row.status]}</span></>],
          ["Programme code", code ? <><span className="ph-mono">{code.code}</span> <span className="ph-faint">({code.status === "active" ? `active to ${fmtDate(code.expiresOn)}` : code.status})</span>, sent {fmtDate(row.membership.invitedAt)}</> : "None"],
          r.personalInvite ? ["Personal link", <><span className="ph-mono">{r.personalInvite.code}</span>, sent {fmtShortDateTime(r.personalInvite.sentAt)} by {staffName(state, r.personalInvite.by)}, valid to {fmtDate(r.personalInvite.expiresOn)}</>] : null,
          ["Last portal activity", row.lastActivityAt ? fmtShortDateTime(row.lastActivityAt) : "None recorded"],
          r.failedSignIns ? ["Failed sign-ins", `${r.failedSignIns} since the last successful sign-in`] : null,
          r.mfaReset ? ["MFA reset", <>{fmtShortDateTime(r.mfaReset.at)} by {staffName(state, r.mfaReset.by)}: {r.mfaReset.reason}{r.mfaReenrolledAt && r.mfaReenrolledAt > r.mfaReset.at ? `. Set up again ${fmtShortDateTime(r.mfaReenrolledAt)}.` : ". Not set up again yet."}</>] : null,
          r.lock ? ["Locked", <>{fmtShortDateTime(r.lock.at)} by {r.lock.by === "system" ? "the sign-in service" : staffName(state, r.lock.by)}: {r.lock.reason}</>] : null,
          r.assisted ? ["Assisted onboarding", <>{ASSISTED_METHOD_LABEL[r.assisted.method]}, {fmtShortDateTime(r.assisted.at)} by {staffName(state, r.assisted.by)}: {r.assisted.reason}</>] : null,
          r.withdrawn ? ["Withdrawn", <>{fmtShortDateTime(r.withdrawn.at)} by {staffName(state, r.withdrawn.by)}: {r.withdrawn.reason}{r.withdrawn.cancelledBookingIds.length ? `. Cancelled ${r.withdrawn.cancelledBookingIds.join(", ")}.` : ""}</>] : null,
        ]} />
      </section>

      <section className="pd-sec">
        <SectionTitle right={<span className="ph-faint" style={{ fontSize: 11 }}>Dates only, never a result</span>}>Portal journey</SectionTitle>
        <Facts rows={[
          ["Consent accepted", row.consentVersion ? `Consent form ${row.consentVersion}, privacy notice ${row.privacyVersion}${row.membership.questionnaireCompletedAt ? `, ${fmtDate(row.membership.questionnaireCompletedAt)}` : ""}` : "Not yet"],
          ["Questionnaire", questionnaireText(row)],
          ["Booking", row.booking.kind === "none" ? "Not booked" : <>{bookingText(row)} <span className="ph-faint">({row.booking.bookingId})</span></>],
          ["Report released", row.report.releasedAt ? `Yes, ${fmtDate(row.report.releasedAt)} (${row.report.versionLabel})` : "No"],
          ["Report viewed", row.report.viewedAt ? `Yes, ${fmtShortDateTime(row.report.viewedAt)}` : row.report.releasedAt ? "No, not opened in the portal yet" : "n/a"],
          ["Report delivery", `${DELIVERY_MODE_LABEL[r.reportDelivery || content.reportDelivery]}${r.reportDelivery ? " (participant's choice)" : " (programme default)"}`],
        ]} />
      </section>

      <section className="pd-sec">
        <SectionTitle right={<DemoTag>Synthetic</DemoTag>}>Contact</SectionTitle>
        <Facts rows={[
          ["Email", row.person.email],
          ["Mobile", <span className="ph-num">{row.person.phone}</span>],
          ["Preference", row.membership.contactPreference === "sms" ? "SMS" : "Email"],
          r.contactUpdatedAt ? ["Last changed", fmtShortDateTime(r.contactUpdatedAt)] : null,
        ]} />
      </section>

      <section className="pd-sec">
        <SectionTitle>Account actions</SectionTitle>
        {!canAdmin ? (
          <RestrictedNotice title="View only for this role">
            {p.name} ({p.roleLabel}) can see portal accounts but not change them. Account actions belong to operations, programme oversight and the medical director.
          </RestrictedNotice>
        ) : (
          <>
            <div className="pa-actions">
              {actions.map((x) => (
                <Button key={x.id} size="sm" icon={x.icon} variant={open === x.id ? "primary" : "secondary"} disabled={!!x.off} title={x.off || undefined}
                  aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>{x.label}</Button>
              ))}
            </div>
            {open ? <ActionBody key={open} id={open} row={row} onClose={() => setOpen(null)} onPreview={() => nav.openPortal(personId)} /> : null}
            {actions.some((x) => x.off) ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8 }}>Unavailable now: {actions.filter((x) => x.off).map((x) => `${x.label} (${x.off!.replace(/\.$/, "").toLowerCase()})`).join("; ")}.</div> : null}
          </>
        )}
      </section>

      <section className="pd-sec">
        <SectionTitle>Account history</SectionTitle>
        {history.length ? (
          <ul className="pa-history">
            {history.map((h) => (
              <li key={h.id}>
                <span className="pa-history-when ph-num">{fmtShortDateTime(h.at)}</span>
                <span><strong>{ACCESS_KIND_LABEL[h.kind]}</strong> <span className="ph-dim">by {h.actor}.</span> {h.text}</span>
              </li>
            ))}
          </ul>
        ) : <div className="ph-dim" style={{ fontSize: 12.5 }}>No portal activity recorded.</div>}
        <div style={{ marginTop: 8 }}><Button size="sm" variant="ghost" icon="list" onClick={() => nav.setParams({ view: "log", q: personId })}>Open in the access log</Button></div>
      </section>
    </Drawer>
  );
}

function ActionBody({ id, row, onClose, onPreview }: { id: ActionId; row: AccountRow; onClose: () => void; onPreview: () => void }) {
  const state = usePhState();
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<AssistedMethod>("phone");
  const [email, setEmail] = useState(row.person.email);
  const [mobile, setMobile] = useState("");
  const [verified, setVerified] = useState(false);
  const name = personName(row.person);
  const pid = row.person.id;
  const content = portalContent(state, row.programme.id);
  switch (id) {
    case "resend": {
      const contact = row.membership.contactPreference === "sms" ? `SMS to ${row.person.phone}` : `email to ${row.person.email.replace(/^(.)[^@]*/, "$1***")}`;
      return (
        <ActionPanel title="Resend invitation" confirmLabel="Send personal link (simulated)" onClose={onClose} onConfirm={() => runAction(portalAct.resendInvitation(pid))}>
          <p>Sends {name} a personal invitation link by {contact}, valid for 14 days, using the invitation template. It works even if the programme code was revoked. Simulated: nothing is sent.</p>
        </ActionPanel>
      );
    }
    case "reset":
      return (
        <ActionPanel title="Reset sign-in and MFA" confirmLabel="Reset sign-in and MFA" onClose={onClose} onConfirm={() => runAction(portalAct.resetMfa(pid, reason))}>
          <p>Signs {name} out of every portal session and removes their second factor. They set it up again at the next sign-in. Recovery never relies on name and date of birth alone: confirm identity with the verified mobile or email first.</p>
          <ReasonField value={reason} onChange={setReason} placeholder="For example: lost phone, identity confirmed by a code sent to the verified mobile" />
        </ActionPanel>
      );
    case "lock":
      return (
        <ActionPanel title="Lock account" tone="danger" confirmLabel="Lock account" onClose={onClose} onConfirm={() => runAction(portalAct.lock(pid, reason))}>
          <p>Blocks portal sign-in for {name}. The portal shows: "Your account is locked, contact {content.supportEmail}". Bookings, consent and records are unchanged.</p>
          <ReasonField value={reason} onChange={setReason} placeholder="For example: participant reported a lost phone and suspected misuse" />
        </ActionPanel>
      );
    case "unlock":
      return (
        <ActionPanel title="Unlock account" confirmLabel="Unlock account" onClose={onClose} onConfirm={() => runAction(portalAct.unlock(pid, reason))}>
          <p>Lets {name} sign in again and clears the failed sign-in count. If they lost their second factor, reset sign-in and MFA as well.</p>
          <ReasonField value={reason} onChange={setReason} placeholder="For example: identity confirmed by phone with the booking reference and a code to the verified mobile" />
        </ActionPanel>
      );
    case "assisted":
      return (
        <ActionPanel title="Assisted onboarding" confirmLabel="Start assisted onboarding" onClose={onClose} onConfirm={() => runAction(portalAct.assistedOnboarding(pid, reason, method))}>
          <p>For people who cannot use the digital flow (ENR-01). You set up the account with {name}; they still give consent and answer the questionnaire themselves, with your help. Staff never answer for them.</p>
          <Field label="How you are helping" htmlFor="pa-assist-method">
            <Select id="pa-assist-method" value={method} onChange={(e) => setMethod(e.target.value as AssistedMethod)}>
              {(Object.keys(ASSISTED_METHOD_LABEL) as AssistedMethod[]).map((m) => <option key={m} value={m}>{ASSISTED_METHOD_LABEL[m]}</option>)}
            </Select>
          </Field>
          <ReasonField value={reason} onChange={setReason} label="Why the digital flow does not work for them" placeholder="For example: no smartphone, prefers to complete it by phone" />
        </ActionPanel>
      );
    case "contact":
      return (
        <ActionPanel title="Update contact details" confirmLabel="Save verified details" onClose={onClose} onConfirm={() => runAction(portalAct.updateContact(pid, { email, mobile }, reason, verified))}>
          <p>Messages only go to verified details. Send a code to the new email or mobile (simulated) and have {name} read it back before saving. Messages already sent keep their old destination.</p>
          <div className="pa-form-grid">
            <Field label="Email" htmlFor="pa-contact-email" help="Synthetic demo: an address at example.com.">
              <TextInput id="pa-contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="New Irish mobile" htmlFor="pa-contact-mobile" help={<>Format 08x1234567. Now on file: {row.person.phone}. Leave blank to keep it.</>}>
              <TextInput id="pa-contact-mobile" type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="08x1234567" autoComplete="off" />
            </Field>
          </div>
          <div style={{ margin: "8px 0 10px" }}><Checkbox checked={verified} onChange={setVerified} label="The participant read back the verification code sent to the new details (simulated)" /></div>
          <ReasonField value={reason} onChange={setReason} placeholder="For example: new personal email, no longer uses the work address" />
        </ActionPanel>
      );
    case "preview":
      return (
        <ActionPanel title="Preview as participant" confirmLabel="Record and open the portal" onClose={onClose} onConfirm={() => { const r = runAction(portalAct.recordPreview(pid, reason)); if (r.ok) onPreview(); return r; }}>
          <p>Opens the participant portal exactly as {name} sees it. This is support access (IAM-04): it is time-limited to this preview, recorded with your reason, and anything you do inside is logged as the participant preview. No silent impersonation.</p>
          <ReasonField value={reason} onChange={setReason} label="Purpose" placeholder="For example: participant cannot find the Change time button" />
        </ActionPanel>
      );
    case "withdraw": {
      const upcoming = row.booking.kind === "upcoming" ? `${row.booking.bookingId} on ${fmtDate(row.booking.date || "")} at ${row.booking.time}` : null;
      return (
        <ActionPanel title="Withdraw from programme" tone="danger" confirmLabel="Record withdrawal" onClose={onClose} onConfirm={() => runAction(portalAct.withdraw(pid, reason))}>
          <p>Stops {name}'s future participation in {row.programme.name}: {upcoming ? `the upcoming appointment ${upcoming} is cancelled with its reminders, ` : ""}no new booking or submission is accepted, and no more invitations go out.</p>
          <Note tone="warn">It does not erase anything. Consent, questionnaire answers, screening and report records are kept under the retention schedule (period to confirm with the DPO). The participant can still read their own released reports.</Note>
          <ReasonField value={reason} onChange={setReason} placeholder="For example: participant asked by email to withdraw" />
        </ActionPanel>
      );
    }
  }
}

/** Status mix for one programme, used on the content view. */
export function statusLine(state: PhState, programmeId: ProgrammeId): string {
  const c = accountStatusCounts(state, programmeId);
  return ACCOUNT_STATUS_ORDER.map((s) => `${c[s]} ${ACCOUNT_STATUS_LABEL[s].toLowerCase()}`).join(", ");
}
