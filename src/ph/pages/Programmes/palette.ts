/* Colours and status labels for the Programmes screens. Report workflow colours come from the
   shared chart palette; status always pairs text and an icon with its colour. */
import type { FormTemplateVersion } from "../../model";
import { PALETTE } from "../../ui";
import type { GlyphName, Tone } from "../../ui";

export const WEEK_COLORS = {
  released: PALETTE[0],
  ready: PALETTE[1],
  awaiting: PALETTE[2],
  onHold: "var(--warn)",
};

export const workflowSegments = (c: { released: number; ready: number; awaiting: number; onHold: number }) => [
  { label: "Released", value: c.released, color: WEEK_COLORS.released },
  { label: "Ready for review", value: c.ready, color: WEEK_COLORS.ready },
  { label: "Awaiting results", value: c.awaiting, color: WEEK_COLORS.awaiting },
  { label: "On hold", value: c.onHold, color: WEEK_COLORS.onHold },
];

export const VERSION_STATUS: Record<FormTemplateVersion["status"], { label: string; tone: Tone; icon: GlyphName }> = {
  published: { label: "Published", tone: "ok", icon: "check" },
  draft: { label: "Draft", tone: "info", icon: "edit" },
  pending_approval: { label: "Awaiting approval", tone: "warn", icon: "clock" },
  retired: { label: "Retired", tone: "neutral", icon: "layers" },
};

export const STAGE_TONE: Record<string, Tone> = {
  "Not started": "neutral",
  "Questionnaire in progress": "warn",
  Booked: "brand",
  Attended: "ok",
};
export const STAGE_ICON: Record<string, GlyphName> = {
  "Not started": "dot",
  "Questionnaire in progress": "edit",
  Booked: "calendar",
  Attended: "check",
};
