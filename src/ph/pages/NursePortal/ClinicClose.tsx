/* End of day: what happened in this clinic and the specimen manifest for the Eurofins courier.
   The manifest carries identifiers only (Precision ID and specimen ID), never clinical values. */
import { useState } from "react";
import type { ReactNode } from "react";
import type { ClinicSession } from "../../model";
import { PROGRAMME_BY_ID, act, fmtDateLong, fmtTime, ix } from "../../model";
import { dispatch, usePhState } from "../../store";
import { Button, DemoTag, Icon, Pill } from "../../ui";
import { Portal } from "../Clinics/shared";
import { clinicCounts, clinicEpisodes, clinicRows } from "./data";
import { NurseDayForms } from "../Clinics/EodForm";
import { OutcomeActions, UndoDna } from "./ClinicDay";

export function ClinicClose({ session, onOpen, onOpenTask, receipt }: { session: ClinicSession; onOpen: (bookingId: string) => void; onOpenTask: (taskId: string) => void; receipt?: ReactNode }) {
  const state = usePhState();
  const rows = clinicRows(state, session);
  const c = clinicCounts(state, session);
  const eps = clinicEpisodes(state, session).slice().sort((a, b) => (a.collectedAt < b.collectedAt ? -1 : 1));
  const open = rows.filter((r) => r.status === "checked_in" || r.status === "in_progress");
  const [msg, setMsg] = useState<string | null>(null);
  const dna = rows.filter((r) => r.status === "no_show");
  const cancelled = rows.filter((r) => r.status === "cancelled");
  // Not checked in and no outcome yet. Nobody becomes Did not arrive on their own.
  const toAccount = rows.filter((r) => r.status === "not_arrived" || r.status === "upcoming");
  const name = (personId: string) => { const p = ix(state).personById.get(personId); return p ? `${p.given} ${p.family}` : personId; };
  const lab = state.companies.find((x) => x.id === "co-eurofins")?.name || "Eurofins";
  const manifest = eps.flatMap((e) => state.specimens.filter((s) => s.episodeId === e.id).map((s) => ({ e, s })));
  const referrals = eps.filter((e) => !!e.nurseReferral);
  const ecg = eps.filter((e) => !!e.capture.ecgReview);
  const ecgDrafts = rows.filter((r) => r.draft?.ecgReview);
  const addOns = (codes: string[]) => [codes.includes("PSA") ? "PSA requested" : "", codes.includes("FIT") ? "FIT kit given" : ""].filter(Boolean).join(", ") || "None";
  const ready = open.length === 0 && toAccount.length === 0;

  const manifestTable = (
    <table className="np-table">
      <thead><tr><th>#</th><th>Precision ID</th><th>Specimen ID</th><th>Type</th><th>Collected</th><th>Add-ons</th><th>Label</th></tr></thead>
      <tbody>
        {manifest.map(({ e, s }, i) => (
          <tr key={s.id}>
            <td data-label="#">{i + 1}</td>
            <td data-label="Precision ID" className="ph-mono">{e.screeningRef}</td>
            <td data-label="Specimen ID" className="ph-mono">{s.id}</td>
            <td data-label="Type">{s.type === "serum" ? "Blood, serum" : s.type === "edta" ? "Blood, EDTA" : "Urine"}</td>
            <td data-label="Collected">{fmtTime(s.collectedAt)}</td>
            <td data-label="Add-ons">{addOns(e.expectedTests.map((t) => t.code))}</td>
            <td data-label="Label">{s.labelPrinted ? "Printed" : "Not printed"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {receipt}
      <div className="np-card">
        <div className="ph-eyebrow">Clinic close</div>
        <h1 className="np-title" style={{ marginTop: 4 }}>End of day, {session.room}</h1>
        <p className="np-lead">{PROGRAMME_BY_ID[session.programmeId].name}. {fmtDateLong(session.date)}, {session.start} to {session.end}. {session.siteName}.</p>
        <div style={{ marginTop: 10 }}>
          {ready
            ? <Pill tone="ok" icon="check" style={{ maxWidth: "100%" }}>Every appointment accounted for. Ready for the End of Day form.</Pill>
            : open.length
              ? <Pill tone="warn" icon="alert" style={{ maxWidth: "100%" }}>{open.length} appointment{open.length === 1 ? "" : "s"} still open. Complete them before you close.</Pill>
              : <Pill tone="warn" icon="alert" style={{ maxWidth: "100%" }}>{toAccount.length} appointment{toAccount.length === 1 ? "" : "s"} without an outcome. Check in, Did not arrive or Cancelled.</Pill>}
        </div>
      </div>

      <div className="np-counts">
        <Count icon="check" label="Completed" value={c.completed} sub={`of ${c.booked} booked`} />
        <Count icon="x" label="Did not arrive" value={dna.length} sub="Recorded by the clinician" />
        <Count icon="calendar" label="Cancelled" value={cancelled.length} sub="On the day, slot freed" />
        <Count icon="edit" label="Still open" value={open.length + toAccount.length} sub={toAccount.length ? `${toAccount.length} without an outcome` : "Checked in, not completed"} />
        <Count icon="alert" label="Referrals" value={c.referrals} sub="Doctor review tasks" />
        <Count icon="flag" label="ECG reviews" value={c.ecgReviews} sub="Photo to the clinical channel" />
        <Count icon="flask" label="Specimens" value={c.specimens} sub={`For the ${lab} courier`} />
      </div>

      {open.length ? (
        <div className="np-card">
          <h2 className="ph-h2">Still open</h2>
          <ul className="np-mini" style={{ marginTop: 10 }}>
            {open.map((r) => (
              <li key={r.booking.id}><Icon name="edit" size={13} /><span className="ph-grow">{r.booking.slotStart} {r.person.given} {r.person.family} <span className="ph-faint ph-mono">{r.booking.id}</span></span><Button size="sm" variant="primary" onClick={() => onOpen(r.booking.id)}>Continue</Button></li>
            ))}
          </ul>
        </div>
      ) : null}

      {toAccount.length ? (
        <div className="np-card">
          <h2 className="ph-h2">Without an outcome</h2>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Every appointment needs an outcome before the End of Day form. The counts below fill it in.</div>
          {msg ? <div className="clx-banner warn" style={{ marginTop: 10 }}><Icon name="alert" size={14} style={{ color: "var(--warn)", marginTop: 2 }} /><span>{msg}</span></div> : null}
          <ul className="np-mini np-mini-outcome" style={{ marginTop: 10 }}>
            {toAccount.map((r) => (
              <li key={r.booking.id}><Icon name="clock" size={13} /><span className="ph-grow">{r.booking.slotStart} {r.person.given} {r.person.family} <span className="ph-faint ph-mono">{r.booking.id}</span></span>
                <OutcomeActions r={r} primary={false} onCheckIn={() => { const res = dispatch(act.checkIn(r.booking.id)); if (res.ok) { setMsg(null); onOpen(r.booking.id); } else setMsg(res.message || "Not checked in."); }} onMsg={setMsg} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <NurseDayForms session={session} />

      <div className="np-two">
        <div className="np-card">
          <h2 className="ph-h2">Did not arrive and cancelled</h2>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Recorded by the clinician on the clinic list. The office follows up and offers a new slot.</div>
          <ul className="np-mini" style={{ marginTop: 10 }}>
            {dna.map((r) => <li key={r.booking.id}><Icon name="x" size={13} /><span className="ph-grow">Did not arrive: {r.booking.slotStart} {r.person.given} {r.person.family} <span className="ph-faint ph-mono">{r.booking.id}</span></span><UndoDna r={r} onMsg={setMsg} /></li>)}
            {cancelled.map((r) => <li key={r.booking.id}><Icon name="calendar" size={13} /><span>Cancelled: {r.booking.slotStart} {r.person.given} {r.person.family} <span className="ph-faint ph-mono">{r.booking.id}</span></span></li>)}
            {!dna.length && !cancelled.length ? <li><Icon name="check" size={13} /><span>None so far.</span></li> : null}
          </ul>
        </div>
        <div className="np-card">
          <h2 className="ph-h2">Referrals and ECG reviews</h2>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Raised automatically from the nurse form. Tasks sit with the clinical lead in Work.</div>
          <ul className="np-mini" style={{ marginTop: 10 }}>
            {referrals.map((e) => (
              <li key={"r" + e.id}><Icon name="alert" size={13} style={{ color: "var(--bad)" }} /><span>Doctor referral: {name(e.personId)}, <span className="ph-mono">{e.screeningRef}</span>. Task {e.nurseReferral?.taskId ? <button type="button" className="ph-link ph-mono" onClick={() => onOpenTask(e.nurseReferral!.taskId!)}>{e.nurseReferral.taskId}</button> : "pending"}. Routine release blocked.</span></li>
            ))}
            {ecg.map((e) => (
              <li key={"e" + e.id}><Icon name="flag" size={13} style={{ color: "var(--warn)" }} /><span>ECG review: {name(e.personId)}, <span className="ph-mono">{e.screeningRef}</span>. Task <button type="button" className="ph-link ph-mono" onClick={() => onOpenTask(e.capture.ecgReview!.taskId)}>{e.capture.ecgReview!.taskId}</button>.</span></li>
            ))}
            {ecgDrafts.map((r) => (
              <li key={"d" + r.booking.id}><Icon name="flag" size={13} style={{ color: "var(--warn)" }} /><span>ECG review: {r.person.given} {r.person.family} (in progress). Task <button type="button" className="ph-link ph-mono" onClick={() => onOpenTask(r.draft!.ecgReview!.taskId)}>{r.draft!.ecgReview!.taskId}</button>.</span></li>
            ))}
            {!referrals.length && !ecg.length && !ecgDrafts.length ? <li><Icon name="check" size={13} /><span>None today.</span></li> : null}
          </ul>
        </div>
      </div>

      <div className="np-card">
        <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <div className="ph-grow" style={{ minWidth: 220 }}>
            <h2 className="ph-h2">Specimen manifest for the {lab} courier</h2>
            <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Identifiers only: Precision ID and specimen ID. No names, dates of birth or clinical values. Results come back matched on the Precision ID.</div>
          </div>
          <DemoTag>Simulated</DemoTag>
          {manifest.length ? <Button size="sm" icon="print" onClick={() => window.print()} title="Local print preview. Nothing is sent to the laboratory.">Print manifest</Button> : null}
        </div>
        <div className="np-tablewrap" style={{ marginTop: 10 }}>
          {manifest.length ? manifestTable : <div className="ph-dim" style={{ fontSize: 13, padding: "8px 0" }}>No specimens yet. Each completed appointment with bloods taken adds one line.</div>}
        </div>
        {manifest.length ? <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 8 }}>{manifest.length} specimen{manifest.length === 1 ? "" : "s"} from {session.room}. Simulated handover: nothing is sent and no courier is booked.</div> : null}
      </div>

      {manifest.length ? (
        <Portal>
          <div className="ph-printable ph-print-only clx-print">
            <h1>Specimen manifest, {lab} courier (simulated)</h1>
            <p>{session.siteName}, {session.room}. {fmtDateLong(session.date)}. Identifiers only, no clinical values.</p>
            {manifestTable}
          </div>
        </Portal>
      ) : null}
    </>
  );
}

function Count({ icon, label, value, sub }: { icon: "check" | "x" | "edit" | "alert" | "flag" | "flask" | "calendar"; label: string; value: number; sub: string }) {
  return (
    <div className="np-count">
      <div className="np-count-label"><Icon name={icon} size={12} />{label}</div>
      <div className="np-count-value">{value}</div>
      <div className="np-count-sub">{sub}</div>
    </div>
  );
}
