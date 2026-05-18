# Doondo V2 — Feature Roadmap

Owner: Shree • Last updated: 2026-05-18

---

## Ranking lens

I'm ranking against a blended lens, in this priority order:

1. **Trust & safety** — non-negotiable. Without anti-ghost, women-mode basics, and safe SOS, the rest doesn't matter for blue-collar workers.
2. **Activation & retention** — does it get a worker to "found something" inside their first session, and pull them back daily?
3. **Defensibility** — does it become infrastructure competitors can't easily copy (Doondo Score, Skill Passport, Crew Apply, Voice Coach)?
4. **Effort as tiebreaker** — when two features rank similarly, smaller ships first.

Effort scale per feature: **S** (≤1 day), **M** (2–4 days), **L** (1–2 weeks), **XL** (>2 weeks).
Risk scale: **Low / Med / High** (technical or product risk).

---

## Now — ship this cycle (the 5 you'll see code for today)

| # | Feature | Why now | Effort | Risk |
|---|---|---|---|---|
| 1 | **60-sec first match** | Single biggest activation lever. Today RolePicker goes straight to Signup. Worker never sees the goods before being asked to commit. | M | Low |
| 2 | **Anti-ghost engine** | Establishes platform-level trust and is the single most-talked-about feature on every worker forum. Forces employer hygiene. | M | Med |
| 3 | **Skill gap on rejection** | Turns the most painful UX moment into a forward step; closes Courses ↔ Applications loop that's already half-built. | S–M | Low |
| 4 | **Personalized morning digest** | Daily habit driver. Recommendations service already scores per-user; we just need a cron and a digest assembler. | M | Med |
| 5 | **Doondo Score (v1, internal)** | Defensibility play. Even shipping it computed-on-read is a moat over time — every signal in the app starts feeding one number that's portable. | M | Low |

These five share infrastructure pieces (cron, course skill metadata, new notification kinds) so building them together compounds.

---

## Next — ship in the following 2–4 weeks

| # | Feature | Why | Effort | Risk |
|---|---|---|---|---|
| 6 | **One-photo profile (OCR resume snap)** | Massive for low-literacy users. Pair with a vision API (Google ML Kit or Anthropic vision). | M | Med |
| 7 | **Quick-reply templates + per-screen language toggle** | Cheap to ship, transforms chat usability for cross-region hiring. | S | Low |
| 8 | **Voice-note replies with auto-transcription** | Already have audio job descriptions; reuse the pipeline. | M | Low |
| 9 | **Live shift check-in (selfie + geofence)** | Unlocks payout integrity, kills fake-attendance disputes. Needs camera + location SDK plumbing. | M | Med |
| 10 | **Interview scheduler with calendar holds + reminders** | Application model already has `interview` field — needs reminder cron + ICS export. | S–M | Low |
| 11 | **Anonymous employer reviews (structured tags)** | Rating model exists; add a `tags[]` field + employer-profile aggregation. | S | Low |
| 12 | **SOS upgrade (family + 2 nearest verified peers)** | SOS screen exists; needs trust-circle model + geo fan-out. | M | Med |
| 13 | **Streaks for apply / course / shift days** | Tiny dopamine loop. Use champagne-gold accent per your design system rule. | S | Low |
| 14 | **Refer-a-friend with paid-on-first-shift reward** | Referral model already exists — needs payout trigger + share-card. | S–M | Low |
| 15 | **Re-engagement flow for 14-day dormant users** | Reuse digest cron with a different selector. | S | Low |
| 16 | **"Hired near you today" feed** | Social proof; small fan-out on hire transition. | S | Low |
| 17 | **Skill Passport (signed verifiable credentials)** | Doondo Score is the number; the Passport is the document. Ship the score first, layer the cryptographic signing on top. | L | Med |

---

## Later — quarter 2

