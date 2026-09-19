import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// vanity-urls.json maps memorable paths to activities (jamyard.org/good-question).
// The server refuses bad slugs loudly at startup; this test catches them
// before they ever ship.

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', '..', 'vanity-urls.json');

// Mirror of VANITY_RESERVED in server.js — a slug that shadows a real
// surface would hijack that page for every visitor.
const RESERVED = new Set([
  'api', 'host', 'player', 'teacher', 'library', 'designer', 'prototype',
  'guide', 'owner', 'feedback', 'privacy', 'shared', 'socket.io'
]);

describe('vanity-urls.json', () => {
  const raw = readFileSync(FILE, 'utf8');

  it('parses as a flat object of slug -> game id strings', () => {
    const map = JSON.parse(raw);
    expect(map).toBeTypeOf('object');
    expect(Array.isArray(map)).toBe(false);
    for (const [slug, gameId] of Object.entries(map)) {
      expect(gameId, `slug "${slug}" must map to a game id string`).toBeTypeOf('string');
    }
  });

  it('every slug is url-safe and none shadows a real surface', () => {
    const map = JSON.parse(raw);
    for (const slug of Object.keys(map)) {
      expect(slug, `slug "${slug}" must be lowercase letters, numbers, hyphens`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(RESERVED.has(slug), `slug "${slug}" collides with a reserved route`).toBe(false);
    }
  });

  it('every target looks like a valid game id', () => {
    const map = JSON.parse(raw);
    for (const [slug, gameId] of Object.entries(map)) {
      expect(gameId, `target of "${slug}"`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});
