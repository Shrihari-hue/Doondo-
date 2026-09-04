# Doondo Employer — Implementation Plan (Jobs + Quick Work)

> Status: rewritten against the actual repository (`apps/mobile`, `apps/backend`) on the
> `Doondo-yakshi` branch. Every claim below about "existing" behavior was verified by
> reading the real source; every "NEW" item is something that does not exist today.
> Tags used throughout: **[EXISTING]** untouched, **[REUSE]** existing infra extended
> for Quick Work, **[NEW]** genuinely new code/tables/screens.

---

## 1. Product Purpose

Doondo's employer side supports two conceptually distinct work models that must **not**
be merged into one flow:

1. **JOBS [EXISTING]** — planned/long-term hiring. Post a job → workers apply → employer
   reviews applicants → hire → roster/attendance → payroll → rating. This is a mature,
   fully-built system (34 employer screens, ~30 backend modules) and is **not to be
   broken, refactored, or reshaped** by this plan.
2. **QUICK WORK [NEW]** — on-demand local services. "I need an electrician now" or "book
   a plumber for Tuesday 4pm." Employer describes the problem, Doondo matches nearby
   qualified workers, one accepts, worker travels, work happens, employer pays, both
   rate each other. This does not exist in the repo today in this shape — the closest
   existing things are described in §2 and are reused where genuinely equivalent.

**Non-negotiable**: Jobs = planned employment. Quick Work = need someone now.
Scheduled Quick Work = need someone at a set time. All three share Doondo's identity,
auth, chat, wallet/payment, ratings, and Socket.IO infrastructure — the app must not
feel like two unrelated products bolted together.

---

## 2. Existing Architecture Analysis

This section is the load-bearing part of the plan — it is what the old draft was
missing. Read this before touching any code.

### 2.1 Stack
- **Mobile**: `apps/mobile` — Expo/React Native, TypeScript, React Navigation
  (native-stack + bottom-tabs), Zustand + React Query, Socket.IO client.
- **Backend**: `apps/backend` — Express, Drizzle ORM over **PostgreSQL** (with real
  PostGIS `geometry(Point)` columns and GIST indexes on the tables that need geo
  queries), Socket.IO, Zod validation. The backend is **mid-migration from a legacy
  MongoDB/Mongoose codebase** — schema files under `apps/backend/src/db/schema/*.ts`
  are explicitly documented as "Postgres port of the Mongoose X model." New Quick Work
  tables should be written Postgres/Drizzle-native from the start (no Mongo).
- One module = one directory under `apps/backend/src/modules/<name>/` with
  `*.routes.ts` + `*.service.ts` (+ optional `.controller.ts`/`.schemas.ts`/`.model.ts`).
- One mobile API client per backend module: `apps/mobile/src/api/<name>.api.ts`, a thin
  wrapper over `apiRequest<T>(path, { method, body })` from `./client.ts`. **Quick Work
  must follow this exact 1:1 naming convention** (`quickWork.api.ts` ↔
  `modules/quickWork/`), not invent a different shape.

### 2.2 Employer navigation today [EXISTING]
`apps/mobile/src/navigation/EmployerTabNavigator.tsx` — 5 tabs, not the 4 the original
draft assumed:

```
EmployerHome | EmployerJobs (PostsScreen) | Workers | Chat | EmployerProfile
```

Plus a **raised circular Voice FAB** in the middle slot (opens `EmployerVoiceAgent` on
tap, a search modal on long-press) built from the shared `<VoiceAction>` component.
`Applicants` is a stack screen reached from Jobs, not its own tab.

The user-provided target nav ("Home / Jobs / Quick Work / Chat / Profile") does not
map cleanly onto 5 existing tabs + 1 FAB slot. See §5 for the concrete navigation
decision — this is flagged as a real design fork, not silently resolved.

### 2.3 Jobs system — what actually exists [EXISTING, do not break]
- `db/schema/jobs.ts`: `jobs` table has a **real PostGIS `geometry('geo', {type:'point'})`
  column with a GIST index** (`jobs_geo_gist_idx`) — proper `ST_DWithin`/`ST_Distance`
  queries already work here. `skills: text('skills').array()` is **free-text strings**,
  not a foreign key to any category/service table. There is **no `category` or
  `categoryId` column on `jobs` at all.**
- `apps/mobile/src/screens/employer/JobIcon.tsx`'s `categoriseJob(title, type)` — the
  only thing resembling a "job category" today — is a **pure client-side keyword
  matcher** run against the job's free-text title, used solely to pick a decorative
  icon tint. It has zero backend representation and cannot be queried on. **This
  confirms the requested service catalog is genuinely new infrastructure**, not
  something to extend.
- `db/schema/applications.ts`: rich state machine already —
  `pending → viewed → shortlisted → rejected/hired/withdrawn`, plus **`offerStatus`**
  (`pending/accepted/declined/expired/countered`), **`onTheWayStartedAt` +
  `onTheWayEtaMinutes`** (a real "worker is on their way, ETA N minutes" flag already
  used by the Jobs flow — the closest existing precedent to Quick Work's
  `ARRIVING` state), `shiftConfirmationStatus`, `paymentStatus`.
- `applications.shiftCheckIns` table + `shiftCheckIn.service.ts` **[EXISTING]** — a
  geofenced selfie check-in/check-out system (750m fence via haversine, socket-emits to
  the seeker, pushes the employer, triggers Home-Safe / streak / referral side
  effects). This is the closest existing precedent for Quick Work's
  arrival/start/completion proof, but it is **hard-coupled to `applicationId` + `hired`
  status** — not directly reusable, but its *pattern* (photo + geofence + socket +
  push) is exactly what Quick Work's completion proof should copy.

### 2.4 The closest existing "instant matching" precedents [do NOT confuse these with Quick Work]
- **`needsYouNow.service.ts`** — a **read-only** priority feed for the Employer Home
  ("worker on the way," "counter offer," "work proof pending," "applicant waiting 24h+,"
  "doc expiring soon"). It aggregates existing Jobs data; it does **not** do any
  matching or offers. Reused only as *the pattern* for how Home surfaces "what needs
  you" — Quick Work's own active-request state can plug into a similar feed later, but
  this module itself is not touched.
- **`hiringRequests` module** — employer invites **one named worker** to apply to a
  **specific existing job posting**; the worker accepts/declines; accept auto-creates
  an `application` row at `shortlisted`. This is a single-target, job-scoped invite —
  **not** a multi-candidate race with geo/ETA ranking, and it requires an active `Job`
  to exist. Wrong shape for Quick Work's offer fan-out, but its **code pattern** (lazy
  expiry via `expiresAt` compared at read time, no cron; `hydrate()` bulk-join helper;
  `notifications.record()` on send/respond) is the direct template for
  `QuickWorkOffer`.
