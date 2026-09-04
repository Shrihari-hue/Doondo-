/**
 * QuickWorkCreateScreen — the employer's Quick Work request wizard.
 *
 * employer-plan.md §7 lists this as 9 separate screens (Category → Service
 * → Describe → Media → Location → Timing → Budget → Review → Post). This
 * implements the same progressive-disclosure flow as ONE screen with
 * internal step state instead of 9 stack entries — a deliberate,
 * lower-risk adaptation for this pass (fewer new navigator routes, no new
 * route-param wiring per step) while preserving the exact UX order and
 * still calling the backend progressively (each step PATCHes the DRAFT,
 * exactly as §9.2 describes).
 *
 * Media capture (photo/video/voice) reuses the exact same picker/recorder
 * primitives chat attachments already use (`pickChatImage`, `pickChatVideo`,
 * `VoiceRecorder` from lib/chat*.ts) rather than a second implementation,
 * uploading each one immediately via `POST /quick-work/requests/:id/media`
 * (quickWorkMedia.service.ts) — the draft already has somewhere to put the
 * resulting URL (`photos`/`videos`/`voiceNoteUrl`, pre-existing columns).
 *
 * Every screen/step reuses the existing design system (`Screen`, `Card`,
 * `Button`, `TextField`, `Pill`, `SectionHeader`) — no new visual language.
 */

import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, Card, TextField, Pill, SectionHeader, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { servicesApi, type ServiceCategory, type CatalogService } from '@/api/services.api';
import { quickWorkApi } from '@/api/quickWork.api';
import { resolveCoords, reverseGeocodeCity } from '@/lib/location';
import { pickChatImage } from '@/lib/chatImage';
import { pickChatVideo } from '@/lib/chatVideo';
import { VoiceRecorder, VOICE_MAX_SECONDS } from '@/lib/chatVoice';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'QuickWorkCreate'>;

const STEPS = ['category', 'service', 'describe', 'media', 'location', 'timing', 'review'] as const;
type Step = (typeof STEPS)[number];

const STEP_TITLES: Record<Step, string> = {
  category: 'What do you need?',
  service: 'Pick the exact service',
  describe: 'Describe the problem',
  media: 'Add photos or a voice note',
  location: 'Where is this?',
  timing: 'When do you need it?',
  review: 'Review & post',
};

const MAX_PHOTOS = 6;
const MAX_VIDEOS = 2;

interface SchedulePreset {
  label: string;
  compute: () => Date;
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: 'In 1 hour', compute: () => new Date(Date.now() + 60 * 60_000) },
  { label: 'This evening', compute: () => atTime(18, 0, 0) },
  { label: 'Tomorrow morning', compute: () => atTime(9, 0, 1) },
  { label: 'Tomorrow afternoon', compute: () => atTime(14, 0, 1) },
];

function atTime(hour: number, minute: number, addDaysIfPast: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + addDaysIfPast);
  return d;
}

