# Precision Health on Pulse: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One module per agent, strict file ownership, verify in the browser before reporting.

**Goal:** Turn the existing Pulse v4 Glass frontend (Kilbride Group demo) into one connected, fictional Precision Health screening operation, as specified in `Precision_Health_Pulse_Implementation_Prompt.txt` (the brief).

**Architecture:** A deterministic synthetic model (`src/ph/model`) feeds one in-memory store (`src/ph/store.ts`). New pages are React components that read selectors with `usePh` and change state only through `dispatch(act.xxx())`. `PulseLogic` keeps page, tab and deep-link params, and renders the retained views (Home chat, Agents conversations, Ontology, Files, Contacts) from the same store through `src/logic/phBridge.js`.

**Tech stack:** React 18, TypeScript strict, Vite 6. No new dependencies. No charting library: use `src/ph/ui/charts.tsx`.

## Global constraints (copied from the brief and `CLAUDE.md`)

- Frontend only. Synthetic data only. No API calls, no AI API, no live messaging, no real uploads, no credentials.
- Demo clock: Monday 5 October 2026, 08:15 Europe/Dublin. Use `fmt*` helpers from `src/ph/model/time.ts`. Irish dates (`5 Oct 2026`, `05/10/2026`), 24-hour times, EUR.
- Keep Pulse Glass: tokens only (`var(--surface)`, `var(--accent)`, `var(--ok)` ...). Brand teal is already in the harbour theme. Do not hard-code colours except semantic tones via `Pill`/`TONE`.
- Status is text plus icon plus colour. Clinical severity colours (`--warn`, `--bad`) are never replaced by brand colours.
- No lorem ipsum, no dead buttons, no invented counts. Every number comes from a selector. No `any`, no `@ts-ignore`.
- Copy: plain Irish register, no exclamation marks, no emoji, no em dashes, no "Welcome to". Label fictional/simulated content ("Simulated", "Fictional demo event", "Sample data").
- Normal and abnormal interpretation is illustrative and clinician-owned. Say "Review required", never a diagnosis.
- Home centre column stays clean. Agents sits directly under Home. Records opens on Ontology. Do not run `npm run import-design`.
- Roles: Neil (clinical review) is the default persona. Brenda (operations) never sees blood values or participant clinical reports. Fiona (clinical capture) cannot do doctor-only review actions. Participant sees own released data only. Use `usePersona()` and `can()`.

## File map and ownership

| Path | Owner |
| --- | --- |
| `src/ph/model/**`, `src/ph/ui/**`, `src/ph/store.ts`, `src/ph/nav-context.tsx`, `src/ph/shell/**`, `src/styles/ph.css` | Core (read only for module agents) |
| `src/ph/pages/Results/**` | Agent A |
| `src/ph/pages/Clinics/**` | Agent B |
| `src/ph/pages/Programmes/**` | Agent C |
| `src/ph/pages/Participants/**`, `src/ph/pages/Portal/**` | Agent D |
| `src/ph/pages/Dashboard/**`, `src/ph/pages/Reporting/**` | Agent E |
| `src/ph/pages/Work/**`, `src/ph/pages/Activity/**`, `src/ph/pages/Agents/**` | Agent F |
| `src/ph/pages/Settings/**`, `src/ph/pages/Records/**` | Agent G |
| `src/logic/**`, `src/views/**` (Home, Agents conversations, Ontology, Files, Contacts, palette, overlays) | Core |

Module agents may add files only inside their folder. Page components receive `{ tab }` (see `PhRouter.tsx`). If a screen needs a new action, call `registerHandlers({...})` from `src/ph/model` at import time inside your folder and dispatch the raw action. Selectors specific to your module live in your folder.

## Interfaces every agent relies on

