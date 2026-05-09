import { ScrollView, View } from 'react-native';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, Card, Pill } from '@/components';
import { useAuth } from '@/hooks/useAuth';

/**
 * HomeScreen — placeholder for employer accounts only.
 *
 * Seekers route to the SeekerTabNavigator (Phase 2 / done). Employers
 * still land here until Phase 3 ships the EmployerTabNavigator with
 * post-job, applicants, and hire-management screens.
 */
export function HomeScreen() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <Screen>
        <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
          <Text variant="body" tone="secondary">
            Loading your account…
          </Text>
        </View>
      </Screen>
    );
  }

  const greeting = user.role === 'employer' ? 'Welcome' : 'Hi';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {user.role === 'employer' ? 'EMPLOYER' : 'SEEKER'}
          </Text>
          <Text variant="display" weight="medium" display>
            {greeting}, {user.name}.
          </Text>
        </View>

        <Card premium={user.isVerified}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 2 }}>
              <Text variant="bodyLarge" weight="medium">
                {user.email}
              </Text>
              <Text variant="footnote" tone="secondary">
                Account active
              </Text>
            </View>
            {user.isVerified ? (
              <Pill label="Verified" tone="premium" leading="★" />
            ) : (
              <Pill label="Unverified" tone="warning" />
            )}
          </View>
        </Card>

        <Card>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            COMING SOON
          </Text>
          <Text variant="body" style={{ marginTop: spacing.sm }}>
            The full employer dashboard — post jobs, review applicants,
            schedule interviews, and manage hires — is Phase 3 of the
            Doondo rebuild. Your account is ready for it; the screens
            land as they ship.
          </Text>
        </Card>

        <Button label="Sign out" variant="secondary" onPress={() => void logout()} />
      </ScrollView>
    </Screen>
  );
}
