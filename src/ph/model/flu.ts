/* Flu: bookings by week, projected versus actual, vaccine stock and orders, cold chain
   (RECORDING.md section 8; the cold-chain fields come from the End of Day form, section 4).

   Client material used as given: the Irish Life Flu board grouped by week beginning, its columns,
   the 2025 weekly figures for the first five weeks, the sample batch label "5DE36D2 Exp 05/26",
   the running total of vaccines in stock versus allocated, and Precision's own flu bookings
   waiting for vaccine supply. Everything else is fictional and deterministic: client companies,
   addresses, Eircodes, suppliers, quantities, later batch numbers and the 2025 weeks after
   10 November, which are clearly marked as sample figures.

   Kept small (about 130 clinics, a handful of orders and batches): the reducer deep-clones the
   state on every action. Handlers live in src/ph/pages/Flu/actions.ts. */
import type { Hhmm, Iso, LocalDate } from "./time";
import { addDays, startOfWeek } from "./time";
import type { StaffId } from "./types";
import type { EndOfDaySubmission } from "./nurseOps";
import { makeRng } from "./rng";
import type { Rng } from "./rng";

/* ---------- types ---------- */

/** Flu season by the year it starts in: the 2026 season runs from September 2026 into spring 2027. */
export type FluSeason = number;
export type FluChannel = "ilh" | "precision";
/** requested: a Precision client request not yet slotted into a week (blocked while waiting for supply). */
export type FluClinicStatus = "requested" | "scheduled" | "completed" | "cancelled";
export type FluIntake = "ilh_form" | "precision_link" | "help_scout" | "board";
export type FluReading = "pre" | "intermediate" | "post";

export interface FluColdChain {
  preC: number | null;
  intermediateC: number | null;
  postC: number | null;
}

export interface FluClinic {
  id: string; // FLU-26-001
  season: FluSeason;
  channel: FluChannel;
  /** Board item, e.g. the ILH Flu booking form reference "ILH Flu 26-014". */
  item: string;
  company: string;
  address: string;
  /** Empty when the client has not confirmed a site yet. */
  eircode: string;
  projected: number;
  actual: number | null;
  date: LocalDate | null;
  start: Hhmm | null;
  /** Precision staff onsite from the demo profiles. */
  staffIds: StaffId[];
  /** Other nurses on Precision's duty rota who are not demo profiles. */
  rotaNurses: number;
  status: FluClinicStatus;
  intake: FluIntake;
  receivedOn: LocalDate;
  /** Week the client asked for, for Precision requests. */
  preferredWeek: LocalDate | null;
  batchId: string | null;
  coldChain: FluColdChain | null;
  /** End of Day submission the actuals and readings were taken from. */
  eodId: string | null;
  recordedBy: StaffId | null;
  recordedAt: Iso | null;
}

export interface FluOrder {
  id: string; // FVO-26-01
  season: FluSeason;
  supplier: string;
  quantity: number;
  orderedOn: LocalDate;
  expectedOn: LocalDate;
  status: "on_order" | "delivered";
  deliveredOn: LocalDate | null;
  /** Sample batch label offered when the delivery is recorded. Fictional. */
  sampleBatch: { code: string; expiry: string } | null;
  note: string;
}

export interface FluBatch {
  id: string; // FB-26-01
  season: FluSeason;
  orderId: string;
  code: string; // 5DE36D2
  expiry: string; // MM/YY
  quantity: number;
  receivedOn: LocalDate;
}

export interface FluWastage {
  id: string; // FW-26-01
  season: FluSeason;
  batchId: string;
  doses: number;
  reason: string;
  on: LocalDate;
  by: StaffId;
  /** Clinic or End of Day submission the wastage came from, when it followed an excursion. */
  sourceKey: string | null;
}

export type FluFollowUpAction = "quarantined" | "manufacturer_advice" | "discarded" | "rechecked" | "other";
export interface FluFollowUp {
  id: string; // FCF-001
  /** Clinic id, or the End of Day submission id when the readings are not matched to a clinic. */
  key: string;
  action: FluFollowUpAction;
  note: string;
  dosesDiscarded: number;
  at: Iso;
  by: StaffId;
}

export interface FluState {
  version: 1;
  /** Precision's own flu bookings are live only once vaccine supply arrives. */
  precisionLive: boolean;
  liveChange: { at: Iso; by: StaffId; live: boolean } | null;
  clinics: FluClinic[];
  orders: FluOrder[];
  batches: FluBatch[];
  wastage: FluWastage[];
  followUps: FluFollowUp[];
  /** How many sample form submissions have been taken in this session. */
  intake: { ilh: number; precision: number };
}

/* ---------- constants ---------- */

export const FLU_SEASON_CURRENT: FluSeason = 2026;
export const FLU_SEASON_ARCHIVE: FluSeason = 2025;
export const FLU_SAFE_MIN_C = 2;
export const FLU_SAFE_MAX_C = 8;
/** Who manages flu: bookings, staffing, stock and the cold chain. */
export const FLU_MANAGERS: readonly StaffId[] = ["stephen", "martina", "brenda"];
/** Read-only across every flu clinic: the Medical Director and the Director of Nursing. */
export const FLU_VIEW_ALL: readonly StaffId[] = ["neil", "liz"];
/** Vaccinators among the demo profiles. Ian is a wellness advisor and goes as support. */
export const FLU_VACCINATORS: readonly StaffId[] = ["liz", "fiona", "anita"];
export const FLU_SUPPORT: readonly StaffId[] = ["ian"];
/** Only Stephen opens Precision's own flu bookings. */
export const FLU_SUPPLY_OWNER: StaffId = "stephen";

