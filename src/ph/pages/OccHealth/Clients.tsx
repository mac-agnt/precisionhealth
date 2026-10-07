/* Clients and onboarding: the "Complete onboarding occ health" board rebuilt. One row per OH
   client, one column per owner (Aidan, Fiona, Stephen, Sinead), then Fully completed, the
   yearly Meddbase fee and the last annual invoice. Groups: Onboarding and Fully completed. */
import { useState } from "react";
import { OH_STEPS, fmtDate, fmtDayMonth, ohAgreementsStage, ohFmtEur, ohGroupOf, ohStepsDone, ohSummary } from "../../model";
import type { OhClient, OhGroup, OhStepId, PhState } from "../../model";
import { usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, Chip, DataTable, DemoTag, EmptyState, Kpi, KpiStrip, PageHeader, Pill, SearchBox } from "../../ui";
import type { Column } from "../../ui";
import { StagePill, StepPill, useOhAccess, useWidth } from "./shared";
import ClientDrawer from "./ClientDrawer";
import OnboardingForm from "./OnboardingForm";

const GROUPS: Array<{ id: OhGroup; title: string; sub: string }> = [
  { id: "onboarding", title: "Onboarding", sub: "Submitted the onboarding form. Each owner ticks their step; the client moves on when all four are done." },
  { id: "fully_completed", title: "Fully completed", sub: "Every step done: in Xero, agreements signed, recurring invoice live and Meddbase set up." },
];

function StepCell({ state, c, step }: { state: PhState; c: OhClient; step: OhStepId }) {
  const st = c.steps[step];
  return (
    <div className="oh-cell">
      {step === "agreements" ? <StagePill stage={ohAgreementsStage(state, c.id)} /> : <StepPill status={st.status} />}
      {st.status === "done" && st.doneAt ? <span className="oh-cell-sub">{fmtDayMonth(st.doneAt)}</span> : null}
    </div>
  );
}
function FullyCell({ c }: { c: OhClient }) {
  const n = ohStepsDone(c);
  return n === 4
    ? <div className="oh-cell"><Pill tone="ok" icon="check">Fully completed</Pill>{c.fullyCompletedAt ? <span className="oh-cell-sub">{fmtDate(c.fullyCompletedAt)}</span> : null}</div>
    : <div className="oh-cell"><Pill tone="neutral" icon="clock">{n} of 4 steps</Pill></div>;
}
function InvoiceCell({ c }: { c: OhClient }) {
  if (!c.lastAnnualInvoice) return <span className="ph-faint">Not yet invoiced</span>;
  return <div className="oh-cell"><span className="ph-num" style={{ color: "var(--ink)" }}>{c.lastAnnualInvoice.number}</span><span className="oh-cell-sub">{fmtDate(c.lastAnnualInvoice.date)}{c.lastAnnualInvoice.simulated ? ", Simulated" : ""}</span></div>;
}

