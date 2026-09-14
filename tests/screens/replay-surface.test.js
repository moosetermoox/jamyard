/**
 * Session replay's fence (2026-09-13). The PostHog script may run on six
 * teacher authoring pages and nowhere else: never a page a student or the
 * projector loads, never the console or its report, never Try it out
 * (its frames show student-shaped screens), never inside a frame. And
 * when it runs, everything the teacher typed is masked, every iframe is
 * blocked, and every other SDK feature is off.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFile(new URL(p, ROOT), 'utf8');

const REPLAY_PAGES = [
  'screens/home/index.html',
  'screens/library/index.html',
  'screens/make/index.html',
  'screens/designer/index.html',
  'screens/designer/editor.html',
  'screens/guide/index.html'
];

const NEVER_PAGES = [
  'screens/player/index.html',
  'screens/host/index.html',
  'screens/teacher/index.html',
  'screens/teacher/report.html',
  'screens/prototype/index.html',
  'screens/privacy/index.html',
  'screens/feedback/index.html',
  'screens/share/index.html'
];

describe('replay pages', () => {
  it('the six authoring pages load the module, after the relay module', async () => {
    for (const page of REPLAY_PAGES) {
      const html = await read(page);
      const relay = html.indexOf('/shared/analytics.js');
      const replay = html.indexOf('/shared/replay.js');
      expect(replay, page).toBeGreaterThan(-1);
      expect(relay, page + ': relay first').toBeGreaterThan(-1);
      expect(relay).toBeLessThan(replay);
    }
  });

  it('no other page loads it, and none but the privacy page (which describes it) names PostHog', async () => {
    for (const page of NEVER_PAGES) {
      const html = await read(page);
      expect(html, page).not.toContain('replay.js');
      if (!page.includes('privacy')) expect(html.toLowerCase(), page).not.toContain('posthog');
    }
  });
});

describe('screens/shared/replay.js', () => {
  let scripts, fetches, inits;
  function boot(pathname, extra = {}) {
    scripts = []; fetches = []; inits = [];
    const def = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    def('window', globalThis);
    def('top', extra.framed ? {} : globalThis);
    def('document', {
      head: { appendChild: (s) => { scripts.push(s); } },
      createElement: () => ({ async: false, src: '', onload: null })
    });
    def('location', { pathname, search: '', hostname: 'jamyard.org' });
    def('navigator', { doNotTrack: extra.dnt || null, globalPrivacyControl: extra.gpc || false });
    const store = extra.store || {};
    def('localStorage', { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } });
    def('crypto', { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 13 + 7) & 255; return a; } });
    def('posthog', { init: (key, opts) => { inits.push({ key, opts }); } });
    def('fetch', (url) => {
      fetches.push(url);
      const replay = extra.config === undefined ? { key: 'phc_x', host: 'https://us.i.posthog.com', assets: 'https://us-assets.i.posthog.com' } : extra.config;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ replay }) });
    });
    delete globalThis.Replay;
    vi.resetModules();
    return import('../../screens/shared/replay.js').then(() => new Promise((r) => setTimeout(r, 0)));
  }

  beforeEach(() => { scripts = []; fetches = []; inits = []; });

  it('runs on the six pages only', async () => {
    for (const p of ['/', '/library', '/make', '/designer', '/designer/edit', '/guide', '/make/', '/designer/index.html']) {
      await boot(p);
      expect(globalThis.Replay.enabled, p).toBe(true);
      expect(fetches, p).toEqual(['/api/analytics-config']);
      expect(scripts, p).toHaveLength(1);
      expect(scripts[0].src).toBe('https://us-assets.i.posthog.com/static/array.js');
    }
    for (const p of ['/player', '/host', '/teacher', '/teacher/report', '/prototype', '/privacy', '/feedback', '/share/abc', '/good-question']) {
      await boot(p);
      expect(globalThis.Replay.enabled, p).toBe(false);
      expect(fetches, p).toHaveLength(0);
      expect(scripts, p).toHaveLength(0);
    }
  });

  it('never inside a frame, never with Do Not Track or Global Privacy Control, never when the server says off', async () => {
    await boot('/make', { framed: true });
    expect(globalThis.Replay.enabled).toBe(false);
    await boot('/make', { dnt: '1' });
    expect(globalThis.Replay.enabled).toBe(false);
    await boot('/make', { gpc: true });
    expect(globalThis.Replay.enabled).toBe(false);
    await boot('/make', { config: null });
    expect(globalThis.Replay.enabled).toBe(true);
    expect(scripts).toHaveLength(0);
  });

  it('initialises the SDK with everything but recording switched off, inputs and teacher text masked, frames blocked', async () => {
    const store = { 'jamyard.aid': 'a1b2c3d4e5f60718' };
    await boot('/make', { store });
    scripts[0].onload();
    expect(inits).toHaveLength(1);
    const { key, opts } = inits[0];
    expect(key).toBe('phc_x');
    expect(opts.api_host).toBe('https://us.i.posthog.com');
    ['autocapture', 'capture_pageview', 'capture_pageleave', 'capture_heatmaps', 'capture_dead_clicks', 'capture_exceptions', 'capture_performance']
      .forEach((k) => expect(opts[k], k).toBe(false));
    expect(opts.disable_surveys).toBe(true);
    expect(opts.disable_web_experiments).toBe(true);
    expect(opts.persistence).toBe('localStorage');
    expect(opts.respect_dnt).toBe(true);
    expect(opts.person_profiles).toBe('identified_only');
    // No relay visit id around in this boot: no sessionID is invented
    expect(opts.bootstrap).toEqual({ distinctID: 'a1b2c3d4e5f60718', isIdentifiedID: false });
    expect(opts.disable_session_recording).toBeUndefined();
    const rec = opts.session_recording;
    expect(rec.maskAllInputs).toBe(true);
    expect(rec.recordCrossOriginIframes).toBe(false);
    expect(rec.recordHeaders).toBe(false);
    expect(rec.recordBody).toBe(false);
    expect(rec.blockSelector).toContain('iframe');
    for (const sel of ['[contenteditable]', '#chat-messages', '#my-yard', '.sv-text']) expect(rec.maskTextSelector).toContain(sel);
  });

  it('seeds the recorder with the relay\'s visit id, so a recording lines up with its page views', async () => {
    const SID = '019928a0-1b2c-7d3e-8f40-0123456789ab';
    await boot('/make');
    Object.defineProperty(globalThis, 'Analytics', { value: { sessionId: () => SID }, configurable: true, writable: true });
    expect(globalThis.Replay.options({ host: 'h', key: 'k', assets: 'a' }).bootstrap.sessionID).toBe(SID);
    // Without the relay module, the stored id still counts; a non-UUIDv7 does not
    Object.defineProperty(globalThis, 'Analytics', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: () => SID + '|123' }, configurable: true, writable: true });
    expect(globalThis.Replay.options({ host: 'h', key: 'k', assets: 'a' }).bootstrap.sessionID).toBe(SID);
    Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: () => 'rivera|123' }, configurable: true, writable: true });
    expect(globalThis.Replay.options({ host: 'h', key: 'k', assets: 'a' }).bootstrap.sessionID).toBeUndefined();
  });

  it('trims the SDK\'s own URL and referrer properties', async () => {
    await boot('/make');
    const out = globalThis.Replay.sanitize({
      $current_url: 'https://jamyard.org/make?game=period-3-exit-ticket&from=home#yard',
      $pathname: '/make',
      $referrer: 'https://mail.google.com/mail/u/0/?token=abc',
      $initial_referrer: '$direct',
      other: 'kept'
    });
    expect(out.$current_url).toBe('https://jamyard.org/make');
    expect(out.$referrer).toBe('mail.google.com');
    expect(out.$initial_referrer).toBe('$direct');
    expect(out.other).toBe('kept');
    expect(globalThis.Replay.sanitize(null)).toBeNull();
  });

  it('the masked selectors exist where the teacher types', async () => {
    const editor = await read('screens/designer/editor.html');
    expect(editor).toContain('id="chat-messages"');
    const home = await read('screens/home/index.html');
    expect(home).toContain('id="my-yard"');
    const simple = await read('screens/designer/simple-view.js');
    expect(simple).toContain("'sv-text'");
    const boldBox = await read('screens/shared/bold-box.js');
    expect(boldBox.toLowerCase()).toContain('contenteditable');
  });
});
