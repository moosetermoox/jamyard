import { describe, it, expect } from 'vitest';
import { buildChainViews, formatChainContent, normalizeByPlayer } from '../../engine/phases/chain-reveal.js';
import { validate } from '../../engine/game-loader.js';

// 3 players, 2 hops: p1's item went to p2 then p3, etc. (offset-1 ring).
function ringChain() {
  return [
    {
      byPlayer: { p1: 'seed one', p2: 'seed two', p3: 'seed three' },
      assignedFrom: { p2: 'p1', p3: 'p2', p1: 'p3' } // hop-1 recipients ← senders
    },
    {
      byPlayer: { p2: 'seed one +a', p3: 'seed two +b', p1: 'seed three +c' },
      assignedFrom: { p3: 'p2', p1: 'p3', p2: 'p1' } // hop-2 recipients ← hop-1 holders
    },
    {
      byPlayer: { p3: 'seed one +a +x', p1: 'seed two +b +y', p2: 'seed three +c +z' }
    }
  ];
}

describe('normalizeByPlayer', () => {
  it('prefers byPlayer, falls back to responses, tolerates nothing', () => {
    expect(normalizeByPlayer({ byPlayer: { a: 'x' } })).toEqual({ a: 'x' });
    expect(normalizeByPlayer({ responses: [{ playerId: 'a', text: 'x' }] })).toEqual({ a: 'x' });
    expect(normalizeByPlayer(null)).toEqual({});
  });
});

describe('buildChainViews', () => {
  it('follows each origin item through every hop', () => {
    const views = buildChainViews(ringChain());
    expect(views.get('p1')).toEqual({ original: 'seed one', steps: ['seed one +a', 'seed one +a +x'], complete: true });
    expect(views.get('p2')).toEqual({ original: 'seed two', steps: ['seed two +b', 'seed two +b +y'], complete: true });
    expect(views.get('p3')).toEqual({ original: 'seed three', steps: ['seed three +c', 'seed three +c +z'], complete: true });
  });

  it('marks the chain incomplete when a link is missing, keeping what exists', () => {
    const chain = ringChain();
    // p1's item travels p1 → p2 → p3; removing the p3←p2 hop-2 link breaks
    // p1's chain after the first hop. p2's chain (p2 → p3 → p1) is untouched.
    delete chain[1].assignedFrom.p3;
    const views = buildChainViews(chain);
    expect(views.get('p1')).toEqual({ original: 'seed one', steps: ['seed one +a'], complete: false });
    expect(views.get('p2').complete).toBe(true);
  });

  it('marks incomplete when a hop contributor never submitted', () => {
    const chain = ringChain();
    delete chain[1].byPlayer.p2; // hop-1 recipient of p1's seed went silent
    const views = buildChainViews(chain);
    const v = views.get('p1');
    expect(v.complete).toBe(false);
    // The chain still follows the LINK forward even though the text is missing.
    expect(v.steps).toEqual(['seed one +a +x']);
  });

  it('handles a single-phase chain (no hops) and empty input', () => {
    const views = buildChainViews([{ byPlayer: { p1: 'only' } }]);
    expect(views.get('p1')).toEqual({ original: 'only', steps: [], complete: true });
    expect(buildChainViews([]).size).toBe(0);
    expect(buildChainViews(null).size).toBe(0);
  });
});

describe('formatChainContent', () => {
  const view = { original: 'my list', steps: ['my list +1', 'my list +1 +2'], complete: true };

  it('steps mode numbers every hop', () => {
    const out = formatChainContent(view, { display: 'steps' });
    expect(out).toContain('“my list”');
    expect(out).toContain('1. my list +1');
    expect(out).toContain('2. my list +1 +2');
  });

  it('final mode shows only the last hop', () => {
    const out = formatChainContent(view, { display: 'final' });
    expect(out).toContain('2 classmates');
    expect(out).toContain('“my list +1 +2”');
    expect(out).not.toContain('1. my list +1');
  });

  it('non-starters get a friendly line, not a crash', () => {
    expect(formatChainContent(undefined)).toContain('didn\'t start one');
  });

  describe('template mode (blind grammar chains)', () => {
    // 1 original + 2 hops, template with 3 slots: {1} = original,
    // {2}.. = hops in chain order.
    const blindView = { original: 'sleepy', steps: ['walrus', 'sings'], complete: true };

    it('fills numbered slots into the sentence template', () => {
      const out = formatChainContent(blindView, {
        display: 'template', template: 'The {1} {2} {3} tonight.'
      });
      expect(out).toContain('The sleepy walrus sings tonight.');
      // The original still gets its attribution line.
      expect(out).toContain('“sleepy”');
      // Hops are NOT listed as numbered steps in this mode.
      expect(out).not.toContain('1. walrus');
    });

    it('renders missing slots as blanks instead of leaving raw tokens', () => {
      const out = formatChainContent(
        { original: 'sleepy', steps: ['walrus'], complete: false },
        { display: 'template', template: 'The {1} {2} {3} tonight.' }
      );
      expect(out).toContain('The sleepy walrus ____ tonight.');
      expect(out).not.toContain('{3}');
      expect(out).toContain('wifi happens');
    });

    it('ignores extra hops beyond the template\'s slots', () => {
      const out = formatChainContent(
        { original: 'a', steps: ['b', 'c', 'd'], complete: true },
        { display: 'template', template: '{1} {2}' }
      );
      expect(out).toContain('“a b”');
      expect(out).not.toContain(' d');
    });

    it('falls back to steps mode when no template string is given', () => {
      const out = formatChainContent(blindView, { display: 'template' });
      expect(out).toContain('1. walrus');
    });

    it('trims whitespace in submitted slot words', () => {
      const out = formatChainContent(
        { original: '  sleepy ', steps: [' walrus  '], complete: true },
        { display: 'template', template: 'The {1} {2}.' }
      );
      expect(out).toContain('The sleepy walrus.');
    });
  });

  it('incomplete chains admit it', () => {
    const out = formatChainContent({ original: 'x', steps: [], complete: false });
    expect(out).toContain('wifi happens');
  });
});

describe('validator: chainDisplay "template"', () => {
  function blindChainConfig(revealOverrides = {}) {
    return {
      name: 'Test',
      phases: {
        lobby: { type: 'lobby', next: 'word1' },
        word1: { type: 'collect', prompt: 'Write an adjective.', next: 'word2' },
        word2: { type: 'collect', prompt: 'Write a noun.', rotateFrom: 'word1', next: 'poem' },
        poem: {
          type: 'reveal', scope: 'own', chainFrom: ['word1', 'word2'],
          chainDisplay: 'template', chainTemplate: 'The {1} {2}.',
          next: 'end', ...revealOverrides
        },
        end: { type: 'end' }
      }
    };
  }

  it('accepts a template display with a slotted sentence', () => {
    const { errors } = validate(blindChainConfig(), 'test', { returnResults: true });
    expect(errors).toEqual([]);
  });

  it('rejects template display with no chainTemplate', () => {
    const { errors } = validate(blindChainConfig({ chainTemplate: undefined }), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('chainTemplate'))).toBe(true);
  });

  it('rejects a chainTemplate with no {N} slots to fill', () => {
    const { errors } = validate(blindChainConfig({ chainTemplate: 'No slots here.' }), 'test', { returnResults: true });
    expect(errors.some(e => e.includes('no {1}-style slots'))).toBe(true);
  });
});
