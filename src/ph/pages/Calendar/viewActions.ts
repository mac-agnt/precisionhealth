/* Saved calendar views: "Save this view" keeps the current calendar filters under a name in the
   store (state.scheduled.views), so they survive navigation and open with #/Calendar/all?v=<id>.
   Custom views can be renamed and deleted; the ready-made ones (CAL_PRESET_VIEWS) cannot. */
import { CAL_PRESET_VIEWS, CAL_VIEW_KEYS, registerHandlers } from "../../model";
import type { CalSavedView, Ctx } from "../../model";

const clean = (p: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(p || {}).filter(([k, v]) => CAL_VIEW_KEYS.includes(k) && typeof v === "string" && v !== ""));
const views = (c: Ctx): CalSavedView[] => (c.s.scheduled.views ||= []);
const nameTaken = (c: Ctx, name: string, except?: string) =>
  CAL_PRESET_VIEWS.some((v) => v.name.toLowerCase() === name.toLowerCase()) || views(c).some((v) => v.id !== except && v.name.toLowerCase() === name.toLowerCase());

registerHandlers({
  "calview/save": (c, a: { name: string; params: Record<string, string> }) => {
    const so = c.staffOnly("save calendar views"); if (so) return so;
    const name = String(a.name || "").trim();
    if (name.length < 2) return c.fail("Give the view a name.");
    if (name.length > 40) return c.fail("Keep the name under 40 characters.");
    if (nameTaken(c, name)) return c.fail(`There is already a view called ${name}.`);
    const list = views(c);
    const n = list.reduce((m, v) => Math.max(m, Number(v.id.replace(/\D/g, "")) || 0), 0) + 1;
    const id = `my-${n}`;
    list.push({ id, name, params: clean(a.params), createdBy: c.persona().id as CalSavedView["createdBy"], createdAt: c.stamp() });
    return c.ok(`Saved the view ${name}.`, "ok", id);
  },
  "calview/rename": (c, a: { id: string; name: string }) => {
    const so = c.staffOnly("rename calendar views"); if (so) return so;
    const v = views(c).find((x) => x.id === a.id);
    if (!v) return c.fail("Only views you saved can be renamed.");
    const name = String(a.name || "").trim();
    if (name.length < 2) return c.fail("Give the view a name.");
    if (name.length > 40) return c.fail("Keep the name under 40 characters.");
    if (nameTaken(c, name, v.id)) return c.fail(`There is already a view called ${name}.`);
    v.name = name;
    return c.ok(`Renamed to ${name}.`);
  },
  "calview/delete": (c, a: { id: string }) => {
    const so = c.staffOnly("delete calendar views"); if (so) return so;
    const list = views(c);
    const i = list.findIndex((x) => x.id === a.id);
    if (i < 0) return c.fail("Only views you saved can be deleted.");
    const [v] = list.splice(i, 1);
    return c.ok(`Deleted the view ${v.name}.`, "info");
  },
});

export const viewAct = {
  save: (name: string, params: Record<string, string>) => ({ type: "calview/save", name, params }),
  rename: (id: string, name: string) => ({ type: "calview/rename", id, name }),
  remove: (id: string) => ({ type: "calview/delete", id }),
};
