/**
 * WorkforceScreen — placeholder for Phase 4+ team management.
 *
 * Currently shows a friendly "coming soon" message. Phase 4 will use
 * this tab to track active hires, attendance, and recurring workers.
 */

import { ScrollView, View } from 'react-native';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Card } from '@/components';
import { useTranslate } from '@/i18n/useTranslate';

export function WorkforceScreen() {
  const t = useTranslate();
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
            {t('employer.workforce.title')}
          </Text>
        </View>
        <Card>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            {t('employer.workforce.coming_soon_eyebrow')}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.sm }}>
            {t('employer.workforce.coming_soon_body')}
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
