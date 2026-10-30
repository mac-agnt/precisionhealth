/* Lab CSV import: a plain CSV parser (no library), identity matching on three identifiers, the
   bundled sample file, the "Awaiting lab" status and the selectors behind the matching queue.

   Matching rule (shown on screen): a lab row attaches to a patient automatically only when all
   three agree with the patient's record:
     1. Name (surname and first name; capitals, accents and punctuation are ignored)
     2. Date of birth
     3. Unique ID: the Precision ID on the lab request form (COMP0 and four digits). A specimen
        barcode (PH-S-...) is accepted in the same column, because it identifies the same episode.
   Anything less goes to the matching queue for a person to decide. Nothing is fuzzy-matched
   automatically. Pure functions only: the handlers live in labCsvActions.ts. */
import type { AnalyteCode, Episode, Id, ImportRow, Iso, LocalDate, Person, PhState, StaffId } from "./types";
import { ANALYTES, CALCULATED_ANALYTES, COMPREHENSIVE_PANEL, formatResult } from "./constants";
import { sessionUsesPoc } from "./nurseOps";
import { ix, memo } from "./selectors/core";
import { episodeHeldByRow, expectedTests } from "./selectors/clinical";
import { fmtDayMonth, fmtTime } from "./time";

/* ---------- state ---------- */
export type LabRecordStatus = "matched" | "flagged" | "resolved" | "rejected" | "duplicate";
export interface LabFileIdentity { surname: string; given: string; dobText: string; dob: LocalDate | null; uniqueId: string }
export interface LabResultCell { code: AnalyteCode; valueText: string; unit: string }
export interface LabDiff { name: boolean; dob: boolean; id: boolean }
export interface LabRecord {
  id: Id; // LAB-001-R01
  uploadId: Id;
  /** First line of this patient in the file (2 is the first line under the header). */
  line: number;
  file: LabFileIdentity;
  results: LabResultCell[];
  status: LabRecordStatus;
  /** The episode the results were attached to (matched or resolved). */
  episodeId: Id | null;
  /** Closest patient episode found for a flagged row, or null when nothing in Pulse is close. */
  candidateEpisodeId: Id | null;
  /** true where the file differs from the candidate's record. */
  diff: LabDiff;
  /** Results created on the episode when attached (duplicates are never created twice). */
  created: number;
  decision: null | { by: StaffId; at: Iso; reason: string; kind: "resolved" | "rejected" };
}
export interface LabUpload {
  id: Id; // LAB-001
  batchId: Id; // the ImportBatch that holds the committed rows
  filename: string;
  at: Iso;
  by: StaffId;
  /** Set when the file was dropped on one patient's record: rows were matched only against that patient. */
  personId: Id | null;
  columns: string[];
  format: "wide" | "long";
  /** Patient rows read from the file, after grouping. */
  rows: number;
  /** Lines in the file that were not for this patient (patient record uploads only). */
  skipped: number;
}
export interface LabCsvState { uploads: LabUpload[]; records: LabRecord[] }
export const initialLabCsvState = (): LabCsvState => ({ uploads: [], records: [] });

/* ---------- CSV parsing ---------- */
/** RFC 4180 style: quoted fields, doubled quotes, commas or semicolons, CRLF or LF. */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s: string) => fold(s).replace(/ /g, "");

type IdentityField = "uniqueId" | "surname" | "given" | "name" | "dob" | "collected" | "test" | "result" | "unit";
const FIELD_ALIASES: Record<IdentityField, string[]> = {
  uniqueId: ["precision id", "precisionid", "unique id", "uniqueid", "ph id", "patient id", "patientid", "specimen id", "specimen", "sample id", "barcode", "lab number", "request id", "id"],
  surname: ["surname", "last name", "lastname", "family name", "family"],
  given: ["first name", "firstname", "forename", "given name", "given"],
  name: ["name", "patient name", "patient", "full name", "surname initial", "surname/initial"],
  dob: ["dob", "date of birth", "birth date", "d o b", "birthdate"],
  collected: ["collected", "collection date", "sample date", "result date", "date collected", "date"],
  test: ["test", "analyte", "test code", "test name", "code"],
  result: ["result", "value", "result value"],
  unit: ["unit", "units"],
};
export const LAB_FIELD_LABEL: Record<IdentityField, string> = {
  uniqueId: "Unique ID", surname: "Surname", given: "First name", name: "Name", dob: "Date of birth", collected: "Date collected", test: "Test", result: "Result", unit: "Unit",
};