export type FluAccess = "manage" | "all" | "own" | "none";
/** Frontend visibility simulation: managers act, the two directors view all, nurses see their own clinics. */
export function fluAccessFor(personaId: string): FluAccess {
  if ((FLU_MANAGERS as readonly string[]).includes(personaId)) return "manage";
  if ((FLU_VIEW_ALL as readonly string[]).includes(personaId)) return "all";
  if ((FLU_VACCINATORS as readonly string[]).includes(personaId) || (FLU_SUPPORT as readonly string[]).includes(personaId)) return "own";
  return "none";
}

export const FLU_FOLLOWUP_ACTIONS: Array<{ id: FluFollowUpAction; label: string }> = [
  { id: "quarantined", label: "Vaccines quarantined pending advice" },
  { id: "manufacturer_advice", label: "Manufacturer stability advice sought and followed" },
  { id: "discarded", label: "Affected doses discarded and recorded as wastage" },
  { id: "rechecked", label: "Thermometer or cool box checked, reading confirmed" },
  { id: "other", label: "Other action, described in the note" },
];

export const FLU_READING_LABEL: Record<FluReading, string> = { pre: "Pre-vaccine", intermediate: "Intermediate", post: "Post-vaccine" };

export interface FluWeekDef {
  week: LocalDate;
  projected: number;
  actual: number | null;
  clinics: number;
  /** client: Stephen's 2025 board. sample: plausible demo figures. plan: the seeded 2026 board. */
  source: "client" | "sample" | "plan";
  skipMonday?: boolean;
  note?: string;
}

/** Irish Life Flu 2025, week beginning. The first five weeks are Stephen's figures from the walkthrough. */
export const FLU_WEEKS_2025: FluWeekDef[] = [
  { week: "2025-10-13", projected: 944, actual: 834, clinics: 9, source: "client" },
  { week: "2025-10-20", projected: 975, actual: 708, clinics: 9, source: "client" },
  { week: "2025-10-27", projected: 100, actual: 93, clinics: 1, source: "client", skipMonday: true, note: "Mid-term week with the October bank holiday" },
  { week: "2025-11-03", projected: 950, actual: 736, clinics: 9, source: "client" },
  { week: "2025-11-10", projected: 1280, actual: 986, clinics: 12, source: "client" },
  { week: "2025-11-17", projected: 820, actual: 671, clinics: 8, source: "sample" },
  { week: "2025-11-24", projected: 610, actual: 512, clinics: 6, source: "sample" },
  { week: "2025-12-01", projected: 240, actual: 205, clinics: 3, source: "sample" },
];

/** Irish Life Flu 2026 as booked so far: the coming eight weeks. Fictional clients and numbers. */
export const FLU_WEEKS_2026: FluWeekDef[] = [
  { week: "2026-10-12", projected: 880, actual: null, clinics: 9, source: "plan" },
  { week: "2026-10-19", projected: 1040, actual: null, clinics: 10, source: "plan" },
  { week: "2026-10-26", projected: 310, actual: null, clinics: 3, source: "plan", skipMonday: true, note: "October bank holiday Monday" },
  { week: "2026-11-02", projected: 960, actual: null, clinics: 9, source: "plan" },
  { week: "2026-11-09", projected: 1150, actual: null, clinics: 11, source: "plan" },
  { week: "2026-11-16", projected: 890, actual: null, clinics: 9, source: "plan" },
  { week: "2026-11-23", projected: 620, actual: null, clinics: 6, source: "plan" },
  { week: "2026-11-30", projected: 280, actual: null, clinics: 3, source: "plan" },
];

export function fluWeekDefs(season: FluSeason): FluWeekDef[] {
  return season === 2025 ? FLU_WEEKS_2025 : season === 2026 ? FLU_WEEKS_2026 : [];
}

