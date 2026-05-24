# Doondo — Employer-Side Build Spec

**Version:** 1.0
**Date:** 24 May 2026
**Owner:** Shree
**Audience:** Mobile developers and product designers
**Status:** Draft for review. Direction-setting spec for the employer-side build cycle. The seeker side is paused; this cycle makes the employer side a coherent, shippable product.

---

## 1. Context — why this cycle

The seeker (worker) side of Doondo V2 is feature-rich and largely shipped — 27 of 46 roadmap features built, beta-ready in English and Hindi. The employer side, by contrast, was built **piece by piece as the seeker features needed an employer counterpart**. The screens exist, but they were never designed as one product.

Concretely, the employer app today is a 4-tab shell — Posts, Applicants, Chat, You — that drops the employer straight into a list of job postings with no overview, no sense of "what needs my attention." Several screens (`AvailableWorkersScreen`, `ReelFeedScreen`) are reachable only as deep links from other flows. `WorkforceScreen` exists as a file but is a "coming soon" stub that is not even registered in the navigator. There is no employer onboarding flow, no hiring pipeline, no post-hire management, and no analytics.

So this cycle is **not a from-scratch build**. It is: complete the half-built pieces, fill the structural gaps, and unify everything into a single coherent employer experience built around the employer's real job-to-be-done.

The employer is a local, often small-scale hirer — a shop owner, contractor, restaurant manager, factory supervisor, or household. Like the seeker audience, many have limited digital literacy and hire on their phone, one-handed, between other work. The same design constraints apply: few choices per screen, plain language, large icon-led tap targets, regional-language support.

---

## 2. The employer's core loop

Every screen in this spec serves one loop:

> **Post or get matched → receive & vet candidates → talk & schedule → hire → manage the shift → pay & rate → re-hire.**

The employer side fails today not because pieces are missing but because the loop has holes — there is no path from "applicant" to "hired worker I manage," and no surface that tells the employer where they are in the loop. Closing the loop is the goal of this cycle.

---

## 3. Goals and design principles

- **One screen answers "what needs me now?"** The employer opens the app and immediately sees what is waiting on them — not a static list.
- **The loop is always visible.** Every candidate sits at a known stage; every hire becomes a managed worker; nothing falls off the edge.
- **Trust is mutual.** The seeker side already holds employers accountable (the anti-ghost engine flags slow responders publicly). The employer app must *help the employer stay accountable* — nudge them before they get flagged.
- **Reuse, don't rebuild.** Jobs, applications, ratings, shift check-in, and verification are shared backend modules already built for the seeker side. The employer side is mostly new UI over existing data.
- **Plain language, frequency-driven placement.** Same principles as the navigation/profile redesign (see `Doondo-Profile-Redesign-Spec.md`).
- **Restraint signals premium.** The five-color jewel-touched system applies: champagne-gold is reserved for the verified-employer badge, top-match candidates, and the hire-celebration moment only.

---

## 4. Decisions locked for this cycle

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| **Employer verification** | **Optional but badged** | Anyone can sign up and post a job immediately. Submitting a shop license / GST earns the verified-employer badge that seekers look for. This is the right call for a pre-launch testing phase: it lets us exercise the *entire* employer loop end-to-end without a document-collection pipeline blocking test accounts, and it protects supply — many genuine small employers and households have no GST. The build keeps a server-side config flag so verification can be flipped to **required-before-posting** later, once the verification pipeline is proven, without an app release. |
| **Monetization** | **Free entirely for now** | No posting fees, no boosts, no subscriptions this cycle. The priority is employer-side usage and a working loop. Monetization (free-to-post + paid boost is the likely future model) is deferred — but job, applicant, and hire data should be instrumented now so pricing can be designed on real numbers later. |
| **Worker payments** | **Both — employer picks per shift** | Per shift, the employer chooses an in-app UPI payout or a "paid in cash" confirmation. Infrastructure for both already exists in the repo (`UpiPaymentPanel`, plus the cash-paid confirmation shipped earlier). Either way the payment is recorded so a payout history exists. |

---

## 5. Information architecture — 5-tab bottom navigation

The employer bottom bar carries five top-level destinations. This replaces the current 4-tab bar (Posts, Applicants, Chat, You).

