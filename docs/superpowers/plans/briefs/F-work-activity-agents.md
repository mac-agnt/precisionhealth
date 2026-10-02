# Task F: Work, Activity and the Agents Overview and Activity tabs

**Ownership:** you may create and edit files only in: `src/ph/pages/Work/**` (entry `index.tsx`, `WorkPage({ tab })`, tab ids `tasks`, `approvals`, `workflows`, `schedules`), `src/ph/pages/Activity/**` (entry `index.tsx`, `ActivityPage({ tab })`, tab ids `everything`, `people`, `agents`, `needs-attention`) and `src/ph/pages/Agents/**` (files `Overview.tsx` and `AgentsActivity.tsx`, default exports with no props; the Conversations tab keeps the original Pulse chat view and is not yours).

**Project:** Precision Health on Pulse. Source of truth: the brief at `/Users/macobrien/Downloads/Precision_Health_Pulse_Implementation_Prompt.txt` (excerpts below are verbatim) and the project `CLAUDE.md` (its locked layout rules override the brief: Agents sits directly under Home, Records opens on Ontology).

## Brief excerpts for this task (verbatim)

### Section 6, shared synthetic operating model (brief lines 200 to 258)

6. SHARED SYNTHETIC OPERATING MODEL

Use one deterministic client-side data store and shared selectors. Never type independent KPI numbers into individual pages. Every list, chart, agent response, badge, narrative and relationship panel must derive from the same state.

Demo clock: Monday 5 October 2026, 08:15 Europe/Dublin. Show the fixed demo date/time discreetly and use “Good morning, Neil.” If the persona changes, the greeting changes. Do not mix real current dates with synthetic relative labels.

Baseline programme counts:

Programme ID | Programme | Invited | Capacity | Booked | Attended | Released | Ready for review | Awaiting results | On hold
PRG-SISK-26 | Sisk Autumn Screening | 500 | 300 | 240 | 150 | 126 | 12 | 9 | 3
PRG-SF-26 | Salesforce Dublin Wellness | 200 | 100 | 80 | 50 | 40 | 6 | 3 | 1
PRG-IBM-26 | IBM Dublin Screening | 150 | 75 | 45 | 25 | 18 | 3 | 3 | 1
TOTAL | Current programme snapshot | 850 | 475 | 365 | 225 | 184 | 21 | 15 | 5

Definitions and invariants:
- Invited = unique eligible people in these three programme rosters. Baseline fixtures have no cross-programme duplicates, but the model must support them.
- Booked = all confirmed bookings in the programme, including completed historical appointments. It is not “still to attend.”
- 365 booked = 225 attended + 140 upcoming confirmed appointments.
- Each attended appointment has one screening episode in this baseline.
- 225 episodes = 184 released + 21 ready + 15 awaiting + 5 on hold. These are mutually exclusive primary report-workflow states at baseline.
- 365/475 = 76.8% programme capacity booked. Today’s utilisation is a different metric.
- All 365 confirmed bookings have completed the required booking questionnaire and consent. Five of the other invitees have draft questionnaires. Do not count drafts as bookings.
- The remaining 480 invitees have not started booking: 480 + 5 + 365 = 850.
- A released report can have an open follow-up task. Report status and follow-up status are separate fields.
- Health classifications, identity holds and communication failures are not the same category. Keep their queues and severity labels distinct.

Clinic fixtures: 19 sessions, each with 25 slots.
- Sisk: six past sessions on 14, 17, 21, 24 and 28 September and 1 October; all 25 attended. Six future sessions on 5, 8, 12, 15, 19 and 22 October; booked counts 20, 14, 14, 14, 14, 14. The programme window is 14 September–23 October, six weeks. Use fictional “Sisk Dublin Site A” and “Sisk Dublin Site B” locations.
- Salesforce: past sessions on 29 September and 1 October, 25 attended each. Future sessions on 5 and 9 October, 15 booked each. Location: “Salesforce Dublin — Demo Wellness Room.”
- IBM: past session on 1 October, 25 attended. Future sessions on 5 and 12 October, 10 booked each. Location: “IBM Dublin — Demo Screening Room.”
- All sites, room assignments and dates are illustrative, not real appointments.
- Today's three sessions: Sisk 20/25, Salesforce 15/25, IBM 10/25. Total 45/75 booked = 60%, with 30 available slots.
- Today’s assignments: Fiona → Sisk; Anita → Salesforce; Liz → IBM. No overlapping assignments. Ian is a support resource, not a second simultaneously booked nurse.
- Clinic window 09:00–16:15. Breaks 10:30–10:45, 12:30–13:00, 14:30–14:45. This gives 375 bookable minutes and exactly 25 fifteen-minute slots. Derive slots from this configuration.

