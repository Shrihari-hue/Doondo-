/**
 * SkillPassportScreen — the worker's portable, verified work credential.
 *
 * The Doondo Score is one number; the passport is the document behind
 * it. It shows, on one screen the worker can hold up to an employer:
 *   - the Doondo Score + identity-verified status,
 *   - every skill, marked verified (endorsed / tested) or not,
 *   - the trade tests passed,
 *   - experience, jobs completed, and rating.
 *
 * A Share button exports a plain-text summary the worker can send over
 * WhatsApp or SMS — the credential, made portable.
 *
 * All data comes from the real /me/skill-passport endpoint. No fake
 * numbers; an unverified, brand-new worker sees an honest, mostly-empty
 * passport with a clear path to fill it.
 */

import { Pressable, ScrollView, Share, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Button, Avatar, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { useSkillPassport } from '@/hooks/useSkillPassport';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { prettifySkill } from '@/lib/trades';
import type { SkillPassport, PassportSkill } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function SkillPassportInner() {
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useSkillPassport();

  function onShare(passport: SkillPassport) {
    haptic('selection');
    const verified = passport.skills.filter((s) => s.verified);
    const lines: string[] = [
      `${t('skill_passport.title')} — ${user?.name ?? ''}`.trim(),
      `${t('skill_passport.score_label')}: ${passport.score}/100`,
    ];
    if (passport.isIdentityVerified) lines.push(t('skill_passport.verified_id'));
    if (verified.length > 0) {
      lines.push(
        `${t('skill_passport.verified')}: ` +
          verified.map((s) => prettifySkill(s.slug)).join(', '),
      );
    }
    if (passport.skillTests.length > 0) {
      lines.push(
        `${t('skill_passport.tests_header')}: ` +
          passport.skillTests.map((x) => x.title).join(', '),
      );
    }
    lines.push(`${t('skill_passport.stat_jobs')}: ${passport.jobsCompleted}`);
    if (passport.ratings.count > 0 && passport.ratings.avg !== null) {
      lines.push(
        `${t('skill_passport.stat_rating')}: ${passport.ratings.avg}/5 (${passport.ratings.count})`,
      );
    }
    void Share.share({ message: lines.join('\n') }).catch(() => undefined);
  }

  const insets = useSafeAreaInsets();

  return (
    <Screen edges={[]}>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : isError || !data ? (
        <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
          <ErrorPanel
            error={null}
            onRetry={() => void refetch()}
            title={t('skill_passport.error')}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + spacing['5xl'],
          }}
        >
          <PassportHero
            passport={data}
            name={user?.name ?? ''}
            photoUrl={user?.photoUrl ?? null}
            t={t}
            insetsTop={insets.top}
            onBack={() => navigation.goBack()}
          />

          <View style={{ padding: spacing.xl, gap: spacing.xl }}>
            <SkillsSection skills={data.skills} t={t} />

            <TestsSection tests={data.skillTests} t={t} />

            <StatsRow passport={data} t={t} />

            <Button label={t('skill_passport.share')} onPress={() => onShare(data)} />

            {/* Doondo Score QR — a signed, scannable credential anyone can
               verify without a Doondo account. */}
            <Button
              label={t('score_qr.passport_cta')}
              variant="secondary"
              onPress={() => navigation.navigate('ScoreCredential')}
            />

            {isRefetching && (
              <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                …
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

/** The headline credential card — avatar, name, score, identity badge. */
function PassportHero({
  passport,
  name,
  photoUrl,
  t,
  insetsTop,
  onBack,
}: {
  passport: SkillPassport;
  name: string;
  photoUrl: string | null;
  t: TFn;
  insetsTop: number;
  onBack: () => void;
}) {
  const memberSince = formatMonthYear(passport.memberSince);

  return (
    <LinearGradient
      colors={[blue[700], blue[600], blue[500]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insetsTop + spacing.md,
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.xl,
        borderBottomLeftRadius: radii.xl,
        borderBottomRightRadius: radii.xl,
        gap: spacing.md,
        alignItems: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('skill_passport.back')}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 1.2,
            color: 'rgba(255,255,255,0.85)',
            marginRight: 22,
          }}
        >
          {t('skill_passport.title').toUpperCase()}
        </Text>
      </View>

      <Avatar name={name} photoUrl={photoUrl} size={72} />
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>
          {t('skill_passport.tagline')}
        </Text>
      </View>

      {/* Score */}
      <View style={{ alignItems: 'center', gap: 0 }}>
        <Text
          style={{
            fontSize: 48,
            lineHeight: 54,
            fontWeight: '800',
            color: '#FFFFFF',
          }}
        >
          {passport.score}
        </Text>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          {t('skill_passport.score_label').toUpperCase()} · 100
        </Text>
      </View>

      {/* Identity badge */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: spacing.md,
          paddingVertical: 6,
          borderRadius: radii.pill,
          backgroundColor: passport.isIdentityVerified
            ? 'rgba(16,185,129,0.22)'
            : 'rgba(255,255,255,0.14)',
          borderWidth: 0.5,
          borderColor: passport.isIdentityVerified
            ? 'rgba(16,185,129,0.55)'
            : 'rgba(255,255,255,0.32)',
        }}
      >
        {passport.isIdentityVerified ? (
          <Feather name="check-circle" size={13} color="#D1FAE5" />
        ) : null}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: passport.isIdentityVerified ? '#D1FAE5' : 'rgba(255,255,255,0.85)',
          }}
        >
          {passport.isIdentityVerified
            ? t('skill_passport.verified_id')
            : t('skill_passport.unverified_id')}
        </Text>
      </View>

      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
        {t('skill_passport.member_since', { date: memberSince })}
      </Text>
    </LinearGradient>
  );
}

