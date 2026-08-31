/**
 * Doondo color tokens — jewel-touched warm dark luxe.
 *
 * Five-color system designed to read as a luxury brand:
 *
 *   - Brick coral (#C8533A) — the hero. Preserved from existing Doondo brand
 *     but pulled toward red so it reads as designer, not startup.
 *   - Deep jade (#0E6E54) — trust, match, verification, success. Reserved.
 *   - Rich gold-amber (#C28C30) — money, urgent, salary highlights.
 *   - Champagne gold (#B89968) — RARE. Reserved for premium moments only:
 *     verified profiles, top match score, premium subscribers, story highlights,
 *     hire-celebration accents. The gold appears so seldom it stays special.
 *   - Warm-black canvas (#0C0A0E) — composed, not navy, not pure black. A
 *     hint of cool keeps it from going muddy.
 *
 * Premium states get a hairline champagne-gold border (0.5px, 35% opacity)
 * instead of the default border. A small detail you barely notice that adds
 * up to luxe.
 *
 * Three layers:
 *   1. Raw scales (coral, jade, amber, champagne, gray, etc.)
 *   2. Semantic aliases (bg.canvas, text.primary, brand.hero, premium.gold)
 *   3. Component-level conventions (premium.hairline for the gold-border rule)
 *
 * App code should almost always reach for the semantic aliases. Raw scales
 * are for the rare custom moment.
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
  bg: {
    canvas: gray[900], // app background — composed warm-black
    surface: gray[800], // cards, list items
    elevated: gray[750], // modals, sheets, dropdowns
    muted: gray[850], // subtle wells inside surfaces
    inverse: gray[50], // for occasional light surfaces in dark mode
  },
  border: {
    subtle: 'rgba(236, 232, 223, 0.06)',
    default: 'rgba(236, 232, 223, 0.10)',
    strong: 'rgba(236, 232, 223, 0.18)',
    focus: coral[500],
  },
  text: {
    primary: '#ECE8DF', // refined off-white, slightly cooler than pure cream
    secondary: '#9C988F',
    tertiary: '#6E6A63',
    disabled: '#3F3D38',
    inverse: gray[900], // text on light surfaces
    onBrand: '#FFFFFF', // text on coral
    onPremium: '#221A0C', // text on champagne (use rarely, mostly fills are subtle)
  },
  brand: {
    /**
     * Unified theme (post theme-unification pass). Two distinct roles —
     * see THEME_UNIFICATION_PROMPT.md Step 0 for the full rationale:
     *
     *   - `primary` (blue): the ONE big action on a screen — banner/hero
     *     card fills, primary CTA buttons, the logo mark, active/selected
     *     states (active tab, selected toggle pill, selected chip).
     *   - `accent` (coral, same values as the old `hero`): small inline
     *     affordances — links, checkboxes/toggles/switches, focus rings,
     *     small badges and tags. This is the exact treatment the Login
     *     screen already used via the shared `tone="hero"` text component;
     *     that pattern is unchanged, just renamed for clarity.
     *
     * `hero*` is kept as a deprecated alias of `accent*` during the
     * migration so partially-converted screens still compile; it is
     * removed once the audit is complete (see the final-audit stage).
     */
    primary: blue[600],
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
  bg: {
    canvas: gray[50], // warm cream
    surface: gray[0], // white
    elevated: gray[0],
    muted: '#F8F4ED',
    inverse: gray[900],
  },
  border: {
    subtle: 'rgba(11, 10, 7, 0.06)',
    default: 'rgba(11, 10, 7, 0.10)',
    strong: 'rgba(11, 10, 7, 0.18)',
    focus: coral[500],
  },
  text: {
    primary: '#1A1814',
    secondary: '#57534B',
    tertiary: '#767164',
    disabled: '#C4BEB1',
    inverse: gray[50],
    onBrand: '#FFFFFF',
    onPremium: '#221A0C',
  },
  brand: {
    primary: blue[600],
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
 * reference/history but deliberately excluded from `themes` / `ThemeName`
 * — the theme-unification pass (THEME_UNIFICATION_PROMPT.md Step 0)
 * retired the role-based light/dark split. Nothing in the app can
 * select it anymore; `ThemeProvider` only ever resolves to `dark` or
 * `light`, and `SeekerThemeOverride` is now a pass-through.
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
