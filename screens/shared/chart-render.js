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
  // A paired line (a vote taken twice, engine/phases/stance-shift.js):
  // label, the before bar and count, an arrow, the after bar and count.
  var PAIR_LINE = /^(.*?)\s*([█░]+)\s*(\d+)\s*→\s*([█░]+)\s*(\d+)\s*$/;

  // A word cloud line ("water ×12") and a card line ("◆ an answer"), the
  // text shapes of {{x.responses.cloud}} and {{x.responses.cards}}
  // (engine/phases/word-cloud.js, 2026-09-30).
  var CLOUD_LINE = /^(.+?) ×(\d+)$/;
  var CARD_LINE = /^◆ (.+)$/;

  function containsChart(text) {
    var s = String(text == null ? '' : text);
    return /[█░]/.test(s) || / ×\d+$/m.test(s) || /^◆ /m.test(s);
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
      var cm = lines[i].match(CLOUD_LINE);
      if (cm) {
        flushText();
        var crow = { word: cm[1], count: parseInt(cm[2], 10) };
        var lastCloud = segments[segments.length - 1];
        if (lastCloud && lastCloud.type === 'cloud') lastCloud.rows.push(crow);
        else segments.push({ type: 'cloud', rows: [crow] });
        continue;
      }
      var km = lines[i].match(CARD_LINE);
      if (km) {
        flushText();
        var lastCards = segments[segments.length - 1];
        if (lastCards && lastCards.type === 'cards') lastCards.rows.push(km[1]);
        else segments.push({ type: 'cards', rows: [km[1]] });
        continue;
      }
      var pm = lines[i].match(PAIR_LINE);
      if (pm) {
        flushText();
        var prow = { label: pm[1], before: parseInt(pm[3], 10), after: parseInt(pm[5], 10) };
        var lastPair = segments[segments.length - 1];
        if (lastPair && lastPair.type === 'pair') lastPair.rows.push(prow);
        else segments.push({ type: 'pair', rows: [prow] });
        continue;
      }
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

  // The paired chart: label | before bar | count | after bar | count, one
  // shared scale, a head row naming the two votes (Before / After through
  // the page's language table when it has one). The moved bars pop.
  function buildPairChart(rows) {
    var wrap = document.createElement('div');
    wrap.className = 'msg-chart is-pair';
    var t = function (s) { return (window.UiLang && UiLang.t) ? UiLang.t(s) : s; };
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.before, r.after); });
    var heads = ['', t('Before'), '', t('After'), ''];
    heads.forEach(function (h) {
      var cell = document.createElement('span');
      cell.className = 'msg-chart-head';
      cell.textContent = h;
      wrap.appendChild(cell);
    });
    rows.forEach(function (r) {
      var label = document.createElement('span');
      label.className = 'msg-chart-label';
      label.textContent = r.label;
      wrap.appendChild(label);
      [['before', r.before], ['after', r.after]].forEach(function (pair) {
        var track = document.createElement('div');
        track.className = 'msg-chart-track';
        var fill = document.createElement('div');
        fill.className = 'msg-chart-fill ' + pair[0] + (pair[0] === 'after' && r.after !== r.before ? ' moved' : '');
        var w = max > 0 ? Math.round((pair[1] / max) * 100) : 0;
        fill.style.width = (pair[1] > 0 ? Math.max(w, 4) : 0) + '%';
        track.appendChild(fill);
        wrap.appendChild(track);
        var value = document.createElement('span');
        value.className = 'msg-chart-value';
        value.textContent = String(pair[1]);
        wrap.appendChild(value);
      });
    });
    return wrap;
  }

  // The sized word cloud: every word once, its size by its count on a
  // square-root scale (so one runaway word does not dwarf the rest),
  // the biggest in the accent. Words alternate out from the middle so the
  // big ones sit near the center.
  function buildCloud(rows) {
    var wrap = document.createElement('div');
    wrap.className = 'msg-cloud';
    var max = 0;
    rows.forEach(function (r) { if (r.count > max) max = r.count; });
    var ordered = [];
    rows.forEach(function (r, i) { if (i % 2 === 0) ordered.push(r); else ordered.unshift(r); });
    ordered.forEach(function (r) {
      var word = document.createElement('span');
      var ratio = max > 0 ? Math.sqrt(r.count / max) : 1;
      word.className = 'msg-cloud-word' + (r.count === max ? ' top' : '');
      word.style.fontSize = (0.9 + ratio * 2.1).toFixed(2) + 'em';
      word.textContent = r.word;
      word.title = r.count;
      wrap.appendChild(word);
    });
    return wrap;
  }

  // Every answer up at once, a card each.
  function buildCards(rows) {
    var wrap = document.createElement('div');
    wrap.className = 'msg-cards';
    rows.forEach(function (text) {
      var card = document.createElement('div');
      card.className = 'msg-card';
      card.textContent = text;
      wrap.appendChild(card);
    });
    return wrap;
  }

  // Any non-text segment as an element (the sinks on both screens use it)
  function buildSegment(seg) {
    if (seg.type === 'chart') return buildChart(seg.rows);
    if (seg.type === 'pair') return buildPairChart(seg.rows);
    if (seg.type === 'cloud') return buildCloud(seg.rows);
    if (seg.type === 'cards') return buildCards(seg.rows);
    return null;
  }

  window.ChartRender = {
    containsChart: containsChart,
    split: split,
    buildChart: buildChart,
    buildPairChart: buildPairChart,
    buildCloud: buildCloud,
    buildCards: buildCards,
    buildSegment: buildSegment
  };
})();
