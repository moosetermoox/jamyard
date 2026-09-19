/**
 * Where analytics may and may not run (2026-09-13). Minors use the student
 * screen and see the projector, so those pages load no analytics module at
 * all, no page under screens/ ever names PostHog (the browser never talks
 * to it; the server relays), and every event a page sends is one the
 * server's allowlist names. The client module itself refuses to run on a
 * student or projector path even if someone links it there.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYTICS_EVENTS } from '../../services/analytics.js';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

const STUDENT_OR_PROJECTOR = [
  'screens/player/index.html',
  'screens/host/index.html',
  'screens/teacher/index.html',
  'screens/teacher/report.html'
];

const TEACHER_PAGES = [
  'screens/home/index.html',
  'screens/library/index.html',
  'screens/make/index.html',
  'screens/designer/index.html',
  'screens/designer/editor.html',
  'screens/prototype/index.html',
  'screens/guide/index.html',
  'screens/privacy/index.html',
  'screens/terms/index.html'
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (/\.(js|html|css)$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('analytics surface', () => {
  it('student, projector, and console pages load no analytics', async () => {
    for (const page of STUDENT_OR_PROJECTOR) {
      const html = await read(page);
      expect(html, page).not.toContain('analytics.js');
      expect(html.toLowerCase(), page).not.toContain('posthog');
    }
  });

  it('teacher pages load the module', async () => {
    for (const page of TEACHER_PAGES) {
      const html = await read(page);
      expect(html, page).toContain('/shared/analytics.js');
    }
  });

  it('no screen file but replay.js loads or addresses PostHog: events never come from a browser', async () => {
    const files = await walk(fileURLToPath(new URL('screens', ROOT)));
    const vendor = /posthog\.(com|init|capture)|posthog-js|i\.posthog|posthog\.js/i;
    let exempt = 0;
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      // Session replay (2026-09-13) is the one script that talks to
      // PostHog, fenced by tests/screens/replay-surface.test.js
      if (/[\\/]shared[\\/]replay\.js$/.test(file)) { exempt++; continue; }
      expect(text, file).not.toMatch(vendor);
    }
    expect(exempt).toBe(1);
  });

  it('every event a screen sends is on the server allowlist', async () => {
    const files = await walk(fileURLToPath(new URL('screens', ROOT)));
    let seen = 0;
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const m of text.matchAll(/Analytics\.track\(\s*['"]([^'"]+)['"]/g)) {
        seen++;
        expect(Object.keys(ANALYTICS_EVENTS), `${file}: ${m[1]}`).toContain(m[1]);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('screens/shared/analytics.js', () => {
  let sent;
  let mints = 0;
  function boot(pathname, extra = {}) {
    sent = [];
    const store = extra.store || {};
    // Node exposes navigator, crypto, and localStorage as getters: define over them.
    const def = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    def('window', globalThis);
    const listeners = extra.listeners || {};
    const listen = (name, fn) => { listeners[name] = fn; };
    def('addEventListener', listen);
    def('document', { addEventListener: listen, visibilityState: 'visible', referrer: extra.referrer || '' });
    def('location', { pathname, search: extra.search || '', hostname: 'jamyard.org' });
    def('navigator', {
      doNotTrack: extra.dnt || null,
      globalPrivacyControl: extra.gpc || false,
      sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; }
    });
    def('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    });
    const session = extra.session || {};
    def('sessionStorage', {
      getItem: (k) => (k in session ? session[k] : null),
      setItem: (k, v) => { session[k] = String(v); }
    });
    // Deterministic but different on every mint, so a kept id is provably the stored one
    def('crypto', { getRandomValues: (a) => { mints++; for (let i = 0; i < a.length; i++) a[i] = (i * 37 + mints) & 255; return a; } });
    delete globalThis.Analytics;
    vi.resetModules();
    return import('../../screens/shared/analytics.js');
  }

  async function bodyOf(entry) {
    return JSON.parse(await entry.blob.text());
  }

  beforeEach(() => { sent = []; });

  it('refuses to run on the student, projector, or console paths', async () => {
    for (const path of ['/player', '/player/', '/host', '/host/index.html', '/teacher', '/teacher/report']) {
      await boot(path);
      expect(globalThis.Analytics.enabled, path).toBe(false);
      globalThis.Analytics.track('page_viewed', { path });
      expect(sent, path).toHaveLength(0);
    }
  });

  it('sends one page view on a teacher page with only the path and the entry point', async () => {
    await boot('/make', { search: '?game=exit-ticket&from=home' });
    expect(globalThis.Analytics.enabled).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('/api/track');
    const body = await bodyOf(sent[0]);
    expect(body.event).toBe('page_viewed');
    expect(body.props).toEqual({ path: '/make', from: 'home', referrer: 'direct', session: expect.stringMatching(UUID_V7) });
    expect(body.aid).toMatch(/^[a-f0-9]{16,32}$/);
    expect(JSON.stringify(body)).not.toContain('exit-ticket');
  });

  it('one visit id per tab, a UUIDv7 kept in sessionStorage, fresh after 30 minutes idle, on every event', async () => {
    const session = {};
    await boot('/make', { session });
    const first = (await bodyOf(sent[0])).props.session;
    expect(first).toMatch(UUID_V7);
    expect(session['jamyard.sid']).toMatch(new RegExp('^' + first + '\\|\\d+$'));
    // The timestamp half of the id is now, give or take
    const ms = parseInt(first.replace(/-/g, '').slice(0, 12), 16);
    expect(Math.abs(Date.now() - ms)).toBeLessThan(60_000);

    globalThis.Analytics.track('activity_opened', { dest: 'host' });
    expect((await bodyOf(sent[1])).props.session).toBe(first);

    await boot('/guide', { session });
    expect((await bodyOf(sent[0])).props.session).toBe(first);

    session['jamyard.sid'] = first + '|' + (Date.now() - 31 * 60 * 1000);
    await boot('/guide', { session });
    const later = (await bodyOf(sent[0])).props.session;
    expect(later).toMatch(UUID_V7);
    expect(later).not.toBe(first);

    session['jamyard.sid'] = 'rivera@school.org|' + Date.now();
    await boot('/guide', { session });
    expect((await bodyOf(sent[0])).props.session).toMatch(UUID_V7);
    expect(globalThis.Analytics.sessionId()).toBe((await bodyOf(sent[0])).props.session);
  });

  it('sends page_left with the route only when the page goes away, once', async () => {
    const listeners = {};
    await boot('/make', { search: '?game=exit-ticket', listeners });
    expect(typeof listeners.pagehide).toBe('function');
    expect(typeof listeners.visibilitychange).toBe('function');
    listeners.pagehide();
    listeners.pagehide();
    expect(sent).toHaveLength(2);
    const body = await bodyOf(sent[1]);
    expect(body.event).toBe('page_left');
    expect(Object.keys(body.props).sort()).toEqual(['path', 'session']);
    expect(body.props.path).toBe('/make');
    expect(JSON.stringify(body)).not.toContain('exit-ticket');
    // Coming back and leaving again counts as another leave
    globalThis.document.visibilityState = 'visible';
    listeners.visibilitychange();
    globalThis.document.visibilityState = 'hidden';
    listeners.visibilitychange();
    expect(sent).toHaveLength(3);
  });

  it('says where the visit came from: the referring hostname only, and our own campaign tags', async () => {
    await boot('/', { referrer: 'https://www.google.com/search?q=jamyard+exit+ticket' });
    expect((await bodyOf(sent[0])).props.referrer).toBe('www.google.com');
    expect(JSON.stringify(await bodyOf(sent[0]))).not.toContain('search');

    await boot('/guide', { referrer: 'https://jamyard.org/make?game=exit-ticket' });
    expect((await bodyOf(sent[0])).props.referrer).toBe('internal');

    await boot('/', { referrer: 'https://user:token@mail.district.k12.ca.us:8443/inbox/42' });
    expect((await bodyOf(sent[0])).props.referrer).toBe('mail.district.k12.ca.us');

    await boot('/', { search: '?utm_source=Newsletter&utm_medium=email&utm_campaign=pd%20day&utm_term=rivera&gclid=abc' });
    const props = (await bodyOf(sent[0])).props;
    expect(props.utm_source).toBe('newsletter');
    expect(props.utm_medium).toBe('email');
    expect(props.utm_campaign).toBeUndefined();
    expect(props.utm_term).toBeUndefined();
    expect(JSON.stringify(props)).not.toContain('rivera');
    expect(JSON.stringify(props)).not.toContain('gclid');
  });

  it('keeps one browser id across loads and never mints one from anything personal', async () => {
    const store = {};
    await boot('/guide', { store });
    const first = (await bodyOf(sent[0])).aid;
    expect(store['jamyard.aid']).toBe(first);
    await boot('/privacy', { store });
    expect((await bodyOf(sent[0])).aid).toBe(first);
    // A stored value that is not one of ours (someone edited storage) is replaced, never sent
    store['jamyard.aid'] = 'rivera@school.org';
    await boot('/privacy', { store });
    const replaced = (await bodyOf(sent[0])).aid;
    expect(replaced).toMatch(/^[a-f0-9]{16,32}$/);
    expect(replaced).not.toBe(first);
    // And a fresh browser gets its own
    await boot('/privacy', { store: {} });
    expect((await bodyOf(sent[0])).aid).not.toBe(replaced);
  });

  it('honors Do Not Track and Global Privacy Control', async () => {
    await boot('/', { dnt: '1' });
    expect(globalThis.Analytics.enabled).toBe(false);
    expect(sent).toHaveLength(0);
    await boot('/', { gpc: true });
    expect(globalThis.Analytics.enabled).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('track() posts a named event and never throws when the browser cannot send', async () => {
    await boot('/make');
    globalThis.Analytics.track('activity_opened', { dest: 'host', page: 'make', edited: false });
    expect(sent).toHaveLength(2);
    expect((await bodyOf(sent[1])).event).toBe('activity_opened');
    globalThis.navigator.sendBeacon = () => { throw new Error('blocked'); };
    globalThis.fetch = undefined;
    expect(() => globalThis.Analytics.track('activity_opened', { dest: 'try' })).not.toThrow();
  });
});
