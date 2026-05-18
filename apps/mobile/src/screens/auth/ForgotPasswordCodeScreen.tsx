import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPasswordCode'>;
type CodeRoute = RouteProp<AuthStackParamList, 'ForgotPasswordCode'>;

/**
 * ForgotPasswordCodeScreen — step 2 of the password-reset flow.
 *
 * The phone we navigate in with is the canonical version the backend
 * returned from /auth/forgot-password, so we can show it back to the user
 * verbatim ("Code sent to +91 9876543210") without re-parsing.
 *
 * On a correct code, the backend mints a 15-minute reset token (JWT) which
 * we hand to ResetPassword to actually change the password. The user never
 * sees that token — it lives in route params.
 */
export function ForgotPasswordCodeScreen() {
  const navigation = useNavigation<Nav>();
  const { phone } = useRoute<CodeRoute>().params;
  const t = useTranslate();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setCodeError(null);

    const trimmed = code.trim();
    if (!/^[0-9]{6}$/.test(trimmed)) {
      setCodeError(t('auth.forgot_code.err_code_invalid'));
      return;
    }

    setSubmitting(true);
    try {
      const { resetToken } = await authApi.verifyResetCode(phone, trimmed);
      haptic('success');
      navigation.navigate('ResetPassword', { phone, resetToken });
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'VERIFICATION_OTP_INVALID':
            setCodeError(t('auth.forgot_code.err_code_wrong'));
            break;
          case 'VERIFICATION_OTP_EXPIRED':
            setFormError(t('auth.forgot_code.err_code_expired'));
            break;
          case 'VERIFICATION_OTP_TOO_MANY':
            setFormError(t('auth.forgot_code.err_code_too_many'));
            break;
          case 'VERIFICATION_OTP_NOT_FOUND':
            setFormError(t('auth.forgot_code.err_code_not_found'));
            break;
          case 'RATE_LIMITED':
            setFormError(t('auth.forgot_code.err_rate_limited'));
            break;
          default:
            setFormError(err.message);
        }
      } else {
        setFormError(t('auth.forgot_code.err_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (resending) return;
    setFormError(null);
    setCodeError(null);
    setResending(true);
    try {
      await authApi.forgotPassword(phone);
      haptic('selection');
      setCode('');
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        setFormError(t('auth.forgot_code.err_resend_rate'));
      } else {
        setFormError(t('auth.forgot_code.err_resend_generic'));
      }
    } finally {
      setResending(false);
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
            paddingTop: spacing['5xl'],
            paddingBottom: spacing['4xl'],
            gap: spacing['2xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {t('auth.forgot_code.eyebrow')}
            </Text>
            <Text variant="titleLarge" weight="medium">
              {t('auth.forgot_code.title')}
            </Text>
            <Text variant="body" tone="secondary">
              {t('auth.forgot_code.subtitle', { phone })}
            </Text>
          </View>

          <FormError message={formError} />

          <TextField
            label={t('auth.forgot_code.code_label')}
            value={code}
            onChangeText={(v) => {
              // Numeric-only, max 6 digits — the keyboard already does this
              // most of the time but iOS autofill sometimes pastes spaces.
              setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
              if (codeError) setCodeError(null);
            }}
            placeholder={t('auth.forgot_code.code_placeholder')}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            error={codeError}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />

          <View style={{ gap: spacing.md }}>
            <Button
              label={submitting ? t('auth.forgot_code.cta_verifying') : t('auth.forgot_code.cta_verify')}
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label={resending ? t('auth.forgot_code.cta_resending') : t('auth.forgot_code.cta_resend')}
              variant="secondary"
              onPress={onResend}
              disabled={resending || submitting}
            />
            <Button
              label={t('auth.forgot_code.cta_different_number')}
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
