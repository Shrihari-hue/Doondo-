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

  // If the user has existing entries, skip the intro and land on review.
  useEffect(() => {
    if (step === -1) {
      const seeded = drafts.some((d) => d.company.trim() || d.role.trim());
      setStep(seeded ? drafts.length + 1 : 0);
    }
  }, [step, drafts]);

  const save = useMutation({
    mutationFn: () => {
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
      return meApi.updateWorkHistory({ entries: payload });
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
