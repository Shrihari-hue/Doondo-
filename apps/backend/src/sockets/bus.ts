/**
 * socketBus — services emit events to users without depending on Express
 * or Socket.IO directly. The IO instance is set once at boot from
 * src/index.ts (after buildApp returns it); services then call
 * `emitToUser(userId, event, payload)`.
 *
 * Why a getter pattern instead of importing `io` directly?
 *   - The IO instance only exists after server boot. Importing it at
 *     module-load time would require everything to depend on the boot
 *     order; this decouples it.
 *   - Easier to mock/no-op in tests.
 *
 * If a service emits before the bus is initialized (e.g. early test code),
 * the call is a silent no-op rather than a crash.
 */

import type { Server as IOServer } from 'socket.io';
import { logger } from '@/lib/logger';

let io: IOServer | null = null;

export function setIO(instance: IOServer): void {
  io = instance;
}

/** Emit an event to every socket joined to `user:<userId>`. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) {
    logger.warn({ userId, event }, 'emitToUser called before socket bus init — skipping');
    return;
  }
  io.to(`user:${userId}`).emit(event, payload);
}
