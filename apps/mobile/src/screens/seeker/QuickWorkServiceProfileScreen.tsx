/**
 * QuickWorkServiceProfileScreen — the worker's persistent Quick Work
 * service opt-in. seeker-plan.md §8.1.
 *
 * Eligibility is service-level, not category-level (employer-plan.md
 * §11.1.1 / seeker-plan.md §11) — picking "Home & Property Services"
 * broadly does nothing; the worker must tick specific services. Uses the
 * exact same shared catalog the employer's request wizard reads from
 * (`services.api.ts`) — no second service list.
 */

import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, Card, TextField, Pill, LoadingSpinner, ErrorPanel, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { servicesApi } from '@/api/services.api';
import { workerServiceProfileApi } from '@/api/workerServiceProfile.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function QuickWorkServiceProfileScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const profilesQuery = useQuery({
    queryKey: ['quick-work-services', 'mine'],
    queryFn: () => workerServiceProfileApi.listMine(),
  });

  // Hydrate local selection once, from the server's answer.
  const selectedIds =
    selected ?? new Set((profilesQuery.data ?? []).map((p) => p.serviceId));
  const selectedServices = profilesQuery.data ?? [];

  const categoriesQuery = useQuery({
    queryKey: ['service-categories'],
    queryFn: () => servicesApi.listCategories(),
    staleTime: 5 * 60_000,
  });

  const servicesQuery = useQuery({
    queryKey: ['services', activeCategoryId, search],
    queryFn: () => servicesApi.listServices({ categoryId: activeCategoryId ?? undefined, q: search || undefined }),
    enabled: activeCategoryId != null || search.length > 0,
    staleTime: 60_000,
  });

  const activeCategory = useMemo(
    () => (categoriesQuery.data ?? []).find((c) => c.id === activeCategoryId) ?? null,
    [categoriesQuery.data, activeCategoryId],
  );

  function toggle(serviceId: string) {
    haptic('selection');
    const next = new Set(selectedIds);
    if (next.has(serviceId)) next.delete(serviceId);
    else next.add(serviceId);
    setSelected(next);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await workerServiceProfileApi.setMine(Array.from(selectedIds));
      await queryClient.invalidateQueries({ queryKey: ['quick-work-services', 'mine'] });
      setDirty(false);
      haptic('success');
      Alert.alert('Saved', "You'll now receive Quick Work offers for these services.");
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  const browsing = activeCategoryId != null || search.length > 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <Pressable
          onPress={() => {
            if (browsing) {
              setActiveCategoryId(null);
              setSearch('');
            } else {
              navigation.goBack();
            }
          }}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={22} color={theme.text.primary} />
        </Pressable>
        <Text variant="bodyLarge" weight="semibold">
          {browsing ? activeCategory?.name ?? 'Search' : 'Quick Work services'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'], gap: spacing.md }}>
        {!browsing ? (
          <>
            <Text variant="footnote" tone="secondary">
              Select the exact services you can take on-demand — selecting a whole category isn't enough, pick specific services.
            </Text>

            {selectedServices.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {selectedServices.map((p) => (
                  <Pressable key={p.serviceId} onPress={() => toggle(p.serviceId)}>
                    <Pill label={`${p.service?.name ?? 'Service'}  ✕`} tone="primary" />
                  </Pressable>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="zap"
                tone="primary"
                title="No Quick Work services yet"
                message="You won't receive any Quick Work offers until you add at least one."
              />
            )}

            <TextField placeholder="Search any service…" value={search} onChangeText={setSearch} />

            <Text variant="footnote" tone="tertiary" style={{ marginTop: spacing.sm }}>
              Or browse by category
            </Text>

            {categoriesQuery.isLoading ? (
              <LoadingSpinner fullScreen />
            ) : categoriesQuery.isError ? (
              <ErrorPanel error={categoriesQuery.error} onRetry={() => void categoriesQuery.refetch()} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {(categoriesQuery.data ?? []).map((cat) => (
                  <Pressable key={cat.id} onPress={() => setActiveCategoryId(cat.id)} style={{ width: '31%' }}>
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
            )}
          </>
        ) : (
          <>
            {!activeCategoryId ? (
              <TextField placeholder="Search any service…" value={search} onChangeText={setSearch} autoFocus />
            ) : null}
            {servicesQuery.isLoading ? (
              <LoadingSpinner fullScreen />
            ) : servicesQuery.isError ? (
              <ErrorPanel error={servicesQuery.error} onRetry={() => void servicesQuery.refetch()} />
            ) : (servicesQuery.data ?? []).length === 0 ? (
              <Text tone="secondary" style={{ textAlign: 'center', paddingVertical: spacing.xl }}>
                No services found.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {(servicesQuery.data ?? []).map((svc) => {
                  const isSelected = selectedIds.has(svc.id);
                  return (
                    <Pressable key={svc.id} onPress={() => toggle(svc.id)}>
                      <Card
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderColor: isSelected ? theme.brand.primary : theme.border.default,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text weight="medium">{svc.name}</Text>
                          {svc.requiresVerification || svc.requiresLicense || svc.requiresQualification ? (
                            <Text variant="footnote" tone="tertiary" style={{ marginTop: 2 }}>
                              Requires verification
                            </Text>
                          ) : null}
                        </View>
                        <Feather
                          name={isSelected ? 'check-circle' : 'circle'}
                          size={20}
                          color={isSelected ? theme.brand.primary : theme.text.tertiary}
                        />
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {dirty ? (
        <View style={{ padding: spacing.xl }}>
          <Button label={saving ? 'Saving…' : `Save (${selectedIds.size} selected)`} onPress={() => void save()} disabled={saving} />
        </View>
      ) : null}
    </Screen>
  );
}
