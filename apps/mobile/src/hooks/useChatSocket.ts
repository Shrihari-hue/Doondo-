/**
 * useChatSocket — keeps chat React Query caches live.
 *
 * Listens for five events on the singleton socket:
 *   - chat:message_received       (new message FOR me)
 *   - chat:conversation_bumped    (some thread got a new message; both sides)
 *   - chat:read                   (other side read my messages)
 *   - chat:message_transcribed    (a voice note's transcript is ready)
 *   - chat:message_translated     (a text message's translation is ready)
 *
 * On each event we mutate the relevant React Query cache (conversation
 * list + active-conversation message list) so the UI updates without a
 * refetch round-trip. The socket itself is connected by useApplicationSocket
 * — we just attach extra listeners here.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket } from '@/lib/socket';
import type { PublicConversation, PublicMessage } from '@/api/types';

interface BumpedPayload {
  conversationId: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastSenderId: string;
  unreadIncrement?: number;
}

interface ReadPayload {
  conversationId: string;
  readAt: string;
  readerId: string;
}

interface TranscribedPayload {
  conversationId: string;
  messageId: string;
  transcript: string;
}

interface TranslatedPayload {
  conversationId: string;
  messageId: string;
  translation: {
    text: string;
    sourceLang: string;
    targetLang: string;
    provider: string;
  } | null;
  status: 'none' | 'pending' | 'done' | 'failed';
}

export function useChatSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;

    const socket = connectSocket(accessToken);

    const onMessage = (msg: PublicMessage) => {
      // Append to the active conversation's message cache.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', msg.conversationId],
        (prev) => {
          if (!prev) return prev;
          // Avoid double-insert if the sender's own optimistic add already
          // landed.
          if (prev.messages.some((m) => m.id === msg.id)) return prev;
          return { ...prev, messages: [msg, ...prev.messages] };
        },
      );
    };

    const onBumped = (p: BumpedPayload) => {
      queryClient.setQueryData<{ conversations: PublicConversation[] } | undefined>(
        ['chat', 'conversations'],
        (prev) => {
          if (!prev) return prev;
          const next = [...prev.conversations];
          const idx = next.findIndex((c) => c.id === p.conversationId);
          if (idx >= 0) {
            const c = next[idx]!;
            next[idx] = {
              ...c,
              lastMessageAt: p.lastMessageAt,
              lastMessagePreview: p.lastMessagePreview,
              lastSenderId: p.lastSenderId,
              unread: c.unread + (p.unreadIncrement ?? 0),
            };
            // Re-sort newest first.
            next.sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() -
                new Date(a.lastMessageAt).getTime(),
            );
          }
          return { conversations: next };
        },
      );
    };

    const onRead = (p: ReadPayload) => {
      // Update read receipts in the active conversation's messages.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', p.conversationId],
        (prev) => {
          if (!prev) return prev;
          // The reader is the OTHER side; mark MY (not-the-reader's) sent
          // messages as read.
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.senderId !== p.readerId && !m.readAt ? { ...m, readAt: p.readAt } : m,
            ),
          };
        },
      );
    };

    const onTranscribed = (p: TranscribedPayload) => {
      // A voice note's transcript landed — patch it onto the message
      // already in the active conversation's cache.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', p.conversationId],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === p.messageId ? { ...m, transcript: p.transcript } : m,
            ),
          };
        },
      );
    };

    const onTranslated = (p: TranslatedPayload) => {
      // A text message's translation status changed (pending → done /
      // failed, or a retry restarted it) — patch it onto the message
      // already in the active conversation's cache.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', p.conversationId],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === p.messageId
                ? { ...m, translation: p.translation, translationStatus: p.status }
                : m,
            ),
          };
        },
      );
    };

    socket.on('chat:message_received', onMessage);
    socket.on('chat:conversation_bumped', onBumped);
    socket.on('chat:read', onRead);
    socket.on('chat:message_transcribed', onTranscribed);
    socket.on('chat:message_translated', onTranslated);

    return () => {
      socket.off('chat:message_received', onMessage);
      socket.off('chat:conversation_bumped', onBumped);
      socket.off('chat:read', onRead);
      socket.off('chat:message_transcribed', onTranscribed);
      socket.off('chat:message_translated', onTranslated);
    };
  }, [accessToken, status, queryClient]);
}
