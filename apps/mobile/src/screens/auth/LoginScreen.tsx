import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError, DoondoMark } from '@/components';
import { authApi, isLoginRoleChoice } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AuthStackParamList } from '@/navigation/types';
import type { UserRole } from '@/api/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { setSession } = useAuth();
  const { theme } = useTheme();
  const t = useTranslate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /**
   * Which side the user is signing in to — explicitly chosen via the
   * segmented control at the top of the form. Starts as `null` (neither
   * pill highlighted) every time this screen mounts — the user must tap
   * one before it latches into a selected state, and submitting is
   * blocked until they do. Nothing carries over from wherever the user
   * navigated from, so backing out to the welcome page and returning
   * here always starts fresh with nothing pre-selected.
   *
   * This is the SAME `role` the server's loginSchema accepts. Requiring
   * an explicit choice up front means the "ambiguous email → pick a
   * role" branch of the server response almost never fires for the
   * typical user, and incorrect-role attempts fail closed as plain
   * 'invalid credentials' rather than leaking that a different role for
   * that email exists.
   */
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  /**
   * Fallback safety net: if the user signed in WITHOUT a role somehow
   * (e.g. autofill / password manager bypassing our toggle in a weird
   * way) and the server still says the email is ambiguous, we surface
   * the inline role picker. With the upfront toggle this should be a
   * very rare path.
   */
  const [roleChoices, setRoleChoices] = useState<UserRole[] | null>(null);

  async function performLogin(role: UserRole) {
    setSubmitting(true);
    try {
      const result = await authApi.login({
        email: email.trim(),
        password,
        role,
      });
      if (isLoginRoleChoice(result)) {
        // Server says this email has multiple accounts — show the picker
        // and wait for the user to choose. We do NOT clear the password
        // field so the second submit is one tap, not a full re-entry.
        haptic('selection');
        setRoleChoices(result.availableRoles);
        return;
      }
      await setSession(result, rememberMe);
      haptic('success');
      // RootNavigator will swap to AppNavigator automatically — no manual navigate.
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_INVALID_CREDENTIALS') {
          setFormError(t('auth.login.err_invalid_credentials'));
        } else if (err.code === 'RATE_LIMITED') {
          setFormError(t('auth.login.err_rate_limited'));
        } else if (err.validationIssues) {
          setFieldErrors(mapValidation(err.validationIssues));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t('auth.login.err_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    if (!selectedRole) {
      setFormError(t('auth.login.err_role_required'));
      return;
    }

    if (!email.trim() || !password) {
      setFieldErrors({
        email: !email.trim() ? t('auth.login.err_email_required') : undefined,
        password: !password ? t('auth.login.err_password_required') : undefined,
      });
      return;
    }

    await performLogin(selectedRole);
  }

  async function onPickRole(role: UserRole) {
    if (submitting) return;
    setFormError(null);
    await performLogin(role);
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
            paddingTop: spacing['5xl'],
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
                {roleChoices
                  ? t('auth.login.role_picker_title')
                  : selectedRole === 'employer'
                    ? t('auth.login.title_employer')
                    : selectedRole === 'seeker'
                      ? t('auth.login.title_seeker')
                      : t('auth.login.title')}
              </Text>
              <Text
                variant="caption"
                style={{ letterSpacing: 1.2, color: theme.brand.primaryOnDark }}
              >
                {roleChoices
                  ? t('auth.login.role_picker_eyebrow')
                  : selectedRole === 'employer'
                    ? t('auth.login.eyebrow_employer')
                    : selectedRole === 'seeker'
                      ? t('auth.login.eyebrow_seeker')
                      : t('auth.login.eyebrow')}
              </Text>
              {roleChoices && (
                <Text
                  variant="footnote"
                  style={{ marginTop: spacing.xs, color: 'rgba(255,255,255,0.85)' }}
                >
                  {t('auth.login.role_picker_subtitle')}
                </Text>
              )}
            </View>
          </LinearGradient>

          {/* Role toggle — explicit upfront choice of which side the user
              is signing in to. Hidden during the inline role-picker
              fallback (the picker IS the choice in that case). */}
          {!roleChoices && (
            <RoleToggle
              value={selectedRole}
              onChange={(next) => {
                if (submitting) return;
                haptic('selection');
                setSelectedRole(next);
                // Clear any prior "invalid credentials" — likely caused by
                // attempting the wrong role on a single-role email.
                setFormError(null);
              }}
            />
          )}

          <FormError message={formError} />

          {/* Role picker — only when the server told us this email has
              more than one account. The email + password the user just
              typed are reused; we just need to know WHICH role. */}
          {roleChoices ? (
            <View style={{ gap: spacing.md }}>
              {roleChoices.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => onPickRole(role)}
                  disabled={submitting}
                  style={({ pressed }) => ({
                    padding: spacing.lg,
                    borderRadius: radii.lg,
                    borderWidth: 0.5,
                    borderColor: theme.border.default,
                    backgroundColor: pressed
                      ? theme.brand.primarySubtle
                      : theme.bg.surface,
                    opacity: submitting ? 0.6 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.text.primary,
                    }}
                  >
                    {role === 'employer'
                      ? t('auth.login.role_picker_option_employer')
                      : t('auth.login.role_picker_option_seeker')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.text.tertiary,
                      marginTop: 2,
                    }}
                  >
                    {role === 'employer'
                      ? t('auth.login.role_picker_option_employer_subtitle')
                      : t('auth.login.role_picker_option_seeker_subtitle')}
                  </Text>
                </Pressable>
              ))}
              <Button
                label={t('auth.login.role_picker_cancel')}
                variant="ghost"
                onPress={() => {
                  setRoleChoices(null);
                  setFormError(null);
                }}
                disabled={submitting}
              />
            </View>
          ) : (
            <>
              <View style={{ gap: spacing.lg }}>
                <TextField
                  label={t('auth.login.email_label')}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (fieldErrors.email) setFieldErrors((s) => ({ ...s, email: undefined }));
                  }}
                  placeholder={t('auth.login.email_placeholder')}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  error={fieldErrors.email ?? null}
                  returnKeyType="next"
                />
                <TextField
                  label={t('auth.login.password_label')}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (fieldErrors.password) setFieldErrors((s) => ({ ...s, password: undefined }));
                  }}
                  placeholder={t('auth.login.password_placeholder')}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  autoCorrect={false}
                  textContentType="password"
                  passwordToggle
                  error={fieldErrors.password ?? null}
                  returnKeyType="done"
                  onSubmitEditing={onSubmit}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Pressable
                  onPress={() => setRememberMe((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberMe }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                  hitSlop={8}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: rememberMe ? theme.brand.primary : theme.border.default,
                      backgroundColor: rememberMe ? theme.brand.primary : 'transparent',
                    }}
                  >
                    {rememberMe && <Feather name="check" size={14} color={theme.text.onBrand} />}
                  </View>
                  <Text variant="footnote" tone="secondary">
                    {t('auth.login.remember_me')}
                  </Text>
                </Pressable>
                <Text
                  variant="footnote"
                  weight="medium"
                  tone="primary"
                  onPress={() => navigation.navigate('ForgotPassword')}
                >
                  {t('auth.login.cta_forgot')}
                </Text>
              </View>

              <Pressable onPress={onSubmit} disabled={submitting} style={{ opacity: submitting ? 0.7 : 1 }}>
                <LinearGradient
                  colors={theme.brand.primaryGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.sm,
                    borderRadius: radii.pill,
                    paddingVertical: spacing.lg,
                  }}
                >
                  <Text style={{ color: theme.text.onBrand, fontSize: 16, fontWeight: '700' }}>
                    {submitting
                      ? t('auth.login.cta_signing_in')
                      : selectedRole === 'employer'
                        ? t('auth.login.cta_signin_employer')
                        : selectedRole === 'seeker'
                          ? t('auth.login.cta_signin_seeker')
                          : t('auth.login.cta_signin')}
                  </Text>
                  {!submitting && <Feather name="arrow-right" size={18} color={theme.text.onBrand} />}
                </LinearGradient>
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.border.subtle }} />
                <Text variant="caption" tone="tertiary">
                  {t('auth.login.or_divider')}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.border.subtle }} />
              </View>

              {/* Visual only for now — no Google OAuth wired up in the app yet. */}
              <Pressable
                disabled
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                  paddingVertical: spacing.lg,
                  borderRadius: radii.pill,
                  backgroundColor: theme.bg.muted,
                  borderWidth: 1,
                  borderColor: theme.border.subtle,
                  opacity: 0.6,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#4285F4' }}>G</Text>
                <Text style={{ color: theme.text.primary, fontWeight: '600' }}>
                  {t('auth.login.continue_with_google')}
                </Text>
              </Pressable>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
                <Text variant="footnote" tone="secondary">
                  {t('auth.login.no_account')}
                </Text>
                <Text
                  variant="footnote"
                  weight="medium"
                  tone="primary"
                  onPress={() => navigation.navigate('Signup')}
                >
                  {t('auth.login.create_one')}
                </Text>
              </View>
            </>
          )}
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
              {t('auth.login.cta_signing_in')}
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function mapValidation(
  issues: { path: (string | number)[]; message: string }[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = i.path[i.path.length - 1];
    if (key === 'email' || key === 'password') out[key] = i.message;
  }
  return out;
}

