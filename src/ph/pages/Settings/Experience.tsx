/* Settings, Experience: theme, density and accessibility for this browser session (owned by the
   app shell), the demo clock, role preview and Reset demo. Reset restores the exact baseline and
   asks for confirmation inside the app. The comparison table is computed against a fresh baseline
   built by the same deterministic fixtures, so it shows exactly what a reset will undo. */
import { useMemo, useState } from "react";
import {
  BRAND, CLOCK_PRESETS, batchStats, createInitialState, followUpList, persona, programmeCounts, reminderStats, reviewStats, todayStats, visibleTasks, act,
} from "../../model";
import type { PhState } from "../../model";
import { dispatch, resetDemo, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import type { PhShell } from "../../nav-context";
import { Button, Card, CardHeader, Icon, Modal, Pill, Segmented, Split, Switch } from "../../ui";
import { RolePreview, SettingsHeader } from "./common";

const BATCH_ID = "BATCH-20261002-01";

interface Measure { key: string; label: string; value: string }

/** A short hash of every record in the store (toasts aside), so "exact baseline" can be checked, not assumed. */
const fpCache = new WeakMap<PhState, string>();
function fingerprint(s: PhState): string {
  const hit = fpCache.get(s);
  if (hit) return hit;
  const { toasts, counters, ...rest } = s;
  const { toast, ...ctr } = counters;
  void toasts; void toast;
  const json = JSON.stringify({ ...rest, counters: ctr });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const v = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  fpCache.set(s, v);
  return v;
}

/** Measures a reset returns to baseline. All derived with the shared selectors. */
function measures(s: PhState, baselineTeams?: Record<string, string>): Measure[] {
  const t = programmeCounts(s);
  const d = todayStats(s);
  const b = batchStats(s, BATCH_ID);
  const r = reminderStats(s);
  const moved = baselineTeams ? s.staff.filter((x) => baselineTeams[x.id] !== x.team).length : 0;
  return [
    { key: "invited", label: "Invited", value: String(t.invited) },
    { key: "booked", label: "Booked", value: String(t.booked) },
    { key: "attended", label: "Attended", value: String(t.attended) },
    { key: "states", label: "Released, ready, awaiting, on hold", value: `${t.released}, ${t.ready}, ${t.awaiting}, ${t.onHold}` },
    { key: "today", label: "Booked today", value: `${d.booked} of ${d.capacity} slots` },
    { key: "rows", label: "Eurofins rows imported, duplicate, held", value: `${b.imported}, ${b.duplicates}, ${b.quarantined}` },
    { key: "reminders", label: "Today's reminders delivered, failed", value: `${r.delivered}, ${r.failed}` },
    { key: "followups", label: "Open follow-ups", value: String(s.followUps.filter((f) => f.status === "open").length) },
    { key: "versions", label: "Report versions", value: String(s.reportVersions.length) },
    { key: "forms", label: "Form template versions", value: String(s.forms.templates.reduce((n, x) => n + x.versions.length, 0)) },
    { key: "teams", label: "Profiles moved from their baseline team", value: String(moved) },
    { key: "owners", label: "Governance items with an owner", value: String(s.settings.governance.filter((g) => g.owner).length) },
    { key: "ai", label: "AI drafting preview", value: s.settings.aiDraftingOn ? "On" : "Off" },
    { key: "clock", label: "Demo clock", value: CLOCK_PRESETS.find((c) => c.id === s.clock.preset)?.label || s.clock.preset },
    { key: "persona", label: "Persona", value: persona(s).name },
    { key: "activity", label: "Activity events", value: String(s.activity.length) },
    { key: "store", label: "Whole-store fingerprint (every record)", value: fingerprint(s) },
  ];
}

let baselineCache: { measures: Measure[]; teams: Record<string, string> } | null = null;
function baseline() {
  if (!baselineCache) {
    const b = createInitialState();
    const teams = Object.fromEntries(b.staff.map((x) => [x.id, x.team]));
    baselineCache = { measures: measures(b, teams), teams };
  }
  return baselineCache;
}

export default function Experience() {
  const s = usePhState();
  const nav = useNav();
  const shell = nav.shell;
  const base = useMemo(baseline, []);
  const now = measures(s, base.teams);
  const changed = now.filter((m, i) => m.value !== base.measures[i].value);
  const [confirm, setConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  return (
    <div className="ph-page">
      <SettingsHeader
        gated={false}
        title="Experience"
        sub="Theme, density and accessibility for this browser session, the demo clock, role preview and Reset demo."
      />
      <div className="ph-stack">
        <div className="ph-split-even">
          {shell ? <Appearance shell={shell} /> : (
            <Card><CardHeader title="Appearance" sub="Theme and density controls are not available in this view." /></Card>
          )}
          <div className="ph-stack">
            <Card>
              <CardHeader title="Accessibility" />
              <div>
                {shell ? (
                  <div className="phs-control">
                    <div className="phs-cmain">
                      <div className="phs-strong" style={{ fontSize: 13 }}>Reduce motion</div>
                      <div className="phs-small ph-dim" style={{ marginTop: 3 }}>Stops page, drawer and chart animations. The system reduced-motion setting is always respected as well.</div>
                    </div>
                    <div className="phs-cside">
                      <Pill tone={shell.reduceMotion ? "info" : "neutral"} icon={shell.reduceMotion ? "check" : "dot"}>{shell.reduceMotion ? "On" : "Off"}</Pill>
                      <Switch on={shell.reduceMotion} onChange={shell.setReduceMotion} label="Reduce motion" />
                    </div>
                  </div>
                ) : null}
                <div className="phs-control">
                  <div className="phs-cmain">
                    <div className="phs-strong" style={{ fontSize: 13 }}>Status and keyboard</div>
                    <ul className="phs-bullets" style={{ marginTop: 6 }}>
                      <li><Icon name="check" size={13} style={{ color: "var(--accent)" }} />Status is always shown as text, an icon and colour, never colour alone.</li>
                      <li><Icon name="check" size={13} style={{ color: "var(--accent)" }} />Escape closes drawers, dialogs and menus. Focus moves into a drawer when it opens.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
            <DemoClock state={s} />
          </div>
        </div>

        <Split
          main={
            <Card pad={false}>
              <div className="ph-pad" style={{ paddingBottom: 4 }}>
                <CardHeader
                  title="Reset demo"
                  sub="Restores every baseline record and count, Neil Reddy as the persona and the baseline clock. Theme, density and motion stay as they are."
                  right={<Button variant="danger" icon="refresh" onClick={() => setConfirm(true)}>Reset demo</Button>}
                />
                <div className="ph-row-flex" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  {changed.length
                    ? <Pill tone="warn" icon="alert">{changed.length} of {now.length} measures differ from the baseline</Pill>
                    : <Pill tone="ok" icon="check">Every measure matches the baseline</Pill>}
                  {resetDone && !changed.length ? <span className="phs-note">Baseline restored.</span> : null}
                </div>
              </div>
              <div className="ph-tablewrap">
                <table className="ph-table phs-table">
                  <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Current values compared with the baseline</caption>
                  <thead><tr><th>Measure</th><th>Baseline</th><th>Now</th><th style={{ width: 100 }}>Status</th></tr></thead>
                  <tbody>
                    {now.map((m, i) => {
                      const same = m.value === base.measures[i].value;
                      return (
                        <tr key={m.key}>
                          <th scope="row">{m.label}</th>
                          <td className="ph-num">{base.measures[i].value}</td>
                          <td className="ph-num" style={{ color: same ? "var(--body)" : "var(--ink)", fontWeight: same ? 400 : 600 }}>{m.value}</td>
                          <td>{same ? <span className="phs-note"><Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Matches</span> : <Pill tone="warn" icon="alert">Changed</Pill>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          }
          side={
            <Card>
              <CardHeader title="Role preview" sub="Switch who the demo is shown as. Navigation, search, drawers, files, agents and exports re-filter at once." />
              <RolePreview id="phs-experience-role" />
              <div style={{ marginTop: 12 }}>
                <button type="button" className="ph-link" style={{ fontSize: 12 }} onClick={() => nav.go({ page: "Settings", tab: "permissions" })}>See the role matrix and what each role can see</button>
              </div>
            </Card>
          }
        />
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset the demo?"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" icon="refresh" onClick={() => { resetDemo(); setConfirm(false); setResetDone(true); }}>Reset demo</Button>
          </>
        }
      >
        <div className="phs-body">
          Every record and count returns to the baseline: {BRAND.org} on Monday 5 October 2026 at 08:15, seen as Neil Reddy. {changed.length ? `${changed.length} of the measures on this page have changed in this session and will return to their baseline values.` : "Nothing has changed since the baseline."}
        </div>
        <div className="phs-note" style={{ marginTop: 8 }}>Theme, density and motion settings stay as they are. Nothing is sent or deleted outside this demo.</div>
      </Modal>
    </div>
  );
}

function Appearance({ shell }: { shell: PhShell }) {
  const groups = Array.from(new Set(shell.themes.map((t) => t.group)));
  /* The harbour theme carries the Precision Health teal in pulse.css; its registry swatch predates the rebrand. */
  const accentOf = (t: PhShell["themes"][number]) => (t.id === "harbour" ? BRAND.teal : t.accent);
  return (
    <Card>
      <CardHeader title="Appearance" sub="Applies to this browser session only." />
      <div className="ph-stack" style={{ gap: 16 }}>
        {groups.map((g) => (
          <div key={g}>
            <div className="ph-eyebrow" style={{ marginBottom: 8 }}>{g} themes</div>
            <div className="phs-swatches" role="group" aria-label={`${g} themes`}>
              {shell.themes.filter((t) => t.group === g).map((t) => (
                <button key={t.id} type="button" className="phs-option" aria-pressed={shell.theme === t.id} onClick={() => shell.setTheme(t.id)}>
                  <span className="phs-dot" style={{ background: accentOf(t) }} aria-hidden="true" />
                  <span className="ph-grow" style={{ minWidth: 0 }}>{t.label}{t.id === "harbour" ? <span className="phs-note" style={{ display: "block" }}>Default, brand teal</span> : null}</span>
                  {shell.theme === t.id ? <Icon name="check" size={13} style={{ color: "var(--accent)" }} /> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="ph-grow" style={{ minWidth: 180 }}>
            <div className="phs-strong" style={{ fontSize: 13 }}>Density</div>
            <div className="phs-small ph-dim" style={{ marginTop: 2 }}>Compact tightens table rows, cards and buttons.</div>
          </div>
          <Segmented label="Density" value={shell.density} onChange={shell.setDensity} options={[{ id: "comfortable", label: "Comfortable" }, { id: "compact", label: "Compact" }]} />
        </div>
        <div className="ph-row-flex" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="ph-grow" style={{ minWidth: 180 }}>
            <div className="phs-strong" style={{ fontSize: 13 }}>Background</div>
            <div className="phs-small ph-dim" style={{ marginTop: 2 }}>Choose the backdrop behind the Home canvas.</div>
          </div>
          <Button icon="layers" onClick={shell.openBackgrounds}>Open background gallery</Button>
        </div>
      </div>
    </Card>
  );
}

function DemoClock({ state }: { state: PhState }) {
  const p = usePersona();
  const overdue = visibleTasks(state).filter((t) => t.overdue).length;
  const aged = reviewStats(state).aged;
  const fuOverdue = followUpList(state).filter((f) => f.overdue).length;
  return (
    <Card>
      <CardHeader title="Demo clock" sub="Moving the clock only changes time-derived states such as overdue and waiting times. Records and counts stay the same." />
      <div className="phs-options" role="radiogroup" aria-label="Demo clock preset">
        {CLOCK_PRESETS.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={state.clock.preset === c.id} className="phs-option" onClick={() => { if (state.clock.preset !== c.id) dispatch(act.setClock(c.id)); }}>
            <Icon name="clock" size={13} style={{ color: state.clock.preset === c.id ? "var(--accent)" : "var(--faint)" }} />
            <span className="ph-grow">{c.label}</span>
            {state.clock.preset === c.id ? <Icon name="check" size={13} style={{ color: "var(--accent)" }} /> : null}
          </button>
        ))}
      </div>
      <ul className="phs-list" style={{ marginTop: 12 }}>
        <li className="ph-row-flex"><span className="ph-grow phs-small" style={{ color: "var(--body)" }}>Overdue tasks your role can see</span><span className="ph-num phs-strong">{overdue}</span></li>
        <li className="ph-row-flex"><span className="ph-grow phs-small" style={{ color: "var(--body)" }}>Reports waiting over 48 hours</span><span className="ph-num phs-strong">{aged}</span></li>
        {p.perms.has("followup.view") ? (
          <li className="ph-row-flex"><span className="ph-grow phs-small" style={{ color: "var(--body)" }}>Clinical follow-ups past due</span><span className="ph-num phs-strong">{fuOverdue}</span></li>
        ) : null}
      </ul>
    </Card>
  );
}
