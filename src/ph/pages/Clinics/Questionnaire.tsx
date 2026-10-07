/* Read-only review of the participant's pre-visit questionnaire, for clinical roles. Answers come
   from the participant's membership (completed in the portal before the booking was confirmed),
   section by section in the portal's own order and wording. Conditional questions show only when
   their condition holds, and the reason is stated when one was not asked. A short summary gives
   the answers the nurse form and the clinician viewer use. */
import type { Answers, Booking, Membership, Question, QuestionCtx } from "../../model";
import { PROGRAMME_BY_ID, QUESTION_BY_KEY, SECTIONS, ageOn, answerSummary, answerText, fmtDateTime, isBlank, ix, membershipOf, questionLabel, visible } from "../../model";
import { usePhState } from "../../store";
import { Pill } from "../../ui";

function notAskedReason(q: Question, ctx: QuestionCtx): string {
  if (q.showIfSex && ctx.sex !== q.showIfSex) return q.showIfSex === "male" ? "Not asked: men only" : "Not asked: women only";
  if (q.minAge !== undefined && (ctx.age === undefined || ctx.age < q.minAge)) return `Not asked: from age ${q.minAge}`;
  if (q.showIf) {
    const parent = QUESTION_BY_KEY[q.showIf.key];
    const want = q.showIf.oneOf ? "answered with a frequency" : typeof q.showIf.equals === "boolean" ? (q.showIf.equals ? "yes" : "no") : `"${String(q.showIf.equals)}"`;
    return `Not asked: only when the answer to "${parent ? parent.label.replace(/\?$/, "") : q.showIf.key}" is ${want}`;
  }
  return "Not asked";
}

const yn = (v: boolean | null) => (v === null ? "Not answered" : v ? "Yes" : "No");

export function QuestionnaireReview({ booking, membership }: { booking: Booking; membership: Membership | null }) {
  const state = usePhState();
  const person = ix(state).personById.get(booking.personId);
  const session = ix(state).sessionById.get(booking.sessionId);
  const m = membershipOf(state, booking.personId, booking.programmeId) || membership;
  const answers: Answers = (m?.answers || {}) as Answers;
  const ctx: QuestionCtx = {
    sex: person?.sex,
    age: person && session ? ageOn(person.dob, session.date) : undefined,
    employer: PROGRAMME_BY_ID[booking.programmeId]?.clientName,
  };
  const complete = m?.questionnaire === "complete";
  const any = Object.keys(answers).some((k) => !!QUESTION_BY_KEY[k]);
  const sum = answerSummary(answers);
  const summary: Array<[string, string]> = [
    ["Smoking", sum.smoker ?? "Not answered"],
    ["Family history of heart attack or stroke under 60", yn(sum.familyHistoryCvd)],
    ["Diabetes", sum.diabetes ?? "Not answered"],
    ["Treated for high blood pressure", yn(sum.hypertensionTreatment)],
    ["History of high blood pressure", sum.highBpHistory ?? "Not answered"],
    ["Alcohol, estimated units a week", sum.alcoholUnitsPerWeek === null ? "Not answered" : `About ${sum.alcoholUnitsPerWeek} (estimate from two answers)`],
    ["Medications", sum.medications ?? "Not answered"],
  ];
  return (
    <div className="ph-stack" style={{ gap: 14 }}>
      <div className="ph-wrap" style={{ gap: 6 }}>
        <Pill tone={complete ? "ok" : "warn"} icon={complete ? "check" : "alert"}>{complete ? "Submitted before booking" : "Not submitted"}</Pill>
        <span className="ph-faint" style={{ fontSize: 11.5 }}>
          Self-reported in the portal{booking.questionnaireCompletedAt ? `, ${fmtDateTime(booking.questionnaireCompletedAt)}` : ""}. The nurse confirms the answers that carry onto the nurse form.
        </span>
      </div>
      {any ? (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Summary for the nurse form</div>
          <div className="clx-qa">
            {summary.map(([k, v]) => [<span key={k + "l"}>{k}</span>, <span key={k + "v"} style={v === "Not answered" ? { color: "var(--faint)" } : undefined}>{v}</span>])}
          </div>
        </div>
      ) : null}
      {any ? SECTIONS.map((s) => (
        <div key={s.key}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>{s.title}</div>
          <div className="clx-qa">
            {s.questions.map((q) => {
              const asked = visible(q, answers, ctx);
              const v = answers[q.key];
              const text = asked ? (q.key === "exerciseDays" && !isBlank(v) ? `${v} day${Number(v) === 1 ? "" : "s"} a week` : answerText(q, v)) : notAskedReason(q, ctx);
              return [
                <span key={q.key + "l"}>{questionLabel(q, ctx)}</span>,
                <span key={q.key + "v"} style={!asked || isBlank(v) ? { color: "var(--faint)" } : undefined}>{text}</span>,
              ];
            })}
          </div>
        </div>
      )) : <div className="ph-faint" style={{ fontSize: 12.5 }}>No questionnaire answers are recorded for this booking.</div>}
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
