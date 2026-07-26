// Owner mode — unlocks the full activity list and owner-only controls.
//
// The flag itself is just localStorage (it only changes what THIS browser
// displays); the real secrets stay server-side — /feedback, built-in
// edits/deletes, and /api/owner-check all demand the owner password (Basic
// Auth, SITE_PASSWORD). unlock() hits /api/owner-check so the browser
// prompts for the password once and caches it for the realm.
//
// Plain script; also importable in tests (isOn/lock work without fetch).

(function () {
  'use strict';

  var KEY = 'lanyard-owner';

  globalThis.OwnerMode = {
    isOn: function () {
      try {
        return globalThis.localStorage.getItem(KEY) === '1';
      } catch (e) {
        return false;
      }
    },
    // Verifies against the server (browser shows the password prompt when
    // needed), then marks this browser. Returns a Promise<boolean>.
    unlock: function () {
      return fetch('/api/owner-check')
        .then(function (resp) {
          if (!resp.ok) return false;
          try { globalThis.localStorage.setItem(KEY, '1'); } catch (e) {}
          return true;
        })
        .catch(function () { return false; });
    },
    lock: function () {
      try { globalThis.localStorage.removeItem(KEY); } catch (e) {}
    }
  };
})();
