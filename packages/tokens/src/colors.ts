/**
 * Doondo color tokens.
 *
 * SOURCE OF TRUTH: the `design/` folder at the repo root (design.md,
 * theme.md, layout.md, components.md) — not this file's history. Per
 * design/theme.md: brand primary is blue (#2563EB light / #60A5FA dark),
 * used everywhere for primary actions, active states, and links. Orange
 * (#F97316, `voice` below) is reserved strictly for the Voice feature —
 * never a general secondary accent. `background.*`/`surface.*`/`text.*`/
 * `border.*`/`brand.primary(Light|Dark)`/`voice`/`success`/`warning`/`error`
 * on `dark` and `light` below are the canonical shape design/theme.md
 * defines; prefer them in new/updated code.
 *
 * The `coral`/`jade`/`amber`/`champagne` raw scales and the `premium`/
 * `status`/non-voice `accent` semantic groups below predate the design/
 * system (an earlier "jewel-toned warm dark luxe" direction) and are kept
 * only because ~150 existing files still reference them — they are being
 * migrated off screen-by-screen (see design-system rollout phases), not a
 * second design language to design new UI against.
 *
 * Three layers:
 *   1. Raw scales (blue is current; coral/jade/amber/champagne are legacy)
 *   2. Semantic aliases — design/theme.md's canonical shape, plus legacy
 *      aliases (bg.canvas, brand.hero-successor accent.*, premium.gold)
 *      kept for not-yet-migrated consumers
 *   3. Component-level conventions (premium.hairline for the gold-border
 *      rule — legacy, not part of design/)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Raw scales
// ─────────────────────────────────────────────────────────────────────────────

/** Brick coral — the brand hero. Pulled toward red for a designer feel. */
export const coral = {
  50: '#FBEEEA',
  100: '#F5CDC0',
  200: '#EDA890',
  300: '#E18465',
  400: '#D66A4E',
  500: '#C8533A', // hero
  600: '#AD4129',
  700: '#8C311C',
  800: '#672213',
  900: '#3F140A',
} as const;

/** Deep jade — trust, verification, match score, success. Reserved jewel tone. */
export const jade = {
  50: '#DDF1EA',
  100: '#A0D7C2',
  200: '#62BC9A',
  300: '#2DA376',
  400: '#168860',
  500: '#0E6E54', // hero
  600: '#0A5A45',
  700: '#074434',
  800: '#052D24',
  900: '#021A14',
} as const;

/** Rich gold-amber — money, urgent, salary, premium-tier indicators. */
export const amber = {
  50: '#F8EDD9',
  100: '#EDC988',
  200: '#E0A744',
  300: '#CC8E27',
  400: '#C28C30', // mid — used for borders + bg accents
  500: '#A87519', // hero
  600: '#8C5F11',
  700: '#6D4709',
  800: '#4D3105',
  900: '#2C1B02',
} as const;

/** Champagne gold — RARE. Premium moments only. The luxury accent. */
export const champagne = {
  50: '#F2EBDC',
  100: '#DCC9A4',
  200: '#C7A87A',
  300: '#B89968', // hero — the champagne tone
  400: '#A48557',
  500: '#8C7045',
  600: '#715A36',
  700: '#564326',
  800: '#3B2D17',
  900: '#221A0C',
} as const;

/** Warm-cool gray — surfaces, borders, body copy. Slight cool hint = composed. */
export const gray = {
  0: '#FFFFFF',
  50: '#F5F2EC', // light-mode canvas — warm cream
  100: '#E5E0D5',
  200: '#C4BEB1',
  300: '#9C9688',
  400: '#767164',
  500: '#57534B',
  600: '#3D3A34',
  700: '#272622',
  750: '#1A1916',
  800: '#131216', // dark-mode surface
  850: '#0E0D11',
  900: '#0C0A0E', // dark-mode canvas — composed warm-black with a faint warmth tilt
  950: '#060509',
} as const;

/** Status — destructive. Success uses jade; warning uses amber. */
export const red = {
  50: '#FCEBEB',
  100: '#F8C9C9',
  300: '#E89999',
  500: '#D75555',
  700: '#9C2828',
  900: '#5C1414',
} as const;

