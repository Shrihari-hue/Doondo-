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

/** Status — informational. */
export const blue = {
  50: '#E6F1FB',
  100: '#C7DAF2',
  300: '#7FA8E0',
  500: '#3D7AC7',
  700: '#1E4F8F',
  900: '#0F2E54',
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
    hero: coral[500],
    heroHover: coral[600],
    heroPressed: coral[700],
    heroSubtle: 'rgba(200, 83, 58, 0.12)',
    heroBorder: 'rgba(200, 83, 58, 0.42)',
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
    hero: coral[500],
    heroHover: coral[600],
    heroPressed: coral[700],
    heroSubtle: coral[50],
    heroBorder: coral[200],
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
  },
  overlay: {
    scrim: 'rgba(11, 10, 7, 0.45)',
    glass: 'rgba(255, 255, 255, 0.78)',
  },
} as const;

export type Theme = typeof dark;
export const themes = { dark, light } as const;
export type ThemeName = keyof typeof themes;
