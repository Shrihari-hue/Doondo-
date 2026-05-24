/**
 * ScoreCredentialScreen — the shareable Doondo Score credential.
 *
 * Mints (or refreshes) a signed score credential and renders it as a
 * premium credential card: the worker's name and photo, their score, a
 * champagne-gold frame, a "Doondo Verified" mark, and the QR — with the
 * Doondo mark embedded in its centre.
 *
 * The card itself is the share artefact: "Share" and "Save to photos"
 * capture the on-screen card as an image, so a worker can post it to
 * WhatsApp status or keep it offline. Anyone who scans the QR opens a
 * public Doondo page confirming the score is authentic.
 *
 * The QR is drawn as Views (run-length-merged per row), so the screen
 * needs no QR or SVG library.
 */
import { useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
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
import { doondoScoreApi, type QrMatrix } from '@/api/doondoScore.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

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

/**
 * Draw a QR module matrix as a grid of Views, with a white quiet zone
 * and the Doondo mark embedded in the centre. The mark covers ~20% of
 * the QR side — comfortably within error-correction level M's budget.
 */
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
      {/* Centred Doondo mark — a white punch-out holding the blue tile. */}
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
          <Text
            style={{ color: '#FFFFFF', fontWeight: '800', fontSize: logo * 0.46 }}
          >
            D
          </Text>
        </View>
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();

  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['score', 'credential'],
    queryFn: () => doondoScoreApi.credential(),
    staleTime: 60 * 60_000,
  });
  const credential = query.data?.credential;

  /** Capture the credential card to a PNG file URI. */
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
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('score_qr.share'),
        });
      }
    } catch {
      Alert.alert(t('score_qr.share'), t('score_qr.action_error'));
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
        Alert.alert(t('score_qr.save'), t('score_qr.save_permission'));
        return;
      }
      const uri = await captureCard();
      if (uri) {
        await MediaLibrary.saveToLibraryAsync(uri);
        setSavedPhoto(true);
        haptic('success');
      }
    } catch {
      Alert.alert(t('score_qr.save'), t('score_qr.action_error'));
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
      {/* Header */}
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
          accessibilityLabel={t('score_qr.back')}
          style={{ fontSize: 22, color: theme.text.primary }}
        >
          ←
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('score_qr.title')}
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
            {t('score_qr.error')}
          </Text>
          <Button
            label={t('score_qr.retry')}
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
          <Text
            style={{ fontSize: 13, color: theme.text.secondary, textAlign: 'center' }}
          >
            {t('score_qr.subtitle')}
          </Text>

          {/* ── The credential card (also the share artefact) ───────── */}
          <View
            ref={cardRef}
            collapsable={false}
            style={{
              width: 320,
              backgroundColor: theme.bg.surface,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: theme.premium.goldBorder,
              padding: spacing.xl,
              gap: spacing.md,
              alignItems: 'center',
            }}
          >
            {/* Wordmark + verified mark */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '800',
                  color: DOONDO_BLUE,
                  letterSpacing: -0.3,
                }}
              >
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
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: theme.premium.gold,
                    letterSpacing: 0.6,
                  }}
                >
                  {t('score_qr.verified')}
                </Text>
              </View>
            </View>

            {/* Worker identity */}
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Avatar name={user?.name ?? ''} photoUrl={user?.photoUrl ?? null} size={56} />
              <Text
                style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}
                numberOfLines={1}
              >
                {user?.name ?? ''}
              </Text>
            </View>

            {/* Score */}
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 54,
                  lineHeight: 60,
                  fontWeight: '800',
                  color: DOONDO_BLUE,
                }}
              >
                {credential.score}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: theme.text.tertiary,
                  letterSpacing: 1,
                }}
              >
                {t('score_qr.score_label')}
              </Text>
            </View>

            {/* QR */}
            <QrCode matrix={credential.qr} />

            <Text
              style={{
                fontSize: 11,
                color: theme.text.tertiary,
                textAlign: 'center',
              }}
            >
              {t('score_qr.valid_until', { date: formatDate(credential.expiresAt) })}
            </Text>
          </View>

          <Text
            style={{
              fontSize: 13,
              color: theme.text.secondary,
              textAlign: 'center',
              maxWidth: 300,
              lineHeight: 19,
            }}
          >
            {t('score_qr.scan_hint')}
          </Text>

          {/* ── Actions ─────────────────────────────────────────────── */}
          <View style={{ width: '100%', gap: spacing.sm }}>
            <Button label={t('score_qr.share')} onPress={onShare} disabled={busy} />
            <Button
              label={savedPhoto ? t('score_qr.saved_photo') : t('score_qr.save')}
              variant="secondary"
              onPress={onSave}
              disabled={busy || savedPhoto}
            />
            <Button
              label={t('score_qr.refresh')}
              variant="ghost"
              onPress={onRefresh}
              disabled={busy || query.isFetching}
            />
          </View>

          <Text
            style={{
              fontSize: 11,
              color: theme.text.tertiary,
              textAlign: 'center',
              lineHeight: 16,
              maxWidth: 300,
            }}
          >
            {t('score_qr.authentic_note')}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

export function ScoreCredentialScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
