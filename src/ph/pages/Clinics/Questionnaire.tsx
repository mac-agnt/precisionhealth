/* Read-only questionnaire review for clinical roles. Answers come from the participant's
   membership (completed in the portal before booking). Conditional questions show only when
   their condition is met, and the reason is stated when they were not asked. */
import type { Booking, FieldDef, Membership } from "../../model";
import { fmtDateTime } from "../../model";
import { usePhState } from "../../store";
import { Pill } from "../../ui";
import { bookingForm } from "./selectors";

const QUESTIONNAIRE_BLOCKS = new Set(["blk-lifestyle", "blk-cvhist", "blk-diabetes", "blk-cancer"]);
const EXTRA_LABEL: Record<string, string> = { medication: "Regular medication", allergies: "Allergies" };
const CONSENT_KEYS = new Set(["consentService", "consentData", "consentSms"]);

type Answer = string | number | boolean | undefined;
function fmtAnswer(f: FieldDef | null, v: Answer): string {
  if (v === undefined || v === "") return "Not answered";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return f?.unit ? `${v} ${f.unit}` : String(v);
  return v;
}
const humanise = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

export function QuestionnaireReview({ booking, membership }: { booking: Booking; membership: Membership | null }) {
  const state = usePhState();
  const { template, version } = bookingForm(state, booking);
  const answers: Record<string, string | number | boolean> = membership?.answers || {};
  const refs = (version?.blocks || []).filter((r) => QUESTIONNAIRE_BLOCKS.has(r.blockId));
  const known = new Set<string>();
  const blocks = refs.map((r) => ({ ref: r, block: state.forms.blocks.find((b) => b.id === r.blockId) })).filter((x) => !!x.block);
  blocks.forEach((x) => x.block!.fields.forEach((f) => known.add(f.key)));
  const extras = Object.keys(answers).filter((k) => !known.has(k) && !CONSENT_KEYS.has(k));
  const complete = membership?.questionnaire === "complete";
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <div className="ph-wrap" style={{ gap: 6 }}>
        <Pill tone={complete ? "ok" : "warn"} icon={complete ? "check" : "alert"}>{complete ? "Complete before booking" : "Incomplete"}</Pill>
        <span className="ph-faint" style={{ fontSize: 11.5 }}>
          Self-reported in the portal{booking.questionnaireCompletedAt ? `, ${fmtDateTime(booking.questionnaireCompletedAt)}` : ""}. Form {template ? template.name : booking.formTemplateId} v{booking.formVersion}.
        </span>
      </div>
      {blocks.map(({ ref, block }) => (
        <div key={block!.id}>
          <div className="ph-row-flex" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{block!.name}</span>
            <span className="ph-faint" style={{ fontSize: 11 }}>v{ref.version}{ref.required ? "" : ", optional block"}</span>
          </div>
          <div className="clx-qa">
            {block!.fields.map((f) => {
              const cond = f.showIf;
              const asked = !cond || answers[cond.key] === cond.equals;
              const parent = cond ? block!.fields.find((x) => x.key === cond.key) : null;
              const v = answers[f.key];
              return [
                <span key={f.key + "l"}>{f.label}{f.unit && !f.label.includes(f.unit) ? ` (${f.unit})` : ""}</span>,
                <span key={f.key + "v"} style={!asked || v === undefined ? { color: "var(--faint)" } : undefined}>
                  {asked ? fmtAnswer(f, v) : `Not asked: only when ${parent ? parent.label.toLowerCase() : cond!.key} is ${typeof cond!.equals === "boolean" ? (cond!.equals ? "yes" : "no") : cond!.equals}`}
                </span>,
              ];
            })}
          </div>
        </div>
      ))}
      {extras.length ? (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Medication, allergies and other answers</div>
          <div className="clx-qa">
            {extras.map((k) => [<span key={k + "l"}>{EXTRA_LABEL[k] || humanise(k)}</span>, <span key={k + "v"}>{fmtAnswer(null, answers[k])}</span>])}
          </div>
        </div>
      ) : null}
      {!blocks.length && !extras.length ? <div className="ph-faint" style={{ fontSize: 12.5 }}>No questionnaire answers are recorded for this booking.</div> : null}
    </div>
  );
}

/** Consent choices, when the portal recorded them separately. */
export function consentSummary(membership: Membership | null, consentVersion: string): string {
  const a = membership?.answers || {};
  const parts: string[] = [];
  if (a.consentService !== undefined) parts.push(`service ${a.consentService ? "yes" : "no"}`);
  if (a.consentData !== undefined) parts.push(`data processing ${a.consentData ? "yes" : "no"}`);
  if (a.consentSms !== undefined) parts.push(`SMS reminders ${a.consentSms ? "yes" : "no"}`);
  return `Consent ${consentVersion} complete before booking${parts.length ? `: ${parts.join(", ")}` : ""}`;
}
