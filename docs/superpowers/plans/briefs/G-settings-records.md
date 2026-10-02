# Task G: Settings and the Records Companies and Staff tabs

**Ownership:** you may create and edit files only in: `src/ph/pages/Settings/**` (entry `index.tsx`, `SettingsPage({ tab })`, tab ids `organisation`, `teams`, `permissions`, `systems-integrations`, `governance`, `ai-controls`, `experience`) and `src/ph/pages/Records/**` (files `Companies.tsx` and `Staff.tsx`, default exports with no props; Ontology, Files and Contacts keep the original Pulse views and are not yours).

**Project:** Precision Health on Pulse. Source of truth: the brief at `/Users/macobrien/Downloads/Precision_Health_Pulse_Implementation_Prompt.txt` (excerpts below are verbatim) and the project `CLAUDE.md` (its locked layout rules override the brief: Agents sits directly under Home, Records opens on Ontology).

## Brief excerpts for this task (verbatim)

### Section 2, verified company context and scope (brief lines 27 to 84)

2. VERIFIED COMPANY CONTEXT AND SCOPE

Public company research, checked 2 October 2026:
- Trading name: Precision Health.
- Public website company name: Precision Healthcare Ltd; website footer lists company number 551990. This is branding context, not verification of contracting details.
- Website: https://www.precisionhealth.ie/
- Public location: 238 Blanchardstown Corporate Park 2, Blanchardstown, Dublin 15, D15 KV21.
- Public general contact: support@precisionhealth.ie; +353 1 910 4024.
- Neil Reddy: Co-founder & Medical Director.
- Stephen Kelly: Co-founder & Sales and Operations Director.
- Public services include workplace screening, corporate wellness, occupational health, vaccination programmes, cardiac services, education/workshops and mobile onsite services.
- The website identifies Meddbase as an existing occupational-health platform. Its replacement or integration has NOT been agreed for this project.

Business model:
- They deliver employer-sponsored screening, sometimes contracted through health insurers and sometimes directly with employers.
- Revenue comes from delivering contracted screening programmes and related services. Exact prices, margins, annual turnover, staffing totals and charging mechanisms were not supplied. Do not invent a financial dashboard or present an assumed per-patient price as fact.
- A programme can span multiple sites and weeks. A clinic is one dated session within a programme. An appointment type determines duration, questionnaire and nurse form.
- The example described in the recording is approximately 25 appointments per nurse per day, with 15-minute appointments. This is a workflow example, not the platform’s capacity limit.
- The meeting discusses customers such as Sisk, Salesforce, IBM and LinkedIn. Use Sisk, Salesforce and IBM as familiar demo programme labels. Their dates and numbers below are entirely synthetic.

What the evidence says about today’s process:
- Jotform handles separate booking, nurse-data and report-related forms.
- Some fields pass between steps through prefilled links. Staff still perform manual handoffs.
- Eurofins in Dublin provides laboratory results through an FTP-accessible CSV. Files are currently held in Google Workspace.
- Staff manually associate result rows with participants using identifiers.
- Excel supports calculations, screening classifications and clinician review displays.
- A clinician reviews results and writes advice. A PDF is assembled and emailed, with access details/password sent separately by SMS.
- Monday.com is used for business operations and nurse coordination, not as the patient clinical record.
- The supplied booking consent names Esendex for SMS delivery.
- The meeting summary reports that routine lab matching can take 20–30 seconds, with difficult cases taking much longer. Do not turn this into a measured ROI claim.

Key workflow decisions:
- The participant must complete required consent and the pre-screening questionnaire BEFORE confirming a booking. Neil explicitly says completion drops when this is left until afterwards. Correct any supplied mock-up that shows this mandatory step after confirmation.
- Invitation codes are created centrally by administrators, not independently by nurses.
- Forms are assembled from consistent clinical blocks. A blood-pressure block retains the same field definitions, units and validation wherever it is used.
- Completing an appointment, receiving all results and releasing a report are different milestones.
- The employer receives authorised aggregate reporting. It does not receive identifiable clinical records.
- Individual report release remains an authorised clinician action, including the “all normal” shortcut.
- The brief places AI drafting in P1, and direct laboratory APIs, employer SSO and longitudinal charts in P2. Demonstrate optional AI as a clearly marked preview; make the core workflow complete without it.
- Native mobile apps, prescribing, diagnosis automation, payments and unrestricted patient messaging are not part of this demo scope.
- Reuse the scheduling pattern for vaccination and training appointment templates. Do not invent full vaccination administration, occupational-health case management, cardiology treatment or training-certification modules.

