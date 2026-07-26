// Feedback inbox (owner-only — the server demands the owner password before
// serving this page or its API). Messages are visitor-typed and therefore
// untrusted: every render uses textContent, never innerHTML.

(function () {
  'use strict';

  var listEl = document.getElementById('list');
  var tabsEl = document.getElementById('tabs');

  var CATEGORY_LABELS = {
    problem: "🐛 Something's broken",
    idea: '💡 Idea',
    praise: '💛 Praise',
    other: '💬 Other'
  };

  var entries = [];
  var activeTab = 'new';

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

  function showMessage(className, text) {
    listEl.innerHTML = '';
    var p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    listEl.appendChild(p);
  }

  function load() {
    fetch('/api/feedback')
      .then(function (resp) {
        if (!resp.ok) throw new Error('status ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        entries = data.feedback || [];
        render();
      })
      .catch(function (err) {
        showMessage('error', 'Could not load feedback (' + err.message + '). Refresh to retry.');
      });
  }

  function render() {
    var visible = entries.filter(function (entry) {
      if (activeTab === 'all') return true;
      return (entry.status || 'new') === activeTab;
    });

    if (visible.length === 0) {
      var label = activeTab === 'new' ? 'No new feedback — inbox zero! 🎉' : 'Nothing here yet.';
      showMessage('empty', label);
      return;
    }

    listEl.innerHTML = '';
    for (var i = 0; i < visible.length; i++) {
      listEl.appendChild(buildEntry(visible[i]));
    }
  }

  function buildEntry(entry) {
    var card = document.createElement('div');
    card.className = 'entry' + ((entry.status || 'new') === 'done' ? ' is-done' : '');

    var top = document.createElement('div');
    top.className = 'entry-top';

    var cat = document.createElement('span');
    cat.className = 'entry-category cat-' + (CATEGORY_LABELS[entry.category] ? entry.category : 'other');
    cat.textContent = CATEGORY_LABELS[entry.category] || CATEGORY_LABELS.other;
    top.appendChild(cat);

    if (entry.page) {
      var page = document.createElement('span');
      page.textContent = 'on ' + entry.page;
      top.appendChild(page);
    }

    if (entry.created_at) {
      var when = document.createElement('span');
      var d = new Date(entry.created_at);
      when.textContent = isNaN(d.getTime()) ? String(entry.created_at) : d.toLocaleString();
      top.appendChild(when);
    }

    card.appendChild(top);

    var message = document.createElement('p');
    message.className = 'entry-message';
    message.textContent = entry.message || '';
    card.appendChild(message);

    var actions = document.createElement('div');
    actions.className = 'entry-actions';
    var toggle = document.createElement('button');
    var isDone = (entry.status || 'new') === 'done';
    toggle.textContent = isDone ? 'Reopen' : 'Mark done';
    toggle.addEventListener('click', function () {
      setStatus(entry, isDone ? 'new' : 'done', toggle);
    });
    actions.appendChild(toggle);
    card.appendChild(actions);

    return card;
  }

  function setStatus(entry, status, btn) {
    btn.disabled = true;
    fetch('/api/feedback/' + encodeURIComponent(entry.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error('status ' + resp.status);
        entry.status = status;
        render();
      })
      .catch(function (err) {
        btn.disabled = false;
        alert('Could not update: ' + err.message);
      });
  }

  load();
})();
