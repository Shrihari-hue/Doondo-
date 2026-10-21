/**
 * UsuallyFree — "Usually free: Sat morning · Wed evening", from the
 * worker's availability history. Self-hides when there isn't enough data.
 */
import { useQuery } from '@tanstack/react-query';
import { Text } from './Text';
import { useTranslate } from '@/i18n/useTranslate';
import { availabilityPredictionApi, type AvailabilityPrediction } from '@/api/availability.api';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function UsuallyFree({ seekerId, self = false }: { seekerId?: string; self?: boolean }) {
  const t = useTranslate();
  const q = useQuery({
    queryKey: ['availability-prediction', self ? 'me' : seekerId],
    queryFn: (): Promise<AvailabilityPrediction | null> =>
      self ? availabilityPredictionApi.mine() : availabilityPredictionApi.forSeeker(seekerId!),
    enabled: self || Boolean(seekerId),
    staleTime: 60 * 60 * 1000,
  });
  const top = q.data?.top ?? [];
  if (top.length === 0) return null;
  const label = top.map((c) => `${t(`usually_free.day.${DAY_KEYS[c.weekday]}`)} ${t(`usually_free.part.${c.part}`)}`).join(' · ');
  return (
    <Text variant="footnote" tone="secondary">
      🕒 {t(self ? 'usually_free.self' : 'usually_free.other', { when: label })}
    </Text>
  );
}
