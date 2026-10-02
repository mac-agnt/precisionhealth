/* Programmes, Forms & Templates: the form creator.
   Left: template list (status and version) and the reusable block library. Centre: the selected
   version's ordered sections and their fields, with add, drag or up/down reorder, remove and
   required toggles. Right: field editor, a live participant-facing preview, and version history.
   Editing needs forms.edit; publication needs forms.publish. Published versions never change:
   edits go to a draft, field edits create a draft block version (copy-on-write), episodes keep
   their form snapshot and new bookings use a version only after it is approved. */
import { useEffect, useState } from "react";
import { act } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, getState, usePersona, usePhState } from "../../store";
import { Button, Card, DemoTag, Icon, Modal, PageHeader, Segmented } from "../../ui";
import { Note, VersionPill } from "./common";
import { VERSION_STATUS } from "./palette";
import { BlockLibrary, BlockPanel, SchedulingPreview, SectionList, TemplateList, VersionPanel } from "./FormParts";
import { FieldEditor } from "./FieldEditor";
import { FormPreview } from "./FormPreview";
import { formAct, isCopyOf } from "./formActions";
import { currentOf, defaultVersion, draftOf, namesOf, nextDraftVersion, pendingOf, sharedBy, sortVersionsDesc, staffWithPerm, templateUsage, versionDiff } from "./model";

type RightTab = "field" | "preview" | "versions";