/** The skill list — each skill with its verification marker. */
function SkillsSection({ skills, t }: { skills: PassportSkill[]; t: TFn }) {
  const { theme } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" weight="medium" tone="secondary" style={{ letterSpacing: 1.2 }}>
        {t('skill_passport.skills_header')}
      </Text>
      {skills.length === 0 ? (
        <Text variant="footnote" tone="tertiary">
          {t('skill_passport.skills_empty')}
        </Text>
      ) : (
        <View
          style={{
            borderRadius: radii.lg,
            backgroundColor: theme.bg.surface,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            overflow: 'hidden',
          }}
        >
          {skills.map((skill, i) => (
            <View key={skill.slug}>
              {i > 0 && (
                <View style={{ height: 0.5, backgroundColor: theme.border.default }} />
              )}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  gap: spacing.sm,
                }}
              >
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {prettifySkill(skill.slug)}
                </Text>
                <SkillBadge skill={skill} t={t} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** A small status pill for one skill. */
function SkillBadge({ skill, t }: { skill: PassportSkill; t: TFn }) {
  const { theme } = useTheme();

  if (!skill.verified) {
    return (
      <View
        style={{
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radii.pill,
          backgroundColor: theme.bg.muted,
        }}
      >
        <Text variant="caption" tone="tertiary">
          {t('skill_passport.unverified')}
        </Text>
      </View>
    );
  }

  // Verified — show "Tested" when test-backed, otherwise the endorsement
  // count, which is the stronger, employer-given signal.
  const label = skill.tested
    ? t('skill_passport.tested')
    : `${t('skill_passport.verified')} · ${skill.endorsementCount}`;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: theme.status.successSubtle,
        borderWidth: 0.5,
        borderColor: theme.status.success,
      }}
    >
      <Feather name="check" size={11} color={theme.status.success} />
      <Text variant="caption" weight="medium" style={{ color: theme.status.success }}>
        {label}
      </Text>
    </View>
  );
}

/** Trade tests the worker has passed. */
function TestsSection({
  tests,
  t,
}: {
  tests: SkillPassport['skillTests'];
  t: TFn;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" weight="medium" tone="secondary" style={{ letterSpacing: 1.2 }}>
        {t('skill_passport.tests_header')}
      </Text>
      {tests.length === 0 ? (
        <Text variant="footnote" tone="tertiary">
          {t('skill_passport.tests_empty')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {tests.map((test) => (
            <View
              key={test.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radii.pill,
                backgroundColor: theme.bg.surface,
                borderWidth: 0.5,
                borderColor: theme.border.default,
              }}
            >
              <Text style={{ fontSize: 15 }}>{test.emoji}</Text>
              <Text variant="footnote" weight="medium">
                {test.title}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Four headline stats — experience, jobs, rating, endorsements. */
function StatsRow({ passport, t }: { passport: SkillPassport; t: TFn }) {
  const { theme } = useTheme();

  const stats: Array<{ value: string; label: string }> = [
    {
      value: passport.experienceYears !== null ? String(passport.experienceYears) : '—',
      label: t('skill_passport.stat_experience'),
    },
    { value: String(passport.jobsCompleted), label: t('skill_passport.stat_jobs') },
    {
      value:
        passport.ratings.count > 0 && passport.ratings.avg !== null
          ? `★ ${passport.ratings.avg}`
          : '—',
      label: t('skill_passport.stat_rating'),
    },
    {
      value: String(passport.endorsements.total),
      label: t('skill_passport.stat_endorsements'),
    },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radii.lg,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        paddingVertical: spacing.md,
      }}
    >
      {stats.map((stat, i) => (
        <View key={stat.label} style={{ flexDirection: 'row', flex: 1 }}>
          {i > 0 && (
            <View
              style={{
                width: 0.5,
                alignSelf: 'stretch',
                marginVertical: 2,
                backgroundColor: theme.border.default,
              }}
            />
          )}
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text
              style={{
                fontSize: 20,
                lineHeight: 24,
                fontWeight: '700',
                color: theme.text.primary,
              }}
            >
              {stat.value}
            </Text>
            <Text
              variant="caption"
              tone="tertiary"
              numberOfLines={1}
              style={{ textAlign: 'center' }}
            >
              {stat.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** "April 2025" — coarse, because the passport only shows the month. */
function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function SkillPassportScreen() {
  return (
    <SeekerThemeOverride>
      <SkillPassportInner />
    </SeekerThemeOverride>
  );
}
