/* Control panel actions. Almost everything on the control panel dispatches the existing action of
   the module that owns the record (results, flu, occupational health, rota, expenses). The one new
   action is the End of Day reminder: the nurse is reminded (simulated, nothing is sent) and the row
   shows when it was chased. Registered at import time, idempotent per day. */
import { fmtWeekdayDate, localDateOf, registerHandlers, today } from "../../../model";
import type { Ctx } from "../../../model";

function chaseEod(c: Ctx, a: { key: string; staffId: string; date: string; label: string }) {
  const st = c.staffOnly("send End of Day reminders"); if (st) return st;
  if (!c.persona().perms.has("logistics.view")) return c.fail(`${c.persona().name} cannot chase End of Day forms.`);
  const key = String(a.key || "");
  const nurse = c.s.staff.find((x) => x.id === a.staffId);
  if (!key || !nurse) return c.fail("That End of Day form was not found.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date)) || a.date >= today(c.s)) return c.fail("Only past clinic days can be chased.");
  const ctl = (c.s.control ||= { chased: {} });
  const prev = ctl.chased[key];
  if (prev && localDateOf(prev.at) === today(c.s)) return c.fail(`${nurse.name.split(" ")[0]} was already reminded today.`);
  ctl.chased[key] = { at: c.now, by: c.persona().id };
  c.emit({ verb: "eod.chased", simulated: true, summary: `${c.first()} reminded ${nurse.name} to submit the End of Day form for ${a.label}, ${fmtWeekdayDate(a.date)}. Simulated: no message was sent.` });
  return c.ok(`Reminder sent to ${nurse.name.split(" ")[0]} (Simulated).`);
}

registerHandlers({ "control/chaseEod": chaseEod });

export const controlAct = {
  chaseEod: (key: string, staffId: string, date: string, label: string) => ({ type: "control/chaseEod", key, staffId, date, label }),
};
