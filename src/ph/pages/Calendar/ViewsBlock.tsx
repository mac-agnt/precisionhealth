/* "Views" at the top of the calendar's left panel: the ready-made views (Everything, Neil: operations,
   Stephen: sales, Nurse rota, Clinics only), any saved ones, and "Save this view". Saved views can be
   renamed and deleted. Picking a view sets ?v=<id>; its filters can still be changed on top. */
import { useState } from "react";
import { CAL_PRESET_VIEWS } from "../../model";
import type { CalSavedView } from "../../model";
import { dispatch } from "../../store";
import { Button, Icon, TextInput } from "../../ui";
import { viewAct } from "./viewActions";

export function ViewsBlock({ viewId, changed, saved, onPick, params, canSave }: {
  viewId: string | null; changed: boolean; saved: CalSavedView[]; onPick: (id: string) => void; params: Record<string, string>; canSave: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const save = () => {
    const r = dispatch(viewAct.save(name, params));
    if (r.ok && r.id) { setSaving(false); setName(""); onPick(r.id); }
  };
  const rename = (id: string) => { if (dispatch(viewAct.rename(id, editName)).ok) setEditing(null); };
  const remove = (id: string) => { if (dispatch(viewAct.remove(id)).ok && viewId === id) onPick("everything"); };
  const row = (id: string, label: string, hint: string, custom: boolean) => {
    const on = viewId === id;
    if (editing === id) {
      return (
        <form key={id} className="cal-view-edit" onSubmit={(e) => { e.preventDefault(); rename(id); }}>
          <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="View name" autoFocus />
          <Button size="sm" type="submit" variant="primary">Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </form>
      );
    }
    return (
      <div key={id} className={"cal-view" + (on ? " on" : "")}>
        <button type="button" className="cal-view-pick" aria-pressed={on} title={hint} onClick={() => onPick(id)}>
          <Icon name={custom ? "flag" : on ? "check" : "layers"} size={13} />
          <span className="cal-view-name">{label}</span>
          {on && changed ? <span className="cal-view-changed" title="Filters changed since this view was opened">changed</span> : null}
        </button>
        {custom && canSave ? (
          <span className="cal-view-tools">
            <button type="button" className="cal-iconbtn" aria-label={`Rename ${label}`} title="Rename" onClick={() => { setEditing(id); setEditName(label); }}><Icon name="edit" size={13} /></button>
            <button type="button" className="cal-iconbtn" aria-label={`Delete ${label}`} title="Delete" onClick={() => remove(id)}><Icon name="x" size={13} /></button>
          </span>
        ) : null}
      </div>
    );
  };
  return (
    <div className="cal-views" aria-label="Views">
      <div className="cal-views-h">Views</div>
      {CAL_PRESET_VIEWS.map((v) => row(v.id, v.name, v.hint, false))}
      {saved.map((v) => row(v.id, v.name, "Saved view", true))}
      {canSave ? (saving ? (
        <form className="cal-view-edit" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" aria-label="Name this view" autoFocus />
          <Button size="sm" type="submit" variant="primary" disabled={name.trim().length < 2}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setSaving(false); setName(""); }}>Cancel</Button>
        </form>
      ) : (
        <button type="button" className="cal-view-save" onClick={() => setSaving(true)}><Icon name="plus" size={13} />Save this view</button>
      )) : null}
    </div>
  );
}
