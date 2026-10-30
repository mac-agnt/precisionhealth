/* The proposal builder: package and headcount in, a live price out. Days are the headcount divided
   by the package's daily capacity, rounded up, times the day rate; flu is per vaccine; executive
   medicals per person. The same arithmetic as salesProposalTotals and the Price list quick quote.
   Facts from the meeting notes are filled in and shown for Stephen to confirm. Free-text deal
   instructions are kept on the proposal; a percentage discount in them becomes a visible line. */
import { useMemo, useState } from "react";
import {
  salesApplyDiscount, salesBuilderConfig, salesCapacity, salesEur, salesLatestVersion, salesParseDiscount, salesParseNotes, salesProposalTotals, salesUpsells,
} from "../../model";
import type { SalesBuilderInput, SalesLead } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, usePhState } from "../../store";
import { Button, Icon, Modal, Pill, Select, Switch, TextInput, Textarea } from "../../ui";
import { flowAct } from "./flowActions";

const num = (v: string) => Math.max(0, Math.floor(Number(v.replace(/\D/g, "")) || 0));

export default function ProposalBuilder({ lead, onClose }: { lead: SalesLead; onClose: () => void }) {
  const s = usePhState();
  const nav = useNav();
  const items = s.sales.priceItems;
  const dayItems = items.filter((i) => i.unit === "day" && i.price !== null);
  const notes = s.salesFlow.notes[lead.id]?.text || "";
  const facts = useMemo(() => salesParseNotes(notes, items), [notes, items]);
  const props = s.sales.proposals.filter((p) => p.leadId === lead.id);
  const p = props[props.length - 1];
  const v = p ? salesLatestVersion(p) : null;
  const cfg = v?.config;

  const fromFacts = (base: SalesBuilderInput): SalesBuilderInput => {
    const n = facts.headcountHigh || facts.headcount || base.headcount;
    return {
      packageId: facts.packageId || base.packageId,
      headcount: n,
      flu: facts.flu ?? base.flu,
      fluCount: facts.flu === false ? 0 : facts.fluCount || n,
      execCount: facts.exec ?? base.execCount,
      locations: facts.sites ? (facts.sites === 1 ? "One site" : `${facts.sites} sites`) : base.locations,
      dates: facts.dates || base.dates,
    };
  };
  const base: SalesBuilderInput = useMemo(() => {
    const n = cfg?.participantsHigh || lead.qualifier.headcount || 25;
    return {
      packageId: cfg ? cfg.lines[0]?.itemId || null : lead.services.includes("health_screening") || !lead.services.length ? "poc3" : null,
      headcount: n,
      flu: cfg ? cfg.flu : lead.services.includes("flu"),
      fluCount: cfg?.flu ? cfg.fluHigh : n,
      execCount: cfg?.exec?.count || (lead.services.includes("executive") ? n : 0),
      locations: cfg?.locations || (lead.qualifier.sites && lead.qualifier.sites > 1 ? `${lead.qualifier.sites} sites` : "One site"),
      dates: cfg?.dates && cfg.dates !== "To agree" ? cfg.dates : lead.qualifier.dates,
    };
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFacts = facts.facts.length > 0;
  const [f, setF] = useState<SalesBuilderInput>(() => (hasFacts && (!v || v.status !== "draft") ? fromFacts(base) : base));
  const [ins, setIns] = useState(() => (p ? s.salesFlow.instructions[p.id]?.text : "") || facts.deal.join(" "));
  const set = (patch: Partial<SalesBuilderInput>) => setF((x) => ({ ...x, ...patch }));

  const config = salesBuilderConfig(f, items);
  const t = salesProposalTotals(config, items);
  const pct = salesParseDiscount(ins);
  const net = salesApplyDiscount(t, pct);
  const ups = salesUpsells(f, items);
  const factsApplied = hasFacts && JSON.stringify(fromFacts(f)) === JSON.stringify(f);
  const it = items.find((i) => i.id === f.packageId);
  const verb = !p ? "Create proposal" : v && v.status === "draft" ? "Update proposal" : `Create version ${(v?.version || 0) + 1}`;
  const build = () => {
    const r = dispatch(flowAct.buildProposal(lead.id, f, ins));
    if (r.ok && r.id) { onClose(); nav.go({ page: "Sales", tab: "proposals", params: { proposal: r.id } }); }
  };

  return (
    <Modal open onClose={onClose} width={980} title={`Proposal for ${lead.company}`}
      footer={<><span className="pb-foot ph-faint">Prices from price list v{s.sales.priceVersion}. Excludes VAT.</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={build}>{verb}</Button></>}>
      <style>{CSS}</style>
      {hasFacts ? (
        <div className="pb-facts">
          <div className="pb-facts-head"><Icon name="spark" size={14} /><b>From your meeting notes</b><span className="ph-grow" />
            {factsApplied ? <Pill tone="ok" icon="check">Filled in below</Pill> : <Button size="sm" onClick={() => setF(fromFacts(f))}>Use these</Button>}</div>
          <div className="pb-fact-list">{facts.facts.filter((x) => x.key !== "deal").map((x) => <div key={x.key} className="pb-fact"><span>{x.label}</span><b>{x.value}</b>{x.quote ? <i>"{x.quote.length > 90 ? `${x.quote.slice(0, 88)}...` : x.quote}"</i> : null}</div>)}</div>
          <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 6 }}>Picked out by the Sales agent. Check them; anything you change below wins.</div>
        </div>) : null}

      <div className="pb-grid">
        <div className="pb-form">
          <label className="pb-field"><span>Package</span>
            <Select value={f.packageId || ""} onChange={(e) => set({ packageId: e.target.value || null })} aria-label="Package">
              <option value="">No screening package</option>
              {dayItems.map((i) => <option key={i.id} value={i.id}>{i.name}, {salesEur(i.price!)} a day, up to {salesCapacity(i).perDay} a day</option>)}
            </Select>
          </label>
          <div className="pb-two">
            <label className="pb-field"><span>People</span><TextInput inputMode="numeric" value={String(f.headcount || "")} onChange={(e) => { const n = num(e.target.value); set({ headcount: n, fluCount: f.fluCount === f.headcount ? n : f.fluCount }); }} aria-label="People" /></label>
            <label className="pb-field"><span>Executive medicals</span><TextInput inputMode="numeric" value={String(f.execCount || 0)} onChange={(e) => set({ execCount: num(e.target.value) })} aria-label="Executive medicals" /></label>
          </div>
          <div className="pb-flu">
            <Switch on={f.flu} onChange={(on) => set({ flu: on, fluCount: on && !f.fluCount ? f.headcount : f.fluCount })} label="Flu vaccines" />
            <span className="ph-grow">Flu vaccines at the same visit</span>
            {f.flu ? <TextInput inputMode="numeric" value={String(f.fluCount || "")} onChange={(e) => set({ fluCount: num(e.target.value) })} aria-label="Number of flu vaccines" style={{ width: 80 }} /> : null}
          </div>
          <div className="pb-two">
            <label className="pb-field"><span>Sites</span><TextInput value={f.locations} onChange={(e) => set({ locations: e.target.value })} aria-label="Sites" /></label>
            <label className="pb-field"><span>Dates</span><TextInput value={f.dates} onChange={(e) => set({ dates: e.target.value })} aria-label="Dates" placeholder="To agree" /></label>
          </div>

          {ups.length ? (
            <div className="pb-ups">
              <div className="pb-k">Suggested extras</div>
              {ups.map((u) => (
                <div key={u.id} className="pb-up">
                  <div className="ph-grow" style={{ minWidth: 0 }}><b>{u.title}</b><span className="ph-trunc" style={{ display: "block" }}>{u.detail}</span></div>
                  <span className="pb-up-delta ph-num">+{salesEur(u.delta)}</span>
                  <Button size="sm" icon="plus" onClick={() => set(u.apply)}>Add</Button>
                </div>))}
            </div>) : null}

          <label className="pb-field"><span>Anything special about this deal?</span>
            <Textarea rows={3} value={ins} onChange={(e) => setIns(e.target.value)} aria-label="Deal instructions" placeholder="For example: they want two sites, 10% multi-year discount, invoice per site." />
          </label>
          {pct ? <div className="pb-hint"><Icon name="check" size={12} />A {pct}% discount will show as its own line on the proposal.</div> : ins.trim() ? <div className="pb-hint dim"><Icon name="info" size={12} />Shown on the proposal under the commercial approach.</div> : null}
        </div>

        <aside className="pb-sum" aria-label="Price">
          <div className="pb-k">Live price</div>
          <div className="pb-total ph-num">{salesEur(net.netHigh)}</div>
          <div className="pb-lines">
            {t.lines.map((l) => <div key={l.itemId}><span>{f.headcount} people at up to {l.perDay} a day = {l.days} clinical day{l.days === 1 ? "" : "s"} of {it?.name || l.name} x {salesEur(l.rate)}</span><b className="ph-num">{salesEur(l.total)}</b></div>)}
            {t.flu ? <div><span>{t.flu.highQty} flu vaccines x {salesEur(t.flu.rate)}</span><b className="ph-num">{salesEur(t.flu.high)}</b></div> : null}
            {t.exec ? <div><span>{t.exec.count} executive medicals x {salesEur(t.exec.rate)}</span><b className="ph-num">{salesEur(t.exec.total)}</b></div> : null}
            {pct ? <div className="pb-disc"><span>Discount {pct}%</span><b className="ph-num">-{salesEur(net.discountHigh)}</b></div> : null}
            <div className="pb-tot"><span>Total (excl. VAT)</span><b className="ph-num">{salesEur(net.netHigh)}</b></div>
          </div>
          {t.lines[0] ? <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>Up to {t.capacity} appointments booked. Unused capacity does not reduce the day rate.</div> : null}
          {!t.lines.length && !t.flu && !t.exec ? <div className="ph-faint" style={{ fontSize: 12 }}>Choose a package, flu or executive medicals.</div> : null}
        </aside>
      </div>
    </Modal>
  );
}

