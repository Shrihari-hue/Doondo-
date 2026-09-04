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
 * Tasks today (all Postgres-native):
 *   - Morning digest (DIGEST_CRON, default 01:30 UTC = 07:00 IST)
 *   - Ghost sweep (GHOST_SWEEP_CRON, default top of hour, every hour)
 *   - Interview reminders (INTERVIEW_REMINDER_CRON, default every 15 min)
 *   - Shift confirmation (SHIFT_CONFIRM_CRON)
 *   - Offer expiry (OFFER_EXPIRY_CRON)
 *   - Job auto-escalation (ESCALATION_CRON)
 *   - Re-engagement sweep (REENGAGEMENT_CRON, default 03:00 UTC = 08:30 IST)
 *
 * The application-data tasks (ghost sweep, interview reminders, shift
 * confirmation, offer expiry) stay behind `PG_APPLICATION_SCHEDULERS_ENABLED`
 * (default false) — see src/config/env.ts.
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
import { runEscalationSweep } from '@/modules/jobs/escalation.service';
import { runReengagementSweep } from '@/modules/notifications/reengagement.service';
import { runPushReceiptSweep } from './pushReceiptSweep.service';
import { sweepExpiredOffers } from '@/modules/quickWork/quickWorkOffers.service';
import { runScheduledWorkSweep } from '@/modules/quickWork/quickWorkScheduling.service';
import { runWorkerNoShowSweep } from '@/modules/quickWork/quickWorkNoShow.service';

let registered: ScheduledTask[] = [];

