/* "How we set these ranges", for the participant's released report. Every result in the report is
   banded against Precision Health's reference ranges (Dr Neil Reddy's table in Health Screening),
   using the version in force on the screening date; a released report keeps that version. This
   card lists each result with its healthy range and the version it was checked against, in plain
   words. It reads only the participant's own released version. */
import { useState } from "react";
import type { Episode, ReportVersion } from "../../model";
import { ANALYTES, RR_TESTS, bandCtxFor, fmtDateLong, ix, rangeTextFor, versionObservations } from "../../model";
import { usePhState } from "../../store";
import { Card, Icon } from "../../ui";
import { BAND_LOOK } from "../../report/bands";

const fmtDay = (iso: string) => iso.split("-").reverse().join("/");

export const RANGES_CARD_ID = "pp-ranges-card";

/** A slim line above the report with a link to the explanation. */
export function RangesLine({ ep }: { ep: Episode }) {
  const go = () => {
    const el = document.getElementById(RANGES_CARD_ID);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  };
  return (
    <div className="pp-banner" style={{ alignItems: "center" }}>
      <Icon name="shield" size={14} />
      <span>
        Your healthy ranges come from Precision Health's reference ranges, as they stood on {fmtDateLong(ep.collectedAt.slice(0, 10))}.{" "}
        <button type="button" className="ph-link" onClick={go}>How we set these ranges</button>
      </span>
    </div>
  );
}

export function RangesCard({ ep, v }: { ep: Episode; v: ReportVersion }) {
  const state = usePhState();
  const [open, setOpen] = useState(false);
  const person = ix(state).personById.get(ep.personId);
  const versions = state.referenceRanges.versions;
  const obs = versionObservations(state, v).filter((o) => !ANALYTES[o.code].qualitative);
  const ctx = person ? bandCtxFor(person, ep.collectedAt) : undefined;
  const testByAnalyte = new Map(RR_TESTS.filter((t) => t.analyte).map((t) => [t.analyte!, t]));
  const rows = obs.map((o) => {
    const rv = o.rangeVersion ? versions.find((x) => x.id === o.rangeVersion) : undefined;
    const test = testByAnalyte.get(o.code);
    return {
      key: o.id, name: ANALYTES[o.code].reportName || ANALYTES[o.code].name, band: o.band,
      range: ctx ? rangeTextFor(o.code, ctx) : o.limitText,
      version: rv ? `Version ${rv.version}, from ${fmtDay(rv.effectiveFrom)}` : test ? "Version in force on the day" : "Calculated from your results",
    };
  });
  const lead = ix(state).staffById.get("neil");
  return (
    <Card>
      <div id={RANGES_CARD_ID} style={{ scrollMarginTop: 16 }} />
      <h3 className="pp-h3">How we set these ranges</h3>
      <p className="pp-small" style={{ marginTop: 0 }}>
        Each result is checked against Precision Health's reference ranges, written and approved by our Medical Director{lead ? `, ${lead.displayName}` : ""}, from Irish and UK clinical guidance. We use the version in force on your screening date. If a range changes later, this report keeps the version it was checked against.
      </p>
      <ul className="pp-msglist" style={{ margin: "6px 0 10px" }}>
        {(["normal", "borderline", "abnormal"] as const).map((b) => (
          <li key={b}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: BAND_LOOK[b].fill, flex: "none", marginTop: 3 }} />
            <span>{b === "normal" ? "Green: in the healthy range." : b === "borderline" ? "Amber: just outside the range. Worth talking about with your GP." : "Orange: outside the range. Your doctor's advice says what to do next."}</span>
          </li>
        ))}
      </ul>
      {rows.length ? (
        <>
          <button type="button" className="ph-link" style={{ fontSize: 12.5 }} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide the range for each result" : `See the range for each of your ${rows.length} results`}
          </button>
          {open ? (
            <div className="pp-ranges" role="table" aria-label="Your results and their ranges">
              {rows.map((r) => (
                <div key={r.key} className="pp-ranges-row" role="row">
                  <span role="cell" className="pp-ranges-name"><i aria-hidden="true" style={{ background: BAND_LOOK[r.band].fill }} />{r.name}</span>
                  <span role="cell" className="pp-ranges-range">{r.range}</span>
                  <span role="cell" className="pp-small">{r.version}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
