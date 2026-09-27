// My Activities — remembers which activities were created on THIS device.
//
// There are no accounts, so "mine" is a browser-local list of ids: every
// save/create path calls MyGames.add(id), and the public list filters
// user-created activities down to this list (game-visibility.js). Losing
// the list only hides activities from the picker — the data itself lives
// on the server.
//
// The owner key (2026-09-27): this browser's one random secret, made once
// and kept beside the list. Every /api/games request carries it as the
// X-Owner-Key header (the fetch wrapper below, so no save path can forget
// it); the server stores its hash with each row this browser saves and
// refuses an overwrite or delete from any other browser. Losing it means
// this browser can no longer change its old copies (it can still copy
// them); the server's owner password can. engine/owner-key.js has the
// server half.
//
// Plain script; also importable in tests (falls back to an in-memory store
// where localStorage doesn't exist).

(function () {
  'use strict';

  var KEY = 'lanyard-my-games';
  var OWNER_KEY = 'jamyard.ownerKey';
  var memory = [];
  var memoryOwnerKey = null;

  function read() {
    try {
      var raw = globalThis.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return memory;
    }
  }

  function write(ids) {
    try {
      globalThis.localStorage.setItem(KEY, JSON.stringify(ids));
    } catch (e) {
      memory = ids;
    }
  }

  // 32 base64url characters from the browser's random source (a fallback
  // from Math.random where crypto is missing, an old test runtime).
  function mintKey() {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    var out = '';
    var bytes = new Array(32);
    var c = globalThis.crypto;
    if (c && c.getRandomValues) {
      var buf = new Uint8Array(32);
      c.getRandomValues(buf);
      for (var i = 0; i < 32; i++) bytes[i] = buf[i];
    } else {
      for (var j = 0; j < 32; j++) bytes[j] = Math.floor(Math.random() * 256);
    }
    for (var k = 0; k < 32; k++) out += alphabet.charAt(bytes[k] % 64);
    return out;
  }

  function ownerKey() {
    var key = null;
    try { key = globalThis.localStorage.getItem(OWNER_KEY); } catch (e) { key = memoryOwnerKey; }
    if (typeof key === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(key)) return key;
    key = mintKey();
    try { globalThis.localStorage.setItem(OWNER_KEY, key); } catch (e) { memoryOwnerKey = key; }
    return key;
  }

  globalThis.MyGames = {
    list: function () {
      var ids = read();
      return Array.isArray(ids) ? ids : [];
    },
    add: function (id) {
      if (!id) return;
      var ids = globalThis.MyGames.list();
      if (ids.indexOf(id) === -1) {
        ids.push(id);
        write(ids);
      }
    },
    remove: function (id) {
      var ids = globalThis.MyGames.list().filter(function (x) { return x !== id; });
      write(ids);
    },
    has: function (id) {
      return globalThis.MyGames.list().indexOf(id) !== -1;
    },
    ownerKey: ownerKey,
    // The header every activity write carries (for a caller that builds
    // its own request; the fetch wrapper adds it to plain fetch calls).
    ownerHeaders: function () {
      return { 'X-Owner-Key': ownerKey() };
    }
  };

  // Every same-page fetch of /api/games... carries the key. A Request
  // object as the first argument is left alone (no caller here uses one).
  var nativeFetch = globalThis.fetch;
  if (typeof nativeFetch === 'function' && !nativeFetch.__ownerKeyWrapped) {
    var wrapped = function (input, init) {
      var url = typeof input === 'string' ? input : (input && typeof input.href === 'string' ? input.href : null);
      // Same origin only: a relative /api/games path, or this page's own origin in front of it
      var origin = globalThis.location && globalThis.location.origin ? globalThis.location.origin : '';
      if (url && origin && url.indexOf(origin + '/api/games') === 0) url = url.slice(origin.length);
      if (url && /^\/api\/games(\/|\?|$)/.test(url)) {
        init = init ? Object.assign({}, init) : {};
        var headers = init.headers;
        if (headers && typeof headers.set === 'function') {
          headers = new Headers(headers);
          headers.set('X-Owner-Key', ownerKey());
        } else {
          headers = Object.assign({}, headers || {});
          headers['X-Owner-Key'] = ownerKey();
        }
        init.headers = headers;
      }
      return nativeFetch.call(this, input, init);
    };
    wrapped.__ownerKeyWrapped = true;
    globalThis.fetch = wrapped;
  }
})();
