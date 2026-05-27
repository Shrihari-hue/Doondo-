/**
 * chatVoice — record + send voice notes in chat.
 *
 * Wraps expo-audio's AudioRecorder so the calling screen doesn't have
 * to deal with the imperative recorder lifecycle directly. Returns a
 * ready-to-send `kind: 'voice'` attachment payload.
 *
 * Permissions: needs RECORD_AUDIO. The seeker app's app.json already
 * declares it (it was set up for video intros earlier).
 *
 * v1 caps:
 *   - Hard stop at 60 seconds (longer notes are a UX cliff and bloat
 *     the message document)
 *   - File format: m4a (AAC) — small, broad playback support
 *   - Encoded as base64 data URL like the chat image flow. Cap at the
 *     same ~1.4MB ceiling — generous for a 60s clip at our bitrate.
 *
 * SDK 54 note: expo-audio dropped the legacy `Audio` namespace — the
 * permission + audio-mode helpers are now plain named exports, and the
 * recorder is a class you `new` directly. This file uses that API and
 * resolves the symbols defensively so a partial install doesn't crash
 * the chat thread the first time a seeker holds the mic button.
 */

import * as ExpoAudio from 'expo-audio';
import { File } from 'expo-file-system';

export interface VoiceRecordingResult {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
}

/** Max recording duration. */
export const VOICE_MAX_SECONDS = 60;

/**
 * Minimum time the native MediaRecorder needs between `record()` and
 * `stop()` before the AAC encoder has actually committed any frames.
 *
 * If we stop earlier than this, Android throws:
 *   java.lang.RuntimeException: stop failed
 * which used to bubble up to the chat thread as the
 * "Couldn't send voice" alert the moment a user lifted their finger
 * a fraction of a second after pressing.
 *
 * Empirically ~250ms is enough on every device we've tested; we use
 * 400ms for a comfortable safety margin (still imperceptible — a tap
 * that brief is an accident anyway, and gets dropped by the
 * `< MIN_USEFUL_MS` check below).
 */
const MIN_RECORD_BEFORE_STOP_MS = 400;

/**
 * Below this elapsed-time threshold we treat the recording as an
 * accidental tap — no alert, no send, just a quiet drop. Otherwise the
 * UX is "I brushed the mic button → modal popup".
 */
const MIN_USEFUL_MS = 250;

