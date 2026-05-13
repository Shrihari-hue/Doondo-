/**
 * chatVideo — pick a video and return a ready-to-send chat attachment.
 *
 * v1 keeps it simple:
 *   - Source: gallery only (camera recording is its own UX we can add later)
 *   - Hard cap: 30 seconds. Anything longer is rejected with a friendly
 *     error. expo-image-picker supports `videoMaxDuration` for the
 *     in-picker timer but we double-check after pick for safety.
 *   - File size cap: ~1.4MB base64 (same ceiling as the other media kinds)
 *   - We DO NOT transcode in v1. The original picked file is sent as-is
 *     as a base64 data URL. Users must pick a short clip; the limit
 *     screen explains this.
 *
 * Transcoding (ffmpeg / native) is a bigger build and ships in a later
 * version when we move attachments off base64 into a real CDN.
 */

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export interface VideoPickResult {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  width?: number;
  height?: number;
}

export const VIDEO_MAX_SECONDS = 30;
const MAX_BASE64_BYTES = 1_400_000;

export async function pickChatVideo(): Promise<VideoPickResult | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission denied');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    videoMaxDuration: VIDEO_MAX_SECONDS,
    quality: 0.6,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const picked = result.assets[0];

  const durationSeconds = Math.round((picked.duration ?? 0) / 1000) || 0;
  if (durationSeconds > VIDEO_MAX_SECONDS + 1) {
    throw new Error(`Video is too long. Keep it under ${VIDEO_MAX_SECONDS} seconds.`);
  }

  // Read as base64. ImagePicker doesn't give us base64 for videos directly,
  // so we read from the local file URI.
  const base64 = await FileSystem.readAsStringAsync(picked.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (base64.length > MAX_BASE64_BYTES) {
    throw new Error(
      'Video is too large to send. Try a shorter or lower-quality clip.',
    );
  }

  let sizeBytes = Math.ceil(base64.length * 0.75);
  try {
    const info = await FileSystem.getInfoAsync(picked.uri, { size: true });
    if (info.exists && typeof (info as { size?: number }).size === 'number') {
      sizeBytes = (info as { size: number }).size;
    }
  } catch {
    /* best-effort */
  }

  // MIME guess — most picker outputs are mp4 / quicktime; the type is
  // surfaced on the asset in newer SDKs.
  const mimeType =
    (picked as { mimeType?: string }).mimeType ??
    (picked.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');

  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    sizeBytes,
    durationSeconds,
    width: picked.width ?? undefined,
    height: picked.height ?? undefined,
  };
}
