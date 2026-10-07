/* A4 laboratory request and specimen label, generated from the same booking, capture and
   episode data. Demo specimen, not for laboratory use. Printing is a local preview only.
   Before completion the tests follow the nurse form: the programme panel, plus PSA when taken
   and FIT when a kit was given. */
import type { AnalyteCode, Episode, PhState } from "../../model";
import { ANALYTES, BRAND, ageOn, expectedPanel, fitKitGiven, fmtDateLong, fmtDateTime, fmtNumericDate, psaTaken, staffName } from "../../model";
import { usePhState } from "../../store";
import { Button, DemoTag, Icon } from "../../ui";
import type { ApptRow } from "./selectors";
import { bookingForm, nextEpisodeNumber, pad4, placeLabel } from "./selectors";
import { ClxModal, Portal } from "./shared";

const SEX: Record<string, string> = { female: "Female", male: "Male", not_recorded: "Not recorded" };
const WATERMARK = "Demo specimen, not for laboratory use";

/** PSA and FIT decisions from the nurse form. When omitted they are read from the capture on the row. */
export interface AddOns { psa: boolean; fit: boolean }

interface LabelData {
  name: string; labelName: string; dob: string; age: number; sex: string; personId: string; bookingId: string;
  episodeId: string; specimenId: string; provisional: boolean; specimenType: string; collected: string;
  tests: Array<{ code: AnalyteCode; name: string; unit: string }>; fit: boolean; programme: string; client: string; site: string; appointment: string;
  clinician: string; nurse: string; lab: string; form: string; consent: string; identity: string;
}

function labelData(state: PhState, row: ApptRow, episode: Episode | null, addOns?: AddOns): LabelData {
  const { person, booking: b, session: s, programme } = row;
  const next = nextEpisodeNumber(state);
  const cap = episode ? episode.capture : row.draft;
  const spec = episode ? state.specimens.find((x) => x.episodeId === episode.id) : undefined;
  const lead = state.staff.find((x) => x.id === programme.clinicalLeadId);
  const { template } = bookingForm(state, b);
  const extra: AddOns = addOns || { psa: !!cap && psaTaken(cap), fit: !!cap && fitKitGiven(cap) };
  const codes: AnalyteCode[] = episode ? episode.expectedTests.map((t) => t.code) : expectedPanel(b.formTemplateId, { psaTaken: extra.psa, fitGiven: extra.fit });
  const idOk = !!cap && cap.identity.every((x) => x.confirmed);
  return {
    name: `${person.given} ${person.family}`,
    labelName: `${person.family.toUpperCase()}, ${person.given}`,
    dob: fmtNumericDate(person.dob),
    age: ageOn(person.dob, s.date),
    sex: SEX[person.sex] || person.sex,
    personId: person.id,
    bookingId: b.id,
    episodeId: episode ? episode.id : `PH-E-${pad4(next)}`,
    specimenId: spec ? spec.id : episode ? episode.specimenIds[0] : `PH-S-${pad4(next)}`,
    provisional: !episode,
    specimenType: spec ? spec.type.toUpperCase() : "SERUM",
    collected: episode ? fmtDateTime(episode.collectedAt) : `${fmtDateLong(s.date)}, on collection`,
    tests: codes.filter((c) => c !== "FIT").map((c) => ({ code: c, name: ANALYTES[c].name, unit: ANALYTES[c].unit })),
    fit: codes.includes("FIT"),
    programme: programme.name,
    client: programme.clientName,
    site: placeLabel(s),
    appointment: `${fmtDateLong(s.date)}, ${b.slotStart}`,
    clinician: lead ? `${lead.name}, ${lead.title}` : "Clinical lead to confirm",
    nurse: staffName(state, s.nurseId),
    lab: state.companies.find((c) => c.id === "co-eurofins")?.name || "Laboratory supplier",
    form: `${template ? template.name : b.formTemplateId} v${b.formVersion}`,
    consent: `${b.consentVersion}, completed before booking`,
    identity: idOk ? "Date of birth and booking reference confirmed at the appointment" : "Not yet confirmed",
  };
}

function testsOnLabel(d: LabelData): string {
  const psa = d.tests.some((t) => t.code === "PSA");
  if (d.tests.length <= 8) return d.tests.map((t) => t.code).join(", ");
  return `${d.tests.length} tests, see the lab request${psa ? ". PSA included" : ""}`;
}

function SpecimenLabel({ d }: { d: LabelData }) {
  return (
    <div className="clx-label" aria-label="Specimen label preview">
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--warn)", textTransform: "uppercase" }}>{WATERMARK}</div>
      <div className="big ph-mono" style={{ marginTop: 4 }}>{d.specimenId}</div>
      <div style={{ color: "var(--ink)", fontWeight: 600, marginTop: 2 }}>{d.labelName}</div>
      <div>DOB {d.dob} &nbsp; {d.sex} &nbsp; {d.personId}</div>
      <div>{d.specimenType} &nbsp; Episode {d.episodeId}</div>
      <div>Tests: {testsOnLabel(d)}</div>
      <div>Collected: {d.collected}</div>
      <div className="clx-barcode">Barcode not generated in this demo</div>
    </div>
  );
}

