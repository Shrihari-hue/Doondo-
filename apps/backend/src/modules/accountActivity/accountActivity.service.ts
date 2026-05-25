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

import { Types } from 'mongoose';
import { inspectRefreshToken } from '@/modules/auth/auth.service';
import { UserModel } from '@/modules/users/user.model';
import { ConversationModel } from '@/modules/chat/conversation.model';
import { HiringRequestModel } from '@/modules/hiringRequests/hiringRequest.model';
import { ApplicationModel } from '@/modules/applications/application.model';

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
async function unreadMessagesFor(
  userId: Types.ObjectId,
  role: string,
): Promise<number> {
  const isEmployer = role === 'employer';
  const field = isEmployer ? 'unreadEmployer' : 'unreadSeeker';
  const match = isEmployer ? { employerId: userId } : { seekerId: userId };
  const rows = await ConversationModel.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return rows[0]?.total ?? 0;
}

/** Count the role-specific "needs a response" items for this account. */
async function pendingActionsFor(
  userId: Types.ObjectId,
  role: string,
): Promise<number> {
  if (role === 'employer') {
    // New applicants the employer hasn't opened yet.
    return ApplicationModel.countDocuments({
      employerId: userId,
      status: 'pending',
    });
  }
  if (role === 'seeker') {
    // Hiring requests still pending — and not lazily expired.
    return HiringRequestModel.countDocuments({
      seekerId: userId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });
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

    const user = await UserModel.findById(inspected.userId)
      .select('role isActive')
      .lean();
    if (!user || !user.isActive) continue;

    const uid = new Types.ObjectId(inspected.userId);
    const [unreadMessages, pendingActions] = await Promise.all([
      unreadMessagesFor(uid, user.role),
      pendingActionsFor(uid, user.role),
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
