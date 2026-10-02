/* Command palette (Cmd or Ctrl K). Search is role-filtered through globalSearch: a restricted
   role never gets a clinical episode, result or follow-up back, and ontology links follow the
   same rule. Anything typed can also be sent to Pulse chat as a question. */
import { useEffect, useMemo, useRef, useState } from "react";
import { PAGES, globalSearch, suggestedPrompts } from "../../ph/model";
import type { NavTarget } from "../../ph/model";
import { usePersona, usePhState } from "../../ph/store";
import { Icon } from "../../ph/ui";
import type { GlyphName } from "../../ph/ui";

type Props = { v: { closePalette?: () => void; phPaletteGo?: (t: NavTarget) => void; phPaletteAsk?: (q: string) => void } };

const PAGE_ICON: Record<string, GlyphName> = {
  Home: "home", Agents: "spark", Dashboard: "chart", Programmes: "layers", Clinics: "calendar", Participants: "users", Results: "flask",
  Reporting: "file", Work: "list", Records: "file", Activity: "clock", Settings: "filter",
};

interface Item { key: string; group: string; title: string; subtitle?: string; icon: GlyphName; run: () => void }

export default function CommandPalette({ v }: Props) {
  const state = usePhState();
  const persona = usePersona();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const go = (t: NavTarget) => { if (v.phPaletteGo) v.phPaletteGo(t); };
  const ask = (text: string) => { if (v.phPaletteAsk) v.phPaletteAsk(text); };

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    const text = q.trim();
    if (text) {
      globalSearch(state, text, 24).forEach((h) => out.push({ key: h.id + h.group, group: h.group, title: h.title, subtitle: h.subtitle, icon: h.group === "Pages" ? "arrow" : h.group === "Participants" ? "user" : h.group === "Files" ? "file" : "search", run: () => go(h.target) }));
      out.push({ key: "ask-q", group: "Ask Pulse", title: `Ask Pulse: ${text}`, subtitle: "Sends this to the chat", icon: "spark", run: () => ask(text) });
    } else {
      suggestedPrompts(state).forEach((p, i) => out.push({ key: "p" + i, group: "Ask Pulse", title: p, icon: "spark", run: () => ask(p) }));
      PAGES.forEach((pg) => out.push({ key: "pg" + pg.id, group: "Jump to", title: pg.label, subtitle: pg.tabs.length ? pg.tabs.map((t) => t.label).join(", ") : pg.hint, icon: PAGE_ICON[pg.id] || "arrow", run: () => go({ page: pg.id }) }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, q]);

  useEffect(() => { setSel(0); }, [q]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && items[sel]) { e.preventDefault(); items[sel].run(); }
  };
  let lastGroup = "";
  return (
    <>
      <div className="ph-scrim" style={{ zIndex: 60 }} onClick={v.closePalette} />
      <div role="dialog" aria-modal="true" aria-label="Search and jump" style={{ position: "fixed", zIndex: 61, left: "50%", top: "11vh", transform: "translateX(-50%)", width: "min(680px, calc(100vw - 24px))", maxHeight: "74vh", display: "flex", flexDirection: "column", background: "var(--overlay)", border: "1px solid var(--border-strong)", borderRadius: "var(--card-r,18px)", backdropFilter: "blur(30px)", boxShadow: "0 40px 100px rgba(0,0,0,.55)", animation: "paletteIn .3s var(--ease) both", overflow: "hidden" }}>
        <div className="ph-row-flex" style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <Icon name="search" size={16} style={{ color: "var(--faint)" }} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search people, clinics, programmes, batches, files, or ask Pulse" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="ph-palette-list"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "none", fontSize: 15, color: "var(--ink)" }} />
          <span className="ph-demo-tag">{persona.roleLabel}</span>
        </div>
        <div id="ph-palette-list" role="listbox" style={{ overflowY: "auto", padding: "6px 8px 10px" }}>
          {items.length === 0 ? <div className="ph-dim" style={{ padding: "26px 12px", textAlign: "center", fontSize: 13 }}>Nothing matched. Your role only sees what it is allowed to see.</div> : null}
          {items.map((it, i) => {
            const head = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {head ? <div className="ph-eyebrow" style={{ padding: "12px 12px 5px" }}>{it.group}</div> : null}
                <button type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}
                  style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "9px 12px", border: 0, borderRadius: 11, cursor: "pointer", font: "inherit", color: "inherit", background: i === sel ? "var(--surface-2)" : "none", boxShadow: i === sel ? "inset 2px 0 0 var(--accent)" : "none" }}>
                  <span style={{ width: 26, height: 26, flex: "none", borderRadius: 9, background: i === sel ? "var(--accent-soft)" : "var(--track)", color: i === sel ? "var(--accent)" : "var(--dim)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={it.icon} size={14} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ph-trunc" style={{ display: "block", fontSize: 13.5, color: "var(--ink)" }}>{it.title}</span>
                    {it.subtitle ? <span className="ph-trunc ph-faint" style={{ display: "block", fontSize: 11.5, marginTop: 1 }}>{it.subtitle}</span> : null}
                  </span>
                  {i === sel ? <span className="ph-faint" style={{ fontSize: 10.5 }}>Enter</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
