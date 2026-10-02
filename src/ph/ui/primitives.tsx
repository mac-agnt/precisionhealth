/* Shared building blocks for the PH pages, in the Pulse glass language. Status is always
   text plus an icon plus colour, never colour alone. */
import { useId } from "react";
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { linkFor } from "../model";
import type { EntityKind } from "../model";
import { useNav } from "../nav-context";
import { Icon } from "./icons";
import type { GlyphName } from "./icons";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "brand";
export const TONE: Record<Tone, { fg: string; bg: string; icon: GlyphName }> = {
  ok: { fg: "var(--ok)", bg: "var(--ok-soft)", icon: "check" },
  warn: { fg: "var(--warn)", bg: "var(--warn-soft)", icon: "alert" },
  bad: { fg: "var(--bad)", bg: "var(--bad-soft)", icon: "x" },
  info: { fg: "var(--accent)", bg: "var(--accent-soft)", icon: "info" },
  brand: { fg: "var(--accent)", bg: "var(--accent-soft)", icon: "dot" },
  neutral: { fg: "var(--dim)", bg: "var(--track)", icon: "dot" },
};

/** A status pill: icon, text and colour together. */
export function Pill({ tone = "neutral", children, icon, title, style }: { tone?: Tone; children: ReactNode; icon?: GlyphName | null; title?: string; style?: CSSProperties }) {
  const t = TONE[tone];
  const g = icon === undefined ? t.icon : icon;
  return (
    <span className="ph-pill" title={title} style={{ background: t.bg, color: t.fg, ...style }}>
      {g ? <Icon name={g} size={11} stroke={2} /> : null}
      <span className="ph-trunc">{children}</span>
    </span>
  );
}

/** Marks fictional or simulated content at the right level. */
export function DemoTag({ children = "Simulated", title }: { children?: ReactNode; title?: string }) {
  return <span className="ph-demo-tag" title={title || "Demo content. Nothing here is real or sent."}>{children}</span>;
}

export function Button({ variant = "secondary", size, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm"; icon?: GlyphName }) {
  const cls = ["ph-btn", variant === "primary" ? "ph-btn-primary" : variant === "ghost" ? "ph-btn-ghost" : variant === "danger" ? "ph-btn-danger" : "", size === "sm" ? "ph-btn-sm" : "", rest.className || ""].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={cls}>
      {icon ? <Icon name={icon} size={size === "sm" ? 13 : 14} /> : null}
      {children}
    </button>
  );
}

export function Card({ children, style, flat, pad = true, className, onClick }: { children: ReactNode; style?: CSSProperties; flat?: boolean; pad?: boolean | "sm"; className?: string; onClick?: () => void }) {
  return (
    <section className={[flat ? "ph-card-flat" : "ph-card", pad === "sm" ? "ph-pad-sm" : pad ? "ph-pad" : "", className || ""].join(" ")} style={style} onClick={onClick}>
      {children}
    </section>
  );
}

export function CardHeader({ title, sub, right, eyebrow }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="ph-row-flex" style={{ alignItems: "flex-start", marginBottom: 12 }}>
      <div className="ph-grow">
        {eyebrow ? <div className="ph-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div> : null}
        <h3 className="ph-h2">{title}</h3>
        {sub ? <div className="ph-dim" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{sub}</div> : null}
      </div>
      {right ? <div className="ph-wrap" style={{ flex: "none", justifyContent: "flex-end" }}>{right}</div> : null}
    </div>
  );
}

