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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, EmptyState, LoadingSpinner, Button, TextField, BlurOverlay} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { crewApi, type ContactInput, type CrewWorker } from '@/api/crew.api';
import { squadsApi, type Squad } from '@/api/squads.api';
import { jobsApi } from '@/api/jobs.api';
import { rosterApi } from '@/api/roster.api';
import { timesheetApi } from '@/api/timesheet.api';
import { statementApi } from '@/api/statement.api';
import { churnApi } from '@/api/churn.api';
import { crewDocumentsApi } from '@/api/crewDocuments.api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minutes → "Xh Ym" / "Xh" / "Ym". */
function hoursLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Paise → "₹1,234" (whole rupees, Indian grouping). */
function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

/** Minimal HTML-escape for values interpolated into the PDF markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  const [statementBusy, setStatementBusy] = useState(false);
  /** Squad being deployed (drives the job-picker modal). */
  const [deployFor, setDeployFor] = useState<Squad | null>(null);
  const [deploying, setDeploying] = useState(false);
  /** Squad-builder modal: name + chosen crew ids. */
  const [builderOpen, setBuilderOpen] = useState(false);
  const [squadName, setSquadName] = useState('');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [savingSquad, setSavingSquad] = useState(false);

  const query = useQuery({
    queryKey: ['crew'],
    queryFn: () => crewApi.list(),
  });
  const crew = query.data?.workers ?? [];

  // Saved squads — reusable worker groups to deploy in one tap.
  const squadsQuery = useQuery({ queryKey: ['squads'], queryFn: () => squadsApi.list() });
  const squads = squadsQuery.data ?? [];

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

  // Crew documents expiring soon / already expired.
  const expiringQuery = useQuery({
    queryKey: ['crew-documents', 'expiring'],
    queryFn: () => crewDocumentsApi.expiring(),
  });
  const expiringDocs = expiringQuery.data?.documents ?? [];

  /**
   * Pull the consolidated month-end statement and render it to a PDF the
   * employer can share or save. Built as HTML → expo-print → expo-sharing
   * so it works fully on-device with no server-side PDF dependency.
   */
  async function generateStatement() {
    if (statementBusy) return;
    setStatementBusy(true);
    haptic('selection');
    try {
      const s = await statementApi.get();
      if (s.rows.length === 0) {
        Alert.alert(t('employer.statement.empty_title'), t('employer.statement.empty_body'));
        return;
      }
      const bodyRows = s.rows
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td class="n">${r.days}</td><td class="n">${r.shifts}</td><td class="n">${hoursLabel(
              r.minutes,
            )}</td><td class="n">${rupees(r.paidPaise)}</td></tr>`,
        )
        .join('');
      const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Roboto, sans-serif; color: #1a1a1a; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
  th { color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  td.n, th.n { text-align: right; }
  tfoot td { font-weight: 700; border-top: 2px solid #1a1a1a; border-bottom: none; }
  .foot { margin-top: 22px; color: #999; font-size: 10px; }
</style></head><body>
  <h1>${esc(t('employer.statement.pdf_title'))}</h1>
  <div class="sub">${esc(s.employerName)} · ${esc(s.month)}</div>
  <table>
    <thead><tr>
      <th>${esc(t('employer.statement.col_worker'))}</th>
      <th class="n">${esc(t('employer.statement.col_days'))}</th>
      <th class="n">${esc(t('employer.statement.col_shifts'))}</th>
      <th class="n">${esc(t('employer.statement.col_hours'))}</th>
      <th class="n">${esc(t('employer.statement.col_paid'))}</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
    <tfoot><tr>
      <td>${esc(t('employer.statement.total', { n: s.totals.workerCount }))}</td>
      <td class="n"></td>
      <td class="n">${s.totals.totalShifts}</td>
      <td class="n">${hoursLabel(s.totals.totalMinutes)}</td>
      <td class="n">${rupees(s.totals.totalPaidPaise)}</td>
    </tr></tfoot>
  </table>
  <div class="foot">${esc(t('employer.statement.pdf_footer'))}</div>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      haptic('success');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('employer.statement.share_title'),
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      haptic('error');
      Alert.alert(t('employer.statement.fail'));
    } finally {
      setStatementBusy(false);
    }
  }

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

  // Active jobs for the re-hire / squad-deploy picker — fetched once either
  // a worker or a squad is chosen.
  const activeJobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 50 }),
    enabled: rehireFor !== null || deployFor !== null,
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

  function togglePicked(id: string) {
    setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveSquad() {
    if (savingSquad || !squadName.trim() || pickedIds.length === 0) return;
    setSavingSquad(true);
    haptic('selection');
    try {
      await squadsApi.create(squadName.trim(), pickedIds);
      haptic('success');
      setBuilderOpen(false);
      setSquadName('');
      setPickedIds([]);
      void queryClient.invalidateQueries({ queryKey: ['squads'] });
    } catch {
      haptic('error');
      Alert.alert(t('employer.squad.save_fail'));
    } finally {
      setSavingSquad(false);
    }
  }

  const deleteSquadMut = useMutation({
    mutationFn: (id: string) => squadsApi.remove(id),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['squads'] });
    },
  });

  async function deploy(jobId: string) {
    if (!deployFor || deploying) return;
    setDeploying(true);
    haptic('selection');
    try {
      const res = await squadsApi.deploy(deployFor.id, jobId);
      haptic('success');
      setDeployFor(null);
      Alert.alert(
        t('employer.squad.deploy_done_title'),
        t('employer.squad.deploy_done_body', { sent: res.deployed.length, failed: res.failed.length }),
      );
    } catch {
      haptic('error');
      Alert.alert(t('employer.squad.deploy_fail'));
    } finally {
      setDeploying(false);
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

        {expiringDocs.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="warning" style={{ letterSpacing: 1.0 }}>
              {t('employer.crew.docs_expiring_title')}
            </Text>
            {expiringDocs.map((d) => (
              <Card key={d.id}>
                <View style={{ gap: 2 }}>
                  <Text variant="body" weight="medium" numberOfLines={1}>
                    {d.workerName} · {d.label}
                  </Text>
                  <Text variant="footnote" tone={d.expired ? 'danger' : 'warning'}>
                    {d.expired
                      ? t('employer.crew.docs_expired', {
                          date: new Date(d.expiresAt).toLocaleDateString('en-IN'),
                        })
                      : t('employer.crew.docs_expires', {
                          date: new Date(d.expiresAt).toLocaleDateString('en-IN'),
                        })}
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

        {/* Squads — reusable worker groups to deploy in one tap. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0, flex: 1 }}
            >
              {t('employer.squad.title')}
            </Text>
            {crew.length > 0 ? (
              <Pressable
                onPress={() => {
                  setPickedIds([]);
                  setSquadName('');
                  setBuilderOpen(true);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                  {t('employer.squad.new')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {squads.length === 0 ? (
            <Text variant="caption" tone="tertiary">
              {t('employer.squad.none')}
            </Text>
          ) : (
            squads.map((sq) => (
              <Card key={sq.id}>
                <View style={{ gap: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                      {sq.name}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {t('employer.squad.member_count', { n: sq.members.length })}
                    </Text>
                  </View>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {sq.members.map((m) => m.name).join(', ')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs }}>
                    <Pressable onPress={() => setDeployFor(sq)} hitSlop={6} accessibilityRole="button">
                      <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                        {t('employer.squad.deploy')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteSquadMut.mutate(sq.id)}
                      hitSlop={6}
                      accessibilityRole="button"
                    >
                      <Text variant="footnote" tone="tertiary">
                        {t('employer.squad.delete')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        <Pressable
          onPress={() => void generateStatement()}
          disabled={statementBusy}
          accessibilityRole="button"
          style={{
            paddingVertical: 12,
            borderRadius: radii.pill,
            alignItems: 'center',
            borderWidth: 0.5,
            borderColor: theme.brand.hero,
            opacity: statementBusy ? 0.6 : 1,
          }}
        >
          <Text variant="body" weight="medium" style={{ color: theme.brand.hero }}>
            {statementBusy
              ? t('employer.statement.generating')
              : t('employer.statement.cta')}
          </Text>
        </Pressable>

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
            illustration="workers"
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
          style={{ flex: 1, justifyContent: 'flex-end' }}
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

      {/* Squad deploy — pick the job to send the whole squad to. */}
      <Modal
        visible={deployFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDeployFor(null)}
      >
        <Pressable
          onPress={() => setDeployFor(null)}
          style={{ flex: 1, justifyContent: 'flex-end' }}
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
              {t('employer.squad.deploy_pick', { name: deployFor?.name ?? '' })}
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
                      onPress={() => void deploy(j.id)}
                      disabled={deploying}
                      style={{
                        padding: spacing.md,
                        borderRadius: radii.lg,
                        borderWidth: 0.5,
                        borderColor: theme.border.default,
                        opacity: deploying ? 0.6 : 1,
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

      {/* Squad builder — name it and pick crew members. */}
      <Modal
        visible={builderOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBuilderOpen(false)}
      >
        <Pressable
          onPress={() => setBuilderOpen(false)}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.bg.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
              maxHeight: '85%',
            }}
          >
            <Text variant="bodyLarge" weight="semibold">
              {t('employer.squad.builder_title')}
            </Text>
            <TextField
              value={squadName}
              onChangeText={setSquadName}
              placeholder={t('employer.squad.name_placeholder')}
            />
            <ScrollView style={{ maxHeight: 320 }}>
              <View style={{ gap: spacing.sm }}>
                {crew.map((w) => {
                  const picked = pickedIds.includes(w.id);
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => togglePicked(w.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: picked }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.sm,
                        padding: spacing.sm,
                        borderRadius: radii.lg,
                        borderWidth: 0.5,
                        borderColor: picked ? theme.brand.hero : theme.border.default,
                        backgroundColor: picked ? `${theme.brand.hero}14` : 'transparent',
                      }}
                    >
                      <Avatar name={w.name} photoUrl={w.photoUrl} size={32} />
                      <Text variant="body" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                        {w.name}
                      </Text>
                      <Feather
                        name={picked ? 'check-circle' : 'circle'}
                        size={18}
                        color={picked ? theme.brand.hero : theme.text.tertiary}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Button
              label={
                savingSquad
                  ? t('employer.squad.saving')
                  : t('employer.squad.save', { n: pickedIds.length })
              }
              onPress={() => void saveSquad()}
              disabled={savingSquad || !squadName.trim() || pickedIds.length === 0}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
