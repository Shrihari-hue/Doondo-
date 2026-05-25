/**
 * useOtherAccountsActivity — activity counts for the worker's *other*
 * on-device accounts, so the account switcher can badge them.
 *
 * Switching accounts is otherwise "blind": a worker on their seeker
 * account can't tell their employer account has new applicants waiting
 * (or vice versa). This hook fetches a lightweight summary for every
 * saved account that isn't the active one.
 *
 * The query is keyed on the set of other account ids and shares its
 * cache across every caller (the profile pill + the switcher sheet), so
 * it fetches once. A 2-minute staleTime keeps it from refetching on
 * every Profile open.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { accountsApi, type AccountActivitySummary } from '@/api/accounts.api';

export interface OtherAccountsActivity {
  /** Per-account summary, keyed by userId. Missing = no data / no activity. */
  byId: Record<string, AccountActivitySummary>;
  /** Combined "things waiting" across every other account. */
  totalOther: number;
}

export function useOtherAccountsActivity(): OtherAccountsActivity {
  const { savedAccounts, activeAccountId } = useAuth();
  const others = savedAccounts.filter((a) => a.userId !== activeAccountId);
  // Sorted so the query key is stable regardless of saved-account order.
  const otherIds = others.map((a) => a.userId).sort();

  const query = useQuery({
    queryKey: ['account-activity', otherIds],
    queryFn: () =>
      accountsApi.activitySummary(others.map((a) => a.refreshToken)),
    enabled: others.length > 0,
    staleTime: 2 * 60_000,
  });

  const summaries = query.data?.summaries ?? [];
  const byId: Record<string, AccountActivitySummary> = {};
  for (const s of summaries) byId[s.userId] = s;
  const totalOther = summaries.reduce((n, s) => n + s.total, 0);

  return { byId, totalOther };
}
