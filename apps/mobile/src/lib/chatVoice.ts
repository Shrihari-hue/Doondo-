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
import * as FileSystem from 'expo-file-system';

export interface VoiceRecordingResult {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
}

/** Max recording duration. */
export const VOICE_MAX_SECONDS = 60;

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
   * Throws if no recording is in progress or the file is empty.
   */
  async stopAndSend(): Promise<VoiceRecordingResult> {
    if (!this.recorder) throw new Error('No recording in progress');
    const recorder = this.recorder;
    this.recorder = null;

    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) throw new Error('Recorder produced no file');

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - this.startedAt) / 1000),
    );

    // Read the file as base64 and pack into a data URL the bubble can play.
    // `EncodingType` lives under the legacy entry in expo-file-system SDK 54+;
    // the bare 'base64' string literal works on every version we ship.
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as never,
    });

    // Size from filesystem info — fall back to base64 length estimate.
    let sizeBytes = Math.ceil(base64.length * 0.75);
    try {
      // `{ size: true }` option was removed in SDK 54+; size returns by default.
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && typeof (info as { size?: number }).size === 'number') {
        sizeBytes = (info as { size: number }).size;
      }
    } catch {
      /* best-effort */
    }

    if (base64.length > 1_400_000) {
      throw new Error('Voice note too long. Try a shorter clip.');
    }

    // Best-effort cleanup so we don't leave a temp file around.
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);

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
    try {
      await recorder.stop();
      if (recorder.uri) {
        await FileSystem.deleteAsync(recorder.uri, { idempotent: true });
      }
    } catch {
      /* best-effort */
    }
  }

  /** Seconds since `start` was called. Useful for UI countdowns. */
  elapsedSeconds(): number {
    if (!this.recorder) return 0;
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
