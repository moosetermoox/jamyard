/**
 * A per-student token ({{X.mine}}, {{X.assigned}}, the pair tokens, a
 * station) has no recipient on the projector, so the projector shows a
 * stand-in there (server.js resolveTemplate reads it off
 * engine/per-player-template.js's PROJECTOR_PLACEHOLDERS, one map for every
 * suffix since 2026-10-03; tests/engine/per-player-suffix.test.js keeps the
 * map in step with the list of suffixes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PER_PLAYER_SUFFIXES } from '../../engine/resolver-grammar.js';
import { PROJECTOR_PLACEHOLDERS, projectorPlaceholder } from '../../engine/per-player-template.js';

describe('projector notes for per-student tokens', () => {
  it('every per-student suffix has a note, none reaches the projector raw', () => {
    for (const suffix of PER_PLAYER_SUFFIXES) {
      const note = projectorPlaceholder(`ask.${suffix}`);
      expect(typeof note, suffix).toBe('string');
      expect(note, suffix).toBe(PROJECTOR_PLACEHOLDERS[suffix]);
    }
  });

  it('the longer suffix wins: partnerSide is the other side, side is their own', () => {
    expect(projectorPlaceholder('ask.partnerSide')).toBe('the other side');
    expect(projectorPlaceholder('ask.side')).toBe('their side');
    expect(projectorPlaceholder('ask.partner')).toBe('…');
  });

  it('the server reads the map in resolveTemplate', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    const fn = server.slice(server.indexOf('function resolveTemplate(template, engine)'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('projectorPlaceholder(trimmed)');
  });
});
