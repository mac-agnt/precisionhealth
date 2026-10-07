/* Work, Automations: Precision Health's automation flows as they run today, and how Pulse runs each
   one. Grouped by stage along the participant journey, with Operations alongside. Every number comes
   from the registry's metrics(state) over the shared store. Every send, file transfer and channel
   post is simulated: nothing leaves the browser. */
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  AGENT_DEFS, AUTOMATIONS, AUTOMATION_SOURCES, AUTOMATION_SOURCE_LABEL, AUTOMATION_STAGES, AUTOMATION_STAGE_NOTE, INTEGRATIONS, SLACK_SYSTEM, automationById, automationEvents,
  automationRecords, fmtWhen, linkFor, staffName,
} from "../../model";
import type {
  AutomationActor, AutomationDef, AutomationLink, AutomationLinkGroup, AutomationMetric, AutomationMetrics, AutomationSource, AutomationStage, AutomationSystemRelation, PhState,
} from "../../model";
import { usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, Card, Chip, DemoTag, Drawer, EmptyState, Icon, Kpi, KpiStrip, PageHeader, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import { SourceBadge, StaffCell, Tag, WIDE_MIN, isClinicalViewer, mergeParams, useMeasure } from "./shared";

/* ---- stage keys for deep links: #/Work/automations?stage=laboratory ---- */
const stageKey = (s: AutomationStage) => s.toLowerCase().replace(/\s+/g, "-");
const stageFromKey = (k: string | undefined): AutomationStage | null => AUTOMATION_STAGES.find((s) => stageKey(s) === k) || null;
const sourceFromKey = (k: string | undefined): AutomationSource | null => AUTOMATION_SOURCES.find((s) => s === k) || null;
const JOURNEY: AutomationStage[] = AUTOMATION_STAGES.filter((s) => s !== "Operations");
const SYSTEMS = [...INTEGRATIONS, ...(INTEGRATIONS.some((i) => i.id === SLACK_SYSTEM.id) ? [] : [SLACK_SYSTEM])];
const systemName = (id: string) => SYSTEMS.find((x) => x.id === id)?.name || id;

const ACTOR_ICON: Record<AutomationActor["kind"], GlyphName> = { system: "refresh", staff: "user", participant: "heart", agent: "spark", external: "link" };
const TONE_ICON: Record<Tone, GlyphName> = { ok: "check", warn: "alert", bad: "alert", info: "info", neutral: "dot", brand: "dot" };
const TONE_COLOR: Record<Tone, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--accent)", neutral: "var(--faint)", brand: "var(--accent)" };
const RELATION_LABEL: Record<AutomationSystemRelation, { label: string; tone: Tone }> = {
  replaces: { label: "Replaced by Pulse", tone: "info" },
  uses: { label: "Used by Pulse", tone: "neutral" },
  to_confirm: { label: "Role to confirm", tone: "warn" },
};
const GROUP_ORDER: AutomationLinkGroup[] = ["Screens", "Tasks", "Scheduled jobs", "Messages", "Import batches", "Clinical records", "Clinic sessions", "Records"];
const GROUP_ICON: Record<AutomationLinkGroup, GlyphName> = {
  Screens: "arrow", Tasks: "check", "Scheduled jobs": "calendar", Messages: "sms", "Import batches": "flask", "Clinical records": "lock", "Clinic sessions": "pin", Records: "file",
};

