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
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { setSession } = useAuth();

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
        email: !email.trim() ? 'Email is required' : undefined,
        password: !password ? 'Password is required' : undefined,
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
          setFormError('Email or password is incorrect.');
        } else if (err.code === 'RATE_LIMITED') {
          setFormError('Too many sign-in attempts. Try again in a minute.');
        } else if (err.validationIssues) {
          setFieldErrors(mapValidation(err.validationIssues));
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
              SIGN IN
            </Text>
            <Text variant="titleLarge" weight="medium">
              Welcome back
            </Text>
          </View>

          <FormError message={formError} />

          <View style={{ gap: spacing.lg }}>
            <TextField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((s) => ({ ...s, email: undefined }));
              }}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              error={fieldErrors.email ?? null}
              returnKeyType="next"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((s) => ({ ...s, password: undefined }));
              }}
              placeholder="At least 8 characters"
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
              label={submitting ? 'Signing in…' : 'Sign in'}
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label="Forgot password?"
              variant="ghost"
              onPress={() => navigation.navigate('ForgotPassword')}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
            <Text variant="footnote" tone="secondary">
              Don't have an account?
            </Text>
            <Text
              variant="footnote"
              weight="medium"
              tone="hero"
              onPress={() => navigation.navigate('Signup')}
            >
              Create one
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
