/* Advice library selectors for the Results screens: which approved snippets match an episode,
   the draft the "Prepare draft" path assembles from them, and the reporter workload in the review
   queue. Plain functions of PhState, memoised per state object like the shared selectors, so the
   handlers in libraryActions.ts and the screens read exactly the same answers. Deterministic: no
   model, no network, no randomness. */
import {
  ANALYTES, approvedVersion, canViewEpisodeClinical, episodeFlags, fmtDateLong, formatResult, ix, latestObservations, measurementBands, memo,
  pendingTests, reviewQueueAll, riskFactorSummary, staffName,
} from "../../model";
import type {
  AdviceSnippet, Episode, FlagReason, Id, MeasurementBand, PhState, ReporterId, ReviewItem, SnippetCondition, SnippetVersion,
} from "../../model";

/* ---- reporters ---- */
/** Who reports this episode: the library assignment, otherwise the review assignee. */
export function reporterOf(state: PhState, ep: Episode): ReporterId {
  const r = state.adviceLibrary.reporters[ep.id];
  return r || (ep.reviewAssigneeId === "liz" ? "liz" : "neil");
}
export interface ReporterLoad { id: ReporterId; name: string; ready: number; routine: number; flagged: number; aged: number }
/** Ready episodes per reporter. Every ready episode has exactly one reporter, so the counts add up to the queue. */
export function reporterWorkload(state: PhState): ReporterLoad[] {
  return memo(state, "phr:lib:load", () => {
    const q = reviewQueueAll(state);
    return (["neil", "liz"] as const).map((id) => {
      const mine = q.filter((i) => reporterOf(state, i.episode) === id);
      return { id, name: staffName(state, id), ready: mine.length, routine: mine.filter((i) => i.routine).length, flagged: mine.filter((i) => i.flagged).length, aged: mine.filter((i) => i.aged).length };
    });
  });
}
export const byReporter = (state: PhState, items: ReviewItem[], id: ReporterId | "all") => (id === "all" ? items : items.filter((i) => reporterOf(state, i.episode) === id));

/* ---- matching ---- */
/** HSE low-risk weekly limits in standard drinks (one unit on the questionnaire is one standard drink). */
export const alcoholLimit = (sex: string) => (sex === "male" ? 17 : 11);

export interface SnippetMatch {
  snippet: AdviceSnippet;
  version: SnippetVersion;
  /** Why it matched, in the episode's own values. */
  reason: string;
}
export interface Suggestions {
  matches: SnippetMatch[];
  /** Findings that need review and that no approved snippet covers. The clinician writes these. */
  uncovered: FlagReason[];
}
const EMPTY: Suggestions = { matches: [], uncovered: [] };

/**
 * Approved snippets whose conditions hold for this episode, in prepared-draft order, and the
 * findings no snippet covers. Empty for a role that may not see the episode's values.
 */
export function snippetSuggestions(state: PhState, episodeId: Id): Suggestions {
  return memo(state, "phr:lib:sg:" + episodeId, () => {
    const I = ix(state);
    const ep = I.episodeById.get(episodeId);
    const person = ep ? I.personById.get(ep.personId) : undefined;
    if (!ep || !person || !canViewEpisodeClinical(state, episodeId)) return EMPTY;
    const obs = new Map(latestObservations(state, episodeId).map((o) => [o.code, o]));
    const flags = episodeFlags(state, ep);
    const mbs = new Map<string, MeasurementBand>(measurementBands(ep.capture, person.sex).map((m) => [m.key, m]));
    const rf = riskFactorSummary(state, episodeId);
    const pending = pendingTests(state, ep).length;
    const covered = new Set<string>();

    const test = (c: SnippetCondition): string | null => {
      switch (c.kind) {
        case "analyte": {
          const o = obs.get(c.code);
          if (!o || !c.bands.includes(o.band) || (o.unitDiscrepancy && !o.unitDiscrepancy.confirmed)) return null;
          const a = ANALYTES[c.code];
          covered.add("code:" + c.code);
          if (a.qualitative) return `${a.name} ${formatResult(c.code, o.value, o.valueText).toLowerCase()}`;
          return `${a.name} ${formatResult(c.code, o.value, o.valueText)}${a.unit && a.unit !== "ratio" ? " " + o.unit : ""}, ${o.band}`;
        }
        case "measure": {
          const m = mbs.get(c.key);
          if (!m || !((c.words && c.words.includes(m.word)) || (c.bands && c.bands.includes(m.band)))) return null;
          covered.add("m:" + c.key);
          return c.key === "ecg" ? `ECG ${m.word.toLowerCase()} on the day` : `${m.label} ${m.text}, ${m.word.toLowerCase()}`;
        }
        case "smoker":
          return rf && rf.smoker && (/cigarettes per day/.test(rf.smoker) || rf.smoker.startsWith("Yes")) ? `Smoking: ${rf.smoker}` : null;
        case "alcohol": {
          const n = rf ? rf.alcoholUnitsPerWeek : null;
          const lim = alcoholLimit(person.sex);
          return n != null && n > lim ? `About ${n} standard drinks a week reported, low-risk limit ${lim}` : null;
        }
        case "any_flag": return flags.length ? `${flags.length === 1 ? "One finding needs" : `${flags.length} findings need`} individual review` : null;
        case "no_flags": return !flags.length && !pending ? "No findings flagged and every expected result is in" : null;
        case "manual": return null;
      }
    };

    const matches: SnippetMatch[] = [];
    for (const s of state.adviceLibrary.snippets.slice().sort((a, b) => a.order - b.order)) {
      const version = approvedVersion(s);
      if (!version) continue;
      const reasons = s.conditions.map(test).filter((x): x is string => !!x);
      if (reasons.length) matches.push({ snippet: s, version, reason: reasons.join("; ") });
    }
    const cholesterolCovered = matches.some((m) => m.snippet.group === "Cholesterol");
    const uncovered = flags.filter((f) => {
      if (f.kind === "observation" && f.code) return !(covered.has("code:" + f.code) || ((f.code === "NONHDL" || f.code === "TCHDL") && cholesterolCovered));
      return !(f.key && covered.has("m:" + f.key));
    });
    return { matches, uncovered };
  });
}

/** The personalised first line of a prepared draft. Facts only: the first name and the screening date. */
export function openingLine(state: PhState, episodeId: Id): string {
  const I = ix(state);
  const ep = I.episodeById.get(episodeId);
  const person = ep ? I.personById.get(ep.personId) : undefined;
  if (!ep || !person) return "";
  const date = fmtDateLong(ep.collectedAt).replace(/^\S+\s/, "");
  const flagged = episodeFlags(state, ep).length > 0;
  return `${person.given}, thank you for attending your health screening on ${date}.${flagged ? " Some of your results are outside the normal range, and the advice below explains what to do next." : ""}`;
}

export interface PreparedText { text: string; opening: string; codes: Array<{ code: string; version: number }> }
/**
 * The draft "Prepare draft" writes: the personalised opening line, then every matching approved
 * snippet in library order (findings, lifestyle, normal confirmations, then the closing line).
 * Null when nothing matches or the role may not see the episode.
 */
export function preparedDraftFor(state: PhState, episodeId: Id): PreparedText | null {
  const { matches } = snippetSuggestions(state, episodeId);
  if (!matches.length) return null;
  const opening = openingLine(state, episodeId);
  return {
    text: [opening, ...matches.map((m) => m.version.text)].filter(Boolean).join("\n\n"),
    opening,
    codes: matches.map((m) => ({ code: m.snippet.code, version: m.version.version })),
  };
}
