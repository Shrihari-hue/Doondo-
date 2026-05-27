/**
 * WhatsApp API — admin inbox + send.
 *
 * Backed by /api/v1/whatsapp on the backend; all calls require the
 * authenticated user to have role=admin (the backend enforces this).
 *
 * The "thread" concept is mobile-side only: we group messages by the
 * non-Doondo party in (from, to). Sandbox uses Twilio's shared number
 * (+14155238886) as the Doondo side; production uses TWILIO_WHATSAPP_FROM.
 */

import { apiRequest } from './client';

export type WhatsAppDirection = 'outbound' | 'inbound';

export type WhatsAppStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'undelivered'
  | 'received';

export interface WhatsAppMessage {
  _id: string;
  sid: string;
  direction: WhatsAppDirection;
  from: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  status: WhatsAppStatus;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListResult {
  messages: WhatsAppMessage[];
}

export interface SendTextResult {
  sid: string;
  status: WhatsAppStatus;
  to: string;
}

export const whatsappApi = {
  list: (params: {
    direction?: WhatsAppDirection;
    from?: string;
    limit?: number;
  } = {}) => {
    const search = new URLSearchParams();
    if (params.direction) search.set('direction', params.direction);
    if (params.from) search.set('from', params.from);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiRequest<ListResult>(`/whatsapp/inbox${qs ? `?${qs}` : ''}`);
  },

  sendText: (args: { to: string; body: string; userId?: string }) =>
    apiRequest<SendTextResult>('/whatsapp/send-text', {
      method: 'POST',
      body: args,
    }),

  sendTemplate: (args: {
    to: string;
    contentSid: string;
    variables?: Record<string, string>;
    userId?: string;
  }) =>
    apiRequest<SendTextResult>('/whatsapp/send-template', {
      method: 'POST',
      body: args,
    }),
};

/**
 * Group a flat message list into one thread per "other party". The
 * Doondo side of every message is whichever address matches the
 * configured WhatsApp sender — for everything else, we pick the
 * non-doondoNumber side as the counterparty.
 */
export interface Thread {
  /** "whatsapp:+E164" of the other party. */
  peer: string;
  /** Human-readable phone — strip the "whatsapp:" prefix. */
  peerPhone: string;
  messages: WhatsAppMessage[];
  /** Newest createdAt in the thread. Drives sort order. */
  lastAt: string;
  /** True if the last message was inbound and we haven't replied since. */
  awaitingReply: boolean;
}

export function groupIntoThreads(
  messages: WhatsAppMessage[],
  doondoNumber: string | null,
): Thread[] {
  const byPeer = new Map<string, WhatsAppMessage[]>();
  for (const m of messages) {
    // Counterparty is whichever side isn't the Doondo sender.
    let peer: string;
    if (doondoNumber && m.from === doondoNumber) peer = m.to;
    else if (doondoNumber && m.to === doondoNumber) peer = m.from;
    else peer = m.direction === 'inbound' ? m.from : m.to;

    const arr = byPeer.get(peer) ?? [];
    arr.push(m);
    byPeer.set(peer, arr);
  }

  const threads: Thread[] = [];
  for (const [peer, msgs] of byPeer.entries()) {
    msgs.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const last = msgs[msgs.length - 1]!;
    threads.push({
      peer,
      peerPhone: peer.replace(/^whatsapp:/, ''),
      messages: msgs,
      lastAt: last.createdAt,
      awaitingReply: last.direction === 'inbound',
    });
  }
  threads.sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );
  return threads;
}
