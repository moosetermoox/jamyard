// Feedback widget — the floating 💬 button on teacher-facing pages.
//
// Opens a small panel (category + message), POSTs to /api/feedback, done.
// Anonymous by design: there is no name/email field, and the hint asks
// people not to type personal info. Entries land in the owner inbox at
// /feedback.
//
// Every node is built with createElement/textContent — no innerHTML — so
// nothing here can ever become an XSS sink.

(function () {
  'use strict';

  // No-op outside a browser (lets tests side-effect-import shared scripts).
  if (typeof document === 'undefined') return;

  var CATEGORIES = [
    { value: 'problem', label: "Something's broken" },
    { value: 'idea', label: 'I have an idea' },
    { value: 'praise', label: 'I love something' },
    { value: 'other', label: 'Something else' }
  ];

  function init() {
    if (document.getElementById('feedback-widget-btn')) return;

    var style = document.createElement('style');
    style.textContent = [
      '#feedback-widget-btn { position: fixed; bottom: 18px; right: 18px; z-index: 9000;',
      '  padding: 10px 16px; background: #0057FF; color: #fff; border: 2.5px solid #000;',
      '  border-radius: 999px; font-family: "Arial Black", Arial, sans-serif; font-size: 0.85rem;',
      '  font-weight: 900; cursor: pointer; box-shadow: 3px 3px 0 #000; }',
      '#feedback-widget-btn:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 #000; }',
      '#feedback-widget-panel { position: fixed; bottom: 70px; right: 18px; z-index: 9001;',
      '  width: 300px; max-width: calc(100vw - 36px); background: #FFFDE7; border: 3px solid #000;',
      '  border-radius: 16px; padding: 16px; box-shadow: 5px 5px 0 #000;',
      '  font-family: Arial, sans-serif; }',
      '#feedback-widget-panel[hidden] { display: none; }',
      '#feedback-widget-panel h3 { margin: 0 0 10px; font-family: "Arial Black", Arial, sans-serif;',
      '  font-size: 1rem; }',
      '#feedback-widget-panel select, #feedback-widget-panel textarea { width: 100%;',
      '  border: 2px solid #000; border-radius: 8px; padding: 8px; font-family: Arial, sans-serif;',
      '  font-size: 0.9rem; background: #fff; margin-bottom: 8px; box-sizing: border-box; }',
      '#feedback-widget-panel textarea { min-height: 90px; resize: vertical; }',
      '.feedback-widget-hint { font-size: 0.72rem; color: #777; margin: 0 0 10px; }',
      '.feedback-widget-row { display: flex; gap: 8px; justify-content: flex-end; }',
      '.feedback-widget-row button { padding: 8px 14px; border: 2px solid #000; border-radius: 8px;',
      '  font-family: "Arial Black", Arial, sans-serif; font-size: 0.8rem; font-weight: 900; cursor: pointer; }',
      '#feedback-widget-send { background: #FFD600; }',
      '#feedback-widget-cancel { background: #fff; }',
      '.feedback-widget-status { font-size: 0.82rem; font-weight: bold; margin: 0 0 8px; }'
    ].join('\n');
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'feedback-widget-btn';
    btn.type = 'button';
    btn.textContent = '💬 Feedback';
    document.body.appendChild(btn);

    var panel = document.createElement('div');
    panel.id = 'feedback-widget-panel';
    panel.hidden = true;

    var title = document.createElement('h3');
    title.textContent = 'Tell us what you think';
    panel.appendChild(title);

    var select = document.createElement('select');
    for (var i = 0; i < CATEGORIES.length; i++) {
      var opt = document.createElement('option');
      opt.value = CATEGORIES[i].value;
      opt.textContent = CATEGORIES[i].label;
      select.appendChild(opt);
    }
    panel.appendChild(select);

    var textarea = document.createElement('textarea');
    textarea.placeholder = 'What happened? What would make this better?';
    textarea.maxLength = 2000;
    panel.appendChild(textarea);

    var hint = document.createElement('p');
    hint.className = 'feedback-widget-hint';
    hint.textContent = 'Anonymous — please don\'t include names or personal info.';
    panel.appendChild(hint);

    var status = document.createElement('p');
    status.className = 'feedback-widget-status';
    status.hidden = true;
    panel.appendChild(status);

    var row = document.createElement('div');
    row.className = 'feedback-widget-row';
    var cancel = document.createElement('button');
    cancel.id = 'feedback-widget-cancel';
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    var send = document.createElement('button');
    send.id = 'feedback-widget-send';
    send.type = 'button';
    send.textContent = 'Send';
    row.appendChild(cancel);
    row.appendChild(send);
    panel.appendChild(row);

    document.body.appendChild(panel);

    btn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) textarea.focus();
    });
    cancel.addEventListener('click', function () {
      panel.hidden = true;
    });

    send.addEventListener('click', function () {
      var message = textarea.value.trim();
      status.hidden = false;
      status.style.color = '#CC0000';
      if (message.length < 3) {
        status.textContent = 'Please write a bit more.';
        return;
      }
      send.disabled = true;
      status.style.color = '#333';
      status.textContent = 'Sending…';
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: window.location.pathname,
          category: select.value,
          message: message
        })
      }).then(function (resp) {
        return resp.json().catch(function () { return {}; }).then(function (data) {
          send.disabled = false;
          if (resp.ok) {
            status.style.color = '#1B5E20';
            status.textContent = 'Thanks — got it! 💛';
            textarea.value = '';
            setTimeout(function () {
              panel.hidden = true;
              status.hidden = true;
            }, 1600);
          } else {
            status.style.color = '#CC0000';
            status.textContent = data.error || 'Could not send. Please try again.';
          }
        });
      }).catch(function () {
        send.disabled = false;
        status.style.color = '#CC0000';
        status.textContent = 'Network problem — please try again.';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else if (typeof document !== 'undefined' && document.body) {
    init();
  }
})();
