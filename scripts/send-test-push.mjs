#!/usr/bin/env node
/**
 * send-test-push.mjs
 *
 * Sends a single test push to one or more Expo push tokens. Lets you
 * verify the device → Expo → phone pipeline in isolation, without
 * touching the Doondo backend or DB.
 *
 * Usage:
 *   node scripts/send-test-push.mjs "ExponentPushToken[xxxxx]"
 *   node scripts/send-test-push.mjs "ExponentPushToken[xxxxx]" "Custom title" "Custom body"
 *
 * Optional env vars:
 *   PUSH_TITLE     — overrides the default title
 *   PUSH_BODY      — overrides the default body
 *   PUSH_DEEPLINK  — JSON string, e.g. '{"screen":"JobDetail","params":{"jobId":"abc"}}'
 *
 * Exit codes:
 *   0 — Expo accepted the message (does NOT mean the phone got it)
 *   1 — Bad args or Expo returned a non-2xx
 */

const args = process.argv.slice(2);
const token = args[0];
const titleArg = args[1];
const bodyArg = args[2];

if (!token || !token.startsWith('ExponentPushToken[')) {
  console.error(
    '❌  Usage: node scripts/send-test-push.mjs "ExponentPushToken[xxxxx]" [title] [body]',
  );
  process.exit(1);
}

const title = titleArg ?? process.env.PUSH_TITLE ?? 'Doondo test push';
const body =
  bodyArg ??
  process.env.PUSH_BODY ??
  'If you see this on your phone, the pipeline is live.';

let data = { type: 'test' };
if (process.env.PUSH_DEEPLINK) {
  try {
    data = { ...data, deeplink: JSON.parse(process.env.PUSH_DEEPLINK) };
  } catch {
    console.warn('⚠️  PUSH_DEEPLINK is not valid JSON — ignoring.');
  }
}

const payload = [
  {
    to: token,
    title,
    body,
    sound: 'default',
    channelId: 'default',
    data,
  },
];

console.log(`→ Sending to ${token.slice(0, 32)}...`);
console.log(`  Title: ${title}`);
console.log(`  Body:  ${body}`);

try {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('❌  Expo rejected the request:', res.status, json);
    process.exit(1);
  }

  const ticket = json?.data?.[0];
  if (ticket?.status === 'error') {
    console.error('❌  Ticket error:', ticket);
    console.error(
      ticket?.details?.error === 'DeviceNotRegistered'
        ? '   → The token is stale (user uninstalled / signed out). Prune it from User.expoPushTokens.'
        : '   → See https://docs.expo.dev/push-notifications/sending-notifications/#push-tickets for codes.',
    );
    process.exit(1);
  }

  console.log('✅  Accepted by Expo. Ticket:', ticket);
  console.log('');
  console.log('Note: a successful ticket only means Expo accepted the message.');
  console.log('Delivery is best-effort — check the phone within 5 seconds.');
  console.log('');
  console.log('Troubleshooting if the phone never buzzes:');
  console.log('  1. Confirm you are on a DEV BUILD or PRODUCTION build, not Expo Go.');
  console.log('  2. Confirm push permission is granted (Settings → Doondo → Notifications).');
  console.log('  3. iOS: ensure APNs key is uploaded to Expo (`eas credentials`).');
  console.log('  4. Android: ensure FCM credentials are uploaded to Expo (`eas credentials`).');
  console.log('  5. Check the ticket ID above against /api/v2/push/getReceipts after ~10s.');
} catch (err) {
  console.error('❌  Network or fetch error:', err);
  process.exit(1);
}
