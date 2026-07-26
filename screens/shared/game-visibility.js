// Game visibility — the one filter behind every public activity list.
//
// The site is public, but visitors only see the curated set: built-in
// activities marked `featured`, plus activities created on THIS device
// (ids remembered by my-games.js). Owner mode (owner-mode.js) shows
// everything. Used by the designer grid, the host picker, and prototype
// mode so the three lists can never drift apart.
//
// Plain script (loaded with a <script> tag); also works as a side-effect
// ESM import in tests because it attaches to globalThis. Keep it pure and
// dependency-free.

(function () {
  'use strict';

  // games: [{ id, source, featured, ... }]
  // opts:  { owner: boolean, myIds: string[] }
  function visibleGames(games, opts) {
    var owner = !!(opts && opts.owner);
    var myIds = (opts && opts.myIds) || [];
    if (owner) return games.slice();
    return games.filter(function (game) {
      if ((game.source || 'built-in') === 'user') {
        return myIds.indexOf(game.id) !== -1;
      }
      return !!game.featured;
    });
  }

  globalThis.GameVisibility = { visibleGames: visibleGames };
})();
