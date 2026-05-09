/**
 * VerificationFlowScreen — phone OTP + selfie modal.
 *
 * One screen, four steps:
 *   intro  → "what we'll do, why we ask" (premium tone, sets expectations)
 *   phone  → user enters their phone, we POST /verification/phone/start
 *   code   → 6-digit OTP, we POST /verification/phone/verify
 *   selfie → camera capture, we POST /verification/selfie → done
 *
 * On full success the parent navigator is dismissed and the auth store is
 * updated so the gold ★ Verified pill on ProfileScreen renders immediately.
 *
 * Why one screen instead of four: shared chrome (header, progress dots),
 * shared error / loading state, and easy back-navigation between steps
 * without juggling a sub-stack. Mirrors the pattern used by EditProfileScreen.
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import {
  Avatar,
  Button,
  Card,
  FormError,
  Pill,
  Screen,
  Text,
  TextField,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { verificationApi } from '@/api/verification.api';
import { ApiError } from '@/api/errors';
import { captureSelfie } from '@/lib/photo';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Verification'>;

type Step = 'intro' | 'phone' | 'code' | 'selfie' | 'done';

export function VerificationFlowScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;
  const { theme } = useTheme();

  // Step state — start at intro unless the user already passed phone, in
  // which case we skip ahead to the selfie step (e.g. they re-opened the
  // flow after backgrounding mid-way).
  const [step, setStep] = useState<Step>(() => {
    if (!user) return 'intro';
    if (user.isVerified) return 'done';
    if (user.phoneVerified) return 'selfie';
    return 'intro';
  });

  const [phone, setPhone] = useState(user?.phone ?? '');
  const [canonicalPhone, setCanonicalPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: (p: string) => verificationApi.startPhone(p),
    onSuccess: ({ phone: canonical }) => {
      haptic('selection');
      setCanonicalPhone(canonical);
      setError(null);
      setCode('');
      setStep('code');
    },
    onError: (err) => {
      haptic('error');
      setError(humanError(err));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      verificationApi.verifyPhone(input.phone, input.code),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
      setError(null);
      setStep('selfie');
    },
    onError: (err) => {
      haptic('error');
      setError(humanError(err));
      // If the OTP got nuked (too many attempts / expired), bounce them
      // back to the phone step so they can request a fresh one.
      if (err instanceof ApiError) {
        if (
          err.code === 'VERIFICATION_OTP_EXPIRED' ||
          err.code === 'VERIFICATION_OTP_TOO_MANY' ||
          err.code === 'VERIFICATION_OTP_NOT_FOUND'
        ) {
          setStep('phone');
        }
      }
    },
  });

  const selfieMutation = useMutation({
    mutationFn: (selfieUrl: string) => verificationApi.uploadSelfie(selfieUrl),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
      setError(null);
      setStep('done');
    },
    onError: (err) => {
      haptic('error');
      setError(humanError(err));
    },
  });

  if (!user) return null;
  if (user.isVerified && step !== 'done') {
    // Edge case — they were verified by another route while on this screen.
    setStep('done');
  }

  // ─── Step actions ─────────────────────────────────────────────────────

  function onSubmitPhone() {
    setError(null);
    const trimmed = phone.trim();
    if (!/^\+?[0-9\s-]{6,20}$/.test(trimmed)) {
      setError('Enter a valid phone number.');
      return;
    }
    startMutation.mutate(trimmed);
  }

  function onSubmitCode() {
    setError(null);
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    verifyMutation.mutate({ phone: canonicalPhone ?? phone, code });
  }

  async function onCaptureSelfie() {
    setError(null);
    const picked = await captureSelfie();
    if (!picked) {
      // Either cancelled or permission denied. Don't yell — let the user retry.
      return;
    }
    selfieMutation.mutate(picked.dataUrl);
  }

  function onResend() {
    setError(null);
    setCode('');
    startMutation.mutate(canonicalPhone ?? phone);
  }

  function onClose() {
    navigation.goBack();
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingTop: spacing['3xl'],
            paddingBottom: spacing['7xl'],
            gap: spacing['2xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header — close + progress dots */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Pressable hitSlop={12} onPress={onClose}>
              <Text variant="footnote" tone="secondary">
                {step === 'done' ? 'Close' : 'Cancel'}
              </Text>
            </Pressable>
            <ProgressDots step={step} />
          </View>

          {/* Title + subtitle vary per step. */}
          <StepHeader step={step} role={user.role} userName={user.name} />

          {/* Step body */}
          {step === 'intro' && (
            <IntroStep
              role={user.role}
              hasGstin={Boolean(user.gstin && user.gstin.trim())}
              onContinue={() => {
                haptic('selection');
                setStep('phone');
              }}
            />
          )}

          {step === 'phone' && (
            <PhoneStep
              phone={phone}
              setPhone={setPhone}
              error={error}
              loading={startMutation.isPending}
              onSubmit={onSubmitPhone}
            />
          )}

          {step === 'code' && (
            <CodeStep
              code={code}
              setCode={setCode}
              maskedPhone={canonicalPhone ?? phone}
              error={error}
              loading={verifyMutation.isPending}
              resending={startMutation.isPending}
              onSubmit={onSubmitCode}
              onResend={onResend}
              onChangeNumber={() => {
                setError(null);
                setStep('phone');
              }}
            />
          )}

          {step === 'selfie' && (
            <SelfieStep
              error={error}
              loading={selfieMutation.isPending}
              onCapture={onCaptureSelfie}
            />
          )}

          {step === 'done' && <DoneStep onClose={onClose} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function ProgressDots({ step }: { step: Step }) {
  const { theme } = useTheme();
  const order: Step[] = ['intro', 'phone', 'code', 'selfie', 'done'];
  const idx = order.indexOf(step);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {order.map((s, i) => (
        <View
          key={s}
          style={{
            width: i === idx ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor:
              i <= idx ? theme.brand.hero : theme.border.subtle,
          }}
        />
      ))}
    </View>
  );
}

