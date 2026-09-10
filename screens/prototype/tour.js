// tour.js — the first-visit tour of Try it out: a spotlight moves from
// piece to piece with a yellow card that names each one (what it is, what
// it is for). Shown once per browser after the first launch, and again
// from the help card's "Take the tour". Stops come from BenchLogic.TOUR_STOPS
// (target, optional fallback, title, text); a stop whose target is not on
// screen is skipped.
//
// Plain script (browser global): window.BenchTour = { start, stop, running }.

(function () {
  'use strict';

  var SEEN_KEY = 'jamyard-bench-tour-seen';
  var PAD = 8;
  var state = null; // { stops, index, onEnd, shade, spot, card, els }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function visible(node) {
    return !!(node && !node.hidden && node.offsetParent !== null && node.getBoundingClientRect().width > 0);
  }

  function resolve(stop) {
    var node = document.querySelector(stop.target);
    if (visible(node)) return node;
    if (stop.fallback) {
      node = document.querySelector(stop.fallback);
      if (visible(node)) return node;
    }
    return null;
  }

  function seen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (err) { return true; }
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (err) { /* shows again next time */ }
  }

  function build() {
    var shade = el('div', 'tour-shade');
    var spot = el('div', 'tour-spot');
    var card = el('div', 'tour-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tour-title');
    card.setAttribute('aria-describedby', 'tour-text');
    var inner = el('div', 'tour-card-inner');
    var label = el('span', 'tour-label');
    var title = el('span', 'tour-title');
    title.id = 'tour-title';
    var text = el('span', 'tour-text');
    text.id = 'tour-text';
    var row = el('div', 'tour-btns');
    var back = el('button', 'tour-back', 'Back');
    back.type = 'button';
    var next = el('button', 'tour-next', 'Next');
    next.type = 'button';
    var skip = el('button', 'tour-skip', 'Skip the tour');
    skip.type = 'button';
    row.appendChild(back);
    row.appendChild(next);
    row.appendChild(skip);
    inner.appendChild(label);
    inner.appendChild(title);
    inner.appendChild(text);
    inner.appendChild(row);
    var notch = el('div', 'tour-notch');
    notch.setAttribute('aria-hidden', 'true');
    card.appendChild(inner);
    card.appendChild(notch);
    document.body.appendChild(shade);
    document.body.appendChild(spot);
    document.body.appendChild(card);
    back.addEventListener('click', function () { go(state.index - 1); });
    next.addEventListener('click', function () { go(state.index + 1); });
    skip.addEventListener('click', stop);
    shade.addEventListener('click', function (e) { e.stopPropagation(); });
    return { shade: shade, spot: spot, card: card, label: label, title: title, text: text, back: back, next: next, notch: notch };
  }

  // The stops that are actually on screen right now
  function liveStops(stops) {
    var out = [];
    for (var i = 0; i < stops.length; i++) {
      var node = resolve(stops[i]);
      if (node) out.push({ stop: stops[i], node: node });
    }
    return out;
  }

  function place() {
    if (!state) return;
    var live = state.live[state.index];
    if (!live) return;
    var ui = state.ui;
    var r = live.node.getBoundingClientRect();
    ui.spot.style.left = (r.left - PAD) + 'px';
    ui.spot.style.top = (r.top - PAD) + 'px';
    ui.spot.style.width = (r.width + PAD * 2) + 'px';
    ui.spot.style.height = (r.height + PAD * 2) + 'px';

    var w = ui.card.offsetWidth;
    var h = ui.card.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cx = r.left + r.width / 2;
    var below = r.bottom + PAD + 10;
    var flip = below + h <= vh - 8 || r.top - PAD - 10 - h < 8;
    var top = flip ? below : r.top - PAD - 10 - h;
    // A tall target (a whole screen column): the card sits over its
    // middle rather than off the bottom of the window
    if (flip && top + h > vh - 8) { top = Math.max(8, r.top + r.height / 2 - h / 2); flip = false; ui.card.classList.add('no-notch'); }
    else ui.card.classList.remove('no-notch');
    var left = cx - Math.min(80, w / 2);
    left = Math.max(8, Math.min(left, vw - w - 8));
    top = Math.max(8, Math.min(top, vh - h - 8));
    ui.card.style.left = left + 'px';
    ui.card.style.top = top + 'px';
    ui.card.classList.toggle('flip', flip);
    ui.card.style.setProperty('--notch-left', Math.max(12, Math.min(cx - left - 13, w - 40)) + 'px');
  }

  function go(index) {
    if (!state) return;
    if (index >= state.live.length) { stop(); return; }
    if (index < 0) index = 0;
    state.index = index;
    var live = state.live[index];
    var ui = state.ui;
    ui.label.textContent = 'Tour · ' + (index + 1) + ' of ' + state.live.length;
    ui.title.textContent = live.stop.title;
    ui.text.textContent = live.stop.text;
    ui.back.hidden = index === 0;
    ui.next.textContent = index === state.live.length - 1 ? 'Done' : 'Next';
    try { live.node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* ignore */ }
    place();
    ui.next.focus();
  }

  function onKey(e) {
    if (!state) return;
    if (e.key === 'Escape') { e.preventDefault(); stop(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(state.index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(state.index - 1); }
    e.stopPropagation();
  }

  function start(stops, onEnd) {
    stop();
    var live = liveStops(stops || []);
    if (!live.length) { if (onEnd) onEnd(); return false; }
    state = { live: live, index: 0, onEnd: onEnd || null, ui: build(), returnTo: document.activeElement };
    document.body.classList.add('tour-on');
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    go(0);
    return true;
  }

  function stop() {
    if (!state) return;
    var s = state;
    state = null;
    markSeen();
    document.body.classList.remove('tour-on');
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    s.ui.shade.remove();
    s.ui.spot.remove();
    s.ui.card.remove();
    try { if (s.returnTo && s.returnTo.focus) s.returnTo.focus(); } catch (err) { /* ignore */ }
    if (s.onEnd) s.onEnd();
  }

  function running() { return !!state; }

  globalThis.BenchTour = { start: start, stop: stop, running: running, seen: seen };
})();
