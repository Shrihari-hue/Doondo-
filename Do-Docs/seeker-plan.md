# Doondo Worker/Seeker — Implementation Plan (Jobs + Quick Work)

> Status: rewritten against the actual repository (`apps/mobile`, `apps/backend`) on the
> `Doondo-yakshi` branch. Every "existing" claim was verified by reading the real
> source; every "NEW" item does not exist today. This plan is the worker-side mirror of
> `employer-plan.md` — **the backend is one shared codebase**, so §2–§4 and the DB/API/
> Socket sections here describe the *same* tables, routes, and events that plan defines
> from the employer's side. Where this doc says "per employer-plan.md §X," that section
> is the authority for the exact shape — this doc does not redefine it differently.
> Tags: **[EXISTING]** untouched, **[REUSE]** existing infra extended, **[NEW]** does
> not exist yet.

---

## 1. Product Purpose

The worker side supports the same three work models as the employer side, from the
opposite end:

1. **Traditional Jobs [EXISTING]** — worker browses/swipes jobs, applies, employer
   reviews, hire happens, roster/attendance/payroll continues exactly as today. Not
   touched by this plan.
2. **Quick Work [NEW]** — worker turns Available Now on, Doondo offers them nearby
   matched service requests, worker accepts, travels, works, completes, earns, rates
   the customer.
3. **Scheduled Work [NEW]** — same request/offer lifecycle as Quick Work, but the
   worker accepts a future time slot instead of an immediate job.

**Non-negotiable**: when a worker is OFF (not available for Quick Work), every
existing Jobs feature keeps working exactly as it does today — Quick Work is additive,
not a replacement mode. The core worker mental model to design toward:

```
OFF → AVAILABLE NOW → Receive → Accept → Go → Arrive → Work → Complete → Earn
```

---

## 2. Existing Architecture Analysis

### 2.1 Stack — identical to the employer side
Same Expo/React Native + Express/Drizzle/Postgres/Socket.IO monorepo described in
`employer-plan.md` §2.1. One backend module ↔ one mobile `*.api.ts` file, same
convention Quick Work's worker-facing endpoints must follow
(`quickWork.api.ts` ↔ `modules/quickWork/`).

### 2.2 Worker navigation today [EXISTING]
`apps/mobile/src/navigation/SeekerTabNavigator.tsx` — **7 destinations**, not the
generic bottom-nav the old draft implied:

```
Home | Jobs | Community | Voice (raised FAB) | Chat | Earnings | Profile
```

There is no free tab slot for a standalone "Quick Work" tab any more than there was on
the employer side — see §5 for the concrete navigation decision (this plan does not
silently assume a 5th slot exists).

### 2.3 The existing "I'm available now" feature — the central reuse anchor
`apps/mobile/src/screens/seeker/home/AvailabilityBeacon.tsx` (1188 lines) +
`apps/mobile/src/api/availability.api.ts` + `apps/backend/src/modules/availabilities/
availability.service.ts` **[EXISTING, this is the single most important building
block for this whole plan]**:

- `AvailabilityBeaconChip` — the always-visible Home row: "📢 Tell employers I'm
  available" when off, or "🟢 Available until 4:30 PM · 12 min left" + Withdraw when a
  beacon is live.
- `AvailabilityBeaconSheet` — bottom sheet: pick a duration (1h/2h/4h/8h, or a weekly
  recurring window), multi-select **free-text trade chips** (from `lib/trades.ts`, the
  same catalogue referenced in `employer-plan.md` §2.7), optional note, optional wage
  (naming a wage turns the beacon into a full "open shift" that pushes nearby
  employers).
- Backend: `availabilities` table has a **real PostGIS `geo` point column with GIST
  index**; `findNearby({lat, lng, radius, trade, type, seekerIds})` already does
  `ST_DWithin`/`ST_Distance` and bulk-hydrates seeker profile + rating.
- API: `GET/POST/DELETE /me/availability`, `GET /availabilities/nearby`.

