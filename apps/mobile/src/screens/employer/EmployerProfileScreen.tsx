/**
 * EmployerProfileScreen — mirrors the seeker Profile shape.
 *
 * Identity header with avatar (tap to change photo), profile completion
 * card with the same 3D orb (color blends from coral → champagne with %),
 * sectioned cards for Business basics, Compliance (GSTIN), Location.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import {
  Screen,
  Text,
  Card,
  Pill,
  Button,
  TextField,
  Avatar,
  ThemeToggleCard,
  AccountSwitcherSheet,
  AccountSwitcherPill,
  AnimatedPressable,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { laborBudgetApi, type BudgetPeriod } from '@/api/laborBudget.api';
import { employerResponseApi, type ResponseSettings } from '@/api/employerResponse.api';
import { favoritesApi } from '@/api/favorites.api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { meApi } from '@/api/me.api';
import { pickProfilePhoto } from '@/lib/photo';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { ProfileCompletionOrb } from '../seeker/ProfileCompletionOrb';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here

export function EmployerProfileScreen() {
  const { theme } = useTheme();
  const { user, logout, savedAccounts } = useAuth();
  const setStore = useAuthStore.setState;
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const [photoError, setPhotoError] = useState<string | null>(null);

  /**
   * The smart pill (AccountSwitcherPill) below handles every press +
   * long-press case (quick-switch when there are exactly two accounts,
   * sheet for 3+, AddAccount signup for the single-account case). We
   * just own the sheet's visibility so the pill can ask us to open it.
   */
  const [switcherVisible, setSwitcherVisible] = useState(false);
  function onAddFromSheet() {
    // Sheet's footer wording reads "Add another account" when more than
    // one is saved; here we send them into the role they DON'T have.
    const missingRole = savedAccounts.some((a) => a.role === 'seeker')
      ? 'employer'
      : 'seeker';
    navigation.navigate('AddAccountSignup', { role: missingRole });
  }

  const photoMutation = useMutation({
    mutationFn: (dataUrl: string) => meApi.updateProfile({ photoUrl: dataUrl }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
    },
    onError: (err) => {
      haptic('error');
      setPhotoError(err instanceof Error ? err.message : t('employer.profile.photo_failed'));
    },
  });

  async function onChangePhoto() {
    setPhotoError(null);
    const picked = await pickProfilePhoto();
    if (!picked) return;
    photoMutation.mutate(picked.dataUrl);
  }

  if (!user) return null;

  const goEdit = (
    section: 'business_basics' | 'business_location' | 'basics' | 'location',
  ) => {
    haptic('selection');
    navigation.navigate('EditProfile', { section });
  };

  const businessTypeLabel = (
    {
      individual: t('employer.profile.business_type_individual'),
      shop: t('employer.profile.business_type_shop'),
      restaurant: t('employer.profile.business_type_restaurant'),
      salon: t('employer.profile.business_type_salon'),
      agency: t('employer.profile.business_type_agency'),
      startup: t('employer.profile.business_type_startup'),
      enterprise: t('employer.profile.business_type_enterprise'),
      other: t('employer.profile.business_type_other'),
    } as Record<string, string>
  )[user.businessType ?? ''] ?? null;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
        }}
      >
        {/* ─── Gradient hero banner ──────────────────────────────────── */}
        <LinearGradient
          colors={theme.brand.primaryImmersiveGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: spacing.lg, paddingBottom: spacing['2xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}
        >
          {/* Account switcher — white on gradient */}
          <View style={{ flexDirection: 'row' }}>
            <AccountSwitcherPill
              variant="onDark"
              onAddAccount={() =>
                navigation.navigate('AddAccountSignup', { role: 'seeker' })
              }
              onOpenSheet={() => setSwitcherVisible(true)}
            />
          </View>

          {/* Identity */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
              <Avatar
                name={user.companyName ?? user.name}
                photoUrl={user.photoUrl}
                size={84}
                premium={user.isVerified}
              />
            </Pressable>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.2 }}>
                {t('employer.profile.eyebrow')}
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text.onBrand }}>
                {user.companyName ?? user.name}
              </Text>
              <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                  {photoMutation.isPending
                    ? t('employer.profile.photo_updating')
                    : user.photoUrl
                      ? t('employer.profile.photo_change')
                      : t('employer.profile.photo_add')}
                </Text>
              </Pressable>
              {photoError && (
                <Text style={{ fontSize: 12, color: 'rgba(255,200,200,0.9)' }}>
                  {photoError}
                </Text>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
            {user.email}
          </Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: spacing.xl, gap: spacing['2xl'] }}>

        <FavoritedByStat t={t} />

        {/* Completion */}
        <Card premium={user.profileCompletion === 100}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <ProfileCompletionOrb completion={user.profileCompletion} size={110} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0 }}
              >
                {t('employer.profile.completion_eyebrow')}
              </Text>
              <Text variant="display" weight="medium" display>
                {user.profileCompletion}%
              </Text>
              <Text variant="footnote" tone="secondary">
                {user.profileCompletion < 100
                  ? t('employer.profile.completion_incomplete')
                  : t('employer.profile.completion_complete')}
              </Text>
            </View>
          </View>
        </Card>

        {/* Business basics */}
        <SectionCard
          label={t('employer.profile.section_business')}
          title={user.companyName ?? t('employer.profile.business_empty_title')}
          subtitle={businessTypeLabel ?? t('employer.profile.business_empty_subtitle')}
          onPress={() => goEdit('business_basics')}
          t={t}
        />

        {/* Compliance */}
        <SectionCard
          label={t('employer.profile.section_compliance')}
          title={user.gstin ?? t('employer.profile.gstin_empty_title')}
          subtitle={user.gstin ? t('employer.profile.gstin_set_subtitle') : t('employer.profile.gstin_empty_subtitle')}
          onPress={() => goEdit('business_basics')}
          t={t}
        />

        {/* Business Location */}
        <SectionCard
          label={t('employer.profile.section_location')}
          title={
            user.employerLocation?.city
              ? `${
                  user.employerLocation.area
                    ? user.employerLocation.area + ', '
                    : ''
                }${user.employerLocation.city}`
              : t('employer.profile.location_empty_title')
          }
          subtitle={
            user.employerLocation?.coordinates
              ? t('employer.profile.location_set_subtitle')
              : t('employer.profile.location_empty_subtitle')
          }
          onPress={() => goEdit('business_location')}
          t={t}
        />

        {/* Recovery phone — shown only for accounts that signed up before
            phone became required. Same OTP step the verification flow uses,
            but doesn't gate on selfie or GSTIN. */}
        {!user.phone ? (
          <AnimatedPressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('AddRecoveryPhone');
            }}
          >
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ gap: 2, flex: 1 }}>
                  <Text variant="bodyLarge" weight="medium">
                    {t('employer.profile.recovery_title')}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {t('employer.profile.recovery_body')}
                  </Text>
                </View>
                <Pill label={t('employer.profile.recovery_pill')} tone="info" />
              </View>
            </Card>
          </AnimatedPressable>
        ) : null}

        {/* Verification — tap to enter the OTP+selfie flow.
            Employers also need a valid GSTIN on file before the flow finalises. */}
        <AnimatedPressable
          onPress={() => {
            if (user.isVerified) return;
            haptic('selection');
            navigation.navigate('Verification');
          }}
        >
          <Card premium={user.isVerified}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ gap: 2, flex: 1 }}>
                <Text variant="bodyLarge" weight="medium">
                  {t('employer.profile.verification_title')}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {employerVerificationCopy(user, t)}
                </Text>
              </View>
              {user.isVerified ? (
                <Pill label={t('employer.profile.verification_verified_pill')} tone="premium" leading="★" />
              ) : user.verificationStatus === 'pending' ? (
                <Pill label={t('employer.profile.verification_continue')} tone="info" />
              ) : (
                <Pill label={t('employer.profile.verification_verify')} tone="info" />
              )}
            </View>
          </Card>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('QuickWorkHistory');
          }}
        >
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 2, flex: 1 }}>
                <Text variant="bodyLarge" weight="medium">
                  Quick Work history
                </Text>
                <Text variant="footnote" tone="secondary">
                  Requests you've posted — active, completed, cancelled
                </Text>
              </View>
              <Pill label="View" tone="info" />
            </View>
          </Card>
        </AnimatedPressable>

        <LaborBudgetCard t={t} />

        <ResponseSettingsCard t={t} />

        <ThemeToggleCard />

        <Button label={t('employer.profile.cta_signout')} variant="secondary" onPress={() => void logout()} />
        </View>
      </ScrollView>

      {/* Account switcher bottom sheet — same component the seeker
          profile uses, so we get identical behavior across roles. */}
      <AccountSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        onAddEmployer={onAddFromSheet}
      />
    </Screen>
  );
}