Participant and episode fixtures:
- Generate 850 synthetic invitee/person records, 365 confirmed bookings and 225 attended episodes deterministically, consistent with the counts above. Apply the named cases first, then fill each programme/state allocation; never append extra showcase people after generating the totals. Paginate existing tables. Do not render all records at once.
- Use stable person IDs PH-P-0001 etc., distinct booking IDs, episode IDs, specimen IDs and report-version IDs. Email, employer and name are not primary identity keys.
- Participant addresses use example.com or example.invalid. Use clearly fictitious masked phone values. Never send messages.
- Aisling Byrne, PH-P-0001, episode PH-E-0101, Sisk: ready for review; illustrative routine case. Height 1.70 m, weight 65 kg, BMI displayed 22.5; BP 116/74; illustrative lab values labelled as sample data. No pending expected tests. Suitable for the per-episode normal-results release demonstration.
- Ronan Walsh, PH-P-0501, episode PH-E-0201, Salesforce: ready for review; LDL 3.2 mmol/L, displayed illustrative decision limit <3.0. Flag “Review required.” Never label this combination normal. This illustrates the inconsistency found in the supplied sample report, not a real patient or a validated clinical threshold library.
- Ciara Doyle, PH-P-0002, episode PH-E-0102, Sisk: on hold for a DOB mismatch in the import quarantine.
- Niamh Keane, PH-P-0502, episode PH-E-0202, Salesforce: on hold for an unknown specimen identifier.
- Eoin Daly, PH-P-0701, episode PH-E-0301, IBM: on hold because two candidate episodes need manual identity resolution.
- Maeve Ryan, PH-P-0003, episode PH-E-0103, Sisk: on hold for clinician-assigned urgent follow-up; do not invent a dangerous numerical result to drive an automated triage rule.
- Dara Quinn, PH-P-0004, episode PH-E-0104, Sisk: on hold for an unresolved source-unit discrepancy.
- Remaining synthetic cases fill the programme/state totals above. Every named example, including Orla below, is included in the relevant roster/state totals, not added on top.
- Five draft questionnaires belong to IBM invitees who are not booked. One of them, Orla Kavanagh, is the portal onboarding demo participant.
- Two reminder failures belong to confirmed upcoming appointments: one Sisk and one Salesforce. Their consent/questionnaire is complete.

Lab batch fixture:
- BATCH-20261002-01; laboratory Eurofins; source filename eurofins_results_2026-10-02_demo.csv.
- 120 observation rows across 24 specimen records. Use consistent sample panels and identifiers; do not equate rows, specimens and people.
- Baseline status: partially imported. 114 rows imported, 3 skipped as duplicates, 3 quarantined. Their sum is 120.
- Three quarantined rows correspond to Ciara, Niamh and Eoin above, one each. Other expected results for these episodes are already accounted for.
- Resolving Ciara’s mismatch with a documented, authorised mock identity check moves one row into imported: 115 imported, 3 duplicates, 2 quarantined. Her episode moves on hold → ready for review. Programme/global totals and activity update accordingly.
- Re-upload detection must not create observations twice. Previewing an unchanged baseline batch again yields 117 already-seen rows plus 3 still unresolved rows, with zero newly imported observations. After a resolution, derive the re-upload preview from current state instead of retaining baseline counts.

Do not invent monthly revenue, profit, debtors, current annual patient throughput or total headcount. The supplier brief’s 20,000 annual accounts and concurrency figures are provisional sizing assumptions; put them in a “Planning assumptions — to confirm” note in Settings, not Executive KPIs.

