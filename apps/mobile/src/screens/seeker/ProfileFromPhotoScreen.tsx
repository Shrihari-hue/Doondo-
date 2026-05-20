/**
 * ProfileFromPhotoScreen — "Snap a photo to fill your profile."
 *
 * The single biggest activation feature for low-literacy users. Three
 * stages, each rendered inline as the state advances:
 *
 *   1. SOURCE PICK — Camera or Library. Two big buttons, one tap.
 *   2. EXTRACTING — show the picked image with a loading overlay
 *      while the backend's vision provider extracts fields.
 *   3. CONFIRM — show every extracted field with edit affordances.
 *      Each field has a clear default + an inline edit; nothing
 *      saves until the seeker taps the Save button. The confidence
 *      pill at the top sets expectations ("Looks clear" vs "Please
 *      double-check").
 *
 * On save:
 *   - PATCH /me/profile with name, bio, skills, experienceYears, education.
 *   - PUT /me/work-history with the extracted work history (if any).
 *   - Invalidate the auth cache so /auth/me reflects new fields.
 *
 * Errors at any stage are surfaced inline so the worker can retry
 * without leaving the screen.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { haptic } from '@/lib/haptics';
import { pickProfileDocument } from '@/lib/profileDocument';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { useTranslate } from '@/i18n/useTranslate';
import { profileExtractApi } from '@/api/profileExtract.api';
import { meApi } from '@/api/me.api';
import type { ExtractedProfile } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Stage = 'pick' | 'extracting' | 'confirm';
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function ProfileFromPhotoInner() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>('pick');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedProfile | null>(null);

  // Editable working copy of the extracted fields. Initialized when the
  // server returns. The save mutation reads from this so any inline
  // edits are persisted instead of the raw extraction.
  const [draft, setDraft] = useState<ExtractedProfile | null>(null);

  // ─── Pick + extract ─────────────────────────────────────────────────────
  const pickAndExtract = useCallback(
    async (source: 'camera' | 'library') => {
      setError(null);
      haptic('selection');
      try {
        const doc = await pickProfileDocument({ source });
        if (!doc) return; // user cancelled
        setImageDataUrl(doc.dataUrl);
        setStage('extracting');
        const res = await profileExtractApi.extractFromPhoto(doc.dataUrl);
        setExtracted(res.extracted);
        setDraft(res.extracted);
        haptic('success');
        setStage('confirm');
      } catch (err) {
        haptic('error');
        setStage('pick');
        setError(
          friendlyErrorMessage(err, t('profile_from_photo.error_read')),
        );
      }
    },
    [],
  );

  // ─── Save mutation ──────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (final: ExtractedProfile) => {
      // 1. Profile basics + education in one PATCH.
      await meApi.updateProfile({
        ...(final.name ? { name: final.name } : {}),
        ...(final.bio !== null ? { bio: final.bio } : {}),
        ...(final.experienceYears !== null
          ? { experienceYears: final.experienceYears }
          : {}),
        ...(final.skills.length > 0 ? { skills: final.skills } : {}),
        ...(final.education.length > 0
          ? {
              education: final.education.map((e) => ({
                degree: e.degree,
                institution: e.institution,
                fieldOfStudy: e.fieldOfStudy ?? null,
                startYear: e.startYear,
                endYear: e.current ? null : e.endYear ?? null,
                current: e.current,
              })),
            }
          : {}),
      });
      // 2. Work history as a separate PUT (different endpoint by design).
      if (final.workHistory.length > 0) {
        await meApi.updateWorkHistory({
          entries: final.workHistory.map((w) => ({
            company: w.company,
            role: w.role,
            startDate: w.startDate,
            endDate: w.current ? null : w.endDate ?? null,
            current: w.current,
            description: w.description ?? null,
          })),
        });
      }
    },
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      Alert.alert(
        t('profile_from_photo.saved_title'),
        t('profile_from_photo.saved_body'),
        [
          {
            text: t('profile_from_photo.saved_cta'),
            onPress: () => navigation.goBack(),
          },
        ],
      );
    },
    onError: (err) => {
      haptic('error');
      setError(
        friendlyErrorMessage(err, t('profile_from_photo.error_save')),
      );
    },
  });

  const onSave = useCallback(() => {
    if (!draft) return;
    saveMutation.mutate(draft);
  }, [draft, saveMutation]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing['3xl'],
          paddingHorizontal: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityLabel={t('profile_from_photo.a11y_back')}
            accessibilityRole="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="chevron-left" size={20} color={theme.text.primary} />
          </Pressable>
          <Text variant="title" weight="medium" accessibilityRole="header">
            {t('profile_from_photo.header')}
          </Text>
        </View>

        {/* Stage 1: source pick */}
        {stage === 'pick' && (
          <PickStage
            onCamera={() => pickAndExtract('camera')}
            onLibrary={() => pickAndExtract('library')}
            error={error}
          />
        )}

        {/* Stage 2: extracting */}
        {stage === 'extracting' && imageDataUrl && (
          <ExtractingStage imageDataUrl={imageDataUrl} />
        )}

        {/* Stage 3: confirm */}
        {stage === 'confirm' && draft && (
          <ConfirmStage
            draft={draft}
            onChange={setDraft}
            onSave={onSave}
            onRetake={() => {
              setStage('pick');
              setExtracted(null);
              setDraft(null);
              setImageDataUrl(null);
              setError(null);
            }}
            saving={saveMutation.isPending}
            error={error}
            originalConfidence={extracted?.confidence ?? 'low'}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

// ─── Stage 1: source pick ──────────────────────────────────────────────────

function PickStage({
  onCamera,
  onLibrary,
  error,
}: {
  onCamera: () => void;
  onLibrary: () => void;
  error: string | null;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <Text
          variant="footnote"
          weight="medium"
          style={{ letterSpacing: 1.2, color: theme.brand.hero }}
        >
          {t('profile_from_photo.eyebrow')}
        </Text>
        <Text variant="displayLarge" weight="medium" display>
          {t('profile_from_photo.title')}
        </Text>
        <Text variant="body" tone="secondary">
          {t('profile_from_photo.subtitle')}
        </Text>
      </View>

      {error && (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: theme.status.dangerSubtle,
            borderWidth: 0.5,
            borderColor: theme.status.dangerBorder,
          }}
        >
          <Text variant="footnote" weight="medium" style={{ color: theme.status.danger }}>
            {error}
          </Text>
        </View>
      )}

      <View style={{ gap: spacing.md }}>
        <PickAction
          icon="camera"
          title={t('profile_from_photo.pick_camera_title')}
          subtitle={t('profile_from_photo.pick_camera_sub')}
          onPress={onCamera}
          primary
        />
        <PickAction
          icon="image"
          title={t('profile_from_photo.pick_library_title')}
          subtitle={t('profile_from_photo.pick_library_sub')}
          onPress={onLibrary}
        />
      </View>

      <View
        style={{
          padding: spacing.lg,
          borderRadius: radii.lg,
          backgroundColor: theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.default,
          gap: spacing.xs,
        }}
      >
        <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0 }}>
          {t('profile_from_photo.tips_label')}
        </Text>
        <Text variant="footnote" tone="secondary" style={{ lineHeight: 18 }}>
          {t('profile_from_photo.tips_body')}
        </Text>
      </View>
    </View>
  );
}

