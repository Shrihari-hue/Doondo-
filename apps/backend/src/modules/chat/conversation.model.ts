/**
 * Conversation types — a 1-on-1 thread between an employer and a seeker,
 * scoped to a job that brought them together. The actual row lives in
 * Postgres (see src/db/schema); this file holds the pure TS types still
 * shared with the service.
 */

export interface PublicConversation {
  id: string;
  employerId: string;
  seekerId: string;
  jobId: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  /** Set per-viewer by the service — count for the current user only. */
  unread: number;
  /** Per-side translation-language overrides (null = app locale). */
  translationLangSeeker: string | null;
  translationLangEmployer: string | null;
  createdAt: string;
}
