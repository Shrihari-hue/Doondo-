/**
 * Scheduler — owns every cron-driven job in the backend.
 *
 * Design rules:
 *   1. Tasks are short-lived functions. The cron library only calls
 *      them; it doesn't carry per-task state.
 *   2. Tasks must be safe to call concurrently. Cron runs that overlap
 *      (e.g. previous run still in progress when the next tick fires)
 *      should not corrupt state.
 *   3. Tasks log a summary at info level so we can grep run history.
 *   4. The whole module no-ops in test/CI when `SCHEDULER_ENABLED=false`.
 *
 * Tasks today:
 *   - Morning digest (DIGEST_CRON, default 01:30 UTC = 07:00 IST)
 *   - Ghost sweep (GHOST_SWEEP_CRON, default top of hour, every hour)
 *   - Interview reminders (INTERVIEW_REMINDER_CRON, default every 15 min)
 *   - Re-engagement sweep (REENGAGEMENT_CRON, default 03:00 UTC = 08:30 IST)
 *
 * Future tasks slot in here:
 *   - Job expiry / auto-close
 *   - Doondo Score change notifications
 */

import cron, { type ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { runMorningDigest } from '@/modules/notifications/digest.service';
import { runGhostSweep } from '@/modules/applications/ghostSweep.service';
import { runInterviewReminderSweep } from '@/modules/applications/interviewReminders.service';
import { runShiftConfirmationSweep } from '@/modules/applications/shiftConfirmation.service';
import { runOfferExpirySweep } from '@/modules/applications/offerExpiry.service';
import { runReengagementSweep } from '@/modules/notifications/reengagement.service';

let registered: ScheduledTask[] = [];

/**
 * Register every scheduled task. Idempotent — calling twice removes
 * the previous schedules first (defensive: a hot-reload accidentally
 * double-importing this file wouldn't double-schedule).
 *
 * Call once from src/index.ts AFTER `connectDb()` returns. Don't call
 * it before — tasks query the DB and would fail loudly on first run.
 */
export function bootScheduler(): void {
  if (!env.SCHEDULER_ENABLED) {
    logger.info('scheduler disabled by env (SCHEDULER_ENABLED=false)');
    return;
  }

  // If someone calls bootScheduler twice, tear down first.
  if (registered.length > 0) {
    stopScheduler();
  }

  // Validate the cron expressions up front so a typo doesn't silently
  // kill all scheduled work for this deploy.
  const digestValid = cron.validate(env.DIGEST_CRON);
  const ghostValid = cron.validate(env.GHOST_SWEEP_CRON);
  const reminderValid = cron.validate(env.INTERVIEW_REMINDER_CRON);
  const shiftConfirmValid = cron.validate(env.SHIFT_CONFIRM_CRON);
  const offerExpiryValid = cron.validate(env.OFFER_EXPIRY_CRON);
  const reengagementValid = cron.validate(env.REENGAGEMENT_CRON);
  if (!digestValid) {
    logger.error(
      { cron: env.DIGEST_CRON },
      'DIGEST_CRON is not a valid cron expression — digest disabled',
    );
  }
  if (!ghostValid) {
    logger.error(
      { cron: env.GHOST_SWEEP_CRON },
      'GHOST_SWEEP_CRON is not a valid cron expression — sweep disabled',
    );
  }
  if (!reminderValid) {
    logger.error(
      { cron: env.INTERVIEW_REMINDER_CRON },
      'INTERVIEW_REMINDER_CRON is not a valid cron expression — reminders disabled',
    );
  }
  if (!shiftConfirmValid) {
    logger.error(
      { cron: env.SHIFT_CONFIRM_CRON },
      'SHIFT_CONFIRM_CRON is not a valid cron expression — shift confirmation disabled',
    );
  }
  if (!offerExpiryValid) {
    logger.error(
      { cron: env.OFFER_EXPIRY_CRON },
      'OFFER_EXPIRY_CRON is not a valid cron expression — offer expiry disabled',
    );
  }
  if (!reengagementValid) {
    logger.error(
      { cron: env.REENGAGEMENT_CRON },
      'REENGAGEMENT_CRON is not a valid cron expression — re-engagement disabled',
    );
  }

  // ─── Morning digest ────────────────────────────────────────────────────
  if (digestValid) {
    const digestTask = cron.schedule(
      env.DIGEST_CRON,
      () => {
        runMorningDigest().catch((err) => {
          logger.error({ err }, 'morning digest run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(digestTask);
    logger.info({ cron: env.DIGEST_CRON }, 'scheduler: morning digest registered');
  }

  // ─── Ghost sweep ───────────────────────────────────────────────────────
  if (ghostValid) {
    const ghostTask = cron.schedule(
      env.GHOST_SWEEP_CRON,
      () => {
        runGhostSweep().catch((err) => {
          logger.error({ err }, 'ghost sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(ghostTask);
    logger.info(
      { cron: env.GHOST_SWEEP_CRON, slaHours: env.GHOST_SLA_HOURS },
      'scheduler: ghost sweep registered',
    );
  }

  // ─── Interview reminder sweep ──────────────────────────────────────────
  if (reminderValid) {
    const reminderTask = cron.schedule(
      env.INTERVIEW_REMINDER_CRON,
      () => {
        runInterviewReminderSweep().catch((err) => {
          logger.error({ err }, 'interview reminder sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(reminderTask);
    logger.info(
      {
        cron: env.INTERVIEW_REMINDER_CRON,
        leadMinutes: env.INTERVIEW_REMINDER_LEAD_MINUTES,
      },
      'scheduler: interview reminder sweep registered',
    );
  }

  // ─── Night-before shift confirmation sweep ─────────────────────────────
  if (shiftConfirmValid) {
    const shiftConfirmTask = cron.schedule(
      env.SHIFT_CONFIRM_CRON,
      () => {
        runShiftConfirmationSweep().catch((err) => {
          logger.error({ err }, 'shift confirmation sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(shiftConfirmTask);
    logger.info(
      {
        cron: env.SHIFT_CONFIRM_CRON,
        leadHours: env.SHIFT_CONFIRM_LEAD_HOURS,
      },
      'scheduler: shift confirmation sweep registered',
    );
  }

  // ─── Offer expiry sweep ────────────────────────────────────────────────
  if (offerExpiryValid) {
    const offerExpiryTask = cron.schedule(
      env.OFFER_EXPIRY_CRON,
      () => {
        runOfferExpirySweep().catch((err) => {
          logger.error({ err }, 'offer expiry sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(offerExpiryTask);
    logger.info({ cron: env.OFFER_EXPIRY_CRON }, 'scheduler: offer expiry sweep registered');
  }

  // ─── Dormant-user re-engagement sweep ──────────────────────────────────
  if (reengagementValid) {
    const reengagementTask = cron.schedule(
      env.REENGAGEMENT_CRON,
      () => {
        runReengagementSweep().catch((err) => {
          logger.error({ err }, 'reengagement sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(reengagementTask);
    logger.info(
      {
        cron: env.REENGAGEMENT_CRON,
        dormantDays: env.REENGAGEMENT_DORMANT_DAYS,
        cooldownDays: env.REENGAGEMENT_COOLDOWN_DAYS,
        maxAttempts: env.REENGAGEMENT_MAX_ATTEMPTS,
      },
      'scheduler: re-engagement sweep registered',
    );
  }

  logger.info({ tasks: registered.length }, 'scheduler booted');
}

/**
 * Stop all scheduled tasks. Called from the shutdown handler in
 * src/index.ts so we don't leak timers in tests or graceful restarts.
 */
export function stopScheduler(): void {
  for (const task of registered) {
    try {
      task.stop();
    } catch (err) {
      logger.warn({ err }, 'scheduler: task stop failed');
    }
  }
  registered = [];
}
