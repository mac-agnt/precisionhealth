/* Settings, Permissions: a view-only role matrix and a clearly labelled Preview role selector.
   Switching role re-filters the whole app. The live table shows what the previewed role sees
   across navigation, global search, drawers, files, agents, activity, ontology and exports,
   using the same selectors those screens use. A frontend visibility simulation, not production
   server-side security. Authentication is unchanged. */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import {
  PAGES, PAGE_BY_ID, PERM_DEFS, PH_FILES, ROLE_LABEL, act, activityFeed, canViewEpisodeClinical, globalSearch, ix, navAttention, ontologyModel, persona, personName, visibleFiles,
} from "../../model";
import type { NavTarget, PageId, PersonaId, PhState, RoleKey, SearchHit } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, Icon, Pill, SearchBox, Split } from "../../ui";
import { PERM_TOTAL, RolePreview, SettingsHeader, YesNo, joinList, firstNameOf } from "./common";

const ROLES = (Object.keys(ROLE_LABEL) as Array<RoleKey | "participant">).filter((k): k is RoleKey => k !== "participant");
const GROUPS = Array.from(new Set(PERM_DEFS.map((d) => d.group)));
const DEMO_EPISODE = "PH-E-0101";
const DEMO_PERSON = "PH-P-0001";

/** The same state seen as another persona, for a like-for-like comparison. Cached per state object. */
const personaCache = new WeakMap<PhState, Map<PersonaId, PhState>>();
function asPersona(s: PhState, id: PersonaId): PhState {
  if (s.session.personaId === id) return s;
  let m = personaCache.get(s);
  if (!m) { m = new Map(); personaCache.set(s, m); }
  let v = m.get(id);
  if (!v) { v = { ...s, session: { ...s.session, personaId: id } }; m.set(id, v); }
  return v;
}

function groupHits(hits: SearchHit[]): Array<{ group: string; hits: SearchHit[] }> {
  const out: Array<{ group: string; hits: SearchHit[] }> = [];
  hits.forEach((h) => { const g = out.find((x) => x.group === h.group); if (g) g.hits.push(h); else out.push({ group: h.group, hits: [h] }); });
  return out;
}
const hitSummary = (hits: SearchHit[]) => {
  const g = groupHits(hits);
  return g.length ? g.map((x) => `${x.group} ${x.hits.length}`).join(", ") : "no results";
};

interface LiveRow { surface: string; sees: ReactNode; withheld: ReactNode; target?: NavTarget; targetLabel?: string }

