/* Shared pieces for the Settings tabs and the Records Companies and Staff tabs (Task G):
   the page header with the view-only marker, the preview role selector, a definition list,
   an activity list, and small derivations over the shared store. Nothing here types a count. */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { INTEGRATIONS, PERM_DEFS, PROGRAMME_BY_ID, ROLE_LABEL, act, fmtDayMonth, fmtShortDateTime, today } from "../../model";
import type { ActivityView, ClinicSession, EntityRef, NavTarget, Perm, PhState, RoleKey, StaffId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Chip, DemoTag, EntityLink, Field, Icon, PageHeader, Pill, Select } from "../../ui";
import "./settings.css";

/* ---- wording helpers ---- */
export const joinList = (xs: string[], word = "and"): string =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;
export const firstNameOf = (name: string) => name.split(" ")[0];

/* ---- permissions by role, from the one PERM_DEFS table ---- */
export function rolePerms(role: RoleKey): Set<Perm> {
  return new Set(PERM_DEFS.filter((d) => d.roles.includes(role)).map((d) => d.key));
}
export function rolesWith(perm: Perm): RoleKey[] {
  return PERM_DEFS.find((d) => d.key === perm)?.roles || [];
}
/** "Clinical reviewer or Programme oversight" */
export function rolesLabelFor(perm: Perm, word = "or"): string {
  return joinList(rolesWith(perm).map((r) => ROLE_LABEL[r]), word);
}
export const PERM_TOTAL = PERM_DEFS.length;

/* ---- clinic assignments, derived from sessions so a schedule change shows everywhere ---- */
export interface StaffSession { session: ClinicSession; as: "nurse" | "support" }
export function staffSessions(s: PhState, staffId: StaffId): StaffSession[] {
  return s.sessions
    .filter((x) => x.status !== "cancelled" && (x.nurseId === staffId || x.supportIds.includes(staffId)))
    .map((x): StaffSession => ({ session: x, as: x.nurseId === staffId ? "nurse" : "support" }))
    .sort((a, b) => (a.session.date < b.session.date ? -1 : a.session.date > b.session.date ? 1 : 0));
}
export function staffToday(s: PhState, staffId: StaffId): StaffSession[] {
  const t = today(s);
  return staffSessions(s, staffId).filter((x) => x.session.date === t);
}
/** "Sisk clinic, Sisk Dublin Site A" */
export function sessionShort(x: ClinicSession): string {
  return `${sessionClient(x)} clinic, ${x.siteName}`;
}
/** "Sisk" */
export function sessionClient(x: ClinicSession): string {
  return PROGRAMME_BY_ID[x.programmeId]?.clientName || x.programmeId;
}

/* ---- page header with the view-only marker ---- */
/** gated: the tab has controls that need "Change settings and AI controls", so roles without it see a View only marker. */
export function SettingsHeader({ title, sub, actions, eyebrow = "Settings", gated = true }: { title: string; sub: ReactNode; actions?: ReactNode; eyebrow?: string; gated?: boolean }) {
  const p = usePersona();
  const canEdit = p.perms.has("settings.edit");
  const viewOnly = gated && !canEdit;
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      sub={sub}
      actions={actions || viewOnly ? (
        <>
          {actions}
          {viewOnly ? (
            <Pill tone="neutral" icon="lock" title={`Changing settings needs the ${rolesLabelFor("settings.edit")} role.`}>View only for {p.roleLabel}</Pill>
          ) : null}
        </>
      ) : undefined}
    />
  );
}

/** Why a settings control is disabled for the current persona. Null when it is allowed. */
export function useEditBlock(perm: Perm = "settings.edit"): string | null {
  const p = usePersona();
  if (p.perms.has(perm)) return null;
  return `${p.name} (${p.roleLabel}) can view this but cannot change it. It needs the ${rolesLabelFor(perm)} role.`;
}