export default function FormsTemplates() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  // The booking and consent template joins the seeded clinical templates once, idempotently.
  useEffect(() => { if (!getState().forms.templates.some((t) => t.id === "tpl-booking-consent")) dispatch(formAct.seed(), { silent: true }); }, []);
  const canEdit = p.perms.has("forms.edit");
  const canPublish = p.perms.has("forms.publish");
  const templates = s.forms.templates;
  const t = templates.find((x) => x.id === nav.params.template) || templates[0];
  const v = t.versions.find((x) => x.version === nav.params.version) || t.versions.find((x) => x.version === defaultVersion(t)) || t.versions[0];
  const [blockSel, setBlockSel] = useState<{ tid: string; id: string } | null>(null);
  const [fieldSel, setFieldSel] = useState<{ tid: string; ver: string; blockId: string; key: string } | null>(null);
  const [tab, setTab] = useState<RightTab>("field");
  const [confirm, setConfirm] = useState(false);

  const blockId = blockSel && blockSel.tid === t.id && s.forms.blocks.some((b) => b.id === blockSel.id) ? blockSel.id : v.blocks[0]?.blockId || s.forms.blocks[0].id;
  const block = s.forms.blocks.find((b) => b.id === blockId)!;
  const refVersion = v.blocks.find((r) => r.blockId === blockId)?.version || block.version;

  // The selected field follows its block through copy-on-write (the draft ref moves to the new block id).
  const fsBlock = fieldSel && fieldSel.tid === t.id && fieldSel.ver === v.version
    ? v.blocks.find((r) => r.blockId === fieldSel.blockId || isCopyOf(r.blockId) === isCopyOf(fieldSel.blockId)) : undefined;
  const fBlock = fsBlock ? s.forms.blocks.find((b) => b.id === fsBlock.blockId) : undefined;
  const field = fBlock?.fields.find((f) => f.key === fieldSel!.key);

  const draft = draftOf(t), pending = pendingOf(t), cur = currentOf(t);
  const screening = t.kind === "screening";
  const editable = canEdit && screening && v.status === "draft";
  const approval = s.approvals.find((a) => a.type === "form_publication" && a.target.id === t.id && a.status === "pending");
  const editors = namesOf(staffWithPerm(s, "forms.edit"));
  const approvers = namesOf(staffWithPerm(s, "forms.publish"));
  const usage = templateUsage(s, t.id);

  const setParams = (patch: Record<string, string>) => nav.setParams({ ...nav.params, ...patch });
  const selectTemplate = (id: string) => { nav.setParams({ template: id }); setConfirm(false); setFieldSel(null); };
  const selectVersion = (ver: string) => { setParams({ template: t.id, version: ver }); setFieldSel(null); };
  const selectBlock = (id: string) => setBlockSel({ tid: t.id, id });
  const selectField = (bid: string, key: string) => { setFieldSel({ tid: t.id, ver: v.version, blockId: bid, key }); setBlockSel({ tid: t.id, id: bid }); setTab("field"); };

  const createDraft = () => { const r = dispatch(act.createFormDraft(t.id)); if (r.ok && r.id) { setParams({ template: t.id, version: r.id }); setFieldSel(null); } };
  const add = (id: string) => { const r = dispatch(act.addFormBlock(t.id, id)); if (r.ok) selectBlock(id); };
  const move = (id: string, dir: -1 | 1) => { dispatch(act.moveFormBlock(t.id, id, dir)); };
  /** Drag and drop: step one place at a time through the shared action, reading fresh state each step. */
  const moveTo = (id: string, to: number) => {
    for (let guard = 0; guard < 24; guard++) {
      const tt = getState().forms.templates.find((x) => x.id === t.id);
      const dv = tt ? draftOf(tt) : undefined;
      if (!dv) return;
      const i = dv.blocks.findIndex((b) => b.blockId === id);
      const target = Math.max(0, Math.min(to, dv.blocks.length - 1));
      if (i < 0 || i === target) return;
      if (!dispatch(act.moveFormBlock(t.id, id, i < target ? 1 : -1)).ok) return;
    }
  };
  const toggle = (id: string) => { dispatch(act.toggleBlockRequired(t.id, id)); };
  const remove = (id: string) => { dispatch(act.removeFormBlock(t.id, id)); };
  const save = () => { dispatch(formAct.saveDraft(t.id)); };
  const submit = () => { dispatch(act.submitFormPublication(t.id)); };
  const decide = (approve: boolean) => {
    if (!approval) return;
    const r = dispatch(act.decideFormPublication(approval.id, approve));
    if (r.ok) setConfirm(false);
  };

  const roleLine = canPublish
    ? { can: true, text: "You are a form administrator and the clinical approver: you can build drafts, submit them and approve publication." }
    : canEdit
      ? { can: true, text: `You are a form administrator: you can build drafts and submit them. Publication needs a clinical approver (${approvers}).` }
      : { can: false, text: `Read only for ${p.name} (${p.roleLabel}). Building is limited to form administrators (${editors}); publication is approved by ${approvers}.` };

  const libraryHint = !screening
    ? "Scheduling templates have no form blocks."
    : editable
      ? `Add a block to draft v${v.version}. New blocks go to the end; drag them or use the arrows to place them.`
      : !canEdit ? `Read only. Form administrators (${editors}) add blocks to draft versions.`
        : v.status === "pending_approval" ? `v${v.version} is awaiting approval and cannot change.`
          : v.status === "retired" ? "Retired versions cannot change."
            : draft ? `Open draft v${draft.version} to add blocks.` : "Create a new version to add or reorder blocks.";
  const editReason = !screening ? "Scheduling templates have no form fields."
    : !canEdit ? `Read only. Form administrators (${editors}) edit fields in draft versions.`
      : v.status === "draft" ? null
        : v.status === "pending_approval" ? `v${v.version} is awaiting approval. Return it to draft to change it.`
          : draft ? `Published and retired versions never change. Open draft v${draft.version} to edit.` : "Published versions never change. Create a new version to edit this field.";

  const diffForConfirm = pending ? versionDiff(cur, pending) : null;
  const blockName = (id: string) => s.forms.blocks.find((b) => b.id === id)?.name || id;

  const actions = (() => {
    if (!screening) return null;
    const history = <Button size="sm" variant="ghost" icon="clock" onClick={() => setTab("versions")}>Version history</Button>;
    if (v.status === "published") {
      if (draft) return <div className="ph-wrap"><Button variant="primary" icon="edit" onClick={() => selectVersion(draft.version)}>Open draft v{draft.version}</Button>{history}</div>;
      if (pending) return <div className="ph-wrap"><Button icon="clock" onClick={() => selectVersion(pending.version)}>Open v{pending.version}, awaiting approval</Button>{history}</div>;
      return (
        <div className="ph-wrap">
          <Button variant="primary" icon="plus" disabled={!canEdit} title={canEdit ? undefined : `Only form administrators (${editors}) create versions`} onClick={createDraft}>Create new version (v{nextDraftVersion(t)})</Button>
          {history}
          <span className="ph-dim" style={{ fontSize: 12, lineHeight: 1.45 }}>
            {canEdit ? `Starts a draft from v${v.version}. ${usage.episodesByVersion[v.version] ? `The ${usage.episodesByVersion[v.version]} episodes collected on v${v.version} keep their snapshot.` : `No episodes have been collected on v${v.version} yet.`}` : `Read only. ${editors} can create a new version.`}
          </span>
        </div>
      );
    }
    if (v.status === "draft") {
      return (
        <div className="ph-wrap">
          <Button icon="check" disabled={!canEdit} onClick={save} title={canEdit ? undefined : `Only form administrators (${editors}) save drafts`}>Save draft</Button>
          <Button variant="primary" icon="send" disabled={!canEdit || !v.blocks.length} onClick={submit} title={!canEdit ? `Only form administrators (${editors}) submit drafts` : v.blocks.length ? undefined : "Add at least one block first"}>Submit for publication approval</Button>
          {history}
          <span className="ph-dim" style={{ fontSize: 12, lineHeight: 1.45 }}>Approval by {approvers}. Until then new bookings keep using v{t.currentVersion}.</span>
        </div>
      );
    }
    if (v.status === "pending_approval") {
      if (canPublish && approval) {
        return (
          <div className="ph-wrap">
            <Button variant="primary" icon="check" onClick={() => setConfirm(true)}>Approve publication</Button>
            <Button icon="refresh" onClick={() => decide(false)}>Return to draft</Button>
            {history}
          </div>
        );
      }
      return <div className="ph-stack" style={{ gap: 8 }}><Note tone="warn" icon="clock">v{v.version} is awaiting publication approval by {approvers}. It cannot be edited unless it is returned to draft.</Note><div>{history}</div></div>;
    }
    return <div className="ph-stack" style={{ gap: 8 }}><Note tone="neutral" icon="layers">Retired version, kept for history. {usage.episodesByVersion[v.version] || 0} episodes were collected on it and keep this snapshot.</Note><div>{history}</div></div>;
  })();

  return (
    <div className="ph-page prg-page">
      <PageHeader
        title="Forms & Templates"
        sub="Build screening, booking and consent forms from reusable, versioned blocks. Edit fields in a draft, check the participant view, then submit the new version for clinical approval."
        actions={<DemoTag>Sample clinical content</DemoTag>}
      />
      <div className="prg-cq">
        <div className="prg-permline" data-can={roleLine.can ? "1" : "0"}>
          <Icon name={roleLine.can ? "shield" : "lock"} size={13} />
          <span>{roleLine.text}</span>
        </div>
        <div className="prg-composer">
          <div className="prg-pane-left ph-stack">
            <TemplateList templates={templates} selected={t.id} onSelect={selectTemplate} />
            <BlockLibrary s={s} version={v} selected={blockId} editable={editable} hint={libraryHint} onSelect={selectBlock} onAdd={add} />
          </div>
          <div className="prg-pane-centre">
            <Card>
              <div className="ph-row-flex" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div className="ph-grow" style={{ minWidth: 200 }}>
                  <h3 className="ph-h2">{t.name}</h3>
                  <div className="ph-dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{t.purpose}</div>
                </div>
                <VersionPill status={v.status} />
              </div>
              <div style={{ marginTop: 12 }}>
                <Segmented<string> label="Version" value={v.version} onChange={selectVersion}
                  options={sortVersionsDesc(t.versions).map((x) => ({ id: x.version, label: `v${x.version} ${VERSION_STATUS[x.status].label.toLowerCase()}` }))} />
              </div>
              {actions ? <div style={{ marginTop: 12 }}>{actions}</div> : null}
              <div style={{ marginTop: 14 }}>
                {!screening ? <SchedulingPreview s={s} template={t} />
                  : <SectionList s={s} template={t} version={v} selected={blockId} editable={editable} onSelect={selectBlock} onMove={move} onMoveTo={moveTo} onToggle={toggle} onRemove={remove} onAdd={add}
                      selectedField={fBlock && field ? `${fBlock.id}:${field.key}` : null} onSelectField={selectField} />}
              </div>
            </Card>
          </div>
          <div className="prg-pane-right ph-stack">
            <Card>
              <Segmented<RightTab> label="Inspector" value={tab} onChange={setTab}
                options={[{ id: "field", label: "Field editor" }, { id: "preview", label: "Participant preview" }, { id: "versions", label: "Versions" }]} />
              <div style={{ marginTop: 14 }}>
                {tab === "field" ? (
                  field && fBlock ? (
                    <FieldEditor key={`${fBlock.id}:${field.key}`} template={t} version={v} block={fBlock} field={field} editable={editable} reason={editReason}
                      sharedNames={sharedBy(s, fBlock).filter((u) => u.template.id !== t.id).map((u) => `${u.template.name} v${u.version.version}`)} />
                  ) : (
                    <Note tone="neutral" icon="edit">{screening ? "Select a field in the form to edit its label, type, unit, required state, absence options, conditional rule and validation." : "Scheduling templates have no form fields."}</Note>
                  )
                ) : tab === "preview" ? (
                  screening ? <FormPreview key={`${t.id}@${v.version}`} version={v} blocks={s.forms.blocks} participant /> : <Note tone="neutral">Scheduling templates have no participant form.</Note>
                ) : (
                  <div className="ph-stack" style={{ gap: 14 }}>
                    <VersionPanel s={s} template={t} selected={v.version} onSelect={selectVersion} />
                  </div>
                )}
              </div>
            </Card>
            {tab === "field" && screening ? <BlockPanel s={s} block={block} refVersion={refVersion} /> : null}
          </div>
        </div>
      </div>
      <Modal open={confirm && !!pending && !!approval} onClose={() => setConfirm(false)} title={`Publish ${t.name} v${pending?.version || ""}?`} width={560}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => decide(true)}>Approve and publish</Button></>}>
        {pending ? (
          <div className="ph-stack prg-modal" style={{ gap: 10, fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>
            <div>Publishing makes v{pending.version} the version used for new bookings. Nothing already collected changes.</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
              <li>New bookings {usage.programmes.length ? `for ${usage.programmes.map((x) => x.name).join(", ")} ` : ""}use v{pending.version}.</li>
              <li>{usage.upcomingByVersion[t.currentVersion] || 0} upcoming bookings keep v{t.currentVersion}, the version they were confirmed on.</li>
              <li>{usage.episodesByVersion[t.currentVersion] || 0} collected episodes keep their v{t.currentVersion} snapshot. Previously collected answers are not altered.</li>
              <li>v{t.currentVersion} is retired and kept for history.</li>
            </ul>
            {diffForConfirm?.any ? (
              <div className="ph-dim">
                Changes: {[
                  ...diffForConfirm.added.map((b) => `added ${blockName(b.blockId)} ${b.version}`),
                  ...diffForConfirm.removed.map((b) => `removed ${blockName(b.blockId)}`),
                  ...diffForConfirm.blockVersionChanged.map((b) => `${blockName(b.blockId)} ${b.from} to ${b.to}`),
                  ...diffForConfirm.requiredChanged.map((b) => `${blockName(b.blockId)} now ${b.required ? "required" : "optional"}`),
                  ...(diffForConfirm.reordered ? ["section order changed"] : []),
                ].join("; ")}.
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
