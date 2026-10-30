/* Flu workspace boards: contacts and the Flu 2026 notes board (RECORDING.md section 8). Stephen,
   Martina and Brenda manage flu, so they add and edit; Neil and Liz may add notes too. Registered
   at import time. Dispatch through fluBoardsAct. */
import type { ActionResult, Ctx, StaffId } from "../../model";
import { fluAccessFor, gapsNext, registerHandlers } from "../../model";

const me = (c: Ctx) => c.persona().id as StaffId;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function canEdit(c: Ctx, what: string, notes = false): ActionResult | null {
  const p = c.persona();
  if (p.isParticipant) return c.fail(`The participant preview cannot ${what}.`);
  const access = fluAccessFor(p.id);
  if (access === "manage" || (notes && access === "all")) return null;
  return c.fail(`${p.name} cannot ${what}. Stephen, Martina and Brenda keep the flu boards${notes ? "; Neil and Liz may add notes" : ""}.`);
}

export interface FluContactInput { company: string; name: string; role: string; email: string; phone: string; note: string }

registerHandlers({
  "flu2/saveContact": (c, a: { id?: string | null; contact: FluContactInput }) => {
    const deny = canEdit(c, "edit flu contacts"); if (deny) return deny;
    const x = a.contact;
    if (!x) return c.fail("Fill in the contact.");
    const v = { company: (x.company || "").trim(), name: (x.name || "").trim(), role: (x.role || "").trim(), email: (x.email || "").trim(), phone: (x.phone || "").trim(), note: (x.note || "").trim() };
    if (!v.company) return c.fail("Give the company.");
    if (!v.name) return c.fail("Give the contact's name.");
    if (!v.email && !v.phone) return c.fail("Give an email or a phone number.");
    if (v.email && !isEmail(v.email)) return c.fail("That email does not look right.");
    if (v.phone && !/^[+\d][\d ()-]{5,}$/.test(v.phone)) return c.fail("That phone number does not look right.");
    const g = c.s.gaps;
    if (a.id) {
      const cur = g.fluContacts.find((f) => f.id === a.id);
      if (!cur) return c.fail("Unknown contact.");
      const changed = (Object.keys(v) as Array<keyof typeof v>).filter((k) => cur[k] !== v[k]);
      if (!changed.length) return { ok: false, tone: "info", message: "Nothing changed." };
      Object.assign(cur, v, { updatedAt: c.now, updatedBy: me(c) });
      c.emit({ verb: "flu.contact_updated", summary: `${c.first()} updated flu contact ${cur.id}, ${v.name} at ${v.company} (${changed.join(", ")}).` });
      return c.ok("Contact saved.", "ok", cur.id);
    }
    const id = gapsNext(g, "fluContact", "FC");
    g.fluContacts.push({ id, ...v, updatedAt: c.now, updatedBy: me(c) });
    c.emit({ verb: "flu.contact_added", summary: `${c.first()} added flu contact ${id}, ${v.name} at ${v.company}.` });
    return c.ok("Contact added.", "ok", id);
  },

  "flu2/saveNote": (c, a: { id?: string | null; title: string; body: string; pinned?: boolean }) => {
    const deny = canEdit(c, "edit Flu 2026 notes", true); if (deny) return deny;
    const title = String(a.title || "").trim(), body = String(a.body || "").trim();
    if (!title) return c.fail("Give the note a title.");
    if (body.length < 3) return c.fail("Write the note.");
    if (body.length > 2000) return c.fail("Keep the note under 2,000 characters.");
    const g = c.s.gaps;
    if (a.id) {
      const n = g.fluNotes.find((x) => x.id === a.id);
      if (!n) return c.fail("Unknown note.");
      const pinned = a.pinned === undefined ? n.pinned : !!a.pinned;
      if (n.title === title && n.body === body && n.pinned === pinned) return { ok: false, tone: "info", message: "Nothing changed." };
      Object.assign(n, { title, body, pinned, updatedAt: c.now, updatedBy: me(c) });
      c.emit({ verb: "flu.note_updated", summary: `${c.first()} updated the Flu 2026 note "${title}".` });
      return c.ok("Note saved.", "ok", n.id);
    }
    const id = gapsNext(g, "fluNote", "FN");
    g.fluNotes.push({ id, title, body, pinned: !!a.pinned, updatedAt: c.now, updatedBy: me(c) });
    c.emit({ verb: "flu.note_added", summary: `${c.first()} added the Flu 2026 note "${title}".` });
    return c.ok("Note added.", "ok", id);
  },
});

export const fluBoardsAct = {
  saveContact: (id: string | null, contact: FluContactInput) => ({ type: "flu2/saveContact", id, contact }),
  saveNote: (id: string | null, title: string, body: string, pinned?: boolean) => ({ type: "flu2/saveNote", id, title, body, pinned }),
};
