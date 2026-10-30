/* The screening summary agent: a plain-English summary of one screening, written from the banded
   results and the advice the doctor approved. It is deterministic (no model is connected): the same
   results always give the same words. It is a draft until the reviewing doctor approves it; the
   approval is recorded once in the activity log with name and time, and only then is the summary
   shown on the participant's report and in the employee portal. Agents cannot approve it. */
import type { Episode, Id, PhState } from "./types";
import { ANALYTES, CALCULATED_ANALYTES, bmiCategory, bpCategory, waistCategory } from "./constants";
import { ix } from "./selectors/core";
import { latestObservations } from "./selectors/clinical";
import { currentReleased } from "./selectors/clinical";
import { localDateOf } from "./time";
import { registerHandlers } from "./reducer";
import type { Handler } from "./actions/ctx";

export interface ScreeningSummary {
  episodeId: Id;
  normal: string[];
  attention: Array<{ what: string; why: string }>;
  next: string[];
  text: string;
  /** Who approved it and when, once approved. */
  approved: { by: string; at: string } | null;
}

const lower = (s: string) => s.toLowerCase();
const NEXT: Partial<Record<string, string>> = {
  TC: "Talk to your GP about your cholesterol and recheck it in 3 to 6 months.",
  LDL: "Talk to your GP about your cholesterol and recheck it in 3 to 6 months.",
  HDL: "Regular activity helps raise HDL, the protective cholesterol.",
  TG: "Cutting back on sugar and alcohol usually lowers triglycerides.",
  HBA1C: "Ask your GP to repeat your HbA1c, the blood sugar test.",
  HB: "Ask your GP about your blood count.",
  FERR: "Ask your GP about your iron levels.",
  IRON: "Ask your GP about your iron levels.",
  VITD: "A vitamin D supplement over the winter months is usually advised.",
  TSH: "Ask your GP to repeat your thyroid test.",
  ALT: "Keep alcohol within the low-risk limits and ask your GP to recheck your liver tests.",
  GGT: "Keep alcohol within the low-risk limits and ask your GP to recheck your liver tests.",
  CREAT: "Ask your GP to recheck your kidney function.",
  PSA: "Please see your GP about your PSA result.",
  FIT: "Please see your GP about your bowel screening result.",
};

