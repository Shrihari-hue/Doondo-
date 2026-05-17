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
import {
  currentMonth,
  formatMonthYear,
  sortWorkHistory,
} from '@/lib/workHistory';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

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
  // seeker taps "Generate resume". Up to 6.
  const [photos, setPhotos] = useState<string[]>(user?.workPhotos ?? []);
  const [pickingPhoto, setPickingPhoto] = useState(false);
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
        photos.some((p, i) => p !== initialPhotos[i]);
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
      if (photosChanged) patch.workPhotos = photos;
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
      const msg = err instanceof ApiError ? err.message : 'Try again in a minute.';
      Alert.alert("Couldn't save resume", msg);
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
    setPickingPhoto(true);
    haptic('selection');
    try {
      const picked = await pickWorkPhoto();
      if (picked) {
        setPhotos((cur) => [...cur, picked.dataUrl]);
        haptic('light');
      }
    } catch (err) {
      haptic('error');
      Alert.alert(
        "Couldn't add photo",
        err instanceof Error ? err.message : 'Try a smaller image.',
      );
    } finally {
      setPickingPhoto(false);
    }
  };

  const removePhoto = (index: number) => {
    Alert.alert('Remove this photo?', "It won't show on your resume anymore.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
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
      const err = validate(editingDraft);
      if (err) {
        haptic('error');
        Alert.alert("Couldn't continue", err);
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
        Alert.alert('Add a job first', 'Your resume needs at least one job.');
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
            Resume builder
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
            {progressLabel(step, drafts.length, isReview)}
          </Text>
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
          <IntroSlide />
        ) : isReview ? (
          <>
            <ReviewSlide
              drafts={drafts}
              onEdit={(i) => setStep(i + 1)}
              onRemove={(i) => {
                if (drafts.length === 1) {
                  Alert.alert('Need at least one job', "You can't remove the last entry.");
                  return;
                }
                Alert.alert('Remove this job?', "It won't show on your resume anymore.", [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
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
              education={education}
              onChange={setEducation}
            />
            <WorkPhotosSection
              photos={photos}
              onAdd={addPhoto}
              onRemove={removePhoto}
              picking={pickingPhoto}
            />
          </>
        ) : editingDraft && editIndex !== null ? (
          <EditSlide
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
              ? 'Saving…'
              : isReview
                ? 'Generate resume'
                : isIntro
                  ? 'Start'
                  : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Slides ──────────────────────────────────────────────────────────────────

function IntroSlide() {
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
        Build your resume{'\n'}in 3 minutes
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
        We&apos;ll ask you about your last 1–5 jobs. No typing essays — just
        the company, your role, and the dates. We turn it into a clean
        resume employers love.
      </Text>
      <View
        style={{
          gap: spacing.sm,
          marginTop: spacing.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <BulletRow icon="✓" label="No CV needed — we build it for you" />
        <BulletRow icon="✓" label="Works for any kind of work" />
        <BulletRow icon="✓" label="You can edit it any time" />
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
  index,
  total,
  draft,
  onChange,
}: {
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
          JOB {index + 1} OF {total}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.text.primary,
            letterSpacing: -0.3,
          }}
        >
          {index === 0 ? 'Your most recent job' : `Job before that`}
        </Text>
        <Text style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}>
          Tell us where you worked. Skip the description if you&apos;re in a
          hurry — you can fill it later.
        </Text>
      </View>

      <Field
        label="Company / shop name"
        placeholder="e.g. Sharma Electricals"
        value={draft.company}
        onChangeText={(t) => onChange({ company: t })}
        autoCapitalize="words"
      />
      <Field
        label="Your role"
        placeholder="e.g. Helper, Delivery rider, Cook"
        value={draft.role}
        onChangeText={(t) => onChange({ role: t })}
        autoCapitalize="words"
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <MonthField
            label="Started"
            value={draft.startDate}
            onChange={(v) => onChange({ startDate: v })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <MonthField
            label="Ended"
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
            I still work here
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
            We&apos;ll show this as &quot;Present&quot; on your resume
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
        label="What did you do? (optional)"
        placeholder="e.g. Repaired motors, met customers, kept tools in order…"
        value={draft.description}
        onChangeText={(t) => onChange({ description: t })}
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
  education,
  onChange,
}: {
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
          EDUCATION · OPTIONAL
        </Text>
        <Text
          style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}
        >
          Degree or training course, school or college, years. Add as many
          as you have — up to 6.
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
            onChangeText={(t) => update(i, { degree: t })}
            placeholder="Degree / course (e.g. B.Com, ITI Electrician)"
            placeholderTextColor={theme.text.tertiary}
            style={inputStyle(theme)}
            autoCapitalize="words"
          />
          <TextInput
            value={e.institution}
            onChangeText={(t) => update(i, { institution: t })}
            placeholder="School / college / training centre"
            placeholderTextColor={theme.text.tertiary}
            style={inputStyle(theme)}
            autoCapitalize="words"
          />
          <TextInput
            value={e.fieldOfStudy}
            onChangeText={(t) => update(i, { fieldOfStudy: t })}
            placeholder="Field of study (optional)"
            placeholderTextColor={theme.text.tertiary}
            style={inputStyle(theme)}
            autoCapitalize="words"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={e.startYear}
                onChangeText={(t) => update(i, { startYear: t.replace(/[^\d]/g, '') })}
                placeholder="Start year"
                placeholderTextColor={theme.text.tertiary}
                style={inputStyle(theme)}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                value={e.current ? 'Ongoing' : e.endYear}
                onChangeText={(t) => update(i, { endYear: t.replace(/[^\d]/g, '') })}
                placeholder="End year"
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
              Currently studying here
            </Text>
          </Pressable>
          <Pressable onPress={() => remove(i)} hitSlop={6} style={{ alignSelf: 'flex-end' }}>
            <Text style={{ fontSize: 12, color: '#B91C1C', fontWeight: '600' }}>
              Remove
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
            + Add education
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
 */
function WorkPhotosSection({
  photos,
  onAdd,
  onRemove,
  picking,
}: {
  photos: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  picking: boolean;
}) {
  const { theme } = useTheme();
  const canAdd = photos.length < 6;

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
          PHOTOS OF YOUR WORK · OPTIONAL
        </Text>
        <Text
          style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}
        >
          Show employers what you can do. A photo of a wall you built, a
          dish you cooked, a panel you wired. Up to 6.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      >
        {photos.map((uri, i) => (
          <Pressable
            key={`${uri.slice(-20)}-${i}`}
            onPress={() => onRemove(i)}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${i + 1}`}
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
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
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
          </Pressable>
        ))}
        {canAdd ? (
          <Pressable
            onPress={onAdd}
            disabled={picking}
            accessibilityRole="button"
            accessibilityLabel="Add a work photo"
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
              {picking ? 'Loading…' : 'Add photo'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Text
        style={{
          fontSize: 11,
          color: theme.text.tertiary,
        }}
      >
        {photos.length} / 6 photos · tap a photo to remove it
      </Text>
    </View>
  );
}

function ReviewSlide({
  drafts,
  onEdit,
  onRemove,
  onAdd,
  canAdd,
}: {
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
          REVIEW
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.text.primary,
            letterSpacing: -0.3,
          }}
        >
          Looks good?
        </Text>
        <Text style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 19 }}>
          Tap a job to edit it. Add another if you have one more to share —
          up to 5 total.
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
                {d.current ? 'Present' : d.endDate ? formatMonthYear(d.endDate) : '—'}
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
                Edit
              </Text>
            </Pressable>
            <Pressable onPress={() => onRemove(i)} hitSlop={6}>
              <Text style={{ fontSize: 13, color: theme.status.danger }}>Remove</Text>
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
            + Add another job
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
          Maximum {MAX_JOBS} jobs on a resume.
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
  label,
  value,
  onChange,
  disabled,
}: {
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
        value={disabled ? 'Present' : draft}
        editable={!disabled}
        onChangeText={setDraft}
        onBlur={commit}
        placeholder="e.g. Apr 2024"
        placeholderTextColor={theme.text.tertiary}
        autoCapitalize="words"
        style={{
          backgroundColor: disabled ? theme.bg.subtle : theme.bg.surface,
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

function validate(draft: DraftEntry): string | null {
  if (!draft.company.trim()) return 'Add the company name.';
  if (!draft.role.trim()) return 'Add your role.';
  if (!draft.startDate || !/^\d{4}-\d{2}$/.test(draft.startDate))
    return 'Add a start month and year.';
  if (!draft.current) {
    if (!draft.endDate || !/^\d{4}-\d{2}$/.test(draft.endDate))
      return 'Add the month and year you ended this job.';
    if (draft.startDate > draft.endDate) return 'End date must be after start date.';
  }
  return null;
}

function progressLabel(step: number, jobsCount: number, isReview: boolean): string {
  if (step === 0) return 'Intro';
  if (isReview) return 'Review';
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