### Section 7, the six connected story threads (brief lines 260 to 280)

7. SIX CONNECTED STORY THREADS

Use these IDs everywhere, with one source record for each story:

ST-01 — Three laboratory identity exceptions.
Baseline: 120-row batch, 114 imported, 3 duplicates, 3 quarantined. Brenda is the operational owner; Neil handles clinical review after identity resolution. Due 10:00 today. Surface on Home, Results/Imports, Work, Briefing, Activity and the linked episodes. General operations views show counts and minimal identity information, never clinical values.

ST-02 — Twenty-one reports ready; six over 48 hours.
Baseline: 14 routine and 7 individually flagged; six aged beyond 48 hours. Neil owns the queue. Aisling demonstrates routine release. Ronan demonstrates an abnormal-result review and corrected display logic. Surface on Dashboard, Results/Review, Work/Approvals, Briefing and participant report history. The six aged items are a subset of 21, not an additional queue.

ST-03 — IBM clinic has fifteen unused slots today.
Baseline: 10/25 booked, 40% booked. Five invitees have incomplete questionnaires; they cannot reserve confirmed appointments yet. Stephen owns the capacity decision; Brenda owns invitation preparation. Surface on Home, Clinics, Programmes, Booking Coordinator and Work. Use “Available capacity,” not fabricated lost revenue.

ST-04 — One urgent follow-up due at 09:00.
Baseline: Maeve’s episode is on hold; Neil owns follow-up. Illustrative deadline assigned by a clinician, not computed by AI. Surface only to appropriate clinical roles in Results, Work, Home and Activity. Operations sees only “Clinical action assigned” where needed. Recording contact attempts does not equal completion; require an explicit outcome and authorised acknowledgement.

ST-05 — Two failed reminders.
Baseline: 45 due reminders, 43 delivered, 2 failed. Brenda owns review by 08:45. Show distinct failure reasons and the permitted service-contact route. Retrying one changes delivered 43→44 and failed 2→1, retains the same 45 logical reminders and adds an attempt to the history. Do not change booking counts.

ST-06 — Sisk employer report needs disclosure review.
Baseline: report snapshot uses 126 released episodes. A specific filter yields six participants; employer output is suppressed. Martina coordinates; Neil approves clinical narrative. Surface on Reporting, Work/Approvals, Programme Reporting Agent and governance activity. Show a working “Use programme-level view” action. Do not leak the hidden subgroup through chart tooltips, tables, downloadable files or report text.

### Section 8, AGENTS, WORK and ACTIVITY (brief lines 345 to 368)

AGENTS
- Overview: seven agents, jobs, permitted data scope, last simulated action and pending human approvals.
- Conversations: functional deterministic responses to suggested operational queries. Each response links its evidence/record and proposes an action. Unsupported free-form questions should ask for a supported demo scenario rather than invent facts.
- Activity: agent-specific events linked to the same global activity store. No competing event counts.

WORK
- Tasks: table/board with owner, absolute due date/time, priority, team, status and linked record. Seed ST-01 through ST-06 tasks and routine clinic preparation. Clinical tasks are visible only to clinical preview roles. Completing a task updates its underlying story; closing a wrapper must not bypass a clinical or identity requirement.
- Approvals: clinician report release, employer report sign-off, invitation preparation and form-template publication. Show type, requester, reviewer and prerequisite checklist. Each approval opens the actual underlying item rather than a generic approve button.
- Workflows: visual status steps for Invite → Consent/questionnaire → Booking → Screening → Expected results → Clinical review → Released report, with branches to identity resolution and follow-up. Show concrete people moving through the same store. Keep scheduling state and clinical report state separate.
- Schedules: upcoming clinics, 24-hour reminder jobs, review checkpoints, draft employer reporting milestones and existing source-import simulation. Jobs display last/next run and failures. Simulated jobs do not call providers.