/**
 * Labor budget tracker — set a weekly/monthly wage ceiling and see
 * spend-to-date against it. Spend is summed live from paid payments, so
 * the bar is always current. Budget is guidance, not a gate — going over
 * just turns the bar amber, it never blocks anything.
 */
function LaborBudgetCard({ t }: { t: TFn }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('month');

  const query = useQuery({
    queryKey: ['labor-budget'],
    queryFn: () => laborBudgetApi.get(),
  });

  const mutation = useMutation({
    mutationFn: () =>
      laborBudgetApi.save(period, Math.round(Number(amount) * 100)),
    onSuccess: () => {
      haptic('success');
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['labor-budget'] });
    },
    onError: () => haptic('error'),
  });

  const data = query.data;
  const hasBudget = !!data?.budget;
  const spent = data?.spentPaise ?? 0;
  const cap = data?.budget?.amountPaise ?? 0;
  const pct = cap > 0 ? Math.min(1, spent / cap) : 0;
  const over = data?.overBudget ?? false;

  const beginEdit = () => {
    setPeriod(data?.budget?.period ?? 'month');
    setAmount(data?.budget ? String(Math.round(data.budget.amountPaise / 100)) : '');
    setEditing(true);
  };

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('employer.labor_budget.label')}
        </Text>

        {hasBudget && !editing ? (
          <>
            <Text variant="bodyLarge" weight="medium">
              {t('employer.labor_budget.spent_of', {
                spent: formatRupees(spent),
                cap: formatRupees(cap),
                period: t(`employer.labor_budget.period_${data!.budget!.period}`),
              })}
            </Text>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.border.default,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.round(pct * 100)}%`,
                  height: '100%',
                  backgroundColor: over ? theme.status.warning : BLUE,
                }}
              />
            </View>
            <Text variant="footnote" tone={over ? 'warning' : 'secondary'}>
              {over
                ? t('employer.labor_budget.over')
                : t('employer.labor_budget.remaining', {
                    remaining: formatRupees(data?.remainingPaise ?? 0),
                  })}
            </Text>
            <Button label={t('employer.labor_budget.edit')} variant="secondary" onPress={beginEdit} />
          </>
        ) : editing ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(['week', 'month'] as BudgetPeriod[]).map((p) => (
                <Pressable key={p} onPress={() => setPeriod(p)}>
                  <Pill
                    label={t(`employer.labor_budget.period_${p}`)}
                    tone={period === p ? 'hero' : 'neutral'}
                  />
                </Pressable>
              ))}
            </View>
            <TextField
              label={t('employer.labor_budget.amount_label')}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => mutation.mutate()}
                disabled={mutation.isPending || !amount}
                style={({ pressed }) => ({
                  backgroundColor: BLUE,
                  borderRadius: radii.lg,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.xl,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: mutation.isPending || !amount ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <Text
                  variant="bodyLarge"
                  weight="medium"
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{ textAlign: 'center', color: theme.text.onBrand }}
                >
                  {mutation.isPending ? t('employer.labor_budget.saving') : t('employer.labor_budget.save')}
                </Text>
              </Pressable>
              <Button
                label={t('employer.labor_budget.cancel')}
                variant="secondary"
                onPress={() => setEditing(false)}
              />
            </View>
          </>
        ) : (
          <>
            <Text variant="footnote" tone="secondary">
              {t('employer.labor_budget.spent_this_month', { spent: formatRupees(spent) })}
            </Text>
            <Button label={t('employer.labor_budget.set')} variant="secondary" onPress={beginEdit} />
          </>
        )}
      </View>
    </Card>
  );
}

/** "N workers favourited you" reputation signal. Hidden when zero. */
function FavoritedByStat({ t }: { t: TFn }) {
  const query = useQuery({
    queryKey: ['employer-favorited-count'],
    queryFn: () => favoritesApi.myCount(),
  });
  const count = query.data?.count ?? 0;
  if (count <= 0) return null;
  return (
    <Text variant="footnote" weight="medium" style={{ color: BLUE }}>
      {t('employer.profile.favorited_by', { n: count })}
    </Text>
  );
}

/** Whole-rupee label from a paise amount: 12345600 → "₹1,23,456". */
function formatRupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

/** "9 PM" / "7 AM" from a 24h hour. */
function hourLabel(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

/**
 * Response SLA & quiet hours — the employer declares when they're
 * reachable so the anti-ghost engine won't flag them overnight, plus an
 * optional auto-reply. The fair, employer-friendly side of accountability.
 */
function ResponseSettingsCard({ t }: { t: TFn }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ResponseSettings | null>(null);

  const query = useQuery({
    queryKey: ['employer-response'],
    queryFn: () => employerResponseApi.get(),
  });

  // Seed the local editable copy once the saved settings load.
  const settings = draft ?? query.data ?? null;

  const mutation = useMutation({
    mutationFn: (next: ResponseSettings) => employerResponseApi.save(next),
    onSuccess: (saved) => {
      haptic('success');
      setDraft(saved);
      void queryClient.invalidateQueries({ queryKey: ['employer-response'] });
    },
    onError: () => haptic('error'),
  });

  if (!settings) return null;

  const update = (patch: Partial<ResponseSettings>) =>
    setDraft({ ...settings, ...patch });
  const cycleHour = (key: 'quietStartHour' | 'quietEndHour') =>
    update({ [key]: (settings[key] + 1) % 24 } as Partial<ResponseSettings>);

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium">
              {t('employer.response_settings.title')}
            </Text>
            <Text variant="footnote" tone="secondary">
              {t('employer.response_settings.hint')}
            </Text>
          </View>
          <Switch
            value={settings.quietHoursEnabled}
            onValueChange={(v) => update({ quietHoursEnabled: v })}
            trackColor={{ true: BLUE, false: theme.border.strong }}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium">
              {t('employer.response_settings.sms_title')}
            </Text>
            <Text variant="footnote" tone="secondary">
              {t('employer.response_settings.sms_hint')}
            </Text>
          </View>
          <Switch
            value={settings.smsApplicantAlerts}
            onValueChange={(v) => update({ smsApplicantAlerts: v })}
            trackColor={{ true: BLUE, false: theme.border.strong }}
          />
        </View>

        {settings.quietHoursEnabled ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => cycleHour('quietStartHour')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: radii.md,
                  borderWidth: 0.5,
                  borderColor: theme.border.default,
                  alignItems: 'center',
                }}
              >
                <Text variant="caption" tone="tertiary">
                  {t('employer.response_settings.from')}
                </Text>
                <Text variant="bodyLarge" weight="medium">
                  {hourLabel(settings.quietStartHour)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => cycleHour('quietEndHour')}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: radii.md,
                  borderWidth: 0.5,
                  borderColor: theme.border.default,
                  alignItems: 'center',
                }}
              >
                <Text variant="caption" tone="tertiary">
                  {t('employer.response_settings.to')}
                </Text>
                <Text variant="bodyLarge" weight="medium">
                  {hourLabel(settings.quietEndHour)}
                </Text>
              </Pressable>
            </View>
            <TextField
              label={t('employer.response_settings.auto_reply_label')}
              value={settings.autoReply}
              onChangeText={(v) => update({ autoReply: v })}
              placeholder={t('employer.response_settings.auto_reply_ph')}
              multiline
              numberOfLines={2}
            />
          </>
        ) : null}

        <Button
          label={
            mutation.isPending
              ? t('employer.response_settings.saving')
              : t('employer.response_settings.save')
          }
          variant="secondary"
          onPress={() => mutation.mutate(settings)}
          disabled={mutation.isPending}
        />
      </View>
    </Card>
  );
}

function SectionCard({
  label,
  title,
  subtitle,
  onPress,
  t,
}: {
  label: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  t: TFn;
}) {
  return (
    <AnimatedPressable onPress={onPress}>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {label}
            </Text>
            <Text variant="footnote" style={{ color: BLUE }}>
              {t('employer.profile.edit')}
            </Text>
          </View>
          <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="footnote" tone="secondary">
            {subtitle}
          </Text>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

function employerVerificationCopy(
  user: {
    isVerified: boolean;
    verificationStatus: string;
    phoneVerified: boolean;
    gstin: string | null;
  },
  t: TFn,
): string {
  if (user.isVerified) return t('employer.profile.verification_verified_copy');
  if (user.verificationStatus === 'pending' && user.phoneVerified) {
    return user.gstin
      ? t('employer.profile.verification_pending_with_gstin')
      : t('employer.profile.verification_pending_no_gstin');
  }
  if (user.verificationStatus === 'rejected') {
    return t('employer.profile.verification_rejected');
  }
  return t('employer.profile.verification_default');
}
