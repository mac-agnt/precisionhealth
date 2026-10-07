# Precision Health on Pulse

A frontend-only, synthetic-data demo of Pulse for **Precision Health**, an employer-sponsored health screening service in Ireland. It is the Pulse "Harbour" glass interface re-skinned and extended with the screening workflow: programmes, clinics, participants, laboratory results, clinician review, employer reporting and a participant portal preview.

Everything on screen is fictional. There is no backend, no database, no AI model call, and nothing is sent, uploaded or stored outside the browser tab. A persistent "Demo, synthetic data" label is in the shell, and anything that would reach the outside world (SMS, email, lab files, integrations) is marked **Simulated**.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # strict TypeScript
npm run verify     # model checks: baseline arithmetic and the demo workflows
npm run build      # type-check + production build into dist/
```

The demo clock is fixed at **Monday 5 October 2026, 08:15 Europe/Dublin**. The default persona is Dr Neil Reddy, Medical Director. Use the persona menu in the top bar to preview another role, and the shell controls to move the clock or reset the demo.

Every screen is linkable: `#/Results/imports?batch=BATCH-20261002-01`, `#/Participants/directory?person=PH-P-0001`, and so on.

## What is in it

| Module | Tabs |
| --- | --- |
| Home | Pulse chat, deterministic answers with links to the records behind them |
| Agents | Conversations, Activity (seven agents, all drafting or watching, none acting) |
| Dashboard | Executive, Clinic Operations, Clinical Delivery |
| Programmes | Overview, Programmes, Forms & Templates, Invitations |
| Clinics | Overview, Schedule, Appointments, Team & Resources |
| Participants | Directory, Screening History, Communications |
| Results | Inbox, Imports, Review, Follow-up, Corrections |
| Reporting | Overview, Report Builder, Exports |
| Work | Automations, Tasks, Approvals, Workflows, Schedules |
| Records | Ontology, Files, Contacts, Companies, Staff |
| Activity | Everything, People, Agents, Needs Attention |
| Settings | Organisation, Teams, Permissions, Systems & Integrations, Governance, AI Controls, Experience |

Three portal previews sit outside the staff navigation. Open them from the persona menu (top right):

| Portal | For | What it does |
| --- | --- | --- |
| Participant | The screened employee | Invitation code, your details (Irish mobile format), Precision Health's consent form, pre-screening questionnaire, then a time slot. Consent and questionnaire come before a booking is confirmed. My Results shows the released report in the same structure as the PDF sent today. Deep link `?portal=1&person=PH-P-0801`. |
| Nurse | The nurse on clinic day | Picks the nurse, opens today's clinic, checks in with two identifiers, and runs the Sisk Comprehensive (LAB) V2 nurse form section by section, with questionnaire answers to confirm, ECG codes, FIT and PSA informed choice, specimen labels, sign-off and a courier manifest at clinic close. Deep link `?nurse=1`. |
| Client | The employer's HR contact | Aggregate programme figures, upcoming clinic capacity, the booking link to share, and approved employer reports. No names, no individual results. Deep link `?client=1`. |

## Built from Precision Health's own material

`docs/client-source/INPUTS.md` records everything Precision Health sent on 2 October 2026: the booking form, the Sisk Comprehensive (LAB) V2 nurse form, the clinician's Reporting Viewer, the 17-page sample report and the ten-page specification. Where the demo and that file disagree, that file wins.

- **Nurse form**: every field, option and rule on their form, including "Approve? No. Significantly abnormal results. Refer to doctor." (creates a doctor review task) and "Irregular ECG and irregular pulse: send photos to the clinical channel" (creates an ECG review task; replaces Slack).
- **Lab panel**: 28 tests plus calculated non-HDL and Total:HDL, with the ranges from their report and their four colours: green normal, yellow borderline, orange outside range, grey not tested.
- **Clinician viewer**: Results, Review uses their viewer's labels and layout, with the red NEW ADVICE box as the advice editor.
- **Participant report**: one renderer (`src/ph/report/ScreeningReport.tsx`) for the portal, the clinician preview and print. It follows their sample report page by page.
- **Automations**: Work, Automations lists 16 flows, each with how it runs today (Jotform, Esendex, Eurofins FTP, Google Workspace, Excel, Slack, Monday.com) and how Pulse runs it, with live counts and a source label.