/** Page title block with the demo label and page actions. */
export function PageHeader({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="ph-row-flex" style={{ alignItems: "flex-end", padding: "20px 0 16px", flexWrap: "wrap" }}>
      <div className="ph-grow" style={{ minWidth: 220 }}>
        {eyebrow ? <div className="ph-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div> : null}
        <h1 className="ph-h1">{title}</h1>
        {sub ? <div className="ph-dim" style={{ fontSize: 13, marginTop: 5, maxWidth: 760, lineHeight: 1.5, textWrap: "pretty" as never }}>{sub}</div> : null}
      </div>
      {actions ? <div className="ph-wrap" style={{ justifyContent: "flex-end" }}>{actions}</div> : null}
    </div>
  );
}

/** One measure. Always give a denominator or sub line so a rate is never unexplained. */
export function Kpi({ label, value, sub, tone, onClick, hint, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void; hint?: string; icon?: GlyphName }) {
  const t = tone ? TONE[tone] : null;
  const inner = (
    <>
      <div className="ph-row-flex" style={{ gap: 7 }}>
        <span className="ph-eyebrow ph-trunc ph-grow">{label}</span>
        {icon ? <Icon name={icon} size={13} style={{ color: t ? t.fg : "var(--faint)" }} /> : null}
        {t && !icon ? <Icon name={t.icon} size={12} stroke={2} style={{ color: t.fg }} /> : null}
      </div>
      <div className="ph-num" style={{ fontSize: 28, fontWeight: "var(--fig-weight, 600)" as never, letterSpacing: "-1px", lineHeight: 1.05, marginTop: 8, color: t && tone !== "info" && tone !== "brand" && tone !== "neutral" ? t.fg : "var(--ink)" }}>{value}</div>
      {sub ? <div className="ph-dim" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.4 }}>{sub}</div> : null}
    </>
  );
  const style: CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "14px 16px", cursor: onClick ? "pointer" : "default", font: "inherit", color: "inherit" };
  if (onClick) {
    return (
      <button type="button" className="ph-card ph-row" onClick={onClick} title={hint} style={style}>
        {inner}
      </button>
    );
  }
  return <div className="ph-card" title={hint} style={style}>{inner}</div>;
}
export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="ph-kpis">{children}</div>;
}

/* ---- form fields ---- */
export function Field({ label, error, help, children, htmlFor }: { label: ReactNode; error?: string | null; help?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label className="ph-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="ph-err" role="alert">{error}</div> : help ? <div className="ph-help">{help}</div> : null}
    </div>
  );
}
export function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input {...rest} className={["ph-input", className || ""].join(" ")} aria-invalid={invalid || undefined} style={{ width: "100%", ...rest.style }} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select {...rest} className={["ph-input", className || ""].join(" ")} style={{ width: "100%", ...rest.style }} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <textarea {...rest} className={["ph-input", className || ""].join(" ")} aria-invalid={invalid || undefined} style={{ width: "100%", ...rest.style }} />;
}
export function SearchBox({ value, onChange, placeholder = "Search", width = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string }) {
  return (
    <div className="ph-row-flex" style={{ position: "relative", width, maxWidth: "100%" }}>
      <Icon name="search" size={14} style={{ position: "absolute", left: 11, color: "var(--faint)", pointerEvents: "none" }} />
      <input className="ph-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ width: "100%", paddingLeft: 32 }} />
    </div>
  );
}
export function Checkbox({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; hint?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 9, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, fontSize: 12.5, color: "var(--body)", lineHeight: 1.4 }}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, accentColor: "var(--accent)", width: 15, height: 15, flex: "none" }} />
      <span>{label}{hint ? <span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{hint}</span> : null}</span>
    </label>
  );
}
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 40, height: 22, borderRadius: 999, border: 0, padding: 0, position: "relative", cursor: disabled ? "not-allowed" : "pointer", background: on ? "var(--accent-fill, var(--accent))" : "var(--track)", transition: "background .2s var(--ease)", flex: "none", opacity: disabled ? 0.5 : 1 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: on ? "var(--on-accent)" : "var(--dim)", transition: "left .2s var(--ease)" }} />
    </button>
  );
}

