# Twilio setup — OTP + WhatsApp for Doondo

This is the operator's guide for the Twilio side of Doondo. The backend code is already in place; you only need to do the Twilio console steps and update `apps/backend/.env`.

## Current state (auto-detected)

- **OTP via Twilio Verify** is fully coded in `apps/backend/src/modules/verification/sms.ts` (provider class: `TwilioVerifyProvider`).
- `apps/backend/.env` is already populated with:
  - `SMS_PROVIDER=twilio`
  - `TWILIO_ACCOUNT_SID=ACbec2e3c9…`
  - `TWILIO_AUTH_TOKEN=32ecef45…`
  - `TWILIO_VERIFY_SERVICE_SID=VAcda84e61…`
- **WhatsApp** is newly coded in `apps/backend/src/modules/whatsapp/` and is **disabled by default** (`TWILIO_WHATSAPP_ENABLED=false`). You'll flip it on after the sandbox is wired up.

So OTP just needs verification that the Verify Service is healthy; WhatsApp needs the console walkthrough below.

---

## Part 1 — Confirm OTP (Twilio Verify) is live

1. **Sign in to Twilio Console**: <https://console.twilio.com>.
2. In the left rail, go to **Verify → Services**.
3. Open the service whose SID matches `VAcda84e6114dda1ec2eda44e96d533ed1` (the one in your `.env`). Confirm:
   - **SMS** channel is enabled.
   - **WhatsApp** channel is enabled too if you want OTP-over-WhatsApp later (cheaper than SMS in India).
   - **Code length** is **6** (matches our `OTP_LENGTH`).
4. While you're in the console, check **Account → General settings**: the Account SID and Auth Token should match what's in `.env`. If they don't, copy the live ones into `.env`.
5. **Trial-account guardrail.** If your Twilio account is still on trial, Verify will only send to numbers listed under **Phone Numbers → Verified Caller IDs**. Add your own test number there before trying a real OTP, otherwise you'll see error `21608` and the user-facing message *"This number isn't verified on the SMS provider yet."*
6. **Test it.** Start your backend with `pnpm dev:backend`, then call:
   ```bash
   curl -X POST http://localhost:4000/api/v1/verification/phone/start \
     -H "Authorization: Bearer <user-access-token>" \
     -H "Content-Type: application/json" \
     -d '{"phone":"+91XXXXXXXXXX"}'
   ```
   The SMS should arrive within ~10 seconds. Then verify:
   ```bash
   curl -X POST http://localhost:4000/api/v1/verification/phone/verify \
     -H "Authorization: Bearer <user-access-token>" \
     -H "Content-Type: application/json" \
     -d '{"phone":"+91XXXXXXXXXX","code":"123456"}'
   ```

If both work, your OTP setup is done. (No code changes were needed — your `.env` was already correct.)

### Notes / caveats

- **Cost.** Verify SMS is ~$0.05 per send in India + carrier fees. Twilio's trial gives ~$15 credit. For volume launch, MSG91 (already coded as a fallback) is roughly 5x cheaper but requires DLT registration.
- **Rate-limits.** We cap to `OTP_SEND_PER_MINUTE=2` per IP, and Verify itself rate-limits per phone (error `60203`). Both are handled in `verification.routes.ts`.
- **Error mapping.** Twilio error codes are mapped to user-facing messages in `sms.ts` (e.g., `60200` → "phone format invalid", `60410` → "can't deliver SMS to this number").

---

## Part 2 — WhatsApp Sandbox (start here)

The sandbox is free, instant, and uses Twilio's shared number `+1 415 523 8886`. Users join your sandbox by sending a join-code from their WhatsApp. **Use this for all dev and early-stage testing.** Production sender comes later (Part 3).

### 2.1 Activate the sandbox