/** Status — informational. Also the seeker theme's hero color (royal blue). */
export const blue = {
  50: '#EFF6FF',
  100: '#DBEAFE',
  200: '#BFDBFE',
  300: '#93C5FD',
  400: '#60A5FA',
  500: '#3B82F6',
  600: '#2563EB', // seeker hero — royal blue
  700: '#1D4ED8',
  800: '#1E40AF',
  900: '#1E3A8A',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Semantic aliases — dark mode (default)
// ─────────────────────────────────────────────────────────────────────────────

export const dark = {
  /**
   * Canonical semantic tokens — design/theme.md §4 (source of truth).
   * `bg.*` below mirrors these exactly for the ~156 files already reading
   * `theme.bg.*`; new/updated code should prefer `background.*`/`surface.*`
   * directly since that's the shape design/theme.md and design/components.md
   * document.
   */
  background: {
    primary: '#090B10',
    secondary: '#0F1219',
    tertiary: '#151A24',
  },
  surface: {
    primary: '#11151D',
    secondary: '#151A24',
    elevated: '#1A202B',
  },
  voice: '#F97316',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  bg: {
    canvas: '#090B10', // = background.primary (design/theme.md §4)
    surface: '#11151D', // = surface.primary
    elevated: '#1A202B', // = surface.elevated
    muted: '#151A24', // = surface.secondary / background.tertiary
    inverse: gray[50], // for occasional light surfaces in dark mode
  },
  border: {
    subtle: 'rgba(236, 232, 223, 0.06)',
    default: '#252B36', // design/theme.md §4 border.default
    strong: '#343C49', // design/theme.md §4 border.strong
    /** design/design.md §12: "Focused → Border: brand.primary". */
    focus: blue[400],
  },
  text: {
    primary: '#F8FAFC', // design/theme.md §4 text.primary
    secondary: '#A1A8B3', // design/theme.md §4 text.secondary
    tertiary: '#737B88', // design/theme.md §4 text.tertiary
    disabled: '#3F3D38',
    inverse: '#0B0F16', // design/theme.md §4 text.inverse
    onBrand: '#FFFFFF', // text on brand.primary
    onPremium: '#221A0C', // text on champagne (use rarely, mostly fills are subtle)
  },
  brand: {
    /**
     * design/theme.md: brand.primary (blue) is THE hero color for every
     * primary action, active/selected state, and link, everywhere, both
     * roles — not one of two competing heroes. `accent` (coral) below is a
     * legacy secondary-accent color from before design/ existed; it is
     * being migrated off screen-by-screen (do not use it in new/updated
     * UI — use `primary` for anything that isn't the Voice feature, which
     * uses `voice` above instead of either of these).
     */
    primary: blue[400], // design/theme.md §4 brand.primary
    primaryLight: blue[300], // design/theme.md §4 brand.primaryLight
    primaryDark: blue[500], // design/theme.md §4 brand.primaryDark
    primaryHover: blue[700],
    primaryPressed: blue[800],
    primarySubtle: 'rgba(37, 99, 235, 0.14)',
    primaryBorder: 'rgba(37, 99, 235, 0.42)',
    /** The exact 2-stop CTA-button gradient used on the Login screen. */
    primaryGradient: [blue[500], blue[400]] as readonly [string, string],
    /** The exact deep-navy 3-stop hero-banner-card gradient from Login. */
    primaryBannerGradient: ['#060B16', '#0D1B33', blue[900]] as readonly [string, string, string],
    /** Full-bleed immersive blue gradient — onboarding slide backgrounds. */
    primaryImmersiveGradient: [blue[700], blue[600], blue[500]] as readonly [string, string, string],
    /** Deep-navy card/modal surface that sits inside the banner family
     *  (the "signing in…" overlay card, info callouts on the banner). */
    primaryCard: '#0D1B33',
    /** Lighter blue for text/icon/logo readability ON the deep-navy
     *  banner or card surfaces above — the banner's own bg is too dark
     *  for the solid `primary` blue to read clearly. */
    primaryOnDark: blue[300],
    /** More saturated than `primaryOnDark` — spinner tints, shadow glows. */
    primaryVivid: blue[400],
    /** Accent counterpart to `primaryVivid` — coral on a dark/vivid context. */
    accentVivid: coral[400],

    accent: coral[500],
    accentHover: coral[600],
    accentPressed: coral[700],
    accentSubtle: 'rgba(200, 83, 58, 0.12)',
    accentBorder: 'rgba(200, 83, 58, 0.42)',
  },
  /**
   * Premium — RARE accent. Use for moments that deserve to feel special:
   *   - Verified profile badge
   *   - Top match score (90+)
   *   - Premium subscriber indicators
   *   - Stories highlights
   *   - Hire-celebration accents
   *   - Featured employer badges
   *
   * If you find yourself reaching for this often, you're probably misusing it.
   * Restraint is what makes it premium.
   */
  premium: {
    gold: champagne[300],
    goldHover: champagne[200],
    goldSubtle: 'rgba(184, 153, 104, 0.10)',
    goldBorder: 'rgba(184, 153, 104, 0.50)',
    /**
     * Hairline border for premium states. Use INSTEAD of the default border
     * on premium cards (verified, top match, premium plan, featured story).
     * 0.5px width, 35% opacity champagne — barely visible up close, adds up
     * across the screen.
     */
    hairline: 'rgba(184, 153, 104, 0.35)',
  },
  status: {
    success: jade[400],
    successSubtle: 'rgba(14, 110, 84, 0.18)',
    successBorder: 'rgba(14, 110, 84, 0.50)',
    warning: amber[200],
    warningSubtle: 'rgba(224, 167, 68, 0.14)',
    warningBorder: 'rgba(224, 167, 68, 0.45)',
    danger: red[500],
    dangerSubtle: 'rgba(215, 85, 85, 0.14)',
    dangerBorder: 'rgba(215, 85, 85, 0.42)',
    info: blue[500],
    infoSubtle: 'rgba(61, 122, 199, 0.14)',
    infoBorder: 'rgba(61, 122, 199, 0.42)',
  },
  accent: {
    jade: jade[400],
    amber: amber[400],
    champagne: champagne[300],
    /** Established Doondo voice-interaction accent — mic FABs on both
     *  the seeker and employer tab bars, VoicePostButton, voice-agent
     *  screens. Not derived from a raw scale (no dedicated orange scale
     *  exists); kept identical across both roles by design. */
    voice: '#F97316',
  },
  /** Glass/overlay tints — used for sheets, modals, blurred surfaces. */
  overlay: {
    scrim: 'rgba(0, 0, 0, 0.58)',
    glass: 'rgba(19, 18, 22, 0.74)',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Semantic aliases — light mode (fallback, opt-in)
// ─────────────────────────────────────────────────────────────────────────────

export const light = {
  /** Canonical semantic tokens — design/theme.md §3 (source of truth). */
  background: {
    primary: '#F7F9FC',
    secondary: '#FFFFFF',
    tertiary: '#EEF3FA',
  },
  surface: {
    primary: '#FFFFFF',
    secondary: '#F3F6FB',
    elevated: '#FFFFFF',
  },
  voice: '#F97316',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#EF4444',

  bg: {
    canvas: '#F7F9FC', // = background.primary (design/theme.md §3)
    surface: '#FFFFFF', // = surface.primary
    elevated: '#FFFFFF', // = surface.elevated
    muted: '#F3F6FB', // = surface.secondary / background.tertiary
    inverse: gray[900],
  },
  border: {
    subtle: 'rgba(11, 10, 7, 0.06)',
    default: '#E2E8F0', // design/theme.md §3 border.default
    strong: '#CBD5E1', // design/theme.md §3 border.strong
    /** design/design.md §12: "Focused → Border: brand.primary". */
    focus: blue[600],
  },
  text: {
    primary: '#111827', // design/theme.md §3 text.primary
    secondary: '#64748B', // design/theme.md §3 text.secondary
    tertiary: '#94A3B8', // design/theme.md §3 text.tertiary
    disabled: '#C4BEB1',
    inverse: '#FFFFFF', // design/theme.md §3 text.inverse
    onBrand: '#FFFFFF',
    onPremium: '#221A0C',
  },
  brand: {
    primary: blue[600], // design/theme.md §3 brand.primary
    primaryLight: blue[500], // design/theme.md §3 brand.primaryLight
    primaryDark: blue[700], // design/theme.md §3 brand.primaryDark
    primaryHover: blue[700],
    primaryPressed: blue[800],
    primarySubtle: blue[50],
    primaryBorder: blue[200],
    primaryGradient: [blue[500], blue[400]] as readonly [string, string],
    primaryBannerGradient: ['#060B16', '#0D1B33', blue[900]] as readonly [string, string, string],
    primaryImmersiveGradient: [blue[700], blue[600], blue[500]] as readonly [string, string, string],
    primaryCard: '#0D1B33',
    primaryOnDark: blue[300],
    primaryVivid: blue[400],
    /** Accent counterpart to `primaryVivid` — coral on a dark/vivid context. */
    accentVivid: coral[400],

    accent: coral[500],
    accentHover: coral[600],
    accentPressed: coral[700],
    accentSubtle: coral[50],
    accentBorder: coral[200],
  },
  premium: {
    gold: champagne[500], // deeper for readability on light
    goldHover: champagne[600],
    goldSubtle: champagne[50],
    goldBorder: champagne[200],
    hairline: champagne[200],
  },
  status: {
    success: jade[600],
    successSubtle: jade[50],
    successBorder: jade[200],
    warning: amber[400],
    warningSubtle: amber[50],
    warningBorder: amber[100],
    danger: red[700],
    dangerSubtle: red[50],
    dangerBorder: red[300],
    info: blue[700],
    infoSubtle: blue[50],
    infoBorder: blue[300],
  },
  accent: {
    jade: jade[600],
    amber: amber[400],
    champagne: champagne[500],
    voice: '#F97316',
  },
  overlay: {
    scrim: 'rgba(11, 10, 7, 0.45)',
    glass: 'rgba(255, 255, 255, 0.78)',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Semantic aliases — seekerLight (Phase 2 redesign)
//
// Bright, accessible, voice-first palette for the worker side of the app.
// Royal blue primary (#2563EB), white surfaces, dark slate text. Designed
// to read as a familiar utility app for Karnataka workers rather than a
// luxury product. The employer side stays on the warm-dark `dark` theme.
//
// Shape matches `dark` and `light` exactly so any component can pick up
// the right tokens automatically; we just swap which theme object is
// passed via ThemeProvider when the seeker tree mounts.
// ─────────────────────────────────────────────────────────────────────────────

export const seekerLight = {
  bg: {
    canvas: '#F5F8FC',   // very soft blue-tinted off-white — less harsh than pure white
    surface: gray[0],     // white cards
    elevated: gray[0],
    muted: '#EEF3FA',
    inverse: '#0F172A',   // slate-900 — for dark overlays/banners
  },
  border: {
    subtle: 'rgba(15, 23, 42, 0.06)',
    default: 'rgba(15, 23, 42, 0.10)',
    strong: 'rgba(15, 23, 42, 0.16)',
    focus: blue[600],
  },
  text: {
    primary: '#0F172A',   // slate-900 — strong, readable
    secondary: '#475569', // slate-600
    tertiary: '#94A3B8',  // slate-400
    disabled: '#CBD5E1',  // slate-300
    inverse: '#FFFFFF',
    onBrand: '#FFFFFF',
    onPremium: '#221A0C',
  },
  brand: {
    primary: blue[600],          // #2563EB
    primaryHover: blue[700],
    primaryPressed: blue[800],
    primarySubtle: blue[50],     // for chip/tag backgrounds
    primaryBorder: blue[200],
    primaryGradient: [blue[500], blue[400]] as readonly [string, string],
    primaryBannerGradient: ['#060B16', '#0D1B33', blue[900]] as readonly [string, string, string],
    primaryImmersiveGradient: [blue[700], blue[600], blue[500]] as readonly [string, string, string],
    primaryCard: '#0D1B33',
    primaryOnDark: blue[300],
    primaryVivid: blue[400],
    /** Accent counterpart to `primaryVivid` — coral on a dark/vivid context. */
    accentVivid: coral[400],

    accent: coral[500],
    accentHover: coral[600],
    accentPressed: coral[700],
    accentSubtle: 'rgba(200, 83, 58, 0.12)',
    accentBorder: 'rgba(200, 83, 58, 0.42)',
  },
  premium: {
    gold: champagne[500],
    goldHover: champagne[600],
    goldSubtle: champagne[50],
    goldBorder: champagne[200],
    hairline: champagne[300],
  },
  status: {
    /** Green check marks on requirements / Verified Worker badge background. */
    success: '#10B981',
    successSubtle: '#D1FAE5',
    successBorder: '#A7F3D0',
    warning: amber[400],
    warningSubtle: amber[50],
    warningBorder: amber[100],
    danger: red[700],
    dangerSubtle: red[50],
    dangerBorder: red[300],
    info: blue[600],
    infoSubtle: blue[50],
    infoBorder: blue[200],
  },
  accent: {
    jade: jade[600],
    amber: amber[400],
    champagne: champagne[500],
    voice: '#F97316',
  },
  overlay: {
    scrim: 'rgba(15, 23, 42, 0.45)',
    glass: 'rgba(255, 255, 255, 0.86)',
  },
} as const;

export type Theme = typeof dark;
/**
 * `seekerLight` (defined above) is kept as a standalone export for
 * reference/history but deliberately excluded from `themes` / `ThemeName`.
 * design/ (the single source of truth — see design/theme.md) specifies one
 * theme with System/Light/Dark modes for the whole product, not a
 * role-based split. Nothing in the app can select `seekerLight` anymore;
 * `ThemeProvider` only ever resolves to `dark` or `light` (System mode
 * picks between them via the OS appearance), and `SeekerThemeOverride` is
 * now a pass-through.
 */
export const themes = { dark, light } as const;
export type ThemeName = keyof typeof themes;

/**
 * Category illustration colors — the 5 colorful job category tiles on
 * the seeker home screen. Pulled out as their own palette because they
 * intentionally sit OUTSIDE the brand-blue system and add visual variety.
 *
 * Use only on the home categories row; do not propagate to other UI.
 */
export const categoryTints = {
  delivery: { bg: '#FFEDD5', fg: '#EA580C' }, // orange
  driver:   { bg: '#DBEAFE', fg: '#2563EB' }, // blue
  electrician: { bg: '#FEF3C7', fg: '#D97706' }, // amber
  helper:   { bg: '#E0E7FF', fg: '#4F46E5' }, // indigo
  mason:    { bg: '#FCE7F3', fg: '#DB2777' }, // pink
} as const;