/* ---- definition list ---- */
export function DefList({ items }: { items: Array<{ label: ReactNode; value: ReactNode; key?: string } | null | false> }) {
  return (
    <dl className="phs-kv">
      {items.filter(Boolean).map((it, i) => {
        const x = it as { label: ReactNode; value: ReactNode; key?: string };
        return (
          <Fragment key={x.key || i}>
            <dt>{x.label}</dt>
            <dd>{x.value}</dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

/* ---- activity list ---- */
const KNOWN_SYSTEMS = new Set(INTEGRATIONS.map((i) => i.id));
/** Settings events carry a pseudo entity (for example the AI controls). They link to their own tab. */
function settingsTarget(ref: EntityRef): NavTarget | null {
  if (ref.kind === "system" && ref.id === "ai-controls") return { page: "Settings", tab: "ai-controls" };
  return null;
}
/** A readable label for an entity reference: names for staff, companies and programmes, otherwise the ID. */
function entityLabel(s: PhState, e: EntityRef): string {
  if (e.label) return e.label;
  if (e.kind === "staff") return s.staff.find((x) => x.id === e.id)?.name || e.id;
  if (e.kind === "company") return s.companies.find((x) => x.id === e.id)?.name || e.id;
  if (e.kind === "programme") return s.programmes.find((x) => x.id === e.id)?.name || e.id;
  if (e.kind === "system") return INTEGRATIONS.find((x) => x.id === e.id)?.name || e.id;
  if (e.kind === "template") return s.forms.templates.find((x) => x.id === e.id)?.name || e.id;
  if (e.kind === "session") {
    const x = s.sessions.find((y) => y.id === e.id);
    return x ? `${sessionClient(x)} clinic, ${fmtDayMonth(x.date)}` : e.id;
  }
  return e.id;
}
function EventLink({ entity }: { entity: EntityRef }) {
  const nav = useNav();
  const s = usePhState();
  const special = settingsTarget(entity);
  if (special) return <button type="button" className="ph-link" onClick={() => nav.go(special)}>Settings, AI Controls</button>;
  if (entity.kind === "system" && !KNOWN_SYSTEMS.has(entity.id)) return null;
  return <EntityLink kind={entity.kind} id={entity.id}>{entityLabel(s, entity)}</EntityLink>;
}
export function ActivityList({ items, empty, limit }: { items: ActivityView[]; empty: ReactNode; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) return <div className="phs-note" style={{ fontSize: 12.5 }}>{empty}</div>;
  return (
    <ul className="phs-list">
      {list.map((v) => {
        const ent = v.event.entity;
        return (
          <li key={v.event.id}>
            <div className="ph-wrap" style={{ gap: "4px 8px", fontSize: 11.5 }}>
              <span className="ph-faint ph-num">{fmtShortDateTime(v.event.at)}</span>
              <span className="ph-faint ph-grow" style={{ minWidth: 80 }}>{v.event.actor.label}</span>
              {v.event.simulated ? <DemoTag>Simulated</DemoTag> : v.event.seeded ? <DemoTag title="Seeded demo history">Fictional demo event</DemoTag> : null}
            </div>
            <div className="phs-body" style={{ marginTop: 4 }}>{v.text}</div>
            {ent && !v.minimal ? <div style={{ marginTop: 3, fontSize: 12 }}><EventLink entity={ent} /></div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ---- preview role selector: switches the persona for the whole app ---- */
const QUICK: StaffId[] = ["neil", "brenda", "fiona", "stephen"];
export function RolePreview({ quick = true, id = "phs-preview-role" }: { quick?: boolean; id?: string }) {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const value = p.isParticipant ? "participant" : p.id;
  const pick = (v: string) => {
    if (v === "participant") { nav.openPortal(); return; }
    if (v !== p.id) dispatch(act.setPersona(v as StaffId));
  };
  return (
    <div className="ph-stack" style={{ gap: 10 }}>
      <Field label="Preview role" htmlFor={id} help="A frontend visibility simulation. It does not change authentication and is not production server-side security.">
        <Select id={id} value={value} onChange={(e) => pick(e.target.value)}>
          {s.staff.map((x) => (
            <option key={x.id} value={x.id}>{x.name}, {ROLE_LABEL[x.role]}{x.id === "neil" ? " (default)" : ""}</option>
          ))}
          <option value="participant">Participant portal preview (own released data only)</option>
        </Select>
      </Field>
      {quick ? (
        <div className="ph-wrap" style={{ gap: 6 }} role="group" aria-label="Quick role preview">
          {QUICK.map((sid) => {
            const st = s.staff.find((x) => x.id === sid);
            if (!st) return null;
            return <Chip key={sid} on={p.id === sid} onClick={() => pick(sid)}>{firstNameOf(st.name)}: {ROLE_LABEL[st.role]}</Chip>;
          })}
          <Chip on={p.isParticipant} onClick={() => pick("participant")}>Participant portal</Chip>
        </div>
      ) : null}
    </div>
  );
}

/** Yes or No with an icon, never colour alone. */
export function YesNo({ yes, yesText = "Yes", noText = "No" }: { yes: boolean; yesText?: string; noText?: string }) {
  return yes
    ? <span className="phs-yes"><Icon name="check" size={12} stroke={2.4} />{yesText}</span>
    : <span className="phs-no"><Icon name="x" size={10} stroke={2} />{noText}</span>;
}
