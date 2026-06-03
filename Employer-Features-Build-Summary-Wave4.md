# Doondo V2 — Employer Features Build Summary (Wave 4)

This wave completed the remaining items from the 24-feature list. Every feature is full-stack (Express/Mongoose backend + Expo/React Native mobile), ships English and Hindi copy, follows the repo's existing conventions (`{ ok, data, requestId }` envelope, Zod validation, `requireAuth`/`requireRole`, react-query, theme tokens, `useTranslate`), and leaves both apps at **zero TypeScript errors**.

Backend typecheck (per app): `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` → 0 errors for both `apps/backend` and `apps/mobile`.

---

## 37 · Monthly consolidated statement

**What** A month-end PDF per employer: each worker's shifts, hours, days worked, and settled pay, plus totals.

**Backend** `modules/statement/` — `getMonthlyStatement(employerId, month)` reuses the timesheet roll-up for hours and aggregates `paid` UPI `PaymentIntent`s per worker, unioning both id sets so cash-with-hours and pay-spanning-the-boundary workers both appear. Route `GET /statement?month=YYYY-MM` (employer-only).

**Mobile** `statement.api.ts` + a "Monthly statement (PDF)" button on the My-crew screen that renders HTML → `expo-print` → `expo-sharing` fully on-device.

**Where** My crew screen (Workforce).

---

## 38 · "Needs you now" Home aggregation

**What** A single prioritized action feed so the employer doesn't hunt across screens.

**Backend** `modules/needsYouNow/` — a read-only roll-up across applications, work proofs, and crew documents. Surfaces, ranked by urgency: workers en route (12h window), worker counter-offers, work photos awaiting review, applicants waiting > 24h, and expiring/expired crew docs. Each item carries a `route` + optional `applicationId` for deep-linking. Route `GET /needs-you-now`.

**Mobile** `needsYouNow.api.ts` + a "NEEDS YOU NOW" section at the top of the employer Home, each row icon-tinted and tappable to the right destination. The old single-line nudge now only shows when the feed is empty.

**Where** Employer Home, above the pulse strip.

---

## 39 · Dispute resolution

**What** A two-sided, formal grievance flow tied to one hire.

**Backend** `modules/disputes/` — `Dispute` model (category, description, evidence photos, status lifecycle, reply thread, resolution) scoped to an application. Service: raise / list / get / respond / resolve, each authorizing that the caller is a party; only the raiser can withdraw. Both parties are notified (`dispute_raised`, `dispute_update`) on every change. Routes under `/disputes` (auth-gated, role inferred).

**Mobile** `disputes.api.ts` + a shared `DisputeSection` component (status pill, thread, raise modal with category chips + photos, inline reply / resolve / withdraw), wired into both the employer's ApplicantDetail and the worker's My Applications for hired applications.

**Where** ApplicantDetail (employer) and My Applications (worker), hired hires.

---

## 40 · Auto-escalate a stalling job

**What** A graduated ladder that detects an under-filled job and acts.

**Backend** Job gained an `escalation` subdoc (`stage`, `lastEscalatedAt`, `boostedUntil`) surfaced on `PublicJob` as `escalationStage` + `boostedUntil`. `modules/jobs/escalation.service.ts` cron sweep advances stalling jobs: stage 1 boosts the post in the "right now" feed for 48h, stage 2 keeps the boost live and nudges with a specific fix (raise wage if below the local market, reusing the wage benchmark), stage 3 is a final repost/edit nudge. Time-gated, one stage per sweep. Env `ESCALATION_CRON` / `ESCALATION_STALL_HOURS` / `ESCALATION_STAGE_GAP_HOURS`; scheduler + bootcheck registered; `job_escalated` notification. The scored feed adds a real ranking boost while `boostedUntil` is live.

**Mobile** `PublicJob` carries the new fields; the employer job card shows a "⬆ Boosted" or "Needs attention" chip.

**Where** Posts screen (employer job cards); the escalation itself runs server-side.

---

## 41 · Group / squad hire

**What** Reusable named worker groups deployed to a job in one tap.

**Backend** `modules/squads/` — `Squad` model (employer-scoped, unique name) + service for create / list / delete / deploy. `deploySquad` reuses the one-tap `rehireCrewMember` path for each member (upsert shortlisted application + time-boxed offer), collecting per-member success/failure. Routes under `/squads`.

