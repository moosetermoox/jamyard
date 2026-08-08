/**
 * Speech input — a mic button that dictates into a text box, for students
 * who'd rather speak than type.
 *
 * Uses the browser's built-in Web Speech API (SpeechRecognition — present on
 * Chrome/Chromebooks). Recognition happens in the browser via its speech
 * service; NO audio ever reaches the game server — only the final text, which
 * follows the exact same submit path (and content filter) as typed text.
 *
 * Feature-detected: on browsers without support the button never renders.
 * If the microphone is blocked (school-managed devices often do this), the
 * button says so and disables itself instead of erroring.
 *
 * Browser global (window.Speech) + side-effect-importable for tests.
 */
(function (global) {
  'use strict';

  function recognitionCtor() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function isSupported() {
    return !!recognitionCtor();
  }

  // Merge a finished transcript into what's already in the box: glue with a
  // single space, never lose typed text. Pure — unit-tested directly.
  function mergeTranscript(existing, transcript) {
    var t = (transcript || '').trim();
    var base = existing || '';
    if (!t) return base;
    if (!base) return t;
    return base + (/\s$/.test(base) ? '' : ' ') + t;
  }

  // One dictation at a time — starting a second mic stops the first.
  var active = null; // { recognition, reset }

  function stopAll() {
    if (!active) return;
    var a = active;
    active = null;
    try { a.recognition.stop(); } catch (e) { /* already stopped */ }
    a.reset();
  }

  /**
   * Add a mic button that dictates into inputEl.
   * opts: { compact: true } for an icon-only button (multi-field rows),
   *       { lang } to override the recognition language.
   * Inserts the button right after inputEl unless opts.container is given.
   * Returns the button, or null when speech isn't supported.
   */
  function attachMic(inputEl, opts) {
    opts = opts || {};
    var Ctor = recognitionCtor();
    if (!Ctor || !inputEl || inputEl.dataset.micAttached) return null;
    inputEl.dataset.micAttached = '1';

    var IDLE_LABEL = opts.compact ? '🎤' : '🎤 Speak instead';
    var LIVE_LABEL = opts.compact ? '■' : '■ Stop';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mic-btn' + (opts.compact ? ' mic-btn-compact' : '');
    btn.textContent = IDLE_LABEL;
    btn.setAttribute('aria-label', 'Speak your answer instead of typing');
    btn.title = 'Tap and talk — your words appear in the box. Tap again to stop.';
    if (opts.container) {
      opts.container.appendChild(btn);
    } else {
      inputEl.parentNode.insertBefore(btn, inputEl.nextSibling);
    }

    function reset() {
      btn.textContent = IDLE_LABEL;
      btn.classList.remove('mic-live');
    }

    function markUnavailable() {
      reset();
      btn.textContent = opts.compact ? '🎤✕' : '🎤 Mic unavailable';
      btn.disabled = true;
      btn.title = 'The microphone is blocked on this device.';
    }

    function fireInput() {
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    btn.addEventListener('click', function () {
      if (active && active.button === btn) { stopAll(); return; }
      stopAll();

      var rec = new Ctor();
      rec.lang = opts.lang || (global.navigator && global.navigator.language) || 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      // Everything dictated this session rebuilds on top of what was in the
      // box when the mic opened, so typing is never overwritten.
      var baseValue = inputEl.value;
      var finalSoFar = '';

      rec.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalSoFar = mergeTranscript(finalSoFar, chunk);
          else interim += chunk;
        }
        var value = mergeTranscript(mergeTranscript(baseValue, finalSoFar), interim);
        var max = Number(inputEl.maxLength);
        if (max > 0 && value.length > max) value = value.slice(0, max);
        inputEl.value = value;
        fireInput();
      };
      rec.onerror = function (event) {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          if (active && active.button === btn) active = null;
          markUnavailable();
        }
        // 'no-speech' / 'aborted' just fall through to onend's reset.
      };
      rec.onend = function () {
        if (active && active.button === btn) active = null;
        reset();
        fireInput();
      };

      active = { recognition: rec, reset: reset, button: btn };
      btn.textContent = LIVE_LABEL;
      btn.classList.add('mic-live');
      try {
        rec.start();
      } catch (e) {
        active = null;
        reset();
      }
    });

    return btn;
  }

  var Speech = {
    isSupported: isSupported,
    attachMic: attachMic,
    stopAll: stopAll,
    mergeTranscript: mergeTranscript
  };

  if (typeof window !== 'undefined') window.Speech = Speech;
  else global.Speech = Speech;
})(typeof window !== 'undefined' ? window : globalThis);