RECORDS
- Companies: Precision Health, Sisk, Salesforce and IBM relationship records; Eurofins and Esendex supplier/service records; links to programmes or integrations. Client names are real references; contact people, programme activity and commercial details are synthetic. No invented contract amounts.
- Contacts: public Neil/Stephen/general-contact details plus explicitly fictional HR contacts at demo customers. HR contacts use example.com and have no access to individual clinical results.
- Staff: the same eight profiles, team, demo permissions and assigned clinics/tasks. Changes should update related references.
- Files: bundled/synthetic CSV, lab request preview, report templates, approved sample participant report and draft programme report. Each file has a type, owner, linked object, version and visibility. Use the supplied report only as layout/content-structure inspiration; do not publish source patient data or attach arbitrary original uploads to the demo.
- Ontology: KEEP the existing interactive ontology/relationship page. Map Company → Programme → Clinic → Booking; Person → Membership → Programme; Person → Screening Episode → Specimen → Observation → Calculation → Report Version; Staff → Assignment; Episode → Follow-up Task; Import Batch → Source Rows → Observations; Notification → Booking/Report. Each relationship is navigable to a real seeded object. Include example IDs and useful relationship counts. Role-filtered navigation must not reveal restricted clinical nodes through global search or relationship drawers.

ACTIVITY
- Everything: unified timeline filtered by programme, entity, person/agent/system and time. Include past clinician releases, partial Eurofins import, three quarantine events, reminder failures, draft employer report, form-version changes and upcoming clinic preparation.
- People: staff actions only, using the actual eight staff names and same event IDs.
- Agents: simulated agent actions; exactly the same entries as Agents/Activity.
- Needs Attention: unresolved story events and relevant linked tasks. Resolved items move out of this filter; the historical event remains in Everything.
- Show “Fictional demo event”/“Simulated” at the appropriate level. Do not display patient result values in general operations feeds.

### Section 10, seven agents and existing systems, activity copy examples (brief lines 401 to 429)

10. SEVEN AGENTS AND EXISTING SYSTEMS

Agents:
1. Briefing: summarises the day and open stories using exact shared counts; role-scoped; links every claim to a queue.
2. Ops Watchdog: detects booked-clinic resource conflicts, capacity gaps, late operational tasks and failed jobs. Never triages a medical result.
3. Booking Coordinator: prepares eligibility-based invitation/reminder drafts and capacity actions. Human confirmation before simulated sending; no independent appointment cancellation.
4. Lab Reconciliation: prepares column mappings and explains validation exceptions. It never silently fuzzy-matches a person, resolves conflicting identifiers or commits clinical data without the authorised workflow.
5. Clinical Drafting: optional P1 preview of advice from the selected fictional episode and approved content. Clinician edits/approves. No diagnosis, invented measurements, urgency decisions or report release.
6. Programme Reporting: prepares charts and narrative from the disclosure-controlled aggregate snapshot, with denominators and review requirement. It cannot access or expose participant free-text in employer output.
7. Data Quality: identifies missing units, stale template references, incompatible identifiers and inconsistent displayed flags. Its Ronan example catches “3.2 / limit <3.0 / normal” as an inconsistency requiring human review. It does not invent replacement clinical thresholds.

Give each agent 2–4 seeded conversations/actions with useful timestamps and record links. Only show actions it is permitted to perform. “AI handled” means a visible simulated preparation/validation action, not an unverifiable automation claim.

Systems register:
- Jotform — existing booking/clinical forms and legacy report workflows. Status “Existing source · demo import.” Show transition mapping to Pulse forms; do not imply the agreed end state requires permanent two-way synchronisation.
- Eurofins CSV / FTP — current lab-results source described in the video. Status “CSV reconciliation demonstrated; automated retrieval to confirm.” Do not silently upgrade FTP to SFTP or invent a live API. Direct API integration is a later option.
- Google Workspace — current file/document holding location. Status “Existing source · simulated file events.” Do not expose actual Drive contents.
- Excel — current calculation/review workflow. Status “Legacy rules to validate.” Reference conversion into approved templates and rules, not a live spreadsheet connector with invented credentials.
- Monday.com — business operations and nurse coordination. Status “Operational reference · integration to confirm.” Explicitly no clinical values in its sample events.
- Esendex — named SMS service in the current booking consent. Status “Delivery simulation.” Show the failed reminders and retry history.
- Email — notification channel; exact production provider/transport to confirm. Do not claim Gmail API or Microsoft Graph has been connected just because Google Workspace is used for files.
- Meddbase — public website identifies it for occupational health. Status “Existing separate system · outside this screening demo integration scope.” No made-up records, sync events or replacement promise.