/** A header cell to an analyte: the code (TC, HBA1C) or the name (Total cholesterol), ignoring a unit in brackets. */
export function analyteForHeader(h: string): AnalyteCode | null {
  const k = squash(h.replace(/\(.*?\)|\[.*?\]/g, ""));
  if (!k) return null;
  for (const code of Object.keys(ANALYTES) as AnalyteCode[]) {
    if (CALCULATED_ANALYTES.includes(code)) continue;
    const a = ANALYTES[code];
    if (squash(code) === k || squash(a.name) === k || squash(a.reportName || "") === k) return code;
  }
  const extra: Record<string, AnalyteCode> = { cholesterol: "TC", totalchol: "TC", hdlc: "HDL", ldlc: "LDL", triglyceride: "TG", hba1c: "HBA1C", haemoglobin: "HB", hemoglobin: "HB", vitamind: "VITD", vitb12: "B12", b12: "B12", folicacid: "FOLATE", calcium: "CA", magnesium: "MG", phosphate: "PO4", psa: "PSA", fit: "FIT", ferritin: "FERR", tsh: "TSH", freet4: "FT4" };
  return extra[k] || null;
}

function fieldForHeader(h: string): IdentityField | null {
  const k = fold(h);
  for (const f of Object.keys(FIELD_ALIASES) as IdentityField[]) if (FIELD_ALIASES[f].includes(k)) return f;
  return null;
}

/** DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD to YYYY-MM-DD. Irish day-first order. */
export function parseDob(text: string): LocalDate | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
    if (r[3].length === 2) y += y > 30 ? 1900 : 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(dt.getTime()) || dt.getUTCDate() !== d) return null;
  return iso;
}

export interface ColumnMap { header: string; kind: "identity" | "test" | "ignored"; field?: IdentityField; code?: AnalyteCode; label: string }
export interface ParsedRecord { line: number; file: LabFileIdentity; results: LabResultCell[]; problems: string[] }
export interface ParsedLabFile { ok: boolean; error: string | null; format: "wide" | "long"; columns: ColumnMap[]; lines: number; records: ParsedRecord[] }

function splitName(full: string): { surname: string; given: string } {
  const t = full.trim();
  if (t.includes(",")) { const [s, g] = t.split(","); return { surname: s.trim(), given: (g || "").trim() }; }
  const parts = t.split(/\s+/);
  if (parts.length < 2) return { surname: t, given: "" };
  return { surname: parts.slice(1).join(" "), given: parts[0] };
}

/**
 * Reads a lab CSV in either shape:
 *   wide: one line per patient, one column per test (TC, HDL, ... or the test names);
 *   long: one line per result, with Test and Result columns. Lines are grouped per patient.
 */
