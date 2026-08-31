# Doondo — Full-Product Theme & Alignment Unification

Status: **Step 0 decided — see below.** No code has been changed yet.
Proceed straight to Stage 1.

---

## Task

A FULL-PRODUCT visual-consistency pass — theme AND alignment — across every
screen in `apps/mobile`, for BOTH user types (seeker and employer). Not a
sample, not "the important screens" — every single one. A user should be able
to move from role-picker → login → their home tab → any screen deep in either
the seeker or employer tree and never see a color, banner treatment, text
alignment, or button style that looks like it belongs to a different app.

### Scope

- `apps/mobile/src/screens/auth/` (12 screens)
- `apps/mobile/src/screens/seeker/` (72 screens)
- `apps/mobile/src/screens/employer/` (34 screens)
- `apps/mobile/src/components/` (34 shared components — buttons, cards,
  inputs, banners, headers — get these right FIRST since most screens
  compose from them)
- `apps/mobile/src/navigation/` (5 files — tab bars, stack headers)

Do not skip a folder because it "looks fine" from a quick glance — audit all
157 files.

### Context

- `packages/tokens/src/colors.ts` defines two currently-coexisting themes:
  `dark` (warm-black canvas, coral `#C8533A` hero — documented as "the
  hero... preserved from existing Doondo brand") used by the employer side,
  and `seekerLight` (white canvas, royal blue `#2563EB` hero) used by the
  seeker side — its own comment says this split was a deliberate
  accessibility/legibility choice ("a familiar utility app for Karnataka
  workers rather than a luxury product"), not an accident.
- `apps/mobile/src/theme/ThemeProvider.tsx` and `SeekerThemeOverride.tsx` are
  where the role-based theme switch happens.
- On top of that, the auth/gateway screens (`LoginScreen.tsx`,
  `WelcomeScreen.tsx`, and check Signup/RolePicker) hardcode a THIRD raw
  color: they import `blue` directly from `@doondo/tokens` for the banner,
  logo, and primary CTA — bypassing the theme system — while the same
  screens' checkbox and links correctly use `theme.brand.hero` (coral) via a
  shared `tone="hero"` component. That's why one screen currently shows two
  competing accent colors.
- `employer-dashboard.html` and `employer-ui-mockups/` at the repo root are
  static prototype files, not part of the live app (nothing serves or
  imports them) — OUT OF SCOPE, ignore them entirely.

### Step 0 — DECIDED. Read this before touching anything.

Shree reviewed both options and rejected both: not `dark`-only (coral-only),
not `seekerLight`-only (blue-only). The confirmed direction is a **third,
new unified theme** — the exact treatment already visible on the current
Login screen — applied to every screen, both roles:

- **Canvas:** dark, warm-black (`dark.bg.canvas`, `gray[900]` `#0C0A0E`) —
  everywhere, both roles. `seekerLight`'s white canvas is retired.
- **Primary / hero elements** — top banners, primary CTA buttons (e.g. "Sign
  in", "Apply", "Post a job"), the logo mark, selected/active states (active
  tab, selected toggle pill) — use **blue** (the `blue` scale from
  `packages/tokens/src/colors.ts`: `blue[900]` for deep gradients,
  `blue[500]`→`blue[400]` for button gradients, `blue[300]` for
  logo/light-on-dark accents).
- **Secondary / accent elements** — links ("Forgot password?", "Create
  one"), checkboxes/toggles/switches, focus rings, small badges and tags —
  use **coral/orange** (the existing `coral` scale, `coral[500] #C8533A`).
  This is exactly how the Login screen already uses it via the shared
  `tone="hero"` link component — keep that pattern, don't touch it.
- Everything else (body text, surfaces, borders, dividers) stays on the
  existing `dark` theme's semantic tokens (`text.*`, `bg.surface`,
  `border.*`) — unchanged.

**Known tradeoff, acknowledged and accepted:** `seekerLight`'s white canvas
was chosen for outdoor sunlight legibility for the worker audience. This
decision trades that away for one consistent product-wide look. Do not
re-litigate this in execution — it's been raised and decided.

**Implementation note — don't do a blind find/replace on `brand.hero`:**
`theme.brand.hero` (coral) is currently used all over the `dark` theme for
things that are NOT "the big primary action" (e.g. `heroSubtle` as a focused
input's background tint, `border.focus`). Introduce two clear semantic
tokens instead of overloading the existing one:
  - `theme.brand.primary` (new) → the blue scale — banners, primary CTA
    buttons, logo, selected/active states.
  - `theme.brand.accent` (can reuse today's `brand.hero` coral values) →
    links, checkboxes, toggles, focus rings, small badges.
Audit every existing `theme.brand.hero` usage screen-by-screen and route it
to whichever of the two it actually is — a "this screen's one big button"
moment goes to `primary` (blue), a "small inline affordance" moment stays
`accent` (coral). Don't guess in bulk; check what each usage actually renders
as.

---

## Execution order (once the target theme is confirmed)

Run `pnpm --filter mobile typecheck` after each stage before moving to the
next.

### 1. Shared components first (`src/components/`)

Every Button, Card, Banner/Header, Input, Badge, and Modal/Sheet component
must use the confirmed theme's semantic tokens (`theme.brand.hero`,
`theme.bg.*`, `theme.text.*`, `theme.border.*`) — zero hardcoded hex or raw
`blue[...]`/`coral[...]` scale values. Also standardize their internal
alignment here: banner/header titles and icons centered or left-aligned per
one consistent rule (pick one, apply everywhere), button label + icon combos
centered as a group, card padding/margins consistent. This is the
highest-leverage fix since most screens inherit from these.

### 2. Navigation chrome (`src/navigation/`)

Tab bar icon/label alignment, active vs. inactive tab styling, and stack
header title alignment (centered vs. left — pick one and apply to every
stack) must be identical for the seeker tab navigator and the employer tab
navigator — same spacing, same active-state treatment, same icon sizing.

### 3. Auth/gateway screens (12 files)

Remove the hardcoded `blue` scale from `LoginScreen.tsx` / `WelcomeScreen.tsx`
/ any Signup or RolePicker screen — route banner gradient, logo color, and
CTA button through the confirmed theme's `brand.hero`. While here, fix the
Job seeker / Employer role-toggle: the code comments around
`LoginScreen.tsx`'s role-pill logic describe a "bright gradient + glow"
selected state that a real screenshot showed was NOT visibly rendering — port
it to the new hero color and confirm the selected pill is unmistakably
distinct from the unselected one.

### 4. Seeker screens (72 files)

Sweep every file for hardcoded raw color values and misaligned
banners/headers/buttons (off-center titles, buttons not matching the shared
component's padding/height, inconsistent text alignment within cards). Fix
each to use the shared components from step 1 and the confirmed theme
tokens.

### 5. Employer screens (34 files)

Same sweep, same standard, so an employer screen and its equivalent seeker
screen (e.g. both sides' JobDetail, both sides' Chat) are visually twins
apart from the content itself.

### 6. Retire the losing theme

Retire (or repurpose) whichever theme loses per the Step-0 answer, and remove
the role-based branching in `SeekerThemeOverride.tsx` / `ThemeProvider.tsx`
once there's only one theme to serve.

### 7. Google sign-in logomark

Small unrelated brand-compliance note while in this area: the Google sign-in
button renders a plain solid "G" instead of Google's official multi-color
logomark — swap in a real asset if one's cheaply available in
`node_modules`, otherwise flag it rather than faking one.

### 8. Final audit — do not skip this

Grep the whole `apps/mobile/src` tree for any remaining raw hex literals or
`blue[`/`coral[`/`champagne[`/etc. scale references outside the theme files
themselves, and fix every hit. Then produce a short report: which screens
were touched, which shared components anchor the new standard, and 3-4
side-by-side comparisons (one seeker screen next to its employer equivalent,
plus the login screen) confirming identical banner treatment, button style,
text alignment, and accent color. Report this back to Shree explicitly —
don't just say "done."

---

## Scope boundary

This is color/theme + alignment/spacing consistency ONLY. Do not change
navigation structure, add or remove screens, or rewrite business logic. If a
screen's layout seems structurally wrong beyond alignment (not just
"off-center" but "wrong information architecture"), note it instead of
redesigning it.