| # | Tab | Glyph | Purpose |
|---|-----|-------|---------|
| 1 | Home | `home` | Command center — what needs the employer's attention right now |
| 2 | Jobs | `briefcase` | Job postings + the per-job applicant pipeline |
| 3 | Workers | `users` | Find workers (search, availability, Hire Reels) + manage hired workforce |
| 4 | Chat | `message-circle` | Messaging with applicants and hired workers; interview scheduling entry point |
| 5 | You | `user` | Business profile, verification, reviews received, payouts, settings |

**Design note — five tabs.** Five is the top of the recommended 3–5 range for a bottom bar, so it is comfortable, but the same §8.1-style discipline from the profile spec still applies: strictly equal width, single-word labels, badges that don't widen tabs, tested at 320 dp in every supported language. The label set — Home, Jobs, Workers, Chat, You — is five single words by design; keep it that way.

**What changes from today's 4-tab bar:**

- **Posts → Jobs.** Renamed and broadened. The flat job list becomes job-list-plus-pipeline.
- **Applicants tab → removed as a tab.** A flat cross-job applicant list is the wrong primary surface — applicants belong *to a job*. Applicant review moves into Jobs (per-job pipeline) and is aggregated on Home ("waiting on you"). See §6.3.
- **Workers → new tab.** Promotes worker discovery (today buried as deep links) and finally gives the `WorkforceScreen` stub a real home.
- **Chat → unchanged** as a destination; gains the interview-scheduler entry point.
- **You → unchanged** in spirit; expanded contents (§6.5).
- **Home → new tab.** The single biggest gap. The employer currently has no overview.

---

## 6. Tab-by-tab contents

### 6.1 Home

A glanceable command center, not a menu. Suggested blocks, top to bottom:

- **Greeting** with the business name, and a verified-employer badge once earned.
- **The one nudge.** A single most-important prompt: verify your business, a job is about to expire, or — most importantly — *"3 applicants have been waiting over 24h."* This is the employer-facing half of the anti-ghost engine: warn the employer **before** the seeker-side flag fires.
- **Pulse strip.** Three live counts: Active jobs · New applicants · Working today. Each is tappable into the relevant tab.
- **Applicants waiting on you.** The most urgent few candidates to review, newest-waiting first. This is the core anti-ghost-prevention surface.
- **Working today.** A compact roster if any shifts are active — names, check-in status.
- **Post a job.** A prominent persistent CTA.
- **Recent activity.** Hired this week, new reviews received, jobs filled.

Home answers "what should I do next?" without the employer hunting.

### 6.2 Jobs

The employer's postings, plus the applicant pipeline folded in.

A segmented view — **Active** / **Closed** — mirroring the seeker Jobs tab. Each job card shows title, status pill, applicant count, and a compact pipeline mini-bar (how many candidates sit at each stage). Inline actions Pause / Reopen / Close are kept from the current `PostsScreen`. A persistent **"+ New"** opens the post-job flow.

Tapping a job opens the **job detail with the applicant pipeline** — a proper funnel, not a flat list:

> **New → Shortlisted → Interviewing → Offered → Hired · Rejected**

Each candidate is a card the employer drags or taps forward a stage. Tapping a card opens the existing `ApplicantDetailScreen`. The pipeline is the structural fix for the loop: every applicant has a known, visible stage.

### 6.3 Workers

Two segments.

**Find workers** — outbound discovery, unified. Today this is three disconnected screens; here they are one surface: keyword/trade search, the availability "beacon" list of workers broadcasting that they're free (`AvailableWorkersScreen`), and the Hire Reels swipe feed (`ReelFeedScreen`). One place to go looking for someone rather than waiting for applications.

**My workforce** — the post-hire half, and the home for the `WorkforceScreen` stub. Contents: **today's roster** with live shift check-in status (selfie + geofence — the backend already exists from the seeker side); an **attendance log** per worker; **per-shift payment** (UPI payout or mark-cash-paid) with payout history; **rate the worker** after a job; and **My crew** — favorited workers saved for one-tap re-hire.

### 6.4 Chat

Shared messaging with applicants and hired workers — the existing `ChatListScreen` and conversation threads, unchanged in mechanics. New: the **interview-scheduler entry point** lives here. From a conversation the employer can propose interview slots; the scheduler places a calendar hold and fires reminders (the seeker-side interview model and reminder cron already exist — this wires the employer end of it). The Chat tab icon carries an unread badge.

