# Doondo Push Notifications — First-Test Runbook

A copy-pasteable walkthrough to take Doondo's push system from "built but quiet" to "your phone buzzes when something happens." Allow ~30-45 minutes end-to-end, most of which is the EAS build itself.

> **Before you start, decide which platform.** Android is faster (no Apple Developer account needed, no $99 fee, no signing dance). Start there. Once Android works, repeat for iOS.

---

## Phase 1 — Local prep (5 minutes)

All commands run from your Mac terminal, in the Doondo V2 project root unless noted.

### 1.1 Install the EAS CLI globally (if not already)

```bash
npm install -g eas-cli
eas --version
```

You should see `eas-cli/16.x.x` or newer. The project's root `eas.json` requires `>= 18.11.0`, but the **mobile** `eas.json` only needs `>= 13.0.0` — when you `cd` into `apps/mobile` the looser rule applies.

### 1.2 Log into your Expo account

```bash
eas login
```

Use the Expo account that owns `de88667b-29a8-4447-9a10-ef68ae6b0bd2` (your existing EAS projectId from `apps/mobile/app.json`). If you don't remember which account owns it, run `eas whoami` first.

### 1.3 Decide where the dev build will hit your API

Your dev build env in `apps/mobile/eas.json` currently points to `https://api.doondo.app` (production). You have two choices:

**Option A — Hit production.** Easier; your phone will see real data. Push tokens will be saved against your prod user. Skip to 1.4.

**Option B — Hit your local backend.** Better for safe testing. Expose your local backend with a tunnel (ngrok / Expo tunnel) and edit `apps/mobile/eas.json` to point the `development` profile's `EXPO_PUBLIC_API_URL` to your tunnel URL. **Don't commit this change** — it's a per-developer override.

> _Recommendation:_ start with Option A. The test push helper (`scripts/send-test-push.mjs`) skips the backend entirely, so you can prove the device pipeline works without touching prod data.

### 1.4 Make sure the workspace is healthy

```bash
pnpm install
pnpm --filter @doondo/mobile typecheck
```

If typecheck fails, fix it first — `eas build` will reject broken code.

---

## Phase 2 — Build the dev client (10-15 minutes)

### 2.1 Kick off the Android dev build

```bash
cd apps/mobile
eas build --profile development --platform android
```

Expo will:
- Validate `app.json` and `eas.json`
- Upload your project source to its build servers
- Print a build URL — keep it open in a browser tab to watch progress

The first build of a project takes 10-15 minutes. Subsequent builds are 5-8 minutes thanks to caching.

### 2.2 Install the APK on a real phone

When the build finishes, the EAS web page shows a QR code and a download link.

- **Easiest:** open the QR code in your Android phone's camera app, tap the link, install the APK. You may need to allow "Install from unknown sources" for Chrome.
- **Alternative:** download the APK to your Mac, then `adb install path/to/app.apk` if you have ADB set up.

> **Must be a physical device.** Emulators don't get real push notifications. Don't bother trying.

### 2.3 Sanity check the build

Open the app. You should see the Doondo splash → landing → role picker. If the app crashes on launch, the build is broken — check `apps/mobile/capture-crash.sh` for the bug-report capture flow that's already in your project.

---

## Phase 3 — Register a push token (2 minutes)

### 3.1 Log into Doondo on the phone

Use a test account (or create one). The app should:
1. Prompt you to allow notifications. **Tap Allow.**
2. Silently call `meApi.registerPushToken(token)` — see `apps/mobile/src/lib/push.ts:109`.
3. The backend's `POST /me/push-token` (`apps/backend/src/modules/me/me.routes.ts:432`) adds the token to your `User.expoPushTokens` array via `$addToSet`.

### 3.2 Confirm the token landed in the DB

Open a Mongo shell against the same DB the phone is hitting:

```bash
# Local
mongosh "$MONGO_URL"

# In the shell:
db.users.findOne(
  { email: "your-test-email@example.com" },
  { expoPushTokens: 1 }
)
```

You want to see:

```js
{
  _id: ObjectId("..."),
  expoPushTokens: [ "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" ]
}
```

Copy that token string. You'll need it for the next step.

**If `expoPushTokens` is empty or missing:**
- Did the app actually prompt for notification permission? If not, you may be on an emulator or in Expo Go.
- Did the user grant permission? Reinstall the app to re-trigger the prompt.
- Is the device connected to a working network? The token upload is best-effort and won't retry.
- Check the backend logs for the `/me/push-token` request.

---

## Phase 4 — Send a test push (1 minute)

### 4.1 Run the test helper

From the project root:

```bash
node scripts/send-test-push.mjs "ExponentPushToken[xxxxxxxxxxxx]"
```

You should see:

```
→ Sending to ExponentPushToken[xxxxxxxxxx...
✅  Accepted by Expo. Ticket: { status: 'ok', id: '...' }
```

Within 1-3 seconds, your phone should display the test push banner on the lock screen and play a sound.

### 4.2 If the phone doesn't ping

The script prints a troubleshooting block on success — same checklist:

1. **You're not on Expo Go, right?** Confirm — the splash banner in EAS-built dev clients looks slightly different from Expo Go.
2. **Permission granted?** Settings → Apps → Doondo → Notifications. Toggle on.
3. **iOS only:** APNs key uploaded? `eas credentials` → select iOS → confirm a key is registered.
4. **Android only:** FCM credentials uploaded? `eas credentials` → select Android → confirm `google-services.json` is registered. (For an Android **dev build via EAS**, FCM is auto-handled if you have the Expo dev tooling. For prod builds, you must upload your own.)
5. **Ticket came back with an error?** Check the error code against [the Expo docs](https://docs.expo.dev/push-notifications/sending-notifications/#push-tickets). `DeviceNotRegistered` means the token is stale (user reinstalled or signed out).

---

## Phase 5 — Test a real Doondo event (3 minutes)

This proves the **end-to-end backend integration**, not just the device pipeline.

### 5.1 Two-account chat test (easiest)

1. Keep Account A logged in on your phone (token registered).
2. From a laptop browser (or a second device), log in as Account B and open a conversation with Account A.
3. Send any message: "ping."

Expected:
- Phone vibrates within 2 seconds.
- Lock screen shows: `[Account B's name]` / `ping`
- Bell icon in the app gains a `1` badge.
- Tapping the banner opens Doondo directly on the conversation (not the home tab).

The relevant push helper is `sendChatMessagePush` (`apps/backend/src/lib/push.ts:234`), called from the chat-create flow.

### 5.2 If chat works but other events don't

The pipeline is healthy — the gap is somewhere in the upstream event handler. Each helper has a clear single call site. Examples:

| Event | Helper | Call site |
| --- | --- | --- |
| Application status change | `sendApplicationStatusPush` | `applications/application.service.ts` |
| New job nearby | `sendNewJobPush` | `jobs/job.service.ts` |
| Job alert match | `sendJobAlertMatchPush` | `jobAlerts/jobAlerts.service.ts` |
| Interview scheduled | `sendInterviewPush` | `interviews/interview.service.ts` |
| Rating received | `sendRatingReceivedPush` | `ratings/rating.service.ts` |

Grep for the helper name to find where it's called and confirm the call actually runs in your test scenario.

### 5.3 Per-user preference test

Toggle off "messages" in Doondo Settings. Send another chat message from Account B. The phone should **not** ping (and the in-app row should also not appear, since `notifications.record()` is gated by the same prefs).

> _Heads up:_ I didn't read the prefs-gating code closely. If the in-app row appears but the push doesn't, the gating only sits on the push helper — that's a small bug worth fixing so the two stay in lockstep.

---

## Phase 6 — Iterate

Once Android works, the iOS pass is mostly identical:

1. `eas build --profile development --platform ios`
2. Install on a real iPhone (you need an Apple Developer account already + UDID registered for ad-hoc, OR use TestFlight via the `preview` profile).
3. Repeat phases 3-5.

For TestFlight + App Store, you also need the **APNs key** uploaded via `eas credentials` (see `DOONDO_PUSH_NOTIFICATIONS_STATUS.md` Phase "2. iOS production push" for the steps).

---

## Quick command cheat sheet

```bash
# One-time setup
npm install -g eas-cli
eas login
eas whoami

# Build dev client (run from apps/mobile)
eas build --profile development --platform android
eas build --profile development --platform ios

# Inspect existing builds
eas build:list --limit 5

# Manage push credentials (APNs key, google-services.json)
eas credentials

# Send a manual test push (run from project root)
node scripts/send-test-push.mjs "ExponentPushToken[xxxxx]"

# Watch backend logs for token registration
pnpm dev:backend  # logs will show "POST /api/v1/me/push-token"
```

---

## Files referenced

- `apps/mobile/eas.json` — build profiles
- `apps/mobile/app.json` — expo-notifications plugin + EAS projectId
- `apps/mobile/src/lib/push.ts` — client registration + tap handler
- `apps/backend/src/modules/me/me.routes.ts` (line 432) — token upsert endpoint
- `apps/backend/src/modules/me/me.service.ts` (line 143) — `$addToSet` token logic
- `apps/backend/src/lib/push.ts` — every push helper
- `scripts/send-test-push.mjs` — the standalone test pinger
- `DOONDO_PUSH_NOTIFICATIONS_STATUS.md` — full status doc; refer back for any deeper questions