- `usePh(selector)`, `usePersona()`, `useCan(perm)`, `useDispatch()`, `dispatch` from `src/ph/store.ts`.
- `act.*` action creators in `src/ph/model/reducer.ts`. Every handler is idempotent and permission-checked. A failed action leaves state untouched and returns a message that `dispatch` shows as a toast.
- `useNav()` from `src/ph/nav-context.tsx`: `{ page, tab, params, go({page, tab, params}), setTab, setParams, openPortal }`. Deep links use `#/Page/tab?key=value`. Params used: `batch`, `row`, `episode`, `followup`, `person`, `session`, `booking`, `date`, `programme`, `template`, `draft`, `message`, `filter`, `queue`, `report`, `task`, `approval`, `company`, `staff`, `file`, `agent`, `event`, `system`.
- Selectors in `src/ph/model/selectors/*`: counts (`programmeCounts`, `todayStats`, `sessionStats`, `slotGrid`), clinical (`reviewQueue`, `episodeBundle`, `releaseChecklist`, `routineEligibility`, `holdQueue`, `batchStats`, `followUpList`), operations (`storyViews`, `taskViews`, `approvalViews`, `activityFeed`, `reminderStats`, `jobViews`), reporting (`employerMetrics`, `cohortEpisodes`, `exportMetrics`), people (`directory`, `personTimeline`, `ontologyModel`, `globalSearch`, `visibleFiles`).
- UI kit in `src/ph/ui`: `PageHeader`, `Card`, `CardHeader`, `Kpi`, `KpiStrip`, `Pill`, `DemoTag`, `Button`, `Field`, `TextInput`, `Select`, `Textarea`, `SearchBox`, `Checkbox`, `Switch`, `Segmented`, `Chip`, `Checklist`, `ProgressBar`, `EmptyState`, `RestrictedNotice`, `EntityLink`, `InfoTip`, `Split`, `DataTable`, `Drawer`, `Modal`, `HBars`, `Columns`, `Stacked`, `Funnel`, `Donut`, `Spark`, `Icon`. Classes in `src/styles/ph.css`.

## Tasks

Each task ends with: `npx tsc -b` clean, no console errors, the module's chains exercised in the browser at about 1280px and 800px widths, as Neil and as the restricted role the brief names, and a short report.

- [ ] **A. Results** (brief section 8 RESULTS, problems A, B, E, chains in section 11): Inbox, Imports (batch list, mapping preview, validation summary, row drawer, resolution form with two-identifier check, sample CSV load and re-upload, source unit confirmation), Review (compact three-pane workspace: queue, values with flags and provenance, advice, checklist, report preview, routine one-click only when eligible, AI draft preview), Follow-up, Corrections.
- [ ] **B. Clinics** (RESULTS of problem C, D; brief CLINICS and clinical workspace details): Overview grid, Schedule (week and day calendar, 19 sessions, edit with impact preview, overlap detection), Appointments (day list, clinical workspace with autosave, identity check, BMI, specimens and labels preview, completion), Team & Resources.
- [ ] **C. Programmes** (problems C, D): Overview, Programmes (table, detail), Forms & Templates (three-pane composer: blocks, ordered sections, field and version preview, conditional preview, draft version, publication approval), Invitations (codes, funnel, draft list, confirm-recipients send).
- [ ] **D. Participants and Portal** (problem F; section 9): Directory, Screening History, Communications (45 reminders, failures, retry), and the participant portal preview (Orla onboarding to booking, Aisling released report, reschedule and cancel, 375px safe).
- [ ] **E. Dashboard and Reporting** (problems B, C, G): three dashboard tabs with concise KPI strips and different chart forms; Overview, Report Builder (cohort filters, funnel, breakdowns with suppression, narrative, approvals), Exports (print preview and PowerPoint preview from the frozen snapshot).
- [ ] **F. Work, Activity, Agents tabs**: Tasks, Approvals, Workflows, Schedules; Activity four filters; Agents Overview and Activity.
- [ ] **G. Settings and Records**: seven Settings tabs including role matrix and preview role, systems register, governance, AI controls, experience (theme, density, clock, reset); Records Companies and Staff.
- [ ] **Core (parallel):** Home chat and widget rail, Agents conversations, Ontology data, Files and Contacts, command palette, notifications, remove Kilbride remnants.

## Verification (final)

`npx tsc -b`, `node tools/verify-ph.mjs`, `npm run build`, grep for `Kilbride`, a walkthrough of the ten action chains in section 11 of the brief, widths 1280, 800 and 375.
