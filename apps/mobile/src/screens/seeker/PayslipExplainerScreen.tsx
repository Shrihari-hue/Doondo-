/**
 * PayslipExplainerScreen — PF, ESI and income tax, explained.
 *
 * A worker's first formal payslip is alarming: the agreed wage, minus
 * deductions, equals a smaller "in hand" number. This screen explains
 * each deduction in plain language — and reframes them. PF is the
 * worker's own savings; ESI is health cover for the whole family; and
 * for almost every blue-collar wage, income tax is simply zero.
 *
 * Every rate comes from `formalPayCatalog` (verified for FY 2026-27)
 * and is interpolated into the copy, so a rate change is one edit in
 * the catalog — never in this screen or the locale files.
 */

import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { FORMAL_PAY_FACTS, computeSamplePayslip } from '@/lib/formalPayCatalog';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
/** A rupee figure that's a whole number of lakh → "4L". */
const lakh = (n: number) => `${n / 100000}L`;

function PayslipExplainerInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();

  const facts = FORMAL_PAY_FACTS;
  const sample = computeSamplePayslip(facts.sampleMonthlyWage);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('payslip.back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('payslip.title')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('payslip.tagline')}
          </Text>
        </View>

        <Text variant="body" tone="secondary" style={{ lineHeight: 22 }}>
          {t('payslip.intro')}
        </Text>

        {/* PF */}
        <ConceptCard emoji="🐖" title={t('payslip.pf_title')}>
          <Text variant="footnote" tone="secondary">
            {t('payslip.pf_what', { pct: facts.pf.employeePct })}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('payslip.pf_get')}
          </Text>
          <Text variant="footnote" weight="medium" style={{ color: theme.status.success }}>
            {t('payslip.pf_note')}
          </Text>
        </ConceptCard>

        {/* ESI */}
        <ConceptCard emoji="🏥" title={t('payslip.esi_title')}>
          <Text variant="footnote" tone="secondary">
            {t('payslip.esi_what', {
              pct: facts.esi.employeePct,
              ceiling: facts.esi.wageCeiling.toLocaleString('en-IN'),
            })}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('payslip.esi_get')}
          </Text>
        </ConceptCard>

        {/* Income tax */}
        <ConceptCard emoji="🧾" title={t('payslip.tax_title')}>
          <Text variant="footnote" tone="secondary">
            {t('payslip.tax_free', { lakh: facts.tax.taxFreeIncome / 100000 })}
          </Text>
          <Text variant="footnote" weight="medium" style={{ color: theme.status.success }}>
            {t('payslip.tax_most')}
          </Text>
          <Text variant="caption" tone="tertiary" style={{ marginTop: 2 }}>
            {t('payslip.tax_slabs_intro')}
          </Text>
          <SlabTable t={t} />
        </ConceptCard>

        {/* Worked example */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            {t('payslip.payslip_title')}
          </Text>
          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text variant="footnote" tone="secondary">
                {t('payslip.payslip_for', { wage: sample.gross.toLocaleString('en-IN') })}
              </Text>
              <PayRow label={t('payslip.payslip_gross')} value={inr(sample.gross)} />
              <PayRow label={t('payslip.payslip_pf')} value={`− ${inr(sample.pf)}`} muted />
              <PayRow label={t('payslip.payslip_esi')} value={`− ${inr(sample.esi)}`} muted />
              <PayRow label={t('payslip.payslip_tax')} value={`− ${inr(sample.tax)}`} muted />
              <View style={{ height: 0.5, backgroundColor: theme.border.default }} />
              <PayRow
                label={t('payslip.payslip_inhand')}
                value={inr(sample.inHand)}
                strong
              />
              <Text variant="caption" tone="tertiary" style={{ lineHeight: 17 }}>
                {t('payslip.payslip_note', {
                  pf: sample.pf.toLocaleString('en-IN'),
                  total: sample.realValue.toLocaleString('en-IN'),
                })}
              </Text>
            </View>
          </Card>
        </View>

        {/* Claiming what's yours — PF withdrawal + ESI usage */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            {t('payslip.claim_section')}
          </Text>

          <ConceptCard emoji="💰" title={t('payslip.pf_claim_title')}>
            <StepList
              steps={[
                t('payslip.pf_claim_1'),
                t('payslip.pf_claim_2'),
                t('payslip.pf_claim_3'),
                t('payslip.pf_claim_4'),
              ]}
            />
            <PortalLink label={t('payslip.pf_portal_label')} url={facts.portals.epfo} />
          </ConceptCard>

          <ConceptCard emoji="🏥" title={t('payslip.esi_claim_title')}>
            <StepList
              steps={[
                t('payslip.esi_claim_1'),
                t('payslip.esi_claim_2'),
                t('payslip.esi_claim_3'),
              ]}
            />
            <PortalLink label={t('payslip.esi_portal_label')} url={facts.portals.esic} />
          </ConceptCard>

          <Text variant="caption" tone="tertiary" style={{ lineHeight: 17 }}>
            {t('payslip.claim_note')}
          </Text>
        </View>

        <Text variant="caption" tone="tertiary" style={{ lineHeight: 17 }}>
          {t('payslip.footer', { fy: facts.effectiveFy })}
        </Text>
      </ScrollView>
    </Screen>
  );
}