- **`availabilities` module — the single most important reusable building block.**
  `availabilities.geo` is a real PostGIS point column, and
  `availability.service.ts#findNearby({lat, lng, radius, trade, type, seekerIds})`
  already runs `ST_DWithin`/`ST_Distance` to return **nearby, currently-available
  workers**, filtered by free-text `trade`, hydrated with seeker profile + rating in
  bulk queries. This is 80% of Quick Work's "find candidate workers" query already
  built and battle-tested — see §11 for how it's extended (not duplicated).
- **`arrivalLikelihood.service.ts`** — a transparent 0–100 "will they show up" heuristic
  (distance band + shift time-of-day + rating), with a reusable `haversineMeters()`
  helper. Useful signal for offer ranking (§11), not a full matching engine.
- **`travelTime.service.ts`** — real driving ETA/distance via Google Distance Matrix,
  with **graceful straight-line fallback** when no API key or on upstream failure
  (`estimated: true` flag). **Directly reusable, unchanged**, for both matching-rank
  and the Worker-Found/Live-Tracking ETA display. No new ETA code should be written.
- **`maskedCall.service.ts`** — privacy-preserving call proxy (Twilio-style, falls back
  to real number if no provider configured). Hard-coupled to `applicationId`. Pattern
  reusable; needs a parallel authorization path keyed on a Quick Work request instead.

