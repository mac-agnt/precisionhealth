/* Portal admin, Access log: participant portal sign-ins, failed sign-ins, consent acceptances,
   report views, staff account actions, support previews and portal settings changes. Rows come
   from the activity store; consent and report access recorded before this session's log are read
   from their records and marked as such. Operational wording only, never a result value. */
import { useMemo, useState } from "react";
import { ACCESS_KIND_LABEL, PROGRAMME_ORDER, accessLog, fmtShortDateTime, ix, personName } from "../../model";
import type { AccessKind, AccessLogRow, ProgrammeId } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, DataTable, EmptyState, Kpi, KpiStrip, Pill, SearchBox, Select } from "../../ui";
import type { Column, GlyphName, Tone } from "../../ui";
import { FilterChips, cmp, useMeasure, withParams } from "./shared";

type KindFilter = "all" | AccessKind;
const KINDS: AccessKind[] = ["signin", "signin_failed", "consent", "report_view", "account_action", "support_access", "settings"];
const LOOK: Record<AccessKind, { tone: Tone; icon: GlyphName }> = {
  signin: { tone: "ok", icon: "user" },
  signin_failed: { tone: "warn", icon: "alert" },
  consent: { tone: "brand", icon: "check" },
  report_view: { tone: "info", icon: "eye" },
  account_action: { tone: "neutral", icon: "shield" },
  support_access: { tone: "warn", icon: "eye" },
  settings: { tone: "neutral", icon: "edit" },
};
const isKind = (v: string | undefined): v is KindFilter => !!v && (v === "all" || (KINDS as string[]).includes(v));

export default function LogView() {
  const nav = useNav();
  const state = usePhState();
  const I = ix(state);
  const params = nav.params;
  const [q, setQ] = useState(params.q || "");
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const kind: KindFilter = isKind(params.kind) ? params.kind : "all";
  const programmeId = (PROGRAMME_ORDER as string[]).includes(params.programme) ? (params.programme as ProgrammeId) : "all";
  const all = accessLog(state);
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (programmeId !== "all" && r.programmeId !== programmeId) return false;
      if (!needle) return true;
      const who = r.personId ? `${personName(I.personById.get(r.personId))} ${r.personId}` : "";
      return `${who} ${r.actor} ${r.text}`.toLowerCase().includes(needle);
    });
  }, [all, programmeId, q, I]);
  const counts = useMemo(() => {
    const c = { all: base.length } as Record<KindFilter, number>;
    KINDS.forEach((k) => { c[k] = 0; });
    base.forEach((r) => { c[r.kind]++; });
    return c;
  }, [base]);
  const rows = kind === "all" ? base : base.filter((r) => r.kind === kind);
  const audit = all.filter((r) => r.source === "audit").length;
  const setKind = (k: KindFilter) => nav.setParams(withParams(params, { kind: k === "all" ? null : k }));
  const openAccount = (personId: string) => nav.setParams({ view: "accounts", person: personId });

  const cols: Column<AccessLogRow>[] = [
    { key: "at", header: "When", sort: (a, b) => cmp(a.at, b.at), cell: (r) => <span className="ph-num">{fmtShortDateTime(r.at)}</span> },
    { key: "kind", header: "Event", sort: (a, b) => cmp(a.kind, b.kind), cell: (r) => <Pill tone={LOOK[r.kind].tone} icon={LOOK[r.kind].icon}>{ACCESS_KIND_LABEL[r.kind]}</Pill> },
    { key: "person", header: "Participant", cell: (r) => r.personId ? (
      <button type="button" className="ph-link pd-person" style={{ textAlign: "left", maxWidth: 180 }} onClick={(e) => { e.stopPropagation(); openAccount(r.personId!); }}>
        <span className="pd-person-name">{personName(I.personById.get(r.personId))}</span><span className="pd-person-id">{r.personId}</span>
      </button>
    ) : <span className="ph-faint">{r.programmeId ? I.programmeById.get(r.programmeId)?.clientName : "All programmes"}</span> },
    { key: "actor", header: "By", sort: (a, b) => cmp(a.actor, b.actor), cell: (r) => <div className="pd-person" style={{ maxWidth: 150 }}><span className="ph-trunc">{r.actor}</span><span className="pd-person-id">{r.actorKind === "participant" ? "Participant" : r.actorKind === "staff" ? "Staff" : r.actorKind === "system" ? "System" : "Agent"}</span></div> },
    { key: "detail", header: "Detail", nowrap: false, cell: (r) => <span className="pa-log-text" title={r.text}>{r.text}</span> },
    { key: "source", header: "Source", cell: (r) => <span className="ph-faint" title={r.source === "audit" ? "Activity event written when it happened." : "Read from the stored record (consent or report access) that predates this session's log."}>{r.source === "audit" ? "Audit event" : "Record"}</span> },
  ];
  const keep = width && width < 560 ? ["at", "kind", "detail"] : width && width < 820 ? ["at", "kind", "person", "detail"] : width && width < 1040 ? ["at", "kind", "person", "actor", "detail"] : null;
  const columns = keep ? cols.filter((c) => keep.includes(c.key)) : cols;
  const c = (k: AccessKind) => all.filter((r) => r.kind === k && (programmeId === "all" || r.programmeId === programmeId)).length;

  return (
    <div className="ph-stack">
      <KpiStrip>
        <Kpi label="Sign-ins" value={c("signin")} icon="user" sub={`${c("signin_failed")} failed attempts`} onClick={() => setKind("signin")} />
        <Kpi label="Consent accepted" value={c("consent")} icon="check" sub="Version recorded with each acceptance" onClick={() => setKind("consent")} />
        <Kpi label="Reports viewed" value={c("report_view")} icon="eye" sub="Opened in the portal, not just notified" onClick={() => setKind("report_view")} />
        <Kpi label="Staff account actions" value={c("account_action") + c("support_access")} icon="shield" sub={`${c("support_access")} support previews`} onClick={() => setKind("account_action")} />
      </KpiStrip>
      <Card pad={false}>
        <div className="pd-filters">
          <SearchBox value={q} onChange={setQ} placeholder="Search person, ID, actor or text" width={250} />
          <Select value={programmeId} onChange={(e) => nav.setParams(withParams(params, { programme: e.target.value === "all" ? null : e.target.value }))} aria-label="Programme" style={{ width: 200 }}>
            <option value="all">All programmes</option>
            {PROGRAMME_ORDER.map((id) => <option key={id} value={id}>{I.programmeById.get(id)?.name}</option>)}
          </Select>
          {q ? <Button size="sm" variant="ghost" icon="x" onClick={() => { setQ(""); nav.setParams(withParams(params, { q: null })); }}>Clear search</Button> : null}
          <FilterChips label="Event type" value={kind} onChange={setKind} options={[{ id: "all" as KindFilter, label: "All", count: counts.all }, ...KINDS.map((k) => ({ id: k as KindFilter, label: ACCESS_KIND_LABEL[k], count: counts[k] }))]} />
        </div>
        <div ref={wrapRef}>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            caption="Participant portal access log"
            initialSort={{ key: "at", dir: -1 }}
            footerNote={<>entries. {audit} audit events from this session and the activity history, the rest read from consent and report access records.</>}
            empty={<EmptyState title="Nothing logged" icon="list">No portal events match. Sign in through the participant portal preview or take an account action to add one.</EmptyState>}
          />
        </div>
      </Card>
      <p className="ph-faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
        The log records who, when, what and why for each portal access and staff action (AUD-01). It never holds a result value: report views name the report, not its content. Staff cannot edit or delete entries.
      </p>
    </div>
  );
}
