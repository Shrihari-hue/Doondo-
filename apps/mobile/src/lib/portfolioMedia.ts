/**
 * portfolioMedia — pick + compress media for an employer's workplace
 * portfolio (Look Inside).
 *
 * Photos reuse the chat-image pipeline at a larger size (1600px long
 * edge) — enough for a full-screen tour on a phone while staying under
 * the backend's ~1.5MB per-photo cap. Videos are read as base64 like
 * Hire Reels and capped at 60 s.
 */

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { pickChatImage } from './chatImage';

export async function pickPortfolioPhoto(source: 'library' | 'camera' = 'library') {
  return pickChatImage({ source, maxDimension: 1600, quality: 0.72 });
}

/** Smaller square-ish photo for a team member. */
export async function pickTeamPhoto() {
  return pickChatImage({ source: 'library', maxDimension: 640, quality: 0.75 });
}

export const WORKPLACE_VIDEO_MAX_SECONDS = 60;
const MAX_VIDEO_BASE64 = 56_000_000;

export async function pickWorkplaceVideo(): Promise<{
  dataUrl: string;
  mimeType: string;
  durationSeconds: number;
} | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission denied');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    videoMaxDuration: WORKPLACE_VIDEO_MAX_SECONDS,
    quality: 0.6,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const picked = result.assets[0];

  const durationSeconds = Math.round((picked.duration ?? 0) / 1000) || 0;
  if (durationSeconds > WORKPLACE_VIDEO_MAX_SECONDS + 1) {
    throw new Error(`Keep the video under ${WORKPLACE_VIDEO_MAX_SECONDS} seconds.`);
  }

  const base64 = await FileSystem.readAsStringAsync(picked.uri, { encoding: 'base64' as never });
  if (base64.length > MAX_VIDEO_BASE64) {
    throw new Error('Video is too large. Try a shorter or lower-quality clip.');
  }
  const mimeType =
    (picked as { mimeType?: string }).mimeType ??
    (picked.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');

  return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType, durationSeconds };
}
