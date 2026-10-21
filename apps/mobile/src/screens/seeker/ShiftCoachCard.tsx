/**
 * ShiftCoachCard — "Ask Coach" while checked in to a shift. Type or speak
 * a quick question; the answer is shown and read aloud. Emergencies are
 * routed to SOS instead of being coached.
 */
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, radii } from '@doondo/tokens';
import { Text, Card, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';
import { haptic } from '@/lib/haptics';
import { shiftCheckInApi } from '@/api/shiftCheckIn.api';
import { shiftCoachApi, type CoachAnswer } from '@/api/shiftCoach.api';
import type { AppStackParamList } from '@/navigation/types';

const SPEECH_LANG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN' };

export function ShiftCoachCard({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { locale } = useLocale();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<CoachAnswer | null>(null);

  const checkIns = useQuery({
    queryKey: ['check-ins', applicationId],
    queryFn: () => shiftCheckInApi.list(applicationId).then((r) => r.checkIns),
    refetchInterval: 60_000,
  });
  const latest = [...(checkIns.data ?? [])].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  const onShift = latest?.kind === 'check_in' && Date.now() - new Date(latest.timestamp).getTime() < 16 * 3600 * 1000;

  const ask = useMutation({
    mutationFn: () => shiftCoachApi.ask(applicationId, q.trim()),
    onSuccess: (a) => {
      haptic(a.emergency ? 'warning' : 'success');
      setAnswer(a);
      Speech.stop();
      Speech.speak(a.answer, { language: SPEECH_LANG[locale] ?? 'en-IN' });
    },
    onError: (e) => Alert.alert(t('shift_coach.failed'), e instanceof Error ? e.message : undefined),
  });

  if (!onShift) return null;
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyLarge" weight="semibold">🧑‍🏫 {t('shift_coach.title')}</Text>
        <Text variant="footnote" tone="secondary">{t('shift_coach.hint')}</Text>
        <TextInput value={q} onChangeText={setQ} placeholder={t('shift_coach.placeholder')} placeholderTextColor={theme.text.tertiary}
          multiline maxLength={500}
          style={{ minHeight: 60, borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, padding: 10, color: theme.text.primary }} />
        <Button label={ask.isPending ? '…' : t('shift_coach.ask')} onPress={() => ask.mutate()} disabled={q.trim().length < 2 || ask.isPending} />
        {answer && (
          <View style={{ backgroundColor: answer.emergency ? theme.status.dangerSubtle : theme.bg.muted, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs }}>
            <Text variant="body">{answer.answer}</Text>
            {answer.emergency ? (
              <Pressable onPress={() => navigation.navigate('Sos', undefined)}>
                <Text variant="footnote" weight="semibold" style={{ color: theme.status.danger }}>🚨 {t('shift_coach.open_sos')}</Text>
              </Pressable>
            ) : (
              <Text variant="caption" tone="tertiary">{t('shift_coach.remaining', { n: answer.remainingToday })}</Text>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}
