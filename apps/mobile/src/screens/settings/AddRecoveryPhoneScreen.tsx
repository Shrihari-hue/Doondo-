/**
 * AddRecoveryPhoneScreen — backfill a phone number for accounts that
 * existed before phone became required at signup.
 *
 * Without a phone on file these users can't recover their account through
 * the new SMS-based reset flow. This modal walks them through the same OTP
 * step the verification flow uses (it goes through the same
 * /verification/phone/* endpoints), but stops short of the selfie capture
 * because the goal here is recovery, not the gold ★.
 *
 * A successful save updates the user record in the auth store so the
 * parent profile screen immediately reflects the new phone and stops
 * showing the "Add recovery phone" nudge.
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError, Card } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { verificationApi } from '@/api/verification.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'AddRecoveryPhone'>;
type Step = 'phone' | 'code' | 'done';

export function AddRecoveryPhoneScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [canonicalPhone, setCanonicalPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: (p: string) => verificationApi.startPhone(p),
    onSuccess: ({ phone: canonical }) => {
      haptic('selection');
      setCanonicalPhone(canonical);
      setCode('');
      setStep('code');
      setFormError(null);
    },
    onError: (err) => {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED') {
          setFormError('Too many code requests. Try again in a minute.');
        } else if (err.code === 'VERIFICATION_ALREADY_VERIFIED') {
          // Edge case: user is already fully verified but somehow lost
          // their phone. Send them through the regular Verification flow
          // (or contact support) — we don't overwrite a verified phone here.
          setFormError(
            'This account already has a verified phone. Contact support if you need to change it.',
          );
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Could not send the code. Try again in a moment.');
      }
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      verificationApi.verifyPhone(input.phone, input.code),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      // Updated user comes back with phone + phoneVerifiedAt set; push to
      // the store so ProfileScreen reflects it without a manual refetch.
      setStore((s) => ({ ...s, user: updated }));
      setStep('done');
      setFormError(null);
    },
    onError: (err) => {
      haptic('error');
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'VERIFICATION_OTP_INVALID':
            setCodeError('That code is incorrect. Try again.');
            break;
          case 'VERIFICATION_OTP_EXPIRED':
            setFormError('This code has expired. Send a new one.');
            break;
          case 'VERIFICATION_OTP_TOO_MANY':
            setFormError('Too many wrong attempts. Send a new code.');
            break;
          case 'VERIFICATION_OTP_NOT_FOUND':
            setFormError('No active code. Send a new one.');
            break;
          default:
            setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    },
  });

  function onSendCode() {
    setPhoneError(null);
    setFormError(null);
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError('Phone number is required');
      return;
    }
    if (!/^\+?[0-9\s-]{6,20}$/.test(trimmed)) {
      setPhoneError('Enter a valid phone number');
      return;
    }
    startMutation.mutate(trimmed);
  }

  function onVerify() {
    setCodeError(null);
    setFormError(null);
    if (!canonicalPhone) return;
    const trimmed = code.trim();
    if (!/^[0-9]{6}$/.test(trimmed)) {
      setCodeError('Enter the 6-digit code');
      return;
    }
    verifyMutation.mutate({ phone: canonicalPhone, code: trimmed });
  }

  if (step === 'done') {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            padding: spacing.xl,
            paddingTop: spacing['5xl'],
            gap: spacing['2xl'],
          }}
        >
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              ALL SET
            </Text>
            <Text variant="titleLarge" weight="medium">
              Recovery phone added
            </Text>
          </View>
          <Card>
            <Text variant="body" tone="secondary">
              {canonicalPhone ?? phone} is now on your account. If you ever
              forget your password we'll send a reset code here.
            </Text>
          </Card>
          <Button label="Done" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
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
              ACCOUNT RECOVERY
            </Text>
            <Text variant="titleLarge" weight="medium">
              {step === 'phone' ? 'Add a recovery phone' : 'Enter the code'}
            </Text>
            <Text variant="body" tone="secondary">
              {step === 'phone'
                ? "We'll send a 6-digit code to confirm it's yours, then save it for password resets."
                : `We sent a code to ${canonicalPhone}. It expires in 10 minutes.`}
            </Text>
          </View>

          <FormError message={formError} />

          {step === 'phone' ? (
            <>
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
                onSubmitEditing={onSendCode}
              />
              <View style={{ gap: spacing.md }}>
                <Button
                  label={startMutation.isPending ? 'Sending code…' : 'Send code'}
                  onPress={onSendCode}
                  disabled={startMutation.isPending}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => navigation.goBack()}
                />
              </View>
            </>
          ) : (
            <>
              <TextField
                label="6-digit code"
                value={code}
                onChangeText={(v) => {
                  setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                  if (codeError) setCodeError(null);
                }}
                placeholder="123456"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                error={codeError}
                returnKeyType="done"
                onSubmitEditing={onVerify}
              />
              <View style={{ gap: spacing.md }}>
                <Button
                  label={verifyMutation.isPending ? 'Verifying…' : 'Confirm phone'}
                  onPress={onVerify}
                  disabled={verifyMutation.isPending}
                />
                <Button
                  label={startMutation.isPending ? 'Sending…' : 'Resend code'}
                  variant="secondary"
                  onPress={() => canonicalPhone && startMutation.mutate(canonicalPhone)}
                  disabled={startMutation.isPending || verifyMutation.isPending}
                />
                <Button
                  label="Use a different number"
                  variant="ghost"
                  onPress={() => {
                    setStep('phone');
                    setCode('');
                    setCanonicalPhone(null);
                  }}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