/** Sleep helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  // In expo-audio v1.x, `extension`, `sampleRate`, `numberOfChannels` and
  // `bitRate` are TOP-LEVEL keys on RecordingOptions. Nesting them under
  // `android` / `ios` (as this file used to) means the native side never
  // reads them — the clip wouldn't actually be mono / 64 kbps, which quietly
  // breaks the ~1.4MB size budget the rest of this file assumes.
  extension: '.m4a',
  sampleRate: 32_000,
  numberOfChannels: 1,
  bitRate: 64_000,
  android: {
    // Must be a member of the AndroidOutputFormat enum:
    //   'default' | '3gp' | 'mpeg4' | 'amrnb' | 'amrwb' | 'aac_adts' | 'mpeg2ts' | 'webm'
    // It is 'mpeg4' — NOT 'mpeg_4'. The underscored form is rejected natively
    // with: "Couldn't convert ... to AndroidOutputFormat where value is the
    // enum parameter" (the crash seen on the hold-to-record button).
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac' as const,
  },
  ios: {
    // IOSOutputFormat.MPEG4AAC. Its raw value is the 4-character code 'aac '
    // (note the trailing space). 'mpeg4aac' is NOT a valid value and would
    // crash iOS exactly the way 'mpeg_4' crashed Android.
    outputFormat: 'aac ' as const,
    audioQuality: 96 as const, // AudioQuality.HIGH
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64_000,
  },
};

// Resolve the expo-audio surface defensively.
//
// IMPORTANT: in expo-audio v1.x the `AudioRecorder` symbol exported at the
// top of the package is a TYPE only — there is no runtime value at
// `ExpoAudio.AudioRecorder`. The actual constructor lives on the native
// module instance exported as `AudioModule` (i.e. `AudioModule.AudioRecorder`).
// The official hook `useAudioRecorder` internally does `new AudioModule.AudioRecorder(...)`,
// and we mirror that here because we need an imperative recorder for the
// hold-to-record FAB, not a React hook.
//
// We also keep a legacy `Audio.*` fallback so a stale or pre-v1 install
// won't crash the first time a seeker holds the mic button.
const audioApi = ExpoAudio as unknown as {
  requestRecordingPermissionsAsync?: () => Promise<{ granted: boolean }>;
  setAudioModeAsync?: (mode: Record<string, unknown>) => Promise<void>;
  AudioModule?: {
    AudioRecorder?: new (options: typeof RECORDING_OPTIONS) => RecorderInstance;
  };
  Audio?: {
    requestRecordingPermissionsAsync?: () => Promise<{ granted: boolean }>;
    setAudioModeAsync?: (mode: Record<string, unknown>) => Promise<void>;
    AudioRecorder?: {
      createAsync: (options: typeof RECORDING_OPTIONS) => Promise<RecorderInstance>;
    };
  };
};

interface RecorderInstance {
  uri: string | null;
  prepareToRecordAsync?: (options?: typeof RECORDING_OPTIONS) => Promise<void>;
  record: () => Promise<void> | void;
  stop: () => Promise<void>;
}

async function requestPermission(): Promise<{ granted: boolean }> {
  if (audioApi.requestRecordingPermissionsAsync) {
    return audioApi.requestRecordingPermissionsAsync();
  }
  if (audioApi.Audio?.requestRecordingPermissionsAsync) {
    return audioApi.Audio.requestRecordingPermissionsAsync();
  }
  throw new Error('Voice recording is not supported on this device.');
}

async function applyAudioMode(): Promise<void> {
  const set =
    audioApi.setAudioModeAsync ?? audioApi.Audio?.setAudioModeAsync ?? null;
  if (!set) return; // best-effort — recording can still work without explicit mode set
  // `allowsRecording` and `playsInSilentMode` are iOS-only on v1.x; on Android
  // the runtime just ignores the keys it doesn't recognise, so this is safe
  // to send on both platforms.
  await set({ allowsRecording: true, playsInSilentMode: true });
}

async function createRecorder(): Promise<RecorderInstance> {
  // expo-audio v1.x — constructor lives on the native module.
  const RecorderCtor = audioApi.AudioModule?.AudioRecorder;
  if (RecorderCtor) {
    const r = new RecorderCtor(RECORDING_OPTIONS);
    if (typeof r.prepareToRecordAsync === 'function') {
      // Pass options through to prepare so the v1.x option normaliser sees them.
      await r.prepareToRecordAsync(RECORDING_OPTIONS);
    }
    return r;
  }
  // Legacy `Audio.AudioRecorder.createAsync` fallback (expo-av / pre-v1 expo-audio).
  if (audioApi.Audio?.AudioRecorder?.createAsync) {
    return audioApi.Audio.AudioRecorder.createAsync(RECORDING_OPTIONS);
  }
  throw new Error('Voice recording is not supported on this device.');
}

/**
 * Best-effort delete of a recorder temp file.
 *
 * The expo-file-system v19.x `File` API is class-based and synchronous, and
 * `File.delete()` throws if the file is already gone — so we guard with an
 * `exists` check and swallow anything that still slips through.
 */
function safeDeleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* best-effort */
  }
}

/**
 * Try to stop the native recorder, swallowing the Android
 * `RuntimeException: stop failed` (and the iOS equivalent) so a flaky
 * stop never turns into a user-facing alert.
 *
 * The recorder STILL flushes whatever it captured to `recorder.uri`
 * even when stop throws — that's how MediaRecorder behaves on Android.
 * Callers can read the file afterwards and decide whether it's usable.
 */
async function safeStopRecorder(recorder: RecorderInstance): Promise<void> {
  try {
    await recorder.stop();
  } catch {
    /* best-effort — see comment above */
  }
}

/**
 * Read the recorded file as base64, returning `null` if the file is
 * missing, empty, or unreadable. Used to salvage a recording after a
 * "stop failed" — the file is usually still on disk even when stop
 * threw, so we check and use it instead of dropping the recording.
 */
async function readRecordingBase64(
  uri: string,
): Promise<{ base64: string; sizeBytes: number } | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    const base64 = await file.base64();
    if (!base64 || base64.length < 64) {
      // Anything this tiny is silence / header-only — not worth sending.
      return null;
    }
    const sizeBytes = file.size || Math.ceil(base64.length * 0.75);
    return { base64, sizeBytes };
  } catch {
    return null;
  }
}

