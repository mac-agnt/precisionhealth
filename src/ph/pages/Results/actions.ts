/* Local actions for the Results screens, registered at import time. The shared model is not
   edited: these wrap it through registerHandlers and stay idempotent and permission-checked.

   resultsui/confirmUnit: the shared import/confirmUnit handler keeps the received value but
   does not store the confirmation text anywhere. The brief asks that every correction keeps
   the original observation and its reason in a local audit event, so this wrapper runs the
   shared handler and, only if it succeeds, appends the reason to the activity log. A failed
   or repeated click changes nothing. */
import { registerHandlers } from "../../model";
import type { ActionResult, Ctx } from "../../model";
import { resultsHandlers } from "../../model/actions/results";

export const CONFIRM_UNIT = "resultsui/confirmUnit";

registerHandlers({
  [CONFIRM_UNIT]: (c: Ctx, a: { episodeId: string; reason: string }): ActionResult => {
    const base = resultsHandlers["import/confirmUnit"];
    if (!base) return c.fail("Unit confirmation is not available in this build.");
    const r = base(c, a);
    if (!r.ok) return r;
    const ep = c.ix().episodeById.get(a.episodeId);
    const reason = a.reason.trim().replace(/[.\s]+$/, "") + ".";
    c.emit({
      verb: "unit.reason",
      summary: `${c.first()} documented the laboratory confirmation for ${a.episodeId}. Reason: ${reason} The value as received is kept on the earlier version.`,
      entity: { kind: "episode", id: a.episodeId },
      programmeId: ep ? ep.programmeId : null,
      personId: ep ? ep.personId : null,
      restricted: true,
      publicSummary: "Data quality confirmation documented on a clinical episode",
    });
    return r;
  },
});

export const confirmUnitWithReason = (episodeId: string, reason: string) => ({ type: CONFIRM_UNIT, episodeId, reason });