1. In Twilio Console, go to **Messaging → Try it out → Send a WhatsApp message**, or directly to **Messaging → Senders → WhatsApp senders → Sandbox**.
2. Note the **sandbox number** (`+1 415 523 8886`) and your unique **join code** (e.g., `join cat-table`).
3. From your phone's WhatsApp, send `join <your-code>` to that number. You'll get a confirmation back. Anyone who tests your app must join this way first.

### 2.2 Configure the inbound webhook

This is what makes two-way support chat work — when a worker or employer messages your sandbox number, Twilio POSTs the message to your backend.

1. While still in the Sandbox screen, find **"When a message comes in"** and **"Status callback URL"**.
2. You need a public HTTPS URL pointing to your backend. For dev, use ngrok:
   ```bash
   ngrok http 4000
   ```
   Copy the `https://xxxx.ngrok-free.app` URL.
3. Set:
   - **When a message comes in** → `https://xxxx.ngrok-free.app/api/v1/whatsapp/webhook` (HTTP POST)
   - **Status callback URL** → `https://xxxx.ngrok-free.app/api/v1/whatsapp/status` (HTTP POST)
4. Save.

> **Webhook validation in dev:** Twilio signs every request with `X-Twilio-Signature` based on the full URL. With ngrok the URL is unstable, so set `TWILIO_WEBHOOK_VALIDATE=false` in dev to skip validation. **Never** ship to production with this off.

### 2.3 Update `.env`

Open `apps/backend/.env` and add/edit:

```dotenv
TWILIO_WHATSAPP_ENABLED=true
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WEBHOOK_VALIDATE=false   # dev only; set true in staging/prod
```

Restart the backend.

### 2.4 Send your first message

Sandbox lets you send freeform messages without templates (a sandbox-only convenience). Test the admin endpoint:

```bash
curl -X POST http://localhost:4000/api/v1/whatsapp/send-text \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"to":"+91XXXXXXXXXX","body":"Hi from Doondo!"}'
```

You'll get back the Twilio SID:

```json
{ "ok": true, "data": { "sid": "SMxxxxxxxx", "status": "queued", "to": "whatsapp:+91XXXXXXXXXX" }, "requestId": "…" }
```

The phone that joined your sandbox should receive the message within seconds.

### 2.5 Test the inbound flow

Reply to that message from WhatsApp on your phone. Within a few seconds you should see a log line in the backend:

```
{"level":30,"sid":"SMxxxx","from":"whatsapp:+91…","body":"hello","msg":"WhatsApp inbound message"}
```

And it'll be saved in MongoDB under the `whatsappMessages` collection. To read the inbox programmatically:

```bash
curl http://localhost:4000/api/v1/whatsapp/inbox?direction=inbound \
  -H "Authorization: Bearer <admin-access-token>"
```

### 2.6 Sandbox limits — know these

- **24-hour window.** After a user joins, you have a rolling 24h window to send freeform messages. Outside the window, only pre-approved templates (Part 3) work.
- **Users must opt-in.** Each tester sends `join <code>` once. You can't push to anyone who hasn't joined.
- **No persistence after 72h of inactivity.** Sandbox sessions expire; the user re-joins.
- **Twilio's number, not yours.** Messages go from `+1 415 523 8886`, not a branded Doondo number. That's fine for testing, not for launch.

---

## Part 3 — Production WhatsApp Business sender

When you're ready to launch (your sandbox flow works end-to-end), you upgrade to your own branded WhatsApp number. This takes **1–7 business days** and has prerequisites.

### 3.1 Prerequisites

