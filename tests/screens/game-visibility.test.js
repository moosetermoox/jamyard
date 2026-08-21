// game-visibility.js is a plain browser script that attaches to globalThis —
// the side-effect import pattern shared with bot-brain.js and juice.js.
import { describe, it, expect } from 'vitest';
import '../../screens/shared/game-visibility.js';

const { visibleGames } = globalThis.GameVisibility;

const GAMES = [
  { id: 'speed-quiz', source: 'built-in', featured: true },
  { id: 'corn-story', source: 'built-in', featured: false },
  { id: 'legacy-no-source', featured: false },           // pre-change payloads have no source
  { id: 'my-poll', source: 'user', featured: false },
  { id: 'someone-elses', source: 'user', featured: false },
  { id: 'featured-user-game', source: 'user', featured: true }
];

describe('GameVisibility.visibleGames', () => {
  it('public view: featured activities plus this device\'s user games', () => {
    const visible = visibleGames(GAMES, { owner: false, myIds: ['my-poll'] });
    expect(visible.map(g => g.id)).toEqual(['speed-quiz', 'my-poll', 'featured-user-game']);
  });

  it('a featured user game is visible even on a device that did not make it', () => {
    const visible = visibleGames(GAMES, { owner: false, myIds: [] });
    expect(visible.map(g => g.id)).toEqual(['speed-quiz', 'featured-user-game']);
  });

  it('owner view: everything, untouched order', () => {
    const visible = visibleGames(GAMES, { owner: true, myIds: [] });
    expect(visible.map(g => g.id)).toEqual(GAMES.map(g => g.id));
  });

  it('missing source counts as built-in (legacy payloads)', () => {
    const visible = visibleGames([{ id: 'x', featured: true }], { owner: false, myIds: [] });
    expect(visible.map(g => g.id)).toEqual(['x']);
  });

  it('tolerates missing opts fields', () => {
    expect(visibleGames(GAMES, {}).map(g => g.id)).toEqual(['speed-quiz', 'featured-user-game']);
  });

  it('never mutates the input array', () => {
    const input = GAMES.slice();
    visibleGames(input, { owner: true, myIds: [] });
    visibleGames(input, { owner: false, myIds: [] });
    expect(input).toEqual(GAMES);
  });
});