/** The summary as the agent drafts it. Null when the screening has no results yet. */
export function screeningSummary(state: PhState, episodeId: Id): ScreeningSummary | null {
  const I = ix(state);
  const ep: Episode | undefined = I.episodeById.get(episodeId);
  if (!ep) return null;
  const person = I.personById.get(ep.personId);
  if (!person) return null;
  const obs = latestObservations(state, ep.id).filter((o) => !CALCULATED_ANALYTES.includes(o.code));
  const m = ep.capture.measures;
  const v = (k: keyof typeof m) => (m[k].state === "recorded" && m[k].value != null ? (m[k].value as number) : null);
  if (!obs.length && v("bpSys") == null) return null;
  const on = localDateOf(ep.collectedAt);
  const normal: string[] = [];
  const attention: Array<{ what: string; why: string }> = [];
  const next = new Set<string>();
  const sys = v("bpSys"), dia = v("bpDia");
  if (sys != null && dia != null) {
    const bp = bpCategory(sys, dia, on);
    if (bp.band === "normal") normal.push("blood pressure"); else attention.push({ what: `Blood pressure ${sys}/${dia} mmHg`, why: bp.band === "borderline" ? "a little high" : "high" });
    if (bp.band !== "normal") next.add("Have your blood pressure checked again by your GP or pharmacist within a month.");
  }
  const h = v("heightM"), w = v("weightKg");
  if (h && w) {
    const bmi = Math.round((w / (h * h)) * 10) / 10;
    const c = bmiCategory(bmi, typeof ep.capture.form?.ethnicity === "string" ? ep.capture.form.ethnicity : null, on);
    if (c.band === "normal") normal.push("weight for height (BMI)"); else { attention.push({ what: `BMI ${bmi.toFixed(1)}`, why: lower(c.word) }); next.add("Small, steady changes to food and activity help bring BMI towards the healthy range."); }
  }
  const waist = v("waistCm");
  if (waist != null) { const c = waistCategory(waist, person.sex, on); if (c.band === "normal") normal.push("waist"); else attention.push({ what: `Waist ${waist} cm`, why: lower(c.word) }); }
  const groupOk = new Map<string, boolean>();
  for (const o of obs) {
    const a = ANALYTES[o.code];
    if (o.band === "not_tested") continue;
    groupOk.set(a.group, (groupOk.get(a.group) ?? true) && o.band === "normal");
    if (o.band === "normal") continue;
    attention.push({ what: `${a.name} ${o.valueText ?? o.value} ${a.qualitative ? "" : a.unit}`.trim(), why: o.band === "borderline" ? "slightly outside the normal range" : "outside the normal range" });
    const n = NEXT[o.code]; if (n) next.add(n);
  }
  const GROUP_WORD: Record<string, string> = { cholesterol: "cholesterol", glucose: "blood sugar", kidney: "kidney tests", fbc: "blood count", liver: "liver tests", thyroid: "thyroid", iron: "iron", vitamins_minerals: "vitamins and minerals", cancer: "cancer screening tests" };
  for (const [g, ok] of groupOk) if (ok) normal.push(GROUP_WORD[g] || g);
  if (!attention.length) next.add("Keep doing what you are doing. We will invite you again next year.");
  else next.add("Your doctor's advice in this report explains each point. If anything worries you, contact your GP.");
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const first = person.given;
  const text = [
    attention.length ? `${first}, most of your results are in the normal range${normal.length ? `, including your ${list(normal.slice(0, 5))}` : ""}.` : `${first}, all of your results are in the normal range.`,
    attention.length ? `${attention.length === 1 ? "One result needs" : `${attention.length} results need`} some attention: ${list(attention.map((x) => `${x.what} (${x.why})`))}.` : "",
    `Next steps: ${[...next].join(" ")}`,
  ].filter(Boolean).join(" ");
  const ev = [...state.activity].reverse().find((e) => e.verb === "summary.approved" && e.entity?.kind === "episode" && e.entity.id === ep.id);
  return { episodeId: ep.id, normal, attention, next: [...next], text, approved: ev ? { by: ev.actor.label, at: ev.at } : null };
}

/** True when the summary may be shown to the participant: approved and the report released. */
export function summaryVisible(state: PhState, episodeId: Id): boolean {
  const s = screeningSummary(state, episodeId);
  return !!s && !!s.approved && !!currentReleased(state, episodeId);
}

const handlers: Record<string, Handler> = {
  "summary/approve": (c, a: { episodeId: string; actor?: { kind?: string } }) => {
    if ((a.actor && a.actor.kind === "agent") || (a as { agentId?: string }).agentId) return c.fail("Agents draft the summary; only the reviewing doctor approves it.");
    const d = c.need("clinical.review", "approve a screening summary"); if (d) return d;
    const s = screeningSummary(c.s, a.episodeId);
    if (!s) return c.fail("This screening has no results to summarise yet.");
    if (s.approved) return c.fail("This summary is already approved.");
    const ep = c.ix().episodeById.get(a.episodeId)!;
    c.emit({ verb: "summary.approved", summary: `${c.first()} approved the screening summary for ${c.personName(ep.personId)}, drafted by the summary agent from the banded results.`, entity: { kind: "episode", id: ep.id }, programmeId: ep.programmeId, personId: ep.personId, restricted: true, publicSummary: "Screening summary approved" });
    return c.ok("Summary approved. It now shows on the report and in the employee portal.", "ok", ep.id);
  },
};
registerHandlers(handlers);
export const summaryAct = { approve: (episodeId: string) => ({ type: "summary/approve", episodeId }) };
