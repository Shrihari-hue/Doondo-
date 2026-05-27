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
   * When the email is associated with more than one account (a seeker
   * AND an employer signup on the same email), the server's first reply
   * is a "needsRoleChoice" envelope listing the roles to pick from. We
   * stash them here so the form re-renders into a role picker; tapping
   * a role re-submits login with `role` filled in.
   */
  const [roleChoices, setRoleChoices] = useState<UserRole[] | null>(null);

  async function performLogin(role?: UserRole) {
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
                : t('auth.login.eyebrow')}
            </Text>
            <Text variant="titleLarge" weight="medium">
              {roleChoices
                ? t('auth.login.role_picker_title')
                : t('auth.login.title')}
            </Text>
            {roleChoices && (
              <Text variant="footnote" tone="secondary" style={{ marginTop: spacing.xs }}>
                {t('auth.login.role_picker_subtitle')}
              </Text>
            )}
          </View>

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
                  label={submitting ? t('auth.login.cta_signing_in') : t('auth.login.cta_signin')}
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
