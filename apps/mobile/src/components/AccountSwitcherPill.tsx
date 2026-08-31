/**
 * AccountSwitcherPill — the Instagram-style pill at the top of every
 * Profile screen. One component, three modes:
 *
 *   1. Single account on device
 *      Pill shows the active user's name + chevron. Tap → "Add Employer
 *      account" signup (or "Add Seeker account" if the active role is
 *      employer). Long-press has no special behaviour.
 *
 *   2. Exactly two accounts (the typical dual-role case)
 *      Pill becomes a one-tap quick-switch: it shows the OTHER account's
 *      avatar + name + a small "↺" glyph + a role badge (👷 worker /
 *      🏢 business). A single tap flips to that account immediately —
 *      no bottom sheet. Long-press still opens the full sheet so the
 *      user can remove, sign out, or add a third account.
 *
 *   3. Three or more accounts
 *      Pill behaves like single-account mode (own name + chevron). Tap
 *      opens the full sheet. We do not pick a "primary other" because
 *      there isn't one.
 *
 * Why this matters:
 *   - The pill exists today, but with two accounts it still requires
 *     two taps (open sheet → pick account). Dual-role is the common
 *     case for this feature, so we collapse it to a single tap.
 *   - With a single tap, switching becomes a delight instead of a chore.
 *   - The role badge gives the user visual confidence they're about to
 *     land on the *correct* side, before they tap.
 *
 * This component intentionally renders ABSOLUTE-positioned by default
 * (matches the existing seeker profile placement). Pass `style` to
 * override; the seeker profile sets `position: 'absolute'` over the
 * blue hero, the employer profile renders it inline at the top.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle, type StyleProp } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { AccountSwitcherSheet } from './AccountSwitcherSheet';
import { useAuth } from '@/hooks/useAuth';
import { useOtherAccountsActivity } from '@/hooks/useOtherAccountsActivity';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import type { SavedAccount } from '@/stores/auth.store';
import type { UserRole } from '@/api/types';

interface Props {
  /**
   * What the pill does when the user has only one account on this
   * device. Typically navigates to the AddAccountSignup screen, asking
   * the user to add the OPPOSITE role.
   */
  onAddAccount: () => void;
  /**
   * What the pill does when the user has 3+ accounts — for those, we
   * fall back to opening the full switcher sheet because there's no
   * single "other" to flip to.
   */
  onOpenSheet?: () => void;
  /**
   * Visual variant — onDark renders white text/glass background for
   * sitting over a gradient hero (seeker profile). 'light' is the
   * default and reads on a plain surface.
   */
  variant?: 'light' | 'onDark';
  /** Outer style override (positioning, margin). */
  style?: StyleProp<ViewStyle>;
}

export function AccountSwitcherPill({
  onAddAccount,
  onOpenSheet,
  variant = 'light',
  style,
}: Props) {
  const t = useTranslate();
  const { user, savedAccounts, activeAccountId, switchAccount } = useAuth();
  const { totalOther: otherAccountActivity, byId: activityById } =
    useOtherAccountsActivity();

  const [sheetVisible, setSheetVisible] = useState(false);

  if (!user) return null;

  // Find the "other" account when there are exactly two on this device.
  // null otherwise — collapsing the conditional logic up here keeps the
  // render path below clean.
  const otherAccount: SavedAccount | null =
    savedAccounts.length === 2
      ? savedAccounts.find((a) => a.userId !== activeAccountId) ?? null
      : null;

  const onPress = () => {
    haptic('selection');
    if (otherAccount) {
      // One-tap quick switch. The boot splash handles the in-flight
      // "Switching to ..." state; we just kick it off.
      void switchAccount(otherAccount.userId);
      return;
    }
    if (savedAccounts.length > 1 && onOpenSheet) {
      // 3+ accounts — open the full sheet via the caller's handler.
      onOpenSheet();
      return;
    }
    if (savedAccounts.length > 1) {
      setSheetVisible(true);
      return;
    }
    // Only one account on device — go add the opposite role.
    onAddAccount();
  };

  const onLongPress = () => {
    // Long-press always opens the full sheet, regardless of count. This
    // is how the user reaches the "remove account" / "add a third"
    // affordances when the pill is in one-tap mode.
    if (savedAccounts.length <= 1) {
      onAddAccount();
      return;
    }
    haptic('selection');
    if (onOpenSheet) {
      onOpenSheet();
    } else {
      setSheetVisible(true);
    }
  };

  const palette = variant === 'onDark'
    ? {
        bg: 'rgba(255,255,255,0.18)',
        border: 'rgba(255,255,255,0.32)',
        text: '#FFFFFF',
        subtle: 'rgba(255,255,255,0.7)',
      }
    : {
        bg: 'rgba(15, 23, 42, 0.06)',
        border: 'transparent',
        text: undefined,
        subtle: undefined,
      };

  return (
    <>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={
          otherAccount
            ? t('account_pill.switch_to', {
                name: displayNameFor(otherAccount),
              })
            : t('account_pill.open_switcher')
        }
        hitSlop={8}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 6,
            paddingRight: 12,
            paddingVertical: 5,
            borderRadius: radii.pill,
            backgroundColor: palette.bg,
            borderWidth: palette.border === 'transparent' ? 0 : 0.5,
            borderColor: palette.border,
            opacity: pressed ? 0.75 : 1,
            maxWidth: '78%',
          },
          style as ViewStyle,
        ]}
      >
        {otherAccount ? (
          <QuickSwitchContent
            other={otherAccount}
            pendingCount={activityById[otherAccount.userId]?.total ?? 0}
            textColor={palette.text}
            subtleColor={palette.subtle}
          />
        ) : (
          <DefaultContent
            displayName={displayNameFor(activeFor(savedAccounts, activeAccountId, user))}
            avatarName={user.name}
            avatarPhoto={user.photoUrl}
            otherActivity={otherAccountActivity}
            textColor={palette.text}
          />
        )}
      </Pressable>

      {/* Local sheet — only used when the caller didn't pass onOpenSheet.
          The seeker/employer profile screens own their own sheet for
          consistency with the "Add account" CTA in the footer, so they
          pass onOpenSheet and this component never renders the sheet
          itself in those cases. */}
      <AccountSwitcherSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onAddEmployer={onAddAccount}
      />
    </>
  );
}