Activity copy examples must be honest and match state:
- “Simulated Eurofins batch processed: 114 observation rows imported; 3 duplicates skipped; 3 identity exceptions held.”
- “Brenda prepared a draft invitation list for IBM. Awaiting approval.”
- “Reminder delivery failed for 2 of 45 scheduled logical reminders.”
- “Neil released report PH-E-0101 v1.” Only appear after the corresponding action, or seed a different historical released episode.
- “Sisk employer export blocked: selected cohort has 6 participants.”

### Section 11, interactions (brief lines 431 to 447)

11. INTERACTIONS AND SHARED STATE

Implement these concrete action chains end to end:
- Home import alert → filtered batch → identity exception → reason/verification confirmation → row committed once → episode ready → totals/events updated.
- Home review alert → Aisling → complete checklist → report preview → clinician approval/release → participant portal report appears → availability notification event.
- Ronan review → visible flag → editable advice → required review acknowledgement → release; normal shortcut stays unavailable.
- Maeve follow-up → contact attempt → remains open → documented outcome/authorised closure; no email shortcut.
- IBM capacity alert → incomplete invitee Orla → questionnaire → valid booking → capacity/calendar/roster update everywhere.
- Failed reminder → inspect verified destination and failure → simulate retry → logical delivered/failed counters update once.
- Sisk report → six-person cohort → export blocked → programme-level cohort → edit narrative → clinician approval → matching PDF/PPT previews.
- Released episode → correction → draft v2 → re-review → release v2 → v1 superseded → participant notice and version history.
- Form template → add/reorder block → draft vNext → approve publication → future bookings use new version; historical episodes keep the old one.
- Switch Neil → Brenda → participant preview; demonstrate appropriate visibility without changing real authentication.

Use one store for entities and an append-only local activity history. Centralise state transitions, enum labels, time calculations and count selectors. Idempotent buttons prevent repeated release/import/retry clicks from duplicating logical records. Demo reset returns the exact baseline.

Prefer in-memory state; local persistence is optional only for synthetic demo data, namespaced and versioned. The demo must work without server calls. Keep sensitive source attachments out of the bundle. Local data helpers are mock fixtures, not database work.

### Section 14, final acceptance checklist (brief lines 474 to 521)

14. FINAL ACCEPTANCE CHECKLIST

Structure and brand:
- Exactly 12 meaningful sidebar modules and all top-bar pages specified above.
- Original Home AI chat remains recognisable and functional.
- Records and the interactive Ontology page remain available and populated.
- No rendered Kilbride references, irrelevant contractor/fleet/stock fixtures or old organisation assets remain.
- Precision Health logo, colours, names and terminology are consistent.
- Eight seeded staff profiles are not presented as total company headcount.

Baseline arithmetic:
- Programme totals: 850 invited; 475 capacity; 365 booked; 225 attended; 184 released; 21 ready; 15 awaiting; 5 held.
- Bookings: 225 past attended + 140 upcoming = 365.
- Report states: 184 + 21 + 15 + 5 = 225.
- Clinics: 12 Sisk + 4 Salesforce + 3 IBM = 19; 19 × 25 = 475 slots.
- Today: 20 + 15 + 10 = 45 bookings from 75 slots; 30 available; 60% booked.
- Import rows: 114 + 3 + 3 = 120; 24 specimens are labelled separately.
- Reminder cohort: 43 delivered + 2 failed = 45 logical reminders.
- Review queue: 14 routine + 7 individually flagged = 21; six aged cases are included within 21.
- Five holds: three identity, one urgent follow-up, one source-unit discrepancy.
- Sisk released report cohort: 126; four seeded age bands sum to 126.
- Table pagination totals, chart denominators, filter counts and badges come from the underlying records.

