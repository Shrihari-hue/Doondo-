/**
 * reelVideo — capture a worker's short intro-reel clip.
 *
 * Two sources: record fresh with the camera, or pick an existing clip
 * from the gallery. Both return the same base64 data URL the reel
 * upload endpoint expects.
 *
 * v1 has no transcoding — the picked/recorded clip is sent as-is as a
 * base64 data URL. The ceiling is ~56MB encoded (~40MB of raw video),
 * matched on the server by `MAX_REEL_BASE64_BYTES` and a route-scoped
 * body parser on `/api/v1/reels`. The swappable storage provider is
 * where larger files / a real CDN land later — this client path is the
 * interim transport.
 */

import * as ImagePicker from 'expo-image-picker';
// SDK 54 moved the functional file API to the `/legacy` entry point. The bare
// `expo-file-system` import now exposes only the new File/Directory classes —
// its `readAsStringAsync`/`getInfoAsync` shims `throw` at runtime. Importing
// from `/legacy` keeps the supported, working functional API.
import * as FileSystem from 'expo-file-system/legacy';

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
// ~56MB base64 ≈ ~40MB of raw video. Phone clips at the camera quality
// we capture (0.5) almost always fit; this is the upper bound before we
// ask the worker to re-record or pick a smaller file. Keep in sync with
// the server's MAX_REEL_BASE64_BYTES and the body-parser limit on
// /api/v1/reels in apps/backend/src/server.ts.
const MAX_BASE64_BYTES = 56_000_000;

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
  const base64 = await FileSystem.readAsStringAsync(picked.uri, {
    encoding: FileSystem.EncodingType.Base64,
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
