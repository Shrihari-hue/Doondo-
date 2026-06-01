/**
 * VoicePostButton — the employer-side "speak a job post" control.
 *
 * The employer taps the mic and says a sentence — *"2 dishwashers, Friday
 * night, ₹600"* — and the form below pre-fills. It is the employer mirror
 * of the seeker voice agent: the same speech-to-text adapter, the same
 * honest degradation, but here the recognised speech goes to
 * `POST /post-draft/voice`, which returns a structured *draft* (it never
 * publishes — the employer still confirms the pre-filled form).
 *
 * Self-contained: it owns its listening state, calls the post-draft API,
 * and hands the parsed draft up via `onDraft`. When no speech-recognition
 * module is present it renders nothing, so PostJobScreen is unchanged for
 * those builds — the typed form is always the source of truth.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';
import { haptic } from '@/lib/haptics';
import { loadRecognizer, sttLangFor, type Recognizer } from '@/lib/speechToText';
import {
  postDraftApi,
  type JobDraft,
  type DraftMissingField,
} from '@/api/postDraft.api';

export interface VoicePostButtonProps {
  /**
   * Called when a draft comes back. `missing` lists the essentials the
   * parser couldn't hear so the screen can nudge the employer to fill
   * them; `transcript` is what the parser acted on.
   */
  onDraft: (
    draft: JobDraft,
    missing: DraftMissingField[],
    transcript: string,
  ) => void;
}

export function VoicePostButton({ onDraft }: VoicePostButtonProps) {
  const { theme } = useTheme();
  const t = useTranslate();
  const { locale } = useLocale();

  const [recognizer, setRecognizer] = useState<Recognizer | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [failed, setFailed] = useState(false);

  // Latest recognised text, mirrored into a ref so the recogniser's "end"
  // callback reads the final transcript without capturing stale state.
  const transcriptRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void loadRecognizer().then((r) => {
      if (cancelled) return;
      setRecognizer(r);
      setAvailable(!!r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Send the final transcript to the draft endpoint and surface the draft.
  const submitTranscript = async (text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await postDraftApi.voice({ transcript });
      haptic('success');
      onDraft(res.draft, res.missing, res.transcript);
      setLiveText('');
    } catch {
      setFailed(true);
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  const startListening = async () => {
    if (!recognizer || listening || busy) return;
    transcriptRef.current = '';
    setLiveText('');
    setFailed(false);
    setListening(true);
    haptic('light');
    await recognizer.start(
      sttLangFor(locale),
      (text) => {
        transcriptRef.current = text;
        setLiveText(text);
      },
      () => {
        setListening(false);
        void submitTranscript(transcriptRef.current);
      },
      () => {
        setListening(false);
        setFailed(true);
      },
    );
  };

  const stopListening = async () => {
    if (!recognizer) return;
    await recognizer.stop();
    setListening(false);
  };

  // No native speech module on this build — stay out of the way entirely.
  if (available === false) return null;
  if (available === null) return null;

  const active = listening || busy;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: active ? theme.brand.hero : theme.border.default,
        backgroundColor: active ? theme.brand.heroSubtle : theme.bg.surface,
        borderRadius: radii.lg,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('employer.voice_post.mic_label')}
        onPress={listening ? stopListening : startListening}
        disabled={busy}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? theme.brand.hero : theme.brand.heroSubtle,
          }}
        >
          {busy ? (
            <ActivityIndicator color={active ? theme.bg.surface : theme.brand.hero} />
          ) : (
            <Text style={{ fontSize: 20 }}>{listening ? '⏹' : '🎤'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="semibold">
            {busy
              ? t('employer.voice_post.thinking')
              : listening
                ? t('employer.voice_post.listening')
                : t('employer.voice_post.title')}
          </Text>
          <Text variant="footnote" tone="tertiary">
            {t('employer.voice_post.hint')}
          </Text>
        </View>
      </Pressable>

      {liveText ? (
        <Text variant="footnote" tone="secondary" style={{ fontStyle: 'italic' }}>
          “{liveText}”
        </Text>
      ) : null}

      {failed ? (
        <Text variant="footnote" tone="danger">
          {t('employer.voice_post.failed')}
        </Text>
      ) : null}
    </View>
  );
}