### 6.5 You

The employer's identity and account home. Contents: the **business profile** (`EmployerProfileScreen`) — name, type, location, brand basics; **verification status** and the path to the verified badge; the **Reverse Interview answers** (the five standard worker questions the employer answers once, shown publicly on every listing); **women-safety signals** the employer declares; **reviews received** from workers (the structured "Workers say…" tags); **payouts** — full payment history across all workers; and **settings**.

---

## 7. Key flows

### 7.1 Onboarding & verification
Role-picker → employer signup → a minimal business profile (name, business type, location, phone). The employer can **post immediately** — verification is not a gate (§4). Verification is offered as an ongoing prompt (on Home, in You); submitting a shop license or GST earns the champagne-gold verified badge. A server config flag can later make verification required before the first post.

### 7.2 Post a job
Home or Jobs "+ New" → `PostJobScreen` (already a full ~930-line flow): title, wage, location, shift pattern, skills required, optional audio description, the Reverse Interview Q&A, women-safety signals → publish. Free.

### 7.3 Receive & vet
Applications land in the job's pipeline at **New**. The employer opens `ApplicantDetailScreen` — already strong — to review the Doondo Score, Skill Passport, Doondo Constitution (the worker's stated work rules), Craft Showcase portfolio, ratings, and endorsements, then advances the candidate's stage.

### 7.4 Talk & schedule
From the candidate card or Chat, the employer messages the worker and proposes interview slots. The scheduler places a calendar hold and sends reminders to both sides.

### 7.5 Hire
From the pipeline (or chat) the employer taps **Make offer**. On the worker accepting, the application transitions to `hired`, the **Hire Celebration** moment plays (a cultural beat — reuse the apply-moment 3D stack, champagne-gold accent), and the worker moves into **My workforce**.

### 7.6 Manage the shift
The hired worker checks in per shift (selfie + geofence). The employer sees a live roster on Home and in Workers → My workforce, and an attendance log builds per worker.

### 7.7 Pay & rate
Per shift the employer chooses a UPI payout or marks cash paid; the payment is recorded to payout history either way. After the job the employer rates the worker (structured tags). Good workers can be saved to **My crew** for one-tap re-hire.

---

## 8. Current state — what exists vs. what to build

Audited against `apps/mobile/src/screens/employer/` and `apps/backend/src/modules/` on 24 May 2026.

### 8.1 Exists and reusable

| Asset | State | New home |
|-------|-------|----------|
| `PostJobScreen` | Full posting flow (~930 lines) | Jobs → "+ New" |
| `PostsScreen` | Job list, pause/reopen/close | Becomes the Jobs tab |
| `ApplicantsScreen` / `JobApplicantsScreen` | Flat applicant lists | Become the per-job pipeline |
| `ApplicantDetailScreen` | Deep candidate view (~1,390 lines) — score, passport, constitution, craft showcase | Unchanged; opened from the pipeline |
| `AvailableWorkersScreen` | Availability-beacon worker list | Workers → Find workers |
| `ReelFeedScreen` | Hire Reels swipe feed | Workers → Find workers |
| `EmployerProfileScreen` | Business profile | The You tab |
| `UpiPaymentPanel` | UPI payout panel | Workers → My workforce, pay flow |
| Backend: `employers` module | Public employer-profile endpoint with stats + ghost-rate | Powers the You tab and seeker-facing profile |
| Backend: `jobs`, `applications`, `ratings`, `applications/shiftCheckIn`, `verification`, `scheduler` | Shared modules, already built | Reused as-is; employer UI is new |

### 8.2 Missing — to build this cycle

- **Employer Home / dashboard** — does not exist. The single biggest gap.
- **5-tab navigator** — restructure `EmployerTabNavigator` from 4 tabs; update `EmployerTabParamList`.
- **Applicant pipeline / funnel** — today's applicant list is flat; no stages.
- **`WorkforceScreen`** — a "coming soon" stub, not even registered in the navigator. Build into Workers → My workforce.
- **Employer-side interview scheduler** — the seeker-side model exists; the employer end is unwired.
- **Employer-side hire moment** — no Make-offer flow, no employer Hire Celebration.
- **Employer onboarding & verification surface** — no employer signup/business-profile/verification flow on screen.
- **Payments surface** — `UpiPaymentPanel` exists but is not tied to a per-shift flow or a payout history.
- **Anti-ghost employer nudges** — the seeker-side flagging exists; the employer-facing "respond before you're flagged" warning does not.
- **Job/applicant analytics** — no funnel metrics, no time-to-hire (instrument now even though monetization is deferred).

