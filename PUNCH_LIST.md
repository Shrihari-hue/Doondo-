# Doondo V2 — Punch List

Updated 2026-10-21. Supersedes the 2026-05-24 version, which predated the
June redesign and the 2026-10-21 commits (d5c2076 → edf1289).

Status legend: `[ ]` to do · `[~]` partial · `[x]` done.

---

## Snapshot

- Backend typecheck: **0 errors**. Mobile: **0 errors once `pnpm install` is run**
  (the only error is the not-yet-installed `expo-camera`).
- Android app ID / iOS bundle ID: **`com.shrihari23.doondov2`** everywhere
  (root `app.json`, `apps/mobile/app.json`, `capture-crash.sh`, push docs).
- Roadmap features: all core + "Later" items built; moonshots built as v1
  except voice biometric ID (provider interface only).

---

## 1. Do next (on your Mac)

- [ ] `pnpm install` at the repo root (adds `expo-camera`, `react-native-android-widget`).
- [ ] Commit the working tree: app-ID change + the Tamil / Telugu / Kannada / Hindi
      locale additions (≈2,300 lines, uncommitted).
- [ ] `git push` — `main` is 6 commits ahead of `origin/main`.
- [ ] Redeploy the backend on Fly (`fly deploy` in `apps/backend`) so the
      always-on machine + new crons (receipt sweep, auction close, escalation,
      worker-absent, payroll-due, Wage Watch) go live.

## 2. Accounts & credentials (no code)

- [ ] **Firebase / FCM** — create project, add Android app `com.shrihari23.doondov2`,
      upload `google-services.json` via `eas credentials`.
- [ ] **Apple** — Developer Program ($99/yr), APNs `.p8` key → `eas credentials`.
- [ ] **Dev build on a real Android phone** (`eas build --profile development
      --platform android`) and run the 8-step checklist in
      `DOONDO_PUSH_NOTIFICATIONS_STATUS.md`.
- [ ] **Masked calling** — set `MASKED_CALL_PROVIDER` (Exotel/Twilio) and wire
      the hook in `apps/backend/src/lib/maskedCall.ts`.
- [ ] **Transactional SMS** — set `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_SMS_FROM`.
- [ ] **AI text** — set `AI_TEXT_PROVIDER` (rejection explainer, coach); falls
      back to templates/mock until then.
- [ ] **Google Maps key** in `apps/mobile/app.json` is committed in plain text —
      restrict it to the app's package + SHA-1 in Google Cloud Console.

## 3. Release verification

- [ ] Native-speaker QA of Tamil / Telugu / Kannada (newly filled) and Hindi.
- [ ] On-device boot against the real MongoDB: offline mode, stay-signed-in,
      app lock, Pulse widget, AR Job View (camera + compass fallback).
- [ ] Run the wallet backfill script once against production (see d5c2076).

## 4. Still open / out of scope

- [~] **Voice biometric identity** — interface only; needs a licensed on-device
      engine (e.g. Picovoice Eagle).
- [~] **Doondo Diaspora** — local-contact SMS only; foreign billing / KYC not built.
- [~] **Pulse widget** — Android only; no iOS widget.
- [ ] Boosts are free during beta — pricing not set.

---

## Done (for reference)

- **2026-10-21 d5c2076** — TS fixes, junk/bug-report zips removed, Fly always-on,
  real workforce data (attendance, leave, end employment, tasks), real payroll
  payments, wallet fix, masked-call routing.
- **51f33fe Push** — enforced per-category prefs, quiet hours, Hindi copy, Expo
  receipts + dead-token pruning, rich chat images, employer applicant / absent /
  payroll alerts.
- **5ee290f Partials** — mentor slots + UPI pay, "Why wasn't I picked?", signed
  Skill Passport QR, seeker open shifts, Coach voice intents, Pulse widget.
- **eb697fe Profile redesign** — §12 questions decided (see spec §13), tab badges,
  320 dp labels, persisted groups, copy pass.
- **151ef5e** — Doondo for Women privacy + peer safety verification, Wage Watch,
  peer cohorts, predictive availability, trade tools.
- **edf1289 Moonshots v1** — Live Job Auction, AR Job View, in-shift coach,
  Diaspora v1, real boosts, real Twilio SMS.
- Earlier: see `FEATURE_STATUS_REPORT.md` (May) and `WHATS_NEW.md`.
