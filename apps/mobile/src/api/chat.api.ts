/**
 * Chat endpoints — strongly-typed wrappers around apiRequest.
 */

import { apiRequest } from './client';
import type { MessageAttachment, PublicConversation, PublicMessage } from './types';

export interface SendMessageInput {
  /** Text body or caption. Required for kind: 'text'. */
  body?: string;
  /** Message kind. Defaults to 'text' if attachment is absent. */
  kind?: 'text' | 'image' | 'voice' | 'video';
  /** Required when kind !== 'text'. */
  attachment?: MessageAttachment | null;
  /** Quick-reply template key — set when sent from the quick-reply bar. */
  templateKey?: string;
}

export const chatApi = {
  listMine: () =>
    apiRequest<{ conversations: PublicConversation[] }>(`/conversations`),

  detail: (conversationId: string) =>
    apiRequest<{ conversation: PublicConversation }>(
      `/conversations/${conversationId}`,
    ),

  listMessages: (
    conversationId: string,
    params: { before?: string; limit?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.before) search.set('before', params.before);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiRequest<{ messages: PublicMessage[]; hasMore: boolean }>(
      `/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`,
    );
  },

  /**
   * Send a message. Accepts either a plain string (backwards-compatible
   * for any existing callers) or a structured input with attachment.
   */
  sendMessage: (
    conversationId: string,
    input: string | SendMessageInput,
  ) => {
    const body =
      typeof input === 'string'
        ? { body: input }
        : {
            body: input.body,
            kind: input.kind ?? (input.attachment ? 'image' : 'text'),
            attachment: input.attachment ?? null,
            templateKey: input.templateKey,
          };
    return apiRequest<{ message: PublicMessage }>(
      `/conversations/${conversationId}/messages`,
      { method: 'POST', body },
    );
  },

  markRead: (conversationId: string) =>
    apiRequest<{ conversation: PublicConversation }>(
      `/conversations/${conversationId}/read`,
      { method: 'POST' },
    ),

  /**
   * Idempotently get (or create) the chat for one of my applications.
   * Used by the seeker NewChat flow to start a thread before the
   * employer has shortlisted.
   */
  ensureFromApplication: (applicationId: string) =>
    apiRequest<{ conversationId: string }>(`/conversations/from-application`, {
      method: 'POST',
      body: { applicationId },
    }),
};
