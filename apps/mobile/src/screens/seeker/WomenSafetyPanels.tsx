/**
 * Doondo for Women — extra panels:
 *   PrivacyToggle        — "hide my exact location & phone from employers"
 *   SafetyQuestions      — confirm a past workplace's women-safety signals
 *   PeerConfirmedLine    — "Confirmed safe by N of M women who worked here"
 */
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing, radii } from '@doondo/tokens';
import { Text, Card, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { womenSafetyApi, type WomenSafetySignalKey, type PendingSafetyQuestion } from '@/api/womenSafety.api';

export function PrivacyToggle() {
  const { theme } = useTheme();
  const t = useTranslate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['women-privacy'], queryFn: womenSafetyApi.privacy });
  const mut = useMutation({
    mutationFn: (maskLocation: boolean) => womenSafetyApi.setPrivacy({ maskLocation }),
    onSuccess: (p) => qc.setQueryData(['women-privacy'], p),
  });
  const on = mut.isPending ? Boolean(mut.variables) : Boolean(q.data?.maskLocation);
  return (
    <View style={{ borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium">{t('women.privacy_title')}</Text>
        <Text variant="footnote" tone="secondary" style={{ lineHeight: 19 }}>{t('women.privacy_desc')}</Text>
      </View>
      <Switch value={on} onValueChange={(v) => { haptic('selection'); mut.mutate(v); }}
        trackColor={{ false: theme.border.default, true: theme.brand.hero }} thumbColor="#FFFFFF" />
    </View>
  );
}

function QuestionCard({ q, onDone }: { q: PendingSafetyQuestion; onDone: () => void }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const [safe, setSafe] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<WomenSafetySignalKey[]>([]);
  const mut = useMutation({
    mutationFn: () => womenSafetyApi.report({ applicationId: q.applicationId, safe: safe!, confirmed }),
    onSuccess: () => { haptic('success'); onDone(); },
    onError: () => Alert.alert(t('women.confirm_failed')),
  });
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="body" weight="semibold">{t('women.confirm_title', { job: q.jobTitle, employer: q.employerName })}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[true, false].map((v) => (
            <Pressable key={String(v)} onPress={() => setSafe(v)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: radii.md, alignItems: 'center', borderWidth: 1.5,
                borderColor: safe === v ? theme.brand.hero : theme.border.default, backgroundColor: safe === v ? theme.brand.heroSubtle : 'transparent' }}>
              <Text variant="footnote" weight="medium">{v ? t('women.confirm_yes') : t('women.confirm_no')}</Text>
            </Pressable>
          ))}
        </View>
        {q.declared.length > 0 && (
          <>
            <Text variant="caption" tone="secondary">{t('women.confirm_signals')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {q.declared.map((sig) => {
                const active = confirmed.includes(sig);
                return (
                  <Pressable key={sig} onPress={() => setConfirmed((c) => (active ? c.filter((x) => x !== sig) : [...c, sig]))}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill,
                      backgroundColor: active ? theme.status.successSubtle : theme.bg.muted }}>
                    <Text variant="caption" tone={active ? 'success' : 'secondary'}>{active ? '✓ ' : ''}{t(`women.signal.${sig}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <Button label={t('women.confirm_send')} onPress={() => mut.mutate()} disabled={safe === null || mut.isPending} />
        <Text variant="caption" tone="tertiary">{t('women.confirm_private')}</Text>
      </View>
    </Card>
  );
}

export function SafetyQuestions() {
  const t = useTranslate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['women-pending'], queryFn: womenSafetyApi.pending });
  const list = q.data ?? [];
  if (list.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.1 }}>{t('women.confirm_section')}</Text>
      {list.map((item) => (
        <QuestionCard key={item.applicationId} q={item} onDone={() => void qc.invalidateQueries({ queryKey: ['women-pending'] })} />
      ))}
    </View>
  );
}

export function PeerConfirmedLine({ employerId }: { employerId: string }) {
  const t = useTranslate();
  const q = useQuery({ queryKey: ['women-employer', employerId], queryFn: () => womenSafetyApi.employer(employerId), staleTime: 10 * 60_000 });
  const s = q.data;
  if (!s || s.safePercent == null) {
    return <Text variant="caption" tone="tertiary">{t('women.peer_none')}</Text>;
  }
  return (
    <Text variant="footnote" tone={s.safePercent >= 70 ? 'success' : 'warning'} weight="medium">
      {t('women.peer_confirmed', { safe: s.safe, total: s.reports })}
    </Text>
  );
}
