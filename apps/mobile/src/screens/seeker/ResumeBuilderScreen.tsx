/**
 * ResumeBuilderScreen — guided wizard for workers without a formal CV.
 *
 * Walks through the seeker's last 1-5 jobs one at a time:
 *
 *   Slide 0     Intro: "Let's build your resume in 3 minutes"
 *   Slide 1..N  One slide per job (company, role, dates, description)
 *   Slide N+1   Review screen — edit / remove / add another / generate
 *
 * Saves to /me/work-history (PUT) when the user hits "Generate resume".
 * After saving, replaces the navigation stack with ResumePreview so
 * back-button doesn't dump them back into a half-filled wizard.
 *
 * The wizard pre-fills with whatever's already on the user's record so
 * tapping "Edit my resume" later picks up where they left off.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { haptic } from '@/lib/haptics';
import { pickWorkPhoto } from '@/lib/photo';
import { meApi, type WorkHistoryEntryInput } from '@/api/me.api';
import { ApiError } from '@/api/errors';
import type { CraftPhoto } from '@/api/types';
import { isGallerySkill } from '@/lib/craftShowcase';
import { prettifySkill } from '@/lib/trades';
import {
  currentMonth,
  formatMonthYear,
  sortWorkHistory,
} from '@/lib/workHistory';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const MAX_JOBS = 5;

interface DraftEntry {
  company: string;
  role: string;
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM (ignored when current)
  current: boolean;
  description: string;
}

interface EducationDraft {
  degree: string;
  institution: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
  current: boolean;
}

function emptyEducation(): EducationDraft {
  return {
    degree: '',
    institution: '',
    fieldOfStudy: '',
    startYear: '',
    endYear: '',
    current: false,
  };
}

function ResumeBuilderInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;
  const t = useTranslate();

  // Hydrate from existing workHistory so editing picks up where they left off.
  const initialDrafts = useMemo<DraftEntry[]>(() => {
    const existing = user?.workHistory ?? [];
    if (existing.length === 0) return [emptyDraft()];
    return sortWorkHistory(existing).map((w) => ({
      company: w.company,
      role: w.role,
      startDate: w.startDate,
      endDate: w.endDate ?? currentMonth(),
      current: w.current,
      description: w.description ?? '',
    }));
  }, [user?.workHistory]);

  // Step 0 = intro. 1..drafts.length = per-job edit. Final = review.
  const [step, setStep] = useState<number>(initialDrafts.length === 1 && !initialDrafts[0]!.company ? 0 : -1);
  const [drafts, setDrafts] = useState<DraftEntry[]>(initialDrafts);
  // Work-sample photos — hydrated from the user's existing list, edited
  // locally, persisted at the same time as the work history when the
  // seeker taps "Generate resume". Up to 6. Each photo is tagged to one
  // of the worker's craft skills so the showcase can group it.
  const [photos, setPhotos] = useState<CraftPhoto[]>(user?.workPhotos ?? []);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  // The worker's gallery-type craft skills (baking, tailoring, …). Only
  // these can carry a photo showcase; new photos are tagged to the first
  // one and can be re-tagged per photo.
  const galleryOptions = useMemo(
    () => (user?.skills ?? []).filter(isGallerySkill),
    [user?.skills],
  );
  // Education — local list, saved with the wizard's main mutation.
  const [education, setEducation] = useState<EducationDraft[]>(
    (user?.education ?? []).map((e) => ({
      degree: e.degree,
      institution: e.institution,
      fieldOfStudy: e.fieldOfStudy ?? '',
      startYear: String(e.startYear),
      endYear: e.endYear != null ? String(e.endYear) : '',
      current: e.current,
    })),
  );

  // If the user has existing entries, skip the intro and land on review.
  useEffect(() => {
    if (step === -1) {
      const seeded = drafts.some((d) => d.company.trim() || d.role.trim());
      setStep(seeded ? drafts.length + 1 : 0);
    }
  }, [step, drafts]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: WorkHistoryEntryInput[] = drafts
        .filter((d) => d.company.trim() && d.role.trim() && d.startDate)
        .map((d) => ({
          company: d.company.trim(),
          role: d.role.trim(),
          startDate: d.startDate,
          endDate: d.current ? null : d.endDate,
          current: d.current,
          description: d.description.trim() || null,
        }));
      // Two writes — order matters only for telemetry, both go to /me.
      // Run them sequentially so the second write sees the freshest user
      // and React Query's invalidate only fires once.
      await meApi.updateWorkHistory({ entries: payload });
      // Only PATCH photos / education if they actually changed — most
      // edits don't touch them, no point sending kilobytes on every save.
      const initialPhotos = user?.workPhotos ?? [];
      const photosChanged =
        photos.length !== initialPhotos.length ||
        photos.some((p, i) => {
          const before = initialPhotos[i];
          return (
            !before ||
            p.url !== before.url ||
            p.skill !== before.skill ||
            (p.caption ?? null) !== (before.caption ?? null) ||
            Boolean(p.isCover) !== Boolean(before.isCover)
          );
        });
      const initialEducation = user?.education ?? [];
      const educationOut = education
        .filter((e) => e.degree.trim() && e.institution.trim() && e.startYear.trim())
        .map((e) => ({
          degree: e.degree.trim(),
          institution: e.institution.trim(),
          fieldOfStudy: e.fieldOfStudy.trim() || null,
          startYear: Number(e.startYear),
          endYear:
            e.current || !e.endYear.trim() ? null : Number(e.endYear),
          current: e.current,
        }));
      const educationChanged =
        educationOut.length !== initialEducation.length ||
        educationOut.some((e, i) => {
          const o = initialEducation[i];
          return (
            !o ||
            o.degree !== e.degree ||
            o.institution !== e.institution ||
            (o.fieldOfStudy ?? null) !== e.fieldOfStudy ||
            o.startYear !== e.startYear ||
            (o.endYear ?? null) !== e.endYear ||
            o.current !== e.current
          );
        });
      const patch: Parameters<typeof meApi.updateProfile>[0] = {};
      if (photosChanged) {
        // The backend rejects any photo tagged to a skill that isn't one
        // of the worker's craft skills. Re-tag stragglers (e.g. legacy
        // photos migrated with no craft skill) to the worker's first
        // craft so the save can't 400. `photosChanged` is only ever true
        // when the photo grid is shown, which means galleryOptions[0]
        // exists.
        const validSkills = new Set(galleryOptions);
        patch.workPhotos = photos.map((p) =>
          validSkills.has(p.skill) ? p : { ...p, skill: galleryOptions[0] ?? p.skill },
        );
      }
      if (educationChanged) patch.education = educationOut;
      return meApi.updateProfile(patch);
    },
    onSuccess: ({ user: updated }) => {
      // Refresh the cached auth user + invalidate any /me reads.
      setStore((s) => ({ ...s, user: updated }));
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      haptic('success');
      // Replace stack so back-button doesn't dump them in the wizard.
      navigation.replace('ResumePreview');
    },
    onError: (err) => {
      haptic('error');
      const msg = err instanceof ApiError ? err.message : t('resume_builder.try_again_in_a_minute');
      Alert.alert(t('resume_builder.couldnt_save_title'), msg);
    },
  });

  const updateDraft = (i: number, patch: Partial<DraftEntry>) => {
    setDrafts((cur) => cur.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  };
  const removeDraft = (i: number) => {
    setDrafts((cur) => cur.filter((_, idx) => idx !== i));
  };
  const addDraft = () => {
    if (drafts.length >= MAX_JOBS) return;
    setDrafts((cur) => [...cur, emptyDraft()]);
    haptic('selection');
  };

  const addPhoto = async () => {
    if (photos.length >= 6 || pickingPhoto) return;
    // A photo has to belong to a craft. With no craft skill there's
    // nothing to tag it to, so the section shows guidance instead.
    const defaultSkill = galleryOptions[0];
    if (!defaultSkill) return;
    setPickingPhoto(true);
    haptic('selection');
    try {
      const picked = await pickWorkPhoto();
      if (picked) {
        setPhotos((cur) => [
          ...cur,
          { url: picked.dataUrl, skill: defaultSkill, caption: null, isCover: false },
        ]);
        haptic('light');
      }
    } catch (err) {
      haptic('error');
      Alert.alert(
        t('resume_builder.couldnt_add_photo_title'),
        err instanceof Error ? err.message : t('resume_builder.try_smaller_image'),
      );
    } finally {
      setPickingPhoto(false);
    }
  };

  // Re-tag a photo to a different craft. Surfaced as a tap on the photo's
  // skill chip; only meaningful when the worker has more than one craft.
  const retagPhoto = (index: number) => {
    if (galleryOptions.length < 2) return;
    Alert.alert('Tag this photo', 'Which craft does this photo show?', [
      ...galleryOptions.map((slug) => ({
        text: prettifySkill(slug),
        onPress: () => {
          setPhotos((cur) => cur.map((p, i) => (i === index ? { ...p, skill: slug } : p)));
          haptic('selection');
        },
      })),
      { text: t('resume_builder.cancel'), style: 'cancel' as const },
    ]);
  };

  const removePhoto = (index: number) => {
    Alert.alert(t('resume_builder.remove_photo_title'), t('resume_builder.remove_photo_body'), [
      { text: t('resume_builder.cancel'), style: 'cancel' },
      {
        text: t('resume_builder.remove'),
        style: 'destructive',
        onPress: () => {
          setPhotos((cur) => cur.filter((_, i) => i !== index));
          haptic('warning');
        },
      },
    ]);
  };

  const isReview = step === drafts.length + 1;
  const isIntro = step === 0;
  const editIndex = !isIntro && !isReview ? step - 1 : null;
  const editingDraft = editIndex !== null ? drafts[editIndex] : null;

  const goBack = () => {
    haptic('light');
    if (isIntro) {
      navigation.goBack();
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  };

  const goNext = () => {
    Keyboard.dismiss();
    if (isIntro) {
      haptic('selection');
      setStep(1);
      return;
    }
    if (editingDraft) {
      const err = validate(editingDraft, t);
      if (err) {
        haptic('error');
        Alert.alert(t('resume_builder.couldnt_continue_title'), err);
        return;
      }
      haptic('selection');
      setStep(step + 1);
      return;
    }
    if (isReview) {
      const validEntries = drafts.filter((d) => d.company.trim() && d.role.trim());
      if (validEntries.length === 0) {
        haptic('error');
        Alert.alert(t('resume_builder.add_a_job_first_title'), t('resume_builder.add_a_job_first_body'));
        return;
      }
      save.mutate();
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.md,
          }}
        >
          <Pressable onPress={goBack} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
          >
            {t('resume_builder.header_title')}
          </Text>
          {isReview ? (
            <Pressable
              onPress={() => {
                haptic('selection');
                navigation.navigate('ResumePreview');
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('resume_builder.header_preview')}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                {t('resume_builder.header_preview')}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
              {progressLabel(step, drafts.length, isReview, t)}
            </Text>
          )}
        </View>
        <ProgressBar step={step} totalSteps={drafts.length + 2} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {isIntro ? (
          <IntroSlide t={t} />
        ) : isReview ? (
          <>
            <ReviewSlide
              t={t}
              drafts={drafts}
              onEdit={(i) => setStep(i + 1)}
              onRemove={(i) => {
                if (drafts.length === 1) {
                  Alert.alert(t('resume_builder.need_at_least_one_title'), t('resume_builder.need_at_least_one_body'));
                  return;
                }
                Alert.alert(t('resume_builder.remove_job_title'), t('resume_builder.remove_job_body'), [
                  { text: t('resume_builder.cancel'), style: 'cancel' },
                  {
                    text: t('resume_builder.remove'),
                    style: 'destructive',
                    onPress: () => {
                      removeDraft(i);
                      haptic('warning');
                    },
                  },
                ]);
              }}
              onAdd={addDraft}
              canAdd={drafts.length < MAX_JOBS}
            />
            <EducationSection
              t={t}
              education={education}
              onChange={setEducation}
            />
            <WorkPhotosSection
              t={t}
              photos={photos}
              galleryOptions={galleryOptions}
              onAdd={addPhoto}
              onRemove={removePhoto}
              onRetag={retagPhoto}
              picking={pickingPhoto}
            />
          </>
        ) : editingDraft && editIndex !== null ? (
          <EditSlide
            t={t}
            index={editIndex}
            total={drafts.length}
            draft={editingDraft}
            onChange={(patch) => updateDraft(editIndex, patch)}
          />
        ) : null}
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.md,
          paddingTop: spacing.sm,
          borderTopWidth: 0.5,
          borderTopColor: theme.border.subtle,
          backgroundColor: theme.bg.canvas,
          gap: spacing.sm,
        }}
      >
        <Pressable
          onPress={goNext}
          disabled={save.isPending}
          style={({ pressed }) => ({
            paddingVertical: spacing.md + 2,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#2563EB',
            opacity: save.isPending ? 0.5 : pressed ? 0.85 : 1,
            shadowColor: '#2563EB',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          })}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
            {save.isPending
              ? t('resume_builder.cta_saving')
              : isReview
                ? t('resume_builder.cta_generate')
                : isIntro
                  ? t('resume_builder.cta_start')
                  : t('resume_builder.cta_continue')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Slides ──────────────────────────────────────────────────────────────────

function IntroSlide({ t }: { t: TFn }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
      <Text style={{ fontSize: 64, textAlign: 'center' }}>📝</Text>
      <Text
        style={{
          fontSize: 26,
          fontWeight: '700',
          color: theme.text.primary,
          textAlign: 'center',
          letterSpacing: -0.5,
          lineHeight: 32,
        }}
      >
        {t('resume_builder.intro_title')}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 22,
          color: theme.text.secondary,
          textAlign: 'center',
          paddingHorizontal: spacing.md,
        }}
      >
        {t('resume_builder.intro_body')}
      </Text>
      <View
        style={{
          gap: spacing.sm,
          marginTop: spacing.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <BulletRow icon="✓" label={t('resume_builder.intro_bullet1')} />
        <BulletRow icon="✓" label={t('resume_builder.intro_bullet2')} />
        <BulletRow icon="✓" label={t('resume_builder.intro_bullet3')} />
      </View>
    </View>
  );
}

function BulletRow({ icon, label }: { icon: string; label: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: theme.status.successSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: theme.status.success, fontWeight: '700' }}>
          {icon}
        </Text>
      </View>
      <Text style={{ fontSize: 14, color: theme.text.primary, flex: 1 }}>{label}</Text>
    </View>
  );
}

function EditSlide({
  t,
  index,
  total,
  draft,
  onChange,
}: {
  t: TFn;
  index: number;
  total: number;
  draft: DraftEntry;
  onChange: (patch: Partial<DraftEntry>) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          {t('resume_builder.edit_eyebrow', { n: index + 1, total })}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.text.primary,
            letterSpacing: -0.3,
          }}
        >
          {index === 0 ? t('resume_builder.edit_most_recent') : t('resume_builder.edit_before_that')}
        </Text>
        <Text style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}>
          {t('resume_builder.edit_lead')}
        </Text>
      </View>

      <Field
        label={t('resume_builder.field_company_label')}
        placeholder={t('resume_builder.field_company_placeholder')}
        value={draft.company}
        onChangeText={(text) => onChange({ company: text })}
        autoCapitalize="words"
      />
      <Field
        label={t('resume_builder.field_role_label')}
        placeholder={t('resume_builder.field_role_placeholder')}
        value={draft.role}
        onChangeText={(text) => onChange({ role: text })}
        autoCapitalize="words"
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <MonthField
            t={t}
            label={t('resume_builder.field_started_label')}
            value={draft.startDate}
            onChange={(v) => onChange({ startDate: v })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <MonthField
            t={t}
            label={t('resume_builder.field_ended_label')}
            value={draft.endDate}
            onChange={(v) => onChange({ endDate: v })}
            disabled={draft.current}
          />
        </View>
      </View>

      <Pressable
        onPress={() => {
          haptic('selection');
          onChange({ current: !draft.current });
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
            {t('resume_builder.still_work_here_title')}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
            {t('resume_builder.still_work_here_body')}
          </Text>
        </View>
        <Switch
          value={draft.current}
          onValueChange={(v) => onChange({ current: v })}
          trackColor={{ true: blue[500], false: theme.border.default }}
          thumbColor="#FFFFFF"
        />
      </Pressable>

      <Field
        label={t('resume_builder.field_description_label')}
        placeholder={t('resume_builder.field_description_placeholder')}
        value={draft.description}
        onChangeText={(text) => onChange({ description: text })}
        multiline
      />
    </View>
  );
}

/**
 * Education editor — inline list of degree / institution / years rows
 * the seeker can add to or remove. Optional for blue-collar workers;
 * mandatory in practice for white-collar candidates. Rendered on the
 * Review slide so the seeker sees their full resume in context.
 */
