/**
 * Sharing an activity = importing a COPY (docs/NEXT-STEPS sharing notes).
 * The recipient gets their own row under a fresh id; the original is never
 * co-owned. These are the pure pieces behind POST /api/games/:id/copy.
 */

import { describe, it, expect } from 'vitest';
import { mintCopyId, prepareSharedCopy } from '../../engine/share-copy.js';

describe('mintCopyId', () => {
  it('keeps the source id when nothing is taken', async () => {
    const id = await mintCopyId('story-builder', async () => false);
    expect(id).toBe('story-builder');
  });

  it('appends -2 when the source id is taken', async () => {
    const taken = new Set(['story-builder']);
    const id = await mintCopyId('story-builder', async (c) => taken.has(c));
    expect(id).toBe('story-builder-2');
  });

  it('counts past every taken suffix', async () => {
    const taken = new Set(['speed-quiz', 'speed-quiz-2', 'speed-quiz-3']);
    const id = await mintCopyId('speed-quiz', async (c) => taken.has(c));
    expect(id).toBe('speed-quiz-4');
  });

  it('awaits an async existence check', async () => {
    const taken = new Set(['doodle-bluff-2']);
    const id = await mintCopyId('doodle-bluff-2', async (c) => {
      await new Promise((r) => setTimeout(r, 1));
      return taken.has(c);
    });
    expect(id).toBe('doodle-bluff-2-2');
  });

  it('mints ids the save endpoint accepts', async () => {
    const taken = new Set(['quiz-1']);
    const id = await mintCopyId('quiz-1', async (c) => taken.has(c));
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});

describe('prepareSharedCopy', () => {
  const source = {
    name: 'My Quiz',
    description: 'A quiz about rocks',
    featured: true,
    anonymous: true,
    recipe: { id: 'quiz-show', version: 3, params: { rounds: 5 } },
    phases: [{ id: 'lobby', type: 'lobby', next: 'end' }, { id: 'end', type: 'end' }]
  };

  it('strips featured so a copy never arrives pre-starred', () => {
    const copy = prepareSharedCopy(source);
    expect(copy.featured).toBeUndefined();
  });

  it('keeps everything else, including the recipe stamp and anonymous flag', () => {
    const copy = prepareSharedCopy(source);
    expect(copy.name).toBe('My Quiz');
    expect(copy.description).toBe('A quiz about rocks');
    expect(copy.anonymous).toBe(true);
    expect(copy.recipe).toEqual({ id: 'quiz-show', version: 3, params: { rounds: 5 } });
    expect(copy.phases).toEqual(source.phases);
  });

  it('deep-copies: mutating the copy never touches the source', () => {
    const copy = prepareSharedCopy(source);
    copy.phases[0].id = 'mutated';
    copy.recipe.params.rounds = 99;
    expect(source.phases[0].id).toBe('lobby');
    expect(source.recipe.params.rounds).toBe(5);
  });

  it('drops the non-enumerable _source tag DB loads carry', () => {
    const tagged = { ...source };
    Object.defineProperty(tagged, '_source', { value: 'user', enumerable: false });
    const copy = prepareSharedCopy(tagged);
    expect('_source' in copy).toBe(false);
  });
});
