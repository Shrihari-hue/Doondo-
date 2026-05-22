import { forwardRef } from 'react';
import { Image, StyleSheet, Text as RNText, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { champagne, jade } from '@doondo/tokens';
import type { PublicApplication, PublicUser } from '@/api/types';
import { getHireStartInfo } from '@/lib/hireStart';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';

interface Props {
  user: PublicUser;
  application: PublicApplication;
  variant?: 'story' | 'square';
  tone?: 'proud' | 'professional' | 'family';
}

export const HireShareCardPoster = forwardRef<View, Props>(function HireShareCardPoster(
  { user, application, variant = 'story', tone = 'proud' },
  ref,
) {
  const t = useTranslate();
  const { locale } = useLocale();
  const jobTitle = application.job?.title ?? t('hire_share.fallback_role');
  const employer =
    application.job?.employer?.companyName ??
    application.job?.employer?.name ??
    t('hire_share.fallback_employer');
  const area =
    application.job?.location?.area ?? application.job?.location?.city ?? t('hire_share.fallback_city');
  const hiredAt = formatDate(application.timeline.hiredAt ?? new Date().toISOString(), locale);
  const memberSince = formatMemberSince(user.createdAt, locale, t('hire_share.recently'));
  const skills = user.skills.slice(0, 3).map(prettifySkill);
  const payLine = formatPay(application, t);
  const startInfo = getHireStartInfo(application, locale, t);
  const employerInitials = initials(employer);
  const theme = resolveTradeTheme(application, user, t);
  const trustSignals = buildTrustSignals(user, t);
  const layout = resolvePosterLayout(variant);
  const template = resolveTradeTemplate(theme.family, variant);
  const copy = resolveShareToneCopy({ tone, t, userName: user.name, role: jobTitle, employer });
  const employerTrustLine = application.job?.employer?.isVerified
    ? t('hire_share.employer_verified')
    : t('hire_share.employer_on_doondo');
  const templateTags = buildTemplateTags(application, user, area, payLine, startInfo);

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={[
        styles.host,
        variant === 'square' ? styles.hostSquare : styles.hostStory,
      ]}
    >
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0.12, y: 0.02 }}
        end={{ x: 0.92, y: 1 }}
        style={[
          styles.poster,
          variant === 'square' ? styles.posterSquare : styles.posterStory,
        ]}
      >
        <View style={[styles.glowOrb, styles.topOrb, { backgroundColor: theme.topOrbBg, shadowColor: theme.topOrbShadow }]} />
        <View style={[styles.glowOrb, styles.bottomOrb, { backgroundColor: theme.bottomOrbBg, shadowColor: theme.bottomOrbShadow }]} />
        <View style={[styles.frame, { borderColor: theme.frameBorder }]} />

        <RNText style={styles.brand}>{copy.brand}</RNText>

        <View style={[styles.hero, { marginTop: layout.heroMarginTop }]}>
          <View style={styles.employerBadge}>
            {application.job?.employer?.photoUrl ? (
              <Image
                source={{ uri: application.job.employer.photoUrl }}
                style={[styles.employerPhoto, { borderColor: theme.badgeBorder }]}
              />
            ) : (
              <View
                style={[
                  styles.employerAvatar,
                  { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
                ]}
              >
                <RNText style={styles.employerAvatarText}>{employerInitials}</RNText>
              </View>
            )}
            <View style={styles.employerMeta}>
              <RNText style={styles.employerLabel}>{t('hire_share.hired_by')}</RNText>
              <RNText style={styles.employerName}>{employer}</RNText>
              <RNText style={[styles.employerTrustLine, { color: theme.badgeText }]}>
                {employerTrustLine}
              </RNText>
            </View>
          </View>
          {template.preTitleKind === 'skills' ? (
            <View style={styles.templateChipRow}>
              {templateTags.slice(0, 3).map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.templateChip,
                    { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
                  ]}
                >
                  <RNText style={[styles.templateChipText, { color: theme.badgeText }]}>{tag}</RNText>
                </View>
              ))}
            </View>
          ) : null}
          {template.preTitleKind === 'route' ? (
            <View
              style={[
                styles.routeStrip,
                { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              ]}
            >
              <View style={styles.routeStop}>
                <View style={[styles.routeDot, { backgroundColor: theme.badgeText }]} />
                <RNText style={[styles.routeStopText, { color: theme.badgeText }]}>{area}</RNText>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeStop}>
                <View style={[styles.routeDot, { backgroundColor: theme.badgeText }]} />
                <RNText style={[styles.routeStopText, { color: theme.badgeText }]}>{employer}</RNText>
              </View>
            </View>
          ) : null}
          {template.preTitleKind === 'grid' ? (
            <View
              style={[
                styles.blueprintPanel,
                { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              ]}
            >
              <View style={styles.blueprintMetric}>
                <RNText style={[styles.blueprintLabel, { color: theme.badgeText }]}>
                  {t('hire_share.pay')}
                </RNText>
                <RNText style={styles.blueprintValue}>{payLine}</RNText>
              </View>
              {startInfo ? (
                <View style={styles.blueprintMetric}>
                  <RNText style={[styles.blueprintLabel, { color: theme.badgeText }]}>
                    {startInfo.label}
                  </RNText>
                  <RNText style={styles.blueprintValue}>{startInfo.relative}</RNText>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.eyebrow, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}>
            <RNText style={[styles.eyebrowText, { color: theme.badgeText }]}>{copy.eyebrow ?? theme.eyebrow}</RNText>
          </View>
          {template.preTitleKind === 'editorial' ? (
            <View style={styles.editorialHero}>
              <View style={styles.editorialTitleWrap}>
                <RNText style={[styles.title, styles.editorialTitle, { fontSize: layout.titleSize, lineHeight: layout.titleLineHeight }]}>
                  {copy.title}
                </RNText>
                <RNText style={[styles.subtitle, { fontSize: layout.subtitleSize, lineHeight: layout.subtitleLineHeight }]}>
                  {copy.subtitle}
                </RNText>
              </View>
              <View
                style={[
                  styles.editorialQuoteCard,
                  { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
                ]}
              >
                <RNText style={[styles.editorialQuoteMark, { color: theme.badgeText }]}>◆</RNText>
                <RNText style={styles.editorialQuoteText}>{copy.momentCopy ?? theme.momentCopy}</RNText>
              </View>
            </View>
          ) : (
            <>
              <RNText style={[styles.title, { fontSize: layout.titleSize, lineHeight: layout.titleLineHeight }]}>
                {copy.title}
              </RNText>
              <RNText style={[styles.subtitle, { fontSize: layout.subtitleSize, lineHeight: layout.subtitleLineHeight }]}>
                {copy.subtitle}
              </RNText>
            </>
          )}
        </View>

        <View style={[styles.cards, { marginTop: layout.cardsMarginTop }]}>
          <View style={[styles.card, styles.primaryCard]}>
            <RNText style={styles.cardLabel}>{t('hire_share.role')}</RNText>
            <RNText style={[styles.cardValue, { fontSize: layout.cardValueSize, lineHeight: layout.cardValueLineHeight }]}>
              {jobTitle}
            </RNText>
            <RNText style={styles.cardCopy}>{`${employer} • ${area}`}</RNText>
          </View>

          <View style={styles.metricsRow}>
            <View style={[styles.card, styles.metricCard]}>
              <RNText style={styles.cardLabel}>{t('hire_share.pay')}</RNText>
              <RNText style={[styles.metricValue, { fontSize: layout.metricValueSize, lineHeight: layout.metricValueLineHeight }]}>
                {payLine}
              </RNText>
            </View>
            <View style={[styles.card, styles.metricCard]}>
              <RNText style={styles.cardLabel}>{t('hire_share.city')}</RNText>
              <RNText style={[styles.metricValue, { fontSize: layout.metricValueSize, lineHeight: layout.metricValueLineHeight }]}>
                {area}
              </RNText>
            </View>
          </View>

          {startInfo ? (
            <View style={[styles.card, styles.startCard]}>
              <RNText style={styles.cardLabel}>{startInfo.label}</RNText>
              <RNText
                style={[
                  styles.metricValue,
                  { fontSize: layout.metricValueSize, lineHeight: layout.metricValueLineHeight },
                ]}
              >
                {startInfo.relative}
              </RNText>
            </View>
          ) : null}
        </View>

        {template.preTitleKind !== 'editorial' && copy.showMoment ? (
          <View
            style={[
              styles.card,
              styles.momentCard,
              { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              variant === 'square' ? styles.momentCardSquare : null,
            ]}
          >
            <RNText style={styles.cardLabel}>{copy.momentLabel}</RNText>
            <RNText style={[styles.momentCopy, { fontSize: layout.momentSize, lineHeight: layout.momentLineHeight }]}>
              {copy.momentCopy ?? theme.momentCopy}
            </RNText>
          </View>
        ) : null}

        {copy.showSkills && skills.length > 0 ? (
          <View style={styles.skillRow}>
            {skills.map((skill) => (
              <View key={skill} style={styles.skillPill}>
                <RNText style={styles.skillText}>{skill}</RNText>
              </View>
            ))}
          </View>
        ) : null}

        {copy.showTrust && trustSignals.length > 0 ? (
          <View style={styles.trustRow}>
            {trustSignals.map((signal) => (
              <View
                key={signal.label}
                style={[
                  styles.trustPill,
                  { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
                ]}
              >
                <RNText style={[styles.trustValue, { color: theme.badgeText }]}>
                  {signal.value}
                </RNText>
                <RNText style={styles.trustLabel}>{signal.label}</RNText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.footer, variant === 'square' ? styles.footerSquare : null]}>
          <View style={styles.workerBadge}>
            {user.photoUrl ? (
              <Image
                source={{ uri: user.photoUrl }}
                style={[styles.workerPhoto, { borderColor: theme.badgeBorder }]}
              />
            ) : (
              <View style={[styles.workerPhotoFallback, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}>
                <RNText style={styles.workerPhotoFallbackText}>{initials(user.name)}</RNText>
              </View>
            )}
            <View style={styles.workerMeta}>
              <RNText style={styles.footerLabel}>{t('hire_share.worker')}</RNText>
              <RNText style={styles.workerName}>{user.name}</RNText>
            </View>
          </View>

          <View style={styles.footerBlock}>
            <RNText style={styles.footerLabel}>{t('hire_share.date')}</RNText>
            <RNText style={styles.footerValue}>{hiredAt}</RNText>
          </View>
          <View style={styles.footerBlock}>
            <RNText style={styles.footerLabel}>{t('hire_share.member_since')}</RNText>
            <RNText style={styles.footerValue}>{memberSince}</RNText>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
});

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return 'Today';
  }
}

function formatMemberSince(
  iso: string,
  locale: string,
  fallback: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return fallback;
  }
}

function prettifySkill(skill: string): string {
  return skill
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function initials(value: string): string {
  const picks = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return picks || 'D';
}

function formatPay(
  application: PublicApplication,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const pay = application.job?.pay;
  if (!pay) return t('hire_share.pay_confirmed');
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : `${pay.currency} `;
  const lo = compactAmount(pay.amount);
  const hi = pay.amountMax ? compactAmount(pay.amountMax) : null;
  const suffix =
    pay.period === 'hour'
      ? t('common.pay_period.suffix_hour')
      : pay.period === 'day'
        ? t('common.pay_period.suffix_day')
        : pay.period === 'week'
          ? t('common.pay_period.suffix_week')
          : pay.period === 'month'
            ? t('common.pay_period.suffix_month')
            : '';
  return hi ? `${symbol}${lo}-${hi}${suffix}` : `${symbol}${lo}${suffix}`;
}

function compactAmount(amountMinor: number): string {
  const value = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: value % 1 === 0 ? 0 : 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

function resolvePosterLayout(variant: 'story' | 'square') {
  if (variant === 'square') {
    return {
      heroMarginTop: 48,
      titleSize: 82,
      titleLineHeight: 82,
      subtitleSize: 30,
      subtitleLineHeight: 40,
      cardsMarginTop: 40,
      cardValueSize: 42,
      cardValueLineHeight: 46,
      metricValueSize: 32,
      metricValueLineHeight: 38,
      momentSize: 26,
      momentLineHeight: 34,
    };
  }
  return {
    heroMarginTop: 116,
    titleSize: 118,
    titleLineHeight: 116,
    subtitleSize: 38,
    subtitleLineHeight: 52,
    cardsMarginTop: 78,
    cardValueSize: 56,
    cardValueLineHeight: 60,
    metricValueSize: 42,
    metricValueLineHeight: 48,
    momentSize: 34,
    momentLineHeight: 46,
  };
}

function buildTrustSignals(
  user: PublicUser,
  t: (key: string, options?: Record<string, unknown>) => string,
): Array<{ label: string; value: string }> {
  const signals: Array<{ label: string; value: string }> = [];

  if (user.verificationStatus === 'verified' || user.isVerified) {
    signals.push({ label: t('hire_share.trust_label'), value: t('hire_share.verified') });
  }

  if (user.profileCompletion >= 80) {
    signals.push({ label: t('hire_share.profile_label'), value: `${user.profileCompletion}%` });
  }

  if (user.rating && user.rating.count > 0) {
    signals.push({
      label: t('hire_share.rating_label'),
      value: `${user.rating.avg.toFixed(1)}★`,
    });
  }

  if (user.streaks.apply.current >= 3) {
    signals.push({
      label: t('hire_share.streak_label'),
      value: t('hire_share.streak_value', { count: user.streaks.apply.current }),
    });
  }

  return signals.slice(0, 3);
}

type TradeTheme = {
  family: TradeFamily;
  gradient: [string, string, string];
  topOrbBg: string;
  topOrbShadow: string;
  bottomOrbBg: string;
  bottomOrbShadow: string;
  frameBorder: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  eyebrow: string;
  momentCopy: string;
};

type TradeFamily = 'kitchen' | 'driver' | 'trade' | 'craft' | 'default';

type TradeTemplate = {
  preTitleKind: 'skills' | 'route' | 'grid' | 'editorial' | 'none';
};

type ShareToneCopy = {
  brand: string;
  eyebrow?: string;
  title: string;
  subtitle: string;
  momentLabel: string;
  momentCopy?: string;
  showMoment: boolean;
  showSkills: boolean;
  showTrust: boolean;
};

function resolveTradeTheme(
  application: PublicApplication,
  user: PublicUser,
  t: (key: string, options?: Record<string, unknown>) => string,
): TradeTheme {
  const source = [
    application.job?.title ?? '',
    ...(application.job?.skills ?? []),
    ...user.skills,
  ]
    .join(' ')
    .toLowerCase();

  if (/(cook|chef|kitchen|baker|catering|food)/.test(source)) {
    return {
      family: 'kitchen',
      gradient: ['#120707', '#26110C', '#3A1C11'],
      topOrbBg: 'rgba(255,140,92,0.24)',
      topOrbShadow: '#FF9A67',
      bottomOrbBg: 'rgba(255,209,102,0.18)',
      bottomOrbShadow: '#FFD166',
      frameBorder: 'rgba(255,210,166,0.22)',
      badgeBg: 'rgba(255,167,110,0.12)',
      badgeBorder: 'rgba(255,190,138,0.22)',
      badgeText: '#FFD8B4',
      eyebrow: t('hire_share.theme.kitchen.eyebrow'),
      momentCopy: t('hire_share.theme.kitchen.moment'),
    };
  }

  if (/(driver|driving|delivery|route|fleet|transport)/.test(source)) {
    return {
      family: 'driver',
      gradient: ['#071018', '#0D1E30', '#102B44'],
      topOrbBg: 'rgba(92,179,255,0.22)',
      topOrbShadow: '#66B3FF',
      bottomOrbBg: 'rgba(111,240,221,0.16)',
      bottomOrbShadow: '#6FF0DD',
      frameBorder: 'rgba(171,222,255,0.2)',
      badgeBg: 'rgba(92,179,255,0.10)',
      badgeBorder: 'rgba(122,196,255,0.2)',
      badgeText: '#C8E8FF',
      eyebrow: t('hire_share.theme.driver.eyebrow'),
      momentCopy: t('hire_share.theme.driver.moment'),
    };
  }

  if (/(electric|wiring|plumber|plumbing|welder|mason|carpenter|technician|mechanic|ac |hvac|repair)/.test(source)) {
    return {
      family: 'trade',
      gradient: ['#090B11', '#1A1F29', '#3A2A12'],
      topOrbBg: 'rgba(255,205,96,0.22)',
      topOrbShadow: '#FFCD60',
      bottomOrbBg: 'rgba(120,170,255,0.14)',
      bottomOrbShadow: '#7AAAFF',
      frameBorder: 'rgba(248,214,145,0.2)',
      badgeBg: 'rgba(255,205,96,0.10)',
      badgeBorder: 'rgba(255,220,142,0.22)',
      badgeText: '#FFE6B0',
      eyebrow: t('hire_share.theme.trade.eyebrow'),
      momentCopy: t('hire_share.theme.trade.moment'),
    };
  }

  if (/(tailor|mehndi|decor|decorator|photo|photographer|beauty|salon|artist|design)/.test(source)) {
    return {
      family: 'craft',
      gradient: ['#120814', '#24122A', '#3A1730'],
      topOrbBg: 'rgba(255,120,170,0.2)',
      topOrbShadow: '#FF78AA',
      bottomOrbBg: 'rgba(182,137,255,0.16)',
      bottomOrbShadow: '#B689FF',
      frameBorder: 'rgba(240,190,255,0.2)',
      badgeBg: 'rgba(255,120,170,0.1)',
      badgeBorder: 'rgba(255,157,196,0.22)',
      badgeText: '#FFD1E3',
      eyebrow: t('hire_share.theme.craft.eyebrow'),
      momentCopy: t('hire_share.theme.craft.moment'),
    };
  }

  return {
    family: 'default',
    gradient: ['#06070A', '#15111A', '#231822'],
    topOrbBg: 'rgba(194,140,48,0.20)',
    topOrbShadow: champagne[400],
    bottomOrbBg: 'rgba(32,143,115,0.14)',
    bottomOrbShadow: jade[400],
    frameBorder: 'rgba(244,224,188,0.18)',
    badgeBg: 'rgba(244,224,188,0.10)',
    badgeBorder: 'rgba(244,224,188,0.18)',
    badgeText: '#F4E0BC',
    eyebrow: t('hire_share.theme.default.eyebrow'),
    momentCopy: t('hire_share.theme.default.moment'),
  };
}

function resolveTradeTemplate(
  family: TradeFamily,
  variant: 'story' | 'square',
): TradeTemplate {
  if (family === 'kitchen') return { preTitleKind: 'skills' };
  if (family === 'driver') return { preTitleKind: 'route' };
  if (family === 'trade') return { preTitleKind: 'grid' };
  if (family === 'craft' && variant === 'story') return { preTitleKind: 'editorial' };
  return { preTitleKind: 'none' };
}

function buildTemplateTags(
  application: PublicApplication,
  user: PublicUser,
  area: string,
  payLine: string,
  startInfo: { relative: string } | null,
): string[] {
  const tags = [
    ...(user.skills.slice(0, 2).map(prettifySkill)),
    area,
    payLine,
    startInfo?.relative ?? null,
    ...(application.job?.skills?.slice(0, 1).map(prettifySkill) ?? []),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(tags));
}

function resolveShareToneCopy(opts: {
  tone: 'proud' | 'professional' | 'family';
  t: (key: string, options?: Record<string, unknown>) => string;
  userName: string;
  role: string;
  employer: string;
}): ShareToneCopy {
  const common = {
    brand: opts.t('hire_share.brand'),
    title: opts.t('hire_share.title'),
    subtitle: opts.t('hire_share.subtitle', {
      name: opts.userName,
      role: opts.role,
      employer: opts.employer,
    }),
    momentLabel: opts.t('hire_share.moment'),
    momentCopy: undefined,
    showMoment: true,
    showSkills: true,
    showTrust: true,
  } satisfies ShareToneCopy;

  if (opts.tone === 'professional') {
    return {
      ...common,
      brand: opts.t('hire_share.tone.professional.brand'),
      eyebrow: opts.t('hire_share.tone.professional.eyebrow'),
      title: opts.t('hire_share.tone.professional.title', { role: opts.role }),
      subtitle: opts.t('hire_share.tone.professional.subtitle', {
        name: opts.userName,
        employer: opts.employer,
      }),
      momentLabel: opts.t('hire_share.tone.professional.moment_label'),
      momentCopy: opts.t('hire_share.tone.professional.moment_copy'),
      showMoment: true,
      showSkills: true,
      showTrust: true,
    };
  }

  if (opts.tone === 'family') {
    return {
      ...common,
      brand: opts.t('hire_share.tone.family.brand'),
      eyebrow: opts.t('hire_share.tone.family.eyebrow'),
      title: opts.t('hire_share.tone.family.title'),
      subtitle: opts.t('hire_share.tone.family.subtitle', {
        name: opts.userName,
        role: opts.role,
        employer: opts.employer,
      }),
      momentLabel: opts.t('hire_share.tone.family.moment_label'),
      momentCopy: opts.t('hire_share.tone.family.moment_copy'),
      showMoment: true,
      showSkills: false,
      showTrust: false,
    };
  }

  return {
    ...common,
    brand: opts.t('hire_share.tone.proud.brand'),
    eyebrow: opts.t('hire_share.tone.proud.eyebrow'),
    momentCopy: opts.t('hire_share.tone.proud.moment_copy'),
  };
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: -2000,
    top: -2000,
    width: 1080,
  },
  hostStory: {
    height: 1920,
  },
  hostSquare: {
    height: 1080,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterStory: {
    paddingHorizontal: 72,
    paddingTop: 78,
    paddingBottom: 84,
  },
  posterSquare: {
    paddingHorizontal: 56,
    paddingTop: 48,
    paddingBottom: 48,
  },
  frame: {
    position: 'absolute',
    inset: 44,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: 'rgba(244,224,188,0.18)',
    backgroundColor: 'transparent',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  topOrb: {
    right: 62,
    top: 74,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(194,140,48,0.20)',
    shadowColor: champagne[400],
    shadowOpacity: 0.35,
    shadowRadius: 56,
  },
  bottomOrb: {
    left: 48,
    bottom: 220,
    width: 280,
    height: 280,
    backgroundColor: 'rgba(32,143,115,0.14)',
    shadowColor: jade[400],
    shadowOpacity: 0.28,
    shadowRadius: 68,
  },
  brand: {
    color: 'rgba(255,250,239,0.72)',
    fontSize: 24,
    letterSpacing: 5,
    fontWeight: '800',
  },
  hero: {},
  employerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 34,
  },
  employerAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,224,188,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(244,224,188,0.24)',
  },
  employerPhoto: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
  },
  employerAvatarText: {
    color: '#FFF9EF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  employerMeta: {
    gap: 6,
  },
  employerLabel: {
    color: 'rgba(255,249,239,0.54)',
    fontSize: 16,
    letterSpacing: 2.4,
    fontWeight: '800',
  },
  employerName: {
    color: '#FFF9EF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  employerTrustLine: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  templateChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  templateChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  templateChipText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  routeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 20,
    gap: 14,
  },
  routeStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  routeLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,249,239,0.26)',
  },
  routeStopText: {
    color: '#FFF9EF',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    flexShrink: 1,
  },
  blueprintPanel: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 20,
  },
  blueprintMetric: {
    flex: 1,
    gap: 8,
  },
  blueprintLabel: {
    fontSize: 15,
    letterSpacing: 2,
    fontWeight: '800',
  },
  blueprintValue: {
    color: '#FFF9EF',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  eyebrow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(244,224,188,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(244,224,188,0.18)',
    marginBottom: 26,
  },
  eyebrowText: {
    color: '#F4E0BC',
    fontSize: 18,
    letterSpacing: 2.6,
    fontWeight: '800',
  },
  title: {
    color: '#FFF9EF',
    letterSpacing: -4.5,
    fontWeight: '800',
    maxWidth: 760,
  },
  subtitle: {
    marginTop: 24,
    color: 'rgba(255,249,239,0.82)',
    fontWeight: '500',
    maxWidth: 840,
  },
  editorialHero: {
    gap: 22,
  },
  editorialTitleWrap: {
    gap: 0,
  },
  editorialTitle: {
    maxWidth: 720,
  },
  editorialQuoteCard: {
    alignSelf: 'flex-end',
    width: 420,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 22,
    gap: 10,
    marginTop: 8,
  },
  editorialQuoteMark: {
    fontSize: 24,
    fontWeight: '800',
  },
  editorialQuoteText: {
    color: '#FFF9EF',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
  },
  cards: {
    gap: 22,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 22,
  },
  card: {
    borderRadius: 34,
    paddingHorizontal: 30,
    paddingVertical: 30,
    backgroundColor: 'rgba(255,249,239,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,249,239,0.12)',
  },
  primaryCard: {
    backgroundColor: 'rgba(244,224,188,0.10)',
    borderColor: 'rgba(244,224,188,0.18)',
  },
  metricCard: {
    flex: 1,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  startCard: {
    minHeight: 150,
    justifyContent: 'space-between',
  },
  momentCard: {
    marginTop: 28,
  },
  momentCardSquare: {
    marginTop: 18,
  },
  cardLabel: {
    color: 'rgba(255,249,239,0.58)',
    fontSize: 17,
    letterSpacing: 2.4,
    fontWeight: '800',
    marginBottom: 14,
  },
  cardValue: {
    color: '#FFF9EF',
    fontWeight: '800',
  },
  cardCopy: {
    marginTop: 12,
    color: 'rgba(255,249,239,0.78)',
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '600',
  },
  momentCopy: {
    color: 'rgba(255,249,239,0.90)',
    fontWeight: '600',
  },
  metricValue: {
    color: '#FFF9EF',
    fontWeight: '800',
  },
  skillRow: {
    marginTop: 30,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  trustRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 16,
  },
  skillPill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,249,239,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,249,239,0.12)',
  },
  skillText: {
    color: '#FFF9EF',
    fontSize: 22,
    fontWeight: '700',
  },
  trustPill: {
    flex: 1,
    minHeight: 110,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: 'space-between',
  },
  trustValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  trustLabel: {
    color: 'rgba(255,249,239,0.58)',
    fontSize: 15,
    letterSpacing: 1.8,
    fontWeight: '800',
  },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 18,
  },
  footerSquare: {
    marginTop: 24,
  },
  workerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
    paddingRight: 20,
  },
  workerPhoto: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
  },
  workerPhotoFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  workerPhotoFallbackText: {
    color: '#FFF9EF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  workerMeta: {
    gap: 8,
    flexShrink: 1,
  },
  workerName: {
    color: '#FFF9EF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  footerBlock: {
    gap: 10,
  },
  footerLabel: {
    color: 'rgba(255,249,239,0.54)',
    fontSize: 18,
    letterSpacing: 2.2,
    fontWeight: '800',
  },
  footerValue: {
    color: '#FFF9EF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
});
