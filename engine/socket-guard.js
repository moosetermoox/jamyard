/**
 * The one gate every socket event passes through (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md: a rule that lived in CLAUDE.md as
 * "a new gameplay handler must call checkEventPayload and
 * isStalePhaseEvent" is now a chokepoint, so no handler can forget).
 *
 * `guardSocket(socket, deps)` replaces `socket.on` so that before any
 * handler runs:
 *  1. the payload is checked against its schema in EVENT_SCHEMAS (an event
 *     with no schema passes as-is); a bad payload is answered with
 *     `event-rejected` and the handler never runs;
 *  2. when the schema declares `phaseInstanceId` and the client sent one,
 *     a stale event (the room moved on before it arrived) is dropped
 *     through `deps.isStale(room, id, event)`;
 *  3. a throwing handler is logged, never thrown (a late Close once took
 *     the whole server down).
 *
 * Handlers may still check again after an `await` (a Close that lands
 * mid-moderation), but the first check is no longer theirs to remember.
 */
import { EVENT_SCHEMAS, validatePayload } from './event-schemas.js';

export const REJECTED_EVENT = 'event-rejected';

/**
 * @param {{on: Function, emit: Function, id?: string}} socket a socket.io socket
 * @param {object} deps
 * @param {(code: string) => object|null} deps.findRoom room by code, for the stale check
 * @param {(room: object, id: number, event: string) => boolean} deps.isStale
 * @param {(event: string, err: Error) => void} [deps.onError]
 * @param {(event: string, reason: string) => void} [deps.onInvalid]
 * @returns the same socket, patched
 */
export function guardSocket(socket, { findRoom, isStale, onError, onInvalid } = {}) {
  const rawOn = socket.on.bind(socket);
  socket.on = (event, handler) => rawOn(event, async (...args) => {
    const payload = args[0] == null ? {} : args[0];
    const schema = EVENT_SCHEMAS[event];
    if (schema) {
      const result = validatePayload(event, payload);
      if (!result.ok) {
        if (onInvalid) onInvalid(event, result.reason);
        socket.emit(REJECTED_EVENT, { event, reason: result.reason });
        return;
      }
      if (schema.phaseInstanceId && payload.phaseInstanceId != null && findRoom && isStale) {
        const room = findRoom(payload.code);
        if (room && isStale(room, payload.phaseInstanceId, event)) return;
      }
    }
    try {
      await handler(...args);
    } catch (err) {
      if (onError) onError(event, err);
      else console.error(`[socket:${String(event)}] Unhandled handler error (room kept alive):`, err);
    }
  });
  return socket;
}
