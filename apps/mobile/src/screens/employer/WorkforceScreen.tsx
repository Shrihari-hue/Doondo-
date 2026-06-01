/**
 * WorkforceScreen — "My crew": the employer's saved workers for one-tap
 * re-hire, seeded by importing phone contacts.
 *
 * Import flow: read the device address book (expo-contacts, loaded via
 * require() so the bundle still works where it isn't present), send the
 * names + numbers to /crew/import, and the server matches them to
 * existing Doondo workers. Matched workers join the crew; the rest come
 * back as "not on Doondo yet" so the employer can invite them.
 */

import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { crewApi, type ContactInput, type CrewWorker } from '@/api/crew.api';
import { jobsApi } from '@/api/jobs.api';
import { rosterApi } from '@/api/roster.api';
import { timesheetApi } from '@/api/timesheet.api';
import { churnApi } from '@/api/churn.api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minutes → "Xh Ym" / "Xh" / "Ym". */
function hoursLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Read the device contacts as {name, phone} pairs. Returns null when the
 * native module is unavailable, and [] when permission is denied — the
 * caller distinguishes "can't" from "nothing".
 */
async function readContacts(): Promise<ContactInput[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Contacts: any = require('expo-contacts');
    if (!Contacts?.requestPermissionsAsync) return null;
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') return [];
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });
    const out: ContactInput[] = [];
    for (const c of data ?? []) {
      const phone = c.phoneNumbers?.[0]?.number;
      if (phone) out.push({ name: c.name ?? '', phone });
      if (out.length >= 500) break;
    }
    return out;
  } catch {
    return null;
  }
}

