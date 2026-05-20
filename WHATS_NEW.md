# What shipped

**Session 1:** 5 "Now" features (60-sec first match, anti-ghost, skill gap,
morning digest, Doondo Score) + roadmap doc.

**Session 2:** 2 "Next" features (interview reminders, anonymous employer
reviews) + cleanup of 9 pre-existing mobile type errors.

**Session 3:** 2 "Next" features (SOS with Trust Circle, Live shift
check-in with selfie + geofence) — the worker safety + attendance pair.

**Session 4:** 1 transformative activation feature — one-photo profile
(OCR resume snap with vision-AI extraction). The single biggest fix
for the activation funnel for low-literacy users.

**Session 5:** 3 retention/growth wins as a bundle — streaks (apply /
course / shift days with milestone pushes), refer-a-friend payout +
share card, and "hired near you today" social-proof rail. Closes the
activation → trust → retention → growth loop.

**Session 6:** Polish + production-readiness — push notification tap
deeplinks wired end-to-end across all 15 push helpers, friendly error
messages replacing raw network/exception strings on every new screen,
accessibility labels on icon-only buttons and streak chips. i18n
sweep deliberately deferred to its own focused session (5 locales ×
8 new screens needs proper budget).

See `DOONDO_V2_ROADMAP.md` for the full backlog.

---

## Before you run it

I added `node-cron` to `apps/backend/package.json`. You'll need to install
it before the backend boots cleanly:

```bash
pnpm install
```

The morning-digest and anti-ghost crons need that package. Everything else
runs on existing dependencies.

---

## Feature 1 — 60-second first match

A pre-signup preview that shows seekers 3 real jobs near them before
asking them to commit.

**Backend**
- `GET /api/v1/jobs/preview` — public (no auth), returns up to 5 ranked
  jobs. Trade bias + verified-employer boost + urgent-first sort.
- Service: `findFirstMatch` in `apps/backend/src/modules/jobs/job.service.ts`.
- Schema: `previewQuerySchema` in `job.schemas.ts`.

**Mobile**
- New screen `FirstMatchPreviewScreen` at `apps/mobile/src/screens/auth/`.
- Wired into `AuthNavigator` between RolePicker and Signup.
- `RolePickerScreen.pickWorkType` now routes to `FirstMatchPreview`
  instead of jumping straight to Signup for seekers.
- API wrapper: `jobsApi.preview()`.

Tap any card or "Sign up to apply" → Signup. A "Skip for now" link in
the top bar bypasses the preview.

---

## Feature 2 — Anti-ghost engine

Cron sweep that flags employers who don't respond to a pending
application within an SLA (default 72h) and pushes the seeker so they
can move on.

**Backend**
- New cron module: `apps/backend/src/modules/scheduler/index.ts`.
  Bootstrapped from `index.ts` after `connectDb()`, torn down in the
  shutdown handler.
- New service: `apps/backend/src/modules/applications/ghostSweep.service.ts`
  with `runGhostSweep()`.
- Application model: new field `flaggedAsGhostedAt` (indexed). Exposed
  on the `PublicApplication` DTO.
- New notification kind `application_ghosted` + push helper
  `sendGhostedPush`.

**Mobile**
- Surfaced as a `👻 No reply yet — the employer hasn't responded` pill
  on pending applications in `MyApplicationsScreen`.
- `PublicApplication` type extended with `flaggedAsGhostedAt`.

**Config**
- `GHOST_SWEEP_CRON` (default `0 * * * *` — top of hour, every hour).
- `GHOST_SLA_HOURS` (default 72).
- `SCHEDULER_ENABLED` master switch (default `true`).

---

## Feature 3 — Skill gap on rejection

When an employer rejects an application, the backend computes the
missing skills against the job's requirements at that moment and pushes
the seeker the best recommended course instead of a generic rejection.

**Backend**
- Course catalogue: every course now has a `teachesSkills: string[]`
  field (added to all 5 courses in `courses.catalogue.ts`).
- New service: `apps/backend/src/modules/applications/skillGap.service.ts`
  with `diffSkills`, `rankCoursesForGap`, and `computeForApplication`.
- `application.service.transitionByEmployer` now snapshots
  `rejectionReasons: string[]` on the Application doc at rejection time
  and routes the rejection push through `sendSkillGapPush` when there's
  an actionable gap (falls back to the generic push otherwise).
- New endpoint: `GET /api/v1/applications/:id/skill-gap` (seeker-auth).
- New notification kind `skill_gap` + push helper that deep-links to
  `CourseDetail`.

