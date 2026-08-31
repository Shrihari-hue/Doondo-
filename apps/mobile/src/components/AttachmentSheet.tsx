import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { radii, spacing, spring, blue, amber } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';

/**
 * AttachmentSheet — premium dark-glass bottom sheet for picking what to send.
 *
 * Fixes the three issues with the old picker:
 *   1. Back / swipe-down now dismiss (Android hardware back via Modal's
 *      onRequestClose, plus a pan-down gesture that animates the sheet out).
 *   2. Adds a Document / PDF option alongside Photo, Camera, and Video.
 *   3. Premium feel: warm-dark glass background (overlay.glass + BlurView),
 *      champagne hairline border, soft 2x2 tile grid with tinted icon
 *      backdrops, and a gentle spring slide-in.
 *
 * Wire the four `on*` callbacks to your image / camera / video / document
 * pickers (expo-image-picker, expo-document-picker). The sheet closes itself
 * before invoking the handler so the pickers don't fight the sheet animation.
 */

export type AttachmentKind = 'photo' | 'camera' | 'video' | 'document';

interface Props {
  visible: boolean;
  /** Called when the sheet is dismissed (scrim tap, swipe down, hardware back, Cancel). */
  onClose: () => void;
  /** Pick a photo from the device library. */
  onPickPhoto: () => void;
  /** Open the camera to capture a new photo. */
  onOpenCamera: () => void;
  /** Pick or record a video clip. */
  onPickVideo: () => void;
  /** Pick a document (PDF, DOCX, etc) from device storage. */
  onPickDocument: () => void;
}

/** How far below its resting position the sheet starts (and exits to). */
const SHEET_OFFSCREEN = 480;
/** Pan-down threshold (px) before we treat it as a dismiss. */
const DISMISS_DISTANCE = 90;
/** Velocity threshold (px/s) that also commits a dismiss. */
const DISMISS_VELOCITY = 850;

