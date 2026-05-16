import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, Button, TextField, FormError } from '@/components';
import { authApi } from '@/api/auth.api';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AuthStackParamList } from '@/navigation/types';
import type { UserRole, WorkType } from '@/api/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
type SignupRoute = RouteProp<AuthStackParamList, 'Signup'>;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: string;
  teamSize?: string;
}

export function SignupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<SignupRoute>();
  const { setSession } = useAuth();

  const initialRole: UserRole = route.params?.role ?? 'seeker';
  const initialWorkType: WorkType = route.params?.workType ?? 'solo';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(initialRole);
  const [workType, setWorkType] = useState<WorkType>(initialWorkType);
  const [teamSizeText, setTeamSizeText] = useState(
    route.params?.teamSize != null ? String(route.params.teamSize) : '2',
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /**
   * "Setting this up for someone else?" — many blue-collar workers will
   * have a literate family member install Doondo and create the account
   * on their behalf. The toggle doesn't change the data we collect: the
   * name/phone/email entered are still the worker's. What it does is
   * surface a banner reminding the assistant of that, plus a couple of
   * field-copy tweaks so they don't accidentally enter their own info.
   */
  const [assistedSetup, setAssistedSetup] = useState(false);

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = 'Your name helps employers recognize you';
    if (!email.trim()) errors.email = 'Email is required';
    if (!password) errors.password = 'Choose a password';
    else if (password.length < 8) errors.password = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      errors.password = 'Mix letters and numbers';
    // Phone is mandatory now — it's our password-reset channel. We do a
    // loose format check here and let the backend's full regex catch
    // anything weirder.
    if (!phone.trim()) {
      errors.phone = "We'll use this to reset your password if you forget it";
    } else if (!/^\+?[0-9\s-]{6,20}$/.test(phone.trim())) {
      errors.phone = 'Enter a valid phone number';
    }
    if (role === 'seeker' && workType === 'team') {
      const teamSize = Number(teamSizeText);
      if (!Number.isFinite(teamSize) || teamSize < 2) {
        errors.teamSize = 'Team size must be at least 2';
      } else if (teamSize > 50) {
        errors.teamSize = 'Keep team size to 50 or fewer';
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        phone: phone.trim(),
        ...(role === 'seeker'
          ? {
              workType,
              ...(workType === 'team'
                ? { teamSize: clampTeamSize(teamSizeText) }
                : {}),
            }
          : {}),
      });
      await setSession(result);
      haptic('success');
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_EMAIL_TAKEN') {
          setFieldErrors({ email: 'An account with this email already exists' });
        } else if (err.code === 'RATE_LIMITED') {
          setFormError('Too many attempts. Try again in a minute.');
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
            paddingTop: spacing['4xl'],
            paddingBottom: spacing['4xl'],
            gap: spacing['2xl'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              CREATE ACCOUNT
            </Text>
            <Text variant="titleLarge" weight="medium">
              Join Doondo
            </Text>
          </View>

          <FormError message={formError} />

          <RoleToggle value={role} onChange={setRole} />

          {role === 'seeker' ? (
            <AssistedSetupToggle
              value={assistedSetup}
              onChange={(v) => {
                haptic('selection');
                setAssistedSetup(v);
              }}
            />
          ) : null}

          {role === 'seeker' ? (
            <WorkTypeSection
              workType={workType}
              teamSizeText={teamSizeText}
              teamSizeError={fieldErrors.teamSize ?? null}
              onWorkTypeChange={(next) => {
                setWorkType(next);
                if (fieldErrors.teamSize) {
                  setFieldErrors((state) => ({ ...state, teamSize: undefined }));
                }
              }}
              onTeamSizeChange={(next) => {
                setTeamSizeText(next);
                if (fieldErrors.teamSize) {
                  setFieldErrors((state) => ({ ...state, teamSize: undefined }));
                }
              }}
            />
          ) : null}

          <View style={{ gap: spacing.lg }}>
            <TextField
              label={assistedSetup ? "Worker's name" : 'Name'}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (fieldErrors.name) setFieldErrors((s) => ({ ...s, name: undefined }));
              }}
              placeholder={
                assistedSetup
                  ? "The worker's full name"
                  : role === 'seeker'
                    ? 'Your full name'
                    : 'Your business name'
              }
              autoCapitalize="words"
              autoComplete="name"
              error={fieldErrors.name ?? null}
              helper={
                assistedSetup ? 'Not your name — the person who will use this account.' : undefined
              }
            />
            <TextField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((s) => ({ ...s, email: undefined }));
              }}
              placeholder={assistedSetup ? "Worker's email, if any" : 'you@example.com'}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              error={fieldErrors.email ?? null}
              helper={
                assistedSetup
                  ? "If they don't have one, use yours — you can change it later."
                  : undefined
              }
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((s) => ({ ...s, password: undefined }));
              }}
              placeholder="8+ chars, mix letters and numbers"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              passwordToggle
              error={fieldErrors.password ?? null}
              helper={
                assistedSetup
                  ? 'Share this with the worker so they can sign in on any phone.'
                  : undefined
              }
            />
            <TextField
              label={assistedSetup ? "Worker's phone" : 'Phone'}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (fieldErrors.phone) setFieldErrors((s) => ({ ...s, phone: undefined }));
              }}
              placeholder="+91 9876543210"
              autoComplete="tel"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              helper={
                assistedSetup
                  ? "The worker's number — employers will call here."
                  : 'Used to reset your password if you forget it.'
              }
              error={fieldErrors.phone ?? null}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            <Button
              label={submitting ? 'Creating account…' : 'Create account'}
              onPress={onSubmit}
              disabled={submitting}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
            <Text variant="footnote" tone="secondary">
              Already have an account?
            </Text>
            <Text
              variant="footnote"
              weight="medium"
              tone="hero"
              onPress={() => navigation.navigate('Login')}
            >
              Sign in
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

