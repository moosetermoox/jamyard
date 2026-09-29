// host-session.js — the pure decision behind the host screen's socket
// 'connect' handler: does this (re)connect rebind to a room, forget a
// stale one, or fall through to the picker / ?game= auto-create path?
//
// Why it exists (2026-09-10 classroom bug): the projector's tab sat behind
// the teacher console in the same browser, its socket dropped and came
// back, and the old handler bailed out on the ?game= in the URL, so the
// host never rebound. Students showed up on the console and never on the
// projector. A LIVE room in this tab now rebinds on every reconnect no
// matter what the URL says; the URL rules only apply to a page load.
//
// No DOM here. host.js feeds it the URL search string plus what it holds
// in memory and in sessionStorage. Plain script (browser global):
// window.HostSession.

(function () {
  'use strict';

  function params(search) {
    return new URLSearchParams(search || '');
  }

  // How long a room remembered in localStorage is worth trying: the
  // server's own snapshot lifetime (six hours). Older is a new day.
  var REMEMBER_MS = 6 * 60 * 60 * 1000;

  // opts.search     — window.location.search
  // opts.hash       — window.location.hash (a PIN rides here, never in
  //                   the query, so it never reaches server logs)
  // opts.live       — {code, hostToken} the tab is hosting right now (a
  //                   reconnect), or null on a fresh page load
  // opts.saved      — {code, hostToken} from sessionStorage, or null
  // opts.remembered — {code, hostToken, at} from localStorage (the last
  //                   room this BROWSER hosted), or null. A closed
  //                   projector tab has no sessionStorage left, so a
  //                   fresh /host on the same computer finds the room
  //                   here (a reviewer, 2026-09-27).
  // opts.now        — the clock, for the remembered room's age
  // Returns {kind: 'rejoin', code, hostToken} |
  //         {kind: 'rejoin-pin', code, pin, key} (the console's "Open the
  //         projector again": /host?room=CODE#pin=PIN&key=KEY; the key
  //         gets past a PIN lockout a guessing student caused) |
  //         {kind: 'forget'} | {kind: 'fresh'} | {kind: 'none'}
  function connectAction(opts) {
    opts = opts || {};
    var live = opts.live;
    if (live && live.code && live.hostToken) {
      return { kind: 'rejoin', code: live.code, hostToken: live.hostToken };
    }
    var p = params(opts.search);
    // "Host a Game" from home appends ?new=1 to mean "start fresh".
    if (p.get('new')) return { kind: 'forget' };
    // The console sent this tab to pick a running room back up.
    var room = (p.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (room.length === 4) {
      var h = params(String(opts.hash || '').replace(/^#/, ''));
      var pin = h.get('pin') || '';
      var key = h.get('key') || '';
      if (pin || key) return { kind: 'rejoin-pin', code: room, pin: pin, key: key };
    }
    // ?game= / prototype launches always want a FRESH room on a page load
    // (the editor's Try it out, sim harnesses).
    if (p.get('game') || p.get('prototype')) return { kind: 'fresh' };
    var saved = opts.saved;
    if (saved && saved.code && saved.hostToken) {
      return { kind: 'rejoin', code: saved.code, hostToken: saved.hostToken };
    }
    var rem = opts.remembered;
    if (rem && rem.code && rem.hostToken) {
      var age = (opts.now || Date.now()) - (Number(rem.at) || 0);
      if (age >= 0 && age < REMEMBER_MS) {
        return { kind: 'rejoin', code: rem.code, hostToken: rem.hostToken };
      }
    }
    return { kind: 'none' };
  }

  // Once a ?game= launch has its room, the address drops the param so an
  // F5 (or the browser discarding the background tab and reloading it)
  // rebinds to the running room instead of minting a new one. Prototype
  // iframes keep their address: they are meant to be fresh every time.
  // Returns the new path, or null to leave the address alone.
  function urlAfterCreate(search) {
    var p = params(search);
    if (p.get('prototype')) return null;
    // A ?room= pickup drops its param the same way once the room is bound
    // (the PIN in the hash goes with it)
    if (!p.get('game') && !p.get('room')) return null;
    return '/host';
  }

  globalThis.HostSession = {
    connectAction: connectAction,
    urlAfterCreate: urlAfterCreate,
    REMEMBER_MS: REMEMBER_MS
  };
})();
