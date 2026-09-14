// Session replay (2026-09-13): the ONE place a PostHog script runs in a
// browser. Six teacher authoring pages only: the home (the yard), the
// owner's library console, the make page, the Create page, the editor,
// the guide. Never the student screen, the projector, the teacher
// console or its report, Try it out (its frames show student-shaped
// screens), the feedback inbox, or a share page; and never inside a
// frame. Those pages carry no student content by the teacher-save
// purity rule, which is what makes recording them defensible.
//
// What the recording holds: the page as the teacher saw it, with every
// input masked, every contenteditable box masked (the make page's
// question and fields, the Simple view's text), the Ask AI conversation
// masked, the teacher's own shelf masked, and every iframe blocked. What
// the script is NOT allowed to do: autocapture, page views (the relay in
// analytics.js stays the one event source), heatmaps, dead clicks,
// exceptions, performance, surveys, experiments, cookies. It runs under
// the same random browser id the relay uses, so a replay lines up with
// that browser's events, and it honors Do Not Track and Global Privacy
// Control like the relay does.
//
// Off entirely unless GET /api/analytics-config says so (POSTHOG_KEY set
// and POSTHOG_REPLAY not 0). Recording also needs "Record user sessions"
// on in the PostHog project, which the SDK reads from PostHog itself.

(function () {
  'use strict';

  if (typeof document === 'undefined' || typeof location === 'undefined') return;

  // The six: the home, the owner's library console, make, Create, the editor, the guide
  var ALLOWED = /^\/(library|make|designer|designer\/edit|guide)?$/;
  var NEVER = /^\/(player|host|teacher|prototype|feedback|share)(\/|$)/;
  var ID_KEY = 'jamyard.aid';
  var ID_SHAPE = /^[a-f0-9]{16,32}$/;
  // Everything a teacher typed or named: masked in the recording.
  var MASK_TEXT = '[contenteditable], #chat-messages, #my-yard, .sv-text, .ph-mask';
  // Blocked outright: every frame, and anything marked.
  var BLOCK = 'iframe, .ph-no-capture';

  function path() {
    return String(location.pathname || '/').replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
  }

  function optedOut() {
    try {
      var nav = navigator || {};
      if (nav.globalPrivacyControl === true) return true;
      var dnt = nav.doNotTrack || window.doNotTrack || nav.msDoNotTrack;
      return dnt === '1' || dnt === 'yes';
    } catch (e) { return false; }
  }

  function inFrame() {
    try { return window.top !== window; } catch (e) { return true; }
  }

  var enabled = ALLOWED.test(path()) && !NEVER.test(path()) && !optedOut() && !inFrame();

  // The relay's browser id (analytics.js mints it first; this only reads
  // it, and falls back to a fresh one if that script did not run).
  function browserId() {
    try {
      var id = localStorage.getItem(ID_KEY);
      if (ID_SHAPE.test(id || '')) return id;
    } catch (e) { /* no storage */ }
    var bytes = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var out = '';
    for (var j = 0; j < bytes.length; j++) out += ('0' + bytes[j].toString(16)).slice(-2);
    try { localStorage.setItem(ID_KEY, out); } catch (e) { /* fine */ }
    return out;
  }

  // The SDK's own event properties, trimmed: a URL keeps its path but
  // loses its query (a query can carry an activity id), a referrer keeps
  // its host only.
  function hostOf(url) {
    try { return String(url).replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].split('@').pop().split(':')[0].toLowerCase(); }
    catch (e) { return ''; }
  }
  function stripQuery(url) {
    return String(url).split(/[?#]/)[0];
  }
  function sanitize(props) {
    if (!props || typeof props !== 'object') return props;
    ['$current_url', '$initial_current_url', '$pathname'].forEach(function (k) {
      if (typeof props[k] === 'string') props[k] = stripQuery(props[k]);
    });
    ['$referrer', '$initial_referrer'].forEach(function (k) {
      if (typeof props[k] === 'string' && props[k] !== '$direct') props[k] = hostOf(props[k]) || '$direct';
    });
    return props;
  }

  function options(cfg) {
    return {
      api_host: cfg.host,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_surveys: true,
      disable_web_experiments: true,
      persistence: 'localStorage',
      respect_dnt: true,
      person_profiles: 'identified_only',
      bootstrap: { distinctID: browserId(), isIdentifiedID: false },
      sanitize_properties: sanitize,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: MASK_TEXT,
        blockSelector: BLOCK,
        recordCrossOriginIframes: false,
        recordHeaders: false,
        recordBody: false
      }
    };
  }

  function start(cfg) {
    if (!cfg || !cfg.key || !cfg.host || !cfg.assets) return false;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.src = String(cfg.assets).replace(/\/+$/, '') + '/static/array.js';
      s.onload = function () {
        try {
          if (window.posthog && typeof posthog.init === 'function') posthog.init(cfg.key, options(cfg));
        } catch (e) { /* replay never breaks a page */ }
      };
      (document.head || document.documentElement).appendChild(s);
      return true;
    } catch (e) { return false; }
  }

  window.Replay = { enabled: enabled, options: options, start: start, sanitize: sanitize };

  if (enabled && typeof fetch === 'function') {
    fetch('/api/analytics-config', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { if (c && c.replay) start(c.replay); })
      .catch(function () {});
  }
})();
