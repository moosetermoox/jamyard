/**
 * word-help.js — the student side of "tap a word to translate it"
 * (engine/word-help.js holds the ledger; this never counts on its own).
 *
 * Every prompt sink on the player screen goes through setRichText; when
 * the room has word help on, `wrap(el)` splits its text into tappable
 * word spans. A tap sends the word plus its sentence to the server, which
 * spends a token and answers with the translation and the new count. The
 * count on the chip is always the server's number, never a local guess.
 *
 * createElement/textContent only: prompt text is teacher config and the
 * translation is AI output, both untrusted for rendering.
 */
(function () {
  var state = { enabled: false, tokens: 0, left: 0, to: 'en' };
  var lookupFn = null;
  var chip = null;
  var pop = null;
  var popTimer = null;
  var pendingSpan = null;
  // Letters in any script, with inner apostrophes and hyphens; the same
  // shape engine/word-help.js accepts, so a tap never sends a non-word.
  var WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

  function t(key) {
    return (window.UiLang && UiLang.t) ? UiLang.t(key) : key;
  }

  function ensureChip() {
    if (chip) return chip;
    chip = document.getElementById('word-help-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'word-help-chip';
      document.body.appendChild(chip);
    }
    chip.setAttribute('role', 'status');
    return chip;
  }

  function renderChip() {
    var el = ensureChip();
    el.hidden = !state.enabled;
    if (!state.enabled) return;
    el.textContent = state.left > 0
      ? state.left + ' ' + t('translations left')
      : t('No translations left');
    el.title = t('Tap a word you do not know');
    el.classList.toggle('is-empty', state.left <= 0);
    document.body.classList.toggle('wh-empty', state.left <= 0);
  }

  /**
   * @param {{tokens:number, left:number, to:string}|null} settings  from join-success
   * @param {function({word:string, sentence:string})} lookup  sends the request
   */
  function configure(settings, lookup) {
    lookupFn = lookup || null;
    if (settings && typeof settings === 'object') {
      state.enabled = true;
      state.tokens = Number(settings.tokens) || 0;
      state.left = Number(settings.left) || 0;
      state.to = settings.to || 'en';
    } else {
      state.enabled = false;
    }
    renderChip();
  }

  function isEnabled() { return state.enabled; }

  // Split the element's text nodes into word spans, leaving <strong> and
  // <br> structure alone. Idempotent per render (setRichText clears first).
  function wrap(el) {
    if (!state.enabled || !el) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      if (!text || !/[\p{L}]/u.test(text)) return;
      var frag = document.createDocumentFragment();
      var last = 0;
      var m;
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var span = document.createElement('span');
        span.className = 'wh-word';
        span.setAttribute('role', 'button');
        span.tabIndex = 0;
        span.textContent = m[0];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
    if (!el.dataset.whBound) {
      el.dataset.whBound = '1';
      el.addEventListener('click', onTap);
      el.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('wh-word')) {
          e.preventDefault();
          onTap(e);
        }
      });
    }
  }

  function onTap(e) {
    var span = e.target && e.target.closest ? e.target.closest('.wh-word') : null;
    if (!span || !state.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.left <= 0) {
      showPop(span, null, t('No translations left'));
      return;
    }
    if (pendingSpan) return; // one lookup at a time
    pendingSpan = span;
    span.classList.add('wh-hit');
    showPop(span, null, t('Translating…'));
    // The sentence is the whole sink's text: the sense the word is used in.
    var holder = span.closest('[data-wh-bound]') || span.parentNode;
    if (lookupFn) lookupFn({ word: span.textContent, sentence: holder ? holder.textContent : '' });
  }

  /** Server reply: {ok, word, translation, left, reason} */
  function result(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.left === 'number') state.left = data.left;
    renderChip();
    var span = pendingSpan;
    pendingSpan = null;
    if (span) span.classList.remove('wh-hit');
    if (data.ok) {
      showPop(span, data.word, data.translation);
    } else if (data.reason === 'no-tokens') {
      showPop(span, null, t('No translations left'));
    } else {
      showPop(span, null, t('Could not translate that word'));
    }
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'wh-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
    document.addEventListener('click', function (e) {
      if (pop.hidden) return;
      if (e.target.closest && (e.target.closest('.wh-pop') || e.target.closest('.wh-word'))) return;
      hidePop();
    });
    return pop;
  }

  function hidePop() {
    if (pop) pop.hidden = true;
    clearTimeout(popTimer);
  }

  // A small paper note under the tapped word: the word, then its meaning.
  function showPop(anchor, word, text) {
    var el = ensurePop();
    el.textContent = '';
    if (word) {
      var head = document.createElement('strong');
      head.textContent = word;
      el.appendChild(head);
    }
    var body = document.createElement('span');
    body.className = word ? 'wh-pop-meaning' : 'wh-pop-note';
    body.textContent = text || '';
    el.appendChild(body);
    el.hidden = false;
    if (anchor && anchor.getBoundingClientRect) {
      var r = anchor.getBoundingClientRect();
      var left = window.scrollX + r.left;
      var maxLeft = window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 8;
      el.style.left = Math.max(window.scrollX + 8, Math.min(left, maxLeft)) + 'px';
      el.style.top = (window.scrollY + r.bottom + 6) + 'px';
    }
    clearTimeout(popTimer);
    popTimer = setTimeout(hidePop, word ? 8000 : 3500);
  }

  globalThis.WordHelp = { configure: configure, wrap: wrap, result: result, isEnabled: isEnabled };
})();
