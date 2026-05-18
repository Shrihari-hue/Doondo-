/**
 * Profile document capture — for the one-photo profile feature.
 *
 * The seeker can snap a fresh photo OR pick from their library (a saved
 * resume scan, a screenshot, etc). We resize and compress until the
 * data URL fits comfortably under the backend's 1.3MB cap with margin.
 *
 * Targets are wider than `selfie.ts` because resume text needs to stay
 * legible — vision-language models still benefit from a higher base
 * resolution than a face crop. We sample longer-edges down from 1600px
 * with a few quality steps.
 */

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface DocumentPickResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

const MAX_DATA_URL_CHARS = 1_250_000; // ~900KB binary; comfortable under the 1.3MB server cap
const TARGET_LONGER_EDGES = [1600, 1280, 1024, 800] as const;
const QUALITIES = [0.72, 0.6, 0.45] as const;

interface Options {
  source: 'camera' | 'library';
}

/**
 * Open the camera or library, capture a document image, recompress
 * until it fits the cap. Returns null on user cancel. Throws on
 * permission denial.
 */
export async function pickProfileDocument(opts: Options): Promise<DocumentPickResult | null> {
  if (opts.source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission denied');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Photo library permission denied');
  }

  const result =
    opts.source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          // No fixed aspect — let the worker frame their document as they want.
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: false,
        });

  if (result.canceled || !result.assets?.[0]) return null;
  const picked = result.assets[0];

  // Walk longer-edge × quality combinations until the encoded data URL fits.
  const origW = picked.width ?? 0;
  const origH = picked.height ?? 0;
  for (const longerEdge of TARGET_LONGER_EDGES) {
    // Resize the longer edge while preserving aspect.
    const longer = Math.max(origW, origH);
    const scale = longer > longerEdge ? longerEdge / longer : 1;
    const w = Math.round(origW * scale) || longerEdge;
    const h = Math.round(origH * scale) || longerEdge;
    for (const quality of QUALITIES) {
      const manipulated = await manipulateAsync(
        picked.uri,
        scale < 1 ? [{ resize: { width: w, height: h } }] : [],
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

  // If we couldn't shrink below the cap, surface a clear error. Rare —
  // the smallest combination (800px @ 0.45) is well under 200KB.
  throw new Error('Could not compress the photo small enough to send. Try a smaller image.');
}