/** Fictional corporate clients. Addresses and Eircodes are invented and only look plausible. */
export const FLU_CLIENTS: Array<{ company: string; address: string; eircode: string }> = [
  { company: "Harbourline Insurance", address: "3 Ferryman Square, Dublin 1", eircode: "D01 K7R2" },
  { company: "Corrib Data Systems", address: "Corrib Business Park, Headford Road, Galway", eircode: "H91 X2P6" },
  { company: "Slaney Foods", address: "Slaney Mill Road, Enniscorthy, Co. Wexford", eircode: "Y21 E4T8" },
  { company: "Brightwater Pharma", address: "Brightwater Campus, Ringaskiddy, Co. Cork", eircode: "P43 KD70" },
  { company: "Kilbride Logistics", address: "Unit 12, Northgate Logistics Park, Dublin 11", eircode: "D11 T9H4" },
  { company: "Ardmore Engineering", address: "Ardmore Works, Dock Road, Limerick", eircode: "V94 R3F6" },
  { company: "Tolka Valley Software", address: "Tolka House, Drumcondra Road, Dublin 9", eircode: "D09 N5W1" },
  { company: "Barrow Bridge Insurance", address: "Bridge House, Carlow Road, Kilkenny", eircode: "R95 C8K2" },
  { company: "Glenmore Medical Devices", address: "Glenmore Technology Park, Athlone, Co. Westmeath", eircode: "N37 H6Y3" },
  { company: "Ashgrove Retail Group", address: "Ashgrove House, Sandyford, Dublin 18", eircode: "D18 V4X9" },
  { company: "Shannonside Credit Union", address: "Shannon Street, Limerick", eircode: "V94 P2N7" },
  { company: "Carrigmore Dairies", address: "Carrigmore, Mitchelstown, Co. Cork", eircode: "P67 W5D3" },
  { company: "Dunmore Analytics", address: "6 Dunmore Lane, Waterford", eircode: "X91 F3E8" },
  { company: "Garavogue Accountancy", address: "Garavogue Chambers, Wine Street, Sligo", eircode: "F91 K2T6" },
  { company: "Fernhill Hotels Group", address: "Fernhill House, Naas Road, Co. Kildare", eircode: "W91 R8H2" },
  { company: "Moycullen Medtech", address: "Moycullen Business Park, Co. Galway", eircode: "H91 D6C4" },
  { company: "Northwall Telecom", address: "Northwall Exchange, East Wall Road, Dublin 3", eircode: "D03 X4V7" },
  { company: "Kestrel Print Works", address: "Unit 7, Ballymount Cross, Dublin 12", eircode: "D12 H3P9" },
  { company: "Rosslare Freight Services", address: "Ballygeary, Rosslare Harbour, Co. Wexford", eircode: "Y35 R6W2" },
  { company: "Suir Valley Packaging", address: "Davis Road, Clonmel, Co. Tipperary", eircode: "E91 T2K8" },
  { company: "Blackwater Biologics", address: "Blackwater Science Park, Fermoy, Co. Cork", eircode: "P61 C9H5" },
  { company: "Nephin Components", address: "Westport Road, Castlebar, Co. Mayo", eircode: "F23 K4E7" },
  { company: "Feltrim Aviation Services", address: "Feltrim Business Park, Swords, Co. Dublin", eircode: "K67 P8V2" },
  { company: "Millmount Labs", address: "Millmount Quay, Drogheda, Co. Louth", eircode: "A92 X7D4" },
];

/** Sample ILH Flu booking form submissions, taken one per click. Fictional. */
export const FLU_ILH_SAMPLES: Array<{ company: string; address: string; eircode: string; projected: number; date: LocalDate; start: Hhmm }> = [
  { company: "Lough Ree Credit Union", address: "Church Street, Athlone, Co. Westmeath", eircode: "N37 E2W8", projected: 45, date: "2026-10-21", start: "10:00" },
  { company: "Moyvalley Foods", address: "Moyvalley Industrial Estate, Co. Kildare", eircode: "W91 H7T3", projected: 120, date: "2026-11-04", start: "08:30" },
  { company: "Ballycotton Marine Services", address: "Harbour Road, Ballycotton, Co. Cork", eircode: "P25 K6N4", projected: 35, date: "2026-11-11", start: "11:00" },
  { company: "Kells Road Contracting", address: "Kells Road, Navan, Co. Meath", eircode: "C15 D8F2", projected: 80, date: "2026-11-18", start: "07:30" },
];

/** Sample requests through Precision's own flu booking link, accepted only once bookings are live. Fictional. */
export const FLU_PRECISION_SAMPLES: Array<{ company: string; address: string; eircode: string; projected: number; preferredWeek: LocalDate }> = [
  { company: "Rathcoole Bakery Group", address: "Rathcoole Business Park, Co. Dublin", eircode: "D24 W3K8", projected: 55, preferredWeek: "2026-10-26" },
  { company: "Lismore Estates Management", address: "Main Street, Lismore, Co. Waterford", eircode: "P51 T6R4", projected: 30, preferredWeek: "2026-11-09" },
  { company: "Cobh Port Services", address: "Deepwater Quay, Cobh, Co. Cork", eircode: "P24 C7H9", projected: 70, preferredWeek: "2026-11-16" },
];

/* Screening days for the demo nurses, mirroring the seeded screening sessions so the seeded flu staffing
   does not double-book anyone. The clash check in the Flu pages and handlers reads the live sessions. */
const SCREENING_DAYS: Record<string, StaffId[]> = {
  "2026-10-05": ["fiona", "ian", "anita", "liz"],
  "2026-10-08": ["anita"],
  "2026-10-09": ["anita"],
  "2026-10-12": ["fiona", "liz"],
  "2026-10-15": ["anita"],
  "2026-10-19": ["fiona"],
  "2026-10-22": ["anita"],
};

const STARTS: Hhmm[] = ["08:30", "09:00", "09:30", "10:00", "11:00", "13:00", "14:00"];

/* ---------- fixtures ---------- */

const p3 = (n: number) => String(n).padStart(3, "0");
const p2 = (n: number) => String(n).padStart(2, "0");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Split a total into n parts, rounded to a step where possible, never below min, summing exactly. */
function splitTotal(total: number, n: number, rng: Rng, step: number, min: number): number[] {
  if (n <= 1) return [total];
  const w = Array.from({ length: n }, () => 0.55 + rng.next());
  const sw = sum(w);
  const parts = w.map((x) => Math.max(min, Math.round((total * x) / sw / step) * step));
  const order = parts.map((_, i) => i).sort((a, b) => parts[b] - parts[a]);
  let diff = total - sum(parts);
  for (let i = 0; diff !== 0 && i < 4000; i++) {
    const idx = order[i % n];
    const d = Math.abs(diff) >= step ? Math.sign(diff) * step : diff;
    if (parts[idx] + d >= min) { parts[idx] += d; diff -= d; }
  }
  return parts;
}

