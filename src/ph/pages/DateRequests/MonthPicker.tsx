/* A simple month calendar of Precision Health's availability, shared by the client portal (HR picks
   days) and Neil's review (proposing another date). Each day shows whether a nurse is free; weekends,
   bank holidays, days outside the window and fully booked days cannot be picked. */
import { drAddMonths, monthLabel, drMonthGrid } from "../../model";
import type { DrDayInfo, LocalDate } from "../../model";
import { Icon } from "../../ui";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthPicker({ month, setMonth, minMonth, maxMonth, info, selected, onPick, full, legend = true, freeText }: {
  month: string; setMonth: (m: string) => void; minMonth: string; maxMonth: string;
  info: (d: LocalDate) => DrDayInfo; selected: LocalDate[]; onPick: (d: LocalDate) => void;
  /** No more days can be added: unselected days are not clickable. */
  full?: boolean; legend?: boolean;
  /** Staff see how many nurses are free; the client sees "Available". */
  freeText?: (x: DrDayInfo) => string;
}) {
  const cells = drMonthGrid(month);
  const sel = new Set(selected);
  return (
    <div className="dq-cal">
      <div className="dq-cal-head">
        <button type="button" className="dq-cal-nav" onClick={() => setMonth(drAddMonths(month, -1))} disabled={month <= minMonth} aria-label="Previous month"><Icon name="chevronLeft" size={16} /></button>
        <div className="dq-cal-title" aria-live="polite">{monthLabel(month)}</div>
        <button type="button" className="dq-cal-nav" onClick={() => setMonth(drAddMonths(month, 1))} disabled={month >= maxMonth} aria-label="Next month"><Icon name="chevronRight" size={16} /></button>
      </div>
      <div className="dq-cal-grid" role="grid" aria-label={monthLabel(month)}>
        {WD.map((w) => <div key={w} className="dq-cal-wd" aria-hidden="true">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="dq-cal-empty" aria-hidden="true" />;
          const x = info(d);
          const on = sel.has(d);
          const can = on || (x.pickable && !full);
          const sub = on ? "Chosen" : x.pickable ? (freeText ? freeText(x) : x.state === "limited" ? "Limited" : "Free") : x.state === "holiday" ? "Holiday" : x.state === "full" ? "Booked" : "";
          return (
            <button key={d} type="button" className={`dq-day s-${x.state}${on ? " on" : ""}`} disabled={!can} aria-pressed={on}
              title={`${d.slice(8).replace(/^0/, "")} ${monthLabel(month)}: ${on ? "chosen" : x.label}`} aria-label={`${Number(d.slice(8))} ${monthLabel(month)}, ${on ? "chosen" : x.label}`} onClick={() => onPick(d)}>
              <span className="dq-day-n">{Number(d.slice(8))}</span>
              {sub ? <span className="dq-day-s">{sub}</span> : null}
            </button>
          );
        })}
      </div>
      {legend ? (
        <div className="dq-legend" aria-hidden="true">
          <span><i className="k-open" />Available</span>
          <span><i className="k-limited" />Limited</span>
          <span><i className="k-full" />Fully booked</span>
          <span><i className="k-off" />Weekend, bank holiday or outside the dates</span>
        </div>
      ) : null}
    </div>
  );
}
