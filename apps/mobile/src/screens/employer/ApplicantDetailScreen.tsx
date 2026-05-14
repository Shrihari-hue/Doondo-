/**
 * ApplicantDetailScreen — modal with full applicant context + actions.
 *
 * Shows the seeker's avatar, skills, location, cover note (if any), and
 * the job they applied to. Action row at the bottom drives the state
 * machine: Mark viewed → Shortlist → Hire / Reject. Buttons disable
 * once they're no longer valid.
 *
 * Hire reuses the cinematic ApplyCelebration flow shape — a champagne
 * burst with "You hired {name}." So the human moment is mirrored on
 * both sides of the marketplace.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, Avatar, SkeletonCard, EmptyState, TextField, FormError } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi, type ApplicantEntry, type SchedulePayload } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import { useUnratedApplications } from '@/hooks/useRatings';
import { openResume, formatResumeSize } from '@/lib/resume';
import { ApplyCelebration } from '../seeker/apply-moment/ApplyCelebration';
import type { AppStackParamList } from '@/navigation/types';
import type { ApplicationStatus, InterviewMode, PublicInterview } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'ApplicantDetail'>;
type Route = RouteProp<AppStackParamList, 'ApplicantDetail'>;

export function ApplicantDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const queryClient = useQueryClient();
  const [showHired, setShowHired] = useState(false);

  // We keep the applicant detail in cache (seeded from list views) when
  // possible, but always refetch to ensure fresh status.
  const query = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      // Reuse the list endpoint — applicant detail isn't a separate route
      // yet (it'd be a one-applicant fetch). The flat /applications/:id
      // endpoint already exists for seeker side, but it filters by
      // seekerId. For Phase 3 v1, we read from the cross-employer list
      // and pluck the matching one.
      const { applications } = await applicationsApi.listForEmployer({ limit: 100 });
      const found = applications.find((a) => a.id === route.params.applicationId);
      if (!found) throw new Error('Applicant not found');
      return found;
    },
  });

  // Auto-mark as viewed the first time the employer opens this card.
  useEffect(() => {
    if (query.data && query.data.status === 'pending') {
      void applicationsApi
        .markViewed(query.data.id)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['applicants', 'detail', query.data!.id] }),
        )
        .catch(() => undefined);
    }
  }, [query.data?.id, query.data?.status, queryClient]);

  const transition = useMutation({
    mutationFn: async (next: 'shortlisted' | 'rejected' | 'hired') => {
      const id = query.data!.id;
      if (next === 'shortlisted') return applicationsApi.shortlist(id);
      if (next === 'rejected') return applicationsApi.reject(id);
      return applicationsApi.hire(id);
    },
    onSuccess: (_, variables) => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      if (variables === 'hired') {
        setShowHired(true);
      } else {
        navigation.goBack();
      }
    },
    onError: () => haptic('error'),
  });

  if (query.isLoading) {
    // Skeleton arrangement that mirrors the loaded layout silhouette —
    // identity header → job-context block → skills/note rows.
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingTop: spacing['3xl'],
            gap: spacing.lg,
          }}
        >
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </ScrollView>
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow="UNAVAILABLE"
            title="Couldn't load this applicant"
            message="They may have withdrawn, or your connection dropped."
            cta={{ label: 'Close', onPress: () => navigation.goBack() }}
          />
        </View>
      </Screen>
    );
  }

  const applicant = query.data;

  // Pending rating — true when this applicant has been hired by us and
  // we haven't left a rating yet. Drives the inline "Rate this worker"
  // banner near the top of the screen.
  const unratedQuery = useUnratedApplications();
  const unratedHere = (unratedQuery.data?.unrated ?? []).find(
    (u) => u.applicationId === applicant.id,
  );

  return (
    <Screen>
      {showHired && (
        <ApplyCelebration
          onClose={() => {
            setShowHired(false);
            navigation.goBack();
          }}
        />
      )}
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['7xl'],
          gap: spacing['2xl'],
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            ← Back
          </Text>
        </Pressable>

        {/* Rate-this-worker banner — only when this applicant is hired
            and we haven't rated yet. Tap pushes the LeaveRating modal. */}
        {unratedHere && (
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('LeaveRating', {
                applicationId: unratedHere.applicationId,
                revieweeName: unratedHere.otherPartyName,
                jobTitle: unratedHere.jobTitle,
              });
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: 12,
              backgroundColor: theme.brand.heroSubtle,
              borderWidth: 0.5,
              borderColor: theme.brand.heroBorder,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 20 }}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" weight="medium" tone="hero">
                Rate this worker
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                Your review helps other employers find great hires.
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.brand.hero }}>
              Rate ›
            </Text>
          </Pressable>
        )}

        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Avatar
            name={applicant.seeker?.name ?? 'Applicant'}
            photoUrl={applicant.seeker?.photoUrl}
            size={92}
            premium={applicant.seeker?.isVerified}
          />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {(applicant.status === 'pending' ? 'NEW APPLICANT' : applicant.status.toUpperCase())}
            </Text>
            <Text variant="display" weight="medium" display>
              {applicant.seeker?.name ?? 'Applicant'}
            </Text>
            {applicant.seeker?.location && (
              <Text variant="footnote" tone="secondary">
                {[applicant.seeker.location.area, applicant.seeker.location.city]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </Text>
            )}
          </View>
        </View>

        {/* Job context */}
        {applicant.job && (
          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0 }}
              >
                APPLIED TO
              </Text>
              <Text variant="bodyLarge" weight="medium">
                {applicant.job.title}
              </Text>
            </View>
          </Card>
        )}

        {/* Skills */}
        {(applicant.seeker?.skills.length ?? 0) > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              SKILLS
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {applicant.seeker!.skills.map((s) => (
                <Pill key={s} label={s} tone="neutral" />
              ))}
            </View>
          </View>
        )}

        {/* Cover note */}
        {applicant.coverNote && (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              COVER NOTE
            </Text>
            <Card>
              <Text variant="body">{applicant.coverNote}</Text>
            </Card>
          </View>
        )}

        {/* Resume */}
        <ResumeRow seeker={applicant.seeker ?? null} />

        {/* Interview scheduling */}
        <InterviewPanel applicationId={applicant.id} interview={applicant.interview ?? null} />

        {/* Actions */}
        <ActionPanel applicant={applicant} onAction={(t) => transition.mutate(t)} pending={transition.isPending} />
      </ScrollView>
    </Screen>
  );
}

