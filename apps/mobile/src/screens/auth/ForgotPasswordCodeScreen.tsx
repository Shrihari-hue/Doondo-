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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError, DoondoMark } from '@/components';
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
            paddingTop: spacing['4xl'],
            paddingBottom: spacing['4xl'],
            gap: spacing['2xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={['#060B16', '#0D1B33', blue[900]]}
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
              <DoondoMark size={30} color={blue[300]} />
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="titleLarge" weight="medium" style={{ color: '#FFFFFF' }}>
                {t('auth.forgot_code.title')}
              </Text>
              <Text variant="caption" style={{ letterSpacing: 1.2, color: blue[300] }}>
                {t('auth.forgot_code.eyebrow')}
              </Text>
              <Text
                variant="footnote"
                style={{ marginTop: spacing.xs, color: 'rgba(255,255,255,0.75)' }}
              >
                {t('auth.forgot_code.subtitle', { phone })}
              </Text>
            </View>
          </LinearGradient>

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
            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              style={{ opacity: submitting ? 0.7 : 1 }}
            >
              <LinearGradient
                colors={[blue[500], blue[400]]}
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
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
                  {submitting ? t('auth.forgot_code.cta_verifying') : t('auth.forgot_code.cta_verify')}
                </Text>
                {!submitting && <Feather name="arrow-right" size={18} color="#FFFFFF" />}
              </LinearGradient>
            </Pressable>
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
              disabled={submitting}
            />
          </View>
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
              backgroundColor: '#0D1B33',
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.3)',
            }}
          >
            <ActivityIndicator size="large" color={blue[400]} />
            <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
              {t('auth.forgot_code.cta_verifying')}
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
