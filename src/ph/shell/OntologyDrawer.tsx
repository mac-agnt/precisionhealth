/* Relationship drawer for the Ontology page. Picking a cluster lists its entities, the
   relationships that touch them, example IDs and live counts. Every example opens a real
   seeded object. Clinical entities are filtered out for roles that cannot see them. */
import { ONTO_CLUSTER_DEFS, ontologyModel } from "../model";
import { useNav } from "../nav-context";
import { usePersona, usePhState } from "../store";
import { Icon } from "../ui";

export default function OntologyDrawer({ cluster, onClose }: { cluster: number; onClose: () => void }) {
  const state = usePhState();
  const nav = useNav();
  const p = usePersona();
  const model = ontologyModel(state);
  const def = ONTO_CLUSTER_DEFS[cluster];
  const clinicalCluster = [4, 5, 6, 7].includes(cluster);
  const ents = model.entities.filter((e) => e.cluster === cluster);
  const labels = new Set(ents.map((e) => e.label));
  const rels = model.relations.filter((r) => labels.has(r.from) || labels.has(r.to));
  const hidden = ents.length === 0;
  return (
    <aside role="dialog" aria-label={`${def.name} relationships`} style={{ position: "absolute", top: 12, right: 12, bottom: 12, width: "min(360px, calc(100% - 24px))", zIndex: 4, overflowY: "auto", padding: "16px 16px 18px", background: "var(--overlay)", border: "1px solid var(--border-strong)", borderRadius: "var(--card-r,18px)", backdropFilter: "blur(24px)", boxShadow: "0 24px 60px rgba(0,0,0,.45)", animation: "popIn .26s var(--ease) both" }}>
      <div className="ph-row-flex" style={{ marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: def.color, flex: "none" }} />
        <h3 className="ph-h2 ph-grow">{def.name}</h3>
        <button type="button" className="ph-btn ph-btn-ghost ph-btn-icon ph-btn-sm" onClick={onClose} aria-label="Close relationships"><Icon name="x" size={14} /></button>
      </div>
      {hidden ? (
        <div className="ph-dim" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          {clinicalCluster ? `This cluster holds clinical records. ${p.roleLabel} cannot see them, so no entity, relationship or example is listed.` : "No entities in this cluster."}
        </div>
      ) : (
        <>
          <div className="ph-eyebrow" style={{ marginBottom: 6 }}>Entities</div>
          {ents.map((e) => (
            <div key={e.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
              <div className="ph-row-flex"><span className="ph-grow" style={{ fontSize: 13, color: "var(--ink)" }}>{e.label}</span><span className="ph-num ph-dim" style={{ fontSize: 12 }}>{e.count.toLocaleString("en-IE")}</span></div>
              <div className="ph-faint" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{e.blurb}</div>
              {e.example ? <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => nav.go(e.example!.target)}>Example: {e.example.label}</button> : null}
            </div>
          ))}
          <div className="ph-eyebrow" style={{ margin: "16px 0 6px" }}>Relationships</div>
          {rels.map((r) => (
            <div key={r.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
              <div className="ph-row-flex" style={{ fontSize: 12.5 }}>
                <span className="ph-grow" style={{ color: "var(--ink)" }}>{r.from} <span className="ph-faint">{r.label}</span> {r.to}</span>
                <span className="ph-num ph-dim">{r.count.toLocaleString("en-IE")}</span>
              </div>
              {r.example ? <button type="button" className="ph-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => nav.go(r.example!.target)}>{r.example.text}</button> : null}
            </div>
          ))}
          <div className="ph-faint" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
            Counts come from the shared store. A restricted role never sees clinical entities, relationships or examples here or in search.
          </div>
        </>
      )}
    </aside>
  );
}
