// Tailwind config for the Doondo mobile app.
//
// This file bridges @doondo/tokens into Tailwind utilities so we can write
// `bg-canvas`, `text-primary`, `border-hairline` in components instead of
// reaching into the theme object every time.
//
// Naming convention:
//   - Raw scales:        coral-500, jade-400, amber-200, champagne-300
//   - Semantic surfaces: canvas, surface, elevated, muted
//   - Semantic text:     primary, secondary, tertiary
//   - Brand:             hero
//   - Premium:           gold, hairline
//   - Status:            success, warning, danger, info
//
// Note: NativeWind v4 only exposes utilities for the colors we declare here.
// If you need a one-off tint, use the raw scale (e.g. `bg-coral-300`).

const tokens = require('@doondo/tokens');

const dark = tokens.dark;

// Build a fontSize map that matches our tokens, paired with line heights.
const fontSize = Object.fromEntries(
  Object.entries(tokens.fontSize).map(([key, size]) => [
    key,
    [`${size}px`, { lineHeight: `${Math.round(size * tokens.lineHeight[key])}px` }],
  ]),
);

module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Raw scales
        coral: tokens.coral,
        jade: tokens.jade,
        amber: tokens.amber,
        champagne: tokens.champagne,
        gray: tokens.gray,

        // Semantic surfaces
        canvas: dark.bg.canvas,
        surface: dark.bg.surface,
        elevated: dark.bg.elevated,
        muted: dark.bg.muted,

        // Semantic text
        primary: dark.text.primary,
        secondary: dark.text.secondary,
        tertiary: dark.text.tertiary,

        // Brand + premium + status
        hero: dark.brand.hero,
        gold: dark.premium.gold,
        success: dark.status.success,
        warning: dark.status.warning,
        danger: dark.status.danger,
        info: dark.status.info,
      },
      borderColor: {
        hairline: dark.premium.hairline,
        default: dark.border.default,
        subtle: dark.border.subtle,
        strong: dark.border.strong,
      },
      fontFamily: {
        sans: [tokens.fontFamily.sans, 'System'],
        display: [tokens.fontFamily.display, 'System'],
        mono: [tokens.fontFamily.mono, 'Courier'],
      },
      fontSize,
      spacing: tokens.spacing,
      borderRadius: tokens.radii,
    },
  },
  plugins: [],
};
