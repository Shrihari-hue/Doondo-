/**
 * EditProfileScreen — modal for editing one section of the profile.
 *
 * Routed with { section: 'basics' | 'location' | 'skills' | 'preferences' }.
 * Each section is its own focused form; the screen renders the right one
 * based on the param. After save, we update the auth store user (so the
 * Profile screen reflects the change immediately) and dismiss.
 *
 * Why one screen with section param instead of four screens:
 *   - Identical chrome (header / Save button / cancel) lives in one place
 *   - Single navigate target — Profile cards just specify which section
 *   - Easier to keep the cinematic transitions consistent
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, TextField, Pill, FormError } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/stores/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { meApi } from '@/api/me.api';
import { getCurrentCoords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import {
  TRADES,
  findTrade,
  normaliseSkill,
  prettifySkill,
  tradeEmoji,
} from '@/lib/trades';
import type { AppStackParamList } from '@/navigation/types';
import type {
  Availability,
  BusinessType,
  JobType,
  PublicUser,
  WorkType,
} from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'EditProfile'>;
type Route = RouteProp<AppStackParamList, 'EditProfile'>;

export function EditProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  if (!user) return null;

  const titleMap: Record<typeof route.params.section, string> = {
    basics: 'Edit basics',
    location: 'Set your area',
    skills: 'Your skills',
    preferences: 'Work preferences',
    resume: 'Your resume',
    business_basics: 'Business details',
    business_location: 'Business address',
  };

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
              PROFILE
            </Text>
            <Text variant="display" weight="medium" display>
              {titleMap[route.params.section]}
            </Text>
          </View>

          {route.params.section === 'basics' && <BasicsForm user={user} />}
          {route.params.section === 'location' && <LocationForm user={user} />}
          {route.params.section === 'skills' && <SkillsForm user={user} />}
          {route.params.section === 'preferences' && <PreferencesForm user={user} />}
          {route.params.section === 'resume' && <ResumeForm user={user} />}
          {route.params.section === 'business_basics' && <BusinessBasicsForm user={user} />}
          {route.params.section === 'business_location' && (
            <BusinessLocationForm user={user} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ─── Basics: name + bio + experience ─────────────────────────────────────────

function BasicsForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;

  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [experienceText, setExperienceText] = useState(
    user.experienceYears != null ? String(user.experienceYears) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      meApi.updateProfile({
        name: name.trim(),
        bio: bio.trim() || null,
        experienceYears: experienceText ? Number(experienceText) : null,
      }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <TextField label="Full name" value={name} onChangeText={setName} />
      <TextField
        label="Short bio"
        value={bio}
        onChangeText={setBio}
        placeholder="A line or two about you"
        multiline
        numberOfLines={3}
      />
      <TextField
        label="Years of experience"
        value={experienceText}
        onChangeText={setExperienceText}
        keyboardType="number-pad"
        placeholder="e.g. 3"
      />
      <Button
        label={mutation.isPending ? 'Saving…' : 'Save'}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
    </View>
  );
}

// ─── Resume: pick a PDF/DOCX, replace, or remove ────────────────────────────

function ResumeForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const setUser = useAuthStore.setState;

  const [error, setError] = useState<string | null>(null);

  const hasResume = Boolean(user.resumeUploadedAt);

  const pickAndUploadMutation = useMutation({
    mutationFn: async () => {
      // Lazy-load expo-document-picker so the bundle doesn't pay for it
      // when the user never touches Resume. The dynamic import also makes
      // it easy to swallow the case where the package isn't installed yet
      // and surface a friendly error instead of a metro-time crash.
      const picker = await import('expo-document-picker').catch(() => null);
      if (!picker) {
        throw new Error(
          'Resume picker not installed. Run: pnpm add expo-document-picker',
        );
      }
      const result = await picker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) {
        throw new Error('No file picked');
      }
      const file = result.assets[0];

      // Cap raw size at ~900KB so the base64 payload (~1.2MB) stays under
      // the express body limit comfortably.
      if (file.size != null && file.size > 900_000) {
        throw new Error('Resume must be under 900KB. Try compressing the PDF.');
      }

      // Read the file as base64 and build a data URL.
      // expo-document-picker returns a file:// uri; we read it via fetch.
      const res = await fetch(file.uri);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const mimeType = (file.mimeType ?? 'application/pdf') as
        | 'application/pdf'
        | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        | 'application/msword';
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return meApi.uploadResume({
        dataUrl,
        filename: file.name ?? 'resume.pdf',
        mimeType,
        sizeBytes: file.size ?? Math.round((dataUrl.length * 3) / 4),
      });
    },
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Could not upload resume');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => meApi.removeResume(),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Could not remove resume');
    },
  });

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />

      <Text variant="body" tone="secondary">
        Add a PDF or DOCX so employers can review your background. You can
        replace it anytime — only your latest resume is shared.
      </Text>

      {/* Current state card */}
      <View
        style={{
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: hasResume ? theme.premium.hairline : theme.border.default,
          backgroundColor: theme.bg.surface,
          gap: spacing.xs,
        }}
      >
        {hasResume ? (
          <>
            <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
              {user.resumeFilename ?? 'resume'}
            </Text>
            <Text variant="footnote" tone="secondary">
              {formatFileSize(user.resumeSizeBytes)} ·{' '}
              {formatRelativeDate(user.resumeUploadedAt)}
            </Text>
          </>
        ) : (
          <>
            <Text variant="bodyLarge" weight="medium" tone="secondary">
              No resume uploaded yet
            </Text>
            <Text variant="footnote" tone="tertiary">
              PDF or DOCX, up to 900KB.
            </Text>
          </>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          label={
            pickAndUploadMutation.isPending
              ? hasResume
                ? 'Uploading…'
                : 'Uploading…'
              : hasResume
                ? 'Replace resume'
                : 'Upload resume'
          }
          onPress={() => pickAndUploadMutation.mutate()}
          disabled={pickAndUploadMutation.isPending || removeMutation.isPending}
        />
        {hasResume && (
          <Button
            label={removeMutation.isPending ? 'Removing…' : 'Remove resume'}
            variant="danger"
            onPress={() => removeMutation.mutate()}
            disabled={removeMutation.isPending || pickAndUploadMutation.isPending}
          />
        )}
        <Button label="Done" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

/** Convert a Blob to a base64 string (sans the data URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix.
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return 'today';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── Location: city/area + GPS detect ────────────────────────────────────────

function LocationForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;

  const [city, setCity] = useState(user.location?.city ?? '');
  const [area, setArea] = useState(user.location?.area ?? '');
  const [pincode, setPincode] = useState(user.location?.pincode ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    user.location?.coordinates
      ? { lng: user.location.coordinates[0]!, lat: user.location.coordinates[1]! }
      : null,
  );
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Auto-detect on save if user typed a city but didn't hit Detect.
      // Falling back to a sensible "no GPS yet" point keeps the flow
      // unblocked — the user can refine later.
      let c = coords;
      if (!c) {
        const detected = await getCurrentCoords();
        if (detected) {
          c = { lat: detected.lat, lng: detected.lng };
          setCoords(c);
        } else {
          // GPS denied / unavailable — use the seed center as a stand-in
          // so the save isn't blocked. Seekers can re-detect later.
          c = { lat: 12.9716, lng: 77.5946 };
          setCoords(c);
        }
      }
      return meApi.updateLocation({
        city: city.trim(),
        area: area.trim() || null,
        pincode: pincode.trim() || null,
        lat: c.lat,
        lng: c.lng,
      });
    },
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  async function detect() {
    setDetecting(true);
    const c = await getCurrentCoords();
    setDetecting(false);
    if (c) {
      setCoords({ lat: c.lat, lng: c.lng });
      haptic('selection');
    } else {
      setError('Could not get your location. We will use a default for now.');
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <Button
        label={
          detecting
            ? 'Detecting…'
            : coords
              ? 'Re-detect my location'
              : 'Detect my location'
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
      <Button
        label={mutation.isPending ? 'Saving…' : 'Save'}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending || !city.trim()}
      />
    </View>
  );
}

// ─── Skills: comma-separated entry → chips ───────────────────────────────────

function SkillsForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;
  const { theme } = useTheme();

  // Skills are stored as a flat lowercase string[] on the user. We
  // normalise everything we accept (whether from the picker or the
  // free-text field) through `normaliseSkill` so duplicates collapse
  // ("Electrician" + "electrician" + "fitter" → "electrician").
  const [skills, setSkills] = useState<string[]>(user.skills);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => meApi.updateProfile({ skills }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  function toggleTrade(slug: string) {
    haptic('selection');
    setSkills((current) => {
      if (current.includes(slug)) {
        return current.filter((s) => s !== slug);
      }
      if (current.length >= 20) return current; // hard cap
      return [...current, slug];
    });
  }

  function commitDraft() {
    const additions = draft
      .split(',')
      .map((s) => normaliseSkill(s))
      .filter(Boolean);
    if (additions.length === 0) return;
    const merged = [...new Set([...skills, ...additions])].slice(0, 20);
    setSkills(merged);
    setDraft('');
    haptic('selection');
  }

  function remove(skill: string) {
    haptic('light');
    setSkills((s) => s.filter((x) => x !== skill));
  }

  // Custom (non-catalogue) skills the user has added — rendered as
  // separate removable chips below the trade grid so they don't get lost.
  const customSkills = skills.filter((s) => !findTrade(s));

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <Text variant="footnote" tone="secondary">
        Tap what you can do. Up to 20. Don&apos;t see your trade? Add it as a
        custom skill below.
      </Text>

      {/* Trade grid — the primary picker */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {TRADES.map((trade) => {
          const active = skills.includes(trade.slug);
          return (
            <Pressable
              key={trade.slug}
              onPress={() => toggleTrade(trade.slug)}
              accessibilityRole="button"
              accessibilityLabel={`${trade.label}${active ? ', selected' : ''}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                backgroundColor: active ? '#2563EB' : theme.bg.surface,
                borderWidth: active ? 0 : 1,
                borderColor: theme.border.default,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14 }}>{trade.emoji}</Text>
              <Text
                variant="footnote"
                weight="medium"
                style={{ color: active ? '#FFFFFF' : theme.text.primary }}
              >
                {trade.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Free-text fallback for whatever the catalogue doesn't cover */}
      <View style={{ gap: spacing.xs }}>
        <Text variant="footnote" weight="medium" tone="secondary">
          Add a custom skill
        </Text>
        <TextField
          label=""
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. AC gas refilling"
          onSubmitEditing={commitDraft}
          returnKeyType="done"
        />
        <Pressable
          onPress={commitDraft}
          disabled={!draft.trim()}
          style={{
            alignSelf: 'flex-start',
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.md,
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            opacity: draft.trim() ? 1 : 0.4,
          }}
        >
          <Text variant="footnote" weight="medium" style={{ color: '#2563EB' }}>
            + Add
          </Text>
        </Pressable>
      </View>

      {/* Custom skills appear separately — catalogue trades are already
         highlighted in the grid above, so showing them twice is redundant. */}
      {customSkills.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="footnote" weight="medium" tone="secondary">
            Custom skills
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {customSkills.map((s) => (
              <Pressable key={s} onPress={() => remove(s)}>
                <Pill label={`${prettifySkill(s)}  ×`} tone="neutral" />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Hardcoded blue/white CTA so it never disappears on stale themes. */}
      <Pressable
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
        accessibilityRole="button"
        accessibilityLabel="Save skills"
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderRadius: radii.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2563EB',
          opacity: mutation.isPending ? 0.5 : pressed ? 0.85 : 1,
          shadowColor: '#2563EB',
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        })}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Text>
      </Pressable>

      {/* Soft footnote — total picked / cap */}
      <Text
        style={{
          fontSize: 11,
          color: theme.text.tertiary,
          textAlign: 'center',
        }}
      >
        {skills.length} / 20 selected
      </Text>
    </View>
  );
}


// ─── Preferences: availability + preferred job types ─────────────────────────

function PreferencesForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;
  const { theme } = useTheme();

  const [availability, setAvailability] = useState<Availability | null>(user.availability);
  const [types, setTypes] = useState<JobType[]>(user.preferredJobTypes);
  const [workType, setWorkType] = useState<WorkType | null>(user.workType);
  const [teamSizeText, setTeamSizeText] = useState(
    user.teamSize != null ? String(user.teamSize) : '2',
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      meApi.updateProfile({
        availability,
        preferredJobTypes: types,
        workType,
        teamSize: workType === 'team' ? clampTeamSize(teamSizeText) : null,
      }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  function toggleType(t: JobType) {
    setTypes((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));
    haptic('selection');
  }

  const availabilityOptions: Array<{ key: Availability; label: string }> = [
    { key: 'immediate', label: 'Immediately' },
    { key: 'within_1_week', label: 'Within 1 week' },
    { key: 'within_1_month', label: 'Within 1 month' },
    { key: 'flexible', label: 'Flexible' },
  ];

  const typeOptions: Array<{ key: JobType; label: string }> = [
    { key: 'full_time', label: 'Full-time' },
    { key: 'part_time', label: 'Part-time' },
    { key: 'gig', label: 'Gig' },
    { key: 'shift', label: 'Shift' },
    { key: 'contract', label: 'Contract' },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />

      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          APPLYING AS
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[
            { key: 'solo' as const, label: 'Solo', helper: 'One person applying' },
            { key: 'team' as const, label: 'Team', helper: 'Small crew applying together' },
          ].map((o) => {
            const active = workType === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => {
                  setWorkType(o.key);
                  haptic('selection');
                }}
                style={{
                  flex: 1,
                  padding: spacing.md,
                  borderRadius: radii.md,
                  borderWidth: 0.5,
                  borderColor: active ? theme.brand.hero : theme.border.default,
                  backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                  gap: spacing.xs,
                }}
              >
                <Text
                  variant="bodyLarge"
                  weight="medium"
                  style={{ color: active ? theme.brand.hero : theme.text.primary }}
                >
                  {o.label}
                </Text>
                <Text variant="footnote" tone="tertiary">
                  {o.helper}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {workType === 'team' ? (
        <TextField
          label="Team size"
          value={teamSizeText}
          onChangeText={(v) => setTeamSizeText(v.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          helper="How many people are applying together?"
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          AVAILABILITY
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {availabilityOptions.map((o) => {
            const active = availability === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => {
                  setAvailability(active ? null : o.key);
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

      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          INTERESTED IN
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {typeOptions.map((o) => {
            const active = types.includes(o.key);
            return (
              <Pressable
                key={o.key}
                onPress={() => toggleType(o.key)}
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

      <Button
        label={mutation.isPending ? 'Saving…' : 'Save'}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
    </View>
  );
}

function clampTeamSize(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(2, Math.min(50, Math.trunc(parsed)));
}

// ─── Business basics: company name, business type, GSTIN ─────────────────────

function BusinessBasicsForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;
  const { theme } = useTheme();

  const [companyName, setCompanyName] = useState(user.companyName ?? '');
  const [businessType, setBusinessType] = useState<BusinessType | null>(user.businessType);
  const [gstin, setGstin] = useState(user.gstin ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      meApi.updateProfile({
        companyName: companyName.trim() || null,
        businessType,
        gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
      }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  const types: Array<{ key: BusinessType; label: string }> = [
    { key: 'individual', label: 'Individual' },
    { key: 'shop', label: 'Shop' },
    { key: 'restaurant', label: 'Restaurant' },
    { key: 'salon', label: 'Salon' },
    { key: 'agency', label: 'Agency' },
    { key: 'startup', label: 'Startup' },
    { key: 'enterprise', label: 'Enterprise' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <TextField
        label="Business name"
        value={companyName}
        onChangeText={setCompanyName}
        placeholder="As you want it shown on job posts"
      />

      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          BUSINESS TYPE
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {types.map((o) => {
            const active = businessType === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => {
                  setBusinessType(active ? null : o.key);
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

      <TextField
        label="GSTIN (optional)"
        value={gstin}
        onChangeText={(v) => setGstin(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="22AAAAA0000A1Z5"
      />

      <Button
        label={mutation.isPending ? 'Saving…' : 'Save'}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
    </View>
  );
}

// ─── Business location: hits POST /me/employer-location ──────────────────────

function BusinessLocationForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;

  const [city, setCity] = useState(user.employerLocation?.city ?? '');
  const [area, setArea] = useState(user.employerLocation?.area ?? '');
  const [pincode, setPincode] = useState(user.employerLocation?.pincode ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    user.employerLocation?.coordinates
      ? {
          lng: user.employerLocation.coordinates[0]!,
          lat: user.employerLocation.coordinates[1]!,
        }
      : null,
  );
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let c = coords;
      if (!c) {
        const detected = await getCurrentCoords();
        c = detected
          ? { lat: detected.lat, lng: detected.lng }
          : { lat: 12.9716, lng: 77.5946 };
        setCoords(c);
      }
      return meApi.updateEmployerLocation({
        city: city.trim(),
        area: area.trim() || null,
        pincode: pincode.trim() || null,
        lat: c.lat,
        lng: c.lng,
      });
    },
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  async function detect() {
    setDetecting(true);
    const c = await getCurrentCoords();
    setDetecting(false);
    if (c) {
      setCoords({ lat: c.lat, lng: c.lng });
      haptic('selection');
    } else {
      setError('Could not get your location. We will use a default for now.');
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <Button
        label={detecting ? 'Detecting…' : coords ? 'Re-detect' : 'Detect my location'}
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
      <TextField label="Area" value={area} onChangeText={setArea} placeholder="Indiranagar" />
      <TextField
        label="Pincode (optional)"
        value={pincode}
        onChangeText={setPincode}
        keyboardType="number-pad"
        placeholder="560038"
      />
      <Button
        label={mutation.isPending ? 'Saving…' : 'Save'}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending || !city.trim()}
      />
    </View>
  );
}