/** Local filter tabs. value and ids are strings. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: ReactNode; count?: number }>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="ph-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className="ph-tab" onClick={() => onChange(o.id)}>
          {o.label}{o.count !== undefined ? <span className="ph-num" style={{ marginLeft: 6, opacity: 0.7 }}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
export function Chip({ on, onClick, children, count }: { on?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" className={"ph-chip" + (on ? " on" : "")} aria-pressed={!!on} onClick={onClick}>
      {children}{count !== undefined ? <span className="ph-num" style={{ opacity: 0.7 }}>{count}</span> : null}
    </button>
  );
}

export function ProgressBar({ value, max, tone = "brand", label }: { value: number; max: number; tone?: Tone; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="ph-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="ph-fill" style={{ width: pct + "%", background: tone === "brand" || tone === "info" ? "var(--accent)" : TONE[tone].fg }} />
    </div>
  );
}

export function EmptyState({ title, children, action, icon = "info" }: { title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: GlyphName }) {
  return (
    <div style={{ padding: "34px 18px", textAlign: "center" }}>
      <div style={{ width: 38, height: 38, margin: "0 auto 12px", borderRadius: 12, background: "var(--track)", color: "var(--dim)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={17} /></div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
      {children ? <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 6, maxWidth: 440, marginInline: "auto", lineHeight: 1.5 }}>{children}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

/** Shown when the previewed role cannot see something. Explains why and what is still visible. */
export function RestrictedNotice({ title = "Restricted for this role", children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ph-card-flat" style={{ padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 32, height: 32, flex: "none", borderRadius: 10, background: "var(--track)", color: "var(--dim)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="lock" size={15} /></div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
        <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}

export function Checklist({ items }: { items: Array<{ label: ReactNode; done: boolean; note?: ReactNode; manual?: boolean; onToggle?: () => void }> }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} className="ph-row-flex" style={{ alignItems: "flex-start", gap: 9, fontSize: 12.5, lineHeight: 1.45 }}>
          {it.onToggle ? (
            <button type="button" onClick={it.onToggle} aria-pressed={it.done} aria-label={String(typeof it.label === "string" ? it.label : "Toggle item")}
              style={{ width: 18, height: 18, flex: "none", marginTop: 1, borderRadius: 6, border: "1px solid " + (it.done ? "var(--accent)" : "var(--border-strong)"), background: it.done ? "var(--accent-fill, var(--accent))" : "var(--surface-2)", color: "var(--on-accent)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
              {it.done ? <Icon name="check" size={12} stroke={2.4} /> : null}
            </button>
          ) : (
            <span style={{ width: 18, height: 18, flex: "none", marginTop: 1, borderRadius: 6, background: it.done ? "var(--ok-soft)" : "var(--track)", color: it.done ? "var(--ok)" : "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label={it.done ? "Done" : "Not done"}>
              <Icon name={it.done ? "check" : "clock"} size={12} stroke={2.2} />
            </span>
          )}
          <span style={{ color: it.done ? "var(--body)" : "var(--ink)" }}>{it.label}{it.note ? <span className="ph-faint" style={{ display: "block", fontSize: 11.5 }}>{it.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

export function Avatar({ name, tint, size = 28 }: { name: string; tint?: string; size?: number }) {
  const initials = name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flex: "none", borderRadius: Math.round(size * 0.34), background: tint || "var(--accent-soft)", color: tint ? "#0b1412" : "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 600 }}>{initials}</span>
  );
}

/** A link to any entity. Navigation is role-checked by the destination page. */
export function EntityLink({ kind, id, children, params }: { kind: EntityKind; id: string; children?: ReactNode; params?: Record<string, string> }) {
  const nav = useNav();
  const t = linkFor(kind, id);
  return (
    <button type="button" className="ph-link" onClick={(e) => { e.stopPropagation(); nav.go(params ? { ...t, params: { ...(t.params || {}), ...params } } : t); }}>
      {children ?? id}
    </button>
  );
}

/** Explains a number: what it counts and what it is out of. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} role="img" style={{ display: "inline-flex", color: "var(--faint)", cursor: "help", verticalAlign: "middle" }}>
      <Icon name="info" size={12} />
    </span>
  );
}

export function Section({ title, sub, right, children }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ minWidth: 0 }}>
      <CardHeader title={title} sub={sub} right={right} />
      {children}
    </section>
  );
}

/** Two thirds working area and one third context panel, stacking on narrow screens. */
export function Split({ main, side, even }: { main: ReactNode; side: ReactNode; even?: boolean }) {
  return (
    <div className={even ? "ph-split-even" : "ph-split"}>
      <div className="ph-stack">{main}</div>
      <div className="ph-stack">{side}</div>
    </div>
  );
}
