/* Small shared pieces for the Health Screening screens. */
import type { ReactNode } from "react";
import { RR_BAND_META, RR_BAND_ORDER, boundsShort, fmtDate, fmtShortDateTime } from "../../model";
import type { PhState, RrBandKey, RrResult, RrRow, RrTest, RrVersion } from "../../model";
import { Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export function Swatch({ k }: { k: string }) { return <span className="scr-sw" data-k={k} aria-hidden="true" />; }

export function BandWord({ k, label }: { k: RrBandKey | RrResult["outcome"]; label: string }) {
  return <span className="scr-word"><Swatch k={k} />{label || RR_BAND_META[k].name}<span className="ph-faint" style={{ fontWeight: 400 }}>({RR_BAND_META[k].colour.toLowerCase()})</span></span>;
}

export function Callout({ tone = "info", icon, children }: { tone?: "info" | "warn" | "ok" | "bad"; icon?: GlyphName; children: ReactNode }) {
  return <div className={`scr-callout ${tone}`}><Icon name={icon || (tone === "warn" || tone === "bad" ? "alert" : tone === "ok" ? "check" : "info")} size={15} /><div>{children}</div></div>;
}

export const staffNameOf = (s: PhState, id: string | null) => (id ? s.staff.find((x) => x.id === id)?.name || id : "");

export function VersionPill({ v, today }: { v: RrVersion; today: string }) {
  if (v.status === "draft") return <Pill tone="warn" icon="edit">Draft, not in use</Pill>;
  if (v.status === "rejected") return <Pill tone="neutral" icon="x">Rejected</Pill>;
  if (v.status === "withdrawn") return <Pill tone="neutral">Withdrawn</Pill>;
  if (v.effectiveFrom > today) return <Pill tone="info" icon="calendar">Scheduled {fmtDate(v.effectiveFrom)}</Pill>;
  return <Pill tone="ok" icon="check">Published</Pill>;
}

export function whoWhen(s: PhState, id: string | null, at: string | null): string {
  return id && at ? `${staffNameOf(s, id)}, ${fmtShortDateTime(at)}` : "";
}

/** Bands table for one cohort row. */
export function BandsTable({ test, row }: { test: RrTest; row: RrRow }) {
  if (row.status !== "set") return <div className="ph-faint" style={{ fontSize: 12 }}>{row.status === "not_set" ? "Range not set yet: results show grey and are not flagged." : "Not applicable to this cohort."}</div>;
  if (test.kind === "qualitative") {
    return <table className="scr-bands"><thead><tr><th>Result</th><th>Printed word</th><th>Colour</th></tr></thead><tbody>
      <tr><td>{row.expected}</td><td><BandWord k="normal" label={row.bands.find((b) => b.key === "normal")?.label || "NORMAL"} /></td><td>Green</td></tr>
      <tr><td>Anything else</td><td><BandWord k="no_band" label="As recorded" /></td><td>Orange, clinician review</td></tr></tbody></table>;
  }
  const bands = RR_BAND_ORDER.map((k) => row.bands.find((b) => b.key === k)).filter((b): b is NonNullable<typeof b> => !!b);
  return (
    <table className="scr-bands">
      <thead><tr><th>Band</th><th>Limits{test.unit && !/not supplied/i.test(test.unit) ? ` (${test.unit})` : ""}</th><th>Printed word</th></tr></thead>
      <tbody>{bands.map((b) => <tr key={b.key}><td><span className="ph-row-flex" style={{ gap: 7 }}><Swatch k={b.key} />{RR_BAND_META[b.key].name}</span></td><td className="num">{boundsShort(b, test.decimals)}</td><td style={{ fontWeight: 600 }}>{b.label}</td></tr>)}</tbody>
    </table>
  );
}

export function ToneDot({ tone, children }: { tone: Tone; children: ReactNode }) { return <Pill tone={tone}>{children}</Pill>; }
