import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { setSession } = useAuth();
  const t = useTranslate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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

    setSubmitting(true);
    try {
      const result = await authApi.login({ email: email.trim(), password });
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
              {t('auth.login.eyebrow')}
            </Text>
            <Text variant="titleLarge" weight="medium">
              {t('auth.login.title')}
            </Text>
          </View>

          <FormError message={formError} />

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