function PickAction({
  icon,
  title,
  subtitle,
  onPress,
  primary,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        padding: spacing.lg,
        borderRadius: radii.lg,
        borderWidth: primary ? 0 : 0.5,
        borderColor: theme.border.default,
        backgroundColor: primary ? theme.brand.hero : theme.bg.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? 'rgba(255,253,247,0.18)' : theme.brand.heroSubtle,
        }}
      >
        <Feather name={icon} size={20} color={primary ? '#FFFDF7' : theme.brand.hero} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="bodyLarge"
          weight="medium"
          style={{ color: primary ? '#FFFDF7' : theme.text.primary }}
        >
          {title}
        </Text>
        <Text
          variant="footnote"
          style={{ color: primary ? 'rgba(255,253,247,0.85)' : theme.text.secondary }}
        >
          {subtitle}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={18}
        color={primary ? '#FFFDF7' : theme.text.secondary}
      />
    </Pressable>
  );
}

// ─── Stage 2: extracting ───────────────────────────────────────────────────

function ExtractingStage({ imageDataUrl }: { imageDataUrl: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  return (
    <View style={{ alignItems: 'center', gap: spacing.lg, marginTop: spacing.xl }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 3 / 4,
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: theme.border.default,
          backgroundColor: theme.bg.muted,
        }}
      >
        <Image
          source={{ uri: imageDataUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <ActivityIndicator size="small" color={theme.brand.hero} />
        <Text variant="bodyLarge" weight="medium">
          {t('profile_from_photo.extracting_title')}
        </Text>
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          {t('profile_from_photo.extracting_sub')}
        </Text>
      </View>
    </View>
  );
}

// ─── Stage 3: confirm ──────────────────────────────────────────────────────

function ConfirmStage({
  draft,
  onChange,
  onSave,
  onRetake,
  saving,
  error,
  originalConfidence,
}: {
  draft: ExtractedProfile;
  onChange: (next: ExtractedProfile) => void;
  onSave: () => void;
  onRetake: () => void;
  saving: boolean;
  error: string | null;
  originalConfidence: ExtractedProfile['confidence'];
}) {
  const { theme } = useTheme();
  const t = useTranslate();

  const updateField = useCallback(
    <K extends keyof ExtractedProfile>(key: K, value: ExtractedProfile[K]) => {
      onChange({ ...draft, [key]: value });
    },
    [draft, onChange],
  );

  const updateSkillsString = (raw: string) => {
    const skills = raw
      .split(',')
      .map((s) => s.trim().toLowerCase().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);
    updateField('skills', skills);
  };

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Header + confidence */}
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="displayLarge" weight="medium" display style={{ flex: 1 }}>
            {t('profile_from_photo.confirm_title')}
          </Text>
          <Pill
            label={confidenceLabel(originalConfidence, t)}
            tone={
              originalConfidence === 'high'
                ? 'success'
                : originalConfidence === 'medium'
                  ? 'info'
                  : 'warning'
            }
          />
        </View>
        <Text variant="body" tone="secondary">
          {t('profile_from_photo.confirm_sub')}
        </Text>
      </View>

      {/* Name */}
      <Field
        label={t('profile_from_photo.field_name')}
        value={draft.name ?? ''}
        placeholder={t('profile_from_photo.field_name_ph')}
        onChangeText={(v) => updateField('name', v || null)}
      />

      {/* Bio */}
      <Field
        label={t('profile_from_photo.field_bio')}
        value={draft.bio ?? ''}
        placeholder={t('profile_from_photo.field_bio_ph')}
        multiline
        onChangeText={(v) => updateField('bio', v || null)}
      />

      {/* Skills */}
      <Field
        label={t('profile_from_photo.field_skills')}
        value={draft.skills.join(', ')}
        placeholder={t('profile_from_photo.field_skills_ph')}
        onChangeText={updateSkillsString}
        hint={t('profile_from_photo.field_skills_hint', { count: draft.skills.length })}
      />

      {/* Experience years */}
      <Field
        label={t('profile_from_photo.field_experience')}
        value={draft.experienceYears != null ? String(draft.experienceYears) : ''}
        placeholder="3"
        keyboardType="number-pad"
        onChangeText={(v) => {
          const n = parseInt(v, 10);
          updateField('experienceYears', Number.isFinite(n) && n >= 0 ? Math.min(60, n) : null);
        }}
      />

      {/* Location */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('profile_from_photo.field_city')}
            value={draft.location.city ?? ''}
            placeholder="Bengaluru"
            onChangeText={(v) =>
              updateField('location', { ...draft.location, city: v || null })
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('profile_from_photo.field_area')}
            value={draft.location.area ?? ''}
            placeholder="Indiranagar"
            onChangeText={(v) =>
              updateField('location', { ...draft.location, area: v || null })
            }
          />
        </View>
      </View>

      {/* Work history — read-only summary; editing happens in ResumeBuilder. */}
      {draft.workHistory.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0 }}>
            {t('profile_from_photo.work_history_label', {
              count: draft.workHistory.length,
            })}
          </Text>
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.surface,
              gap: spacing.sm,
            }}
          >
            {draft.workHistory.map((w, i) => (
              <View key={`${w.company}-${i}`} style={{ gap: 2 }}>
                <Text variant="bodyLarge" weight="medium">
                  {w.role}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {w.company} ·{' '}
                  {w.startDate}–
                  {w.current ? t('profile_from_photo.present') : w.endDate}
                </Text>
              </View>
            ))}
            <Text variant="caption" tone="tertiary">
              {t('profile_from_photo.work_history_note')}
            </Text>
          </View>
        </View>
      )}

      {/* Education summary */}
      {draft.education.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0 }}>
            {t('profile_from_photo.education_label', {
              count: draft.education.length,
            })}
          </Text>
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.surface,
              gap: spacing.sm,
            }}
          >
            {draft.education.map((e, i) => (
              <View key={`${e.degree}-${i}`} style={{ gap: 2 }}>
                <Text variant="bodyLarge" weight="medium">
                  {e.degree}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {e.institution} ·{' '}
                  {e.startYear}–
                  {e.current ? t('profile_from_photo.present') : e.endYear}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {error && (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: theme.status.dangerSubtle,
            borderWidth: 0.5,
            borderColor: theme.status.dangerBorder,
          }}
        >
          <Text variant="footnote" weight="medium" style={{ color: theme.status.danger }}>
            {error}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={onRetake}
          disabled={saving}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: spacing.md,
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="bodyLarge" weight="medium">
            {t('profile_from_photo.retake')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => ({
            flex: 2,
            paddingVertical: spacing.md,
            borderRadius: radii.pill,
            backgroundColor: theme.brand.hero,
            alignItems: 'center',
            opacity: saving ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFDF7' }}>
            {saving ? t('profile_from_photo.saving') : t('profile_from_photo.save')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function confidenceLabel(c: ExtractedProfile['confidence'], t: TFn): string {
  return c === 'high'
    ? t('profile_from_photo.confidence_high')
    : c === 'medium'
      ? t('profile_from_photo.confidence_medium')
      : t('profile_from_photo.confidence_low');
}

// ─── Reusable field ────────────────────────────────────────────────────────

function Field({
  label,
  value,
  placeholder,
  onChangeText,
  multiline,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  hint?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0 }}>
          {label}
        </Text>
        {hint && (
          <Text variant="caption" tone="tertiary">
            {hint}
          </Text>
        )}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text.tertiary}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
        style={{
          fontSize: 16,
          color: theme.text.primary,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          borderWidth: 0.5,
          borderColor: theme.border.default,
          backgroundColor: theme.bg.surface,
          minHeight: multiline ? 72 : undefined,
          textAlignVertical: multiline ? 'top' : 'auto',
        }}
        autoCapitalize="sentences"
      />
    </View>
  );
}

export function ProfileFromPhotoScreen() {
  return (
    <SeekerThemeOverride>
      <ProfileFromPhotoInner />
    </SeekerThemeOverride>
  );
}
