/* Results status after the nurse completes an appointment, in plain words for the clinic team.
   Point of care: the machine's results are in, so the episode is ready for the doctor and the
   report can be released the same day, through the normal review and release in Results.
   Laboratory: the episode waits for the laboratory import ("Awaiting lab"). Only existing episode
   states are read; nothing here changes an episode. */
import type { Episode, PhState } from "../../model";
import { expectedTests, ix } from "../../model";
import { usePhState } from "../../store";
import { Button, Icon, Pill } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export interface ResultsStatus { key: "same_day" | "awaiting_lab" | "lab_in" | "released" | "on_hold" | "awaiting"; label: string; tone: Tone; icon: GlyphName; detail: string }

export const isPocEpisode = (ep: Episode) => ep.capture?.variant === "poc";

export function resultsStatus(state: PhState, ep: Episode): ResultsStatus {
  const poc = isPocEpisode(ep);
  if (ep.reportState === "released") return { key: "released", label: "Released", tone: "ok", icon: "check", detail: "The participant can open the report in the portal." };
  if (ep.reportState === "on_hold") return { key: "on_hold", label: "On hold", tone: "warn", icon: "alert", detail: "Held for a check before review. The clinic team does not need to act." };
  if (poc && ep.reportState === "ready_for_review") return { key: "same_day", label: "Ready for same-day release", tone: "info", icon: "clock", detail: "Results were measured here, so there is no laboratory wait. The doctor reviews and releases the report today." };
  if (ep.reportState === "ready_for_review") return { key: "lab_in", label: "Lab results in, ready for review", tone: "info", icon: "check", detail: "Every laboratory result is back. The doctor reviews before anything is released." };
  if (poc) return { key: "awaiting", label: "Awaiting results", tone: "neutral", icon: "clock", detail: "Waiting for a result." };
  const pending = expectedTests(state, ep).filter((t) => t.status !== "received").length;
  return { key: "awaiting_lab", label: "Awaiting lab", tone: "neutral", icon: "flask", detail: `The blood sample goes to the laboratory with the courier. ${pending} test${pending === 1 ? "" : "s"} to come back before the doctor reviews.` };
}

export function ResultsPill({ episode }: { episode: Episode }) {
  const state = usePhState();
  const s = resultsStatus(state, episode);
  return <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

/** The status card on a completed appointment, with the same-day release path for a point-of-care episode. */
export function ResultsStatusCard({ episode, onOpenEpisode }: { episode: Episode; onOpenEpisode?: (episodeId: string) => void }) {
  const state = usePhState();
  const s = resultsStatus(state, episode);
  const lead = ix(state).staffById.get(ix(state).programmeById.get(episode.programmeId)?.clinicalLeadId || "neil");
  const ready = s.key === "same_day";
  return (
    <div className={"np-results" + (ready ? " ready" : "")} role="status">
      <span className="nf-id-ico" style={{ background: ready ? "var(--accent-soft)" : "var(--track)", color: ready ? "var(--accent)" : "var(--dim)" }}><Icon name={s.icon} size={16} /></span>
      <div className="ph-grow" style={{ minWidth: 220 }}>
        <div className="ph-row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="np-results-title">Results: {s.label}</span>
          {isPocEpisode(episode) ? <Pill tone="brand" icon="flask">Point of care</Pill> : <Pill tone="neutral" icon="flask">Laboratory</Pill>}
        </div>
        <div className="ph-dim" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
          {s.detail}{ready && lead ? ` ${lead.displayName} releases it from Results, Review.` : ""}
        </div>
      </div>
      {onOpenEpisode && (ready || s.key === "lab_in" || s.key === "released") ? (
        <Button variant={ready ? "primary" : "secondary"} icon="arrow" className="nf-big" style={{ width: "auto" }} onClick={() => onOpenEpisode(episode.id)}>
          {ready ? "Open for same-day release" : s.key === "released" ? "Open the released report" : "Open in Review"}
        </Button>
      ) : null}
    </div>
  );
}
