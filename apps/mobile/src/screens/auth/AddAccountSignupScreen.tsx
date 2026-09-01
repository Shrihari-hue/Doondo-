/**
 * AddAccountSignupScreen — add a second account (typically Employer)
 * without ejecting the account that's already signed in.
 *
 * Two modes, toggled by a footer link:
 *   - 'signup' — create a brand-new account (name, email, password,
 *     phone). Role is locked to the route param (typically 'employer'),
 *     chosen when the user tapped "Add Employer account" in the switcher.
 *   - 'login'  — sign into an account the user already has elsewhere
 *     (email + password). Role-agnostic: whatever that account already
 *     is. This covers the "I reinstalled / I made it on another phone"
 *     case so the worker doesn't have to create a duplicate.
 *
 * Both paths call auth.addAccount() — NOT setSession(). The new account
 * is pushed into savedAccounts and becomes active, while the original
 * account's refresh token stays on file so the user can flip back from
 * the account switcher. Signup prefills name + phone from the active
 * user to cut typing for blue-collar workers.
 */

import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError, DoondoMark } from '@/components';
import { authApi, isLoginRoleChoice } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';
import type { UserRole } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'AddAccountSignup'>;
type Route = RouteProp<AppStackParamList, 'AddAccountSignup'>;

/**
 * signup   — create a brand-new account
 * login    — sign into an account the user already owns
 * recovery — server told us an account with this (email, role) already
 *            exists. The user almost certainly forgot they made it.
 *            Recovery offers two ways forward: "Sign in to that
 *            account" (flips to login mode) and "Forgot password?"
 *            (deep-links to the password-reset flow).
 */
