/* Flu, Contacts & notes: the Flu workspace's "contacts" board and the "Flu 2026 notes" board, as
   simple lists with add and edit. Order records live on Vaccine stock. Names and numbers are
   fictional. Deep link: #/Flu/contacts */
import { useState } from "react";
import { fluAccessFor, fmtShortDateTime, staffName } from "../../model";
import type { FluContact, FluNote } from "../../model";
import { dispatch, usePersona, usePhState } from "../../store";
import { useNav } from "../../nav-context";
import { Button, Card, CardHeader, Checkbox, Field, Icon, Modal, PageHeader, Pill, SearchBox, TextInput, Textarea } from "../../ui";
import { fluBoardsAct } from "./boardsActions";
import type { FluContactInput } from "./boardsActions";

const BLANK: FluContactInput = { company: "", name: "", role: "", email: "", phone: "", note: "" };

export default function FluBoards() {
  const state = usePhState();
  const p = usePersona();
  const nav = useNav();
  const access = p.isParticipant ? "none" : fluAccessFor(p.id);
  const canContacts = access === "manage";
  const canNotes = access === "manage" || access === "all";
  const [q, setQ] = useState("");
  const [contact, setContact] = useState<{ id: string | null; v: FluContactInput } | null>(null);
  const [note, setNote] = useState<{ id: string | null; title: string; body: string; pinned: boolean } | null>(null);
  const query = q.trim().toLowerCase();
  const contacts = state.gaps.fluContacts.filter((c) => !query || `${c.company} ${c.name} ${c.role} ${c.email} ${c.phone} ${c.note}`.toLowerCase().includes(query)).sort((a, b) => a.company.localeCompare(b.company));
  const notes = state.gaps.fluNotes.slice().sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1));
  const who = (id: string) => (id === "system" ? "Imported from Monday" : staffName(state, id));
  const saveContact = () => { if (!contact) return; if (dispatch(fluBoardsAct.saveContact(contact.id, contact.v)).ok) setContact(null); };
  const saveNote = () => { if (!note) return; if (dispatch(fluBoardsAct.saveNote(note.id, note.title, note.body, note.pinned)).ok) setNote(null); };
  const editContact = (c: FluContact) => setContact({ id: c.id, v: { company: c.company, name: c.name, role: c.role, email: c.email, phone: c.phone, note: c.note } });
  const editNote = (n: FluNote) => setNote({ id: n.id, title: n.title, body: n.body, pinned: n.pinned });
  return (
    <>
      <PageHeader title="Contacts and notes" sub="The flu contacts board and the Flu 2026 notes board. Vaccine order records are on Vaccine stock."
        actions={<Button icon="arrow" onClick={() => nav.go({ page: "Flu", tab: "stock" })}>Vaccine order records</Button>} />
      <div className="flu-boards">
        <Card>
          <CardHeader title={`Flu contacts (${state.gaps.fluContacts.length})`} sub="Who to ring for flu clinics, Irish Life bookings and vaccine supply."
            right={canContacts ? <Button size="sm" variant="primary" icon="plus" onClick={() => setContact({ id: null, v: { ...BLANK } })}>Add contact</Button> : null} />
          <SearchBox value={q} onChange={setQ} placeholder="Search contacts" width="100%" />
          <div className="flu-blist">
            {contacts.map((c) => (
              <div key={c.id} className="flu-bitem">
                <span className="flu-bicon"><Icon name="user" size={15} /></span>
                <div className="flu-bmain">
                  <div className="flu-btitle">{c.name} <span className="ph-faint" style={{ fontWeight: 400 }}>· {c.role}</span></div>
                  <div className="flu-bsub"><b>{c.company}</b></div>
                  <div className="flu-bsub">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                  {c.note ? <div className="flu-bnote">{c.note}</div> : null}
                </div>
                {canContacts ? <Button size="sm" variant="ghost" icon="edit" onClick={() => editContact(c)}>Edit</Button> : null}
              </div>
            ))}
            {!contacts.length ? <div className="flu-bsub" style={{ padding: "12px 0" }}>No contact matches.</div> : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Flu 2026 notes" sub="Shared notes for the season. Pinned notes stay on top."
            right={canNotes ? <Button size="sm" variant="primary" icon="plus" onClick={() => setNote({ id: null, title: "", body: "", pinned: false })}>Add note</Button> : null} />
          <div className="flu-blist">
            {notes.map((n) => (
              <div key={n.id} className="flu-bitem">
                <span className="flu-bicon"><Icon name={n.pinned ? "pin" : "file"} size={15} /></span>
                <div className="flu-bmain">
                  <div className="flu-btitle">{n.title} {n.pinned ? <Pill tone="brand" icon={null}>Pinned</Pill> : null}</div>
                  <div className="flu-bnote" style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                  <div className="flu-bsub ph-faint">{who(n.updatedBy)}, {fmtShortDateTime(n.updatedAt)}</div>
                </div>
                {canNotes ? <Button size="sm" variant="ghost" icon="edit" onClick={() => editNote(n)}>Edit</Button> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
      {contact ? (
        <Modal open onClose={() => setContact(null)} title={contact.id ? "Edit contact" : "Add a flu contact"} width={560}
          footer={<><Button variant="ghost" onClick={() => setContact(null)}>Cancel</Button><Button variant="primary" icon="check" onClick={saveContact}>Save contact</Button></>}>
          <div className="flu-bform">
            {(["company", "name", "role", "email", "phone"] as const).map((k) => (
              <Field key={k} label={{ company: "Company", name: "Name", role: "Role", email: "Email", phone: "Phone" }[k]}>
                <TextInput value={contact.v[k]} onChange={(e) => setContact({ ...contact, v: { ...contact.v, [k]: e.target.value } })} />
              </Field>
            ))}
            <div className="span2"><Field label="Note"><Textarea rows={2} value={contact.v.note} onChange={(e) => setContact({ ...contact, v: { ...contact.v, note: e.target.value } })} /></Field></div>
          </div>
        </Modal>
      ) : null}
      {note ? (
        <Modal open onClose={() => setNote(null)} title={note.id ? "Edit note" : "Add a note"} width={560}
          footer={<><Button variant="ghost" onClick={() => setNote(null)}>Cancel</Button><Button variant="primary" icon="check" onClick={saveNote}>Save note</Button></>}>
          <div className="ph-stack" style={{ gap: 10 }}>
            <Field label="Title"><TextInput value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} /></Field>
            <Field label="Note"><Textarea rows={5} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} /></Field>
            <Checkbox checked={note.pinned} onChange={(v) => setNote({ ...note, pinned: v })} label="Pin to the top" />
          </div>
        </Modal>
      ) : null}
      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.flu-boards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
.flu-blist { display: flex; flex-direction: column; margin-top: 8px; }
.flu-bitem { display: flex; gap: 10px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--border); }
.flu-bitem:first-child { border-top: 0; }
.flu-bicon { flex: none; width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent); }
.flu-bmain { flex: 1; min-width: 0; }
.flu-btitle { color: var(--ink); font-weight: 600; font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.flu-bsub { color: var(--dim); font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }
.flu-bnote { color: var(--body); font-size: 12.5px; margin-top: 4px; line-height: 1.5; }
.flu-bform { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
.flu-bform .span2 { grid-column: 1 / -1; }
@media (max-width: 900px) { .flu-boards, .flu-bform { grid-template-columns: minmax(0, 1fr); } }
`;
