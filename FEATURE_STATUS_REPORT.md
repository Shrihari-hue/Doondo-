# Doondo V2 — Feature Status Report

_Audited 23 May 2026, against the codebase + `WHATS_NEW.md` (Sessions 1–28)._

## Summary

Of the 46 features in the list:

- **27 fully shipped** — built, wired, and verified (typecheck + offline bootcheck).
- **7 partially shipped** — the core is built; a described extension is not.
- **12 not started.**

Verification caveat that applies throughout: everything is verified as far as
this build environment allows (TypeScript, the offline boot smoke-test, pure-logic
unit checks). Native-module behaviour (camera, video, speech, biometrics) and a
real-MongoDB boot are verified on the deploy platform, not here.

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

**❌ 7. Peer cohorts via Find Friends** — Not started. `FindFriendsScreen`
(contacts-match + invite) exists, but there is no "group of 5 doing the same
course together" cohort feature.

**🟡 8. Bookable 1:1 mentor sessions** — Partial. The `mentors` module +
`MentorsScreen` ship mentor discovery and request / accept. The calendar-slot
booking of 1:1 sessions is not built.

**✅ 9. Live shift check-in (selfie + geofence)** — Session 3.
`applications/shiftCheckIn` service + model; protects against fake-attendance
disputes.

**✅ 10. Anonymous employer reviews + structured tags** — Session 2. The
`ratings` module, with the structured "Workers say…" tag summary (paid on time,
safe site, fair hours).

**✅ 11. SOS upgrade (family + 2 nearest peers)** — Session 3. The `sos` module
fans an alert to the Trust Circle plus the 2 nearest verified peers — not just
an admin.

**❌ 12. In-chat auto-translate** — Not started. Voice notes are transcribed
(not translated) and quick replies are pre-translated (#15), but free-text chat
messages are not auto-translated vernacular ↔ English.

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

**Core total: 18 ✅ · 1 🟡 · 2 ❌**

---

## Moonshots (25)

**❌ 22. AR Job Vision** — Not started. (`react-three-fiber` + `expo-gl` are in
the repo, so the 3D stack is available, but the camera-AR street view is not
built.)

**🟡 23. Doondo Coach — voice-first AI agent** — Partial (Session 26). The
voice agent does voice job search, reads results back aloud, and applies by
voice. It does not yet schedule interviews by voice or read employer replies
aloud, and the intent parser is a deterministic rule-based classifier (an LLM
swap is left as a documented seam).

**✅ 24. Hire Reels — 30-sec video resume** — Session 28. A worker records an
intro reel; employers swipe a full-screen discovery feed. _(v1 is browse-only;
auto-captioning and auto-translation of reels are not built.)_

**🟡 25. Doondo Score** — Partial (Session 1). The portable employability score
is computed from verified signals and exposed on a public read endpoint. The
cryptographically-signed, QR-shareable credential is not built.

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

**🟡 30. Doondo Pulse — ambient widget** — Partial (Session 13). The in-app
Doondo Pulse momentum card (score, streak, applications, next-step nudge) is on
the Home dashboard. A true phone home-screen OS widget is not built.

**✅ 31. Anti-ghost engine** — Sessions 1 + 7. A ghost-sweep cron flags
employers who don't respond within the SLA; a "no reply yet" badge shows on the
listing and the seeker is pushed to move on.

**🟡 32. Skill Passport with verifiable credentials** — Partial (Session 16).
The portable Skill Passport screen (verified skills, tests, ratings, shareable
as text) is shipped. DigiLocker-compatible, tamper-proof signed credentials are
not.

**❌ 33. Predictive availability** — Not started.

**❌ 34. Voice biometric identity** — Not started. Session 25 added a biometric
*app-lock* (the phone's fingerprint / face / screen-lock as an unlock gate) —
that is a local gate, not a voice-print identity that replaces OTP.

**🟡 35. The "Why was I rejected?" moment** — Partial. Skill-gap surfacing (#5)
delivers the core: on a rejection, the missing skill + a course to close it. The
richer plain-language AI explanation and "4 similar jobs hiring right now" framing
is not built.

**✅ 36. Reverse Interview** — Session 19. The employer answers five standard
worker questions when posting; the answers are public on the listing.

**✅ 37. Doondo for Women** — Session 27. Employer-declared women-safety
signals, a Women's Mode feed filter, a women-safety badge, and a dedicated hub.

**❌ 38. Doondo Diaspora** — Not started.

**❌ 39. Trade-specific micro-apps** — Not started.

**🟡 40. Open-shift from the seeker side** — Partial. The seeker availability
"beacon" (`/me/availability`) plus the employer-side `AvailableWorkers` /
`Workforce` views ship the broadcast direction. A full seeker-posted open shift
(set wage, time window, area → nearby employers pinged) is not built out.

**❌ 41. Smart Resume that rewrites itself per job** — Not started.
`ResumeBuilder` / `ResumePreview` exist, but there is no per-application AI
rewrite.

**✅ 42. Doondo Constitution** — Session 20. The worker sets personal work rules
(max distance, no nights, no Sundays, PPE, contract); employers see them on the
applicant view.

**❌ 43. Live Job Auction** — Not started.

**✅ 44. Doondo Trust Circle** — Session 3. Up to 3 vouched contacts are
notified on shift start/end and on SOS.

**❌ 45. Doondo Festival Mode** — Not started.

**❌ 46. Wage Strike Alerts** — Not started.

**Moonshot total: 9 ✅ · 6 🟡 · 10 ❌**

---

## What's left

### Finish the 7 partials (small, high-value)

- **#35 "Why was I rejected?"** — the skill-gap data already exists; this is
  mostly a richer explanation screen + a "similar jobs" query.
- **#25 Doondo Score QR** — the score is computed; add signing + a QR card.
- **#32 Skill Passport credentials** — add a verifiable/signed export.
- **#8 Bookable mentor sessions** — add calendar slots on top of the existing
  `mentors` module.
- **#40 Open-shift from seeker** — extend the availability beacon into a posted
  open shift with employer push.
- **#23 Doondo Coach** — add voice interview-scheduling / reading replies aloud.
- **#30 Doondo Pulse** — a native OS home-screen widget.

### The 12 not-started features

Smaller / well-scoped: **#7 Peer cohorts**, **#12 In-chat auto-translate**,
**#41 Smart Resume**, **#46 Wage Strike Alerts**, **#45 Festival Mode**.

Larger / infrastructure-heavy: **#22 AR Job Vision**, **#27 In-shift AI
coaching**, **#33 Predictive availability**, **#34 Voice biometric identity**,
**#38 Doondo Diaspora**, **#39 Trade-specific micro-apps**, **#43 Live Job
Auction**.

### Release work (independent of features)

Native-speaker QA on the Hindi / Tamil / Telugu / Kannada translations, and the
on-device boot against a real MongoDB. The app is beta-ready in English and
Hindi today.