function StepHeader({
  step,
  role,
  userName,
}: {
  step: Step;
  role: 'seeker' | 'employer' | 'admin';
  userName: string;
}) {
  const titleMap: Record<Step, { eyebrow: string; title: string; sub: string }> = {
    intro: {
      eyebrow: 'VERIFY',
      title: 'Get the Verified badge',
      sub: `Two quick steps, ${userName.split(' ')[0] ?? 'there'}.`,
    },
    phone: {
      eyebrow: 'STEP 1 OF 2',
      title: 'Confirm your phone',
      sub: "We'll text a 6-digit code. Standard rates may apply.",
    },
    code: {
      eyebrow: 'STEP 1 OF 2',
      title: 'Enter the code',
      sub: 'Six digits we just sent you.',
    },
    selfie: {
      eyebrow: 'STEP 2 OF 2',
      title: role === 'employer' ? 'Take a quick selfie' : 'Add a selfie',
      sub: 'A live photo so people know you’re real.',
    },
    done: {
      eyebrow: 'VERIFIED',
      title: 'You’re verified.',
      sub: 'The gold star is now on your profile.',
    },
  };
  const t = titleMap[step];
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
        {t.eyebrow}
      </Text>
      <Text variant="display" weight="medium" display>
        {t.title}
      </Text>
      <Text variant="footnote" tone="secondary">
        {t.sub}
      </Text>
    </View>
  );
}

