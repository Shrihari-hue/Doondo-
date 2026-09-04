# Service Catalog — Home-Screen Grouping (24 categories → 15 display groups)

> Implementation plan for a real, scoped gap. Read in full before touching
> anything. Step 0 (the category→group mapping) is a DRAFT — confirm or
> edit it yourself before handing this to a session to execute, the same
> way you finalized Step 0 in THEME_UNIFICATION_PROMPT.md.

## 0. What's already true (verified against the live code + database, not assumed)

The full 24-category / ~357-service taxonomy already exists and is already
seeded:

- Schema: `apps/backend/src/db/schema/catalog.ts` — `service_categories`
  (id, name, slug, icon, sortOrder, isActive) → `services` (id, categoryId,
  name, slug, icon, requiresVerification/Qualification/License,
  supportsQuickWork/ScheduledWork/TraditionalJob, sortOrder).
- Seed data: `apps/backend/src/scripts/seedServiceCatalog.ts` — defines all
  24 categories verbatim (its own doc comment literally calls this "the
  product brief's 24-category list," and already handles the exact
  duplicate-service-across-categories problem the source brief has, e.g.
  "Electrician" appearing under 3 different headings — deduped to one row).
- Live DB right now: **27 categories, 357 services** (confirmed by direct
  query). The 3 extra vs. the seed script's 24 are pre-existing/legacy rows
  — worth a look, not this plan's problem to solve.
- Shared API: `apps/mobile/src/api/services.api.ts` — `listCategories()`
  and `listServices({ categoryId, q })`. **One API, both roles.**

**The actual gap**: nothing curates this for the top of the funnel. Both of
these screens fetch `listCategories()` and render **every category
returned, flat, no cap**:
- Employer: `apps/mobile/src/screens/employer/quick-work/QuickWorkCreateScreen.tsx`
  — the "What do you need?" category step (~line 448,
  `{(categoriesQuery.data ?? []).map((cat) => (...`).
- Worker: `apps/mobile/src/screens/seeker/QuickWorkServiceProfileScreen.tsx`
  — the "Or browse by category" grid (~line 151, identical pattern).

So today an employer or worker opening either screen sees **27 category
tiles**, not the curated ~15 the product wants. This is the only thing
broken — the underlying category/service data is fine and does not need to
be re-seeded or restructured.

## 1. Requirement

Both screens above should show a **small, fixed set of top-level display
groups** (≤15, with an emoji/icon each) instead of the raw 24-27 DB
categories. Tapping a group drills into its member categories/services
exactly like today's category→service drill-down already works — nothing
about the search-by-typing behavior (`listServices({ q })`) changes.

**Must be mutual**: the same grouping is used on the employer's Quick Work
request-creation flow AND the worker's service-eligibility screen. Do not
build two separate lists — one source of truth, consumed by both, exactly
like `services.api.ts` already is.

## 2. Step 0 (DRAFT — confirm or edit before executing)

Target 15 display groups, per the product brief:

🔧 Home Services · 🚗 Vehicle · 💻 Electronics · 🏗️ Construction ·
🧹 Cleaning · 📦 Delivery & Moving · 👨‍🍳 Food · 👶 Personal Care ·
💇 Beauty · 📚 Education · 🏪 Business · 🎪 Events · 🌱 Agriculture ·
🐕 Pet Services · 💼 Professional

