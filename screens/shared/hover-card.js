// hover-card.js — the activity's description without the click.
//
// Rest the mouse on a plank in the yard, or a tile on the home page, and
// one shared floating paper scrap shows the name, a meta line, and the
// description. Teachers were opening popup after popup just to read
// descriptions (observation 2026-08-27); the home shelf got the same card
// on 2026-09-07. Pointer-only on purpose: keyboard and touch users get the
// same words in the popup the click opens.
//
// Plain script (browser global): window.HoverCard = { attach, hide, metaLine }.
// Everything renders through textContent (activity text is untrusted).
// Pair it with /shared/hover-card.css.

(function () {
  'use strict';

  var card = null;
  var timer = null;
  var DELAY_MS = 220; // a beat, so sweeping across a row doesn't flash a card per tile

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'plank-hovercard';
    card.setAttribute('aria-hidden', 'true');
    card.hidden = true;
    card.appendChild(document.createElement('div')).className = 'hovercard-name';
    card.appendChild(document.createElement('div')).className = 'hovercard-meta';
    card.appendChild(document.createElement('div')).className = 'hovercard-desc';
    document.body.appendChild(card);
    return card;
  }

  // The meta line every activity surface shares: play time, the
  // no-winners note for connection activities, and the rolling-start tag
  // (students start the moment they arrive, no waiting for a Start).
  function metaLine(game) {
    var bits = [];
    if (game.playTime) bits.push(game.playTime);
    if (game.family === 'connection') bits.push('no scores, no winners');
    if (game.start === 'rolling') bits.push('rolling start');
    return bits.join(' · ');
  }

  function hide() {
    clearTimeout(timer);
    if (card) card.hidden = true;
  }

  function show(anchor, game) {
    var el = ensureCard();
    el.querySelector('.hovercard-name').textContent = game.name || '';
    var meta = metaLine(game);
    var metaEl = el.querySelector('.hovercard-meta');
    metaEl.textContent = meta;
    metaEl.hidden = !meta;
    el.querySelector('.hovercard-desc').textContent = game.description || '';
    el.hidden = false;
    // Below the anchor, clamped to the window; flip above when the
    // anchor sits near the bottom edge.
    var r = anchor.getBoundingClientRect();
    var cw = el.offsetWidth;
    var ch = el.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - cw - 8));
    var top = r.bottom + 8;
    if (top + ch > window.innerHeight - 8) top = Math.max(8, r.top - ch - 8);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function attach(anchor, game) {
    anchor.addEventListener('mouseenter', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { show(anchor, game); }, DELAY_MS);
    });
    anchor.addEventListener('mouseleave', hide);
    anchor.addEventListener('click', hide);
  }

  window.HoverCard = { attach: attach, hide: hide, metaLine: metaLine };
})();