### 2.5 Payments & wallet [EXISTING — the payment story is basically already built]
- `payments/payment.routes.ts` — **`POST /payments/intent` → employer generates a UPI
  deep link → employer confirms `POST /payments/:id/mark-paid` (self-attested, since
  UPI apps don't callback the server) → `GET /payments/:id/receipt` for a GST-style
  receipt.** `paymentIntents.applicationId` is **already nullable** — this is the exact
  "estimated → final price → payment pending → paid → receipt" flow the plan needs,
  and it's structurally ready to extend (see §17).
- `wallet.service.ts` + `walletTransactions` table — worker earnings ledger
  (`kind: hire_payment | adjustment | cash_log | qr_collection | payout`),
  `splitCommission(grossPaise)` for Doondo's cut, payout via `requestPayout`. Marking a
  payment intent paid already inserts a `hire_payment` wallet credit for the worker.
- `ratings` table — **NOT reusable as-is**: `applicationId` and `jobId` are
  `.notNull()` foreign keys, so a Quick Work rating cannot be inserted without either
  a schema change (making them nullable + adding a nullable `quickWorkRequestId`) or a
  parallel table. Flagged as a real decision point, not silently assumed.
- `blockedWorkers` table — **fully generic already** (`employerId + workerId`, no job
  scoping). Directly reusable for Quick Work's "block" safety requirement, no schema
  change needed.

### 2.6 Socket.IO [EXISTING — reuse exactly, add no new architecture]
`sockets/index.ts` + `sockets/bus.ts`: JWT-authenticated handshake, every connected
socket joins **one room, `user:<userId>`**. Services emit via
`emitToUser(userId, event, payload)` — a simple decoupled getter, no per-topic/per-job
rooms exist anywhere in the codebase today. Quick Work's multi-worker offer fan-out is
therefore just a loop of `emitToUser` calls to each of the 3–5 candidate ids — **no new
socket architecture required.**

### 2.7 Service/skill taxonomy — the most important gap, and prior art to build on
There is **no database-backed category/service catalog anywhere in the repo.** But
there *is* real prior art that must be reused as seed content, not re-invented:
- `apps/mobile/src/lib/trades.ts` **[EXISTING]** — a curated worker "trade" catalogue:
  `{slug, label, shortLabel?, emoji, aliases[]}`, used for the seeker's tap-to-select
  skills picker. ~9 broad groupings (transport, construction, food, events, retail,
  services, care, clerical, security), ~40+ concrete trade slugs (mason, painter,
  carpenter, electrician, plumber, welder, ac_technician, mechanic, driver_light/heavy,
  delivery, cook, baker, waiter, …). Free text is still allowed alongside it.
- `apps/backend/src/modules/skills/skill.catalogue.ts` **[EXISTING]** — a parallel
  backend-only catalogue (`{slug, label, category, showcaseType, proofHint}`) for the
  Craft Showcase 3D portfolio feature. Its own doc comment already says: *"Long term
  both catalogues should be promoted into `packages/` so there is exactly one source of
  truth"* — i.e. the Doondo team has already identified this exact duplication as tech
  debt.
- `users.skills: text[]` — the seeker's actual stored skills are **free-text slug
  strings**, matched by string equality, not by any foreign key.

**Implication for this plan**: the new Master Service Catalog (§8) is genuinely new
database infrastructure, but its **seed data** should be derived from these two
existing catalogues (slugs kept stable so `users.skills` string matches still resolve
sensibly), and the catalogues themselves should eventually point at the new tables
(tracked as a follow-up, out of scope for Quick Work v1 — do not touch `trades.ts` /
`skill.catalogue.ts` in the first implementation phase).

### 2.8 What does NOT exist (so nobody goes looking for it)
- No live GPS breadcrumb streaming anywhere. "On the way" in the existing Jobs flow is
  a start-timestamp + a static ETA-minutes number, not a moving map dot. Quick Work v1
  should copy this same lower-cost pattern (§14) rather than inventing continuous
  location streaming; true live GPS trails are a explicitly a v2 idea (§30).
- No `category_id`/`service_id` column anywhere in `jobs`, `applications`, or `users`.
- No multi-candidate "race to accept" pattern anywhere (hiringRequests is 1:1).
- No `quick_work_*` tables, routes, screens, or Socket events. Every `quick_work:*`
  event name in this document is a proposal, not something already wired up.

---

## 3. Existing Functionality To Reuse (summary table)

| Need | Reuse | Why it fits | Change required |
|---|---|---|---|
| Nearby available workers | `availabilities` table + `findNearby()` | Real PostGIS `ST_DWithin` query, already hydrates seeker+rating | Add `serviceIds uuid[]` column alongside `tradesAvailable`; extend `findNearby` filter |
| ETA / travel distance | `travelTime.service.ts` | Google Distance Matrix + fallback, battle-tested | None — call as-is |
| No-show risk signal | `arrivalLikelihood` pattern + `haversineMeters` | Transparent scoring, reusable math | Adapt inputs (no `applicationId` yet) |
| Offer send/expire/respond shape | `hiringRequests` module pattern | Lazy-expiry, `hydrate()`, notification-on-transition | Re-implement for multi-candidate fan-out (see §12) — the *code shape*, not the table |
| Payment (UPI intent → paid → receipt) | `payments/payment.routes.ts` + `paymentIntents` | `applicationId` already nullable, receipt already generic | Add nullable `quickWorkRequestId` column + accept it in the 3 routes |
| Worker earnings ledger | `wallet.service.ts` + `walletTransactions` | Commission split, payout already wired | Add `quick_work_payment` to `wallet_kind` enum |
| Safety block | `blockedWorkers` table | Already generic, no job scoping | None |
| Notifications | `notification.service.ts#record()` | Simple insert + push, kind-based | Add new `notification_kind` enum values |
| Real-time events | `sockets/bus.ts#emitToUser` | Per-user rooms already work for fan-out | None — new event name strings only |
| Auth/authorization | `middleware/auth.ts` (`requireAuth`, `requireRole`) | Standard on every route today | None |
| Skill/trade seed content | `trades.ts` + `skill.catalogue.ts` | Avoids re-typing 200+ service names from scratch | Copy into new DB seed migration, keep slugs stable |
| Chat | existing `chat` module/screens | Already role-agnostic, works for any two users | None — Quick Work conversations are just normal chats scoped by context, not a new chat system |
| Ratings UI/summary | `ratings.service.ts#summarizeForUsers` display pattern | Same "★4.6 · 32" badge everywhere | Table itself needs either nullable FKs or a parallel table (§18) |

---

## 4. New Functionality (summary)

- **Service catalog**: `service_categories`, `services` tables + admin-free seed data,
  `services.api.ts` client, category→service→search picker UI.
- **Quick Work request lifecycle**: `quick_work_requests` table + state machine (§9),
  `quickWork.service.ts`, `quickWork.routes.ts`, `quickWork.api.ts`.
- **Offer fan-out**: `quick_work_offers` table, atomic first-accept-wins logic (§12).
- **Worker service availability**: extend `availabilities` with `serviceIds`.
- **Quick Work screens**: ~18 new employer screens (§7), reusing shared components
  (`Card`, `Button`, `Pill`, `StatCard`, `EmptyState`, `VoiceAction`) from the existing
  design system — no new component library.
- **Quick Work nav entry point**: on Employer Home + navigation (§5–6).
- **Payment/rating extensions**: nullable `quickWorkRequestId` columns (§17–18).
- **New Socket.IO event names** (§24) and **new notification kinds** (§23).

---

## 5. Employer Navigation — the real decision to make

Current tabs: `Home | Jobs | Workers | Chat | Profile` + Voice FAB. The requested
concept was `Home | Jobs | Quick Work | Chat | Profile` — five slots, but the existing
five are already spoken for (`Workers` — Available Workers / worker discovery — has no
obvious 1:1 replacement, since it's a used, real screen backing the "Find workers"
flow, not dead weight).

Three real options — **pick one before starting Phase 1 UI work**:

1. **Recommended: fold Quick Work into Home, no new tab.** Employer Home gets a
   prominent "Find a worker now" primary action (§6) that pushes into the Quick Work
   stack. `Workers` tab stays as-is (traditional worker discovery / hiring-request
   flow, unrelated to Quick Work's live-matching). Zero navigation risk, ships fastest,
   matches how `EmployerVoiceAgent`/`WalletTopUp`/etc. are already reached (modal
   stack screens off Home, not tabs).
2. **Replace `Workers` tab with `Quick Work`.** Higher risk: `Workers` (Available
   Workers, worker map, hiring requests) is real, used functionality — this would need
   its own relocation plan (e.g. folded into Jobs' "Applicants" area) and is explicitly
   out of scope ("do not break existing functionality") unless the product owner signs
   off on demoting worker discovery.
3. **Six-icon tab bar** (drop the raised Voice FAB pattern to fit 6 flat tabs, or add a
   scrollable/overflow tab). Biggest navigation-system change, touches
   `EmployerTabNavigator.tsx`'s Voice-FAB layout math that was carefully tuned in the
   last redesign pass — highest regression risk for the least benefit.

This plan proceeds on **option 1** as the default recommendation; §7 assumes a
stack entry point from Home, not a new tab. If the product owner prefers option 2 or
3, only §5–§7 need re-scoping — nothing else in this plan changes.

---

## 6. Employer Home — changes

Current `EmployerHomeScreen.tsx` **[EXISTING, unchanged structure]**: stats strip (New
Apps / Shortlisted / Hired-this-week) → quick-actions grid (Attendance / Salary /
Assign Task / Analytics) → "Post a job" CTA → recent jobs list → a "More" grid
(Analytics / Roster / Payroll / Time-Off / Notifications / Settings).

**NEW**, inserted near the top (above or beside the existing stats strip, per option 1
in §5):
- A **"Find a worker now"** primary card/button — the Quick Work entry point. Tapping
  opens the Quick Work stack at Category selection.
- A secondary **"Schedule for later"** affordance (same entry, pre-selects Scheduled
  in step 6 of §9's flow) — can be a toggle on the same card rather than a second CTA,
  to avoid visual clutter.
- An **"Active work"** section, shown only when the employer has a live
  `quick_work_requests` row not yet `COMPLETED`/terminal — mirrors how `needsYouNow`
  already surfaces "worker on the way" for Jobs; reuse that visual treatment, not a new
  pattern.
- **"Recent work"** — last few completed/cancelled Quick Work requests, same list-row
  visual language as the existing "recent jobs" list already on this screen.

Existing "Post a job" CTA, stats, and quick-actions grid are **not touched or
reordered relative to each other** — Quick Work is additive above/beside them, per the
explicit "don't destroy the existing Jobs experience" instruction.

---

## 7. Quick Work Flow — screens

Confirmed against `design/components.md`/`design/layout.md` (the mobile app's live
design system from the recent redesign) — every new screen must use the shared
`Screen`, `Card`, `Button`, `Pill`, `TextField`, `EmptyState`, `StatCard`,
`SectionHeader` components and semantic theme tokens (`theme.brand.primary`,
`theme.status.*`, etc.), exactly like every existing employer screen. No new visual
language.

New screens (all **[NEW]**, under `apps/mobile/src/screens/employer/quick-work/`):

| # | Screen | Purpose |
|---|---|---|
| 1 | `QuickWorkHomeScreen` | Entry point — recent categories, active request banner, "Post something else" |
| 2 | `QuickWorkCategoryScreen` | Grid of top-level categories (see §8) |
| 3 | `QuickWorkServiceScreen` | Services within a category + search bar |
| 4 | `QuickWorkDescribeScreen` | Title/description text input |
| 5 | `QuickWorkMediaScreen` | Photo/video/voice-note attachments (reuse `AttachmentSheet`, `RecordReelScreen`'s voice-capture pattern) |
| 6 | `QuickWorkLocationScreen` | Confirm/adjust map pin (reuse `LocationPickerScreen`) |
| 7 | `QuickWorkTimingScreen` | Now vs Scheduled date/time picker |
| 8 | `QuickWorkBudgetScreen` | Optional budget/price range input |
| 9 | `QuickWorkReviewScreen` | Summary before posting |
| 10 | `QuickWorkMatchingScreen` | "Finding a worker…" animated waiting state |
| 11 | `QuickWorkNoWorkerScreen` | `NO_WORKER_FOUND` — retry / widen radius / post as Job instead |
| 12 | `QuickWorkWorkerFoundScreen` | Worker card — name, photo, rating, verification, ETA, distance, chat/call |
| 13 | `QuickWorkTrackingScreen` | Arriving/Arrived states — ETA countdown (not live GPS, see §14) |
| 14 | `QuickWorkInProgressScreen` | Work started — timer, chat, "mark complete" affordance for employer to confirm |
| 15 | `QuickWorkCompletionScreen` | Completion summary, worker's proof photo/notes, final price |
| 16 | `QuickWorkPaymentScreen` | Reuses `UpiPaymentPanel`'s pattern directly — same UPI-intent flow |
| 17 | `QuickWorkRatingScreen` | Reuses existing `LeaveRatingScreen` pattern |
| 18 | `QuickWorkHistoryScreen` | Active / Completed / Cancelled tabs |

Flow (linear, matches the brief exactly):
```
Home → Quick Work → Category → Service → Describe → Media → Location →
Now/Scheduled → Budget → Review → Post → Matching → [Worker Found | No Worker Found]
→ Worker Details → Tracking (Arriving → Arrived) → In Progress → Completed →
Payment → Rating → History
```

---

## 8. Service Catalog — source of truth

**[NEW]** — no equivalent exists (§2.7). Database-driven, shared between seeker and
employer (one catalog, not two), matching by id not free text, exactly as specified.

### 8.1 Schema
```
service_categories
  id            uuid PK
  name          varchar(80)
  slug          varchar(80) unique
  icon          varchar(60)      -- Feather icon name, matches existing icon convention
  sortOrder     integer
  isActive      boolean default true
  createdAt / updatedAt

services
  id                      uuid PK
  categoryId              uuid FK -> service_categories.id
  name                    varchar(120)
  slug                    varchar(120) unique
  description             varchar(500)
  icon                    varchar(60)
  isActive                boolean default true
  requiresVerification    boolean default false
  requiresQualification   boolean default false
  requiresLicense         boolean default false
  supportsQuickWork       boolean default true
  supportsScheduledWork   boolean default true
  supportsTraditionalJob  boolean default true
  createdAt / updatedAt
  -- index on (categoryId), GIN/trigram index on (name) for search
```

Seed data: the 24 categories / ~350 services listed in the product brief, cross-walked
against `trades.ts`/`skill.catalogue.ts` slugs so existing free-text skills continue to
resolve where they overlap (e.g. `electrician`, `plumber`, `mason`, `carpenter`,
`painter`, `welder`, `ac_technician`, `mechanic`, `cook`, `baker`, `driver_light`,
`driver_heavy`, `delivery` keep their existing slugs as the new `services.slug`).

### 8.2 Worker side — service availability
**[NEW column on EXISTING table]**: `availabilities.serviceIds uuid[]` (nullable,
alongside the existing free-text `tradesAvailable`, not replacing it — Jobs/Availability
beacon UI is untouched). A worker opts into specific `service_id`s they're willing to
do Quick Work for; `findNearby()` gains an optional `serviceId` filter parameter
alongside its existing `trade`/`type` filters.

A worker not represented in `availabilities` at all (no live beacon) is simply not a
Quick Work candidate — same rule as today's "nearby workers" feature.

### 8.3 Employer selection UI
`Category → Service → Requirement`, never a flat 24-item wall (per the brief).
Search bar on the Service screen queries `GET /services?q=<text>` (trigram/ILIKE
search server-side), returning `{categoryId, serviceId, name}` rows — **the mobile
client never sends free-text category names to matching endpoints**, only ids.

---

## 9. Request Creation & Data Model

### 9.1 Entity — **[NEW]**, does not overload the `jobs` table
```
quick_work_requests
  id                    uuid PK
  employerId            uuid FK -> users.id
  categoryId            uuid FK -> service_categories.id
  serviceId             uuid FK -> services.id
  title                 varchar(120)
  description           varchar(2000)
  photos                text[]            -- storage URLs, same upload path as job photos
  videos                text[]
  voiceNoteUrl          text
  geo                   geometry(Point)   -- PostGIS, mirrors jobs.geo — NOT jsonb
  address               varchar(240)
  city                  varchar(80)
  isImmediate           boolean
  scheduledAt           timestamptz       -- null when isImmediate
  budgetMin / budgetMax integer           -- paise, nullable (employer-entered estimate)
  estimatedPrice        integer           -- paise, nullable (worker/offer-side estimate)
  finalPrice            integer           -- paise, set at completion
  status                quick_work_status enum (§10)
  matchedWorkerId       uuid FK -> users.id, nullable
  cancelledBy           varchar(20)       -- 'employer' | 'worker' | 'system'
  cancellationReason    varchar(500)
  disputeReason         varchar(500)
  createdAt / postedAt / matchingStartedAt / acceptedAt / arrivingAt / arrivedAt /
    startedAt / completedAt / paidAt / ratedAt / cancelledAt   (all nullable timestamptz)

quick_work_offers        -- one row per candidate the request was offered to
  id                uuid PK
  requestId         uuid FK -> quick_work_requests.id
  workerId          uuid FK -> users.id
  status            enum('offered','accepted','declined','expired','superseded')
  distanceMeters     integer
  etaMinutes         integer
  rankScore         numeric            -- for debugging/audit of the ranking in §11
  offeredAt / respondedAt / expiresAt

quick_work_status_history   -- audit trail, one row per transition
  id            uuid PK
  requestId     uuid FK
  fromStatus    varchar(30)
  toStatus      varchar(30)
  actorId       uuid FK -> users.id, nullable (null = system)
  createdAt
```

Uses the **PostGIS pattern already proven on `jobs.geo`** (GIST index,
`ST_DWithin`/`ST_Distance`) rather than jsonb — this table needs real proximity
queries from day one, same reasoning `jobs.ts`'s own doc comment gives for why Jobs
got a real geometry column and `users.location` didn't.

No separate `quick_work_locations` table is needed for v1 given §2.8 (no live GPS
streaming) — a single `geo` point per request is sufficient. If continuous tracking is
added later (§30), a `quick_work_location_pings` table can be introduced then without
disturbing this schema.

### 9.2 Request creation flow
Matches §7's screen list exactly: Category → Service → Describe → Media → Location →
Now/Schedule → Budget → Review → `POST /quick-work/requests` (status `DRAFT` until
`POST /quick-work/requests/:id/post`, mirroring how the review step is a distinct
action from posting — keeps an abandoned draft cheap to discard/resume).

---

## 10. Quick Work Request State Machine

```
DRAFT → POSTED → MATCHING → OFFERED → ACCEPTED → ARRIVING → ARRIVED →
IN_PROGRESS → COMPLETED → PAYMENT_PENDING → PAID → RATED

Failure/terminal: CANCELLED, EXPIRED, NO_WORKER_FOUND, DISPUTED
```

| Transition | Who can trigger | Notes / validation |
|---|---|---|
| `DRAFT → POSTED` | employer | requires `serviceId`, `geo`, and (`isImmediate` or `scheduledAt`) all set |
| `POSTED → MATCHING` | system (immediate) | fires as soon as posted for `isImmediate=true`; for scheduled, a scheduler job flips this at `scheduledAt - leadTime` |
| `MATCHING → OFFERED` | system | offer fan-out succeeded (§12) — at least 1 candidate offered |
| `MATCHING → NO_WORKER_FOUND` | system | zero eligible candidates after full radius expansion |
| `OFFERED → ACCEPTED` | worker | first valid accept wins (atomic, §12); all sibling offers → `superseded` |
| `OFFERED → MATCHING` | system | all offers expired/declined and nobody accepted → next ranked batch or radius expansion |
| `ACCEPTED → ARRIVING` | worker | worker taps "I'm on my way" (mirrors `applications.onTheWayStartedAt`) |
| `ARRIVING → ARRIVED` | worker | worker taps "Arrived" (optionally geofenced against request `geo`, same 750m-style check as `shiftCheckIn`) |
| `ARRIVED → IN_PROGRESS` | worker | worker taps "Start work" |
| `IN_PROGRESS → COMPLETED` | worker | worker submits completion (photo/notes/final price) |
| `COMPLETED → PAYMENT_PENDING` | system | automatic on completion |
| `PAYMENT_PENDING → PAID` | employer | `POST /payments/:id/mark-paid` (§17) |
| `PAID → RATED` | employer or worker | either party's first rating moves the request to `RATED`; the other party can still rate afterward (mirrors how Jobs ratings work today — both sides rate independently) |
| `* → CANCELLED` | employer (before `IN_PROGRESS`) or worker (before `ARRIVED`, with reason) | stronger restrictions after `ACCEPTED` (§20) |
| `OFFERED/MATCHING → EXPIRED` | system | request itself times out (e.g. no accept within N minutes total, distinct from per-offer expiry) |
| `* → DISPUTED` | employer or worker | only from `COMPLETED`/`PAYMENT_PENDING`/`PAID` — a price or quality dispute, routed to the existing `disputes` module pattern (§21) |

**Backend validation**: every transition is a single guarded `UPDATE ... WHERE id = $1
AND status = $2` (compare-and-swap on the current status) — the same idiom already used
in `hiringRequests.respond()`'s conflict check — so a race between two calls updating
the same request can't silently double-apply. Every successful transition writes one
row to `quick_work_status_history` and calls `emitToUser` + `notifications.record()`
per the tables in §23–24.

---

## 11. Matching System

Doondo must not broadcast to hundreds of workers — this is the central design
constraint, and it's compatible with what `availabilities.findNearby()` already does
(it already returns a ranked, radius-bounded, limited set — Quick Work adds
service-based filtering and a proper ranking score on top).

### 11.1 Candidate selection (filter)
1. `services.id = requested serviceId` — join against `availabilities.serviceIds`
   (§8.2), **not** free-text trade matching.
2. Availability: `availabilities.until > now()` (or active recurring pattern) — reuses
   `isRecurringActiveAt()` as-is.
3. Verification: if `services.requiresVerification`, filter `users.isVerified = true`.
4. Qualification/license: if `services.requiresQualification`/`requiresLicense`, filter
   on the worker's crew-documents / skill-test records for that service (reuses the
   existing `crewDocuments` table's expiry-aware pattern from §2.4's `needsYouNow`
   read).
5. Service radius: `ST_DWithin(availabilities.geo, request.geo, radiusMeters)` —
   starting radius configurable (e.g. 5km), expandable per step 8 below.
6. Current workload: exclude workers with another `quick_work_requests` row in
   `ACCEPTED..IN_PROGRESS` (a worker can't be offered two live jobs at once).

### 11.2 Ranking (score, don't just filter)
Weighted score per candidate, computed once per matching pass:
- **Service/skill match** — exact `serviceId` match is a pass/fail filter already
  (11.1.1), not a ranking weight.
- **Distance / ETA** — from `travelTime.getTravelTimes()` (§2.4), lower is better.
- **Verification** — verified workers ranked above unverified when both pass the
  filter.
- **Rating** — `ratings.summarizeForUsers()` avg/count, same aggregation used
  everywhere else in the app.
- **Experience** — count of completed `quick_work_requests` for this worker (+
  optionally completed Jobs applications, as a secondary signal).
- **Response rate** — % of past offers this worker accepted/responded to within their
  expiry window (`quick_work_offers` history).
- **Current workload** — already a hard filter (11.1.6); can additionally down-rank
  workers who just declined/expired an offer minutes ago, to avoid re-pinging someone
  who just said no to a similar job.

Suggested formula (tunable constants, not hard-coded product logic):
```
score = w1*serviceExactMatch + w2*(1 - normalizedETA) + w3*verifiedBonus +
        w4*normalizedRating + w5*normalizedExperience + w6*responseRate
```

### 11.3 Offer fan-out and acceptance
1. Take the **top 3–5** ranked candidates.
2. Insert one `quick_work_offers` row per candidate, `status='offered'`,
   `expiresAt = now() + offerWindow` (e.g. 90 seconds, tunable).
3. `emitToUser(workerId, 'quick_work:offer_received', {...})` to each, plus a push
   notification (workers may not have the app foregrounded).
4. **First valid acceptance wins, atomically**: worker calls
   `POST /quick-work/offers/:id/accept`; the service does a single
   `UPDATE quick_work_offers SET status='accepted' WHERE id=$1 AND status='offered'`
   inside a transaction that also does the compare-and-swap
   `UPDATE quick_work_requests SET status='ACCEPTED', matchedWorkerId=$2 WHERE id=$3 AND
   status='OFFERED'`. If either `UPDATE` affects 0 rows, the accept is rejected with a
   409 ("this job was already taken") — this is the same compare-and-swap idiom as
   §10's transition guard, just applied to two rows in one transaction.
5. On success: all sibling `quick_work_offers` for that request →
   `status='superseded'`; `emitToUser` each of those workers
   `quick_work:offer_closed`; request locked.
6. **If nobody accepts before all offers expire**: expand radius (e.g. +5km per round,
   capped rounds), re-run 11.1–11.3 excluding already-offered workers, up to a
   configurable max number of rounds/time budget.
7. **If still nothing after the max rounds/time budget**: `status='NO_WORKER_FOUND'`,
   surface `QuickWorkNoWorkerScreen` with retry / widen-radius / "post as a Job
   instead" (a genuine bridge back to the existing Jobs flow for cases where no one is
   available on-demand).

---

## 12. Worker Offers — API shape

Follows the `hiringRequests` code pattern (§2.4) adapted for one-to-many:

```
POST   /quick-work/requests                 create DRAFT
POST   /quick-work/requests/:id/post        DRAFT -> POSTED (kicks off matching)
GET    /quick-work/requests/:id             detail (employer or matched worker only)
GET    /quick-work/requests/mine            employer's own requests (History tabs)
POST   /quick-work/requests/:id/cancel      status-aware cancellation (§20)

GET    /quick-work/offers/incoming          worker's pending offers
POST   /quick-work/offers/:id/accept        atomic accept (§11.3)
POST   /quick-work/offers/:id/decline       explicit decline (frees the slot immediately, doesn't wait for expiry)
```

---

## 13. Worker Acceptance / Worker-Found

Employer sees (per the brief, all fields either already exist on `users`/`ratings` or
are trivial joins): name, photo, rating (`summarizeForUsers`), completed-work count,
relevant service, verification badge, ETA + distance (`travelTime`), current status
(`ACCEPTED`/`ARRIVING`/...), chat entry point (existing `chat` module — open/create a
conversation scoped to this request the same way Jobs conversations are scoped to an
application), masked call (§2.4 pattern), and report/block (§22).

---

## 14. Live Tracking / Arrival

Per §2.8, there is no live GPS trail infrastructure in Doondo today, and building one
is a significant scope increase not justified for v1. **Recommended v1 approach**,
copying the existing `applications.onTheWayStartedAt`/`onTheWayEtaMinutes` pattern
exactly:
- Worker taps "On my way" → `ARRIVING`, request row stamps `arrivingAt` +
  a computed `etaMinutes` (from `travelTime`).
- Client shows a **countdown**, not a moving map dot: "Arriving in ~12 min."
- Worker taps "Arrived" → `ARRIVED`, optionally geofenced against the request's `geo`
  (reusing `shiftCheckIn.service.ts`'s haversine-fence pattern, same ~750m tolerance
  or tighter for a home-address job).

A real moving-dot live map is called out explicitly in §30 as a v2 candidate, not
silently promised here.

---

## 15. Work Execution

`ARRIVED → IN_PROGRESS` (worker-triggered "Start") → `IN_PROGRESS → COMPLETED`
(worker-triggered "Complete," with required photo + optional notes + final price,
mirroring `workProofs`' shape — `photo_url`, `status`, `submitted_at` — but written
directly onto `quick_work_requests` rather than a separate proofs table, since Quick
Work has exactly one worker per request, not a multi-candidate review queue the way
`workProofs` supports for Jobs).

Employer sees a clear completion summary screen before payment — proof photo, notes,
final price (which may differ from the original estimate; if it does, the employer
must explicitly acknowledge the new amount before `PAYMENT_PENDING → PAID` is
reachable — this is the "additional cost request → employer approval" step from the
brief).

---

## 16. Completion

Covered in §15. `COMPLETED → PAYMENT_PENDING` is an automatic system transition
(no employer action required to "enter" payment pending — they just see the payment
screen next).

---

## 17. Payment — **[REUSE, minimal extension]**

Do not build a second payment system. Extend the existing one:
1. **Schema**: add `quickWorkRequestId uuid` (nullable FK to
   `quick_work_requests.id`) to `paymentIntents`, alongside the existing nullable
   `applicationId`. Exactly one of the two should be set per row (a `CHECK` constraint
   enforcing "not both null, not both set" mirrors the existing
   `applications_team_size_snapshot_check` style of constraint already used elsewhere
   in the schema).
2. **Routes**: `payment.routes.ts`'s `POST /intent` accepts an optional
   `quickWorkRequestId` instead of/alongside `applicationId`; `mark-paid` credits the
   worker's wallet with a **new** `walletTransactions.kind = 'quick_work_payment'**
   (add to the `wallet_kind` pg enum) instead of `hire_payment`, applying the same
   `splitCommission()` the QR-collection path already uses, so Doondo's commission is
   consistently taken on Quick Work payments too.
3. **Mobile**: `QuickWorkPaymentScreen` (§7) reuses the existing `UpiPaymentPanel`
   component's UI pattern verbatim, just pointed at the new intent shape.
4. Receipt generation (`GET /payments/:id/receipt`) needs zero changes beyond
   resolving the payer/payee names/location from either FK.

Flow: `COMPLETED → PAYMENT_PENDING` (final price locked) → employer opens
`QuickWorkPaymentScreen` → `POST /payments/intent` → UPI app → employer confirms →
`POST /payments/:id/mark-paid` → `PAID` → receipt available.

---

## 18. Rating — **[schema decision required, then REUSE]**

`ratings.applicationId`/`ratings.jobId` are `NOT NULL` today (§2.5) — this is a real
fork, not a rubber-stamp reuse:
- **Option A (recommended)**: make both columns nullable, add a nullable
  `quickWorkRequestId`, add the same "exactly one of application/quickWorkRequest set"
  CHECK constraint as §17. One `ratings` table, one aggregation function
  (`summarizeForUsers`) continues to work for both Jobs and Quick Work with zero
  duplicate logic — this is the "reuse existing rating infrastructure" instruction
  taken literally.
- **Option B**: a parallel `quick_work_ratings` table with the same shape, and
  `summarizeForUsers` is extended to `UNION` both tables. More isolated (zero risk to
  the existing Jobs ratings table/queries) but duplicates the schema and the
  aggregation query.

This plan recommends **Option A** given the explicit "do not create duplicate
architecture when existing infrastructure can be reused" instruction, but flags it
here because it is the one place in this plan where "reuse" requires an ALTER on a
table the Jobs system also depends on — any implementation session must run the
existing ratings test suite (`ratings`-related `.test.ts` files, if present) after the
migration, not just add new tests.

`PAID → RATED` per §10; `QuickWorkRatingScreen` reuses `LeaveRatingScreen`'s UI.

---

## 19. History

`QuickWorkHistoryScreen`: **Active | Completed | Cancelled** tabs (per the brief),
same visual language as the existing "recent jobs" list. Each row: service name,
worker name/photo, date, final price, status pill (reusing the shared `<Pill>`
component's tone system — `success` for Completed, `neutral` for Cancelled, etc.),
rating stars if rated. Tapping a row opens the corresponding detail screen for its
current/terminal state.

---

## 20. Cancellation

Status-aware, escalating restrictions (mirrors the brief's intent, made concrete):

| Current status | Employer can cancel | Worker can cancel | Notes |
|---|---|---|---|
| `DRAFT`/`POSTED`/`MATCHING`/`OFFERED` | Yes, free | N/A (worker declines the offer instead) | No penalty either side |
| `ACCEPTED` | Yes, reason required | Yes, reason required | Worker cancellation here should ding a "reliability" signal used in §11.2's response-rate ranking input |
| `ARRIVING`/`ARRIVED` | Yes, stronger reason requirement (e.g. min. character count, or a required reason category) | Yes, but flagged as a no-show-adjacent event | Both sides notified immediately via `emitToUser` |
| `IN_PROGRESS` | Not a plain cancel — routes to Dispute (§21) instead | Not a plain cancel — routes to Dispute | Work has started; unilateral cancellation isn't the right primitive anymore |
| `COMPLETED`+ | Not cancellable | Not cancellable | Dispute only |

All cancellations write `cancelledBy`, `cancellationReason`, `cancelledAt` and a
`quick_work_status_history` row; `CANCELLED` is terminal.

---

## 21. Dispute

No dedicated `disputes` handling for Quick Work exists yet, but `apps/backend/src/
modules/disputes/` **[EXISTING]** already handles Jobs-side disputes — inspect its
exact shape before implementation (not read in this pass; flagged here as the required
next check for whoever picks up Phase 7, per the "inspect before inventing" rule). At
minimum, `quick_work_requests.status = 'DISPUTED'` plus a `disputeReason` field feeds
into whatever generic dispute queue/admin surface that module already provides,
rather than building a second one.

---

## 22. Safety / Trust

| Requirement | Source |
|---|---|
| Worker verification | `users.isVerified` — **[EXISTING]**, already surfaced everywhere |
| Employer verification (where appropriate) | Same `users.isVerified` flag, role-agnostic already |
| SOS | `SosScreen` / `modules/sos` **[EXISTING]** — not Quick-Work-specific, already available to any user during any activity |
| Report | Needs a report reason + target; check `modules/moderation` **[EXISTING, inspect before building]** for a reusable shape |
| Block | `blockedWorkers` table **[REUSE, no schema change]** |
| Cancellation rules | §20 |
| No-show | A cancellation from `ACCEPTED`/`ARRIVING` by the worker with no explanation should feed the same signal `arrivalLikelihood`-style scoring would use, so repeat no-shows rank lower in future matching (§11.2) |
| Dispute | §21 |
| Proof of completion | §15's photo/notes on the request row |
| Location privacy | Employer's exact address is only shown to the **matched** worker after acceptance, not to all 3–5 offered candidates during `OFFERED` (they should see approximate area/distance only) — mirrors how exact contact details are gated behind an accepted state elsewhere in the app (masked call, §2.4) |
| Authorization checks | Every route checks caller is the request's employer or its `matchedWorkerId`, same `requireAuth`/ownership-check idiom used in every existing service file read in §2 |

---

## 23. Notifications

New `notification_kind` enum values needed (extending the existing
`notificationKindEnum` in `marketplace.ts`, not a new notifications system):
`quick_work_offer_received`, `quick_work_offer_expiring`, `quick_work_matched`,
`quick_work_worker_arriving`, `quick_work_worker_arrived`, `quick_work_started`,
`quick_work_completed`, `quick_work_payment_pending`, `quick_work_paid`,
`quick_work_cancelled`, `quick_work_expired`, `quick_work_no_worker_found`,
`quick_work_disputed`.

Every state transition in §10 that has a row in the table below calls
`notifications.record({recipientId, kind, title, body, deeplink})` exactly like every
existing module already does — no new notification delivery mechanism.

| Transition | Notify |
|---|---|
| `POSTED → MATCHING` | (none — too noisy) |
| `MATCHING → OFFERED` | worker(s) offered |
| `OFFERED → ACCEPTED` | employer (matched), other offered workers get `offer_closed` |
| `ACCEPTED → ARRIVING` | employer |
| `ARRIVING → ARRIVED` | employer |
| `ARRIVED → IN_PROGRESS` | employer |
| `IN_PROGRESS → COMPLETED` | employer |
| `COMPLETED → PAYMENT_PENDING` | employer |
| `PAYMENT_PENDING → PAID` | worker |
| `* → CANCELLED` | the other party |
| `* → EXPIRED` | employer |
| `MATCHING → NO_WORKER_FOUND` | employer |
| `* → DISPUTED` | both parties + (per §21) whatever the disputes module already does |

---

## 24. Socket.IO Events

Reuses `emitToUser(userId, event, payload)` exactly (§2.6) — no new rooms, no new
transport. Event names, adapted only where the brief's naming didn't match a real
transition in §10:

```
quick_work:request_posted        -> employer's other devices (own-account sync)
quick_work:matching_started
quick_work:offer_received        -> to each offered worker
quick_work:offer_closed          -> to superseded/expired offer-holders
quick_work:matched               -> to employer (worker accepted)
quick_work:status_changed        -> generic payload {requestId, from, to} for any transition, so the client doesn't need one listener per transition
quick_work:worker_arriving
quick_work:worker_arrived
quick_work:started
quick_work:completed
quick_work:cancelled
quick_work:expired
quick_work:no_worker_found
quick_work:payment_pending
quick_work:paid
quick_work:disputed
```

`quick_work:worker_location` from the original brief is **deliberately omitted** for
v1 per §14's decision (no live GPS streaming yet) — re-added only if/when §30's live
tracking is actually built.

---

## 25. API — full endpoint list

Follows `requireAuth` + `requireRole('employer'|'seeker')` on every route, exactly
like every existing route file read in §2.

```
# Service catalog (shared, seeker + employer both read it)
GET    /service-categories
GET    /services?categoryId=&q=

# Quick Work requests (employer)
POST   /quick-work/requests
GET    /quick-work/requests/:id
GET    /quick-work/requests/mine
POST   /quick-work/requests/:id/post
POST   /quick-work/requests/:id/cancel
POST   /quick-work/requests/:id/mark-arrived      (if server-side geofence check needed)
POST   /quick-work/requests/:id/confirm-payment   (thin wrapper delegating to /payments, or the mobile client just calls /payments directly — decide during implementation, not a product decision)
POST   /quick-work/requests/:id/dispute

# Quick Work — worker side (needed even though this plan is employer-scoped, since offers/acceptance are inherently two-sided)
GET    /quick-work/offers/incoming
POST   /quick-work/offers/:id/accept
POST   /quick-work/offers/:id/decline
POST   /quick-work/requests/:id/arriving          (worker)
POST   /quick-work/requests/:id/arrived           (worker)
POST   /quick-work/requests/:id/start             (worker)
POST   /quick-work/requests/:id/complete          (worker)

# Payments (extend existing routes, §17)
POST   /payments/intent            (accepts quickWorkRequestId now)
POST   /payments/:id/mark-paid
POST   /payments/:id/cancel
GET    /payments/:id/receipt

# Ratings (extend existing routes once §18's schema decision is made)
POST   /ratings                    (accepts quickWorkRequestId now)
```

---

## 26. Database — full new-object list

**New tables**: `service_categories`, `services`, `quick_work_requests`,
`quick_work_offers`, `quick_work_status_history`.

**New columns on existing tables**: `availabilities.serviceIds uuid[]`,
`paymentIntents.quickWorkRequestId uuid` (+ CHECK constraint), `ratings.quickWorkRequestId
uuid` + relax `applicationId`/`jobId` to nullable (§18, if Option A is chosen).

**New enum values**: `wallet_kind` gains `quick_work_payment`; `notification_kind`
gains the values listed in §23.

**Explicitly not created**: `quick_work_categories`/`quick_work_services` as separate
tables from `service_categories`/`services` — the brief's own instruction is "do not
create separate Employer and Worker service lists," and there is no reason for Quick
Work to have its own catalog distinct from the shared one. **Not created**:
`quick_work_locations` (§9.1's reasoning — one `geo` point per request suffices for
v1).

---

## 27. Authorization

Nothing new architecturally — `requireAuth` + `requireRole` + explicit
ownership/participant checks inline in each service function, exactly the pattern in
every file read in §2 (e.g. `hiringRequests.respond()` checking
`doc.seekerId !== input.seekerId`, `maskedCall.initiateCall()` checking
`callerIsParty`). Every Quick Work service function must check the caller is either
the request's `employerId` or its `matchedWorkerId` (once matched) before returning
data or allowing a transition.

---

## 28. Error / Loading / Empty States

Reuse existing shared components exactly as the rest of the app does:
- `LoadingSpinner` / `SkeletonCard` while fetching.
- `EmptyState` for: no service found in search, no active Quick Work request, empty
  History tabs (with tone-appropriate icon per §7's shared-component rule).
- `QuickWorkNoWorkerScreen` (§7 #11) is the dedicated empty/failure state for the
  matching step specifically, not a generic `EmptyState` reuse, since it needs
  specific retry/widen/post-as-job actions.
- Network/API errors surface via the existing `ErrorPanel` component and the app's
  existing `ApiError` handling (`api/errors.ts`) — no new error-handling pattern.

---

## 29. Analytics / Events

Not present in the repo as an inspected system in this pass — before instrumenting
Quick Work funnel events (request created → posted → matched → completed → paid), a
future implementation session should check whether `apps/backend` or the mobile app
already has an analytics/event-tracking module (not found under `modules/` in this
inspection, but not exhaustively ruled out either — the closest thing found was
`digest.service.ts` in `notifications`, which is a re-engagement digest, not generic
analytics). Flagged as an open question rather than assumed either way.

---

## 30. Implementation Phases

1. **Phase 1 — Service catalog**: `service_categories`/`services` tables + seed
   migration (cross-walked against `trades.ts`/`skill.catalogue.ts`), `services.api.ts`,
   Category/Service picker screens (shared by future seeker-side work too, per "one
   catalog" rule).
2. **Phase 2 — Request creation UI + backend shell**: `quick_work_requests` table,
   CRUD routes, screens #1–9 from §7 (Home → Review), no matching yet — posting just
   sits at `POSTED`.
3. **Phase 3 — Matching + offers**: `availabilities.serviceIds`, `quick_work_offers`
   table, `travelTime`/`arrivalLikelihood`-derived ranking (§11), atomic accept
   (§11.3), screens #10–12.
4. **Phase 4 — Real-time + notifications**: Socket events (§24), notification kinds
   (§23).
5. **Phase 5 — Execution**: Arriving/Arrived/In-Progress/Completed transitions,
   screens #13–15, geofence reuse from `shiftCheckIn`.
6. **Phase 6 — Money**: `paymentIntents`/`walletTransactions` extensions (§17), screen
   #16.
7. **Phase 7 — Trust**: ratings schema decision + implementation (§18), cancellation
   (§20), dispute wiring (§21) — **read the existing `disputes` module before writing
   any of this phase.**
8. **Phase 8 — History + polish**: screen #18, empty/error states (§28), Home
   integration (§6), final nav decision execution (§5).

Each phase ends with `pnpm --filter mobile typecheck` and the backend's equivalent
build/typecheck/test command clean before moving on — same discipline as the recent
design-system work in this repo.

---

## 31. Testing

- Backend: follow the existing convention of a `*.test.ts` beside the service file
  (e.g. `application.service.test.ts`, `hiringRequest` has none currently but
  `application.routes.test.ts`/`auth.routes.test.ts` exist as the pattern to copy) —
  unit-test the state machine's compare-and-swap logic (§10) and the atomic-accept race
  (§11.3) specifically, since those are the highest-risk-of-subtle-bug pieces (a bad
  compare-and-swap could double-book a worker).
- Matching ranking (§11.2) should have a pure-function unit test the same way
  `isRecurringActiveAt()` and `arrivalLikelihood`'s scoring are already pure and
  tested/testable in isolation.
- Mobile: no existing screen-level test convention was found in this inspection
  (flagged as an open question, same as §29) — at minimum, every new screen must pass
  `pnpm --filter mobile typecheck` with zero errors, matching this session's established
  bar for the rest of the app.

---

## 32. Acceptance Criteria

- [ ] Existing Jobs flow (post → applicants → hire → roster → payroll → rate) has
      zero behavioral changes — verified by not touching `modules/jobs`,
      `modules/applications`, or their mobile screens.
- [ ] Employer can complete the full Quick Work flow end-to-end for an immediate
      request: Category → Service → Describe → Media → Location → Now → Budget →
      Review → Post → Matched → Tracking → In Progress → Completed → Paid → Rated.
- [ ] Same flow works with Scheduled instead of Now, and the request correctly waits
      until its scheduled window before entering `MATCHING`.
- [ ] Matching never contacts more than the configured candidate batch size (3–5) at
      once; a second worker's accept attempt on an already-accepted request receives a
      409, not a silent double-accept.
- [ ] `NO_WORKER_FOUND` is reachable and offers a real next action (retry / widen /
      post as Job).
- [ ] Cancellation is blocked or redirected to Dispute exactly per the §20 table for
      every status.
- [ ] Payment produces a valid receipt identical in shape to the existing Jobs UPI
      receipt.
- [ ] Rating, once submitted, shows up in the same `summarizeForUsers` aggregate used
      everywhere else in the app (i.e. a worker's Quick Work ratings count toward
      their one visible rating badge, not a separate hidden number).
- [ ] `pnpm --filter mobile typecheck` and the backend build are clean.
- [ ] No new Socket.IO rooms/namespaces were introduced (`emitToUser` only).
- [ ] No duplicate service/category list was created on the seeker side — the same
      `service_categories`/`services` tables back both roles.

---

## Appendix — Open Questions For The Next Implementation Session

1. **Navigation** (§5): which of the 3 options does the product owner want? This plan
   defaults to option 1 (no new tab) but does not consider the question closed.
2. **Ratings schema** (§18): Option A (nullable FKs on the shared table) vs Option B
   (parallel table) — this plan recommends A but flags the migration risk explicitly.
3. **Disputes module shape** (§21) — not inspected in this pass; read
   `apps/backend/src/modules/disputes/` fully before Phase 7.
4. **Moderation/report module shape** (§22) — not inspected in this pass; read
   `apps/backend/src/modules/moderation/` fully before building the report affordance.
5. **Analytics** (§29) — confirm whether any event-tracking system exists anywhere in
   the repo before instrumenting funnel events.
6. **Worker-side Quick Work UI** is out of this plan's stated scope (employer-only per
   the brief) but §12/§25 necessarily define worker-facing endpoints since offers are
   inherently two-sided — the actual worker-side *screens* for accepting an offer and
   progressing through arrival/work/completion are not designed here and need their
   own pass, likely alongside `seeker-plan.md`.
