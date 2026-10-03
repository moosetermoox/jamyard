/**
 * The transition fields are one list (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md: the CLAUDE.md rule "new
 * transition-bearing fields wire in SIX places" as a chokepoint plus a
 * sweep).
 *
 * screens/shared/transitions.js holds the list and the walks; the engine
 * reads it through engine/transitions.js and the editor as a browser
 * global. This file checks the walks, checks the list agrees with what
 * the phase schemas declare, checks the editor page loads the module,
 * and sweeps the tree for a file that grows its own copy of a walk: a
 * literal list of the names, the `next || approveNext` idiom, a
 * `nextByWinner` loop, a `push(p.approveNext)` graph builder, or a
 * by-hand "points at a missing phase" check. A spot that reads one
 * field for its own reason (a preview's doors, the loop counter, a
 * display of a vote's branches) goes in ALLOWED with the reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRANSITION_FIELDS, TRANSITION_NAMES, transitionEdges, transitionTargets,
  forwardEdges, primaryNext, mapTransitionTargets, retargetTransitions
} from '../../engine/transitions.js';
import { PHASE_SCHEMAS, getTransitions, getFields } from '../../engine/phase-schemas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the walks', () => {
  const vote = {
    type: 'vote', next: 'wrap', loopBack: 'ask', loopCount: 3,
    nextByWinner: { 'Enter the cave': 'cave', 'Go home': 'home', 'Bad': 7 }
  };
  const preview = { type: 'preview', approveNext: 'show', rejectNext: 'draw' };

  it('lists every edge in field order, a map field one per entry, strings only', () => {
    expect(transitionEdges(vote)).toEqual([
      { field: 'next', target: 'wrap', back: false },
      { field: 'loopBack', target: 'ask', back: true },
      { field: 'nextByWinner', target: 'cave', key: 'Enter the cave', back: false },
      { field: 'nextByWinner', target: 'home', key: 'Go home', back: false }
    ]);
    expect(transitionEdges(null)).toEqual([]);
    expect(transitionEdges({ type: 'end' })).toEqual([]);
  });

  it('gives the distinct targets and the forward edges', () => {
    expect(transitionTargets(vote)).toEqual(['wrap', 'ask', 'cave', 'home']);
    expect(transitionTargets({ next: 'a', rejectNext: 'a' })).toEqual(['a']);
    expect(forwardEdges(preview).map(e => e.field)).toEqual(['approveNext']);
    expect(forwardEdges(vote).map(e => e.field)).toEqual(['next', 'nextByWinner', 'nextByWinner']);
  });

  it('walks the primary path: next, then the approve door, then the first branch', () => {
    expect(primaryNext(vote)).toBe('wrap');
    expect(primaryNext(preview)).toBe('show');
    expect(primaryNext({ nextByWinner: { a: 'x', b: 'y' } })).toBe('x');
    expect(primaryNext({ rejectNext: 'back', loopBack: 'start' })).toBe(null);
    expect(primaryNext({ type: 'end' })).toBe(null);
  });

  it('re-points every edge in place and drops what has nowhere to go', () => {
    const p = { type: 'vote', next: 'gone', rejectNext: 'keep', nextByWinner: { a: 'gone', b: 'stay' } };
    expect(retargetTransitions(p, 'gone', 'after')).toBe(2);
    expect(p).toEqual({ type: 'vote', next: 'after', rejectNext: 'keep', nextByWinner: { a: 'after', b: 'stay' } });
    expect(retargetTransitions(p, 'after', null)).toBe(2);
    expect(p).toEqual({ type: 'vote', rejectNext: 'keep', nextByWinner: { b: 'stay' } });
    expect(mapTransitionTargets(p, () => null)).toBe(2);
    expect(p).toEqual({ type: 'vote' });
  });
});

describe('the list agrees with the phase schemas', () => {
  const refNames = new Set(TRANSITION_FIELDS.filter(f => f.shape === 'ref').map(f => f.name));
  const mapNames = TRANSITION_FIELDS.filter(f => f.shape === 'map').map(f => f.name);

  it('names every phaseRef transition any schema declares', () => {
    for (const type of Object.keys(PHASE_SCHEMAS)) {
      for (const [name, def] of Object.entries(getTransitions(type))) {
        if (def.type === 'phaseRef') expect(refNames.has(name), `${type}.${name}`).toBe(true);
      }
    }
  });

  it('names nothing the schemas do not declare', () => {
    const declared = new Set();
    for (const type of Object.keys(PHASE_SCHEMAS)) {
      for (const [name, def] of Object.entries(getTransitions(type))) if (def.type === 'phaseRef') declared.add(name);
    }
    for (const name of refNames) expect(declared.has(name), name).toBe(true);
    // a map-shaped transition is a field (a vote's branch by winner)
    for (const name of mapNames) {
      const owner = Object.keys(PHASE_SCHEMAS).find(type => getFields(type)[name]);
      expect(owner, name).toBeTruthy();
    }
    expect(TRANSITION_NAMES).toEqual(['next', 'approveNext', 'rejectNext', 'loopBack', 'nextByWinner']);
  });
});

describe('the editor reads the same list', () => {
  it('loads the module before editor.js', () => {
    const html = read('screens/designer/editor.html');
    const mod = html.indexOf('<script src="/shared/transitions.js"></script>');
    const editor = html.indexOf('<script src="editor.js"></script>');
    expect(mod).toBeGreaterThan(0);
    expect(editor).toBeGreaterThan(mod);
  });

  it('walks, checks, and re-links through it', () => {
    const js = read('screens/designer/editor.js');
    expect(js).toContain('current = Transitions.primaryNext(phases[current]);');
    expect(js).toContain('Transitions.retarget(other, phaseId, nextId);');
    expect(js).toContain('var tEdges = Transitions.edges(phase);');
    expect(js).toContain('var tTargets = Transitions.targets(p);');
  });
});

// ---- the sweep ----

const NAME_ALT = '(?:next|approveNext|rejectNext|loopBack|nextByWinner)';
const IDIOMS = {
  'a literal list of transition names':
    new RegExp(`['"]${NAME_ALT}['"]\\s*,\\s*['"]${NAME_ALT}['"]`),
  'the next || approveNext walk':
    /\.next\s*\|\|\s*[\w.]+\.approveNext/,
  'a loop over nextByWinner':
    /(?:Object\.(?:values|entries|keys)\(\s*[\w.]*nextByWinner\s*\)|for\s*\(\s*(?:var|const|let)\s+\w+\s+(?:in|of)\s+[\w.]*nextByWinner)/,
  'a by-hand graph builder':
    /push\(\s*(?:\[\s*['"]\w+['"]\s*,\s*)?[\w.]+\.(?:approveNext|rejectNext|loopBack)\s*[\])]/,
  'a by-hand missing-phase check':
    /\.(?:approveNext|rejectNext|loopBack)\s*&&\s*!\s*[\w.]*phases\[/
};

/** file → { idiom → why this file may carry it } */
const ALLOWED = {
  'screens/shared/transitions.js': { '*': 'the one copy' },
  'engine/transitions.js': { '*': 'the facade over the one copy' },
  'engine/game-loader.js': {
    'a loop over nextByWinner': 'the shape check: every branch key must name one of the vote\'s own options (existence is checked with the other transitions)'
  },
  'screens/designer/editor.js': {
    'a literal list of transition names': 'REQUIRED_FIELDS\' fallback for preview, the schema\'s required flags, not the graph',
    'a loop over nextByWinner': 'the vote panel renames and removes a branch key when its option text changes; emptiness checks, never a walk'
  },
  'screens/designer/simple-view.js': {
    'a loop over nextByWinner': 'a fact line per branch for the Simple view\'s description of a vote'
  },
  'services/ai-service.js': {
    'a literal list of transition names': 'the required doors a preview must carry, told to the AI; the schema\'s required flags, not the graph'
  }
};

