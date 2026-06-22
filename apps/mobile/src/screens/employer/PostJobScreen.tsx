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

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { getSecure, setSecure } from '@/lib/secureStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, TextField, Button, FormError, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi, type CreateJobPayload } from '@/api/jobs.api';
import { skillTestsApi } from '@/api/skillTests.api';
import { getCurrentCoords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { useTranslate } from '@/i18n/useTranslate';
import { VoiceRecorder, type VoiceRecordingResult } from '@/lib/chatVoice';
import {
  WORKPLACE_QUESTIONS,
  hasAnyAnswer,
  type WorkplaceQuestionField,
} from '@/lib/reverseInterviewCatalog';
import {
  WOMEN_SAFETY_SIGNAL_DEFS,
  countWomenSafetySignals,
} from '@/lib/womenSafetyCatalog';
import type { AppStackParamList } from '@/navigation/types';
import type {
  JobType,
  PayPeriod,
  WomenSafety,
  WorkMode,
  WorkplaceAnswers,
} from '@/api/types';
import { VoicePostButton } from './VoicePostButton';
import type { JobDraft } from '@/api/postDraft.api';

/** Day index (0 = Sun … 6 = Sat) → short label for the description note. */
const DRAFT_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Nav = NativeStackNavigationProp<AppStackParamList, 'PostJob'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const JOB_TYPE_OPTIONS: Array<{ key: JobType; labelKey: string }> = [
  { key: 'full_time', labelKey: 'employer.post_job.type_full_time' },
  { key: 'part_time', labelKey: 'employer.post_job.type_part_time' },
  { key: 'gig', labelKey: 'employer.post_job.type_gig' },
  { key: 'shift', labelKey: 'employer.post_job.type_shift' },
  { key: 'contract', labelKey: 'employer.post_job.type_contract' },
];

const PAY_PERIOD_OPTIONS: Array<{ key: PayPeriod; labelKey: string }> = [
  { key: 'hour', labelKey: 'employer.post_job.pay_hour' },
  { key: 'day', labelKey: 'employer.post_job.pay_day' },
  { key: 'week', labelKey: 'employer.post_job.pay_week' },
  { key: 'month', labelKey: 'employer.post_job.pay_month' },
  { key: 'fixed', labelKey: 'employer.post_job.pay_fixed' },
];

export function PostJobScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { theme } = useTheme();
  const t = useTranslate();

  const insets = useSafeAreaInsets();

  // "I am hiring for" — Business/Company vs Home/Household
  const [hiringFor, setHiringFor] = useState<'business' | 'household'>('business');

  // Job category (UI only for now — sent inside description/title context)
  const [category, setCategory] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Optional voice description — recorded inline, stored as a base64
  // data URL alongside the text description. Capped at 60 seconds.
  const [audio, setAudio] = useState<VoiceRecordingResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
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
  const [requiredSkillTestId, setRequiredSkillTestId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState('1');
  /** Crew-first head-start in hours; 0 = post publicly right away. */
  const [crewFirstHours, setCrewFirstHours] = useState(0);
  /** Recurring weekly shift + the weekdays it repeats on (0=Sun…6=Sat). */
  const [recurring, setRecurring] = useState(false);
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [isProject, setIsProject] = useState(false);
  const [projectStart, setProjectStart] = useState('');
  const [projectEnd, setProjectEnd] = useState('');
  const [prepItems, setPrepItems] = useState<string[]>([]);
  const [prepDraft, setPrepDraft] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [workMode, setWorkMode] = useState<WorkMode>('onsite');
  // Reverse Interview — the employer's answers to standard worker
  // questions. Each starts null ("not answered").
  const [workplaceAnswers, setWorkplaceAnswers] = useState<WorkplaceAnswers>({
    paysOnTime: null,
    overtimePaid: null,
    providesPpe: null,
    writtenContract: null,
    womensFacilities: null,
  });
  // "Doondo for Women" — employer-declared women-safety signals. Each
  // starts off; only ticked signals become a claim on the listing.
  const [womenSafety, setWomenSafety] = useState<WomenSafety>({
    separateFacilities: false,
    womenOnTeam: false,
    dayShiftOnly: false,
    safeTransport: false,
    harassmentPolicy: false,
  });
  const [error, setError] = useState<string | null>(null);

  // ── Job templates ────────────────────────────────────────────────────────
  type JobTemplate = { id: string; name: string; title: string; description: string;
    type: JobType; amount: string; period: PayPeriod; skills: string[]; savedAt: string; };
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    getSecure('jobTemplates')
      .then((raw) => { if (raw) setTemplates(JSON.parse(raw) as JobTemplate[]); })
      .catch(() => {});
  }, []);

  async function saveTemplate() {
    if (!title.trim()) { Alert.alert('Enter a title', 'Add a job title before saving as template.'); return; }
    const name = title.trim();
    const tpl: JobTemplate = { id: Date.now().toString(), name, title: title.trim(),
      description: description.trim(), type, amount, period, skills, savedAt: new Date().toISOString() };
    const updated = [tpl, ...templates.filter((t) => t.name !== name)].slice(0, 10);
    setTemplates(updated);
    await setSecure('jobTemplates', JSON.stringify(updated));
    haptic('success');
    Alert.alert('Saved!', `"${name}" saved as a template.`);
  }

  function applyTemplate(tpl: JobTemplate) {
    setTitle(tpl.title);
    setDescription(tpl.description);
    setType(tpl.type);
    setAmount(tpl.amount);
    setPeriod(tpl.period);
    setSkills(tpl.skills);
    setShowTemplates(false);
    haptic('success');
  }

  async function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    await setSecure('jobTemplates', JSON.stringify(updated));
  }

  /**
   * Pre-fill the form from a spoken draft. We only ever *set* the fields
   * the voice draft is confident about and never clear anything the
   * employer already typed — voice is an accelerator, not an overwrite.
   * Fields the form has no dedicated input for (headcount, exact days /
   * start time) are folded into the description as a plain note so the
   * detail isn't lost; the employer can edit it before publishing.
   */
  const applyDraft = (draft: JobDraft) => {
    if (draft.title) setTitle(draft.title);
    if (draft.jobType) setType(draft.jobType);
    if (draft.wageAmount !== undefined) setAmount(String(draft.wageAmount));
    if (draft.wagePeriod) setPeriod(draft.wagePeriod);
    if (draft.urgent) setUrgent(true);
    if (draft.trade) {
      // Seed the skills with the recognised trade, without duplicating.
      setSkills((prev) =>
        prev.includes(draft.trade!) ? prev : [...prev, draft.trade!],
      );
    }

    if (draft.headcount && draft.headcount >= 1) {
      setHeadcount(String(draft.headcount));
    }

    const notes: string[] = [];
    if (draft.scheduleDays && draft.scheduleDays.length > 0) {
      const days = draft.scheduleDays.map((d) => DRAFT_DAY_LABELS[d]).join(', ');
      notes.push(t('employer.voice_post.note_days', { days }));
    }
    if (draft.startTime) {
      notes.push(t('employer.voice_post.note_start', { time: draft.startTime }));
    }
    if (notes.length > 0) {
      const note = notes.join(' ');
      setDescription((prev) => (prev.trim() ? `${prev.trim()}\n${note}` : note));
    }

    haptic('success');
  };

  // Available self-qualifying skill checks the employer can attach.
  const skillTestsQuery = useQuery({
    queryKey: ['skill-tests'],
    queryFn: () => skillTestsApi.list(),
    staleTime: 5 * 60_000,
  });

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
        requiredSkillTestId: requiredSkillTestId ?? null,
        headcount: Math.max(1, Number(headcount) || 1),
        crewFirstHours: crewFirstHours > 0 ? crewFirstHours : undefined,
        recurring: recurring || undefined,
        schedule:
          recurring && recurDays.length > 0 ? { days: [...recurDays].sort() } : undefined,
        prepChecklist: prepItems.length > 0 ? prepItems : undefined,
        projectStartDate:
          isProject && ISO_DATE.test(projectStart) ? projectStart : undefined,
        projectEndDate: isProject && ISO_DATE.test(projectEnd) ? projectEnd : undefined,
        urgent,
        workMode,
        audioDescriptionUrl: audio?.dataUrl ?? null,
        audioDescriptionDurationSeconds: audio?.durationSeconds ?? null,
        // Only send the Reverse Interview block when the employer
        // actually answered something — an all-null object is noise.
        workplaceAnswers: hasAnyAnswer(workplaceAnswers)
          ? workplaceAnswers
          : undefined,
        // Only send the women-safety block when the employer ticked at
        // least one signal — an all-false object is noise.
        womenSafety:
          countWomenSafetySignals(womenSafety) > 0 ? womenSafety : undefined,
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
      setError(
        err instanceof Error
          ? err.message
          : t('employer.post_job.err_post_failed'),
      );
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

  // Surface the FIRST missing-field reason so the button can explain itself
  // instead of silently sitting in a disabled state. Order is most-likely-empty
  // first.
  const validationReason: string | null =
    title.trim().length < 2
      ? t('employer.post_job.val_title')
      : description.trim().length < 10
        ? t('employer.post_job.val_description')
        : !(Number(amount) > 0)
          ? t('employer.post_job.val_amount')
          : city.trim().length === 0
            ? t('employer.post_job.val_city')
            : null;

  const canSave = validationReason === null && !mutation.isPending;

  const isLight = true; // PostJob is always light-themed per design
  const BLUE = '#2563EB';
  const BLUE_LIGHT = '#EFF6FF';
  const inputBorder = '#E5E7EB';
  const labelColor = '#374151';
  const placeholderColor = '#9CA3AF';
  const textColor = '#1F2937';

  return (
    <Screen edges={[]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      >
        {/* ── Header ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.md,
            borderBottomWidth: 0.5,
            borderBottomColor: inputBorder,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button">
            <Feather name="arrow-left" size={22} color={textColor} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 17,
              fontWeight: '700',
              color: textColor,
            }}
          >
            Post a Job
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {templates.length > 0 && (
              <Pressable hitSlop={8} onPress={() => { haptic('selection'); setShowTemplates(true); }}>
                <Feather name="layers" size={20} color={BLUE} />
              </Pressable>
            )}
            <Pressable hitSlop={8} onPress={() => void saveTemplate()}>
              <Feather name="bookmark" size={20} color={textColor} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing['7xl'],
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <FormError message={error} />

          {/* Speak-to-fill — hides if no speech-recognition available */}
          <VoicePostButton onDraft={applyDraft} />

          {/* ── I am hiring for ── */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              I am hiring for
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {([
                { key: 'business', icon: '🏢', label: 'Business / Company' },
                { key: 'household', icon: '🏠', label: 'Home / Household' },
              ] as const).map((opt) => {
                const active = hiringFor === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { haptic('selection'); setHiringFor(opt.key); }}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      padding: spacing.md,
                      borderRadius: radii.lg,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? BLUE : inputBorder,
                      backgroundColor: active ? BLUE_LIGHT : '#FFFFFF',
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{opt.icon}</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '500',
                        color: active ? BLUE : '#374151',
                        flexShrink: 1,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Job Title / Role ── */}
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              Job Title / Role
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: inputBorder,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: 12,
                backgroundColor: '#FAFAFA',
              }}
            >
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Cook, Driver, Electrician"
                placeholderTextColor={placeholderColor}
                style={{ fontSize: 15, color: textColor, padding: 0 }}
              />
            </View>
          </View>

          {/* ── Job Category ── */}
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              Job Category
            </Text>
            <Pressable
              onPress={() => haptic('selection')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: inputBorder,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: 14,
                backgroundColor: '#FAFAFA',
              }}
            >
              <Text style={{ fontSize: 15, color: category ? textColor : placeholderColor }}>
                {category || 'Select category'}
              </Text>
              <Feather name="chevron-down" size={18} color={placeholderColor} />
            </Pressable>
          </View>

          {/* ── Work Location ── */}
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              Work Location
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: inputBorder,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: 12,
                backgroundColor: '#FAFAFA',
                gap: spacing.sm,
              }}
            >
              <TextInput
                value={area ? `${area}${city ? ', ' + city : ''}` : city}
                onChangeText={(v) => setArea(v)}
                placeholder="Enter area or pin on map"
                placeholderTextColor={placeholderColor}
                style={{ flex: 1, fontSize: 15, color: textColor, padding: 0 }}
              />
              <Pressable onPress={() => void detect()} hitSlop={8}>
                <Feather name="map-pin" size={18} color={placeholderColor} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => void detect()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
            >
              <Feather name="crosshair" size={13} color={BLUE} />
              <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>
                {detecting ? 'Detecting…' : 'Use my current location'}
              </Text>
            </Pressable>
            {coords && (
              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </Text>
            )}
          </View>

          {/* ── Job Type ── */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              Job Type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {([
                { key: 'full_time' as JobType, label: 'Full Time' },
                { key: 'part_time' as JobType, label: 'Part Time' },
                { key: 'gig' as JobType, label: 'One Time' },
                { key: 'shift' as JobType, label: 'Shift' },
                { key: 'contract' as JobType, label: 'Contract' },
              ]).map((opt) => {
                const active = type === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setType(opt.key); haptic('selection'); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radii.pill,
                      borderWidth: 1,
                      borderColor: active ? BLUE : inputBorder,
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {/* Radio dot */}
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: active ? BLUE : '#D1D5DB',
                        backgroundColor: '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && (
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: BLUE,
                          }}
                        />
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? '700' : '500',
                        color: active ? BLUE : '#374151',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Expected Salary ── */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              Expected Salary
            </Text>
            {/* Quick-pick presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: 2 }}>
              {(period === 'month'
                ? [{ label: '₹8K', val: '8000' }, { label: '₹12K', val: '12000' }, { label: '₹18K', val: '18000' }, { label: '₹25K', val: '25000' }, { label: '₹40K', val: '40000' }]
                : period === 'day'
                ? [{ label: '₹300', val: '300' }, { label: '₹500', val: '500' }, { label: '₹700', val: '700' }, { label: '₹1000', val: '1000' }]
                : period === 'hour'
                ? [{ label: '₹50', val: '50' }, { label: '₹80', val: '80' }, { label: '₹120', val: '120' }, { label: '₹200', val: '200' }]
                : [{ label: '₹2K', val: '2000' }, { label: '₹5K', val: '5000' }, { label: '₹10K', val: '10000' }]
              ).map((p) => (
                <Pressable key={p.val} onPress={() => { setAmount(p.val); haptic('selection'); }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                    borderWidth: amount === p.val ? 1.5 : 1,
                    borderColor: amount === p.val ? BLUE : inputBorder,
                    backgroundColor: amount === p.val ? '#EFF6FF' : '#FAFAFA',
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <Text style={{ fontSize: 13, fontWeight: amount === p.val ? '700' : '500',
                    color: amount === p.val ? BLUE : textColor }}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {/* ₹ prefix + amount */}
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: inputBorder,
                  borderRadius: radii.lg,
                  backgroundColor: '#FAFAFA',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 14,
                    borderRightWidth: 1,
                    borderRightColor: inputBorder,
                  }}
                >
                  <Text style={{ fontSize: 16, color: '#374151', fontWeight: '600' }}>₹</Text>
                </View>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={placeholderColor}
                  style={{ flex: 1, fontSize: 15, color: textColor, paddingHorizontal: spacing.md, padding: 0 }}
                />
              </View>
              {/* Period selector */}
              <Pressable
                onPress={() => {
                  haptic('selection');
                  // Cycle through periods
                  const opts: PayPeriod[] = ['hour', 'day', 'week', 'month', 'fixed'];
                  const idx = opts.indexOf(period);
                  setPeriod(opts[(idx + 1) % opts.length]!);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 14,
                  borderWidth: 1,
                  borderColor: inputBorder,
                  borderRadius: radii.lg,
                  backgroundColor: '#FAFAFA',
                }}
              >
                <Text style={{ fontSize: 14, color: textColor, fontWeight: '600' }}>
                  per {period}
                </Text>
                <Feather name="chevron-down" size={14} color={placeholderColor} />
              </Pressable>
            </View>
          </View>

          {/* ── Job Description ── */}
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: labelColor }}>
              Job Description
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: inputBorder,
                borderRadius: radii.lg,
                backgroundColor: '#FAFAFA',
                padding: spacing.md,
              }}
            >
              <TextInput
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, 300))}
                placeholder="Describe the work, timing, skills required..."
                placeholderTextColor={placeholderColor}
                multiline
                numberOfLines={5}
                style={{
                  fontSize: 15,
                  color: textColor,
                  minHeight: 110,
                  textAlignVertical: 'top',
                  padding: 0,
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: placeholderColor,
                  textAlign: 'right',
                  marginTop: spacing.xs,
                }}
              >
                {description.length}/300
              </Text>
            </View>
          </View>

          {/* Voice note attachment */}
          <VoiceDescriptionField
            audio={audio}
            recording={recording}
            error={audioError}
            onStart={async () => {
              setAudioError(null);
              haptic('selection');
              try {
                const r = new VoiceRecorder();
                await r.start();
                recorderRef.current = r;
                setRecording(true);
              } catch (err) {
                haptic('error');
                setAudioError(
                  err instanceof Error
                    ? err.message
                    : t('employer.post_job.voice_err_start'),
                );
              }
            }}
            onStop={async () => {
              if (!recorderRef.current) return;
              setRecording(false);
              try {
                const out = await recorderRef.current.stopAndSend();
                recorderRef.current = null;
                setAudio(out);
                haptic('success');
              } catch (err) {
                haptic('error');
                setAudioError(
                  err instanceof Error
                    ? err.message
                    : t('employer.post_job.voice_err_save'),
                );
              }
            }}
            onClear={() => {
              haptic('light');
              setAudio(null);
              setAudioError(null);
            }}
          />

          {/* How many to hire */}
          <View style={{ gap: spacing.sm }}>
            <TextField
              label={t('employer.post_job.field_headcount')}
              value={headcount}
              onChangeText={(v) => setHeadcount(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="1"
              helper={t('employer.post_job.field_headcount_hint')}
            />
          </View>

          {/* Offer to my crew first */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.post_job.section_crew_first')}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {t('employer.post_job.crew_first_hint')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {[
                { h: 0, key: 'crew_first_off' },
                { h: 2, key: 'crew_first_2h' },
                { h: 6, key: 'crew_first_6h' },
                { h: 24, key: 'crew_first_24h' },
              ].map((opt) => (
                <Pressable key={opt.h} onPress={() => setCrewFirstHours(opt.h)}>
                  <Pill
                    label={t(`employer.post_job.${opt.key}`)}
                    tone={crewFirstHours === opt.h ? 'hero' : 'neutral'}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          {/* Recurring weekly shift */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.post_job.section_recurring')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Pressable onPress={() => setRecurring(false)}>
                <Pill
                  label={t('employer.post_job.recurring_off')}
                  tone={!recurring ? 'hero' : 'neutral'}
                />
              </Pressable>
              <Pressable onPress={() => setRecurring(true)}>
                <Pill
                  label={t('employer.post_job.recurring_on')}
                  tone={recurring ? 'hero' : 'neutral'}
                />
              </Pressable>
            </View>
            {recurring ? (
              <>
                <Text variant="footnote" tone="tertiary">
                  {t('employer.post_job.recurring_hint')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {DRAFT_DAY_LABELS.map((label, idx) => {
                    const on = recurDays.includes(idx);
                    return (
                      <Pressable
                        key={idx}
                        onPress={() =>
                          setRecurDays((prev) =>
                            prev.includes(idx)
                              ? prev.filter((d) => d !== idx)
                              : [...prev, idx],
                          )
                        }
                      >
                        <Pill label={label} tone={on ? 'hero' : 'neutral'} />
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>

          {/* Multi-day project mode */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.post_job.section_project')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Pressable onPress={() => setIsProject(false)}>
                <Pill
                  label={t('employer.post_job.project_off')}
                  tone={!isProject ? 'hero' : 'neutral'}
                />
              </Pressable>
              <Pressable onPress={() => setIsProject(true)}>
                <Pill
                  label={t('employer.post_job.project_on')}
                  tone={isProject ? 'hero' : 'neutral'}
                />
              </Pressable>
            </View>
            {isProject ? (
              <>
                <Text variant="footnote" tone="tertiary">
                  {t('employer.post_job.project_hint')}
                </Text>
                <TextField
                  label={t('employer.post_job.field_project_start')}
                  value={projectStart}
                  onChangeText={setProjectStart}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
                <TextField
                  label={t('employer.post_job.field_project_end')}
                  value={projectEnd}
                  onChangeText={setProjectEnd}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
              </>
            ) : null}
          </View>

          {/* Pre-shift checklist */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.post_job.section_checklist')}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {t('employer.post_job.checklist_hint')}
            </Text>
            <TextField
              label={t('employer.post_job.field_checklist_item')}
              value={prepDraft}
              onChangeText={setPrepDraft}
              placeholder={t('employer.post_job.field_checklist_ph')}
              returnKeyType="done"
              onSubmitEditing={() => {
                const v = prepDraft.trim();
                if (v && prepItems.length < 10 && !prepItems.includes(v)) {
                  setPrepItems((prev) => [...prev, v]);
                }
                setPrepDraft('');
              }}
            />
            {prepItems.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {prepItems.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setPrepItems((prev) => prev.filter((i) => i !== item))}
                  >
                    <Pill label={`✓ ${item}  ×`} tone="neutral" />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Skills */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.post_job.section_skills')}
            </Text>
            <TextField
              label={t('employer.post_job.field_skill')}
              value={skillDraft}
              onChangeText={setSkillDraft}
              placeholder={t('employer.post_job.field_skill_ph')}
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

          {/* Self-qualifying skill check — attach a short quiz applicants
             can take to qualify; the employer sees who passed. Optional. */}
          {(skillTestsQuery.data?.tests.length ?? 0) > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0 }}
              >
                {t('employer.post_job.section_skill_check')}
              </Text>
              <Text variant="footnote" tone="tertiary">
                {t('employer.post_job.skill_check_hint')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                <Pressable onPress={() => setRequiredSkillTestId(null)}>
                  <Pill
                    label={t('employer.post_job.skill_check_none')}
                    tone={requiredSkillTestId === null ? 'hero' : 'neutral'}
                  />
                </Pressable>
                {skillTestsQuery.data!.tests.map((test) => (
                  <Pressable
                    key={test.id}
                    onPress={() =>
                      setRequiredSkillTestId(
                        requiredSkillTestId === test.id ? null : test.id,
                      )
                    }
                  >
                    <Pill
                      label={`${test.emoji} ${test.title}`}
                      tone={requiredSkillTestId === test.id ? 'hero' : 'neutral'}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Work mode — Onsite (default) / Hybrid / Remote. Most Doondo
             jobs are onsite, but white-collar roles need this option. */}
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.post_job.section_work_mode')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(['onsite', 'hybrid', 'remote'] as const).map((m) => {
                const active = workMode === m;
                const label =
                  m === 'onsite'
                    ? t('employer.post_job.mode_onsite')
                    : m === 'hybrid'
                      ? t('employer.post_job.mode_hybrid')
                      : t('employer.post_job.mode_remote');
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      haptic('selection');
                      setWorkMode(m);
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: spacing.sm + 2,
                      borderRadius: radii.pill,
                      alignItems: 'center',
                      backgroundColor: active ? '#2563EB' : theme.bg.surface,
                      borderWidth: active ? 0 : 1,
                      borderColor: theme.border.default,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: active ? '#FFFFFF' : theme.text.primary,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Urgent toggle */}
          <Pressable
            onPress={() => {
              haptic('selection');
              setUrgent((v) => !v);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              padding: spacing.lg,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: urgent ? theme.status.warningBorder : theme.border.default,
              backgroundColor: urgent ? theme.status.warningSubtle : theme.bg.surface,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: urgent ? theme.status.warning : theme.border.strong,
                backgroundColor: urgent ? theme.status.warning : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              {urgent ? (
                <Text variant="footnote" weight="medium" style={{ color: '#FFFFFF', lineHeight: 16 }}>
                  ✓
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="medium" tone={urgent ? 'warning' : 'primary'}>
                {t('employer.post_job.urgent_title')}
              </Text>
              <Text variant="footnote" tone="secondary">
                {t('employer.post_job.urgent_hint')}
              </Text>
            </View>
          </Pressable>

          {/* Reverse Interview — the employer answers the questions
             workers care about; the answers are public on the listing. */}
          <WorkplaceAnswersField
            answers={workplaceAnswers}
            onChange={setWorkplaceAnswers}
          />

          {/* Doondo for Women — the employer's women-safety signals. */}
          <WomenSafetyField value={womenSafety} onChange={setWomenSafety} />

          {/* ── Publish Job button ── */}
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            <Pressable
              onPress={() => { haptic('selection'); mutation.mutate(); }}
              disabled={!canSave}
              style={({ pressed }) => ({
                backgroundColor: canSave ? BLUE : '#93C5FD',
                borderRadius: radii.lg,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>
                {mutation.isPending ? 'Publishing…' : 'Publish Job'}
              </Text>
            </Pressable>
            {validationReason && !mutation.isPending && (
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                {validationReason}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Job Templates Sheet ── */}
      <Modal visible={showTemplates} transparent animationType="slide" onRequestClose={() => setShowTemplates(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setShowTemplates(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingBottom: insets.bottom + 24,
              maxHeight: '80%',
            }}
          >
            {/* Drag handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: textColor, marginHorizontal: 20, marginBottom: 16 }}>
              Saved Templates
            </Text>
            <ScrollView style={{ paddingHorizontal: 20 }}>
              {templates.map((tpl) => (
                <View
                  key={tpl.id}
                  style={{
                    borderWidth: 1,
                    borderColor: inputBorder,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 12,
                    backgroundColor: isLight ? '#F9FAFB' : '#1F2937',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: textColor, flex: 1 }} numberOfLines={1}>{tpl.name}</Text>
                    <Pressable hitSlop={8} onPress={() => { haptic('selection'); void deleteTemplate(tpl.id); }}>
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }} numberOfLines={2}>
                    {tpl.description || tpl.title}
                  </Text>
                  <Pressable
                    onPress={() => { applyTemplate(tpl); setShowTemplates(false); haptic('success'); }}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? '#1D4ED8' : BLUE,
                      borderRadius: 10,
                      paddingVertical: 9,
                      alignItems: 'center',
                    })}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Use Template</Text>
                  </Pressable>
                </View>
              ))}
              {templates.length === 0 && (
                <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 20 }}>
                  No saved templates yet. Fill out the form and tap the bookmark icon to save one.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

// ─── Voice description block ────────────────────────────────────────────────

/**
 * Optional voice note attached to the job description. Holds 60 seconds
 * of audio max; the underlying VoiceRecorder enforces the cap. Lets
 * employers who can't easily type a long description record a short
 * note that workers (especially those who can't read English well) can
 * play back.
 */
function VoiceDescriptionField({
  audio,
  recording,
  error,
  onStart,
  onStop,
  onClear,
}: {
  audio: VoiceRecordingResult | null;
  recording: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
}) {
  const { theme } = useTheme();
  const t = useTranslate();

  if (audio) {
    return (
      <View
        style={{
          padding: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: '#EFF6FF',
          borderWidth: 0.5,
          borderColor: '#BFDBFE',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#2563EB',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16 }}>🎙</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="medium">
            {t('employer.post_job.voice_recorded')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('employer.post_job.voice_recorded_meta', {
              n: audio.durationSeconds,
            })}
          </Text>
        </View>
        <Pressable onPress={onClear} hitSlop={6}>
          <Text style={{ color: theme.status.danger, fontSize: 13, fontWeight: '600' }}>
            {t('employer.post_job.voice_remove')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        onPressIn={onStart}
        onPressOut={onStop}
        accessibilityRole="button"
        accessibilityLabel={
          recording
            ? t('employer.post_job.voice_a11y_stop')
            : t('employer.post_job.voice_a11y_start')
        }
        style={({ pressed }) => ({
          padding: spacing.md,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: recording ? '#DC2626' : theme.border.default,
          backgroundColor: recording ? '#FEE2E2' : theme.bg.surface,
          alignItems: 'center',
          gap: 4,
          opacity: pressed && !recording ? 0.7 : 1,
        })}
      >
        <Text style={{ fontSize: 22 }}>{recording ? '🔴' : '🎙'}</Text>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: recording ? '#991B1B' : theme.text.primary,
          }}
        >
          {recording
            ? t('employer.post_job.voice_recording')
            : t('employer.post_job.voice_hold')}
        </Text>
        <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
          {t('employer.post_job.voice_hint')}
        </Text>
      </Pressable>
      {error ? (
        <Text style={{ fontSize: 12, color: theme.status.danger }}>{error}</Text>
      ) : null}
    </View>
  );
}

// ─── Reverse Interview — workplace answers ──────────────────────────────────

/**
 * The employer answers five standard worker questions — pay, overtime,
 * PPE, contract, women's facilities. Each is tri-state: Yes, No, or left
 * unanswered. The answers ride along on the job and surface on the
 * seeker's job-detail screen before they apply — the terms, on the
 * record, up front.
 */
function WorkplaceAnswersField({
  answers,
  onChange,
}: {
  answers: WorkplaceAnswers;
  onChange: (next: WorkplaceAnswers) => void;
}) {
  const t = useTranslate();

  function set(field: WorkplaceQuestionField, value: boolean) {
    // Tapping the active choice again clears it back to "not answered".
    const current = answers[field];
    onChange({ ...answers, [field]: current === value ? null : value });
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {t('reverse_interview.post_section')}
      </Text>
      <Text variant="footnote" tone="tertiary">
        {t('reverse_interview.post_hint')}
      </Text>
      {WORKPLACE_QUESTIONS.map((q) => {
        const ans = answers[q.field] ?? null;
        return (
          <View
            key={q.field}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            <Text variant="footnote" style={{ flex: 1 }}>
              {t(q.key)}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <AnswerChip
                label={t('reverse_interview.yes')}
                tone="yes"
                active={ans === true}
                onPress={() => set(q.field, true)}
              />
              <AnswerChip
                label={t('reverse_interview.no')}
                tone="no"
                active={ans === false}
                onPress={() => set(q.field, false)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** A single Yes / No pill in a Reverse Interview row. */
function AnswerChip({
  label,
  tone,
  active,
  onPress,
}: {
  label: string;
  tone: 'yes' | 'no';
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const activeBg = tone === 'yes' ? theme.status.successSubtle : '#FEE2E2';
  const activeBorder = tone === 'yes' ? theme.status.success : '#FCA5A5';
  const activeFg = tone === 'yes' ? theme.status.success : '#991B1B';
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        minWidth: 52,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radii.pill,
        borderWidth: 0.5,
        borderColor: active ? activeBorder : theme.border.default,
        backgroundColor: active ? activeBg : theme.bg.surface,
        alignItems: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        variant="footnote"
        weight={active ? 'medium' : 'regular'}
        style={{ color: active ? activeFg : theme.text.secondary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Doondo for Women — a tick-list where the employer declares which
 * women-safety signals their workplace offers. Each is optional; only a
 * ticked signal is a claim, and the section header says these are the
 * employer's own statements.
 */
function WomenSafetyField({
  value,
  onChange,
}: {
  value: WomenSafety;
  onChange: (next: WomenSafety) => void;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {t('women.post_section')}
      </Text>
      <Text variant="footnote" tone="tertiary">
        {t('women.post_hint')}
      </Text>
      {WOMEN_SAFETY_SIGNAL_DEFS.map((sig) => {
        const on = value[sig.key] === true;
        return (
          <Pressable
            key={sig.key}
            onPress={() => {
              haptic('selection');
              onChange({ ...value, [sig.key]: !on });
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: on ? theme.brand.hero : theme.border.default,
                backgroundColor: on ? theme.brand.hero : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on ? (
                <Text
                  variant="footnote"
                  weight="medium"
                  style={{ color: '#FFFFFF', lineHeight: 16 }}
                >
                  ✓
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 18 }}>{sig.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text variant="footnote" weight={on ? 'medium' : 'regular'}>
                {t(`women.signal.${sig.key}`)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
