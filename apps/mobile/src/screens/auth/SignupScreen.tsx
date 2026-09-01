import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  UIManager,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, TextField, FormError, DoondoMark } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AuthStackParamList } from '@/navigation/types';
import type { UserRole, WorkType } from '@/api/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
type SignupRoute = RouteProp<AuthStackParamList, 'Signup'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: string;
  teamSize?: string;
}

export function SignupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<SignupRoute>();
  const { setSession } = useAuth();
  const { theme } = useTheme();
  const t = useTranslate();

  const initialRole: UserRole = route.params?.role ?? 'seeker';
  const initialWorkType: WorkType = route.params?.workType ?? 'solo';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(initialRole);
  const [workType, setWorkType] = useState<WorkType>(initialWorkType);
  const [teamSizeText, setTeamSizeText] = useState(
    route.params?.teamSize != null ? String(route.params.teamSize) : '2',
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /**
   * "Setting this up for someone else?" — many blue-collar workers will
   * have a literate family member install Doondo and create the account
   * on their behalf. The toggle doesn't change the data we collect: the
   * name/phone/email entered are still the worker's. What it does is
   * surface a banner reminding the assistant of that, plus a couple of
   * field-copy tweaks so they don't accidentally enter their own info.
   */
  const [assistedSetup, setAssistedSetup] = useState(false);

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    const errors: FieldErrors = {};
    if (!name.trim())
      errors.name = role === 'employer' ? t('auth.signup.err_name_employer') : t('auth.signup.err_name_seeker');
    if (!email.trim()) errors.email = t('auth.signup.err_email_required');
    if (!password) errors.password = t('auth.signup.err_password_required');
    else if (password.length < 8) errors.password = t('auth.signup.err_password_short');
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      errors.password = t('auth.signup.err_password_mix');
    // Phone is mandatory now — it's our password-reset channel. We do a
    // loose format check here and let the backend's full regex catch
    // anything weirder.
    if (!phone.trim()) {
      errors.phone = t('auth.signup.err_phone_required');
    } else if (!/^\+?[0-9\s-]{6,20}$/.test(phone.trim())) {
      errors.phone = t('auth.signup.err_phone_invalid');
    }
    if (role === 'seeker' && workType === 'team') {
      const teamSize = Number(teamSizeText);
      if (!Number.isFinite(teamSize) || teamSize < 2) {
        errors.teamSize = t('auth.signup.err_team_min');
      } else if (teamSize > 50) {
        errors.teamSize = t('auth.signup.err_team_max');
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        phone: phone.trim(),
        ...(role === 'seeker'
          ? {
              workType,
              ...(workType === 'team'
                ? { teamSize: clampTeamSize(teamSizeText) }
                : {}),
            }
          : {}),
      });
      await setSession(result);
      haptic('success');
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_EMAIL_TAKEN') {
          setFieldErrors({ email: t('auth.signup.err_email_taken') });
        } else if (err.code === 'RATE_LIMITED') {
          setFormError(t('auth.signup.err_rate_limited'));
        } else if (err.validationIssues) {
          setFieldErrors(mapValidation(err.validationIssues));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t('auth.signup.err_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingTop: spacing['4xl'],
            paddingBottom: spacing['4xl'],
            gap: spacing['2xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={theme.brand.primaryBannerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              borderRadius: radii.xl,
              padding: spacing.lg,
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.25)',
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: radii.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(59,130,246,0.16)',
                borderWidth: 1,
                borderColor: 'rgba(96,165,250,0.5)',
              }}
            >
              <DoondoMark size={30} color={theme.brand.primaryOnDark} />
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="titleLarge" weight="medium" style={{ color: theme.text.onBrand }}>
                {t('auth.signup.title')}
              </Text>
              <Text variant="caption" style={{ letterSpacing: 1.2, color: theme.brand.primaryOnDark }}>
                {t('auth.signup.eyebrow')}
              </Text>
            </View>
          </LinearGradient>

          <FormError message={formError} />

          <RoleToggle value={role} onChange={setRole} t={t} />

          {role === 'seeker' ? (
            <AssistedSetupToggle
              value={assistedSetup}
              onChange={(v) => {
                haptic('selection');
                setAssistedSetup(v);
              }}
              t={t}
            />
          ) : null}

          {role === 'seeker' ? (
            <WorkTypeSection
              workType={workType}
              teamSizeText={teamSizeText}
              teamSizeError={fieldErrors.teamSize ?? null}
              onWorkTypeChange={(next) => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setWorkType(next);
                if (fieldErrors.teamSize) {
                  setFieldErrors((state) => ({ ...state, teamSize: undefined }));
                }
              }}
              onTeamSizeChange={(next) => {
                setTeamSizeText(next);
                if (fieldErrors.teamSize) {
                  setFieldErrors((state) => ({ ...state, teamSize: undefined }));
                }
              }}
              t={t}
            />
          ) : null}

          <View style={{ gap: spacing.lg }}>
            <TextField
              label={assistedSetup ? t('auth.signup.name_label_worker') : t('auth.signup.name_label')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (fieldErrors.name) setFieldErrors((s) => ({ ...s, name: undefined }));
              }}
              placeholder={
                assistedSetup
                  ? t('auth.signup.name_placeholder_worker')
                  : role === 'seeker'
                    ? t('auth.signup.name_placeholder_seeker')
                    : t('auth.signup.name_placeholder_employer')
              }
              autoCapitalize="words"
              autoComplete="name"
              error={fieldErrors.name ?? null}
              helper={
                assistedSetup ? t('auth.signup.name_helper_assisted') : undefined
              }
            />
            <TextField
              label={t('auth.signup.email_label')}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((s) => ({ ...s, email: undefined }));
              }}
              placeholder={assistedSetup ? t('auth.signup.email_placeholder_worker') : t('auth.signup.email_placeholder')}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              error={fieldErrors.email ?? null}
              helper={
                assistedSetup
                  ? t('auth.signup.email_helper_assisted')
                  : undefined
              }
            />
            <TextField
              label={t('auth.signup.password_label')}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((s) => ({ ...s, password: undefined }));
              }}
              placeholder={t('auth.signup.password_placeholder')}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              passwordToggle
              error={fieldErrors.password ?? null}
              helper={
                assistedSetup
                  ? t('auth.signup.password_helper_assisted')
                  : undefined
              }
            />
            <TextField
              label={assistedSetup ? t('auth.signup.phone_label_worker') : t('auth.signup.phone_label')}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (fieldErrors.phone) setFieldErrors((s) => ({ ...s, phone: undefined }));
              }}
              placeholder={t('auth.signup.phone_placeholder')}
              autoComplete="tel"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              helper={
                assistedSetup
                  ? t('auth.signup.phone_helper_worker')
                  : t('auth.signup.phone_helper')
              }
              error={fieldErrors.phone ?? null}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              style={{ opacity: submitting ? 0.7 : 1 }}
            >
              <LinearGradient
                colors={theme.brand.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingVertical: spacing.md,
                  borderRadius: radii.lg,
                  alignItems: 'center',
                }}
              >
                <Text variant="bodyLarge" weight="medium" style={{ color: theme.text.onBrand }}>
                  {submitting ? t('auth.signup.cta_creating') : t('auth.signup.cta_create')}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
            <Text variant="footnote" tone="secondary">
              {t('auth.signup.have_account')}
            </Text>
            <Text
              variant="footnote"
              weight="medium"
              tone="primary"
              onPress={() => navigation.navigate('Login')}
            >
              {t('auth.signup.sign_in')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={submitting} transparent animationType="fade" statusBarTranslucent>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        >
          <View
            style={{
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing['2xl'],
              borderRadius: radii.xl,
              backgroundColor: theme.brand.primaryCard,
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.3)',
            }}
          >
            <ActivityIndicator size="large" color={theme.brand.primaryVivid} />
            <Text style={{ color: theme.text.onBrand, fontWeight: '600' }}>
              {t('auth.signup.cta_creating')}
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

