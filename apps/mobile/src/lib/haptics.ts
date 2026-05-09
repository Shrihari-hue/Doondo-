import * as Haptics from 'expo-haptics';
import type { HapticKey } from '@doondo/tokens';

/**
 * Haptics utility — every meaningful tap should trigger one of these.
 *
 * Map from semantic intent (selection, light, success…) to the platform
 * haptic primitive. Calling code never imports expo-haptics directly so
 * we can swap the impl later (e.g. add a "haptics off" user preference)
 * in one place.
 *
 * Fire-and-forget. Never await; haptics should never block UI.
 */

type HapticFn = () => Promise<unknown>;

const map: Record<HapticKey, HapticFn> = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export function haptic(intent: HapticKey): void {
  void map[intent]?.();
}