Behaviour:
- Required consent/questionnaire blocks booking confirmation until complete.
- Orla’s booking updates the IBM/calendar/programme/global counts once and does not retroactively add yesterday’s reminder.
- Double-booking is prevented in the local simulation; breaks are not bookable.
- Completing a nurse appointment does not release a report.
- Missing and not-done values never become zero/normal.
- Import conflicts are not silently matched; duplicate upload creates no extra observations.
- Ciara’s resolution changes the correct row count and episode state, with a reason and activity event.
- Normal shortcut is unavailable for Ronan, held episodes and incomplete expected tests.
- Aisling’s unreleased report cannot be seen in participant preview; it appears after approval.
- Report amendments preserve history and require new review.
- Follow-up closure requires an outcome, not a delivery receipt.
- Employer reporting blocks the six-person cohort and protects suppressed information in previews/exports.
- Permissions simulation covers global search, ontology links, files, agents and drawers as well as page navigation.
- AI-off still allows the complete manual workflow.
- Existing integration names are correct; statuses are explicitly simulated or unconfirmed.
- No live patient data, messages, network integrations, production credentials, authentication changes or invented certification claims.

Quality:
- No broken routes or empty top-bar pages; main actions perform the described local transition or clearly labelled preview.
- Same story, owner, identifier and current count across every surface.
- Charts and tables are meaningfully different where the job differs.
- No oversized empty centre column, clipped labels, hidden primary actions or unreadable low-contrast glass overlays.
- Verify at desktop, tablet and 375px participant widths using the project’s existing tooling. Run the existing build/type checks and a focused walkthrough of the action chains; add only targeted checks needed for the derived totals and transitions, with no new test framework.
- Finish with a concise implementation report: changed modules, working demo flows, verification performed and any honest limitations.

## Brief: non-negotiable rules (verbatim, section 1)

1. NON-NEGOTIABLE IMPLEMENTATION RULES

- Edit the existing application. Inspect its routing, theme, components, state and data fixtures before making focused changes. Use the actual project structure; do not assume framework versions or invent a replacement architecture.
- KEEP HOME AND ITS EXISTING AI CHAT. Preserve the current chat-first composition, interaction pattern, typography, glass surfaces and spacing system. Rebrand its greeting, suggestions, agents, context cards and responses. Do not replace Home with a dashboard.
- KEEP RECORDS AND THE ONTOLOGY PAGE. Adapt their entities and relationships to Precision Health. Do not delete, hide or replace them with an unrelated directory.
- Preserve Agents, Dashboard, Work, Activity and Settings. Add the five business modules specified below.
- Frontend only. Synthetic data only. No backend, database migrations, real authentication changes, API keys, live messaging, real patient uploads or live integrations.
- No new dependencies. Use installed charting, icons, routing, state, export and UI utilities. Adapt existing patterns rather than importing another design system.
- Remove Kilbride branding and client-specific remnants from rendered copy, mock records, assets used by the UI, metadata, search results, exports, agent messages and organisation settings. Preserve useful generic components.
- Use real public company branding and public staff names where specified. All patients, programme schedules, operational events, results and performance figures below are invented demo fixtures. Never imply they are current client records.
- Show a discreet persistent “Demo · synthetic data” label. Show “Simulated” on integration activity and delivery records. Clinical screens and participant previews must identify sample results as fictional.
- No fake certifications, “GDPR certified” badges, live connection claims, fabricated security-test passes or unsupported savings claims.
- Normal/abnormal interpretation is illustrative and clinician-owned. Do not build an unvalidated diagnostic or triage engine. Do not call an AI API. All AI output is deterministic, prewritten demo content.
- Use EUR, Irish date formats, 24-hour appointment times and Europe/Dublin display time. Keep UTC timestamps internally where the existing frontend uses dates.
- Implement meaningful interactions, linked records, working filters, state transitions and coherent previews. A toast alone is not a completed workflow.

## Brief: visual density and component quality (verbatim, section 12)

12. VISUAL DENSITY AND COMPONENT QUALITY