/** Actual numbers close to the week's attendance rate, at most the projected number, summing exactly. */
function splitActual(projected: number[], total: number, rng: Rng): number[] {
  const ratio = total / Math.max(1, sum(projected));
  const acts = projected.map((p) => Math.max(0, Math.min(p, Math.round(p * ratio * (0.9 + rng.next() * 0.2)))));
  let diff = total - sum(acts);
  for (let i = 0; diff !== 0 && i < 20000; i++) {
    const idx = i % acts.length;
    if (diff > 0 && acts[idx] < projected[idx]) { acts[idx]++; diff--; }
    else if (diff < 0 && acts[idx] > 0) { acts[idx]--; diff++; }
  }
  return acts;
}

function reading(rng: Rng, mean: number): number {
  return round1(Math.min(7.6, Math.max(2.6, rng.normal(mean, 0.75))));
}

function seasonClinics(season: FluSeason, defs: FluWeekDef[], rng: Rng): FluClinic[] {
  const out: FluClinic[] = [];
  const yy = String(season).slice(2);
  defs.forEach((wk, wi) => {
    const r = rng.fork(wk.week);
    const clients = r.shuffle(FLU_CLIENTS).slice(0, wk.clinics);
    const proj = splitTotal(wk.projected, wk.clinics, r, 5, 25);
    const acts = wk.actual === null ? null : splitActual(proj, wk.actual, r);
    const days = [0, 1, 2, 3, 4].filter((d) => !(wk.skipMonday && d === 0));
    const used: Record<string, Set<StaffId>> = {};
    clients.forEach((cl, i) => {
      const date = addDays(wk.week, days[Math.floor((i * days.length) / wk.clinics)]);
      const busy = new Set<StaffId>([...(SCREENING_DAYS[date] || []), ...(used[date] ? Array.from(used[date]) : [])]);
      const free = FLU_VACCINATORS.filter((id) => !busy.has(id));
      /* The 2026 board is fully staffed for the first four weeks; later weeks are partly to assign. */
      const leaveOpen = acts === null && wi >= 4 && i % 3 !== 0;
      let staffIds: StaffId[] = [];
      let rota = 0;
      if (!leaveOpen) {
        const pick = free.length ? free[(i + wi) % free.length] : null;
        if (pick) { staffIds = [pick]; (used[date] = used[date] || new Set<StaffId>()).add(pick); }
        else rota = 1;
        if (proj[i] > 120) rota += 1;
      }
      out.push({
        id: "", season, channel: "ilh", item: "", company: cl.company, address: cl.address, eircode: cl.eircode,
        projected: proj[i], actual: acts ? acts[i] : null, date, start: STARTS[r.int(0, STARTS.length - 1)],
        staffIds, rotaNurses: rota, status: acts ? "completed" : "scheduled", intake: "ilh_form",
        receivedOn: addDays(wk.week, -r.int(18, 46)), preferredWeek: null, batchId: null, coldChain: null, eodId: null,
        recordedBy: acts ? "brenda" : null, recordedAt: acts ? `${date}T18:${p2(r.int(5, 55))}:00.000Z` : null,
      });
    });
  });
  out.sort((a, b) => (a.date! + a.start!).localeCompare(b.date! + b.start!) || a.company.localeCompare(b.company));
  out.forEach((c, i) => { c.id = `FLU-${yy}-${p3(i + 1)}`; c.item = `ILH Flu ${yy}-${p3(i + 1)}`; });
  return out;
}

/** Seeded excursions in the 2025 archive: two followed up, one still open, one missing reading. */
const ARCHIVE_EVENTS: Array<{ week: LocalDate; nth: number; set: Partial<FluColdChain> }> = [
  { week: "2025-10-20", nth: 2, set: { postC: 9.1 } },
  { week: "2025-11-10", nth: 5, set: { intermediateC: 1.6 } },
  { week: "2025-11-24", nth: 1, set: { postC: 8.6 } },
  { week: "2025-11-03", nth: 4, set: { intermediateC: null } },
];

