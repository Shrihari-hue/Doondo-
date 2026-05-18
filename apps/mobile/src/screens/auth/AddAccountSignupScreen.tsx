/**
 * AddAccountSignupScreen — sibling of SignupScreen, but for adding a
 * second account (typically Employer) without ejecting the seeker
 * session that's already signed in.
 *
 * Differences from SignupScreen:
 *   1. Lives in AppStack (modal) — the user is already authenticated
 *      when they reach this screen.
 *   2. Calls auth.addAccount() instead of setSession(). The store
 *      pushes the new account into savedAccounts and switches to it,
 *      keeping the original session's refresh token on file so the
 *      user can flip back.
 *   3. Role is locked to whatever was passed in (typically 'employer').
 *      No role toggle — they already chose by tapping "Add Employer
 *      account" in the switcher.
 *   4. Name + phone prefill from the currently active user, so the
 *      blue-collar worker who'd hit "Sign up twice" friction in the
 *      original flow gets a one-tap-ish onboarding.
 *
 * Login path: a second account might already exist (user re-installed,
 * etc.). The footer "Already have an Employer account?" CTA pushes the
 * Login flow with the same add-account semantics so signing in there
 * also calls addAccount rather than setSession. To keep this PR small
 * we route "I already have an account" to a stub that closes back to
 * the signup form for now — full add-account login is a small follow-up.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';
import type { UserRole } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'AddAccountSignup'>;
type Route = RouteProp<AppStackParamList, 'AddAccountSignup'>;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
}

export function AddAccountSignupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user, addAccount } = useAuth();
  const { theme } = useTheme();
  const t = useTranslate();

  const role: UserRole = route.params?.role ?? 'employer';
  const isEmployer = role === 'employer';

  // Prefill from the active account where it makes sense. We DON'T
  // prefill email — the new account needs a distinct email address per
  // backend rules, so prefilling it would set the user up to hit
  // AUTH_EMAIL_TAKEN on submit.
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    const errors: FieldErrors = {};
    if (!name.trim())
      errors.name = isEmployer
        ? t('auth.add_account_signup.err_name_employer')
        : t('auth.add_account_signup.err_name_default');
    if (!email.trim()) errors.email = t('auth.add_account_signup.err_email_required');
    if (!password) errors.password = t('auth.add_account_signup.err_password_required');
    else if (password.length < 8) errors.password = t('auth.add_account_signup.err_password_short');
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      errors.password = t('auth.add_account_signup.err_password_mix');
    if (!phone.trim()) {
      errors.phone = t('auth.add_account_signup.err_phone_required');
    } else if (!/^\+?[0-9\s-]{6,20}$/.test(phone.trim())) {
      errors.phone = t('auth.add_account_signup.err_phone_invalid');
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
      });
      // Critical: addAccount, NOT setSession — keeps the original
      // (seeker) account in savedAccounts so the user can switch back.
      await addAccount(result);
      haptic('success');
      // After addAccount switches the active session to the new
      // employer, the RootNavigator will swap to EmployerTabNavigator.
      // Pop ourselves so the modal doesn't sit on top.
      navigation.goBack();
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_EMAIL_TAKEN') {
          setFieldErrors({
            email: t('auth.add_account_signup.err_email_taken'),
          });
        } else if (err.code === 'RATE_LIMITED') {
          setFormError(t('auth.add_account_signup.err_rate_limited'));
        } else if (err.validationIssues) {
          setFieldErrors(mapValidation(err.validationIssues));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t('auth.add_account_signup.err_generic'));
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
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {isEmployer ? t('auth.add_account_signup.eyebrow_employer') : t('auth.add_account_signup.eyebrow_default')}
            </Text>
            <Text variant="titleLarge" weight="medium">
              {isEmployer ? t('auth.add_account_signup.title_employer') : t('auth.add_account_signup.title_default')}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ marginTop: spacing.xs }}>
              {user?.role === 'seeker' ? t('auth.add_account_signup.subtitle_seeker') : t('auth.add_account_signup.subtitle_default')}
            </Text>
          </View>

          {/* Context banner — what they're adding */}
          <View
            style={{
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: theme.brand.heroSubtle,
              borderWidth: 0.5,
              borderColor: theme.brand.heroBorder,
              gap: 2,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: theme.brand.hero,
              }}
            >
              {t('auth.add_account_signup.banner_title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.secondary }}>
              {t('auth.add_account_signup.banner_body')}
            </Text>
          </View>

          <FormError message={formError} />

          <View style={{ gap: spacing.lg }}>
            <TextField
              label={isEmployer ? t('auth.add_account_signup.name_label_employer') : t('auth.add_account_signup.name_label_default')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (fieldErrors.name) setFieldErrors((s) => ({ ...s, name: undefined }));
              }}
              placeholder={isEmployer ? t('auth.add_account_signup.name_placeholder_employer') : t('auth.add_account_signup.name_placeholder_default')}
              autoCapitalize="words"
              autoComplete="name"
              error={fieldErrors.name ?? null}
              helper={
                isEmployer
                  ? t('auth.add_account_signup.name_helper_employer')
                  : undefined
              }
            />
            <TextField
              label={t('auth.add_account_signup.email_label')}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((s) => ({ ...s, email: undefined }));
              }}
              placeholder={t('auth.add_account_signup.email_placeholder')}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              error={fieldErrors.email ?? null}
              helper={t('auth.add_account_signup.email_helper')}
            />
            <TextField
              label={t('auth.add_account_signup.password_label')}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((s) => ({ ...s, password: undefined }));
              }}
              placeholder={t('auth.add_account_signup.password_placeholder')}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              passwordToggle
              error={fieldErrors.password ?? null}
            />
            <TextField
              label={t('auth.add_account_signup.phone_label')}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (fieldErrors.phone) setFieldErrors((s) => ({ ...s, phone: undefined }));
              }}
              placeholder={t('auth.add_account_signup.phone_placeholder')}
              autoComplete="tel"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              helper={t('auth.add_account_signup.phone_helper')}
              error={fieldErrors.phone ?? null}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            <Button
              label={
                submitting
                  ? t('auth.add_account_signup.cta_creating')
                  : isEmployer
                    ? t('auth.add_account_signup.cta_create_employer')
                    : t('auth.add_account_signup.cta_create_default')
              }
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label={t('auth.add_account_signup.cta_cancel')}
              variant="ghost"
              onPress={() => navigation.goBack()}
              disabled={submitting}
            />
          </View>
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
    if (key === 'name' || key === 'email' || key === 'password' || key === 'phone') {
      out[key] = i.message;
    }
  }
  return out;
}
