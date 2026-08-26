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
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, TextField, Pill, FormError } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/stores/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { meApi } from '@/api/me.api';
import { getCurrentCoords, reverseGeocodeCity } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { pickSkillDoc, type SkillDocSource } from '@/lib/skillDocPicker';
import {
  TRADES,
  findTrade,
  normaliseSkill,
  prettifySkill,
  tradeEmoji,
  tradeShortLabel,
} from '@/lib/trades';
import { useTranslate } from '@/i18n/useTranslate';
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
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function EditProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const t = useTranslate();
  if (!user) return null;

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
              {t('edit_profile.cancel')}
            </Text>
          </Pressable>

          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {t('edit_profile.eyebrow')}
            </Text>
            <Text variant="display" weight="medium" display>
              {t(`edit_profile.titles.${route.params.section}`)}
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
  const t = useTranslate();

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
      setError(err instanceof Error ? err.message : t('edit_profile.error_save'));
    },
  });

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <TextField label={t('edit_profile.basics.field_name')} value={name} onChangeText={setName} />
      <TextField
        label={t('edit_profile.basics.field_bio')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('edit_profile.basics.bio_placeholder')}
        multiline
        numberOfLines={3}
      />
      <TextField
        label={t('edit_profile.basics.field_experience')}
        value={experienceText}
        onChangeText={setExperienceText}
        keyboardType="number-pad"
        placeholder={t('edit_profile.basics.experience_placeholder')}
      />
      <Button
        label={mutation.isPending ? t('edit_profile.saving') : t('edit_profile.save')}
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
  const t = useTranslate();

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
        throw new Error(t('edit_profile.resume.error_picker_not_installed'));
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
        throw new Error(t('edit_profile.resume.error_no_file'));
      }
      const file = result.assets[0];

      // Cap raw size at ~900KB so the base64 payload (~1.2MB) stays under
      // the express body limit comfortably.
      if (file.size != null && file.size > 900_000) {
        throw new Error(t('edit_profile.resume.error_size_too_big'));
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
      setError(err instanceof Error ? err.message : t('edit_profile.resume.error_upload_default'));
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
      setError(err instanceof Error ? err.message : t('edit_profile.resume.error_remove_default'));
    },
  });

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />

      <Text variant="body" tone="secondary">
        {t('edit_profile.resume.body_hint')}
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
              {formatRelativeDate(user.resumeUploadedAt, t)}
            </Text>
          </>
        ) : (
          <>
            <Text variant="bodyLarge" weight="medium" tone="secondary">
              {t('edit_profile.resume.no_resume_uploaded')}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {t('edit_profile.resume.pdf_docx_hint')}
            </Text>
          </>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          label={
            pickAndUploadMutation.isPending
              ? t('edit_profile.resume.uploading')
              : hasResume
                ? t('edit_profile.resume.replace_resume')
                : t('edit_profile.resume.upload_resume')
          }
          onPress={() => pickAndUploadMutation.mutate()}
          disabled={pickAndUploadMutation.isPending || removeMutation.isPending}
        />
        {hasResume && (
          <Button
            label={removeMutation.isPending ? t('edit_profile.resume.removing') : t('edit_profile.resume.remove_resume')}
            variant="danger"
            onPress={() => removeMutation.mutate()}
            disabled={removeMutation.isPending || pickAndUploadMutation.isPending}
          />
        )}
        <Button label={t('edit_profile.resume.done_btn')} variant="ghost" onPress={() => navigation.goBack()} />
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
    // The Error message is a developer log path — left English; the user
    // sees the translated "Could not upload resume" wrapper above.
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

function formatFileSize(bytes: number | null | undefined): string {
  // KB/MB/B units are universally read across languages — no translation needed.
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelativeDate(iso: string | null | undefined, t: TFn): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return t('edit_profile.resume.file_relative_today');
  if (d < 7) return t('edit_profile.resume.file_relative_d_ago', { n: d });
  if (d < 30) return t('edit_profile.resume.file_relative_w_ago', { n: Math.floor(d / 7) });
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── Location: city/area + GPS detect ────────────────────────────────────────

function LocationForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;
  const t = useTranslate();

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
      let resolvedCity = city.trim();
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
      // If we have GPS but no city typed, reverse-geocode so regional
      // Festival Mode (Pongal/Onam) can still match this user.
      if (!resolvedCity && c) {
        const detectedCity = await reverseGeocodeCity(c.lat, c.lng);
        if (detectedCity) {
          resolvedCity = detectedCity;
          setCity(detectedCity);
        }
      }
      return meApi.updateLocation({
        city: resolvedCity,
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
      setError(err instanceof Error ? err.message : t('edit_profile.error_save'));
    },
  });

  async function detect() {
    setDetecting(true);
    const c = await getCurrentCoords();
    if (c) {
      setCoords({ lat: c.lat, lng: c.lng });
      // Pre-fill city from reverse-geocode when the user hasn't typed
      // one yet. Keeps regional Festival Mode (Pongal/Onam) reachable
      // for users who only ever hit "Detect" and never edit the field.
      if (!city.trim()) {
        const detectedCity = await reverseGeocodeCity(c.lat, c.lng);
        if (detectedCity) setCity(detectedCity);
      }
      haptic('selection');
    } else {
      setError(t('edit_profile.location.error_detect_default'));
    }
    setDetecting(false);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <Button
        label={
          detecting
            ? t('edit_profile.location.detecting')
            : coords
              ? t('edit_profile.location.re_detect')
              : t('edit_profile.location.detect')
        }
        variant="secondary"
        onPress={() => void detect()}
        disabled={detecting}
      />
      {coords && (
        <Text variant="footnote" tone="tertiary">
          {t('edit_profile.location.using_coords', { lat: coords.lat.toFixed(4), lng: coords.lng.toFixed(4) })}
        </Text>
      )}
      <TextField label={t('edit_profile.location.field_city')} value={city} onChangeText={setCity} placeholder={t('edit_profile.location.city_placeholder')} />
      <TextField
        label={t('edit_profile.location.field_area')}
        value={area}
        onChangeText={setArea}
        placeholder={t('edit_profile.location.area_placeholder')}
      />
      <TextField
        label={t('edit_profile.location.field_pincode')}
        value={pincode}
        onChangeText={setPincode}
        keyboardType="number-pad"
        placeholder={t('edit_profile.location.pincode_placeholder')}
      />
      <Button
        label={mutation.isPending ? t('edit_profile.saving') : t('edit_profile.save')}
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
  const t = useTranslate();

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
      setError(err instanceof Error ? err.message : t('edit_profile.error_save'));
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
        {t('edit_profile.skills.hint')}
      </Text>

      {/* Trade grid — the primary picker.
       *
       * Bug history: an earlier version used a parent View with
       * `flexWrap: 'wrap' + gap`. On some devices the flex children
       * (Pressable + nested Texts) wrapped at the Text level rather
       * than the chip level, producing a layout where emojis stacked
       * above labels and taps didn't register on the intended chip.
       *
       * This version forces each chip to be a single self-contained
       * block: explicit flexShrink: 0, hard-coded contrasting colors
       * (#FFFFFF / #2563EB and #1E293B / #F8FAFC) so the active state
       * is unmistakable in both light and dark themes, and a hit-slop
       * around each Pressable so taps near the chip edge still land.
       */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TRADES.map((trade) => {
          const active = skills.includes(trade.slug);
          return (
            <Pressable
              key={trade.slug}
              onPress={() => toggleTrade(trade.slug)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={
                active
                  ? t('edit_profile.skills.trade_a11y_selected', { label: trade.label })
                  : t('edit_profile.skills.trade_a11y', { label: trade.label })
              }
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? '#2563EB' : '#1F2937',
                borderWidth: active ? 0 : 1,
                borderColor: active ? '#2563EB' : '#374151',
                opacity: pressed ? 0.7 : 1,
                flexShrink: 0,
              })}
            >
              <Text style={{ fontSize: 14 }}>{trade.emoji}</Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {tradeShortLabel(trade)}
              </Text>
              {active && <Feather name="check" size={13} color="#FFFFFF" />}
            </Pressable>
          );
        })}
      </View>

      {/* Free-text fallback for whatever the catalogue doesn't cover */}
      <View style={{ gap: spacing.xs }}>
        <Text variant="footnote" weight="medium" tone="secondary">
          {t('edit_profile.skills.add_custom_label')}
        </Text>
        <TextField
          label=""
          value={draft}
          onChangeText={setDraft}
          placeholder={t('edit_profile.skills.add_custom_placeholder')}
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
            {t('edit_profile.skills.add_btn')}
          </Text>
        </Pressable>
      </View>

      {/* Custom skills appear separately — catalogue trades are already
         highlighted in the grid above, so showing them twice is redundant. */}
      {customSkills.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="footnote" weight="medium" tone="secondary">
            {t('edit_profile.skills.custom_skills_label')}
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

      {/* Proof of skills — attach a certificate / licence / photo per
         skill. Uploads immediately (separate from the Save below) and
         shows to employers on the applicant view. */}
      <SkillProofSection user={user} selectedSkills={skills} />

      {/* Hardcoded blue/white CTA so it never disappears on stale themes. */}
      <Pressable
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
        accessibilityRole="button"
        accessibilityLabel={t('edit_profile.skills.save_a11y')}
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
          {mutation.isPending ? t('edit_profile.saving') : t('edit_profile.save')}
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
        {t('edit_profile.skills.count_selected', { n: skills.length })}
      </Text>
    </View>
  );
}

