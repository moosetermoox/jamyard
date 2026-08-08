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
   * The mic renders as a quiet transparent icon in the input's top-right
   * corner: the input moves into a position:relative wrapper (same node —
   * existing references and value bindings keep working) and the button is
   * absolutely positioned inside it.
   * opts: { lang } to override the recognition language.
   * Returns the button, or null when speech isn't supported.
   */
  function attachMic(inputEl, opts) {
    opts = opts || {};
    var Ctor = recognitionCtor();
    if (!Ctor || !inputEl || inputEl.dataset.micAttached) return null;
    inputEl.dataset.micAttached = '1';

    var IDLE_LABEL = '🎤';
    var LIVE_LABEL = '■';

    // Corner-overlay wrapper. If the input sat in a flex row, the wrapper
    // takes over its flexing so the row's layout doesn't change.
    var wrap = document.createElement('span');
    wrap.className = 'mic-wrap';
    var parent = inputEl.parentNode;
    try {
      if (getComputedStyle(parent).display.indexOf('flex') !== -1) {
        wrap.classList.add('mic-wrap-flex');
      }
    } catch (e) { /* detached node — plain wrapper */ }
    var hadFocus = document.activeElement === inputEl;
    parent.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    if (hadFocus) inputEl.focus();
    inputEl.style.paddingRight = '36px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mic-btn';
    btn.textContent = IDLE_LABEL;
    btn.setAttribute('aria-label', 'Speak instead of typing');
    btn.title = 'Tap and talk — your words appear in the box. Tap again to stop.';
    wrap.appendChild(btn);

    function reset() {
      btn.textContent = IDLE_LABEL;
      btn.classList.remove('mic-live');
    }

    function markUnavailable() {
      reset();
      btn.disabled = true;
      btn.classList.add('mic-off');
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

  function eligible(el) {
    if (!el || !el.tagName || !el.dataset || el.dataset.micAttached) return false;
    var tag = el.tagName.toLowerCase();
    var isText = tag === 'textarea' || (tag === 'input' && (el.type === 'text' || el.type === 'search'));
    if (!isText || el.readOnly || el.disabled) return false;
    if (el.closest && el.closest('.no-mic')) return false;
    return true;
  }

  function sweep(root) {
    var nodes = root.querySelectorAll('textarea, input[type="text"], input[type="search"]');
    for (var i = 0; i < nodes.length; i++) {
      if (eligible(nodes[i])) attachMic(nodes[i]);
    }
  }

  /**
   * Builder-surface mode: every text box on the page — present or rendered
   * later — gets the corner mic, so dynamically built forms (Simple view
   * boxes, Builder rail, Ask AI, recipe params, dialogs) all speak without
   * per-form wiring. Opt an area out with a `.no-mic` ancestor class.
   * Returns false (and installs nothing) when speech isn't supported.
   */
  function autoAttach() {
    if (!isSupported() || typeof document === 'undefined') return false;
    sweep(document);
    var mo = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        for (var n = 0; n < added.length; n++) {
          var node = added[n];
          if (node.nodeType !== 1) continue;
          if (eligible(node)) attachMic(node);
          else if (node.querySelectorAll) sweep(node);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  var Speech = {
    isSupported: isSupported,
    attachMic: attachMic,
    stopAll: stopAll,
    autoAttach: autoAttach,
    mergeTranscript: mergeTranscript
  };

  if (typeof window !== 'undefined') window.Speech = Speech;
  else global.Speech = Speech;
})(typeof window !== 'undefined' ? window : globalThis);
