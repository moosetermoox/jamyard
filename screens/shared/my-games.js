// My Activities — remembers which activities were created on THIS device.
//
// There are no accounts, so "mine" is a browser-local list of ids: every
// save/create path calls MyGames.add(id), and the public list filters
// user-created activities down to this list (game-visibility.js). Losing
// the list only hides activities from the picker — the data itself lives
// on the server.
//
// Plain script; also importable in tests (falls back to an in-memory store
// where localStorage doesn't exist).

(function () {
  'use strict';

  var KEY = 'lanyard-my-games';
  var memory = [];

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
    }
  };
})();