export default function Clients() {
  const state = usePhState();
  const nav = useNav();
  const manage = useOhAccess() === "manage";
  const [measure, width] = useWidth<HTMLDivElement>();
  const wide = width === 0 || width >= 1060;
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<OhStepId | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const sum = ohSummary(state);
  const openClient = (id: string) => nav.setParams({ ...nav.params, client: id });
  const closeClient = () => { const p = { ...nav.params }; delete p.client; nav.setParams(p); };

  const query = q.trim().toLowerCase();
  const rows = state.occHealth.clients.filter((c) => (!query || `${c.name} ${c.clientType} ${c.form.contactName}`.toLowerCase().includes(query)) && (owner === "all" || c.steps[owner].status !== "done"));

  const columns: Column<OhClient>[] = [
    {
      key: "client", header: "Client", nowrap: false, sort: (a, b) => a.name.localeCompare(b.name),
      cell: (c) => (
        <div style={{ minWidth: 170, maxWidth: 230 }}>
          <div style={{ color: "var(--ink)", fontWeight: 500, lineHeight: 1.3 }}>{c.name}</div>
          <div className="oh-cell-sub">{c.clientType} · form {fmtDate(c.submittedAt)}</div>
        </div>
      ),
    },
    ...OH_STEPS.map((s): Column<OhClient> => ({
      key: s.step, header: <span className="oh-colhead"><span>{s.owner}</span>{s.column}</span>, cell: (c) => <StepCell state={state} c={c} step={s.step} />,
    })),
    { key: "full", header: "Fully completed", sort: (a, b) => ohStepsDone(a) - ohStepsDone(b), cell: (c) => <FullyCell c={c} /> },
    { key: "fee", header: <span className="oh-colhead"><span>Yearly</span>Meddbase fee</span>, align: "right", sort: (a, b) => a.meddbaseFeeEur - b.meddbaseFeeEur, cell: (c) => <span className="ph-num">{ohFmtEur(c.meddbaseFeeEur)}</span> },
    { key: "inv", header: "Last annual invoice", cell: (c) => <InvoiceCell c={c} /> },
  ];

  return (
    <div className="ph-page" ref={measure}>
      <PageHeader
        eyebrow="Occupational health"
        title="Clients and onboarding"
        sub="The Complete onboarding occ health board, rebuilt: one row per OH client and one step per owner. A client is fully completed only when Aidan, Fiona, Stephen and Sinead have each done their step."
        actions={
          <>
            {nav.openClientPortal ? <Button icon="users" onClick={() => nav.openClientPortal?.()}>Client portal</Button> : null}
            <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>Onboarding form</Button>
          </>
        }
      />
      <div className="ph-stack">
        <KpiStrip>
          <Kpi label="Onboarding" value={sum.onboarding} sub={`of ${sum.clients} OH clients`} icon="clock" />
          <Kpi label="Fully completed" value={sum.fullyCompleted} sub={`of ${sum.clients} OH clients`} tone="ok" icon="check" />
          <Kpi label="Open owner steps" value={sum.openSteps} sub={OH_STEPS.map((s) => `${s.owner} ${sum.openByStep[s.step]}`).join(", ")} icon="list" />
          <Kpi label="Yearly Meddbase fees" value={ohFmtEur(sum.yearlyFees)} sub={`${sum.fullyCompleted} fully completed clients, demo figures`} icon="chart" />
        </KpiStrip>

        <div className="oh-toolbar">
          <span className="ph-faint" style={{ fontSize: 12 }}>Open steps for</span>
          <Chip on={owner === "all"} onClick={() => setOwner("all")}>Everyone</Chip>
          {OH_STEPS.map((s) => <Chip key={s.step} on={owner === s.step} count={sum.openByStep[s.step]} onClick={() => setOwner(owner === s.step ? "all" : s.step)}>{s.owner}</Chip>)}
          <span className="ph-grow" />
          <SearchBox value={q} onChange={setQ} placeholder="Search OH clients" width={wide ? 220 : "100%"} />
        </div>

        {GROUPS.map((g) => {
          const list = rows.filter((c) => ohGroupOf(c) === g.id);
          return (
            <Card key={g.id} pad={false}>
              <div className="oh-group-head">
                <span className={`oh-group-mark oh-group-${g.id}`} aria-hidden="true" />
                <div className="ph-grow" style={{ minWidth: 0 }}>
                  <h2 className="ph-h2">{g.title} <span className="ph-num ph-faint" style={{ fontWeight: 400 }}>{list.length}</span></h2>
                  <div className="ph-dim" style={{ fontSize: 12, marginTop: 2 }}>{g.sub}</div>
                </div>
              </div>
              {!list.length ? (
                <EmptyState title={query || owner !== "all" ? "No clients match" : g.id === "onboarding" ? "No clients onboarding" : "No fully completed clients"} icon="users">
                  {query || owner !== "all" ? "Clear the search or owner filter." : g.id === "onboarding" ? "New clients arrive here when they submit the onboarding form." : "Clients move here when all four steps are done."}
                </EmptyState>
              ) : wide ? (
                <DataTable rows={list} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => openClient(c.id)} selectedKey={nav.params.client || null} pageSize={20} caption={`${g.title} OH clients`} />
              ) : (
                <ul className="oh-cards">
                  {list.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="oh-cardrow" onClick={() => openClient(c.id)} aria-pressed={nav.params.client === c.id}>
                        <span className="ph-row-flex" style={{ alignItems: "flex-start", gap: 8 }}>
                          <span className="ph-grow" style={{ minWidth: 0 }}>
                            <span style={{ display: "block", color: "var(--ink)", fontWeight: 500 }}>{c.name}</span>
                            <span className="oh-cell-sub">{c.clientType} · {ohFmtEur(c.meddbaseFeeEur)} a year · {c.lastAnnualInvoice ? `last invoice ${c.lastAnnualInvoice.number}` : "not yet invoiced"}</span>
                          </span>
                          <FullyCell c={c} />
                        </span>
                        <span className="oh-cardsteps">
                          {OH_STEPS.map((s) => (
                            <span key={s.step} className="oh-cardstep">
                              <span className="oh-cardstep-label">{s.owner}: {s.column}</span>
                              <StepCell state={state} c={c} step={s.step} />
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
        <p className="oh-small" style={{ margin: 0 }}>
          Client names are business references used as demo labels. Contacts, fees, invoices and registration numbers are fictional. <DemoTag>Demo data</DemoTag>
          {manage ? null : <> You can view this board; Stephen, Fiona, Martina or Brenda tick the steps.</>}
        </p>
      </div>
      <OnboardingForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={(id) => { setFormOpen(false); openClient(id); }} />
      <ClientDrawer clientId={nav.params.client || null} onClose={closeClient} />
    </div>
  );
}
