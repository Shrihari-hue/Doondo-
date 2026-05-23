# Doondo — Craft Showcase Spec

**Version:** 1.1
**Date:** 23 May 2026
**Owner:** Shree
**Audience:** Mobile and backend developers, product designers
**Status:** Phases 1–3 implemented; 4–5 partial; 6 component-ready. Shipped: the skill catalogue, the `workPhotos → CraftPhoto[]` model change, the legacy-data migration, per-photo upload validation, the per-craft collection helpers, and the rebuilt `CraftShowcase` (collection switcher over the parallax carousel) wired into the profile, resume preview and applicant detail. Per-photo skill tagging is live in the Resume Builder. Outstanding: cover-photo selection UI, collection reorder, the employer job-matched default collection, collection-aware discovery thumbnails, and the premium subscription flag — see §12.

---

## 1. Problem

The "3D craft showcase" is described as a parallax portfolio gallery for bakers, mehndi artists, decorators, photographers and tailors — premium subscribers get champagne-gold borders. Three questions have to be answered before it can ship properly on the worker (seeker) side:

1. **Is it a website per worker?** No. It must be one module inside the single worker profile — not a separate site.
2. **Workers are not one trade.** A worker can be an electrician *and* a driver *and* a cook. Most workers carry several skills, and many mix full-time with part-time. The showcase has to handle that without forcing a worker into one identity.
3. **Not every worker is a visual craftsperson.** An accountant, a security guard or a delivery rider has nothing to photograph. A 3D photo gallery is wrong for them. The showcase has to *adapt* — appear for craft skills, stay hidden for the rest.

The current implementation answers none of these. See §2.

---

## 2. What already exists today

| Piece | State | File |
|-------|-------|------|
| `CraftShowcase` component | Built — parallax (translateY / scale / rotate), champagne-gold border on verified photos, `✦` mark, empty-state card | `apps/mobile/src/components/CraftShowcase.tsx` |
| Worker photo storage | `User.workPhotos: string[]` — a **flat array** of up to 6 base64 data URLs, **no skill tag** | `apps/backend/src/modules/users/user.model.ts` |
| Skill list | `User.skills: string[]` — already multi-skill, free-text + curated slugs | same |
| Trade catalogue | `TRADES` — slug + label + emoji + aliases, drives the skills picker | `apps/mobile/src/lib/trades.ts` |
| Showcase rendered on | Profile, Resume preview, Applicant detail | `ProfileScreen.tsx`, `ResumePreviewScreen.tsx`, `ApplicantDetailScreen.tsx` |

**The gap (now closed).** `CraftShowcase` used to take a flat `photos: string[]` with no concept of a *collection*; the `skillLabels` prop was applied with a `pickLabels` helper that cycled skills by array index, so a worker who bakes *and* does mehndi got photos labelled at random. Closing it took two new things: a **skill taxonomy** (which skill gets which kind of proof) and a **tagged photo model** (which photo belongs to which craft).

Both now exist. `User.workPhotos` is `CraftPhoto[]`, `CraftShowcase` takes `photos: CraftPhoto[]` + `skills` and groups them via `buildCollections`, and `skillLabels` / `pickLabels` are gone. The rest of this document is the design of record for that implementation and the still-outstanding work in §12.

---

## 3. Core principle — one profile, many skills

One worker has exactly **one** profile. This is not negotiable and the data model already assumes it (`User` is a 1:1 identity record, and the whole roadmap — Doondo Score, Skill Passport — depends on a single portable reputation). A worker who is an electrician, a driver and a cook does **not** get three profiles. Splitting identity per trade would fragment ratings, the Doondo Score and employer trust.

What differs between workers is **not the profile template** — it is the *set of skills* they carry and how each skill is proven. The profile is therefore a **composition**: a stack of skill blocks, each rendered in the format that suits it. The craft showcase is one of those block types, not the whole profile.

So "how do we differentiate an electrician from an accountant" is the wrong frame. We do not differentiate the *worker*. We classify the *skill*, and the profile composes itself from the classified skills. See §4.

---

## 4. The skill taxonomy

Every skill slug is classified by a **showcase type** — the answer to "how does a worker prove this skill?"

