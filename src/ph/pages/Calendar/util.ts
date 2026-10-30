/* Small shared helpers for the Calendar views, the event card and the schedule dialog. */
import type { CalEvent } from "../../model";

/** "9am", "10:30am", "12pm". */
export function ampm(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
export const timeLabel = (e: CalEvent) => (e.due ? `Due ${ampm(e.due)}` : e.allDay || !e.time ? "All day" : e.time.end ? `${ampm(e.time.start)} to ${ampm(e.time.end)}` : `From ${ampm(e.time.start)}`);
export const overlayRoot = (): HTMLElement => document.querySelector<HTMLElement>("[data-theme]") || document.body;
