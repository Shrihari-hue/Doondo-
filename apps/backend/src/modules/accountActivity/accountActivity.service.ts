/**
 * Account-activity service — the data behind the account switcher's
 * cross-account badges.
 *
 * A worker who keeps both a seeker and an employer account on one device
 * otherwise switches "blind": no way to know the *other* account has a
 * new chat or a waiting offer without switching into it. This service
 * answers, for each non-active account, "how much is waiting for you
 * there?" so the switcher can show a badge.
 *
 * Ownership is proven by the refresh token of each account, checked
 * read-only via `inspectRefreshToken` — we never rotate or consume it.
 * Only lightweight counts come back; no messages, no PII.
 *
 * Counts, per role:
 *   - unreadMessages  — unread chat messages (both roles)
 *   - pendingActions  — seeker: pending hiring requests still awaiting a
 *                       reply · employer: new (unseen) applicants
 */

import { and, eq, gt, sql } from 'drizzle-orm';
import { inspectRefreshToken } from '@/modules/auth/auth.service';
import { getDb } from '@/db/client';
import { applications, conversations, hiringRequests, users } from '@/db/schema';

export interface AccountActivitySummary {
  userId: string;
  /** Unread chat messages waiting for this account. */
  unreadMessages: number;
  /**
   * Role-specific actions waiting: a seeker's pending hiring requests, or
   * an employer's new (unseen) applicants.
   */
  pendingActions: number;
  /** unreadMessages + pendingActions — the number the badge renders. */
  total: number;
}

/** Sum the unread-message counter on the side this account sits on. */
async function unreadMessagesFor(userId: string, role: string): Promise<number> {
  const isEmployer = role === 'employer';
  const column = isEmployer ? conversations.unreadEmployer : conversations.unreadSeeker;
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${column}), 0)::int` })
    .from(conversations)
    .where(eq(isEmployer ? conversations.employerId : conversations.seekerId, userId));
  return row?.total ?? 0;
}

/** Count the role-specific "needs a response" items for this account. */
async function pendingActionsFor(userId: string, role: string): Promise<number> {
  if (role === 'employer') {
    // New applicants the employer hasn't opened yet.
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.employerId, userId), eq(applications.status, 'pending')));
    return row?.count ?? 0;
  }
  if (role === 'seeker') {
    // Hiring requests still pending — and not lazily expired.
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(hiringRequests)
      .where(
        and(
          eq(hiringRequests.seekerId, userId),
          eq(hiringRequests.status, 'pending'),
          gt(hiringRequests.expiresAt, new Date()),
        ),
      );
    return row?.count ?? 0;
  }
  return 0;
}

/**
 * Resolve activity summaries for a set of accounts identified by their
 * refresh tokens. Tokens that fail the read-only ownership check (forged,
 * revoked, expired) are silently skipped — the caller simply gets no
 * summary for that account.
 */
export async function getActivitySummaries(
  refreshTokens: string[],
): Promise<AccountActivitySummary[]> {
  const out: AccountActivitySummary[] = [];
  const seenTokens = new Set<string>();
  const seenUsers = new Set<string>();

  for (const token of refreshTokens) {
    if (seenTokens.has(token)) continue;
    seenTokens.add(token);

    const inspected = await inspectRefreshToken(token);
    if (!inspected) continue;
    // A user could (in theory) appear twice via two tokens — count once.
    if (seenUsers.has(inspected.userId)) continue;
    seenUsers.add(inspected.userId);

    const [user] = await getDb()
      .select({ role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, inspected.userId))
      .limit(1);
    if (!user || !user.isActive) continue;

    const [unreadMessages, pendingActions] = await Promise.all([
      unreadMessagesFor(inspected.userId, user.role),
      pendingActionsFor(inspected.userId, user.role),
    ]);

    out.push({
      userId: inspected.userId,
      unreadMessages,
      pendingActions,
      total: unreadMessages + pendingActions,
    });
  }

  return out;
}
