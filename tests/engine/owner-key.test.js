/**
 * The owner key (2026-09-27): a saved activity can only be changed or
 * deleted by the browser that saved it, or by the owner. Rows from before
 * the key are claimed by the browser that lists them as its own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OWNER_KEY_HEADER, isValidOwnerKey, hashOwnerKey, ownerHashFromRequest, writeDecision, NOT_YOURS_MESSAGE
} from '../../engine/owner-key.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('the key itself', () => {
  it('accepts a base64url-ish secret of a sane length and nothing else', () => {
    expect(isValidOwnerKey('abcDEF0123456789_-')).toBe(true);
    expect(isValidOwnerKey('short')).toBe(false);
    expect(isValidOwnerKey('has spaces in it and is long')).toBe(false);
    expect(isValidOwnerKey('x'.repeat(81))).toBe(false);
    expect(isValidOwnerKey(null)).toBe(false);
    expect(isValidOwnerKey(42)).toBe(false);
  });
  it('hashes to a stable sha256 hex, never the secret itself', () => {
    const h = hashOwnerKey('abcDEF0123456789_-');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashOwnerKey('abcDEF0123456789_-'));
    expect(h).not.toContain('abcDEF');
  });
  it('reads the header off a request, and a bad header counts as none', () => {
    const key = 'abcDEF0123456789_-';
    expect(ownerHashFromRequest({ headers: { [OWNER_KEY_HEADER]: key } })).toBe(hashOwnerKey(key));
    expect(ownerHashFromRequest({ headers: { [OWNER_KEY_HEADER]: 'nope' } })).toBe(null);
    expect(ownerHashFromRequest({ headers: {} })).toBe(null);
    expect(ownerHashFromRequest(null)).toBe(null);
  });
});

describe('who may write', () => {
  const mine = hashOwnerKey('mine-mine-mine-mine');
  const theirs = hashOwnerKey('theirs-theirs-theirs');
  it('the owner password opens everything', () => {
    expect(writeDecision({ storedHash: theirs, presentedHash: null, owner: true })).toBe('owner');
  });
  it('a matching key writes; another key or no key is refused', () => {
    expect(writeDecision({ storedHash: mine, presentedHash: mine, owner: false })).toBe('match');
    expect(writeDecision({ storedHash: mine, presentedHash: theirs, owner: false })).toBe('deny');
    expect(writeDecision({ storedHash: mine, presentedHash: null, owner: false })).toBe('deny');
  });
  it('a row from before the key is claimed by the first key that writes it, never by no key', () => {
    expect(writeDecision({ storedHash: null, presentedHash: mine, owner: false })).toBe('claim');
    expect(writeDecision({ storedHash: undefined, presentedHash: mine, owner: false })).toBe('claim');
    expect(writeDecision({ storedHash: null, presentedHash: null, owner: false })).toBe('deny');
  });
  it('the refusal names what to do, without our words', () => {
    expect(NOT_YOURS_MESSAGE).toMatch(/another browser/);
    expect(NOT_YOURS_MESSAGE).not.toMatch(/owner key|hash|token/i);
    expect(NOT_YOURS_MESSAGE).not.toContain('—');
  });
});

describe('the wiring', () => {
  it('every page that writes an activity loads my-games.js, which sends the header on /api/games calls', () => {
    const mg = read('screens/shared/my-games.js');
    expect(mg).toContain("'X-Owner-Key'");
    expect(mg).toContain('function ownerKey()');
    expect(mg).toContain("'jamyard.ownerKey'");
    for (const page of ['designer/index.html', 'designer/editor.html', 'home/index.html', 'make/index.html', 'prototype/index.html', 'share/index.html', 'library/index.html']) {
      expect(read('screens/' + page), page).toContain('my-games.js');
    }
  });
  it('the server gates overwrite, delete, and the sample-answers save, stamps saves and copies, and claims on the mine list', () => {
    const server = read('server.js');
    expect(server).toContain("import { ownerHashFromRequest, writeDecision, NOT_YOURS_MESSAGE } from './engine/owner-key.js'");
    // the gate is one helper, used by every route that changes a user row
    expect(server.match(/await mayWriteUserGame\(/g).length).toBeGreaterThanOrEqual(3);
    expect(server).toContain('await ownerKeys.stamp(id, ownerHashFromRequest(req))');
    expect(server).toContain('await ownerKeys.stamp(newId, ownerHashFromRequest(req))');
    expect(server).toContain('await ownerKeys.claimMany(mine, presented)');
    // a delete never claims: the row waits for its own browser
    expect(server).toContain("{ claim: false }");
    const db = read('db.js');
    expect(db).toContain('ADD COLUMN IF NOT EXISTS owner_key TEXT');
    expect(db).toContain('export async function getUserGameOwnerKey');
    expect(db).toContain('export async function setUserGameOwnerKey');
    expect(db).toContain('export async function claimUserGames');
  });
});