export function AttachmentSheet({
  visible,
  onClose,
  onPickPhoto,
  onOpenCamera,
  onPickVideo,
  onPickDocument,
}: Props) {
  const { theme } = useTheme();

  // Sheet vertical offset. 0 = resting. >0 = dragged down / off-screen.
  const translateY = useSharedValue(SHEET_OFFSCREEN);
  // Scrim opacity. 0 = transparent, 1 = full scrim color.
  const scrim = useSharedValue(0);

  // Slide in / out whenever `visible` flips. We don't gate Modal rendering
  // on the animation; instead we let the parent toggle `visible` and we
  // animate inside.
  useEffect(() => {
    if (visible) {
      haptic('light');
      translateY.value = withSpring(0, spring.gentle);
      scrim.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withSpring(SHEET_OFFSCREEN, spring.snappy);
      scrim.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, scrim]);

  /** Animate the sheet out, then call onClose so the Modal unmounts. */
  const dismiss = () => {
    haptic('selection');
    scrim.value = withTiming(0, { duration: 180 });
    translateY.value = withSpring(SHEET_OFFSCREEN, spring.snappy, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  /** Animate out, then fire the handler once the sheet has fully left. */
  const pickAnd = (handler: () => void) => () => {
    haptic('light');
    scrim.value = withTiming(0, { duration: 180 });
    translateY.value = withSpring(SHEET_OFFSCREEN, spring.snappy, (finished) => {
      if (finished) {
        runOnJS(onClose)();
        runOnJS(handler)();
      }
    });
  };

  // Pan-down to dismiss. Drag tracks the finger; release commits if past
  // threshold or fast enough.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        scrim.value = withTiming(0, { duration: 180 });
        translateY.value = withSpring(
          SHEET_OFFSCREEN,
          spring.snappy,
          (finished) => {
            if (finished) runOnJS(onClose)();
          },
        );
      } else {
        translateY.value = withSpring(0, spring.gentle);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrim.value,
  }));

  // Each tile gets its own accent. Camera uses the brand coral — it's the
  // most-tapped action and the brand wants to be felt here. The other three
  // use restrained accent tints (blue/amber/jade) so the grid still reads
  // as a family, not a rainbow.
  const tiles: Array<{
    key: AttachmentKind;
    label: string;
    caption: string;
    accent: string;
    tintBg: string;
    borderColor: string;
    Icon: React.ComponentType<{ color: string }>;
    onPress: () => void;
  }> = [
    {
      key: 'photo',
      label: 'Photo',
      caption: 'From gallery',
      accent: blue[400],
      tintBg: 'rgba(61, 122, 199, 0.14)',
      borderColor: theme.border.default,
      Icon: PhotoIcon,
      onPress: pickAnd(onPickPhoto),
    },
    {
      key: 'camera',
      label: 'Camera',
      caption: 'Take a photo',
      accent: theme.brand.primary,
      tintBg: theme.brand.primarySubtle,
      // Brand hairline on the most-likely action — subtle highlight without
      // a loud "default" button treatment.
      borderColor: theme.brand.primaryBorder,
      Icon: CameraIcon,
      onPress: pickAnd(onOpenCamera),
    },
    {
      key: 'video',
      label: 'Video',
      caption: 'Record or pick',
      accent: amber[400],
      tintBg: 'rgba(224, 167, 68, 0.14)',
      borderColor: theme.border.default,
      Icon: VideoIcon,
      onPress: pickAnd(onPickVideo),
    },
    {
      key: 'document',
      label: 'Document',
      caption: 'PDF, DOCX, more',
      accent: theme.status.success,
      tintBg: theme.status.successSubtle,
      borderColor: theme.border.default,
      Icon: DocumentIcon,
      onPress: pickAnd(onPickDocument),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      // Android hardware-back. iOS doesn't fire this, but iOS users get
      // edge swipe / scrim tap / pan down instead.
      onRequestClose={dismiss}
    >
      <View style={styles.root}>
        {/* Scrim — tap to dismiss. Sits underneath everything. */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            scrimStyle,
            { backgroundColor: theme.overlay.scrim },
          ]}
        >
          <Pressable
            onPress={dismiss}
            style={StyleSheet.absoluteFill}
            // Block touches falling through to whatever was behind the modal.
            accessibilityRole="button"
            accessibilityLabel="Close attachment picker"
          />
        </Animated.View>

        {/* Sheet — gesture-bound, springs in from the bottom. */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheetWrap, sheetStyle]}>
            <BlurView
              intensity={36}
              tint="dark"
              style={[
                styles.sheetBlur,
                {
                  borderTopLeftRadius: radii['2xl'],
                  borderTopRightRadius: radii['2xl'],
                },
              ]}
            >
              <View
                style={[
                  styles.sheetInner,
                  {
                    backgroundColor: theme.overlay.glass,
                    // Champagne hairline = the "premium" detail. 0.5px, ~35%
                    // opacity — barely visible up close but lifts the whole
                    // surface.
                    borderColor: theme.premium.hairline,
                  },
                ]}
              >
                {/* Grabber */}
                <View
                  style={[styles.grabber, { backgroundColor: theme.border.strong }]}
                />

                <Text variant="bodyLarge" weight="medium">
                  Send attachment
                </Text>
                <Text
                  variant="footnote"
                  tone="secondary"
                  style={{ marginTop: 2, marginBottom: spacing.lg }}
                >
                  Choose what you'd like to share
                </Text>

                <View style={styles.grid}>
                  {tiles.map((t) => (
                    <Tile
                      key={t.key}
                      label={t.label}
                      caption={t.caption}
                      accent={t.accent}
                      tintBg={t.tintBg}
                      borderColor={t.borderColor}
                      Icon={t.Icon}
                      onPress={t.onPress}
                      surface={theme.bg.elevated}
                    />
                  ))}
                </View>

                <Pressable
                  onPress={dismiss}
                  style={({ pressed }) => [
                    styles.cancel,
                    {
                      borderColor: theme.border.default,
                      backgroundColor: pressed ? theme.bg.muted : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text variant="footnote">Cancel</Text>
                </Pressable>

                <Text
                  variant="caption"
                  tone="tertiary"
                  style={styles.dismissHint}
                >
                  Swipe down or tap outside to close
                </Text>
              </View>
            </BlurView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile
// ─────────────────────────────────────────────────────────────────────────────

interface TileProps {
  label: string;
  caption: string;
  accent: string;
  tintBg: string;
  borderColor: string;
  surface: string;
  Icon: React.ComponentType<{ color: string }>;
  onPress: () => void;
}

function Tile({
  label,
  caption,
  accent,
  tintBg,
  borderColor,
  surface,
  Icon,
  onPress,
}: TileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: surface,
          borderColor,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${caption}`}
    >
      <View style={[styles.iconBackdrop, { backgroundColor: tintBg }]}>
        <Icon color={accent} />
      </View>
      <View style={styles.tileText}>
        <Text variant="footnote" weight="medium">
          {label}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline icons — drawn from primitive Views so we don't pull in an icon
// dependency. Each icon is 22x22, monochrome, takes a `color` prop.
// ─────────────────────────────────────────────────────────────────────────────

const ICON_SIZE = 22;
const STROKE = 1.6;

function PhotoIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.box}>
      {/* Back card (offset, half-opacity) */}
      <View
        style={[
          iconStyles.absoluteFrame,
          {
            top: 1,
            left: 4,
            right: 0,
            bottom: 5,
            borderColor: color,
            borderWidth: STROKE,
            borderRadius: 4,
            opacity: 0.45,
          },
        ]}
      />
      {/* Front card */}
      <View
        style={[
          iconStyles.absoluteFrame,
          {
            top: 4,
            left: 0,
            right: 4,
            bottom: 2,
            borderColor: color,
            borderWidth: STROKE,
            borderRadius: 4,
            overflow: 'hidden',
          },
        ]}
      >
        {/* Sun */}
        <View
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: color,
          }}
        />
        {/* Mountain — diagonal line */}
        <View
          style={{
            position: 'absolute',
            bottom: 1,
            left: 1,
            width: 11,
            height: 1.6,
            backgroundColor: color,
            transform: [{ rotate: '-26deg' }],
          }}
        />
      </View>
    </View>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.box}>
      {/* Bump for the viewfinder/flash */}
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: 5,
          width: 6,
          height: 3,
          borderTopLeftRadius: 1.5,
          borderTopRightRadius: 1.5,
          backgroundColor: color,
        }}
      />
      {/* Body */}
      <View
        style={[
          iconStyles.absoluteFrame,
          {
            top: 4,
            left: 0,
            right: 0,
            bottom: 2,
            borderColor: color,
            borderWidth: STROKE,
            borderRadius: 4,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {/* Lens */}
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            borderWidth: STROKE,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
}

function VideoIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.box}>
      {/* Film body */}
      <View
        style={[
          iconStyles.absoluteFrame,
          {
            top: 4,
            left: 0,
            right: 6,
            bottom: 4,
            borderColor: color,
            borderWidth: STROKE,
            borderRadius: 3,
          },
        ]}
      />
      {/* Triangle "lens" — pointing right, made with rotated square + clipping */}
      <View
        style={{
          position: 'absolute',
          right: 1,
          top: 6,
          width: 0,
          height: 0,
          borderTopWidth: 5,
          borderBottomWidth: 5,
          borderLeftWidth: 7,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color,
        }}
      />
    </View>
  );
}

function DocumentIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.box}>
      {/* Sheet body */}
      <View
        style={[
          iconStyles.absoluteFrame,
          {
            top: 1,
            left: 3,
            right: 1,
            bottom: 1,
            borderColor: color,
            borderWidth: STROKE,
            borderRadius: 2.5,
            paddingHorizontal: 3,
            paddingTop: 8,
            justifyContent: 'flex-start',
            gap: 2,
          },
        ]}
      >
        <View style={{ height: 1.5, backgroundColor: color, opacity: 0.95 }} />
        <View
          style={{ height: 1.5, backgroundColor: color, opacity: 0.95, width: '75%' }}
        />
        <View
          style={{ height: 1.5, backgroundColor: color, opacity: 0.95, width: '60%' }}
        />
      </View>
      {/* Folded corner — small triangle in the top-left of the sheet */}
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: 3,
          width: 5,
          height: 5,
          backgroundColor: color,
          borderTopLeftRadius: 2,
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheetBlur: {
    overflow: 'hidden',
  },
  sheetInner: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 0.5,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBackdrop: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    flex: 1,
    minWidth: 0,
  },
  cancel: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: radii.md,
    borderWidth: 0.5,
  },
  dismissHint: {
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
});

const iconStyles = StyleSheet.create({
  box: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  absoluteFrame: {
    position: 'absolute',
  },
});