- **Meta (Facebook) Business Manager account.** Create one at <https://business.facebook.com> if you don't have it. Your business must be verifiable (a domain, public phone, address).
- **A phone number** that isn't already on WhatsApp (personal or Business). It can be a Twilio-purchased number or one you own — but if it's currently on WhatsApp, you must delete the existing WhatsApp account on it first.
- **Display name** ready (e.g., "Doondo Hire"). It must follow [Meta's display-name guidelines](https://www.facebook.com/business/help/757569725593362) — no all-caps, no superlatives like "best", must be tied to your brand.

### 3.2 Register the sender in Twilio

1. Console → **Messaging → Senders → WhatsApp senders → Create new sender**.
2. Pick the phone number you'll use. Twilio walks you through:
   - Display-name submission (Meta reviews this).
   - **Two-factor verification PIN** for your WhatsApp Business Account (WABA). Remember this PIN — Meta will ask for it on re-verification.
   - Hosting (Cloud API is the default; recommended).
3. Submit. You'll see status progress: `Submitted → In Review → Online`. **In Review** typically resolves in 1–3 days but can stretch to a week.

### 3.3 Get approved message templates

In production, the **first** message you send to any user (outside the 24h reply window) must be a Meta-approved template. Plan templates now so you're not blocked on launch day. Suggested templates for Doondo:

| Template name | Category | Body |
|---|---|---|
| `doondo_hire_confirmed` | UTILITY | Hi {{1}}, you've been hired for {{2}} at {{3}}. Show this message at the worksite. Reply STOP to opt out. |
| `doondo_new_job_alert` | UTILITY | Hi {{1}}, a {{2}} job has opened {{3}} from you, paying ₹{{4}}. Tap to apply: {{5}} |
| `doondo_interview_reminder` | UTILITY | Hi {{1}}, your interview at {{2}} is in {{3}}. Address: {{4}}. |
| `doondo_otp_login` | AUTHENTICATION | Your Doondo verification code is {{1}}. Don't share this with anyone. |

To create them:

1. Console → **Messaging → Content Editor → Create new**.
2. Pick the channel (WhatsApp) and category (UTILITY for transactional, AUTHENTICATION for OTP).
3. Write the body using `{{1}}`, `{{2}}` placeholders.
4. Submit for Meta approval. Each template review takes ~24h. You can iterate while in review.
5. Once approved, copy the **Content SID** (`HX…`). You pass this to `sendTemplate()` in code.

Example send once approved:

```bash
curl -X POST http://localhost:4000/api/v1/whatsapp/send-template \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+91XXXXXXXXXX",
    "contentSid": "HXabcdef0123456789abcdef0123456789",
    "variables": { "1": "Ravi", "2": "Plumber", "3": "ACME Builders" }
  }'
```

### 3.4 Switch the webhook to the production URL

1. Re-set the inbound webhook + status callback to your production backend URL — e.g., `https://api.doondo.com/api/v1/whatsapp/webhook`. (Fly.io is what you're deployed on per `apps/backend/fly.toml`.)
2. In `.env` on the production environment:
   ```dotenv
   TWILIO_WHATSAPP_ENABLED=true
   TWILIO_WHATSAPP_FROM=whatsapp:+91XXXXXXXXXX   # your approved sender
   TWILIO_WEBHOOK_VALIDATE=true                  # MUST be true in prod
   ```
3. Redeploy: `fly deploy` from `apps/backend/`.

### 3.5 Pricing — set expectations

WhatsApp Business pricing is **per conversation**, not per message. A conversation = a 24-hour window kicked off by a template or a user message. India rates (subject to change):

- **Utility template** (hire confirmed, OTP, reminders): ~₹0.31 per conversation.
- **Marketing template** (promotions): ~₹0.74 per conversation.
- **Service** (user-initiated, you reply within 24h): free up to 1,000/month, then ~₹0.30.

For a 10k-user month doing ~3 utility notifications each: roughly ₹9,000 ($110). Far cheaper than SMS at scale.

---

## Part 4 — Two-way support chat workflow

The plumbing is in. Here's the operational loop:

1. **User messages your WhatsApp** (sandbox or production number).
2. Twilio POSTs to `/api/v1/whatsapp/webhook`. Your backend:
   - Validates the `X-Twilio-Signature`.
   - Persists the message to `whatsappMessages` (direction=`inbound`).
   - Logs it.
3. **Admin reads the inbox** at `GET /api/v1/whatsapp/inbox?direction=inbound&from=+91...`.
4. **Admin replies** via `POST /api/v1/whatsapp/send-text` (inside 24h window) or `POST /api/v1/whatsapp/send-template` (outside).

> The current setup logs to the DB. There's no admin UI yet — for v1 you'd query the inbox via API or build a small admin screen in the mobile app's `apps/mobile/src/admin/` (or a separate web admin). Let me know if you want me to scaffold the admin inbox screen too.

---

## Part 5 — Operational checklist

Before you call this "set up":

- [ ] OTP test send succeeds from `+91` test number (Part 1.6)
- [ ] Sandbox joined, freeform message lands on test phone (Part 2.4)
- [ ] Inbound message from test phone shows up in `whatsappMessages` collection (Part 2.5)
- [ ] `TWILIO_WHATSAPP_ENABLED=true` in `.env`
- [ ] Webhook secret validation works (set `TWILIO_WEBHOOK_VALIDATE=true` and re-test inbound — a hand-crafted curl with no signature should 401)
- [ ] Production sender submitted to Meta (only if launching publicly)
- [ ] At least `doondo_hire_confirmed` template approved (only if launching publicly)

---

## API reference (Doondo backend)

All paths under `/api/v1/whatsapp/`:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/webhook` | Twilio signature | Inbound WhatsApp messages |
| `POST` | `/status` | Twilio signature | Delivery-status callbacks (delivered/read/failed) |
| `POST` | `/send-text` | Bearer + `admin` role | Send freeform message (24h window) |
| `POST` | `/send-template` | Bearer + `admin` role | Send pre-approved template |
| `GET` | `/inbox` | Bearer + `admin` role | List recent messages |

For programmatic notifications from other modules (e.g., `applications.service.ts` when a hire happens), import `sendTemplate` directly:

```ts
import * as whatsapp from '@/modules/whatsapp/whatsapp.service';

await whatsapp.sendTemplate({
  to: hiredWorker.phone,
  contentSid: env.WHATSAPP_TEMPLATE_HIRE_CONFIRMED, // store SIDs in env
  variables: { '1': worker.name, '2': job.title, '3': employer.name },
  userId: hiredWorker.id,
});
```

---

## Troubleshooting cheatsheet

| Symptom | Likely cause | Fix |
|---|---|---|
| OTP `21608` | Trial account, unverified destination | Add the number under Phone Numbers → Verified Caller IDs |
| OTP `60200` | Phone format invalid | Caller didn't pass E.164 (`+91...`) |
| OTP `60203` | Too many sends to that number | Wait 10 min, then retry |
| WA `63007` | WhatsApp not enabled on the from number | Check sandbox is active / sender is Online |
| WA `63016/63018` | Outside 24h window, freeform rejected | Switch to template send |
| WA `63017` | Recipient not on WhatsApp | Skip or fall back to SMS |
| WA `63024` | User hasn't opted in | Sandbox: they must `join <code>`. Prod: get explicit opt-in. |
| Webhook returns 401 | `TWILIO_WEBHOOK_VALIDATE=true` but URL mismatch | Check `X-Forwarded-Host` is being honoured; ngrok URLs change |

---

## Where things live in the code

- `apps/backend/src/modules/verification/sms.ts` — OTP providers (Twilio Verify, MSG91, console)
- `apps/backend/src/modules/verification/verification.routes.ts` — `/verification/phone/start`, `/verify`
- `apps/backend/src/modules/whatsapp/whatsapp.service.ts` — `sendTemplate`, `sendText`, signature validation
- `apps/backend/src/modules/whatsapp/whatsapp.controller.ts` — webhook + admin endpoints
- `apps/backend/src/modules/whatsapp/whatsapp.routes.ts` — routes
- `apps/backend/src/modules/whatsapp/whatsappMessage.model.ts` — message log (Mongo)
- `apps/backend/src/config/env.ts` — env schema (search for `TWILIO_`)
- `apps/backend/.env` — your live secrets (don't commit)
- `apps/backend/.env.example` — documented template (commit this)
