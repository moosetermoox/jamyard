/**
 * Site analytics relay (2026-09-13). PostHog is a sink, never a script:
 * teacher pages post allowlisted events to our own server, the server
 * batches them to PostHog with no person profiles, no IP enrichment, and
 * only the property keys each event declares. Minors use the site, so
 * the allowlist is the whole design: an event the list does not name is
 * dropped, a property it does not name is dropped, free text can never
 * pass, and nothing here ever throws into a request or a socket handler.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ANALYTICS_EVENTS,
  sanitizeEvent,
  parseClientEvent,
  createAnalytics,
  isPublicIp,
  replayConfig,
  toPostHog,
  DEFAULT_POSTHOG_HOST
} from '../../services/analytics.js';

const AID = 'a1b2c3d4e5f60718';

describe('sanitizeEvent', () => {
  it('drops events the allowlist does not name', () => {
    expect(sanitizeEvent('student_typed', { text: 'hi' })).toBeNull();
    expect(sanitizeEvent('', {})).toBeNull();
    expect(sanitizeEvent(42, {})).toBeNull();
  });

  it('keeps only the declared property keys, typed', () => {
    const out = sanitizeEvent('page_viewed', {
      path: '/make',
      from: 'home',
      name: 'Ms. Rivera',
      query: '?game=x',
      answer: 'my dog is called Rex'
    });
    expect(out).toEqual({ event: 'page_viewed', properties: { path: '/make', from: 'home' } });
  });

  it('refuses a path that is not one of the teacher routes', () => {
    expect(sanitizeEvent('page_viewed', { path: '/make?game=exit-ticket' }).properties).toEqual({});
    expect(sanitizeEvent('page_viewed', { path: '/player' }).properties).toEqual({});
    expect(sanitizeEvent('page_viewed', { path: '/host' }).properties).toEqual({});
    expect(sanitizeEvent('page_viewed', { path: '/teacher' }).properties).toEqual({});
    expect(sanitizeEvent('page_viewed', { path: '/designer/edit' }).properties).toEqual({ path: '/designer/edit' });
    expect(sanitizeEvent('page_viewed', { path: '/' }).properties).toEqual({ path: '/' });
  });

  it('refuses an enum value outside its list', () => {
    expect(sanitizeEvent('activity_opened', { dest: 'host' }).properties).toEqual({ dest: 'host' });
    expect(sanitizeEvent('activity_opened', { dest: 'Rex the dog' }).properties).toEqual({});
    expect(sanitizeEvent('feedback_sent', { category: 'praise' }).properties).toEqual({ category: 'praise' });
    expect(sanitizeEvent('feedback_sent', { category: 'i hate school' }).properties).toEqual({});
  });

  it('coerces integers and booleans, and drops anything else', () => {
    expect(sanitizeEvent('activity_started', { game: 'exit-ticket', players: '24' }).properties)
      .toEqual({ game: 'exit-ticket', players: 24 });
    expect(sanitizeEvent('activity_started', { players: 'twenty' }).properties).toEqual({});
    expect(sanitizeEvent('activity_started', { players: -3 }).properties).toEqual({});
    expect(sanitizeEvent('activity_started', { players: 1e9 }).properties).toEqual({});
    expect(sanitizeEvent('activity_opened', { edited: 'yes' }).properties).toEqual({});
    expect(sanitizeEvent('activity_opened', { edited: true }).properties).toEqual({ edited: true });
  });

  it('a game label is a slug or "custom", never a name', () => {
    expect(sanitizeEvent('room_created', { game: 'doodle-bluff' }).properties.game).toBe('doodle-bluff');
    expect(sanitizeEvent('room_created', { game: 'custom' }).properties.game).toBe('custom');
    expect(sanitizeEvent('room_created', { game: 'Period 3 Exit Ticket' }).properties.game).toBeUndefined();
    expect(sanitizeEvent('room_created', { game: 'x'.repeat(80) }).properties.game).toBeUndefined();
  });

  it('where the visit came from: a referring hostname, never a path; campaign tags as slugs', () => {
    const p = (props) => sanitizeEvent('page_viewed', props).properties;
    expect(p({ referrer: 'www.google.com' })).toEqual({ referrer: 'www.google.com' });
    expect(p({ referrer: 'District.K12.CA.US' })).toEqual({ referrer: 'district.k12.ca.us' });
    expect(p({ referrer: 'direct' })).toEqual({ referrer: 'direct' });
    expect(p({ referrer: 'internal' })).toEqual({ referrer: 'internal' });
    expect(p({ referrer: 'https://www.google.com/search?q=jamyard' })).toEqual({});
    expect(p({ referrer: 'mail.example.com/u/0/?token=abc' })).toEqual({});
    expect(p({ referrer: 'user@host.com' })).toEqual({});
    expect(p({ referrer: 'localhost' })).toEqual({});
    expect(p({ referrer: 'a'.repeat(90) + '.com' })).toEqual({});
    expect(p({ utm_source: 'newsletter', utm_medium: 'Email', utm_campaign: 'pd-day_2026' }))
      .toEqual({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'pd-day_2026' });
    expect(p({ utm_source: 'Ms. Rivera <rivera@school.org>' })).toEqual({});
    expect(p({ utm_campaign: 'x'.repeat(41) })).toEqual({});
    expect(p({ utm_term: 'anything' })).toEqual({});
  });

  it('isPublicIp keeps only addresses that can be placed on a map', () => {
    ['203.0.113.9', '8.8.8.8', '2001:db8::1', '::ffff:203.0.113.9'].forEach((ip) => expect(isPublicIp(ip), ip).toBe(true));
    ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '100.64.0.1', '0.0.0.0',
      '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '999.1.1.1', 'unknown', '', null, 42].forEach((ip) => expect(isPublicIp(ip), String(ip)).toBe(false));
  });

  it('a visit id is a UUIDv7 and nothing else', () => {
    const p = (props) => sanitizeEvent('page_viewed', props).properties;
    expect(p({ session: '019928A0-1B2C-7D3E-8F40-0123456789AB' })).toEqual({ session: '019928a0-1b2c-7d3e-8f40-0123456789ab' });
    expect(p({ session: '019928a0-1b2c-4d3e-8f40-0123456789ab' })).toEqual({});
    expect(p({ session: 'rivera' })).toEqual({});
    expect(sanitizeEvent('page_left', { path: '/make', session: '019928a0-1b2c-7d3e-8f40-0123456789ab', name: 'x' }).properties)
      .toEqual({ path: '/make', session: '019928a0-1b2c-7d3e-8f40-0123456789ab' });
  });

  it('every declared property has a shape the sanitizer understands', () => {
    const kinds = new Set(['path', 'enum', 'int', 'bool', 'game', 'host', 'tag', 'uuid']);
    Object.entries(ANALYTICS_EVENTS).forEach(([event, props]) => {
      expect(event).toMatch(/^[a-z_]+$/);
      Object.entries(props).forEach(([key, spec]) => {
        expect(key, `${event}.${key}`).toMatch(/^[a-z_]+$/);
        expect(kinds.has(spec.kind), `${event}.${key} kind ${spec.kind}`).toBe(true);
        if (spec.kind === 'enum') expect(Array.isArray(spec.values) && spec.values.length > 0).toBe(true);
      });
    });
  });

  it('no event declares a free-text property (the design rule)', () => {
    Object.values(ANALYTICS_EVENTS).forEach((props) => {
      Object.values(props).forEach((spec) => {
        expect(['string', 'text']).not.toContain(spec.kind);
      });
    });
  });
});

describe('parseClientEvent (POST /api/track body)', () => {
  it('reads a well-formed body', () => {
    expect(parseClientEvent({ event: 'page_viewed', props: { path: '/guide' }, aid: AID }))
      .toEqual({ event: 'page_viewed', props: { path: '/guide' }, distinctId: AID });
  });

  it('refuses a body without a plausible browser id (no id = no event, never a guess)', () => {
    expect(parseClientEvent({ event: 'page_viewed', props: {}, aid: 'ms.rivera@school.org' })).toBeNull();
    expect(parseClientEvent({ event: 'page_viewed', props: {} })).toBeNull();
    expect(parseClientEvent({ event: 'page_viewed', props: {}, aid: 'abc' })).toBeNull();
  });

  it('refuses junk', () => {
    expect(parseClientEvent(null)).toBeNull();
    expect(parseClientEvent('page_viewed')).toBeNull();
    expect(parseClientEvent({ event: 'page_viewed', props: 'x', aid: AID })).toBeNull();
    expect(parseClientEvent({ event: ['page_viewed'], props: {}, aid: AID })).toBeNull();
  });
});

describe('toPostHog (the wire shape PostHog\'s dashboards read)', () => {
  const SID = '019928a0-1b2c-7d3e-8f40-0123456789ab';

  it('a page view goes out as $pageview with the page, the source, and the visit', () => {
    const out = toPostHog('page_viewed', { path: '/make', from: 'home', referrer: 'www.google.com', utm_source: 'newsletter', session: SID }, { host: 'jamyard.org' });
    expect(out.event).toBe('$pageview');
    expect(out.properties).toEqual({
      $pathname: '/make',
      $host: 'jamyard.org',
      $current_url: 'https://jamyard.org/make',
      $referrer: 'https://www.google.com',
      $referring_domain: 'www.google.com',
      utm_source: 'newsletter',
      from: 'home',
      $session_id: SID
    });
  });

  it('direct and internal referrers, the root path, and a page leave', () => {
    expect(toPostHog('page_viewed', { path: '/', referrer: 'direct' }, { host: 'jamyard.org' }).properties)
      .toEqual({ $pathname: '/', $host: 'jamyard.org', $current_url: 'https://jamyard.org/', $referrer: '$direct', $referring_domain: '$direct' });
    expect(toPostHog('page_viewed', { path: '/guide', referrer: 'internal' }, { host: 'jamyard.org' }).properties)
      .toEqual({ $pathname: '/guide', $host: 'jamyard.org', $current_url: 'https://jamyard.org/guide', $referrer: 'https://jamyard.org', $referring_domain: 'jamyard.org' });
    const left = toPostHog('page_left', { path: '/guide', session: SID }, { host: 'jamyard.org' });
    expect(left.event).toBe('$pageleave');
    expect(left.properties).toEqual({ $pathname: '/guide', $host: 'jamyard.org', $current_url: 'https://jamyard.org/guide', $session_id: SID });
  });

  it('a bad or missing host leaves the URL out rather than inventing one', () => {
    expect(toPostHog('page_viewed', { path: '/make', referrer: 'internal' }, {}).properties).toEqual({ $pathname: '/make' });
    expect(toPostHog('page_viewed', { path: '/make' }, { host: 'evil host/../x' }).properties).toEqual({ $pathname: '/make' });
  });

  it('every other event keeps its name; only the visit id is renamed', () => {
    expect(toPostHog('activity_opened', { dest: 'host', session: SID }, { host: 'jamyard.org' }))
      .toEqual({ event: 'activity_opened', properties: { dest: 'host', $session_id: SID } });
    expect(toPostHog('room_created', { game: 'exit-ticket' }, {})).toEqual({ event: 'room_created', properties: { game: 'exit-ticket' } });
  });

  it('the batch carries the mapped shape', async () => {
    const { fetch, calls } = fakeFetch();
    const a = createAnalytics({ key: 'k', fetch });
    a.track('page_viewed', { path: '/guide', referrer: 'direct', session: SID }, AID, { ip: '203.0.113.9', host: 'jamyard.org' });
    await a.flush();
    const e = calls[0].body.batch[0];
    expect(e.event).toBe('$pageview');
    expect(e.properties.$current_url).toBe('https://jamyard.org/guide');
    expect(e.properties.$session_id).toBe(SID);
    expect(e.properties.$ip).toBe('203.0.113.9');
    expect(e.properties.$process_person_profile).toBe(false);
    expect(e.properties.path).toBeUndefined();
    expect(e.properties.session).toBeUndefined();
  });
});

describe('replayConfig (GET /api/analytics-config)', () => {
  it('is null without a key or when switched off', () => {
    expect(replayConfig({})).toBeNull();
    expect(replayConfig({ key: '' })).toBeNull();
    expect(replayConfig({ key: 'phc_x', replay: '0' })).toBeNull();
    expect(replayConfig({ key: 'phc_x', replay: 'false' })).toBeNull();
    expect(replayConfig({ key: 'phc_x', replay: 'off' })).toBeNull();
  });

  it('derives the assets host from the ingest host', () => {
    expect(replayConfig({ key: 'phc_x' })).toEqual({ key: 'phc_x', host: 'https://us.i.posthog.com', assets: 'https://us-assets.i.posthog.com' });
    expect(replayConfig({ key: 'phc_x', host: 'https://eu.i.posthog.com/', replay: '1' }).assets).toBe('https://eu-assets.i.posthog.com');
    expect(replayConfig({ key: 'phc_x', host: 'https://ph.example.org' }).assets).toBe('https://ph.example.org');
  });
});

function fakeFetch(status = 200) {
  const calls = [];
  const fetch = vi.fn(async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    return { ok: status < 400, status };
  });
  return { fetch, calls };
}

describe('createAnalytics', () => {
  it('is off without a key: track returns false and nothing is ever sent', async () => {
    const { fetch } = fakeFetch();
    const a = createAnalytics({ key: '', fetch });
    expect(a.enabled).toBe(false);
    expect(a.track('page_viewed', { path: '/' }, AID)).toBe(false);
    await a.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('batches to PostHog with no person profile and no geo enrichment', async () => {
    const { fetch, calls } = fakeFetch();
    let t = 1_700_000_000_000;
    const a = createAnalytics({ key: 'phc_test', fetch, now: () => t, flushMs: 60_000 });
    expect(a.enabled).toBe(true);
    expect(a.track('page_viewed', { path: '/make', from: 'home', name: 'leak' }, AID)).toBe(true);
    t += 1000;
    expect(a.track('activity_started', { game: 'exit-ticket', players: 26 }, 'room:9f3c2a1b-0000-4000-8000-000000000001')).toBe(true);
    expect(a.pending()).toBe(2);
    await a.flush();
    expect(a.pending()).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DEFAULT_POSTHOG_HOST + '/batch/');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    const body = calls[0].body;
    expect(body.api_key).toBe('phc_test');
    expect(body.batch).toHaveLength(2);
    const [first, second] = body.batch;
    expect(first.event).toBe('$pageview');
    expect(first.distinct_id).toBe(AID);
    expect(first.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(first.properties).toEqual({
      $pathname: '/make',
      from: 'home',
      $process_person_profile: false,
      $geoip_disable: true,
      $lib: 'jamyard-relay'
    });
    expect(second.properties.players).toBe(26);
    expect(second.properties.$process_person_profile).toBe(false);
    expect(JSON.stringify(body)).not.toContain('leak');
  });

  it('honors a custom host and strips a trailing slash', async () => {
    const { fetch, calls } = fakeFetch();
    const a = createAnalytics({ key: 'k', host: 'https://eu.i.posthog.com/', fetch });
    a.track('page_viewed', { path: '/' }, AID);
    await a.flush();
    expect(calls[0].url).toBe('https://eu.i.posthog.com/batch/');
  });

  it('refuses an unknown event and a bad distinct id without queueing', () => {
    const { fetch } = fakeFetch();
    const a = createAnalytics({ key: 'k', fetch });
    expect(a.track('student_answered', { text: 'x' }, AID)).toBe(false);
    expect(a.track('page_viewed', { path: '/' }, 'Ms. Rivera')).toBe(false);
    expect(a.track('page_viewed', { path: '/' }, '')).toBe(false);
    expect(a.pending()).toBe(0);
  });

  it('flushes on its own once the batch is full', async () => {
    const { fetch } = fakeFetch();
    const a = createAnalytics({ key: 'k', fetch, maxBatch: 3, flushMs: 60_000 });
    for (let i = 0; i < 3; i++) a.track('page_viewed', { path: '/' }, AID);
    await a.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body).toContain('"batch"');
  });

  it('never throws: a failed or rejected send is logged and the batch dropped', async () => {
    const log = vi.fn();
    const bad = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const a = createAnalytics({ key: 'k', fetch: bad, log });
    a.track('page_viewed', { path: '/' }, AID);
    await expect(a.flush()).resolves.toBeUndefined();
    expect(a.pending()).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ECONNRESET'));

    const { fetch } = fakeFetch(503);
    const b = createAnalytics({ key: 'k', fetch, log });
    b.track('page_viewed', { path: '/' }, AID);
    await expect(b.flush()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('503'));
  });

  it('a teacher-page event carries the visitor address for geo; a server event stays geo-free', async () => {
    const { fetch, calls } = fakeFetch();
    const a = createAnalytics({ key: 'k', fetch });
    a.track('page_viewed', { path: '/' }, AID, { ip: '203.0.113.9' });
    a.track('page_viewed', { path: '/' }, AID, { ip: '2001:db8::1' });
    a.track('room_created', { game: 'exit-ticket' }, 'room:9f3c2a1b-0000-4000-8000-000000000001');
    a.track('page_viewed', { path: '/' }, AID, { ip: '127.0.0.1' });
    a.track('page_viewed', { path: '/' }, AID, { ip: '10.0.0.5' });
    a.track('page_viewed', { path: '/' }, AID, { ip: 'not an address' });
    await a.flush();
    const [pub4, pub6, room, loop, priv, junk] = calls[0].body.batch.map((e) => e.properties);
    expect(pub4.$ip).toBe('203.0.113.9');
    expect(pub4.$geoip_disable).toBeUndefined();
    expect(pub6.$ip).toBe('2001:db8::1');
    for (const p of [room, loop, priv, junk]) {
      expect(p.$ip).toBeUndefined();
      expect(p.$geoip_disable).toBe(true);
    }
  });

  it('the batch never carries an IP, a name, or a room code', async () => {
    const { fetch, calls } = fakeFetch();
    const a = createAnalytics({ key: 'k', fetch });
    a.track('room_created', { game: 'exit-ticket', code: 'ABCD', ip: '1.2.3.4', hostName: 'Rivera', start: 'rolling' }, AID);
    await a.flush();
    const props = calls[0].body.batch[0].properties;
    expect(Object.keys(props).sort()).toEqual(['$geoip_disable', '$lib', '$process_person_profile', 'game', 'start']);
  });
});
