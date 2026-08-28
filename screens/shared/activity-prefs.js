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

  // The shed: activities put away without deleting them. They leave the
  // yard row and the piles but stay searchable, and come back with one
  // click. Same this-browser-only model as MyGames.
  var Archived = {
    KEY: 'lanyard-archived',
    list: function () { return readIdList(this.KEY); },
    has: function (id) { return this.list().indexOf(id) !== -1; },
    toggle: function (id) {
      var ids = this.list();
      var at = ids.indexOf(id);
      if (at === -1) ids.push(id); else ids.splice(at, 1);
      writeIdList(this.KEY, ids);
    }
  };

  // Yard row order: hearted first (the ♥ doubles as "keep this up front"),
  // then recently used (most recent first), then the rest newest-saved
  // first (MyGames records save order; reversing it needs no timestamps,
  // so it works in DB and filesystem modes alike). Pure — takes id lists,
  // returns a new array — so it stays testable.
  function orderYard(games, opts) {
    var hearts = (opts && opts.hearts) || [];
    var recents = (opts && opts.recents) || [];
    var created = (opts && opts.created) || [];
    var out = [];
    var placed = {};
    var take = function (id) {
      for (var i = 0; i < games.length; i++) {
        if (games[i].id === id && !placed[id]) {
          out.push(games[i]);
          placed[id] = true;
        }
      }
    };
    hearts.forEach(take);
    recents.forEach(take);
    var rest = games.filter(function (g) { return !placed[g.id]; });
    rest.sort(function (a, b) {
      // Higher save index = newer = earlier; unknowns keep input order last.
      return created.indexOf(b.id) - created.indexOf(a.id);
    });
    return out.concat(rest);
  }

  globalThis.ActivityPrefs = {
    Favorites: Favorites,
    Recents: Recents,
    Archived: Archived,
    orderYard: orderYard
  };
})();