export function QuickWorkCreateScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!;

  const [requestId, setRequestId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState<'photo' | 'video' | 'voice' | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [locating, setLocating] = useState(false);
  const [isImmediate, setIsImmediate] = useState(route.params?.initialImmediate ?? true);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const categoriesQuery = useQuery({
    queryKey: ['service-categories'],
    queryFn: () => servicesApi.listCategories(),
    staleTime: 5 * 60_000,
  });

  const [serviceSearch, setServiceSearch] = useState('');
  const servicesQuery = useQuery({
    queryKey: ['services', categoryId, serviceSearch],
    queryFn: () => servicesApi.listServices({ categoryId: categoryId ?? undefined, q: serviceSearch || undefined }),
    enabled: step === 'service',
    staleTime: 60_000,
  });

  function goBack() {
    if (stepIndex === 0) {
      navigation.goBack();
      return;
    }
    haptic('selection');
    setStepIndex((i) => i - 1);
  }

  async function selectCategory(cat: ServiceCategory) {
    haptic('selection');
    setError(null);
    setCategoryId(cat.id);
    setCategoryName(cat.name);
    if (!requestId) {
      setSaving(true);
      try {
        const draft = await quickWorkApi.createDraft({ categoryId: cat.id });
        setRequestId(draft.id);
        setStepIndex(1);
      } catch (err) {
        setError(err);
      } finally {
        setSaving(false);
      }
    } else {
      try {
        await quickWorkApi.updateDraft(requestId, { categoryId: cat.id });
        setStepIndex(1);
      } catch (err) {
        setError(err);
      }
    }
  }

  async function selectService(svc: CatalogService) {
    if (!requestId) return;
    haptic('selection');
    setError(null);
    setServiceId(svc.id);
    setServiceName(svc.name);
    setSaving(true);
    try {
      await quickWorkApi.updateDraft(requestId, { serviceId: svc.id });
      setStepIndex(2);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function continueFromDescribe() {
    if (!requestId) return;
    setSaving(true);
    setError(null);
    try {
      await quickWorkApi.updateDraft(requestId, { title: title.trim() || null, description: description.trim() || null });
      haptic('selection');
      setStepIndex(3);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  // ─── Media (photo / video / voice) ──────────────────────────────────────
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function addPhoto(source: 'camera' | 'library') {
    if (!requestId || photos.length >= MAX_PHOTOS) return;
    setMediaUploading('photo');
    setError(null);
    try {
      const picked = await pickChatImage({ source });
      if (!picked) return;
      const updated = await quickWorkApi.uploadMedia(requestId, {
        kind: 'photo',
        dataUrl: picked.dataUrl,
        mimeType: picked.mimeType,
        fileName: `photo-${Date.now()}.jpg`,
      });
      setPhotos(updated.photos);
      haptic('success');
    } catch (err) {
      Alert.alert('Could not add photo', err instanceof Error ? err.message : 'Try again.');
      haptic('error');
    } finally {
      setMediaUploading(null);
    }
  }

  async function addVideo() {
    if (!requestId || videos.length >= MAX_VIDEOS) return;
    setMediaUploading('video');
    setError(null);
    try {
      const picked = await pickChatVideo();
      if (!picked) return;
      const updated = await quickWorkApi.uploadMedia(requestId, {
        kind: 'video',
        dataUrl: picked.dataUrl,
        mimeType: picked.mimeType,
        fileName: `video-${Date.now()}.mp4`,
      });
      setVideos(updated.videos);
      haptic('success');
    } catch (err) {
      Alert.alert('Could not add video', err instanceof Error ? err.message : 'Try again.');
      haptic('error');
    } finally {
      setMediaUploading(null);
    }
  }

  async function removePhoto(url: string) {
    if (!requestId) return;
    setPhotos((prev) => prev.filter((u) => u !== url));
    try {
      await quickWorkApi.removeMedia(requestId, { kind: 'photo', url });
    } catch {
      /* best-effort — worst case the photo reappears on next fetch */
    }
  }

  async function removeVideo(url: string) {
    if (!requestId) return;
    setVideos((prev) => prev.filter((u) => u !== url));
    try {
      await quickWorkApi.removeMedia(requestId, { kind: 'video', url });
    } catch {
      /* best-effort */
    }
  }

  async function removeVoiceNote() {
    if (!requestId) return;
    setVoiceNoteUrl(null);
    try {
      await quickWorkApi.removeMedia(requestId, { kind: 'voice' });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Stop + upload. Reads `recorderRef` (a ref, always current) rather than
   * the `recording` state so the max-duration auto-stop — fired from a
   * setInterval closure created back when recording started — can't act on
   * a stale `recording` value and re-enter the "start" branch instead.
   */
  async function stopVoiceRecording() {
    haptic('light');
    setRecording(false);
    if (recordTickRef.current) {
      clearInterval(recordTickRef.current);
      recordTickRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || !requestId) return;
    try {
      const result = await recorder.stopAndSend();
      if (!result) return; // accidental tap — silently drop
      setMediaUploading('voice');
      const updated = await quickWorkApi.uploadMedia(requestId, {
        kind: 'voice',
        dataUrl: result.dataUrl,
        mimeType: result.mimeType,
        fileName: `voice-${Date.now()}.m4a`,
      });
      setVoiceNoteUrl(updated.voiceNoteUrl);
      haptic('success');
    } catch (err) {
      Alert.alert('Could not save voice note', err instanceof Error ? err.message : 'Try again.');
      haptic('error');
    } finally {
      setMediaUploading(null);
    }
  }

  async function toggleVoiceRecording() {
    if (!requestId) return;
    if (recorderRef.current) {
      await stopVoiceRecording();
      return;
    }
    try {
      const recorder = new VoiceRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      haptic('light');
      recordTickRef.current = setInterval(() => {
        const s = recorder.elapsedSeconds();
        setRecordSeconds(s);
        if (s >= VOICE_MAX_SECONDS) void stopVoiceRecording();
      }, 250);
    } catch (err) {
      Alert.alert('Microphone unavailable', err instanceof Error ? err.message : 'Could not start recording.');
      haptic('error');
    }
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const saved = user?.employerLocation?.coordinates ?? null;
      const resolved = await resolveCoords(saved);
      setCoords({ lat: resolved.lat, lng: resolved.lng });
      const cityName = await reverseGeocodeCity(resolved.lat, resolved.lng);
      if (cityName) setCity((prev) => prev || cityName);
    } finally {
      setLocating(false);
    }
  }

  async function continueFromLocation() {
    if (!requestId || !coords) return;
    setSaving(true);
    setError(null);
    try {
      await quickWorkApi.updateDraft(requestId, {
        lat: coords.lat,
        lng: coords.lng,
        address: address.trim() || null,
        city: city.trim() || null,
      });
      haptic('selection');
      setStepIndex(5);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function continueFromTiming() {
    if (!requestId) return;
    if (!isImmediate && !scheduledAt) return;
    setSaving(true);
    setError(null);
    try {
      await quickWorkApi.updateDraft(requestId, {
        isImmediate,
        scheduledAt: isImmediate ? null : scheduledAt!.toISOString(),
      });
      haptic('selection');
      setStepIndex(6);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function postRequest() {
    if (!requestId) return;
    setSaving(true);
    setError(null);
    try {
      const min = budgetMin.trim() ? Math.round(Number(budgetMin) * 100) : null;
      const max = budgetMax.trim() ? Math.round(Number(budgetMax) * 100) : null;
      if (min != null || max != null) {
        await quickWorkApi.updateDraft(requestId, { budgetMin: min, budgetMax: max });
      }
      await quickWorkApi.post(requestId);
      haptic('success');
      navigation.replace('QuickWorkDetail', { requestId });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const progress = (stepIndex + 1) / STEPS.length;

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <Pressable onPress={goBack} hitSlop={8} accessibilityRole="button">
          <Feather name="arrow-left" size={22} color={theme.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="footnote" tone="tertiary">
            Step {stepIndex + 1} of {STEPS.length}
          </Text>
          <Text variant="bodyLarge" weight="semibold">
            {STEP_TITLES[step]}
          </Text>
        </View>
      </View>
      <View style={{ height: 3, backgroundColor: theme.border.subtle, marginHorizontal: spacing.xl, borderRadius: 2, marginBottom: spacing.lg }}>
        <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: theme.brand.primary, borderRadius: 2 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'], gap: spacing.md }}>
        {error ? <ErrorPanel error={error} onRetry={() => setError(null)} /> : null}

        {step === 'category' ? (
          categoriesQuery.isLoading ? (
            <LoadingSpinner fullScreen />
          ) : categoriesQuery.isError ? (
            <ErrorPanel error={categoriesQuery.error} onRetry={() => void categoriesQuery.refetch()} />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {(categoriesQuery.data ?? []).map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => void selectCategory(cat)}
                  disabled={saving}
                  style={({ pressed }) => ({
                    width: '31%',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radii.pill,
                        backgroundColor: theme.brand.primarySubtle,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name={(cat.icon as React.ComponentProps<typeof Feather>['name']) ?? 'tool'} size={20} color={theme.brand.primary} />
                    </View>
                    <Text variant="footnote" weight="medium" style={{ textAlign: 'center' }} numberOfLines={2}>
                      {cat.name}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {step === 'service' ? (
          <>
            <TextField
              placeholder="Search a service (e.g. electrician, AC repair)"
              value={serviceSearch}
              onChangeText={setServiceSearch}
              autoFocus
            />
            {categoryName ? (
              <Pill label={categoryName} tone="primary" leading="◎" />
            ) : null}
            {servicesQuery.isLoading ? (
              <LoadingSpinner fullScreen />
            ) : servicesQuery.isError ? (
              <ErrorPanel error={servicesQuery.error} onRetry={() => void servicesQuery.refetch()} />
            ) : (servicesQuery.data ?? []).length === 0 ? (
              <Text tone="secondary" style={{ textAlign: 'center', paddingVertical: spacing.xl }}>
                No services found. Try a different search.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {(servicesQuery.data ?? []).map((svc) => (
                  <Pressable key={svc.id} onPress={() => void selectService(svc)} disabled={saving}>
                    <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text weight="medium">{svc.name}</Text>
                        {svc.requiresVerification || svc.requiresLicense || svc.requiresQualification ? (
                          <Text variant="footnote" tone="tertiary" style={{ marginTop: 2 }}>
                            Verified worker only
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={18} color={theme.text.tertiary} />
                    </Card>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : null}

        {step === 'describe' ? (
          <>
            <TextField label="Title" placeholder="e.g. Ceiling fan not working" value={title} onChangeText={setTitle} maxLength={120} />
            <TextField
              label="Describe the problem"
              placeholder="Tell the worker what's wrong, what needs doing…"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              maxLength={2000}
            />
            <Button label="Continue" onPress={() => void continueFromDescribe()} disabled={saving} />
          </>
        ) : null}

        {step === 'media' ? (
          <>
            <Text tone="secondary" variant="footnote">
              Optional — a photo or short voice note helps a worker understand the job before they arrive.
            </Text>

            <SectionHeader title={`Photos (${photos.length}/${MAX_PHOTOS})`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {photos.map((url) => (
                <View key={url} style={{ width: 84, height: 84 }}>
                  <Image source={{ uri: url }} style={{ width: 84, height: 84, borderRadius: radii.md }} />
                  <Pressable
                    onPress={() => void removePhoto(url)}
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: theme.bg.elevated,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: theme.border.default,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                  >
                    <Feather name="x" size={13} color={theme.text.secondary} />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <Pressable
                  onPress={() =>
                    Alert.alert('Add photo', undefined, [
                      { text: 'Camera', onPress: () => void addPhoto('camera') },
                      { text: 'Gallery', onPress: () => void addPhoto('library') },
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                  disabled={mediaUploading === 'photo'}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: theme.border.default,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: mediaUploading === 'photo' ? 0.5 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Add photo"
                >
                  {mediaUploading === 'photo' ? (
                    <LoadingSpinner />
                  ) : (
                    <Feather name="plus" size={20} color={theme.text.tertiary} />
                  )}
                </Pressable>
              ) : null}
            </View>

            <SectionHeader title={`Video (${videos.length}/${MAX_VIDEOS})`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {videos.map((url) => (
                <Pressable key={url} onPress={() => void removeVideo(url)} accessibilityRole="button" accessibilityLabel="Remove video">
                  <Pill label="Video attached · tap to remove" tone="success" leading="🎬" />
                </Pressable>
              ))}
              {videos.length < MAX_VIDEOS ? (
                <Button
                  label={mediaUploading === 'video' ? 'Uploading…' : 'Add video'}
                  variant="secondary"
                  onPress={() => void addVideo()}
                  disabled={mediaUploading === 'video'}
                />
              ) : null}
            </View>

            <SectionHeader title="Voice note" />
            {voiceNoteUrl && !recording ? (
              <Pressable onPress={() => void removeVoiceNote()} accessibilityRole="button" accessibilityLabel="Remove voice note">
                <Pill label="Voice note recorded · tap to remove" tone="success" leading="🎤" />
              </Pressable>
            ) : (
              <Button
                label={
                  recording
                    ? `Recording… ${recordSeconds}s — tap to stop`
                    : mediaUploading === 'voice'
                      ? 'Saving…'
                      : 'Record voice note'
                }
                variant={recording ? 'primary' : 'secondary'}
                onPress={() => void toggleVoiceRecording()}
                disabled={mediaUploading === 'voice'}
              />
            )}

            <Button label="Continue" onPress={() => setStepIndex(4)} disabled={saving || recording} />
          </>
        ) : null}

        {step === 'location' ? (
          <>
            <Button
              label={locating ? 'Locating…' : coords ? '📍 Location set — use again' : 'Use my current location'}
              variant="secondary"
              onPress={() => void useMyLocation()}
              disabled={locating}
            />
            {coords ? (
              <Pill label={`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`} tone="success" leading="✓" />
            ) : null}
            <TextField label="Address" placeholder="House / flat / landmark" value={address} onChangeText={setAddress} />
            <TextField label="City" placeholder="City" value={city} onChangeText={setCity} />
            <Button label="Continue" onPress={() => void continueFromLocation()} disabled={saving || !coords} />
          </>
        ) : null}

        {step === 'timing' ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Right now"
                  variant={isImmediate ? 'primary' : 'secondary'}
                  onPress={() => {
                    haptic('selection');
                    setIsImmediate(true);
                    setScheduledAt(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Schedule for later"
                  variant={!isImmediate ? 'primary' : 'secondary'}
                  onPress={() => {
                    haptic('selection');
                    setIsImmediate(false);
                  }}
                />
              </View>
            </View>

            {!isImmediate ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <SectionHeader title="When?" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {SCHEDULE_PRESETS.map((preset) => {
                    const computed = preset.compute();
                    const selected = scheduledAt?.getTime() === computed.getTime();
                    return (
                      <Pressable
                        key={preset.label}
                        onPress={() => {
                          haptic('selection');
                          setScheduledAt(computed);
                        }}
                      >
                        <Pill label={preset.label} tone={selected ? 'primary' : 'neutral'} />
                      </Pressable>
                    );
                  })}
                </View>
                {scheduledAt ? (
                  <Text variant="footnote" tone="secondary">
                    Scheduled for {scheduledAt.toLocaleString()}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Button
              label="Continue"
              onPress={() => void continueFromTiming()}
              disabled={saving || (!isImmediate && !scheduledAt)}
            />
          </>
        ) : null}

        {step === 'review' ? (
          <>
            <Card style={{ gap: spacing.sm }}>
              <SectionHeader title="Summary" />
              <SummaryRow label="Category" value={categoryName ?? '—'} />
              <SummaryRow label="Service" value={serviceName ?? '—'} />
              <SummaryRow label="Title" value={title || '—'} />
              <SummaryRow label="Location" value={address || city || (coords ? 'Pinned' : '—')} />
              <SummaryRow label="Timing" value={isImmediate ? 'Right now' : scheduledAt?.toLocaleString() ?? '—'} />
            </Card>

            <SectionHeader title="Budget (optional)" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="Min ₹" placeholder="0" keyboardType="numeric" value={budgetMin} onChangeText={setBudgetMin} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Max ₹" placeholder="0" keyboardType="numeric" value={budgetMax} onChangeText={setBudgetMax} />
              </View>
            </View>

            <Button label={saving ? 'Posting…' : 'Post request'} onPress={() => void postRequest()} disabled={saving} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <Text variant="footnote" tone="tertiary">
        {label}
      </Text>
      <Text variant="footnote" weight="medium" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