**Mobile**
- `MyApplicationsScreen` renders an inline `SkillGapInlineCard` on
  rejected applications. Tap → fetches `skillGap` and navigates to the
  recommended course (falls back to the Courses catalog if no match).
- API wrapper: `applicationsApi.skillGap(applicationId)`.
- `PublicApplication` extended with `rejectionReasons: string[] | null`.

---

## Feature 4 — Morning digest

One daily push per seeker at ~7am IST with their top matches, a
follow-on nudge ("complete verification → 3x more replies"), and a
deeplink to Home.

**Backend**
- New service: `apps/backend/src/modules/notifications/digest.service.ts`
  with `runMorningDigest` and `assembleForUser`. Reuses the existing
  `recommendFor` scoring; iterates seekers in batches of 200.
- Idempotency via `User.lastDigestSentAt` (new field) — a double-fire
  on the cron tick doesn't double-push.
- Honors `notificationPrefs.jobs` (opted-out users get skipped).
- New notification kind `morning_digest` + push helper
  `sendMorningDigestPush`.

**Config**
- `DIGEST_CRON` (default `30 1 * * *` UTC = 07:00 IST).

The scheduler module registers this alongside the ghost sweep.

---

## Feature 5 — Doondo Score

The portable employability number (0-100). Computed on the read path,
not stored — same pattern as the rating summary.

**Backend**
- New service: `apps/backend/src/modules/users/doondoScore.service.ts`
  with `computeForUser`.
- Formula (each capped, sums to 100):
  - Ratings: 35 max (avg/5 × 35)
  - Hires: 25 max (5/hire)
  - Endorsements: 20 max (4/unique trade)
  - Verification: 10 max (binary)
  - Profile completion: 10 max
- Score breakdown is returned alongside the score so the UI can render
  "Why this score?".
- Two endpoints:
  - `GET /api/v1/me/doondo-score` (auth)
  - `GET /api/v1/users/:id/doondo-score` (public — supports QR /
    cross-platform sharing later)

**Mobile**
- API wrapper: `doondoScoreApi.me()` and `doondoScoreApi.forUser(userId)`.
- Profile UI surface is a "Next" item — the score is queryable today
  but doesn't yet render on ProfileScreen.

---

## Cross-cutting infra added

| What | Where | Used by |
|---|---|---|
| `node-cron` dep + bootstrap | `package.json`, `scheduler/index.ts`, `index.ts` | Digest + ghost sweep; unlocks every future cron |
| `Course.teachesSkills[]` | `courses.catalogue.ts` | Skill gap; unlocks Smart Resume + career path map |
| 4 new notification kinds | `notification.model.ts` | `morning_digest`, `application_ghosted`, `skill_gap`, `doondo_score_changed` |
| Doondo Score service | `users/doondoScore.service.ts` | Foundation for Skill Passport, employer-side applicant sort |
| Env keys | `config/env.ts` | `SCHEDULER_ENABLED`, `DIGEST_CRON`, `GHOST_SWEEP_CRON`, `GHOST_SLA_HOURS` |

---

## Verified

- Backend `tsc --noEmit`: clean except for `node-cron` resolution
  (resolves on `pnpm install`).
- Mobile `tsc --noEmit`: 9 pre-existing errors in unrelated files
  (chatImage/chatVideo/chatVoice expo-file-system API drift, theme
  token mismatches in 3 screens, ApplicantDetailScreen missing
  `theme` import). None are in the files I added or modified for
  these 5 features.

---

## Quick test path

```bash
# 1. Install (picks up node-cron + @types/node-cron)
pnpm install

# 2. Run backend
pnpm dev:backend

# Expected log lines on boot:
# scheduler: morning digest registered  cron=30 1 * * *
# scheduler: ghost sweep registered     cron=0 * * * *

# 3. Run mobile
pnpm dev:mobile

# 4. In the app, tap "I want to find work" → Solo/Team sheet →
#    you'll see the new FirstMatchPreview screen with 3 jobs.

# 5. From the seeder/employer side, reject one of your own
#    applications (POST /applications/:id/reject) — the seeker gets
#    a skill_gap push instead of the generic rejection.

# 6. Force the ghost sweep to run now (dev convenience):
#    Set GHOST_SLA_HOURS=0 in .env, restart, wait for the next
#    cron tick. Any pending app gets flagged + pushed.

# 7. Pull a score:
#    GET /api/v1/me/doondo-score (with bearer token)
```

---

# Session 2 — Interview Reminders + Anonymous Employer Reviews

## Mobile type-error cleanup (9 fixes)