Proposed mapping from the 24 existing seed categories (16 are a direct
1:1 rename; **8 are a judgment call I'm flagging, not deciding**):

| Existing category (seed) | → Display group | Confidence |
|---|---|---|
| Home & Property Services | Home Services | direct |
| Automotive & Vehicle | Vehicle | direct |
| Electronics & Technology | Electronics | direct |
| Construction & Skilled Trades | Construction | direct |
| Cleaning & Maintenance | Cleaning | direct |
| Delivery, Logistics & Moving | Delivery & Moving | direct |
| Food & Kitchen | Food | direct |
| Personal & Family Services | Personal Care | direct |
| Beauty & Wellness | Beauty | direct |
| Education & Tutoring | Education | direct |
| Retail & Shop Workers | Business | direct |
| Office & Business Services | Business | direct |
| Events & Functions | Events | direct |
| Agriculture & Rural Work | Agriculture | direct |
| Pet Services | Pet Services | direct |
| Professional Services | Professional | direct |
| Freelance & Digital Work | Business | **judgment call** — could arguably be its own group or fold into Professional instead |
| Media & Creative | Events | **judgment call** — photographers/videographers overlap heavily with Events, but "Media & Creative" also has non-event work (illustrators, musicians) |
| Factory & Industrial | Business | **judgment call** — no clean home for this in the 15; "Business" is the closest catch-all |
| Electrical, Energy & Specialized | Home Services | **judgment call** — could go to Construction instead (solar/inverter techs are trade work, not home-repair-on-demand) |
| Security & Safety | Business | **judgment call** — no dedicated bucket exists |
| Drivers & Transportation | Vehicle | **judgment call** — reasonable, but overlaps with Delivery & Moving for delivery-type driving |
| Clothing & Tailoring | Personal Care | **judgment call** — could also fit Home Services |
| Repair & Miscellaneous | Home Services | **judgment call** — genuinely a catch-all in the source brief too |

**Decide before handing off**: either accept this mapping as-is, or edit
this table directly (add/remove/rename groups, reassign any judgment-call
row) — same pattern as how you finalized Step 0 in
THEME_UNIFICATION_PROMPT.md.

## 3. Implementation approach (recommendation, not yet decided)

Two ways to store the grouping; pick one before executing:

**A — new column on `service_categories`** (simpler): add
`displayGroup varchar(60)` (or `displayGroupSlug` + a small static
`DISPLAY_GROUPS` lookup for icon/label/sortOrder) directly on the existing
table, set via `seedServiceCatalog.ts`. Home/category-picker screens group
client-side by this field, or a new `listDisplayGroups()` endpint groups
server-side. Fewer moving parts; good enough since display groups are a
fixed, rarely-changing set of 15.

**B — new `service_display_groups` table**, `service_categories.groupId`
FK to it. More "correct" relationally, matches the existing
category→service pattern, easier to reorder/rename groups without a code
deploy. More migration work for a set of 15 rows that basically never
changes.

Given the existing catalog's own doc comment explicitly says "one catalog,
two consumers" as a design principle, (A) is probably the better fit
unless there's a reason to expect the group list to change often — flag
this choice to whoever executes.

## 4. Mobile touch points (both roles — must stay symmetric)

- `apps/mobile/src/api/services.api.ts` — add whatever new
  list/group-fetching function the chosen approach needs (or extend
  `listCategories()`'s response shape with the group field).
- `apps/mobile/src/screens/employer/quick-work/QuickWorkCreateScreen.tsx`
  — category step (~line 441-460): render display groups first; tapping
  one reveals its member categories (or goes straight to services if a
  group maps to exactly one category).
- `apps/mobile/src/screens/seeker/QuickWorkServiceProfileScreen.tsx` —
  "Or browse by category" grid (~line 145-160): identical treatment.
- Do **not** touch `servicesApi.listServices({ categoryId, q })` or its
  callers — the service-level search/drill-down already works and is
  out of scope.
- Check whether either screen's employer-side sibling — ordinary Job
  posting (`PostJobScreen.tsx`), if it also has a category picker — needs
  the same treatment for consistency. Confirm before assuming it's in
  scope; the two screens named above are the confirmed gap.

## 5. Explicitly out of scope for this plan

- Re-seeding, renaming, or restructuring the existing 24-27
  categories/357 services — they're fine as-is.
- The 3 extra live-DB categories beyond the seed script's 24 — note them,
  don't silently delete them without checking what they are first.
- Anything about Quick Work's matching, media upload, no-show, or price
  approval — unrelated, already covered in a separate audit.

## 6. Done criteria

- Employer's "What do you need?" step shows ≤15 group tiles, not 27.
- Worker's "Or browse by category" grid shows the same ≤15 group tiles,
  same order, same icons/emoji.
- Drilling into a group still reaches the exact same categories/services
  as before — no data loss, just a new top layer.
- Typed search (`q=`) is untouched and still searches the full 357-service
  set regardless of group.
- `pnpm --filter mobile typecheck` and `pnpm --filter @doondo/backend
  typecheck` (if a backend change is made) both clean.