/**
 * Register every scheduled task. Idempotent — calling twice removes
 * the previous schedules first (defensive: a hot-reload accidentally
 * double-importing this file wouldn't double-schedule).
 *
 * Call once from src/index.ts AFTER `connectPg()` returns. Don't call it
 * before — tasks query the DB and would fail loudly on first run.
 *
 * Ghost Sweep, Interview Reminders, Offer Expiry, and Shift Confirmation
 * are gated behind `PG_APPLICATION_SCHEDULERS_ENABLED`; the rest register
 * unconditionally whenever their cron expression validates.
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
  const escalationValid = cron.validate(env.ESCALATION_CRON);
  const reengagementValid = cron.validate(env.REENGAGEMENT_CRON);
  const pushReceiptSweepValid = cron.validate(env.PUSH_RECEIPT_SWEEP_CRON);
  const quickWorkSweepValid = cron.validate(env.QUICK_WORK_SWEEP_CRON);
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
  if (!escalationValid) {
    logger.error(
      { cron: env.ESCALATION_CRON },
      'ESCALATION_CRON is not a valid cron expression — job auto-escalation disabled',
    );
  }
  if (!reengagementValid) {
    logger.error(
      { cron: env.REENGAGEMENT_CRON },
      'REENGAGEMENT_CRON is not a valid cron expression — re-engagement disabled',
    );
  }
  if (!pushReceiptSweepValid) {
    logger.error(
      { cron: env.PUSH_RECEIPT_SWEEP_CRON },
      'PUSH_RECEIPT_SWEEP_CRON is not a valid cron expression — dead-token sweep disabled',
    );
  }
  if (!quickWorkSweepValid) {
    logger.error(
      { cron: env.QUICK_WORK_SWEEP_CRON },
      'QUICK_WORK_SWEEP_CRON is not a valid cron expression — Quick Work offer sweep disabled',
    );
  }

  // ─── Morning digest ─────────────────────────────────────────────────────
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

  // ─── Ghost sweep (Postgres-native) ─────────────────────────────────────
  if (env.PG_APPLICATION_SCHEDULERS_ENABLED && ghostValid) {
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
  } else if (!env.PG_APPLICATION_SCHEDULERS_ENABLED) {
    logger.info('scheduler: ghost sweep skipped (PG_APPLICATION_SCHEDULERS_ENABLED=false)');
  }

  // ─── Interview reminder sweep (Postgres-native) ────────────────────────
  if (env.PG_APPLICATION_SCHEDULERS_ENABLED && reminderValid) {
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
  } else if (!env.PG_APPLICATION_SCHEDULERS_ENABLED) {
    logger.info(
      'scheduler: interview reminder sweep skipped (PG_APPLICATION_SCHEDULERS_ENABLED=false)',
    );
  }

  // ─── Night-before shift confirmation sweep (Postgres-native) ───────────
  if (env.PG_APPLICATION_SCHEDULERS_ENABLED && shiftConfirmValid) {
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
  } else if (!env.PG_APPLICATION_SCHEDULERS_ENABLED) {
    logger.info(
      'scheduler: shift confirmation sweep skipped (PG_APPLICATION_SCHEDULERS_ENABLED=false)',
    );
  }

  // ─── Offer expiry sweep (Postgres-native) ──────────────────────────────
  if (env.PG_APPLICATION_SCHEDULERS_ENABLED && offerExpiryValid) {
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
  } else if (!env.PG_APPLICATION_SCHEDULERS_ENABLED) {
    logger.info('scheduler: offer expiry sweep skipped (PG_APPLICATION_SCHEDULERS_ENABLED=false)');
  }

  // ─── Stalling-job auto-escalation sweep ────────────────────────────────
  if (escalationValid) {
    const escalationTask = cron.schedule(
      env.ESCALATION_CRON,
      () => {
        runEscalationSweep().catch((err) => {
          logger.error({ err }, 'escalation sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(escalationTask);
    logger.info(
      { cron: env.ESCALATION_CRON, stallHours: env.ESCALATION_STALL_HOURS },
      'scheduler: job auto-escalation sweep registered',
    );
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

  // ─── Weekly push-receipt sweep (dead-token pruning) ────────────────────
  if (pushReceiptSweepValid) {
    const pushReceiptSweepTask = cron.schedule(
      env.PUSH_RECEIPT_SWEEP_CRON,
      () => {
        runPushReceiptSweep().catch((err) => {
          logger.error({ err }, 'push receipt sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(pushReceiptSweepTask);
    logger.info({ cron: env.PUSH_RECEIPT_SWEEP_CRON }, 'scheduler: push receipt sweep registered');
  }

  // ─── Quick Work offer expiry sweep (Postgres-native) ───────────────────
  // Not gated behind PG_APPLICATION_SCHEDULERS_ENABLED — Quick Work's
  // offer window is ~90s, short enough that leaving stale 'offered' rows
  // around for a Jobs-scale sweep interval would visibly break the
  // "someone else took it" UX. Registers whenever SCHEDULER_ENABLED is on.
  if (quickWorkSweepValid) {
    const quickWorkSweepTask = cron.schedule(
      env.QUICK_WORK_SWEEP_CRON,
      () => {
        sweepExpiredOffers().catch((err) => {
          logger.error({ err }, 'quick work offer sweep run failed');
        });
      },
      {
        timezone: 'UTC',
      },
    );
    registered.push(quickWorkSweepTask);
    logger.info({ cron: env.QUICK_WORK_SWEEP_CRON }, 'scheduler: quick work offer sweep registered');

    // Same cadence, same validated cron — Scheduled Work's matching
    // kickoff + reminder sweep, and the worker no-show sweep, both need
    // the same tight (every-minute-by-default) responsiveness as the
    // offer sweep above, and none of them warrant a separate scheduling
    // system (see quickWorkScheduling.service.ts / quickWorkNoShow.service.ts).
    const scheduledWorkTask = cron.schedule(
      env.QUICK_WORK_SWEEP_CRON,
      () => {
        runScheduledWorkSweep().catch((err) => {
          logger.error({ err }, 'quick work scheduled-work sweep run failed');
        });
      },
      { timezone: 'UTC' },
    );
    registered.push(scheduledWorkTask);
    logger.info({ cron: env.QUICK_WORK_SWEEP_CRON }, 'scheduler: quick work scheduled-work sweep registered');

    const noShowTask = cron.schedule(
      env.QUICK_WORK_SWEEP_CRON,
      () => {
        runWorkerNoShowSweep().catch((err) => {
          logger.error({ err }, 'quick work no-show sweep run failed');
        });
      },
      { timezone: 'UTC' },
    );
    registered.push(noShowTask);
    logger.info({ cron: env.QUICK_WORK_SWEEP_CRON }, 'scheduler: quick work no-show sweep registered');
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
