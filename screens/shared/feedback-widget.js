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

    // Paste-up system: a quiet paper scrap that opens a pasted sheet.
    var style = document.createElement('style');
    style.textContent = [
      '#feedback-widget-btn { position: fixed; bottom: 18px; right: 18px; z-index: 9000;',
      '  padding: 9px 16px; background: #FFFDF6; color: #221E1C; border: none;',
      '  border-radius: 2px; font-family: "Nunito", Arial, sans-serif; font-size: 0.82rem;',
      '  font-weight: 800; letter-spacing: 0.04em; cursor: pointer; transform: rotate(1deg);',
      '  box-shadow: 2px 2px 0 rgba(34,30,28,0.18);',
      '  transition: transform 90ms steps(2, end), box-shadow 90ms steps(2, end); }',
      '#feedback-widget-btn:hover { transform: rotate(1deg) translate(2px, 2px); box-shadow: 0 0 0 rgba(34,30,28,0.18); }',
      '#feedback-widget-panel { position: fixed; bottom: 66px; right: 18px; z-index: 9001;',
      '  width: 300px; max-width: calc(100vw - 36px); background: #FBF7EC; border: none;',
      '  border-radius: 2px; padding: 16px; box-shadow: 5px 6px 0 rgba(34,30,28,0.25);',
      '  transform: rotate(-0.4deg); color: #221E1C;',
      '  font-family: "Nunito", Arial, sans-serif; font-weight: 600; }',
      '#feedback-widget-panel[hidden] { display: none; }',
      '#feedback-widget-panel h3 { margin: 0 0 10px; font-family: "Archivo Black", "Arial Black", Arial, sans-serif;',
      '  font-weight: 400; font-size: 0.95rem; letter-spacing: 0.04em; }',
      '#feedback-widget-panel select, #feedback-widget-panel textarea { width: 100%;',
      '  border: none; border-radius: 2px; padding: 8px; font-family: "Nunito", Arial, sans-serif; font-weight: 600;',
      '  font-size: 0.9rem; background: #FFFDF6; color: #221E1C; margin-bottom: 8px; box-sizing: border-box;',
      '  box-shadow: inset 2px 2px 0 rgba(34,30,28,0.08), 0 0 0 1px rgba(34,30,28,0.16); }',
      '#feedback-widget-panel select:focus, #feedback-widget-panel textarea:focus { outline: none;',
      '  box-shadow: inset 2px 2px 0 rgba(34,30,28,0.08), 0 0 0 2px #221E1C; }',
      '#feedback-widget-panel textarea { min-height: 90px; resize: vertical; }',
      '.feedback-widget-hint { font-size: 0.72rem; color: #6E6353; margin: 0 0 10px; }',
      '.feedback-widget-row { display: flex; gap: 8px; justify-content: flex-end; }',
      '.feedback-widget-row button { padding: 8px 14px; border: none; border-radius: 2px;',
      '  font-size: 0.8rem; cursor: pointer; box-shadow: 2px 2px 0 rgba(34,30,28,0.18);',
      '  transition: transform 90ms steps(2, end), box-shadow 90ms steps(2, end); }',
      '.feedback-widget-row button:hover { transform: translate(2px, 2px); box-shadow: 0 0 0 rgba(34,30,28,0.18); }',
      '#feedback-widget-send { background: #D62A78; color: #FFF6EA;',
      '  font-family: "Archivo Black", "Arial Black", Arial, sans-serif; font-weight: 400; transform: rotate(-0.8deg); }',
      '#feedback-widget-send:hover { transform: rotate(-0.8deg) translate(2px, 2px); }',
      '#feedback-widget-send:disabled { background: #D8D2C4; color: #857A66; box-shadow: none; transform: none; }',
      '#feedback-widget-cancel { background: #FFFDF6; color: #221E1C;',
      '  font-family: "Nunito", Arial, sans-serif; font-weight: 800; }',
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
    hint.textContent = 'Anonymous, please don\'t include names or personal info.';
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
      status.style.color = '#B31E63';
      if (message.length < 3) {
        status.textContent = 'Please write a bit more.';
        return;
      }
      send.disabled = true;
      status.style.color = '#55503F';
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
            status.style.color = '#221E1C';
            status.textContent = 'Thanks, got it!';
            textarea.value = '';
            setTimeout(function () {
              panel.hidden = true;
              status.hidden = true;
            }, 1600);
          } else {
            status.style.color = '#B31E63';
            status.textContent = data.error || 'Could not send. Please try again.';
          }
        });
      }).catch(function () {
        send.disabled = false;
        status.style.color = '#B31E63';
        status.textContent = 'Network problem, please try again.';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else if (typeof document !== 'undefined' && document.body) {
    init();
  }
})();
