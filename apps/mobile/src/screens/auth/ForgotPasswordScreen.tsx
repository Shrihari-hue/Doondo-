import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

/**
 * ForgotPasswordScreen — step 1 of the password-reset flow.
 *
 * The user enters the phone number on their account. If we find a match we
 * dispatch an OTP via SMS and push them to ForgotPasswordCode. The backend
 * always responds with the same envelope whether or not the number is
 * registered (anti-enumeration), so the UX flow is identical regardless.
 *
 * Subsequent steps:
 *   ForgotPasswordCode  — enter the 6-digit OTP
 *   ResetPassword       — pick a new password
 *
 * Existing users who signed up before phone became required can use the
 * "Add recovery phone" entry in their profile to put a number on file
 * (see AddRecoveryPhoneScreen).
 */
export function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const t = useTranslate();

  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setPhoneError(null);

    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError(t('auth.forgot.err_phone_required'));
      return;
    }
    if (!/^\+?[0-9\s-]{6,20}$/.test(trimmed)) {
      setPhoneError(t('auth.forgot.err_phone_invalid'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await authApi.forgotPassword(trimmed);
      haptic('selection');
      // Backend echoes the canonical phone — pass that through so the next
      // screen displays the exact number the SMS was sent to.
      navigation.navigate('ForgotPasswordCode', {
        phone: result.phone,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED') {
          setFormError(t('auth.forgot.err_rate_limited'));
        } else if (err.code === 'VALIDATION_FAILED' && err.validationIssues) {
          const phoneIssue = err.validationIssues.find(
            (i) => i.path[i.path.length - 1] === 'phone',
          );
          setPhoneError(phoneIssue?.message ?? t('auth.forgot.err_phone_invalid'));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t('auth.forgot.err_generic'));
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
            paddingTop: spacing['5xl'],
            paddingBottom: spacing['4xl'],
            gap: spacing['2xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {t('auth.forgot.eyebrow')}
            </Text>
            <Text variant="titleLarge" weight="medium">
              {t('auth.forgot.title')}
            </Text>
            <Text variant="body" tone="secondary">
              {t('auth.forgot.subtitle')}
            </Text>
          </View>

          <FormError message={formError} />

          <TextField
            label={t('auth.forgot.phone_label')}
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              if (phoneError) setPhoneError(null);
            }}
            placeholder={t('auth.forgot.phone_placeholder')}
            autoComplete="tel"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={phoneError}
            returnKeyType="send"
            onSubmitEditing={onSubmit}
          />

          <View style={{ gap: spacing.md }}>
            <Button
              label={submitting ? t('auth.forgot.cta_sending') : t('auth.forgot.cta_send')}
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label={t('auth.forgot.cta_back')}
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
