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
  var ENTRY_POINTS = ['home', 'library', 'create', 'share'];

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

  function send(event, props) {
    if (!enabled) return;
    try {
      var body = JSON.stringify({ event: event, props: props || {}, aid: browserId() });
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

  // The route without its query (a query can carry an activity id), and
  // the entry point when the page was reached through one of ours.
  function pageProps() {
    var path = String(location.pathname || '/').replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
    var from = 'none';
    try {
      var m = /[?&]from=([a-z]+)/.exec(location.search || '');
      if (m && ENTRY_POINTS.indexOf(m[1]) !== -1) from = m[1];
    } catch (e) { /* none */ }
    return { path: path, from: from };
  }

  window.Analytics = {
    enabled: enabled,
    track: send
  };

  if (enabled) send('page_viewed', pageProps());
})();
