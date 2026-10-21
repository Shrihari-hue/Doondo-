/**
 * MyTasksSection — tasks employers have assigned to me, on "My Job".
 * Tap Start / Done to move a task along; the employer sees it instantly.
 */
import { Alert, Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing, radii } from '@doondo/tokens';
import { Text, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { workforceApi, type TaskStatus } from '@/api/workforce.api';

export function MyTasksSection() {
  const { theme } = useTheme();
  const t = useTranslate();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['workforce', 'my-tasks'], queryFn: workforceApi.myTasks, staleTime: 60_000 });
  const mut = useMutation({
    mutationFn: (v: { id: string; status: TaskStatus }) => workforceApi.updateMyTask(v.id, v.status),
    onSuccess: () => { haptic('success'); void qc.invalidateQueries({ queryKey: ['workforce', 'my-tasks'] }); },
    onError: () => Alert.alert(t('my_tasks.save_failed')),
  });

  const tasks = query.data ?? [];
  if (tasks.length === 0) return null;
  const open = tasks.filter((x) => x.status !== 'completed');
  const done = tasks.filter((x) => x.status === 'completed');

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" tone="secondary" weight="semibold">
        {t('my_tasks.title', { n: open.length })}
      </Text>
      {[...open, ...done].map((task) => {
        const isDone = task.status === 'completed';
        const next: TaskStatus | null = task.status === 'pending' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : null;
        return (
          <Card key={task.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="medium" numberOfLines={2}
                  style={isDone ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>
                  {task.title}
                </Text>
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {[
                    task.jobTitle,
                    task.location,
                    task.dueDate
                      ? t('my_tasks.due', { date: new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })
                      : null,
                    task.priority === 'high' ? t('my_tasks.urgent') : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {next ? (
                <Pressable
                  disabled={mut.isPending}
                  onPress={() => mut.mutate({ id: task.id, status: next })}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md,
                    backgroundColor: theme.brand.hero }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                    {next === 'in_progress' ? t('my_tasks.start') : t('my_tasks.done')}
                  </Text>
                </Pressable>
              ) : (
                <Text variant="caption" tone="success">{t('my_tasks.completed')}</Text>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
