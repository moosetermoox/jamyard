/**
 * The per-player suffix is declared ONCE (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md, eighth pass, 2026-10-03). CLAUDE.md's
 * rule said "a new per-player suffix goes in four places": the grammar's
 * list, its token regex, the per-player template's replace chain, and the
 * projector's placeholder. The list is one now (PER_PLAYER_SUFFIXES in
 * resolver-grammar.js): the regexes are built from it, the resolvers and
 * the placeholders are maps keyed by it, and this test fails when a map
 * falls behind or a file grows its own list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PER_PLAYER_SUFFIXES, PER_PLAYER_TOKEN, KNOWN_SUFFIXES } from '../../engine/resolver-grammar.js';
import { RESOLVERS, PROJECTOR_PLACEHOLDERS, projectorPlaceholder, resolvePerPlayerTemplate } from '../../engine/per-player-template.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LIST = [...PER_PLAYER_SUFFIXES].sort();

describe('one list of per-player suffixes', () => {
  it('every per-player suffix is a known suffix', () => {
    for (const s of LIST) expect(KNOWN_SUFFIXES.has(s), `${s} is per-player but not in KNOWN_SUFFIXES`).toBe(true);
  });

  it('the token regex is built from the list', () => {
    for (const s of LIST) expect(PER_PLAYER_TOKEN.test(`{{ask.${s}}}`), `{{ask.${s}}} should be a per-player token`).toBe(true);
    expect(PER_PLAYER_TOKEN.test('{{ask.responses}}')).toBe(false);
  });

  it('the resolvers and the projector placeholders are keyed by the list, no more and no less', () => {
    expect(Object.keys(RESOLVERS).sort()).toEqual(LIST);
    expect(Object.keys(PROJECTOR_PLACEHOLDERS).sort()).toEqual(LIST);
    for (const s of LIST) {
      expect(typeof RESOLVERS[s]).toBe('function');
      expect(typeof PROJECTOR_PLACEHOLDERS[s]).toBe('string');
      expect(projectorPlaceholder(`ask.${s}`)).toBe(PROJECTOR_PLACEHOLDERS[s]);
    }
    expect(projectorPlaceholder('ask.responses')).toBe(null);
  });

  it('the server reads the placeholder from the map, never its own regexes', () => {
    const server = readFileSync(join(ROOT, 'server.js'), 'utf8');
    expect(server).toContain('projectorPlaceholder(trimmed)');
    expect(server).not.toMatch(/\/\\\.(mine|assigned|partner|partnerSide|side|station)\$\//);
  });

  it('a template resolves every suffix through its resolver', () => {
    const engine = {
      language: 'en',
      phaseData: {
        ask: { assigned: { p1: 'a card' }, byPlayer: { p1: 'my words', p2: 'their words' }, pairs: [{ playerIds: ['p1', 'p2'] }], sides: { p1: 'For', p2: 'Against' } },
        split: { teams: { A: [], B: [] }, playerTeam: { p1: 'B' } }
      },
      config: { phases: { st: { stations: ['one', 'two'], stationsFrom: 'split' } } },
      resolve: () => undefined
    };
    const out = resolvePerPlayerTemplate('{{ask.assigned}}|{{ask.mine}}|{{ask.partner}}|{{ask.side}}|{{ask.partnerSide}}|{{st.station}}', engine, 'p1');
    expect(out).toBe('a card|my words|their words|For|Against|two');
  });
});

// A file that spells the suffixes out as its own alternation has grown a
// second list (the transitions sweep's idiom). The two modules that own
// the list, and the brick that rewrites the plan's plain tokens, may.
const ALLOWED_FILES = new Set([
  'engine/resolver-grammar.js',
  'engine/per-player-template.js',
  'screens/shared/step-suggestions.js' // rewrites {{otherSide}} to {{X.partnerSide}} for the pairs brick
]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('no file grows its own list of per-player suffixes', () => {
  it('an alternation of three or more of them appears only where the list lives', () => {
    const names = LIST.join('|');
    const alternation = new RegExp(`(?:(?:${names})\\|){2,}(?:${names})`);
    const offenders = [];
    for (const file of [...walk(join(ROOT, 'engine')), ...walk(join(ROOT, 'screens')), join(ROOT, 'server.js')]) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWED_FILES.has(rel)) continue;
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (alternation.test(src)) offenders.push(rel);
    }
    expect(offenders, 'files with their own per-player suffix list').toEqual([]);
  });
});
