/* Records, Staff: the eight demonstration profiles from the public website, with team, role,
   demo permissions, clinic assignments and tasks, all derived from the shared store. A team move
   in Settings, Teams or a nurse change in Clinics shows here at once. The roster is not the
   total headcount. Only the two publicly listed addresses are marked as verified. */
import { useRef, useState } from "react";
import { PERM_DEFS, ROLE_LABEL, STORY_DEFS, act, activityFeed, approvalViews, fmtWeekdayDate, fmtWhen, localDateOf, sessionStats, storyViews, taskViews, today, visibleTasks } from "../../model";
import type { PhState, Staff as StaffT, TeamId } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, CardHeader, Chip, DataTable, DemoTag, EntityLink, Pill, RestrictedNotice, Split } from "../../ui";
import type { Column } from "../../ui";
import { ActivityList, DefList, PERM_TOTAL, SettingsHeader, YesNo, firstNameOf, rolePerms, sessionClient, sessionShort, staffSessions, staffToday } from "../Settings/common";

type TeamFilter = "all" | TeamId;

export default function Staff() {
  const s = usePhState();
  const p = usePersona();
  const nav = useNav();
  const detailRef = useRef<HTMLDivElement>(null);
  const [team, setTeam] = useState<TeamFilter>("all");
  if (!p.perms.has("logistics.view")) {
    return (
      <div className="ph-page">
        <SettingsHeader eyebrow="Records" gated={false} title="Staff" sub="Demonstration staff profiles." />
        <RestrictedNotice title="Not available in the participant preview">The participant preview shows the participant's own released data only.</RestrictedNotice>
      </div>
    );
  }
  const tasks = visibleTasks(s);
  const rows = s.staff.filter((x) => team === "all" || x.team === team);
  const paramId = s.staff.some((x) => x.id === nav.params.staff) ? nav.params.staff : null;
  const selected = s.staff.find((x) => x.id === paramId) || rows[0] || s.staff[0];
  const select = (id: string) => {
    nav.setParams({ staff: id });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
    }
  };
  const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name || id;
  const cols: Column<StaffT>[] = [
    {
      key: "who", header: "Profile", nowrap: false, sort: (a, b) => a.name.localeCompare(b.name),
      cell: (x) => (
        <div className="ph-row-flex" style={{ gap: 9, alignItems: "flex-start" }}>
          <Avatar name={x.name} tint={x.tint} size={28} />
          <div style={{ minWidth: 0 }}>
            <div className="phs-strong">{x.name}</div>
            <div className="phs-note">{x.title}</div>
            <div style={{ marginTop: 4 }} title={x.email}>
              {x.emailVerified
                ? <Pill tone="info" icon="check" title={`${x.email}: publicly listed on the company website`}>Public email</Pill>
                : <DemoTag title={`${x.email}: a demonstration alias, not a verified address. No messages are sent.`}>Demo email alias</DemoTag>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "team", header: "Team and role", nowrap: false, sort: (a, b) => teamName(a.team).localeCompare(teamName(b.team)),
      cell: (x) => <><div>{teamName(x.team)}</div><div className="phs-note">{ROLE_LABEL[x.role]}</div><div className="phs-note">{rolePerms(x.role).size} of {PERM_TOTAL} demo capabilities</div></>,
    },
    {
      key: "today", header: "Clinic today", nowrap: false,
      cell: (x) => {
        const t = staffToday(s, x.id);
        return t.length ? t.map((a) => (
          <div key={a.session.id}>
            <span className="phs-small">{a.as === "nurse" ? "Nurse" : "Support"}, {sessionClient(a.session)} clinic</span>
            <div className="phs-note">{a.session.siteName}</div>
          </div>
        )) : <span className="ph-faint">No clinic today</span>;
      },
    },
    {
      key: "tasks", header: "Open tasks", align: "right",
      cell: (x) => {
        const open = tasks.filter((t) => t.task.ownerId === x.id && t.status !== "done");
        const dueToday = open.filter((t) => t.task.dueAt && localDateOf(t.task.dueAt) === today(s)).length;
        return <><span className="ph-num">{open.length}</span><div className="phs-note">{dueToday} due today</div></>;
      },
    },
  ];
  return (
    <div className="ph-page">
      <SettingsHeader
        eyebrow="Records"
        gated={false}
        title="Staff"
        sub={`The ${s.staff.length} demonstration profiles taken from the public website. They are a demo roster, not the total headcount. Assignments and tasks are fictional.`}
      />
      <div className="ph-stack">
        <div className="ph-wrap" style={{ gap: 6 }} role="group" aria-label="Filter by team">
          <Chip on={team === "all"} onClick={() => setTeam("all")} count={s.staff.length}>All teams</Chip>
          {s.teams.map((t) => (
            <Chip key={t.id} on={team === t.id} onClick={() => setTeam(t.id)} count={s.staff.filter((x) => x.team === t.id).length}>{t.name}</Chip>
          ))}
        </div>
        <Split
          main={
            <Card pad={false}>
              <DataTable
                rows={rows}
                columns={cols}
                rowKey={(x) => x.id}
                selectedKey={selected?.id}
                onRowClick={(x) => select(x.id)}
                caption="Demonstration staff profiles"
                footerNote="demonstration profiles. Open tasks count only tasks your role can see."
                empty={<div className="ph-pad phs-note">No profiles on this team. Move someone in Settings, Teams.</div>}
              />
            </Card>
          }
          side={<div ref={detailRef} style={{ scrollMarginTop: 12 }}>{selected ? <StaffDetail x={selected} state={s} /> : null}</div>}
        />
      </div>
    </div>
  );
}

function StaffDetail({ x, state }: { x: StaffT; state: PhState }) {
  const p = usePersona();
  const nav = useNav();
  const perms = rolePerms(x.role);
  const teamName = state.teams.find((t) => t.id === x.team)?.name || x.team;
  const t = today(state);
  const sessions = staffSessions(state, x.id);
  const todays = sessions.filter((a) => a.session.date === t);
  const upcoming = sessions.filter((a) => a.session.date > t);
  const past = sessions.filter((a) => a.session.date < t);
  const allTasks = taskViews(state).filter((tv) => tv.task.ownerId === x.id);
  const shownTasks = allTasks.filter((tv) => tv.visible && tv.status !== "done");
  const hiddenTasks = allTasks.filter((tv) => !tv.visible && tv.status !== "done").length;
  const doneTasks = allTasks.filter((tv) => tv.visible && tv.status === "done").length;
  const programmes = state.programmes.flatMap((pr) => {
    const roles: string[] = [];
    if (pr.ownerId === x.id) roles.push("programme owner");
    if (pr.clinicalLeadId === x.id) roles.push("clinical lead");
    if (pr.reportingLeadId === x.id) roles.push("reporting lead");
    if (pr.opsLeadId === x.id) roles.push("operations lead");
    return roles.length ? [{ pr, roles }] : [];
  });
  const stories = storyViews(state).filter((sv) => STORY_DEFS.some((d) => d.id === sv.def.id && (d.ownerId === x.id || d.secondaryOwnerId === x.id)));
  const approvals = approvalViews(state).filter((a) => a.visible && a.status === "pending" && a.reviewerId === x.id);
  const actions = activityFeed(state, { actor: x.id });
  const isCurrent = p.id === x.id;
  return (
    <Card>
      <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <Avatar name={x.name} tint={x.tint} size={42} />
        <div className="ph-grow">
          <h3 className="ph-h2" style={{ fontSize: 15 }}>{x.name}</h3>
          <div className="phs-note" style={{ fontSize: 12 }}>{x.title}</div>
        </div>
        <Button size="sm" icon="eye" disabled={isCurrent} title={isCurrent ? "Already previewing this profile" : "Frontend visibility simulation"} onClick={() => dispatch(act.setPersona(x.id))}>
          {isCurrent ? "Previewing" : `Preview as ${firstNameOf(x.name)}`}
        </Button>
      </div>
      <DefList items={[
        { label: "Team", value: <button type="button" className="ph-link" onClick={() => nav.go({ page: "Settings", tab: "teams" })}>{teamName}</button> },
        { label: "Role", value: <button type="button" className="ph-link" onClick={() => nav.go({ page: "Settings", tab: "permissions" })}>{ROLE_LABEL[x.role]}</button> },
        { label: "Email", value: <><span className="ph-mono">{x.email}</span><div className="phs-note">{x.emailVerified ? "Publicly listed on the company website." : "Demonstration alias. Not a verified address. No messages are sent."}</div></> },
        { label: "Demo assignment", value: <>{x.assignment} <DemoTag>Fictional</DemoTag></> },
      ]} />

      <div style={{ marginTop: 18 }}>
        <div className="ph-row-flex" style={{ marginBottom: 8 }}>
          <span className="ph-eyebrow ph-grow">Demo permissions</span>
          <span className="phs-note ph-num">{perms.size} of {PERM_TOTAL}</span>
        </div>
        <ul className="phs-bullets">
          {PERM_DEFS.filter((d) => perms.has(d.key)).map((d) => <li key={d.key} style={{ fontSize: 12 }}><YesNo yes yesText="" /><span>{d.label}</span></li>)}
        </ul>
        {perms.size < PERM_TOTAL ? (
          <details className="phs-details" style={{ marginTop: 8 }}>
            <summary>Not permitted ({PERM_TOTAL - perms.size})</summary>
            <ul className="phs-bullets">
              {PERM_DEFS.filter((d) => !perms.has(d.key)).map((d) => <li key={d.key} style={{ fontSize: 12 }}><YesNo yes={false} noText="" /><span className="ph-dim">{d.label}</span></li>)}
            </ul>
          </details>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Clinics</div>
        {todays.length || upcoming.length ? (
          <ul className="phs-list">
            {[...todays, ...upcoming.slice(0, 3)].map((a) => {
              const st = sessionStats(state, a.session.id);
              return (
                <li key={a.session.id}>
                  <EntityLink kind="session" id={a.session.id}>{a.session.date === t ? "Today" : fmtWeekdayDate(a.session.date)}: {sessionShort(a.session)}</EntityLink>
                  <div className="phs-note">{a.as === "nurse" ? "Booked nurse" : "Support resource, not a second booked nurse"}. {st.booked} of {st.slots} slots booked.</div>
                </li>
              );
            })}
          </ul>
        ) : <div className="phs-note">No upcoming clinic assignments.</div>}
        <div className="phs-note" style={{ marginTop: 6 }}>{upcoming.length} upcoming and {past.length} past sessions in total.</div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Open tasks</div>
        {shownTasks.length ? (
          <ul className="phs-list">
            {shownTasks.map((tv) => (
              <li key={tv.task.id}>
                <div className="ph-row-flex" style={{ gap: 8 }}>
                  <span className="ph-grow phs-small"><EntityLink kind="task" id={tv.task.id}>{tv.title}</EntityLink></span>
                  <Pill tone={tv.status === "blocked" ? "warn" : tv.overdue ? "bad" : "neutral"} icon={tv.status === "blocked" ? "lock" : tv.overdue ? "alert" : "clock"}>{tv.statusLabel}</Pill>
                </div>
                <div className="phs-note">{tv.task.id}{tv.task.dueAt ? `, due ${fmtWhen(tv.task.dueAt, state.clock.nowUtc)}` : ""}</div>
              </li>
            ))}
          </ul>
        ) : <div className="phs-note">No open tasks your role can see.</div>}
        <div className="phs-note" style={{ marginTop: 6 }}>
          {doneTasks} done.{hiddenTasks ? ` ${hiddenTasks} clinical task${hiddenTasks === 1 ? " is" : "s are"} hidden for your role.` : ""}
        </div>
      </div>

      {programmes.length || stories.length || approvals.length ? (
        <div style={{ marginTop: 18 }}>
          <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Responsibilities</div>
          <ul className="phs-list">
            {programmes.map(({ pr, roles }) => (
              <li key={pr.id} className="phs-small"><EntityLink kind="programme" id={pr.id}>{pr.name}</EntityLink><span className="ph-dim">: {roles.join(", ")}</span></li>
            ))}
            {stories.map((sv) => (
              <li key={sv.def.id} className="phs-small">
                <span className="ph-dim">{sv.def.id} </span>
                <button type="button" className="ph-link" onClick={() => nav.go(sv.target)}>{sv.headline}</button>
                <span className="ph-dim">{sv.open ? ", open" : ", resolved"}</span>
              </li>
            ))}
            {approvals.length ? (
              <li className="phs-small">
                {approvals.length} pending approval{approvals.length === 1 ? "" : "s"} as reviewer, for example <EntityLink kind="approval" id={approvals[0].id}>{approvals[0].title}</EntityLink>.{" "}
                <button type="button" className="ph-link" onClick={() => nav.go({ page: "Work", tab: "approvals" })}>Open Work, Approvals</button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <div className="ph-eyebrow" style={{ marginBottom: 8 }}>Recent actions</div>
        <ActivityList items={actions} limit={5} empty="No recorded actions visible to your role." />
      </div>
    </Card>
  );
}