| # | Feature | Why | Effort | Risk |
|---|---|---|---|---|
| 18 | **Crew Apply (3–5 seekers register as a team)** | No competitor does this; matches how painters/movers/cooks actually work. Needs new `Crew` model + atomic apply. | L | Med |
| 19 | **"Why was I rejected?" AI explainer** | Builds on #3 (skill gap) — adds a generative one-paragraph explanation. | M | Med |
| 20 | **Reverse Interview** | Power-flip moment. Needs employer profile fields + structured Q&A. | M | Low |
| 21 | **Smart Resume that rewrites per job** | Background re-templating; needs an LLM call per application. | M | Med |
| 22 | **Doondo Constitution (personal rules)** | Pre-filters bad-fit applications. Fields on User; surfaced as chips on the job feed. | S–M | Low |
| 23 | **Open-shift from Seeker Side** | Reverses marketplace direction. Availability model already exists — needs employer-side discovery. | M | Med |
| 24 | **In-chat auto-translate (vernacular ↔ English)** | Chat already real-time over sockets — add translation middleware. | M | Med |
| 25 | **PF / ESI / tax explainer for first-formal-job seekers** | Static content + a checklist; small effort, real workforce-formalization impact. | S | Low |
| 26 | **Career path map (driver → fleet supervisor → manager)** | Static catalog at first, dynamic later. Pair with courses. | M | Low |
| 27 | **Peer cohorts via Find Friends (5-person course groups)** | Find Friends service exists; new cohort model + chat thread. | M | Low |
| 28 | **Bookable 1:1 mentor sessions in MentorsScreen** | Mentor module exists; needs calendar slots + payment. | M | Low |
| 29 | **Trust Circle (3 vouched contacts)** | Underpins SOS upgrade + reference-net. | S–M | Low |
| 30 | **Doondo Pulse (home-screen widget)** | iOS WidgetKit + Android App Widget. Major retention play. | L | Med |
| 31 | **Hire Celebration as cultural moment** | 3D stack already in repo (r3f + expo-gl). Use champagne-gold per design tokens. | M | Low |
| 32 | **Festival Mode** | Theming layer + festival-specific job board fan-out. | M | Low |
| 33 | **Doondo for Women** | Women-only mode is its own product. Needs verifier model + location masking. | L | High |
| 34 | **Predictive availability** | ML model on the seeker's pattern. Requires data first. | L | Med |
| 35 | **Hire Reels (30-sec video resume)** | Storage cost, moderation cost, but conversion lift is unmatched. | L | High |
| 36 | **Trade-specific micro-apps inside Doondo** | Skinning layer; needs trade-driven config. | L | Low |

---

## Bets — explore but don't commit yet

| # | Feature | Why bet, not build | Effort | Risk |
|---|---|---|---|---|
| 37 | **AR Job Vision** | Beautiful demo, but discovery in the streets is a thin daily use case in India where most workers find jobs through known networks. Build only after retention is solid. | XL | High |
| 38 | **Doondo Coach (voice-first AI agent)** | The right long-term bet, but voice agent quality + Indian-language coverage is still hard. Ship VoiceSearchScreen well first. | XL | High |
| 39 | **Live in-shift AI coaching** | Compelling but no clear willingness-to-pay yet. Validate with VoiceSearch usage before committing. | L | High |
| 40 | **3D craft showcase** | Premium feel but production cost per portfolio is high. Ship Hire Reels first; portfolio is reels' adjacent. | L | Med |
| 41 | **Live Job Auction** | Surge-pricing for emergency gigs — fun, but operationally fragile (worker on the way, employer cancels, who pays?). Run as a regional pilot before national. | M | High |
| 42 | **Doondo Diaspora** | Strong segment, but billing + KYC for foreign payers is its own product. Earmark for v3. | L | High |
| 43 | **Voice biometric identity** | Auth team needs to own this. Premium feel but failure modes (cold/sick/noisy) are real. Keep as research. | M | Med |
| 44 | **Wage Strike Alerts** | Politically and legally heavy. Ship anonymous reviews first (#11), measure signal, then decide. | M | High |

---

## Cross-cutting infra we'll add along the way

Building the Now-5 lays down four pieces of plumbing every future feature will reuse:

- **`node-cron` + a `jobs/scheduler` module** — unblocks digest, anti-ghost sweep, dormant re-engagement, interview reminders.
- **`Course.skills[]` metadata** — unblocks skill-gap, career path map, Smart Resume.
- **New notification kinds: `morning_digest`, `application_ghosted`, `skill_gap`, `score_changed`** — unblocks every push-driven feature below.
- **Doondo Score computation service** — becomes the basis for Skill Passport, employer-side applicant sort, and the "trust" axis of every future ranking.

---

## What we are NOT shipping today (and why)

- AR Job Vision, Doondo Coach, Hire Reels, 3D craft showcase, Crew Apply — all worth doing, all need a week+ of focused work each. Not session-sized.
- Women-only mode — needs a separate verifier model and product/legal/ops thinking. Worth its own design session before code.
- Trade-specific micro-apps — premature; ship one trade well first.
- Voice biometric, AR — bets, not bones.

---

## Success metrics to instrument with the Now-5

- **60-sec first match** — % of role-pickers who see ≥1 preview job; signup conversion lift vs control.
- **Anti-ghost** — % of applications that get an employer response within 48h; weekly active employers.
- **Skill gap** — click-through from rejection card → course enrollment; rejected-then-enrolled rate.
- **Morning digest** — DAU lift; 7-day retention curve; opt-out rate.
- **Doondo Score** — distribution shape, % of seekers above 70, correlation with hire rate (the real test of the score's validity).
