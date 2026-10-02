/* Programmes, Forms & Templates: a genuine local form-composition workspace.
   Left: reusable, versioned blocks. Centre: the ordered sections of the selected template
   version, with a live preview of conditional questions. Right: field definitions of the
   selected block, where it is shared, and the template's versions and usage.
   Editing needs forms.edit (form administrators); publication needs forms.publish. A draft
   never changes collected answers: episodes keep their form snapshot and new bookings use a
   new version only after it is approved. Selection lives in the URL (?template=&version=). */
import { useState } from "react";
import { act } from "../../model";
import { useNav } from "../../nav-context";
import { dispatch, getState, usePersona, usePhState } from "../../store";
import { Button, Card, DemoTag, Icon, Modal, PageHeader, Segmented } from "../../ui";
import { Note, VersionPill } from "./common";
import { VERSION_STATUS } from "./palette";
import { BlockLibrary, BlockPanel, SchedulingPreview, SectionList, VersionPanel } from "./FormParts";
import { FormPreview } from "./FormPreview";
import { currentOf, defaultVersion, draftOf, namesOf, nextDraftVersion, pendingOf, sortVersionsDesc, staffWithPerm, templateUsage, versionDiff } from "./model";

export default function FormsTemplates() {
  const s = usePhState();
  const nav = useNav();
  const p = usePersona();
  const canEdit = p.perms.has("forms.edit");
  const canPublish = p.perms.has("forms.publish");
  const templates = s.forms.templates;
  const t = templates.find((x) => x.id === nav.params.template) || templates[0];
  const v = t.versions.find((x) => x.version === nav.params.version) || t.versions.find((x) => x.version === defaultVersion(t)) || t.versions[0];
  const [blockSel, setBlockSel] = useState<{ tid: string; id: string } | null>(null);
  const [mode, setMode] = useState<"compose" | "preview">("compose");
  const [confirm, setConfirm] = useState(false);

  const blockId = blockSel && blockSel.tid === t.id && s.forms.blocks.some((b) => b.id === blockSel.id) ? blockSel.id : v.blocks[0]?.blockId || s.forms.blocks[0].id;
  const block = s.forms.blocks.find((b) => b.id === blockId)!;
  const refVersion = v.blocks.find((r) => r.blockId === blockId)?.version || block.version;

  const draft = draftOf(t), pending = pendingOf(t), cur = currentOf(t);
  const screening = t.kind === "screening";
  const editable = canEdit && screening && v.status === "draft";
  const approval = s.approvals.find((a) => a.type === "form_publication" && a.target.id === t.id && a.status === "pending");
  const editors = namesOf(staffWithPerm(s, "forms.edit"));
  const approvers = namesOf(staffWithPerm(s, "forms.publish"));
  const usage = templateUsage(s, t.id);

  const setParams = (patch: Record<string, string>) => nav.setParams({ ...nav.params, ...patch });
  const selectTemplate = (id: string) => { nav.setParams({ template: id }); setConfirm(false); };
  const selectVersion = (ver: string) => setParams({ template: t.id, version: ver });
  const selectBlock = (id: string) => setBlockSel({ tid: t.id, id });

  const createDraft = () => { const r = dispatch(act.createFormDraft(t.id)); if (r.ok && r.id) setParams({ template: t.id, version: r.id }); };
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
  const submit = () => { dispatch(act.submitFormPublication(t.id)); };
  const decide = (approve: boolean) => {
    if (!approval) return;
    const r = dispatch(act.decideFormPublication(approval.id, approve));
    if (r.ok) setConfirm(false);
  };

  const roleLine = canPublish
    ? { can: true, text: `You are a form administrator and the clinical approver: you can edit drafts, submit them and approve publication.` }
    : canEdit
      ? { can: true, text: `You are a form administrator: you can edit drafts and submit them. Publication needs a clinical approver (${approvers}).` }
      : { can: false, text: `Read only for ${p.name} (${p.roleLabel}). Editing is limited to form administrators (${editors}); publication is approved by ${approvers}.` };

  const libraryHint = !screening
    ? "Scheduling templates have no form blocks. Browse the library to see what screening templates use."
    : editable
      ? `Add a block to draft v${v.version}. New blocks go to the end; drag them or use the arrows to place them.`
      : !canEdit
        ? `Read only. Form administrators (${editors}) add blocks to draft versions.`
        : v.status === "pending_approval"
          ? `v${v.version} is awaiting approval and cannot change.`
          : v.status === "retired"
            ? "Retired versions cannot change."
            : draft ? `Open draft v${draft.version} to add blocks.` : "Create a draft version to add or reorder blocks.";

  const diffForConfirm = pending ? versionDiff(cur, pending) : null;
  const blockName = (id: string) => s.forms.blocks.find((b) => b.id === id)?.name || id;

  const actions = (() => {
    if (!screening) return null;
    if (v.status === "published") {
      if (draft) return <div className="ph-wrap"><Button variant="primary" icon="edit" onClick={() => selectVersion(draft.version)}>Open draft v{draft.version}</Button><span className="ph-dim" style={{ fontSize: 12 }}>A draft is already open for this template.</span></div>;
      if (pending) return <div className="ph-wrap"><Button icon="clock" onClick={() => selectVersion(pending.version)}>Open v{pending.version}, awaiting approval</Button><span className="ph-dim" style={{ fontSize: 12 }}>Decide it before a new draft can start.</span></div>;
      if (canEdit) {
        return (
          <div className="ph-wrap">
            <Button variant="primary" icon="plus" onClick={createDraft}>Create draft v{nextDraftVersion(t)}</Button>
            <span className="ph-dim" style={{ fontSize: 12, lineHeight: 1.45 }}>
              Copies v{v.version}. {usage.episodesByVersion[v.version] ? `The ${usage.episodesByVersion[v.version]} episodes collected on v${v.version} keep their snapshot.` : `No episodes have been collected on v${v.version} yet.`}
            </span>
          </div>
        );
      }
      return <Note tone="neutral" icon="lock">Read only. {editors} can create a draft version.</Note>;
    }
    if (v.status === "draft") {
      if (canEdit) {
        return (
          <div className="ph-wrap">
            <Button variant="primary" icon="send" disabled={!v.blocks.length} onClick={submit} title={v.blocks.length ? undefined : "Add at least one block first"}>Submit v{v.version} for publication</Button>
            <span className="ph-dim" style={{ fontSize: 12, lineHeight: 1.45 }}>Approval by {approvers}. Until then new bookings keep using v{t.currentVersion}.</span>
          </div>
        );
      }
      return <Note tone="neutral" icon="lock">Read only. Draft v{v.version} can be edited by {editors}.</Note>;
    }
    if (v.status === "pending_approval") {
      if (canPublish && approval) {
        return (
          <div className="ph-wrap">
            <Button variant="primary" icon="check" onClick={() => setConfirm(true)}>Approve publication</Button>
            <Button icon="refresh" onClick={() => decide(false)}>Return to draft</Button>
            <span className="ph-dim" style={{ fontSize: 12 }}>You are the clinical approver for {approval.id}.</span>
          </div>
        );
      }
      return <Note tone="warn" icon="clock">v{v.version} is awaiting publication approval by {approvers}. It cannot be edited unless it is returned to draft.</Note>;
    }
    return <Note tone="neutral" icon="layers">Retired version, kept for history. {usage.episodesByVersion[v.version] || 0} episodes were collected on it and keep this snapshot.</Note>;
  })();

  return (
    <div className="ph-page prg-page">
      <PageHeader
        title="Forms & Templates"
        sub="Compose screening forms from reusable, versioned blocks. Add or reorder blocks in a draft, preview conditional questions, then submit the new version for clinical approval."
        actions={<DemoTag>Sample clinical content</DemoTag>}
      />
      <div className="prg-cq">
        <div className="prg-permline" data-can={roleLine.can ? "1" : "0"}>
          <Icon name={roleLine.can ? "shield" : "lock"} size={13} />
          <span>{roleLine.text}</span>
        </div>
        <div className="prg-tpls" role="group" aria-label="Templates">
          {templates.map((x) => {
            const d = draftOf(x), pd = pendingOf(x);
            const extra = x.kind === "service" ? "scheduling only" : d ? `draft v${d.version}` : pd ? `v${pd.version} awaiting approval` : "";
            return (
              <button key={x.id} type="button" className="prg-tpl" aria-pressed={x.id === t.id} onClick={() => selectTemplate(x.id)}>
                <Icon name={x.kind === "service" ? "calendar" : "layers"} size={13} />
                <span>{x.name}</span>
                <span className="prg-tpl-v">v{x.currentVersion}{extra ? `, ${extra}` : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="prg-composer">
          <div className="prg-pane-left">
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
              <div className="ph-row-flex" style={{ marginTop: 12, gap: 10, flexWrap: "wrap" }}>
                <Segmented<string> label="Version" value={v.version} onChange={selectVersion}
                  options={sortVersionsDesc(t.versions).map((x) => ({ id: x.version, label: `v${x.version} ${VERSION_STATUS[x.status].label.toLowerCase()}` }))} />
                <span className="ph-grow" />
                {screening ? (
                  <Segmented<"compose" | "preview"> label="View" value={mode} onChange={setMode}
                    options={[{ id: "compose", label: "Compose" }, { id: "preview", label: "Preview form" }]} />
                ) : null}
              </div>
              {actions ? <div style={{ marginTop: 12 }}>{actions}</div> : null}
              <div style={{ marginTop: 14 }}>
                {!screening ? <SchedulingPreview s={s} template={t} />
                  : mode === "compose"
                    ? <SectionList s={s} template={t} version={v} selected={blockId} editable={editable} onSelect={selectBlock} onMove={move} onMoveTo={moveTo} onToggle={toggle} onRemove={remove} onAdd={add} />
                    : <FormPreview key={`${t.id}@${v.version}`} version={v} blocks={s.forms.blocks} />}
              </div>
            </Card>
          </div>
          <div className="prg-pane-right ph-stack">
            <BlockPanel s={s} block={block} refVersion={refVersion} />
            <VersionPanel s={s} template={t} selected={v.version} onSelect={selectVersion} />
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
