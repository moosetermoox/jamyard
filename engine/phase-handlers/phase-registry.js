/**
 * Phase handler registry.
 * Each handler is an object with: onEnter(ctx), onReconnect(ctx, socket),
 * and optionally onHostEvent(ctx, event, socket, payload),
 * onPlayerEvent(ctx, event, socket, payload).
 */
const handlers = new Map();

export function registerHandler(phaseType, handler) {
  handlers.set(phaseType, handler);
}

export function getHandler(phaseType) {
  return handlers.get(phaseType) || null;
}

export function hasHandler(phaseType) {
  return handlers.has(phaseType);
}