// ─── RoleToggle ─────────────────────────────────────────────────────────────
//
// Two independent pill buttons side by side — seeker on the left,
// employer on the right. The unselected pill sits flat and muted; the
// selected one fills with a bright blue gradient and a soft glow so
// it's obvious at a glance which one is active. Kept file-local because
// the styling is tightly tuned to the login screen — if a second screen
// ever needs the same control we can promote it to /components.
//
// A11y: each pill is its own button with role+selected state so VoiceOver
// reads "Job seeker, selected, button" or "Employer, not selected, button".

interface RoleToggleProps {
  value: UserRole | null;
  onChange: (next: UserRole) => void;
}

function RoleToggle({ value, onChange }: RoleToggleProps) {
  const t = useTranslate();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }} accessibilityRole="tablist">
      <RolePill
        label={t('auth.login.role_toggle_seeker')}
        icon="user"
        active={value === 'seeker'}
        onPress={() => onChange('seeker')}
      />
      <RolePill
        label={t('auth.login.role_toggle_employer')}
        icon="briefcase"
        active={value === 'employer'}
        onPress={() => onChange('employer')}
      />
    </View>
  );
}

interface RolePillProps {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  active: boolean;
  onPress: () => void;
}

function RolePill({ label, icon, active, onPress }: RolePillProps) {
  const { theme } = useTheme();

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Feather name={icon} size={18} color={active ? theme.text.onBrand : theme.text.secondary} />
      <Text
        style={{
          fontSize: 15,
          fontWeight: '700',
          color: active ? '#FFFFFF' : theme.text.secondary,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
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
        // The glow lives on this OUTER plain View, not on the
        // LinearGradient itself — LinearGradient clips its own bounds to
        // paint the gradient inside the border radius, which silently
        // clips any shadow* style applied directly to it too (this is
        // why the "glow" the comments described was never actually
        // visible). A 1.5px lighter-blue ring on the gradient is the
        // second, shadow-independent cue that makes "selected" read
        // unmistakably even on Android builds where colored elevation
        // shadows don't render with much contrast.
        <View
          style={{
            borderRadius: radii.pill,
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
              borderRadius: radii.pill,
              paddingVertical: spacing.lg,
              alignItems: 'center',
              justifyContent: 'center',
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
            borderRadius: radii.pill,
            paddingVertical: spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
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
