/**
 * Notification types — a single in-app notification row. The actual row
 * lives in Postgres (see src/db/schema); this file holds the pure TS
 * types/consts still shared across routes and the service.
 *
 * Every server-initiated event that the user should see in the bell
 * (application status changes, interview scheduling, new messages,
 * ratings received, etc.) gets recorded here. The push notification
 * is fire-and-forget; this is the durable record.
 *
 * Mobile pulls /api/v1/notifications for the feed, and /unread-count
 * for the badge.
 */

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
  'dispute_raised',           // the other party opened a dispute about a hire
  'dispute_update',           // a dispute you're part of got a reply or was closed
  'job_escalated',            // a stalling job was auto-boosted / needs attention
  'reached_home_safe',        // a worker confirmed they got home safely (to circle)
  'profile_viewed',           // an employer viewed this seeker's profile
  'mentor_session_booked',    // a mentee booked one of your open session slots
  'mentor_session_cancelled', // the other side cancelled a booked mentor session
  'cohort_invite',            // someone invited you into a peer cohort
  'cohort_message',           // a new message landed in one of your cohorts
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface PublicNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep-link target — `{ screen: 'JobDetail', params: { jobId: '...' } }`. */
  deeplink: {
    screen: string;
    params?: Record<string, unknown>;
  } | null;
  imageUrl: string | null;
  read: boolean;
  createdAt: string;
}
