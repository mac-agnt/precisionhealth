/* One OH client: the owner steps with tick actions, billing, agreements, questionnaires, the
   onboarding form answers and any Meddbase diaries at the client. */
import { OH_AGREEMENT_SHORT, OH_AGREEMENT_TITLE, OH_QUESTIONNAIRE_BY_ID, OH_STEPS, act, fmtDate, fmtDateTime, fmtWeekdayDate, ohAgreementFor, ohAgreementsStage, ohClientById, ohCurrentVersion, ohDiaryStats, ohFmtEur, ohGroupOf, ohMeddbaseReady, ohStepsDone } from "../../model";
import type { OhClient, OhStepId } from "../../model";
import { dispatch, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Avatar, Button, DemoTag, Drawer, Pill } from "../../ui";
import { Facts, OhNote, StagePill, StepPill, VIEW_ONLY_TITLE, VersionPill, useOhAccess } from "./shared";
import { ohAct } from "./actions";

export default function ClientDrawer({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const manage = useOhAccess() === "manage";
  const c = clientId ? ohClientById(state, clientId) : undefined;
  if (!c) return null;
  const done = ohStepsDone(c);
  const full = ohGroupOf(c) === "fully_completed";
  const stage = ohAgreementsStage(state, c.id);
  const diaries = state.occHealth.diaries.filter((d) => d.clientId === c.id);
  const goAgreements = () => nav.go({ page: "OccHealth", tab: "agreements", params: { client: c.id } });

  const stepActions = (step: OhStepId) => {
    const st = c.steps[step];
    if (step === "agreements") return <Button size="sm" variant="ghost" icon="file" onClick={goAgreements}>Open agreements</Button>;
    if (st.status === "done") return null;
    return (
      <>
        {st.status === "not_started" ? <Button size="sm" variant="ghost" disabled={!manage} title={manage ? undefined : VIEW_ONLY_TITLE} onClick={() => dispatch(ohAct.startStep(c.id, step))}>Start</Button> : null}
        <Button size="sm" icon="check" disabled={!manage} title={manage ? undefined : VIEW_ONLY_TITLE} onClick={() => dispatch(ohAct.completeStep(c.id, step))}>Mark done</Button>
      </>
    );
  };

  return (
    <Drawer open onClose={onClose} width={620} title={c.name}
      sub={<>{c.clientType} · Onboarding form {c.formRef} submitted {fmtDate(c.submittedAt)} · {full ? `Fully completed ${c.fullyCompletedAt ? fmtDate(c.fullyCompletedAt) : ""}` : `${done} of 4 steps done`}</>}>
      <div className="ph-stack">
        <section>
          <div className="oh-sec-head"><h3 className="ph-h2">Onboarding steps</h3>{full ? <Pill tone="ok" icon="check">Fully completed</Pill> : <Pill tone="neutral" icon="clock">{done} of 4 done</Pill>}</div>
          <ul className="oh-steps">
            {OH_STEPS.map((def) => {
              const st = c.steps[def.step];
              return (
                <li key={def.step} className="oh-steprow">
                  <div className="oh-owner">
                    <Avatar name={def.owner} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div className="oh-owner-name">{def.owner}{def.staffId ? null : <span className="ph-faint" style={{ fontWeight: 400 }}> (not a Pulse user)</span>}</div>
                      <div className="ph-dim" style={{ fontSize: 12 }}>{def.column}</div>
                    </div>
                  </div>
                  <div className="oh-step-status">{def.step === "agreements" ? <StagePill stage={stage} /> : <StepPill status={st.status} />}</div>
                  <div className="oh-step-meta">{st.status === "done" && st.doneAt ? `Done ${fmtDateTime(st.doneAt)} by ${st.doneBy}` : def.doneMeans}</div>
                  <div className="oh-step-act">{stepActions(def.step)}</div>
                </li>
              );
            })}
          </ul>
          <p className="oh-small">Aidan and Sinead are named owners from the Monday board, not Pulse users in this demo: Stephen, Fiona, Martina or Brenda tick their steps on their behalf, and the activity log says so. Fully completed is set only when all four steps are done.</p>
        </section>

        <section>
          <div className="oh-sec-head"><h3 className="ph-h2">Billing</h3><DemoTag>Demo figures</DemoTag></div>
          <Facts items={[
            ["Yearly Meddbase fee", `${ohFmtEur(c.meddbaseFeeEur)} (${c.form.meddbaseUsers} user${c.form.meddbaseUsers === 1 ? "" : "s"})`],
            ["Invoice frequency", c.form.invoiceFrequency],
            ["Last annual invoice", c.lastAnnualInvoice ? `${c.lastAnnualInvoice.number}, ${fmtDate(c.lastAnnualInvoice.date)}, ${ohFmtEur(c.lastAnnualInvoice.amountEur)}${c.lastAnnualInvoice.simulated ? " (Simulated)" : ""}` : "Not yet invoiced"],
            ["Purchase order", c.form.poRequired ? c.form.poNumber : "Not required"],
            ["Billing contact", `${c.form.billingContact}, ${c.form.billingEmail}`],
          ]} />
        </section>

        <section>
          <div className="oh-sec-head"><h3 className="ph-h2">Agreements</h3><Button size="sm" variant="ghost" icon="arrow" onClick={goAgreements}>Agreements tab</Button></div>
          <ul className="oh-plain">
            {(["sla", "dsa"] as const).map((k) => {
              const a = ohAgreementFor(state, c.id, k);
              const v = a ? ohCurrentVersion(a) : null;
              return (
                <li key={k} className="oh-line">
                  <span className="ph-grow"><strong>{OH_AGREEMENT_TITLE[k]}</strong> <span className="ph-faint">({OH_AGREEMENT_SHORT[k]}{v ? ` v${v.version}` : ""})</span></span>
                  <VersionPill status={v ? v.status : null} />
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <div className="oh-sec-head"><h3 className="ph-h2">Pre-appointment questionnaires</h3></div>
          <ul className="oh-plain oh-small" style={{ marginBottom: 8 }}>
            {c.questionnaireIds.map((id) => <li key={id}>{OH_QUESTIONNAIRE_BY_ID[id]?.title || id}</li>)}
          </ul>
          {c.inviteLink ? (
            <div className="oh-linkbox">
              <span className="ph-mono oh-link-text">{c.inviteLink.url}</span>
              <Button size="sm" icon="link" onClick={() => dispatch(act.toast("info", "Copied (simulated). Fictional address: the link does not open."))}>Copy link</Button>
            </div>
          ) : ohMeddbaseReady(c) ? (
            <Button size="sm" icon="link" disabled={!manage} title={manage ? undefined : VIEW_ONLY_TITLE} onClick={() => dispatch(ohAct.issueInviteLink(c.id))}>Issue questionnaire link</Button>
          ) : <p className="oh-small" style={{ margin: 0 }}>A questionnaire link is issued once Sinead has set the client up in Meddbase.</p>}
        </section>

        {diaries.length ? (
          <section>
            <div className="oh-sec-head"><h3 className="ph-h2">Meddbase sessions</h3></div>
            <ul className="oh-plain">
              {diaries.map((d) => {
                const st = ohDiaryStats(state, d);
                return (
                  <li key={d.id} className="oh-line">
                    <span className="ph-grow">{fmtWeekdayDate(d.date)}, {d.clinicianName}, {d.start} to {d.end}</span>
                    <span className="oh-small">{st.received} of {st.booked} questionnaires in</span>
                    <Button size="sm" variant="ghost" icon="arrow" onClick={() => nav.go({ page: "OccHealth", tab: "sessions", params: { diary: d.id } })}>Open</Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section>
          <div className="oh-sec-head"><h3 className="ph-h2">Onboarding form answers</h3><DemoTag>Fictional contact</DemoTag></div>
          <FormAnswers c={c} />
        </section>

        {ohMeddbaseReady(c) && nav.openClientPortal ? (
          <OhNote icon="users">
            {c.name} can use the client portal. Its Meddbase guides show how to set up, trigger a referral, find a patient and get a report. <button type="button" className="ph-link" onClick={() => nav.openClientPortal?.()}>Open the client portal preview</button>, then choose Meddbase guides.
          </OhNote>
        ) : null}
      </div>
    </Drawer>
  );
}

function FormAnswers({ c }: { c: OhClient }) {
  const f = c.form;
  return (
    <Facts items={[
      ["Company", f.companyName],
      ["Registered name", f.registeredName],
      ["Registration number", f.croNumber],
      ["Registered address", f.registeredAddress],
      ["Contact nurse or person", `${f.contactName}${f.contactRole ? `, ${f.contactRole}` : ""}`],
      ["Contact email", f.contactEmail],
      ["Contact phone", f.contactPhone || "Not given"],
      ["Meddbase users", String(f.meddbaseUsers)],
      ["Sites", f.sites],
      ["Services", f.services.join(", ")],
      ["Referral managers", f.referralManagers || "Not given"],
      ["Meddbase notes", f.meddbaseNotes || "None"],
      ["VAT number", f.vatNumber || "Not given"],
    ]} />
  );
}