function liveRows(s: PhState): LiveRow[] {
  const p = persona(s);
  const clinical = p.perms.has("clinical.view");
  const I = ix(s);
  const aisling = I.personById.get(DEMO_PERSON);
  const aislingName = aisling ? personName(aisling) : DEMO_PERSON;

  /* navigation: role-aware attention dots */
  const dots = Object.entries(navAttention(s)).filter(([, n]) => n > 0).map(([pg, n]) => `${PAGE_BY_ID[pg as PageId]?.label || pg} (${n})`);

  /* global search probes */
  const probes = [aislingName.split(" ")[0], DEMO_EPISODE, "BATCH"];
  const searchText = probes.map((q) => `"${q}": ${hitSummary(globalSearch(s, q))}`).join("; ");

  /* drawer */
  const drawerClinical = canViewEpisodeClinical(s, DEMO_EPISODE);

  /* files */
  const files = visibleFiles(s);
  const hiddenFiles = PH_FILES.filter((f) => !files.some((x) => x.id === f.id));

  /* agents and activity */
  const agentAll = s.activity.filter((e) => e.actor.kind === "agent");
  const agentShown = activityFeed(s, { filter: "agents" });
  const agentMinimal = agentShown.filter((v) => v.minimal).length;
  const feed = activityFeed(s);
  const feedMinimal = feed.filter((v) => v.minimal).length;

  /* ontology: compare with the full model a clinical reviewer sees */
  const om = ontologyModel(s);
  const full = ontologyModel(asPersona(s, "neil"));
  const hiddenOnto = full.entities.filter((e) => !om.entities.some((x) => x.id === e.id)).map((e) => e.label);

  return [
    {
      surface: "Navigation",
      sees: <>All {PAGES.length} modules stay in the rail. Restricted content inside a page is replaced by a notice that says what this role can see. Attention dots: {dots.length ? dots.join(", ") : "none"}.</>,
      withheld: clinical ? "Nothing at module level." : "Clinical review and follow-up stories raise no dots or notifications.",
      target: { page: "Results" }, targetLabel: "Open Results",
    },
    {
      surface: "Global search",
      sees: <>{searchText}.</>,
      withheld: p.role === "clinical_capture"
        ? "Episodes from clinics this role is not assigned to."
        : clinical ? `Nothing for these searches.${p.perms.has("imports.view") ? "" : " Import batches are not searchable for this role."}`
          : `Episodes, follow-up items and clinical files never appear in results.${p.perms.has("imports.view") ? "" : " Import batches are not searchable for this role."}`,
    },
    {
      surface: "Participant drawer",
      sees: drawerClinical
        ? <>{aislingName}'s record shows clinical values: BMI, blood pressure and sample laboratory results.</>
        : <>{aislingName}'s record shows identity, programme and booking logistics only.</>,
      withheld: drawerClinical ? "Nothing for this episode." : "Clinical values are removed, not blurred, and the drawer says what this role can see.",
      target: { page: "Participants", tab: "directory", params: { person: DEMO_PERSON } }, targetLabel: `Open ${aislingName.split(" ")[0]}'s record`,
    },
    {
      surface: "Files",
      sees: <>{files.length} of {PH_FILES.length} files visible.</>,
      withheld: hiddenFiles.length ? `Hidden: ${hiddenFiles.map((f) => f.name).join(", ")}.` : "No files hidden.",
      target: { page: "Records", tab: "files" }, targetLabel: "Open Records, Files",
    },
    {
      surface: "Agents",
      sees: <>{agentShown.length - agentMinimal} agent actions in full{agentMinimal ? `, ${agentMinimal} as a summary only` : ""}. {p.perms.has("agents.configure") ? "Can configure agents." : "Cannot configure agents."}</>,
      withheld: agentAll.length - agentShown.length ? `${agentAll.length - agentShown.length} agent actions hidden.` : agentMinimal ? "Clinical detail in agent actions is replaced by a summary." : "Nothing withheld.",
      target: { page: "Agents", tab: "activity" }, targetLabel: "Open Agents, Activity",
    },
    {
      surface: "Activity feed",
      sees: <>{feed.length - feedMinimal} of {s.activity.length} events in full{feedMinimal ? `, ${feedMinimal} as a summary` : ""}.</>,
      withheld: s.activity.length - feed.length ? `${s.activity.length - feed.length} clinical events hidden entirely.` : feedMinimal ? "Clinical wording is replaced by a neutral summary." : "Nothing withheld.",
      target: { page: "Activity", tab: "everything" }, targetLabel: "Open Activity",
    },
    {
      surface: "Ontology",
      sees: <>{om.entities.length} entity types and {om.relations.length} relationship types.</>,
      withheld: hiddenOnto.length ? `Clinical nodes hidden: ${joinList(hiddenOnto)}.` : "No nodes hidden.",
      target: { page: "Records", tab: "ontology" }, targetLabel: "Open the ontology",
    },
    {
      surface: "Review and release",
      sees: p.perms.has("clinical.review") ? "Can review, release and correct individual reports, one clinician action at a time." : clinical ? "Can view clinical values for permitted sessions, without doctor-only review actions." : "Sees queue counts only.",
      withheld: p.perms.has("clinical.review") ? "Nothing. Release stays an individual clinician action." : "Release, the all-normal shortcut and corrections are not available.",
      target: { page: "Results", tab: "review" }, targetLabel: "Open Results, Review",
    },
    {
      surface: "Imports",
      sees: p.perms.has("imports.view") ? `Sees import batches and row counts${p.perms.has("identity.resolve") ? ", and can resolve identity exceptions with a documented two-identifier check" : ""}.` : "Import batches are not shown.",
      withheld: !p.perms.has("imports.view") ? "Batches, rows and identity exceptions." : clinical ? "Nothing beyond the batch view." : "Blood values and result rows are never shown.",
      target: { page: "Results", tab: "imports" }, targetLabel: "Open Results, Imports",
    },
    {
      surface: "Exports",
      sees: p.perms.has("reports.export") ? `Can export approved employer reports, aggregate only.${p.perms.has("reports.approve") ? " Can approve the clinical narrative." : ""}` : "Cannot build or export employer reports.",
      withheld: "Identifiable clinical records never leave in employer output. Small cohorts are blocked.",
      target: { page: "Reporting", tab: "exports" }, targetLabel: "Open Reporting, Exports",
    },
  ];
}

