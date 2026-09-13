/**
 * Host opens the projector in this tab and the teacher console in a new
 * one (owner's ask, 2026-09-12). The console tab must open inside the
 * click, before the room exists, so the two pair through a nonce: the
 * projector publishes {code, pin} under it, the console listens.
 * shared/host-launch.js is the whole mechanism; every Host door goes
 * through it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] || null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

let opened, closed, channels, listeners;
beforeEach(async () => {
  opened = []; closed = []; channels = []; listeners = {};
  globalThis.window = globalThis;
  globalThis.localStorage = fakeStorage();
  globalThis.location = { href: '' };
  globalThis.open = (url) => { opened.push(url); const w = { location: { href: url }, close: () => closed.push(url) }; opened.wins = opened.wins || []; opened.wins.push(w); return w; };
  globalThis.addEventListener = (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); };
  globalThis.removeEventListener = (name, fn) => { listeners[name] = (listeners[name] || []).filter(f => f !== fn); };
  globalThis.BroadcastChannel = class {
    constructor(name) { this.name = name; this.onmessage = null; channels.push(this); }
    postMessage(data) { channels.forEach(c => { if (c !== this && c.onmessage) c.onmessage({ data }); }); }
    close() { const i = channels.indexOf(this); if (i > -1) channels.splice(i, 1); }
  };
  vi.resetModules();
  delete globalThis.HostLaunch;
  await import('../../screens/shared/host-launch.js');
});

const H = () => globalThis.HostLaunch;

describe('the click side', () => {
  it('begin opens a blank tab in the click; hostUrl sends it the projector with the nonce and keeps the console here', () => {
    const p = H().begin();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe('about:blank');
    // The projector goes to the NEW tab (it takes focus, so the teacher
    // keeps looking at the host view); this tab becomes the console
    expect(H().hostUrl('snowball')).toBe('/teacher#await=' + p.nonce);
    expect(opened.wins[0].location.href).toBe('/host?game=snowball&pair=' + p.nonce);
    // consumed: a second call is a plain projector address for this tab
    expect(H().hostUrl('snowball')).toBe('/host?game=snowball');
  });

  it('a blocked popup is not an error: this tab hosts, as before', () => {
    globalThis.open = () => null;
    expect(H().begin()).toBeNull();
    expect(H().hostUrl('snowball')).toBe('/host?game=snowball');
  });

  it('a tab that refuses navigation falls back the same way', () => {
    globalThis.open = () => ({ get location() { throw new Error('gone'); }, close() {} });
    H().begin();
    expect(H().hostUrl('snowball')).toBe('/host?game=snowball');
  });

  it('abandon closes the blank tab when the save that preceded Host fails', () => {
    H().begin();
    H().abandon();
    expect(closed).toHaveLength(1);
    expect(H().hostUrl('x')).toBe('/host?game=x');
  });

  it('launch does both for a plain Host button', () => {
    H().launch('mood-check');
    expect(opened).toHaveLength(1);
    expect(opened.wins[0].location.href).toMatch(/^\/host\?game=mood-check&pair=[a-z0-9]+$/);
    expect(globalThis.location.href).toMatch(/^\/teacher#await=[a-z0-9]+$/);
  });
});

describe('the pairing', () => {
  it('a console that loads after the room is up finds it in storage and cleans up', () => {
    H().publish('abc123', 'KXQP', '4321');
    const got = [];
    H().listen('abc123', (rec) => got.push(rec));
    expect(got).toEqual([{ code: 'KXQP', pin: '4321' }]);
    expect(globalThis.localStorage.getItem('lanyardHostPair:abc123')).toBeNull();
  });

  it('a console already waiting hears the live channel', () => {
    const got = [];
    H().listen('live99', (rec) => got.push(rec));
    H().publish('live99', 'ABCD', '1111');
    expect(got).toEqual([{ code: 'ABCD', pin: '1111' }]);
  });

  it('another room\'s nonce is ignored, and a delivery happens once', () => {
    const got = [];
    H().listen('mine00', (rec) => got.push(rec));
    H().publish('other0', 'ZZZZ', '0000');
    expect(got).toEqual([]);
    H().publish('mine00', 'AAAA', '2222');
    H().publish('mine00', 'BBBB', '3333');
    expect(got).toEqual([{ code: 'AAAA', pin: '2222' }]);
  });

  it('the storage event path works without a channel', () => {
    delete globalThis.BroadcastChannel;
    const got = [];
    H().listen('st0rage', (rec) => got.push(rec));
    (listeners.storage || []).forEach(fn => fn({ key: 'lanyardHostPair:st0rage', newValue: JSON.stringify({ code: 'QQQQ', pin: '9', at: Date.now() }) }));
    expect(got).toEqual([{ code: 'QQQQ', pin: '9' }]);
  });

  it('stale records are purged on the next publish', () => {
    globalThis.localStorage.setItem('lanyardHostPair:old', JSON.stringify({ code: 'OLDD', pin: '', at: Date.now() - 2 * 60 * 60 * 1000 }));
    H().publish('new1', 'NEWW', '1');
    expect(globalThis.localStorage.getItem('lanyardHostPair:old')).toBeNull();
    expect(globalThis.localStorage.getItem('lanyardHostPair:new1')).not.toBeNull();
  });

  it('pairFromHash reads only a well-formed await nonce', () => {
    expect(H().pairFromHash('#await=abc123xyz')).toBe('abc123xyz');
    expect(H().pairFromHash('#code=ABCD&pin=1234')).toBeNull();
    expect(H().pairFromHash('#await=<script>')).toBeNull();
    expect(H().pairFromHash('')).toBeNull();
  });
});

describe('every Host door goes through it', () => {
  const doors = [
    'screens/library/library.js',
    'screens/designer/designer.js',
    'screens/designer/editor.js',
    'screens/designer/builder-view.js',
    'screens/make/make.js',
    'screens/shared/make-it-yours.js',
    'screens/shared/make-it-yours-doors.js',
    'screens/prototype/prototype.js'
  ];
  it('the door scripts call HostLaunch', async () => {
    for (const f of doors) expect(await read(f), f).toContain('HostLaunch');
  });
  it('the projector publishes and the console listens', async () => {
    expect(await read('screens/host/host.js')).toContain('HostLaunch.publish(');
    expect(await read('screens/teacher/teacher.js')).toContain('HostLaunch.listen(');
  });
  it('every page with a door, plus host and teacher, loads the module before its own script', async () => {
    const pages = ['library', 'designer', 'designer/editor', 'make', 'host', 'teacher', 'prototype'];
    for (const p of pages) {
      const file = p === 'designer/editor' ? 'screens/designer/editor.html' : 'screens/' + p + '/index.html';
      const html = await read(file);
      const at = html.indexOf('shared/host-launch.js');
      expect(at, file).toBeGreaterThan(-1);
      const own = html.search(/src="(?!\/shared\/)[a-z-]+\.js"/);
      expect(at < own || own === -1, file + ': module before the page script').toBe(true);
    }
  });
});
