// Bar chart rendering, shared by host and player screens.
//
// The engine's {{x.barChart}} resolves to TEXT ("label  ████░░  3 (50%)"
// per line — formatBarChart in engine/game-engine.js). That text stays the
// server contract (AI payloads and sims read it), but as ASCII art on a
// proportional-font screen it wrapped unpredictably: labels sometimes
// beside the bar, sometimes above; counts sometimes at the end, sometimes
// below. This module parses those lines and builds a real chart with ONE
// fixed layout: label | bar | count (%).
//
// createElement/textContent only — labels are student/teacher text and
// untrusted (xss-sinks scanner applies).
(function () {
  'use strict';

  // One chart line: label, block-character bar, count, percent, and an
  // optional trailing ✓ (the engine marks the correct answer's row on
  // graded charts — see formatBarChart).
  var CHART_LINE = /^(.*?)\s*([█░]+)\s*(\d+)\s*\((\d+)%\)\s*(✓)?\s*$/;

  function containsChart(text) {
    return /[█░]/.test(String(text == null ? '' : text));
  }

  // Split a message into ordered segments: {type:'text', text:...} and
  // {type:'chart', rows:[{label, count, pct}]}. Consecutive chart lines
  // become one chart; everything else stays text for the caller's own
  // message rendering.
  function split(text) {
    var lines = String(text == null ? '' : text).split('\n');
    var segments = [];
    var textBuf = [];
    function flushText() {
      if (textBuf.length) {
        segments.push({ type: 'text', text: textBuf.join('\n') });
        textBuf = [];
      }
    }
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(CHART_LINE);
      if (m) {
        flushText();
        var row = { label: m[1], count: parseInt(m[3], 10), pct: parseInt(m[4], 10), correct: !!m[5] };
        var last = segments[segments.length - 1];
        if (last && last.type === 'chart') last.rows.push(row);
        else segments.push({ type: 'chart', rows: [row] });
      } else {
        textBuf.push(lines[i]);
      }
    }
    flushText();
    return segments;
  }

  // Build the chart element: a 3-column grid (label | bar | count).
  // Bar widths are relative to the biggest count. Color logic: on a GRADED
  // chart (a ✓-marked row exists) only the correct answer's bar is green —
  // coloring the biggest bar there read as "the popular pick was right"
  // whenever the class guessed wrong. Ungraded charts (polls, votes) keep
  // the accent on every row that ties for the lead.
  function buildChart(rows) {
    var wrap = document.createElement('div');
    wrap.className = 'msg-chart';
    var max = 0;
    var hasCorrect = false;
    rows.forEach(function (r) {
      if (r.count > max) max = r.count;
      if (r.correct) hasCorrect = true;
    });
    rows.forEach(function (r) {
      var label = document.createElement('span');
      label.className = 'msg-chart-label' + (r.correct ? ' correct' : '');
      label.textContent = r.label;
      if (r.correct) {
        var check = document.createElement('span');
        check.className = 'msg-chart-check';
        check.textContent = '✓';
        label.appendChild(check);
      }
      wrap.appendChild(label);

      var track = document.createElement('div');
      track.className = 'msg-chart-track';
      var fill = document.createElement('div');
      fill.className = 'msg-chart-fill' + (r.correct ? ' correct'
        : (!hasCorrect && max > 0 && r.count === max ? ' top' : ''));
      // Zero stays zero; anything above zero gets at least a sliver.
      var w = max > 0 ? Math.round((r.count / max) * 100) : 0;
      fill.style.width = (r.count > 0 ? Math.max(w, 4) : 0) + '%';
      track.appendChild(fill);
      wrap.appendChild(track);

      var value = document.createElement('span');
      value.className = 'msg-chart-value';
      value.textContent = r.count + ' (' + r.pct + '%)';
      wrap.appendChild(value);
    });
    return wrap;
  }

  window.ChartRender = {
    containsChart: containsChart,
    split: split,
    buildChart: buildChart
  };
})();
