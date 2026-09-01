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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError, DoondoMark } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useTheme } from '@/theme/useTheme';
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
  const { theme } = useTheme();
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
                {t('auth.forgot.title')}
              </Text>
              <Text variant="caption" style={{ letterSpacing: 1.2, color: theme.brand.primaryOnDark }}>
                {t('auth.forgot.eyebrow')}
              </Text>
              <Text
                variant="footnote"
                style={{ marginTop: spacing.xs, color: 'rgba(255,255,255,0.75)' }}
              >
                {t('auth.forgot.subtitle')}
              </Text>
            </View>
          </LinearGradient>

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
                  {submitting ? t('auth.forgot.cta_sending') : t('auth.forgot.cta_send')}
                </Text>
                {!submitting && <Feather name="arrow-right" size={18} color={theme.text.onBrand} />}
              </LinearGradient>
            </Pressable>
            <Button
              label={t('auth.forgot.cta_back')}
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
              backgroundColor: theme.brand.primaryCard,
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.3)',
            }}
          >
            <ActivityIndicator size="large" color={theme.brand.primaryVivid} />
            <Text style={{ color: theme.text.onBrand, fontWeight: '600' }}>
              {t('auth.forgot.cta_sending')}
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
