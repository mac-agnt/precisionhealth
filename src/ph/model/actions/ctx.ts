/* Reducer context. Handlers mutate a structured clone of the state, so they can be written
   plainly. The context provides permission checks, id sequences, timestamps and the
   append-only activity log. Handlers read memoised selectors, so call inv() after pushing
   new objects into arrays and before reading selectors again. */
import type { ActivityEvent, EntityRef, Episode, Id, Perm, PhState, ProgrammeId, StoryId, Toast } from "../types";
import type { Iso } from "../time";
import { invalidate, ix, membershipOf, persona } from "../selectors/core";
import type { Persona } from "../selectors/core";
import { expectedTests, hasUnitDiscrepancy } from "../selectors/clinical";

export interface ActionResult {
  ok: boolean;
  message?: string;
  tone?: Toast["tone"];
  id?: string;
  /** Set on a save conflict so the UI can offer a reload. */
  conflict?: boolean;
}
export type Handler<A = any> = (c: Ctx, a: A) => ActionResult;

export interface EmitInput {
  verb: string;
  summary: string;
  actor?: ActivityEvent["actor"];
  entity?: EntityRef | null;
  programmeId?: ProgrammeId | null;
  personId?: Id | null;
  storyId?: StoryId | null;
  integrationId?: string | null;
  restricted?: boolean;
  publicSummary?: string | null;
  simulated?: boolean;
}

export const pad = (n: number, w: number) => String(n).padStart(w, "0");

export class Ctx {
  constructor(public s: PhState) {}

  get now(): Iso { return this.s.clock.nowUtc; }
  persona(): Persona { return persona(this.s); }
  can(p: Perm): boolean { return this.persona().perms.has(p); }
  /** First name of the acting persona, used in activity text. */
  first(): string { return this.persona().name.split(" ")[0]; }
  ix() { return ix(this.s); }
  inv() { invalidate(this.s); }

  ok(message?: string, tone: Toast["tone"] = "ok", id?: string): ActionResult { return { ok: true, message, tone, id }; }
  fail(message: string): ActionResult { return { ok: false, message, tone: "warn" }; }
  /** Returns a failure result when the current persona lacks a permission, otherwise null. */
  need(p: Perm, what: string): ActionResult | null {
    return this.can(p) ? null : this.fail(`${this.persona().name} (${this.persona().roleLabel}) cannot ${what}. Switch role in Settings, Experience to try it.`);
  }
  /** Staff only: the participant preview cannot do this. Returns a failure result, otherwise null. */
  staffOnly(what: string): ActionResult | null {
    return this.persona().isParticipant ? this.fail(`The participant preview cannot ${what}. This is a staff action.`) : null;
  }
  /**
   * In the participant preview a person may act only on their own record. Staff pass through here
   * and are checked by permission instead. Returns a failure result, otherwise null.
   */
  selfOnly(personId: Id, what: string): ActionResult | null {
    if (!this.persona().isParticipant || personId === this.s.session.portalPersonId) return null;
    return this.fail(`In the participant preview you can only ${what} for yourself, not for another person.`);
  }

  /** Last-used sequence numbers live in counters. */
  nextNo(counter: string): number {
    this.s.counters[counter] = (this.s.counters[counter] || 0) + 1;
    return this.s.counters[counter];
  }

  /**
   * New events get a stable, increasing timestamp just after the demo clock. If the clock was moved
   * back, the stamp still follows the last event by a second, so history never runs backwards.
   */
  stamp(): Iso {
    const n = Math.max(0, (this.s.counters.event || 0) - (this.s.counters.eventBase || 0));
    const byClock = Date.parse(this.now) + n * 1000;
    const last = this.s.activity.length ? Date.parse(this.s.activity[this.s.activity.length - 1].at) + 1000 : 0;
    return new Date(Math.max(byClock, last)).toISOString();
  }

  actor(): ActivityEvent["actor"] {
    const p = this.persona();
    if (p.isParticipant) return { kind: "participant", id: this.s.session.portalPersonId, label: p.name };
    return { kind: "staff", id: p.id, label: p.name };
  }

  emit(e: EmitInput): Id {
    const n = this.nextNo("event");
    const ev: ActivityEvent = {
      id: `EVT-${pad(n, 5)}`, at: this.stamp(), actor: e.actor || this.actor(), verb: e.verb, summary: e.summary, entity: e.entity ?? null,
      programmeId: e.programmeId ?? null, personId: e.personId ?? null, storyId: e.storyId ?? null, integrationId: e.integrationId ?? null,
      restricted: e.restricted ?? false, publicSummary: e.publicSummary ?? null, simulated: e.simulated ?? false, seeded: false,
    };
    this.s.activity.push(ev);
    return ev.id;
  }

  /**
   * Recompute an episode's primary report-workflow state after a hold clears or a result arrives.
   * Released episodes never change here. Holds, unit discrepancies and pending tests keep the
   * episode out of the review queue.
   */
  settleEpisode(ep: Episode): void {
    if (ep.reportState === "released") return;
    this.inv();
    const pending = expectedTests(this.s, ep).filter((t) => t.status !== "received");
    if (ep.hold) { ep.reportState = "on_hold"; return; }
    if (pending.length || hasUnitDiscrepancy(this.s, ep)) { ep.reportState = "awaiting_results"; return; }
    if (ep.reportState !== "ready_for_review") {
      ep.reportState = "ready_for_review";
      ep.readyAt = this.now;
      ep.reviewAssigneeId = "neil";
    }
  }

  /** Current name of a person for event text. */
  personName(personId: Id): string {
    const p = this.ix().personById.get(personId);
    return p ? `${p.given} ${p.family}` : personId;
  }

  /** Verified, masked destination for a simulated message, from the contact preference on the programme membership. */
  contactFor(personId: Id, programmeId?: ProgrammeId | null): { channel: "sms" | "email"; destination: string; provider: "Esendex" | "Email" } {
    const person = this.ix().personById.get(personId)!;
    const channel = membershipOf(this.s, personId, programmeId)?.contactPreference || "email";
    return { channel, destination: channel === "sms" ? person.phone : person.email.replace(/^(.)[^@]*/, "$1***"), provider: channel === "sms" ? "Esendex" : "Email" };
  }
}
