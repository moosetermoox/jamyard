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
  // same avatar on every screen all game (host lobby, leaderboard, their phone).

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
    tick:    { gain: 0.06, notes: [{ f: 1200, at: 0, d: 0.03 }] }
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

  // --- Confetti ------------------------------------------------------------------

  var DEFAULT_CONFETTI = ['#FF4081', '#0057FF', '#00C853', '#FFD600', '#FF6D00'];

  // Theme colors via CSS custom properties (set by applyGameTheme), so the
  // confetti always matches the game's look.
  function confettiColors() {
    if (!hasDOM) return DEFAULT_CONFETTI.slice();
    try {
      var style = getComputedStyle(document.documentElement);
      var picks = ['--theme-accent', '--theme-button', '--theme-success', '--theme-heading']
        .map(function (v) { return style.getPropertyValue(v).trim(); })
        .filter(Boolean);
      return picks.length >= 3 ? picks.concat('#FFD600') : DEFAULT_CONFETTI.slice();
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
        pieces.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height * 0.5,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          vx: (Math.random() - 0.5) * 2.5,
          vy: 2 + Math.random() * 3.5,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.25,
          color: colors[i % colors.length]
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
          ctx2d.fillStyle = p.color;
          ctx2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
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

  // --- Export ----------------------------------------------------------------

  globalThis.Juice = {
    AVATARS: AVATARS,
    SOUNDS: SOUNDS,
    avatarFor: avatarFor,
    sound: sound,
    confetti: confetti,
    confettiColors: confettiColors,
    muted: muted,
    toggleMuted: toggleMuted
  };
})();
