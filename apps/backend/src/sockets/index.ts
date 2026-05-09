/**
 * Socket.IO bootstrap.
 *
 * For Phase 1 we only set up the server, attach a JWT auth handshake, and
 * log connect/disconnect. Phase 4 fills in the namespaces and events:
 *   - chat (rooms per conversation)
 *   - notifications (per-user room)
 *   - calls (1:1 signaling: offer/answer/ICE candidates)
 *   - presence (online/typing)
 *
 * The handshake reads the access token from `auth.token` (preferred) or
 * the `Authorization: Bearer ...` header, in case different transports
 * (websocket vs polling fallback) prefer different shapes.
 */

import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { env } from '@/config/env';
import { verifyAccessToken, type UserRole } from '@/lib/jwt';
import { logger } from '@/lib/logger';

// Socket.IO supports typing socket.data via the SocketData generic on the
// Server / Socket types. We use that instead of module augmentation so we
// don't collide with library-side declarations.
export interface AuthedSocketData {
  userId: string;
  role: UserRole;
}

type AppIO = IOServer<
  Record<string, never>, // ListenEvents (we only emit, no incoming)
  Record<string, never>, // EmitEvents — refined as Phase 4 lands
  Record<string, never>, // ServerSideEvents
  AuthedSocketData
>;

type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthedSocketData
>;

export function attachSockets(httpServer: HttpServer): AppIO {
  const io: AppIO = new IOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use((socket, next) => {
    try {
      const token = readSocketToken(socket);
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyAccessToken(token);
      socket.data = { userId: payload.sub, role: payload.role };
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(
      { userId: socket.data.userId, socketId: socket.id },
      'socket connected',
    );
    // Join a personal room — used for direct notifications later.
    socket.join(`user:${socket.data.userId}`);

    socket.on('disconnect', (reason) => {
      logger.info(
        { userId: socket.data.userId, socketId: socket.id, reason },
        'socket disconnected',
      );
    });
  });

  return io;
}

function readSocketToken(socket: AppSocket): string | null {
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
  if (fromAuth) return fromAuth;
  const header = socket.handshake.headers['authorization'];
  if (typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) return token;
  }
  return null;
}