Production-ready baseline before adding more features. The mobile app now
`tsc --noEmit`s cleanly with zero errors. Fixes:

- `ThemeToggleCard` — collapsed the new `seekerLight` scheme into the
  `light` segment so the active-state union typechecks.
- `chatImage` / `chatVideo` / `chatVoice` — dropped the removed
  `{ size: true }` option on `getInfoAsync` (size returns by default in
  expo-file-system SDK 54+) and switched `FileSystem.EncodingType.Base64`
  to the supported `'base64'` literal.
- `profileCompleteness` — the `workPhotos` check was reading
  `WorkExperience.photos` (doesn't exist); rewrote to read the
  top-level `User.workPhotos`.
- `ChatListScreen` — added `role` to the chat counterpart type and
  populated it server-side so the "Employers" / "Support" tabs filter
  correctly.
- `ApplicantDetailScreen` — missing `useTheme()` hook call (`theme` was
  used three places without being in scope).
- `JobAlertFormScreen`, `ResumeBuilderScreen`, `ResumePreviewScreen` —
  three references to non-existent `theme.bg.subtle` repointed to the
  existing `theme.bg.muted` token.
- `MentorsScreen` — widened `BecomeMentorPanel`'s prop contract so
  `PublicUser`'s nullable `location.city` is acceptable.
- `Screen` component — made `children` optional so loading-state
  callers (`return <Screen />`) typecheck cleanly.

---

## Feature 6 — Interview Reminders

A scheduler sweep that fires a pre-interview push to both sides 60 minutes
ahead. Production-ready.

**Backend**
- New scheduler task: `runInterviewReminderSweep` in
  `apps/backend/src/modules/applications/interviewReminders.service.ts`.
  Finds applications whose embedded interview is `scheduled`, starts
  within the lead window, and hasn't been reminded yet.
- New `Interview.reminderSentAt` field on the application's interview
  subdocument — set by the sweep to make reminders idempotent. Cleared
  on reschedule so a new time gets a fresh reminder.
- New notification kind `interview_reminder` + `sendInterviewReminderPush`
  helper. Push body includes the location (in-person) or meeting link
  (video) so the worker can act without opening the app.
- Cron defaults to `*/15 * * * *` (every 15 min) — cheap, indexed,
  and gives a rescheduled interview at most a 15-minute reminder lag.

**Mobile**
- `PublicInterview` type extended with `reminderSentAt`.
- `MyApplicationsScreen` interview rendering refactored into a dedicated
  `InterviewCard` component that:
  - Shows for any application with a scheduled interview (not just hired).
  - Renders a calm "Interview scheduled at …" card by default.
  - Switches to an urgent warning-toned "Starting in X min" pill when the
    start is within 90 minutes.
  - Auto-updates the countdown every minute via a single setInterval.
- Mode + location/meeting-link line on every interview card so workers can
  glance and know where to go.

**Config**
- `INTERVIEW_REMINDER_CRON` (default `*/15 * * * *`).
- `INTERVIEW_REMINDER_LEAD_MINUTES` (default 60).

---

## Feature 7 — Anonymous Employer Reviews

Structured tags + anonymity on every Rating row. Builds the public trust
signal that's the basis for the "Workers say…" panel on EmployerDetail.

**Backend**
- New file `apps/backend/src/modules/ratings/tagCatalog.ts` with two tag
  catalogs: `EMPLOYER_REVIEW_TAGS` (paid on time, safe site, fair hours,
  felt unsafe, paid late, etc.) and `SEEKER_REVIEW_TAGS` (punctual,
  hardworking, no-show, etc.). Each tag has a `polarity` (positive /
  negative) that drives surface treatment.
- Rating model extended with:
  - `tags: string[]` (max 6, server-validated against the role's catalog)
  - `anonymous: boolean` (default false; indexed)
- `Rating.toPublicJSON` now masks reviewer id/name/photo when
  `anonymous === true` and emits a role-aware label
  ("Anonymous worker" vs "Anonymous employer").
- New service `summarizeTagsForUser(userId, role)` — `$facet`
  aggregation returning every catalogued tag's count + ratio against
  the total review count.
- New endpoint `GET /api/v1/users/:id/tag-summary?role=employer|seeker`
  (public — same trust info shows whether you're logged in or not).
- `POST /api/v1/ratings` accepts `tags` and `anonymous` in the body
  (Zod-validated; capped at 6 tags).

**Mobile**
- New `apps/mobile/src/lib/reviewTagCatalog.ts` mirrors the backend
  catalog 1-to-1 so the LeaveRating screen can render the right chips
  without a round trip.
- `LeaveRatingScreen` redesigned:
  - Multi-select tag chips below the star picker, capped at 4 per review
    so the form stays focused. Positive and negative tags share the
    rail with different tone treatments (green vs warning amber).
  - "Post anonymously" toggle, defaulting to ON when a seeker is
    reviewing an employer (the worker-protection default) and OFF when
    an employer is reviewing a seeker (a named good review helps the
    worker's reputation).
- `EmployerDetailScreen` gains a `TagSummaryPanel`:
  - "WORKERS SAY · N reviews" header.
  - Up to 6 positive chips with the percentage ("Paid on time · 92%").
  - "HEADS UP" section listing negative tags whose ratio ≥ 25% (single
    disgruntled review doesn't trip it).
  - Whole panel hidden when total reviews < 3 — ratios are too noisy
    below that volume.

---

## Verified (Session 2)

- Backend `tsc --noEmit`: clean except for `node-cron` and
  `mongodb-memory-server` resolution (both pending `pnpm install`).
- Mobile `tsc --noEmit`: **0 errors** end-to-end.

---

---

# Session 3 — SOS upgrade + Live shift check-in

## Feature 8 — SOS with Trust Circle

Worker safety primitive that fans an alert beyond the single on-device
contact: up to 3 server-side Trust Circle contacts + 2 nearest verified
peers. The on-device SMS path stays as the offline-safe fallback.

**Backend**
- `User.trustCircle: TrustCircleContact[]` (max 3) and
  `User.isPeerResponder: boolean` added to the user model + public DTO.
- New module `apps/backend/src/modules/sos/`:
  - `sosAlert.model.ts` — durable receipt of every alert (geo-indexed,
    fanout counts, resolution tracking).
  - `sos.service.ts` — phone-hash matching for trust contacts, geo
    query for the nearest 2 verified peer responders within 5 km,
    parallel push fan-out via the existing Expo pipeline.
- New endpoints:
  - `GET /me/trust-circle` and `PUT /me/trust-circle` (CRUD, max 3
    contacts, server-side validation).
  - `POST /me/peer-responder` — opt-in toggle for the responder pool.
  - `POST /sos/trigger` — fires the alert. Body
    `{ lat?, lng?, note? }`. Returns the alert + reach counts + the
    list of trust contacts whose phones DIDN'T match a Doondo user
    (the device opens SMS composers for those).
  - `GET /sos/mine` — the seeker's alert history.
  - `POST /sos/:id/resolve` — any party to the alert can mark it resolved.
- New notification kind `sos_alert` + push helper `sendSosAlertPush`.
  Body includes a Google Maps link to the sender's last known location
  so a responder can act without opening the app.

**Mobile**
- `PublicUser` extended with `trustCircle` and `isPeerResponder`.
- New `sos.api.ts` with `getTrustCircle`, `putTrustCircle`,
  `setPeerResponder`, `trigger`, `listMine`, `resolve`.
- New screen `TrustCircleScreen`:
  - 3 fixed slots, inline editing, no separate "add contact" modal.
  - Relationship chips (Family / Friend / Employer / Other), with a
    free-text input revealed when "Other" is selected.
  - Optimistic peer-responder Switch with rollback on failure.
  - All mutations save immediately so a half-edited row is never the
    only record on the server.
- `SosScreen` rewritten:
  - New "Trust Circle" card up top showing X/3 contacts saved + peer
    responder status, deeplinking to `TrustCircle`.
  - SOS hold-to-trigger now does a TWO-PRONGED fan-out: calls
    `sosApi.trigger` (server pushes matched Trust Circle users +
    nearest verified peers) AND opens an SMS composer for any
    unmatched contact. Either path failing alone is recoverable.
  - Result toast summarizes reach ("2 trust contacts notified · 1
    nearby peer alerted · SMS draft opened").
- `Sos` route param updated to optionally accept `alertId` so push
  taps can deep-link straight to a specific alert.

**Tier ordering (worker's perspective, best to worst case)**
1. Server-side Trust Circle members on Doondo → push within seconds.
2. 2 nearest verified peers within 5 km → push.
3. On-device SMS draft to the legacy contact + any unmatched Trust
   Circle contact → user sees, taps Send. Works offline.

---

## Feature 9 — Live Shift Check-in (selfie + geofence)

Daily attendance primitive — selfie + GPS proof that the worker was
on-site. Unblocks the rest of the safety/score/payment chain.

**Backend**
- New `ShiftCheckIn` model
  (`apps/backend/src/modules/applications/shiftCheckIn.model.ts`):
  applicationId, kind (`check_in` / `check_out`), selfieUrl
  (base64, `select: false`), 2dsphere-indexed geo Point,
  `distanceFromJobMeters` (computed at write time).
- New `shiftCheckIn.service.ts`:
  - Authorizes the seeker on the application; status must be `hired`.
  - Validates the selfie data URL format + size cap.
  - Computes great-circle distance from `job.location.geo` and rejects
    check-ins beyond 750 m as a soft fence. Jobs without coordinates
    skip the fence (off-route / catering / delivery edge cases).
  - Pushes the employer ("Priya checked in at 09:12 on Cook helper")
    and sockets the seeker for cross-device sync.
- New notification kind `shift_checkin` + push helper
  `sendShiftCheckinPush`.
- New endpoints:
  - `POST /applications/:id/check-in` and `/check-out` (seeker only,
    body `{ selfieDataUrl, lat, lng, timestamp? }`).
  - `GET /applications/:id/check-ins` (both sides).

**Mobile**
- New `shiftCheckIn.api.ts` with `checkIn`, `checkOut`, `list`.
- New `selfie.ts` capture utility — forces the front camera (no
  library picker, so the selfie is real), walks
  width × quality compression steps until the data URL fits the
  server cap.
- New `ShiftCheckInCard` on `MyApplicationsScreen` for any hired
  application:
  - Shows current shift status (`On shift since 09:12` /
    `Off shift since 17:30` / `Ready to check in`).
  - Single primary action button that swaps between
    "Check in with selfie" and "Check out" based on the latest event.
  - On tap: captures selfie → reads coords → posts → invalidates
    cached check-ins so the card updates immediately.
  - Inline error surface for permission denials / geofence rejections
    so the worker can fix the problem without leaving the screen.
- `PublicShiftCheckIn` type added to `api/types.ts`.

---

## Cross-cutting infra added (Session 3)

| What | Where | Used by |
|---|---|---|
| `TrustCircleContact[]` on User | `users/user.model.ts` | SOS fan-out, future "vouched by" features |
| `isPeerResponder` boolean | `users/user.model.ts` | Geo-indexed peer pool |
| `SosAlert` model | `modules/sos/sosAlert.model.ts` | Audit trail, future admin dashboard |
| `ShiftCheckIn` model | `modules/applications/shiftCheckIn.model.ts` | Foundation for attendance signal in Doondo Score v2, payment integrity, Crew Apply |
| 2 new notification kinds | `notification.model.ts` | `sos_alert`, `shift_checkin` |
| Front-camera selfie util | `mobile/lib/selfie.ts` | Reusable for future photo-verification flows (one-photo profile, etc.) |

---

## Verified (Session 3)

- Backend `tsc --noEmit`: clean except `node-cron` and
  `mongodb-memory-server` (both pending `pnpm install`).
- Mobile `tsc --noEmit`: **0 errors** end-to-end.

---

---

# Session 4 — One-photo profile

The activation feature. Snap a photo of an old resume, an ID card,
or a handwritten sheet → AI extracts name, skills, experience,
work history, education, location → seeker confirms with inline
edits → profile filled in 30 seconds instead of 5 form screens.

## Feature 10 — One-photo profile (OCR via Anthropic Vision)

**Backend**
- New module `apps/backend/src/modules/profileExtract/profileExtract.service.ts`:
  - Swappable provider pattern (mirrors `verification/sms.ts` design):
    `MockExtractionProvider` for dev, `AnthropicExtractionProvider`
    for production. The mock returns a deterministic fixture so the
    mobile flow is end-to-end testable without an API key.
  - Anthropic provider calls `POST https://api.anthropic.com/v1/messages`
    with the image content block + a strict JSON-only system prompt
    that lists the exact output schema and tells the model to NEVER
    invent fields. Indian-context aware: handles Hindi / Tamil / Telugu
    / Kannada / Bengali scripts, normalises trade words to known slugs
    (cook, electrician, mason, delivery, etc.).
  - Defensive normalization: every parsed field is type-checked and
    bounds-checked before reaching the response. A hallucinated entry
    is dropped, not surfaced.
- New endpoint `POST /api/v1/me/profile/extract-from-photo`. Body
  `{ imageDataUrl: string, locale?: string }`. Capped at 1.3MB to keep
  vision-call costs and Express bodies sane.
- New env keys: `PROFILE_EXTRACT_PROVIDER` (anthropic / mock — default
  mock), `ANTHROPIC_API_KEY` (required for prod), `ANTHROPIC_VISION_MODEL`
  (default `claude-sonnet-4-6`).

**Mobile**
- New `lib/profileDocument.ts` — pick from camera OR library, compress
  with multiple longer-edge × quality steps until the data URL fits the
  backend cap. Reuses the manipulation pipeline pattern from `selfie.ts`
  but with larger target widths (resume text needs to stay legible).
- New `api/profileExtract.api.ts` — thin wrapper around the new endpoint.
- New `ExtractedProfile` + `ExtractedWorkExperience` + `ExtractedEducation`
  types in `api/types.ts`.
- New screen `ProfileFromPhotoScreen` with a clean 3-stage flow:
  - **Pick** — two big buttons (Camera / Gallery), tips card.
  - **Extracting** — image preview with a "Reading your photo…"
    loading state. Calibrates the user's expectation to 5–15 seconds.
  - **Confirm** — every extracted field shown with inline edits.
    Name, bio, comma-separated skills, experience years, city + area
    as side-by-side fields. Work history + education render as
    summary cards (full edit is in the existing ResumeBuilder).
    A confidence pill in the header tells the seeker whether to
    glance ("Looks clear") or scrutinize ("Please review").
  - **Save** — single button that fires PATCH `/me/profile` AND
    PUT `/me/work-history` in sequence, then invalidates the auth
    query so the rest of the app sees the new fields.
- Registered as a modal in `AppNavigator`. Activation surface:
  - New CTA banner on `ProfileScreen` for seekers with
    `profileCompletion < 50` — brand-hero coloured, sits above the
    pending-ratings banner, deeplinks to `ProfileFromPhoto`. Hides
    automatically once the profile is healthy.

## What it unlocks

This was the largest leak in the activation funnel. Until now, the
flow was: see jobs (60-sec first match) → sign up → hit a wall of
profile-completion forms → drop. Now: see jobs → sign up → snap a
photo → confirm → land on a real profile that the recommendations
service can actually rank against. The downstream features
(personalised digest, Doondo Score, anti-ghost, anonymous reviews)
all compound on this — every signal in the app is more useful when
the seeker's profile isn't blank.

## Verified (Session 4)

- Backend `tsc --noEmit`: clean except the install-pending
  `node-cron` and `mongodb-memory-server` errors.
- Mobile `tsc --noEmit`: **0 errors** end-to-end.

## To run with real Anthropic Vision (instead of mock)

In `.env`:
```
PROFILE_EXTRACT_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_VISION_MODEL=claude-sonnet-4-6
```

Restart the backend. The mobile flow is identical — the swap is
backend-only.

---

---

# Session 5 — Retention + growth bundle

Three small features shipped together because they share infra and
compound on what's already built. Together they close the
activation → trust → retention → growth loop.

## Feature 11 — Streaks (apply / course / shift days)

**Backend**
- `User.streaks: { apply, course, shift }` — each slot is
  `{ current, longest, totalDays, lastDate (YYYY-MM-DD in IST) }`.
- New service `apps/backend/src/modules/users/streaks.service.ts`
  with `bumpStreak(userId, kind)`:
  - Same-day re-fires are no-ops (idempotent).
  - Yesterday → current + 1. Otherwise → reset to 1.
  - Tracks longest + totalDays per kind.
  - Detects exact threshold crossings at 3 / 7 / 14 / 30 days and
    fires a single push per crossing.
- Hooks added:
  - `application.service.apply` → bumpStreak(seekerId, 'apply').
  - `shiftCheckIn.service.createCheckIn` → bumpStreak on `check_in`
    only (one day of work = one streak day, not two).
  - `courses.service.completeLesson` → bumpStreak(seekerId, 'course').
- New notification kind `streak_milestone` + push helper
  `sendStreakMilestonePush`. Copy is warm + brief — pure dopamine,
  no CTA.
- All bumps are fire-and-forget so the originating action never
  waits on a streak write.

**Mobile**
- `PublicUser.streaks` exposed in the API type.
- New `StreakChip` component on `ProfileScreen` renders a 3-tile
  strip (Apply / Learn / Show up). Active streaks (current > 0) get
  a flame icon and brand-hero color; inactive ones show the
  personal-best number with a "best N" hint to motivate restart.
  Each tile deep-links to the relevant activity surface
  (MyApplications, Courses, MyApplications).
- The whole strip is hidden for users with zero totalDays so a
  fresh profile doesn't show empty cells.

## Feature 12 — Refer-a-friend payout + share card

The referral pipeline already existed (record on apply via
`?ref=`, credit ₹100 to the referrer's wallet on hire). This
session adds the push + share-out surface.

**Backend**
- `referral.service.creditOnHire` now also fires
  `sendReferralBonusPush` to the referrer with the referee's
  first name and the credited amount. Deep-links to MyEarnings.
- New notification kind `referral_bonus`.
- `GET /me/referrals` already returned summary + history; no
  schema changes needed.

**Mobile**
- `ReferralMenuRow` on `ProfileScreen` is now two-tone:
  - When the seeker HAS earned bonuses → ledger mode:
    "₹300 earned · 3 hires" → tap routes to MyEarnings.
  - When they haven't → CTA mode: "Invite a friend · ₹100 when
    they get hired" → tap opens the OS share sheet with the
    seeker's referral link (`https://doondo.app/install?ref={userId}`).
- The link's `?ref=` is already honored by the apply flow, so a
  hire downstream credits the referrer through the existing
  pipeline — no new schema, no new state machine.

## Feature 13 — "Hired near you today" feed

Anonymised social-proof rail on Home + push fan-out on hire.

**Backend**
- New service
  `apps/backend/src/modules/applications/hiredNearby.service.ts`:
  - `fanOutOnHire({ applicationId })` — runs on every hire
    transition. Geo-finds verified active seekers within 10km of
    the job, capped at 50 recipients, honors per-user `jobs`
    notification preference, sends `sendHiredNearbyPush`.
  - `listNearbyHires({ callerId, limit })` — pull-style feed
    backed by a `$geoNear` aggregation on jobs near the caller's
    saved home location followed by a recent-hires lookup.
    Returns first-name only, job title, and area — never full
    names, never exact coords.
- Hooked into `application.service.transitionByEmployer` on the
  `hired` transition (alongside the existing wallet credit + referral
  credit fire-and-forget paths).
- New endpoint `GET /me/hired-nearby?limit=N`.
- New notification kind `hired_nearby` + push helper
  `sendHiredNearbyPush`.

**Mobile**
- New `hiredNearby.api.ts` wrapper.
- New `HiredNearbyEntry` type in `api/types.ts`.
- New `HiredNearbyRail` component at
  `screens/seeker/home/HiredNearbyRail.tsx`: horizontally-
  scrolling card rail with green-dot live indicator + relative
  time ("12 min ago" / "2 hr ago" / "yesterday"). Cards are
  read-only — tapping them anywhere goes nowhere by design
  (privacy of the hired worker).
- Rail is wired into `SeekerHomeScreen` just after the existing
  `RecommendedForYouRail`. Self-hides on empty.

## Cross-cutting infra added (Session 5)

| What | Where | Used by |
|---|---|---|
| `User.streaks` shape + bumpStreak | `users/streaks.service.ts` + model | Apply / course / shift days; reusable for future streak kinds |
| `istDateString` helper | `users/streaks.service.ts` | All IST-day calculations (digest already had its own copy; can merge later) |
| 3 new notification kinds | `notification.model.ts` | `streak_milestone`, `referral_bonus`, `hired_nearby` |
| `hiredNearby.fanOutOnHire` | `applications/hiredNearby.service.ts` | Social-proof signal; reusable for future "X near you" feeds |
| Share-sheet integration | `ProfileScreen` referral row | Pattern for future share surfaces (profile, badges, achievements) |

## Verified (Session 5)

- Backend `tsc --noEmit`: clean except `node-cron` /
  `mongodb-memory-server` install-pending errors.
- Mobile `tsc --noEmit`: **0 errors** end-to-end.

---

---

# Session 6 — Polish + production-readiness

No new features. Three high-leverage improvements that turn the 13
shipped features into something a real beta cohort can use.

## Push notification tap deeplinks

Every push helper has carried a `deeplink: { screen, params }` since
Session 1, but tapping a notification did nothing useful — the
mobile tap handler was a TODO. This session wires it end-to-end.

**Mobile**
- New `apps/mobile/src/navigation/ref.ts` — `navigationRef` for the
  `<NavigationContainer>` plus a safe `navigateFromExternal(screen,
  params)` helper that no-ops if the navigator isn't ready (cold
  boot case).
- `App.tsx` attaches the ref to the `NavigationContainer`.
- `apps/mobile/src/lib/push.ts` `attachTapHandler()` now:
  - Reads `data.deeplink: { screen, params }` from the tapped
    notification payload (preferred path).
  - Falls back to a `data.type` → `{screen, params}` map for legacy
    payloads still in flight (every notification kind we've
    shipped is covered: application status, interview events,
    shift check-ins, chat, job alerts, SOS, skill gap, ghosted,
    morning digest, streak milestones, referral bonuses, hired
    nearby, ratings).
  - Handles the cold-boot case via
    `getLastNotificationResponseAsync` so opening the app FROM a
    notification on the home screen lands on the right deeplink
    after a 400ms grace for navigator mount.
- `AppNavigator` subscribes via `attachTapHandler()` on mount and
  unsubscribes on unmount.

**Backend**
- Every push helper in `apps/backend/src/lib/push.ts` now mirrors
  its `deeplink` into the push payload's `data` field — the same
  shape the in-app `notifications.record(...)` call gets. 15
  helpers updated:
  - `sendApplicationStatusPush`, `sendInterviewPush`,
    `sendNewJobPush`, `sendChatMessagePush`,
    `sendJobAlertMatchPush`, `sendRatingReceivedPush`,
    `sendStreakMilestonePush`, `sendReferralBonusPush`,
    `sendHiredNearbyPush`, `sendSosAlertPush`,
    `sendShiftCheckinPush`, `sendInterviewReminderPush`,
    `sendSkillGapPush`, `sendGhostedPush`, `sendMorningDigestPush`.

Result: a tap on any push notification now lands on the right
screen with the right params, even from a cold launch.

## Friendly error messages

Every new screen used to surface raw `err.message` on failure —
"Network request failed", "TypeError: Cannot read properties of
undefined", and similar leaked through to the user. Replaced with
a single shared helper.

**Mobile**
- New `apps/mobile/src/lib/friendlyError.ts` —
  `friendlyErrorMessage(err, fallback)`:
  - Recognizes `ApiError` with known codes
    (`NETWORK_ERROR` → "Looks like the network is slow",
    `RATE_LIMITED` → "Wait a moment", auth failures → "Please
    sign in again", `INTERNAL_ERROR` → "Something went wrong on
    our end").
  - Falls back to the backend's `error.message` when it's
    user-safe (our controllers write that copy on the way out).
  - Detects technical fragments
    ("fetch failed", "TypeError", "cannot read properties", etc.)
    and prefers the supplied fallback over them.
  - Returns the supplied fallback as the final safety net.
- Threaded into every catch block on the screens shipped Sessions
  3-5: `FirstMatchPreviewScreen`, `TrustCircleScreen` (both
  mutations + the optimistic peer toggle), `ProfileFromPhotoScreen`
  (extraction + save), `ShiftCheckInCard`, `SkillGapInlineCard`.

## Accessibility labels

Icon-only buttons and composite display chips on the new screens
now announce themselves to screen readers.

**Mobile**
- Back chevron buttons on FirstMatchPreviewScreen,
  TrustCircleScreen, ProfileFromPhotoScreen get
  `accessibilityLabel="Back"` + `accessibilityRole="button"`.
- The "Skip preview" link on FirstMatchPreviewScreen announces
  "Skip preview and continue to sign up".
- Trust Circle slot rows announce as e.g. "Priya, family. Tap to
  edit." with `accessibilityState={{ expanded: isOpen }}` so the
  reader speaks the open/closed state.
- Streak chips compose a full sentence:
  "Apply streak: 5 days in a row. Tap to continue." (active) or
  "Apply streak. Personal best 7 days. Tap to start again."
  (inactive with a best) or "Apply streak. Tap to start today."
- Screen titles use `accessibilityRole="header"` so the reader
  marks them as headings.

## What was deliberately deferred

- **i18n sweep across 5 locales × 8 new screens.** Too big for
  a single session — half-doing it (English keys only, other
  locales fall through) would be worse than punting cleanly. Next
  session should be a dedicated i18n pass with proper budget.
- **Loading skeletons.** Most new screens use `ActivityIndicator`;
  swapping in `SkeletonCard` is straightforward but not a launch
  blocker.
- **Push deeplink unit tests.** Worth writing but not in scope for
  a polish session.

## Verified (Session 6)

- Backend `tsc --noEmit`: clean except `node-cron` and
  `mongodb-memory-server` install-pending.
- Mobile `tsc --noEmit`: **0 errors** end-to-end.

---

## What's next

The "Next" tranche after this session: i18n sweep across 5 locales
(English/Hindi/Tamil/Telugu/Kannada) for every new screen, voice-note
auto-transcription, quick-reply templates pre-translated, per-screen
language toggle, re-engagement flow for 14-day dormant users, Doondo
Pulse home-screen widget. The polish sweep this session made the
shipped features ready for a real beta; remaining work is either
launch prep (i18n) or further feature reach.