interface WorkTypeSectionProps {
  workType: WorkType;
  teamSizeText: string;
  teamSizeError: string | null;
  onWorkTypeChange: (next: WorkType) => void;
  onTeamSizeChange: (next: string) => void;
}

/**
 * "Setting this up for someone else?" toggle. When on, the seeker
 * fields below relabel to "Worker's name / phone / email" and a small
 * banner explains who the account is for. The data we send to the
 * backend is identical — this is purely a copy/orientation aid for the
 * literate family member who's installing Doondo for a worker who
 * can't easily set it up themselves.
 */
function AssistedSetupToggle({
  value,
  onChange,
  t,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  t: TFn;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: spacing.sm,
        }}
      >
        <Text variant="body" weight="medium">
          {t('auth.signup.assisted_title')}
        </Text>

        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{
            false: theme.border.default,
            true: theme.brand.primary,
          }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={theme.border.default}
          accessibilityRole="switch"
          accessibilityState={{ checked: value }}
          accessibilityLabel={t('auth.signup.assisted_a11y')}
        />
      </View>

      <Text variant="footnote" tone="secondary">
        {t('auth.signup.assisted_body')}
      </Text>

      {value ? (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: theme.status.warningSubtle,
            borderWidth: 0.5,
            borderColor: theme.status.warningBorder,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 19, color: theme.status.warning }}>
            {t('auth.signup.assisted_banner')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function WorkTypeSection({
  workType,
  teamSizeText,
  teamSizeError,
  onWorkTypeChange,
  onTeamSizeChange,
  t,
}: WorkTypeSectionProps & { t: TFn }) {
  const options: Array<{ value: WorkType; label: string; helper: string; icon: FeatherIconName }> = [
    { value: 'solo', label: t('auth.signup.worktype_solo'), helper: t('auth.signup.worktype_solo_helper'), icon: 'user' },
    { value: 'team', label: t('auth.signup.worktype_team'), helper: t('auth.signup.worktype_team_helper'), icon: 'users' },
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary">
        {t('auth.signup.worktype_label')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }} accessibilityRole="tablist">
        {options.map((opt) => (
          <RolePill
            key={opt.value}
            label={opt.label}
            helper={opt.helper}
            icon={opt.icon}
            active={workType === opt.value}
            onPress={() => {
              haptic('selection');
              onWorkTypeChange(opt.value);
            }}
          />
        ))}
      </View>
      {workType === 'team' ? (
        <TextField
          label={t('auth.signup.team_size_label')}
          value={teamSizeText}
          onChangeText={(v) => onTeamSizeChange(v.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          placeholder={t('auth.signup.team_size_placeholder')}
          helper={t('auth.signup.team_size_helper')}
          error={teamSizeError}
        />
      ) : null}
    </View>
  );
}

function clampTeamSize(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(2, Math.min(50, Math.trunc(parsed)));
}

interface RoleToggleProps {
  value: UserRole;
  onChange: (next: UserRole) => void;
}

/**
 * Role toggle — two pills matching the same visual language as the Login
 * screen's role selector: flat muted pill when unselected, bright blue
 * gradient with a soft glow when selected. Kept file-local since the
 * Login screen's version is also file-local; if a third screen needs
 * this we can promote it to /components then.
 */
function RoleToggle({ value, onChange, t }: RoleToggleProps & { t: TFn }) {
  const options: { value: UserRole; label: string; icon: FeatherIconName }[] = [
    { value: 'seeker', label: t('auth.signup.role_seeker'), icon: 'user' },
    { value: 'employer', label: t('auth.signup.role_employer'), icon: 'briefcase' },
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary">
        {t('auth.signup.role_label')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }} accessibilityRole="tablist">
        {options.map((opt) => (
          <RolePill
            key={opt.value}
            label={opt.label}
            icon={opt.icon}
            active={value === opt.value}
            onPress={() => {
              haptic('selection');
              onChange(opt.value);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function RolePill({
  label,
  helper,
  icon,
  active,
  onPress,
}: {
  label: string;
  helper?: string;
  icon: FeatherIconName;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  const content = (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        }}
      >
        <Feather name={icon} size={18} color={active ? theme.text.onBrand : theme.text.secondary} />
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: active ? '#FFFFFF' : theme.text.primary,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {helper ? (
        <Text
          style={{
            fontSize: 12,
            marginTop: 4,
            textAlign: 'center',
            color: active ? 'rgba(255,255,255,0.85)' : theme.text.tertiary,
          }}
          numberOfLines={1}
        >
          {helper}
        </Text>
      ) : null}
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{ flex: 1 }}
    >
      {active ? (
        // See LoginScreen's RolePill for why the shadow lives on this
        // outer View rather than the LinearGradient itself.
        <View
          style={{
            borderRadius: radii.lg,
            shadowColor: theme.brand.primaryVivid,
            shadowOpacity: 0.5,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <LinearGradient
            colors={theme.brand.primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: radii.lg,
              padding: spacing.md,
              borderWidth: 1.5,
              borderColor: theme.brand.primaryOnDark,
            }}
          >
            {content}
          </LinearGradient>
        </View>
      ) : (
        <View
          style={{
            borderRadius: radii.lg,
            padding: spacing.md,
            backgroundColor: theme.bg.muted,
            borderWidth: 1,
            borderColor: theme.border.subtle,
          }}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

function mapValidation(
  issues: { path: (string | number)[]; message: string }[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = i.path[i.path.length - 1];
    if (key === 'name' || key === 'email' || key === 'password' || key === 'phone' || key === 'role') {
      out[key] = i.message;
    }
  }
  return out;
}
