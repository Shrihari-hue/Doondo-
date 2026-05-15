/**
 * JobAlertsScreen — list of the seeker's saved job alerts.
 *
 * Each row shows: name, summary of the criteria, toggle to enable/disable,
 * counter for how many jobs have matched. Tap a row to edit. A floating
 * "+ Add alert" CTA opens the form for a new one.
 *
 * When an employer posts a job that matches an enabled alert, the backend
 * fires a targeted push + in-app notification — separate from the
 * proximity-based "new job near you" blast. So workers who care about
 * very specific roles (e.g. "Welder in BTM, urgent only") get pinged
 * exactly when one shows up.
 */

import { Alert, FlatList, Pressable, RefreshControl, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { alertsApi, type PublicJobAlert } from '@/api/alerts.api';
import { ApiError } from '@/api/errors';
import { suggestedAlertFromUser, type SuggestedAlert } from '@/lib/workHistory';
import type { AppStackParamList } from '@/navigation/types';
import type { JobType } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function JobAlertsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const suggestion = user ? suggestedAlertFromUser(user) : null;

  const query = useQuery({
    queryKey: ['alerts', 'me'],
    queryFn: () => alertsApi.list(),
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      alertsApi.update(input.id, { enabled: input.enabled }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['alerts', 'me'] });
      const prev = queryClient.getQueryData<{ alerts: PublicJobAlert[] }>([
        'alerts',
        'me',
      ]);
      if (prev) {
        queryClient.setQueryData(['alerts', 'me'], {
          alerts: prev.alerts.map((a) =>
            a.id === input.id ? { ...a, enabled: input.enabled } : a,
          ),
        });
      }
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['alerts', 'me'], ctx.prev);
      haptic('error');
      const msg = err instanceof ApiError ? err.message : 'Try again.';
      Alert.alert("Couldn't update alert", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => alertsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'me'] });
      haptic('warning');
    },
    onError: (err) => {
      haptic('error');
      const msg = err instanceof ApiError ? err.message : 'Try again.';
      Alert.alert("Couldn't delete alert", msg);
    },
  });

  const onAdd = () => {
    haptic('selection');
    navigation.navigate('JobAlertForm');
  };

  const onEdit = (a: PublicJobAlert) => {
    haptic('selection');
    navigation.navigate('JobAlertForm', { alertId: a.id });
  };

  const onDelete = (a: PublicJobAlert) => {
    Alert.alert(
      'Delete alert?',
      `"${a.name}" will be removed. You won't get notifications for it anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(a.id),
        },
      ],
    );
  };

  const alerts = query.data?.alerts ?? [];

  return (
    <Screen edges={[]}>
      {/* Hero */}
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl + spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
          >
            Job alerts
          </Text>
          <Pressable onPress={onAdd} hitSlop={10}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
              + Add
            </Text>
          </Pressable>
        </View>
        <Text
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          Save criteria for the kinds of work you want. We&apos;ll ping you the
          moment a new job matches — no scrolling required.
        </Text>
      </LinearGradient>

      {/* List */}
      <View style={{ flex: 1, paddingTop: spacing.lg }}>
        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : query.isError ? (
          <EmptyState
            title="Couldn't load alerts"
            message="Check your connection and try again."
            cta={{
              label: 'Retry',
              onPress: () => {
                haptic('selection');
                void query.refetch();
              },
            }}
          />
        ) : alerts.length === 0 ? (
          <View
            style={{
              flex: 1,
              paddingHorizontal: spacing.xl,
              gap: spacing.lg,
            }}
          >
            {suggestion ? (
              <SuggestionCard
                suggestion={suggestion}
                onAccept={() => {
                  haptic('selection');
                  navigation.navigate('JobAlertForm', { suggestion });
                }}
              />
            ) : null}
            <EmptyState
              glyph="🔔"
              eyebrow="NO ALERTS YET"
              title={suggestion ? 'Or build one yourself' : 'Create your first alert'}
              message={
                suggestion
                  ? 'Save your own criteria — keyword, city, job type, urgent only.'
                  : "Tell us what kind of work you want and we'll send a push when a matching job is posted."
              }
              cta={{ label: 'Add alert', onPress: onAdd }}
            />
          </View>
        ) : (
          <FlatList
            data={alerts}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: insets.bottom + spacing['5xl'],
              gap: spacing.sm,
            }}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={theme.brand.hero}
              />
            }
            renderItem={({ item }) => (
              <AlertRow
                alert={item}
                onToggle={(enabled) =>
                  toggleMutation.mutate({ id: item.id, enabled })
                }
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onToggle,
  onEdit,
  onDelete,
}: {
  alert: PublicJobAlert;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      style={({ pressed }) => ({
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {alert.name}
          </Text>
          <Text
            style={{ fontSize: 12, color: theme.text.secondary }}
            numberOfLines={2}
          >
            {summariseCriteria(alert)}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              marginTop: 2,
            }}
          >
            <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
              {alert.matchCount === 0
                ? 'No matches yet'
                : `${alert.matchCount} match${alert.matchCount === 1 ? '' : 'es'}`}
            </Text>
            {alert.lastMatchedAt ? (
              <>
                <Text style={{ fontSize: 11, color: theme.text.tertiary }}>·</Text>
                <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                  Last match {formatRelative(alert.lastMatchedAt)}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <Switch
          value={alert.enabled}
          onValueChange={(v) => {
            haptic('selection');
            onToggle(v);
          }}
          trackColor={{ true: blue[500], false: theme.border.default }}
          thumbColor="#FFFFFF"
        />
      </View>
    </Pressable>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
}: {
  suggestion: SuggestedAlert;
  onAccept: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#FEE2E2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16 }}>✨</Text>
        </View>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.4,
            color: theme.text.tertiary,
            flex: 1,
          }}
        >
          SUGGESTED FOR YOU
        </Text>
      </View>
      <Text
        style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}
        numberOfLines={1}
      >
        {suggestion.name}
      </Text>
      <Text
        style={{ fontSize: 13, lineHeight: 19, color: theme.text.secondary }}
      >
        Based on your resume. Tap below and tweak before saving — we&apos;ll
        ping you when a matching job is posted.
      </Text>
      <Pressable
        onPress={onAccept}
        style={({ pressed }) => ({
          marginTop: 4,
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radii.pill,
          backgroundColor: blue[600],
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
          Use this suggestion
        </Text>
      </Pressable>
    </View>
  );
}

function summariseCriteria(a: PublicJobAlert): string {
  const parts: string[] = [];
  if (a.query) parts.push(`"${a.query}"`);
  if (a.jobTypes.length > 0) {
    parts.push(a.jobTypes.map(prettyJobType).join(' · '));
  }
  if (a.city) parts.push(a.city);
  if (a.urgentOnly) parts.push('urgent only');
  if (parts.length === 0) return 'Any job, anywhere';
  return parts.join(' · ');
}

function prettyJobType(t: JobType): string {
  switch (t) {
    case 'full_time':
      return 'Full-time';
    case 'part_time':
      return 'Part-time';
    case 'gig':
      return 'Gig';
    case 'shift':
      return 'Shift';
    case 'contract':
      return 'Contract';
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function JobAlertsScreen() {
  return (
    <SeekerThemeOverride>
      <JobAlertsInner />
    </SeekerThemeOverride>
  );
}
