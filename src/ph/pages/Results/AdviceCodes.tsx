/* Advice codes in the NEW ADVICE box: the clinicians' cheat codes (RECORDING.md section 5).
   AdviceBox is the textarea: typing an approved code in capitals (CHOL-HI) followed by Space or
   Tab expands it to the approved wording, and "/" opens a short list of matching codes (arrow keys,
   Enter or Tab to insert, Escape to close). SuggestedCodes shows the approved snippets whose
   conditions match the episode, one click to insert. SourceLine shows where the advice came from
   and which code and version each passage traces back to. */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ADVICE_SOURCE_LABEL, approvedVersion, fmtNumericDate, findSnippet, sortedSnippets } from "../../model";
import type { AdviceLibraryState, AdviceSnippet, AdviceSourceKind, FlagReason, SnippetTrace, SnippetUse } from "../../model";
import { Button, Icon, Pill, Select } from "../../ui";
import type { Tone } from "../../ui";
import type { SnippetMatch } from "./libraryModel";
import "./library.css";

type Via = SnippetUse["via"];

/* ---- slash search ---- */
interface SlashState { start: number; query: string }
function detectSlash(text: string, caret: number): SlashState | null {
  const m = /(^|\s)\/([A-Za-z0-9-]{0,24})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}
const norm = (x: string) => x.toLowerCase().replace(/-/g, "");
/** Approved snippets for a slash query: code prefix first, then code or title containing the words. */
export function slashItems(lib: AdviceLibraryState, query: string): AdviceSnippet[] {
  const q = norm(query);
  const scored: Array<{ s: AdviceSnippet; score: number }> = [];
  for (const s of sortedSnippets(lib)) {
    if (!approvedVersion(s)) continue;
    const code = norm(s.code);
    const score = !q || code.startsWith(q) ? 0 : code.includes(q) ? 1 : s.title.toLowerCase().includes(query.toLowerCase()) ? 2 : -1;
    if (score >= 0) scored.push({ s, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.s.order - b.s.order).slice(0, 8).map((x) => x.s);
}

/** Why a typed code did not expand. */
export function notInsertableText(s: AdviceSnippet): string {
  return s.retired ? `${s.code} was retired on ${fmtNumericDate(s.retired.at)}: ${s.retired.reason} Not expanded.` : `${s.code} is a draft and has not been approved yet, so it was not expanded.`;
}

export function AdviceBox({ value, onChange, lib, disabled, className, placeholder, ariaLabel, rows = 4, onBlur, onInsert, onNote }: {
  value: string;
  onChange: (next: string) => void;
  lib: AdviceLibraryState;
  disabled: boolean;
  className: string;
  placeholder: string;
  ariaLabel: string;
  rows?: number;
  onBlur: () => void;
  /** Called after an approved snippet replaced a code or slash search in the text. */
  onInsert: (code: string, via: Via) => void;
  onNote: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const menuId = useId();
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  const slash = useMemo(() => detectSlash(value, caret), [value, caret]);
  const open = !!slash && !disabled && focused && dismissed !== slash.start;
  const items = useMemo(() => (open && slash ? slashItems(lib, slash.query) : []), [open, slash, lib]);
  useEffect(() => { setActive(0); }, [slash?.start, slash?.query]);
  useLayoutEffect(() => {
    const p = pendingCaret.current;
    if (p === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.setSelectionRange(p, p);
    setCaret(p);
  });

  const pick = (s: AdviceSnippet, start: number, end: number, via: Via, trailing: string) => {
    const ver = approvedVersion(s);
    if (!ver) { onNote(notInsertableText(s)); return; }
    const next = value.slice(0, start) + ver.text + trailing + value.slice(end);
    pendingCaret.current = start + ver.text.length + trailing.length;
    onChange(next);
    onInsert(s.code, via);
  };
  const sync = () => { const el = ref.current; if (el) setCaret(el.selectionStart ?? 0); };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const el = e.currentTarget;
    const pos = el.selectionStart ?? 0;
    if (pos !== el.selectionEnd) return;
    if (open && slash) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && items.length) { e.preventDefault(); pick(items[Math.min(active, items.length - 1)], slash.start, pos, "slash", ""); return; }
      if (e.key === "Escape") { e.preventDefault(); setDismissed(slash.start); return; }
      if (e.key === " " && items.length === 1) { e.preventDefault(); pick(items[0], slash.start, pos, "slash", " "); return; }
    }
    if (e.key === " " || e.key === "Tab") {
      const m = /(^|\s)([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)$/.exec(value.slice(0, pos));
      const s = m ? findSnippet(lib, m[2]) : null;
      if (!m || !s || s.code !== m[2]) return;
      if (!approvedVersion(s)) { onNote(notInsertableText(s)); return; }
      e.preventDefault();
      pick(s, pos - m[2].length, pos, "code", e.key === " " ? " " : "");
    }
  };

  return (
    <>
      <textarea ref={ref} className={className} rows={rows} value={value} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel}
        aria-autocomplete={disabled ? undefined : "list"} aria-controls={open ? menuId : undefined}
        aria-activedescendant={open && items.length ? `${menuId}-${Math.min(active, items.length - 1)}` : undefined}
        onChange={(e) => { setCaret(e.target.selectionStart ?? e.target.value.length); onChange(e.target.value); }}
        onKeyDown={onKeyDown} onKeyUp={sync} onClick={sync} onSelect={sync}
        onFocus={() => { setFocused(true); sync(); }} onBlur={() => { setFocused(false); onBlur(); }} />
      {open && slash ? (
        <div className="phl-menu" id={menuId} role="listbox" aria-label="Approved advice codes">
          {items.length ? items.map((s, i) => {
            const ver = approvedVersion(s)!;
            return (
              <div key={s.code} id={`${menuId}-${i}`} role="option" aria-selected={i === Math.min(active, items.length - 1)} className="phl-opt"
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)}
                onClick={() => { const pos = ref.current?.selectionStart ?? caret; pick(s, slash.start, pos, "slash", ""); }}>
                <span className="phl-code">{s.code}</span>
                <span className="phl-opt-title">{s.title}</span>
                <span className="phl-opt-ver">v{ver.version}</span>
              </div>
            );
          }) : <div className="phl-opt is-empty">No approved code matches /{slash.query}. Escape closes this list.</div>}
          <div className="phl-menu-foot">Up and down to choose, Enter or Tab to insert, Escape to close.</div>
        </div>
      ) : null}
    </>
  );
}

