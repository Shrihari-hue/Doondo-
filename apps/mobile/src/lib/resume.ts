/**
 * Resume helpers — open a base64 data-URL resume in the OS share sheet.
 *
 * Resumes are persisted as `data:application/pdf;base64,...` strings on
 * the User document (Phase 2 expedience — Phase 5 swaps for S3 URLs).
 * The platform `Linking.openURL` does NOT open `data:` URIs reliably on
 * iOS or Android, so the employer-side viewer needs to:
 *
 *   1. Decode the base64 payload to bytes
 *   2. Write a temporary file under `cacheDirectory`
 *   3. Hand the file URI to `expo-sharing` so the user picks an app
 *      (Files / Drive / Mail / Preview) that can render it.
 *
 * Both expo-file-system and expo-sharing are lazy-loaded so a missing
 * native module surfaces a friendly error instead of a metro crash.
 */

interface OpenResumeInput {
  /** data:<mime>;base64,<payload> from the API. */
  dataUrl: string;
  /** Original filename (used for the cached file + share dialog title). */
  filename?: string | null;
  /** MIME type — drives the file extension if filename is missing. */
  mimeType?: string | null;
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export async function openResume(input: OpenResumeInput): Promise<void> {
  if (!input.dataUrl) throw new Error('No resume on file.');

  // Use the legacy subpath — expo-file-system 19 moved to the new
  // Paths/File API but the legacy `writeAsStringAsync` shim remains the
  // simplest cross-platform way to materialize a base64 payload to disk.
  const fs = await import('expo-file-system/legacy').catch(() => null);
  const sharing = await import('expo-sharing').catch(() => null);
  if (!fs || !sharing) {
    throw new Error(
      'Resume viewer not installed. Run: pnpm add expo-file-system expo-sharing',
    );
  }

  const match = /^data:([^;]+);base64,(.*)$/.exec(input.dataUrl);
  if (!match) throw new Error('Resume is not a base64 data URL.');
  const mime = input.mimeType ?? match[1] ?? 'application/octet-stream';
  const base64 = match[2] ?? '';

  const ext = EXTENSIONS[mime] ?? 'bin';
  const safeName = sanitizeFilename(input.filename ?? `resume.${ext}`, ext);
  const target = `${fs.cacheDirectory ?? ''}${safeName}`;

  await fs.writeAsStringAsync(target, base64, {
    encoding: fs.EncodingType.Base64,
  });

  const available = await sharing.isAvailableAsync();
  if (!available) {
    throw new Error(
      "Sharing isn't available on this device — try a real phone, not a simulator.",
    );
  }

  await sharing.shareAsync(target, {
    mimeType: mime,
    UTI: mime === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    dialogTitle: input.filename ?? 'Resume',
  });
}

/** Strip path separators and force a sensible extension. */
function sanitizeFilename(name: string, ext: string): string {
  const cleaned = name.replace(/[/\\]/g, '_').slice(0, 80);
  return cleaned.toLowerCase().endsWith(`.${ext}`) ? cleaned : `${cleaned}.${ext}`;
}

/** Format a byte count as "123 KB" or "1.2 MB" for a small UI hint. */
export function formatResumeSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