// ─── Skill proof — certificates / licences / photos per skill ────────────────

/**
 * Below the skill grid: each selected skill listed with an "Add proof"
 * button and the files already attached to it. Uploads go straight to
 * cloud storage and are saved immediately (independent of the Skills
 * "Save" button); employers see them per-skill on the applicant view.
 */
function SkillProofSection({
  user,
  selectedSkills,
}: {
  user: PublicUser;
  selectedSkills: string[];
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const setUser = useAuthStore.setState;

  const uploadMutation = useMutation({
    mutationFn: (input: {
      skill: string;
      dataUrl: string;
      fileName: string;
      mimeType: string;
    }) => meApi.uploadSkillDocument(input),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setUser((s) => ({ ...s, user: updated }));
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('skill_proof.error_title'),
        err instanceof Error ? err.message : t('skill_proof.error_generic'),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => meApi.deleteSkillDocument(id),
    onSuccess: ({ user: updated }) => {
      haptic('light');
      setUser((s) => ({ ...s, user: updated }));
    },
  });

  async function runPick(skill: string, source: SkillDocSource) {
    try {
      const picked = await pickSkillDoc(source);
      if (!picked) return;
      uploadMutation.mutate({
        skill,
        dataUrl: picked.dataUrl,
        fileName: picked.fileName,
        mimeType: picked.mimeType,
      });
    } catch (err) {
      Alert.alert(
        t('skill_proof.error_title'),
        err instanceof Error ? err.message : t('skill_proof.error_generic'),
      );
    }
  }

  function onAddProof(skill: string) {
    haptic('light');
    Alert.alert(t('skill_proof.add_title'), t('skill_proof.add_body'), [
      { text: t('skill_proof.opt_camera'), onPress: () => void runPick(skill, 'camera') },
      { text: t('skill_proof.opt_gallery'), onPress: () => void runPick(skill, 'gallery') },
      { text: t('skill_proof.opt_pdf'), onPress: () => void runPick(skill, 'pdf') },
      { text: t('skill_proof.cancel'), style: 'cancel' },
    ]);
  }

  if (selectedSkills.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary">
        {t('skill_proof.section_title')}
      </Text>
      <Text variant="caption" tone="tertiary">
        {t('skill_proof.section_hint')}
      </Text>

      {selectedSkills.map((skill) => {
        const trade = findTrade(skill);
        const label = trade ? tradeShortLabel(trade) : prettifySkill(skill);
        const docs = (user.skillDocuments ?? []).filter((d) => d.skill === skill);
        return (
          <View
            key={skill}
            style={{
              backgroundColor: theme.bg.surface,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Feather name="tool" size={14} color={theme.text.secondary} />
                <Text
                  variant="footnote"
                  weight="medium"
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {label}
                </Text>
              </View>
              <Pressable
                onPress={() => onAddProof(skill)}
                disabled={uploadMutation.isPending}
                hitSlop={6}
                accessibilityRole="button"
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: '#2563EB',
                  opacity: uploadMutation.isPending ? 0.5 : 1,
                }}
              >
                <Text variant="caption" weight="medium" style={{ color: '#2563EB' }}>
                  + {t('skill_proof.add')}
                </Text>
              </Pressable>
            </View>

            {docs.length === 0 ? (
              <Text variant="caption" tone="tertiary">
                {t('skill_proof.none_yet')}
              </Text>
            ) : (
              docs.map((d) => (
                <View
                  key={d.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    paddingVertical: 4,
                  }}
                >
                  <Feather
                    name={d.kind === 'photo' ? 'image' : 'file-text'}
                    size={14}
                    color={theme.text.tertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="caption"
                      weight="medium"
                      numberOfLines={1}
                      style={{ color: theme.text.secondary }}
                    >
                      {d.extracted?.title || d.fileName}
                    </Text>
                    {d.extracted && (d.extracted.issuer || d.extracted.issuedOn) ? (
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 10, color: theme.text.tertiary }}
                      >
                        {[d.extracted.issuer, d.extracted.issuedOn]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => deleteMutation.mutate(d.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('skill_proof.remove_a11y', {
                      name: d.fileName,
                    })}
                  >
                    <Feather name="x" size={16} color={theme.text.tertiary} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}


// ─── Preferences: availability + preferred job types ─────────────────────────

function PreferencesForm({ user }: { user: PublicUser }) {
  const navigation = useNavigation<Nav>();
  const setUser = useAuthStore.setState;
  const { theme } = useTheme();
  const t = useTranslate();

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
      setError(err instanceof Error ? err.message : t('edit_profile.error_save'));
    },
  });

  function toggleType(jt: JobType) {
    setTypes((arr) => (arr.includes(jt) ? arr.filter((x) => x !== jt) : [...arr, jt]));
    haptic('selection');
  }

  // Labels resolved via translation keys; the enum keys stay as the source of truth.
  const availabilityOptions: Array<{ key: Availability; labelKey: string }> = [
    { key: 'immediate', labelKey: 'edit_profile.preferences.availability_immediate' },
    { key: 'within_1_week', labelKey: 'edit_profile.preferences.availability_within_1_week' },
    { key: 'within_1_month', labelKey: 'edit_profile.preferences.availability_within_1_month' },
    { key: 'flexible', labelKey: 'edit_profile.preferences.availability_flexible' },
  ];

  // Reuses the shared common.job_type.* keys established in PR 1.
  const typeOptions: Array<{ key: JobType; labelKey: string }> = [
    { key: 'full_time', labelKey: 'common.job_type.full_time' },
    { key: 'part_time', labelKey: 'common.job_type.part_time' },
    { key: 'gig', labelKey: 'common.job_type.gig' },
    { key: 'shift', labelKey: 'common.job_type.shift' },
    { key: 'contract', labelKey: 'common.job_type.contract' },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />

      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('edit_profile.preferences.applying_as_label')}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[
            { key: 'solo' as const, labelKey: 'edit_profile.preferences.solo_label', helperKey: 'edit_profile.preferences.solo_helper' },
            { key: 'team' as const, labelKey: 'edit_profile.preferences.team_label', helperKey: 'edit_profile.preferences.team_helper' },
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
                  {t(o.labelKey)}
                </Text>
                <Text variant="footnote" tone="tertiary">
                  {t(o.helperKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {workType === 'team' ? (
        <TextField
          label={t('edit_profile.preferences.team_size_label')}
          value={teamSizeText}
          onChangeText={(v) => setTeamSizeText(v.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          helper={t('edit_profile.preferences.team_size_helper')}
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('edit_profile.preferences.availability_label')}
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
                  {t(o.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('edit_profile.preferences.interested_in_label')}
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
                  {t(o.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        label={mutation.isPending ? t('edit_profile.saving') : t('edit_profile.save')}
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
  const t = useTranslate();

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
      setError(err instanceof Error ? err.message : t('edit_profile.error_save'));
    },
  });

  const types: Array<{ key: BusinessType; labelKey: string }> = [
    { key: 'individual', labelKey: 'edit_profile.business_basics.type_individual' },
    { key: 'shop', labelKey: 'edit_profile.business_basics.type_shop' },
    { key: 'restaurant', labelKey: 'edit_profile.business_basics.type_restaurant' },
    { key: 'salon', labelKey: 'edit_profile.business_basics.type_salon' },
    { key: 'agency', labelKey: 'edit_profile.business_basics.type_agency' },
    { key: 'startup', labelKey: 'edit_profile.business_basics.type_startup' },
    { key: 'enterprise', labelKey: 'edit_profile.business_basics.type_enterprise' },
    { key: 'other', labelKey: 'edit_profile.business_basics.type_other' },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <TextField
        label={t('edit_profile.business_basics.field_business_name')}
        value={companyName}
        onChangeText={setCompanyName}
        placeholder={t('edit_profile.business_basics.business_name_placeholder')}
      />

      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          {t('edit_profile.business_basics.business_type_label')}
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
                  {t(o.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label={t('edit_profile.business_basics.field_gstin')}
        value={gstin}
        onChangeText={(v) => setGstin(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t('edit_profile.business_basics.gstin_placeholder')}
      />

      <Button
        label={mutation.isPending ? t('edit_profile.saving') : t('edit_profile.save')}
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
  const t = useTranslate();

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
      let resolvedCity = city.trim();
      if (!c) {
        const detected = await getCurrentCoords();
        c = detected
          ? { lat: detected.lat, lng: detected.lng }
          : { lat: 12.9716, lng: 77.5946 };
        setCoords(c);
      }
      // Pre-fill city from reverse-geocode if the employer hasn't typed
      // one — mirrors the seeker form so business locations also carry
      // a usable city string downstream.
      if (!resolvedCity && c) {
        const detectedCity = await reverseGeocodeCity(c.lat, c.lng);
        if (detectedCity) {
          resolvedCity = detectedCity;
          setCity(detectedCity);
        }
      }
      return meApi.updateEmployerLocation({
        city: resolvedCity,
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
      setError(err instanceof Error ? err.message : t('edit_profile.error_save'));
    },
  });

  async function detect() {
    setDetecting(true);
    const c = await getCurrentCoords();
    if (c) {
      setCoords({ lat: c.lat, lng: c.lng });
      // Pre-fill city from reverse-geocode when the user hasn't typed
      // one yet. Keeps regional Festival Mode (Pongal/Onam) reachable
      // for users who only ever hit "Detect" and never edit the field.
      if (!city.trim()) {
        const detectedCity = await reverseGeocodeCity(c.lat, c.lng);
        if (detectedCity) setCity(detectedCity);
      }
      haptic('selection');
    } else {
      setError(t('edit_profile.location.error_detect_default'));
    }
    setDetecting(false);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <FormError message={error} />
      <Button
        label={detecting ? t('edit_profile.location.detecting') : coords ? t('edit_profile.business_location.re_detect') : t('edit_profile.location.detect')}
        variant="secondary"
        onPress={() => void detect()}
        disabled={detecting}
      />
      {coords && (
        <Text variant="footnote" tone="tertiary">
          {t('edit_profile.location.using_coords', { lat: coords.lat.toFixed(4), lng: coords.lng.toFixed(4) })}
        </Text>
      )}
      <TextField label={t('edit_profile.location.field_city')} value={city} onChangeText={setCity} placeholder={t('edit_profile.location.city_placeholder')} />
      <TextField label={t('edit_profile.location.field_area')} value={area} onChangeText={setArea} placeholder={t('edit_profile.location.area_placeholder')} />
      <TextField
        label={t('edit_profile.location.field_pincode')}
        value={pincode}
        onChangeText={setPincode}
        keyboardType="number-pad"
        placeholder={t('edit_profile.location.pincode_placeholder')}
      />
      <Button
        label={mutation.isPending ? t('edit_profile.saving') : t('edit_profile.save')}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending || !city.trim()}
      />
    </View>
  );
}
