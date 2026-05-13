/**
 * DownloadCenterScreen — list of jobs the seeker has saved offline.
 *
 * Pure local — never touches the network. Reads from the SQLite cache
 * (lib/downloads.ts). Tapping a row opens the job detail; that screen
 * will fall back to the offline cache when the network detail call fails
 * (wired in JobDetailScreen).
 *
 * "Save for offline" itself lives on the JobDetail screen as a small
 * download icon — this screen is just the index of what's been saved.
 */

import { Alert, FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useDownloads, removeJobOffline } from '@/lib/downloads';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function DownloadCenterInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { items, loading, reload } = useDownloads();

  function openJob(j: PublicJob) {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId: j.id });
  }

  function removeOne(j: PublicJob) {
    haptic('warning');
    Alert.alert('Remove from downloads?', `"${j.title}" will no longer be available offline.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeJobOffline(j.id);
          await reload();
        },
      },
    ]);
  }

  return (
    <Screen edges={[]}>
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
        </Pressable>
        <Text
          style={{ fontSize: 22, fontWeight: '700', color: theme.text.primary, flex: 1 }}
        >
          Download Center
        </Text>
      </View>
      <Text
        style={{
          fontSize: 13,
          color: theme.text.secondary,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        Jobs you've saved for offline viewing. Tap one to open it even
        without a signal.
      </Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          glyph="📥"
          eyebrow="NOTHING DOWNLOADED"
          title="No offline jobs yet"
          message="Open any job and tap the download icon to save it for offline."
          cta={{
            label: 'Browse jobs',
            onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
          }}
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.sm,
          }}
          data={items}
          keyExtractor={(i) => i.job.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => openJob(item.job)} onLongPress={() => removeOne(item.job)}>
              <View
                style={{
                  padding: spacing.md,
                  borderRadius: radii.lg,
                  backgroundColor: theme.bg.surface,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: theme.brand.heroSubtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 18 }}>📥</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
                    numberOfLines={1}
                  >
                    {item.job.title}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: theme.text.secondary }}
                    numberOfLines={1}
                  >
                    {item.job.employer?.companyName ??
                      item.job.employer?.name ??
                      'Doondo Employer'}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                    Saved {formatRelative(item.cachedAt)}
                  </Text>
                </View>
                <Pressable onPress={() => removeOne(item.job)} hitSlop={8}>
                  <Text style={{ fontSize: 18, color: theme.text.tertiary }}>×</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function DownloadCenterScreen() {
  return (
    <SeekerThemeOverride>
      <DownloadCenterInner />
    </SeekerThemeOverride>
  );
}