/**
 * VoiceRecorder — start, stop, cancel. Holds the live recorder reference
 * internally so the caller just toggles state.
 */
export class VoiceRecorder {
  private recorder: RecorderInstance | null = null;
  private startedAt = 0;

  /** Throws if permission is denied. */
  async start(): Promise<void> {
    const perm = await requestPermission();
    if (!perm.granted) {
      throw new Error('Microphone permission denied');
    }
    await applyAudioMode();

    const recorder = await createRecorder();
    this.recorder = recorder;
    this.startedAt = Date.now();
    await recorder.record();
  }

  /**
   * Stop and read the file, returning a ready-to-send attachment.
   *
   * Returns `null` when the recording was an accidental tap (sub-250ms)
   * or produced no audible content — callers should treat `null` as
   * "silently do nothing" rather than as an error.
   *
   * Throws ONLY on programmer error (no recording in progress) or on a
   * real size-budget violation. Native `stop failed` exceptions are
   * caught and recovered from — Android still flushes the captured
   * frames to disk in that case, so we read the file anyway.
   */
  async stopAndSend(): Promise<VoiceRecordingResult | null> {
    if (!this.recorder) throw new Error('No recording in progress');
    const recorder = this.recorder;
    this.recorder = null;

    // Make sure the native encoder has had time to commit at least a
    // few frames before we stop, otherwise Android's MediaRecorder
    // raises `RuntimeException: stop failed`. Imperceptible to the user
    // (it's only enforced when they release the button almost
    // immediately after pressing it).
    const elapsedMs = Date.now() - this.startedAt;
    if (elapsedMs < MIN_RECORD_BEFORE_STOP_MS) {
      await delay(MIN_RECORD_BEFORE_STOP_MS - elapsedMs);
    }

    // Stop natively — swallow `stop failed`; we read the URI ourselves.
    await safeStopRecorder(recorder);

    const uri = recorder.uri;
    const totalElapsedMs = Date.now() - this.startedAt;

    // Sub-250ms releases are accidental brushes against the mic
    // button — drop them silently without alerting.
    if (totalElapsedMs < MIN_USEFUL_MS || !uri) {
      if (uri) safeDeleteFile(uri);
      return null;
    }

    // Read the file as base64 and pack into a data URL the bubble can play.
    //
    // expo-file-system SDK 54 (v19.x) replaced the function-style API with
    // `File` / `Directory` classes. The old `readAsStringAsync`,
    // `getInfoAsync` and `deleteAsync` exports are now deprecation stubs that
    // THROW at runtime (the "Couldn't send voice" alert), so this uses the
    // `File` class instead.
    const read = await readRecordingBase64(uri);
    if (!read) {
      // File missing / empty — usually means the native side rejected
      // the stop AND failed to flush anything. Treat as a silent
      // accidental tap rather than a hard error.
      safeDeleteFile(uri);
      return null;
    }

    const { base64, sizeBytes } = read;

    if (base64.length > 1_400_000) {
      safeDeleteFile(uri);
      throw new Error('Voice note too long. Try a shorter clip.');
    }

    const durationSeconds = Math.max(1, Math.round(totalElapsedMs / 1000));

    // Best-effort cleanup so we don't leave a temp file around.
    safeDeleteFile(uri);

    return {
      dataUrl: `data:audio/m4a;base64,${base64}`,
      mimeType: 'audio/m4a',
      sizeBytes,
      durationSeconds,
    };
  }

  /** Throw away whatever was being recorded (drag-up cancel). */
  async cancel(): Promise<void> {
    if (!this.recorder) return;
    const recorder = this.recorder;
    this.recorder = null;
    // Same minimum-duration guard so the cancel path doesn't itself
    // trigger a native `stop failed` log spam.
    const elapsedMs = Date.now() - this.startedAt;
    if (elapsedMs < MIN_RECORD_BEFORE_STOP_MS) {
      await delay(MIN_RECORD_BEFORE_STOP_MS - elapsedMs);
    }
    await safeStopRecorder(recorder);
    if (recorder.uri) {
      safeDeleteFile(recorder.uri);
    }
  }

  /** Seconds since `start` was called. Useful for UI countdowns. */
  elapsedSeconds(): number {
    if (!this.recorder) return 0;
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