export default function Permissions() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const rows = liveRows(s);
  const allowed = p.perms.size;
  return (
    <div className="ph-page">
      <SettingsHeader
        gated={false}
        title="Permissions"
        sub="A view-only role matrix and a preview role selector. Switching role re-filters navigation, search, drawers, files, agents and exports across the app."
      />
      <div className="ph-stack">
        <div className="ph-card-flat" style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Icon name="shield" size={17} style={{ color: "var(--accent)", marginTop: 1 }} />
          <div className="phs-body">
            <span className="phs-strong">Frontend visibility simulation.</span> This is not production server-side security. Authentication is unchanged, and switching role never signs anyone in or out.
          </div>
        </div>
        <Split
          main={
            <Card pad={false}>
              <div className="ph-pad" style={{ paddingBottom: 4 }}>
                <CardHeader
                  title={`What ${p.isParticipant ? "the participant" : firstNameOf(p.name)} can see now`}
                  sub="Live results from the same rules the screens use. Switch role to watch them change."
                  right={<Pill tone="info" icon="eye">{p.roleLabel}</Pill>}
                />
              </div>
              <div className="ph-tablewrap">
                <table className="ph-table phs-table">
                  <thead><tr><th style={{ width: 150 }}>Surface</th><th>This role sees</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.surface}>
                        <th scope="row">
                          <span style={{ color: "var(--ink)", fontSize: 12.5 }}>{r.surface}</span>
                          <div style={{ marginTop: 4, fontWeight: 400 }}>
                            {r.target
                              ? <button type="button" className="ph-link" style={{ fontSize: 11.5 }} onClick={() => nav.go(r.target!)}>{r.targetLabel}</button>
                              : <span className="phs-note">Try the search tester</span>}
                          </div>
                        </th>
                        <td>
                          <div className="phs-body">{r.sees}</div>
                          <div className="phs-note" style={{ marginTop: 3 }}><Icon name="lock" size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />{r.withheld}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          }
          side={
            <>
              <Card>
                <CardHeader title="Preview role" sub="Neil Reddy is the default persona." />
                <div className="ph-row-flex" style={{ gap: 11, marginBottom: 14 }}>
                  <Avatar name={p.name} tint={p.staff?.tint} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div className="phs-strong" style={{ fontSize: 13.5 }}>{p.name}</div>
                    <div className="phs-note">{p.title}, {p.roleLabel}</div>
                    <div className="phs-note">{allowed} of {PERM_TOTAL} capabilities</div>
                  </div>
                </div>
                <RolePreview />
                {p.id !== "neil" ? (
                  <div style={{ marginTop: 12 }}><Button size="sm" icon="refresh" onClick={() => dispatch(act.setPersona("neil"))}>Return to Neil (default)</Button></div>
                ) : null}
              </Card>
              <SearchTester />
            </>
          }
        />
        <RoleMatrix />
      </div>
    </div>
  );
}

