/**
 * Socket.IO client wrapper.
 *
 * Singleton — one connection per logged-in user. We connect lazily on
 * first use and disconnect on logout. The auth token is read fresh from
 * the store on every connect so a refresh cycle picks up the new token.
 *
 * Why a wrapper instead of using socket.io-client directly:
 *   - Centralised handshake (auth token in `auth.token`)
 *   - Single source of truth for the URL (env-driven)
 *   - Simpler hot-reload story (one place to teardown + rebuild)
 *
 * Phase 4 will add `chat:*` and `notification:*` namespaces. For Phase 2
 * we just listen for `application:status_changed`.
 */

import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;
let currentToken: string | null = null;

/**
 * Connect (or reconnect with a new token). Idempotent — calling with the
 * same token while already connected is a no-op.
 */
export function connectSocket(accessToken: string): Socket {
  if (socket && currentToken === accessToken && socket.connected) {
    return socket;
  }
  // Token changed or not connected — tear down and rebuild.
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentToken = accessToken;
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token: accessToken },
    reconnectionDelay: 1500,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
