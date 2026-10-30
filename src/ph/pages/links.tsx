/* Name links used across the pages: a company, lead or person name you can click. A client or lead
   opens the Clients page on that client; any other company opens its record in Records, Companies. */
import type { ReactNode } from "react";
import { companyForName, linkFor, personName } from "../model";
import type { NavTarget, PhState } from "../model";
import { useNav } from "../nav-context";
import { usePhState } from "../store";
import { journeyKeyForCompany } from "./Journey/model";

/** Where a company name should open: the Clients page when it is a client or lead, else its company record. */
export function companyTarget(s: PhState, name: string): NavTarget | null {
  const key = journeyKeyForCompany(s, name);
  if (key) return { page: "Clients", tab: "journey", params: { who: key } };
  const c = companyForName(s, name);
  if (c) return linkFor("company", c.id);
  return null;
}

function LinkButton({ to, children, title }: { to: NavTarget | null; children: ReactNode; title?: string }) {
  const nav = useNav();
  if (!to) return <>{children}</>;
  return (
    <button type="button" className="ph-link" title={title} onClick={(e) => { e.stopPropagation(); nav.go(to); }}>{children}</button>
  );
}

export function CompanyLink({ name, children }: { name: string; children?: ReactNode }) {
  const s = usePhState();
  return <LinkButton to={companyTarget(s, name)} title={`Open ${name.replace(/\s*\(fictional\)/i, "")}`}>{children ?? name}</LinkButton>;
}

export function LeadLink({ id, children }: { id: string; children?: ReactNode }) {
  const s = usePhState();
  const lead = s.sales.leads.find((l) => l.id === id);
  return <LinkButton to={{ page: "Sales", tab: "pipeline", params: { lead: id } }} title={lead ? `Open the ${lead.company} lead` : undefined}>{children ?? lead?.company ?? id}</LinkButton>;
}

/** A participant by id, shown by name. */
export function PersonLink({ id, children }: { id: string; children?: ReactNode }) {
  const s = usePhState();
  const p = s.persons.find((x) => x.id === id);
  return <LinkButton to={linkFor("person", id)}>{children ?? (p ? personName(p) : id)}</LinkButton>;
}

/** A programme by id, shown by name. */
export function ProgrammeLink({ id, children }: { id: string; children?: ReactNode }) {
  const s = usePhState();
  const p = s.programmes.find((x) => x.id === id);
  return <LinkButton to={linkFor("programme", id)}>{children ?? p?.name ?? id}</LinkButton>;
}
