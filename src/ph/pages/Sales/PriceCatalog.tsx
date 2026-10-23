/* Price list as a catalogue: a quick quote calculator on top (package, people, flu: days needed,
   total, cost per person) and every package as a card grouped by family, with price, what is
   included, appointment length, people per day and cost per person. Same price items the
   proposals are priced from. */
import { useState } from "react";
import { SALES_FAMILY_LABEL, SALES_PRICE_STATUS_LABEL, fmtDate, salesEur } from "../../model";
import type { SalesPriceFamily, SalesPriceItem } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button, Card, CardHeader, Icon, PageHeader, Pill, Switch, TextInput } from "../../ui";

const FAMILIES: SalesPriceFamily[] = ["poc", "silver", "gold", "executive", "vaccination", "partner"];
const FAMILY_BLURB: Record<SalesPriceFamily, string> = {
  poc: "On-site point-of-care screening. Results on the day, no laboratory.",
  silver: "Screening plus heart rhythm checks.",
  gold: "Silver plus an extended blood panel.",
  executive: "One-hour individual assessment with a doctor.",
  vaccination: "Add to any visit.",
  partner: "Booked through the Irish Life web app.",
};
const UNIT: Record<string, string> = { day: "per day", participant: "per person", vaccine: "per vaccine", session: "per session" };

export default function PriceCatalog() {
  const s = usePhState();
  const nav = useNav();
  const items = s.sales.priceItems;
  const dayItems = items.filter((i) => i.unit === "day" && i.price != null);
  const [pkg, setPkg] = useState(dayItems.find((i) => i.id === "poc3")?.id || dayItems[0]?.id || "");
  const [people, setPeople] = useState("45");
  const [flu, setFlu] = useState(true);
  const it = items.find((i) => i.id === pkg);
  const n = Math.max(0, Math.floor(Number(people) || 0));
  const perDay = it?.perDay || 25;
  const days = n ? Math.ceil(n / perDay) : 0;
  const screening = days * (it?.price || 0);
  const fluRate = items.find((i) => i.id === "flu")?.price || 15;
  const fluTotal = flu ? n * fluRate : 0;
  const total = screening + fluTotal;
  return (
    <div className="ph-page">
      <style>{CSS}</style>
      <PageHeader title="Price list" sub={`Version ${s.sales.priceVersion}. Precision Health's own prices; every proposal is priced from here.`} />
      <Card className="pc-quote">
        <div className="pc-quote-grid">
          <div>
            <CardHeader title="Quick quote" sub="What would it cost? Pick a package and a headcount." />
            <div className="pc-form">
              <label><span>Package</span><select className="ph-input" value={pkg} onChange={(e) => setPkg(e.target.value)}>{dayItems.map((i) => <option key={i.id} value={i.id}>{i.name} · {salesEur(i.price!)} a day</option>)}</select></label>
              <label><span>Number of people</span><TextInput inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ""))} /></label>
              <label className="pc-flu"><Switch on={flu} onChange={setFlu} label="Add flu vaccines" /><span>Add flu vaccines for everyone ({salesEur(fluRate)} each)</span></label>
            </div>
          </div>
          <div className="pc-result">
            <div className="pc-total-label">Estimated total (excl. VAT)</div>
            <div className="pc-total">{salesEur(total)}</div>
            <div className="pc-lines">
              <div><span>{days} clinical day{days === 1 ? "" : "s"} of {it?.name} at {salesEur(it?.price || 0)}</span><b>{salesEur(screening)}</b></div>
              {flu ? <div><span>{n} flu vaccines at {salesEur(fluRate)}</span><b>{salesEur(fluTotal)}</b></div> : null}
              <div className="pc-pp"><span>Per person</span><b>{n ? salesEur(Math.round(total / n)) : "None"}</b></div>
            </div>
            <div className="pc-note">{n ? `${days} day${days === 1 ? "" : "s"} hold up to ${days * perDay} appointments (${perDay} a day). Unused capacity does not reduce the day rate.` : "Enter a headcount."}</div>
            <Button size="sm" icon="arrow" onClick={() => nav.go({ page: "Sales", tab: "pipeline" })}>Turn into a proposal from a lead</Button>
          </div>
        </div>
      </Card>

      {FAMILIES.map((f) => {
        const list = items.filter((i) => i.family === f);
        if (!list.length) return null;
        return (
          <section key={f} className="pc-fam">
            <div className="pc-fam-head"><h2>{SALES_FAMILY_LABEL[f]}</h2><span>{FAMILY_BLURB[f]}</span></div>
            <div className="pc-cards">{list.map((i) => <PriceCard key={i.id} i={i} />)}</div>
          </section>);
      })}

      <Card style={{ marginTop: 18 }}>
        <CardHeader title="Price list history" />
        {s.sales.priceHistory.slice().reverse().map((h) => <div key={h.version} style={{ fontSize: 12.5, padding: "5px 0", borderTop: "1px solid var(--border)" }}><b style={{ color: "var(--ink)" }}>v{h.version}</b> · {fmtDate(h.at)} · {h.by}: {h.summary} {h.reason}</div>)}
      </Card>
    </div>
  );
}

