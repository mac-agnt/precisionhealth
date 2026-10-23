/* Proposals as the client sees them. A list of every proposal on the left; the selected one on the
   right as a branded document in the shape of Precision Health's own proposals (cover, about us,
   your programme, what's included, investment with flu scenarios, commercial approach, upgrade
   options, next steps). Send, accept, decline and new version act on the same records. */
import { useState } from "react";
import { BRAND, SALES_PROPOSAL_STATUS_LABEL, act, fmtDate, salesEur, salesEurRange, salesLatestVersion, salesVersionTotals } from "../../model";
import type { SalesProposal, SalesProposalVersion } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, Icon, PageHeader, Pill } from "../../ui";
import type { Tone } from "../../ui";
import { salesAct } from "./actions";
import { useSalesRights } from "./shared";

const STATUS_TONE: Record<SalesProposalVersion["status"], Tone> = { draft: "neutral", sent: "warn", accepted: "ok", declined: "bad" };

export default function ProposalDoc() {
  const s = usePhState();
  const nav = useNav();
  const rights = useSalesRights();
  const props = s.sales.proposals.slice().sort((a, b) => salesLatestVersion(b).createdAt.localeCompare(salesLatestVersion(a).createdAt));
  const [sel, setSel] = useState<string | null>(nav.params.proposal || props[0]?.id || null);
  const p = props.find((x) => x.id === sel) || props[0];
  const out = props.map((x) => salesLatestVersion(x)).filter((v) => v.status === "sent");
  const outValue = props.filter((x) => salesLatestVersion(x).status === "sent").reduce((n, x) => n + salesVersionTotals(s.sales, salesLatestVersion(x)).totalHigh, 0);
  return (
    <div className="ph-page">
      <style>{CSS}</style>
      <PageHeader title="Proposals" sub={`${props.length} proposals, ${out.length} with the client worth up to ${salesEur(outValue)}. Each one is the document the client receives, priced live from the price list.`} />
      <div className="pd-wrap">
        <div className="pd-list">
          {props.map((x) => {
            const v = salesLatestVersion(x), t = salesVersionTotals(s.sales, v), lead = s.sales.leads.find((l) => l.id === x.leadId);
            return (
              <button key={x.id} type="button" className={`pd-item${x.id === p?.id ? " on" : ""}`} onClick={() => setSel(x.id)}>
                <span className="pd-item-top"><span className="pd-item-co">{lead?.company || x.leadId}</span><Pill tone={STATUS_TONE[v.status]}>{SALES_PROPOSAL_STATUS_LABEL[v.status]}</Pill></span>
                <span className="pd-item-sub">{v.config.title} · v{v.version}</span>
                <span className="pd-item-val">{salesEurRange(t.totalLow, t.totalHigh)}</span>
              </button>);
          })}
        </div>
        {p ? <Doc p={p} manage={rights.manage} /> : <div className="ph-faint">No proposals yet.</div>}
      </div>
    </div>
  );
}

