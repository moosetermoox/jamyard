// Ideas log (owner-only; the server demands the owner password before
// serving this page or /api/idea-log). Ideas are teacher-typed and
// therefore untrusted: every render uses textContent, never innerHTML.

(function () {
  'use strict';

  var listEl = document.getElementById('list');
  var tabsEl = document.getElementById('tabs');
  var funnelEl = document.getElementById('funnel');

  var RESULT_LABELS = {
    match: 'Matched a recipe',
    existing: 'Already in the yard',
    storyboard: 'Built from steps',
    none: 'Nothing fit',
    'cant-build': 'Could not build',
    error: 'Error'
  };

  var entries = [];
  var activeTab = 'all';

  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    activeTab = btn.getAttribute('data-tab');
    var buttons = tabsEl.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i] === btn);
    }
    render();
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showMessage(className, text) {
    listEl.innerHTML = '';
    listEl.appendChild(el('p', className, text));
  }

  function load() {
    fetch('/api/idea-log')
      .then(function (resp) {
        if (!resp.ok) throw new Error('status ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        entries = data.ideas || [];
        renderSummary(data.summary || {});
        render();
      })
      .catch(function (err) {
        showMessage('error', 'Could not load the ideas log (' + err.message + '). Refresh to retry.');
      });
  }

  function renderSummary(s) {
    funnelEl.innerHTML = '';
    var tiles = [
      [s.tries || 0, 'tries', true],
      [s.matched || 0, 'matched a recipe'],
      [s.existing || 0, 'already in the yard'],
      [s.storyboard || 0, 'built from steps'],
      [s.couldNot || 0, 'could not build'],
      [s.saved || 0, 'saved']
    ];
    for (var i = 0; i < tiles.length; i++) {
      var tile = el('div', 'tile' + (tiles[i][2] ? ' is-loud' : ''));
      tile.appendChild(el('b', null, String(tiles[i][0])));
      tile.appendChild(el('span', null, tiles[i][1]));
      funnelEl.appendChild(tile);
    }
    funnelEl.hidden = false;
  }

  function couldNot(entry) {
    return entry.result === 'none' || entry.result === 'cant-build' || entry.result === 'error';
  }

  function render() {
    var visible = entries.filter(function (entry) {
      if (activeTab === 'unique') return entry.result === 'storyboard';
      if (activeTab === 'could-not') return couldNot(entry);
      if (activeTab === 'saved') return !!entry.saved_game_id;
      return true;
    });

    if (visible.length === 0) {
      showMessage('empty', entries.length === 0 ? 'No tries yet. The first idea typed into the Create page lands here.' : 'Nothing under this tab yet.');
      return;
    }

    listEl.innerHTML = '';
    for (var i = 0; i < visible.length; i++) listEl.appendChild(buildEntry(visible[i]));
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function buildEntry(entry) {
    var card = el('div', 'entry' + (entry.stage === 'alternate' ? ' is-alternate' : ''));

    var top = el('div', 'entry-top');
    var result = RESULT_LABELS[entry.result] ? entry.result : 'error';
    top.appendChild(el('span', 'chip r-' + result, RESULT_LABELS[result]));
    if (entry.saved_game_id) top.appendChild(el('span', 'chip saved', 'Saved'));
    if (entry.stage === 'alternate') top.appendChild(el('span', null, 'alternate re-run'));
    if (entry.stage === 'storyboard' && entry.result !== 'storyboard') top.appendChild(el('span', null, 'step-by-step builder'));
    top.appendChild(el('span', null, when(entry.created_at)));
    if (entry.minutes) top.appendChild(el('span', null, 'asked for ' + entry.minutes + ' min'));
    if (entry.browser) {
      var key = el('code', 'key', String(entry.browser).slice(0, 6));
      top.appendChild(key);
    }
    card.appendChild(top);

    card.appendChild(el('p', 'entry-idea', entry.idea || ''));

    if (entry.result === 'match' || entry.result === 'existing') {
      var became = el('p', 'entry-became');
      became.appendChild(document.createTextNode(entry.result === 'existing' ? 'Pointed at ' : 'Became '));
      became.appendChild(el('b', null, entry.target_name || entry.target || ''));
      if (entry.target && entry.target_name && entry.target !== entry.target_name) {
        became.appendChild(document.createTextNode(' (' + entry.target + ')'));
      }
      card.appendChild(became);
    } else if (entry.result === 'storyboard') {
      var plan = el('p', 'entry-became');
      plan.appendChild(document.createTextNode('Plan: '));
      plan.appendChild(el('b', null, entry.target_name || 'untitled'));
      if (entry.steps) plan.appendChild(document.createTextNode(' with steps ' + String(entry.steps).split(',').join(', ')));
      card.appendChild(plan);
    }

    if (couldNot(entry) && entry.reason) {
      card.appendChild(el('p', 'entry-why', 'Why not: ' + entry.reason));
    }

    if (entry.saved_game_id) {
      var saved = el('p', 'entry-became');
      saved.appendChild(document.createTextNode('Saved as '));
      saved.appendChild(el('b', null, entry.saved_name || entry.saved_game_id));
      saved.appendChild(document.createTextNode(' (' + entry.saved_game_id + ')'));
      card.appendChild(saved);
    }

    return card;
  }

  load();
})();
