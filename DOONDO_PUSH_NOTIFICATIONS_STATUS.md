# Doondo — Real-Time Push Notifications: Status & Activation Guide

_Last updated: 2026-05-28_

## TL;DR

**Real-time phone notifications are already built into Doondo V2 — end to end.** The backend has 20+ notification types wired up, the mobile app registers Expo push tokens after login, deep-link tap routing is implemented, and Android channels are configured. The system is essentially complete.

**The reason you may not be seeing notifications on your phone right now is one of three things:**

1. You're testing inside **Expo Go**, which silently disables push as of SDK 53+. Push only lights up in a **development build** or a **production build** made through EAS.
2. You haven't yet generated an **Apple Push Notification (APNs) key** and uploaded it to Expo (required only for iOS production builds).
3. You haven't yet set up a **Firebase project + FCM credentials** for Android (required for production Android builds).

Everything in the code is ready. The remaining work is **infrastructure setup**, not engineering.

---

## What's Already Built

### Mobile client (`apps/mobile`)

| Piece | Where it lives | Status |
| --- | --- | --- |
| `expo-notifications` package | `package.json` (~0.32.0) | Installed |
| Permission prompt | `src/lib/push.ts` → `registerForPushNotifications()` | Done |
| Token fetch + upload to backend | `src/lib/push.ts` → calls `meApi.registerPushToken()` | Done |
| Foreground banner handler | `src/lib/push.ts` → `setupNotificationHandlers()` | Done |
| Android notification channels | `default`, `chat`, `applications` | Done |
| Tap-to-deep-link routing | `src/lib/push.ts` → `attachTapHandler()` | Done (with legacy + new payload support) |
| Cold-boot deep-link handling | `getLastNotificationResponseAsync()` | Done |
| Bell icon in app | `src/components/NotificationsBell.tsx` | Done |
| In-app notifications feed | `src/screens/seeker/NotificationsScreen.tsx` | Done |
| Per-channel preference toggles | `src/api/notificationPrefs.api.ts` | Done |
| Expo config | `app.json` → `expo-notifications` plugin + EAS projectId | Done |

### Backend (`apps/backend`)

The notification engine in `src/lib/push.ts` has **20+ purpose-built helpers**, each one handling the in-app row + the device push together so they can never drift:

- `sendApplicationStatusPush` — viewed / shortlisted / hired / rejected
- `sendInterviewPush` — scheduled / rescheduled / cancelled
- `sendInterviewReminderPush` — 60-min-ahead nudge from the scheduler sweep
- `sendChatMessagePush` — DM arriving, with sender name + photo
- `sendNewJobPush` — fan-out to nearby seekers when a job is posted (batched at 100/request)
- `sendJobAlertMatchPush` — fresh job matched a saved alert
- `sendSkillGapPush` — rejection follow-up with a recommended course
- `sendGhostedPush` — anti-ghost sweep flags an unresponsive employer
- `sendMorningDigestPush` — daily 7am IST round-up
- `sendReengagementPush` — dormant-user win-back
- `sendStreakMilestonePush` — 3/7/14/30-day streak celebration
- `sendReferralBonusPush` — referee got hired, bonus credited
- `sendHiredNearbyPush` — social proof when someone in the area got hired
- `sendSosAlertPush` — Trust Circle / peer responder safety ping
- `sendShiftCheckinPush` — worker check-in/out → notify the other side
- `sendTrustCircleShiftPush` — Trust Circle shift start/end ping
- `sendRatingReceivedPush` — someone rated you
- `sendHireCelebrationPush` — emotional "you got hired" moment
- `sendTrustCircleHirePush` — your circle's "X got hired" update

Supporting infrastructure in place:

- `User.expoPushTokens: string[]` — multi-device per user, deduped via `$addToSet`
- `User.notificationPrefs` — per-category toggles (jobs / applications / messages / ratings / referrals)
- `Notification` mongo model — durable in-app feed with 22 defined kinds, unread index, deep-link payload
- `notifications.record()` — every push call also writes a notification row, so the bell stays in sync even if the device is offline
- Fire-and-forget pattern — push failures never block the originating request
- Posts to `https://exp.host/--/api/v2/push/send` directly (no SDK dep yet)

---

## What's Missing Before Phones Actually Ping

This is the only real work left. It's split into three buckets.

### 1. Stop testing inside Expo Go

The push module already detects this and silently bails:

```ts
const IS_EXPO_GO = Constants.appOwnership === 'expo';
if (IS_EXPO_GO) return null;
```

Push only works in:
- A **development build** built with EAS — `pnpm --filter @doondo/mobile build:android` (or `build:ios`) with the `development` profile, installed on a real device.
- A **TestFlight / internal-test build** — the `preview` EAS profile.
- A **production build** — the `production` EAS profile, submitted to the stores.

To test pushes today, the fastest path is a dev build on Android:

```bash
cd apps/mobile
eas build --profile development --platform android
# install the resulting .apk on a real Android phone (not emulator),
# log in, and the token should register automatically.
```

You can verify the token registered by querying the backend:
```bash
# In a mongo shell against the dev DB:
db.users.findOne({ email: "your@email" }, { expoPushTokens: 1 })
```

Then send a test push from the command line using the Expo CLI:
```bash
npx expo push --to "ExponentPushToken[xxxxx]" \
  --title "Hello from Doondo" \
  --body "If you see this, the pipeline is live."
```

### 2. iOS production push — Apple credentials

For TestFlight / App Store builds, Expo needs an **APNs key** to forward your pushes to Apple's servers. One-time setup:

1. Pay for an **Apple Developer Program** account — $99/year.
2. In Apple Developer Console → Keys → create a new key with **APNs enabled**. Download the `.p8` file (you only get one chance — save it).
3. In your terminal: `eas credentials` → select iOS → upload the `.p8` key. Expo stores it and uses it for every iOS build going forward.

Once that's done, iOS pushes work automatically — no code changes needed.

### 3. Android production push — Firebase / FCM credentials

For Play Store builds, Expo needs an **FCM Server Key**:

1. Go to the [Firebase Console](https://console.firebase.google.com), create a project named `doondo` (or reuse an existing one).
2. Add an Android app with package name `com.doondo.app` (matches `app.json`).
3. Download the `google-services.json` file.
4. In your terminal: `eas credentials` → select Android → upload `google-services.json`. Expo wires it into the next build.

FCM itself is free at Doondo's scale (free tier covers millions of messages/month).

---

## Verification Checklist

Once a dev build is installed on a real phone, walk through these in order. Each one isolates a different layer of the pipeline.

1. **Permission prompt appears on first login.** If not, the user previously denied — clear app storage or reinstall.
2. **Token saved on the user.** Check Mongo: `db.users.findOne({ _id: ... }, { expoPushTokens: 1 })` should return a non-empty array.
3. **Manual push lands.** Use `npx expo push --to "ExponentPushToken[..]"` (above). Phone should ping within ~2 seconds.
4. **Real event push lands.** From a second account, send a chat message to the test account. Both the bell counter and the lock-screen banner should fire.
5. **Tap deep-links correctly.** Tap the banner from the lock screen — Doondo should open directly on the conversation, not the home tab.
6. **Cold-boot tap works.** Fully kill Doondo (swipe from recents), then trigger a push from another account, then tap it. App should launch on the right screen — `attachTapHandler()` reads `getLastNotificationResponseAsync()` for exactly this case.
7. **Android channels respect category mutes.** Long-press a notification → "Turn off Messages" → confirm only chat pings stop while application updates still come through.
8. **Per-user preferences honored.** Toggle off "messages" in Settings → confirm `User.notificationPrefs.messages = false` → confirm no chat push fires for that user.

---

## Known Gaps / Future Work

These are nice-to-haves, not blockers:

- **Expo receipts not yet read** — the backend fires-and-forgets. A future Phase 5 should swap to the official `expo-server-sdk` to read receipts (handles `DeviceNotRegistered` cleanly so we can prune dead tokens).
- **Dead-token pruning** — when a user uninstalls Doondo, their token becomes invalid. Without receipt reading, we keep trying to push to it. Low priority since the Expo Push API just silently drops invalid sends, but it bloats `User.expoPushTokens` arrays over time. A weekly cron that calls Expo's `/getReceipts` endpoint and removes any token that came back `DeviceNotRegistered` would clean this up.
- **Quiet hours / Do Not Disturb** — the only category that should ping at 3am is SOS. A `quietHours: { start, end }` field on `User.notificationPrefs` would let users suppress non-urgent pushes (digest, hired-nearby, streak, re-engagement) overnight. The push fan-out service is the natural place to gate this.
- **Localized push copy** — the user already carries a `locale` field. Push titles/bodies are still English-only. Wrapping the title/body strings in the existing i18n catalogue would close this.
- **Rich pushes with images** — chat pushes carry the sender's `photoUrl` to the in-app row but not to the OS banner. iOS / Android both support image attachments via `mutableContent` and a Notification Service Extension. Worth picking up once core volumes are healthy.
- **Web push (PWA)** — not in scope today; the app is mobile-only.

---

## How To Trigger Every Push Type Manually (Dev Testing Cheat Sheet)

Once you have a dev build installed and you know your token (call it `$T`), you can fire each kind by importing the helper in a Node REPL connected to your dev DB:

```ts
import * as push from './apps/backend/src/lib/push';

await push.sendChatMessagePush({
  recipientId: '<your user id>',
  senderId: '<other user id>',
  body: 'Hi, this is a test.',
  conversationId: 'conv_test',
});
```

Or short-circuit straight to Expo without touching the DB:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H 'Content-Type: application/json' \
  -d "{\"to\":\"$T\",\"title\":\"Test\",\"body\":\"Direct ping\"}"
```

If the curl ping arrives but a helper-triggered push doesn't, the bug is in token registration. If neither arrives, the bug is the build (Expo Go or simulator). If both arrive but the tap doesn't deep-link, the bug is in `attachTapHandler` / `navigateFromExternal`.

---

## Decisions Already Made (Don't Re-Litigate)

These choices are baked into the current code. Flagging so we don't accidentally undo them in a refactor.

- **In-app notification row is the source of truth, push is a courier.** Every push helper calls `notifications.record(...)` first; the device push is best-effort on top. This keeps the bell counter consistent even when phones are offline, batteries are dead, or pushes are throttled.
- **Tokens are stored on the User document, not a separate `DeviceToken` collection.** Simpler, atomic with the user, and the array max stays small (most users have 1-2 devices). Migration to a collection becomes attractive only if we want per-device metadata (last-seen, platform, app version).
- **Server-set `deeplink: { screen, params }` is the preferred payload shape.** Legacy `type:` strings still resolve through a fallback map so queued legacy pushes still route correctly, but new code should always set `deeplink`.
- **Android channels are deliberately few (`default`, `chat`, `applications`).** SDK 54 limits practical channel counts and a separate `safety` channel for SOS would add little value over the existing high-priority defaults. Re-evaluate if user complaints emerge.

---

_Living document — update as the system evolves._
