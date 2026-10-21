/**
 * Voice ID (roadmap bet #43) — provider interface for speaker verification
 * as an optional app-lock unlock method.
 *
 * Status: NOT ACTIVE. Real speaker verification needs an on-device engine
 * (recommended: Picovoice Eagle — `@picovoice/eagle-react-native`, needs a
 * paid AccessKey) because cloud options were retired (Azure Speaker
 * Recognition ended Sept 2025) and sending voiceprints to a server is a
 * privacy risk for this audience. Until a provider is plugged in,
 * `getVoiceIdProvider()` returns the `none` provider and no UI appears.
 *
 * Design constraints any provider must meet (from the roadmap's concerns):
 *   - voiceprint stays on the device (never uploaded);
 *   - always has a PIN / device-biometric fallback (colds, noise);
 *   - never the only factor for money movement.
 */

export interface VoiceIdProvider {
  readonly name: string;
  /** True when the engine is installed and licensed on this device. */
  isAvailable(): Promise<boolean>;
  /** Record a few seconds of speech and store the voiceprint on-device. */
  enroll(): Promise<{ ok: boolean; reason?: string }>;
  /** Listen once and compare against the stored voiceprint. */
  verify(): Promise<{ match: boolean; score: number }>;
  /** Delete the on-device voiceprint. */
  reset(): Promise<void>;
}

const noneProvider: VoiceIdProvider = {
  name: 'none',
  isAvailable: async () => false,
  enroll: async () => ({ ok: false, reason: 'Voice ID is not available in this build.' }),
  verify: async () => ({ match: false, score: 0 }),
  reset: async () => undefined,
};

let provider: VoiceIdProvider = noneProvider;

/** Register a real engine at startup (e.g. an Eagle-backed provider). */
export function setVoiceIdProvider(p: VoiceIdProvider): void {
  provider = p;
}

export function getVoiceIdProvider(): VoiceIdProvider {
  return provider;
}