interface WorkTypeSectionProps {
  workType: WorkType;
  teamSizeText: string;
  teamSizeError: string | null;
  onWorkTypeChange: (next: WorkType) => void;
  onTeamSizeChange: (next: string) => void;
}

/**
 * "Setting this up for someone else?" toggle. When on, the seeker
 * fields below relabel to "Worker's name / phone / email" and a small
 * banner explains who the account is for. The data we send to the
 * backend is identical — this is purely a copy/orientation aid for the
 * literate family member who's installing Doondo for a worker who
 * can't easily set it up themselves.
 */
function AssistedSetupToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        onPress={() => onChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel="Setting this up for someone else"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: value ? '#2563EB' : theme.border.default,
          backgroundColor: value ? '#EFF6FF' : theme.bg.surface,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: value ? '#2563EB' : theme.border.strong,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: value ? '#2563EB' : 'transparent',
          }}
        >
          {value ? (
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
              ✓
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight="medium">
            Setting this up for someone else?
          </Text>
          <Text variant="footnote" tone="secondary">
            Common for family members helping a worker who can&apos;t use the
            app alone.
          </Text>
        </View>
      </Pressable>
      {value ? (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: '#FEF3C7',
            borderWidth: 0.5,
            borderColor: '#FDE68A',
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 19, color: '#78350F' }}>
            Enter the <Text style={{ fontWeight: '700' }}>worker&apos;s</Text> name,
            phone and email below — not yours. Job alerts and employer
            calls will go to the phone you enter. Share the password with
            them so they can sign in.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function WorkTypeSection({
  workType,
  teamSizeText,
  teamSizeError,
  onWorkTypeChange,
  onTeamSizeChange,
}: WorkTypeSectionProps) {
  const { theme } = useTheme();
  const options: Array<{ value: WorkType; label: string; helper: string }> = [
    { value: 'solo', label: 'Solo', helper: 'One person applying' },
    { value: 'team', label: 'Team', helper: 'Applying with a crew' },
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary">
        I am applying as
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {options.map((opt) => {
          const selected = workType === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                haptic('selection');
                onWorkTypeChange(opt.value);
              }}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radii.md,
                borderWidth: 0.5,
                borderColor: selected ? theme.brand.heroBorder : theme.border.default,
                backgroundColor: selected ? theme.brand.heroSubtle : theme.bg.surface,
                gap: spacing.xs,
              }}
            >
              <Text variant="bodyLarge" weight="medium" tone={selected ? 'hero' : 'primary'}>
                {opt.label}
              </Text>
              <Text variant="footnote" tone="tertiary">
                {opt.helper}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {workType === 'team' ? (
        <TextField
          label="Team size"
          value={teamSizeText}
          onChangeText={(v) => onTeamSizeChange(v.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          placeholder="2"
          helper="How many people are applying together?"
          error={teamSizeError}
        />
      ) : null}
    </View>
  );
}

function clampTeamSize(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(2, Math.min(50, Math.trunc(parsed)));
}

interface RoleToggleProps {
  value: UserRole;
  onChange: (next: UserRole) => void;
}

/**
 * Placeholder role toggle. Phase 1.5 replaces this with the 3D role-picker
 * scene (task #5) — a much more memorable first-launch moment. Until then,
 * the toggle keeps the signup flow functional.
 */
function RoleToggle({ value, onChange }: RoleToggleProps) {
  const { theme } = useTheme();
  const options: { value: UserRole; label: string; helper: string }[] = [
    { value: 'seeker', label: 'Find work', helper: "I'm looking for a job" },
    { value: 'employer', label: 'Hire workers', helper: "I'm posting jobs" },
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary">
        I want to
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                haptic('selection');
                onChange(opt.value);
              }}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radii.md,
                borderWidth: 0.5,
                borderColor: selected ? theme.brand.heroBorder : theme.border.default,
                backgroundColor: selected ? theme.brand.heroSubtle : theme.bg.surface,
                gap: spacing.xs,
              }}
            >
              <Text variant="bodyLarge" weight="medium" tone={selected ? 'hero' : 'primary'}>
                {opt.label}
              </Text>
              <Text variant="footnote" tone="tertiary">
                {opt.helper}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function mapValidation(
  issues: { path: (string | number)[]; message: string }[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = i.path[i.path.length - 1];
    if (key === 'name' || key === 'email' || key === 'password' || key === 'phone' || key === 'role') {
      out[key] = i.message;
    }
  }
  return out;
}
