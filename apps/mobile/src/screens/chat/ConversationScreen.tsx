/**
 * ConversationScreen — Doondo blue chat thread.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  ←   [avatar]  Counterpart name              │  header
 *   │                re: Job title                 │
 *   ├──────────────────────────────────────────────┤
 *   │                                              │
 *   │           [received bubble]                  │  inverted FlatList
 *   │ [sent bubble — blue]                          │
 *   │                                              │
 *   ├──────────────────────────────────────────────┤
 *   │  📎 Message…                       [send]    │  composer
 *   └──────────────────────────────────────────────┘
 *
 * Bubbles (see ChatListScreen.tsx for the shared BLUE/isLight consts):
 *   - sent     → solid BLUE with white text, right-aligned
 *   - received → card surface with primary text, left-aligned
 *   - verified counterpart's bubbles get a subtle blue hairline
 *   - read receipts under sent bubbles ("Read" in blue when read)
 *
 * Optimistic send: messages appear instantly with id="optimistic-…",
 * replaced by the real message once the API call returns. Failed sends
 * stay in place with a "Tap to retry" affordance.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, LoadingSpinner, Pill, BlurOverlay} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { chatApi, type SendMessageInput } from '@/api/chat.api';
import { haptic } from '@/lib/haptics';
import { pickChatImage } from '@/lib/chatImage';
import { pickChatVideo } from '@/lib/chatVideo';
import { VoiceRecorder, VOICE_MAX_SECONDS, type VoiceRecordingResult } from '@/lib/chatVoice';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useLocale } from '@/i18n/LanguageProvider';
import { Image } from 'react-native';
import { useTranslate } from '@/i18n/useTranslate';
import {
  quickRepliesForRole,
  renderMessageBody,
  type QuickReply,
} from '@/lib/quickReplyCatalog';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type {
  MessageAttachment,
  MessageTranslation,
  PublicMessage,
} from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Conversation'>;
type Route = RouteProp<AppStackParamList, 'Conversation'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

// Doondo design language — see ChatListScreen.tsx (direct sibling reference)
// for the same values.
const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here
const RED = '#EF4444';

/** How the reader wants foreign-language messages shown. */
type TranslateMode = 'both' | 'translation-only';

/**
 * Per-conversation translate-mode preference. Module-level so the
 * choice survives navigating out of and back into a thread within the
 * session (a tiny preference store, not worth persisting to disk).
 */
const translateModeByConversation = new Map<string, TranslateMode>();

/**
 * Top-level export wraps in seekerLight palette ONLY when the current
 * user is a seeker. Employers viewing chat keep their warm-dark theme.
 */
export function ConversationScreen() {
  const { user } = useAuth();
  if (user?.role === 'seeker') {
    return (
      <SeekerThemeOverride>
        <ConversationScreenInner />
      </SeekerThemeOverride>
    );
  }
  return <ConversationScreenInner />;
}

