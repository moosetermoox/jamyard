// The home page's first screen (design handoff 2026-09-26,
// docs/design_handoff_jamyard_madlib_intro): one madlib sentence says what
// Jamyard is. Three blanks are wooden blocks that spin like slot-machine
// reels and land on different words; every combination reads correctly.
// Scrolling fades the intro away, the JAM/YARD wordmark flies into the
// header's corner, and the visitor lands on the home page proper.
//
// The reel position is a pure function of time and a sorted list of hops
// (reelState), so a frame never depends on the last one and the tests can
// ask what a reel shows at any second. Motion, scroll, and flight math are
// the pure functions on the export; mount() owns the DOM. Under reduced
// motion the finished sentence shows at once and nothing spins.
(function () {
  'use strict';

  var SCENES = [
    { name: 'Wordmark', dur: 1.0 },
    { name: 'Sentence', dur: 0.9 },
    { name: 'Spin', dur: 3.2 },
    { name: 'Hold', dur: 2.4 }
  ];
  var CUES = {};
  var D = 0;
  SCENES.forEach(function (s) { CUES[s.name] = D; D += s.dur; });

  var SPIN = 2.2;          // the first spin of each reel, seconds
  var SPIN_STAGGER = 0.45; // between the three reels' starts
  var IDLE_SPIN = 1.1;     // one hop after the first play
  var IDLE_LEAD = 1.5;     // after the loop point, before the first idle hop
  var IDLE_GAP = 6;        // between idle hops
  var IDLE_MAX = 3;        // idle hops in all, then the page is still (WCAG 2.2.2: the handoff's "stop after about 3 hops")
  var HOVER_DELAY = 90;    // ms: long enough to ignore a cursor passing through
  var WIGGLE_NEAR = 120;   // px from the sentence that wakes the middle block once
  var WIGGLE_LEN = 0.7;
  var FADE_SCREENS = 0.6;  // scroll distance of the fade, in viewport heights
  var FADE_SCREENS_NARROW = 0.3; // under NARROW_UNDER px: the stacked sentence is tall, so a long crossfade
                                // laid it over the fold (a reviewer on a phone, 2026-09-28)
  var NARROW_UNDER = 600;
  var CUE_NUDGE_AFTER = 4000;
  var CUE_NUDGE_HALF = 700;

  var ROW = 58;            // a block's row height
  var PITCH = ROW + 18;    // rows keep 18px apart so neighbors never bleed into the window
  var CANVAS = {
    wide: { w: 1280, h: 440 },
    stack: { w: 640, h: 640 }
  };
  var STACK_UNDER = 760;   // container width under which the sentence stacks
  var MAX_SCALE = 1.15;

  // Every combination reads correctly in the frame sentence. A class per
  // paint; the colors live in madlib-intro.css.
  var WORDS = [
    [
      { t: 'YARD', c: 'ml-walnut' },
      { t: 'TOOLBOX', c: 'ml-oak' },
      { t: 'SWISS ARMY KNIFE', c: 'ml-pine' },
      { t: 'ONE-STOP SHOP', c: 'ml-birch' }
    ],
    [
      { t: 'CONNECTING', c: 'ml-magenta' },
      { t: 'THINKING', c: 'ml-cyan' },
      { t: 'REVIEWING', c: 'ml-green' },
      { t: 'HAVING FUN', c: 'ml-orange' }
    ],
    [
      { t: 'REMIX', c: 'ml-oak' },
      { t: 'CUSTOMIZE', c: 'ml-pine' },
      { t: 'ADAPT', c: 'ml-birch' },
      { t: 'BUILD ON', c: 'ml-yellow' }
    ]
  ];
  // Curated first landings (indices into WORDS); later hops are random.
  var FIRST = [[0, 3, 0], [1, 2, 1], [2, 1, 2], [3, 0, 0], [0, 1, 3], [1, 3, 0]];

  // What a screen reader gets instead of the moving sentence.
  var SENTENCE = 'JAMYARD is a yard of whole-class activities for connecting, thinking, reviewing and having fun. Use them, remix them, or create your own.';

  // ── Easing ──
  function easeOutCubic(t) { t = t - 1; return t * t * t + 1; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; }
  function reelEase(t) { return 1 - Math.pow(1 - t, 3.2); }
  function bump(t, from, amt) { return amt * Math.sin(Math.PI * Math.max(0, (t - from) / (1 - from))); }
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function ramp(abs, start, d, ease) {
    if (abs <= start) return 0;
    if (abs >= start + d) return 1;
    return ease((abs - start) / d);
  }
  function enter(abs, at, d) { return ramp(abs, at, d || 0.32, easeOutCubic); }
  function fade(abs, at, d) { return ramp(abs, at, d || 0.4, easeInOutCubic); }
  function settle(abs, at) { return -4 * Math.sin(Math.PI * fade(abs, at, 0.45)); }
  function rowRotation(j) { return j % 2 ? 1.2 : -1.2; }

  function hash(a, b, c) {
    var h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function newSeed() { return Math.floor(Math.random() * 1e6); }
  function firstLanding(seed) { return FIRST[seed % FIRST.length]; }

  // The idle schedule: after the first play, one blank re-spins every
  // IDLE_GAP seconds (IDLE_LEAD after the loop point), never the same slot
  // twice in a row, IDLE_MAX hops in all. Returns the hops for one slot.
  function idleEvents(seed, slot, n) {
    var ev = [];
    var prev = -1;
    for (var j = 1; j <= IDLE_MAX; j++) {
      var who = hash(seed, 7, j) % 3;
      if (who === prev) who = (who + 1 + (hash(seed, 9, j) % 2)) % 3;
      prev = who;
      if (who === slot) ev.push({ t: D + IDLE_LEAD + (j - 1) * IDLE_GAP, step: 1 + (hash(seed, slot, j) % (n - 1)) });
    }
    return ev;
  }

  // Pure in time. Before `start` the slot is empty. The first spin travels
  // two laps plus the landing index over SPIN seconds with an overshoot.
  // After it, `events` (idle hops plus hover hops, any order) play one at
  // a time: a hop that lands while another runs waits its turn.
  function reelState(n, abs, start, target, events) {
    function md(x) { return ((Math.round(x) % n) + n) % n; }
    if (abs < start) return { pos: 0, shown: false, spinning: false, idx: target };
    if (abs < start + SPIN) {
      var t = (abs - start) / SPIN;
      return { pos: (2 * n + target) * reelEase(t) - bump(t, 0.82, 0.14), shown: true, spinning: true, first: true, t: t, to: target, idx: target };
    }
    var ev = (events || []).slice().sort(function (x, y) { return x.t - y.t; });
    var pos = 2 * n + target;
    var busyUntil = -1;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t > abs) break;
      var t0 = Math.max(e.t, busyUntil);
      var u = clamp01((abs - t0) / IDLE_SPIN);
      busyUntil = t0 + IDLE_SPIN;
      if (u < 1) return { pos: pos + e.step * reelEase(u) - bump(u, 0.8, 0.08), shown: true, spinning: true, t: u, from: md(pos), to: md(pos + e.step), idx: md(pos + e.step) };
      pos += e.step;
    }
    return { pos: pos, shown: true, spinning: false, idx: md(pos) };
  }

  // When the next hop on a reel begins, or null: the earliest event after
  // `abs` (a hop already begun keeps the reel spinning on its own).
  function nextEventTime(events, abs) {
    var best = null;
    (events || []).forEach(function (e) { if (e.t > abs && (best == null || e.t < best)) best = e.t; });
    return best;
  }

  // The reel window's width follows the word on show: the widest while
  // spinning, easing to the landed word over the last 30% of the first
  // spin, and between old and new on later hops.
  function windowWidth(st, widths) {
    var maxW = 0;
    for (var i = 0; i < widths.length; i++) if (widths[i] > maxW) maxW = widths[i];
    if (!st.shown) return maxW;
    if (!st.spinning) return widths[st.idx];
    if (st.first) return maxW + (widths[st.to] - maxW) * smooth((st.t - 0.7) / 0.3);
    return widths[st.from] + (widths[st.to] - widths[st.from]) * smooth(st.t);
  }

  // Where each word's row sits for a reel position: word k shows at the
  // row j = k (mod n) nearest pos, so n fixed rows draw every lap.
  function rowFor(k, n, pos) {
    var j = k + n * Math.round((pos - k) / n);
    return { j: j, y: (j - pos) * PITCH, rot: rowRotation(j) };
  }

  // Scroll progress p in [0, 1] over FADE_SCREENS viewport heights (a
  // narrow window: FADE_SCREENS_NARROW).
  function fadeScreens(width) { return width != null && width < NARROW_UNDER ? FADE_SCREENS_NARROW : FADE_SCREENS; }

  function progress(scrollY, viewportHeight, width) {
    var dist = viewportHeight * fadeScreens(width);
    return dist > 0 ? clamp01(scrollY / dist) : 1;
  }

  // The header's student door under the fading intro: it rose through the
  // sentence at full strength on a phone and read as a tab floating over
  // the words (a reviewer, 2026-09-28). The intro carries its own door, so
  // the header's fades in over the last fifth of the fade.
  function doorOpacity(p) { return smooth((p - 0.8) / 0.2); }

  function scrollState(p) {
    return {
      opacity: 1 - p,
      transform: 'translateY(' + (-p * 48) + 'px) scale(' + (1 - p * 0.03) + ')',
      visibility: p >= 1 ? 'hidden' : 'visible',
      pointerEvents: p > 0.5 ? 'none' : 'auto',
      cue: p < 0.2
    };
  }

  // The wordmark's flight from the sentence (src) to the header (tgt),
  // smoothstep over p, scale from the size ratio to 1, origin top left.
  function flyTransform(src, tgt, p) {
    var e = smooth(p);
    var x = src.x + (tgt.x - src.x) * e;
    var y = src.y + (tgt.y - src.y) * e;
    var s0 = src.w / tgt.w;
    return 'translate(' + x + 'px, ' + y + 'px) scale(' + (s0 + (1 - s0) * e) + ')';
  }

  // The sentence as rows of tokens for a layout. `at` is when the words
  // fade up; a reel's `at` is when its dashed slot shows.
  function lines(layout) {
    var W = CUES.Wordmark;
    var S = CUES.Sentence;
    var mark = { kind: 'mark', jamAt: W + 0.1, yardAt: W + 0.35 };
    if (layout === 'stack') {
      return [
        { tall: true, tokens: [mark, { kind: 'words', text: 'is a', at: W + 0.7 }] },
        { tall: true, tokens: [{ kind: 'reel', slot: 0, at: S }] },
        { tall: false, tokens: [{ kind: 'words', text: 'of whole-class activities', at: S + 0.1 }] },
        { tall: true, tokens: [{ kind: 'words', text: 'for', at: S + 0.1 }, { kind: 'period', slot: 1, at: S + 0.1 }] },
        { tall: true, tokens: [{ kind: 'link', text: 'Use them,', href: '#yard', at: S + 0.2 }, { kind: 'reel', slot: 2, at: S + 0.2 }] },
        { tall: false, tokens: [{ kind: 'words', text: 'them, or', at: S + 0.2 }, { kind: 'link', text: 'create your own.', href: '/designer', at: S + 0.2 }] }
      ];
    }
    return [
      { tall: true, tokens: [mark, { kind: 'words', text: 'is a', at: W + 0.7 }, { kind: 'reel', slot: 0, at: S }] },
      { tall: true, tokens: [{ kind: 'words', text: 'of whole-class activities for', at: S + 0.1 }, { kind: 'period', slot: 1, at: S + 0.1 }] },
      { tall: true, tokens: [{ kind: 'link', text: 'Use them,', href: '#yard', at: S + 0.2 }, { kind: 'reel', slot: 2, at: S + 0.2 }, { kind: 'words', text: 'them, or', at: S + 0.2 }, { kind: 'link', text: 'create your own.', href: '/designer', at: S + 0.2 }] }
    ];
  }

  function reelStarts() {
    var s0 = CUES.Spin;
    return [s0, s0 + SPIN_STAGGER, s0 + 2 * SPIN_STAGGER];
  }

  // ── DOM ──
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function block(word) {
    return el('span', 'ml-block' + (word.c ? ' ' + word.c : ''), word.t);
  }

  // Cached style writes: a frame that changes nothing touches nothing.
  function styler(node) {
    var last = {};
    return function (prop, value) {
      if (last[prop] === value) return;
      last[prop] = value;
      node.style[prop] = value;
    };
  }

  function mount(root, opts) {
    opts = opts || {};
    if (!root) return null;
    var reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var holder = root.querySelector('.ml-sentence');
    var intro = root;
    var cue = root.querySelector('.intro-cue');
    var cueLine = root.querySelector('.intro-cue-line');
    var fly = opts.fly || null;
    var headerMark = opts.headerMark || null;
    var joinTab = opts.joinTab || null;
    var joinButton = root.querySelector('.intro-join');
    var setDoor = joinTab && joinTab.parentNode ? styler(joinTab.parentNode) : null;

    var seed = newSeed();
    var target = firstLanding(seed);
    var starts = reelStarts();
    var manual = [[], [], []];
    var idle = WORDS.map(function (list, k) { return idleEvents(seed, k, list.length); });
    var wiggleAt = null;
    var wiggled = false;
    var t0 = null;
    var raf = 0;
    var wake = 0;
    var layout = null;
    var scale = 1;
    var reels = [];
    var words = [];
    var mark = null;
    var canvas = null;
    var box = null;
    var lastAbs = reduced ? D : 0;

    function eventsFor(k) { return idle[k].concat(manual[k]); }
    function now() { return t0 == null ? lastAbs : (performance.now() - t0) / 1000; }

    // ── Build the sentence for a layout ──
    function build(which) {
      layout = which;
      holder.textContent = '';
      reels = []; words = []; mark = null;
      box = el('div', 'ml-box');
      canvas = el('div', 'ml-canvas ml-' + which);
      var col = el('div', 'ml-lines');
      lines(which).forEach(function (line) {
        var row = el('div', line.tall ? 'ml-line' : 'ml-line ml-line-text');
        line.tokens.forEach(function (tok) {
          if (tok.kind === 'mark') row.appendChild(buildMark(tok));
          else if (tok.kind === 'words') row.appendChild(buildWords(tok.text, tok.at));
          else if (tok.kind === 'link') row.appendChild(buildLink(tok.text, tok.href, tok.at));
          else if (tok.kind === 'reel') row.appendChild(buildReel(tok.slot, tok.at));
          else if (tok.kind === 'period') {
            var wrap = el('span', 'ml-period');
            wrap.appendChild(buildReel(tok.slot, tok.at));
            wrap.appendChild(buildWords('.', tok.at));
            row.appendChild(wrap);
          }
        });
        col.appendChild(row);
      });
      canvas.appendChild(col);
      box.appendChild(canvas);
      holder.appendChild(box);
      measureWidths();
    }

    function buildMark(tok) {
      var m = el('span', 'ml-mark');
      m.setAttribute('data-mark', '');
      var jam = el('span', 'ml-wm ml-wm-jam', 'JAM');
      var yard = el('span', 'ml-wm ml-wm-yard', 'YARD');
      m.appendChild(jam); m.appendChild(yard);
      mark = { node: m, set: styler(m), jam: styler(jam), yard: styler(yard), jamAt: tok.jamAt, yardAt: tok.yardAt, done: false };
      return m;
    }

    function buildWords(text, at) {
      var w = el('span', 'ml-words', text);
      words.push({ set: styler(w), at: at, done: false });
      return w;
    }

    // "Use them" and "create your own" are the sentence's two doors (a
    // reviewer, 2026-09-27: the first screen had nothing a teacher could
    // press): the yard below, and the Create page. Same fade as the words.
    function buildLink(text, href, at) {
      var a = el('a', 'ml-words ml-link', text);
      a.href = href;
      words.push({ set: styler(a), at: at, done: false });
      return a;
    }

    function buildReel(slot, slotAt) {
      var list = WORDS[slot];
      var n = list.length;
      var reel = el('span', 'ml-reel');
      var measure = el('span', 'ml-measure');
      var measures = list.map(function (w) {
        var m = el('span', 'ml-measure-one');
        m.appendChild(block(w));
        measure.appendChild(m);
        return m;
      });
      var win = el('span', 'ml-window');
      var slotBox = el('span', 'ml-slot');
      var strip = el('span', 'ml-strip');
      var rows = list.map(function (w) {
        var r = el('span', 'ml-row');
        var b = block(w);
        r.appendChild(b);
        strip.appendChild(r);
        return { set: styler(r), block: styler(b) };
      });
      win.appendChild(slotBox); win.appendChild(strip);
      reel.appendChild(measure); reel.appendChild(win);
      var r = {
        slot: slot, n: n, slotAt: slotAt, start: starts[slot], target: target[slot],
        node: reel, set: styler(reel), win: styler(win), slotBox: styler(slotBox), strip: styler(strip),
        rows: rows, measures: measures, widths: null, hoverT: 0
      };
      if (!reduced) {
        reel.addEventListener('mouseenter', function () {
          clearTimeout(r.hoverT);
          r.hoverT = setTimeout(function () { poke(r); }, HOVER_DELAY);
        });
        reel.addEventListener('mouseleave', function () { clearTimeout(r.hoverT); });
        reel.addEventListener('click', function () { clearTimeout(r.hoverT); poke(r); });
      }
      reels.push(r);
      return reel;
    }

    function measureWidths() {
      reels.forEach(function (r) {
        r.widths = r.measures.map(function (m) { return m.offsetWidth; });
      });
    }

    // A hover or tap spins the blank one to three words forward, unless it
    // is mid-spin already.
    function poke(r) {
      var abs = now();
      var st = reelState(r.n, abs, r.start, r.target, eventsFor(r.slot));
      if (!st.shown || st.spinning) return;
      manual[r.slot].push({ t: abs, step: 1 + Math.floor(Math.random() * (r.n - 1)) });
      run();
    }

    // ── Layout: the canvas scales to the holder's width ──
    function fit() {
      var w = holder.clientWidth;
      if (!w) return;
      var which = w < STACK_UNDER ? 'stack' : 'wide';
      if (which !== layout) build(which);
      var c = CANVAS[which];
      scale = Math.min(MAX_SCALE, w / c.w);
      box.style.height = (c.h * scale) + 'px';
      canvas.style.transform = 'scale(' + scale + ')';
    }

    // ── One frame; returns whether anything is still moving ──
    function render(abs) {
      lastAbs = abs;
      var moving = false;
      if (mark && !mark.done) {
        var pj = enter(abs, mark.jamAt), py = enter(abs, mark.yardAt);
        mark.jam('opacity', String(pj));
        mark.jam('transform', 'translateY(' + ((1 - pj) * -18) + 'px) rotate(-2deg)');
        mark.yard('opacity', String(py));
        mark.yard('transform', 'translateY(' + ((1 - py) * -18) + 'px) rotate(1.5deg)');
        if (pj >= 1 && py >= 1) mark.done = true; else moving = true;
      }
      words.forEach(function (w) {
        if (w.done) return;
        var p = fade(abs, w.at);
        w.set('opacity', String(p));
        w.set('transform', 'translateY(' + ((1 - p) * 8) + 'px)');
        if (p >= 1) w.done = true; else moving = true;
      });
      reels.forEach(function (r) {
        var st = reelState(r.n, abs, r.start, r.target, eventsFor(r.slot));
        var lift = abs < D ? settle(abs, r.start + SPIN - 0.05) : 0;
        var wt = wiggleAt != null && r.slot === 1 ? abs - wiggleAt : -1;
        var wiggling = wt >= 0 && wt < WIGGLE_LEN;
        var wig = wiggling ? 3.5 * Math.sin(wt * Math.PI * 2 * 3) * (1 - wt / WIGGLE_LEN) : 0;
        if (wiggling || lift !== 0) moving = true;
        r.set('transform', 'translateY(' + lift + 'px) rotate(' + wig + 'deg)');
        var slotOpacity = abs >= r.start ? 0 : fade(abs, r.slotAt) * (1 - fade(abs, r.start - 0.12, 0.12));
        r.slotBox('opacity', String(slotOpacity));
        r.strip('visibility', st.shown ? 'visible' : 'hidden');
        if (r.widths) r.win('width', windowWidth(st, r.widths) + 'px');
        r.rows.forEach(function (row, k) {
          var at = rowFor(k, r.n, st.pos);
          row.set('transform', 'translateY(' + at.y + 'px)');
          row.block('transform', 'rotate(' + at.rot + 'deg)');
        });
        if (st.spinning) moving = true;
      });
      if (abs < D) moving = true;
      return moving;
    }

    // The clock runs only while something moves; a future hop wakes it.
    function frame(t) {
      if (t0 == null) t0 = t;
      var abs = (t - t0) / 1000;
      var moving = render(abs);
      if (moving) { raf = requestAnimationFrame(frame); return; }
      raf = 0;
      var next = null;
      reels.forEach(function (r) {
        var e = nextEventTime(eventsFor(r.slot), abs);
        if (e != null && (next == null || e < next)) next = e;
      });
      if (next != null) wake = setTimeout(run, Math.max(0, (next - abs) * 1000));
    }

    function run() {
      clearTimeout(wake);
      if (!raf) raf = requestAnimationFrame(frame);
    }

    // ── Scroll: the intro fades, the wordmark flies ──
    var p = 0;
    var src = null;
    var tgt = null;
    var scrolled = false;
    var setIntro = styler(intro);
    var setFly = fly ? styler(fly) : null;
    var setHeader = headerMark ? styler(headerMark) : null;
    var setCueLine = cueLine ? styler(cueLine) : null;

    function dist() { return window.innerHeight * fadeScreens(window.innerWidth); }

    function measureSrc() {
      if (!mark) return;
      var r = mark.node.getBoundingClientRect();
      if (r.width) src = { x: r.left, y: r.top, w: r.width };
    }

    // Where the header wordmark sits once the page has scrolled the fade distance.
    function measureTgt() {
      if (!headerMark) return;
      var r = headerMark.getBoundingClientRect();
      if (r.width) tgt = { x: r.left, y: r.top + window.scrollY - dist(), w: r.width };
    }

    function applyScroll() {
      p = progress(window.scrollY, window.innerHeight, window.innerWidth);
      if (p > 0) scrolled = true;
      if (p > 0 && !src) measureSrc();
      var s = scrollState(p);
      setIntro('opacity', String(s.opacity));
      setIntro('transform', s.transform);
      setIntro('visibility', s.visibility);
      setIntro('pointerEvents', s.pointerEvents);
      if (cue) cue.hidden = !s.cue;
      if (setDoor) setDoor('opacity', String(doorOpacity(p)));
      var flying = !!(src && tgt && p > 0 && p < 1);
      if (fly) {
        fly.hidden = !flying;
        if (flying) setFly('transform', flyTransform(src, tgt, p));
      }
      if (mark) mark.set('opacity', p > 0 && src && tgt ? '0' : '1');
      if (setHeader) setHeader('opacity', p >= 1 || !src ? '1' : '0');
    }

    function onResize() {
      fit();
      if (p === 0) src = null;
      measureTgt();
      applyScroll();
      render(now());
    }

    // ── The scroll cue's nudge: after 4s with no scroll, the line dips ──
    var nudge = false;
    var nudgeTimer = 0;
    function startNudge() {
      if (reduced || !setCueLine) return;
      setTimeout(function () {
        nudgeTimer = setInterval(function () {
          if (scrolled) { clearInterval(nudgeTimer); setCueLine('transform', 'translateY(0)'); return; }
          nudge = !nudge;
          setCueLine('transform', nudge ? 'translateY(8px)' : 'translateY(0)');
        }, CUE_NUDGE_HALF);
      }, CUE_NUDGE_AFTER);
    }

    function skip() {
      window.scrollTo({ top: dist(), behavior: 'smooth' });
    }

    // ── Wire up ──
    fit();
    if (reduced) {
      render(D);
    } else {
      run();
      window.addEventListener('pointermove', function onMove(e) {
        if (wiggled || now() < D || !box) return;
        var r = box.getBoundingClientRect();
        var dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
        var dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
        if (Math.hypot(dx, dy) < WIGGLE_NEAR) {
          wiggled = true;
          wiggleAt = now();
          window.removeEventListener('pointermove', onMove);
          run();
        }
      });
    }
    window.addEventListener('scroll', applyScroll, { passive: true });
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
    measureTgt();
    applyScroll();
    startNudge();
    if (cue) cue.addEventListener('click', function (e) { e.preventDefault(); skip(); });
    // The same door as the header's tab: land on the home page with the code strip open.
    if (joinButton) joinButton.addEventListener('click', function () {
      window.scrollTo({ top: dist(), behavior: 'auto' });
      if (joinTab) joinTab.click();
    });

    // The handle: a screenshot script (or a hidden tab, where animation
    // frames never fire) can draw any second of the play with renderAt.
    var handle = {
      seed: seed,
      target: target,
      now: now,
      layout: function () { return layout; },
      refit: onResize,
      renderAt: function (abs) { render(abs); }
    };
    window.MadlibIntro.current = handle;
    return handle;
  }

  window.MadlibIntro = {
    SCENES: SCENES,
    CUES: CUES,
    D: D,
    SPIN: SPIN,
    SPIN_STAGGER: SPIN_STAGGER,
    IDLE_SPIN: IDLE_SPIN,
    IDLE_LEAD: IDLE_LEAD,
    IDLE_GAP: IDLE_GAP,
    IDLE_MAX: IDLE_MAX,
    HOVER_DELAY: HOVER_DELAY,
    FADE_SCREENS: FADE_SCREENS,
    FADE_SCREENS_NARROW: FADE_SCREENS_NARROW,
    fadeScreens: fadeScreens,
    doorOpacity: doorOpacity,
    ROW: ROW,
    PITCH: PITCH,
    CANVAS: CANVAS,
    STACK_UNDER: STACK_UNDER,
    MAX_SCALE: MAX_SCALE,
    WORDS: WORDS,
    FIRST: FIRST,
    SENTENCE: SENTENCE,
    firstLanding: firstLanding,
    idleEvents: idleEvents,
    reelState: reelState,
    nextEventTime: nextEventTime,
    windowWidth: windowWidth,
    rowFor: rowFor,
    reelStarts: reelStarts,
    lines: lines,
    progress: progress,
    scrollState: scrollState,
    flyTransform: flyTransform,
    enter: enter,
    fade: fade,
    settle: settle,
    mount: mount
  };
})();
