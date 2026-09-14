/**
 * Site analytics relay (2026-09-13).
 *
 * PostHog is a SINK, never a script. Minors use Jamyard, so no browser
 * ever talks to PostHog: teacher pages post a named event to our own
 * server (POST /api/track), the server adds a few of its own (a room
 * opened, an activity ran), and this module batches them to PostHog's
 * capture API. Consequences, all deliberate:
 *
 *   - Student and projector screens load nothing (guarded by
 *     tests/screens/analytics-surface.test.js).
 *   - No cookies, no session replay, no autocapture, no heatmaps, no
 *     feature flags: there is no SDK to turn them on.
 *   - No person profiles ($process_person_profile: false on every event)
 *     and no geo enrichment ($geoip_disable). The only IP PostHog can
 *     see is the server's own.
 *   - The allowlist below is the whole schema. An event it does not name
 *     is dropped; a property it does not name is dropped; every property
 *     is a route, an enum, a small integer, a boolean, or a built-in
 *     activity slug. There is no free-text kind, so a name, an answer,
 *     or a room code can never ride along.
 *   - Nothing here throws into a request or a socket handler, and a
 *     failed send is dropped, never retried into a backlog.
 *
 * Off entirely when POSTHOG_KEY is unset (local dev, tests, CI).
 */

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/** Teacher routes a page view may name. Never /player, /host, /teacher. */
export const TRACKED_PATHS = ['/', '/library', '/make', '/designer', '/designer/edit', '/prototype', '/guide', '/privacy', '/share'];

const ENTRY_POINTS = ['home', 'library', 'create', 'share', 'none'];
const DOORS = ['try', 'host', 'designer'];
const FEEDBACK_KINDS = ['problem', 'idea', 'praise', 'builder-request', 'other'];
const CREATE_RESULTS = ['match', 'existing', 'none', 'storyboard', 'error'];
const GAME_SOURCES = ['built-in', 'custom'];
const STARTS = ['together', 'rolling'];

/**
 * Event → property → shape. Kinds: path (one of TRACKED_PATHS), enum
 * (one of values), int (0..100000), bool, game (a built-in slug or
 * "custom"), host (a referring site's hostname, or direct / internal),
 * tag (a campaign tag from one of our own links: utm_source and friends,
 * lowercase slug, 40 chars). Host and tag come from the URL bar, which
 * is where the teacher came FROM, never something typed into Jamyard.
 * Adding a kind means teaching sanitizeEvent about it; adding a
 * free-text kind is the one thing this file must never do.
 */
export const ANALYTICS_EVENTS = {
  // Browser (teacher pages only)
  page_viewed: {
    path: { kind: 'path' },
    from: { kind: 'enum', values: ENTRY_POINTS },
    referrer: { kind: 'host' },
    utm_source: { kind: 'tag' },
    utm_medium: { kind: 'tag' },
    utm_campaign: { kind: 'tag' }
  },
  activity_opened: {
    dest: { kind: 'enum', values: DOORS },
    page: { kind: 'enum', values: ['make', 'yard', 'create'] },
    edited: { kind: 'bool' }
  },
  create_result: {
    result: { kind: 'enum', values: CREATE_RESULTS }
  },
  // Server
  room_created: {
    game: { kind: 'game' },
    source: { kind: 'enum', values: GAME_SOURCES },
    start: { kind: 'enum', values: STARTS }
  },
  activity_started: {
    game: { kind: 'game' },
    players: { kind: 'int' }
  },
  activity_ended: {
    game: { kind: 'game' },
    players: { kind: 'int' },
    minutes: { kind: 'int' }
  },
  feedback_sent: {
    category: { kind: 'enum', values: FEEDBACK_KINDS }
  }
};

const GAME_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const BROWSER_ID = /^[a-f0-9]{16,32}$/;
const DISTINCT_ID = /^[a-z0-9:-]{8,64}$/;
const MAX_INT = 100_000;
// A hostname: labels of letters, digits, hyphens, joined by dots (no port,
// no path, no userinfo, so nothing a tracking link could smuggle).
const HOSTNAME = /^(?=.{1,80}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const REFERRER_LITERALS = ['direct', 'internal'];
const TAG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:]{3,45}$/i;

/**
 * True for an address PostHog could place on a map: a well-formed public
 * IPv4 or IPv6. Loopback, private ranges, and link-local are not (a dev
 * server, a proxy hop), and neither is anything else.
 * @param {unknown} ip
 */
export function isPublicIp(ip) {
  if (typeof ip !== 'string') return false;
  // An IPv4 address carried inside IPv6 (what Node reports on a dual-stack socket)
  if (/^::ffff:/i.test(ip)) return isPublicIp(ip.slice(7));
  const v4 = IPV4.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (IPV6.test(ip) && ip.includes(':')) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return false;
    return true;
  }
  return false;
}

