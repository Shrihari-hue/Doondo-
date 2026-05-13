/**
 * Rating hooks — fetch ratings for a user (your own profile or someone
 * you're viewing) and list your unrated hires so you can prompt them.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ratingsApi, type CreatePayload } from '@/api/ratings.api';

const userRatingsKey = (userId: string) => ['ratings', 'user', userId] as const;
const UNRATED_KEY = ['ratings', 'unrated'] as const;

export function useUserRatings(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: userRatingsKey(userId ?? ''),
    queryFn: () => ratingsApi.listForUser(userId!),
    enabled: Boolean(userId) && enabled,
    staleTime: 60_000,
  });
}

export function useUnratedApplications() {
  return useQuery({
    queryKey: UNRATED_KEY,
    queryFn: () => ratingsApi.listMyUnrated(),
    staleTime: 30_000,
  });
}

export function useCreateRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePayload) => ratingsApi.create(body),
    onSuccess: (_, body) => {
      // The reviewee's profile ratings just changed. We don't know who
      // that is from the payload (server figures it out from auth), so
      // we invalidate the unrated list and let the next profile view
      // refetch on focus.
      void queryClient.invalidateQueries({ queryKey: UNRATED_KEY });
      void queryClient.invalidateQueries({ queryKey: ['ratings', 'user'] });
      void queryClient.invalidateQueries({
        queryKey: ['applications', 'detail', body.applicationId],
      });
    },
  });
}
