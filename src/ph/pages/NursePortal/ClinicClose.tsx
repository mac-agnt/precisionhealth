/* End of day: what happened in this clinic and the specimen manifest for the Eurofins courier.
   The manifest carries identifiers only (Unique ID and specimen ID), never clinical values. */
import type { ReactNode } from "react";
import type { ClinicSession } from "../../model";
import { PROGRAMME_BY_ID, fmtDateLong, fmtTime, ix } from "../../model";
import { usePhState } from "../../store";
import { Button, DemoTag, Icon, Pill } from "../../ui";
import { Portal } from "../Clinics/shared";
import { clinicCounts, clinicEpisodes, clinicRows } from "./data";

export function ClinicClose({ session, onOpen, onOpenTask, receipt }: { session: ClinicSession; onOpen: (bookingId: string) => void; onOpenTask: (taskId: string) => void; receipt?: ReactNode }) {
  const state = usePhState();
  const rows = clinicRows(state, session);
  const c = clinicCounts(state, session);
  const eps = clinicEpisodes(state, session).slice().sort((a, b) => (a.collectedAt < b.collectedAt ? -1 : 1));
  const open = rows.filter((r) => r.status === "checked_in" || r.status === "in_progress");
  const dna = rows.filter((r) => r.status === "no_show" || (r.status === "not_arrived" && r.slotPassed));
  const toCome = rows.filter((r) => (r.status === "not_arrived" && !r.slotPassed) || r.status === "upcoming");
  const name = (personId: string) => { const p = ix(state).personById.get(personId); return p ? `${p.given} ${p.family}` : personId; };
  const lab = state.companies.find((x) => x.id === "co-eurofins")?.name || "Eurofins";
  const manifest = eps.flatMap((e) => state.specimens.filter((s) => s.episodeId === e.id).map((s) => ({ e, s })));
  const referrals = eps.filter((e) => !!e.nurseReferral);
  const ecg = eps.filter((e) => !!e.capture.ecgReview);
  const ecgDrafts = rows.filter((r) => r.draft?.ecgReview);
  const addOns = (codes: string[]) => [codes.includes("PSA") ? "PSA requested" : "", codes.includes("FIT") ? "FIT kit given" : ""].filter(Boolean).join(", ") || "None";
  const ready = open.length === 0;

  const manifestTable = (
    <table className="np-table">
      <thead><tr><th>#</th><th>Unique ID</th><th>Specimen ID</th><th>Type</th><th>Collected</th><th>Add-ons</th><th>Label</th></tr></thead>
      <tbody>
        {manifest.map(({ e, s }, i) => (
          <tr key={s.id}>
            <td data-label="#">{i + 1}</td>
            <td data-label="Unique ID" className="ph-mono">{e.screeningRef}</td>
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
            ? <Pill tone="ok" icon="check" style={{ maxWidth: "100%" }}>{toCome.length ? `${toCome.length} still to arrive. Nothing open right now.` : "Nothing open. Ready to close."}</Pill>
            : <Pill tone="warn" icon="alert" style={{ maxWidth: "100%" }}>{open.length} appointment{open.length === 1 ? "" : "s"} still open. Complete them before you close.</Pill>}
        </div>
      </div>

      <div className="np-counts">
        <Count icon="check" label="Completed" value={c.completed} sub={`of ${c.booked} booked`} />
        <Count icon="x" label="Did not attend" value={dna.length} sub="Slot passed, not checked in" />
        <Count icon="edit" label="Still open" value={open.length} sub="Checked in, not completed" />
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

      <div className="np-two">
        <div className="np-card">
          <h2 className="ph-h2">Did not attend</h2>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Booked, slot time passed, not checked in. The office follows up and offers a new slot.</div>
          <ul className="np-mini" style={{ marginTop: 10 }}>
            {dna.length ? dna.map((r) => <li key={r.booking.id}><Icon name="x" size={13} /><span>{r.booking.slotStart} {r.person.given} {r.person.family} <span className="ph-faint ph-mono">{r.booking.id}</span></span></li>)
              : <li><Icon name="check" size={13} /><span>None so far.{toCome.length ? ` ${toCome.length} still to arrive.` : ""}</span></li>}
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
            <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3 }}>Identifiers only: Unique ID and specimen ID. No names, dates of birth or clinical values. Results come back matched on the Unique ID.</div>
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

function Count({ icon, label, value, sub }: { icon: "check" | "x" | "edit" | "alert" | "flag" | "flask"; label: string; value: number; sub: string }) {
  return (
    <div className="np-count">
      <div className="np-count-label"><Icon name={icon} size={12} />{label}</div>
      <div className="np-count-value">{value}</div>
      <div className="np-count-sub">{sub}</div>
    </div>
  );
}