function SearchTester() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const [q, setQ] = useState(DEMO_EPISODE);
  const hits = globalSearch(s, q, 12);
  const groups = groupHits(hits);
  return (
    <Card>
      <CardHeader title="Try global search as this role" sub="Uses the same role-filtered search as the header." />
      <SearchBox value={q} onChange={setQ} placeholder="Search as this role" width="100%" />
      <div style={{ marginTop: 12 }}>
        {!q.trim() ? (
          <div className="phs-note">Type an ID or a name, for example PH-E-0101, Aisling or BATCH.</div>
        ) : !groups.length ? (
          <div className="phs-note">No results that {p.isParticipant ? "the participant" : firstNameOf(p.name)} can see.</div>
        ) : (
          <ul className="phs-list">
            {groups.map((g) => (
              <li key={g.group}>
                <div className="ph-row-flex" style={{ fontSize: 11.5 }}><span className="ph-eyebrow ph-grow">{g.group}</span><span className="ph-num ph-faint">{g.hits.length}</span></div>
                {g.hits.slice(0, 3).map((h) => (
                  <div key={h.id} style={{ marginTop: 4 }}>
                    <button type="button" className="ph-link" style={{ fontSize: 12.5 }} onClick={() => nav.go(h.target)}>{h.title}</button>
                    <div className="phs-note">{h.subtitle}</div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RoleMatrix() {
  const s = usePhState();
  const p = usePersona();
  const cur: RoleKey | "participant" = p.role;
  const holders = (r: RoleKey) => s.staff.filter((x) => x.role === r).map((x) => firstNameOf(x.name));
  const colCls = (r: RoleKey | "participant") => (cur === r ? " phs-cur" : "");
  return (
    <Card pad={false}>
      <div className="ph-pad" style={{ paddingBottom: 4 }}>
        <CardHeader
          title="Role matrix"
          sub="Rows are capabilities and columns are roles. View only. The highlighted column is the role being previewed."
          right={<Pill tone="neutral" icon="lock">View only</Pill>}
        />
      </div>
      <div className="ph-tablewrap">
        <table className="ph-table phs-table phs-matrix">
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Capabilities by role</caption>
          <thead>
            <tr>
              <th className="phs-cap" scope="col">Capability</th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={"phs-rolecol" + colCls(r)}>
                  <div>{ROLE_LABEL[r]}</div>
                  <div className="phs-note" style={{ fontWeight: 400 }}>{holders(r).join(", ") || "No profile"}</div>
                </th>
              ))}
              <th scope="col" className={"phs-rolecol" + colCls("participant")}>
                <div>Participant</div>
                <div className="phs-note" style={{ fontWeight: 400 }}>Portal preview</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <Fragment key={g}>
                <tr className="phs-group">
                  <th className="phs-cap" scope="colgroup">{g}</th>
                  <td colSpan={ROLES.length + 1} />
                </tr>
                {PERM_DEFS.filter((d) => d.group === g).map((d) => (
                  <tr key={d.key}>
                    <th scope="row" className="phs-cap" style={{ color: "var(--body)" }}>{d.label}</th>
                    {ROLES.map((r) => <td key={r} className={"phs-cell" + colCls(r)}><YesNo yes={d.roles.includes(r)} /></td>)}
                    <td className={"phs-cell" + colCls("participant")}><YesNo yes={false} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="phs-group">
              <th className="phs-cap" scope="colgroup">Participant</th>
              <td colSpan={ROLES.length + 1} />
            </tr>
            <tr>
              <th scope="row" className="phs-cap" style={{ color: "var(--body)" }}>View own released reports in the portal preview</th>
              {ROLES.map((r) => <td key={r} className={"phs-cell" + colCls(r)}><YesNo yes={false} /></td>)}
              <td className={"phs-cell" + colCls("participant")}><YesNo yes /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="ph-pad" style={{ paddingTop: 10 }}>
        <ul className="phs-bullets">
          <li><Icon name="info" size={13} style={{ color: "var(--faint)" }} />Clinical capture sees clinical content only for the sessions it is assigned to.</li>
          <li><Icon name="info" size={13} style={{ color: "var(--faint)" }} />Operations roles see counts and minimal identity only, never blood values or participant clinical reports.</li>
          <li><Icon name="info" size={13} style={{ color: "var(--faint)" }} />Capabilities follow the role. Moving a profile to another team does not change them.</li>
        </ul>
      </div>
    </Card>
  );
}