// ─── Resume row ─────────────────────────────────────────────────────────────

/**
 * Inline resume card. Hidden when the seeker hasn't uploaded one.
 * Tap → write the base64 payload to the OS share sheet so the employer can
 * open it in Files / Drive / Mail / Preview. We can't use Linking.openURL
 * for `data:` URIs — iOS / Android both reject them.
 */
function ResumeRow({
  seeker,
}: {
  seeker: NonNullable<ApplicantEntry['seeker']> | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!seeker?.resumeUrl) return null;

  const sizeStr = formatResumeSize(seeker.resumeSizeBytes);
  const subtitleParts = [
    seeker.resumeMimeType?.includes('pdf') ? 'PDF' : 'DOC',
    sizeStr,
  ].filter(Boolean);

  async function handleOpen() {
    setError(null);
    setBusy(true);
    try {
      await openResume({
        dataUrl: seeker!.resumeUrl!,
        filename: seeker!.resumeFilename,
        mimeType: seeker!.resumeMimeType,
      });
    } catch (err) {
      haptic('error');
      setError(err instanceof Error ? err.message : "Couldn't open resume");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        RESUME
      </Text>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
              {seeker.resumeFilename ?? 'Resume'}
            </Text>
            {subtitleParts.length > 0 && (
              <Text variant="footnote" tone="secondary">
                {subtitleParts.join(' · ')}
              </Text>
            )}
          </View>
          <Button
            label={busy ? 'Opening…' : 'Open resume'}
            variant="secondary"
            onPress={handleOpen}
            disabled={busy}
          />
          <FormError message={error} />
        </View>
      </Card>
    </View>
  );
}

// ─── Interview scheduling panel ─────────────────────────────────────────────

interface InterviewPanelProps {
  applicationId: string;
  interview: PublicInterview | null;
}

const MODE_OPTIONS: Array<{ key: InterviewMode; label: string }> = [
  { key: 'in_person', label: 'In-person' },
  { key: 'video', label: 'Video' },
  { key: 'phone', label: 'Phone' },
];

/**
 * Inline scheduling card on the applicant detail. Shows the current
 * interview when one exists, or the schedule form when not.
 *
 * Date entry uses a plain TextField that accepts a permissive format
 * (YYYY-MM-DD HH:mm). When time-pickers ship for the seeker screen we
 * swap this out — keeping the API surface flat means the swap is local.
 */
function InterviewPanel({ applicationId, interview }: InterviewPanelProps) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const active = interview && interview.status === 'scheduled' ? interview : null;
  const [editing, setEditing] = useState(false);

  const scheduleMutation = useMutation({
    mutationFn: (body: SchedulePayload) =>
      applicationsApi.scheduleInterview(applicationId, body),
    onSuccess: () => {
      haptic('success');
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
    onError: () => haptic('error'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => applicationsApi.cancelInterview(applicationId),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
    onError: () => haptic('error'),
  });

  if (active && !editing) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          INTERVIEW
        </Text>
        <Card premium>
          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyLarge" weight="medium">
              {formatWhen(active.scheduledFor)}
            </Text>
            <Text variant="footnote" tone="secondary">
              {modeLabel(active.mode)}
              {active.mode === 'in_person' && active.location ? ` · ${active.location}` : ''}
              {active.mode === 'video' && active.meetingLink ? ` · ${active.meetingLink}` : ''}
            </Text>
            {active.notes ? (
              <Text variant="footnote" tone="tertiary" style={{ marginTop: spacing.xs }}>
                {active.notes}
              </Text>
            ) : null}
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Reschedule" variant="secondary" onPress={() => setEditing(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
              variant="danger"
              onPress={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        INTERVIEW
      </Text>
      {!editing ? (
        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text variant="body" tone="secondary">
              Set a time and the applicant gets a push, a chat note, and a card on
              their application.
            </Text>
            <Button
              label="Schedule interview"
              variant="primary"
              onPress={() => setEditing(true)}
            />
          </View>
        </Card>
      ) : (
        <ScheduleForm
          initial={active}
          submitting={scheduleMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => scheduleMutation.mutate(body)}
        />
      )}
    </View>
  );
}

interface ScheduleFormProps {
  initial: PublicInterview | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: SchedulePayload) => void;
}

function ScheduleForm({ initial, submitting, onCancel, onSubmit }: ScheduleFormProps) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<InterviewMode>(initial?.mode ?? 'in_person');
  // ISO entry — permissive: accept "YYYY-MM-DD HH:mm" or full ISO and we'll
  // normalise. Date pickers come later; this keeps the form one screen tall.
  const [whenText, setWhenText] = useState(
    initial ? toLocalEntry(initial.scheduledFor) : '',
  );
  const [location, setLocation] = useState(initial?.location ?? '');
  const [meetingLink, setMeetingLink] = useState(initial?.meetingLink ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const iso = parseLocalEntry(whenText);
    if (!iso) {
      setError('Use a format like 2026-05-12 15:00.');
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      setError('Pick a future date and time.');
      return;
    }
    if (mode === 'in_person' && !location.trim()) {
      setError('Add a location for in-person interviews.');
      return;
    }
    if (mode === 'video' && !meetingLink.trim()) {
      setError('Add a meeting link for video interviews.');
      return;
    }
    setError(null);
    const body: SchedulePayload = { scheduledFor: iso, mode };
    if (mode === 'in_person' && location.trim()) body.location = location.trim();
    if (mode === 'video' && meetingLink.trim()) body.meetingLink = meetingLink.trim();
    if (notes.trim()) body.notes = notes.trim();
    onSubmit(body);
  }

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <FormError message={error} />

        {/* Mode selector */}
        <View style={{ gap: spacing.xs }}>
          <Text variant="footnote" weight="medium" tone="secondary">
            How
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {MODE_OPTIONS.map((o) => {
              const active = mode === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    haptic('selection');
                    setMode(o.key);
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
          label="When"
          value={whenText}
          onChangeText={setWhenText}
          placeholder="2026-05-12 15:00"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {mode === 'in_person' && (
          <TextField
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="Third Wave Coffee, Indiranagar 12th Main"
          />
        )}
        {mode === 'video' && (
          <TextField
            label="Meeting link"
            value={meetingLink}
            onChangeText={setMeetingLink}
            placeholder="https://meet.google.com/..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        )}

        <TextField
          label="Note (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Bring an ID, ask for Sneha at reception."
          multiline
          numberOfLines={3}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={submitting} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={submitting ? 'Scheduling…' : initial ? 'Reschedule' : 'Schedule'}
              onPress={submit}
              disabled={submitting}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

function modeLabel(m: InterviewMode): string {
  return m === 'in_person' ? 'In-person' : m === 'video' ? 'Video call' : 'Phone call';
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Pretty-print an ISO datetime in local form for the text input. */
function toLocalEntry(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * Parse a permissive local datetime entry into ISO. Accepts:
 *   2026-05-12 15:00
 *   2026-05-12T15:00
 *   2026-05-12 3:00 pm (case-insensitive)
 * Returns null if it can't be parsed.
 */
function parseLocalEntry(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;
  // Normalise: replace 'T' with space, lowercase am/pm.
  let s = cleaned.replace('T', ' ').toLowerCase();
  // Convert "h:mm am/pm" to 24h.
  s = s.replace(
    /(\d{1,2}):(\d{2})\s*(am|pm)/,
    (_m, h: string, mi: string, ampm: string) => {
      const hh = Number(h) % 12 + (ampm === 'pm' ? 12 : 0);
      return `${String(hh).padStart(2, '0')}:${mi}`;
    },
  );
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, da, hh, mi] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(hh), Number(mi), 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function ActionPanel({
  applicant,
  onAction,
  pending,
}: {
  applicant: ApplicantEntry;
  onAction: (t: 'shortlisted' | 'rejected' | 'hired') => void;
  pending: boolean;
}) {
  const { theme } = useTheme();
  const status = applicant.status;
  const terminal = status === 'rejected' || status === 'hired' || status === 'withdrawn';

  if (terminal) {
    return (
      <Card>
        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Text variant="bodyLarge" weight="medium">
            {status === 'hired'
              ? 'You hired them.'
              : status === 'rejected'
                ? 'You declined this applicant.'
                : 'They withdrew their application.'}
          </Text>
        </View>
      </Card>
    );
  }

  const canShortlist = status === 'pending' || status === 'viewed';
  const canHire = status === 'shortlisted';

  return (
    <View style={{ gap: spacing.sm }}>
      {canHire ? (
        <Button
          label={pending ? 'Hiring…' : 'Hire'}
          onPress={() => onAction('hired')}
          disabled={pending}
        />
      ) : canShortlist ? (
        <Button
          label={pending ? 'Saving…' : 'Shortlist'}
          onPress={() => onAction('shortlisted')}
          disabled={pending}
        />
      ) : null}
      <Button
        label={pending ? 'Saving…' : 'Decline'}
        variant="secondary"
        onPress={() => onAction('rejected')}
        disabled={pending}
      />
    </View>
  );
}