Public research sources:
https://www.precisionhealth.ie/
https://www.precisionhealth.ie/corporate-team
https://www.precisionhealth.ie/corporate-wellness
https://www.precisionhealth.ie/occupational-health

Source material already reviewed:
- 19:34 recording, VIDEO-2026-10-02-11-53-18.mp4. It ends mid-discussion; do not invent later dialogue.
- The user’s longer meeting summary and Brenda’s email.
- Precision Health Screening Platform — Ten-Page Specification, supplier briefing draft v0.1 dated 28 September 2026. It is a proposed brief, not signed-off production requirements.
- Twelve concept screens, plus one mobile variant.
- Screening report Test.pdf, a 17-page sample participant report.
- Reporting Viewer.png, showing the existing compact, colour-coded clinical review.
- https://forms.precisionhealth.ie/213044163864958 — Comprehensive (LAB) Screen V2.
- https://forms.precisionhealth.ie/form/health-screening-acme-sample-site-2 — sample booking and consent form.
- https://www.precisionhealth.ie/poc-screen was supplied, but its embedded form was not readable during review. Do not infer its detailed fields.

### Section 3, branding and the eight staff profiles (brief lines 86 to 119)

3. BRANDING — PRECISION HEALTH OVER PULSE GLASS

Keep Pulse’s visual system. Apply Precision Health as an accent layer.

The following colours were observed in the public website’s theme. They are useful implementation values, not a claim to possess an approved brand manual:
- Primary teal: #5CA39A.
- Secondary sage: #97C2BC.
- Pale mint accent: #C0E0DC.
- Dark teal for readable buttons/selected text: #3D6D67.
- Deep teal: #1F3633.

Use dark teal with appropriately contrasting text for primary actions. Use primary teal/sage for charts, selected navigation and restrained highlights. Keep the existing neutral canvas, glass treatments, typography and border system. Retain semantic warning/error colours; brand colours must not obscure clinical status.

Use the supplied Precision Health logo if available in the project assets. Otherwise download the observed public image at build time into the existing assets directory:
https://static.wixstatic.com/media/8e98bf_c55adf123a3943f28f53e9460f09f55b~mv2.png/v1/crop/x_0,y_0,w_306,h_186/fill/w_224,h_130,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Screenshot%202020-06-03%20at%2015_28_00.png

Keep its proportions and legibility. Use a clean PH monogram fallback if loading fails. Do not recreate the logo through image generation or redesign it.

Organisation label: Precision Health. Product label: Pulse. Browser title: Precision Health | Pulse.
Default persona: Dr Neil Reddy, Medical Director.

Populate eight demo staff profiles using publicly listed names/roles:
- Neil Reddy — Medical Director; clinical reviewer.
- Stephen Kelly — Sales and Operations Director; programme oversight.
- Liz Bawle — Director of Nursing; clinical resource coordination.
- Fiona Fenton — Occupational Health and Wellness Nurse.
- Anita Mulhere — Occupational Health and Wellness Nurse.
- Ian Murtagh — Wellness Advisor.
- Martina Beattie — Wellness Business Manager; programme reporting coordination.
- Brenda Madden — Administration Support; bookings and import operations.

These eight profiles are the demo’s roster, not a claim about total employees. Operational assignments are fictional. Publicly listed emails are neil.reddy@precisionhealth.ie and stephen.kelly@precisionhealth.ie. For other profiles use clearly labelled demonstration aliases such as demo.brenda@precisionhealth.ie; never represent guessed addresses as verified, and never send messages.

Teams: Programme Operations; Nursing; Clinical Review; Client Programmes. Governance responsibilities appear in Settings with “Owner to confirm” where no actual owner was supplied.