function build2025(): Pick<FluState, "clinics" | "orders" | "batches" | "wastage" | "followUps"> {
  const rng = makeRng("flu-2025-archive");
  const clinics = seasonClinics(2025, FLU_WEEKS_2025, rng);
  const orders: FluOrder[] = [
    { id: "FVO-25-01", season: 2025, supplier: "Corrib Pharma Distribution (fictional)", quantity: 2000, orderedOn: "2025-06-16", expectedOn: "2025-10-06", status: "delivered", deliveredOn: "2025-10-06", sampleBatch: null, note: "First allocation of the 2025 season." },
    { id: "FVO-25-02", season: 2025, supplier: "Corrib Pharma Distribution (fictional)", quantity: 1500, orderedOn: "2025-06-16", expectedOn: "2025-10-27", status: "delivered", deliveredOn: "2025-10-29", sampleBatch: null, note: "Arrived two days late after the bank holiday." },
    { id: "FVO-25-03", season: 2025, supplier: "Corrib Pharma Distribution (fictional)", quantity: 1500, orderedOn: "2025-09-08", expectedOn: "2025-11-07", status: "delivered", deliveredOn: "2025-11-07", sampleBatch: null, note: "Top-up order for November demand." },
  ];
  const batches: FluBatch[] = [
    { id: "FB-25-01", season: 2025, orderId: "FVO-25-01", code: "5DE36D2", expiry: "05/26", quantity: 2000, receivedOn: "2025-10-06" },
    { id: "FB-25-02", season: 2025, orderId: "FVO-25-02", code: "5DF19K4", expiry: "05/26", quantity: 1500, receivedOn: "2025-10-29" },
    { id: "FB-25-03", season: 2025, orderId: "FVO-25-03", code: "5DG07R2", expiry: "06/26", quantity: 1500, receivedOn: "2025-11-07" },
  ];
  /* Batches are used in delivery order. One batch per clinic, as on the End of Day form. */
  let bi = 0, left = batches[0].quantity - 20;
  const cr = rng.fork("cold-chain");
  for (const c of clinics) {
    while (bi < batches.length - 1 && (left < (c.actual || 0) || batches[bi + 1].receivedOn <= c.date! && left < 120)) { bi++; left = batches[bi].quantity - 20; }
    c.batchId = batches[bi].id;
    left -= c.actual || 0;
    c.coldChain = { preC: reading(cr, 4.4), intermediateC: reading(cr, 5.0), postC: reading(cr, 5.5) };
  }
  for (const ev of ARCHIVE_EVENTS) {
    const inWeek = clinics.filter((c) => c.date && startOfWeek(c.date) === ev.week);
    const c = inWeek[Math.min(ev.nth, inWeek.length - 1)];
    if (c && c.coldChain) c.coldChain = { ...c.coldChain, ...ev.set };
  }
  const hot = clinics.find((c) => c.coldChain?.postC === 9.1)!;
  const cold = clinics.find((c) => c.coldChain?.intermediateC === 1.6)!;
  const followUps: FluFollowUp[] = [
    { id: "FCF-001", key: hot.id, action: "discarded", dosesDiscarded: 10, by: "stephen", at: `${addDays(hot.date!, 1)}T09:20:00.000Z`,
      note: "Cool box lid left open during set-up. Reading rechecked at 9.1 °C at the end of the clinic. The 10 unused doses from that box were discarded and recorded as wastage." },
    { id: "FCF-002", key: cold.id, action: "manufacturer_advice", dosesDiscarded: 0, by: "martina", at: `${addDays(cold.date!, 1)}T10:05:00.000Z`,
      note: "Ice pack touching the vaccine packs. Manufacturer advice followed: no freezing indicated, doses used. Packing instruction reissued to all nurses." },
  ];
  const wastage: FluWastage[] = [
    { id: "FW-25-01", season: 2025, batchId: hot.batchId!, doses: 10, reason: "Cold chain excursion (9.1 °C post-vaccine): unused doses discarded", on: hot.date!, by: "stephen", sourceKey: hot.id },
    { id: "FW-25-02", season: 2025, batchId: "FB-25-02", doses: 4, reason: "Syringes damaged in transit", on: "2025-11-04", by: "brenda", sourceKey: null },
    { id: "FW-25-03", season: 2025, batchId: "FB-25-03", doses: 6, reason: "Drawn up and not used after did-not-attends", on: "2025-11-26", by: "brenda", sourceKey: null },
  ];
  return { clinics, orders, batches, wastage, followUps };
}

function build2026(): Pick<FluState, "clinics" | "orders"> {
  const rng = makeRng("flu-2026-board");
  const clinics = seasonClinics(2026, FLU_WEEKS_2026, rng);
  const requests: Array<{ company: string; address: string; eircode: string; projected: number; intake: FluIntake; receivedOn: LocalDate; preferredWeek: LocalDate }> = [
    { company: "IBEC", address: "Address to confirm with the client", eircode: "", projected: 115, intake: "help_scout", receivedOn: "2026-09-29", preferredWeek: "2026-10-19" },
    { company: "Rathmore Veterinary Group", address: "New Road, Killarney, Co. Kerry", eircode: "V93 K2X6", projected: 40, intake: "precision_link", receivedOn: "2026-09-22", preferredWeek: "2026-10-12" },
    { company: "Corran Hotels Group", address: "Corran House, Ennis Road, Limerick", eircode: "V94 H8C3", projected: 65, intake: "precision_link", receivedOn: "2026-09-25", preferredWeek: "2026-10-26" },
    { company: "Westlink Software", address: "Westlink Campus, Leopardstown, Dublin 18", eircode: "D18 C4P7", projected: 90, intake: "precision_link", receivedOn: "2026-09-30", preferredWeek: "2026-11-02" },
    { company: "Meadowvale Recruitment", address: "Meadowvale House, Dundalk, Co. Louth", eircode: "A91 X3H6", projected: 50, intake: "precision_link", receivedOn: "2026-10-02", preferredWeek: "2026-11-09" },
  ];
  requests.forEach((r, i) => clinics.push({
    id: `FLU-26-${p3(clinics.length + 1)}`, season: 2026, channel: "precision", item: `Precision Flu 26-${p3(i + 1)}`, company: r.company, address: r.address, eircode: r.eircode,
    projected: r.projected, actual: null, date: null, start: null, staffIds: [], rotaNurses: 0, status: "requested", intake: r.intake, receivedOn: r.receivedOn,
    preferredWeek: r.preferredWeek, batchId: null, coldChain: null, eodId: null, recordedBy: null, recordedAt: null,
  }));
  const orders: FluOrder[] = [
    { id: "FVO-26-01", season: 2026, supplier: "Corrib Pharma Distribution (fictional)", quantity: 1200, orderedOn: "2026-06-15", expectedOn: "2026-10-07", status: "on_order", deliveredOn: null, sampleBatch: { code: "6AK21F3", expiry: "06/27" }, note: "First allocation. Supplier says no stock in the country before 7 Oct." },
    { id: "FVO-26-02", season: 2026, supplier: "Corrib Pharma Distribution (fictional)", quantity: 2400, orderedOn: "2026-06-15", expectedOn: "2026-10-21", status: "on_order", deliveredOn: null, sampleBatch: { code: "6AM04D8", expiry: "06/27" }, note: "" },
    { id: "FVO-26-03", season: 2026, supplier: "Corrib Pharma Distribution (fictional)", quantity: 2400, orderedOn: "2026-07-01", expectedOn: "2026-11-04", status: "on_order", deliveredOn: null, sampleBatch: { code: "6AP17C5", expiry: "07/27" }, note: "" },
    { id: "FVO-26-04", season: 2026, supplier: "Supplier to confirm", quantity: 600, orderedOn: "2026-09-30", expectedOn: "2026-11-16", status: "on_order", deliveredOn: null, sampleBatch: { code: "6AR02H1", expiry: "07/27" }, note: "For Precision's own clients once bookings open. Quantity to confirm." },
  ];
  return { clinics, orders };
}