export function parseLabCsv(text: string): ParsedLabFile {
  const empty = (error: string): ParsedLabFile => ({ ok: false, error, format: "wide", columns: [], lines: 0, records: [] });
  if (!text || !text.trim()) return empty("The file is empty.");
  const rows = parseCsvText(text);
  if (rows.length < 2) return empty("The file has a header but no result lines.");
  const header = rows[0];
  const columns: ColumnMap[] = header.map((h) => {
    const f = fieldForHeader(h);
    if (f) return { header: h, kind: "identity", field: f, label: LAB_FIELD_LABEL[f] };
    const code = analyteForHeader(h);
    if (code) return { header: h, kind: "test", code, label: ANALYTES[code].name };
    return { header: h, kind: "ignored", label: "Not used" };
  });
  const col = (f: IdentityField) => columns.findIndex((c) => c.field === f);
  const iId = col("uniqueId"), iSur = col("surname"), iGiv = col("given"), iName = col("name"), iDob = col("dob");
  const iTest = col("test"), iRes = col("result"), iUnit = col("unit");
  const testCols = columns.map((c, i) => (c.kind === "test" ? i : -1)).filter((i) => i >= 0);
  const long = iTest >= 0 && iRes >= 0;
  if (!long && !testCols.length) return empty("No test columns were recognised. Use test codes such as TC, HDL or HBA1C as column headings, or a Test and a Result column.");
  if (iId < 0) return empty("No Unique ID column. Add a column called Precision ID (or Unique ID or Specimen ID).");
  if (iDob < 0) return empty("No date of birth column. Add a column called DOB or Date of birth.");
  if (iSur < 0 && iName < 0) return empty("No name column. Add Surname and First name columns, or one Name column.");
  if (long) columns.forEach((c) => { if (c.kind === "test") { c.kind = "ignored"; c.label = "Not used"; } });

  const get = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i] : "");
  const identity = (r: string[]): LabFileIdentity => {
    const nm = iSur >= 0 ? { surname: get(r, iSur), given: get(r, iGiv) } : splitName(get(r, iName));
    const dobText = get(r, iDob);
    return { surname: nm.surname, given: nm.given, dobText, dob: parseDob(dobText), uniqueId: get(r, iId).toUpperCase().replace(/\s+/g, "") };
  };
  const cellFor = (code: AnalyteCode, raw: string, unit: string, problems: string[]): LabResultCell | null => {
    const v = raw.trim();
    if (!v) return null;
    const q = ANALYTES[code].qualitative;
    if (q) {
      const w = v.toLowerCase();
      if (w !== q.normal.toLowerCase() && w !== q.abnormal.toLowerCase()) { problems.push(`${ANALYTES[code].name}: "${v}" is not ${q.normal} or ${q.abnormal}`); return null; }
      return { code, valueText: w === q.normal.toLowerCase() ? q.normal : q.abnormal, unit: ANALYTES[code].unit };
    }
    const n = Number(v.replace(/^[<>]=?/, ""));
    if (!Number.isFinite(n) || n < 0) { problems.push(`${ANALYTES[code].name}: "${v}" is not a number`); return null; }
    return { code, valueText: v.replace(/^[<>]=?/, ""), unit: unit || ANALYTES[code].unit };
  };

  const records: ParsedRecord[] = [];
  if (!long) {
    rows.slice(1).forEach((r, i) => {
      const problems: string[] = [];
      const results = testCols.map((ci) => cellFor(columns[ci].code!, get(r, ci), "", problems)).filter((x): x is LabResultCell => !!x);
      records.push({ line: i + 2, file: identity(r), results, problems });
    });
  } else {
    const byKey = new Map<string, ParsedRecord>();
    rows.slice(1).forEach((r, i) => {
      const file = identity(r);
      const key = `${file.uniqueId}|${squash(file.surname)}|${squash(file.given)}|${file.dobText}`;
      let rec = byKey.get(key);
      if (!rec) { rec = { line: i + 2, file, results: [], problems: [] }; byKey.set(key, rec); records.push(rec); }
      const code = analyteForHeader(get(r, iTest));
      if (!code) { rec.problems.push(`Line ${i + 2}: test "${get(r, iTest)}" is not recognised`); return; }
      const c = cellFor(code, get(r, iRes), get(r, iUnit), rec.problems);
      if (c && !rec.results.some((x) => x.code === c.code)) rec.results.push(c);
    });
  }
  const usable = records.filter((x) => x.results.length);
  if (!usable.length) return { ok: false, error: "No result values were found in the file.", format: long ? "long" : "wide", columns, lines: rows.length - 1, records };
  return { ok: true, error: null, format: long ? "long" : "wide", columns, lines: rows.length - 1, records: usable };
}

