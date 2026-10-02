/* Assembles the baseline synthetic state. Pure and deterministic: the same call always
   returns the same data, which is what Reset demo relies on. */
import type { PhState } from "../types";
import {
  APPOINTMENT_TYPES, COMPANIES, CONTACTS, FORM_BLOCKS, FORM_TEMPLATES, GOVERNANCE_ITEMS, PROGRAMMES, RESOURCES, STAFF, TEAMS,
} from "../constants";
import { DEMO_NOW_UTC } from "../time";
import { buildRoster } from "./people";
import { buildClinical } from "./clinical";
import { buildOps } from "./ops";

export function createInitialState(): PhState {
  const plan = buildRoster();
  const clin = buildClinical(plan);
  const ops = buildOps(plan, clin);
  const nextEpisode = clin.episodes.reduce((m, e) => {
    const n = Number(e.id.slice(5));
    return n >= 1000 && n > m ? n : m;
  }, 1000) + 1;
  const state: PhState = {
    version: 1,
    clock: { nowUtc: DEMO_NOW_UTC, preset: "baseline" },
    session: { personaId: "neil", portalPersonId: "PH-P-0801" },
    staff: structuredClone(STAFF),
    teams: structuredClone(TEAMS),
    companies: structuredClone(COMPANIES),
    contacts: structuredClone(CONTACTS),
    programmes: structuredClone(PROGRAMMES),
    appointmentTypes: structuredClone(APPOINTMENT_TYPES),
    sessions: plan.sessions,
    resources: structuredClone(RESOURCES),
    persons: plan.persons,
    memberships: plan.memberships,
    bookings: plan.bookings,
    episodes: clin.episodes,
    specimens: clin.specimens,
    observations: clin.observations,
    batches: clin.batches,
    importRows: clin.importRows,
    importPreview: null,
    captureDrafts: {},
    reportVersions: clin.reportVersions,
    followUps: clin.followUps,
    messages: ops.messages,
    invitationCodes: plan.codes,
    invitationDrafts: ops.invitationDrafts,
    tasks: ops.tasks,
    approvals: ops.approvals,
    jobs: ops.jobs,
    dqIssues: clin.dqIssues,
    activity: ops.activity,
    forms: { blocks: structuredClone(FORM_BLOCKS), templates: structuredClone(FORM_TEMPLATES) },
    employerReports: ops.employerReports,
    exports: [],
    settings: {
      aiDraftingOn: true,
      governance: structuredClone(GOVERNANCE_ITEMS),
      reminderLeadHours: 24,
      minCohort: 10,
      suppressionThreshold: 5,
    },
    aiDrafts: {},
    counters: {
      event: ops.activity.length,
      task: ops.tasks.length,
      booking: plan.bookings.length,
      approval: ops.approvals.length,
      followUp: clin.followUps.length,
      message: ops.messages.length,
      invitation: ops.invitationDrafts.length,
      code: plan.codes.length,
      export: 0,
      toast: 0,
      observation: clin.observations.length,
      episode: nextEpisode - 1,
      report: 1,
      eventBase: ops.activity.length,
    },
    toasts: [],
  };
  return state;
}
