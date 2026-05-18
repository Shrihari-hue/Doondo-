# What shipped

**Session 1:** 5 "Now" features (60-sec first match, anti-ghost, skill gap,
morning digest, Doondo Score) + roadmap doc.

**Session 2:** 2 "Next" features (interview reminders, anonymous employer
reviews) + cleanup of 9 pre-existing mobile type errors.

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

## What's next

`DOONDO_V2_ROADMAP.md` still has the prioritized plan. Sitting in the
"Next" tranche after this session: one-photo profile (OCR resume),
SOS upgrade with trust circle, streaks (small champagne-gold flair),
refer-a-friend payout, re-engagement for 14-day dormant users,
voice-note replies, live shift check-in with selfie + geofence, and a
per-screen language toggle. Each one is 1–3 days of work — pick the
ones that match what you're hearing from early users.
