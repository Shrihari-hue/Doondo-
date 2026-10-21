/**
 * TradeToolsScreen — small, trade-specific helpers inside Doondo
 * ("micro-apps"): calculators and checklists for the worker's own trades.
 * Driven entirely by lib/tradeTools config.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { findTrade, prettifySkill, TRADES } from '@/lib/trades';
import { toolsForTrade, type CalcTool, type ChecklistTool } from '@/lib/tradeTools';
import { getSecure, setSecure } from '@/lib/secureStore';

function Calc({ tool }: { tool: CalcTool }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(tool.inputs.map((i) => [i.key, String(i.default)])));
  const nums = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v) || 0]));
  const rows = tool.compute(nums);
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyLarge" weight="semibold">{t(`trade_tools.${tool.id}.title`)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {tool.inputs.map((i) => (
            <View key={i.key} style={{ width: '47%', gap: 2 }}>
              <Text variant="caption" tone="secondary">{t(`trade_tools.${tool.id}.in_${i.key}`)}{i.unit ? ` (${i.unit})` : ''}</Text>
              <TextInput value={vals[i.key]} keyboardType="decimal-pad"
                onChangeText={(v) => setVals((s) => ({ ...s, [i.key]: v.replace(/[^0-9.]/g, '').slice(0, 9) }))}
                style={{ borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 8, color: theme.text.primary }} />
            </View>
          ))}
        </View>
        <View style={{ backgroundColor: theme.bg.muted, borderRadius: radii.md, padding: spacing.md, gap: 4 }}>
          {rows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="footnote" tone="secondary">{t(`trade_tools.${tool.id}.out_${k}`)}</Text>
              <Text variant="footnote" weight="semibold">{v}</Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="tertiary">{t('trade_tools.estimate_note')}</Text>
      </View>
    </Card>
  );
}

function Checklist({ tool }: { tool: ChecklistTool }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const today = new Date().toISOString().slice(0, 10);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    void getSecure('tradeChecklists').then((raw) => {
      const m = raw ? (JSON.parse(raw) as Record<string, { day: string; done: string[] }>) : {};
      const e = m[tool.id];
      if (e && e.day === today) setDone(e.done);
    }).catch(() => undefined);
  }, [tool.id, today]);
  const toggle = (item: string) => {
    haptic('selection');
    setDone((prev) => {
      const next = prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item];
      void getSecure('tradeChecklists').then((raw) => {
        const m = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        m[tool.id] = { day: today, done: next };
        return setSecure('tradeChecklists', JSON.stringify(m));
      }).catch(() => undefined);
      return next;
    });
  };
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyLarge" weight="semibold">{t(`trade_tools.${tool.id}.title`)} · {done.length}/{tool.items.length}</Text>
        {tool.items.map((item) => {
          const on = done.includes(item);
          return (
            <Pressable key={item} onPress={() => toggle(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? theme.status.success : theme.border.default,
                backgroundColor: on ? theme.status.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Text style={{ color: '#FFFFFF', fontSize: 12 }}>✓</Text> : null}
              </View>
              <Text variant="body" tone={on ? 'secondary' : 'primary'}>{t(`trade_tools.${tool.id}.${item}`)}</Text>
            </Pressable>
          );
        })}
        <Text variant="caption" tone="tertiary">{t('trade_tools.checklist_note')}</Text>
      </View>
    </Card>
  );
}

export function TradeToolsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const { user } = useAuth();
  const myTrades = useMemo(() => {
    const mine = (user?.skills ?? []).filter((s) => findTrade(s));
    return mine.length > 0 ? mine : TRADES.slice(0, 6).map((x) => x.slug);
  }, [user?.skills]);
  const [trade, setTrade] = useState(myTrades[0]!);
  const tools = toolsForTrade(trade);

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text variant="title" weight="semibold">{t('trade_tools.title')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {myTrades.map((s) => (
            <Pressable key={s} onPress={() => { haptic('selection'); setTrade(s); }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5,
                borderColor: s === trade ? theme.brand.hero : theme.border.default, backgroundColor: s === trade ? theme.brand.heroSubtle : 'transparent' }}>
              <Text variant="footnote" weight="medium" style={{ color: s === trade ? theme.brand.hero : theme.text.secondary }}>
                {findTrade(s)?.emoji ?? '🛠️'} {prettifySkill(s)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {tools.map((tool) => (tool.kind === 'calc' ? <Calc key={`${trade}-${tool.id}`} tool={tool} /> : <Checklist key={`${trade}-${tool.id}`} tool={tool} />))}
      </ScrollView>
    </Screen>
  );
}
