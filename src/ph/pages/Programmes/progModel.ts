/* New programme form: options from the Sales price list, defaults, prefill from an onboarding or a
   client, and the checks the form and the handler share. Pure: no React, no dispatch. */
import type { LocalDate, PhState, Programme, ProgrammeMethod, ProgrammeStatus } from "../../model";
import { addDays, isLocalDate, portalCodeFor, retCompanyKey, takenCodes, today } from "../../model";

export interface ProgForm {
  /** "co-ibm" for an existing company, "onb:ONB-003" for an onboarded client, "" for a new one typed in. */
  clientRef: string;
  companyName: string;
  name: string;
  serviceId: string;
  method: ProgrammeMethod;
  flu: boolean;
  windowStart: LocalDate | "";
  windowEnd: LocalDate | "";
  headcount: string;
  sites: string;
  hrName: string;
  hrEmail: string;
  inviteCode: string;
  /** True once a person has typed their own code, so the automatic one stops following the name. */
  codeTouched: boolean;
  status: ProgrammeStatus;
  onboardingId: string | null;
}
export type ProgField = keyof Omit<ProgForm, "codeTouched" | "onboardingId" | "clientRef">;
export type ProgErrors = Partial<Record<ProgField, string>>;

export interface ServiceOption { id: string; label: string; method: ProgrammeMethod; note: string }
/** Screening packages from the Sales price list, with the usual way they are done. */
export function serviceOptions(s: PhState): ServiceOption[] {
  const items = s.sales?.priceItems || [];
  const out: ServiceOption[] = [{ id: "lab", label: "Lab bloods (Comprehensive screen)", method: "lab", note: "Bloods go to the lab. Results about 7 days later." }];
  const want = ["poc3", "silver1", "silver2", "silver3", "gold1", "gold2", "gold3", "exec"];
  for (const id of want) {
    const it = items.find((x) => x.id === id);
    if (!it) continue;
    const method: ProgrammeMethod = it.family === "poc" || it.family === "silver" ? "poc" : "lab";
    const label = it.family === "poc" ? `${it.code} point of care` : it.name;
    out.push({ id, label, method, note: it.includes });
  }
  return out;
}
export const serviceLabel = (s: PhState, id: string) => serviceOptions(s).find((o) => o.id === id)?.label || id;

/** Clients to pick from: client companies, then onboarded clients not yet a company. */
export interface ClientChoice { ref: string; name: string; group: "Clients" | "Onboarded clients"; onboardingId: string | null }
export function clientChoices(s: PhState): ClientChoice[] {
  const out: ClientChoice[] = [];
  const seen = new Set<string>();
  for (const c of s.companies.filter((x) => x.kind === "client").sort((a, b) => a.name.localeCompare(b.name))) {
    seen.add(retCompanyKey(c.name));
    out.push({ ref: c.id, name: c.name, group: "Clients", onboardingId: null });
  }
  for (const o of s.onboarding.onboardings.slice().reverse()) {
    const n = o.details.companyName.trim();
    if (!n || seen.has(retCompanyKey(n))) continue;
    seen.add(retCompanyKey(n));
    out.push({ ref: `onb:${o.id}`, name: n, group: "Onboarded clients", onboardingId: o.id });
  }
  return out;
}

const year = (d: LocalDate | "", s: PhState) => Number((d || today(s)).slice(0, 4));
export function autoCode(s: PhState, company: string, start: LocalDate | ""): string {
  return company.trim() ? portalCodeFor(company.trim(), year(start, s), takenCodes(s)) : "";
}
export function defaultName(company: string, method: ProgrammeMethod, start: LocalDate | ""): string {
  const y = (start || "").slice(0, 4);
  const c = company.replace(/\s*\(fictional\)/i, "").trim();
  return c ? `${c} ${method === "poc" ? "Point of Care Screening" : "Health Screening"}${y ? ` ${y}` : ""}` : "";
}

export function blankForm(s: PhState): ProgForm {
  const start = addDays(today(s), 21);
  return {
    clientRef: "", companyName: "", name: "", serviceId: "poc3", method: "poc", flu: false, windowStart: start, windowEnd: addDays(start, 18), headcount: "",
    sites: "", hrName: "", hrEmail: "", inviteCode: "", codeTouched: false, status: "draft", onboardingId: null,
  };
}

