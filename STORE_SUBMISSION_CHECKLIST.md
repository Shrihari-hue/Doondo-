# Doondo — App Store Submission Checklist

Generated 2026-08-26 from `apps/mobile/app.json` (permissions, bundle IDs) and
`FEATURE_STATUS_REPORT.md` (shipped feature list, audited 2026-05-24).
Legal pages referenced below are live at `/legal/privacy-policy.html` and
`/legal/terms-of-service.html` on the backend host — see
`apps/backend/public/legal/`.

Bundle/package ID (both stores, already consistent): `com.doondo.app`.

---

## 1. Screenshots needed

Content: pull from real screens once a build exists — recommend, in order:
Role picker / hero → Home feed with nearby jobs → Job detail → Chat with
in-line translate → Applications tracker → Doondo Score / Skill Passport →
Hire Celebration → SOS/Trust Circle. Keep the blue/orange brand consistent
across the set; add a one-line caption per shot (Play Store supports this
natively, App Store screenshots can bake captions into the image).

### Google Play

| Asset | Spec | Required? |
| --- | --- | --- |
| Phone screenshots | 2–8 images, JPEG or 24-bit PNG (no alpha), min edge 320px / max edge 3840px, aspect ratio between 16:9 and 9:16 (1080×1920 or 1080×2400 both work) | Required |
| 7" tablet screenshots | Same format rules | Optional — skip unless you want a tablet Play listing |
| 10" tablet screenshots | Same format rules | Optional |
| Feature graphic | 1024×500 PNG/JPEG, no transparency | Required |
| Hi-res icon | 512×512 32-bit PNG, with alpha | Required |
| Promo video | YouTube URL | Optional |

### Apple App Store (App Store Connect)

`ios.supportsTablet: true` is set in `app.json`, so iPad screenshots are
required, not optional.

| Asset | Spec | Required? |
| --- | --- | --- |
| iPhone 6.9" display (iPhone 16 Pro Max class) | 1320×2868 px | Required |
| iPhone 6.5" display | 1284×2778 px | Apple currently auto-generates this from the 6.9" set if you don't supply it separately — confirm at upload time, this changes periodically |
| iPad Pro 13" display | 2064×2752 px | Required (supportsTablet is true) |
| App icon | 1024×1024 PNG, no alpha, no rounded corners (Apple masks it) | Required |

> Apple revises exact required size sets periodically — App Store Connect
> will reject or flag anything stale at upload time, so treat the numbers
> above as the current baseline, not gospel.

---

## 2. Store listing copy (draft)

Pulled only from features marked ✅ shipped in `FEATURE_STATUS_REPORT.md` —
nothing below references a 🟡 partial or ❌ not-started feature.

### Short description (Play Store, 80 chars max)

> Find local work fast — jobs, chat, safety, and pay tracking in one app.

(79 characters)

### App Store subtitle (30 chars max)

> Local jobs, fast & safe

(24 characters)

### Long description (draft)

> **Doondo — hire nearby, get hired nearby.**
>
> Doondo connects workers with local employers in minutes — see your first
> 3 matched jobs before you even finish signing up.
>
> **Find work fast**
> - See real jobs near you in your walking radius
> - Apply in one tap, track every application's status
> - Get a personalized morning digest with fresh jobs and wage trends
> - Voice search — just say what work you're looking for
>
> **Get noticed**
> - Build your profile in one photo — snap a resume or ID and Doondo fills
>   in the rest
> - Show your work with a 30-second video intro (Hire Reels) or a 3D craft
>   showcase
> - Earn a verified Doondo Score from your ratings, hires, and skills
> - See exactly which skill you're missing when an application doesn't work
>   out, plus a course to close the gap
>
> **Work safely**
> - Live shift check-in with selfie + location confirms you were really
>   there
> - SOS alerts your Trust Circle and nearby verified peers instantly
> - Anonymous, structured employer reviews — see what other workers say
>   before you apply
> - An anti-ghosting engine flags employers who go quiet, so you're never
>   left hanging
>
> **Stay in the loop**
> - In-chat auto-translate — message in your language, they read in theirs
> - Voice notes with automatic transcription
> - Interview scheduling with reminders and add-to-calendar
> - Refer a friend and both of you get paid when they land their first shift
>
> **Track your money**
> - Doondo Collect keeps a running ledger of what you've earned and from
>   whom
> - PF/ESI/tax explainer so you know exactly what's yours to claim
>
> Available in English, Hindi, Tamil, Telugu, and Kannada.

### Keywords (App Store, 100 chars, comma-separated, no spaces after commas)

> jobs,daily wage,local work,hire,worker,employer,gig,blue collar,shift,jobs near me

### Category

