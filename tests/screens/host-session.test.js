// host-session.js is a plain browser script that attaches to globalThis
// (the bench-logic.js pattern). It holds the decision the host screen
// makes on every socket 'connect': rebind, forget, or start fresh.
//
// The 2026-09-10 classroom bug: the projector tab reconnected behind the
// teacher console, the URL still had ?game=, and the host never rebound,
// so students landed on the console and never on the projector.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/host/host-session.js';

const { connectAction, urlAfterCreate } = globalThis.HostSession;
const LIVE = { code: 'ABCD', hostToken: 'tok-live' };
const SAVED = { code: 'WXYZ', hostToken: 'tok-saved' };

describe('HostSession.connectAction', () => {
  it('a live room in this tab rebinds on reconnect, whatever the URL says', () => {
    for (const search of ['', '?game=snowball', '?game=x&prototype=true', '?new=1']) {
      expect(connectAction({ search, live: LIVE, saved: SAVED }))
        .toEqual({ kind: 'rejoin', code: 'ABCD', hostToken: 'tok-live' });
    }
  });

  it('a plain /host load with a saved session rebinds to it', () => {
    expect(connectAction({ search: '', live: null, saved: SAVED }))
      .toEqual({ kind: 'rejoin', code: 'WXYZ', hostToken: 'tok-saved' });
  });

  it('?new=1 forgets the saved session', () => {
    expect(connectAction({ search: '?new=1', live: null, saved: SAVED })).toEqual({ kind: 'forget' });
  });

  it('a ?game= or prototype page load starts fresh even with a saved session', () => {
    expect(connectAction({ search: '?game=snowball', saved: SAVED })).toEqual({ kind: 'fresh' });
    expect(connectAction({ search: '?prototype=true', saved: SAVED })).toEqual({ kind: 'fresh' });
  });

  it('nothing to rebind and nothing in the URL does nothing', () => {
    expect(connectAction({ search: '', live: null, saved: null })).toEqual({ kind: 'none' });
    expect(connectAction({})).toEqual({ kind: 'none' });
    expect(connectAction({ live: { code: 'ABCD' } })).toEqual({ kind: 'none' });
  });
});

describe('HostSession.urlAfterCreate', () => {
  it('drops ?game= once the room exists so a reload rebinds', () => {
    expect(urlAfterCreate('?game=snowball')).toBe('/host');
  });
  it('leaves prototype iframes and plain loads alone', () => {
    expect(urlAfterCreate('?game=snowball&prototype=true')).toBe(null);
    expect(urlAfterCreate('')).toBe(null);
    expect(urlAfterCreate('?new=1')).toBe(null);
  });
});

describe('host.js wiring', () => {
  const src = readFileSync('screens/host/host.js', 'utf8');
  const html = readFileSync('screens/host/index.html', 'utf8');
  it('loads host-session.js before host.js', () => {
    expect(html.indexOf('host-session.js')).toBeGreaterThan(-1);
    expect(html.indexOf('host-session.js')).toBeLessThan(html.indexOf('src="host.js"'));
  });
  it('the connect handler decides through HostSession, not a bare ?game= guard', () => {
    expect(src).toMatch(/HostSession\.connectAction\(/);
    expect(src).toMatch(/HostSession\.urlAfterCreate\(/);
    expect(src).not.toMatch(/if \(params\.get\('game'\) \|\| params\.get\('prototype'\)\) return;/);
  });
});
