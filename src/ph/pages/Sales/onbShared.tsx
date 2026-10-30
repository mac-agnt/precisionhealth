/* Shared pieces for Onboarding and Retention: the branded Precision Health email preview, the
   agreement document, print and download helpers, and the step tracker. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { BRAND, ONB_STEP_LABEL, fmtDateTime, onbStepDone, onbStepsFor } from "../../model";
import type { OnbStepId, Onboarding } from "../../model";
import { Icon } from "../../ui";
import type { OnbRenderedDoc } from "./onbSelect";
import { longDate } from "./onbSelect";
import "./onb.css";

/* ---------------------------------------------------------------- email */

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /((?:https?:\/\/)?(?:www\.)?precisionhealth\.ie\/[^\s]*)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={i++} className="ob-mail-link">{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A Precision Health branded email, as the client would see it. Always light, like a real inbox. */
export function BrandedEmail({ to, subject, body, sentAt, compact }: { to?: string; subject: string; body: string; sentAt?: string | null; compact?: boolean }) {
  const paras = body.split(/\n{2,}/);
  return (
    <div className={"ob-mail" + (compact ? " compact" : "")}>
      {to !== undefined ? (
        <div className="ob-mail-meta">
          <div><span>To</span><b>{to}</b></div>
          <div><span>Subject</span><b>{subject}</b></div>
          {sentAt ? <div><span>Sent</span><b>{fmtDateTime(sentAt)} <em>Simulated</em></b></div> : null}
        </div>
      ) : null}
      <div className="ob-mail-card">
        <div className="ob-mail-head">
          <span className="ob-mail-logo"><Icon name="heart" size={15} /></span>
          <div><div className="ob-mail-brand">{BRAND.org}</div><div className="ob-mail-tag">Workplace health and wellbeing</div></div>
        </div>
        <div className="ob-mail-body">
          {to === undefined ? <div className="ob-mail-subject">{subject}</div> : null}
          {paras.map((p, i) => <p key={i}>{p.split("\n").map((ln, j) => <span key={j}>{j ? <br /> : null}{linkify(ln)}</span>)}</p>)}
        </div>
        <div className="ob-mail-foot">
          <div><b>{BRAND.legalName}</b>, trading as {BRAND.org}</div>
          <div>{BRAND.address}</div>
          <div>{BRAND.phone} · {BRAND.email} · precisionhealth.ie</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- agreement document */

export function AgreementDoc({ doc, o, signedAt }: { doc: OnbRenderedDoc; o: Onboarding; signedAt: string | null }) {
  return (
    <article className="ob-doc">
      <header className="ob-doc-head">
        <div className="ob-doc-brand"><span className="ob-mail-logo"><Icon name="heart" size={14} /></span>{BRAND.org}</div>
        <div className="ob-doc-ref">{o.id} · Version {doc.version}</div>
      </header>
      <h2>{doc.title}</h2>
      <div className="ob-doc-sub">{doc.clientName}</div>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h3>{s.heading}</h3>
          {s.paragraphs.map((p, i) => <p key={i}>{p.map((x, j) => ("t" in x ? <span key={j}>{x.t}</span> : !x.v ? null : <mark key={j} className="ob-merge" title="Filled in from the onboarding form">{x.v}</mark>))}</p>)}
        </section>
      ))}
      <div className="ob-sigs">
        <div><strong>For {BRAND.org}</strong><span>Stephen Kelly, Sales and Operations Director</span><span>{signedAt ? `Signed ${longDate(signedAt)}` : "Signature"}</span></div>
        <div><strong>For {doc.clientName}</strong><span>{o.details.main.name}</span><span>{signedAt ? `Signed ${longDate(signedAt)}` : "Signature"}</span></div>
      </div>
      <p className="ob-doc-note">Sample wording for the demo. Highlighted text is filled in from the onboarding form.</p>
    </article>
  );
}

/** The agreement as a standalone HTML file, for download. */
export function agreementHtml(doc: OnbRenderedDoc, o: Onboarding, signedAt: string | null): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = doc.sections.map((s) => `<h3>${esc(s.heading)}</h3>${s.paragraphs.map((p) => `<p>${p.map((x) => ("t" in x ? esc(x.t) : `<b>${esc(x.v)}</b>`)).join("")}</p>`).join("")}`).join("");
  const sig = (who: string, name: string) => `<div class="sig"><strong>${esc(who)}</strong><br>${esc(name)}<br>${signedAt ? `Signed ${esc(longDate(signedAt))}` : "Signature: ____________________"}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.title)}, ${esc(doc.clientName)}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#1d2b2a;line-height:1.6;padding:0 20px}
.top{display:flex;justify-content:space-between;border-bottom:3px solid #2f716a;padding-bottom:10px;margin-bottom:24px;font-family:Arial,sans-serif}
.top b{color:#2f716a;font-size:18px}h2{margin:0;font-size:24px}h3{font-size:15px;margin:22px 0 6px;font-family:Arial,sans-serif}
.sub{color:#5b6b69;margin-bottom:10px}.sigs{display:flex;gap:30px;margin-top:36px}.sig{flex:1;border-top:1px solid #999;padding-top:8px;font-size:13px}
.note{color:#777;font-size:11px;margin-top:30px}</style></head><body>
<div class="top"><b>${esc(BRAND.org)}</b><span>${esc(o.id)} · Version ${doc.version}</span></div>
<h2>${esc(doc.title)}</h2><div class="sub">${esc(doc.clientName)}</div>${body}
<div class="sigs">${sig(`For ${BRAND.org}`, "Stephen Kelly, Sales and Operations Director")}${sig(`For ${doc.clientName}`, o.details.main.name)}</div>
<p class="note">Sample wording for the Pulse demo. Generated by Pulse.</p></body></html>`;
}

export function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print only the given content. */
export function usePrint(): [(content: ReactNode) => void, ReactNode] {
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    if (!content) return;
    document.body.classList.add("ob-printing");
    const done = () => { document.body.classList.remove("ob-printing"); setContent(null); };
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 80);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("ob-printing"); };
  }, [content]);
  const node = content ? createPortal(<div className="ob-print-root">{content}</div>, document.body) : null;
  return [setContent, node];
}

/* ---------------------------------------------------------------- step tracker */

export function StepTracker({ o, active, onPick, small }: { o: Onboarding; active?: OnbStepId; onPick?: (s: OnbStepId) => void; small?: boolean }) {
  const steps = onbStepsFor(o.kind);
  const done = onbStepDone(o);
  return (
    <ol className={"ob-track" + (small ? " small" : "")} aria-label="Onboarding steps">
      {steps.map((s, i) => {
        const cls = ["ob-track-step", done[s] ? "done" : "", active === s ? "active" : ""].join(" ");
        const inner = (
          <>
            <span className="ob-track-dot">{done[s] ? <Icon name="check" size={small ? 10 : 12} stroke={2.4} /> : i + 1}</span>
            {small ? null : <span className="ob-track-label">{ONB_STEP_LABEL[s]}</span>}
          </>
        );
        return (
          <li key={s} className={cls} title={ONB_STEP_LABEL[s]}>
            {onPick ? <button type="button" onClick={() => onPick(s)} aria-current={active === s ? "step" : undefined}>{inner}</button> : <span className="ob-track-static">{inner}</span>}
          </li>
        );
      })}
    </ol>
  );
}
