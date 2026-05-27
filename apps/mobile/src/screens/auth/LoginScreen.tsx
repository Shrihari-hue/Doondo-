import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /**
   * Which side the user is signing in to — explicitly chosen via the
   * segmented control at the top of the form. Default 'seeker' because
   * job-seekers are the dominant audience by a wide margin; the toggle
   * is a single tap away for employers.
   *
   * This is the SAME `role` the server's loginSchema accepts. Passing it
   * up front means the "ambiguous email → pick a role" branch of the
   * server response almost never fires for the typical user (they've
   * already told us which side they meant), and incorrect-role attempts
   * fail closed as plain 'invalid credentials' rather than leaking that
   * a different role for that email exists.
   */
  const [selectedRole, setSelectedRole] = useState<UserRole>('seeker');

  /**
   * Fallback safety net: if the user signed in WITHOUT a role somehow
   * (e.g. autofill / password manager bypassing our toggle in a weird
   * way) and the server still says the email is ambiguous, we surface
   * the inline role picker. With the upfront toggle this should be a
   * very rare path.
   */
  const [roleChoices, setRoleChoices] = useState<UserRole[] | null>(null);

  async function performLogin(role?: UserRole) {
    setSubmitting(true);
    try {
      // `role` is set when the inline picker (server-driven disambiguation)
      // chose for us; otherwise we fall back to the explicit toggle at the
      // top of the form. Either way the server gets a definite role.
      const effectiveRole = role ?? selectedRole;
      const result = await authApi.login({
        email: email.trim(),
        password,
        role: effectiveRole,
      });
      if (isLoginRoleChoice(result)) {
        // Server says this email has multiple accounts — show the picker
        // and wait for the user to choose. We do NOT clear the password
        // field so the second submit is one tap, not a full re-entry.
        haptic('selection');
        setRoleChoices(result.availableRoles);
        return;
      }
      await setSession(result);
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

    if (!email.trim() || !password) {
      setFieldErrors({
        email: !email.trim() ? t('auth.login.err_email_required') : undefined,
        password: !password ? t('auth.login.err_password_required') : undefined,
      });
      return;
    }

    await performLogin();
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
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {roleChoices
                ? t('auth.login.role_picker_eyebrow')
                : selectedRole === 'employer'
                  ? t('auth.login.eyebrow_employer')
                  : t('auth.login.eyebrow_seeker')}
            </Text>
            <Text variant="titleLarge" weight="medium">
              {roleChoices
                ? t('auth.login.role_picker_title')
                : selectedRole === 'employer'
                  ? t('auth.login.title_employer')
                  : t('auth.login.title_seeker')}
            </Text>
            {roleChoices && (
              <Text variant="footnote" tone="secondary" style={{ marginTop: spacing.xs }}>
                {t('auth.login.role_picker_subtitle')}
              </Text>
            )}
          </View>

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
                      ? theme.brand.heroSubtle
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

              <View style={{ gap: spacing.md }}>
                <Button
                  label={
                    submitting
                      ? t('auth.login.cta_signing_in')
                      : selectedRole === 'employer'
                        ? t('auth.login.cta_signin_employer')
                        : t('auth.login.cta_signin_seeker')
                  }
                  onPress={onSubmit}
                  disabled={submitting}
                />
                <Button
                  label={t('auth.login.cta_forgot')}
                  variant="ghost"
                  onPress={() => navigation.navigate('ForgotPassword')}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
                <Text variant="footnote" tone="secondary">
                  {t('auth.login.no_account')}
                </Text>
                <Text
                  variant="footnote"
                  weight="medium"
                  tone="hero"
                  onPress={() => navigation.navigate('Signup')}
                >
                  {t('auth.login.create_one')}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
// Segmented control that asks the user which side of Doondo they're
// signing in to. Two pills, side by side, with a sliding selected state.
// Kept file-local because the styling is tightly tuned to the dark
// login screen — if a second screen ever needs the same control we can
// promote it to /components.
//
// A11y: each pill is its own button with role+selected state so VoiceOver
// reads "Job seeker, selected, button" or "Employer, not selected, button".

interface RoleToggleProps {
  value: UserRole;
  onChange: (next: UserRole) => void;
}

function RoleToggle({ value, onChange }: RoleToggleProps) {
  const { theme } = useTheme();
  const t = useTranslate();
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: radii.pill,
        backgroundColor: theme.bg.muted,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        gap: 4,
      }}
      accessibilityRole="tablist"
    >
      <RoleSegment
        label={t('auth.login.role_toggle_seeker')}
        icon="👷"
        active={value === 'seeker'}
        onPress={() => onChange('seeker')}
      />
      <RoleSegment
        label={t('auth.login.role_toggle_employer')}
        icon="🏢"
        active={value === 'employer'}
        onPress={() => onChange('employer')}
      />
    </View>
  );
}

interface RoleSegmentProps {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}

function RoleSegment({ label, icon, active, onPress }: RoleSegmentProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radii.pill,
        backgroundColor: active ? theme.brand.hero : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 14 }} allowFontScaling={false}>
        {icon}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? '#FFFFFF' : theme.text.secondary,
          letterSpacing: -0.1,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
