# Doondo V2 — Feature Status Report

_Audited 23 May 2026; updated 24 May 2026 after the in-chat translate /
Smart Resume / Festival Mode / Doondo Score QR build; updated 28 Aug 2026
after finishing 5 of the 6 remaining partials (#35, #32, #8, #40, #23) and
scaffolding the 6th (#30, needs a real device build to verify); updated
29 Aug 2026 after shipping #7 (peer cohorts) and #46 (Wage Strike Alerts,
conservative v1), closing 3 of 5 push-notification "Known Gaps" and
partially closing the 4th (see DOONDO_PUSH_NOTIFICATIONS_STATUS.md), the
Hire Reels follow-ups (#24), and extracting Tamil / Telugu / Kannada
translation-QA sheets (`TRANSLATION_QA_{TA,TE,KN}.csv`) for a human
reviewer._

## Summary

Of the 46 features in the list:

- **38 fully shipped** — built, wired, and verified (typecheck + offline bootcheck).
- **1 partially shipped** — the core is built; a described extension is not.
- **7 not started.**

Verification caveat that applies throughout: everything is verified as far as
this build environment allows (TypeScript, the offline boot smoke-test, pure-logic
unit checks). Native-module behaviour (camera, video, speech, biometrics) and a
real-MongoDB boot are verified on the deploy platform, not here. #30's widget
scaffold additionally needs a real Xcode/Android Studio build to verify — that
tooling doesn't exist in this build environment at all, so it's flagged
separately rather than folded into the usual caveat above.

Status key: ✅ shipped · 🟡 partial · ❌ not started.

---

## Core features (21)

**✅ 1. 60-second first match** — Session 1. `FirstMatchPreviewScreen` sits
between role-pick and signup; the public `/jobs/preview` endpoint returns 3
ranked jobs before any profile is asked for.

**✅ 2. One-photo profile** — Session 4. `ProfileFromPhotoScreen` + the
`profileExtract` module; snap a resume / ID / handwritten sheet and vision-AI
fills name, skills, experience, location (swappable mock / Anthropic provider).

**✅ 3. Personalized morning digest** — Session 1. `notifications/digest`
cron — a single morning push with jobs, a wage trend, and one nudge.

**✅ 4. PF / ESI / tax explainer** — Sessions 22–23. `PayslipExplainerScreen`,
with FY 2026-27 rates web-verified, plus a "claiming what's yours" section
(PF withdrawal, ESI claims) linking the official government portals.

**✅ 5. Skill-gap surfacing** — Session 1. On a rejection, the missing skill +
1 recommended course is surfaced (`applications/skillGap` service). Closes the
Applications → Courses loop. _(See also #35.)_

**✅ 6. Career path map** — Session 21. `CareerPathScreen` — trade ladders
(e.g. driver → supervisor → manager) with pay and the skills that unlock each.

**✅ 7. Peer cohorts via Find Friends** — Shipped. `FindFriendsScreen`
(contacts-match + invite) already existed; added a 5-person cohort model on
top: new `cohorts` / `cohort_members` / `cohort_messages` tables, `POST
/cohorts` (course + up to 4 matched friends → invite), `POST
/cohorts/:id/respond` (join/decline), `POST /cohorts/:id/invite` (add more,
capped at 5 total), and a shared group chat (`GET`/`POST
/cohorts/:id/messages`) that reuses the 1:1 chat module's `messageKindEnum`
and socket-fan-out pattern rather than duplicating it, though the group
thread is its own lightweight tables — the 1:1 `conversations` schema is a
hard employer/seeker pair and doesn't fit a 5-person seeker-only group.
New mobile screens `CohortsScreen` (joined groups + pending invites),
`StartCohortScreen` (pick an enrolled course + up to 4 matched friends), and
`CohortChatScreen` (text + image group chat). `FindFriendsScreen` gained a
header link to My Cohorts and a "Start a course cohort" CTA when matched
seeker friends are found. English-only for now — the i18n sweep to the other
4 languages is deferred, same honest-fallback pattern used for prior
English-first sessions (i18next falls back to English rather than breaking).

**✅ 8. Bookable 1:1 mentor sessions** — Shipped. The `mentors` module +
`MentorsScreen` already shipped discovery and request/accept. Added calendar-
slot booking on top: a new `mentor_sessions` table (mentor opens a time slot,
mentee books it — gated on an accepted mentorship), `POST /mentors/sessions`
/ `GET /mentors/:userId/sessions/open` / `POST /mentors/sessions/:id/book` /
`POST /mentors/sessions/:id/cancel` / `GET /mentors/sessions/mine`, and a
push notification on booking/cancellation. No payment integration — checked
first and confirmed no payment aggregator is wired anywhere in this codebase
(`PAYMENT_AGGREGATOR` defaults to `'none'`/fully simulated), so sessions are
a free benefit of an accepted mentorship, matching that. New mobile screens
`MentorSessionsScreen` (calendar: open slots + booked sessions, "add a time
slot" using the same date/time/mode chip picker the employer's Schedule
Interview sheet already uses) and `BookMentorSessionScreen` (pick one of a
mentor's open slots), reached from an accepted request on `MentorsScreen`.

**✅ 9. Live shift check-in (selfie + geofence)** — Session 3.
`applications/shiftCheckIn` service + model; protects against fake-attendance
disputes.

**✅ 10. Anonymous employer reviews + structured tags** — Session 2. The
`ratings` module, with the structured "Workers say…" tag summary (paid on time,
safe site, fair hours).

**✅ 11. SOS upgrade (family + 2 nearest peers)** — Session 3. The `sos` module
fans an alert to the Trust Circle plus the 2 nearest verified peers — not just
an admin.

**✅ 12. In-chat auto-translate** — Built (24 May 2026). The `translation`
module (swappable mock / Anthropic provider) auto-translates each text message
into the recipient's locale; the translation lands under the bubble live via a
new `chat:message_translated` socket event. A new `User.locale` field +
`PUT /me/locale` keep the server's copy of the reader's language in sync.

**✅ 13. Voice-note replies + auto-transcription** — Session 15. The
`transcription` module; a transcript renders under each voice bubble and is
pushed in live.

**✅ 14. Interview scheduler (calendar holds + reminders)** — Sessions 2 + 7.
`scheduleInterview` / `cancelInterview`, the interview-reminder cron, and
add-to-calendar.

**✅ 15. Quick-reply templates, pre-translated** — Session 12. The sender picks
in their language; the recipient reads in theirs.

**✅ 16. Per-screen / always-on language toggle** — Session 14. A globe toggle
in the Home and Profile headers opens a one-tap language picker.

**✅ 17. Offline mode** — Session 24. Job applications queue on-device with no
connection and flush when back online; nearby jobs are cached. _(Session 25
also added offline session restore + an app lock.)_

**✅ 18. Streaks** — Session 5. Apply / course / shift-day streaks with
restrained champagne-gold milestone flair.

**✅ 19. "Hired near you today" feed** — Session 5.
`applications/hiredNearby` service — social proof on the home surface.

**✅ 20. Refer-a-friend cash reward** — Sessions 5 + 7. The `referrals` module;
both sides paid on the referred worker's first shift.

**✅ 21. Re-engagement flow (14-day dormant)** — Session 11.
`notifications/reengagement` cron — one role-aware win-back nudge with cooldown
and attempt caps.

**Core total: 21 ✅ · 0 🟡 · 0 ❌**

---

## Moonshots (25)

**❌ 22. AR Job Vision** — Not started. (`react-three-fiber` + `expo-gl` are in
the repo, so the 3D stack is available, but the camera-AR street view is not
built.)

**✅ 23. Doondo Coach — voice-first AI agent** — Shipped. Voice job search,
reading results aloud, and applying by voice were already live. Added two new
intents to the deterministic classifier: "interviews" ("when is my
interview?") reads back the worker's next employer-scheduled interview
(read-only by design — interviews are scheduled by the employer in this
app's model, so the Coach announces it rather than inventing a seeker-side
mutation that doesn't exist elsewhere in the codebase); "messages" ("read my
messages") reads back the latest employer reply in each conversation where
the employer sent the last word, reusing the conversation list's own
`lastMessagePreview` rather than a new query. Both are keyword-matched in
English, Hindi, Tamil, Telugu, and Kannada, same density as the existing
trade lexicon. The intent parser is still the deterministic rule-based
classifier — the LLM swap remains a documented seam, unchanged by this pass.

**✅ 24. Hire Reels — 30-sec video resume** — Session 28; follow-ups added
29 Aug 2026. A worker records an intro reel; employers swipe a full-screen
discovery feed. The two natural follow-ups flagged at ship time are now
built: the applicant-list query batch-checks which applicants have a reel
(one cheap indexed query, no N+1) and the employer's `ApplicantCard` shows a
tappable "▶ Reel" pill that opens a new `SeekerReelScreen`; both that screen
and every card in the discovery feed itself now carry a "Contact" action that
routes into the existing employer→worker Hiring Request flow — v1 stays
browse-only in spirit (still no raw chat from a reel), but liking a reel now
has an actual next step. _(Auto-captioning and auto-translation of reels are
still not built.)_

**✅ 25. Doondo Score** — Built (24 May 2026). The score is computed from
verified signals (Session 1); the cryptographically-signed, QR-shareable
credential is now built — the `scoreCredential` module mints an HMAC-signed
token, encodes the QR, and serves a public verification page at
`GET /score/verify/:token`. The worker shares it from the Skill Passport;
anyone can scan and verify it without a Doondo account.

**✅ 26. Crew Apply** — Session 17 (found already shipped). 3–5 seekers register
as a crew and apply as one unit (`teamMembers` / `teamSize` on the application).

**❌ 27. Live in-shift AI coaching** — Not started.

**✅ 28. 3D craft showcase** — Shipped. The `CraftShowcase` component renders a
parallax 3D portfolio gallery; used on `ProfileScreen`, `ResumePreview`, and the
employer's `ApplicantDetail`.

**✅ 29. Hire Celebration** — Shipped. `HireCelebration` (full-screen
celebration) + `HireShareCardPoster` (auto-generated WhatsApp share card).
_(The auto-offered advance, family notification, and in-app peer congratulations
around the moment are not all wired in.)_

**🟡 30. Doondo Pulse — ambient widget** — Scaffolded, not build-verified. The
in-app Pulse momentum card was already live on Home. Added a full OS-widget
scaffold this session — Android is genuinely complete and wired: a local Expo
module (`modules/doondo-pulse-widget`) writes the latest snapshot to
SharedPreferences and triggers an AppWidgetManager redraw every time
`usePulse()` gets fresh data; a config plugin
(`plugins/withDoondoPulseWidget.ts`) copies the `AppWidgetProvider` + XML
layout into `android/app/src/main/...` and registers the manifest receiver
automatically on `expo prebuild` — no manual step. iOS is real WidgetKit
source (`widget-src/ios/DoondoPulseWidget.swift`, App Group snapshot +
`TimelineProvider` + SwiftUI view for small/medium families) and the config
plugin adds the App Group entitlement automatically, but adding the actual
Widget Extension *target* to the Xcode project needs one documented manual
step (File → New → Target → Widget Extension) — safely scripting Xcode
target creation via raw `.pbxproj` edits isn't something this session could
verify without Xcode itself, so it deliberately wasn't attempted.
**Everything here is unverified beyond `tsc --noEmit` passing and the plugin
running clean against a mock config** (confirmed it registers exactly the
expected Android `dangerous`+`manifest` mods and iOS `entitlements`+`dangerous`
mods) — this sandbox has no Xcode or Android SDK to actually run `expo
prebuild`/`eas build` and confirm a widget renders on a real home screen.
Needs a real build to move to ✅.

**✅ 31. Anti-ghost engine** — Sessions 1 + 7. A ghost-sweep cron flags
employers who don't respond within the SLA; a "no reply yet" badge shows on the
listing and the seeker is pushed to move on.

**✅ 32. Skill Passport with verifiable credentials** — Shipped. The portable
Skill Passport screen (verified skills, tests, ratings, shareable as text) was
already live. Added a `passportCredential` module reusing the Doondo Score
credential's exact pattern (HMAC-signed, short-code QR, public content-
negotiated verify page) — `POST /me/passport-credential` mints a credential
covering the score, verified-skill count, jobs completed, and rating; `GET
/passport/verify/:code` is the public, no-account-needed verification page.
New `PassportCredentialScreen` (mobile) renders it as a shareable card with
"Share" / "Save to photos", mirroring `ScoreCredentialScreen`; the Skill
Passport screen's QR button now opens it instead of the Doondo Score QR.

**❌ 33. Predictive availability** — Not started.

**❌ 34. Voice biometric identity** — Not started. Session 25 added a biometric
*app-lock* (the phone's fingerprint / face / screen-lock as an unlock gate) —
that is a local gate, not a voice-print identity that replaces OTP.

**✅ 35. The "Why was I rejected?" moment** — Shipped. Skill-gap surfacing (#5)
delivers the core: on a rejection, the missing skill + a course to close it. Added
a `rejectionExplainer` module (mock/anthropic/openai provider, same shape as
Smart Resume) that writes a short plain-language paragraph reframing the gap as
a next step, plus a `findSimilarActiveJobs` query (reuses the nearby-feed geo
search) surfacing up to 4 other active jobs sharing a skill with the rejected
one. Both ride along on the existing `GET /applications/:id/skill-gap` response.
New `WhyRejectedScreen` (seeker) shows the paragraph, missing skills, course
CTA, and the similar-jobs list; the inline skill-gap card on My Applications
now opens it instead of jumping straight to the course.

**✅ 36. Reverse Interview** — Session 19. The employer answers five standard
worker questions when posting; the answers are public on the listing.

**✅ 37. Doondo for Women** — Session 27. Employer-declared women-safety
signals, a Women's Mode feed filter, a women-safety badge, and a dedicated hub.

**❌ 38. Doondo Diaspora** — Not started.

**❌ 39. Trade-specific micro-apps** — Not started.

**✅ 40. Open-shift from the seeker side** — Shipped. Extended the existing
availability beacon (`/me/availability`) rather than building a parallel
system: two new nullable columns (`wageAmount`/`wagePeriod`) turn a plain
"I'm free" beacon into a full posted open shift the moment a wage is named —
time window and area were already there. Naming a wage triggers a
nearby-employer push fan-out (`sendOpenShiftPush`, mirroring
`sendNewJobPush`'s exact batching/radius-cap pattern, reversed direction).
Because `AvailableWorkers` already reads this same table, it needed only a
wage badge, not a new screen — the mobile beacon sheet gained a "Name your
wage" toggle (amount + hour/day/week chips) that's opt-in, so a plain beacon
still works exactly as before.

**✅ 41. Smart Resume that rewrites itself per job** — Built (24 May 2026).
The `resumeRewrite` module (swappable mock / Anthropic provider) tailors the
worker's resume to one job — a job-tuned summary, relevance-ranked skills, and
re-worded work blurbs. `POST /me/resume/tailor`; entered from a card on the job
screen, with the worker reviewing the draft on `TailoredResumeScreen` before
saving it to their profile.

**✅ 42. Doondo Constitution** — Session 20. The worker sets personal work rules
(max distance, no nights, no Sundays, PPE, contract); employers see them on the
applicant view.

**❌ 43. Live Job Auction** — Not started.

**✅ 44. Doondo Trust Circle** — Session 3. Up to 3 vouched contacts are
notified on shift start/end and on SOS.

**✅ 45. Doondo Festival Mode** — Built (24 May 2026). A festival calendar
(`lib/festivals.ts` — Pongal, Eid, Onam, Diwali, Christmas) drives a self-hiding
themed Home banner, a `FestivalJobs` board that surfaces the trades which spike
that season, and festival flair in the Hire Celebration. _(Lunar-festival dates
are config and need an annual review.)_

**✅ 46. Wage Strike Alerts** — Shipped, deliberately conservative v1. The
roadmap flagged this as "politically/legally heavy — ship anonymous reviews
first, measure signal, then decide" (`DOONDO_V2_ROADMAP.md` bet #44);
checked with the user before building given that explicit gate, and got the
"build it now" call with a specific framing: structured flags, aggregate-only
surface, gated on volume — not a public per-employer accusation feed. New
`wage_flags` table (one flag per reporter+job, unique-constrained so a single
reporter can't inflate the count); `POST /wage-flags` (reason chip — below
promised wage / late payment / unpaid overtime / wage theft / other —
plus optional promised/actual wage amounts and a note); `GET
/wage-flags/mine` (the reporter's own receipt). The public surface is `GET
/users/:id/wage-flags-summary` — aggregate reason counts only, and the
service withholds it entirely below 3 total flags in the trailing 180 days,
the same honesty bar the ratings module's tag summary already uses. Individual
flags are never exposed to the flagged employer or to other seekers — not
even in aggregate form until that volume threshold clears. New mobile
`ReportWageIssueScreen` (reached from a quiet "Report a wage issue" link on
JobDetail) and a `WageSignalBanner` on EmployerDetail, styled and worded to
avoid reading as a verdict ("workers report", never "this employer does X").

**Moonshot total: 17 ✅ · 1 🟡 · 7 ❌**

---

## What's left

### Finish the last partial

5 of the 6 partials from the previous pass are now ✅ shipped (#35, #32, #8,
#40, #23 — see their entries above for what was added). One remains:

- **#30 Doondo Pulse widget** — code is written and typechecks (Android
  config-plugin wiring is complete; iOS needs one manual Xcode step — see its
  entry above), but nothing here has been through a real `expo prebuild` /
  `eas build` yet. Needs: an actual build, the manual iOS Widget Extension
  target step, and an on-device check that the widget renders and updates.

### The 7 not-started features

All larger / infrastructure-heavy, and all deliberately unstarted (bets, not
session-sized work): **#22 AR Job Vision**, **#27 In-shift AI coaching**,
**#33 Predictive availability**, **#34 Voice biometric identity**, **#38
Doondo Diaspora**, **#39 Trade-specific micro-apps**, **#43 Live Job
Auction**.

### Release work (independent of features)

Native-speaker QA on the Hindi / Tamil / Telugu / Kannada translations, and the
on-device boot against a real MongoDB. The app is beta-ready in English and
Hindi today.

**29 Aug 2026:** the Tamil / Telugu / Kannada QA pass now has a starting
artifact — `TRANSLATION_QA_TA.csv`, `TRANSLATION_QA_TE.csv`,
`TRANSLATION_QA_KN.csv` at the repo root, one row per locale string
(`key`, `english_source`, `current_translation`, `status`, a blank
`reviewer_notes` column). Extracted mechanically from
`apps/mobile/src/i18n/locales/*.json` — not translated or edited, just
flattened into a reviewable sheet. Each file also surfaces 624 keys the
locale is missing outright (falls back to English at runtime today,
flagged `status: MISSING — needs translation` rather than silently
blank) — genuine untranslated surface, not just a QA-pass backlog. Hindi
was left out of this extraction on purpose — it's the one non-English
locale already treated as production-quality throughout this report.
