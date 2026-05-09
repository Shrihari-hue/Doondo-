/**
 * Chat endpoints — strongly-typed wrappers around apiRequest.
 */

import { apiRequest } from './client';
import type { PublicConversation, PublicMessage } from './types';

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

  sendMessage: (conversationId: string, body: string) =>
    apiRequest<{ message: PublicMessage }>(
      `/conversations/${conversationId}/messages`,
      { method: 'POST', body: { body } },
    ),

  markRead: (conversationId: string) =>
    apiRequest<{ conversation: PublicConversation }>(
      `/conversations/${conversationId}/read`,
      { method: 'POST' },
    ),
};
