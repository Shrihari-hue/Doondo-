/**
 * MyEmployerJobScreen — the worker's hub for one employer they work for.
 *
 * Pulls together everything about this working relationship in one place:
 *   - Know-your-employer summary (verified, rating) + link to full profile
 *   - Your terms (agreed wage, role, start)
 *   - Attendance this month (days / shifts / hours for this employer)
 *   - Salary slip — a downloadable monthly PDF
 *   - Payment status — paid ✓ vs awaiting, per hire
 *   - My schedule — next shift + recurring days
 *   - Directions to the site
 *   - Call the employer (masked), raise/track a dispute
 *   - Links out to shift tools (My Applications) and the wallet (Earnings)
 *
 * Almost all of it reads from data the app already has (the worker's hired
 * applications + employer profile); only attendance and the payslip come
 * from the worker-job rollup endpoints.
 */

import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, Button, DisputeSection, HiredJobTools, PaymentConfirmationPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { applicationsApi } from '@/api/applications.api';
import { employersApi } from '@/api/employers.api';
import { workerJobApi } from '@/api/workerJob.api';
import { maskedCallApi } from '@/api/maskedCall.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'MyEmployerJob'>;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hoursLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function MyEmployerJobScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { employerId, employerName } = route.params;

  const [payslipBusy, setPayslipBusy] = useState(false);
  const [calling, setCalling] = useState(false);

  const appsQuery = useQuery({
    queryKey: ['applications', 'me', 'hired'],
    queryFn: () => applicationsApi.listMine({ status: 'hired', limit: 50 }),
    staleTime: 30_000,
  });

  const profileQuery = useQuery({
    queryKey: ['employer', employerId],
    queryFn: () => employersApi.getProfile(employerId),
    staleTime: 5 * 60_000,
  });

  const attendanceQuery = useQuery({
    queryKey: ['my-job', 'attendance'],
    queryFn: () => workerJobApi.attendance(),
    staleTime: 60_000,
  });

  // This employer's hired applications.
  const apps = useMemo(
    () => (appsQuery.data?.applications ?? []).filter((a) => a.job?.employer?.id === employerId),
    [appsQuery.data, employerId],
  );
  const primary = apps[0];
  const attendance = attendanceQuery.data?.byEmployer.find((e) => e.employerId === employerId);
  const profile = profileQuery.data;

  async function downloadPayslip() {
    if (payslipBusy) return;
    setPayslipBusy(true);
    haptic('selection');
    try {
      const p = await workerJobApi.payslip(employerId);
      if (p.shifts === 0 && p.paidPaise === 0) {
        Alert.alert(t('my_employer.payslip_empty_title'), t('my_employer.payslip_empty_body'));
        return;
      }
      const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Roboto, sans-serif; color: #1a1a1a; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
  td.r { text-align: right; font-weight: 700; }
  .foot { margin-top: 22px; color: #999; font-size: 10px; }
</style></head><body>
  <h1>${esc(t('my_employer.payslip_pdf_title'))}</h1>
  <div class="sub">${esc(p.workerName)} · ${esc(p.employerName)} · ${esc(p.month)}</div>
  <table>
    <tr><td>${esc(t('my_employer.payslip_days'))}</td><td class="r">${p.days}</td></tr>
    <tr><td>${esc(t('my_employer.payslip_shifts'))}</td><td class="r">${p.shifts}</td></tr>
    <tr><td>${esc(t('my_employer.payslip_hours'))}</td><td class="r">${hoursLabel(p.minutes)}</td></tr>
    <tr><td>${esc(t('my_employer.payslip_paid'))}</td><td class="r">${rupees(p.paidPaise)}</td></tr>
  </table>
  <div class="foot">${esc(t('my_employer.payslip_footer'))}</div>
</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      haptic('success');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('my_employer.payslip_share'),
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      haptic('error');
      Alert.alert(t('my_employer.payslip_fail'));
    } finally {
      setPayslipBusy(false);
    }
  }

  async function callEmployer() {
    if (!primary || calling) return;
    setCalling(true);
    haptic('selection');
    try {
      const res = await maskedCallApi.start(primary.id);
      if (!res.dialNumber) {
        Alert.alert(t('masked_call.no_number'));
        return;
      }
      await Linking.openURL(`tel:${res.dialNumber}`);
    } catch {
      haptic('error');
      Alert.alert(t('masked_call.fail'));
    } finally {
      setCalling(false);
    }
  }

  function openDirections() {
    const coords = primary?.job?.location?.coordinates;
    if (!coords) return;
    const [lng, lat] = coords;
    haptic('selection');
    void Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
  }

  const job = primary?.job;

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
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            {t('my_employer.back')}
          </Text>
        </Pressable>

        {/* Know-your-employer */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar
              name={employerName}
              photoUrl={profile?.employer.photoUrl ?? null}
              size={48}
              premium={profile?.employer.isVerified}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="semibold" numberOfLines={1}>
                {profile?.employer.companyName ?? profile?.employer.name ?? employerName}
              </Text>
              <Text variant="footnote" tone="secondary">
                {profile?.employer.rating
                  ? t('my_employer.rating', {
                      avg: profile.employer.rating.avg.toFixed(1),
                      n: profile.employer.rating.count,
                    })
                  : t('my_employer.no_rating')}
                {profile?.employer.isVerified ? ` · ${t('my_employer.verified')}` : ''}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('EmployerDetail', { userId: employerId })}
            accessibilityRole="button"
            style={{ marginTop: spacing.sm }}
          >
            <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
              {t('my_employer.view_profile')}
            </Text>
          </Pressable>
        </Card>

        {/* Your terms */}
        {job ? (
          <Section title={t('my_employer.terms_title')}>
            <Row label={t('my_employer.terms_role')} value={job.title} theme={theme} />
            <Row
              label={t('my_employer.terms_wage')}
              value={`${rupees(job.pay.amount)} / ${t(`my_employer.period_${job.pay.period}`)}`}
              theme={theme}
            />
            {job.project ? (
              <Row
                label={t('my_employer.terms_project')}
                value={t('my_employer.terms_project_value', {
                  days: job.project.totalDays,
                  start: job.project.startDate,
                  end: job.project.endDate,
                })}
                theme={theme}
              />
            ) : null}
          </Section>
        ) : null}

        {/* Attendance this month */}
        <Section title={t('my_employer.attendance_title')}>
          {attendance ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.xs }}>
              <Stat label={t('my_job.stat_days')} value={String(attendance.days)} theme={theme} />
              <Stat label={t('my_job.stat_shifts')} value={String(attendance.shifts)} theme={theme} />
              <Stat label={t('my_job.stat_hours')} value={hoursLabel(attendance.minutes)} theme={theme} />
            </View>
          ) : (
            <Text variant="footnote" tone="tertiary">
              {t('my_employer.attendance_empty')}
            </Text>
          )}
        </Section>

        {/* Salary slip */}
        <Button
          label={payslipBusy ? t('my_employer.payslip_busy') : t('my_employer.payslip_cta')}
          variant="secondary"
          onPress={() => void downloadPayslip()}
          disabled={payslipBusy}
        />

        {/* Per active job — payment confirmation + the full shift-tool stack
            (check-in, confirm, work proof, checklist, briefing). This is the
            canonical home for these tools; My Applications links here. */}
        {apps.map((a) => (
          <View key={a.id} style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
              {(a.job?.title ?? t('my_employer.this_job')).toUpperCase()}
            </Text>
            <PaymentConfirmationPanel
              application={a}
              role="seeker"
              invalidateQueryKeys={[
                ['applications', 'me', 'hired'],
                ['applications', 'me'],
              ]}
            />
            <HiredJobTools application={a} />
          </View>
        ))}

        {/* My schedule */}
        <Section title={t('my_employer.schedule_title')}>
          {apps.some((a) => a.nextShiftAt || (a.job?.recurring && (a.job?.schedule?.days?.length ?? 0) > 0)) ? (
            apps.map((a) => (
              <View key={a.id} style={{ paddingVertical: 4 }}>
                <Text variant="footnote" weight="medium" numberOfLines={1}>
                  {a.job?.title ?? t('my_employer.this_job')}
                </Text>
                <Text variant="caption" tone="secondary">
                  {a.nextShiftAt
                    ? t('my_employer.next_shift', {
                        when: new Date(a.nextShiftAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }),
                      })
                    : ''}
                  {a.job?.recurring && (a.job?.schedule?.days?.length ?? 0) > 0
                    ? `${a.nextShiftAt ? ' · ' : ''}${(a.job?.schedule?.days ?? [])
                        .map((d) => DAY_LABELS[d])
                        .join(' · ')}`
                    : ''}
                </Text>
              </View>
            ))
          ) : (
            <Text variant="footnote" tone="tertiary">
              {t('my_employer.schedule_empty')}
            </Text>
          )}
        </Section>

        {/* Actions */}
        <View style={{ gap: spacing.sm }}>
          {primary ? (
            <Button
              label={calling ? t('masked_call.connecting') : t('masked_call.cta_employer')}
              variant="secondary"
              onPress={() => void callEmployer()}
              disabled={calling}
            />
          ) : null}
          {job?.location?.coordinates ? (
            <Button label={t('my_employer.directions')} variant="secondary" onPress={openDirections} />
          ) : null}
          <Button
            label={t('my_employer.wallet')}
            variant="secondary"
            onPress={() => navigation.navigate('MyEarnings')}
          />
        </View>

        {/* Dispute */}
        {primary ? <DisputeSection applicationId={primary.id} /> : null}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
        {title}
      </Text>
      <Card>{children}</Card>
    </View>
  );
}

function Row({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}>
      <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="footnote" weight="medium" style={{ color: theme.text.primary, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text variant="title" weight="semibold" style={{ color: theme.brand.hero }}>
        {value}
      </Text>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}