Decisions for Precision Health to confirm: the illustrative band rules (`RULE_SET_LABEL`), ranges with no source in their material (ALP, B12, folate), blood pressure below 140/90 shown green with the word MILD (as in their viewer and report), QRISK3 values shown as sample output of a licensed engine, the drafted report text for vitamins and minerals and for breast and cervical screening, the preparation instructions in the booking flow, the 48-hour review escalation, and the small-cell rules (employer export blocked under 10, cells hidden under 5; the spec proposes 10 for both).

Two layout rules come from `CLAUDE.md` and override the client brief: **Agents sits directly under Home**, and **Records opens on Ontology**.

## How it fits together

```
src/ph/model     fixtures, reducer, selectors, deterministic answer engine (no React)
src/ph/store.ts  one in-memory store shared by every screen
src/ph/ui        shared primitives: buttons, tables, drawers, charts
src/ph/pages     one folder per module
src/ph/shell     brand, persona menu, demo badge, Home board, ontology drawer
src/logic        PulseLogic (page and chat state) and phBridge.js (joins it to the store)
src/views        original Pulse shell and pages (Home, Agents conversations, Records)
```

- **One store.** Every number on every screen comes from selectors over the same state, so the totals agree everywhere: 850 invited, 475 capacity, 365 booked (225 attended, 140 upcoming); 184 released, 21 ready, 15 awaiting, 5 held; today 45 of 75 slots, 30 available.
- **Reducer.** Actions are pure: they clone the state, check the signed-in role, and either apply or return the original state with an explanation. Replaying an action does nothing the second time.
- **Roles are a visibility simulation.** The permission matrix controls what each persona can see and do on screen. It is not production security.
- **Employer output is disclosure controlled.** Cohorts under ten people are blocked, small cells are suppressed with complementary suppression, and a report keeps its "data as of" snapshot until refreshed.
- **Answers are prewritten.** Pulse and the agents compose their replies from the current records. Unsupported questions get a short list of supported ones rather than an invented answer.

## Walkthrough threads

| Thread | Where to look |
| --- | --- |
| Three lab identity exceptions, resolved by a person | Results, Imports |
| 21 reports ready, 6 over 48 hours, release one at a time | Results, Review |
| Ronan: LDL 3.2 against a displayed limit of 3.0 shows "Review required" | Results, Review, PH-E-0201 |
| IBM capacity: 15 slots today, five invitees still in progress | Programmes, Invitations |
| Failed reminders (2), retry moves one from failed to delivered | Participants, Communications |
| Urgent follow-up due 09:00, needs an outcome and acknowledgement | Results, Follow-up |
| Sisk employer report, six-person filter blocked | Reporting, Report Builder |
| Orla books through the portal | Participant portal |
| Nurse referral and irregular ECG raise doctor tasks | Nurse portal, then Work, Tasks and Work, Automations (AUT-06, AUT-07) |
| Bloods not taken: completes with a reason, goes straight to review | Nurse portal |
| Employer sees only aggregates | Client portal |

## Customising

Read `CLAUDE.md` first. It lists the layout rules every copy keeps. Backgrounds are set in `src/App.tsx`, theme colours in `src/styles/pulse.css` (default theme `harbour`; `light` is retinted to the same teal).

Do not run `npm run import-design` on this copy. It regenerates `src/views/`, `src/styles/` and `src/logic/` from the design file and would remove the Precision Health layer.

## Honest limitations

- Synthetic data only. Sample results and reference limits are illustrative, not clinical guidance.
- The demo state lives in memory. Reloading the page restores the baseline.
- The role switch changes what the interface shows. It does not authenticate anyone.
- Integrations, messages and exports are simulated. Nothing leaves the browser.
- Reports print through the browser; there is no server-side PDF.
