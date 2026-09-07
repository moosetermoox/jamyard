/**
 * panel-toggles.js — fold the editor's side panels away.
 *
 * Outside review (2026-09-06): settings, the step list, the step editor,
 * and Ask AI competed across four columns and the writing area was the
 * cramped one. Each side panel now collapses to a slim rail (a vertical
 * tab that brings it back), and the choice is remembered per browser.
 * Pure chrome: no editor state is touched, editor.js and chat-panel.js
 * never need to know.
 */
(function () {
  var KEY = 'jamyard-editor-panels';
  var state = { settings: 'open', chat: 'open' };

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (saved && typeof saved === 'object') {
      if (saved.settings === 'closed') state.settings = 'closed';
      if (saved.chat === 'closed') state.chat = 'closed';
    }
  } catch (e) { /* storage unavailable: start open */ }

  function apply() {
    document.body.classList.toggle('settings-collapsed', state.settings === 'closed');
    document.body.classList.toggle('chat-collapsed', state.chat === 'closed');
    var sc = document.getElementById('settings-collapse');
    if (sc) sc.setAttribute('aria-expanded', state.settings === 'open' ? 'true' : 'false');
    var cc = document.getElementById('chat-collapse');
    if (cc) cc.setAttribute('aria-expanded', state.chat === 'open' ? 'true' : 'false');
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* fine */ }
  }

  function wire(id, panel, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function () {
      state[panel] = value;
      apply();
      save();
      // Hand focus to the counterpart so a keyboard user is not stranded.
      var next = document.getElementById(value === 'closed' ? panel + '-expand' : panel + '-collapse');
      if (next) next.focus();
    });
  }

  wire('settings-collapse', 'settings', 'closed');
  wire('settings-expand', 'settings', 'open');
  wire('chat-collapse', 'chat', 'closed');
  wire('chat-expand', 'chat', 'open');
  apply();
})();
