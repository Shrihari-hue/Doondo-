/**
 * AccountSwitcherSheet — Instagram-style account switcher.
 *
 * Lists every account the user has signed in on this device and lets
 * them tap to switch. A footer CTA opens the "Add Employer account"
 * flow without ejecting the current session.
 *
 * Rendered as a bottom sheet via react-native's built-in <Modal>. Stays
 * presentational: it reads/writes via the auth store but doesn't know
 * about navigation. Callers pass an `onAddEmployer` handler so the
 * caller decides where the add flow lives in their navigator.
 */

import { Modal, Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Tapped the "Add Employer account" footer CTA. */
  onAddEmployer: () => void;
}

export function AccountSwitcherSheet({ visible, onClose, onAddEmployer }: Props) {
  const { theme } = useTheme();
  const { savedAccounts, activeAccountId, switchAccount } = useAuth();

  // Sort: active account first so the user sees "you are here" at the top.
  const ordered = [...savedAccounts].sort((a, b) => {
    if (a.userId === activeAccountId) return -1;
    if (b.userId === activeAccountId) return 1;
    return 0;
  });

  // If the user already has an employer account saved, the footer CTA
  // changes copy to "Sign in to another account" — we don't want to
  // dead-end them at "Add Employer" when they're already there.
  const hasEmployerAccount = savedAccounts.some((a) => a.role === 'employer');

  async function onPick(userId: string) {
    if (userId === activeAccountId) {
      onClose();
      return;
    }
    haptic('selection');
    onClose();
    // Defer the actual switch a tick so the sheet closes cleanly before
    // the RootNavigator swaps to the bootstrapping splash.
    setTimeout(() => {
      void switchAccount(userId);
    }, 50);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop — tap to dismiss */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Sheet body — stops bubbling so taps inside don't dismiss */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.bg.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing['2xl'],
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          {/* Grabber */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border.default,
              marginBottom: spacing.lg,
            }}
          />

          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
              }}
            >
              SWITCH ACCOUNT
            </Text>
          </View>

          {/* Account rows */}
          <View>
            {ordered.map((account) => {
              const isActive = account.userId === activeAccountId;
              const displayName =
                account.role === 'employer' && account.companyName
                  ? account.companyName
                  : account.name;
              return (
                <Pressable
                  key={account.userId}
                  onPress={() => void onPick(account.userId)}
                  android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: spacing.xl,
                      paddingVertical: spacing.md,
                      gap: spacing.md,
                    }}
                  >
                    <Avatar
                      name={displayName}
                      photoUrl={account.photoUrl}
                      size={44}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '600',
                          color: theme.text.primary,
                        }}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.text.tertiary,
                          marginTop: 2,
                        }}
                      >
                        {roleLabel(account.role)}
                      </Text>
                    </View>
                    {isActive ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.brand.hero,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}
                        >
                          ✓
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Divider */}
          <View
            style={{
              height: 0.5,
              backgroundColor: theme.border.subtle,
              marginVertical: spacing.sm,
              marginHorizontal: spacing.xl,
            }}
          />

          {/* Footer CTA */}
          <Pressable
            onPress={() => {
              haptic('selection');
              onClose();
              // Same defer trick — let the sheet finish closing before
              // we push the signup screen on top.
              setTimeout(onAddEmployer, 50);
            }}
            android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: theme.border.default,
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, color: theme.text.secondary }}>+</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: theme.brand.hero,
                  }}
                >
                  {hasEmployerAccount
                    ? 'Add another account'
                    : 'Add Employer account'}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.text.tertiary,
                    marginTop: 2,
                  }}
                >
                  {hasEmployerAccount
                    ? 'Sign in or sign up — keeps this account active'
                    : 'Post jobs and hire workers'}
                </Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function roleLabel(role: 'seeker' | 'employer' | 'admin'): string {
  if (role === 'employer') return 'Employer · Hiring';
  if (role === 'seeker') return 'Seeker · Looking for work';
  return 'Admin';
}