function PriceCard({ i }: { i: SalesPriceItem }) {
  const pp = i.unit === "day" && i.price != null && i.perDay ? Math.round(i.price / i.perDay) : null;
  return (
    <div className={`pc-card fam-${i.family}`}>
      <div className="pc-card-top"><span className="pc-code">{i.code}</span>{i.status !== "confirmed" ? <Pill tone="warn">{SALES_PRICE_STATUS_LABEL[i.status]}</Pill> : null}</div>
      <div className="pc-name">{i.name}</div>
      <div className="pc-price">{i.price == null ? <span className="pc-na">Price on request</span> : <>{salesEur(i.price)}{i.priceMax ? <> to {salesEur(i.priceMax)}</> : null}<span>{UNIT[i.unit] || ""}</span></>}</div>
      <p className="pc-inc">{i.includes}</p>
      <div className="pc-facts">
        {i.minutes ? <span><Icon name="clock" size={12} />{i.minutes} min</span> : null}
        {i.perDay ? <span><Icon name="users" size={12} />up to {i.perDay} a day</span> : null}
        {pp ? <span><Icon name="user" size={12} />{salesEur(pp)} a person at capacity</span> : null}
      </div>
    </div>
  );
}

const CSS = `
.pc-quote { margin-bottom: 18px; }
.pc-quote-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 22px; align-items: stretch; }
@media (max-width: 900px) { .pc-quote-grid { grid-template-columns: minmax(0, 1fr); } }
.pc-form { display: flex; flex-direction: column; gap: 12px; }
.pc-form label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--dim); }
.pc-form .pc-flu { flex-direction: row; align-items: center; gap: 10px; font-size: 12.5px; color: var(--body); }
.pc-result { border-radius: 16px; padding: 20px 22px; background: linear-gradient(140deg, #1f4f4a, #2f716a 60%, #5ca39a); color: #fff; display: flex; flex-direction: column; gap: 10px; }
.pc-total-label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .8; }
.pc-total { font-size: 38px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.pc-lines { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; border-top: 1px solid rgba(255,255,255,.25); padding-top: 10px; }
.pc-lines div { display: flex; justify-content: space-between; gap: 10px; }
.pc-lines b { font-variant-numeric: tabular-nums; }
.pc-pp { font-size: 14px; padding-top: 4px; }
.pc-note { font-size: 11.5px; opacity: .85; }
.pc-result .ph-btn { align-self: flex-start; }
.pc-fam { margin-top: 20px; }
.pc-fam-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.pc-fam-head h2 { margin: 0; font-size: 16px; color: var(--ink); }
.pc-fam-head span { font-size: 12.5px; color: var(--dim); }
.pc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.pc-card { position: relative; border: 1px solid var(--border); border-radius: 16px; padding: 16px; background: var(--surface); display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.pc-card::before { content: ""; position: absolute; left: 0; top: 0; right: 0; height: 4px; background: var(--accent); }
.pc-card.fam-silver::before { background: linear-gradient(90deg, #9aa4ad, #d6dce0); }
.pc-card.fam-gold::before { background: linear-gradient(90deg, #b98a2b, #e9c36a); }
.pc-card.fam-executive::before { background: linear-gradient(90deg, #4c3f8f, #8a7bd6); }
.pc-card.fam-vaccination::before { background: #13a091; }
.pc-card.fam-partner::before { background: #2f6fb3; }
.pc-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.pc-code { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); font-weight: 600; }
.pc-name { font-size: 15px; font-weight: 600; color: var(--ink); }
.pc-price { font-size: 24px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.pc-price span { font-size: 12px; font-weight: 400; color: var(--dim); margin-left: 6px; }
.pc-na { font-size: 15px; font-weight: 500; color: var(--faint); }
.pc-inc { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--body); flex: 1; }
.pc-facts { display: flex; flex-wrap: wrap; gap: 6px; }
.pc-facts span { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; padding: 3px 8px; border-radius: 999px; background: var(--track); color: var(--dim); }
`;
