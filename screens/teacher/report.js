// Activity report — the printable record of what a class made.
//
// Reached from the teacher console's report button, which passes the room
// code + teacher PIN in the hash (like the console's own deep link: hash,
// not query, so the PIN never reaches server logs; wiped after reading).
// Fetches /api/rooms/:code/report and renders it as a document; the
// browser's print dialog is the "Save as PDF" path. Nothing is stored:
// the report exists only while the room does.
//
// Everything rendered here is untrusted (student text, teacher config, AI
// output) — all content goes through textContent, never HTML interpolation.

(function () {
  'use strict';

  var controls = document.getElementById('controls');
  var connectSection = document.getElementById('connect-section');
  var connectError = document.getElementById('connect-error');
  var codeInput = document.getElementById('code-input');
  var pinInput = document.getElementById('pin-input');
  var reportEl = document.getElementById('report');
  var namesToggle = document.getElementById('names-toggle');

  var state = { report: null, showNames: true };

  document.getElementById('print-btn').addEventListener('click', function () {
    window.print();
  });

  namesToggle.addEventListener('change', function () {
    state.showNames = namesToggle.checked;
    if (state.report) render(state.report);
  });

  // --- Load ---

  function loadReport(code, pin) {
    fetch('/api/rooms/' + encodeURIComponent(code) + '/report?pin=' + encodeURIComponent(pin))
      .then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (r) {
        if (!r.ok) {
          showConnect((r.body && r.body.error) || 'Could not load the report.');
          return;
        }
        state.report = r.body;
        connectSection.hidden = true;
        controls.hidden = false;
        reportEl.hidden = false;
        render(state.report);
      })
      .catch(function () {
        showConnect('Could not reach the server. Check your connection and try again.');
      });
  }

  function showConnect(message) {
    connectSection.hidden = false;
    if (message) {
      connectError.textContent = message;
      connectError.hidden = false;
    }
  }

  codeInput.addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '');
  });
  document.getElementById('connect-btn').addEventListener('click', function () {
    var code = codeInput.value.trim();
    if (code.length !== 4) {
      connectError.textContent = 'Enter the 4-letter room code.';
      connectError.hidden = false;
      return;
    }
    loadReport(code, pinInput.value.trim());
  });

  (function () {
    var params = new URLSearchParams(window.location.hash.slice(1));
    var code = (params.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '');
    var pin = params.get('pin') || '';
    try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* old browser */ }
    if (code.length === 4) loadReport(code, pin);
    else showConnect('');
  })();

  // --- Render ---

  function el(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined && textValue !== null) node.textContent = textValue;
    return node;
  }

  function stepName(type) {
    return (window.PHASE_NAMES && window.PHASE_NAMES[type]) || type;
  }

  function render(report) {
    reportEl.innerHTML = '';

    reportEl.appendChild(el('h1', 'rp-title', report.game || 'Activity report'));
    var when = report.generatedAt ? new Date(report.generatedAt) : new Date();
    var meta = when.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
      ' · Room ' + (report.code || '?') + ' · ' +
      report.playerCount + (report.playerCount === 1 ? ' student' : ' students');
    reportEl.appendChild(el('p', 'rp-meta', meta));

    if (state.showNames && report.roster && report.roster.length > 0) {
      reportEl.appendChild(el('p', 'rp-roster', 'Class: ' + report.roster.join(', ')));
    }
    reportEl.appendChild(el('hr', 'rp-rule'));

    var sections = report.sections || [];
    if (sections.length === 0) {
      reportEl.appendChild(el('p', 'rp-empty', 'Nothing to report yet. Steps appear here as the class completes them.'));
    }
    for (var i = 0; i < sections.length; i++) {
      reportEl.appendChild(renderSection(sections[i]));
    }

    reportEl.appendChild(el('p', 'rp-footer',
      'Made with Jamyard. This report was generated on the teacher\'s device and is not stored online.'));
  }

  function renderSection(section) {
    var wrap = el('div', 'rp-section');
    var kind = stepName(section.type) + (section.round ? ' · Round ' + section.round : '');
    wrap.appendChild(el('p', 'rp-step-kind', kind));
    if (section.heading) wrap.appendChild(el('h2', 'rp-heading', section.heading));

    var blocks = section.blocks || [];
    for (var i = 0; i < blocks.length; i++) {
      var node = renderBlock(blocks[i]);
      if (node) wrap.appendChild(node);
    }
    return wrap;
  }

  function renderBlock(block) {
    if (block.kind === 'text') return el('p', 'rp-text', block.text);
    if (block.kind === 'pre') return el('pre', 'rp-pre', block.text);
    if (block.kind === 'fact') {
      var p = el('p', 'rp-fact');
      p.appendChild(el('span', 'rp-fact-label', block.label + ': '));
      p.appendChild(document.createTextNode(block.value));
      return p;
    }
    if (block.kind === 'entries') return renderEntries(block);
    if (block.kind === 'table') return renderTable(block);
    return null;
  }

  function renderEntries(block) {
    var ul = el('ul', 'rp-entries');
    for (var i = 0; i < block.items.length; i++) {
      var item = block.items[i];
      var li = el('li', 'rp-entry');
      if (item.name && state.showNames) li.appendChild(el('div', 'rp-entry-name', item.name));
      if (item.drawing && window.Draw) {
        var canvas = el('canvas', 'rp-entry-drawing');
        canvas.width = 480;
        canvas.height = 360;
        Draw.renderStrokes(canvas, item.drawing);
        li.appendChild(canvas);
      } else {
        li.appendChild(el('div', 'rp-entry-text', item.text));
      }
      ul.appendChild(li);
    }
    return ul;
  }

  function renderTable(block) {
    var table = el('table', 'rp-table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    for (var c = 0; c < block.columns.length; c++) {
      headRow.appendChild(el('th', null, block.columns[c]));
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var r = 0; r < block.rows.length; r++) {
      var tr = document.createElement('tr');
      for (var i = 0; i < block.rows[r].length; i++) {
        var value = block.rows[r][i];
        var hideName = !state.showNames && block.nameCol === i;
        tr.appendChild(el('td', null, hideName ? '(name hidden)' : String(value)));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }
})();