export function initialFluState(): FluState {
  const a = build2025();
  const b = build2026();
  return {
    version: 1,
    precisionLive: false,
    liveChange: null,
    clinics: [...a.clinics, ...b.clinics],
    orders: [...a.orders, ...b.orders],
    batches: a.batches,
    wastage: a.wastage,
    followUps: a.followUps,
    intake: { ilh: 0, precision: 0 },
  };
}

/* ---------- selectors (pure; pass today and the End of Day submissions in) ---------- */

export const fluBatchLabel = (b: { code: string; expiry: string }) => `${b.code} Exp ${b.expiry}`;
export const fluWeekOf = (c: FluClinic): LocalDate | null => (c.date ? startOfWeek(c.date) : null);
/** The season a date falls in: September onwards belongs to that year's season. */
export function fluSeasonOf(date: LocalDate): FluSeason {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return m >= 8 ? y : y - 1;
}
export const fluClinicsIn = (f: FluState, season: FluSeason) => f.clinics.filter((c) => c.season === season);
/** Doses a clinic needs or used: actual once recorded, projected while booked. */
export const fluDemandOf = (c: FluClinic) => (c.status === "completed" ? c.actual || 0 : c.status === "scheduled" ? c.projected : 0);

export interface FluWeekGroup {
  week: LocalDate;
  def: FluWeekDef | null;
  clinics: FluClinic[];
  projected: number;
  actual: number;
  recorded: number;
  active: number;
}
/** The Irish Life Flu board view: dated clinics grouped by week beginning, with group sums. */
export function fluWeekGroups(clinics: FluClinic[], season: FluSeason): FluWeekGroup[] {
  const by = new Map<LocalDate, FluClinic[]>();
  for (const d of fluWeekDefs(season)) by.set(d.week, []);
  for (const c of clinics) {
    const w = fluWeekOf(c);
    if (!w || c.season !== season) continue;
    if (!by.has(w)) by.set(w, []);
    by.get(w)!.push(c);
  }
  return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([week, list]) => {
    const live = list.filter((c) => c.status !== "cancelled");
    list.sort((a, b) => (a.date! + (a.start || "")).localeCompare(b.date! + (b.start || "")));
    return {
      week, def: fluWeekDefs(season).find((d) => d.week === week) || null, clinics: list,
      projected: sum(live.map((c) => c.projected)), actual: sum(live.map((c) => c.actual || 0)),
      recorded: live.filter((c) => c.status === "completed").length, active: live.length,
    };
  });
}

export interface FluBatchUse {
  batch: FluBatch;
  administered: number;
  wasted: number;
  remaining: number;
  clinics: FluClinic[];
}
export function fluBatchUse(f: FluState, batchId: string): FluBatchUse | null {
  const batch = f.batches.find((b) => b.id === batchId);
  if (!batch) return null;
  const clinics = f.clinics.filter((c) => c.batchId === batchId && c.status === "completed");
  const administered = sum(clinics.map((c) => c.actual || 0));
  const wasted = sum(f.wastage.filter((w) => w.batchId === batchId).map((w) => w.doses));
  return { batch, administered, wasted, remaining: batch.quantity - administered - wasted, clinics };
}

