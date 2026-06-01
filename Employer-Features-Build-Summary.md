# Doondo — Employer Features Build Summary

**Date:** 1 June 2026
**Scope:** 17 net-new employer-side features, built full-stack (backend + mobile + English/Hindi i18n) in one session.
**Status:** All features typecheck clean on both `apps/backend` and `apps/mobile` (0 errors). Not yet exercised on a device — this doc is to support that review.

Every feature followed the repo's existing conventions: Zod-validated routes, the `{ ok, data, requestId }` response envelope, the `apiRequest` client wrapper, Mongoose subdocs mirroring `paymentConfirmation`/`interview`, cron sweeps mirroring `interviewReminders`, and the `loadRecognizer`-style graceful degradation for native modules. Tamil/Telugu/Kannada fall back to English, matching the repo's partial-translation pattern.

---

## How to verify

```bash
# Backend typecheck
cd apps/backend && npm run typecheck
# Mobile typecheck
cd apps/mobile && npx tsc --noEmit -p tsconfig.json
```

The deterministic voice parser was additionally unit-checked against 8 utterances (English, Hindi, romanised) during the build.

---

## Features

### Wave 1

**1. Voice Command Posting** — employer speaks a job ("2 dishwashers, Friday night, ₹600"), the post form pre-fills.
- Backend: `modules/postDraft/` (deterministic multilingual parser, service, route). `POST /post-draft/voice`.
- Mobile: `lib/speechToText.ts` (extracted from the seeker voice agent), `screens/employer/VoicePostButton.tsx`, wired into `PostJobScreen`.

**2. Private worker notes** — employer-only note per worker, never shown to the worker.
- Backend: `modules/workerNotes/`. `GET/PUT/DELETE /worker-notes/:workerId`.
- Mobile: `api/workerNotes.api.ts`, `WorkerNoteCard` on `ApplicantDetailScreen`.

**3. Blind first-pass review** — toggle masks photo/name/location on unreviewed (pending) applicants; mask lifts once advanced.
- Mobile only (client-side): `ApplicantCard` `blind` prop + toggle on `JobApplicantsScreen`.

**4. Per-payment receipts** — GST-friendly payment record (company name + GSTIN + amount + ref).
- Backend: `GET /payments/:id/receipt` added to the payments module.
- Mobile: `paymentsApi.receipt`, "Share receipt" button on `UpiPaymentPanel` (OS share sheet).

**5. Re-tap past applicants** — prior applicants now broadcasting availability nearby.
- Backend: `modules/pastApplicants/` (intersects prior applicants with live beacons; excludes hired/pending). Extended `availabilities.findNearby` with an optional `seekerIds` filter. `GET /past-applicants`.
- Mobile: strip on `AvailableWorkersScreen`.

**6. Night-before confirmation ping** — auto "confirm you're coming tomorrow"; no reply flags for backfill.
- Backend: Application `nextShiftAt` + `shiftConfirmation` subdoc; `setNextShift`/`confirmShift` services + endpoints (`PUT /applications/:id/next-shift`, `POST /applications/:id/confirm-shift`); **cron** `shiftConfirmation.service` (`SHIFT_CONFIRM_CRON`, IST evening); `sendShiftConfirmationPush`.
- Mobile: worker confirm card on `MyApplicationsScreen`; employer `EmployerShiftCard` (quick-set + status) on `ApplicantDetailScreen`.

### Wave 2

**7. Labor budget tracker** — weekly/monthly wage budget + live spend-to-date.
- Backend: `modules/laborBudget/` (spend summed from paid PaymentIntents in the current window). `GET/PUT /labor-budget`.
- Mobile: budget card on `EmployerProfileScreen`.

**8. Self-qualifying skill checks** — attach a SkillTest to a job; employer sees who passed.
- Backend: jobs gain `requiredSkillTestId` (validated against the catalogue). Reuses existing `skillTests` + `/seekers/:id/passed-tests`.
- Mobile: picker on `PostJobScreen`, `SkillCheckBadge` on `ApplicantDetailScreen`.

**9. Response SLA & quiet hours** — employer sets reachable hours; anti-ghost sweep won't flag them overnight.
- Backend: `modules/employerResponse/`; `ghostSweep` skips employers in their IST quiet window. `GET/PUT /employer-response`.
- Mobile: "Quiet hours" card on `EmployerProfileScreen`.

