# Doondo V2 — Punch List

What's left before a wider release. Generated 2026-05-22, updated 2026-05-24,
by cross-checking `DOONDO_V2_ROADMAP.md` and `Doondo-Profile-Redesign-Spec.md`
against the actual `apps/backend` + `apps/mobile` source tree and commit history.

Tick items as they land. Status legend: `[ ]` not started · `[~]` partial · `[x]` done.

---

## Snapshot

- **Roadmap:** 28 of 36 numbered features shipped · 2 partial · 6 not started · 8 "bets" untouched (by design).
- **Latest build (2026-05-24, uncommitted):** in-chat auto-translate (#24), Smart Resume (#21), Festival Mode (#32), and the Doondo Score QR credential — backend + mobile, both packages typecheck clean.
- **Beta-ready today** in English and Hindi.

---

## 1. Profile / navigation redesign — highest priority

Source: `Doondo-Profile-Redesign-Spec.md` v3.0 (dated 2026-05-21, still "Draft for
review").

> **UPDATE 2026-05-24:** the 6-tab navigation has since shipped — the app now
> runs Home / Jobs / Community / Chat / Earnings / Profile, and the Earnings tab
> has been rebuilt with the card layout. This section predates that work and
> needs a fresh audit; treat the checkboxes below as stale.

Resolve before building — the 5 open questions in spec §12:

- [ ] Confirm the 6-tab bar survives 320 dp width + all supported languages, or fall back to 5 tabs.
- [ ] Decide: application tracking as a segmented view inside Jobs, or its own screen from Home.
- [ ] Decide: Worker insurance in Earnings vs Profile → Account & settings.
- [ ] Confirm whether Chat is new or an existing messaging feature to migrate (it exists — migrate it).
- [ ] Choose the 3 metrics for the new stats row (replacing the duplicated completion figure).

Phase 1 — Navigation:

- [ ] Add `Community` and `Earnings` tabs; expand `SeekerTabNavigator` from 4 to 6 tabs.
- [ ] Build the 6-tab bottom bar to spec §8.1 (equal width, single-word labels, badges don't widen tabs, tested at 320 dp).
- [ ] Move Jobs / Community / Chat / Earnings content out of the old Profile list.
- [ ] Wire the migration map (spec §10) — every current Profile row to its new home.

Phase 2 — Profile groups:

- [ ] Replace the flat Profile list with two collapsible groups: "Grow your career" and "Account & settings".
- [ ] Apply the new copy (spec §6): "Skills hub" merges Skill tests + Skill Passport; "Work preferences" replaces "Your Work Rules"; "Find work buddies" merges Find friends + Trade buddies; remove ALL-CAPS headers.
- [ ] Persist each worker's expand/collapse choice; default-expand "Grow your career" on first visit.

Phase 3 — Polish:

- [ ] Fix the duplicate profile-completion figure — one progress bar as the single source of truth (spec §7).
- [ ] Redesign the stats row with the 3 chosen metrics.
- [ ] Add bottom-bar badges (Chat unread, Home alert dot).
- [ ] Complete regional-language coverage for all new nav/profile strings (design for ~30% text expansion).

---

## 2. Roadmap — partially done

- [~] **#28 Bookable 1:1 mentor sessions** — mentor discovery + request lifecycle work (`mentors` module); calendar slots and payment are missing.
- [~] **#31 Hire Celebration** — an apply-moment 3D celebration exists (`apply-moment/ApplyCelebration`); the hire-moment celebration does not.

---

## 3. Roadmap — not started (Later, Q2)

- [ ] **#19 "Why was I rejected?" AI explainer** — skill-gap diff (#3) is done; the generative one-paragraph explanation is not. Effort M / Risk Med.
- [x] **#27 Peer cohorts via Find Friends (5-person course groups)** — Shipped. See FEATURE_STATUS_REPORT.md #7.
- [ ] **#33 Doondo for Women** — needs verifier model + location masking; mockup only. Effort L / Risk High.
- [ ] **#34 Predictive availability** — needs usage data first. Effort L / Risk Med.
- [ ] **#35 Hire Reels (30-sec video resume)** — mockup only. Effort L / Risk High.
- [ ] **#36 Trade-specific micro-apps** — Effort L / Risk Low.

---

## 4. Roadmap — "bets" (explore, don't commit yet)

Untouched by design — validate before building.

- [ ] #37 AR Job Vision
- [ ] #38 Doondo Coach (voice-first AI agent)
- [ ] #39 Live in-shift AI coaching
- [ ] #40 3D craft showcase
- [ ] #41 Live Job Auction
- [ ] #42 Doondo Diaspora
- [ ] #43 Voice biometric identity
- [x] #44 Wage Strike Alerts — Shipped (conservative v1: structured, anonymous, aggregate-only, gated on volume). See FEATURE_STATUS_REPORT.md #46.

---

## 5. Release / verification work

- [ ] Native-speaker QA on the Tamil / Telugu / Kannada translations.
- [ ] On-device boot against a real MongoDB — verify the Session 24–25 native-module behaviour (offline mode, stay-signed-in / app lock).
- [ ] Commit or discard the working-tree change to `pnpm-lock.yaml`.

---

## Done — for reference (28 of 36)

- **Now-5 (#1–5):** 60-sec first match · anti-ghost engine · skill gap on rejection · morning digest · Doondo Score — plus the `node-cron` scheduler, `Course.skills[]` metadata, and new notification kinds.
- **Next (#6–17):** one-photo OCR profile · quick-reply templates + language toggle · voice-note auto-transcription · live shift check-in · interview scheduler · anonymous employer reviews · SOS upgrade · streaks · refer-a-friend · re-engagement flow · "hired near you today" · Skill Passport.
- **Later (#18, 20, 22, 23, 25, 26, 29, 30):** Crew Apply · Reverse Interview · Doondo Constitution · open-shift from seeker side · PF/ESI/tax explainer · career-path map · Trust Circle · Doondo Pulse.
- **2026-05-24 build (#21, #24, #32):** Smart Resume (per-job AI rewrite) · in-chat auto-translate · Festival Mode — plus the Doondo Score QR credential (signed, scannable, public verification page), which finishes the #5 Doondo Score moonshot.
- **Beyond the roadmap:** offline mode (queued applications), stay-signed-in + app lock, cash-paid confirmation, recurring availability beacons, Sentry integration.
