import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
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
      setCodeError('Enter the 6-digit code');
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
            setCodeError('That code is incorrect. Try again.');
            break;
          case 'VERIFICATION_OTP_EXPIRED':
            setFormError('This code has expired. Request a new one.');
            break;
          case 'VERIFICATION_OTP_TOO_MANY':
            setFormError('Too many wrong attempts. Request a new code.');
            break;
          case 'VERIFICATION_OTP_NOT_FOUND':
            setFormError('No active code for this number. Request a new one.');
            break;
          case 'RATE_LIMITED':
            setFormError('Too many attempts. Try again in a minute.');
            break;
          default:
            setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
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
        setFormError('Slow down — wait a minute before requesting another code.');
      } else {
        setFormError('Could not resend the code. Try again in a moment.');
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
              RESET PASSWORD
            </Text>
            <Text variant="titleLarge" weight="medium">
              Enter the code
            </Text>
            <Text variant="body" tone="secondary">
              We sent a 6-digit code to {phone}. It expires in 10 minutes.
            </Text>
          </View>

          <FormError message={formError} />

          <TextField
            label="6-digit code"
            value={code}
            onChangeText={(v) => {
              // Numeric-only, max 6 digits — the keyboard already does this
              // most of the time but iOS autofill sometimes pastes spaces.
              setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
              if (codeError) setCodeError(null);
            }}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            error={codeError}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />

          <View style={{ gap: spacing.md }}>
            <Button
              label={submitting ? 'Verifying…' : 'Verify code'}
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label={resending ? 'Sending…' : 'Resend code'}
              variant="secondary"
              onPress={onResend}
              disabled={resending || submitting}
            />
            <Button
              label="Use a different number"
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
