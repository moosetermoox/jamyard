// Activity preferences — ♥ favorites and "recently used", shared by the
// library page and the designer grid so both surfaces agree on what "mine,
// lately" means. This-browser only (localStorage) — the same no-accounts
// model as MyGames.
//
// Plain script (browser global) + side-effect-importable in tests; falls
// back to in-memory storage where localStorage doesn't exist.

(function () {
  'use strict';

  var memory = {};

  function readIdList(key) {
    try {
      var raw = globalThis.localStorage.getItem(key);
      var ids = raw ? JSON.parse(raw) : [];
      return Array.isArray(ids) ? ids : [];
    } catch (e) {
      return memory[key] || [];
    }
  }

  function writeIdList(key, ids) {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(ids));
    } catch (e) {
      memory[key] = ids;
    }
  }

  var Favorites = {
    KEY: 'lanyard-favorites',
    list: function () { return readIdList(this.KEY); },
    has: function (id) { return this.list().indexOf(id) !== -1; },
    toggle: function (id) {
      var ids = this.list();
      var at = ids.indexOf(id);
      if (at === -1) ids.push(id); else ids.splice(at, 1);
      writeIdList(this.KEY, ids);
    }
  };

  var Recents = {
    KEY: 'lanyard-recents',
    MAX: 8,
    list: function () { return readIdList(this.KEY); },
    has: function (id) { return this.list().indexOf(id) !== -1; },
    add: function (id) {
      var ids = this.list().filter(function (x) { return x !== id; });
      ids.unshift(id);
      writeIdList(this.KEY, ids.slice(0, this.MAX));
    }
  };

  globalThis.ActivityPrefs = { Favorites: Favorites, Recents: Recents };
})();