**10. Hire-by-headcount** — post once for N people; pipeline tracks fill.
- Backend: jobs gain `headcount` (1–100).
- Mobile: headcount field on `PostJobScreen` (voice draft fills it), "X of N hired" indicator on `JobApplicantsScreen`.

**11. Arrival-likelihood score** — "will they show up?" band from distance + shift time + rating.
- Backend: `modules/arrivalLikelihood/` (haversine + heuristic, transparent factors). `GET /arrival-likelihood/:applicationId`.
- Mobile: card on `ApplicantDetailScreen`.

**12. Auto-expiring offers** — time-boxed offer; worker accepts (→ hired) / declines; lapses automatically.
- Backend: Application `offer` subdoc; `makeOffer`/`respondToOffer` services + endpoints (`POST /applications/:id/offer`, `/offer-response`); **cron** `offerExpiry.service` (`OFFER_EXPIRY_CRON`); 3 notification kinds + push helpers.
- Mobile: employer `OfferCard` (24h/48h, countdown, outcome); worker `OfferResponseCard` (countdown, accept/decline) on `MyApplicationsScreen`.

### Wave 3

**13. Photo proof of work** — worker submits a finished-job photo; employer approves.
- Backend: `modules/workProof/` (own collection, like shift check-ins). `GET/POST /work-proof/:applicationId`, `POST .../review`.
- Mobile: worker submit card (camera) on `MyApplicationsScreen`; employer photo + Approve/Reject on `ApplicantDetailScreen`.

**14. Workers your trusted employers rated** — workers rated 4★+ by other employers in your city.
- Backend: `modules/trustedWorkers/` (employer→worker ratings graph, city-scoped, excludes your pipeline). `GET /trusted-workers`.
- Mobile: strip on `AvailableWorkersScreen`.

**15. Import-your-workers** — import phone contacts; matched workers join your crew.
- Backend: `modules/crew/` (phone last-10 match across +91/0/spacing variants). `GET /crew`, `POST /crew/import`, `DELETE /crew/:workerId`.
- Mobile: rebuilt `WorkforceScreen` as "My crew" (contacts via `expo-contacts`, invite-via-share for non-Doondo contacts).

**16. SMS new-applicant alerts (outbound)** — opt-in SMS to the employer on a new application.
- Backend: `lib/transactionalSms.ts` (console provider in dev — one-function swap for a real provider); opt-in `smsApplicantAlerts` on employer-response; fire-and-forget hook in `apply()`.
- Mobile: toggle on the response-settings card.

**17. On-the-way status (foreground)** — worker taps "I'm on my way"; employer sees an ETA estimate.
- Backend: Application `onTheWay` subdoc; `markOnTheWay` service (haversine ETA) + `POST /applications/:id/on-the-way`; `sendWorkerOnTheWayPush`.
- Mobile: "I'm on my way" on the worker shift card; en-route status on the employer shift card.

---

## Cross-cutting infrastructure added

- **New cron sweeps:** night-before shift confirmation, offer expiry (both registered in `modules/scheduler`).
- **New libs:** `lib/speechToText.ts` (shared STT adapter), `lib/transactionalSms.ts`.
- **New notification kinds:** `shift_confirmation`, `offer_made`, `offer_resolved`, `offer_expired`, `worker_on_the_way` + matching push helpers in `lib/push.ts`.
- **New env config:** `SHIFT_CONFIRM_CRON`, `SHIFT_CONFIRM_LEAD_HOURS`, `OFFER_EXPIRY_CRON`.
- **Application model** gained four additive subdocs (`nextShiftAt`/`shiftConfirmation`, `offer`, `onTheWay`) + indexes, all mirroring the existing `paymentConfirmation` pattern.
- The `WorkforceScreen` "coming soon" stub is now a real screen.

---

## Not built — needs infrastructure (recommend a separate session)

- **Travel-time map** — needs a routing/distance-matrix API (Google/Mapbox): key, billing, provider integration. Straight-line distance is not a substitute.
- **Geofenced auto clock-out** — needs background geofencing (`expo-location` background tasks + OS geofence registration); correctness depends on permissions, battery, and exit-reliability that only on-device testing validates.

Both are best tackled with API keys and a physical device in hand.