---

## 9. Migration map — where each current screen goes

| Current screen / tab | New location |
|----------------------|--------------|
| Posts tab (`PostsScreen`) | **Jobs** tab |
| Applicants tab (`ApplicantsScreen`) | Removed as a tab → per-job pipeline in **Jobs**, aggregated on **Home** |
| `JobApplicantsScreen` | The per-job pipeline view in **Jobs** |
| `ApplicantDetailScreen` | Unchanged; opened from the pipeline |
| `PostJobScreen` | Reached via "+ New" in **Home** and **Jobs** |
| `AvailableWorkersScreen` | **Workers** → Find workers |
| `ReelFeedScreen` | **Workers** → Find workers |
| `WorkforceScreen` (stub) | Rebuilt as **Workers** → My workforce |
| `EmployerProfileScreen` | **You** tab |
| `UpiPaymentPanel` | **Workers** → My workforce (per-shift pay) |
| Chat (`ChatListScreen`) | **Chat** tab (unchanged) + interview scheduler entry |
| (new) Employer Home | **Home** tab |

---

## 10. Component notes

- **5-tab bottom bar.** Equal-width tabs (~20% each), active tab distinguished by color only (never widened), 22–24 dp glyph above a 9–10 sp single-word label, 48×48 dp minimum tap target, badges overlapping the icon without adding width. Test at 320 dp in every supported language. Follows §8.1 of `Doondo-Profile-Redesign-Spec.md`.
- **Pipeline column / candidate card.** A horizontally segmented funnel; each candidate is a card showing photo, name, Doondo Score, top skill, and a stage control. Advancing a stage is one tap; the card animates between columns.
- **Home blocks.** Each block in §6.1 is a card; the "one nudge" and "applicants waiting" blocks self-hide when empty so Home stays calm on a quiet day.
- **Premium accents.** Champagne-gold (0.5px hairline at ~35% opacity) on the verified-employer badge, top-match candidate cards (score 90+), and the hire-celebration moment only. Everywhere else uses the default border.

---

## 11. Suggested rollout phasing

**Phase E1 — The spine.** Restructure `EmployerTabNavigator` to 5 tabs; update `EmployerTabParamList`. Build the Home dashboard. Build the employer signup → business profile → verification surface. Wire `WorkforceScreen` into the navigator as a real (if initially thin) screen.

**Phase E2 — The hiring pipeline.** Convert the flat applicant list into the staged pipeline inside Jobs. Wire the employer-side interview scheduler. Build the Make-offer flow and the employer Hire Celebration. Add anti-ghost employer nudges on Home.

**Phase E3 — Workforce & money.** Build Workers → My workforce: today's roster, shift check-in monitoring, attendance log, per-shift pay (UPI + cash, with payout history), rate-the-worker, My crew.

**Phase E4 — Discovery & growth.** Unify search + availability beacons + Hire Reels into one Find-workers surface. Add job/applicant analytics (funnel, time-to-hire) and one-tap re-post / job templates.

**Phase E5 — Bets.** Live Job Auction and a Doondo Coach for employers — only after the core loop is solid. Not committed.

---

## 12. Open questions for review

- **Applicant inbox.** §6.2 folds applicant review entirely into per-job pipelines. Do employers running many jobs at once also need a single cross-job "all applicants" inbox, or is the Home "waiting on you" strip enough?
- **Verification flip.** When should the config flag move verification from optional to required-before-posting — at official launch, or never (badge-only forever)?
- **Interview model.** Confirm the seeker-side interview/reminder model is bidirectional and can be driven from the employer end without schema changes.
- **Hire Celebration reuse.** Can the apply-moment 3D stack be reused as-is for the employer hire moment, or does it need an employer-specific variant?
- **Payments depth.** Is per-shift "mark paid" plus a payout history enough for now, or does My workforce need a running ledger / escrow before launch?
- **Tab labels.** Does any of Home / Jobs / Workers / Chat / You truncate at 320 dp in Hindi, Tamil, Telugu, or Kannada? (Five tabs is within range, so lower risk than the seeker side's six.)
