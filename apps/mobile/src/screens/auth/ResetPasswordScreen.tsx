import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError, Card } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;
type ResetRoute = RouteProp<AuthStackParamList, 'ResetPassword'>;

/**
 * ResetPasswordScreen — step 3 of the password-reset flow.
 *
 * Carries the resetToken minted by /auth/verify-reset-code as a route
 * param. Tokens are single-use server-side; if the user lands here again
 * with a stale token (e.g. they background the app and the JWT expires)
 * we surface a clear "start over" path rather than letting them mash a
 * doomed submit button.
 *
 * On success, every refresh token for the account is revoked by the
 * backend. We bounce the user back to Login — they sign in fresh with the
 * new password, which proves they really know it and also re-establishes
 * a clean session on this device.
 */
export function ResetPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const { resetToken } = useRoute<ResetRoute>().params;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function onSubmit() {
    if (submitting || done) return;
    setFormError(null);
    setPwError(null);
    setConfirmError(null);

    // Mirror the backend rules exactly — bouncing on the same checks the
    // server applies keeps validation feedback consistent.
    if (!password) {
      setPwError('Choose a password');
      return;
    }
    if (password.length < 8) {
      setPwError('At least 8 characters');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setPwError('Mix letters and numbers');
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(resetToken, password);
      haptic('success');
      setDone(true);
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (
          err.code === 'AUTH_RESET_TOKEN_INVALID' ||
          err.code === 'AUTH_RESET_TOKEN_EXPIRED'
        ) {
          setFormError(
            err.code === 'AUTH_RESET_TOKEN_EXPIRED'
              ? 'This reset code expired. Start over to get a new one.'
              : 'This reset link is no longer valid. Start over.',
          );
        } else if (err.code === 'VALIDATION_FAILED' && err.validationIssues) {
          // Surface whichever field the backend complained about.
          const issue = err.validationIssues[0];
          if (issue?.path.includes('newPassword')) {
            setPwError(issue.message);
          } else {
            setFormError(issue?.message ?? err.message);
          }
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

  // ─── Done state ─────────────────────────────────────────────────────────
  if (done) {
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
              Password updated
            </Text>
          </View>
          <Card>
            <Text variant="body" tone="secondary">
              Sign in with your new password to continue. We've signed you
              out of every other device for safety.
            </Text>
          </Card>
          <Button
            label="Back to sign in"
            onPress={() => navigation.popToTop()}
          />
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
              RESET PASSWORD
            </Text>
            <Text variant="titleLarge" weight="medium">
              Set a new password
            </Text>
            <Text variant="body" tone="secondary">
              Pick something you'll remember. We'll sign you out everywhere
              else when you save.
            </Text>
          </View>

          <FormError message={formError} />

          <View style={{ gap: spacing.lg }}>
            <TextField
              label="New password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (pwError) setPwError(null);
              }}
              placeholder="8+ chars, mix letters and numbers"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              passwordToggle
              error={pwError}
            />
            <TextField
              label="Confirm new password"
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                if (confirmError) setConfirmError(null);
              }}
              placeholder="Type it again"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              passwordToggle
              error={confirmError}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            <Button
              label={submitting ? 'Saving…' : 'Save new password'}
              onPress={onSubmit}
              disabled={submitting}
            />
            <Button
              label="Start over"
              variant="ghost"
              onPress={() => navigation.popToTop()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
