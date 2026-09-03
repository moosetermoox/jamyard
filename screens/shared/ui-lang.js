/**
 * UiLang — the fixed labels on the host and player screens in the
 * activity's language (engine/i18n). The server sends {language, strings}
 * with room-created / join-success / the room info lookup; the screens
 * call UiLang.set(...) then UiLang.apply() once on the static shell, and
 * UiLang.t('Submit') for labels they set from code.
 *
 * apply() walks text nodes and placeholders: any whose trimmed text is
 * exactly a known English label is swapped. The English original is
 * remembered on the node, so applying twice (or switching back to
 * English) is safe. Teacher and student content is never touched: it
 * arrives after apply() runs, and exact-match keys are UI labels only.
 *
 * Browser global (window.UiLang) + side-effect-importable for tests.
 */
(function (global) {
  'use strict';

  var table = {};
  var lang = 'en';

  function t(key) {
    if (table && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    return key;
  }

  function set(code, strings) {
    lang = typeof code === 'string' && code ? code : 'en';
    table = strings && typeof strings === 'object' ? strings : {};
  }

  function current() { return lang; }

  // Swap one text node, keeping the whitespace around the label ("Who's in "
  // before a hidden count span must keep its trailing space).
  function swapTextNode(node) {
    var raw = node.nodeValue;
    var trimmed = raw.trim();
    if (!trimmed) return;
    var original = node.__uiLangEn || trimmed;
    if (!Object.prototype.hasOwnProperty.call(table, original) && original === trimmed) {
      // Not a label we know: leave it, and don't remember it either.
      if (!node.__uiLangEn) return;
    }
    node.__uiLangEn = original;
    var lead = raw.slice(0, raw.indexOf(trimmed));
    var trail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
    node.nodeValue = lead + t(original) + trail;
  }

  function apply(root) {
    if (typeof document === 'undefined') return;
    root = root || document.body;
    if (!root) return;
    var walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, null);
    var node;
    var nodes = [];
    while ((node = walker.nextNode())) {
      var parent = node.parentNode;
      if (!parent) continue;
      var tag = parent.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') continue;
      nodes.push(node);
    }
    for (var i = 0; i < nodes.length; i++) swapTextNode(nodes[i]);

    var fields = root.querySelectorAll('[placeholder]');
    for (var j = 0; j < fields.length; j++) {
      var el = fields[j];
      var original = el.getAttribute('data-ui-lang-en') || el.getAttribute('placeholder');
      if (!Object.prototype.hasOwnProperty.call(table, original) && !el.hasAttribute('data-ui-lang-en')) continue;
      el.setAttribute('data-ui-lang-en', original);
      el.setAttribute('placeholder', t(original));
    }
  }

  global.UiLang = { t: t, set: set, apply: apply, current: current };
})(typeof window !== 'undefined' ? window : globalThis);
