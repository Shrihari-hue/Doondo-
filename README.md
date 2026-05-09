# Doondo V2

Local hiring platform — premium mobile app for iOS and Android, plus its backend.

This is a complete rebuild of Doondo, kept entirely separate from the original codebase. The goal is a stable, premium-feeling app with full feature parity at launch.

## What's in here

```
doondo-v2/
├── apps/
│   ├── mobile/         # Expo + React Native app (iOS + Android)
│   └── backend/        # Express + MongoDB + Socket.IO API
├── packages/
│   ├── tokens/         # Design tokens — single source of visual truth
│   └── shared/         # Shared TypeScript types between mobile and backend
└── package.json        # pnpm workspace root
```

## Stack

- **Mobile**: Expo SDK 51+, React Native, TypeScript, NativeWind v4, Reanimated 3, react-three-fiber + expo-gl, Zustand, React Query
- **Backend**: Node 20+, Express, MongoDB (Mongoose), Socket.IO, Zod, JWT
- **Tooling**: pnpm workspaces, TypeScript, Prettier, ESLint

## Design direction

Jewel-touched warm dark luxe — a five-color system designed to read as a luxury brand:

- **Brick coral** (`#C8533A`) — the hero. Brand recognition preserved from the existing Doondo orange, pulled toward red so it reads as designer, not startup.
- **Deep jade** (`#0E6E54`) — trust, verification, match score, success. Reserved jewel tone.
- **Rich gold-amber** (`#C28C30`) — money, urgent, salary highlights.
- **Champagne gold** (`#B89968`) — RARE accent, reserved for premium moments only: verified profiles, top matches (90+), premium subscribers, story highlights, hire-celebration accents. Restraint is what makes it feel premium.
- **Warm-black canvas** (`#09080B`) — composed, with a hint of cool to keep it from going muddy.

Premium states (verified, top match, premium plan, featured story) get a hairline 0.5px champagne-gold border at 35% opacity instead of the default border. A small detail you barely notice that adds up to luxe.

Light mode is supported as a fallback. Dark is the default.

3D storytelling lives at moments of meaning: role picker on first launch, verification badge reveal, hire celebration, wallet success, SOS pulse, stories parallax.

## Getting started

> Requires Node 20+ and pnpm 9+. Install pnpm with `npm install -g pnpm` if you don't have it.

```bash
# Install all workspace dependencies
pnpm install

# Run mobile + backend together
pnpm dev

# Or run them individually
pnpm dev:mobile
pnpm dev:backend
```

## Phases

The rebuild ships in eight phases. See the task list in Cowork for current state.

1. Foundation — scaffolding, tokens, navigation, auth, role-picker 3D opener, backend skeleton
2. Seeker core loop — profile, nearby jobs, apply, status
3. Employer core loop — business profile, post job, applicant management
4. Communication — chat, notifications, video calls
5. Trust + money — verification, wallet, payouts
6. Growth — training, community, salary insights
7. Safety + admin — SOS, attendance, worker pool, admin
8. Polish + 3D + ship
