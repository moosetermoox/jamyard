/**
 * Four small things noticed on jamyard.org, 2026-10-03 (the live re-checks):
 *  1. Whose Eyes?'s end message said "Thirty pairs of eyes" whatever the
 *     class size.
 *  2. The projector's merge line kept "partner" after a late joiner made a
 *     trio (tests/engine/merge-late-trio.test.js has the handler).
 *  3. The browser's own-ids list sent as ?mine= carried a copy's id twice.
 *  4. Once, right after Create, the make page's Try it showed "Opening with
 *     pretend students…" and sent no request; not reproduced, so the card
 *     gets a watchdog and the busy flag a stale guard.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (rel) => readFile(new URL('../../' + rel, import.meta.url), 'utf8');

describe("Whose Eyes?'s end message fits any class", async () => {
  const config = JSON.parse(await read('games/whose-eyes/config.json'));
  it('names no head count', () => {
    const msg = config.phases.end.message;
    expect(msg).not.toMatch(/\b(thirty|twenty|forty|\d+)\b/i);
    expect(msg).toContain('Every pair of eyes');
  });
});

describe('MyGames.list sends each id once', () => {
  function loadMyGames(stored) {
    const store = new Map(Object.entries(stored));
    const sandbox = {
      console,
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }
      },
      location: { origin: 'http://localhost:3000' },
      fetch: function () { return Promise.resolve({ ok: true }); },
      Headers: globalThis.Headers,
      Object, JSON, Array, String, Promise, Math, Date
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    return { sandbox, store };
  }

  it('an older write with a duplicate reads back deduped, and add never doubles', async () => {
    const code = await read('screens/shared/my-games.js');
    const { sandbox, store } = loadMyGames({ 'lanyard-my-games': JSON.stringify(['a', 'b', 'a', '', 7, 'c']) });
    vm.runInNewContext(code, sandbox);
    expect(sandbox.MyGames.list()).toEqual(['a', 'b', 'c']);
    sandbox.MyGames.add('b');
    expect(sandbox.MyGames.list()).toEqual(['a', 'b', 'c']);
    sandbox.MyGames.add('d');
    expect(JSON.parse(store.get('lanyard-my-games'))).toEqual(['a', 'b', 'c', 'd']);
    expect(sandbox.MyGames.has('a')).toBe(true);
  });
});

describe('the make page never sits on "Opening…" in silence', async () => {
  const js = await read('screens/make/make.js');
  it('a watchdog past the promised time names Cancel', () => {
    expect(js).toContain('var OPENING_PATIENCE_MS');
    expect(js).toContain('Press Cancel and try the button again.');
    // armed in setOpening, cleared in clearOpening
    const setIdx = js.indexOf('function setOpening(');
    const clearIdx = js.indexOf('function clearOpening(');
    expect(js.slice(setIdx, clearIdx)).toContain('openingWatchdog = setTimeout(');
    expect(js.slice(clearIdx, clearIdx + 600)).toContain('clearTimeout(openingWatchdog)');
  });
  it('a stale busy flag with no card up is reset before a press is dropped', () => {
    const goIdx = js.indexOf('function go(dest)');
    expect(js.slice(goIdx, goIdx + 400)).toContain('if (state.busy && el.opening.hidden) state.busy = false;');
  });
});
