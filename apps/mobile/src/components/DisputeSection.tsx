/**
 * DisputeSection — the two-sided dispute UI for one hire, shared by the
 * employer (ApplicantDetail) and worker (My applications) screens.
 *
 * Shows any disputes already on the application, lets the viewer raise a
 * new one (category + description + up to 3 evidence photos), and — on an
 * open dispute — reply, mark resolved, or (if they raised it) withdraw it.
 * All state lives behind react-query keyed on the applicationId, so both
 * sides see the same thread after a refetch.
 */

import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text, Card, Button, TextField, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { pickChatImage } from '@/lib/chatImage';
import {
  disputesApi,
  type Dispute,
  type DisputeCategory,
} from '@/api/disputes.api';

const CATEGORIES: DisputeCategory[] = [
  'no_show',
  'payment',
  'work_quality',
  'behavior',
  'hours',
  'safety',
  'other',
];

export function DisputeSection({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [category, setCategory] = useState<DisputeCategory>('payment');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const key = ['disputes', applicationId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => disputesApi.list({ applicationId }),
  });
  const disputes = query.data ?? [];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: key });

  const raiseMut = useMutation({
    mutationFn: () =>
      disputesApi.raise({ applicationId, category, description: description.trim(), photoDataUrls: photos }),
    onSuccess: () => {
      haptic('success');
      setRaiseOpen(false);
      setDescription('');
      setPhotos([]);
      setCategory('payment');
      invalidate();
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('dispute.raise_fail'));
    },
  });

  const replyMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => disputesApi.respond(id, text),
    onSuccess: () => {
      haptic('success');
      setReplyFor(null);
      setReplyText('');
      invalidate();
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('dispute.reply_fail'));
    },
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: 'resolved' | 'dismissed' }) =>
      disputesApi.resolve(id, outcome),
    onSuccess: () => {
      haptic('success');
      invalidate();
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('dispute.resolve_fail'));
    },
  });

  async function addPhoto() {
    if (photos.length >= 3) return;
    try {
      const img = await pickChatImage({ source: 'library' });
      if (img) setPhotos((prev) => [...prev, img.dataUrl]);
    } catch {
      /* cancelled */
    }
  }

  function confirmResolve(d: Dispute, outcome: 'resolved' | 'dismissed') {
    Alert.alert(
      outcome === 'resolved' ? t('dispute.resolve_confirm_title') : t('dispute.withdraw_confirm_title'),
      outcome === 'resolved' ? t('dispute.resolve_confirm_body') : t('dispute.withdraw_confirm_body'),
      [
        { text: t('dispute.cancel'), style: 'cancel' },
        {
          text: outcome === 'resolved' ? t('dispute.resolve') : t('dispute.withdraw'),
          style: outcome === 'dismissed' ? 'destructive' : 'default',
          onPress: () => resolveMut.mutate({ id: d.id, outcome }),
        },
      ],
    );
  }

  const statusTone = (s: Dispute['status']): 'success' | 'neutral' | 'warning' =>
    s === 'resolved' ? 'success' : s === 'dismissed' ? 'neutral' : 'warning';

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0, flex: 1 }}>
          {t('dispute.section_title')}
        </Text>
        <Pressable onPress={() => setRaiseOpen(true)} hitSlop={8} accessibilityRole="button">
          <Text variant="footnote" weight="medium" style={{ color: theme.brand.accent }}>
            {t('dispute.raise_cta')}
          </Text>
        </Pressable>
      </View>

      {disputes.length === 0 ? (
        <Text variant="caption" tone="tertiary">
          {t('dispute.none')}
        </Text>
      ) : (
        disputes.map((d) => {
          const closed = d.status === 'resolved' || d.status === 'dismissed';
          return (
            <Card key={d.id}>
              <View style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="body" weight="medium" style={{ flex: 1 }}>
                    {t(`dispute.category.${d.category}`)}
                  </Text>
                  <Pill label={t(`dispute.status.${d.status}`)} tone={statusTone(d.status)} />
                </View>
                <Text variant="footnote" tone="secondary">
                  {d.description}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {d.raisedByMe
                    ? t('dispute.raised_by_you')
                    : t('dispute.raised_by_them', { name: d.counterpartyName })}
                </Text>

                {(() => {
                  // The viewer's own role on this dispute.
                  const myRole = d.raisedByMe
                    ? d.raisedByRole
                    : d.raisedByRole === 'employer'
                      ? 'seeker'
                      : 'employer';
                  return d.responses.map((r, i) => (
                    <View
                      key={i}
                      style={{
                        marginTop: 4,
                        paddingLeft: spacing.sm,
                        borderLeftWidth: 2,
                        borderLeftColor: theme.border.default,
                      }}
                    >
                      <Text variant="caption" tone="tertiary">
                        {r.byRole === myRole ? t('dispute.you') : d.counterpartyName}
                      </Text>
                      <Text variant="footnote">{r.text}</Text>
                    </View>
                  ));
                })()}

                {d.resolution && (
                  <Text variant="caption" tone={d.resolution.outcome === 'resolved' ? 'success' : 'tertiary'}>
                    {d.resolution.outcome === 'resolved'
                      ? t('dispute.closed_resolved')
                      : t('dispute.closed_dismissed')}
                  </Text>
                )}

                {!closed && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
                    <Pressable onPress={() => setReplyFor(d.id)} hitSlop={6} accessibilityRole="button">
                      <Text variant="footnote" weight="medium" style={{ color: theme.brand.accent }}>
                        {t('dispute.reply')}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => confirmResolve(d, 'resolved')} hitSlop={6} accessibilityRole="button">
                      <Text variant="footnote" weight="medium" tone="success">
                        {t('dispute.mark_resolved')}
                      </Text>
                    </Pressable>
                    {d.raisedByMe && (
                      <Pressable onPress={() => confirmResolve(d, 'dismissed')} hitSlop={6} accessibilityRole="button">
                        <Text variant="footnote" weight="medium" tone="danger">
                          {t('dispute.withdraw')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {replyFor === d.id && (
                  <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                    <TextField
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder={t('dispute.reply_placeholder')}
                      multiline
                      numberOfLines={2}
                    />
                    <Button
                      label={replyMut.isPending ? t('dispute.sending') : t('dispute.send_reply')}
                      onPress={() => replyMut.mutate({ id: d.id, text: replyText.trim() })}
                      disabled={replyMut.isPending || !replyText.trim()}
                    />
                  </View>
                )}
              </View>
            </Card>
          );
        })
      )}

      {/* Raise modal */}
      <Modal visible={raiseOpen} transparent animationType="slide" onRequestClose={() => setRaiseOpen(false)}>
        <Pressable
          onPress={() => setRaiseOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.bg.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
              maxHeight: '85%',
            }}
          >
            <Text variant="bodyLarge" weight="semibold">
              {t('dispute.raise_title')}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {CATEGORIES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      accessibilityRole="button"
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: 8,
                        borderRadius: radii.pill,
                        borderWidth: 0.5,
                        borderColor: category === c ? theme.brand.primary : theme.border.default,
                        backgroundColor: category === c ? theme.brand.primary : 'transparent',
                      }}
                    >
                      <Text
                        variant="footnote"
                        weight="medium"
                        style={{ color: category === c ? '#FFFFFF' : theme.text.secondary }}
                      >
                        {t(`dispute.category.${c}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextField
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('dispute.description_placeholder')}
                  multiline
                  numberOfLines={4}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button
                    label={t('dispute.add_photo', { n: photos.length })}
                    variant="secondary"
                    onPress={() => void addPhoto()}
                    disabled={photos.length >= 3}
                  />
                  <Button
                    label={raiseMut.isPending ? t('dispute.submitting') : t('dispute.submit')}
                    onPress={() => raiseMut.mutate()}
                    disabled={raiseMut.isPending || !description.trim()}
                  />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
