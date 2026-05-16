/**
 * Photo helpers — image picker → resize → base64 data URL.
 *
 * The base64 path is a Phase 2 expedience. Phase 5 swaps this for a
 * proper multipart upload to S3/Cloudinary; for now the encoded image is
 * sent in the JSON body of PATCH /me/profile and stored on the user
 * document. The picker enforces a 1:1 aspect for clean avatars.
 *
 * Sizing pipeline:
 *   1. ImagePicker grabs the source asset (no base64 — keep it light).
 *   2. ImageManipulator resizes to a target width and re-encodes JPEG
 *      with progressively lower quality until the base64 payload is
 *      comfortably under the backend's 360KB cap on `photoUrl`.
 *
 * Without this resize step a typical iPhone JPEG (2–4MB) blows past
 * the Zod `.max(360_000)` validator on the backend and the upload
 * silently fails with a generic 400.
 */

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PickedPhoto {
  /** data:image/jpeg;base64,... */
  dataUrl: string;
  width: number;
  height: number;
}

/** Hard ceiling for the encoded data URL we send to the backend. */
const MAX_PROFILE_DATA_URL_CHARS = 340_000; // ~250 KB of binary
const PROFILE_TARGET_WIDTHS = [512, 384, 256] as const;
const PROFILE_QUALITY_STEPS = [0.6, 0.45, 0.3] as const;

/**
 * Open the OS image picker, let the user crop to a square, resize +
 * recompress until the payload fits the backend cap, and return a
 * base64 data URL. Returns null if the user cancels or denies permission.
 */
export async function pickProfilePhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== ImagePicker.PermissionStatus.GRANTED) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    // Don't request base64 here — we recompress with ImageManipulator below.
    quality: 1,
    base64: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0]!;
  return compressForProfile(asset.uri);
}

/**
 * Try a few width × quality combinations until the base64 payload fits
 * under the backend cap. Throws if even the smallest preset is too big
 * (which shouldn't happen for a 1:1 cropped avatar in practice).
 */
async function compressForProfile(uri: string): Promise<PickedPhoto> {
  let lastError: unknown = null;
  for (const width of PROFILE_TARGET_WIDTHS) {
    for (const quality of PROFILE_QUALITY_STEPS) {
      try {
        const out = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width } }],
          {
            compress: quality,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        if (!out.base64) continue;
        const dataUrl = `data:image/jpeg;base64,${out.base64}`;
        if (dataUrl.length <= MAX_PROFILE_DATA_URL_CHARS) {
          return { dataUrl, width: out.width, height: out.height };
        }
      } catch (err) {
        lastError = err;
      }
    }
  }
  if (lastError) throw lastError;
  throw new Error('Could not compress photo small enough — try a different image.');
}

// ─── Work-sample photos (resume builder) ────────────────────────────────────

/** Per-photo cap on the encoded data URL we send to the backend. */
const MAX_WORK_PHOTO_DATA_URL_CHARS = 480_000; // ~360 KB of binary
const WORK_PHOTO_TARGET_WIDTHS = [1200, 900, 720, 540] as const;
const WORK_PHOTO_QUALITY_STEPS = [0.65, 0.5, 0.4, 0.3] as const;

/**
 * Pick a work-sample photo from the library — landscape OR portrait, no
 * forced crop (a mason's wall is wide, a tailor's stitching is tight).
 * The pipeline mirrors `pickProfilePhoto` but with a slightly more
 * generous cap because detail matters on work samples.
 */
export async function pickWorkPhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== ImagePicker.PermissionStatus.GRANTED) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // No forced aspect — let the worker share the natural framing.
    allowsEditing: false,
    quality: 1,
    base64: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  return compressForWorkPhoto(result.assets[0]!.uri);
}

async function compressForWorkPhoto(uri: string): Promise<PickedPhoto> {
  let lastError: unknown = null;
  for (const width of WORK_PHOTO_TARGET_WIDTHS) {
    for (const quality of WORK_PHOTO_QUALITY_STEPS) {
      try {
        const out = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width } }],
          {
            compress: quality,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        if (!out.base64) continue;
        const dataUrl = `data:image/jpeg;base64,${out.base64}`;
        if (dataUrl.length <= MAX_WORK_PHOTO_DATA_URL_CHARS) {
          return { dataUrl, width: out.width, height: out.height };
        }
      } catch (err) {
        lastError = err;
      }
    }
  }
  if (lastError) throw lastError;
  throw new Error('Could not compress photo small enough — try a different image.');
}

/**
 * Capture a selfie from the front-facing camera for the verification flow.
 *
 * We don't share `pickProfilePhoto` because the constraints differ:
 *   - Source must be the live camera (not the library) — preventing
 *     "verify with someone else's photo" attacks.
 *   - Aspect locked to 1:1 like an ID photo so the back-office reviewer
 *     gets a consistent crop.
 *   - Slightly higher quality (0.7) since the selfie is the trust signal.
 *
 * Returns null on cancel or denied permission. The caller should treat
 * the missing-permission case as a soft failure and prompt the user to
 * enable the camera in Settings.
 */
export async function captureSelfie(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== ImagePicker.PermissionStatus.GRANTED) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    // Aggressive compression — modern phone cameras produce huge JPEGs and
    // we send the image inline as a base64 data URL. 0.4 keeps the file
    // comfortably under the backend's 900KB cap on most devices while
    // staying clear enough for human verification review.
    quality: 0.4,
    base64: true,
    // Hint — most devices honour this and open the front camera.
    cameraType: ImagePicker.CameraType.front,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0]!;
  if (!asset.base64) return null;

  const mime = asset.mimeType ?? 'image/jpeg';
  return {
    dataUrl: `data:${mime};base64,${asset.base64}`,
    width: asset.width,
    height: asset.height,
  };
}