type Mode = 'signup' | 'login' | 'recovery';

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

  const [mode, setMode] = useState<Mode>('signup');

  // Prefill from the active account — including email and phone. Backend
  // now indexes uniqueness on (email, role) instead of (email) alone, so
  // a seeker can create an employer account on the SAME email + phone
  // without colliding with their existing record. AUTH_EMAIL_TAKEN now
  // only fires when there's already an account with both this email AND
  // this role (i.e. true duplicate within a role).
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /** Flip between create-new and sign-in, clearing any stale errors. */
  function switchMode(next: Mode) {
    if (submitting) return;
    haptic('selection');
    setMode(next);
    setFormError(null);
    setFieldErrors({});
  }

  /** Create a brand-new account, then add it alongside the current one. */
  async function onSignup() {
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
      // account in savedAccounts so the user can switch back.
      await addAccount(result);
      haptic('success');
      // After addAccount switches the active session, the RootNavigator
      // swaps navigators. Pop ourselves so the modal doesn't sit on top.
      navigation.goBack();
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_EMAIL_TAKEN') {
          // The (email, role) combination already exists. Instead of
          // dead-ending the user on a static error string, flip into the
          // recovery sub-state — it offers them two clear next steps:
          // sign into the existing account, or reset its password.
          setMode('recovery');
          setFormError(null);
          setFieldErrors({});
          return;
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

  /** Sign into an account the user already owns, then add it alongside. */
  async function onLogin() {
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = t('auth.add_account_signup.err_email_required');
    if (!password) errors.password = t('auth.add_account_signup.err_password_required');
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // The add-account login is implicitly targeting the OTHER role from
      // the user's current account. That's almost always right: if I'm a
      // seeker adding an employer, my employer account on this email is
      // what I want to log into. Passing `role` up front also avoids the
      // needsRoleChoice branch entirely in the common case. The current
      // user's role is filtered out below.
      const targetRole: UserRole = user?.role === 'employer' ? 'seeker' : 'employer';
      const result = await authApi.login({
        email: email.trim(),
        password,
        role: targetRole,
      });
      // If the server still came back ambiguous (e.g. somehow the user is
      // signing into a third role we didn't anticipate), bail out with a
      // clear error — we don't render a picker on this screen because the
      // common case is a 2-role human and `targetRole` already covers it.
      if (isLoginRoleChoice(result)) {
        setFormError(t('auth.add_account_signup.err_invalid_credentials'));
        return;
      }
      // Same as signup: addAccount keeps the current account on file and
      // switches the active session to the one we just signed into.
      await addAccount(result);
      haptic('success');
      navigation.goBack();
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_INVALID_CREDENTIALS') {
          setFormError(t('auth.add_account_signup.err_invalid_credentials'));
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

  const isLogin = mode === 'login';
  const isRecovery = mode === 'recovery';
  const onSubmit = isLogin ? onLogin : onSignup;

  /**
   * From the recovery panel, flipping into login mode preserves the
   * email the user typed and the password (in case they remembered it
   * after all). Password is the common case for "wait actually I do
   * know it"; we don't clear it.
   */
  function recoverViaSignIn() {
    haptic('selection');
    setMode('login');
    setFormError(null);
    setFieldErrors({});
  }

  /**
   * From the recovery panel (or the login mode footer), navigate to the
   * password-reset stack. We prefill `phone` on the ForgotPassword
   * screen via param when it accepts one; today it doesn't, so the user
   * types the phone again. A future iteration can pass it through.
   */
  function recoverViaForgotPassword() {
    haptic('selection');
    navigation.navigate('ForgotPassword');
  }

  const heroTitle = isRecovery
    ? isEmployer
      ? t('auth.add_account_signup.recovery_title_employer')
      : t('auth.add_account_signup.recovery_title_default')
    : isLogin
      ? t('auth.add_account_signup.login_title')
      : isEmployer
        ? t('auth.add_account_signup.title_employer')
        : t('auth.add_account_signup.title_default');

  const heroEyebrow = isRecovery
    ? t('auth.add_account_signup.recovery_eyebrow')
    : isLogin
      ? t('auth.add_account_signup.login_eyebrow')
      : isEmployer
        ? t('auth.add_account_signup.eyebrow_employer')
        : t('auth.add_account_signup.eyebrow_default');

  const heroSubtitle = isRecovery
    ? t('auth.add_account_signup.recovery_subtitle', { email: email.trim() })
    : isLogin
      ? t('auth.add_account_signup.login_subtitle')
      : user?.role === 'seeker'
        ? t('auth.add_account_signup.subtitle_seeker')
        : t('auth.add_account_signup.subtitle_default');

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
                {heroTitle}
              </Text>
              <Text variant="caption" style={{ letterSpacing: 1.2, color: theme.brand.primaryOnDark }}>
                {heroEyebrow}
              </Text>
              <Text
                variant="footnote"
                style={{ marginTop: spacing.xs, color: 'rgba(255,255,255,0.75)' }}
              >
                {heroSubtitle}
              </Text>
            </View>
          </LinearGradient>

          {/* ─── Recovery panel ───────────────────────────────────────
              Shown only after the server rejected signup with
              AUTH_EMAIL_TAKEN. Replaces the form with two clear
              actions so the user is never stuck on a static error. */}
          {isRecovery && (
            <View
              style={{
                padding: spacing.lg,
                borderRadius: radii.lg,
                backgroundColor: 'rgba(59,130,246,0.12)',
                borderWidth: 0.5,
                borderColor: 'rgba(96,165,250,0.35)',
                gap: spacing.md,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Feather name="info" size={16} color={theme.brand.primaryOnDark} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.brand.primaryOnDark, flex: 1 }}>
                  {t('auth.add_account_signup.recovery_card_title')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}>
                {t('auth.add_account_signup.recovery_card_body')}
              </Text>

              <Pressable onPress={recoverViaSignIn} style={{ opacity: 1 }}>
                <LinearGradient
                  colors={theme.brand.primaryGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    paddingVertical: spacing.md,
                    borderRadius: radii.pill,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: theme.text.onBrand, fontSize: 15, fontWeight: '700' }}>
                    {isEmployer
                      ? t('auth.add_account_signup.recovery_signin_employer')
                      : t('auth.add_account_signup.recovery_signin_default')}
                  </Text>
                </LinearGradient>
              </Pressable>
              <Button
                label={t('auth.add_account_signup.recovery_forgot')}
                variant="ghost"
                onPress={recoverViaForgotPassword}
              />
              <Button
                label={t('auth.add_account_signup.recovery_back')}
                variant="ghost"
                onPress={() => {
                  haptic('selection');
                  setMode('signup');
                }}
              />
            </View>
          )}

          {/* Context banner — only when creating a new account. */}
          {!isLogin && !isRecovery && (
            <View
              style={{
                padding: spacing.md,
                borderRadius: radii.md,
                backgroundColor: 'rgba(59,130,246,0.12)',
                borderWidth: 0.5,
                borderColor: 'rgba(96,165,250,0.35)',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.brand.primaryOnDark }}>
                {t('auth.add_account_signup.banner_title')}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                {t('auth.add_account_signup.banner_body')}
              </Text>
            </View>
          )}

          {!isRecovery && <FormError message={formError} />}

          {!isRecovery && (
            <View style={{ gap: spacing.lg }}>
              {/* Name + phone are only needed when creating a new account.
                  In login mode the existing account already has them. */}
              {!isLogin && (
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
              )}
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
                helper={isLogin ? undefined : t('auth.add_account_signup.email_helper')}
              />
              <TextField
                label={t('auth.add_account_signup.password_label')}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (fieldErrors.password) setFieldErrors((s) => ({ ...s, password: undefined }));
                }}
                placeholder={
                  isLogin
                    ? t('auth.add_account_signup.password_label')
                    : t('auth.add_account_signup.password_placeholder')
                }
                autoCapitalize="none"
                autoComplete={isLogin ? 'current-password' : 'password-new'}
                textContentType={isLogin ? 'password' : 'newPassword'}
                passwordToggle
                error={fieldErrors.password ?? null}
              />
              {!isLogin && (
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
              )}
            </View>
          )}

          {!isRecovery && (
            <View style={{ gap: spacing.md }}>
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
                      ? isLogin
                        ? t('auth.add_account_signup.cta_signing_in')
                        : t('auth.add_account_signup.cta_creating')
                      : isLogin
                        ? t('auth.add_account_signup.cta_signin')
                        : isEmployer
                          ? t('auth.add_account_signup.cta_create_employer')
                          : t('auth.add_account_signup.cta_create_default')}
                  </Text>
                  {!submitting && <Feather name="arrow-right" size={18} color={theme.text.onBrand} />}
                </LinearGradient>
              </Pressable>
              {/* Forgot-password link — visible only in login mode. The
                  user is trying to sign into an account they already
                  own; if they don't remember the password they should
                  have a one-tap path to recovery. */}
              {isLogin && (
                <Button
                  label={t('auth.add_account_signup.cta_forgot')}
                  variant="ghost"
                  onPress={recoverViaForgotPassword}
                  disabled={submitting}
                />
              )}
              <Button
                label={t('auth.add_account_signup.cta_cancel')}
                variant="ghost"
                onPress={() => navigation.goBack()}
                disabled={submitting}
              />
            </View>
          )}

          {/* Mode toggle — switch between creating a new account and
              signing into one the worker already owns. */}
          {!isRecovery && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
              <Text variant="footnote" tone="secondary">
                {isLogin
                  ? t('auth.add_account_signup.no_account_q')
                  : t('auth.add_account_signup.have_account_q')}
              </Text>
              <Text
                variant="footnote"
                weight="medium"
                tone="primary"
                onPress={() => switchMode(isLogin ? 'signup' : 'login')}
              >
                {isLogin
                  ? t('auth.add_account_signup.no_account_cta')
                  : t('auth.add_account_signup.have_account_cta')}
              </Text>
            </View>
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
              {isLogin
                ? t('auth.add_account_signup.cta_signing_in')
                : t('auth.add_account_signup.cta_creating')}
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
    if (key === 'name' || key === 'email' || key === 'password' || key === 'phone') {
      out[key] = i.message;
    }
  }
  return out;
}
