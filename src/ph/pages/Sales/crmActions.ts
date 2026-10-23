/* CRM actions, registered at import time: log a call, email, meeting or note against a lead. Same
   rights as the rest of Sales (Stephen owns sales). Writes to the lead's history and one activity
   event. Simulated: no email is sent and no call is placed. */
import { fmtDate, registerHandlers, salesRights } from "../../model";
import type { ActionResult, Ctx } from "../../model";

export type CrmActivityKind = "call" | "email" | "meeting" | "note";
export const CRM_ACTIVITY_LABEL: Record<CrmActivityKind, string> = { call: "Call", email: "Email", meeting: "Meeting", note: "Note" };

function needManage(c: Ctx, what: string): ActionResult | null {
  const p = c.persona();
  if (salesRights(p).manage) return null;
  return c.fail(`${p.name} cannot ${what}. Stephen Kelly owns sales: use "Work as Stephen" at the top of the CRM.`);
}

registerHandlers({
  "sales/logActivity": (c, a: { leadId: string; kind: CrmActivityKind; text: string; nextAction?: string; nextActionOn?: string | null }) => {
    const deny = needManage(c, "log activity on a lead");
    if (deny) return deny;
    const lead = c.s.sales.leads.find((l) => l.id === a.leadId);
    if (!lead) return c.fail("Unknown lead.");
    if (!CRM_ACTIVITY_LABEL[a.kind]) return c.fail("Choose call, email, meeting or note.");
    const text = String(a.text || "").trim();
    if (text.length < 3) return c.fail("Write what happened, in a few words.");
    if (a.nextActionOn && !/^\d{4}-\d{2}-\d{2}$/.test(a.nextActionOn)) return c.fail("The next action date is not valid.");
    lead.history.push({ at: c.now, by: c.persona().id, text: `${CRM_ACTIVITY_LABEL[a.kind]}: ${text}` });
    const next = String(a.nextAction || "").trim();
    if (next) { lead.nextAction = next; lead.nextActionOn = a.nextActionOn || null; }
    c.emit({ verb: "sales.activity", simulated: a.kind !== "note", summary: `${c.first()} logged a ${CRM_ACTIVITY_LABEL[a.kind].toLowerCase()} on ${lead.company}: ${text}${next ? ` Next: ${next}${a.nextActionOn ? ` by ${fmtDate(a.nextActionOn)}` : ""}.` : ""}` });
    return c.ok(`${CRM_ACTIVITY_LABEL[a.kind]} logged on ${lead.company}.`);
  },
});

export const crmAct = {
  logActivity: (leadId: string, kind: CrmActivityKind, text: string, nextAction?: string, nextActionOn?: string | null) => ({ type: "sales/logActivity", leadId, kind, text, nextAction, nextActionOn }),
};
