// Site analytics, browser side (2026-09-13).
//
// Teacher pages only. This file never talks to an analytics vendor: it
// posts a named event to our own server (POST /api/track), which keeps
// an allowlist and relays to PostHog (services/analytics.js). So there
// is no third-party script, no cookie, no session replay, no autocapture,
// and the vendor never sees a visitor's IP. Minors use the student screen
// and see the projector, so this module refuses to run on /player, /host,
// and /teacher even if a page there links it, and it honors Do Not Track
// and Global Privacy Control.
//
// What leaves the browser: an event name, a few allowlisted properties
// (a route, an enum, a count), and a random browser id minted here and
// kept in localStorage so two visits from one browser count as one
// teacher. Never a name, a query string, an activity title, or a room
// code; the server drops anything the allowlist does not name anyway.
//
// Usage: Analytics.track('activity_opened', { dest: 'host', page: 'make' })
// Every event name must be in ANALYTICS_EVENTS (services/analytics.js);
// tests/screens/analytics-surface.test.js checks each call.

(function () {
  'use strict';

  // No-op outside a browser (lets tests side-effect-import shared scripts).
  if (typeof document === 'undefined' || typeof location === 'undefined') return;

  var ENDPOINT = '/api/track';
  var ID_KEY = 'jamyard.aid';
  var ID_SHAPE = /^[a-f0-9]{16,32}$/;
  var NEVER_HERE = /^\/(player|host|teacher)(\/|$)/;
  var ENTRY_POINTS = ['home', 'library', 'create', 'share', 'start'];

  function optedOut() {
    try {
      var nav = navigator || {};
      if (nav.globalPrivacyControl === true) return true;
      var dnt = nav.doNotTrack || window.doNotTrack || nav.msDoNotTrack;
      return dnt === '1' || dnt === 'yes';
    } catch (e) { return false; }
  }

  var enabled = !NEVER_HERE.test(location.pathname) && !optedOut();

  function randomId() {
    var bytes = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var out = '';
    for (var j = 0; j < bytes.length; j++) out += ('0' + bytes[j].toString(16)).slice(-2);
    return out;
  }

  function browserId() {
    try {
      var id = localStorage.getItem(ID_KEY);
      if (!ID_SHAPE.test(id || '')) {
        id = randomId();
        localStorage.setItem(ID_KEY, id);
      }
      return id;
    } catch (e) {
      // No storage (private window, blocked): the visit still counts, as
      // a browser seen once.
      return randomId();
    }
  }

  // The visit: a UUIDv7 (PostHog's required shape for a session id) kept
  // in sessionStorage with the time it was last used; 30 minutes idle
  // starts a new one. Groups a teacher's page views into one visit on
  // PostHog's dashboards, and replay.js seeds the recorder with the same
  // id so a recording lines up with its page views. Random, per tab,
  // holds nothing about the person.
  var SID_KEY = 'jamyard.sid';
  var SID_IDLE_MS = 30 * 60 * 1000;
  var UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var memorySid = null;

  function uuidV7() {
    var bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var ms = Date.now();
    // 48-bit millisecond timestamp, big-endian
    for (var b = 5; b >= 0; b--) { bytes[b] = ms % 256; ms = Math.floor(ms / 256); }
    bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    var hex = '';
    for (var j = 0; j < 16; j++) hex += ('0' + bytes[j].toString(16)).slice(-2);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function sessionId() {
    var now = Date.now();
    var id = null;
    try {
      var stored = String(sessionStorage.getItem(SID_KEY) || '').split('|');
      if (UUID_V7.test(stored[0]) && now - Number(stored[1] || 0) < SID_IDLE_MS) id = stored[0];
    } catch (e) { /* no storage */ }
    if (!id && memorySid && now - memorySid.at < SID_IDLE_MS) id = memorySid.id;
    if (!id) id = uuidV7();
    memorySid = { id: id, at: now };
    try { sessionStorage.setItem(SID_KEY, id + '|' + now); } catch (e) { /* fine */ }
    return id;
  }

  function send(event, props) {
    if (!enabled) return;
    try {
      var withVisit = {};
      Object.keys(props || {}).forEach(function (k) { withVisit[k] = props[k]; });
      withVisit.session = sessionId();
      var body = JSON.stringify({ event: event, props: withVisit, aid: browserId() });
      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([body], { type: 'application/json' });
          if (navigator.sendBeacon(ENDPOINT, blob)) return;
        }
      } catch (e) { /* fall through to fetch */ }
      if (typeof fetch === 'function') {
        fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true })
          .catch(function () {});
      }
    } catch (e) { /* analytics never breaks a page */ }
  }

  // The route without its query (a query can carry an activity id), the
  // entry point when the page was reached through one of ours, where the
  // visit came from (the referring site's hostname only, never its path:
  // 'internal' for our own pages, 'direct' for none), and the campaign
  // tags from one of our own links (utm_source / utm_medium /
  // utm_campaign, lowercase slugs; anything else is left out).
  var TAG_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
  var TAG_SHAPE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

  function referrerHost() {
    try {
      var ref = document.referrer;
      if (!ref) return 'direct';
      var host = String(ref).replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].split('@').pop().split(':')[0].toLowerCase();
      if (!host) return 'direct';
      if (host === String(location.hostname || '').toLowerCase()) return 'internal';
      return host;
    } catch (e) { return 'direct'; }
  }

  function pageProps() {
    var path = String(location.pathname || '/').replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
    var props = { path: path, from: 'none', referrer: referrerHost() };
    try {
      var search = String(location.search || '');
      var m = /[?&]from=([a-z]+)/.exec(search);
      if (m && ENTRY_POINTS.indexOf(m[1]) !== -1) props.from = m[1];
      TAG_KEYS.forEach(function (key) {
        var t = new RegExp('[?&]' + key + '=([^&#]*)').exec(search);
        if (!t) return;
        var value = decodeURIComponent(t[1].replace(/\+/g, ' ')).trim().toLowerCase();
        if (TAG_SHAPE.test(value)) props[key] = value;
      });
    } catch (e) { /* none */ }
    return props;
  }

  window.Analytics = {
    enabled: enabled,
    track: send,
    sessionId: sessionId
  };

  if (enabled) {
    send('page_viewed', pageProps());
    // The end of the page (tab closed, navigated away, put to sleep on a
    // Chromebook): the route only, so the visit gets a duration.
    var left = false;
    var leave = function () {
      if (left) return;
      left = true;
      send('page_left', { path: pageProps().path });
    };
    if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', leave);
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') leave();
        else left = false;
      });
    }
  }
})();
