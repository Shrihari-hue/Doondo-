import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
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
      setPhoneError('Phone number is required');
      return;
    }
    if (!/^\+?[0-9\s-]{6,20}$/.test(trimmed)) {
      setPhoneError('Enter a valid phone number');
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
          setFormError('Too many reset requests. Try again in a minute.');
        } else if (err.code === 'VALIDATION_FAILED' && err.validationIssues) {
          const phoneIssue = err.validationIssues.find(
            (i) => i.path[i.path.length - 1] === 'phone',
          );
          setPhoneError(phoneIssue?.message ?? 'Enter a valid phone number');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
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
              RESET PASSWORD
            </Text>
            <Text variant="titleLarge" weight="medium">
              Enter your phone
            </Text>
            <Text variant="body" tone="secondary">
              We'll text a 6-digit code to the number on your account.
            </Text>
          </View>

          <FormError message={formError} />

          <TextField
            label="Phone"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              if (phoneError) setPhoneError(null);
            }}
            placeholder="+91 9876543210"
            autoComplete="tel"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={phoneError}
            returnKeyType="send"
            onSubmitEditing={onSubmit}
          />

          <View style={{ gap: spacing.md }}>
            <Button
              label={submitting ? 'Sending code…' : 'Send code'}
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label="Back to sign in"
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