/** A numbered list of short steps. */
function StepList({ steps }: { steps: string[] }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: theme.brand.primarySubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="caption" weight="medium" style={{ color: theme.brand.primary }}>
              {i + 1}
            </Text>
          </View>
          <Text variant="footnote" tone="secondary" style={{ flex: 1, lineHeight: 19 }}>
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A tappable pill that opens an official government portal. */
function PortalLink({ label, url }: { label: string; url: string }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        void Linking.openURL(url).catch(() => undefined);
      }}
      accessibilityRole="link"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.pill,
        borderWidth: 0.5,
        borderColor: theme.brand.primary,
        backgroundColor: theme.brand.primarySubtle,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="footnote" weight="medium" style={{ color: theme.brand.primary }}>
        {label}
      </Text>
      <Text style={{ color: theme.brand.primary, fontSize: 13 }}>↗</Text>
    </Pressable>
  );
}

/** A titled concept card (PF / ESI / Tax). */
function ConceptCard({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ fontSize: 20 }}>{emoji}</Text>
          <Text variant="bodyLarge" weight="medium">
            {title}
          </Text>
        </View>
        {children}
      </View>
    </Card>
  );
}

/** The new-regime tax-slab table, built from the catalog. */
function SlabTable({ t }: { t: TFn }) {
  const { theme } = useTheme();
  const slabs = FORMAL_PAY_FACTS.tax.slabs;

  const rows = slabs.map((slab, i) => {
    const lower = i === 0 ? 0 : (slabs[i - 1]!.upTo ?? 0);
    let label: string;
    if (i === 0) {
      label = t('payslip.slab_upto', { x: lakh(slab.upTo!) });
    } else if (slab.upTo === null) {
      label = t('payslip.slab_above', { x: lakh(lower) });
    } else {
      label = `₹${lakh(lower)} – ₹${lakh(slab.upTo)}`;
    }
    const rate = slab.pct === 0 ? t('payslip.slab_no_tax') : `${slab.pct}%`;
    return { key: `${i}`, label, rate, zero: slab.pct === 0 };
  });

  return (
    <View
      style={{
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        overflow: 'hidden',
        marginTop: 4,
      }}
    >
      {rows.map((row, i) => (
        <View
          key={row.key}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            backgroundColor: i % 2 === 0 ? theme.bg.surface : theme.bg.canvas,
          }}
        >
          <Text variant="caption" tone="secondary">
            {row.label}
          </Text>
          <Text
            variant="caption"
            weight="medium"
            style={{ color: row.zero ? theme.status.success : theme.text.primary }}
          >
            {row.rate}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One line of the worked-example payslip. */
function PayRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  const { theme } = useTheme();
  const labelColor = strong
    ? theme.text.primary
    : muted
      ? theme.text.tertiary
      : theme.text.secondary;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text
        variant={strong ? 'bodyLarge' : 'footnote'}
        weight={strong ? 'medium' : 'regular'}
        style={{ color: labelColor }}
      >
        {label}
      </Text>
      <Text
        variant={strong ? 'bodyLarge' : 'footnote'}
        weight="medium"
        style={{ color: muted ? theme.text.tertiary : theme.text.primary }}
      >
        {value}
      </Text>
    </View>
  );
}

export function PayslipExplainerScreen() {
  return (
    <SeekerThemeOverride>
      <PayslipExplainerInner />
    </SeekerThemeOverride>
  );
}
