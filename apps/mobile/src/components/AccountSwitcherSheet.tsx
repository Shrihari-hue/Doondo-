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

import { Alert, Modal, Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
// Import siblings by direct path, NOT via `@/components`. The barrel
// re-exports THIS file, so importing back through it creates a require
// cycle (Metro warns about it; it can also yield undefined sibling
// exports when the cycle resolves in an unlucky order). Direct paths
// have zero runtime difference.
import { Text } from './Text';
import { Avatar } from './Avatar';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { useOtherAccountsActivity } from '@/hooks/useOtherAccountsActivity';
import type { SavedAccount } from '@/stores/auth.store';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Tapped the "Add Employer account" footer CTA. */
  onAddEmployer: () => void;
}

export function AccountSwitcherSheet({ visible, onClose, onAddEmployer }: Props) {
  const { theme } = useTheme();
  const t = useTranslate();
  const { savedAccounts, activeAccountId, switchAccount, removeAccount } =
    useAuth();
  // Per-account "things waiting" counts — drives the row badges so the
  // worker can see their other account has activity before switching.
  const { byId: activityById } = useOtherAccountsActivity();

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

  function onPick(userId: string) {
    if (userId === activeAccountId) {
      onClose();
      return;
    }
    haptic('selection');
    onClose();
    // Defer the actual switch a tick so the sheet closes cleanly before
    // the RootNavigator swaps to the bootstrapping splash.
    setTimeout(() => {
      void (async () => {
        const ok = await switchAccount(userId);
        if (!ok) {
          // The switch failed — the store has restored the previous
          // session, so this sheet's host screen is still mounted and
          // can surface the error. (On success the app re-routes and
          // this component unmounts before we'd get here.)
          haptic('error');
          Alert.alert(
            t('account_switcher.switch_failed_title'),
            t('account_switcher.switch_failed_body'),
          );
        }
      })();
    }, 50);
  }

  /**
   * Long-press a saved (non-active) account to remove it from this
   * device — important on shared phones, where a worker doesn't want a
   * colleague's account one tap away. The active account isn't
   * removable here; that's what Sign out is for.
   */
  function onRequestRemove(account: SavedAccount) {
    if (account.userId === activeAccountId) return;
    haptic('warning');
    const displayName =
      account.role === 'employer' && account.companyName
        ? account.companyName
        : account.name;
    Alert.alert(
      t('account_switcher.remove_title'),
      t('account_switcher.remove_body', { name: displayName }),
      [
        { text: t('account_switcher.remove_cancel'), style: 'cancel' },
        {
          text: t('account_switcher.remove_confirm'),
          style: 'destructive',
          onPress: () => void removeAccount(account.userId),
        },
      ],
    );
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
              {t('account_switcher.title')}
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
              const activityCount = isActive
                ? 0
                : (activityById[account.userId]?.total ?? 0);
              return (
                <Pressable
                  key={account.userId}
                  onPress={() => onPick(account.userId)}
                  onLongPress={() => onRequestRemove(account)}
                  delayLongPress={350}
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
                        {roleLabel(account.role, t)}
                      </Text>
                    </View>
                    {isActive ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.brand.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{ color: theme.text.onBrand, fontSize: 13, fontWeight: '700' }}
                        >
                          ✓
                        </Text>
                      </View>
                    ) : activityCount > 0 ? (
                      // "Things waiting" on this other account — unread
                      // chats + pending offers / new applicants.
                      <View
                        accessibilityLabel={t('account_switcher.updates_a11y', {
                          count: activityCount,
                        })}
                        style={{
                          minWidth: 22,
                          height: 22,
                          borderRadius: 11,
                          paddingHorizontal: 6,
                          backgroundColor: theme.status.danger,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{ color: theme.text.onBrand, fontSize: 12, fontWeight: '800' }}
                        >
                          {activityCount > 99 ? '99+' : activityCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Discoverability hint for the long-press remove gesture. */}
          <Text
            style={{
              fontSize: 11,
              color: theme.text.tertiary,
              paddingHorizontal: spacing.xl,
              marginTop: spacing.xs,
            }}
          >
            {t('account_switcher.remove_hint')}
          </Text>

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
                    color: theme.brand.primary,
                  }}
                >
                  {hasEmployerAccount
                    ? t('account_switcher.add_another')
                    : t('account_switcher.add_employer')}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.text.tertiary,
                    marginTop: 2,
                  }}
                >
                  {hasEmployerAccount
                    ? t('account_switcher.add_another_hint')
                    : t('account_switcher.add_employer_hint')}
                </Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function roleLabel(
  role: 'seeker' | 'employer' | 'admin',
  t: (key: string) => string,
): string {
  if (role === 'employer') return t('account_switcher.role_employer');
  if (role === 'seeker') return t('account_switcher.role_seeker');
  return t('account_switcher.role_admin');
}