const CSS = `
.pb-foot { margin-right: auto; font-size: 11.5px; align-self: center; }
.pb-facts { border: 1px solid var(--accent); background: var(--accent-soft); border-radius: 14px; padding: 12px 14px; margin-bottom: 16px; }
.pb-facts-head { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 13.5px; margin-bottom: 8px; }
.pb-fact-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.pb-fact { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pb-fact span { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); }
.pb-fact b { font-size: 13px; color: var(--ink); font-weight: 600; }
.pb-fact i { font-size: 10.5px; color: var(--dim); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pb-form textarea.ph-input { border-radius: 14px; padding: 10px 14px; }
.ph-modal:has(.pb-grid) > div:last-child { position: sticky; bottom: 0; background: var(--overlay); border-top: 1px solid var(--border); padding-top: 14px !important; backdrop-filter: blur(24px); }
@media (max-width: 560px) { .pb-foot { display: none; } }
.pb-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
@media (max-width: 820px) { .pb-grid { grid-template-columns: minmax(0, 1fr); } }
.pb-form { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.pb-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--dim); }
.pb-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pb-flu { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--body); padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.pb-k { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); margin-bottom: 6px; }
.pb-ups { display: flex; flex-direction: column; gap: 6px; }
.pb-up { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px dashed var(--border); border-radius: 12px; font-size: 12px; color: var(--dim); }
.pb-up b { color: var(--ink); font-size: 12.5px; font-weight: 600; }
.pb-up-delta { color: var(--accent); font-weight: 600; font-size: 12.5px; white-space: nowrap; }
.pb-hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ok); margin-top: -4px; }
.pb-hint.dim { color: var(--dim); }
.pb-sum { position: sticky; top: 0; border: 1px solid var(--border); background: var(--surface-2); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.pb-total { font-size: 34px; font-weight: 700; color: var(--ink); line-height: 1; letter-spacing: -.01em; }
.pb-lines { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }
.pb-lines > div { display: flex; justify-content: space-between; gap: 10px; color: var(--body); line-height: 1.4; }
.pb-lines b { color: var(--ink); white-space: nowrap; }
.pb-disc { color: var(--ok) !important; }
.pb-disc b { color: var(--ok) !important; }
.pb-tot { border-top: 1px solid var(--border); padding-top: 8px; font-weight: 600; }
@media (max-width: 560px) { .pb-two { grid-template-columns: 1fr; } .pb-total { font-size: 28px; } .pb-fact-list { grid-template-columns: 1fr 1fr; } .pb-fact i { display: none; } }
`;
