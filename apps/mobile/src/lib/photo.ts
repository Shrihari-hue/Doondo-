/**
 * Photo helpers — image picker → resize → base64 data URL.
 *
 * The base64 path is a Phase 2 expedience. Phase 5 swaps this for a
 * proper multipart upload to S3/Cloudinary; for now the encoded image is
 * sent in the JSON body of PATCH /me/profile and stored on the user
 * document. The picker enforces a 1:1 aspect for clean avatars.
 */

import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  /** data:image/jpeg;base64,... */
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Open the OS image picker, let the user crop to a square, and return
 * a base64 data URL ready to send to the backend. Returns null if the
 * user cancels or denies permission.
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
    // Strong compression — avatars don't need to be huge, and we cap the
    // backend payload at ~350KB after base64 encoding.
    quality: 0.55,
    base64: true,
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