- **Google Play:** Business
- **Apple App Store:** Business (primary) — Productivity as an optional secondary category

---

## 3. Content rating questionnaire — answers based on `app.json`

Derived from the actual permissions declared (`android.permissions` +
`ios.infoPlist` usage strings) and the actual shipped feature set — not
guessed.

| Question (Google Play IARC / Apple age rating) | Answer | Why |
| --- | --- | --- |
| Violence | None | Not present anywhere in the app |
| Sexual content / nudity | None | Not present |
| Profanity / crude humor | Mild, user-generated only | Chat between users is free text — Doondo doesn't write any profane content itself, but can't fully prevent users from typing it |
| Controlled substances | None | Not present |
| Gambling / contests | None | No auction, lottery, or wagering feature is shipped (#43 Live Job Auction is ❌ not started) |
| User-generated content (UGC) | **Yes** | Chat messages, voice notes, Hire Reels videos, profile photos, employer/worker ratings and reviews |
| Users can communicate with each other | **Yes** | In-app chat (`ConversationScreen`), voice notes |
| Shares user's precise location | **Yes** | `ACCESS_FINE_LOCATION` / `NSLocationWhenInUseUsageDescription` — job matching distance; live location shared with Trust Circle / nearest peers only during an active SOS or shift, and only with contacts the user explicitly chose |
| Collects/shares personal info with other users | **Yes** | Name, profile photo, ratings visible to counterparties; phone number used for OTP, not shown to other users |
| Digital purchases / in-app purchases | **No, today** | `PAYMENT_AGGREGATOR` defaults to `'none'` — Doondo Collect currently simulates collections and payouts; no real money moves through the app yet. **Revisit this answer the moment a real payment aggregator is switched on** — both stores require accurate purchase disclosure and Apple additionally requires In-App Purchase (not an external payment link) for any digital-goods transaction. |
| Access to contacts | **Yes** | `READ_CONTACTS` / `WRITE_CONTACTS` / `NSContactsUsageDescription` — "find friends already on Doondo" + picking Trust Circle safety contacts. Matched via hashed comparison, raw numbers not uploaded in plaintext (already stated in the permission string itself) |
| Camera access | **Yes** | `CAMERA` / `NSCameraUsageDescription` — profile photo, one-photo resume scan, Hire Reels, ID verification selfie |
| Microphone access | **Yes** | `RECORD_AUDIO` / `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` — voice job search, voice notes in chat |
| Shares data with third parties for advertising/tracking | **No** | No ad SDK, no analytics-for-advertising in the codebase; push delivery (Expo), SMS/OTP (Twilio/MSG91), and DB hosting (Supabase) are functional processors, not ad partners |
| Target age group | 18+ | Terms of Service (`apps/backend/public/legal/terms-of-service.html`, §1) requires users to be 18+; the app is a job marketplace, not designed or marketed to minors |

### Apple "App Privacy" nutrition label (App Store Connect)

Map each collected category to Apple's data-type taxonomy — all first-party,
none used for tracking (no cross-app/cross-site identifier is shared with
anyone):

| Apple data type | Collected? | Linked to identity? | Used for tracking? |
| --- | --- | --- | --- |
| Precise Location | Yes | Yes | No |
| Contacts | Yes | Yes (used only for on-device hashed matching) | No |
| User Content (photos, videos, audio, chat) | Yes | Yes | No |
| Identifiers (phone number, device push token) | Yes | Yes | No |
| Financial Info (bank account, IFSC) | Yes | Yes | No |
| Usage Data (applications, ratings, streaks) | Yes | Yes | No |

Since nothing here is used for tracking, `NSUserTrackingUsageDescription`
/ ATT prompt is correctly **absent** from `app.json` — no change needed.

---

## 4. Before you submit — loose ends found during this audit

Not required to fix before submission, but worth knowing:

- **Google Maps API key is committed in plaintext** in `apps/mobile/app.json`
  (`android.config.googleMaps.apiKey`). It's already client-restricted per
  the comment in `apps/backend/src/config/env.ts`, so this is not a live
  secret leak, but confirm in Google Cloud Console that the key's Android
  app restriction (package name + SHA-1 fingerprint) is set to your actual
  release signing certificate before submission — otherwise the map won't
  render in the reviewed build.
- **Push notification production credentials** (Firebase FCM V1 service
  account, Apple APNs `.p8` key) — tracked separately in
  `DOONDO_PUSH_NOTIFICATIONS_STATUS.md`; needed for push to actually reach
  a phone in a store build, not for the review/submission process itself.
- Root-level `app.json` / `app.json.bak` (leftover `com.shrihari23.doondov2`
  scaffold identity, unrelated EAS project) — flagged separately, pending
  your confirmation to delete.
