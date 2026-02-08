import { describe, it, expect } from 'vitest';
import { loadHooks } from '../../engine/hooks-loader.js';

describe('HooksLoader', () => {
  it('returns empty object if hooks.js does not exist', async () => {
    const hooks = await loadHooks('weekend-poem');
    expect(hooks).toEqual({});
  });

  it('returns empty object for a nonexistent game', async () => {
    const hooks = await loadHooks('nonexistent-game');
    expect(hooks).toEqual({});
  });

  it('can load hooks from a game folder that has them', async () => {
    const hooks = await loadHooks('_template');
    expect(hooks).toBeDefined();
    expect(typeof hooks.pickRandom).toBe('function');
  });

  it('loaded hook functions are callable', async () => {
    const hooks = await loadHooks('_template');
    const result = hooks.pickRandom({ input: ['a', 'b', 'c'] });
    expect(['a', 'b', 'c']).toContain(result);
  });

  it('loaded hook handles empty input', async () => {
    const hooks = await loadHooks('_template');
    const result = hooks.pickRandom({ input: [] });
    expect(result).toBeNull();
  });
});
