/* Settings, Teams: the four demo teams and the eight demonstration profiles. act.assignTeam moves
   a profile and its team together, so Records, Staff, the team board and the access-review
   register show the change at once. Permissions follow the role, never the team. */
import { ROLE_LABEL, act, activityFeed, visibleTasks } from "../../model";
import type { PhState, Staff, Team, TeamId } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Card, CardHeader, DataTable, EntityLink, Icon, Pill, Select } from "../../ui";
import type { Column } from "../../ui";
import { ActivityList, SettingsHeader, sessionClient, staffToday, useEditBlock } from "./common";

export default function Teams() {
  const s = usePhState();
  const nav = useNav();
  const block = useEditBlock();
  const changes = activityFeed(s).filter((v) => v.event.verb === "settings.team");
  return (
    <div className="ph-page">
      <SettingsHeader
        title="Teams"
        sub={`The ${s.teams.length} demo teams and the ${s.staff.length} demonstration profiles taken from the public website. This roster is not the total headcount. Assignments are fictional.`}
      />
      <div className="ph-stack">
        <div className="phs-board">
          {s.teams.map((t) => <TeamCard key={t.id} team={t} state={s} />)}
        </div>
        <Card pad={false}>
          <div className="ph-pad" style={{ paddingBottom: 4 }}>
            <CardHeader
              title="Team assignments"
              sub={block ? block : "Move a profile to another team. The change is written to Activity and shows in Records, Staff straight away."}
              right={block ? <Pill tone="neutral" icon="lock">View only</Pill> : null}
            />
          </div>
          <AssignmentTable state={s} block={block} />
        </Card>
        <div className="ph-split-even">
          <Card>
            <CardHeader title="How teams are used" />
            <ul className="phs-bullets">
              <li><Icon name="users" size={14} style={{ color: "var(--accent)" }} />Teams group the profiles for coordination and for governance ownership.</li>
              <li><Icon name="shield" size={14} style={{ color: "var(--accent)" }} /><span>Capabilities come from the role. A team move does not change what a profile can see. <button type="button" className="ph-link" onClick={() => nav.go({ page: "Settings", tab: "permissions" })}>See the role matrix</button></span></li>
              <li><Icon name="link" size={14} style={{ color: "var(--accent)" }} /><span>A move updates this board, <button type="button" className="ph-link" onClick={() => nav.go({ page: "Records", tab: "staff" })}>Records, Staff</button> and the access-review register in <button type="button" className="ph-link" onClick={() => nav.go({ page: "Settings", tab: "governance", params: { item: "gov-access" } })}>Governance</button>.</span></li>
              <li><Icon name="info" size={14} style={{ color: "var(--accent)" }} />A team without a supplied owner shows Owner to confirm.</li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="Recent team changes" sub="From the activity history." />
            <ActivityList items={changes} limit={6} empty="No team changes in this session." />
          </Card>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ team, state }: { team: Team; state: PhState }) {
  const members = team.memberIds.map((id) => state.staff.find((x) => x.id === id)).filter((x): x is Staff => !!x);
  const owner = team.ownerId ? state.staff.find((x) => x.id === team.ownerId) || null : null;
  const ownerOutside = !!owner && !team.memberIds.includes(owner.id);
  return (
    <Card>
      <div className="ph-row-flex" style={{ alignItems: "flex-start" }}>
        <div className="ph-grow">
          <h3 className="ph-h2">{team.name}</h3>
          <div className="phs-note" style={{ marginTop: 3 }}>{team.purpose}</div>
        </div>
        <span className="ph-num ph-pill" style={{ background: "var(--track)", color: "var(--ink)" }} title={`${members.length} demonstration profiles on this team`}>{members.length}</span>
      </div>
      <div className="phs-small" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span className="ph-faint">Governance owner</span>
        {owner ? <EntityLink kind="staff" id={owner.id}>{owner.name}</EntityLink> : <Pill tone="neutral" icon="alert" title="No actual owner was supplied">Owner to confirm</Pill>}
        {ownerOutside ? <Pill tone="warn" title="The recorded owner has moved to another team">Owner is not on this team</Pill> : null}
      </div>
      {members.length ? (
        <ul className="phs-list" style={{ marginTop: 10 }}>
          {members.map((m) => (
            <li key={m.id} className="ph-row-flex" style={{ gap: 9 }}>
              <Avatar name={m.name} tint={m.tint} size={26} />
              <div style={{ minWidth: 0, fontSize: 13 }}>
                <EntityLink kind="staff" id={m.id}>{m.name}</EntityLink>
                <div className="phs-note">{m.title}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="phs-note" style={{ marginTop: 12 }}>No profiles on this team at the moment.</div>
      )}
    </Card>
  );
}

function AssignmentTable({ state, block }: { state: PhState; block: string | null }) {
  const tasks = visibleTasks(state);
  const cols: Column<Staff>[] = [
    {
      key: "profile", header: "Profile", nowrap: false,
      cell: (x) => (
        <div className="ph-row-flex" style={{ gap: 9 }}>
          <Avatar name={x.name} tint={x.tint} size={26} />
          <div style={{ minWidth: 0 }}>
            <EntityLink kind="staff" id={x.id}>{x.name}</EntityLink>
            <div className="phs-note">{x.title}</div>
          </div>
        </div>
      ),
    },
    {
      key: "team", header: "Team", width: 190,
      cell: (x) => block
        ? <span>{state.teams.find((t) => t.id === x.team)?.name || x.team}</span>
        : (
          <Select aria-label={`Team for ${x.name}`} value={x.team} onChange={(e) => dispatch(act.assignTeam(x.id, e.target.value as TeamId))} style={{ height: 30, fontSize: 12.5, width: 180 }}>
            {state.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        ),
    },
    { key: "role", header: "Role", nowrap: false, cell: (x) => ROLE_LABEL[x.role] },
    {
      key: "today", header: "Clinic today", nowrap: false,
      cell: (x) => {
        const t = staffToday(state, x.id);
        if (!t.length) return <span className="ph-faint">No clinic today</span>;
        return t.map((a) => (
          <div key={a.session.id}>
            <EntityLink kind="session" id={a.session.id}>{a.as === "nurse" ? "Nurse" : "Support"}, {sessionClient(a.session)} clinic</EntityLink>
            <div className="phs-note">{a.session.siteName}</div>
          </div>
        ));
      },
    },
    {
      key: "tasks", header: "Open tasks", align: "right",
      cell: (x) => <span className="ph-num">{tasks.filter((t) => t.task.ownerId === x.id && t.status !== "done").length}</span>,
    },
  ];
  return (
    <DataTable
      rows={state.staff}
      columns={cols}
      rowKey={(x) => x.id}
      caption="Team assignments for the eight demonstration profiles"
      footerNote="demonstration profiles. Open tasks count only tasks your role can see."
    />
  );
}