export function WorkforceScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  /** Crew member currently being re-hired (drives the job-picker modal). */
  const [rehireFor, setRehireFor] = useState<CrewWorker | null>(null);
  const [rehiring, setRehiring] = useState(false);

  const query = useQuery({
    queryKey: ['crew'],
    queryFn: () => crewApi.list(),
  });
  const crew = query.data?.workers ?? [];

  // Weekly roster — recurring shifts + who's filling each.
  const rosterQuery = useQuery({ queryKey: ['roster'], queryFn: () => rosterApi.list() });
  const roster = rosterQuery.data?.entries ?? [];

  // This month's worked hours per worker, from shift check-ins.
  const timesheetQuery = useQuery({
    queryKey: ['timesheet'],
    queryFn: () => timesheetApi.get(),
  });
  const timesheet = timesheetQuery.data;

  // Crew churn — regulars who've gone quiet (win-back candidates).
  const churnQuery = useQuery({ queryKey: ['churn-risks'], queryFn: () => churnApi.list() });
  const churnRisks = churnQuery.data?.risks ?? [];

  function exportTimesheet() {
    if (!timesheet || timesheet.workers.length === 0) return;
    haptic('selection');
    const header = 'Worker,Days,Shifts,Hours';
    const rows = timesheet.workers.map(
      (w) => `${w.name},${w.days},${w.shifts},${(w.totalMinutes / 60).toFixed(1)}`,
    );
    const csv = [`Timesheet ${timesheet.month}`, header, ...rows].join('\n');
    void Share.share({ message: csv });
  }

  // Active jobs for the re-hire picker — only fetched once a worker is chosen.
  const activeJobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 50 }),
    enabled: rehireFor !== null,
  });
  const activeJobs = activeJobsQuery.data?.jobs ?? [];

  async function rehire(jobId: string) {
    if (!rehireFor || rehiring) return;
    setRehiring(true);
    haptic('selection');
    try {
      await crewApi.rehire(rehireFor.id, jobId);
      haptic('success');
      setRehireFor(null);
      Alert.alert(t('employer.crew.rehire_sent_title'), t('employer.crew.rehire_sent_body'));
    } catch {
      haptic('error');
      Alert.alert(t('employer.crew.rehire_fail'));
    } finally {
      setRehiring(false);
    }
  }

  const removeMut = useMutation({
    mutationFn: (workerId: string) => crewApi.remove(workerId),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['crew'] });
    },
  });

  async function importContacts() {
    if (importing) return;
    setImporting(true);
    try {
      const contacts = await readContacts();
      if (contacts === null) {
        Alert.alert(t('employer.crew.no_contacts_title'), t('employer.crew.no_contacts_body'));
        return;
      }
      if (contacts.length === 0) {
        Alert.alert(t('employer.crew.permission_title'), t('employer.crew.permission_body'));
        return;
      }
      const result = await crewApi.import(contacts);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['crew'] });
      const addedN = result.added.length;
      const inviteN = result.notOnDoondo.length;
      Alert.alert(
        t('employer.crew.import_done_title', { n: addedN }),
        t('employer.crew.import_done_body', { invite: inviteN }),
        inviteN > 0
          ? [
              { text: t('employer.crew.later'), style: 'cancel' },
              {
                text: t('employer.crew.invite'),
                onPress: () => {
                  void Share.share({ message: t('employer.crew.invite_message') });
                },
              },
            ]
          : undefined,
      );
    } catch {
      haptic('error');
      Alert.alert(t('employer.crew.import_fail'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('employer.workforce.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('employer.crew.title')}
          </Text>
        </View>

        {roster.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
              {t('employer.crew.roster_title')}
            </Text>
            {roster.map((entry) => (
              <Card key={entry.jobId}>
                <View style={{ gap: 4 }}>
                  <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                    {entry.title}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {entry.days.length > 0
                      ? entry.days.map((d) => DAY_LABELS[d]).join(' · ')
                      : t('employer.crew.roster_no_days')}
                    {entry.startTime ? ` · ${entry.startTime}` : ''}
                  </Text>
                  <Text variant="footnote" tone={entry.workers.length > 0 ? 'primary' : 'tertiary'}>
                    {entry.workers.length > 0
                      ? entry.workers.map((w) => w.name).join(', ')
                      : t('employer.crew.roster_unfilled')}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {churnRisks.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="warning" style={{ letterSpacing: 1.0 }}>
              {t('employer.crew.churn_title')}
            </Text>
            {churnRisks.map((w) => (
              <Card key={w.workerId}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar name={w.name} photoUrl={w.photoUrl} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="medium" numberOfLines={1}>
                      {w.name}
                    </Text>
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {t('employer.crew.churn_row', { hires: w.hireCount, days: w.daysSince })}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      setRehireFor({
                        id: w.workerId,
                        name: w.name,
                        photoUrl: w.photoUrl,
                        skills: [],
                        isVerified: false,
                      })
                    }
                    accessibilityRole="button"
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      borderRadius: radii.pill,
                      backgroundColor: theme.brand.hero,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                      {t('employer.crew.churn_reach_out')}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {timesheet && timesheet.workers.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0, flex: 1 }}
              >
                {t('employer.crew.timesheet_title')}
              </Text>
              <Pressable onPress={exportTimesheet} hitSlop={8}>
                <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                  {t('employer.crew.timesheet_export')}
                </Text>
              </Pressable>
            </View>
            <Card>
              <View style={{ gap: spacing.sm }}>
                {timesheet.workers.map((w) => (
                  <View
                    key={w.workerId}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                  >
                    <Avatar name={w.name} photoUrl={w.photoUrl} size={32} />
                    <Text variant="body" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                      {w.name}
                    </Text>
                    <Text variant="footnote" tone="secondary">
                      {t('employer.crew.timesheet_row', {
                        hours: hoursLabel(w.totalMinutes),
                        days: w.days,
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <Pressable
          onPress={() => void importContacts()}
          disabled={importing}
          style={{
            paddingVertical: 14,
            borderRadius: radii.pill,
            alignItems: 'center',
            backgroundColor: theme.brand.hero,
            opacity: importing ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
            {importing ? t('employer.crew.importing') : t('employer.crew.import_cta')}
          </Text>
        </Pressable>

        {query.isLoading ? (
          <LoadingSpinner />
        ) : crew.length === 0 ? (
          <EmptyState
            glyph="👥"
            tone="hero"
            eyebrow={t('employer.crew.empty_eyebrow')}
            title={t('employer.crew.empty_title')}
            message={t('employer.crew.empty_body')}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {crew.map((w) => (
              <Card key={w.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={w.name} photoUrl={w.photoUrl} size={44} premium={w.isVerified} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                      {w.name}
                    </Text>
                    {w.skills.length > 0 && (
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {w.skills.slice(0, 3).join(' · ')}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => setRehireFor(w)}
                    accessibilityRole="button"
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      borderRadius: radii.pill,
                      backgroundColor: theme.brand.hero,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                      {t('employer.crew.rehire')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeMut.mutate(w.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                  >
                    <Text variant="footnote" tone="tertiary">
                      {t('employer.crew.remove')}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Re-hire job picker */}
      <Modal
        visible={rehireFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRehireFor(null)}
      >
        <Pressable
          onPress={() => setRehireFor(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.bg.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
              maxHeight: '70%',
            }}
          >
            <Text variant="bodyLarge" weight="semibold">
              {t('employer.crew.rehire_pick', { name: rehireFor?.name ?? '' })}
            </Text>
            {activeJobsQuery.isLoading ? (
              <LoadingSpinner />
            ) : activeJobs.length === 0 ? (
              <Text variant="footnote" tone="secondary">
                {t('employer.crew.rehire_no_jobs')}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                <View style={{ gap: spacing.sm }}>
                  {activeJobs.map((j) => (
                    <Pressable
                      key={j.id}
                      onPress={() => void rehire(j.id)}
                      disabled={rehiring}
                      style={{
                        padding: spacing.md,
                        borderRadius: radii.lg,
                        borderWidth: 0.5,
                        borderColor: theme.border.default,
                        opacity: rehiring ? 0.6 : 1,
                      }}
                    >
                      <Text variant="body" weight="medium" numberOfLines={1}>
                        {j.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
