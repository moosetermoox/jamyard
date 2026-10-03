/**
 * A forward press on an open step is a Close, never a skip (cause 4 of
 * docs/ARCHITECTURE-REVIEW-2026-10.md: the CLAUDE.md rule "new closers must
 * be reachable from the advance-phase routing switch" as a test).
 *
 * Every `kind` a phase handler stores in `room.phaseState` must be handled
 * by the generic next step in server.js: a case in its switch (or the
 * wager's own block), or a name in MOVE_ON with the reason a plain move-on
 * is right. An open collect or collect-choice is routed by TYPE before the
 * switch. 2026-10-03: wager, relay, and turn were missing, so a teacher's
 * Next step mid-bet, mid-story, or mid-round skipped past the scores and
 * the text (proof scripts/simulate-advance-closes.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** kind → why the generic next step may simply move on */
const MOVE_ON = {
  'reveal-one': 'a host-paced gallery; nothing is stored at its close, the items were stored by the step they came from'
};

function handlerKinds() {
  const kinds = new Set();
  const dir = join(root, 'engine', 'phase-handlers');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = read(join('engine', 'phase-handlers', f));
    // every `kind: '...'` a handler writes is a phaseState kind (nothing else in
    // engine/phase-handlers/ carries a `kind`)
    for (const m of src.matchAll(/\bkind:\s*'([a-z-]+)'/g)) kinds.add(m[1]);
  }
  return kinds;
}

function advanceBlock() {
  const server = read('server.js');
  const start = server.indexOf('socket.on(EVENTS.ADVANCE_PHASE');
  const end = server.indexOf('socket.on(EVENTS.RETRY_PHASE', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return server.slice(start, end);
}

describe('the generic next step closes every open step kind', () => {
  const kinds = handlerKinds();
  const block = advanceBlock();

  it('reads the kinds the handlers store', () => {
    expect(kinds.size).toBeGreaterThanOrEqual(15);
    for (const k of ['vote', 'wager', 'relay', 'turn', 'merge', 'solo-quiz']) expect(kinds.has(k), k).toBe(true);
  });

  it('routes an open answer step by type to closeCollect, before the switch', () => {
    expect(block).toMatch(/openPhase\.type === 'collect' \|\| openPhase\.type === 'collect-choice'[\s\S]{0,80}await closeCollect\(code, room\)/);
  });

  it('every stored kind has a case, the wager its own block, or a reason to move on', () => {
    const missing = [];
    for (const kind of kinds) {
      if (MOVE_ON[kind]) continue;
      const cased = block.includes(`case '${kind}':`) || block.includes(`vs.kind === '${kind}'`);
      if (!cased) missing.push(kind);
    }
    expect(missing).toEqual([]);
  });

  it('keeps MOVE_ON to kinds that still exist', () => {
    expect(Object.keys(MOVE_ON).filter(k => !kinds.has(k))).toEqual([]);
  });

  it('a relay and a turn are finished, never skipped (2026-10-03)', () => {
    expect(block).toContain("case 'relay':     await finishRelay(code, room); return;");
    expect(block).toContain("case 'turn':      finishTurnPhase(createPhaseContext(code, room, phaseServices)); return;");
    expect(block).toMatch(/vs\.kind === 'wager'[\s\S]{0,200}resolveWager\(code, room, null\)/);
  });
});
