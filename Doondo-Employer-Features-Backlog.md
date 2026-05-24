# Doondo — Employer-Side Feature Backlog

**Version:** 1.1
**Date:** 24 May 2026
**Owner:** Shree
**Audience:** Product, design, mobile developers
**Status:** Idea backlog. Companion to `Doondo-Employer-Side-Spec.md`. Nothing here is committed — this is a menu of net-new employer features to pull from in future cycles. v1.1 adds Themes E and F — 15 more features, for 39 in total.

---

## 1. What this doc is

The Employer-Side Spec (`Doondo-Employer-Side-Spec.md`) closes the *core loop* — post → vet → schedule → hire → manage → pay → re-hire — across five tabs. That spec is about making the existing pieces coherent and shippable.

This doc is the next question: **once the loop works, what makes an employer choose Doondo, stay on it, and pay for it?** Everything below sits *beyond* the §6 core build. Where the spec already gestures at something (Phase E4 analytics and re-post, Phase E5 bets), this doc expands it rather than repeats it, and says so.

Features are grouped into six themes and each carries a rough effort tag — **S** (days), **M** (a week or two), **L** (a cycle or more) — and a note on what already exists in the repo to reuse.

A duplication check against the spec: the core build (Home, Jobs + pipeline, Workers, Chat + scheduler, You, verification, payments surface, anti-ghost nudges) is **not** repeated here. The 39 ideas below are additive.

---

## 2. Theme A — Close the loop & retention

The single-hire loop is the spec's job. These features make the *second, third, and tenth* hire frictionless — which is where retention actually lives for a local hirer.

### A1. Recurring shifts & a weekly roster builder
Many Doondo employers don't hire once — they staff the *same slots every week*: a household needs help every morning, a restaurant needs dishwashers every Friday and Saturday, a contractor runs a standing crew. Today every one of those is a fresh job post. Add a **recurring job** type (pick days/times, set an end date or "ongoing") and a **weekly roster** view in Workers → My workforce that shows who is filling each recurring slot. Reuse `jobs` + `scheduler`. **Effort: M.**

### A2. Offer-my-crew-first
My Crew (favorited workers, in the spec) is a list. Make it an action: when posting a shift, let the employer **broadcast it privately to their saved crew first** — with a short head-start window — before it goes public. Pair it with a crew-availability strip ("4 of your 9 crew are free this week"). This turns a good past hire into the *default* next hire and is the strongest single retention lever. Extends My Crew + the availability beacon (`AvailableWorkersScreen`). **Effort: M.**

### A3. No-show backfill / waitlist auto-promote
A hired worker cancels the night before, or no-shows. Right now the employer starts over. Instead, when a `hired` application reverts, **auto-offer the slot to the next shortlisted candidate** in that job's pipeline and notify the employer. The pipeline already holds ranked candidates at known stages — this is mostly a transition rule on `applications`. **Effort: S–M.**

