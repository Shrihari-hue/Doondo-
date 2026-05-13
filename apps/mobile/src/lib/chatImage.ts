/**
 * chatImage — pick + compress an image for sending as a chat attachment.
 *
 * Flow:
 *   1. Ask permission (no-op if already granted)
 *   2. Launch the gallery / camera picker
 *   3. Compress + downscale via expo-image-manipulator so the data URL
 *      stays under our backend cap (~1MB raw, ~1.4MB base64).
 *   4. Return a ready-to-send attachment payload.
 *
 * Caller passes `source: 'library' | 'camera'`. Returns null when the
 * user cancels.
 */

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface ChatImageResult {
  dataUrl: string;
  mimeType: 'image/jpeg';
  sizeBytes: number;
  width: number;
  height: number;
}

interface Options {
  source?: 'library' | 'camera';
  /** Max longer-edge dimension in pixels. Default 1280. */
  maxDimension?: number;
  /** JPEG quality 0..1. Default 0.75. */
  quality?: number;
}

/** Throws on permission denial; returns null when user cancels. */
export async function pickChatImage(opts: Options = {}): Promise<ChatImageResult | null> {
  const source = opts.source ?? 'library';
  const maxDim = opts.maxDimension ?? 1280;
  const quality = opts.quality ?? 0.75;

  // Permission
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission denied');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Photo library permission denied');
  }

  // Pick
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
        });

  if (result.canceled || !result.assets?.[0]) return null;
  const picked = result.assets[0];

  // Compute resize: shrink the longer edge to maxDim, preserve aspect.
  const origW = picked.width ?? 0;
  const origH = picked.height ?? 0;
  const longer = Math.max(origW, origH);
  const scale = longer > maxDim ? maxDim / longer : 1;
  const targetW = Math.round(origW * scale) || maxDim;
  const targetH = Math.round(origH * scale) || maxDim;

  // Compress.
  const manipulated = await manipulateAsync(
    picked.uri,
    scale < 1 ? [{ resize: { width: targetW, height: targetH } }] : [],
    {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!manipulated.base64) {
    throw new Error('Failed to encode image');
  }

  // Some platforms don't return a sizeBytes on the manipulated asset.
  // The base64 length is a tight estimate of the encoded size.
  let sizeBytes = Math.ceil(manipulated.base64.length * 0.75);
  try {
    const info = await FileSystem.getInfoAsync(manipulated.uri, { size: true });
    if (info.exists && typeof (info as { size?: number }).size === 'number') {
      sizeBytes = (info as { size: number }).size;
    }
  } catch {
    // best-effort — base64-derived estimate is fine.
  }

  // Guard against insanely large payloads — backend caps at 1.5MB data URL.
  if (manipulated.base64.length > 1_400_000) {
    throw new Error('Image is too large after compression. Try a smaller photo.');
  }

  return {
    dataUrl: `data:image/jpeg;base64,${manipulated.base64}`,
    mimeType: 'image/jpeg',
    sizeBytes,
    width: manipulated.width,
    height: manipulated.height,
  };
}
