// Host opens two tabs (owner's ask, 2026-09-12): the projector in THIS tab
// and the private teacher console in a NEW one, already signed in. The
// console tab has to open inside the click (browsers block window.open
// after an await), but the room, its code and its PIN only exist once the
// projector page has created it. So the click mints a nonce, opens
// /teacher#await=<nonce>, and sends this tab to /host?game=..&pair=<nonce>;
// the projector publishes {code, pin} under that nonce when the room is
// up, and the console tab, listening for it, joins by itself.
//
//   HostLaunch.begin()          // in the click: opens the console tab
//   HostLaunch.hostUrl(gameId)  // the projector address, carrying the nonce
//   HostLaunch.launch(gameId)   // both, for a plain Host button
//   HostLaunch.abandon()        // the save failed: close the waiting tab
//   HostLaunch.publish(nonce, code, pin)    // the projector, on room-created
//   HostLaunch.listen(nonce, cb)            // the console, on load
//
// The hand-off is same-origin, on the teacher's own machine: localStorage
// (so a console tab that loads AFTER the room is up still finds it) plus
// a BroadcastChannel for the live case. Nothing goes through the server.
// A blocked popup is not an error: the projector opens as before and
// Copy teacher link still works.
(function () {
  'use strict';

  var KEY_PREFIX = 'lanyardHostPair:';
  var CHANNEL = 'lanyard-host-pair';
  var STALE_MS = 60 * 60 * 1000;
  var pending = null; // { nonce, win }

  function mintNonce() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function begin() {
    if (typeof window.open !== 'function') return null;
    var nonce = mintNonce();
    var win = null;
    try { win = window.open('/teacher#await=' + nonce, '_blank'); } catch (e) { win = null; }
    if (!win) return null;
    pending = { nonce: nonce, win: win };
    return pending;
  }

  function hostUrl(gameId) {
    var url = '/host?game=' + encodeURIComponent(gameId);
    if (pending) {
      url += '&pair=' + encodeURIComponent(pending.nonce);
      pending = null;
    }
    return url;
  }

  function abandon() {
    if (pending && pending.win && typeof pending.win.close === 'function') {
      try { pending.win.close(); } catch (e) { /* already gone */ }
    }
    pending = null;
  }

  function launch(gameId) {
    begin();
    window.location.href = hostUrl(gameId);
  }

  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }

  function purgeStale(store) {
    var now = Date.now();
    var gone = [];
    for (var i = 0; i < store.length; i++) {
      var key = store.key(i);
      if (!key || key.indexOf(KEY_PREFIX) !== 0) continue;
      try {
        var rec = JSON.parse(store.getItem(key));
        if (!rec || !rec.at || now - rec.at > STALE_MS) gone.push(key);
      } catch (e) { gone.push(key); }
    }
    gone.forEach(function (key) { store.removeItem(key); });
  }

  function publish(nonce, code, pin) {
    if (!nonce || !code) return;
    var rec = { code: code, pin: pin || '', at: Date.now() };
    var store = storage();
    if (store) {
      try { purgeStale(store); store.setItem(KEY_PREFIX + nonce, JSON.stringify(rec)); } catch (e) { /* full or blocked */ }
    }
    try {
      if (typeof window.BroadcastChannel === 'function') {
        var ch = new BroadcastChannel(CHANNEL);
        ch.postMessage({ nonce: nonce, code: code, pin: pin || '' });
        ch.close();
      }
    } catch (e) { /* no channel */ }
  }

  // Calls cb({code, pin}) once. Returns stop().
  function listen(nonce, cb) {
    var done = false;
    var ch = null;
    function stop() {
      window.removeEventListener('storage', onStorage);
      if (ch) { try { ch.close(); } catch (e) { /* ignore */ } ch = null; }
    }
    function deliver(rec) {
      if (done || !rec || !rec.code) return;
      done = true;
      var store = storage();
      if (store) { try { store.removeItem(KEY_PREFIX + nonce); } catch (e) { /* ignore */ } }
      stop();
      cb({ code: rec.code, pin: rec.pin || '' });
    }
    function onStorage(e) {
      if (e && e.key === KEY_PREFIX + nonce && e.newValue) {
        try { deliver(JSON.parse(e.newValue)); } catch (err) { /* not ours */ }
      }
    }
    var store = storage();
    if (store) {
      try {
        var have = store.getItem(KEY_PREFIX + nonce);
        if (have) { deliver(JSON.parse(have)); return stop; }
      } catch (e) { /* fall through to live listening */ }
    }
    window.addEventListener('storage', onStorage);
    try {
      if (typeof window.BroadcastChannel === 'function') {
        ch = new BroadcastChannel(CHANNEL);
        ch.onmessage = function (e) { if (e && e.data && e.data.nonce === nonce) deliver(e.data); };
      }
    } catch (e) { ch = null; }
    return stop;
  }

  function pairFromHash(hash) {
    var params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    var nonce = params.get('await');
    return nonce && /^[a-z0-9]{6,40}$/.test(nonce) ? nonce : null;
  }

  window.HostLaunch = {
    begin: begin,
    hostUrl: hostUrl,
    abandon: abandon,
    launch: launch,
    publish: publish,
    listen: listen,
    pairFromHash: pairFromHash,
    _reset: function () { pending = null; }
  };
})();