/* ---- suggested codes ---- */
export function SuggestedCodes({ matches, uncovered, text, onPick }: { matches: SnippetMatch[]; uncovered: FlagReason[]; text: string; onPick: (code: string) => void }) {
  return (
    <div className="phl-suggest" aria-label="Suggested codes">
      <span className="phl-suggest-title"><Icon name="spark" size={12} /> Suggested codes</span>
      {matches.length ? matches.map((m) => {
        const inserted = text.includes(m.version.text);
        const tip = `${m.snippet.title}. Matches: ${m.reason}. v${m.version.version}, approved ${m.version.approvedAt ? fmtNumericDate(m.version.approvedAt) : ""}.${inserted ? " Already in the advice." : " Click to insert."}`;
        return (
          <button key={m.snippet.code} type="button" className="phl-chip" data-on={inserted || undefined} disabled={inserted} title={tip} aria-label={tip} onClick={() => onPick(m.snippet.code)}>
            <Icon name={inserted ? "check" : "plus"} size={11} stroke={2.2} />
            <span className="phl-code">{m.snippet.code}</span>
          </button>
        );
      }) : <span className="phr-sub">No approved snippet matches this episode.</span>}
      <span className="phl-suggest-hint">
        {uncovered.length ? `No snippet for ${uncovered.map((f) => f.label).join(", ")}: write that part yourself. ` : ""}
        Type a code in capitals then Space or Tab, or / to search.
      </span>
    </div>
  );
}

/* ---- source and traceability ---- */
const SOURCE_TONE: Record<AdviceSourceKind, Tone> = { approved_snippets: "ok", mixed: "info", manual: "neutral", empty: "neutral" };
const SOURCE_ICON = { approved_snippets: "shield", mixed: "layers", manual: "edit", empty: "dot" } as const;
export function SourcePill({ source }: { source: AdviceSourceKind }) {
  return <Pill tone={SOURCE_TONE[source]} icon={SOURCE_ICON[source]} title="Where this advice came from">{ADVICE_SOURCE_LABEL[source]}</Pill>;
}
/** The codes and versions found in the advice, plus codes that were inserted and then edited. */
export function TraceList({ items, edited }: { items: SnippetTrace[]; edited: Array<{ code: string; version: number }> }) {
  if (!items.length && !edited.length) return null;
  return (
    <div className="phl-trace">
      <span className="phl-trace-title">Traceable to</span>
      {items.map((t) => (
        <span key={t.code + t.version} className="phl-tag" title={`${t.title}, approved wording v${t.version}${t.current ? ", current version" : ", an earlier approved version"}`}>
          <Icon name="check" size={10} stroke={2.4} /><span className="phl-code">{t.code}</span> v{t.version}{t.current ? "" : ", earlier version"}
        </span>
      ))}
      {edited.map((t) => (
        <span key={"e" + t.code + t.version} className="phl-tag is-edited" title={`${t.code} v${t.version} was inserted and then edited, so that passage now counts as manual text.`}>
          <Icon name="edit" size={10} stroke={2.2} /><span className="phl-code">{t.code}</span> v{t.version}, edited
        </span>
      ))}
    </div>
  );
}

/* ---- insert from the library ---- */
export function LibrarySelect({ lib, onPick }: { lib: AdviceLibraryState; onPick: (code: string) => void }) {
  const groups = new Map<string, AdviceSnippet[]>();
  for (const s of sortedSnippets(lib)) {
    if (!approvedVersion(s)) continue;
    const g = groups.get(s.group);
    if (g) g.push(s); else groups.set(s.group, [s]);
  }
  return (
    <Select value="" aria-label="Insert approved wording from the advice library" onChange={(e) => { if (e.target.value) onPick(e.target.value); }}>
      <option value="">Insert from the advice library</option>
      {Array.from(groups.entries()).map(([g, list]) => (
        <optgroup key={g} label={g}>
          {list.map((s) => <option key={s.code} value={s.code}>{s.code}: {s.title}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

/** Inline confirmation before a prepared draft replaces advice already written. */
export function ConfirmReplace({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="phl-confirm" role="group" aria-label="Replace advice with a prepared draft">
      <Icon name="alert" size={14} style={{ color: "var(--warn)" }} />
      <span className="ph-grow">This replaces the advice already written with a draft prepared from approved snippets. You review it before release either way.</span>
      <Button size="sm" variant="primary" onClick={onConfirm}>Replace with prepared draft</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Keep my advice</Button>
    </div>
  );
}
