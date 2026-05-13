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
 */

import { Audio } from 'expo-audio';
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
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg_4' as const,
    audioEncoder: 'aac' as const,
    sampleRate: 32_000,
    numberOfChannels: 1,
    bitRate: 64_000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'mpeg4aac' as const,
    audioQuality: 96 as const, // HIGH
    sampleRate: 32_000,
    numberOfChannels: 1,
    bitRate: 64_000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64_000,
  },
};

/**
 * VoiceRecorder — start, stop, cancel. Holds the live recorder reference
 * internally so the caller just toggles state.
 */
export class VoiceRecorder {
  private recorder: Audio.AudioRecorder | null = null;
  private startedAt = 0;

  /** Throws if permission is denied. */
  async start(): Promise<void> {
    const perm = await Audio.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Microphone permission denied');
    }
    await Audio.setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    const recorder = await Audio.AudioRecorder.createAsync(RECORDING_OPTIONS);
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
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Size from filesystem info — fall back to base64 length estimate.
    let sizeBytes = Math.ceil(base64.length * 0.75);
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
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
