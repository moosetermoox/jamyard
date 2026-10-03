// Two owner calls, 2026-10-02:
// 1. The crown (winner step) is host-paced: it never moves on by itself.
// 2. A ballot left empty when the timer runs out is no vote, never a random one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('the crown waits for the teacher', () => {
  it('the winner handler sets no timer to advance', () => {
    const src = read('engine/phase-handlers/winner.js');
    expect(src).not.toMatch(/setTimeout/);
    expect(src).not.toMatch(/advanceTo/);
  });
});

describe('an empty ballot at time-up is no vote', () => {
  const player = read('screens/player/player.js');

  it('pick-one sends no random candidate', () => {
    const block = player.slice(player.indexOf("if (mode === 'pick-one')"), player.indexOf("} else if (mode === 'approve')"));
    expect(block).not.toMatch(/Math\.random/);
    expect(block).toMatch(/choice: picked \? picked\.value : null/);
  });

  it('head-to-head fills no matchup at random', () => {
    const block = player.slice(player.indexOf("} else if (mode === 'head-to-head')"), player.indexOf('// --- Socket events - Elimination'));
    expect(block).not.toMatch(/Math\.random/);
  });

  it('a pick-one answer step sends nothing when nothing is picked', () => {
    const block = player.slice(player.indexOf('function onCollectClock'), player.indexOf("} else if (collectMode === 'fields')"));
    expect(block).not.toMatch(/Math\.random/);
    expect(block).toMatch(/sent = !!pickedChoice/);
  });

  it('the server stores no vote for a null choice but counts the voter', () => {
    const server = read('server.js');
    expect(server).toMatch(/if \(choice !== null && choice !== undefined\) vs\.votes\.push/);
  });
});
