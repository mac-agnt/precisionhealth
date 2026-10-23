/* Health Screening actions, registered at import time. Only superadmins change ranges, settings or
   answers. Every change is a draft first and keeps the previous versions; publishing writes one
   activity event saying what changed and how many demo results it re-bands. A failed check leaves the
   state untouched. Nothing here is done by an agent. */
import { RR_BAND_ORDER, RR_QUESTIONS, RR_TESTS, bandCtxFor, classifyResult, fmtDate, registerHandlers } from "../../model";
import type { ActionResult, Ctx, PhState, RrBand, RrBandKey, RrEffectiveBasis, RrRow, RrVersion, StaffId } from "../../model";
import { draftImpact, rrDiff } from "./select";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const me = (c: Ctx) => c.persona().id as StaffId;
const testName = (id: string) => RR_TESTS.find((t) => t.id === id)?.name || id;

function superadmin(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}.`);
  if (!c.s.referenceRanges.settings.superadmins.includes(me(c))) {
    return c.fail(`${p.name} is not a superadmin, so cannot ${what}. Reference ranges are changed only by superadmins (Dr Neil Reddy in this demo). Switch role in Settings, Experience to try it.`);
  }
  return null;
}

/** Checks a submitted row set. Returns an error sentence or null. */
function rowsError(rows: unknown): string | null {
  if (!Array.isArray(rows) || !rows.length) return "A version needs at least one cohort.";
  for (const r of rows as RrRow[]) {
    if (!r || typeof r !== "object" || !r.cohort) return "Every cohort needs sex, age, ethnicity and pregnancy settings.";
    const { ageMin, ageMax } = r.cohort;
    if (ageMin !== null && (!Number.isInteger(ageMin) || ageMin < 0 || ageMin > 120)) return "Minimum age must be a whole number of years.";
    if (ageMax !== null && (!Number.isInteger(ageMax) || ageMax < 1 || ageMax > 121)) return "Maximum age must be a whole number of years.";
    if (ageMin !== null && ageMax !== null && ageMax <= ageMin) return "Maximum age must be above minimum age.";
    if (r.cohort.ethnicities !== "any" && (!Array.isArray(r.cohort.ethnicities) || !r.cohort.ethnicities.length)) return "Pick at least one ethnicity group, or choose all ethnicities.";
    if (r.status !== "set") continue;
    const keys = new Set<RrBandKey>();
    for (const b of r.bands as RrBand[]) {
      if (!RR_BAND_ORDER.includes(b.key)) return "Unknown band.";
      if (keys.has(b.key)) return "Each band can appear once per cohort.";
      keys.add(b.key);
      if (!String(b.label || "").trim()) return "Every band needs the word printed on the report.";
      for (const x of [b.min, b.max]) if (x && !Number.isFinite(x.value)) return "Limits must be numbers.";
      if (b.min && b.max && (b.min.value > b.max.value || (b.min.value === b.max.value && !(b.min.inclusive && b.max.inclusive)))) return `${b.label}: the lower limit must be below the upper limit.`;
    }
    if (!keys.size && !r.expected) return "A cohort with a set range needs at least one band.";
  }
  return null;
}

registerHandlers({
  /* Save a draft. Editing an existing draft replaces it in place; otherwise a new version number is taken. */
  "rr/saveDraft": (c, a: { testId: string; rows: RrRow[]; effectiveFrom: string; reason: string; source: string }) => {
    const deny = superadmin(c, "change reference ranges");
    if (deny) return deny;
    if (!RR_TESTS.some((t) => t.id === a.testId)) return c.fail("Unknown test.");
    if (!isDate(a.effectiveFrom)) return c.fail("Choose the date this version takes effect.");
    const reason = String(a.reason || "").trim(), source = String(a.source || "").trim();
    if (reason.length < 10) return c.fail("Say why the range is changing, in a sentence. It is kept in the audit trail.");
    if (!source) return c.fail("Say where the new numbers come from (for example, the laboratory bulletin).");
    const err = rowsError(a.rows);
    if (err) return c.fail(err);
    const rr = c.s.referenceRanges;
    const rows: RrRow[] = (a.rows as RrRow[]).map((r, i) => ({ ...structuredClone(r), id: `${a.testId}-${i + 1}` }));
    const existing = rr.versions.find((v) => v.testId === a.testId && v.status === "draft");
    if (existing) {
      Object.assign(existing, { rows, effectiveFrom: a.effectiveFrom, reason, source, createdBy: me(c), createdAt: c.now });
      c.emit({ verb: "ranges.draft_updated", summary: `${c.first()} updated the draft ${testName(a.testId)} range (version ${existing.version}), effective ${fmtDate(a.effectiveFrom)}. Not in use until published.` });
      return c.ok(`Draft version ${existing.version} updated. It is not in use until a superadmin publishes it.`, "ok", existing.id);
    }
    const version = Math.max(0, ...rr.versions.filter((v) => v.testId === a.testId).map((v) => v.version)) + 1;
    const v: RrVersion = { id: `RRV-${a.testId.toUpperCase()}-${version}`, testId: a.testId, version, status: "draft", effectiveFrom: a.effectiveFrom, rows, reason, source,
      createdBy: me(c), createdAt: c.now, publishedBy: null, publishedAt: null, decidedNote: null };
    rr.versions.push(v);
    c.emit({ verb: "ranges.draft", summary: `${c.first()} drafted version ${version} of the ${testName(a.testId)} range, effective ${fmtDate(a.effectiveFrom)}. Reason: ${reason} Source: ${source}. Not in use until published.` });
    return c.ok(`Draft version ${version} saved. It is not in use until a superadmin publishes it.`, "ok", v.id);
  },

  "rr/publish": (c, a: { versionId: string; note?: string }) => {
    const deny = superadmin(c, "publish reference ranges");
    if (deny) return deny;
    const rr = c.s.referenceRanges;
    const v = rr.versions.find((x) => x.id === a.versionId);
    if (!v || v.status !== "draft") return c.fail("Only a draft can be published.");
    if (rr.settings.secondApprover && v.createdBy === me(c)) return c.fail("Second approval is on: a different superadmin must publish a draft you wrote.");
    const test = RR_TESTS.find((t) => t.id === v.testId)!;
    const prev = rr.versions.filter((x) => x.testId === v.testId && x.status === "published").sort((x, y) => y.version - x.version)[0] || null;
    const impact = draftImpact(c.s as PhState, v);
    const diff = rrDiff(test, prev, v);
    v.status = "published"; v.publishedBy = me(c); v.publishedAt = c.now; v.decidedNote = String(a.note || "").trim() || null;
    /* Re-band results not yet released, each on its own sample date. Released results keep the band and version they were released with. */
    let reBanded = 0;
    if (test.analyte) {
      const released = new Set(c.s.episodes.filter((e) => e.reportState === "released").map((e) => e.id));
      const ix = c.ix();
      c.s.observations.forEach((o, i) => {
        if (o.code !== test.analyte || released.has(o.episodeId)) return;
        const ep = ix.episodeById.get(o.episodeId), person = ep ? ix.personById.get(ep.personId) : undefined;
        if (!ep || !person) return;
        const cl = classifyResult(o.code, o.value, { ...bandCtxFor(person, ep.collectedAt), versions: rr.versions });
        if (cl.band === o.band && cl.rangeVersion === o.rangeVersion && cl.limitText === o.limitText) return;
        c.s.observations[i] = { ...o, band: cl.band, flag: cl.flag, limitText: cl.limitText, rangeVersion: cl.rangeVersion };
        reBanded++;
      });
    }
    const rel = impact.changed.filter((x) => x.released).length, unrel = impact.changed.length - rel;
    c.emit({ verb: "ranges.published", summary: `${c.first()} published version ${v.version} of the ${test.name} range, effective ${fmtDate(v.effectiveFrom)}. ${diff.join(" ")} ${test.analyte ? `${impact.changed.length} of ${impact.checked} demo results change band (${unrel} not yet released, ${rel} already released and listed for clinician review). ${reBanded} unreleased results were re-banded.` : ""}`.trim() });
    return c.ok(`${test.name} version ${v.version} published, effective ${fmtDate(v.effectiveFrom)}. Earlier versions are kept.`);
  },

  "rr/reject": (c, a: { versionId: string; note: string }) => {
    const deny = superadmin(c, "reject a draft range");
    if (deny) return deny;
    const v = c.s.referenceRanges.versions.find((x) => x.id === a.versionId);
    if (!v || v.status !== "draft") return c.fail("Only a draft can be rejected.");
    const note = String(a.note || "").trim();
    if (note.length < 5) return c.fail("Say why the draft is rejected.");
    v.status = "rejected"; v.decidedNote = note; v.publishedBy = me(c); v.publishedAt = c.now;
    c.emit({ verb: "ranges.rejected", summary: `${c.first()} rejected draft version ${v.version} of the ${testName(v.testId)} range: ${note}` });
    return c.ok("Draft rejected. It stays in the history.", "info");
  },

  "rr/setSuperadmin": (c, a: { staffId: StaffId; on: boolean }) => {
    const deny = superadmin(c, "change who the superadmins are");
    if (deny) return deny;
    const st = c.s.referenceRanges.settings;
    const s = c.s.staff.find((x) => x.id === a.staffId);
    if (!s) return c.fail("Unknown staff member.");
    if (a.on) {
      if (st.superadmins.includes(s.id)) return c.fail(`${s.name} is already a superadmin.`);
      st.superadmins.push(s.id);
    } else {
      if (!st.superadmins.includes(s.id)) return c.fail(`${s.name} is not a superadmin.`);
      if (st.superadmins.length === 1) return c.fail("There must always be at least one superadmin.");
      st.superadmins = st.superadmins.filter((x) => x !== s.id);
      if (st.superadmins.length < 2) st.secondApprover = false;
    }
    c.emit({ verb: "ranges.superadmin", summary: `${c.first()} ${a.on ? "made" : "removed"} ${s.name} ${a.on ? "a" : "as a"} reference ranges superadmin.` });
    return c.ok(`${s.name} ${a.on ? "can now" : "can no longer"} change reference ranges.`);
  },

  "rr/setSecondApprover": (c, a: { on: boolean }) => {
    const deny = superadmin(c, "change the approval rule");
    if (deny) return deny;
    const st = c.s.referenceRanges.settings;
    if (a.on && st.superadmins.length < 2) return c.fail("Add a second superadmin first: with one superadmin nobody could publish.");
    if (st.secondApprover === !!a.on) return c.fail("No change.");
    st.secondApprover = !!a.on;
    c.emit({ verb: "ranges.approval_rule", summary: `${c.first()} turned second approval ${a.on ? "on" : "off"} for reference range changes.` });
    return c.ok(a.on ? "A different superadmin must now publish each draft." : "One superadmin may now draft and publish.");
  },

  "rr/setEffectiveBasis": (c, a: { basis: RrEffectiveBasis }) => {
    const deny = superadmin(c, "change which date decides the range");
    if (deny) return deny;
    if (!["sample", "reported", "reviewed"].includes(a.basis)) return c.fail("Unknown date rule.");
    const st = c.s.referenceRanges.settings;
    if (st.effectiveBasis === a.basis) return c.fail("No change.");
    st.effectiveBasis = a.basis;
    c.emit({ verb: "ranges.date_rule", summary: `${c.first()} set the range date rule to: ${a.basis === "sample" ? "sample collection date" : a.basis === "reported" ? "laboratory report date" : "clinician review date"}.` });
    return c.ok("Date rule changed. It applies to results judged from now on.");
  },

  /* Test run: logs that a test patient was run through the ranges. Nothing is saved to any patient. */
  "rr/logTestRun": (c, a: { name: string; results: number; flagged: number; date: string; versions: string[] }) => {
    const deny = c.staffOnly("log a test run");
    if (deny) return deny;
    if (!isDate(a.date) || !Number.isInteger(a.results) || a.results < 1) return c.fail("Enter at least one result to log a test run.");
    const name = String(a.name || "Test patient").trim().slice(0, 60);
    c.emit({ verb: "ranges.test_run", simulated: true, summary: `${c.first()} ran a test patient (${name}) through the reference ranges for a sample date of ${fmtDate(a.date)}: ${a.results} results, ${a.flagged} outside normal${a.flagged ? ", so individual review" : ", routine release eligible"}. Range versions used: ${(a.versions || []).join(", ") || "none"}. Test only: nothing saved to any patient.` });
    return c.ok("Test run logged in Activity. Nothing was saved to any patient.");
  },

  "rr/answerQuestion": (c, a: { id: string; answer: string; reopen?: boolean }) => {
    const deny = superadmin(c, "record an answer");
    if (deny) return deny;
    const q = RR_QUESTIONS.find((x) => x.id === a.id);
    const st = c.s.referenceRanges.questions[a.id];
    if (!q || !st) return c.fail("Unknown question.");
    if (a.reopen) {
      st.status = "open";
      c.emit({ verb: "ranges.question_reopened", summary: `${c.first()} reopened the reference ranges question: ${q.topic}.` });
      return c.ok("Reopened.", "info");
    }
    const answer = String(a.answer || "").trim();
    if (answer.length < 2) return c.fail("Write the answer, or 'Agreed' to accept the default.");
    Object.assign(st, { status: "answered", answer, by: me(c), at: c.now });
    c.emit({ verb: "ranges.question_answered", summary: `${c.first()} answered the reference ranges question "${q.topic}": ${answer}` });
    return c.ok("Answer recorded. Any range changes it needs are made as a draft.");
  },
});

export const rrAct = {
  saveDraft: (testId: string, rows: RrRow[], effectiveFrom: string, reason: string, source: string) => ({ type: "rr/saveDraft", testId, rows, effectiveFrom, reason, source }),
  publish: (versionId: string, note?: string) => ({ type: "rr/publish", versionId, note }),
  reject: (versionId: string, note: string) => ({ type: "rr/reject", versionId, note }),
  setSuperadmin: (staffId: StaffId, on: boolean) => ({ type: "rr/setSuperadmin", staffId, on }),
  setSecondApprover: (on: boolean) => ({ type: "rr/setSecondApprover", on }),
  setEffectiveBasis: (basis: RrEffectiveBasis) => ({ type: "rr/setEffectiveBasis", basis }),
  answerQuestion: (id: string, answer: string, reopen?: boolean) => ({ type: "rr/answerQuestion", id, answer, reopen }),
};