/* ---------- matching ---------- */
export const nameMatches = (p: Pick<Person, "given" | "family">, f: Pick<LabFileIdentity, "surname" | "given">) => squash(p.family) === squash(f.surname) && squash(p.given) === squash(f.given);
export const idMatches = (ep: Episode, uniqueId: string) => {
  const u = uniqueId.toUpperCase();
  return !!u && (ep.screeningRef.toUpperCase() === u || ep.specimenIds.some((s) => s.toUpperCase() === u));
};
export function diffFor(state: PhState, ep: Episode, f: LabFileIdentity): LabDiff {
  const p = ix(state).personById.get(ep.personId)!;
  return { name: !nameMatches(p, f), dob: !f.dob || f.dob !== p.dob, id: !idMatches(ep, f.uniqueId) };
}
const differs = (d: LabDiff) => d.name || d.dob || d.id;

function episodeById(state: PhState, uniqueId: string): Episode | null {
  if (!uniqueId) return null;
  return memo(state, "lab:id:" + uniqueId, () => state.episodes.find((e) => idMatches(e, uniqueId)) || null);
}
/** The episode of a person that lab results would belong to: the latest one still waiting for them, otherwise the latest. */
export function labEpisodeFor(state: PhState, personId: Id): Episode | null {
  const eps = (ix(state).episodesByPerson.get(personId) || []).slice().sort((a, b) => (a.collectedAt < b.collectedAt ? 1 : -1));
  return eps.find((e) => e.reportState === "awaiting_results") || eps[0] || null;
}

export type MatchOutcome =
  | { kind: "matched"; episode: Episode; newResults: number }
  | { kind: "duplicate"; episode: Episode | null; why: string }
  | { kind: "flagged"; candidate: Episode | null; diff: LabDiff }
  | { kind: "skipped"; why: string };

/** Results in the row that the episode still waits for. Already received results are never created twice. */
export function newResultsFor(state: PhState, ep: Episode, results: LabResultCell[]): LabResultCell[] {
  const pending = new Set(expectedTests(state, ep).filter((t) => t.status === "pending").map((t) => t.code));
  return results.filter((r) => pending.has(r.code));
}

/**
 * One file row against Pulse. personId limits matching to that patient (a drop on the patient's
 * record): rows that share no identifier with the patient are skipped, not queued.
 */
export function matchRecord(state: PhState, rec: { file: LabFileIdentity; results: LabResultCell[] }, personId: Id | null): MatchOutcome {
  const I = ix(state);
  const byId = episodeById(state, rec.file.uniqueId);
  // An open flagged row with the same identity and Unique ID is already in the queue.
  const queued = state.labCsv.records.find((r) => r.status === "flagged" && r.file.uniqueId === rec.file.uniqueId && squash(r.file.surname) === squash(rec.file.surname) && squash(r.file.given) === squash(rec.file.given) && r.file.dobText === rec.file.dobText);
  if (queued) return { kind: "duplicate", episode: null, why: "Already waiting in the matching queue" };
  if (personId) {
    const own = byId && byId.personId === personId ? byId : labEpisodeFor(state, personId);
    if (!own) return { kind: "skipped", why: "This person has no screening episode" };
    const d = diffFor(state, own, rec.file);
    if (d.name && d.dob && d.id) return { kind: "skipped", why: "Not this patient" };
    if (differs(d)) return { kind: "flagged", candidate: own, diff: d };
    const fresh = newResultsFor(state, own, rec.results).length;
    return fresh ? { kind: "matched", episode: own, newResults: fresh } : { kind: "duplicate", episode: own, why: "Results already in Pulse" };
  }
  if (byId) {
    const d = diffFor(state, byId, rec.file);
    if (differs(d)) return { kind: "flagged", candidate: byId, diff: d };
    const fresh = newResultsFor(state, byId, rec.results).length;
    return fresh ? { kind: "matched", episode: byId, newResults: fresh } : { kind: "duplicate", episode: byId, why: "Results already in Pulse" };
  }
  // No episode carries this Unique ID: suggest the closest patient on name and date of birth.
  let best: { p: Person; score: number } | null = null;
  for (const p of state.persons) {
    const s = (nameMatches(p, rec.file) ? 2 : squash(p.family) === squash(rec.file.surname) ? 1 : 0) + (rec.file.dob && p.dob === rec.file.dob ? 2 : 0);
    if (s >= 2 && (!best || s > best.score) && I.episodesByPerson.get(p.id)?.length) best = { p, score: s };
  }
  const cand = best ? labEpisodeFor(state, best.p.id) : null;
  return { kind: "flagged", candidate: cand, diff: cand ? diffFor(state, cand, rec.file) : { name: true, dob: true, id: true } };
}