const ROOTS = ['engine', 'services', 'screens', 'server.js'];
const SKIP_DIRS = new Set(['node_modules', 'video']);

function* jsFiles(dir) {
  const full = join(root, dir);
  const st = statSync(full);
  if (st.isFile()) { if (dir.endsWith('.js')) yield dir; return; }
  for (const name of readdirSync(full)) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = relative(root, join(full, name)).replace(/\\/g, '/');
    const s = statSync(join(full, name));
    if (s.isDirectory()) yield* jsFiles(rel);
    else if (name.endsWith('.js') && !name.endsWith('.min.js')) yield rel;
  }
}

describe('no file carries its own copy of a transition walk', () => {
  const hits = [];
  for (const dir of ROOTS) {
    for (const file of jsFiles(dir)) {
      const src = read(file);
      const allowed = ALLOWED[file] || {};
      if (allowed['*']) continue;
      for (const [idiom, re] of Object.entries(IDIOMS)) {
        if (!re.test(src)) continue;
        if (allowed[idiom]) continue;
        const line = src.slice(0, src.search(re)).split('\n').length;
        hits.push(`${file}:${line} has ${idiom}; read it through Transitions (shared/transitions.js), or add it to ALLOWED with the reason`);
      }
    }
  }

  it('finds none outside ALLOWED', () => {
    expect(hits).toEqual([]);
  });

  it('keeps ALLOWED honest: every entry still matches', () => {
    for (const [file, idioms] of Object.entries(ALLOWED)) {
      const src = read(file);
      for (const idiom of Object.keys(idioms)) {
        if (idiom === '*') continue;
        expect(IDIOMS[idiom], `${file}: unknown idiom "${idiom}"`).toBeTruthy();
        expect(IDIOMS[idiom].test(src), `${file} no longer has ${idiom}; drop the ALLOWED entry`).toBe(true);
      }
    }
  });
});