### A4. Dormant-employer re-engagement
The seeker side has a 14-day dormant win-back cron (`notifications/reengagement`, feature #21). There is no employer equivalent. An employer who hasn't posted in ~3 weeks should get one role-aware nudge: *"Need hands again? 4 workers you've worked with before are free near you."* Mirror the existing cron with employer copy and the same cooldown/attempt caps. **Effort: S.**

### A5. Refer-an-employer reward
The `referrals` module pays seekers who bring seekers (#20). Local employers know other local employers — the shop owner two doors down. Add an **employer→employer referral**: both sides rewarded on the referred business's first completed hire. Same module, new referral type and reward trigger. **Effort: S.**

### A6. Saved worker searches with match alerts
In Workers → Find workers, let the employer **save a search** ("electricians, within 3 km, available weekends") and get a push when a new worker matches — including a worker who *later* raises their availability beacon. It converts one-time browsing into a standing pipeline and gives the employer a reason to reopen the app. **Effort: M.**

---

## 3. Theme B — Monetization-ready

The spec is explicit that this cycle is **free**, and rightly so. But "free now" should not mean "un-instrumented." These features build the *surfaces and the data* a paid model will need, so monetization later is a config flip and a price, not a re-architecture.

### B1. Boosted job posts (built now, priced later)
The likely future model named in the spec is free-to-post + paid boost. Build the **boost slot now**: a job can be flagged "boosted," and the seeker-side feed ranking already has a hook for priority placement. Keep it free and unlimited this cycle, but **instrument applies-per-boosted vs. applies-per-organic** from day one. When pricing is designed, the lift is already measured. **Effort: M.**

### B2. "Hiring now" urgency treatment
A lightweight cousin of the boost: an **urgent badge** on a post (and a small bump in feed freshness) for employers who need someone today. Free now, an obvious low-price upsell later, and useful immediately because it routes genuine urgency to the top. **Effort: S.**

### B3. Employer subscription tier (design the shape now)
A high-volume hirer — a staffing-heavy restaurant group, a labour contractor — behaves differently from a household hiring once a year. Sketch a **subscription tier**: unlimited boosts, full analytics, multi-seat (see C2), priority support, a featured profile. Don't build billing this cycle; *do* tag employers by hiring volume now so the addressable tier is visible in the data. **Effort: L (deferred); S to instrument.**

### B4. Featured / verified-plus business profile
The spec has one verification badge (optional, champagne-gold). Leave that free forever — it protects supply. But a **richer business storefront** above it (photos of the workplace, a short intro, a "what it's like to work here" section) is a natural paid or subscription perk and also feeds C6 (verified safe-workplace). Extends `EmployerProfileScreen`. **Effort: M.**

### B5. Cost-per-hire & fill-rate instrumentation
Phase E4 already names funnel + time-to-hire analytics. Extend the *event schema* now to also capture **fill rate** (jobs filled vs. expired), **applies-to-hire ratio**, and **boost lift** per job. This is the dataset every pricing decision will be made on; capturing it costs little now and is expensive to backfill. **Effort: S.**

---

## 4. Theme C — Trust & safety

The seeker side already holds employers accountable (anti-ghost engine, anonymous reviews). For the employer to *trust the platform back*, the safety net has to run in both directions.

### C1. Dispute resolution flow
Attendance disputes, payment disputes, and no-shows will happen. Build a **structured dispute filing**: either side opens a case, picks a reason, attaches evidence. The shift check-in selfie + geofence (`applications/shiftCheckIn`, #9) is *already* the neutral evidence — surface it in the case. Route to a simple admin/mediation queue. Without this, every dispute becomes a 1-star review and a churned user. **Effort: M–L.**

### C2. Team seats / multi-manager accounts
A restaurant has an owner *and* a floor manager; both hire. Today a Doondo business is one login. Add **multiple staff on one business account** with light roles — owner (full) vs. manager (post, vet, hire, but not billing/verification) — and an **audit trail** of who advanced or hired whom. This is also a prerequisite for the B3 subscription tier. **Effort: M.**

### C3. Worker reliability signals, employer-facing
The seeker carries a Doondo Score that employers see. The mirror is missing: an employer vetting a candidate cannot see that worker's **no-show / late-cancellation history**. Surface a small, fair reliability signal (derived from check-in data and prior shift outcomes) on the applicant card. Honest in both directions, and it makes the pipeline's "New" column more decision-ready. **Effort: M.**

### C4. Block & report
Small but overdue: let an employer **block a worker** from applying to their jobs again, and **report** a fake profile, a scam, or abusive behaviour. Feeds the trust-and-safety queue and protects the employer from repeat bad actors. **Effort: S.**

### C5. Wage escrow (the spec's open question, answered "build it")
The spec's §12 asks whether per-shift "mark paid" is enough or whether My workforce needs escrow. Recommend **escrow as a fast-follow**: the employer funds the shift wage up front, Doondo holds it, and it releases automatically on a verified check-out. It removes the single biggest source of worker distrust ("will I actually get paid?"), makes the "paid on time" review tag near-automatic, and quietly creates a monetization seam (a small fee or float). Builds on `UpiPaymentPanel`. **Effort: L.**

### C6. Verified safe-workplace badge
Doondo for Women (#37) lets the employer *declare* safety signals — checkboxes. Add a tier above self-declaration: a **photo-backed or self-audit-backed safe-workplace badge** (washroom access, lighting, a named safety contact). It strengthens the women-safety feed filter and gives genuinely good small employers a way to stand out. Extends the women-safety module + `EmployerProfileScreen`. **Effort: M.**

---

## 5. Theme D — Differentiation & moonshots

The spec's Phase E5 names two bets — Live Job Auction and a Doondo Coach for employers. These are more bets in the same spirit: only after the core loop is solid, and only one or two at a time.

### D1. Wage benchmarking guidance
Doondo sees wage data across every post in an area. Turn that into employer guidance: *"Cooks near you are posting ₹650/day. Your post is ₹520 — that's why it has 2 applicants after 3 days."* It is high-trust, costs nothing extra to compute, and directly fixes the most common reason a job stalls. Strong, low-risk differentiator. **Effort: M.**

### D2. AI auto-shortlist
When a job pulls 40 applicants, the "New" column is a wall. Use the existing **Doondo Score** plus a ranking pass to **surface the top 3–5 with a one-line "why,"** without hiding the rest. It respects the spec's low-digital-literacy principle (fewer choices, clear reasoning) and makes the pipeline usable at volume. **Effort: M.**

### D3. Predictive staffing
From the employer's *own* hiring history, forecast demand: *"You hired 3 extra hands the week before Diwali last year — want to post early?"* A genuinely sticky feature for recurring hirers and a natural pairing with A1 (recurring shifts) and D6 (festival mode). Needs a history base first, so it is a later-cycle bet. **Effort: L.**

### D4. Instant staffing — "I need someone now"
The employer-side mirror of the seeker open-shift idea (#40, partial). One tap: set wage + time window → Doondo pings available workers nearby (the beacon list) and the employer's crew → first to accept is hired. Emergency cover for a same-day no-show. Builds on the availability beacon + A2 (offer-my-crew-first). **Effort: M–L.**

### D5. Multi-location management
For an employer with several shops or sites: one account, **per-site job posts and per-site rosters**, a location switcher on Home. Pairs naturally with C2 (team seats) and the B3 subscription tier — multi-location employers are exactly the segment worth charging. **Effort: M.**

### D6. Festival / surge mode for employers
The employer half of the not-started Festival Mode (#45). Around big festivals, local hiring spikes hard. Give employers a **pre-built surge campaign**: bulk-post recurring festival shifts, an "extra hands for Diwali" template, and an early nudge driven by D3. Seasonal, memorable, and very on-brand for the Indian local-hiring market. **Effort: M.**

### D7. AI voice screening (extends the spec's Phase E5 Doondo Coach bet)
The spec's Phase E5 names a Doondo Coach for employers. One concrete shape worth scoping: a **voice screening assistant** that calls shortlisted candidates, asks the employer's standard screening questions, and returns a short summary to the pipeline card. It suits employers who hire between other work and can't run 15 phone screens. Reuses the `transcription` module and the seeker-side voice agent groundwork (#23). **Effort: L.**

---

## 6. Theme E — Speed & ease (lower the effort to post and hire)

The spec's design principle is one-handed hiring, between other work, by employers with limited digital literacy. These features attack the *effort* of each step directly.

### E1. Post a job from a photo
The seeker side's hero feature is the one-photo profile (#2) — snap a resume or handwritten sheet, vision-AI fills the form. Give the employer the mirror: **photograph a handwritten "help wanted" note, an old flyer, or a wage scribbled on paper**, and AI drafts the whole job post — title, wage, shift, skills — for the employer to confirm. It removes the blank-form barrier that stops a low-literacy employer from posting at all. Reuses the `profileExtract` module and its vision provider. **Effort: M.**

### E2. Job-post quality coach
Before publishing, score the post and give one or two plain-language fixes: *"No wage range — posts with a clear daily wage get far more applicants,"* or *"Add a shift time so workers know if they're free."* It's a coach for the *post*, not the employer, and it lifts fill rate directly. Pairs with D1 (wage benchmarking) — a below-market wage is the most common quality flag. **Effort: S–M.**

### E3. Auto-translated job posts
The employer writes the post once, in their language; every seeker reads it in *theirs*. The seeker side already pre-translates quick-reply templates (#15) and carries a per-screen language toggle (#16) — extend that translation layer to the job post body and the Reverse Interview answers. Widens every post's reach with no extra employer effort. **Effort: M.**

### E4. WhatsApp applicant alerts & replies
Indian local employers live in WhatsApp, not in app notifications. Let an employer **receive new-applicant alerts on WhatsApp and reply from there** — a tap deep-links back into the app for the hire action. Meets the employer where they already are and is the strongest re-engagement channel available. **Effort: M.**

### E5. Masked in-app calling
A worker and an employer often want to *talk*, not type — but neither should hand a personal number to a stranger. Add **masked calling**: the call connects through Doondo, numbers stay private on both sides. A real safety feature — especially for women workers and household employers — and a trust signal. **Effort: M.**

### E6. Shareable apply link & QR poster
Generate a **link and a printable QR poster** for any job — "scan to apply" — that the employer sticks on the shop door, drops in a WhatsApp group, or hands to a walk-in. It bridges the offline local hiring that already happens into the app, and every scan is an instrumented application. Reuses the share-card generator behind `HireShareCardPoster`. **Effort: S.**

### E7. Bulk candidate & crew messaging
One action to **message every shortlisted candidate** ("interviews tomorrow 10–12, reply to confirm") or the **whole crew** ("anyone free Saturday?"). Today that is one chat at a time. Saves the most time exactly when the employer is busiest — staffing a shift fast. **Effort: S.**

---

## 7. Theme F — Workforce, money & records

The spec's My workforce covers today's roster, attendance, per-shift pay, and ratings. These deepen the *post-hire* relationship — the part that turns a platform into infrastructure the employer depends on.

### F1. Timesheet & hours export
Shift check-in (selfie + geofence, #9) already records when every worker started and ended. Roll it into a **per-worker monthly timesheet** the employer can view and export — hours, days, shifts. The data already exists; this is the report on top of it, and it is what an employer needs at month-end. **Effort: S–M.**

### F2. Payroll & compliance helper
The seeker side explains PF / ESI / tax to the worker (#4, `PayslipExplainerScreen`). Give the employer the mirror: *"You paid 4 workers ₹X across 38 shifts this month. Here's what registering for PF/ESI would involve."* Plain-language, non-pushy, and genuinely useful to a small employer who has never formalised payroll. Reuses the verified FY 2026-27 rate data. **Effort: M.**

### F3. Batch crew payout
For a contractor paying a 10-person crew, paying one worker at a time is the wrong flow. Add a **batch payout**: select a crew or a shift, pay everyone in one action (UPI payouts and cash-marked together), one entry per worker in payout history. Builds on `UpiPaymentPanel`. **Effort: M.**

### F4. Tip / bonus
A one-tap **bonus on top of the shift wage** for a worker who did well — recorded to payout history like any other payment. Small feature, outsized goodwill, and it gives the employer a positive lever beyond the star rating. **Effort: S.**

### F5. Trial shift / probation
Let an employer **hire for a single paid trial shift** before committing to ongoing or recurring work. It lowers the risk of a first hire from an unknown worker — exactly the hesitation that stalls employers — and slots naturally before A1 (recurring shifts). **Effort: M.**

### F6. Private worker notes
A small private notes field on each worker — *"great with customers, bring back for weekends"* or *"late twice."* Only the employer sees it. It makes My crew and re-hiring decisions real instead of memory-based, especially for employers managing many workers. **Effort: S.**

### F7. Background / police verification for sensitive hires
Household and care roles — a maid, a driver, a nanny — carry a trust bar a star rating doesn't clear. Integrate a **background / police-verification partner** for those hires, surfaced as an opt-in verified-background badge, and offer a face-match check against the check-in selfie so the person who arrives matches the profile. The highest-trust feature for the household segment. **Effort: L.**

### F8. Shift-swap & coverage requests
A hired worker can't make a shift. Instead of a silent no-show, let them **request coverage**; the employer approves, and the open slot is offered to the crew (A2) or the pipeline waitlist (A3). It converts the worst employer experience — the surprise no-show — into a managed handoff. **Effort: M.**

---

## 8. Prioritization — a suggested cut line

Not all 39 are equal. A rough triage:

**Fold into the current cycle if there's room (cheap, high-value, reuse-heavy):**
A3 no-show backfill, A4 dormant re-engagement, A5 refer-an-employer, B2 "hiring now" badge, B5 cost/fill instrumentation, C4 block & report, E2 post-quality coach, E6 shareable apply link/QR, E7 bulk messaging, F4 tip/bonus, F6 private worker notes. Mostly S-effort, leaning on modules that already exist.

**Next cycle — the retention, ease, and trust core:**
A1 recurring shifts, A2 offer-my-crew-first, A6 saved searches, B1 boosted posts, C1 dispute resolution, C2 team seats, C3 worker reliability signals, D1 wage benchmarking, D2 AI auto-shortlist, E1 post-from-photo, E3 auto-translated posts, E4 WhatsApp alerts, E5 masked calling, F1 timesheet export, F3 batch payout, F5 trial shift, F8 shift-swap. This set is what turns a working loop into a product employers prefer.

**Real bets — one or two at a time, after the loop is proven:**
B3 subscription tier, C5 wage escrow, C6 safe-workplace badge, D3 predictive staffing, D4 instant staffing, D5 multi-location, D6 festival mode, D7 AI voice screening, F2 payroll helper, F7 background verification. L-effort, or dependent on a data/usage base or a partner integration that doesn't exist yet.

**The strongest five to champion**, if only a few move: **A2 offer-my-crew-first** (retention), **C1 dispute resolution** (trust — the loop's missing safety net), **D1 wage benchmarking** (a differentiator that costs almost nothing and fixes a real failure mode), **E1 post-from-photo** (kills the blank-form barrier the way the seeker side's hero feature did), and **E6 shareable apply link/QR** (cheap, and it pulls the offline local hiring that already happens onto the platform).

---

## 9. Instrument now, regardless of what ships

Even features deferred for years should have their *data* captured from this cycle, because behavioural history can't be backfilled. From day one of the employer build, log: time-to-hire and time-to-first-response per job, fill rate, applies-to-hire ratio, organic vs. (future) boosted lift, repeat-hire rate and crew re-hire rate, dispute rate, and per-employer hiring volume and seasonality. That dataset is what makes B1/B3 priceable, D1/D3 possible, and the whole monetization conversation evidence-based rather than guessed.

---

## 10. Open questions

- **Free-forever line.** Verification stays free to protect supply (spec §4). Should the *base* job post also be free forever, with money only ever on boosts/subscriptions — or is a future per-post fee on the table?
- **Escrow appetite.** C5 escrow is the highest-trust feature here but also the heaviest and touches money flow. Is it a pre-launch must, or a post-traction add?
- **Bet sequencing.** Phase E5 already names Live Job Auction + employer Coach. Do D1/D2 (cheap, high-value) jump ahead of those, given they need no new infrastructure?
- **Reliability signals fairness.** C3 surfaces a worker's no-show history to employers. What's the fair window and floor so one bad week doesn't permanently sink a worker — and does it need a seeker-side appeal, mirroring the anti-ghost design?
- **Telephony & WhatsApp.** E4 and E5 depend on third-party providers (a WhatsApp Business API partner, a call-masking provider). Cost scales with usage — worth a build-vs-partner decision before either is committed.
