/**
 * Elimination Tournament (2026-09-10, owner's asks): students who are
 * out keep voting, and the number of rounds follows the class size (the
 * loop ends as soon as one student is left; the rounds knob is only a cap).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileRecipe } from '../../engine/recipe-compiler.js';
import { validate } from '../../engine/game-loader.js';
import { GameEngine } from '../../engine/game-engine.js';
import { runEliminate, shouldStopLooping } from '../../engine/phases/eliminate-handler.js';

const ROOT = new URL('../..', import.meta.url);
async function loadRecipe() {
  return JSON.parse(await readFile(new URL('recipes/elimination-tournament.json', ROOT), 'utf8'));
}

describe('elimination-tournament recipe', () => {
  it('compiles clean with the defaults', async () => {
    const recipe = await loadRecipe();
    const { config, diagnostics } = compileRecipe(recipe, { prompt: 'Name a creative use for a paper clip.' });
    expect((diagnostics || []).filter(d => d.level === 'error')).toEqual([]);
    const result = validate(config, 'elimination-tournament-test', { returnResults: true });
    expect(result.errors).toEqual([]);
  });

  it('everyone votes, in or out', async () => {
    const recipe = await loadRecipe();
    const { config } = compileRecipe(recipe, { prompt: 'Name a creative use for a paper clip.' });
    expect(config.phases.vote.voters).toBe('all');
    // ...but never for their own answer: a room of self-votes ties everyone.
    expect(config.phases.vote.excludeAuthors).toBe(true);
    // Only players still in write an answer.
    expect(config.phases.answer.from).toBe('remaining');
  });

  it('the rounds end when one student is left, with the rounds knob as the cap', async () => {
    const recipe = await loadRecipe();
    const { config } = compileRecipe(recipe, { prompt: 'Name a creative use for a paper clip.', rounds: 5 });
    const e = config.phases.eliminate;
    expect(e.untilRemaining).toBe(1);
    expect(e.loopCount).toBe(5);
    expect(e.loopBack).toBe('round-intro');
    expect(e.next).toBe('winner');
    // The intro no longer promises a fixed "of N" it cannot keep.
    expect(config.phases['round-intro'].message).not.toContain('_loop.eliminate.total');
    expect(config.phases['round-intro'].message).toContain('{{remaining.length}}');
  });

  it('a 20-student class takes more rounds than the old fixed three', async () => {
    // Simulate the loop the server runs: eliminate bottom 30% by a score
    // map where everyone scores differently, until one remains.
    const recipe = await loadRecipe();
    const { config } = compileRecipe(recipe, { prompt: 'x'.repeat(10) });
    const engine = new GameEngine(config);
    for (let i = 1; i <= 20; i++) engine.players.add('p' + i, 'S' + i);
    let rounds = 0;
    while (rounds < config.phases.eliminate.loopCount) {
      rounds++;
      const scores = {};
      engine.players.getRemaining().forEach((p, i) => { scores[p.id] = i; });
      runEliminate({ method: 'bottom-percent', input: { scores, percent: config.phases.eliminate.percent }, players: engine.players });
      if (shouldStopLooping({ untilRemaining: 1, remaining: engine.players.getRemaining().length })) break;
    }
    expect(engine.players.getRemaining().length).toBe(1);
    expect(rounds).toBeGreaterThan(3);
    expect(rounds).toBeLessThanOrEqual(config.phases.eliminate.loopCount);
  });
});