function Doc({ p, manage }: { p: SalesProposal; manage: boolean }) {
  const s = usePhState();
  const nav = useNav();
  const v = salesLatestVersion(p);
  const t = salesVersionTotals(s.sales, v);
  const lead = s.sales.leads.find((l) => l.id === p.leadId);
  const item = (id: string) => s.sales.priceItems.find((x) => x.id === id);
  const c = v.config;
  const issued = fmtDate(v.sentAt || v.createdAt);
  const people = c.participantsLow === c.participantsHigh ? `${c.participantsLow}` : `${c.participantsLow} to ${c.participantsHigh}`;
  const upsell = c.upsell.map(item).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="pd-right">
      <div className="pd-bar">
        <Pill tone={STATUS_TONE[v.status]}>{SALES_PROPOSAL_STATUS_LABEL[v.status]}</Pill>
        <span className="ph-faint" style={{ fontSize: 12 }}>{v.status === "sent" && v.sentAt ? `Sent ${fmtDate(v.sentAt)}${v.sentTo ? ` to ${v.sentTo}` : ""}` : v.status === "draft" ? "Not sent yet" : v.decidedAt ? `${SALES_PROPOSAL_STATUS_LABEL[v.status]} ${fmtDate(v.decidedAt)}` : ""}{p.versions.length > 1 ? ` · ${p.versions.length} versions` : ""}</span>
        <span className="ph-grow" />
        {lead ? <Button size="sm" variant="ghost" onClick={() => nav.go({ page: "Sales", tab: "pipeline" })}>Open in pipeline</Button> : null}
        {!manage ? <Button size="sm" variant="primary" onClick={() => dispatch(act.setPersona("stephen"))}>Work as Stephen</Button> : null}
        {manage && v.status === "draft" ? <Button size="sm" variant="primary" icon="send" onClick={() => dispatch(salesAct.sendProposal(p.id))}>Send to client</Button> : null}
        {manage && v.status === "sent" ? <>
          <Button size="sm" onClick={() => dispatch(salesAct.newProposalVersion(p.id))}>New version</Button>
          <Button size="sm" icon="x" onClick={() => dispatch(salesAct.decideProposal(p.id, "declined"))}>Declined</Button>
          <Button size="sm" variant="primary" icon="check" onClick={() => dispatch(salesAct.decideProposal(p.id, "accepted"))}>Accepted</Button></> : null}
        {manage && v.status === "declined" ? <Button size="sm" onClick={() => dispatch(salesAct.newProposalVersion(p.id))}>New version</Button> : null}
      </div>

      <article className="pd-doc">
        <header className="pd-cover">
          <div className="pd-brand"><span className="pd-logo"><Icon name="heart" size={16} /></span>{BRAND.org}</div>
          <div className="pd-eyebrow">Proposal for</div>
          <h1 className="pd-h1">{lead?.company || "Client"}</h1>
          <div className="pd-title">{c.title}</div>
          <div className="pd-meta">
            <div><span>Prepared for</span>{lead ? `${lead.contact.name}, ${lead.contact.role}` : "Client"}</div>
            <div><span>Prepared by</span>Stephen Kelly, Sales and Operations Director</div>
            <div><span>Date</span>{issued}</div>
            <div><span>Reference</span>{p.id} v{v.version}</div>
          </div>
        </header>

        <section className="pd-sec">
          <h2><span>01</span>About Precision Health</h2>
          <p>Precision Health delivers workplace health screening, flu vaccination and occupational health for employers across Ireland. Our nurses run screening on your site; our doctors review every result before it is released, and each employee receives a clear, private report. Your organisation receives group-level insight only, never personal health information.</p>
          <div className="pd-stats"><div><b>Doctor-reviewed</b>every report</div><div><b>On site</b>at your location</div><div><b>Private</b>by design</div></div>
        </section>

        <section className="pd-sec">
          <h2><span>02</span>Your programme</h2>
          <div className="pd-grid">
            <div><span>Participants</span><b>{people}</b></div>
            <div><span>Location</span><b>{c.locations || "To agree"}</b></div>
            <div><span>Dates</span><b>{c.dates || "To agree"}</b></div>
            <div><span>Capacity booked</span><b>{t.capacity ? `${t.capacity} appointments` : "Per participant"}</b></div>
          </div>
          {t.shortfall > 0 ? <p className="pd-note">At the high estimate, {t.shortfall} more people than the booked days allow. We will add a day or a second clinician.</p> : null}
        </section>

        <section className="pd-sec">
          <h2><span>03</span>What is included</h2>
          {t.lines.map((l) => { const it = item(l.itemId); return (
            <div key={l.itemId} className="pd-inc"><Icon name="check" size={15} /><div><b>{it?.name || l.name}</b><p>{(it?.includes || "").replace(/\.\s*$/, "")}{it?.minutes ? `. ${it.minutes}-minute appointments` : ""}{l.capacity ? `, up to ${l.capacity / Math.max(1, l.days)} per day.` : "."}</p></div></div>); })}
          {t.flu ? <div className="pd-inc"><Icon name="check" size={15} /><div><b>Flu vaccination add-on</b><p>Seasonal flu vaccine administered on site at the same visit, conditional on vaccine supply.</p></div></div> : null}
          {t.exec ? <div className="pd-inc"><Icon name="check" size={15} /><div><b>Executive Health Assessment</b><p>One hour per person: practitioner and doctor time, tailored biomarker panel, examination and discussion.</p></div></div> : null}
          <div className="pd-inc"><Icon name="check" size={15} /><div><b>Every report reviewed by a doctor</b><p>Personal results through the participant portal; an aggregate report for your organisation.</p></div></div>
        </section>

        <section className="pd-sec">
          <h2><span>04</span>Investment</h2>
          <table className="pd-table">
            <thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Total</th></tr></thead>
            <tbody>
              {t.lines.map((l) => <tr key={l.itemId}><td>{l.name}</td><td>{l.days} clinical day{l.days === 1 ? "" : "s"}</td><td>{salesEur(l.rate)} per day</td><td>{salesEur(l.total)}</td></tr>)}
              {t.flu ? <tr><td>Flu vaccination</td><td>{t.flu.lowQty === t.flu.highQty ? t.flu.lowQty : `${t.flu.lowQty} to ${t.flu.highQty}`} vaccines</td><td>{salesEur(t.flu.rate)} each</td><td>{salesEurRange(t.flu.low, t.flu.high)}</td></tr> : null}
              {t.exec ? <tr><td>Executive Health Assessment</td><td>{t.exec.count} people</td><td>{salesEur(t.exec.rate)} each</td><td>{salesEur(t.exec.total)}</td></tr> : null}
            </tbody>
            <tfoot><tr><td colSpan={3}>Programme total (excl. VAT)</td><td>{salesEurRange(t.totalLow, t.totalHigh)}</td></tr></tfoot>
          </table>
          {t.flu && t.flu.lowQty !== t.flu.highQty ? (
            <div className="pd-scen">
              <div><span>If {t.flu.lowQty} are vaccinated</span><b>{salesEur(t.totalLow)}</b></div>
              <div><span>If {t.flu.highQty} are vaccinated</span><b>{salesEur(t.totalHigh)}</b></div>
            </div>) : null}
        </section>

        <section className="pd-sec">
          <h2><span>05</span>Commercial approach</h2>
          <ul className="pd-ul">
            <li>Screening is priced per clinical day. Unused capacity does not reduce the day rate.</li>
            {t.flu ? <li>Flu is charged per vaccine administered and is conditional on vaccine supply.</li> : null}
            <li>Invoiced after delivery. Prices exclude VAT and are valid for 30 days from {issued}.</li>
            {c.notes ? <li>{c.notes}</li> : null}
          </ul>
        </section>

        {upsell.length ? (
          <section className="pd-sec">
            <h2><span>06</span>Upgrade options</h2>
            <div className="pd-ups">{upsell.map((u) => (
              <div key={u.id} className="pd-up"><b>{u.name}</b><span className="pd-up-price">{u.price != null ? `${salesEur(u.price)}${u.priceMax ? ` to ${salesEur(u.priceMax)}` : ""} per ${u.unit === "day" ? "day" : u.unit}` : "Price on request"}</span><p>{u.includes}</p>{u.minutes || u.perDay ? <span className="pd-up-meta">{u.minutes ? `${u.minutes} min` : ""}{u.minutes && u.perDay ? ", " : ""}{u.perDay ? `up to ${u.perDay} a day` : ""}</span> : null}</div>))}</div>
          </section>) : null}

        <section className="pd-sec pd-next">
          <h2><span>{upsell.length ? "07" : "06"}</span>Next steps</h2>
          <ol className="pd-ol"><li>Confirm the package and your preferred dates.</li><li>We send your employees a booking link and invitation code.</li><li>Our nurses run the clinic on site; a doctor reviews every report.</li><li>You receive the group report; employees get their own results privately.</li></ol>
          <div className="pd-contact">{BRAND.legalName} · {BRAND.address} · {BRAND.phone} · {BRAND.email}</div>
        </section>
      </article>
    </div>
  );
}