**What this feature is today**: a *passive* "I'm free, browse me" signal — the
employer manually searches `findNearby()` and calls/messages the worker. **What Quick
Work needs**: the *same* live/eligible signal, but driving an *active* system-initiated
offer instead of a manual employer search. The plan is to **extend, not replace**:
1. Add `availabilities.serviceIds uuid[]` (nullable, alongside the existing free-text
   `tradesAvailable` — Jobs' beacon UX is untouched) so a worker can additionally opt
   into specific catalog `service_id`s.
2. The *same* live `availabilities` row becomes the eligibility source both for (a)
   today's employer `findNearby()` browse, and (b) Quick Work's automatic
   candidate-selection query (`employer-plan.md` §11.1).
3. The Beacon UI (§8 below) grows a service-picker step; duration/trade-chip/note/
   wage UI is untouched.

### 2.4 Location — one-shot only, no continuous tracking anywhere [EXISTING, important gap]
`apps/mobile/src/lib/location.ts` (133 lines, read in full):
- `getCurrentCoords()` — **single** `Location.getCurrentPositionAsync({accuracy:
  Balanced})` call, session-cached. Not a subscription.
- `resolveCoords(saved)` — fallback chain: live GPS → the user's saved profile
  location → a hardcoded default city, tagging which one (`origin: 'gps'|'saved'|
  'default'`) so the UI can warn when it's a guess.
- `reverseGeocodeCity(lat, lng)` — city-name lookup for Festival Mode matching.

**Confirmed by repo-wide search**: `watchPositionAsync`, `startLocationUpdatesAsync`,
`TaskManager`, `BackgroundFetch`, and `requestBackgroundPermissionsAsync` all return
**zero matches** anywhere in `apps/mobile/src`. There is no continuous or background
location tracking of any kind in Doondo today, for any feature. This is the most
important scoping fact for §32 — Quick Work's "worker is traveling" tracking is
genuinely new client-side work (a foreground `watchPositionAsync` subscription while
the Quick Work screen is active), not a rename of something that exists.

The closest existing "worker is en route" precedent, per `employer-plan.md` §2.3, is
`applications.onTheWayStartedAt` + `onTheWayEtaMinutes` — a **static timestamp + a
computed ETA number**, not a moving position. This plan follows that same
lower-cost pattern for Quick Work v1 (§16), not a live map dot.

### 2.5 Earnings/wallet — already wired to the seeker's own screen [EXISTING]
`apps/mobile/src/screens/seeker/EarningsScreen.tsx` calls
`walletApi.myEarnings(50)` → backend `wallet.service.ts#listForUser`/`#summarize`
(same module `employer-plan.md` §2.5 documents from the payer's side).
`walletTransactions.kind` currently has no `quick_work_payment` value (§2.5 there
proposes adding it) — once added, a Quick Work payout appears in this **exact same
existing screen** with zero new UI, the same way `hire_payment`/`cash_log`/
`qr_collection` rows already do.

### 2.6 Safety infrastructure already usable as-is [EXISTING]
- `modules/sos/sos.service.ts#triggerSos` is **user-scoped, not job/application-
  scoped** — a worker mid-Quick-Work can trigger SOS today with zero changes, exactly
  as during a normal shift.
- `modules/homeSafe` (`homeSafeChecks`) — the "reached home safe?" ping after a
  Jobs check-out — **is** `applicationId`-scoped (`NOT NULL` FK), so it does **not**
  extend to Quick Work without the same nullable-FK-or-parallel-table decision flagged
  for `ratings` in `employer-plan.md` §18. Not required by the brief's safety list;
  noted as an optional nice-to-have, not built in this plan.
- `blockedWorkers` **[REUSE, no schema change]** — generic `employerId + workerId`
  pair, works unchanged for a worker blocking a customer.
- `ratings` table — same `NOT NULL` `applicationId`/`jobId` constraint documented in
  `employer-plan.md` §18; same Option A/B decision applies here (it's the same table).

### 2.7 Skill Passport, verification, chat, notifications, sockets — same modules
- `SkillPassportScreen.tsx` **[EXISTING]** already renders skills, verification,
  rating, completed-jobs count, experience — see §9 for exactly what's added, not
  replaced.
- `VerificationFlowScreen.tsx` **[EXISTING]** — phone OTP + selfie verification,
  produces the same `users.isVerified` flag `services.requiresVerification` checks
  against (`employer-plan.md` §11.1.3). No changes needed for Quick Work to consume it.
- Chat, notifications (`notification.service.ts#record`), and Socket.IO
  (`sockets/bus.ts#emitToUser`, per-user rooms only) are the exact same modules
  documented in `employer-plan.md` §2.4/§2.6 — reused unchanged, new event names only.

### 2.8 Service catalog — same gap as the employer side
No `category_id`/`service_id` exists anywhere in the schema today (`employer-plan.md`
§2.7/§2.8). `users.skills: text[]` is free-text; `lib/trades.ts` (mobile) and
`modules/skills/skill.catalogue.ts` (backend) are two **already-duplicated** curated
taxonomies the Doondo team has flagged as tech debt in their own comments. **This plan
does not create a second, worker-side service catalog** — it consumes the exact same
`service_categories`/`services` tables `employer-plan.md` §8 defines. One catalog, two
consumers.

---

## 3. Existing Functionality To Reuse (summary table)

| Need | Reuse | Change required |
|---|---|---|
| "I'm available" toggle + persistence | `availabilities` table, `AvailabilityBeacon*` components, `/me/availability` routes | Add `serviceIds`, add derived `BUSY`/`PAUSED` states (§7) |
| Nearby-worker matching source | Same `findNearby()` query `employer-plan.md` §11 builds on | Shared — no worker-side duplicate |
| Coordinates for publishing a beacon / accepting an offer | `lib/location.ts#resolveCoords` | None — one-shot read is exactly what's needed there |
| ETA to a job | `travelTime.service.ts` | None |
| Offer accept/decline shape | `hiringRequests` code pattern (lazy expiry, `hydrate()`) | Re-implemented per-offer for the atomic multi-candidate race (`employer-plan.md` §11.3) |
| Earnings display | `EarningsScreen.tsx` + `walletApi` | Add `quick_work_payment` wallet kind — screen itself unchanged |
| Rating | `ratings` table + `summarizeForUsers` | Schema decision, `employer-plan.md` §18 |
| SOS | `sos.service.ts` | None — already user-scoped |
| Block | `blockedWorkers` | None |
| Skill Passport | `SkillPassportScreen.tsx` | Add service-eligibility section (§9) |
| Verification | `VerificationFlowScreen.tsx` / `users.isVerified` | None |
| Chat | existing chat module/screens | None — Quick Work conversations are normal chats scoped to a request, same as Jobs scopes them to an application |
| Notifications | `notification.service.ts#record` | New `notification_kind` values |
| Real-time | `sockets/bus.ts#emitToUser` | New event-name strings only |
| Auth | `middleware/auth.ts` | None |

---

## 4. New Functionality (summary)

- **Structured availability state** (`OFFLINE/AVAILABLE/BUSY/PAUSED`) layered on top of
  the existing beacon's live/expired boolean (§7).
- **Worker service profile / eligibility** — per-service opt-in with the metadata the
  brief requires (§8–9).
- **Offer inbox + accept/decline UI + atomic accept** (§10–12).
- **Accepted-work execution screens** (arrival, in-progress, completion) (§13–18).
- **Foreground live location updates during active Quick Work only** (§32) — genuinely
  new client capability, not present anywhere else in the app today.
- **Worker-side Quick Work Home surface** (§6).
- **New Socket events / notification kinds** — see §27–28.

---

## 5. Worker Navigation

Same fork as `employer-plan.md` §5, mirrored for the worker's 7 destinations
(`Home | Jobs | Community | Voice-FAB | Chat | Earnings | Profile`):

1. **Recommended: no new tab.** Quick Work lives inside Home — the Availability
   control and the Incoming-Offer/Active-Work surface (§6) are Home content, and the
   offer flow itself pushes modal-stack screens on top of Home, exactly how
   `VoiceAgentScreen`, `SosScreen`, `RecordReelScreen`, etc. are already reached today
   (stack screens off a tab, not new tabs).
2. Replacing `Community` or `Earnings` with a `Quick Work` tab is explicitly rejected —
   both are real, used features (`employer-plan.md`'s equivalent option 2 caveat
   applies identically here).
3. A 6th flat tab or dropping the raised Voice FAB is the highest-regression-risk
   option, same reasoning as the employer side.

This plan proceeds on **option 1**. If the product owner prefers otherwise, only §5–§6
need re-scoping.

---

## 6. Worker Home

Current `SeekerHomeScreen.tsx` **[EXISTING, structure preserved]** already renders
(from the redesign work earlier in this project): a hero/greeting section, the
`AvailabilityBeaconChip` (§2.3), a dense job feed, hero banner carousel, and other
mode-specific content.

**Restructured priority**, per the brief's explicit "AVAILABLE NOW must be the primary
thing" requirement — this reorders/relabels what's on Home, it does not remove
anything:

1. Header/profile (unchanged).
2. **Availability control [REUSE + restyle]** — the existing
   `AvailabilityBeaconChip`/`AvailabilityBeaconSheet` becomes the primary, top-of-Home
   control, visually promoted (larger, primary-color-forward, matches the brief's
   "OFF → AVAILABLE NOW" toggle framing) rather than a secondary chip buried under the
   greeting. The underlying data/API is identical — this is a visual promotion, not a
   new component.
3. **Today's earnings [REUSE]** — a `StatCard`/summary pulled from the same
   `walletApi.summarize()` call `EarningsScreen` already uses, surfaced as a Home
   widget (new UI, existing data source).
4. **Active work [NEW]** — shown only when a `quick_work_requests` row exists for this
   worker in `ACCEPTED..IN_PROGRESS`; same visual treatment as the employer-side
   "Active work" card (`employer-plan.md` §6), symmetric on both sides.
5. **Incoming Quick Work [NEW]** — the offer inbox (§10), rendered inline on Home when
   an offer is pending, with the countdown/Accept/Decline UI right there rather than
   requiring a navigation away from Home (offers are time-boxed to ~90 seconds per
   `employer-plan.md` §11.3 — the worker should not have to hunt for it).
6. **Recent earnings [REUSE]** — same list-row pattern as the existing recent-earnings
   content already on this screen/`EarningsScreen`.
7. **Job opportunities [EXISTING, unchanged]** — the current dense job feed / hero
   carousel stays exactly as-is, below the Quick Work surface, not removed or
   demoted below the fold entirely.
8. Bottom navigation — unchanged (§5).

---

## 7. Availability

### 7.1 States
| State | Meaning | Who sets it | Receives Quick Work offers? |
|---|---|---|---|
| `OFFLINE` | No live `availabilities` row (today's default "no beacon" state) | Worker (default / explicit "go offline") | No |
| `AVAILABLE` | Live, non-expired `availabilities` row with ≥1 `serviceIds` set, not currently `BUSY` | Worker (publishes the beacon) | **Yes — the only state that receives new offers** |
| `BUSY` | Worker has a `quick_work_requests` row in `ACCEPTED..IN_PROGRESS` | **System, automatically** — never worker-set directly | No — excluded from candidate selection (`employer-plan.md` §11.1.6) |
| `PAUSED` | Worker's beacon/services remain configured but they've explicitly asked to stop receiving new offers without tearing the beacon down | Worker | No |

`BUSY` and `PAUSED` are **new** — today's `availabilities` model only expresses
"live row" (≈ AVAILABLE) vs "no row / expired" (≈ OFFLINE). Implementation:
- `BUSY` is **derived**, not a stored column — computed at read/match time as "does
  this worker have an active Quick Work request." Storing it as a separate column
  would create a second source of truth that can drift; deriving it keeps the existing
  `availabilities` row as the single beacon record.
- `PAUSED` **[NEW column]**: `availabilities.paused boolean default false`. Distinct
  from withdrawing (`DELETE /me/availability`) because pausing keeps the worker's
  duration/services/note intact for a quick resume, matching how the brief separates
  "temporarily unavailable" from "off."

### 7.2 Automatic transitions
- `AVAILABLE → BUSY`: automatic the instant an offer is accepted
  (`employer-plan.md` §11.3 step 4's transaction — no separate write needed here,
  `BUSY` just reads as true because a live request now exists).
- `BUSY → AVAILABLE`: automatic the instant the request reaches `COMPLETED` (or a
  terminal cancel/dispute state) **and** the worker's beacon (`until`) hasn't expired
  in the meantime — if it expired while they were busy, they land in `OFFLINE`
  instead and must explicitly republish, which is the correct behavior (a beacon
  shouldn't silently resurrect after being busy for hours).
- Nothing changes to `AVAILABLE`/`PAUSED`/`OFFLINE` transitions themselves — those stay
  100% worker-initiated, per the brief ("who can change the state").

### 7.3 Backend validation
- `POST /me/availability` (existing route, extended body) validates `serviceIds`
  against real, active `services.id`s (matching `employer-plan.md`'s "not free text"
  rule) — invalid/inactive ids are rejected with the same `errors.validation()` idiom
  used throughout the backend.
- A worker cannot set `PAUSED=false` (resume) while genuinely `BUSY` — the resume
  endpoint checks for a live `ACCEPTED..IN_PROGRESS` request first and rejects with a
  clear conflict message if one exists (this should be unreachable via normal UI flow
  since `BUSY` already hides the paused toggle, but the backend guards it anyway,
  matching the existing pattern of never trusting client-side state alone).

### 7.4 Real-time
- `emitToUser(workerId, 'quick_work:availability_changed', {state})` whenever the
  derived state flips (mainly useful for the worker's own other devices staying in
  sync — mirrors how `RootNavigator`'s account-switch splash already handles
  multi-device sync elsewhere in the app).
- No employer-facing socket event needed purely for availability changes — employers
  only care once matched to a specific request (`employer-plan.md` §24).

---

## 8. Service Onboarding (Worker Service Profile)

Per the brief: **eligibility is service-level, not category-level.** Selecting "Home &
Property Services" does not make a worker eligible for every service in it.

### 8.1 New onboarding/settings screen: `QuickWorkServiceProfileScreen` **[NEW]**
Reached from Profile → "Quick Work services" (or from the Availability Beacon sheet's
new service-picker step, §2.3). For each service the worker opts into, capture:

| Field | Source | Notes |
|---|---|---|
| `categoryId`/`serviceId` | picked from the shared catalog (`Category → Service`, same picker pattern as `employer-plan.md` §8.3, reused component) | Required |
| Skill level | worker self-declared enum (`beginner/intermediate/expert`), **[NEW field]** | Optional per service |
| Experience | years, **[NEW field]** or reuse `users`' existing work-history data where it already captures years-in-trade | Optional |
| Verification | reads `users.isVerified` **[EXISTING]** | Read-only here |
| Qualification/license | reference to `crewDocuments`-style uploaded proof **[REUSE existing document-upload pattern from `crewDocuments`]**, gated by `services.requiresQualification`/`requiresLicense` | Required only when the service demands it |
| Service radius | per-worker override, **[NEW field]** `availabilities`-adjacent (or a new `worker_service_profiles` row, §30) — defaults to a platform-wide default if unset | Optional |
| Availability | derived from §7, not stored per-service | — |
| Portfolio/photos | reuses the existing Craft Showcase gallery infra (`skill.catalogue.ts`'s `showcaseType: 'gallery'` skills already support a photo gallery) where the service's underlying trade slug maps to one | Reuse, not rebuilt |
| Reviews / completed work | `ratings.summarizeForUsers` + a Quick-Work-specific completed count | Reuse |

### 8.2 Data model implication
A worker's Quick Work eligibility for service X requires **both**:
1. `serviceId ∈ availabilities.serviceIds` (they're live and opted in right now), and
2. If the service is verification/qualification/license-gated, the corresponding
   check passes.

Whether per-service skill-level/experience/radius needs its own
`worker_service_profiles` table (richer, one row per worker-per-service) versus
folding a simpler version into `availabilities.serviceIds` (a flat array, cheaper) is
flagged as an implementation decision for Phase 1 (§35) — start with the flat array
(matches `tradesAvailable`'s existing shape exactly, lowest risk) and only introduce
a richer join table if per-service skill-level/experience genuinely needs to feed
ranking (`employer-plan.md` §11.2) beyond what the flat list already provides.

---

## 9. Skill Passport

`SkillPassportScreen.tsx` **[EXISTING, extended, not replaced]** already shows skills,
verification badge, rating, completed-jobs count, experience, endorsements. **Added**,
per the brief's list:
- A **"Quick Work services"** section listing the services from §8 with their
  verification/qualification badges — visually consistent with the existing skill-tag
  chips already on this screen.
- **Service radius** and **current availability state** (§7) shown read-only here
  (editing happens via the Beacon sheet / §8's onboarding screen, not duplicated
  edit-in-place here).
- **Earnings summary** — a compact reuse of the same `walletApi.summarize()` call, not
  a full ledger (the full ledger stays on `EarningsScreen`).
- Reviews/completed-work — already rendered today via `summarizeForUsers`; Quick Work
  completions simply add to the same counts once §18/§21 wire them into the shared
  `ratings` aggregation (per the §18 schema decision carried over from
  `employer-plan.md`).

**Do not expose**: exact home address, live location, or full contact details of past
customers on this screen — only aggregate counts/ratings, matching the existing
privacy posture of the Jobs-side Skill Passport (which never lists past employers'
addresses either).

---

## 10. Quick Work Offers

### 10.1 Incoming offer contents (exact fields, per the brief)
```
service            -- services.name (+ category for context)
problem/requirement -- quick_work_requests.description (+ media thumbnails if present)
customer area       -- approximate area/locality only, NOT exact address pre-accept
                       (mirrors employer-plan.md §22's location-privacy rule)
distance            -- from travelTime / haversine, same as employer-side ranking input
ETA                 -- travelTime.getTravelTimes()
estimated earnings   -- estimatedPrice minus Doondo's commission (splitCommission
                       preview, so the worker sees their real take-home, not gross)
estimated duration   -- optional, if the request/service carries one
customer rating      -- ratings.summarizeForUsers(employerId) where available
verification info    -- customer's users.isVerified badge, where relevant
expiry timer          -- offeredAt + offer window (≈90s, employer-plan.md §11.3)
Accept (primary)     -- large, primary-brand CTA — the dominant action per the brief
Decline (secondary)  -- visually secondary/ghost-styled
```

### 10.2 UI component
**[NEW]** `IncomingOfferCard` — rendered inline on Home (§6) and as a full-screen
modal if the app is foregrounded from a push while elsewhere in the app. Uses the
shared `Card`/`Button`/`Pill` components exactly like every other screen in the app —
no new visual language, matching the "no redesign" discipline already established for
this codebase.

### 10.3 Offer lifecycle
```
OFFERED → ACCEPTED
OFFERED → DECLINED   (worker-initiated, frees the slot immediately — doesn't wait for
                       expiry, per employer-plan.md §12's explicit decline endpoint)
OFFERED → EXPIRED    (system, offer window elapsed with no response)
```
Backed by `quick_work_offers` (`employer-plan.md` §9.1) — one row per candidate per
request. This worker-facing doc does not redefine the table; it is the same one.

---

## 11. Matching (from the worker's perspective)

The matching *algorithm* is defined once, authoritatively, in `employer-plan.md` §11
— this section restates only the parts that matter for what the worker sees/receives,
so this doc doesn't drift from that one:

- A worker is a **candidate** only if: their live `availabilities.serviceIds` includes
  the requested `serviceId`; they pass verification/qualification/license gates the
  service requires; they're within the current search radius; and they don't already
  have a `BUSY`-inducing active request (§7.2).
- Category-only matching is explicitly disallowed — a worker who selected "Home &
  Property Services" broadly but never opted into "AC technician" specifically is
  **not** a candidate for an AC-repair request, per §8's eligibility rule.
- Of all eligible candidates, only the **top 3–5 ranked** (service match, ETA,
  verification, rating, experience, response rate, current workload —
  `employer-plan.md` §11.2) are actually offered — a worker never sees "hundreds of
  requests," only the ones they were specifically selected for.
- If a worker declines or lets an offer expire, they may be re-offered a *different*
  later request, but are excluded from the *same* request's next radius-expansion
  round (`employer-plan.md` §11.3 step 6) — the worker should never receive the exact
  same request twice.

---

## 12. Accept/Decline

`POST /quick-work/offers/:id/accept` — **atomic** (`employer-plan.md` §11.3.4): a
compare-and-swap transaction that flips both the offer row and the parent request row
only if the request is still `OFFERED`. On the client:
- **Optimistic UI is not used for the accept button** — show a brief loading state
  and wait for the server's real answer, specifically because the whole point of this
  endpoint is "someone else might have already won it." Showing "Accepted!" optimistically
  and then reverting is a worse experience than a half-second spinner.
- **On a 409 (already taken)**: show a clear, non-blaming message — e.g. "This job was
  just taken by another worker" — and return the worker straight to Home/the next
  available offer, not a dead-end error screen. This is the exact UI requirement the
  brief calls out ("Worker should receive an appropriate message").
- **On success**: transition immediately to the Accepted-work surface (§13); the
  worker's own state becomes `BUSY` (§7.2) with no separate action needed.
- `POST /quick-work/offers/:id/decline` — explicit, immediate, no confirmation dialog
  needed (declining is low-stakes and should be fast, matching how swiping past a job
  card already works elsewhere in the app).

---

## 13. Accepted Work

Once `ACCEPTED`, the worker sees (per the brief, and matching
`employer-plan.md` §13's employer-side mirror): customer name, service, area/address
(now the **real** address, since the request is locked to this worker — location
privacy per §10.1/§26 only gates it pre-accept), distance, ETA, a chat entry point
(existing chat module, conversation scoped to the request the same way Jobs scopes
conversations to an application), masked call (`employer-plan.md` §2.4 pattern,
adapted to a `requestId` instead of `applicationId`), and the "I'm on my way" /
"I've arrived" controls (§14–15).

---

## 14. Navigation (to the job)

"Navigate" here means: open the device's map app (Google Maps / Apple Maps deep link)
pointed at the request's `geo` coordinates — **not** an in-app turn-by-turn map, which
does not exist anywhere in Doondo today and is out of scope. This matches how the
existing app already handles "get directions" style needs elsewhere (a standard
`Linking.openURL` maps deep link), rather than inventing in-app routing.

Worker-side location updates while traveling: see §32 for the full policy (throttled
foreground updates, active only during `ARRIVING`).

---

## 15. Arrival

Worker taps **"I've Arrived."** `ARRIVING → ARRIVED` (compare-and-swap transition,
`employer-plan.md` §10). Optionally geofenced against the request's `geo`, reusing
`shiftCheckIn.service.ts`'s haversine-fence pattern (~750m tolerance, or tighter for a
residential address) — same reasoning as the employer-side plan's §14: this is proven,
shipped code, not a new geofencing implementation. `emitToUser(employerId,
'quick_work:worker_arrived', {...})` + `notifications.record()` fire on success.

---

## 16. Work Execution

`ARRIVED → IN_PROGRESS` on "Start Work" (worker-triggered, records `startedAt`).
While in progress, the worker sees the request's description/photos/voice-note,
the chat thread, and the customer's contact affordance (already unlocked at
`ACCEPTED`). No live map tracking during this phase — the worker is stationary at
the job site (per §2.4, tracking is only meaningful during `ARRIVING`, §32).

---

## 17. Additional Charges

If the actual scope exceeds the original estimate (extra materials, more time), the
worker can submit a **proposed revised price** before completing. This must go through
**explicit customer approval** before it affects the final payable amount — the
brief's "Additional costs should require customer approval before charging" is a hard
requirement, not a suggestion:
```
worker submits revisedPrice + reason
  → employer sees a clear "approve new price" prompt (blocking further progress
    display, non-blocking to the actual physical work, which can continue)
  → employer approves  → finalPrice updates, worker can proceed to Complete
  → employer rejects   → worker keeps the original estimatedPrice as the ceiling,
                          or the request can escalate to Dispute (§25) if the worker
                          refuses to continue at the original price
```
No existing "counter-offer" UI matches this shape exactly — the closest precedent is
`applications.offerStatus = 'countered'` (a wage counter-offer on a Job's hire), whose
*pattern* (propose → other party accepts/declines → status reflects it) is the
template, not a literal table reuse (that field lives on `applications`, which this
plan does not touch).

---

## 18. Completion

Worker taps **"Complete Job"**, submitting a required photo, optional notes, and the
final price (defaulting to the original estimate if no additional-charge flow ran).
`IN_PROGRESS → COMPLETED → PAYMENT_PENDING` (the second transition is automatic,
per `employer-plan.md` §10/§16). Shape mirrors `workProofs`
(`photo_url`/`status`/`submitted_at`) but is written directly onto the
`quick_work_requests` row rather than a separate proofs table, since Quick Work has
exactly one worker per request (no multi-candidate proof review queue the way Jobs'
`workProofs` table supports).

---

## 19. Earnings

`EarningsScreen.tsx` **[REUSE, unchanged screen]** already shows total earned,
pending, and a transaction list via `walletApi`. Once `wallet_kind` gains
`quick_work_payment` (`employer-plan.md` §17), Quick Work payouts appear in this exact
same list, filterable the same way existing entries already are. **No separate Quick
Work wallet or earnings screen is created** — this is the brief's explicit instruction
taken literally.

The worker should see, specifically, at each stage:
- **Estimated earnings** — shown on the offer card (§10.1) and again on the Accepted
  screen (§13), computed as `estimatedPrice` minus `splitCommission()`'s fee, so the
  number shown is always take-home, never confusingly gross.
- **Approved additional charges** — reflected once §17's approval flow completes.
- **Final earnings** — locked in at `COMPLETED`, shown on the Completion screen (§18)
  and in the wallet ledger once paid.
- **Payment status** — `PAYMENT_PENDING`/`PAID`, mirrored from the request's own
  status, not a separate concept to track.

---

## 20. Payment

Worker-side, this is entirely **[REUSE]** — the worker does not initiate payment
(the employer does, via `POST /payments/intent` per `employer-plan.md` §17); the
worker's only role is to see the payment land in their wallet
(`POST /payments/:id/mark-paid` credits `walletTransactions`, §19 above) and to see the
receipt if they want one (`GET /payments/:id/receipt`, already generic to either
party per `employer-plan.md` §17.4). No new payment code is needed on the worker side
beyond a "waiting for payment" state on the Completion screen and a push/notification
when `PAID` fires.

---

## 21. Rating

Worker rates the **customer** after `PAID` (per the brief — this is the one place
worker-side rating direction differs from Jobs, where the seeker rates the employer
after a hire; here it's symmetric: both parties can rate each other, same as
`employer-plan.md` §18's `PAID → RATED` transition being triggerable by either side).
Reuses `LeaveRatingScreen`'s existing UI pattern verbatim (§18's schema decision from
`employer-plan.md` — Option A recommended — applies identically here, since it's the
same `ratings` table).

---

## 22. History

`QuickWorkHistoryScreen` **[NEW screen, mirrors the employer-side equivalent
exactly]**: **Active | Completed | Cancelled** tabs. Per the brief's explicit
instruction, Quick Work earnings/history should sit **alongside** existing earnings —
so this plan surfaces Quick Work history as a tab/filter reachable from
`EarningsScreen` (or a adjacent entry point from it) rather than a wholly separate,
disconnected history screen the worker has to discover independently. Filters: Today /
Week / Month / All, matching the brief's §14 requirement and the visual convention
already used elsewhere (e.g. `MyApplicationsScreen`'s existing filter chips).

---

## 23. Cancellation

| Trigger | Status range | Effect |
|---|---|---|
| Worker cancels | `ACCEPTED` | Allowed, reason required. Dings the worker's response-rate signal (`employer-plan.md` §11.2/§20) so repeated worker-side cancellations rank them lower in future matching — this is the abuse-prevention lever the brief asks for, reusing a ranking input rather than inventing a separate penalty system. |
| Worker cancels | `ARRIVING`/`ARRIVED` | Allowed but flagged as a near-no-show event (§24) — stronger reason requirement. |
| Worker cancels | `IN_PROGRESS`+ | Not a plain cancel — routes to Dispute (§25), same rule as the employer side. |
| Customer cancels | any pre-`IN_PROGRESS` | Worker is notified immediately (`emitToUser` + push); if this happens after `ACCEPTED`, it should count *for* the worker, not against them, in any future reliability scoring. |
| Customer cancels | `IN_PROGRESS`+ | Routes to Dispute — work has already started. |

Exactly symmetric with `employer-plan.md` §20's table, viewed from the other party.

---

## 24. No-Show

Two directions, both needed (the brief only asked for the worker's own no-show
handling in the old draft; the actual brief here asks for both):

- **Customer no-show** (worker arrived, customer isn't there/reachable): the worker
  needs a documented **waiting-time flow** — "I've arrived, waiting" starts a visible
  timer; after a configurable grace period (e.g. 10–15 minutes) with no customer
  contact, the worker can flag `customer_no_show`, which requires: arrival timestamp
  (`arrivedAt`, already recorded per §15), waiting duration, current location (a
  single fresh read, not continuous tracking — consistent with §32's minimal-tracking
  policy), and optionally a photo as evidence (reusing the same upload path as
  completion photos). This should **not** silently become `CANCELLED` — it needs its
  own recorded reason distinct from an employer-initiated cancel, since it affects the
  customer's reliability signal, not the worker's.
- **Worker no-show** (accepted but never arrives / never responds): system-detected
  when `ACCEPTED`/`ARRIVING` sits past a reasonable deadline with no `ARRIVED`
  transition — auto-cancels the request back toward re-matching (or `NO_WORKER_FOUND`
  if re-matching also fails) and dings the worker's response-rate/reliability signal
  harder than a decline does, since an accept is a commitment.

Cancellation fees are **not** assumed here — flagged as a product/business decision
(would require a new charge-on-cancellation flow through the existing payment intents,
non-trivial) rather than silently built.

---

## 25. Dispute

Same as `employer-plan.md` §21: `apps/backend/src/modules/disputes/` **[EXISTING, not
inspected in this pass]** must be read fully before implementation — Quick Work should
route into whatever generic dispute queue that module already provides
(`quick_work_requests.status = 'DISPUTED'` + a `disputeReason` field feeding it), not
get a second, parallel dispute system.

---

## 26. Safety

| Requirement | Source |
|---|---|
| Worker verification | `users.isVerified` **[EXISTING]** |
| Customer information | Name/rating/verification shown per §10.1's privacy rule (area only pre-accept, full address post-accept) |
| SOS | `modules/sos` **[REUSE, already user-scoped, works today]** |
| Report | Check `modules/moderation` **[EXISTING, inspect before building — same open item as `employer-plan.md` §22]** |
| Block | `blockedWorkers` **[REUSE]** |
| Emergency handling | SOS covers the "something is wrong right now" case; a blocked/reported customer should also be excluded from future matching against that worker (a filter addition to §11's candidate query, symmetric to how a worker who blocked an employer already shouldn't see that employer's Jobs either — verify the existing Jobs-side block-filtering logic and mirror it, don't diverge) |
| Safe location-sharing rules | Exact address gated until `ACCEPTED` (§10.1); live position only shared with the matched customer during `ARRIVING`, never broadcast to the 3–5 originally-offered-but-not-accepted workers/customers, and never persisted beyond the active request (§32's storage policy) |
| Dispute | §25 |
| Proof of completion | §18 |
| Privacy | No customer PII beyond what's needed for the active job is shown pre-accept; history screens (§22) never re-expose a past customer's exact address once the request is terminal |

---

## 27. Notifications

Same `notification_kind` enum extension as `employer-plan.md` §23 (shared enum, one
list, not duplicated) — the worker-relevant subset:
`quick_work_offer_received`, `quick_work_offer_expiring`, `quick_work_offer_closed`
(lost the race), `quick_work_customer_cancelled`, `quick_work_price_approved`,
`quick_work_paid`, `quick_work_disputed`. Delivered via the exact same
`notifications.record()` call every other module already uses.

---

## 28. Socket.IO

Same transport as `employer-plan.md` §24 (`emitToUser`, per-user rooms, no new
architecture) — the worker-relevant event names:
```
quick_work:offer_received
quick_work:offer_expired
quick_work:offer_closed          -- another worker won the race
quick_work:accepted              -- confirms this worker's own accept succeeded
quick_work:status_changed        -- generic {requestId, from, to} for every transition
quick_work:customer_cancelled
quick_work:payment_pending
quick_work:paid
quick_work:disputed
quick_work:availability_changed  -- §7.4, own-account multi-device sync
```
`quick_work:customer_location` from the original brief is **not implemented** —
per §2.4/§32, the worker shares location toward the customer during `ARRIVING`
(one-directional), and there is no product need identified for the customer's own
location to stream to the worker (the customer isn't traveling). If a future need
emerges, it follows the same pattern, not a new transport.

---

## 29. API

Worker-facing endpoints (the two-sided ones — offers, arrival, start, complete — are
already listed once, authoritatively, in `employer-plan.md` §25; repeated here only so
this document is self-contained for a worker-focused implementation session):

```
# Availability (extend existing routes)
GET    /me/availability
POST   /me/availability            -- body gains serviceIds[], paused
DELETE /me/availability

# Service profile (new, §8)
GET    /me/quick-work-services
POST   /me/quick-work-services     -- upsert per-service opt-in + qualification docs

# Offers
GET    /quick-work/offers/incoming
POST   /quick-work/offers/:id/accept
POST   /quick-work/offers/:id/decline

# Active request (worker actions)
GET    /quick-work/requests/:id
POST   /quick-work/requests/:id/arriving
POST   /quick-work/requests/:id/arrived
POST   /quick-work/requests/:id/start
POST   /quick-work/requests/:id/propose-price     (§17)
POST   /quick-work/requests/:id/complete
POST   /quick-work/requests/:id/report-no-show    (§24, customer no-show)
POST   /quick-work/requests/:id/cancel

# History
GET    /quick-work/requests/mine?role=worker&status=

# Payment / rating (read-only from the worker side, per §20)
GET    /payments/mine
GET    /payments/:id/receipt
POST   /ratings                                    (rating the customer, §21)
```

All routes: `requireAuth` + `requireRole('seeker')` where role-specific, plus an
inline ownership check (`request.matchedWorkerId === req.user.id`) exactly like every
existing service function in `employer-plan.md` §2's inspection.

---

## 30. Database

**No new tables from the worker side** beyond what `employer-plan.md` §26 already
defines (`service_categories`, `services`, `quick_work_requests`,
`quick_work_offers`, `quick_work_status_history`) — this plan does **not** introduce
`quick_work_services` as a separate table (the brief's own "do not duplicate existing
service catalog structures" instruction; `services` already is that table).

**New columns**, worker-relevant:
- `availabilities.serviceIds uuid[]` (nullable) — §7/§8.
- `availabilities.paused boolean default false` — §7.1.
- Optionally, if §8.2's flat-array approach proves insufficient during
  implementation: a new `worker_service_profiles` table
  (`workerId, serviceId, skillLevel, experienceYears, radiusMeters, qualificationDocId`)
  — **not created by default in this plan**; the flat-array approach is the starting
  point, per §8.2's explicit reasoning.

**Reused, not duplicated**: `service_categories`/`services` (shared with the employer
side, one catalog), `paymentIntents`/`walletTransactions` (§19–20),
`ratings`/`blockedWorkers`/`crewDocuments` (§8–9, §21, §26).

---

## 31. Authorization

Identical pattern to `employer-plan.md` §27 — `requireAuth`/`requireRole` plus an
inline "is this caller a participant on this request" check in every service
function, worker side checking `matchedWorkerId` where employer-plan.md checked
`employerId`.

---

## 32. Location Tracking

The most consequential new-infrastructure decision in this plan, laid out explicitly
per the brief's instruction not to implement unnecessary continuous tracking:

- **Start tracking**: only when the worker's request enters `ARRIVING` (i.e., after
  they've tapped "On my way") — never before accept, never just because the app is
  open, never for Jobs at all.
- **Update frequency**: a throttled foreground `Location.watchPositionAsync` with a
  time/distance interval (e.g. every 30–45 seconds or 100m moved, whichever first) —
  deliberately coarse, matching the existing `getCurrentCoords()` helper's own
  "Balanced" accuracy philosophy (§2.4) rather than high-frequency/high-accuracy
  tracking. This computes a fresh `etaMinutes` (via `travelTime`) periodically, which
  is what actually matters to the customer — a live dot is a "nice to have" the brief
  does not require and this plan does not build (consistent with
  `employer-plan.md` §14's decision).
- **Stop tracking**: immediately on reaching `ARRIVED` (no reason to keep tracking
  once the worker is stationary at the job site through `IN_PROGRESS`/`COMPLETED`), and
  unconditionally if the request is cancelled/disputed/terminal, and if the app is
  backgrounded (this plan does **not** request background location permission at all —
  §2.4 confirmed zero existing use of `requestBackgroundPermissionsAsync`, and adding
  background tracking is a substantially bigger scope/privacy/App-Store-review
  commitment than this feature needs; foreground-only tracking during `ARRIVING` is
  the deliberate v1 boundary).
- **Permission handling**: reuses `Location.requestForegroundPermissionsAsync()`
  exactly as `getCurrentCoords()` already does — on denial, the worker can still use
  Quick Work, they simply don't get the periodic ETA refresh (the initially-computed
  ETA at accept-time still stands, same graceful-degradation philosophy `travelTime`
  already uses for a missing Google Maps key).
- **Privacy**: position updates are pushed only to the one matched employer on the one
  active request (`emitToUser(employerId, ...)`), never stored beyond the life of the
  request (no `quick_work_location_pings` history table in v1 — the latest position is
  ephemeral, held on the request row or purely in-memory/socket-relayed, not
  persisted for audit — re-evaluate if a future dispute-evidence need arises).
- **Battery**: foreground-only + throttled interval + automatic stop at `ARRIVED`
  bounds the worst case to "a few minutes of periodic GPS reads while actively
  traveling to a job the worker chose to accept" — not a background drain.
- **Backend validation**: each position update is a normal authenticated
  `POST /quick-work/requests/:id/location` (or purely a socket emit with a
  server-side relay — implementation detail for Phase 5, §35) validated for
  "caller is `matchedWorkerId`, request is in `ARRIVING`" before relaying to the
  employer, same ownership-check idiom as everywhere else.
- **Customer visibility**: ETA countdown + (optionally) a coarse "worker is X km away"
  indicator — not a live map unless/until a future phase explicitly adds one
  (`employer-plan.md` §30 candidate list).

---

## 33. Error / Loading / Empty States

| State | UI | Recovery action |
|---|---|---|
| No incoming requests | `EmptyState` on the Home offer slot — "No requests right now" | Stays `AVAILABLE`, waits; no action needed, just reassurance copy |
| No eligible work (worker has no services selected) | `EmptyState` prompting §8's onboarding | CTA straight into `QuickWorkServiceProfileScreen` |
| Offer expired (worker opened it too late) | Card shows "Expired" state instead of Accept/Decline | Dismiss, return to Home |
| Request already accepted (lost the race) | The §12 "just taken by another worker" message | Auto-return to Home / next offer |
| Location permission denied | Non-blocking banner during `ARRIVING` only | "Enable location" deep-link to OS settings; Quick Work itself still functions (§32) |
| GPS unavailable (denied or no fix) | Same as above, plus ETA simply doesn't refresh | Worker can still self-report arrival manually |
| Network failure | Standard `ErrorPanel` / existing `ApiError` handling — no new pattern | Retry action, same as every other screen in the app |
| Socket disconnected | Silent reconnect (Socket.IO's own default reconnection) — offer/status data falls back to a manual pull-to-refresh on the affected screen if the socket is down for longer | Pull-to-refresh |
| Customer cancelled | Clear notice on the active-work screen, request moves to History → Cancelled | Return to Home, `AVAILABLE` again |
| Worker's own cancellation | Confirmation step given the reliability-signal cost (§23) | — |
| No-show (either direction) | §24's dedicated flow, not a generic error | Documented reason capture |
| Payment failure/pending too long | Shown on the Completion/Payment-pending screen with the same UPI-retry affordance the employer side already has | Worker can nudge/remind (a simple notification re-send, not a new mechanism) |
| Dispute | Routes into the (to-be-inspected) disputes module's own UI pattern | — |
| Server error (5xx) | Standard existing error boundary/toast | Retry |

---

## 34. Analytics / Events

Same open question as `employer-plan.md` §29 — no generic analytics/event-tracking
module was found under `apps/backend/src/modules/` in this inspection. Before
instrumenting a Quick Work funnel (available → offered → accepted → arrived →
completed → paid) from the worker side, a future implementation session should
confirm whether such a system exists elsewhere in the stack (not exhaustively ruled
out) rather than assuming either way.

---

## 35. Implementation Phases

Mirrors `employer-plan.md` §30's phase numbers exactly, since both sides ship
together against the same backend tables — worker-specific work per phase:

1. **Phase 1 — Service catalog & worker onboarding**: consume the shared catalog
   (built once, per employer-plan.md §30 phase 1); build
   `QuickWorkServiceProfileScreen` (§8); extend `availabilities` with `serviceIds`.
2. **Phase 2 — Availability states**: `paused` column, derived `BUSY` logic (§7),
   promote the Beacon control on Home (§6.2).
3. **Phase 3 — Matching + offers**: `IncomingOfferCard` (§10), accept/decline (§12),
   relies on the shared matching/ranking backend built in employer-plan.md phase 3.
4. **Phase 4 — Real-time + notifications**: worker-side socket listeners (§28),
   notification handling (§27).
5. **Phase 5 — Execution**: Arrival/Start/Complete screens (§15–18), the location
   throttling implementation (§32) — the single biggest net-new engineering item in
   this whole plan.
6. **Phase 6 — Money**: Earnings integration (§19), payment status display (§20).
7. **Phase 7 — Trust**: rating (§21, pending the shared schema decision), cancellation
   (§23), no-show (§24), dispute wiring (§25) — **read `modules/disputes` and
   `modules/moderation` fully before this phase**, same instruction as the employer
   plan.
8. **Phase 8 — History + polish**: `QuickWorkHistoryScreen` (§22) folded into
   Earnings, empty/error states (§33), final Home layout (§6), nav decision execution
   (§5).

Every phase ends with `pnpm --filter mobile typecheck` clean, same discipline as the
rest of this codebase's recent work.

---

## 36. Testing

- Backend: unit-test the availability-eligibility query (§11/§7 — a worker with the
  right service but wrong verification status must NOT appear as a candidate; a
  `PAUSED` worker must NOT appear even with everything else matching), and the
  worker-side half of the atomic accept race (`employer-plan.md` §11.3/§36 — the two
  plans should share the same test suite for this, not duplicate it, since it's one
  transaction).
- Location throttling (§32) should have a pure-function unit test for "should this
  tick emit an update" (time-since-last OR distance-since-last threshold logic),
  independent of the actual `expo-location` call, so it's testable without a device.
- Mobile: no existing screen-level test convention found (same open item as
  `employer-plan.md` §31) — minimum bar is a clean `pnpm --filter mobile typecheck`
  for every new screen.

---

## 37. Acceptance Criteria

- [ ] Existing Jobs flow (browse/apply/hire/roster/attendance/payroll) has zero
      behavioral changes.
- [ ] A worker with zero Quick Work services selected sees the §33 "no eligible work"
      empty state, never a raw error, and is never offered any request.
- [ ] Turning `AVAILABLE` on with ≥1 service makes the worker a real matching
      candidate within one matching cycle (verified against the same backend
      `employer-plan.md` §11 defines).
- [ ] Accepting a request that another worker already accepted returns a clean,
      specific message (§12), never a generic crash/error, and returns the worker to
      Home.
- [ ] `AVAILABLE → BUSY` happens automatically on accept with no separate worker
      action; `BUSY → AVAILABLE` happens automatically on completion (§7.2).
- [ ] Location updates are only ever sent while status = `ARRIVING`, verified by
      confirming no location call fires in any other state, satisfying the brief's
      "do not implement unnecessary continuous tracking."
- [ ] Quick Work earnings appear in the existing `EarningsScreen` — no second wallet
      UI exists anywhere in the app.
- [ ] A worker's Quick Work rating and a Jobs rating both roll into the same visible
      rating badge (`summarizeForUsers`), not two separate numbers.
- [ ] `pnpm --filter mobile typecheck` is clean.
- [ ] No new Socket.IO room/namespace architecture was introduced.
- [ ] The service catalog consumed here is the exact same `service_categories`/
      `services` tables the employer side reads — verified by there being only one
      migration that creates them, referenced from both `quickWork.api.ts` (worker)
      and `services.api.ts` (employer) equivalents.

---

## Appendix — Open Questions For The Next Implementation Session

1. **Navigation** (§5) — same unresolved fork as `employer-plan.md`'s Appendix item 1;
   this plan defaults to "no new tab."
2. **Ratings schema** (§21) — depends on the same Option A/B decision as
   `employer-plan.md` §18; must be decided once, consistently, for both plans (it's
   one table).
3. **Disputes / moderation module shapes** (§25/§26) — not inspected in this pass;
   read both fully before Phase 7.
4. **`worker_service_profiles` vs flat `serviceIds` array** (§8.2/§30) — start flat;
   revisit only if ranking (§11) genuinely needs richer per-service data than the flat
   list provides.
5. **Cancellation fees** (§24) — explicitly not designed here; flagged as a
   product/business decision requiring its own charge-flow design if wanted.
6. **Analytics** (§34) — confirm whether any event-tracking system exists anywhere in
   the repo before instrumenting funnel events.
7. **Employer-side Quick Work UI** is `employer-plan.md`'s scope, not redesigned here
   — but §10–§18 of this document necessarily assume specific employer-visible
   behavior (e.g. the price-approval prompt in §17); if `employer-plan.md` is revised
   independently in the future, re-check this document's §17/§23 for drift.