function coerce(spec, value) {
  switch (spec.kind) {
    case 'path':
      return typeof value === 'string' && TRACKED_PATHS.includes(value) ? value : undefined;
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value) ? value : undefined;
    case 'int': {
      const n = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
      return Number.isInteger(n) && n >= 0 && n <= MAX_INT ? n : undefined;
    }
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'game':
      return typeof value === 'string' && GAME_SLUG.test(value) ? value : undefined;
    case 'host': {
      if (typeof value !== 'string') return undefined;
      const low = value.toLowerCase();
      return REFERRER_LITERALS.includes(low) || HOSTNAME.test(low) ? low : undefined;
    }
    case 'tag':
      return typeof value === 'string' && TAG.test(value.toLowerCase()) ? value.toLowerCase() : undefined;
    default:
      return undefined;
  }
}

/**
 * The allowlist, applied. Returns null for an event the list does not
 * name; otherwise the event with ONLY its declared, well-typed properties.
 * @param {unknown} event
 * @param {unknown} props
 * @returns {{ event: string, properties: Record<string, string|number|boolean> } | null}
 */
export function sanitizeEvent(event, props) {
  if (typeof event !== 'string' || !Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, event)) return null;
  const shape = ANALYTICS_EVENTS[event];
  const properties = {};
  const source = props && typeof props === 'object' ? props : {};
  for (const key of Object.keys(shape)) {
    const value = coerce(shape[key], source[key]);
    if (value !== undefined) properties[key] = value;
  }
  return { event, properties };
}

/**
 * Reads a POST /api/track body. The browser id is a random hex string the
 * teacher's browser minted for itself (screens/shared/analytics.js); a body
 * without one is refused rather than guessed at.
 * @param {unknown} body
 * @returns {{ event: string, props: object, distinctId: string } | null}
 */
export function parseClientEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const { event, props, aid } = /** @type {any} */ (body);
  if (typeof event !== 'string') return null;
  if (props !== undefined && (props === null || typeof props !== 'object' || Array.isArray(props))) return null;
  if (typeof aid !== 'string' || !BROWSER_ID.test(aid)) return null;
  return { event, props: props || {}, distinctId: aid };
}

/**
 * @param {{ key?: string, host?: string, fetch?: typeof fetch, now?: () => number,
 *           flushMs?: number, maxBatch?: number, log?: (line: string) => void }} [opts]
 */
export function createAnalytics(opts = {}) {
  const key = typeof opts.key === 'string' ? opts.key.trim() : '';
  const host = String(opts.host || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '');
  const doFetch = opts.fetch || globalThis.fetch;
  const now = opts.now || Date.now;
  const flushMs = opts.flushMs ?? 5_000;
  const maxBatch = opts.maxBatch ?? 50;
  const log = opts.log || ((line) => console.log(line));
  const enabled = key.length > 0 && typeof doFetch === 'function';

  /** @type {object[]} */
  let queue = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush(); }, flushMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    try {
      const res = await doFetch(host + '/batch/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, batch })
      });
      if (!res || !res.ok) log(`[analytics] PostHog refused a batch of ${batch.length} (${res ? res.status : 'no response'}); dropped`);
    } catch (err) {
      log(`[analytics] Could not reach PostHog (${err && err.message}); ${batch.length} event(s) dropped`);
    }
  }

  return {
    enabled,
    /**
     * Queue one event. Returns false when it was refused (off, unknown
     * event, bad id), so callers can stay fire-and-forget.
     *
     * `extra.ip`: the visitor's public address, passed ONLY for events a
     * teacher page posted. PostHog reads it for country and region, then
     * (with "Discard client IP data" on in the project) drops it; without
     * it the event is geo-free and PostHog sees nothing but our server.
     * @param {string} event
     * @param {object} [props]
     * @param {string} distinctId
     * @param {{ ip?: string }} [extra]
     */
    track(event, props, distinctId, extra = {}) {
      if (!enabled) return false;
      const sane = sanitizeEvent(event, props);
      if (!sane) return false;
      if (typeof distinctId !== 'string' || !DISTINCT_ID.test(distinctId)) return false;
      const geo = isPublicIp(extra.ip) ? { $ip: extra.ip } : { $geoip_disable: true };
      queue.push({
        event: sane.event,
        distinct_id: distinctId,
        timestamp: new Date(now()).toISOString(),
        properties: {
          ...sane.properties,
          $process_person_profile: false,
          ...geo,
          $lib: 'jamyard-relay'
        }
      });
      if (queue.length >= maxBatch) flush();
      else schedule();
      return true;
    },
    flush,
    pending: () => queue.length,
    stop() { if (timer) { clearTimeout(timer); timer = null; } }
  };
}