export interface FluStock {
  received: number;
  onOrder: number;
  administered: number;
  wastage: number;
  onHand: number;
  /** Projected numbers of booked clinics that have not run yet. */
  allocated: number;
  /** Precision requests not yet slotted into a week. */
  requested: number;
  requestedCount: number;
  /** On hand minus allocated. Negative means allocated exceeds stock. */
  free: number;
  /** On hand plus on order minus allocated. */
  freeIncludingOrders: number;
  nextDelivery: FluOrder | null;
}
export function fluStock(f: FluState, season: FluSeason): FluStock {
  const clinics = fluClinicsIn(f, season);
  const received = sum(f.batches.filter((b) => b.season === season).map((b) => b.quantity));
  const pending = f.orders.filter((o) => o.season === season && o.status === "on_order").sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
  const onOrder = sum(pending.map((o) => o.quantity));
  const administered = sum(clinics.filter((c) => c.status === "completed").map((c) => c.actual || 0));
  const wastage = sum(f.wastage.filter((w) => w.season === season).map((w) => w.doses));
  const allocated = sum(clinics.filter((c) => c.status === "scheduled").map((c) => c.projected));
  const req = clinics.filter((c) => c.status === "requested");
  const onHand = received - administered - wastage;
  return {
    received, onOrder, administered, wastage, onHand, allocated, requested: sum(req.map((c) => c.projected)), requestedCount: req.length,
    free: onHand - allocated, freeIncludingOrders: onHand + onOrder - allocated, nextDelivery: pending[0] || null,
  };
}

export interface FluRunningWeek {
  week: LocalDate;
  deliveries: Array<{ order: FluOrder; on: LocalDate; quantity: number; due: boolean }>;
  delivered: number;
  demand: number;
  wasted: number;
  /** Cumulative deliveries (received, or due on their expected date) to the end of the week. */
  cumStock: number;
  /** Cumulative demand: actuals for clinics that ran, projected numbers for booked clinics, plus wastage. */
  cumDemand: number;
  balance: number;
  /** Lowest balance at any point in the week, and the day it happened. */
  minBalance: number;
  minOn: LocalDate | null;
  short: number;
}
/**
 * The running total of vaccines in stock versus allocated, week by week. Deliveries count from their
 * delivery date (or expected date while on order); clinics draw their demand on the clinic day, after
 * any delivery that day. A week is short when the balance drops below zero on any day in it.
 */
export function fluRunningTotal(f: FluState, season: FluSeason): FluRunningWeek[] {
  type Ev = { date: LocalDate; kind: 0 | 1; qty: number; order?: FluOrder; due?: boolean; waste?: boolean };
  const evs: Ev[] = [];
  for (const o of f.orders.filter((x) => x.season === season)) {
    if (o.status === "delivered") {
      const qty = sum(f.batches.filter((b) => b.orderId === o.id).map((b) => b.quantity)) || o.quantity;
      evs.push({ date: o.deliveredOn || o.expectedOn, kind: 0, qty, order: o, due: false });
    } else evs.push({ date: o.expectedOn, kind: 0, qty: o.quantity, order: o, due: true });
  }
  for (const c of fluClinicsIn(f, season)) if (c.date && fluDemandOf(c) > 0) evs.push({ date: c.date, kind: 1, qty: fluDemandOf(c) });
  for (const w of f.wastage.filter((x) => x.season === season)) evs.push({ date: w.on, kind: 1, qty: w.doses, waste: true });
  evs.sort((a, b) => a.date.localeCompare(b.date) || a.kind - b.kind);
  const weeks = new Set<LocalDate>(fluWeekDefs(season).map((d) => d.week));
  for (const c of fluClinicsIn(f, season)) if (c.date) weeks.add(startOfWeek(c.date));
  const sorted = Array.from(weeks).sort();
  let bal = 0, cumStock = 0, cumDemand = 0, ei = 0;
  const out: FluRunningWeek[] = [];
  sorted.forEach((week) => {
    const end = addDays(week, 6);
    const row: FluRunningWeek = { week, deliveries: [], delivered: 0, demand: 0, wasted: 0, cumStock: 0, cumDemand: 0, balance: 0, minBalance: Infinity, minOn: null, short: 0 };
    /* Anything dated before the first week opens the balance in the first week. */
    while (ei < evs.length && evs[ei].date <= end) {
      const e = evs[ei++];
      if (e.kind === 0) {
        bal += e.qty; cumStock += e.qty; row.delivered += e.qty;
        row.deliveries.push({ order: e.order!, on: e.date, quantity: e.qty, due: !!e.due });
      } else {
        bal -= e.qty; cumDemand += e.qty;
        if (e.waste) row.wasted += e.qty; else row.demand += e.qty;
        if (bal < row.minBalance) { row.minBalance = bal; row.minOn = e.date; }
      }
    }
    if (row.minBalance === Infinity) row.minBalance = bal;
    row.cumStock = cumStock; row.cumDemand = cumDemand; row.balance = bal; row.short = Math.max(0, -row.minBalance);
    out.push(row);
  });
  return out;
}

/** End of Day submission that belongs to a flu clinic: same day, and the clinic id, a staff member or the company matches. */
export function fluEodForClinic(c: FluClinic, eods: readonly EndOfDaySubmission[]): EndOfDaySubmission | null {
  if (!c.date) return null;
  const words = c.company.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const named = (e: EndOfDaySubmission) => {
    const loc = (e.clientLocation || "").toLowerCase();
    return loc.includes(c.company.toLowerCase()) || (words.length > 0 && loc.includes(words[0]));
  };
  const same = eods.filter((e) => e.date === c.date && (e.jobType === "flu_vaccination" || e.vaccinesAdministered !== null));
  return same.find((e) => e.sessionId === c.id) || same.find(named) || same.find((e) => c.staffIds.includes(e.staffId)) || null;
}