export interface LabPreviewRow { rec: ParsedRecord; outcome: MatchOutcome }
export interface LabPreview { file: ParsedLabFile; rows: LabPreviewRow[]; matched: number; flagged: number; duplicate: number; skipped: number; newResults: number }
export function previewLabFile(state: PhState, text: string, personId: Id | null): LabPreview {
  const file = parseLabCsv(text);
  const rows = file.ok ? file.records.map((rec) => ({ rec, outcome: matchRecord(state, rec, personId) })) : [];
  const n = (k: MatchOutcome["kind"]) => rows.filter((r) => r.outcome.kind === k).length;
  const newResults = rows.reduce((s, r) => s + (r.outcome.kind === "matched" ? r.outcome.newResults : 0), 0);
  return { file, rows, matched: n("matched"), flagged: n("flagged"), duplicate: n("duplicate"), skipped: n("skipped"), newResults };
}

/* ---------- the matching queue ---------- */
export interface QueueItem {
  key: string;
  source: "csv" | "feed";
  record: LabRecord | null;
  row: ImportRow | null;
  file: LabFileIdentity;
  candidate: Episode | null;
  diff: LabDiff;
  results: number;
  filename: string;
  receivedAt: Iso;
}
/** Every lab row waiting for a person: flagged CSV rows and Eurofins feed rows held for identity. Oldest first. */
export function labQueue(state: PhState): QueueItem[] {
  return memo(state, "lab:queue", () => {
    const I = ix(state);
    const out: QueueItem[] = [];
    for (const r of state.labCsv.records) {
      if (r.status !== "flagged") continue;
      const up = state.labCsv.uploads.find((u) => u.id === r.uploadId)!;
      const cand = r.candidateEpisodeId ? I.episodeById.get(r.candidateEpisodeId) || null : null;
      out.push({ key: r.id, source: "csv", record: r, row: null, file: r.file, candidate: cand, diff: cand ? diffFor(state, cand, r.file) : r.diff, results: r.results.length, filename: up.filename, receivedAt: up.at });
    }
    for (const row of state.importRows) {
      if (row.state !== "quarantined") continue;
      const held = episodeHeldByRow(state, row.id) || null;
      const b = state.batches.find((x) => x.id === row.batchId);
      const [sur, giv] = row.nameInFile.split(",").map((x) => x.trim());
      const file: LabFileIdentity = { surname: sur || row.nameInFile, given: giv || "", dobText: row.dobInFile || "", dob: row.dobInFile, uniqueId: row.specimenKey };
      let diff: LabDiff = { name: true, dob: true, id: true };
      if (held) {
        const p = I.personById.get(held.personId)!;
        // The feed carries surname and initial only, so the name check compares the initial.
        diff = { name: squash(p.family) !== squash(file.surname) || (!!file.given && squash(p.given)[0] !== squash(file.given)[0]), dob: !row.dobInFile || row.dobInFile !== p.dob, id: !idMatches(held, row.specimenKey) };
      }
      out.push({ key: row.id, source: "feed", record: null, row, file, candidate: held, diff, results: 1, filename: b ? b.filename : row.batchId, receivedAt: b ? b.processedAt : state.clock.nowUtc });
    }
    return out.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0));
  });
}