/** Fill the form from an existing company, an onboarding, or a typed name. */
export function prefillFor(s: PhState, base: ProgForm, ref: string, typedName = ""): ProgForm {
  const f: ProgForm = { ...base, clientRef: ref, onboardingId: null };
  const co = s.companies.find((c) => c.id === ref);
  const onbId = ref.startsWith("onb:") ? ref.slice(4) : null;
  const onb = onbId ? s.onboarding.onboardings.find((o) => o.id === onbId)
    : s.onboarding.onboardings.find((o) => retCompanyKey(o.details.companyName) === retCompanyKey(co?.name || typedName));
  f.companyName = co?.name || onb?.details.companyName.trim() || typedName;
  if (onb) {
    f.onboardingId = onb.id;
    const d = onb.details;
    if (d.hr.name.trim()) { f.hrName = d.hr.name.trim(); f.hrEmail = d.hr.email.trim(); }
    if (d.sites.trim()) f.sites = d.sites.trim().split(/\s*[,;\n]\s*/).filter(Boolean).join("; ");
    const n = parseInt(d.headcount.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n) && n > 0) f.headcount = String(n);
    const lab = d.services.some((x) => /blood|executive/i.test(x));
    if (lab) { f.serviceId = "lab"; f.method = "lab"; }
    if (d.services.some((x) => /flu/i.test(x))) f.flu = true;
  } else if (co) {
    const ct = s.contacts.find((c) => c.companyId === co.id && c.provenance === "fictional") || s.contacts.find((c) => c.companyId === co.id);
    if (ct) { f.hrName = ct.name; f.hrEmail = ct.email; }
    const last = s.programmes.filter((p) => p.clientId === co.id).pop();
    if (last) {
      f.sites = last.sites.join("; ");
      const m = s.memberships.filter((x) => x.programmeId === last.id && x.eligible).length;
      if (m) f.headcount = String(m);
      if (last.setup) { f.serviceId = last.setup.serviceId; f.method = last.setup.method; f.flu = last.setup.flu; f.headcount = String(last.setup.headcount); }
    }
  }
  f.name = defaultName(f.companyName, f.method, f.windowStart);
  if (!f.codeTouched) f.inviteCode = autoCode(s, f.companyName, f.windowStart);
  return f;
}

export const splitSites = (v: string) => v.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,29}$/;

/** Problems with the form, keyed by field. Empty when it can be saved. */
export function progErrors(s: PhState, f: ProgForm, editingId?: string): ProgErrors {
  const e: ProgErrors = {};
  if (f.companyName.trim().length < 2) e.companyName = "Choose a client or type the company name.";
  if (f.name.trim().length < 4) e.name = "Name the programme, for example Acme Health Screening 2026.";
  if (!f.serviceId) e.serviceId = "Choose the package.";
  if (!isLocalDate(f.windowStart)) e.windowStart = "Choose the first day of the window.";
  if (!isLocalDate(f.windowEnd)) e.windowEnd = "Choose the last day of the window.";
  else if (isLocalDate(f.windowStart) && f.windowEnd < f.windowStart) e.windowEnd = "The window must end on or after it starts.";
  else if (!editingId && f.windowEnd < today(s)) e.windowEnd = "This window has already ended. Choose a later date.";
  const n = Number(f.headcount);
  if (!f.headcount.trim()) e.headcount = "How many people will be invited?";
  else if (!Number.isInteger(n) || n < 1 || n > 20000) e.headcount = "Enter a whole number from 1 to 20,000.";
  if (!splitSites(f.sites).length) e.sites = "Add at least one site, for example Dublin office.";
  if (f.hrName.trim().length < 3) e.hrName = "Enter the HR contact's name.";
  if (!EMAIL.test(f.hrEmail.trim())) e.hrEmail = "Enter a valid email for the HR contact.";
  const code = f.inviteCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) e.inviteCode = "Use 4 to 30 capital letters, numbers and dashes, for example DEMO-ACME-26.";
  else {
    const mine = editingId ? s.programmes.find((p) => p.id === editingId)?.inviteCode : null;
    const taken = [...takenCodes(s), ...s.programmes.map((p) => p.inviteCode)].filter((c) => c !== mine);
    if (taken.includes(code)) e.inviteCode = `${code} is already used. Try ${code}-2.`;
  }
  return e;
}

/** A short programme code (ACME) and id (PRG-ACME-26), unique in state. */
export function programmeIds(s: PhState, company: string, start: LocalDate): { id: string; code: string } {
  const word = company.replace(/\(fictional\)/i, "").trim().split(/\s+/)[0] || "CLIENT";
  const stem = word.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CLIENT";
  const yy = start.slice(2, 4);
  let id = `PRG-${stem}-${yy}`, code = stem;
  for (let n = 2; s.programmes.some((p) => p.id === id); n++) { id = `PRG-${stem}${n}-${yy}`; code = `${stem}${n}`; }
  return { id, code };
}

/** The form for editing a programme. */
export function formFromProgramme(s: PhState, p: Programme): ProgForm {
  const ct = s.contacts.find((c) => c.companyId === p.clientId && c.provenance === "fictional");
  return {
    clientRef: p.clientId, companyName: p.clientName, name: p.name, serviceId: p.setup?.serviceId || "lab", method: p.setup?.method || "lab", flu: !!p.setup?.flu,
    windowStart: p.windowStart, windowEnd: p.windowEnd,
    headcount: String(p.setup?.headcount || s.memberships.filter((m) => m.programmeId === p.id && m.eligible).length || ""),
    sites: p.sites.join("; "), hrName: p.setup?.hrName || ct?.name || "", hrEmail: p.setup?.hrEmail || ct?.email || "", inviteCode: p.inviteCode, codeTouched: true,
    status: p.setup?.status || "live", onboardingId: p.setup?.onboardingId || null,
  };
}

/** Where a "Create programme" button sends a person, prefilled from an onboarding or a client. */
export const newProgrammeLink = (from: string) => ({ page: "Programmes" as const, tab: "programmes", params: { new: from } });