export interface FluExcursion { reading: FluReading; value: number; kind: "high" | "low" }
export function fluExcursionsOf(cc: FluColdChain | null): FluExcursion[] {
  if (!cc) return [];
  const out: FluExcursion[] = [];
  const add = (reading: FluReading, v: number | null) => {
    if (v === null || !Number.isFinite(v)) return;
    if (v > FLU_SAFE_MAX_C) out.push({ reading, value: v, kind: "high" });
    else if (v < FLU_SAFE_MIN_C) out.push({ reading, value: v, kind: "low" });
  };
  add("pre", cc.preC); add("intermediate", cc.intermediateC); add("post", cc.postC);
  return out;
}
export function fluMissingOf(cc: FluColdChain | null): FluReading[] {
  if (!cc) return ["pre", "intermediate", "post"];
  return (["pre", "intermediate", "post"] as FluReading[]).filter((r) => (r === "pre" ? cc.preC : r === "intermediate" ? cc.intermediateC : cc.postC) === null);
}

export interface FluColdChainRow {
  /** Clinic id, or the End of Day submission id when no flu clinic matches it. */
  key: string;
  clinicId: string | null;
  eodId: string | null;
  season: FluSeason;
  date: LocalDate;
  company: string;
  staffIds: StaffId[];
  batchId: string | null;
  batchLabel: string | null;
  readings: FluColdChain;
  source: "eod" | "archive" | "recorded";
  excursions: FluExcursion[];
  missing: FluReading[];
  followUps: FluFollowUp[];
}
/**
 * Every flu clinic's cold-chain readings. Clinics that ran use the readings recorded with their actuals
 * (from the End of Day form when one was matched). A clinic day with an End of Day form but no actuals yet
 * reads the form directly, and End of Day forms with readings that match no flu clinic still appear.
 */
export function fluColdChainRows(f: FluState, eods: readonly EndOfDaySubmission[]): FluColdChainRow[] {
  const rows: FluColdChainRow[] = [];
  const usedEods = new Set<string>();
  const batchLabelOf = (id: string | null) => { const b = id ? f.batches.find((x) => x.id === id) : null; return b ? fluBatchLabel(b) : null; };
  const fromEod = (e: EndOfDaySubmission): FluColdChain => ({ preC: e.preVaccineTempC, intermediateC: e.intermediateVaccineTempC, postC: e.postVaccineTempC });
  for (const c of f.clinics) {
    if (!c.date) continue;
    if (c.status === "completed") {
      if (c.eodId) usedEods.add(c.eodId);
      const cc = c.coldChain || { preC: null, intermediateC: null, postC: null };
      rows.push({
        key: c.id, clinicId: c.id, eodId: c.eodId, season: c.season, date: c.date, company: c.company, staffIds: c.staffIds,
        batchId: c.batchId, batchLabel: batchLabelOf(c.batchId), readings: cc, source: c.eodId ? "eod" : c.season < FLU_SEASON_CURRENT ? "archive" : "recorded",
        excursions: fluExcursionsOf(cc), missing: fluMissingOf(cc), followUps: f.followUps.filter((x) => x.key === c.id),
      });
    } else if (c.status === "scheduled") {
      const e = fluEodForClinic(c, eods);
      if (!e || usedEods.has(e.id)) continue;
      usedEods.add(e.id);
      const cc = fromEod(e);
      const b = e.vaccineBatch ? f.batches.find((x) => e.vaccineBatch!.toUpperCase().startsWith(x.code)) : null;
      rows.push({
        key: c.id, clinicId: c.id, eodId: e.id, season: c.season, date: c.date, company: c.company, staffIds: c.staffIds,
        batchId: b ? b.id : null, batchLabel: b ? fluBatchLabel(b) : e.vaccineBatch, readings: cc, source: "eod",
        excursions: fluExcursionsOf(cc), missing: fluMissingOf(cc), followUps: f.followUps.filter((x) => x.key === c.id),
      });
    }
  }
  for (const e of eods) {
    if (usedEods.has(e.id)) continue;
    const hasTemp = e.preVaccineTempC !== null || e.intermediateVaccineTempC !== null || e.postVaccineTempC !== null;
    if (!hasTemp && e.jobType !== "flu_vaccination") continue;
    const cc = fromEod(e);
    const b = e.vaccineBatch ? f.batches.find((x) => e.vaccineBatch!.toUpperCase().startsWith(x.code)) : null;
    rows.push({
      key: e.id, clinicId: null, eodId: e.id, season: fluSeasonOf(e.date), date: e.date, company: e.clientLocation, staffIds: [e.staffId],
      batchId: b ? b.id : null, batchLabel: b ? fluBatchLabel(b) : e.vaccineBatch, readings: cc, source: "eod",
      excursions: fluExcursionsOf(cc), missing: fluMissingOf(cc), followUps: f.followUps.filter((x) => x.key === e.id),
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company));
}

/** Next free id for a prefix such as "FLU-26-" or "FVO-26-", from the ids already in the list. */
export function fluNextId(prefix: string, ids: readonly string[], width: number): string {
  let max = 0;
  for (const id of ids) if (id.startsWith(prefix)) { const n = Number(id.slice(prefix.length)); if (Number.isFinite(n) && n > max) max = n; }
  return prefix + String(max + 1).padStart(width, "0");
}