function IntroStep({
  role,
  hasGstin,
  onContinue,
}: {
  role: 'seeker' | 'employer' | 'admin';
  hasGstin: boolean;
  onContinue: () => void;
}) {
  const items =
    role === 'employer'
      ? [
          { icon: '📱', title: 'Phone OTP', sub: 'A code by SMS, takes 30s.' },
          { icon: '🤳', title: 'Live selfie', sub: 'Front camera only.' },
          {
            icon: '🏢',
            title: 'Business GSTIN',
            sub: hasGstin
              ? 'Already on your profile — we’ll use that.'
              : 'Add a valid GSTIN before you finish.',
          },
        ]
      : [
          { icon: '📱', title: 'Phone OTP', sub: 'A code by SMS, takes 30s.' },
          { icon: '🤳', title: 'Live selfie', sub: 'Front camera only.' },
          {
            icon: '★',
            title: 'Gold ★ on your profile',
            sub: 'Employers see who’s real.',
          },
        ];

  return (
    <View style={{ gap: spacing.xl }}>
      <Card>
        <View style={{ gap: spacing.lg }}>
          {items.map((it) => (
            <View
              key={it.title}
              style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}
            >
              <Text variant="title">{it.icon}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyLarge" weight="medium">
                  {it.title}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {it.sub}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Text variant="footnote" tone="tertiary">
        We use your selfie to confirm you’re a real person and store it
        securely on your account. It’s never shown to other users.
      </Text>

      <Button label="Get started" onPress={onContinue} />
    </View>
  );
}

function PhoneStep({
  phone,
  setPhone,
  error,
  loading,
  onSubmit,
}: {
  phone: string;
  setPhone: (v: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <View style={{ gap: spacing.xl }}>
      <TextField
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98XXXXXXXX"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="send"
        onSubmitEditing={onSubmit}
        helper="Indian numbers default to +91 if you skip the country code."
        error={error}
      />
      <Button
        label={loading ? 'Sending code…' : 'Send code'}
        disabled={loading}
        onPress={onSubmit}
      />
    </View>
  );
}

function CodeStep({
  code,
  setCode,
  maskedPhone,
  error,
  loading,
  resending,
  onSubmit,
  onResend,
  onChangeNumber,
}: {
  code: string;
  setCode: (v: string) => void;
  maskedPhone: string;
  error: string | null;
  loading: boolean;
  resending: boolean;
  onSubmit: () => void;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  return (
    <View style={{ gap: spacing.xl }}>
      <Text variant="footnote" tone="secondary">
        Code sent to {maskPhone(maskedPhone)}.
      </Text>
      <TextField
        label="6-digit code"
        value={code}
        onChangeText={(v) => {
          const cleaned = v.replace(/[^0-9]/g, '').slice(0, 6);
          setCode(cleaned);
          if (cleaned.length === 6) setTimeout(onSubmit, 120);
        }}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        helper="On Android, the code may auto-fill from the SMS notification."
        error={error}
      />
      <Button
        label={loading ? 'Verifying…' : 'Verify code'}
        disabled={loading || code.length !== 6}
        onPress={onSubmit}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Pressable onPress={onChangeNumber} hitSlop={8}>
          <Text variant="footnote" tone="secondary">
            Wrong number?
          </Text>
        </Pressable>
        <Pressable onPress={onResend} disabled={resending} hitSlop={8}>
          <Text variant="footnote" tone="hero">
            {resending ? 'Resending…' : 'Resend code'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SelfieStep({
  error,
  loading,
  onCapture,
}: {
  error: string | null;
  loading: boolean;
  onCapture: () => void;
}) {
  return (
    <View style={{ gap: spacing.xl }}>
      <Card>
        <View style={{ alignItems: 'center', gap: spacing.lg, padding: spacing.lg }}>
          <Avatar name="" size={120} />
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            Look directly at the camera in good light. Glasses are fine —
            just no hats or masks for this one.
          </Text>
        </View>
      </Card>
      {error ? <FormError message={error} /> : null}
      <Button
        label={loading ? 'Uploading…' : 'Take selfie'}
        disabled={loading}
        onPress={onCapture}
      />
    </View>
  );
}

function DoneStep({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ gap: spacing['2xl'], alignItems: 'center', paddingTop: spacing.xl }}>
      <Pill label="Verified" tone="premium" leading="★" />
      <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
        Your profile now shows the gold star wherever you appear — job posts,
        applicant lists, conversations. It builds trust on both sides.
      </Text>
      <Button label="Done" onPress={onClose} />
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function maskPhone(p: string): string {
  // Show first 3 and last 2 digits, mask the rest. Works for E.164 and
  // bare-digit forms alike.
  const digits = p.replace(/\D/g, '');
  if (digits.length <= 5) return p;
  const head = digits.slice(0, digits.length - 6);
  const tail = digits.slice(-2);
  return `${p.startsWith('+') ? '+' : ''}${head}••••${tail}`;
}

function humanError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'VERIFICATION_OTP_INVALID':
        return 'That code is incorrect. Try again.';
      case 'VERIFICATION_OTP_EXPIRED':
        return 'That code has expired. Send a new one.';
      case 'VERIFICATION_OTP_TOO_MANY':
        return 'Too many wrong attempts. Send a fresh code.';
      case 'VERIFICATION_OTP_NOT_FOUND':
        return 'No active code for this number. Request a new one.';
      case 'VERIFICATION_PHONE_REQUIRED':
        return 'Confirm your phone number first.';
      case 'VERIFICATION_GSTIN_REQUIRED':
        return 'Add a valid GSTIN to your profile before verifying.';
      case 'VERIFICATION_ALREADY_VERIFIED':
        return 'This account is already verified.';
      case 'RATE_LIMITED':
        return err.message || 'Too many requests. Try again in a minute.';
      default:
        return err.message;
    }
  }
  return 'Something went wrong. Try again.';
}