function ConversationScreenInner() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const bg = theme.bg.canvas;
  const cardBg = theme.bg.surface;
  const cardBorder = theme.border.default;
  const textPrimary = theme.text.primary;
  const textSecondary = theme.text.secondary;
  const heroSubtle = theme.brand.primarySubtle;
  const queryClient = useQueryClient();
  const t = useTranslate();
  const [draft, setDraft] = useState('');

  const conversationId = route.params.conversationId;

  // Per-thread translate preference — 'both' shows the translation with
  // the original tucked beneath; 'translation-only' hides the original.
  const [translateMode, setTranslateMode] = useState<TranslateMode>(
    () => translateModeByConversation.get(conversationId) ?? 'both',
  );
  function toggleTranslateMode() {
    haptic('selection');
    setTranslateMode((prev) => {
      const next: TranslateMode = prev === 'both' ? 'translation-only' : 'both';
      translateModeByConversation.set(conversationId, next);
      return next;
    });
  }

  // Translation sheet — pick the language THIS thread renders in.
  const [langSheetOpen, setLangSheetOpen] = useState(false);

  const headerQuery = useQuery({
    queryKey: ['chat', 'conversation', conversationId],
    queryFn: () => chatApi.detail(conversationId),
  });

  // The caller's per-conversation translation language (null = app locale).
  const convo = headerQuery.data?.conversation;
  const myTranslationLang =
    convo && user?.id
      ? user.id === convo.seekerId
        ? (convo.translationLangSeeker ?? null)
        : (convo.translationLangEmployer ?? null)
      : null;

  const setLangMutation = useMutation({
    mutationFn: (lang: 'en' | 'hi' | 'ta' | 'te' | 'kn' | null) =>
      chatApi.setTranslationLang(conversationId, lang),
    onSuccess: () => {
      haptic('success');
      setLangSheetOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] });
    },
    onError: () => haptic('error'),
  });

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => chatApi.listMessages(conversationId, { limit: 50 }),
  });

  // Mark as read whenever this screen has focus + we have unread.
  useEffect(() => {
    void chatApi.markRead(conversationId).catch(() => undefined);
    // Also clear local unread on the list cache.
    queryClient.setQueryData<{ conversations: PublicMessage[] } | undefined>(
      ['chat', 'conversations'],
      (prev) => prev,
    );
  }, [conversationId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (input: SendMessageInput) => chatApi.sendMessage(conversationId, input),
    onMutate: async (input) => {
      // Optimistic insert. Mirrors the eventual server shape.
      const optimistic: PublicMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderId: user?.id ?? 'me',
        kind: input.kind ?? (input.attachment ? 'image' : 'text'),
        body: input.body ?? '',
        attachment: input.attachment ?? null,
        templateKey: input.templateKey ?? null,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? { ...prev, messages: [optimistic, ...prev.messages] }
            : { messages: [optimistic], hasMore: false },
      );
      return { optimisticId: optimistic.id };
    },
    onSuccess: ({ message }, _body, ctx) => {
      // Replace optimistic with the real message.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === ctx?.optimisticId ? message : m,
                ),
              }
            : prev,
      );
      haptic('selection');
    },
    onError: (_err, _body, ctx) => {
      // Mark the optimistic as failed so the UI can show retry. We
      // overwrite the body to a recognisable shape.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === ctx?.optimisticId
                    ? { ...m, id: `failed-${m.id}` }
                    : m,
                ),
              }
            : prev,
      );
      haptic('error');
    },
  });

  // Retry a failed translation — the backend re-emits 'pending' over the
  // socket, so the bubble flips straight back to the shimmer.
  const retryTranslateMutation = useMutation({
    mutationFn: (messageId: string) => chatApi.retranslate(conversationId, messageId),
  });
  function onRetryTranslate(messageId: string) {
    haptic('light');
    retryTranslateMutation.mutate(messageId);
  }

  const messages = messagesQuery.data?.messages ?? [];
  const counterpart = headerQuery.data?.conversation.counterpart;
  const job = headerQuery.data?.conversation.job;
  const displayName =
    counterpart?.companyName ?? counterpart?.name ?? t('conversation.fallback_name');

  function onSend() {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    setDraft('');
    sendMutation.mutate({ body: trimmed, kind: 'text' });
  }

  /**
   * Send a pre-translated quick reply. The English text rides along as
   * `body` (the fallback); `templateKey` is what lets the recipient's
   * app re-render the message in their own language.
   */
  function sendQuickReply(qr: QuickReply) {
    if (sendMutation.isPending) return;
    haptic('selection');
    setDraft('');
    sendMutation.mutate({ kind: 'text', body: qr.en, templateKey: qr.key });
  }

  /**
   * Paperclip menu — image (camera or gallery) or video.
   */
  function onAttach() {
    haptic('light');
    Alert.alert(t('conversation.attach_alert_title'), t('conversation.attach_alert_body'), [
      { text: t('conversation.attach_camera'), onPress: () => void attachImage('camera') },
      { text: t('conversation.attach_gallery'), onPress: () => void attachImage('library') },
      { text: t('conversation.attach_video'), onPress: () => void attachVideo() },
      { text: t('conversation.attach_cancel'), style: 'cancel' },
    ]);
  }

  async function attachImage(source: 'camera' | 'library') {
    try {
      const picked = await pickChatImage({ source });
      if (!picked) return; // user cancelled
      sendMutation.mutate({
        kind: 'image',
        body: draft.trim() || undefined,
        attachment: picked,
      });
      setDraft('');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('conversation.photo_error_default');
      Alert.alert(t('conversation.photo_error_title'), message);
      haptic('error');
    }
  }

  async function attachVideo() {
    try {
      const picked = await pickChatVideo();
      if (!picked) return;
      sendMutation.mutate({
        kind: 'video',
        body: draft.trim() || undefined,
        attachment: picked,
      });
      setDraft('');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('conversation.video_error_default');
      Alert.alert(t('conversation.video_error_title'), message);
      haptic('error');
    }
  }

  // ─── Voice recording (tap-to-toggle on the mic FAB) ──────────────────────
  //
  // Flow:
  //   tap mic        → startVoice() — open recorder, subscribe to level
  //                    updates + start live transcription
  //   tap mic again  → stopVoice('preview') — pull captured audio + samples
  //                    into `pendingVoice` and show the pre-send preview
  //   preview Send   → sendMutation.mutate(pendingVoice)
  //   preview Cancel → discard pendingVoice silently

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  /** Live 0..1 input level from the recorder's metering stream. */
  const [recordLevel, setRecordLevel] = useState(0);
  /** Live partial transcript streamed by expo-speech-recognition. */
  const [liveTranscript, setLiveTranscript] = useState('');
  /** Captured-but-not-yet-sent voice note shown in the preview UI. */
  const [pendingVoice, setPendingVoice] = useState<VoiceRecordingResult | null>(
    null,
  );
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Cleanup callbacks for the speech-recognition listeners. */
  const speechSubsRef = useRef<Array<{ remove: () => void }>>([]);

  // i18n locale → BCP-47 tag the speech recognizer understands. We
  // assume Indian variants given the user base; English defaults to en-IN
  // (better local accent coverage than en-US).
  const { locale } = useLocale();
  const speechLang = (
    {
      en: 'en-IN',
      hi: 'hi-IN',
      kn: 'kn-IN',
      ta: 'ta-IN',
      te: 'te-IN',
    } as const
  )[locale] ?? 'en-IN';

  function detachSpeechListeners() {
    for (const s of speechSubsRef.current) {
      try {
        s.remove();
      } catch {
        /* best-effort */
      }
    }
    speechSubsRef.current = [];
  }

  /**
   * Start streaming speech-recognition partials so the user can SEE
   * what's being captured as they speak. Pure UX overlay — totally
   * detached from the audio recording (we keep the real m4a + send the
   * authoritative server-side transcript separately).
   *
   * Best-effort: any failure (permission denied, language not supported,
   * recognizer busy on Android 12 emulators, etc.) just leaves the
   * live-transcript line empty rather than alerting.
   */
  async function startLiveTranscription() {
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return;
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return;

      detachSpeechListeners();
      const subs: Array<{ remove: () => void }> = [];
      subs.push(
        ExpoSpeechRecognitionModule.addListener('result', (e) => {
          // Pick the highest-confidence alternative and stream the
          // (possibly partial) transcript to the UI.
          const best = e.results?.[0];
          if (best?.transcript) setLiveTranscript(best.transcript);
        }),
      );
      subs.push(
        ExpoSpeechRecognitionModule.addListener('error', () => {
          // Don't surface — live transcription is a "nice to have". The
          // real transcript still arrives from the backend after send.
          setLiveTranscript('');
        }),
      );
      speechSubsRef.current = subs;

      ExpoSpeechRecognitionModule.start({
        lang: speechLang,
        interimResults: true,
        continuous: true,
        // `requiresOnDeviceRecognition: false` defaults to using whatever
        // the platform offers; we don't force on-device because Indian
        // language packs are inconsistent across OEMs.
      });
    } catch {
      /* best-effort */
    }
  }

  function stopLiveTranscription() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* best-effort */
    }
    detachSpeechListeners();
  }

  async function startVoice() {
    haptic('light');
    if (recording) return;
    setLiveTranscript('');
    setRecordLevel(0);
    try {
      const r = new VoiceRecorder();
      await r.start();
      recorderRef.current = r;
      setRecording(true);
      setRecordSeconds(0);
      // Drive the meter from the recorder's live metering stream.
      r.onLevel((lvl) => setRecordLevel(lvl));
      // Tick a UI counter + auto-stop at the max duration. The auto-stop
      // routes through the same preview path as a manual stop.
      tickIntervalRef.current = setInterval(() => {
        const s = r.elapsedSeconds();
        setRecordSeconds(s);
        if (s >= VOICE_MAX_SECONDS) {
          void stopVoice('preview');
        }
      }, 250);
      // Kick off live transcription in parallel — pure UI overlay.
      void startLiveTranscription();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t('conversation.voice_record_error_default');
      Alert.alert(t('conversation.voice_record_error_title'), msg);
      haptic('error');
      setRecording(false);
    }
  }

  /**
   * Stop the recorder. Three modes:
   *   'preview' — capture audio, route into the pre-send preview UI
   *   'send'    — capture audio, send immediately (used by max-duration
   *               auto-stop + the preview's Send button via setSend)
   *   'cancel'  — throw away whatever was captured, no preview, no send
   */
  async function stopVoice(mode: 'preview' | 'cancel') {
    const r = recorderRef.current;
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    setRecording(false);
    setRecordSeconds(0);
    setRecordLevel(0);
    recorderRef.current = null;
    stopLiveTranscription();
    if (!r) return;
    if (mode === 'cancel') {
      await r.cancel();
      setLiveTranscript('');
      haptic('light');
      return;
    }
    try {
      const result = await r.stopAndSend();
      // `null` = accidental tap or empty file. stopAndSend already
      // swallowed any native "stop failed" exception, so just bail.
      if (!result) {
        setLiveTranscript('');
        haptic('light');
        return;
      }
      if (result.durationSeconds < 1) {
        setLiveTranscript('');
        haptic('light');
        return;
      }
      // Route into the pre-send preview rather than sending immediately.
      setPendingVoice(result);
      haptic('selection');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t('conversation.voice_send_error_default');
      Alert.alert(t('conversation.voice_send_error_title'), msg);
      haptic('error');
    }
  }

  /** Confirm-send from the preview UI. */
  function confirmSendPendingVoice() {
    if (!pendingVoice) return;
    sendMutation.mutate({ kind: 'voice', attachment: pendingVoice });
    setPendingVoice(null);
    setLiveTranscript('');
    haptic('selection');
  }

  /** Discard the captured-but-not-sent voice note. */
  function discardPendingVoice() {
    setPendingVoice(null);
    setLiveTranscript('');
    haptic('light');
  }

  // Clean up the ticker, recorder, and speech recogniser on unmount.
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      void recorderRef.current?.cancel();
      stopLiveTranscription();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: cardBorder,
            backgroundColor: bg,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={textPrimary} />
          </Pressable>
          <Avatar
            name={displayName}
            photoUrl={counterpart?.photoUrl ?? null}
            size={40}
            premium={counterpart?.isVerified}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', color: textPrimary }}
              >
                {displayName}
              </Text>
              {counterpart?.isVerified && (
                <Pill label={t('conversation.verified_pill')} tone="premium" leading="★" />
              )}
            </View>
            {job?.title && (
              <Text numberOfLines={1} style={{ fontSize: 12, color: textSecondary }}>
                {t('conversation.re_prefix', { title: job.title })}
              </Text>
            )}
          </View>

          {/* Translation settings — opens a sheet with the display-mode
              toggle AND a per-thread language picker. Tinted when an
              override or translation-only mode is active. */}
          <Pressable
            onPress={() => {
              haptic('selection');
              setLangSheetOpen(true);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('conversation.translate_toggle_a11y')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                translateMode === 'translation-only' || myTranslationLang
                  ? heroSubtle
                  : 'transparent',
            }}
          >
            <Feather
              name="globe"
              size={18}
              color={translateMode === 'translation-only' || myTranslationLang ? BLUE : textSecondary}
            />
          </Pressable>
        </View>

        {/* Messages */}
        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : messages.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.xl,
              gap: spacing.sm,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: BLUE + '33',
                backgroundColor: BLUE + '0D',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.xs,
              }}
            >
              <Feather name="message-circle" size={24} color={BLUE} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>
              {t('conversation.empty_say_hello')}
            </Text>
            <Text style={{ fontSize: 13, color: textSecondary, textAlign: 'center' }}>
              {user?.role === 'employer'
                ? t('conversation.empty_hint_employer')
                : t('conversation.empty_hint_seeker')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.lg,
              gap: spacing.xs,
            }}
            renderItem={({ item, index }) => {
              const next = messages[index - 1]; // newer (because inverted)
              const sameSenderAsNext = next?.senderId === item.senderId;
              return (
                <MessageBubble
                  message={item}
                  isMine={item.senderId === user?.id}
                  showTail={!sameSenderAsNext}
                  isVerifiedCounterpart={Boolean(counterpart?.isVerified)}
                  translateMode={translateMode}
                  onRetryTranslate={onRetryTranslate}
                  t={t}
                />
              );
            }}
          />
        )}

        {/* Quick-reply bar — pre-translated chips. Hidden once the user
            starts typing so it never competes with a real draft, and while
            a voice note is being recorded or previewed so its floating
            banner (bottom: 80, sized for the composer alone) never has to
            clear this bar's variable height too. */}
        {draft.trim().length === 0 && !recording && !pendingVoice && (
          <QuickReplyBar
            role={user?.role}
            disabled={sendMutation.isPending}
            onPick={sendQuickReply}
            t={t}
          />
        )}

        {/* Composer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: spacing.xs,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.lg,
            borderTopWidth: 1,
            borderTopColor: cardBorder,
            backgroundColor: bg,
          }}
        >
          {/* Attachment icon — image picker (camera or gallery) */}
          <IconCircleButton icon="paperclip" onPress={onAttach} />

          {/* Text input */}
          <View
            style={{
              flex: 1,
              backgroundColor: cardBg,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: cardBorder,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              minHeight: 44,
              maxHeight: 130,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('conversation.composer_placeholder')}
              placeholderTextColor={textSecondary}
              multiline
              style={{
                color: textPrimary,
                fontSize: 15,
                lineHeight: 20,
                paddingTop: 6,
                paddingBottom: 6,
              }}
            />
          </View>

          {/* Mic OR send — toggles based on whether there's text.
              Tap-to-toggle: first tap starts recording, second tap stops
              and sends. (The previous hold-to-record gesture turned a
              normal tap into a sub-second clip — pressing and releasing
              fired both onPressIn and onPressOut in a single tap, which
              meant the mic appeared to "auto-send" the moment it was
              touched.) The recording banner below still exposes a
              Cancel button for discarding without sending. */}
          {draft.trim().length === 0 ? (
            <Pressable
              onPress={() => {
                if (recording) {
                  void stopVoice('preview');
                } else if (pendingVoice) {
                  // Tapping the mic with a preview pending should resend
                  // it rather than start a new recording — matches user
                  // expectation when the preview is on-screen.
                  confirmSendPendingVoice();
                } else {
                  void startVoice();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={
                recording
                  ? t('conversation.a11y_stop_recording')
                  : t('conversation.a11y_start_recording')
              }
              accessibilityState={{ selected: recording }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: recording ? RED : BLUE,
                shadowColor: recording ? RED : BLUE,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
              }}
            >
              <Feather name={recording ? 'square' : 'mic'} size={18} color="#FFFFFF" />
            </Pressable>
          ) : (
            <SendButton
              disabled={sendMutation.isPending}
              onPress={onSend}
              sending={sendMutation.isPending}
            />
          )}
        </View>

        {/* Pre-send preview — replaces the recording banner once the
            recording is captured. Lets the user listen back before
            committing the message. */}
        {pendingVoice && !recording && (
          <PendingVoicePreview
            attachment={pendingVoice}
            transcript={liveTranscript}
            onSend={confirmSendPendingVoice}
            onDiscard={discardPendingVoice}
            t={t}
          />
        )}

        {/* Recording banner overlay — shows live level meter + elapsed
            time + Cancel (discard) + Send. The Send action mirrors
            tapping the mic button again, but we surface it here too so
            first-time users don't have to guess "tap mic again to send".
            The live transcript pill below the banner streams whatever
            the device speech recognizer hears — a confidence-boost
            ("the phone is hearing me") that also lets the user catch
            misrecording before they send. */}
        {recording && (
          <View
            style={{
              position: 'absolute',
              left: spacing.lg,
              right: spacing.lg,
              bottom: 80,
              gap: spacing.xs,
            }}
          >
            {liveTranscript.length > 0 && (
              <View
                style={{
                  alignSelf: 'stretch',
                  backgroundColor: 'rgba(15, 23, 42, 0.92)',
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.md,
                }}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 13,
                    lineHeight: 18,
                    fontStyle: 'italic',
                  }}
                  numberOfLines={3}
                >
                  {liveTranscript}
                </Text>
              </View>
            )}
            <View
              style={{
                backgroundColor: RED,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radii.pill,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 20 }}>●</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                  {formatSeconds(recordSeconds)}
                </Text>
                <LiveLevelMeter level={recordLevel} />
              </View>
            <Pressable onPress={() => void stopVoice('cancel')} hitSlop={8}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {t('conversation.recording_cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void stopVoice('preview')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('conversation.a11y_stop_recording')}
              style={{
                backgroundColor: '#FFFFFF',
                paddingHorizontal: spacing.md,
                paddingVertical: 4,
                borderRadius: radii.pill,
              }}
            >
              <Text style={{ color: RED, fontWeight: '700' }}>
                {t('conversation.recording_send')}
              </Text>
            </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Translation settings sheet — display mode + per-thread language. */}
      <Modal
        visible={langSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLangSheetOpen(false)}
      >
        <BlurOverlay>
        <Pressable
          onPress={() => setLangSheetOpen(false)}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
              {t('conversation.lang_sheet_title')}
            </Text>

            {/* Display mode */}
            <Pressable
              onPress={toggleTranslateMode}
              accessibilityRole="switch"
              accessibilityState={{ checked: translateMode === 'translation-only' }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={{ flex: 1, fontSize: 14, color: textPrimary }}>
                {t('conversation.lang_sheet_only_translation')}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: BLUE }}>
                {translateMode === 'translation-only'
                  ? t('conversation.lang_sheet_on')
                  : t('conversation.lang_sheet_off')}
              </Text>
            </Pressable>

            <Text style={{ fontSize: 12, color: textSecondary }}>
              {t('conversation.lang_sheet_hint')}
            </Text>

            {(
              [
                [null, t('conversation.lang_default')],
                ['en', 'English'],
                ['hi', 'हिन्दी'],
                ['ta', 'தமிழ்'],
                ['te', 'తెలుగు'],
                ['kn', 'ಕನ್ನಡ'],
              ] as Array<['en' | 'hi' | 'ta' | 'te' | 'kn' | null, string]>
            ).map(([lang, label]) => {
              const selected = myTranslationLang === lang || (!myTranslationLang && lang === null);
              return (
                <Pressable
                  key={lang ?? 'default'}
                  onPress={() => setLangMutation.mutate(lang)}
                  disabled={setLangMutation.isPending}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.lg,
                    backgroundColor: selected ? heroSubtle : 'transparent',
                    opacity: setLangMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: selected ? '700' : '400',
                      color: selected ? BLUE : textPrimary,
                    }}
                  >
                    {label}
                  </Text>
                  {selected ? <Feather name="check" size={16} color={BLUE} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
        </BlurOverlay>
      </Modal>
    </Screen>
  );
}

function formatSeconds(s: number): string {
  const whole = Math.max(0, Math.floor(s));
  const m = Math.floor(whole / 60);
  const r = whole % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─── Composer icon buttons ───────────────────────────────────────────────────

function IconCircleButton({
  icon,
  filled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  filled?: boolean;
  onPress: () => void;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const cardBorder = theme.border.default;
  const textSecondary = theme.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? BLUE : 'transparent',
        borderWidth: filled ? 0 : 1,
        borderColor: cardBorder,
      }}
    >
      <Feather name={icon} size={19} color={filled ? theme.text.onBrand : textSecondary} />
    </Pressable>
  );
}

// ─── Quick-reply bar ─────────────────────────────────────────────────────────

/**
 * Horizontal strip of pre-translated quick-reply chips above the
 * composer. The chip shows the template in the *sender's* language;
 * tapping it sends the message with its templateKey so the recipient
 * reads it in theirs.
 */
function QuickReplyBar({
  role,
  disabled,
  onPick,
  t,
}: {
  role: string | null | undefined;
  disabled: boolean;
  onPick: (qr: QuickReply) => void;
  t: TFn;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const bg = theme.bg.canvas;
  const cardBg = theme.bg.surface;
  const cardBorder = theme.border.default;
  const textSecondary = theme.text.secondary;
  const replies = quickRepliesForRole(role);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{
        maxHeight: 56,
        borderTopWidth: 1,
        borderTopColor: cardBorder,
        backgroundColor: bg,
      }}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        gap: spacing.xs,
      }}
    >
      {replies.map((qr) => (
        <Pressable
          key={qr.key}
          onPress={() => onPick(qr)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t(qr.key)}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: cardBorder,
            backgroundColor: cardBg,
            opacity: pressed || disabled ? 0.5 : 1,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: textSecondary }} numberOfLines={1}>
            {t(qr.key)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Bubble ─────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMine,
  showTail,
  isVerifiedCounterpart,
  translateMode,
  onRetryTranslate,
  t,
}: {
  message: PublicMessage;
  isMine: boolean;
  showTail: boolean;
  isVerifiedCounterpart: boolean;
  translateMode: TranslateMode;
  onRetryTranslate: (messageId: string) => void;
  t: TFn;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const cardBg = theme.bg.surface;
  const cardBorder = theme.border.default;
  const textSecondary = theme.text.secondary;
  const failed = message.id.startsWith('failed-');
  const optimistic = message.id.startsWith('optimistic-');

  const bg = isMine ? BLUE : cardBg;
  const fg = isMine ? theme.text.onBrand : theme.text.primary;

  return (
    <View
      style={{
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        marginBottom: showTail ? spacing.xs : 1,
      }}
    >
      <View
        style={{
          backgroundColor:
            failed ? RED : message.kind === 'image' ? 'transparent' : bg,
          paddingHorizontal: message.kind === 'image' ? 0 : 12,
          paddingVertical: message.kind === 'image' ? 0 : 8,
          borderRadius: radii.lg,
          // Slight asymmetric corner on the tail side for the "speech" feel.
          borderBottomRightRadius: isMine && showTail ? 4 : radii.lg,
          borderBottomLeftRadius: !isMine && showTail ? 4 : radii.lg,
          borderWidth: !isMine ? 1 : 0,
          borderColor: !isMine && isVerifiedCounterpart ? BLUE + '55' : cardBorder,
          opacity: optimistic ? 0.75 : 1,
          overflow: 'hidden',
        }}
      >
        {message.kind === 'image' && message.attachment ? (
          <ImageAttachment
            attachment={message.attachment}
            caption={message.body}
            isMine={isMine}
            captionBg={bg}
            captionFg={fg}
            t={t}
          />
        ) : message.kind === 'voice' && message.attachment ? (
          <VoiceAttachment
            attachment={message.attachment}
            isMine={isMine}
            fg={fg}
            transcript={message.transcript}
            translation={message.translation}
            t={t}
          />
        ) : message.kind === 'video' && message.attachment ? (
          <VideoAttachment
            attachment={message.attachment}
            caption={message.body}
            captionBg={bg}
            captionFg={fg}
          />
        ) : (
          <TranslatedText
            message={message}
            isMine={isMine}
            fg={fg}
            mode={translateMode}
            onRetry={onRetryTranslate}
            t={t}
          />
        )}
      </View>
      {/* Read receipt for sent messages */}
      {isMine && !optimistic && !failed && (
        <Text
          style={{
            fontSize: 11,
            alignSelf: 'flex-end',
            marginTop: 2,
            marginRight: 6,
            color: message.readAt ? BLUE : textSecondary,
          }}
        >
          {message.readAt ? t('conversation.receipt_read') : t('conversation.receipt_sent')}
        </Text>
      )}
      {failed && (
        <Text
          style={{ fontSize: 11, color: RED, alignSelf: 'flex-end', marginTop: 2, marginRight: 6 }}
        >
          {t('conversation.send_failed')}
        </Text>
      )}
    </View>
  );
}

// ─── Translated text (inverted hierarchy) ────────────────────────────────────

/**
 * Renders a text message with its auto-translation. For a received
 * foreign-language message the translation IS the message — shown
 * primary, with the original tucked beneath (dimmed, tap to expand).
 * 'translation-only' mode hides the original entirely. A quiet
 * "auto-translated" line keeps the reader from over-trusting it on a
 * high-stakes message (wage, address).
 */
function TranslatedText({
  message,
  isMine,
  fg,
  mode,
  onRetry,
  t,
}: {
  message: PublicMessage;
  isMine: boolean;
  fg: string;
  mode: TranslateMode;
  onRetry: (messageId: string) => void;
  t: TFn;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const original = renderMessageBody(message.body, message.templateKey, t);
  const status = message.translationStatus ?? 'none';

  // My own messages, quick-reply templates (already per-locale), and
  // same-language messages render as plain text.
  if (isMine || message.templateKey || status === 'none') {
    return (
      <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>{original}</Text>
    );
  }

  // In flight — a shimmer holds the space so the bubble doesn't jump
  // when the translation lands.
  if (status === 'pending') {
    return (
      <View style={{ gap: 6 }}>
        <TranslatingShimmer color={fg} label={t('conversation.translating')} />
        <Text style={{ color: fg, fontSize: 13, lineHeight: 19, opacity: 0.5 }}>
          {original}
        </Text>
      </View>
    );
  }

  // Failed (or over budget) — show the original + a tap-to-retry.
  if (status === 'failed' || !message.translation) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>{original}</Text>
        <Pressable onPress={() => onRetry(message.id)} hitSlop={6} accessibilityRole="button">
          <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE }}>
            {t('conversation.translate_retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Done — the translation is the message; the original is secondary.
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>
        {message.translation.text}
      </Text>

      {mode === 'both' ? (
        <Pressable
          onPress={() => setShowOriginal((v) => !v)}
          hitSlop={4}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: fg, opacity: 0.5 }}>
            {showOriginal
              ? t('conversation.hide_original')
              : t('conversation.show_original')}
          </Text>
          {showOriginal ? (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 19,
                color: fg,
                opacity: 0.55,
                marginTop: 3,
              }}
            >
              {original}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      <Text style={{ fontSize: 10, color: fg, opacity: 0.4, marginTop: 1 }}>
        {t('conversation.auto_translated')}
      </Text>
    </View>
  );
}

// ─── Translating shimmer ─────────────────────────────────────────────────────

/** A gently pulsing placeholder shown while a translation is in flight. */
function TranslatingShimmer({ color, label }: { color: string; label: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pulse }}
    >
      <View
        style={{ width: 56, height: 9, borderRadius: 5, backgroundColor: color, opacity: 0.22 }}
      />
      <Text style={{ fontSize: 11, fontStyle: 'italic', color, opacity: 0.6 }}>
        {label}
      </Text>
    </Animated.View>
  );
}

// ─── Image attachment renderer ───────────────────────────────────────────────

function ImageAttachment({
  attachment,
  caption,
  isMine,
  captionBg,
  captionFg,
  t,
}: {
  attachment: MessageAttachment;
  caption: string;
  isMine: boolean;
  captionBg: string;
  captionFg: string;
  t: TFn;
}) {
  // Reserve a 4:3 layout slot when we don't have dimensions, otherwise
  // use the real aspect ratio so the bubble doesn't jump when the image
  // paints.
  const aspect =
    attachment.width && attachment.height
      ? attachment.width / attachment.height
      : 4 / 3;
  // Clamp to a reasonable bubble width — full max-width 240 looks good
  // on the typical phone without dominating the thread.
  const width = 240;
  const height = Math.round(width / aspect);

  return (
    <View>
      <Image
        source={{ uri: attachment.dataUrl }}
        style={{
          width,
          height,
          backgroundColor: '#00000020',
        }}
        resizeMode="cover"
        accessibilityLabel={caption ? t('conversation.photo_a11y_with_caption', { caption }) : t('conversation.photo_a11y')}
      />
      {caption.length > 0 && (
        <View
          style={{
            backgroundColor: captionBg,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: captionFg, fontSize: 14, lineHeight: 19 }}>
            {caption}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Voice attachment renderer ───────────────────────────────────────────────

function VoiceAttachment({
  attachment,
  isMine,
  fg,
  transcript,
  translation,
  t,
}: {
  attachment: MessageAttachment;
  isMine: boolean;
  fg: string;
  transcript?: string | null;
  translation?: MessageTranslation | null;
  t: TFn;
}) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preparing, setPreparing] = useState(false);
  /** Playback speed — 1x → 1.5x → 2x cycle. Cycles via a small pill. */
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function cycleSpeed() {
    const next: 1 | 1.5 | 2 = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    const p = playerRef.current;
    if (p) {
      try {
        // expo-audio v1.x exposes `playbackRate` as a settable property
        // AND a `setPlaybackRate` method. We use the method when present
        // because it accepts the pitch-correction quality argument too.
        if (typeof (p as { setPlaybackRate?: unknown }).setPlaybackRate === 'function') {
          (p as { setPlaybackRate: (r: number) => void }).setPlaybackRate(next);
        } else {
          (p as { playbackRate?: number }).playbackRate = next;
        }
      } catch {
        /* best-effort */
      }
    }
  }

  /**
   * Materialise the base64 data URL to a temp file, then create the
   * player. expo-audio's native player can't reliably play a `data:`
   * URI, so we write the bytes to the cache dir and play that file.
   */
  async function ensurePlayer(): Promise<AudioPlayer | null> {
    if (playerRef.current) return playerRef.current;
    const match = /^data:[^;]+;base64,(.*)$/.exec(attachment.dataUrl);
    if (!match) return null;
    try {
      const fs = await import('expo-file-system/legacy');
      const uri = `${fs.cacheDirectory ?? ''}voice-${Date.now()}.m4a`;
      await fs.writeAsStringAsync(uri, match[1] ?? '', {
        encoding: fs.EncodingType.Base64,
      });
      const player = createAudioPlayer(uri);
      playerRef.current = player;
      return player;
    } catch {
      return null;
    }
  }

  async function toggle() {
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
      stopTick();
      return;
    }
    setPreparing(true);
    const p = await ensurePlayer();
    setPreparing(false);
    if (!p) return;
    // Restart from the beginning if it had played to the end.
    if (p.duration > 0 && p.currentTime >= p.duration - 0.2) {
      await p.seekTo(0);
      setElapsed(0);
    }
    p.play();
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const cur = player.currentTime ?? 0;
      const dur = player.duration ?? 0;
      setElapsed(cur);
      if (dur > 0 && cur >= dur - 0.2) {
        player.pause();
        void player.seekTo(0);
        setPlaying(false);
        setElapsed(0);
        stopTick();
      }
    }, 200);
  }

  useEffect(() => {
    return () => {
      stopTick();
      try {
        playerRef.current?.remove();
      } catch {
        /* best-effort */
      }
    };
  }, []);

  const duration = attachment.durationSeconds ?? 0;
  const shown = playing ? elapsed : duration;
  const showTranslation =
    !isMine && translation != null && translation.text.length > 0;

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => void toggle()}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 4,
          paddingVertical: 2,
          minWidth: 150,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {preparing ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <Feather name={playing ? 'pause' : 'play'} size={15} color={fg} />
          )}
        </View>
        {/* Playback waveform — bars sized from the captured metering
            samples on the attachment. Each bar gets two colour stops:
            "played" (full fg) and "remaining" (fg @ 30% alpha) so the
            user can see progress at a glance, the same way WhatsApp /
            Telegram render voice notes. */}
        <View style={{ flex: 1 }}>
          <PlaybackWaveform
            samples={attachment.waveform ?? null}
            progress={duration > 0 ? Math.min(1, elapsed / duration) : 0}
            color={fg}
            fallbackSeed={attachment.dataUrl}
          />
        </View>
        <Text style={{ fontSize: 12, color: fg, minWidth: 36, textAlign: 'right' }}>
          {fmt(shown)}
        </Text>
      </Pressable>

      {/* Speed control pill — only meaningful once the user is playing
          (or has played) a clip, but always visible so the affordance
          is discoverable. Tapping cycles 1x → 1.5x → 2x → 1x. */}
      <Pressable
        onPress={cycleSpeed}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Playback speed ${speed}x`}
        style={{
          alignSelf: 'flex-start',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
          backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)',
          marginLeft: 46, // align under the waveform, past the play button
        }}
      >
        <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>
          {speed === 1 ? '1x' : speed === 1.5 ? '1.5x' : '2x'}
        </Text>
      </Pressable>

      {/* Auto-transcript — arrives a few seconds after the note is sent,
          pushed in live via the chat:message_transcribed socket event. */}
      {transcript ? (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: fg,
            opacity: 0.8,
            fontStyle: 'italic',
            paddingHorizontal: 4,
          }}
        >
          {transcript}
        </Text>
      ) : null}

      {/* Translation of the transcript into the reader's language —
          shown on received notes when the spoken language differs. */}
      {showTranslation && translation ? (
        <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: 'rgba(0,0,0,0.12)',
            paddingTop: 5,
            paddingHorizontal: 4,
            gap: 2,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '600', color: fg, opacity: 0.5 }}>
            {t('conversation.auto_translated')}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: fg, opacity: 0.9 }}>
            {translation.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function fmt(s: number): string {
  const whole = Math.max(0, Math.floor(s));
  const m = Math.floor(whole / 60);
  const r = whole % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─── Video attachment renderer ───────────────────────────────────────────────

function VideoAttachment({
  attachment,
  caption,
  captionBg,
  captionFg,
}: {
  attachment: MessageAttachment;
  caption: string;
  captionBg: string;
  captionFg: string;
}) {
  // We don't auto-play in-bubble — show a thumbnail-ish frame with a big
  // play overlay. Tap opens the system video player (Linking.openURL on
  // the data URL). A full inline expo-video player can replace this if
  // we want autoplay on visible bubbles later.
  const aspect = attachment.width && attachment.height ? attachment.width / attachment.height : 16 / 9;
  const width = 240;
  const height = Math.round(width / aspect);

  return (
    <View>
      <View
        style={{
          width,
          height,
          backgroundColor: '#0F172A',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="play" size={20} color="#FFFFFF" style={{ marginLeft: 2 }} />
        </View>
        <Text
          style={{
            position: 'absolute',
            bottom: 6,
            right: 8,
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '600',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
          }}
        >
          {fmt(attachment.durationSeconds ?? 0)}
        </Text>
      </View>
      {caption.length > 0 && (
        <View style={{ backgroundColor: captionBg, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: captionFg, fontSize: 14, lineHeight: 19 }}>{caption}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Send button ────────────────────────────────────────────────────────────

function SendButton({
  disabled,
  sending,
  onPress,
}: {
  disabled: boolean;
  sending: boolean;
  onPress: () => void;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const mutedBg = theme.border.default;
  const textSecondary = theme.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: disabled ? mutedBg : BLUE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {sending ? (
        <ActivityIndicator size="small" color={disabled ? textSecondary : theme.text.onBrand} />
      ) : (
        <Feather name="send" size={17} color={disabled ? textSecondary : theme.text.onBrand} />
      )}
    </Pressable>
  );
}

// ─── Live level meter (recording UI) ─────────────────────────────────────────

/**
 * Bouncing row of vertical bars driven by the recorder's live metering.
 * Each bar has a slightly different multiplier so the meter has motion
 * even when the level is steady — feels alive, not a single fat bar.
 *
 * Animations: a single Animated.Value `level` is what drives the bars;
 * we interpolate it through different ranges for each bar to fake
 * staggered movement without spawning N animated values per render.
 */
function LiveLevelMeter({ level }: { level: number }) {
  // useRef so the value is stable across renders.
  const animated = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Smoothly animate to the new level — abrupt level changes look
    // glitchy. 120ms is fast enough to feel responsive without flicker.
    Animated.timing(animated, {
      toValue: level,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [level, animated]);

  // 8 bars across the meter, each with a different per-bar weight so
  // they don't all jump in lockstep. Weights chosen to feel "live"
  // rather than uniform.
  const BAR_WEIGHTS = [0.7, 1.0, 0.55, 0.85, 1.0, 0.6, 0.9, 0.75];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 18,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {BAR_WEIGHTS.map((w, i) => {
        const minH = 3;
        const maxH = 18;
        const range = (maxH - minH) * w;
        const height = animated.interpolate({
          inputRange: [0, 1],
          outputRange: [minH, minH + range],
        });
        return (
          <Animated.View
            key={i}
            style={{
              width: 3,
              height,
              borderRadius: 2,
              backgroundColor: '#FFFFFF',
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Pre-send preview ────────────────────────────────────────────────────────

/**
 * Shown above the composer after the user stops recording but BEFORE
 * the voice note is sent. Lets them listen back, then commit (Send) or
 * throw it away (Discard). High value for low-literacy users who can't
 * easily verify a transcript before sending.
 */
function PendingVoicePreview({
  attachment,
  transcript,
  onSend,
  onDiscard,
  t,
}: {
  attachment: VoiceRecordingResult;
  transcript: string;
  onSend: () => void;
  onDiscard: () => void;
  t: TFn;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const cardBg = theme.bg.surface;
  const cardBorder = theme.border.default;
  const textPrimary = theme.text.primary;
  const textSecondary = theme.text.secondary;
  const playerRef = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function ensurePlayer(): Promise<AudioPlayer | null> {
    if (playerRef.current) return playerRef.current;
    const match = /^data:[^;]+;base64,(.*)$/.exec(attachment.dataUrl);
    if (!match) return null;
    try {
      const fs = await import('expo-file-system/legacy');
      const uri = `${fs.cacheDirectory ?? ''}voice-preview-${Date.now()}.m4a`;
      await fs.writeAsStringAsync(uri, match[1] ?? '', {
        encoding: fs.EncodingType.Base64,
      });
      const player = createAudioPlayer(uri);
      playerRef.current = player;
      return player;
    } catch {
      return null;
    }
  }

  async function toggle() {
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
      stopTick();
      return;
    }
    const p = await ensurePlayer();
    if (!p) return;
    if (p.duration > 0 && p.currentTime >= p.duration - 0.2) {
      await p.seekTo(0);
      setElapsed(0);
    }
    p.play();
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const cur = player.currentTime ?? 0;
      const dur = player.duration ?? 0;
      setElapsed(cur);
      if (dur > 0 && cur >= dur - 0.2) {
        player.pause();
        void player.seekTo(0);
        setPlaying(false);
        setElapsed(0);
        stopTick();
      }
    }, 200);
  }

  useEffect(() => {
    return () => {
      stopTick();
      try {
        playerRef.current?.remove();
      } catch {
        /* best-effort */
      }
    };
  }, []);

  const duration = attachment.durationSeconds ?? 0;
  const shown = playing ? elapsed : duration;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  return (
    <View
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: 80,
        backgroundColor: cardBg,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: cardBorder,
        padding: spacing.md,
        gap: spacing.sm,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => void toggle()}
          accessibilityRole="button"
          accessibilityLabel={t('conversation.preview_play_a11y')}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: BLUE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={playing ? 'pause' : 'play'} size={15} color={theme.text.onBrand} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <PlaybackWaveform
            samples={attachment.waveform ?? null}
            progress={progress}
            color={textPrimary}
            fallbackSeed={attachment.dataUrl}
          />
        </View>
        <Text style={{ fontSize: 12, color: textSecondary, minWidth: 36, textAlign: 'right' }}>
          {fmt(shown)}
        </Text>
      </View>

      {transcript.length > 0 && (
        <Text
          style={{ fontSize: 12, color: textSecondary, fontStyle: 'italic' }}
          numberOfLines={3}
        >
          {transcript}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={onDiscard}
          accessibilityRole="button"
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: cardBorder,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: textSecondary }}>
            {t('conversation.preview_discard')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSend}
          accessibilityRole="button"
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            backgroundColor: BLUE,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.onBrand }}>
            {t('conversation.preview_send')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Playback waveform ───────────────────────────────────────────────────────

/**
 * Vertical-bars waveform driven by the metering samples captured during
 * recording (or a deterministic synthesized waveform if samples are
 * missing — older messages, devices that didn't expose metering).
 *
 * The progress fraction (0..1) recolours the played portion; the
 * unplayed portion is drawn at 30% alpha. Looks the way WhatsApp and
 * Telegram render voice notes.
 */
function PlaybackWaveform({
  samples,
  progress,
  color,
  fallbackSeed,
}: {
  samples: number[] | null;
  progress: number;
  color: string;
  /**
   * When samples are missing we synthesize a deterministic waveform from
   * this string so the same message renders identically every time
   * (rather than reshuffling on every re-render).
   */
  fallbackSeed: string;
}) {
  const BAR_COUNT = 32;

  // Build the bar heights once per render — cheap, fully derived from
  // input props.
  const heights = useMemo(() => {
    if (samples && samples.length > 0) {
      return resampleTo(samples, BAR_COUNT);
    }
    return synthesizeWaveform(fallbackSeed, BAR_COUNT);
  }, [samples, fallbackSeed]);

  const playedBars = Math.round(progress * BAR_COUNT);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        height: 22,
      }}
    >
      {heights.map((h, i) => {
        // Map h (0..1) to a min/max bar height — keep a minimum so even
        // silent stretches render as visible dots rather than nothing.
        const barH = Math.max(3, Math.round(h * 20));
        const played = i < playedBars;
        return (
          <View
            key={i}
            style={{
              width: 2.5,
              height: barH,
              borderRadius: 1.5,
              backgroundColor: color,
              opacity: played ? 1 : 0.32,
            }}
          />
        );
      })}
    </View>
  );
}

/** Resample an arbitrary-length 0..1 array to exactly `target` bins. */
function resampleTo(input: number[], target: number): number[] {
  if (input.length === target) return input;
  const out: number[] = new Array(target);
  if (input.length === 0) {
    for (let i = 0; i < target; i++) out[i] = 0;
    return out;
  }
  for (let i = 0; i < target; i++) {
    const start = Math.floor((i / target) * input.length);
    const end = Math.floor(((i + 1) / target) * input.length);
    let max = 0;
    for (let j = start; j <= end && j < input.length; j++) {
      const v = input[j] ?? 0;
      if (v > max) max = v;
    }
    out[i] = max;
  }
  // Light normalisation so a quiet recording still uses the full
  // height range — better visual than a sea of tiny bars.
  const peak = out.reduce((m, v) => (v > m ? v : m), 0);
  if (peak > 0 && peak < 0.95) {
    const scale = Math.min(1 / peak, 4);
    for (let i = 0; i < target; i++) out[i] = Math.min(1, out[i]! * scale);
  }
  return out;
}

/**
 * Cheap deterministic pseudo-random shape derived from a seed string.
 * Used when we have no real metering samples (older messages, devices
 * that didn't expose metering). Identical seeds always produce the
 * same shape, so re-renders don't reshuffle the waveform.
 */
function synthesizeWaveform(seed: string, count: number): number[] {
  // FNV-1a 32-bit hash — good enough for visual jitter.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    // Mix the index back into the hash so each bar is different.
    h ^= i + 0x9e3779b1;
    h = Math.imul(h, 0x85ebca6b);
    const r = ((h >>> 0) % 1000) / 1000;
    // Weight by a soft bell curve so the middle of the message is the
    // tallest — better than uniform noise; still feels like a voice.
    const t = i / (count - 1);
    const bell = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.3);
    out.push(Math.max(0.15, Math.min(1, 0.45 + r * 0.5 * bell)));
  }
  return out;
}
