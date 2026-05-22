/**
 * reelVideo — capture a worker's short intro-reel clip.
 *
 * Two sources: record fresh with the camera, or pick an existing clip
 * from the gallery. Both return the same base64 data URL the reel
 * upload endpoint expects.
 *
 * v1 mirrors `chatVideo`: no transcoding, the picked/recorded file is
 * sent as-is as a base64 data URL under a ~1.4MB ceiling (the bound the
 * JSON body parser is known to accept). The server's swappable storage
 * provider is where larger files / a real CDN land later — this client
 * path is the interim transport.
 */

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export interface ReelCaptureResult {
  /** Local file URI — play this for an instant preview before upload. */
  uri: string;
  /** data:video/mp4;base64,... — the payload sent to the upload endpoint. */
  dataUrl: string;
  mimeType: string;
  durationSeconds: number;
  sizeBytes: number;
}

/** A reel must be at least this long — a 1-second clip is a misfire. */
export const REEL_MIN_SECONDS = 3;
/** …and at most this long. */
export const REEL_MAX_SECONDS = 30;
const MAX_BASE64_BYTES = 1_400_000;

/** Turn a picked/recorded asset into the upload-ready result. Throws friendly errors. */
async function processAsset(
  picked: ImagePicker.ImagePickerAsset,
): Promise<ReelCaptureResult> {
  const durationSeconds = Math.round((picked.duration ?? 0) / 1000) || 0;
  if (durationSeconds > REEL_MAX_SECONDS + 1) {
    throw new Error(
      `That clip is too long. Keep your reel under ${REEL_MAX_SECONDS} seconds.`,
    );
  }

  // ImagePicker doesn't hand back base64 for video — read it off the URI.
  // `EncodingType` moved to the legacy entry in expo-file-system SDK 54+;
  // the bare 'base64' string is the supported form across the versions we ship.
  const base64 = await FileSystem.readAsStringAsync(picked.uri, {
    encoding: 'base64' as never,
  });
  if (base64.length > MAX_BASE64_BYTES) {
    throw new Error(
      'That video is too large. Try a shorter or lower-quality clip.',
    );
  }

  let sizeBytes = Math.ceil(base64.length * 0.75);
  try {
    const info = await FileSystem.getInfoAsync(picked.uri);
    if (info.exists && typeof (info as { size?: number }).size === 'number') {
      sizeBytes = (info as { size: number }).size;
    }
  } catch {
    /* best-effort */
  }

  const mimeType =
    (picked as { mimeType?: string }).mimeType ??
    (picked.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');

  return {
    uri: picked.uri,
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    durationSeconds,
    sizeBytes,
  };
}

/** Record a fresh reel with the camera. Returns null if the worker cancels. */
export async function recordReel(): Promise<ReelCaptureResult | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission denied');

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    videoMaxDuration: REEL_MAX_SECONDS,
    quality: 0.5,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return processAsset(result.assets[0]);
}

/** Pick an existing clip from the gallery. Returns null if the worker cancels. */
export async function pickReel(): Promise<ReelCaptureResult | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission denied');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    videoMaxDuration: REEL_MAX_SECONDS,
    quality: 0.5,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return processAsset(result.assets[0]);
}
