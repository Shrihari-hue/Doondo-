/**
 * PassportCredentialScreen — the shareable Skill Passport credential.
 *
 * Same pattern as ScoreCredentialScreen: mints (or refreshes) a signed
 * credential and renders it as a premium card — worker identity, score,
 * verified-skill count, jobs completed, rating, and a QR with the
 * Doondo mark embedded in its centre. The card is captured as the share
 * artefact ("Share" / "Save to photos"); anyone who scans the QR opens
 * a public page confirming the passport is authentic.
 */
import { useRef, useState } from 'react';
import { Alert, ScrollView, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, Avatar, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { skillPassportApi, type QrMatrix } from '@/api/skillPassport.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

// Fixed brand color for the embedded QR logo mark — see QrCode.tsx.
const DOONDO_BLUE = '#2563EB';

/** Collapse a row of modules into runs of same-colour cells. */
function mergeRuns(row: boolean[]): Array<{ dark: boolean; len: number }> {
  const runs: Array<{ dark: boolean; len: number }> = [];
  for (const dark of row) {
    const last = runs[runs.length - 1];
    if (last && last.dark === dark) last.len += 1;
    else runs.push({ dark, len: 1 });
  }
  return runs;
}

/** Draw a QR module matrix as a grid of Views, with the Doondo mark centred. */
function QrCode({ matrix }: { matrix: QrMatrix }) {
  const QUIET = 4;
  const total = matrix.size + QUIET * 2;
  const cell = Math.max(3, Math.floor(248 / total));
  const side = cell * total;
  const pad = QUIET * cell;
  const logo = Math.round(side * 0.2);

  return (
    <View
      style={{
        width: side,
        height: side,
        backgroundColor: '#FFFFFF',
        padding: pad,
        borderRadius: 8,
      }}
    >
      {matrix.modules.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {mergeRuns(row).map((run, i) => (
            <View
              key={i}
              style={{
                width: cell * run.len,
                height: cell,
                backgroundColor: run.dark ? '#0F172A' : '#FFFFFF',
              }}
            />
          ))}
        </View>
      ))}
      <View
        style={{
          position: 'absolute',
          top: (side - logo) / 2,
          left: (side - logo) / 2,
          width: logo,
          height: logo,
          borderRadius: 9,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: logo - 10,
            height: logo - 10,
            borderRadius: 7,
            backgroundColor: DOONDO_BLUE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: logo * 0.46 }}>D</Text>
        </View>
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(320, windowWidth - spacing.xl * 2);

  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['passport', 'credential'],
    queryFn: () => skillPassportApi.credential(),
    staleTime: 60 * 60_000,
  });
  const credential = query.data?.credential;

  async function captureCard(): Promise<string | null> {
    try {
      return await captureRef(cardRef, { format: 'png', quality: 1 });
    } catch {
      return null;
    }
  }

  async function onShare() {
    if (!credential || busy) return;
    haptic('selection');
    setBusy(true);
    try {
      const uri = await captureCard();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('passport_qr.share') });
      }
    } catch {
      Alert.alert(t('passport_qr.share'), t('passport_qr.action_error'));
    } finally {
      setBusy(false);
    }
  }

  const [savedPhoto, setSavedPhoto] = useState(false);
  async function onSave() {
    if (!credential || busy) return;
    haptic('selection');
    setBusy(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('passport_qr.save'), t('passport_qr.save_permission'));
        return;
      }
      const uri = await captureCard();
      if (uri) {
        await MediaLibrary.saveToLibraryAsync(uri);
        setSavedPhoto(true);
        haptic('success');
      }
    } catch {
      Alert.alert(t('passport_qr.save'), t('passport_qr.action_error'));
    } finally {
      setBusy(false);
    }
  }

  function onRefresh() {
    haptic('light');
    setSavedPhoto(false);
    void query.refetch();
  }

  return (
    <Screen edges={[]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Text
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('passport_qr.back')}
          style={{ fontSize: 22, color: theme.text.primary }}
        >
          ←
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('passport_qr.title')}
        </Text>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : query.isError || !credential ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {t('passport_qr.error')}
          </Text>
          <Button
            label={t('passport_qr.retry')}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing['5xl'],
            alignItems: 'center',
            gap: spacing.lg,
          }}
        >
          <Text style={{ fontSize: 13, color: theme.text.secondary, textAlign: 'center' }}>
            {t('passport_qr.subtitle')}
          </Text>

          {/* ── The credential card (also the share artefact) ───────── */}
          <View
            ref={cardRef}
            collapsable={false}
            style={{
              width: cardWidth,
              backgroundColor: theme.bg.surface,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: theme.premium.goldBorder,
              padding: spacing.xl,
              gap: spacing.md,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '800', color: DOONDO_BLUE, letterSpacing: -0.3 }}>
                Doondo
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: theme.premium.goldSubtle,
                  borderWidth: 0.5,
                  borderColor: theme.premium.goldBorder,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                }}
              >
                <Text style={{ fontSize: 10, color: theme.premium.gold }}>★</Text>
                <Text
                  style={{ fontSize: 10, fontWeight: '800', color: theme.premium.gold, letterSpacing: 0.6 }}
                >
                  {t('passport_qr.verified')}
                </Text>
              </View>
            </View>

            <View style={{ alignItems: 'center', gap: 6 }}>
              <Avatar name={user?.name ?? ''} photoUrl={user?.photoUrl ?? null} size={56} />
              <Text
                style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}
                numberOfLines={1}
              >
                {user?.name ?? ''}
              </Text>
            </View>

            {/* Score + at-a-glance stats */}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 54, lineHeight: 60, fontWeight: '800', color: DOONDO_BLUE }}>
                {credential.score}
              </Text>
              <Text
                style={{ fontSize: 11, fontWeight: '700', color: theme.text.tertiary, letterSpacing: 1 }}
              >
                {t('passport_qr.score_label')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <Stat label={t('passport_qr.jobs_label')} value={String(credential.jobsCompleted)} />
              <Stat label={t('passport_qr.skills_label')} value={String(credential.verifiedSkillCount)} />
              <Stat
                label={t('passport_qr.rating_label')}
                value={credential.ratings.count ? `${credential.ratings.avg?.toFixed(1) ?? '—'} ★` : '—'}
              />
            </View>

            <QrCode matrix={credential.qr} />

            <Text style={{ fontSize: 11, color: theme.text.tertiary, textAlign: 'center' }}>
              {t('passport_qr.valid_until', { date: formatDate(credential.expiresAt) })}
            </Text>
          </View>

          <Text
            style={{ fontSize: 13, color: theme.text.secondary, textAlign: 'center', maxWidth: 300, lineHeight: 19 }}
          >
            {t('passport_qr.scan_hint')}
          </Text>

          <View style={{ width: '100%', gap: spacing.sm }}>
            <Button label={t('passport_qr.share')} onPress={onShare} disabled={busy} />
            <Button
              label={savedPhoto ? t('passport_qr.saved_photo') : t('passport_qr.save')}
              variant="secondary"
              onPress={onSave}
              disabled={busy || savedPhoto}
            />
            <Button
              label={t('passport_qr.refresh')}
              variant="ghost"
              onPress={onRefresh}
              disabled={busy || query.isFetching}
            />
          </View>

          <Text
            style={{ fontSize: 11, color: theme.text.tertiary, textAlign: 'center', lineHeight: 16, maxWidth: 300 }}
          >
            {t('passport_qr.authentic_note')}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}>{value}</Text>
      <Text style={{ fontSize: 9, color: theme.text.tertiary, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

export function PassportCredentialScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