| `showcaseType` | Meaning | Example skills | Renders as |
|----------------|---------|----------------|------------|
| `gallery` | Visual craft — the finished work *is* the proof | baker, mehndi_artist, decorator, photographer, tailor, cook, mason, painter, carpenter, electrician, welder, salon, gardener | The 3D parallax `CraftShowcase` |
| `reel` | Motion craft — better shown in short video | *reserved for the Hire Reels feature (roadmap #35); unused in v1* | A video card |
| `credential` | Non-visual — proven by licence, certificate, skill-test, endorsements, work history | driver, delivery, accountant, security_guard, telecaller, caregiver, data_entry, waiter, cleaner | A plain text credential card |

This taxonomy ships as a pure, static module: `apps/backend/src/modules/skills/skill.catalogue.ts` (delivered alongside this spec). It is modelled on `modules/jobs/womenSafety.ts` — no I/O, unit-testable, safe to call from a serializer or a request path. Each catalogue entry carries `slug`, `label`, `category`, `showcaseType` and a `proofHint` (the one-line prompt shown when a worker adds the skill).

**The default rule.** Any slug not in the catalogue — a free-text skill the worker typed — defaults to `credential`. An unknown skill must never render an empty 3D gallery shell.

**Catalogue sync.** `slug` is the join key between this catalogue and mobile `lib/trades.ts`. The four event-craft slugs the showcase introduces — `baker`, `mehndi_artist`, `decorator`, `photographer` — are **not yet in `trades.ts`** and must be added there (with emoji + aliases) so workers can pick them. Long term, both catalogues should be promoted into `packages/` as a single shared source of truth; for v1 they are kept in step manually.

---

## 5. Data model change — `workPhotos` → `CraftPhoto[]`

The flat `User.workPhotos: string[]` cannot support collections because a photo has no idea which craft it belongs to. It migrates to a tagged shape (defined as `CraftPhoto` in `skill.catalogue.ts`):

```ts
interface CraftPhoto {
  url: string;            // base64 data URL now; CDN URL after Phase 5
  skill: string;          // catalogue slug — which collection this is
  caption?: string | null;
  isCover?: boolean;      // one cover per collection
}
```

So `User.workPhotos` becomes `CraftPhoto[]`.

**Migration.** Existing flat photos have no `skill`. The migration tags every legacy photo with the worker's *first `gallery`-type skill* (or leaves it untagged and prompts the worker to sort them on next visit). Untagged photos render in an "Unsorted" collection until the worker assigns them.

**Upload validation.** The upload endpoint must reject a `CraftPhoto` whose `skill` is not one of the worker's own `gallery`-type skills — otherwise a worker could tag a photo to a craft they do not claim. The existing 6-photo cap stays; revisit raising it once storage moves to a CDN.

---

## 6. Collections — the multi-craft gallery

A worker with two visual crafts (bakes *and* does mehndi) does not get one mixed pile of photos. The gallery is split into **collections — one carousel per craft**, with a collection switcher (a row of chips) above the carousel. The screenshot of "My Portfolio / 3D Gallery" shows the *inside* of one collection ("Chicken Biryani — 1 of 8"); the collection switcher (`Baking · Mehndi`) sits above it.

The pure helper `buildCollections(skills, photos)` (in `skill.catalogue.ts`) produces the render-ready structure: it groups photos by `skill`, keeps only photos tagged to a craft the worker still claims, orders collections by the worker's own skill order (so the worker controls first impressions), and puts the cover photo first in each.

`CraftShowcase` should be extended to accept either a single collection or a `CraftCollection[]` plus the active collection index. The parallax, the gold border and the `✦` are unchanged — only a chip switcher is added on top.

---

## 7. Conditional render rules

The 3D Craft Showcase module is **not** rendered on every profile. The single gate is the pure helper `hasCraftShowcase(skills, photos)`:

- Worker has **≥1 `gallery` skill** *and* **≥1 photo tagged to one of those skills** → render the module.
- Worker has gallery skills but no photos yet → render the existing empty-state card ("Build it now") instead.
- Worker has **no `gallery` skills at all** (a pure accountant, driver, guard) → the module does **not appear**. Their profile leads with credentials, work history and endorsements.

This is what makes the profile *adapt*: a baker's profile leads with the 3D gallery; an accountant's profile never shows an empty 3D frame.

---

## 8. The worker-side flow

1. **Add skills.** The worker picks skills from the catalogue (tap-to-select, autocomplete on `trades.ts`). Multi-select — they can add electrician, driver and cook.
2. **Prompted proof.** For each skill, the app reads its `showcaseType`:
   - `gallery` → show a "Show your work" card with the skill's `proofHint` ("Photos of cakes, breads, and bakes").
   - `credential` → prompt the licence / certificate / skill-test instead.
3. **Upload, tagged.** Each photo the worker uploads is tagged to the skill it belongs to. The worker sets one cover photo per craft.
4. **Profile composes itself.** The profile renders the block stack: a 3D gallery collection per `gallery` skill with photos, a credential card per `credential` skill. The worker's skill order is the block order.
5. **Edit.** The worker can reorder collections, move a photo between collections, or change a cover at any time from Edit profile.

---

## 9. The employer-side flow

- **Applicant detail.** When an employer opens an applicant for a posted job, the showcase **opens on the collection that matches the job's skill** — a cake-decorating job opens the applicant's *Baking* collection first, with other collections one swipe away.
- **Discovery / available workers.** In the "available workers" and applicant list views, the card thumbnail is the **cover photo of the collection relevant to the job or filter** — not a random photo.
- **Verification.** The existing employer photo-verification flow (the champagne-gold "Verified sample" pill) is unchanged; it now operates per photo within a collection.

---

## 10. Full-time / part-time — a separate axis

This is a common point of confusion, so it is stated explicitly: **job-type is not part of the showcase.**

A worker's `preferredJobTypes` (`full_time`, `part_time`, `gig`, `shift`, `contract`) is already a multi-select array on the `User` model. It answers "*on what terms* will you work" — a completely different question from "*what* can you do well" (skills + portfolio).

The two axes are orthogonal: the same baking collection serves a baker whether they want full-time or part-time work. Job-type belongs in the job feed as a filter and on the profile as a small set of chips — never as a portfolio concept. Do not let it leak into the showcase model.

---

## 11. Premium — champagne-gold

The champagne-gold collection border is gated on a subscription flag (e.g. `User.isPremium`, to be added with the subscription work). `CraftShowcase` already uses the champagne palette for verified-photo borders and the `✦` mark; premium simply applies the gold border to the whole collection frame. Free workers get the same parallax and layout with the standard subtle border — the showcase is fully usable without premium; gold is a polish upgrade, not a paywall on the feature.

---

## 12. Build order

| Phase | Work | Effort | Status |
|-------|------|--------|--------|
| 1 | Ship `skill.catalogue.ts`. Add the 4 event-craft slugs to mobile `trades.ts`. | S | ✅ Done |
| 2 | Migrate `User.workPhotos` → `CraftPhoto[]`; legacy-photo tagging migration (`scripts/migrate-craft-photos.ts`); upload validation in the `/me` service. | M | ✅ Done |
| 3 | Rebuild `CraftShowcase` to render per-craft collections with a chip switcher. Wire it into `ProfileScreen`, `ResumePreviewScreen`, `ApplicantDetailScreen`. | M | ✅ Done |
| 4 | Worker upload flow: per-photo skill tagging in the Resume Builder ✅. Still to do: cover-photo selection UI, collection reorder. | M | ◑ Partial |
| 5 | Employer side: collections render on applicant detail ✅. Still to do: open the job-matched collection first; collection-aware thumbnails in discovery. | S–M | ◑ Partial |
| 6 | Premium champagne-gold border. `CraftShowcase` accepts a `premium` prop ✅; still needs a `User.isPremium` subscription flag to drive it. | S | ○ Component-ready |

Run the Phase 2 migration once after deploy: `pnpm --filter @doondo/backend exec tsx src/scripts/migrate-craft-photos.ts`. It is idempotent.

---

## 13. Open questions

1. **Photo cap per collection.** The 6-photo cap is currently per worker. With multiple collections it should probably become per-collection — but that grows the `User` document. Likely resolved by moving photos to CDN storage (Phase 5 of the main roadmap) before raising the cap.
2. **`reel` skills.** `reel` is defined in the taxonomy but unused in v1. When Hire Reels (roadmap #35) ships, decide which skills switch from `gallery`/`credential` to `reel`, or whether a skill can offer both.
3. **Free-text skills.** A worker can type a craft the catalogue does not know (defaults to `credential`, so no gallery). Acceptable for v1; revisit if many workers type real crafts that are missing — that is a signal to extend the catalogue.
4. **Shared catalogue package.** Mobile `trades.ts` and backend `skill.catalogue.ts` are kept in sync by hand. Promote to a `packages/` module before the slug lists drift.
