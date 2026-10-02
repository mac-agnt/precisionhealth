/* The three composer panes: reusable block library (left), ordered form sections (centre)
   and the field and version preview (right), plus the scheduling-only template preview. */
import { useState } from "react";
import type { DragEvent } from "react";
import type { FieldDef, FormBlock, FormTemplate, FormTemplateVersion, PhState } from "../../model";
import { CLINIC_DAY, activityFeed, buildSlots, fmtDateTime, fmtShortDateTime, ix, plural } from "../../model";
import { Button, Card, CardHeader, DemoTag, EmptyState, EntityLink, Icon, Pill, Switch } from "../../ui";
import { Note, VersionPill } from "./common";
import { VERSION_STATUS } from "./palette";
import { ABSENCE_LABEL, conditionText, currentOf, fieldShort, movedBlocks, sharedBy, sortVersionsDesc, templateUsage, versionDiff } from "./model";

/* ---- left: template list with status and version ---- */
export function TemplateList({ templates, selected, onSelect }: { templates: FormTemplate[]; selected: string; onSelect: (id: string) => void }) {
  const groups: Array<{ label: string; list: FormTemplate[] }> = [
    { label: "Clinical screening forms", list: templates.filter((t) => t.kind === "screening" && t.id !== "tpl-booking-consent") },
    { label: "Booking and consent", list: templates.filter((t) => t.id === "tpl-booking-consent") },
    { label: "Scheduling only", list: templates.filter((t) => t.kind === "service") },
  ].filter((g) => g.list.length);
  return (
    <Card>
      <CardHeader title="Form templates" sub={`${templates.length} templates. Select one to build or review it.`} />
      <div className="prg-tlist" role="group" aria-label="Form templates">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="prg-tgroup">{g.label}</div>
            {g.list.map((t) => {
              const cur = t.versions.find((v) => v.version === t.currentVersion);
              const draft = t.versions.find((v) => v.status === "draft"), pend = t.versions.find((v) => v.status === "pending_approval");
              return (
                <button key={t.id} type="button" className="prg-trow" aria-pressed={t.id === selected} onClick={() => onSelect(t.id)}>
                  <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, lineHeight: 1.3 }}>{t.name}</span>
                  <span className="ph-wrap" style={{ gap: 5 }}>
                    <span className="prg-tag prg-tag-on">v{t.currentVersion}{cur ? ` ${VERSION_STATUS[cur.status].label.toLowerCase()}` : ""}</span>
                    {draft ? <span className="prg-tag">Draft v{draft.version}</span> : null}
                    {pend ? <span className="prg-tag" style={{ color: "var(--warn)" }}>v{pend.version} awaiting approval</span> : null}
                    {t.kind === "service" ? <span className="prg-tag">Scheduling only</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---- left: reusable blocks ---- */
export function BlockLibrary({ s, version, selected, editable, hint, onSelect, onAdd }: {
  s: PhState; version: FormTemplateVersion; selected: string; editable: boolean; hint: string | null;
  onSelect: (id: string) => void; onAdd: (id: string) => void;
}) {
  const blocks = s.forms.blocks.filter((b) => !b.id.includes("--"));
  return (
    <Card>
      <CardHeader title="Reusable blocks" sub={`${blocks.length} versioned, clinically approved blocks. Templates reference a block; they never copy it.`} />
      {hint ? <div style={{ marginBottom: 10 }}><Note tone={editable ? "info" : "neutral"} icon={editable ? "plus" : "info"}>{hint}</Note></div> : null}
      <div className="prg-blks">
        {blocks.map((b) => {
          const inForm = version.blocks.some((r) => r.blockId === b.id);
          const uses = sharedBy(s, b).length;
          const sel = b.id === selected;
          return (
            <div key={b.id} className="prg-blk" data-sel={sel ? "1" : "0"}
              draggable={editable && !inForm}
              onDragStart={(e: DragEvent<HTMLDivElement>) => { e.dataTransfer.setData("text/prg-block", b.id); e.dataTransfer.effectAllowed = "copy"; }}>
              <button type="button" className="prg-blk-main" aria-pressed={sel} onClick={() => onSelect(b.id)} title={b.summary}>
                <div className="prg-blk-name">{b.name} <span className="ph-faint" style={{ fontWeight: 400 }}>{b.version}</span></div>
                <div className="prg-blk-meta">
                  {b.fields.length} fields, used by {uses} template{uses === 1 ? "" : "s"}{inForm ? ". In this version" : ""}
                </div>
              </button>
              {editable ? (
                inForm
                  ? <span title="Already in this draft" style={{ color: "var(--accent)", marginTop: 4, flex: "none" }}><Icon name="check" size={14} stroke={2} /></span>
                  : <Button size="sm" icon="plus" onClick={() => onAdd(b.id)} aria-label={`Add ${b.name} ${b.version} to the draft`}>Add</Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- centre: ordered sections ---- */
export function SectionList({ s, template, version, selected, editable, onSelect, onMove, onMoveTo, onToggle, onRemove, onAdd, selectedField, onSelectField }: {
  s: PhState; template: FormTemplate; version: FormTemplateVersion; selected: string; editable: boolean;
  onSelect: (id: string) => void; onMove: (id: string, dir: -1 | 1) => void; onMoveTo: (id: string, to: number) => void;
  onToggle: (id: string) => void; onRemove: (id: string) => void; onAdd: (id: string) => void;
  selectedField?: string | null; onSelectField?: (blockId: string, key: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const base = currentOf(template);
  const compare = version.status === "draft" || version.status === "pending_approval" ? base : undefined;
  const diff = versionDiff(compare, version);
  const moved = movedBlocks(compare, version);
  if (!version.blocks.length) {
    return (
      <div className="prg-sec" onDragOver={(e) => { if (editable) e.preventDefault(); }} onDrop={(e) => { const id = e.dataTransfer.getData("text/prg-block"); if (editable && id) onAdd(id); }}>
        <EmptyState title="No blocks in this version" icon="layers">{editable ? "Add reusable blocks from the library. Each one keeps its approved fields and units." : "This version has no form blocks."}</EmptyState>
      </div>
    );
  }
  const drop = (e: DragEvent<HTMLLIElement>, i: number) => {
    if (!editable) return;
    e.preventDefault();
    const fromLib = e.dataTransfer.getData("text/prg-block");
    const moving = e.dataTransfer.getData("text/prg-section");
    setOver(null); setDrag(null);
    if (moving) onMoveTo(moving, i);
    else if (fromLib) { onAdd(fromLib); onMoveTo(fromLib, i); }
  };
  return (
    <ol className="prg-secs" aria-label={`Sections of ${template.name} v${version.version}`}>
      {version.blocks.map((ref, i) => {
        const blk = s.forms.blocks.find((b) => b.id === ref.blockId);
        const archived = !!blk && blk.version !== ref.version;
        const sel = ref.blockId === selected;
        const added = diff.added.some((x) => x.blockId === ref.blockId);
        const req = diff.requiredChanged.some((x) => x.blockId === ref.blockId);
        const ver = diff.blockVersionChanged.find((x) => x.blockId === ref.blockId);
        const isMoved = moved.has(ref.blockId);
        const name = blk?.name || ref.blockId;
        return (
          <li key={ref.blockId} className="prg-sec" data-sel={sel ? "1" : "0"} data-drop={over === i ? "1" : "0"}
            draggable={editable}
            onDragStart={(e) => { if (!editable) return; e.dataTransfer.setData("text/prg-section", ref.blockId); e.dataTransfer.effectAllowed = "move"; setDrag(ref.blockId); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            onDragOver={(e) => { if (!editable) return; e.preventDefault(); if (over !== i) setOver(i); }}
            onDragLeave={() => { if (over === i) setOver(null); }}
            onDrop={(e) => drop(e, i)}
            style={drag === ref.blockId ? { opacity: 0.55 } : undefined}>
            <div className="prg-sec-top">
              <span className="prg-sec-no">{i + 1}</span>
              <button type="button" className="prg-sec-main" aria-pressed={sel} onClick={() => onSelect(ref.blockId)}>
                <span className="prg-sec-title">
                  {name} <span className="ph-faint" style={{ fontWeight: 400 }}>{ref.version}</span>
                  {added ? <Pill tone="info" icon="plus">New in v{version.version}</Pill> : null}
                  {ver ? <Pill tone="info" icon="refresh">Updated from {ver.from}</Pill> : null}
                  {req ? <Pill tone="info" icon="edit">{ref.required ? "Now required" : "Now optional"}</Pill> : null}
                  {isMoved ? <Pill tone="neutral" icon="list">Moved</Pill> : null}
                </span>
                <span className="prg-sec-fields">
                  {!blk ? "Unknown block." : archived ? `Archived block version. The library now holds ${blk.version}.` : onSelectField ? `${blk.fields.length} fields${ref.blockId.includes("--") ? ", draft block version for this draft only" : ""}` : blk.fields.map(fieldShort).join("; ")}
                </span>
              </button>
              {editable ? <span className="prg-grip" title="Drag to reorder" aria-hidden="true"><Icon name="grip" size={14} /></span> : (
                <span className={"prg-tag" + (ref.required ? " prg-tag-on" : "")} style={{ marginTop: 2 }}>{ref.required ? "Required" : "Optional"}</span>
              )}
            </div>
            {onSelectField && blk && !archived ? (
              <div className="prg-frows" aria-label={`Fields in ${name}`}>
                {blk.fields.map((f) => (
                  <button key={f.key} type="button" className="prg-frow" aria-pressed={selectedField === `${ref.blockId}:${f.key}`} onClick={() => onSelectField(ref.blockId, f.key)}>
                    <span style={{ flex: "1 1 120px", minWidth: 0 }}>{f.label}</span>
                    {f.unit ? <span className="prg-tag">{f.unit}</span> : null}
                    <span className={"prg-tag" + (f.required ? " prg-tag-on" : "")}>{f.required ? "Required" : "Optional"}</span>
                    {f.showIf ? <span className="prg-tag" title={`Shown when ${conditionText(f, blk.fields)}`}>Conditional</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {editable ? (
              <div className="prg-sec-ctl">
                <span className="prg-req">
                  <Switch on={ref.required} onChange={() => onToggle(ref.blockId)} label={`${name} is a required section`} />
                  {ref.required ? "Required section" : "Optional section"}
                </span>
                <span className="ph-grow" />
                <Button size="sm" variant="ghost" icon="up" disabled={i === 0} onClick={() => onMove(ref.blockId, -1)} aria-label={`Move ${name} up`} title="Move up" />
                <Button size="sm" variant="ghost" icon="down" disabled={i === version.blocks.length - 1} onClick={() => onMove(ref.blockId, 1)} aria-label={`Move ${name} down`} title="Move down" />
                <Button size="sm" variant="ghost" icon="x" onClick={() => onRemove(ref.blockId)} aria-label={`Remove ${name} from the draft`}>Remove</Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---- right: field preview for the selected block ---- */
function FieldRow({ f, siblings }: { f: FieldDef; siblings: FieldDef[] }) {
  const cond = conditionText(f, siblings);
  const range = f.min !== undefined && f.max !== undefined ? `${f.min} to ${f.max}` : null;
  return (
    <div className="prg-field">
      <div className="prg-field-top">
        <span className="prg-field-label">{f.label}</span>
        <span className="prg-field-type">{f.key === "bmi" ? "calculated" : f.type}</span>
      </div>
      <div className="prg-field-meta">
        {f.unit ? <span className="prg-tag prg-tag-on">{f.unit}</span> : <span className="prg-tag">No unit</span>}
        <span className={"prg-tag" + (f.required ? " prg-tag-on" : "")}>{f.required ? "Required" : "Optional"}</span>
        {range ? <span className="prg-tag">Range {range}</span> : null}
        {f.options ? <span className="prg-tag" title={f.options.join(", ")}>{f.options.length} options</span> : null}
      </div>
      <div className="ph-faint" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>
        If absent: {f.absence.map((a) => ABSENCE_LABEL[a]).join(", ")}. Never stored as zero or normal.
      </div>
      {cond ? <div style={{ fontSize: 11.5, marginTop: 4, color: "var(--accent)", lineHeight: 1.45 }}>Conditional: shown when {cond}.</div> : null}
    </div>
  );
}

export function BlockPanel({ s, block, refVersion }: { s: PhState; block: FormBlock; refVersion: string }) {
  const archived = refVersion !== block.version;
  const shared = sharedBy(s, block);
  return (
    <Card>
      <CardHeader title={`${block.name} ${refVersion}`} sub={block.summary} right={<Pill tone="ok" icon="shield">{block.approvedBy}</Pill>} />
      {archived ? (
        <Note tone="warn">This template version references {block.name} {refVersion}. The shared library now holds {block.version}. The archived field definitions stay with the retired version and are not loaded in this demo.</Note>
      ) : (
        <div>{block.fields.map((f) => <FieldRow key={f.key} f={f} siblings={block.fields} />)}</div>
      )}
      <div className="prg-divider" style={{ margin: "12px 0" }} />
      <div className="prg-label">Shared use of {block.name} {block.version}</div>
      {shared.length ? (
        <div className="ph-stack" style={{ gap: 6 }}>
          {shared.map((u) => (
            <div key={u.template.id + u.version.version} className="ph-row-flex" style={{ gap: 8, fontSize: 12, alignItems: "flex-start" }}>
              <span className="ph-grow" style={{ color: "var(--body)", lineHeight: 1.4 }}>{u.template.name} v{u.version.version}</span>
              <VersionPill status={u.version.status} />
            </div>
          ))}
        </div>
      ) : <div className="ph-faint" style={{ fontSize: 12 }}>Not used by a published or draft template.</div>}
      {shared.length > 1 ? (
        <div style={{ marginTop: 10 }}>
          <Note tone="ok">Identical field definitions in {shared.length} templates. Each references {block.name} {block.version} from the shared library, so units, validation and absence reasons match everywhere it is used.</Note>
        </div>
      ) : null}
    </Card>
  );
}

/* ---- right: versions, usage and changes ---- */
export function VersionPanel({ s, template, selected, onSelect }: { s: PhState; template: FormTemplate; selected: string; onSelect: (v: string) => void }) {
  const u = templateUsage(s, template.id);
  const I = ix(s);
  const cur = currentOf(template);
  const sel = template.versions.find((v) => v.version === selected);
  const diff = sel && (sel.status === "draft" || sel.status === "pending_approval") ? versionDiff(cur, sel) : null;
  const blockName = (id: string) => s.forms.blocks.find((b) => b.id === id)?.name || id;
  const approval = s.approvals.find((a) => a.type === "form_publication" && a.target.id === template.id && a.status === "pending");
  const events = activityFeed(s, { entityKind: "template" }).filter((v) => v.event.entity?.id === template.id).slice(0, 4);
  return (
    <Card>
      <CardHeader title="Versions and usage" sub="A draft never changes answers already collected. Each episode keeps the form version it was collected on." />
      <div className="ph-stack" style={{ gap: 10 }}>
        {sortVersionsDesc(template.versions).map((v) => {
          const eps = u.episodesByVersion[v.version] || 0, ups = u.upcomingByVersion[v.version] || 0;
          const isSel = v.version === selected;
          return (
            <div key={v.version} className="ph-stack" style={{ gap: 4, padding: "9px 11px", borderRadius: 12, border: "1px solid " + (isSel ? "var(--accent-line)" : "var(--border)"), background: isSel ? "var(--accent-faint)" : "var(--surface-faint)" }}>
              <div className="ph-row-flex" style={{ gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>v{v.version}</span>
                <VersionPill status={v.status} />
                <span className="ph-grow" />
                {!isSel ? <Button size="sm" variant="ghost" onClick={() => onSelect(v.version)} aria-label={`View v${v.version}`}>View</Button> : <span className="ph-faint" style={{ fontSize: 11 }}>Viewing</span>}
              </div>
              <div className="ph-dim" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                {v.blocks.length} blocks. Created by {I.staffById.get(v.createdBy)?.name || v.createdBy}, {fmtShortDateTime(v.createdAt)}.
                {v.publishedAt ? ` Published ${fmtShortDateTime(v.publishedAt)}.` : ""}
              </div>
              {v.note ? <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>Version note: {v.note}</div> : null}
              {template.kind === "screening" ? (
                <div className="ph-num" style={{ fontSize: 11.5, color: "var(--body)" }}>{plural(eps, "episode")} collected, {plural(ups, "upcoming booking")}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      {template.kind === "screening" ? (
        <div style={{ marginTop: 12 }}>
          <Note tone="info" icon="calendar">
            New bookings use v{template.currentVersion}, the published version.
            {u.programmes.length ? ` Programmes: ${u.programmes.map((p) => p.name).join(", ")}.` : " No programme uses this template in the current snapshot."}
            {" "}Existing bookings and episodes keep their own version.
          </Note>
        </div>
      ) : null}
      {diff && sel ? (
        <div style={{ marginTop: 12 }}>
          <div className="prg-label">Changes in v{sel.version} compared with v{cur?.version}</div>
          {diff.any ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--body)", lineHeight: 1.6 }}>
              {diff.added.map((b) => <li key={"a" + b.blockId}>Added {blockName(b.blockId)} {b.version}</li>)}
              {diff.removed.map((b) => <li key={"r" + b.blockId}>Removed {blockName(b.blockId)} {b.version}</li>)}
              {diff.blockVersionChanged.map((b) => <li key={"v" + b.blockId}>{blockName(b.blockId)} updated from {b.from} to {b.to}</li>)}
              {diff.requiredChanged.map((b) => <li key={"q" + b.blockId}>{blockName(b.blockId)} is now {b.required ? "required" : "optional"}</li>)}
              {diff.reordered ? <li>Section order changed</li> : null}
            </ul>
          ) : <div className="ph-faint" style={{ fontSize: 12 }}>No changes yet. It matches v{cur?.version}.</div>}
        </div>
      ) : null}
      {approval ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
          Approval <EntityLink kind="approval" id={approval.id}>{approval.id}</EntityLink> requested by {approval.requestedBy === "system" ? "the system" : I.staffById.get(approval.requestedBy)?.name} on {fmtDateTime(approval.createdAt)}. Clinical approver: {I.staffById.get(approval.reviewerId)?.name}.
        </div>
      ) : null}
      {events.length ? (
        <div style={{ marginTop: 12 }}>
          <div className="prg-label">Template activity</div>
          <div className="ph-stack" style={{ gap: 7 }}>
            {events.map((e) => (
              <div key={e.event.id} style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.45 }}>
                <span className="ph-faint ph-num">{fmtShortDateTime(e.event.at)}</span> {e.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/* ---- scheduling-only service templates ---- */
export function SchedulingPreview({ s, template }: { s: PhState; template: FormTemplate }) {
  const at = s.appointmentTypes.find((a) => a.templateId === template.id);
  const minutes = at?.minutes || 15;
  const slots = buildSlots(CLINIC_DAY.start, CLINIC_DAY.end, CLINIC_DAY.breaks, minutes);
  const items: Array<{ key: string; text: string; brk: boolean }> = [];
  slots.forEach((sl, i) => {
    const prev = slots[i - 1];
    if (prev) {
      CLINIC_DAY.breaks.filter((b) => b.start >= prev.end && b.end <= sl.start)
        .forEach((b) => items.push({ key: "b" + b.start, text: `Break ${b.start} to ${b.end}`, brk: true }));
    }
    items.push({ key: "s" + i, text: sl.start, brk: false });
  });
  return (
    <div className="ph-stack" style={{ gap: 12 }}>
      <Note tone="info" icon="calendar">
        {at ? at.note : "Scheduling template only."} It reuses the booking pattern: an appointment type, bookable slots derived from the clinic day, questionnaire and consent before confirmation, then confirmation and reminders.
      </Note>
      <div>
        <div className="prg-label"><span className="ph-grow">Booking pattern preview: {at ? `${at.name}, ${minutes} minutes` : `${minutes} minutes`}</span><DemoTag>Preview</DemoTag></div>
        <div className="ph-dim" style={{ fontSize: 12, marginBottom: 8, lineHeight: 1.45 }}>
          In the standard clinic day ({CLINIC_DAY.start} to {CLINIC_DAY.end}, {CLINIC_DAY.breaks.length} breaks) this appointment type gives {slots.length} bookable slots. Breaks are never bookable.
        </div>
        <div className="prg-slots">
          {items.map((x) => <span key={x.key} className={"prg-slot" + (x.brk ? " prg-slot-break" : "")}>{x.text}</span>)}
        </div>
      </div>
      <div className="ph-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>No form blocks are attached. This template demonstrates scheduling only.</div>
    </div>
  );
}
