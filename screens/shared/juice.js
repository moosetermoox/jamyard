// Juice — sounds, confetti, and avatars that make games feel like a party.
//
// Everything here is garnish: every entry point is wrapped so a failure can
// never break gameplay. Sounds are synthesized with the Web Audio API (no
// asset files), confetti is a self-cleaning canvas overlay, avatars are
// deterministic emoji picked from the player's name.
//
// Theme-aware: themes.js stores the active theme's juice profile (oscillator
// wave) and colors as CSS custom properties; confetti reads the theme vars so
// an arcade game rains neon and an ocean game rains blues.
//
// Plain script (loaded with a <script> tag by host/player screens); it also
// works as a side-effect ESM import in tests because it attaches to
// globalThis and every DOM/audio touch is guarded. Keep it dependency-free.

(function () {
  'use strict';

  var hasDOM = typeof document !== 'undefined';

  // --- Avatars -------------------------------------------------------------
  // Friendly, school-safe bank. Deterministic by name so a student keeps the
  // same avatar on every screen all game (host lobby, leaderboard, their device).

  var AVATARS = [
    '🦊', '🐼', '🦁', '🐯', '🐨', '🦋',
    '🐢', '🐙', '🦄', '🐲', '🦉', '🐧',
    '🐻', '🐰', '🦝', '🦩', '🐬', '🦓',
    '🐝', '🦀', '🦎', '🐣', '🦔', '🐘'
  ];

  function avatarFor(name) {
    var s = String(name == null ? '' : name);
    var hash = 0;
    for (var i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATARS[Math.abs(hash) % AVATARS.length];
  }

  // --- Sounds ----------------------------------------------------------------
  // Each cue is a tiny score: notes of {f: freq Hz, at: start sec, d: duration
  // sec, slide: optional end freq}. Played on the theme's oscillator wave.

  var SOUNDS = {
    // A player joined the room — soft rising pop.
    pop:     { gain: 0.10, notes: [{ f: 440, at: 0, d: 0.09, slide: 660 }] },
    // Someone submitted / progress ticked up — tiny neutral blip.
    blip:    { gain: 0.07, notes: [{ f: 880, at: 0, d: 0.05 }] },
    // Content revealed — two-note chime.
    reveal:  { gain: 0.10, notes: [{ f: 523, at: 0, d: 0.12 }, { f: 784, at: 0.10, d: 0.18 }] },
    // Leaderboard / round wrap — quick ascending arpeggio.
    tada:    { gain: 0.10, notes: [{ f: 523, at: 0, d: 0.10 }, { f: 659, at: 0.09, d: 0.10 }, { f: 784, at: 0.18, d: 0.22 }] },
    // Winner / cooperative success — the big one.
    fanfare: { gain: 0.12, notes: [{ f: 523, at: 0, d: 0.12 }, { f: 659, at: 0.10, d: 0.12 }, { f: 784, at: 0.20, d: 0.12 }, { f: 1047, at: 0.30, d: 0.45 }] },
    // Elimination / reset — descending womp.
    womp:    { gain: 0.10, notes: [{ f: 220, at: 0, d: 0.35, slide: 110 }] },
    // Timer in its final seconds — short tick.
    tick:    { gain: 0.06, notes: [{ f: 1200, at: 0, d: 0.03 }] },
    // Winner build-up — accelerating low tom roll (~1.3s), one cue so the
    // per-cue throttle can't chop it up. The fanfare lands right after.
    drumroll: { gain: 0.09, notes: [
      { f: 165, at: 0, d: 0.05 }, { f: 196, at: 0.18, d: 0.05 },
      { f: 165, at: 0.35, d: 0.05 }, { f: 196, at: 0.50, d: 0.05 },
      { f: 165, at: 0.63, d: 0.05 }, { f: 196, at: 0.75, d: 0.04 },
      { f: 165, at: 0.86, d: 0.04 }, { f: 196, at: 0.95, d: 0.04 },
      { f: 165, at: 1.03, d: 0.04 }, { f: 196, at: 1.10, d: 0.04 },
      { f: 165, at: 1.16, d: 0.04 }, { f: 196, at: 1.21, d: 0.03 },
      { f: 165, at: 1.25, d: 0.03 }, { f: 196, at: 1.29, d: 0.03 }
    ] }
  };

  // --- Mute (persisted) ------------------------------------------------------

  var MUTE_KEY = 'lanyard-sfx-muted';
  var mutedState = false;
  try {
    if (typeof localStorage !== 'undefined') {
      mutedState = localStorage.getItem(MUTE_KEY) === 'true';
    }
  } catch (e) { /* storage unavailable — default unmuted */ }

  function muted() { return mutedState; }

  function toggleMuted() {
    mutedState = !mutedState;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MUTE_KEY, String(mutedState));
      }
    } catch (e) { /* storage unavailable */ }
    return mutedState;
  }

  // --- Web Audio playback ------------------------------------------------------
  // Browsers block audio until a user gesture; we lazily create the context and
  // resume it on the first pointer/key event. Cues fired before that are
  // silently dropped — never queued, never errored.

  var audioCtx = null;

  function getAudioCtx() {
    if (audioCtx) return audioCtx;
    var Ctx = (typeof AudioContext !== 'undefined') ? AudioContext
      : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext : null;
    if (!Ctx) return null;
    try { audioCtx = new Ctx(); } catch (e) { return null; }
    return audioCtx;
  }

  if (hasDOM) {
    var unlock = function () {
      var ctx = getAudioCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
      }
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
  }

  function themeWave() {
    var juice = (typeof window !== 'undefined' && window.__themeJuice) || null;
    return (juice && juice.wave) || 'triangle';
  }

  // Per-cue throttle so 30 simultaneous submissions don't machine-gun the room.
  var lastPlayed = {};

  function sound(name) {
    try {
      if (mutedState) return;
      var spec = SOUNDS[name];
      if (!spec) return;
      var now = Date.now();
      if (lastPlayed[name] && now - lastPlayed[name] < 150) return;
      lastPlayed[name] = now;

      var ctx = getAudioCtx();
      if (!ctx || ctx.state !== 'running') return;

      var wave = themeWave();
      var t0 = ctx.currentTime;
      for (var i = 0; i < spec.notes.length; i++) {
        var note = spec.notes[i];
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(note.f, t0 + note.at);
        if (note.slide) {
          osc.frequency.exponentialRampToValueAtTime(note.slide, t0 + note.at + note.d);
        }
        gain.gain.setValueAtTime(0.0001, t0 + note.at);
        gain.gain.exponentialRampToValueAtTime(spec.gain, t0 + note.at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0 + note.at);
        osc.stop(t0 + note.at + note.d + 0.05);
      }
    } catch (e) { /* sound is garnish — never break the game over it */ }
  }

  // --- Confetti: torn paper scraps -----------------------------------------------
  // Not party-store rectangles (those read as winter snowfall on the gesso
  // ground): the pieces are irregular torn scraps cut from the site's own
  // paper and paint. Default palette = Totem paints + paper cream.

  var DEFAULT_CONFETTI = ['#E5482B', '#FFC800', '#3EB8B3', '#22A05A', '#C4408F', '#E8762C', '#FDF9F0'];
  var PAPER_SCRAP = '#FDF9F0';
  var INK = '#2A2620';

  // One torn scrap: an irregular 5-7 sided polygon around a w x h ellipse,
  // corners jittered so no two tears match. Pure given rand; exported for
  // tests. Returns [[x,y], ...] centered on the origin.
  function scrapPolygon(w, h, rand) {
    var n = 5 + Math.floor(rand() * 3);
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push([
        Math.cos(a) * (w / 2) * (0.6 + rand() * 0.5),
        Math.sin(a) * (h / 2) * (0.6 + rand() * 0.5)
      ]);
    }
    return pts;
  }

  function drawScrap(ctx2d, piece) {
    var pts = piece.poly;
    ctx2d.beginPath();
    ctx2d.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx2d.lineTo(pts[i][0], pts[i][1]);
    ctx2d.closePath();
    ctx2d.fillStyle = piece.color;
    ctx2d.fill();
    // Paper-on-paper needs a whisper of an edge to read on the gesso ground.
    if (piece.color === PAPER_SCRAP) {
      ctx2d.strokeStyle = 'rgba(42, 38, 32, 0.28)';
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
    }
    // Paper-cream scraps carry a stray pencil line, like they were torn
    // from someone's worksheet.
    if (piece.pencil) {
      ctx2d.strokeStyle = 'rgba(42, 38, 32, 0.5)';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(-piece.w * 0.3, piece.h * 0.05);
      ctx2d.lineTo(piece.w * 0.32, -piece.h * 0.08);
      ctx2d.stroke();
    }
  }

  // Ink-dark theme values (heading/button are often the text color) make
  // scraps that read as dirt specks, not thrown paper — drop hex colors
  // that are basically ink. Non-hex values pass through unjudged.
  function isInkDark(c) {
    var m = /^#([0-9a-f]{6})$/i.exec(c);
    if (!m) return false;
    var v = parseInt(m[1], 16);
    return (((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255)) / 3 < 70;
  }

  // Theme colors via CSS custom properties (set by applyGameTheme), so the
  // confetti always matches the game's look; paint yellow and paper cream
  // ride along so every burst has some torn worksheet in it.
  function confettiColors() {
    if (!hasDOM) return DEFAULT_CONFETTI.slice();
    try {
      var style = getComputedStyle(document.documentElement);
      var picks = ['--theme-accent', '--theme-button', '--theme-success', '--theme-heading']
        .map(function (v) { return style.getPropertyValue(v).trim(); })
        .filter(Boolean)
        .filter(function (c) { return !isInkDark(c); });
      return picks.length >= 2 ? picks.concat('#FFC800', PAPER_SCRAP) : DEFAULT_CONFETTI.slice();
    } catch (e) {
      return DEFAULT_CONFETTI.slice();
    }
  }

  var confettiRunning = false;

  function confetti(opts) {
    try {
      if (!hasDOM) return;
      if (confettiRunning) return; // one celebration at a time
      if (typeof matchMedia !== 'undefined' &&
          matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      var count = (opts && opts.count) || 120;
      var colors = confettiColors();

      var canvas = document.createElement('canvas');
      canvas.className = 'juice-confetti';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
      document.body.appendChild(canvas);
      var ctx2d = canvas.getContext('2d');
      confettiRunning = true;

      var pieces = [];
      for (var i = 0; i < count; i++) {
        var w = 8 + Math.random() * 8;
        var h = 9 + Math.random() * 9;
        var color = colors[i % colors.length];
        pieces.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height * 0.5,
          w: w,
          h: h,
          poly: scrapPolygon(w, h, Math.random),
          pencil: color === PAPER_SCRAP && Math.random() < 0.7,
          vx: (Math.random() - 0.5) * 2.5,
          vy: 2 + Math.random() * 3.5,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.25,
          color: color
        });
      }

      var start = Date.now();
      var DURATION = 2800;

      function frame() {
        var elapsed = Date.now() - start;
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        var fade = elapsed > DURATION - 600 ? Math.max(0, (DURATION - elapsed) / 600) : 1;
        ctx2d.globalAlpha = fade;
        for (var j = 0; j < pieces.length; j++) {
          var p = pieces[j];
          p.x += p.vx + Math.sin((elapsed / 300) + j) * 0.6;
          p.y += p.vy;
          p.rot += p.vr;
          if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
          ctx2d.save();
          ctx2d.translate(p.x, p.y);
          ctx2d.rotate(p.rot);
          drawScrap(ctx2d, p);
          ctx2d.restore();
        }
        if (elapsed < DURATION) {
          requestAnimationFrame(frame);
        } else {
          canvas.remove();
          confettiRunning = false;
        }
      }
      requestAnimationFrame(frame);
    } catch (e) {
      confettiRunning = false; /* confetti is garnish — never break the game */
    }
  }

  // --- The meadow cheer -------------------------------------------------------
  // The winner moment's signature: the little painted blocks with ink legs
  // (the same anonymous crowd from the waiting meadow) run in along the
  // bottom of the projector, hop in place, and toss torn paper scraps. The
  // class itself celebrates the winner, not falling snow. Same rules as
  // confetti: canvas overlay, self-cleaning, reduced-motion skips it,
  // garnish never breaks the game.

  // The nine meadow paint tones (meadow.css fallback values).
  var CHEER_TONES = ['#E3C8A0', '#3EB8B3', '#A8763E', '#FFC800', '#C89B62',
    '#22A05A', '#C4408F', '#E8762C', '#EAD9BA'];
  var CHEER_DURATION = 3600;
  var CHEER_MAX_SCRAPS = 160;

  var cheerRunning = false;

  function cheer(opts) {
    try {
      if (!hasDOM) return;
      if (cheerRunning) return;
      if (typeof matchMedia !== 'undefined' &&
          matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      var count = Math.max(4, Math.min(20, (opts && opts.count) || 14));
      var colors = confettiColors();

      var canvas = document.createElement('canvas');
      canvas.className = 'juice-cheer';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
      document.body.appendChild(canvas);
      var ctx2d = canvas.getContext('2d');
      cheerRunning = true;

      var groundY = canvas.height - 24;
      var blocks = [];
      for (var i = 0; i < count; i++) {
        var bw = 22 + Math.random() * 10;
        blocks.push({
          side: i % 2,                                   // alternate entry edges
          startX: (i % 2) ? canvas.width + 30 : -30,
          tx: canvas.width * (0.06 + 0.88 * ((i * 0.61803) % 1)), // golden scatter
          t0: i * 90,                                    // staggered arrivals
          walk: 800 + Math.random() * 500,
          bw: bw,
          bh: bw * 0.77,                                 // meadow proportions (26x20)
          gy: groundY - Math.random() * 12,              // slight depth stagger
          hopH: 12 + Math.random() * 12,
          hopT: 380 + Math.random() * 220,
          hopPhase: Math.random() * Math.PI,
          tone: CHEER_TONES[i % CHEER_TONES.length],
          lastHop: -1
        });
      }
      var scraps = [];

      function tossScraps(x, y) {
        var n = 2 + Math.floor(Math.random() * 3);
        for (var s = 0; s < n && scraps.length < CHEER_MAX_SCRAPS; s++) {
          var w = 6 + Math.random() * 6;
          var h = 7 + Math.random() * 6;
          var color = colors[Math.floor(Math.random() * colors.length)];
          scraps.push({
            x: x, y: y, w: w, h: h,
            poly: scrapPolygon(w, h, Math.random),
            pencil: color === PAPER_SCRAP && Math.random() < 0.7,
            vx: (Math.random() - 0.5) * 3.2,
            vy: -(2 + Math.random() * 2.6),
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            color: color
          });
        }
      }

      // One block, drawn at its feet: two ink leg stubs (alternating while
      // walking), the slightly skewed painted quad above them (the canvas
      // twin of meadow.css's clip-path body).
      function drawBlock(b, x, y, tilt, legPhase) {
        ctx2d.save();
        ctx2d.translate(x, y);
        ctx2d.rotate(tilt);
        var legH = 7;
        var off = legPhase * 2;
        ctx2d.fillStyle = INK;
        ctx2d.fillRect(-b.bw * 0.27 + off, -legH, 4, legH);
        ctx2d.fillRect(b.bw * 0.10 - off, -legH, 4, legH);
        var top = -legH - b.bh;
        ctx2d.beginPath();
        ctx2d.moveTo(-b.bw * 0.48, top + b.bh * 0.08);
        ctx2d.lineTo(b.bw * 0.48, top);
        ctx2d.lineTo(b.bw * 0.50, top + b.bh * 0.94);
        ctx2d.lineTo(-b.bw * 0.50, top + b.bh);
        ctx2d.closePath();
        ctx2d.fillStyle = b.tone;
        ctx2d.fill();
        ctx2d.restore();
      }

      var start = Date.now();

      function frame() {
        var elapsed = Date.now() - start;
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        var fade = elapsed > CHEER_DURATION - 600 ? Math.max(0, (CHEER_DURATION - elapsed) / 600) : 1;
        ctx2d.globalAlpha = fade;

        for (var j = 0; j < blocks.length; j++) {
          var b = blocks[j];
          var t = elapsed - b.t0;
          if (t < 0) continue;
          var p = Math.min(1, t / b.walk);
          var ease = 1 - Math.pow(1 - p, 3);
          var x = b.startX + (b.tx - b.startX) * ease;
          var y, tilt, legPhase;
          if (p < 1) {
            // Walking in: waddle bob, legs alternate.
            y = b.gy - Math.abs(Math.sin(t / 70)) * 3;
            tilt = Math.sin(t / 80) * 0.07;
            legPhase = Math.sin(t / 70);
          } else {
            // Arrived: hop in place, legs together, toss scraps mid-air.
            var ht = t - b.walk;
            var hop = ht / b.hopT * Math.PI + b.hopPhase;
            y = b.gy - Math.abs(Math.sin(hop)) * b.hopH;
            tilt = Math.sin(hop * 2) * 0.06;
            legPhase = 0;
            var hopIndex = Math.floor(hop / Math.PI);
            if (hopIndex > b.lastHop) {
              b.lastHop = hopIndex;
              if (fade === 1) tossScraps(x, y - b.bh - 10);
            }
          }
          drawBlock(b, x, y, tilt, legPhase);
        }

        for (var k = 0; k < scraps.length; k++) {
          var sc = scraps[k];
          sc.x += sc.vx;
          sc.vy += 0.12;
          sc.y += sc.vy;
          sc.rot += sc.vr;
          ctx2d.save();
          ctx2d.translate(sc.x, sc.y);
          ctx2d.rotate(sc.rot);
          drawScrap(ctx2d, sc);
          ctx2d.restore();
        }

        if (elapsed < CHEER_DURATION) {
          requestAnimationFrame(frame);
        } else {
          canvas.remove();
          cheerRunning = false;
        }
      }
      requestAnimationFrame(frame);
    } catch (e) {
      cheerRunning = false; /* cheer is garnish — never break the game */
    }
  }

  // --- Export ----------------------------------------------------------------

  globalThis.Juice = {
    AVATARS: AVATARS,
    SOUNDS: SOUNDS,
    avatarFor: avatarFor,
    sound: sound,
    confetti: confetti,
    confettiColors: confettiColors,
    cheer: cheer,
    scrapPolygon: scrapPolygon,
    muted: muted,
    toggleMuted: toggleMuted
  };
})();
