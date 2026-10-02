/* Small shared pieces for the Programmes screens. */
import type { ReactNode } from "react";
import type { FormTemplateVersion, Perm, PhState, SessionStats, Staff } from "../../model";
import { fmtDayMonth, fmtWeekdayDate } from "../../model";
import { Avatar, Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";
import { namesOf, sessionStatusOf, shortSite, staffWithPerm } from "./model";
import type { WindowInfo } from "./model";
import { STAGE_ICON, STAGE_TONE, VERSION_STATUS } from "./palette";

/** A person with their accountable role. */
export function StaffLine({ staff, role, compact }: { staff: Staff | undefined; role: string; compact?: boolean }) {
  return (
    <div className="prg-staff">
      <Avatar name={staff?.name || "?"} tint={staff?.tint} size={compact ? 24 : 28} />
      <div style={{ minWidth: 0 }}>
        <div className="prg-staff-name">{staff?.name || "Owner to confirm"}</div>
        <div className="prg-staff-role">{role}</div>
      </div>
    </div>
  );
}

/** One measure in a programme card. Always carries its denominator line. */
export function Stat({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className="prg-stat" title={title}>
      <div className="prg-stat-l">{label}</div>
      <div className="prg-stat-v ph-num">{value}</div>
      {sub ? <div className="prg-stat-s">{sub}</div> : null}
    </div>
  );
}

/** The programme window as a progress line with today's position. */
export function WindowBar({ win }: { win: WindowInfo }) {
  return (
    <div>
      <div className="ph-row-flex" style={{ fontSize: 11.5, marginBottom: 6, gap: 8 }}>
        <span className="ph-dim ph-grow">{win.rangeLabel}</span>
        <span className="ph-num" style={{ color: "var(--ink)" }}>{win.status === "in_progress" ? `Day ${win.dayNo} of ${win.totalDays}` : win.label}</span>
      </div>
      <div className="prg-winbar" role="progressbar" aria-valuenow={win.elapsed} aria-valuemin={0} aria-valuemax={win.totalDays} aria-label={`Programme window: ${win.elapsed} of ${win.totalDays} days complete`}>
        <span className="prg-winbar-fill" style={{ width: `${win.pct}%` }} />
        {Array.from({ length: Math.max(0, win.weeks - 1) }, (_, i) => (
          <span key={i} className="prg-winbar-tick" style={{ left: `${((i + 1) / win.weeks) * 100}%` }} />
        ))}
        {win.status === "in_progress" ? <span className="prg-winbar-now" style={{ left: `${win.pct}%` }} title="Today" /> : null}
      </div>
    </div>
  );
}

export function VersionPill({ status }: { status: FormTemplateVersion["status"] }) {
  const s = VERSION_STATUS[status];
  return <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

export function SessionStatusPill({ s }: { s: SessionStats }) {
  const st = sessionStatusOf(s);
  if (st === "today") return <Pill tone="info" icon="clock">Today</Pill>;
  if (st === "completed") return <Pill tone="neutral" icon="check">Completed</Pill>;
  return <Pill tone="brand" icon="calendar">Scheduled</Pill>;
}

export function StagePill({ label }: { label: string }) {
  return <Pill tone={STAGE_TONE[label] || "neutral"} icon={STAGE_ICON[label] || "dot"}>{label}</Pill>;
}

/** A one-line upcoming clinic: date, site and booked count. */
export function ClinicLine({ s }: { s: SessionStats }) {
  const when = s.isToday ? `Today, ${fmtDayMonth(s.session.date)}` : fmtWeekdayDate(s.session.date);
  return (
    <div className="prg-clinic">
      <span className="prg-clinic-date">{when}</span>
      <span className="ph-grow ph-dim" style={{ minWidth: 0 }}>{shortSite(s.session)}</span>
      <span className="ph-num prg-clinic-n" title={`${s.booked} of ${s.slots} slots booked, ${s.available} available`}>{s.booked}/{s.slots}</span>
    </div>
  );
}

/** Explains who may act, for read-only states. */
export function PermLine({ state, perm, can, does, icon }: { state: PhState; perm: Perm; can: boolean; does: string; icon?: GlyphName }) {
  const who = namesOf(staffWithPerm(state, perm));
  return (
    <div className="prg-permline" data-can={can ? "1" : "0"}>
      <Icon name={icon || (can ? "check" : "lock")} size={13} />
      <span>{can ? `You can ${does}.` : `Read only for this role. ${who} can ${does}.`}</span>
    </div>
  );
}

/** Inline status line used in panels: icon, text, colour. */
export function Note({ tone = "neutral", icon, children }: { tone?: Tone; icon?: GlyphName; children: ReactNode }) {
  return (
    <div className={"prg-note prg-note-" + tone}>
      <Icon name={icon || (tone === "warn" ? "alert" : tone === "ok" ? "check" : tone === "bad" ? "x" : "info")} size={13} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
