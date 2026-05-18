/**
 * Selfie capture for shift check-in.
 *
 * Forces the front camera. The user can't pick from the library — a
 * library photo defeats the entire point of "you were physically here
 * at this time". Compresses to fit the backend's 550KB data URL cap
 * with margin; if the result is still too large, drops quality further.
 *
 * Returns null on cancel or permission denial.
 */

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface SelfieResult {
  /** data:image/jpeg;base64,... */
  dataUrl: string;
  width: number;
  height: number;
  /** Approximate byte size after base64 decode (rough estimate). */
  sizeBytes: number;
}

/** Hard ceiling for the encoded data URL we send. ~400KB of binary. */
const MAX_DATA_URL_CHARS = 520_000;
const TARGET_WIDTHS = [720, 540, 420] as const;
const QUALITIES = [0.6, 0.45, 0.32] as const;

/**
 * Open the camera in front-camera selfie mode, capture, then compress
 * until the resulting data URL fits under the backend cap.
 *
 * Throws on permission denial; returns null on user cancel.
 */
export async function captureShiftSelfie(): Promise<SelfieResult | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Camera permission denied');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    cameraType: ImagePicker.CameraType.front,
    quality: 1,
    // No editing — we want the unedited capture so it's hard to forge.
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const picked = result.assets[0];

  // Walk widths × qualities until the encoded data URL fits.
  for (const width of TARGET_WIDTHS) {
    for (const quality of QUALITIES) {
      const manipulated = await manipulateAsync(
        picked.uri,
        [{ resize: { width } }],
        { compress: quality, format: SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) continue;
      const dataUrl = `data:image/jpeg;base64,${manipulated.base64}`;
      if (dataUrl.length <= MAX_DATA_URL_CHARS) {
        return {
          dataUrl,
          width: manipulated.width,
          height: manipulated.height,
          sizeBytes: Math.ceil(manipulated.base64.length * 0.75),
        };
      }
    }
  }

  // Every compression step blew past the cap. Surface to the caller —
  // probably a wild camera output we don't know how to shrink fast.
  throw new Error('Could not compress the selfie small enough to send. Try again.');
}