**Mobile** `squads.api.ts` + a "SQUADS" section on My crew: a builder modal (name + tick crew members), per-squad cards with members, "Deploy to job" via the active-job picker, and inline delete; deploy shows a result summary.

**Where** My crew screen (Workforce).

---

## 42 · Multi-day project mode

**What** A job posted as a multi-day project with a date span and day-by-day progress.

**Backend** Job gained `projectStartDate` / `projectEndDate`; `PublicJob.project` exposes `{ startDate, endDate, totalDays }` via a `buildProject` helper (both build sites). `getProjectProgress(employerId, jobId)` computes Day X of N, days remaining, percent elapsed, and per-hired-worker days attended from shift check-ins. Route `GET /jobs/:id/project-progress`.

**Mobile** `PublicJob.project` type + `jobsApi.projectProgress`; PostJob has a "Multi-day project?" toggle with start/end dates; JobApplicants shows a progress card (Day X of N, bar, date range, per-worker days attended).

**Where** Post a job (toggle) and Job applicants (progress card).

---

## 43 · Reached-home-safe check-out loop

**What** A gentle, opt-in safety bookend after a shift.

**Backend** `modules/homeSafe/` — `HomeSafeCheck` opened automatically when a worker checks **out** of a shift (idempotent within 6h). `confirmSafe` marks it safe and, gated on the existing `shareShiftsWithCircle` opt-in, sends a reassurance push to Trust Circle contacts (new `sendHomeSafeCirclePush`, `reached_home_safe` notification). No auto-alarm. Routes `GET /home-safe/pending`, `POST /home-safe/:id/confirm` (seeker).

**Mobile** `homeSafe.api.ts` + a banner at the top of My Applications listing pending prompts with an "I'm home safe" confirm button.

**Where** My Applications (worker), after a shift check-out.

---

## 44 · Masked in-app calling (provider-abstracted)

**What** A privacy-preserving "Call via Doondo" between hire parties. Real number-masking needs a telephony provider, so this ships as a provider abstraction with a working fallback.

**Backend** `lib/maskedCall.ts` — `createProxySession` returns null while `MASKED_CALL_PROVIDER='none'` (default), so the flow falls back to the gated number reveal and the call still connects; Exotel/Twilio slot in behind the env switch. `modules/maskedCall/` — `MaskedCallSession` audit model + `initiateCall` (verifies the caller is a party, tries a proxy, else reveals the real number, records every attempt). Route `POST /masked-call`.

**Mobile** `maskedCall.api.ts` + a "Call via Doondo" button on the employer's ApplicantDetail (hired) that dials the returned number (`tel:`) — masked when a provider exists, real-number fallback otherwise. The backend is symmetric, so the worker-side button is a trivial future addition.

**Where** ApplicantDetail (employer), hired workers.

---

## Cross-cutting notes

- **Notification kinds added** this wave: `dispute_raised`, `dispute_update`, `job_escalated`, `reached_home_safe`.
- **Env vars added**: `ESCALATION_CRON`, `ESCALATION_STALL_HOURS`, `ESCALATION_STAGE_GAP_HOURS`, `MASKED_CALL_PROVIDER`.
- **Scheduler**: one new cron (job auto-escalation), registered with cron-validation in `bootcheck.ts`.
- **bootcheck.ts** registers all new models and services (statement, needsYouNow, disputes, escalation, squads, homeSafe, maskedCall) plus the new cron.
- **i18n**: every user-facing string added to `en.json` and `hi.json`; the other locales (ta/te/kn) fall back to English via `fallbackLng`.

## Setup to fully activate

1. **Masked calling** — set `MASKED_CALL_PROVIDER` and wire the provider call in `lib/maskedCall.ts` (currently a marked hook). Until then, "Call via Doondo" reveals the real number.
2. **Auto-escalation cron** — runs when `SCHEDULER_ENABLED=true`; tune `ESCALATION_STALL_HOURS` / `ESCALATION_STAGE_GAP_HOURS` to taste.
3. **Monthly statement PDF** relies on `expo-print` (~15.0.8) and `expo-sharing` (~14.0.8), both already in `apps/mobile/package.json`.
