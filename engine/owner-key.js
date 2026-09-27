/**
 * The owner key: who may change or delete a saved activity (2026-09-27).
 *
 * There are no accounts. Until now the overwrite and delete routes took
 * any user row by id from any visitor, and every id rides back on the
 * games list for picking a fresh copy id, so anyone could remove another
 * teacher's copy (the likeliest way a reviewer's yard went from nine to
 * three). Each browser now makes one random secret (`MyGames.ownerKey`,
 * sent as the `x-owner-key` header on every /api/games request); the
 * server stores its hash with the row on save and requires a match on
 * overwrite and delete. The owner password still opens everything.
 *
 * Rows saved before the key exists are unowned. The browser that lists
 * them as its own (`?mine=`) claims them on that read, and an overwrite
 * with a key claims too; a delete never claims (the yard's bin comes
 * after the list, so the row is claimed by then), so an unowned row
 * cannot be deleted by a stranger while it waits for its browser.
 *
 * Pure: the store lives in services/owner-keys.js.
 */
import { createHash } from 'node:crypto';

export const OWNER_KEY_HEADER = 'x-owner-key';

const KEY_SHAPE = /^[A-Za-z0-9_-]{16,80}$/;

/** True for a secret the client could have minted (base64url-ish, 16 to 80 chars). */
export function isValidOwnerKey(key) {
  return typeof key === 'string' && KEY_SHAPE.test(key);
}

/** The stored form: a sha256 hex of the secret, so a leaked table hands out nothing. */
export function hashOwnerKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

/**
 * The hash of the key a request carries, or null when it carries none or
 * a malformed one (treated as no key: the request may read, never write
 * another browser's row).
 */
export function ownerHashFromRequest(req) {
  const raw = req && req.headers ? req.headers[OWNER_KEY_HEADER] : undefined;
  const key = Array.isArray(raw) ? raw[0] : raw;
  return isValidOwnerKey(key) ? hashOwnerKey(key) : null;
}

/**
 * What a write may do.
 *   owner  - the owner password: anything
 *   match  - the row's key and the request's agree
 *   claim  - the row has no key yet and the request brings one
 *   deny   - the row belongs to another key, or no key was sent
 * @param {{storedHash: string|null|undefined, presentedHash: string|null, owner: boolean}} p
 * @returns {'owner'|'match'|'claim'|'deny'}
 */
export function writeDecision({ storedHash, presentedHash, owner }) {
  if (owner) return 'owner';
  if (!presentedHash) return 'deny';
  if (!storedHash) return 'claim';
  return storedHash === presentedHash ? 'match' : 'deny';
}

/** The line a teacher reads when a write is refused. */
export const NOT_YOURS_MESSAGE = 'This activity was saved from another browser, so it cannot be changed or deleted here. Open it from the browser that made it, or save your own copy.';
