/**
 * LockScreen — the biometric / PIN unlock gate.
 *
 * Shown by the RootNavigator instead of the app when the worker has
 * turned on app lock and the app has just been opened (or returned
 * from the background). It prompts the device unlock immediately; on
 * success the gate clears and the real app renders.
 *
 * Escape hatch: "Sign in with a different account" logs out — so a
 * worker can never be permanently trapped behind a failing sensor.
 */

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { useAppLockStore } from '@/stores/appLock.store';
import { useAuth } from '@/hooks/useAuth';

export function LockScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const unlock = useAppLockStore((s) => s.unlock);
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function attempt() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlock(t('app_lock.unlock_prompt'));
    if (ok) {
      haptic('success');
    } else {
      haptic('error');
      setFailed(true);
    }
    setBusy(false);
  }

  // Prompt the moment the lock screen appears.
  useEffect(() => {
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Text style={{ fontSize: 48 }}>🔒</Text>
        <Text variant="display" weight="medium" display>
          Doondo
        </Text>
        <Text
          variant="footnote"
          tone="secondary"
          style={{ textAlign: 'center', maxWidth: 280 }}
        >
          {t('app_lock.lock_screen_message')}
        </Text>
        {failed && (
          <Text variant="footnote" tone="danger" style={{ textAlign: 'center' }}>
            {t('app_lock.unlock_failed')}
          </Text>
        )}
        <View style={{ alignSelf: 'stretch', maxWidth: 320, width: '100%' }}>
          <Button
            label={busy ? t('app_lock.unlocking') : t('app_lock.unlock_button')}
            onPress={() => void attempt()}
            disabled={busy}
          />
        </View>
        <Pressable onPress={() => void logout()} hitSlop={8}>
          <Text variant="footnote" style={{ color: theme.text.tertiary }}>
            {t('app_lock.sign_out')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
