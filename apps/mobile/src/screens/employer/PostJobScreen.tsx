/**
 * PostJobScreen — modal form to create a job.
 *
 * Single screen, sectioned: Title & description → Type & pay →
 * Location → Skills. Save calls jobsApi.create and pops back to the
 * Posts list, which refetches.
 *
 * Pay amounts are entered in rupees in the UI but stored in paise on
 * the backend. We convert at the boundary.
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
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, TextField, Button, FormError, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi, type CreateJobPayload } from '@/api/jobs.api';
import { getCurrentCoords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import type { AppStackParamList } from '@/navigation/types';
import type { JobType, PayPeriod } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'PostJob'>;

const JOB_TYPE_OPTIONS: Array<{ key: JobType; label: string }> = [
  { key: 'full_time', label: 'Full-time' },
  { key: 'part_time', label: 'Part-time' },
  { key: 'gig', label: 'Gig' },
  { key: 'shift', label: 'Shift' },
  { key: 'contract', label: 'Contract' },
];

const PAY_PERIOD_OPTIONS: Array<{ key: PayPeriod; label: string }> = [
  { key: 'hour', label: 'per hour' },
  { key: 'day', label: 'per day' },
  { key: 'week', label: 'per week' },
  { key: 'month', label: 'per month' },
  { key: 'fixed', label: 'fixed' },
];

export function PostJobScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<JobType>('gig');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<PayPeriod>('day');
  // Location — pre-fill from the employer's saved business location if any.
  const [city, setCity] = useState(user?.employerLocation?.city ?? user?.location?.city ?? '');
  const [area, setArea] = useState(user?.employerLocation?.area ?? user?.location?.area ?? '');
  const [pincode, setPincode] = useState(
    user?.employerLocation?.pincode ?? user?.location?.pincode ?? '',
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    user?.employerLocation?.coordinates
      ? {
          lng: user.employerLocation.coordinates[0]!,
          lat: user.employerLocation.coordinates[1]!,
        }
      : user?.location?.coordinates
        ? { lng: user.location.coordinates[0]!, lat: user.location.coordinates[1]! }
        : null,
  );
  const [detecting, setDetecting] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Auto-detect coords if not yet set.
      let c = coords;
      if (!c) {
        const detected = await getCurrentCoords();
        c = detected
          ? { lat: detected.lat, lng: detected.lng }
          : { lat: 12.9716, lng: 77.5946 };
        setCoords(c);
      }
      const amt = Math.round(Number(amount) * 100); // rupees → paise
      const body: CreateJobPayload = {
        title: title.trim(),
        description: description.trim(),
        type,
        pay: { amount: amt, period, currency: 'INR' },
        location: {
          address: [area.trim(), city.trim()].filter(Boolean).join(', '),
          city: city.trim(),
          area: area.trim() || null,
          pincode: pincode.trim() || null,
          lat: c.lat,
          lng: c.lng,
        },
        skills,
      };
      return jobsApi.create(body);
    },
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Could not post the job');
    },
  });

  async function detect() {
    setDetecting(true);
    const c = await getCurrentCoords();
    setDetecting(false);
    if (c) setCoords({ lat: c.lat, lng: c.lng });
  }

  function commitSkill() {
    const next = skillDraft
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (next.length === 0) return;
    setSkills([...new Set([...skills, ...next])].slice(0, 20));
    setSkillDraft('');
    haptic('selection');
  }

  function removeSkill(s: string) {
    haptic('light');
    setSkills((arr) => arr.filter((x) => x !== s));
  }

  const canSave =
    title.trim().length >= 2 &&
    description.trim().length >= 10 &&
    Number(amount) > 0 &&
    city.trim().length > 0 &&
    !mutation.isPending;

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
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text variant="footnote" tone="secondary">
              Cancel
            </Text>
          </Pressable>

          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              POST A JOB
            </Text>
            <Text variant="display" weight="medium" display>
              Tell us what you need.
            </Text>
          </View>

          <FormError message={error} />

          {/* Basics */}
          <View style={{ gap: spacing.lg }}>
            <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Delivery rider, salon assistant…" />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="What does the job involve? Any requirements?"
              multiline
              numberOfLines={5}
            />
          </View>

          {/* Type */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              TYPE
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {JOB_TYPE_OPTIONS.map((o) => {
                const active = type === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => {
                      setType(o.key);
                      haptic('selection');
                    }}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderRadius: radii.pill,
                      borderWidth: 0.5,
                      borderColor: active ? theme.brand.hero : theme.border.default,
                      backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                    }}
                  >
                    <Text
                      variant="footnote"
                      weight={active ? 'medium' : 'regular'}
                      style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Pay */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              PAY
            </Text>
            <TextField
              label="Amount (₹)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="e.g. 600"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {PAY_PERIOD_OPTIONS.map((o) => {
                const active = period === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => {
                      setPeriod(o.key);
                      haptic('selection');
                    }}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderRadius: radii.pill,
                      borderWidth: 0.5,
                      borderColor: active ? theme.brand.hero : theme.border.default,
                      backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                    }}
                  >
                    <Text
                      variant="footnote"
                      weight={active ? 'medium' : 'regular'}
                      style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Location */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              LOCATION
            </Text>
            <Button
              label={
                detecting ? 'Detecting…' : coords ? 'Re-detect location' : 'Detect location'
              }
              variant="secondary"
              onPress={() => void detect()}
              disabled={detecting}
            />
            {coords && (
              <Text variant="footnote" tone="tertiary">
                Using {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </Text>
            )}
            <TextField label="City" value={city} onChangeText={setCity} placeholder="Bengaluru" />
            <TextField
              label="Area / neighbourhood"
              value={area}
              onChangeText={setArea}
              placeholder="Indiranagar"
            />
            <TextField
              label="Pincode (optional)"
              value={pincode}
              onChangeText={setPincode}
              keyboardType="number-pad"
              placeholder="560038"
            />
          </View>

          {/* Skills */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              SKILLS NEEDED
            </Text>
            <TextField
              label="Add skill"
              value={skillDraft}
              onChangeText={setSkillDraft}
              placeholder="driving, customer service"
              onSubmitEditing={commitSkill}
              returnKeyType="done"
            />
            {skills.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {skills.map((s) => (
                  <Pressable key={s} onPress={() => removeSkill(s)}>
                    <Pill label={`${s}  ×`} tone="neutral" />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Button
            label={mutation.isPending ? 'Posting…' : 'Post job'}
            onPress={() => mutation.mutate()}
            disabled={!canSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
