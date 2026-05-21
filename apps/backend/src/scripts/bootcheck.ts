/**
 * bootcheck — offline smoke test for the backend.
 *
 * Verifies the things `tsc` can't:
 *   1. The scheduler + every new service + every new model imports
 *      without throwing — catches import cycles, bad path aliases,
 *      and any top-level code that blows up at load time.
 *   2. The scheduler's three cron expressions are valid.
 *   3. The pure runtime helpers behave (streak dates, skill-gap diff,
 *      course ranking, profile extraction via the mock provider).
 *
 * What it does NOT do:
 *   - Connect to MongoDB or listen on a port — it's a "would this
 *     boot?" check, runnable with just Node, no DB, no network.
 *   - Import the auth path (`buildApp` / `routes/v1`). That graph
 *     pulls `bcrypt`, a NATIVE module whose binary is platform-
 *     specific. In a dev sandbox running a different OS than the
 *     one `node_modules` was installed on, bcrypt fails to load —
 *     an environment artifact, not a code defect. On the real
 *     deploy (where `pnpm install` runs on the target platform)
 *     it loads fine, and the auth code already passes `tsc`.
 *
 * Run:  tsx src/scripts/bootcheck.ts        (deps on the same platform)
 *   or: compile + `node dist/scripts/bootcheck.js` with NODE_PATH set.
 *
 * Exits 0 on success, 1 on the first failure.
 */

import './env-loader';