- Preserve the existing Glass aesthetic and component quality. Use teal accents, quiet borders and strong type hierarchy.
- Maintain purposeful padding and reading space while removing large unused central gaps. Fill wide screens with relevant tables, panels, calendars or context; do not stretch three KPI cards over an otherwise empty viewport.
- Tables and queues should dominate operational pages. Use a split review workspace for clinical work; calendar for scheduling; composer for forms; report canvas for reporting; relationships for ontology.
- Keep KPI strips concise, usually 3–5 measures. Avoid identical hero sections and repetitive card grids across all modules.
- Use full-width tables with compact rows and a useful detail drawer. On larger screens a roughly two-thirds working area and one-third contextual panel is appropriate when the task benefits from it.
- Use text and icons with colour for status, never colour alone. Tooltips explain denominators and hold reasons.
- Use the existing responsive breakpoints. Staff desktop/tablet views remain usable; participant preview works at 375px without horizontal scrolling.
- Make dense tables horizontally scrollable only where necessary; keep the primary action, identifier and status visible.
- No lorem ipsum, repeated placeholder charts, invented accounting data, blank modules, dead tabs or buttons whose label promises a result they cannot produce.
- A genuine awaiting-review or missing-integration state is acceptable when it explains the reason and next action. Do not fabricate data to eliminate a meaningful state.

## Shared model notes (read before coding)

- Read these first: `src/ph/model/types.ts`, `constants.ts`, `nav.ts`, `reducer.ts` (the `act` creators), `selectors/*.ts`, `src/ph/store.ts`, `src/ph/nav-context.tsx`, `src/ph/ui/*`, `src/styles/ph.css`, and `docs/superpowers/plans/2026-10-02-precision-health-pulse.md`.
- Never type a count. Derive every number with a selector (`programmeCounts`, `todayStats`, `reviewStats`, `batchStats`, `reminderStats` ...). Rates always show their denominator.
- Components read state with `usePh(selector)` (selectors are memoised per state object) and write with `dispatch(act.something(...))` from `src/ph/store.ts`. Never mutate state. A failed action changes nothing and returns a message that `dispatch` already shows as a toast, so do not add your own toast for it.
- Handlers are idempotent and permission-checked: a second click fails harmlessly. Still disable buttons that cannot work and say why (a `title` or help line).
- Roles: `usePersona()` gives `{ id, name, role, perms }`, `useCan("clinical.view")` etc. Operations roles (Brenda) see counts and minimal identity only, never blood values, results or participant clinical reports. Hide values entirely (not blurred) and say what the role can see. A persona switch must re-filter your screen live.
- Navigation: `useNav()`; link with `<EntityLink kind="episode" id="PH-E-0101" />` or `nav.go({ page, tab, params })`. Read `nav.params` to open a drawer or select a row from a deep link, and keep it in sync with selection using `nav.setParams`. Hash form: `#/Results/imports?batch=BATCH-20261002-01`.
- Time: demo clock is Monday 5 October 2026, 08:15 Dublin. Use `fmtDate`, `fmtTime`, `fmtDateTime`, `fmtWhen`, `fmtAge`, `today(state)`. Never call `new Date()` for display.
- Look: Pulse Glass tokens and the classes in `src/styles/ph.css`. Tables and queues dominate operational pages. Use a split working area (about two thirds) plus a context panel (about one third) where it helps, collapsing under 1180px. Use `DataTable` for anything that can exceed ~25 rows. No oversized empty areas. Labels must not clip at 800px. No horizontal page scroll at 375px for the portal.
- Copy: plain Irish register, no exclamation marks, no emoji, no em dashes (use commas, colons or parentheses). Mark fictional or simulated content with `DemoTag` ("Simulated", "Sample data", "Fictional").
- Keep every file compilable at all times (other agents compile the whole project): write complete files, then edit. Do not edit files outside your folder. Do not run `git commit`. The dev server is already running at http://localhost:5174 (do not start another). Verify in the browser pane with deep links such as `http://localhost:5174/#/Results/review`, using `read_page`, `javascript_tool`, screenshots, and `read_console_messages`. Resize with `resize_window` (desktop about 1280, tablet 768). Switch persona with the profile menu at the top right of the header.
- If you need an action or selector the model lacks, add it inside your folder: selectors as plain functions of `PhState`; actions with `registerHandlers({...})` from `src/ph/model` called at import time, dispatched as a raw `{ type: "yourmodule/doThing", ... }`. Handlers receive a `Ctx` (see `actions/ctx.ts`): use `c.need(perm, what)`, `c.fail(msg)`, `c.ok(msg)`, `c.emit({...})` for the activity log, and call `c.inv()` after pushing into arrays. If the shared model or UI kit has a bug or gap, work around it locally and report it. Do not edit `src/ph/model`, `src/ph/ui`, `src/ph/store.ts`.

