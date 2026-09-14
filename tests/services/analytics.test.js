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

  it('every declared property has a shape the sanitizer understands', () => {
    const kinds = new Set(['path', 'enum', 'int', 'bool', 'game']);
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
    expect(first.event).toBe('page_viewed');
    expect(first.distinct_id).toBe(AID);
    expect(first.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(first.properties).toEqual({
      path: '/make',
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

  it('the batch never carries an IP, a name, or a room code', async () => {
    const { fetch, calls } = fakeFetch();
    const a = createAnalytics({ key: 'k', fetch });
    a.track('room_created', { game: 'exit-ticket', code: 'ABCD', ip: '1.2.3.4', hostName: 'Rivera', start: 'rolling' }, AID);
    await a.flush();
    const props = calls[0].body.batch[0].properties;
    expect(Object.keys(props).sort()).toEqual(['$geoip_disable', '$lib', '$process_person_profile', 'game', 'start']);
  });
});
