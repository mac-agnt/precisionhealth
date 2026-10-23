/* Health Screening selectors: who may change ranges, version differences, and what a range change
   would do to the demo's results. Pure functions over PhState. Participant names never leave here:
   impact is counts plus episode ids, and the page decides what each role may open. */
import {
  ANALYTES, RR_BAND_ORDER, illustrativeBand, RR_TEST_BY_ANALYTE, RR_TESTS, ageOn, bandIssues, boundsShort, classify, cohortOverlaps, cohortText, localDateOf,
  fmtDate, rrVersionInForce, today,
} from "../../model";
import type { Band, PhState, RrPerson, RrResult, RrRow, RrTest, RrVersion, StaffId } from "../../model";

export const isSuperadmin = (s: PhState, id: string) => s.referenceRanges.settings.superadmins.includes(id as StaffId);

/** A one-line description of each band in a row: NORMAL ≥15 and ≤150. */
export function rowBandsShort(test: RrTest, row: RrRow): string {
  if (row.status === "not_set") return "Not set";
  if (row.status === "not_applicable") return "Not applicable";
  if (test.kind === "qualitative") return `${row.expected}`;
  return RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter(Boolean).map((b) => `${b!.label} ${boundsShort(b!, test.decimals)}`).join(" · ");
}

/** What changed between two versions, row by row (rows matched by their cohort). */
export function rrDiff(test: RrTest, prev: RrVersion | null, next: RrVersion): string[] {
  if (!prev) return ["First version."];
  const out: string[] = [];
  const key = (r: RrRow) => cohortText(r.cohort);
  const before = new Map(prev.rows.map((r) => [key(r), r]));
  const after = new Map(next.rows.map((r) => [key(r), r]));
  for (const [k, r] of after) {
    const o = before.get(k);
    if (!o) { out.push(`Added: ${k}: ${rowBandsShort(test, r)}`); continue; }
    const a = rowBandsShort(test, o), b = rowBandsShort(test, r);
    if (a !== b) out.push(`${k}: ${a} → ${b}`);
  }
  for (const [k] of before) if (!after.has(k)) out.push(`Removed: ${k}`);
  if (prev.effectiveFrom !== next.effectiveFrom) out.push(`Effective from ${fmtDate(next.effectiveFrom)} (previous version from ${fmtDate(prev.effectiveFrom)}).`);
  return out.length ? out : ["No change to the numbers or words."];
}

/** Gaps, overlaps and cohort clashes in a version, as plain sentences. */
export function versionIssues(test: RrTest, v: RrVersion | null): Array<{ row: string; text: string; kind: string }> {
  if (!v) return [];
  const out: Array<{ row: string; text: string; kind: string }> = [];
  for (const r of v.rows) for (const i of bandIssues(r, test.decimals)) out.push({ row: cohortText(r.cohort), text: i.text, kind: i.kind });
  for (const t of cohortOverlaps(v.rows)) out.push({ row: "Cohorts", text: t, kind: "cohort" });
  return out;
}

export function testStatus(s: PhState, test: RrTest) {
  const on = today(s);
  const v = rrVersionInForce(s.referenceRanges.versions, test.id, on);
  const issues = versionIssues(test, v);
  const recorded = test.kind === "recorded";
  const notSet = !recorded && (!v || v.rows.every((r) => r.status !== "set"));
  const partly = !!v && !notSet && v.rows.some((r) => r.status === "not_set");
  const draft = s.referenceRanges.versions.find((x) => x.testId === test.id && x.status === "draft") || null;
  const open = test.questions.filter((q) => s.referenceRanges.questions[q]?.status !== "answered");
  const scheduled = s.referenceRanges.versions.filter((x) => x.testId === test.id && x.status === "published" && x.effectiveFrom > on).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return { v, issues, notSet, partly, draft, open, recorded, scheduled };
}

/* ---------- results impact ---------- */

const personFor = (s: PhState, episodeId: string): { p: RrPerson; on: string } | null => {
  const ix = s.episodes.find((e) => e.id === episodeId);
  if (!ix) return null;
  const person = s.persons.find((x) => x.id === ix.personId);
  if (!person) return null;
  const on = localDateOf(ix.collectedAt);
  return { p: { sex: person.sex, age: ageOn(person.dob, on), ethnicity: null, pregnant: null }, on };
};

export interface ImpactRow { episodeId: string; released: boolean; value: number; from: RrResult; to: RrResult }

/** Results whose band would change if this draft were published as it stands. */
export function draftImpact(s: PhState, draft: RrVersion): { checked: number; changed: ImpactRow[]; test: RrTest | null } {
  const test = RR_TESTS.find((t) => t.id === draft.testId) || null;
  if (!test?.analyte) return { checked: 0, changed: [], test };
  const live = s.referenceRanges.versions;
  const withDraft = live.map((v) => (v.id === draft.id ? { ...draft, status: "published" as const } : v));
  const released = new Set(s.episodes.filter((e) => e.reportState === "released").map((e) => e.id));
  const changed: ImpactRow[] = [];
  let checked = 0;
  for (const o of s.observations) {
    if (o.code !== test.analyte) continue;
    const ctx = personFor(s, o.episodeId);
    if (!ctx) continue;
    checked++;
    const from = classify(test, live, ctx.p, o.value, ctx.on);
    const to = classify(test, withDraft, ctx.p, o.value, ctx.on);
    if (from.outcome !== to.outcome) changed.push({ episodeId: o.episodeId, released: released.has(o.episodeId), value: o.value, from, to });
  }
  return { checked, changed, test };
}

export interface AnalyteComparison { test: RrTest; results: number; same: number; differ: number; moves: Array<{ from: Band; to: Band; n: number }> }

/** How each demo result's band changed when results moved from the illustrative rules (v0.1) to Precision Health's table. Counts only. */
export function compareWithCurrentRules(s: PhState): AnalyteComparison[] {
  const byCode = new Map<string, AnalyteComparison>();
  for (const o of s.observations) {
    const test = RR_TEST_BY_ANALYTE[o.code];
    if (!test || !ANALYTES[o.code]) continue;
    const ctx = personFor(s, o.episodeId);
    if (!ctx) continue;
    let c = byCode.get(o.code);
    if (!c) { c = { test, results: 0, same: 0, differ: 0, moves: [] }; byCode.set(o.code, c); }
    c.results++;
    const ep = s.episodes.find((e) => e.id === o.episodeId)!;
    const person = s.persons.find((x) => x.id === ep.personId)!;
    const from = illustrativeBand(o.code, o.value, { sex: person.sex, age: ctx.p.age ?? 40 });
    if (from === o.band) { c.same++; continue; }
    c.differ++;
    const m = c.moves.find((x) => x.from === from && x.to === o.band);
    if (m) m.n++; else c.moves.push({ from, to: o.band, n: 1 });
  }
  return [...byCode.values()].sort((a, b) => b.differ - a.differ || a.test.name.localeCompare(b.test.name));
}