function EducationSection({
  t,
  education,
  onChange,
}: {
  t: TFn;
  education: EducationDraft[];
  onChange: (next: EducationDraft[]) => void;
}) {
  const { theme } = useTheme();

  const update = (i: number, patch: Partial<EducationDraft>) => {
    onChange(education.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const remove = (i: number) => {
    haptic('warning');
    onChange(education.filter((_, idx) => idx !== i));
  };
  const add = () => {
    haptic('selection');
    onChange([...education, emptyEducation()]);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          {t('resume_builder.education_eyebrow')}
        </Text>
        <Text
          style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}
        >
          {t('resume_builder.education_body')}
        </Text>
      </View>

      {education.map((e, i) => (
        <View
          key={i}
          style={{
            backgroundColor: theme.bg.surface,
            borderRadius: radii.lg,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <TextInput
            value={e.degree}
            onChangeText={(text) => update(i, { degree: text })}
            placeholder={t('resume_builder.education_degree_placeholder')}
            placeholderTextColor={theme.text.tertiary}
            style={inputStyle(theme)}
            autoCapitalize="words"
          />
          <TextInput
            value={e.institution}
            onChangeText={(text) => update(i, { institution: text })}
            placeholder={t('resume_builder.education_institution_placeholder')}
            placeholderTextColor={theme.text.tertiary}
            style={inputStyle(theme)}
            autoCapitalize="words"
          />
          <TextInput
            value={e.fieldOfStudy}
            onChangeText={(text) => update(i, { fieldOfStudy: text })}
            placeholder={t('resume_builder.education_field_placeholder')}
            placeholderTextColor={theme.text.tertiary}
            style={inputStyle(theme)}
            autoCapitalize="words"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={e.startYear}
                onChangeText={(text) => update(i, { startYear: text.replace(/[^\d]/g, '') })}
                placeholder={t('resume_builder.education_start_year_placeholder')}
                placeholderTextColor={theme.text.tertiary}
                style={inputStyle(theme)}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                value={e.current ? t('resume_builder.education_ongoing') : e.endYear}
                onChangeText={(text) => update(i, { endYear: text.replace(/[^\d]/g, '') })}
                placeholder={t('resume_builder.education_end_year_placeholder')}
                placeholderTextColor={theme.text.tertiary}
                style={inputStyle(theme)}
                editable={!e.current}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>
          <Pressable
            onPress={() => {
              haptic('selection');
              update(i, { current: !e.current });
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: e.current ? '#2563EB' : theme.border.strong,
                backgroundColor: e.current ? '#2563EB' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {e.current ? (
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                  ✓
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 13, color: theme.text.primary }}>
              {t('resume_builder.education_currently_studying')}
            </Text>
          </Pressable>
          <Pressable onPress={() => remove(i)} hitSlop={6} style={{ alignSelf: 'flex-end' }}>
            <Text style={{ fontSize: 12, color: '#B91C1C', fontWeight: '600' }}>
              {t('resume_builder.education_remove')}
            </Text>
          </Pressable>
        </View>
      ))}

      {education.length < 6 ? (
        <Pressable
          onPress={add}
          style={({ pressed }) => ({
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.border.default,
            alignItems: 'center',
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2563EB' }}>
            {t('resume_builder.education_add_btn')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    backgroundColor: theme.bg.canvas,
    borderWidth: 0.5,
    borderColor: theme.border.subtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: theme.text.primary,
  };
}

/**
 * Work-sample photos — horizontal strip of thumbnails the seeker can
 * add to / remove from. Caps at 6 to keep the user document small.
 * Rendered on the Review slide so workers see their photos in context
 * with the job entries before they hit Generate.
 *
 * Each photo is tagged to one of the worker's craft skills (baking,
 * tailoring, …) so the showcase can group it into a per-craft collection.
 * Workers with no craft skill see guidance instead of an upload grid —
 * a photo gallery only makes sense for visual crafts.
 */
function WorkPhotosSection({
  t,
  photos,
  galleryOptions,
  onAdd,
  onRemove,
  onRetag,
  picking,
}: {
  t: TFn;
  photos: CraftPhoto[];
  galleryOptions: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onRetag: (index: number) => void;
  picking: boolean;
}) {
  const { theme } = useTheme();
  const canAdd = photos.length < 6;
  const canRetag = galleryOptions.length > 1;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          {t('resume_builder.photos_eyebrow')}
        </Text>
        <Text
          style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}
        >
          {t('resume_builder.photos_body')}
        </Text>
      </View>

      {galleryOptions.length === 0 ? (
        <View
          style={{
            borderRadius: radii.md,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            backgroundColor: theme.bg.surface,
            padding: spacing.md,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
            Add a craft skill to build a showcase
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.secondary, lineHeight: 18 }}>
            Visual crafts — baking, tailoring, mehndi, decoration, photography and
            the like — get a photo showcase. Other skills (driver, accounts…) prove
            out through your resume and credentials instead. Add a craft skill on
            your profile to unlock photo uploads here.
          </Text>
        </View>
      ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      >
        {photos.map((photo, i) => (
          <Pressable
            key={`${photo.url.slice(-20)}-${i}`}
            onPress={() => onRemove(i)}
            accessibilityRole="button"
            accessibilityLabel={t('resume_builder.photos_remove_a11y', { n: i + 1 })}
            style={({ pressed }) => ({
              width: 100,
              height: 100,
              borderRadius: radii.md,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Image source={{ uri: photo.url }} style={{ width: '100%', height: '100%' }} />
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: 'rgba(15,23,42,0.75)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                ×
              </Text>
            </View>
            {/* Craft tag — tap to re-tag when the worker has >1 craft. */}
            <Pressable
              onPress={canRetag ? () => onRetag(i) : undefined}
              disabled={!canRetag}
              accessibilityRole="button"
              accessibilityLabel={`Photo ${i + 1} craft tag`}
              style={{
                position: 'absolute',
                left: 4,
                right: 4,
                bottom: 4,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: radii.sm,
                backgroundColor: 'rgba(15,23,42,0.78)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}
              >
                {photo.skill ? prettifySkill(photo.skill) : 'Tap to tag'}
              </Text>
              {canRetag ? (
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>✎</Text>
              ) : null}
            </Pressable>
          </Pressable>
        ))}
        {canAdd ? (
          <Pressable
            onPress={onAdd}
            disabled={picking}
            accessibilityRole="button"
            accessibilityLabel={t('resume_builder.photos_add_a11y')}
            style={({ pressed }) => ({
              width: 100,
              height: 100,
              borderRadius: radii.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.border.default,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.bg.surface,
              opacity: picking ? 0.5 : pressed ? 0.7 : 1,
              gap: 4,
            })}
          >
            <Text style={{ fontSize: 24, color: '#2563EB' }}>+</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: '#2563EB',
              }}
            >
              {picking ? t('resume_builder.photos_loading') : t('resume_builder.photos_add_btn')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      )}

      {galleryOptions.length > 0 ? (
        <Text
          style={{
            fontSize: 11,
            color: theme.text.tertiary,
          }}
        >
          {t('resume_builder.photos_count_label', { n: photos.length })}
        </Text>
      ) : null}
    </View>
  );
}

function ReviewSlide({
  t,
  drafts,
  onEdit,
  onRemove,
  onAdd,
  canAdd,
}: {
  t: TFn;
  drafts: DraftEntry[];
  onEdit: (i: number) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          {t('resume_builder.review_eyebrow')}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.text.primary,
            letterSpacing: -0.3,
          }}
        >
          {t('resume_builder.review_title')} 👀
        </Text>
        <Text style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}>
          {t('resume_builder.review_body')}
        </Text>
      </View>

      {drafts.map((d, i) => (
        <View
          key={i}
          style={{
            backgroundColor: theme.bg.surface,
            borderRadius: radii.lg,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            padding: spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
                numberOfLines={1}
              >
                {d.role || '—'}
              </Text>
              <Text
                style={{ fontSize: 13, color: theme.text.secondary }}
                numberOfLines={1}
              >
                {d.company || '—'}
              </Text>
              <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                {d.startDate ? formatMonthYear(d.startDate) : '—'} —{' '}
                {d.current ? t('resume_builder.review_present') : d.endDate ? formatMonthYear(d.endDate) : '—'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                haptic('selection');
                onEdit(i);
              }}
              hitSlop={6}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: blue[600],
                }}
              >
                {t('resume_builder.review_edit_btn')}
              </Text>
            </Pressable>
            <Pressable onPress={() => onRemove(i)} hitSlop={6}>
              <Text style={{ fontSize: 13, color: theme.status.danger }}>{t('resume_builder.review_remove_btn')}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {canAdd ? (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => ({
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.border.default,
            alignItems: 'center',
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: blue[600] }}>
            {t('resume_builder.review_add_another')}
          </Text>
        </Pressable>
      ) : (
        <Text
          style={{
            fontSize: 11,
            color: theme.text.tertiary,
            textAlign: 'center',
          }}
        >
          {t('resume_builder.review_max_jobs', { n: MAX_JOBS })}
        </Text>
      )}
    </View>
  );
}

// ─── Field primitives ────────────────────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  multiline,
  autoCapitalize,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: theme.text.secondary,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text.tertiary}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={{
          backgroundColor: theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          fontSize: 15,
          color: theme.text.primary,
          minHeight: multiline ? 84 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

/**
 * Month input. Accepts the loose "MMM YYYY" the user types and tries to
 * normalise to YYYY-MM. Falls back to leaving the raw input so the user
 * sees what they typed if it can't be parsed.
 */
function MonthField({
  t,
  label,
  value,
  onChange,
  disabled,
}: {
  t: TFn;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<string>(value ? formatMonthYear(value) : '');

  useEffect(() => {
    setDraft(value ? formatMonthYear(value) : '');
  }, [value]);

  const commit = () => {
    const parsed = parseMonthYearLoose(draft);
    if (parsed) {
      onChange(parsed);
      setDraft(formatMonthYear(parsed));
    }
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: theme.text.secondary,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={disabled ? t('resume_builder.month_present') : draft}
        editable={!disabled}
        onChangeText={setDraft}
        onBlur={commit}
        placeholder={t('resume_builder.month_placeholder')}
        placeholderTextColor={theme.text.tertiary}
        autoCapitalize="words"
        style={{
          backgroundColor: disabled ? theme.bg.muted : theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          fontSize: 15,
          color: disabled ? theme.text.tertiary : theme.text.primary,
        }}
      />
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ProgressBar({ step, totalSteps }: { step: number; totalSteps: number }) {
  const safeTotal = Math.max(1, totalSteps);
  const pct = Math.max(0, Math.min(100, ((step + 1) / safeTotal) * 100));
  return (
    <View
      style={{
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.22)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: '#FFFFFF',
        }}
      />
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyDraft(): DraftEntry {
  return {
    company: '',
    role: '',
    startDate: '',
    endDate: currentMonth(),
    current: false,
    description: '',
  };
}

function validate(draft: DraftEntry, t: TFn): string | null {
  if (!draft.company.trim()) return t('resume_builder.validate_add_company');
  if (!draft.role.trim()) return t('resume_builder.validate_add_role');
  if (!draft.startDate || !/^\d{4}-\d{2}$/.test(draft.startDate))
    return t('resume_builder.validate_add_start');
  if (!draft.current) {
    if (!draft.endDate || !/^\d{4}-\d{2}$/.test(draft.endDate))
      return t('resume_builder.validate_add_end');
    if (draft.startDate > draft.endDate) return t('resume_builder.validate_end_after_start');
  }
  return null;
}

function progressLabel(step: number, jobsCount: number, isReview: boolean, t: TFn): string {
  if (step === 0) return t('resume_builder.progress_intro');
  if (isReview) return t('resume_builder.progress_review');
  return `${step} / ${jobsCount}`;
}

/**
 * Best-effort parser for whatever the user typed. Accepts "Apr 2024",
 * "April 2024", "4/2024", "04-2024", "2024-04", and a handful of variants.
 */
function parseMonthYearLoose(s: string): string | null {
  const cleaned = s.trim().toLowerCase();
  if (!cleaned) return null;

  // YYYY-MM (the canonical form)
  const ymd = cleaned.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymd) {
    const m = Number(ymd[2]);
    if (m >= 1 && m <= 12) return `${ymd[1]}-${String(m).padStart(2, '0')}`;
  }

  // MM-YYYY
  const myd = cleaned.match(/^(\d{1,2})[-/](\d{4})$/);
  if (myd) {
    const m = Number(myd[1]);
    if (m >= 1 && m <= 12) return `${myd[2]}-${String(m).padStart(2, '0')}`;
  }

  // "Apr 2024" or "April 2024"
  const monthNames: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const wordMatch = cleaned.match(/^([a-z]+)\s+(\d{4})$/);
  if (wordMatch) {
    const m = monthNames[wordMatch[1]!];
    if (m) return `${wordMatch[2]}-${String(m).padStart(2, '0')}`;
  }

  return null;
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function ResumeBuilderScreen() {
  return (
    <SeekerThemeOverride>
      <ResumeBuilderInner />
    </SeekerThemeOverride>
  );
}