const CSS = `
.pd-wrap { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1000px) { .pd-wrap { grid-template-columns: minmax(0, 1fr); } }
.pd-list { display: flex; flex-direction: column; gap: 8px; position: sticky; top: 8px; }
.pd-item { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); color: inherit; font: inherit; cursor: pointer; transition: border-color .15s; }
.pd-item:hover { border-color: var(--accent); }
.pd-item.on { border-color: var(--accent); background: var(--accent-soft); }
.pd-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pd-item-co { font-weight: 600; font-size: 13.5px; color: var(--ink); }
.pd-item-sub { font-size: 11.5px; color: var(--faint); }
.pd-item-val { font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.pd-right { min-width: 0; }
.pd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.pd-doc { background: #fbfaf7; color: #1d2a2a; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.28); max-width: 860px; }
.pd-cover { background: linear-gradient(140deg, #1f4f4a 0%, #2f716a 55%, #5ca39a 100%); color: #fff; padding: 40px 48px 36px; }
.pd-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; letter-spacing: .02em; }
.pd-logo { width: 30px; height: 30px; border-radius: 9px; background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; }
.pd-eyebrow { margin-top: 46px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; opacity: .8; }
.pd-h1 { margin: 6px 0 4px; font-size: 38px; line-height: 1.1; font-weight: 700; color: #fff; }
.pd-title { font-size: 17px; opacity: .92; }
.pd-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 34px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.25); font-size: 12.5px; }
.pd-meta span { display: block; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; opacity: .7; margin-bottom: 3px; }
@media (max-width: 700px) { .pd-meta { grid-template-columns: 1fr 1fr; } .pd-cover { padding: 28px 24px; } .pd-sec { padding: 24px !important; } }
.pd-sec { padding: 30px 48px; border-top: 1px solid #e7e3dc; }
.pd-sec h2 { display: flex; align-items: baseline; gap: 12px; margin: 0 0 14px; font-size: 19px; color: #1f4f4a; }
.pd-sec h2 span { font-size: 12px; color: #5ca39a; font-weight: 700; letter-spacing: .06em; }
.pd-sec p { margin: 0; font-size: 13.5px; line-height: 1.65; color: #3b4646; }
.pd-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
.pd-stats div { background: #eef5f3; border-radius: 12px; padding: 12px 14px; font-size: 12px; color: #4b5a59; }
.pd-stats b { display: block; color: #1f4f4a; font-size: 14px; }
.pd-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 800px) { .pd-grid { grid-template-columns: 1fr 1fr; } }
.pd-grid div { border: 1px solid #e7e3dc; border-radius: 12px; padding: 12px 14px; }
.pd-grid span { display: block; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #8a9393; margin-bottom: 4px; }
.pd-grid b { font-size: 14px; color: #1d2a2a; }
.pd-note { margin-top: 10px !important; color: #9a5b00 !important; font-size: 12.5px !important; }
.pd-inc { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px dashed #e7e3dc; }
.pd-inc:last-child { border-bottom: 0; }
.pd-inc svg { color: #2f716a; flex: none; margin-top: 2px; }
.pd-inc b { display: block; font-size: 14px; color: #1d2a2a; margin-bottom: 2px; }
.pd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pd-table th { text-align: left; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #8a9393; padding: 8px 10px; border-bottom: 2px solid #1f4f4a; }
.pd-table td { padding: 11px 10px; border-bottom: 1px solid #e7e3dc; color: #2b3636; font-variant-numeric: tabular-nums; }
.pd-table td:last-child, .pd-table th:last-child { text-align: right; }
.pd-table tfoot td { border-bottom: 0; font-weight: 700; font-size: 15px; color: #1f4f4a; padding-top: 14px; }
.pd-scen { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.pd-scen div { background: #1f4f4a; color: #fff; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; }
.pd-scen b { font-size: 17px; }
.pd-ul, .pd-ol { margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.8; color: #3b4646; }
.pd-ups { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.pd-up { border: 1px solid #e7e3dc; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 5px; }
.pd-up b { color: #1d2a2a; font-size: 14px; }
.pd-up-price { color: #2f716a; font-weight: 700; font-size: 13px; }
.pd-up p { font-size: 12.5px !important; }
.pd-up-meta { font-size: 11.5px; color: #8a9393; }
.pd-contact { margin-top: 20px; padding-top: 14px; border-top: 1px solid #e7e3dc; font-size: 11.5px; color: #8a9393; }
`;