## Work, Activity, Agents: what the model gives you

- Tasks: `taskViews(state)` and `visibleTasks(state)` (status derived from the underlying item for story tasks, so closing a wrapper can never bypass an identity or clinical requirement; `canMarkDone` and `blockReason` tell you what to show). Table and board views with owner, absolute due date and time (`fmtDateTime`), priority, team, status and a link to the linked record (`task.linked`, `taskView.target`). ST-01 to ST-06 tasks and routine clinic preparation are seeded. Clinical tasks are visible only to clinical preview roles (`taskView.visible`). "Mark done" works only for routine tasks (`act.completeTask`); story tasks show "Open item" and the reason. `act.addTask` exists for a quick add.
- Approvals: `approvalViews(state)`: four types (clinician report release: one per ready episode; employer report sign-off; invitation preparation; form-template publication) with type, requester, reviewer and a prerequisite checklist. Each approval opens the actual underlying item (`approval.target`, `nav.go(linkFor(...))`) rather than a generic approve button; decisions happen on the underlying screen.
- Workflows: visual status steps Invite, Consent and questionnaire, Booking, Screening, Expected results, Clinical review, Released report, with branches to identity resolution and follow-up, with concrete people moving through the same store (counts per stage from `programmeCounts`, `holdQueue`, `openFollowUps`; named examples Orla, Aisling, Ronan, Ciara, Maeve). Scheduling state and clinical report state stay separate.
- Schedules: `jobViews(state)` (24 hour reminder jobs, review checkpoints, draft employer reporting milestones, the existing source-import simulation) with last and next run and failures. Everything is simulated: show "Simulated" and never imply a provider call. Upcoming clinics from `state.sessions`.
- Activity: `activityFeed(state, { filter, programmeId, entityKind, actor, q })` returns role-filtered views (restricted events show their `publicSummary`, for example "Clinical action assigned", or are hidden). Filters: programme, entity, person, agent or system, time. People shows staff actions only with the real eight names. Agents shows the same entries as the Agents Activity tab. Needs Attention shows unresolved story events and linked open tasks (`attentionTasks`); resolved items leave this filter but remain in Everything. Show "Fictional demo event" or "Simulated" at the right level (`event.simulated`, `event.seeded`). Never show result values in general feeds. Same event IDs everywhere (`EVT-00001`).
- Agents Overview: `AGENT_DEFS` (seven agents: Briefing, Ops Watchdog, Booking Coordinator, Lab Reconciliation, Clinical Drafting (optional P1 preview), Programme Reporting, Data Quality) with jobs, permitted data scope, what each may and may not do, last simulated action (`agentEvents(state, agentId)`), and pending human approvals that relate to them (invitation preparation to Booking Coordinator, employer report to Programme Reporting, open data quality issues to Data Quality, identity exceptions to Lab Reconciliation). Use `AgentFace` from `src/components/AgentFace` if you want the avatar. "AI handled" means a visible simulated preparation, not an automation claim. Agents Activity: agent-specific events from the same global store with filters; no competing counts.

## Acceptance for this task

- Four real Work tabs, four Activity filters, an Agents Overview and Activity tab, all derived from the store, role-aware, with links that open the real underlying item.
- Completing the underlying action elsewhere (for example resolving the three identity exceptions) updates Work, Needs Attention and the story status here without a refresh.
- Check as Neil (sees clinical tasks), Brenda (no clinical tasks, "Clinical action assigned" only) and Stephen.

## Report contract

Write your full report to the report path given in the dispatch. Return only: status (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT or BLOCKED), the list of files created, a one line verification summary, and concerns. The report file lists: features built per tab, which brief chains you exercised and how, deviations from the brief and why, model or UI kit gaps and workarounds, and any bugs found in shared code.
