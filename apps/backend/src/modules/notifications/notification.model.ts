/**
 * Notification — a single in-app notification row.
 *
 * Every server-initiated event that the user should see in the bell
 * (application status changes, interview scheduling, new messages,
 * ratings received, etc.) gets recorded here. The push notification
 * is fire-and-forget; this is the durable record.
 *
 * Mobile pulls /api/v1/notifications for the feed, and /unread-count
 * for the badge.
 *
 * Kinds:
 *   - application_status — your application moved to X
 *   - application_received — new applicant on your job
 *   - interview_scheduled / rescheduled / cancelled
 *   - new_message — someone messaged you
 *   - rating_received — someone rated you
 *   - verification_status — verification approved/rejected
 *   - system — anything else (welcome, etc.)
 */

import { Schema, model, type Model, type HydratedDocument, type Types } from 'mongoose';

export const NOTIFICATION_KINDS = [
  'application_status',
  'application_received',
  'interview_scheduled',
  'interview_rescheduled',
  'interview_cancelled',
  'interview_reminder',
  'new_message',
  'rating_received',
  'verification_status',
  'job_alert_match',
  // Phase 2 (post-MVP):
  'morning_digest',       // daily 7am IST round-up — top jobs + nudge
  'application_ghosted',  // employer hasn't responded after the SLA window
  'skill_gap',            // rejection follow-up: "you were missing X, try this course"
  'doondo_score_changed', // your Doondo Score went up (or down) materially
  'sos_alert',            // a Trust Circle contact or nearby peer triggered SOS
  'shift_checkin',        // you (or your worker) checked in/out of a shift
  'shift_confirmation',   // night-before "confirm you're coming tomorrow" prompt
  'offer_made',           // employer extended a time-boxed offer to a worker
  'offer_resolved',       // worker accepted/declined an offer (to employer)
  'offer_expired',        // a pending offer lapsed (to employer)
  'offer_countered',      // worker countered the wage (to employer)
  'worker_on_the_way',    // hired worker tapped "I'm on my way" (to employer)
  'crew_shift',           // an employer you've worked for posted a crew-first shift
  'shift_backfilled',     // a worker declined; we auto-offered the next candidate
  'streak_milestone',     // crossed an apply/course/shift streak threshold (3/7/14/30)
  'referral_bonus',       // someone you referred got hired; your bonus is credited
  'hired_nearby',         // a worker near you got hired — social proof feed signal
  'reengagement',         // dormant-user win-back nudge — "it's been a while"
  'hire_celebration',     // a worker got hired — celebrate and move to next steps
  'hiring_request',           // an employer invited this worker to apply for a job
  'hiring_request_responded', // a worker accepted/declined the employer's invite
  'employer_interest',        // a worker expressed interest in this employer
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  recipientId: Schema.Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep-link target — `{ screen: 'JobDetail', params: { jobId: '...' } }`. */
  deeplink?: {
    screen: string;
    params?: Record<string, unknown>;
  } | null;
  /** Optional avatar / image URL shown on the row (sender photo, employer logo). */
  imageUrl?: string | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  deeplink: Notification['deeplink'];
  imageUrl: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationMethods {
  toPublicJSON(): PublicNotification;
}

export type NotificationDocument = HydratedDocument<Notification, NotificationMethods>;
type NotificationModelType = Model<Notification, Record<string, never>, NotificationMethods>;

const notificationSchema = new Schema<Notification, NotificationModelType, NotificationMethods>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    deeplink: {
      type: new Schema(
        {
          screen: { type: String, required: true },
          params: { type: Schema.Types.Mixed, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    imageUrl: { type: String, default: null },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

// Main feed query: "my notifications, newest first".
notificationSchema.index({ recipientId: 1, createdAt: -1 });
// Unread-count: same as above but filtered by readAt = null.
notificationSchema.index({ recipientId: 1, readAt: 1 });

notificationSchema.method('toPublicJSON', function (
  this: NotificationDocument,
): PublicNotification {
  return {
    id: (this._id as unknown as Types.ObjectId).toString(),
    kind: this.kind,
    title: this.title,
    body: this.body,
    deeplink: this.deeplink ?? null,
    imageUrl: this.imageUrl ?? null,
    read: this.readAt !== null && this.readAt !== undefined,
    createdAt: this.createdAt.toISOString(),
  };
});

export const NotificationModel = model<Notification, NotificationModelType>(
  'Notification',
  notificationSchema,
);