/** Lower-case the first letter for use mid-sentence, unless the word is an acronym such as ECG. */
const midSentence = (t: string) => (/^[A-Z](?:[a-z]|\s)/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
/** An exception that needs a person: warn or bad and above zero. Info counts (in progress, in transit) are not included. */
const needsPerson = (m: AutomationMetric) => m.value > 0 && (m.tone === "warn" || m.tone === "bad");

interface Row { a: AutomationDef; m: AutomationMetrics; events: number }

export default function Automations() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const [measure, width] = useMeasure<HTMLDivElement>();
  const wide = width === 0 || width >= WIDE_MIN;
  const clinical = isClinicalViewer(p);
  const stage = stageFromKey(nav.params.stage);
  const source = sourceFromKey(nav.params.source);
  const selected = automationById(nav.params.automation);

  const rows: Row[] = useMemo(() => AUTOMATIONS.map((a) => ({ a, m: a.metrics(state), events: automationEvents(state, a).length })), [state]);
  const seen = (m: AutomationMetric) => !m.clinical || clinical;
  const open = rows.filter((r) => seen(r.m.exceptions) && needsPerson(r.m.exceptions));
  const openTotal = open.reduce((n, r) => n + r.m.exceptions.value, 0);
  const hiddenOpen = rows.some((r) => !seen(r.m.exceptions));
  const bySource = (s: AutomationSource) => AUTOMATIONS.filter((a) => a.source === s).length;
  const systems = Array.from(new Set(AUTOMATIONS.flatMap((a) => a.systems.map((x) => x.systemId))));
  const eventsTotal = rows.reduce((n, r) => n + r.events, 0);

  const shown = rows.filter((r) => (!stage || r.a.stage === stage) && (!source || r.a.source === source));
  const setParam = (patch: Record<string, string | null>) => nav.setParams(mergeParams(nav.params, patch));
  const openRow = (id: string) => setParam({ automation: id });
  const close = () => setParam({ automation: null });

  const stageStats = (s: AutomationStage) => {
    const rs = rows.filter((r) => r.a.stage === s && (!source || r.a.source === source));
    return { count: rs.length, open: rs.filter((r) => seen(r.m.exceptions) && needsPerson(r.m.exceptions)).length };
  };
  const station = (s: AutomationStage, i: number | null, cls: string) => {
    const st = stageStats(s);
    const on = stage === s;
    return (
      <button key={s} type="button" className={"phf-au-station " + cls} aria-pressed={on} onClick={() => setParam({ stage: on ? null : stageKey(s) })}
        title={`${s}: ${AUTOMATION_STAGE_NOTE[s]}${on ? " Select again to show every stage." : ""}`}>
        <span className="phf-au-ring">{i === null ? <Icon name="calendar" size={13} /> : String(i + 1).padStart(2, "0")}</span>
        <span className="phf-au-sname">{s}</span>
        <span className="phf-au-scount">
          {st.count} {st.count === 1 ? "automation" : "automations"}
          {st.open ? <>, <span className="warn">{st.open} with exceptions</span></> : null}
        </span>
      </button>
    );
  };

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Work"
        title="Automations"
        sub="Every automation Precision Health runs today, from the invitation to the employer report, and how Pulse runs each one. Counts are live from the shared store. Sends, file transfers and channel posts are simulated."
        actions={<DemoTag>Simulated, nothing is sent</DemoTag>}
      />
      <div className="ph-stack">
        <KpiStrip>
          <Kpi label="Automations" value={AUTOMATIONS.length} icon="refresh"
            sub={`${bySource("client_material")} from client material, ${bySource("client_spec")} from the client spec, ${bySource("to_confirm_with_client")} to confirm with the client`} />
          <Kpi label="Exceptions needing a person" value={openTotal} tone={openTotal ? "warn" : "ok"}
            sub={`${open.length ? `Across ${open.length} automations.` : "None open."}${hiddenOpen ? " Clinical counts are shown to clinical roles only." : ""}`} />
          <Kpi label="Tools replaced or touched" value={systems.length} icon="layers" sub={systems.map(systemName).join(", ")}
            onClick={() => nav.go({ page: "Settings", tab: "systems-integrations" })} hint="Open Settings, Systems & Integrations" />
          <Kpi label="Linked activity" value={eventsTotal} icon="list" sub="Entries in the shared activity log, as your role sees them."
            onClick={() => nav.go({ page: "Activity", tab: "everything" })} hint="Open Activity" />
        </KpiStrip>

        <Card>
          <div className="ph-row-flex" style={{ marginBottom: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="ph-grow" style={{ minWidth: 200 }}>
              <h3 className="ph-h2">The journey</h3>
              <div className="ph-dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>Select a stage to show only its automations. Operations runs alongside the journey.</div>
            </div>
            {stage ? <Button size="sm" variant="ghost" icon="x" onClick={() => setParam({ stage: null })}>Show every stage</Button> : null}
          </div>
          <div className={"phf-au-track" + (wide ? "" : " narrow")} role="group" aria-label="Filter by stage">
            {JOURNEY.map((s, i) => station(s, i, i === 0 ? "first" : i === JOURNEY.length - 1 ? "last" : ""))}
            <span className="phf-au-sep" aria-hidden="true" />
            {station("Operations", null, "solo")}
          </div>
        </Card>

        <div className="phf-toolbar" role="group" aria-label="Filter by source">
          <Chip on={!source} count={AUTOMATIONS.length} onClick={() => setParam({ source: null })}>All sources</Chip>
          {AUTOMATION_SOURCES.map((s) => (
            <Chip key={s} on={source === s} count={bySource(s)} onClick={() => setParam({ source: source === s ? null : s })}>{AUTOMATION_SOURCE_LABEL[s]}</Chip>
          ))}
          <span className="phf-spacer" />
          <span className="phf-note">Source says where each flow comes from: what Precision Health sent, their specification, or a Pulse proposal to confirm.</span>
        </div>

        {shown.length === 0 ? (
          <Card pad={false}>
            <EmptyState title="No automations match" icon="filter" action={<Button size="sm" onClick={() => setParam({ stage: null, source: null })}>Clear filters</Button>}>
              {stage ? `${stage} has no automation from this source.` : "No automation has this source."}
            </EmptyState>
          </Card>
        ) : (
          AUTOMATION_STAGES.filter((s) => shown.some((r) => r.a.stage === s)).map((s) => {
            const items = shown.filter((r) => r.a.stage === s);
            const idx = JOURNEY.indexOf(s);
            return (
              <Card key={s} pad={false}>
                <div className="phf-au-stagehead">
                  <span className={"phf-au-stagenum" + (idx < 0 ? " solo" : "")} aria-hidden="true">{idx < 0 ? <Icon name="calendar" size={13} /> : String(idx + 1).padStart(2, "0")}</span>
                  <div className="ph-grow">
                    <h3 className="ph-h2">{s}</h3>
                    <div className="phf-note">{AUTOMATION_STAGE_NOTE[s]}</div>
                  </div>
                  <span className="phf-small ph-num" style={{ flex: "none" }}>{items.length} {items.length === 1 ? "automation" : "automations"}</span>
                </div>
                {items.map((r) => <AutomationRow key={r.a.id} row={r} state={state} wide={wide} clinical={clinical} current={selected?.id === r.a.id} onOpen={openRow} />)}
              </Card>
            );
          })
        )}
        <div className="phf-note">
          <Icon name="info" size={11} style={{ verticalAlign: "-1px", marginRight: 5 }} />
          Simulated throughout: no email or SMS is sent, no file is fetched from FTP or Google Workspace, nothing is posted to Slack and no calendar file is produced. Text marked to confirm is a Pulse proposal until Precision Health confirms it.
        </div>
      </div>
      {nav.params.automation ? <AutomationDrawer id={nav.params.automation} state={state} clinical={clinical} onClose={close} /> : null}
    </div>
  );
}

/* ---- one row ---- */
function MetricNum({ m, clinical }: { m: AutomationMetric; clinical: boolean }) {
  if (m.clinical && !clinical) {
    return <span className="phf-au-lock" title="Visible to clinical roles only"><Icon name="lock" size={11} />Clinical roles only</span>;
  }
  const cls = m.tone === "warn" || m.tone === "bad" || m.tone === "ok" ? " " + m.tone : "";
  return <span className={"phf-au-num" + cls}><b>{m.value.toLocaleString("en-IE")}</b><span>{m.label}</span></span>;
}

function AutomationRow({ row, state, wide, clinical, current, onOpen }: { row: Row; state: PhState; wide: boolean; clinical: boolean; current: boolean; onOpen: (id: string) => void }) {
  const { a, m } = row;
  const owner = state.staff.find((x) => x.id === a.owner);
  return (
    <button type="button" className={"phf-au-row" + (wide ? "" : " narrow")} aria-current={current} onClick={() => onOpen(a.id)} aria-label={`${a.id}, ${a.name}. Open the flow`}>
      <span className="phf-au-block">
        <span className="ph-wrap" style={{ gap: 6 }}>
          <span className="phf-id" style={{ color: "var(--accent)" }}>{a.id}</span>
          <SourceBadge source={a.source} />
        </span>
        <span className="phf-au-name">{a.name}</span>
        <span className="phf-small"><span className="ph-faint">When </span>{midSentence(a.trigger)}</span>
      </span>
      <span className="phf-au-cmp">
        <span className="k">Today</span>
        <span className="v">
          <span className="ph-wrap" style={{ gap: 4, marginBottom: 3 }}>
            {a.today.tools.length ? a.today.tools.map((t) => <Tag key={t}>{t}</Tag>) : <Tag>Not described</Tag>}
          </span>
          <span className="phf-clamp2" style={{ color: "var(--dim)" }}>{a.today.how}</span>
        </span>
        <span className="k pulse">Pulse</span>
        <span className="v phf-clamp2" style={{ color: "var(--ink)" }}>{a.inPulse}</span>
      </span>
      <span className="phf-au-nums">
        <MetricNum m={m.runs} clinical={clinical} />
        <MetricNum m={m.exceptions} clinical={clinical} />
      </span>
      <span className="ph-row-flex" style={{ gap: 8, alignItems: "flex-start" }}>
        <Avatar name={owner?.name || a.owner} tint={owner?.tint} size={24} />
        <span style={{ minWidth: 0, lineHeight: 1.3 }}>
          <span className="ph-trunc" style={{ display: "block", fontSize: 12.5, color: "var(--ink)" }}>{owner?.name || staffName(state, a.owner)}</span>
          <span className="ph-trunc" style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>Owner</span>
        </span>
      </span>
      {wide ? <Icon name="chevronRight" size={14} style={{ color: "var(--faint)", marginTop: 3 }} /> : null}
    </button>
  );
}

/* ---- detail drawer ---- */
function Block({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ minWidth: 0 }}>
      <div className="ph-row-flex" style={{ marginBottom: 8 }}><span className="phf-sectiontitle ph-grow" style={{ margin: 0 }}>{title}</span>{right}</div>
      {children}
    </section>
  );
}

