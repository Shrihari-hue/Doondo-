/**
 * Skill-proof file picker — pick a PDF or a photo to attach as proof of
 * a skill, returned as a base64 data URL ready to upload.
 *
 * Photos reuse the chat image picker (it already compresses to stay
 * under the upload cap). PDFs come through expo-document-picker and are
 * read to base64 via the expo-file-system legacy shim — the same shim
 * the resume viewer uses.
 */
import * as DocumentPicker from 'expo-document-picker';
import { pickChatImage } from './chatImage';

export type SkillDocSource = 'camera' | 'gallery' | 'pdf';

export interface PickedSkillDoc {
  /** data:<mime>;base64,<payload> */
  dataUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Base64 ceiling — matches the backend cap (~1.4MB). */
const MAX_BASE64 = 1_400_000;

/** Pick a PDF document and read it to a base64 data URL. */
async function pickPdf(): Promise<PickedSkillDoc | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets || res.assets.length === 0) return null;
  const asset = res.assets[0]!;

  const fs = await import('expo-file-system/legacy').catch(() => null);
  if (!fs) {
    throw new Error('File reader not available on this device.');
  }
  const base64 = await fs.readAsStringAsync(asset.uri, {
    encoding: fs.EncodingType.Base64,
  });
  const dataUrl = `data:application/pdf;base64,${base64}`;
  if (dataUrl.length > MAX_BASE64) {
    throw new Error(
      'That PDF is too large — please attach a smaller file (under ~1 MB).',
    );
  }
  return {
    dataUrl,
    fileName: asset.name || 'document.pdf',
    mimeType: 'application/pdf',
    sizeBytes:
      typeof asset.size === 'number' ? asset.size : Math.ceil(base64.length * 0.75),
  };
}

/**
 * Pick one skill-proof file. Returns null when the user cancels;
 * throws with a friendly message on a real failure.
 */
export async function pickSkillDoc(
  source: SkillDocSource,
): Promise<PickedSkillDoc | null> {
  if (source === 'pdf') return pickPdf();

  const img = await pickChatImage({
    source: source === 'camera' ? 'camera' : 'library',
  });
  if (!img) return null;
  return {
    dataUrl: img.dataUrl,
    fileName: `skill-photo-${Date.now()}.jpg`,
    mimeType: img.mimeType || 'image/jpeg',
    sizeBytes: img.sizeBytes,
  };
}
