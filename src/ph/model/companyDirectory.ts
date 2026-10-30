/* Every company the demo mentions, as one directory. The stored company records (Precision Health,
   the three employer clients, suppliers and services) come first; every other company named in Sales
   (leads, past clients on the retention list), Irish Life Health bookings, Occupational Health and
   Onboarding gets a record built from what is held about it. So any company name on any screen can
   open a company record. Nothing here is stored: it is rebuilt from the state each time. */
import type { Company, PhState } from "./types";
import { retCompanyKey } from "./onboarding";
import { fmtDate } from "./time";

export type DirectoryRole = "past_client" | "lead" | "won_lead" | "irish_life" | "oh_client" | "onboarding";
export const DIRECTORY_ROLE_LABEL: Record<DirectoryRole, string> = {
  past_client: "Past client", lead: "Sales lead", won_lead: "New client", irish_life: "Irish Life Health", oh_client: "Occupational health client", onboarding: "Being onboarded",
};

export interface DirectoryCompany extends Company {
  /** True when built from other records rather than stored in Records. */
  derived: boolean;
  /** For derived records: why the company is known. The first is the main one. */
  roles: DirectoryRole[];
  leadIds: string[];
  engagementIds: string[];
  ilhIds: string[];
  ohClientIds: string[];
  onbIds: string[];
}

export const companyKey = (name: string) => retCompanyKey(name);
const slug = (name: string) => companyKey(name).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
export const derivedCompanyId = (name: string) => `cx-${slug(name)}`;

const ROLE_ORDER: DirectoryRole[] = ["oh_client", "won_lead", "onboarding", "past_client", "lead", "irish_life"];

export function companyDirectory(s: PhState): DirectoryCompany[] {
  const base: DirectoryCompany[] = s.companies.map((c) => ({ ...c, derived: false, roles: [], leadIds: [], engagementIds: [], ilhIds: [], ohClientIds: [], onbIds: [] }));
  const byKey = new Map<string, DirectoryCompany>();
  for (const c of base) byKey.set(companyKey(c.name), c);
  const derived: DirectoryCompany[] = [];
  const touch = (name: string | undefined | null, role: DirectoryRole, field: "leadIds" | "engagementIds" | "ilhIds" | "ohClientIds" | "onbIds", id: string) => {
    const n = (name || "").trim();
    if (!n) return;
    const k = companyKey(n);
    if (!k) return;
    let c = byKey.get(k);
    if (!c) {
      c = { id: derivedCompanyId(n), name: n.replace(/\s*\(fictional\)/gi, ""), kind: "client", relationship: "", programmeIds: [], integrationIds: [], contactIds: [], note: "", derived: true, roles: [], leadIds: [], engagementIds: [], ilhIds: [], ohClientIds: [], onbIds: [] };
      byKey.set(k, c);
      derived.push(c);
    }
    if (!c[field].includes(id)) c[field].push(id);
    if (!c.roles.includes(role)) c.roles.push(role);
  };
  for (const l of s.sales.leads) touch(l.company, l.stage === "won" ? "won_lead" : "lead", "leadIds", l.id);
  for (const e of s.sales.engagements) touch(e.company, "past_client", "engagementIds", e.id);
  for (const b of s.sales.ilh) touch(b.company, "irish_life", "ilhIds", b.id);
  for (const c of s.occHealth?.clients || []) touch(c.name, "oh_client", "ohClientIds", c.id);
  for (const o of s.onboarding?.onboardings || []) touch(o.details.companyName, "onboarding", "onbIds", o.id);
  for (const c of derived) {
    c.roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    c.relationship = describe(s, c);
    c.note = noteFor(s, c);
  }
  derived.sort((a, b) => a.name.localeCompare(b.name));
  return [...base, ...derived];
}

function describe(s: PhState, c: DirectoryCompany): string {
  const parts: string[] = [];
  for (const r of c.roles) {
    if (r === "past_client") {
      const e = s.sales.engagements.filter((x) => c.engagementIds.includes(x.id)).sort((a, b) => (a.screenedOn < b.screenedOn ? 1 : -1))[0];
      parts.push(e ? `Past client, last screened ${fmtDate(e.screenedOn)}` : "Past client");
    } else if (r === "lead" || r === "won_lead") {
      const l = s.sales.leads.filter((x) => c.leadIds.includes(x.id)).slice(-1)[0];
      parts.push(l ? (l.stage === "won" ? "Won in Sales" : l.stage === "lost" ? "Lead, lost" : "Sales lead") : DIRECTORY_ROLE_LABEL[r]);
    } else parts.push(DIRECTORY_ROLE_LABEL[r]);
  }
  return Array.from(new Set(parts)).join(" · ");
}

function noteFor(s: PhState, c: DirectoryCompany): string {
  const bits: string[] = [];
  if (c.engagementIds.length) {
    const e = s.sales.engagements.filter((x) => c.engagementIds.includes(x.id));
    bits.push(`Screened with Precision Health ${e.length === 1 ? "once" : `${e.length} times`}: ${e.map((x) => `${x.packageText}, ${fmtDate(x.screenedOn)}`).join("; ")}.`);
  }
  if (c.leadIds.length) bits.push(`${c.leadIds.length === 1 ? "One lead" : `${c.leadIds.length} leads`} in Sales.`);
  if (c.ilhIds.length) bits.push(`${c.ilhIds.length} ${c.ilhIds.length === 1 ? "session" : "sessions"} booked through Irish Life Health.`);
  if (c.ohClientIds.length) bits.push("Occupational health client.");
  if (c.onbIds.length) bits.push("Onboarding on file.");
  return bits.join(" ");
}

/** The directory record for a company name, stored or derived. */
export function companyForName(s: PhState, name: string): DirectoryCompany | null {
  const k = companyKey(name || "");
  if (!k) return null;
  return companyDirectory(s).find((c) => companyKey(c.name) === k) || null;
}