function AutomationDrawer({ id, state, clinical, onClose }: { id: string; state: PhState; clinical: boolean; onClose: () => void }) {
  const nav = useNav();
  const a = automationById(id);
  if (!a) {
    return (
      <Drawer open onClose={onClose} title="Automation not found">
        <EmptyState title={`No automation ${id}`}>The Automations tab lists AUT-01 to AUT-{String(AUTOMATIONS.length).padStart(2, "0")}.</EmptyState>
      </Drawer>
    );
  }
  const m = a.metrics(state);
  const records = automationRecords(state, a);
  const events = automationEvents(state, a);
  const metrics = [m.runs, m.exceptions, ...m.more];
  const firstScreen = records.find((r) => r.group === "Screens");
  const groups = GROUP_ORDER.map((g) => ({ g, items: records.filter((r) => r.group === g) })).filter((x) => x.items.length);
  const go = (r: AutomationLink) => nav.go(r.target);

  return (
    <Drawer open onClose={onClose} width={700} title={a.name}
      sub={<span className="ph-wrap" style={{ gap: 6 }}><span className="phf-id" style={{ color: "var(--accent)" }}>{a.id}</span><Tag>{a.stage}</Tag><SourceBadge source={a.source} /><DemoTag>Simulated</DemoTag></span>}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{firstScreen ? <Button variant="primary" icon="arrow" onClick={() => go(firstScreen)}>Open {midSentence(firstScreen.label)}</Button> : null}</>}>
      <div className="ph-stack" style={{ gap: 18 }}>
        <div className="phf-callout">
          <Icon name="info" size={15} style={{ color: "var(--dim)", marginTop: 1 }} />
          <span><b style={{ fontWeight: 600, color: "var(--ink)" }}>Simulated.</b> No messages are sent, no files are fetched and nothing is posted to an outside channel. The numbers below are live from the demo store.</span>
        </div>

        <Block title="Live counts" right={<StaffCell state={state} id={a.owner} sub="Owner" size={22} />}>
          <div className="phf-au-tiles">
            {metrics.map((x) => (
              x.clinical && !clinical ? (
                <div key={x.key} className="phf-au-tile"><span className="phf-au-lock" style={{ marginTop: 0 }}><Icon name="lock" size={11} />Clinical roles only</span><span>{x.label}</span></div>
              ) : (
                <div key={x.key} className={"phf-au-tile" + (x.tone === "warn" || x.tone === "bad" || x.tone === "ok" ? " " + x.tone : "")}>
                  <b>{x.value.toLocaleString("en-IE")}</b><span>{x.label}</span>
                </div>
              )
            ))}
          </div>
        </Block>

        <Block title="How Pulse runs it">
          <div className="phf-au-flow">
            <div className="phf-au-node">
              <span className="phf-au-dot trigger" aria-hidden="true"><Icon name="flag" size={14} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="phf-au-nodehead"><span className="ph-eyebrow">Trigger</span></div>
                <div className="phf-au-nodetext">{a.trigger}</div>
                {a.conditions.length ? (
                  <ul className="phf-au-bullets" style={{ marginTop: 8 }}>
                    {a.conditions.map((c) => <li key={c}><Icon name="check" size={13} stroke={2} style={{ color: "var(--accent)", marginTop: 2 }} />{c}</li>)}
                  </ul>
                ) : null}
              </div>
            </div>
            {a.steps.map((s, i) => (
              <div className="phf-au-node" key={i}>
                <span className="phf-au-dot" aria-hidden="true">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="phf-au-nodehead">
                    <span className="ph-row-flex" style={{ gap: 5, fontSize: 12, color: "var(--dim)" }}>
                      <Icon name={ACTOR_ICON[s.actor.kind]} size={12} />{s.actor.label}
                    </span>
                    {s.source && s.source !== a.source ? <SourceBadge source={s.source} /> : null}
                  </div>
                  <div className="phf-au-nodetext">{s.action}</div>
                  <div className="phf-au-io">
                    <Tag icon="link">{s.channel}</Tag>
                    <span><Icon name="arrow" size={11} style={{ verticalAlign: "-1px", marginRight: 4, color: "var(--faint)" }} />{s.output}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="phf-au-node">
              <span className="phf-au-dot out" aria-hidden="true"><Icon name="check" size={14} stroke={2.2} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="phf-au-nodehead"><span className="ph-eyebrow">Outputs</span></div>
                <div className="ph-wrap" style={{ gap: 6, marginTop: 6 }}>{a.outputs.map((o) => <Tag key={o}>{o}</Tag>)}</div>
              </div>
            </div>
          </div>
        </Block>

        <Block title="Guardrails: what it never does">
          <ul className="phf-au-bullets">
            {a.guardrails.map((g) => <li key={g}><Icon name="shield" size={13} style={{ color: "var(--ok)", marginTop: 2 }} />{g}</li>)}
          </ul>
        </Block>

        <Block title="Today and in Pulse">
          <div className="phf-cols2">
            <div className="ph-card-flat" style={{ padding: "12px 14px" }}>
              <div className="ph-eyebrow" style={{ marginBottom: 6 }}>Today</div>
              <div className="ph-wrap" style={{ gap: 4, marginBottom: 6 }}>{a.today.tools.length ? a.today.tools.map((t) => <Tag key={t}>{t}</Tag>) : <Tag>No tool described</Tag>}</div>
              <div className="phf-small" style={{ color: "var(--body)" }}>{a.today.how}</div>
            </div>
            <div className="ph-card-flat" style={{ padding: "12px 14px", borderColor: "var(--accent-line)" }}>
              <div className="ph-eyebrow" style={{ marginBottom: 6, color: "var(--accent)" }}>In Pulse</div>
              <div className="phf-small" style={{ color: "var(--ink)" }}>{a.inPulse}</div>
            </div>
          </div>
          <div className="phf-note" style={{ marginTop: 8 }}><span className="ph-faint">Basis: </span>{a.sourceRef}</div>
          {a.openQuestions.length ? (
            <div style={{ marginTop: 10 }}>
              <div className="phf-small" style={{ marginBottom: 6 }}>To confirm with Precision Health</div>
              <ul className="phf-au-bullets">
                {a.openQuestions.map((q) => <li key={q}><Icon name="alert" size={13} style={{ color: "var(--warn)", marginTop: 2 }} />{q}</li>)}
              </ul>
            </div>
          ) : null}
        </Block>

        {a.systems.length || a.agents.length ? (
          <Block title="Systems and agents">
            <ul className="phf-list">
              {a.systems.map((x) => (
                <li key={x.systemId} className="ph-row-flex" style={{ gap: 9, alignItems: "flex-start" }}>
                  <span className="ph-grow" style={{ minWidth: 0 }}>
                    <button type="button" className="ph-link" style={{ fontSize: 12.5 }} onClick={() => nav.go(linkFor("system", x.systemId))}>{systemName(x.systemId)}</button>
                    <span className="phf-note" style={{ display: "block", marginTop: 2 }}>{x.note}</span>
                  </span>
                  <Pill tone={RELATION_LABEL[x.relation].tone}>{RELATION_LABEL[x.relation].label}</Pill>
                </li>
              ))}
              {a.agents.map((ag) => {
                const d = AGENT_DEFS.find((x) => x.id === ag);
                return d ? (
                  <li key={ag} className="ph-row-flex" style={{ gap: 9, alignItems: "flex-start" }}>
                    <span className="ph-grow" style={{ minWidth: 0 }}>
                      <button type="button" className="ph-link" style={{ fontSize: 12.5 }} onClick={() => nav.go({ page: "Agents", tab: "conversations", params: { agent: ag } })}>{d.name} agent</button>
                      <span className="phf-note" style={{ display: "block", marginTop: 2 }}>{d.job}</span>
                    </span>
                    <Pill tone="neutral" icon="spark">Prepares, a person decides</Pill>
                  </li>
                ) : null;
              })}
            </ul>
          </Block>
        ) : null}

        <Block title={`Linked records${records.length ? `, ${records.length}` : ""}`}>
          {groups.length ? (
            <div className="ph-stack" style={{ gap: 12 }}>
              {groups.map(({ g, items }) => (
                <div key={g}>
                  <div className="phf-note" style={{ marginBottom: 4 }}><Icon name={GROUP_ICON[g]} size={11} style={{ verticalAlign: "-1px", marginRight: 5 }} />{g}</div>
                  <ul className="phf-list">
                    {items.map((r) => {
                      const tone: Tone = r.tone || "neutral";
                      return (
                        <li key={r.group + r.id + r.label}>
                          <button type="button" className="phf-rowbtn" style={{ padding: "4px 2px", alignItems: "flex-start" }} onClick={() => go(r)}>
                            <Icon name={TONE_ICON[tone]} size={13} stroke={2} style={{ color: TONE_COLOR[tone], marginTop: 2 }} />
                            <span className="ph-grow" style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>{r.label}</span>
                              {r.sub ? <span className="phf-note" style={{ display: "block", marginTop: 1 }}>{r.sub}</span> : null}
                            </span>
                            <Icon name="chevronRight" size={13} style={{ color: "var(--faint)", marginTop: 2 }} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="phf-note">{m.runs.clinical && !clinical ? "Linked records are clinical. They are visible to clinical roles only." : "No linked records yet. They appear here as soon as this automation runs in the demo."}</div>
          )}
        </Block>

        <Block title={`Activity, ${events.length} ${events.length === 1 ? "entry" : "entries"}`} right={events.length > 6 ? <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Activity", tab: "everything" })}>Open Activity</button> : null}>
          {events.length ? (
            <ul className="phf-list">
              {events.slice(0, 6).map((v) => (
                <li key={v.event.id}>
                  <button type="button" className="phf-rowbtn" style={{ padding: "4px 2px", alignItems: "flex-start" }} onClick={() => nav.go({ page: "Activity", tab: "everything", params: { event: v.event.id } })}>
                    <Icon name={v.minimal ? "lock" : v.event.actor.kind === "agent" ? "spark" : v.event.actor.kind === "staff" ? "user" : "refresh"} size={13} style={{ color: "var(--faint)", marginTop: 2 }} />
                    <span className="ph-grow" style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, color: v.minimal ? "var(--dim)" : "var(--ink)", lineHeight: 1.4 }}>{v.text}</span>
                      <span className="phf-note" style={{ display: "block", marginTop: 1 }}>
                        <span className="ph-num">{fmtWhen(v.event.at, state.clock.nowUtc)}</span>, {v.event.actor.label}{v.event.simulated ? ", simulated" : ""}{v.event.seeded ? "" : ", this session"}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={13} style={{ color: "var(--faint)", marginTop: 2 }} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="phf-note">No activity visible to your role yet. Entries appear as soon as this automation runs in the demo.</div>
          )}
        </Block>
      </div>
    </Drawer>
  );
}