// ─── Sub-renderers ──────────────────────────────────────────────────────

interface QuickSwitchContentProps {
  other: SavedAccount;
  pendingCount: number;
  textColor: string | undefined;
  subtleColor: string | undefined;
}

/**
 * The dual-role one-tap mode. Visually distinct from the default pill:
 *   - Other account's avatar (not your own)
 *   - Other account's name
 *   - A role glyph after the name (👷 worker / 🏢 business)
 *   - A subtle "↺" hint so the user understands tapping flips accounts
 *   - Pending-count badge if there's activity waiting on the other side
 */
function QuickSwitchContent({
  other,
  pendingCount,
  textColor,
  subtleColor,
}: QuickSwitchContentProps): ReactNode {
  const { theme } = useTheme();
  return (
    <>
      <View>
        <Avatar
          name={displayNameFor(other)}
          photoUrl={other.photoUrl}
          size={22}
        />
        {pendingCount > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              paddingHorizontal: 3,
              backgroundColor: theme.status.danger,
              borderWidth: 1.5,
              borderColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}
              allowFontScaling={false}
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: textColor,
          marginRight: 2,
        }}
        allowFontScaling={false}
      >
        ↺
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          letterSpacing: -0.1,
          color: textColor,
          maxWidth: 130,
        }}
        numberOfLines={1}
      >
        {displayNameFor(other)}
      </Text>
      <Text style={{ fontSize: 11, color: subtleColor }} allowFontScaling={false}>
        {roleGlyph(other.role)}
      </Text>
    </>
  );
}

interface DefaultContentProps {
  displayName: string;
  avatarName: string;
  avatarPhoto: string | null;
  otherActivity: number;
  textColor: string | undefined;
}

/** Single-account or 3+-accounts mode — own avatar + name + chevron. */
function DefaultContent({
  displayName,
  avatarName,
  avatarPhoto,
  otherActivity,
  textColor,
}: DefaultContentProps): ReactNode {
  const { theme } = useTheme();
  return (
    <>
      <View>
        <Avatar name={avatarName} photoUrl={avatarPhoto} size={22} />
        {otherActivity > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.status.danger,
              borderWidth: 1.5,
              borderColor: '#FFFFFF',
            }}
          />
        )}
      </View>
      <Text
        style={{
          color: textColor,
          fontSize: 13,
          fontWeight: '600',
          letterSpacing: -0.1,
        }}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      <Text
        style={{
          color: textColor,
          fontSize: 11,
          fontWeight: '700',
          marginTop: 1,
        }}
        allowFontScaling={false}
      >
        ▾
      </Text>
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function displayNameFor(a: SavedAccount | { name: string; companyName?: string | null; role: UserRole }): string {
  if ('companyName' in a && a.role === 'employer' && a.companyName) {
    return a.companyName;
  }
  return a.name;
}

function roleGlyph(role: UserRole): string {
  if (role === 'employer') return '🏢';
  if (role === 'seeker') return '👷';
  return '•';
}

/**
 * Pick the SavedAccount entry that matches the currently-active user.
 * Falls back to a synthetic shape derived from the auth-store `user` if
 * the saved-accounts list hasn't seeded yet (covers the very first
 * launch after a fresh signup).
 */
function activeFor(
  savedAccounts: SavedAccount[],
  activeAccountId: string | null,
  user: { name: string; role: UserRole },
): SavedAccount | { name: string; companyName: string | null; role: UserRole } {
  const match = savedAccounts.find((a) => a.userId === activeAccountId);
  if (match) return match;
  return { name: user.name, companyName: null, role: user.role };
}