let failures = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  PASS  ${name}`);
    })
    .catch((err: unknown) => {
      failures++;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${err instanceof Error ? err.message : String(err)}`);
    });
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  console.log('\nbootcheck — offline backend smoke test\n');

  // ─── 1. Module graph loads ────────────────────────────────────────────
  console.log('module graph:');
  await check('config/env', async () => {
    const { env } = await import('@/config/env');
    assert(typeof env.PORT === 'number', 'env.PORT missing');
  });
  await check('scheduler imports', async () => {
    await import('@/modules/scheduler');
  });
  await check('all new services import', async () => {
    await Promise.all([
      import('@/modules/applications/skillGap.service'),
      import('@/modules/applications/ghostSweep.service'),
      import('@/modules/applications/interviewReminders.service'),
      import('@/modules/applications/shiftCheckIn.service'),
      import('@/modules/applications/hiredNearby.service'),
      import('@/modules/users/doondoScore.service'),
      import('@/modules/users/streaks.service'),
      import('@/modules/notifications/digest.service'),
      import('@/modules/notifications/reengagement.service'),
      import('@/modules/me/pulse.service'),
      import('@/modules/me/skillPassport.service'),
      import('@/modules/transcription/transcription.service'),
      import('@/modules/sos/sos.service'),
      import('@/modules/profileExtract/profileExtract.service'),
      import('@/lib/push'),
    ]);
  });
  await check('all new models register', async () => {
    await Promise.all([
      import('@/modules/sos/sosAlert.model'),
      import('@/modules/applications/shiftCheckIn.model'),
      import('@/modules/users/user.model'),
      import('@/modules/applications/application.model'),
      import('@/modules/notifications/notification.model'),
      import('@/modules/chat/message.model'),
      import('@/modules/jobs/job.model'),
    ]);
  });

  // ─── 2. Cron expressions valid ───────────────────────────────────────
  console.log('\nscheduler:');
  await check('all 4 cron expressions are valid', async () => {
    // `validate` is a named export on node-cron — reach it off the
    // namespace directly, no default-interop juggling needed.
    const cron = await import('node-cron');
    const { env } = await import('@/config/env');
    for (const [name, expr] of [
      ['DIGEST_CRON', env.DIGEST_CRON],
      ['GHOST_SWEEP_CRON', env.GHOST_SWEEP_CRON],
      ['INTERVIEW_REMINDER_CRON', env.INTERVIEW_REMINDER_CRON],
      ['REENGAGEMENT_CRON', env.REENGAGEMENT_CRON],
    ] as const) {
      assert(cron.validate(expr), `${name} is not a valid cron expression: "${expr}"`);
    }
  });

  // ─── 3. Pure runtime helpers ─────────────────────────────────────────
  console.log('\npure helpers:');
  await check('streaks.istDateString → YYYY-MM-DD', async () => {
    const { istDateString } = await import('@/modules/users/streaks.service');
    const s = istDateString(new Date('2026-05-20T18:00:00Z'));
    assert(/^\d{4}-\d{2}-\d{2}$/.test(s), `bad date string: ${s}`);
  });
  await check('skillGap.diffSkills computes the missing set', async () => {
    const { diffSkills } = await import('@/modules/applications/skillGap.service');
    const missing = diffSkills(
      ['Cooking', 'customer_service', 'billing'],
      ['cooking', 'BILLING'],
    );
    assert(
      missing.length === 1 && missing[0] === 'customer_service',
      `expected ['customer_service'], got ${JSON.stringify(missing)}`,
    );
  });
  await check('skillGap.rankCoursesForGap returns ranked courses', async () => {
    const { rankCoursesForGap } = await import('@/modules/applications/skillGap.service');
    const ranked = rankCoursesForGap(['customer_service'], null);
    assert(Array.isArray(ranked), 'not an array');
    assert(ranked.length > 0, 'expected at least one ranked course');
  });
  await check('profileExtract (mock provider) returns a profile', async () => {
    const { extractProfileFromPhoto } = await import(
      '@/modules/profileExtract/profileExtract.service'
    );
    const result = await extractProfileFromPhoto({
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    assert(Array.isArray(result.skills), 'skills not an array');
    assert(
      ['high', 'medium', 'low'].includes(result.confidence),
      `bad confidence: ${result.confidence}`,
    );
  });
  await check('doondoScore service exposes computeForUser', async () => {
    const mod = await import('@/modules/users/doondoScore.service');
    assert(typeof mod.computeForUser === 'function', 'computeForUser missing');
  });
  await check('skillPassport.annotateSkills marks verified skills', async () => {
    const { annotateSkills } = await import('@/modules/me/skillPassport.service');
    const annotated = annotateSkills(
      ['electrician', 'cook', 'mason'],
      ['electrician', 'electrician'],
      ['cook'],
    );
    const bySlug = new Map(annotated.map((s) => [s.slug, s]));
    const elec = bySlug.get('electrician')!;
    const cook = bySlug.get('cook')!;
    const mason = bySlug.get('mason')!;
    assert(
      elec.endorsementCount === 2 && elec.verified,
      'electrician should be verified with 2 endorsements',
    );
    assert(cook.tested && cook.verified, 'cook should be verified via the test');
    assert(!mason.verified, 'mason should be unverified');
  });
  await check('transcription mock provider returns text', async () => {
    const { transcribeAudio } = await import(
      '@/modules/transcription/transcription.service'
    );
    const result = await transcribeAudio({
      dataUrl: 'data:audio/m4a;base64,AAAA',
      mimeType: 'audio/m4a',
    });
    assert(result.provider === 'mock', `expected mock provider, got ${result.provider}`);
    assert(
      typeof result.text === 'string' && result.text.trim().length > 0,
      'mock transcript should be a non-empty string',
    );
  });
  await check('pulse.pickPulseNudge walks the onboarding ladder', async () => {
    const { pickPulseNudge } = await import('@/modules/me/pulse.service');
    const unverified = pickPulseNudge({
      isVerified: false,
      hasResume: false,
      hasWorkHistory: false,
      hasAvailability: false,
      skillCount: 0,
    });
    assert(unverified.action === 'verify', `expected verify, got ${unverified.action}`);
    const noProfile = pickPulseNudge({
      isVerified: true,
      hasResume: false,
      hasWorkHistory: false,
      hasAvailability: false,
      skillCount: 0,
    });
    assert(
      noProfile.action === 'build_profile',
      `expected build_profile, got ${noProfile.action}`,
    );
    const fullySetUp = pickPulseNudge({
      isVerified: true,
      hasResume: true,
      hasWorkHistory: true,
      hasAvailability: true,
      skillCount: 3,
    });
    assert(
      fullySetUp.action === 'explore_jobs',
      `expected explore_jobs, got ${fullySetUp.action}`,
    );
    assert(
      unverified.key.startsWith('pulse.nudge.'),
      `nudge key should be an i18n path, got ${unverified.key}`,
    );
  });
  await check('reengagement.buildReengagementBody varies by role + count', async () => {
    const { buildReengagementBody } = await import(
      '@/modules/notifications/reengagement.service'
    );
    const seekerWith = buildReengagementBody('seeker', 5);
    const seekerZero = buildReengagementBody('seeker', 0);
    const employerWith = buildReengagementBody('employer', 3);
    const seekerOne = buildReengagementBody('seeker', 1);
    assert(seekerWith.body.includes('5'), 'seeker body should name the count');
    assert(seekerOne.body.includes('1 new job'), 'count of 1 should be singular');
    assert(!/\b0\b/.test(seekerZero.body), 'zero-count body should not show "0"');
    assert(
      employerWith.body.toLowerCase().includes('worker'),
      'employer body should talk about workers',
    );
    assert(
      seekerWith.title.length > 0 && employerWith.title.length > 0,
      'titles must be non-empty',
    );
  });

  // ─── Result ──────────────────────────────────────────────────────────
  console.log('');
  if (failures > 0) {
    console.error(`bootcheck FAILED — ${failures} check(s) failed.\n`);
    process.exit(1);
  }
  console.log('bootcheck PASSED — the app graph loads and the helpers behave.\n');
  process.exit(0);
}

void main();