### Section 5, navigation (brief lines 179 to 198)

5. FIXED SIDEBAR AND EVERY TOP-BAR PAGE

Use exactly these 12 sidebar modules, in this order. Reuse existing routes wherever possible. Route names below are logical destinations, not instructions to change routing libraries.

1) Home — existing AI chat homepage; retain its current composition.
2) Dashboard — Executive | Clinic Operations | Clinical Delivery.
3) Programmes — Overview | Programmes | Forms & Templates | Invitations.
4) Clinics — Overview | Schedule | Appointments | Team & Resources.
5) Participants — Directory | Screening History | Communications.
6) Results — Inbox | Imports | Review | Follow-up | Corrections.
7) Reporting — Overview | Report Builder | Exports.
8) Agents — Overview | Conversations | Activity.
9) Work — Tasks | Approvals | Workflows | Schedules.
10) Records — Companies | Contacts | Staff | Files | Ontology.
11) Activity — Everything | People | Agents | Needs Attention.
12) Settings — Organisation | Teams | Permissions | Systems & Integrations | Governance | AI Controls | Experience.

Do not add Sales, Finance, Procurement, Fleet or Inventory merely because Pulse has examples of them. This screening brief does not support those workflows. Put company relationships in Records and programme delivery in Programmes.

Participant Portal Preview is a separate responsive preview launched from the header or participant detail; it is not a thirteenth staff sidebar module. It has its own small participant navigation: Overview | Appointments | Questionnaire | My Results | Account.

### Section 6, shared synthetic operating model (planning assumptions) (brief lines 200 to 258)

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

### Section 8, RECORDS and SETTINGS (brief lines 356 to 377)

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

SETTINGS
- Organisation: public Precision Health details; demo timezone; fictional programme configuration. Avoid changing legal particulars elsewhere.
- Teams: the four demo teams and eight staff assignments; no invented employee total.
- Permissions: view-only role matrix plus a clearly labelled “Preview role” selector. Default Neil = assigned clinical review. Brenda = operations/logistics; Fiona = assigned clinical capture without doctor-only review actions; participant = own released data only. Demonstrate filtered UI across navigation, global search, drawers, files, agents and exports. This is a frontend visibility simulation, not production server-side security. Do not alter existing authentication.
- Systems & Integrations: use the exact source/system register in section 10 below. Each card has purpose, data boundary, simulated status and relevant activity. Never request credentials.
- Governance: proposed EU-hosting requirements, retention decision awaiting client approval, access-review register, clinical-rule owner, form-version history, DPIA/assurance evidence checklist and security testing status. “Required,” “To confirm” and “Sample evidence” are truthful states. Do not assert that a prototype is compliant or independently tested. Do not hardcode the old consent form’s two-year retention into all future records; flag it for review.
- AI Controls: Drafting preview on/off; human approval required; permitted data scope; prohibited autonomous release/diagnosis/identity matching; model/provider labelled “Demo content — no model connected.” Turning AI off must leave manual advice and manual employer narrative authoring fully usable.
- Experience: existing theme/density/accessibility controls, demo clock, role preview and “Reset demo.” Reset restores all baseline records and counts and asks for confirmation only within the app’s ordinary demo interaction.

### Section 10, seven agents and existing systems (brief lines 401 to 429)

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

## Settings and Records: what the model gives you

