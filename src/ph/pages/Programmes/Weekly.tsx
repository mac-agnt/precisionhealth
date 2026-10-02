/* Week-by-week programme progress: capacity, bookings, attendance and the report workflow
   of each week's attended episodes. Used for the six-week Sisk view and in programme detail. */
import type { ProgrammeId } from "../../model";
import { ix, programmeCounts } from "../../model";
import { usePhState } from "../../store";
import { WEEK_COLORS } from "./palette";
import { programmeWeeks, rangeShort } from "./model";
import type { WeekView } from "./model";

function weekTitle(w: WeekView): string {
  const clinics = `${w.sessions.length} clinic${w.sessions.length === 1 ? "" : "s"}, ${w.capacity} slots`;
  if (!w.sessions.length) return `Week ${w.no} (${rangeShort(w.from, w.to)}): no clinics.`;
  const att = w.attended ? ` ${w.attended} attended: ${w.released} released, ${w.ready} ready for review, ${w.awaiting} awaiting results, ${w.onHold} on hold.` : "";
  const up = w.toAttend ? ` ${w.toAttend} booked and still to attend.` : "";
  return `Week ${w.no} (${rangeShort(w.from, w.to)}): ${clinics}.${att}${up} ${w.capacity - w.booked} available.`;
}

export function WeeklyProgress({ pid, height = 150 }: { pid: ProgrammeId; height?: number }) {
  const s = usePhState();
  const weeks = programmeWeeks(s, pid);
  const c = programmeCounts(s, pid);
  const max = Math.max(1, ...weeks.map((w) => w.capacity));
  const pctOf = (n: number, cap: number) => (cap > 0 ? `${(n / cap) * 100}%` : "0%");
  const todaySession = (w: WeekView) => w.sessions.find((x) => x.isToday);
  return (
    <div className="ph-stack" style={{ gap: 12 }}>
      <div className="prg-weeks" role="list" aria-label="Progress by week">
        {weeks.map((w) => {
          const barH = Math.round((w.capacity / max) * height);
          const ts = todaySession(w);
          return (
            <div key={w.no} className="prg-week" data-current={w.current ? "1" : "0"} role="listitem" title={weekTitle(w)}>
              <div className="prg-week-head"><b>Week {w.no}{w.current ? ", now" : ""}</b>{rangeShort(w.from, w.to)}</div>
              <div style={{ height, display: "flex", alignItems: "flex-end" }}>
                {w.capacity ? (
                  <div className="prg-week-bar" style={{ height: barH, width: "100%" }} aria-label={weekTitle(w)}>
                    <span className="prg-seg" style={{ height: pctOf(w.released, w.capacity), background: WEEK_COLORS.released }} />
                    <span className="prg-seg" style={{ height: pctOf(w.ready, w.capacity), background: WEEK_COLORS.ready }} />
                    <span className="prg-seg" style={{ height: pctOf(w.awaiting, w.capacity), background: WEEK_COLORS.awaiting }} />
                    <span className="prg-seg" style={{ height: pctOf(w.onHold, w.capacity), background: WEEK_COLORS.onHold }} />
                    <span className="prg-seg prg-seg-booked" style={{ height: pctOf(w.toAttend, w.capacity) }} />
                  </div>
                ) : <div className="ph-faint" style={{ fontSize: 11, width: "100%", textAlign: "center", paddingBottom: 8 }}>No clinics</div>}
              </div>
              <div>
                {w.past || (w.attended && !w.toAttend) ? (
                  <>
                    <div className="prg-week-n ph-num">{w.attended} attended</div>
                    <div className="prg-week-s">{w.released} released</div>
                  </>
                ) : (
                  <>
                    <div className="prg-week-n ph-num">{w.booked} of {w.capacity}</div>
                    <div className="prg-week-s">{ts ? `Today ${ts.booked} of ${ts.slots}` : `${w.capacity - w.booked} available`}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="prg-legend" aria-label="Legend">
        <span><i className="prg-sw" style={{ background: WEEK_COLORS.released }} />Released <b className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.released}</b></span>
        <span><i className="prg-sw" style={{ background: WEEK_COLORS.ready }} />Ready for review <b className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.ready}</b></span>
        <span><i className="prg-sw" style={{ background: WEEK_COLORS.awaiting }} />Awaiting results <b className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.awaiting}</b></span>
        <span><i className="prg-sw" style={{ background: WEEK_COLORS.onHold }} />On hold <b className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.onHold}</b></span>
        <span><i className="prg-sw prg-sw-booked" />Booked, still to attend <b className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.upcoming}</b></span>
        <span><i className="prg-sw" style={{ background: "var(--track)" }} />Available <b className="ph-num" style={{ color: "var(--ink)", fontWeight: 600 }}>{Math.max(0, c.capacity - c.booked)}</b></span>
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
        Bar height is the week's clinic capacity. Attended appointments are split by report workflow state; the hatched part is confirmed bookings still to attend.
        {` ${ix(s).programmeById.get(pid)?.name}: ${c.booked} of ${c.capacity} slots booked, ${c.attended} attended.`}
      </div>
    </div>
  );
}