function RequestSheet({ d }: { d: LabelData }) {
  const rows: Array<[string, string]> = [
    ["Requesting organisation", `${BRAND.legalName}, ${BRAND.address}`],
    ["Requesting clinician", d.clinician],
    ["Laboratory", d.lab],
    ["Participant", `${d.name}, ${d.sex}, age ${d.age}`],
    ["Date of birth", d.dob],
    ["Participant ID", d.personId],
    ["Identity check", d.identity],
    ["Programme", `${d.programme} (${d.client})`],
    ["Booking and appointment", `${d.bookingId}, ${d.appointment}`],
    ["Clinic", `${d.site}. Collected by ${d.nurse}`],
    ["Form and consent", `${d.form}. Consent ${d.consent}`],
    ["Episode and specimen", `${d.episodeId}, ${d.specimenId} (${d.specimenType.toLowerCase()})`],
    ["Collection", d.collected],
  ];
  return (
    <div className="clx-sheet">
      <div className="ph-row-flex" style={{ alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap" }}>
        <div className="ph-grow" style={{ minWidth: 180 }}>
          <h4>Laboratory request</h4>
          <div className="ph-faint" style={{ fontSize: 11 }}>{BRAND.org}, screening request. Fictional participant. Sample data.</div>
        </div>
        <span className="clx-watermark"><Icon name="alert" size={12} />{WATERMARK}</span>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <h4 style={{ marginTop: 14 }}>Tests requested on the blood specimen</h4>
      <table>
        <tbody>
          {d.tests.map((t) => <tr key={t.code}><th scope="row">{t.code}</th><td>{t.name} ({t.unit}){t.code === "PSA" ? ". Added: PSA taken on the nurse form" : ""}</td></tr>)}
          {d.fit ? <tr><th scope="row">FIT</th><td>{ANALYTES.FIT.name}. Separate kit given to the participant, not on this tube</td></tr> : null}
        </tbody>
      </table>
      <div className="ph-faint" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
        No clinical values or questionnaire answers are printed on the request. Results return to {BRAND.org} clinical review. {WATERMARK}. Printing is a local preview only.
      </div>
    </div>
  );
}

/** The specimen label alone, for the workspace side panel. */
export function SpecimenLabelPreview({ row, episode, addOns }: { row: ApptRow; episode: Episode | null; addOns?: AddOns }) {
  const state = usePhState();
  return <SpecimenLabel d={labelData(state, row, episode, addOns)} />;
}

/** The A4 laboratory request, inline. */
export function LabRequestPreview({ row, episode, addOns }: { row: ApptRow; episode: Episode | null; addOns?: AddOns }) {
  const state = usePhState();
  return <RequestSheet d={labelData(state, row, episode, addOns)} />;
}

/** The hidden print copy of the label and request. Mount it only while the preview is on screen. */
export function LabelPrintCopy({ row, episode, addOns }: { row: ApptRow; episode: Episode | null; addOns?: AddOns }) {
  const state = usePhState();
  const d = labelData(state, row, episode, addOns);
  return (
    <Portal>
      <div className="ph-printable ph-print-only clx-print">
        <h1>Laboratory request: {WATERMARK}</h1>
        <SpecimenLabel d={d} />
        <RequestSheet d={d} />
      </div>
    </Portal>
  );
}

export function LabelPreviewModal({ open, onClose, row, episode, onMarkChecked, marked }: {
  open: boolean; onClose: () => void; row: ApptRow; episode: Episode | null; onMarkChecked?: () => void; marked?: boolean;
}) {
  const state = usePhState();
  if (!open) return null;
  const d = labelData(state, row, episode);
  return (
    <>
      <ClxModal open={open} onClose={onClose} width={760} title="Specimen label and laboratory request"
        footer={<>
          <Button icon="print" onClick={() => window.print()} title="Opens the browser print dialog for a local preview. Nothing is sent to a laboratory.">Print label and request</Button>
          {onMarkChecked && !marked ? <Button variant="primary" icon="check" onClick={onMarkChecked}>Mark labels checked</Button> : null}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </>}>
        <div className="ph-stack" style={{ gap: 14 }}>
          <div className="ph-wrap" style={{ gap: 8 }}>
            <DemoTag>Sample data</DemoTag>
            <span className="ph-dim" style={{ fontSize: 12.5 }}>Both documents come from the same booking and episode record.</span>
          </div>
          {d.provisional ? (
            <div className="clx-banner info">
              <Icon name="info" size={14} style={{ color: "var(--accent)", marginTop: 2 }} />
              <span>{d.episodeId} and {d.specimenId} are the next identifiers in sequence. They are issued when the appointment is completed; if another appointment completes first, this preview updates.</span>
            </div>
          ) : null}
          <SpecimenLabel d={d} />
          <RequestSheet d={d} />
        </div>
      </ClxModal>
      <Portal>
        <div className="ph-printable ph-print-only clx-print">
          <h1>Laboratory request: {WATERMARK}</h1>
          <SpecimenLabel d={d} />
          <RequestSheet d={d} />
        </div>
      </Portal>
    </>
  );
}