- Organisation: public Precision Health details from `BRAND` (legal name Precision Healthcare Ltd, company number 551990 as public branding context, address, support email and phone, website), demo timezone Europe/Dublin, fictional programme configuration (`state.programmes`, clinic day config `CLINIC_DAY`, 25 slot derivation). Do not alter legal particulars elsewhere. Note that the logo and company number are branding context, not verified contracting details.
- Teams: `state.teams` (Programme Operations, Nursing, Clinical Review, Client Programmes) and the eight staff assignments (`act.assignTeam(staffId, team)`, which updates references everywhere). No invented employee total: say the eight profiles are a demonstration roster. Governance owners show "Owner to confirm" where `ownerId` is null.
- Permissions: view-only role matrix from `PERM_DEFS` and `ROLE_LABEL` (rows are capabilities, columns are roles) plus a clearly labelled "Preview role" selector (`act.setPersona`, and `nav.openPortal()` for the participant). Default Neil. Show what the previewed role can and cannot see across navigation, global search (`globalSearch`), drawers, files (`visibleFiles`), agents and exports, as a live demonstration table. State plainly: frontend visibility simulation, not production server-side security, and authentication is unchanged. Brenda can manage clinic bookings and unresolved import counts but cannot view blood values or participant clinical reports.
- Systems and Integrations: `INTEGRATIONS` (Jotform, Eurofins CSV / FTP, Google Workspace, Excel, Monday.com, Esendex, Email, Meddbase) with purpose, data boundary, simulated status text exactly as given, and relevant activity (`activityFeed` filtered by `event.integrationId`). Never request credentials, never claim a live connection, do not upgrade FTP to SFTP, do not claim Gmail API or Graph, no Meddbase records. Show the Jotform to Pulse forms transition mapping.
- Governance: `state.settings.governance` items with truthful statuses (`GOVERNANCE_STATUS_LABEL`: Required, To confirm, Sample evidence, Not started, Awaiting client approval). No green certification badges, no claim that the prototype is compliant or independently tested. Retention decision awaiting client approval (do not hard-code the old two-year consent period into future records; flag it for review). Access-review register (sample), clinical-rule owner (`act.setGovernanceOwner` records an owner but never changes a status), form-version history (derive from `state.forms.templates[].versions`), DPIA and assurance evidence checklist, security testing status, EU-hosting requirement (proposed), and a "Planning assumptions, to confirm" note from `PLANNING_ASSUMPTIONS` (not executive KPIs).
- AI Controls: `act.setAiDrafting(on)` (`state.settings.aiDraftingOn`); human approval required (locked on); permitted data scope; prohibited autonomous release, diagnosis and identity matching; model and provider labelled "Demo content, no model connected." Turning AI off must leave manual advice and manual employer narrative fully usable: say so and, as a live proof, show the manual paths still work (link to the Review and Report Builder screens). List the seven agents and what each is permitted to do.
- Experience: theme, density, accessibility and reset. The theme controls and shell state come from the `shell` object on `useNav()` (added by the core: `nav.shell.theme`, `nav.shell.setTheme(id)`, `nav.shell.themes`, `nav.shell.density`, `nav.shell.setDensity("comfortable"|"compact")`, `nav.shell.reduceMotion`, `nav.shell.setReduceMotion(bool)`, `nav.shell.openBackgrounds()`); if `nav.shell` is undefined, hide those controls. Demo clock presets (`CLOCK_PRESETS`, `act.setClock(presetId)`; moving the clock only changes time-derived states such as overdue), role preview, and "Reset demo" (import `resetDemo` from `src/ph/store`; restores the exact baseline and asks for confirmation inside the app).
- Records Companies: `state.companies` (Precision Health, Sisk, Salesforce, IBM as relationship records; Eurofins and Esendex as supplier and service records), linked programmes (`EntityLink kind="programme"`) and integrations (link to Settings, Systems and Integrations with `params: { system: id }`), fictional HR contacts (`state.contacts`, example.com, no access to individual clinical results). Real client names, synthetic contacts and activity, no invented contract amounts. Records Staff: the same eight profiles with team, role label, demo permissions summary, assigned clinics and tasks today (derive from `state.sessions`, `visibleTasks`), publicly listed emails marked verified for Neil and Stephen and demonstration aliases marked as such; changes made through Settings, Teams show here.

## Acceptance for this task

- All seven Settings tabs are real; role preview visibly changes what the app shows; Reset demo restores the exact baseline.
- Companies and Staff are populated, linked and consistent with the rest of the store.
- Nothing claims certification, live integration or compliance.
- Check as Neil, Brenda and Stephen.

## Report contract

Write your full report to the report path given in the dispatch. Return only: status (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT or BLOCKED), the list of files created, a one line verification summary, and concerns. The report file lists: features built per tab, which brief chains you exercised and how, deviations from the brief and why, model or UI kit gaps and workarounds, and any bugs found in shared code.