/* ---------- the import log ---------- */
export interface LabLogEntry { batchId: Id; uploadId: Id | null; filename: string; at: Iso; by: string; matched: number; flagged: number; rejected: number; results: number; personId: Id | null }
export function labLog(state: PhState): LabLogEntry[] {
  return memo(state, "lab:log", () => {
    const I = ix(state);
    const out: LabLogEntry[] = [];
    for (const u of state.labCsv.uploads) {
      const recs = state.labCsv.records.filter((r) => r.uploadId === u.id);
      out.push({
        batchId: u.batchId, uploadId: u.id, filename: u.filename, at: u.at, by: staffDisplayName(state, u.by),
        matched: recs.filter((r) => r.status === "matched" || r.status === "resolved").length, flagged: recs.filter((r) => r.status === "flagged").length,
        rejected: recs.filter((r) => r.status === "rejected").length, results: recs.reduce((n, r) => n + r.created, 0), personId: u.personId,
      });
    }
    for (const b of state.batches) {
      if (state.labCsv.uploads.some((u) => u.batchId === b.id)) continue;
      const rows = state.importRows.filter((r) => r.batchId === b.id);
      out.push({
        batchId: b.id, uploadId: null, filename: b.filename, at: b.processedAt, by: b.kind === "sample" ? "Sample delivery" : "Eurofins feed",
        matched: rows.filter((r) => r.state === "imported" || r.state === "resolved").length, flagged: rows.filter((r) => r.state === "quarantined").length, rejected: 0,
        results: rows.filter((r) => r.observationId).length, personId: null,
      });
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  });
}

/** "Dr Neil Reddy": the name staff are shown by on records and in logs. */
export function staffDisplayName(state: PhState, id: string | null | undefined): string {
  if (!id) return "Unassigned";
  const s = ix(state).staffById.get(id);
  return s ? s.displayName || s.name : id;
}
/** "Released by Dr Neil Reddy at 14:32, 30 Oct", or null when the version is not released. */
export function releasedLine(state: PhState, v: { releasedAt: Iso | null; releasedBy: string | null } | null | undefined): string | null {
  if (!v || !v.releasedAt) return null;
  return `Released by ${staffDisplayName(state, v.releasedBy)} at ${fmtTime(v.releasedAt)}, ${fmtDayMonth(v.releasedAt)}`;
}

/* ---------- "Awaiting lab" ---------- */
/**
 * True for an episode from a lab bloods session (not point of care) whose laboratory results are
 * still to come: shown as "Awaiting lab" until a lab CSV is matched to it.
 */
export function awaitingLab(state: PhState, ep: Episode): boolean {
  if (ep.reportState !== "awaiting_results" || ep.hold) return false;
  const s = ix(state).sessionById.get(ep.sessionId);
  if (!s || sessionUsesPoc(s)) return false;
  return expectedTests(state, ep).some((t) => t.status === "pending");
}
export const awaitingLabEpisodes = (state: PhState) => memo(state, "lab:await", () => state.episodes.filter((e) => awaitingLab(state, e)));

/* ---------- the bundled sample file ---------- */
const BASE: Partial<Record<AnalyteCode, number>> = {
  TC: 4.6, HDL: 1.5, LDL: 2.6, TG: 1.2, HBA1C: 36, UREA: 5.1, CREAT: 72, URATE: 290, HB: 13.8, WCC: 6.2, PLT: 250, BILI: 9, TPROT: 72, ALP: 75, GGT: 22, AST: 21, ALT: 24,
  FT4: 13.5, TSH: 1.8, IRON: 17.5, FERR: 80, TIBC: 60, VITD: 68, B12: 420, FOLATE: 8.2, CA: 2.36, MG: 0.86, PO4: 1.1, PSA: 0.8,
};
/** Who is in the sample file, and how the file row differs from Pulse for the flagged ones. */
const SAMPLE_PEOPLE: Array<{ episodeId: Id; values?: Partial<Record<AnalyteCode, number>>; name?: { surname: string; given: string }; dob?: LocalDate; uniqueId?: string }> = [
  { episodeId: "PH-E-1181", values: { TC: 4.3, HDL: 1.7, LDL: 2.2, VITD: 74 } },
  { episodeId: "PH-E-1186", values: { TC: 5.6, LDL: 3.6, HDL: 1.3, HBA1C: 44, VITD: 38, PSA: 0.4 } },
  { episodeId: "PH-E-1200", values: { FERR: 11, HB: 11.6, IRON: 7.8 } },
  { episodeId: "PH-E-1206", dob: "1977-02-09", values: { TG: 2.4, TC: 5.2, HB: 14.9 } },
  { episodeId: "PH-E-1212", name: { surname: "Bourke", given: "Helen" } },
];
const fmtDmy = (d: LocalDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const SAMPLE_LAB_FILENAME = "eurofins_bloods_results_sample.csv";

function sampleLine(state: PhState, s: (typeof SAMPLE_PEOPLE)[number], cols: AnalyteCode[]): string | null {
  const I = ix(state);
  const ep = I.episodeById.get(s.episodeId);
  if (!ep) return null;
  const p = I.personById.get(ep.personId)!;
  const male = p.sex === "male";
  const expected = new Set(ep.expectedTests.map((t) => t.code));
  const cells = cols.map((code) => {
    if (!expected.has(code)) return "";
    if (code === "FIT") return "Negative";
    const v = s.values?.[code] ?? (code === "HB" && male ? 14.6 : code === "CREAT" && male ? 88 : BASE[code]!);
    return formatResult(code, v);
  });
  const name = s.name || { surname: p.family, given: p.given };
  return [s.uniqueId || ep.screeningRef, name.surname, name.given, fmtDmy(s.dob || p.dob), fmtDmy(ep.collectedAt.slice(0, 10)), ...cells].map(csvCell).join(",");
}

/** The bundled sample: three rows that match on all three identifiers, two that need a person, one unknown. */
export function sampleLabCsv(state: PhState): string {
  const cols: AnalyteCode[] = [...COMPREHENSIVE_PANEL, "PSA", "FIT"];
  const head = ["Precision ID", "Surname", "First name", "Date of birth", "Collected", ...cols].join(",");
  const lines = SAMPLE_PEOPLE.map((s) => sampleLine(state, s, cols)).filter((x): x is string => !!x);
  const unknown = ["COMP09999", "Walsh", "Peter", "03/04/1975", "01/10/2026", ...cols.map((c) => (c === "TC" ? "4.9" : c === "HDL" ? "1.2" : c === "LDL" ? "3.1" : c === "TG" ? "1.4" : c === "HBA1C" ? "39" : ""))].join(",");
  return [head, ...lines, unknown].join("\r\n") + "\r\n";
}

/** A one-patient sample for the patient record drop zone: this person's own lab row, matching on all three. */
export function sampleLabCsvFor(state: PhState, personId: Id): { text: string; filename: string } | null {
  const ep = labEpisodeFor(state, personId);
  if (!ep) return null;
  const cols = [...COMPREHENSIVE_PANEL, "PSA", "FIT"].filter((c) => ep.expectedTests.some((t) => t.code === c)) as AnalyteCode[];
  const head = ["Precision ID", "Surname", "First name", "Date of birth", "Collected", ...cols].join(",");
  const line = sampleLine(state, { episodeId: ep.id, values: SAMPLE_PEOPLE.find((s) => s.episodeId === ep.id)?.values }, cols);
  if (!line) return null;
  return { text: `${head}\r\n${line}\r\n`, filename: `eurofins_${ep.screeningRef}_results.csv` };
}
