// Markdown-flavored AI text → clean projector layout, shared by host and
// player screens.
//
// {{x.result}} text arrives with markdown habits ("# HEADING",
// "**Section:**", "- bullet") that the projector rendered literally:
// stars and hash marks on the wall. STYLE_RULES in the AI service asks
// for plain text, but the renderer must cope regardless (models drift).
// parse() turns text into typed segments and is pure (unit tested, no
// DOM); buildBody() lays segments out with createElement/textContent only
// (AI output is untrusted for rendering — xss-sinks scanner applies).
//
// Plain script (browser global) + side-effect-importable in tests.
(function () {
  'use strict';

  var BULLET_RE = /^[-*•]\s+(.*)$/;
  var HASH_RE = /^#{1,6}\s+(.*)$/;
  var BOLD_LINE_RE = /^\*\*([^*]+)\*\*(:?)$/;
  var INLINE_BOLD_RE = /\*\*([^*\n]+)\*\*/g;

  // The scrub: the tells a model still lets through the STYLE RULES,
  // fixed on the way to the wall (2026-09-16, owner: students should be
  // reminded as little as possible that this was made with AI). Safe
  // substitutions only: dashes become commas (an en dash between digits
  // is a range and stays), a short list of announcing and summarizing
  // openers goes. Applied to AI results (parse/buildBody), never to a
  // prompt (applyInline): a teacher's or the Along bank's own words are
  // shown as written.
  var FILLER_RE = /(^|[.!?]\s+|\n)(?:It(?:'s| is) worth noting that|At its core,|In today's fast-paced world,|Let's dive in[.!:]?|Overall,|In summary,|In conclusion,|To sum up,)\s*([a-z])?/gi;
  function scrub(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/(\d)[ \t]*–[ \t]*(\d)/g, '$1\u0001$2');
    s = s.replace(/[ \t]*[—–][ \t]*/g, ', ');
    s = s.replace(/\u0001/g, '–');
    s = s.replace(/(^|\n), /g, '$1');
    s = s.replace(FILLER_RE, function (m, lead, ch) { return lead + (ch ? ch.toUpperCase() : ''); });
    return s;
  }

  // Anything worth structuring: a heading, a bullet, or inline bold.
  function hasRich(text) {
    var lines = String(text == null ? '' : text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (HASH_RE.test(t) || BOLD_LINE_RE.test(t) || BULLET_RE.test(t)) return true;
      INLINE_BOLD_RE.lastIndex = 0;
      if (INLINE_BOLD_RE.test(t)) return true;
    }
    return false;
  }

  // One line → runs [{text, bold}]. Unmatched ** stays literal.
  function inlineRuns(line) {
    var runs = [];
    var last = 0;
    var m;
    INLINE_BOLD_RE.lastIndex = 0;
    while ((m = INLINE_BOLD_RE.exec(line)) !== null) {
      if (m.index > last) runs.push({ text: line.slice(last, m.index), bold: false });
      runs.push({ text: m[1], bold: true });
      last = INLINE_BOLD_RE.lastIndex;
    }
    if (last < line.length) runs.push({ text: line.slice(last), bold: false });
    if (runs.length === 0) runs.push({ text: line, bold: false });
    return runs;
  }

  // Segments: {type:'subhead', text} | {type:'bullets', items:[runs]} |
  // {type:'text', lines:[runs]} (blank interior lines survive as empty runs).
  function parse(text) {
    var lines = scrub(text).split('\n');
    var segments = [];
    var textBuf = [];

    function flushText() {
      var chunk = textBuf.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
      if (chunk) {
        segments.push({ type: 'text', lines: chunk.split('\n').map(inlineRuns) });
      }
      textBuf = [];
    }

    function nextNonEmpty(fromIdx) {
      for (var j = fromIdx + 1; j < lines.length; j++) {
        var s = lines[j].trim();
        if (s) return s;
      }
      return '';
    }

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      var hm = t.match(HASH_RE);
      var bm = t.match(BOLD_LINE_RE);
      var um = t.match(BULLET_RE);
      // Plain "TEAM YES:" header, the shape STYLE_RULES asks the AI for:
      // a short colon line directly above a bullet group, or in ALL CAPS
      // anywhere. The lookahead/caps guards keep ordinary sentences that
      // happen to end with a colon as normal text.
      if (!hm && !bm && !um && t && t.length <= 60 && /:$/.test(t) &&
          t.indexOf('**') === -1 &&
          (BULLET_RE.test(nextNonEmpty(i)) ||
           (/[A-Z]/.test(t) && t === t.toUpperCase()))) {
        flushText();
        segments.push({ type: 'subhead', text: t });
        continue;
      }
      if (hm || bm) {
        flushText();
        var head = hm ? hm[1] : bm[1] + bm[2];
        segments.push({ type: 'subhead', text: head.replace(/\*\*/g, '').trim() });
      } else if (um) {
        flushText();
        var item = inlineRuns(um[1].trim());
        var lastSeg = segments[segments.length - 1];
        if (lastSeg && lastSeg.type === 'bullets') lastSeg.items.push(item);
        else segments.push({ type: 'bullets', items: [item] });
      } else {
        textBuf.push(lines[i]);
      }
    }
    flushText();
    return segments;
  }

  // Single-line cleanup for headline slots: strip heading/bold markers.
  function plainLine(text) {
    return String(text == null ? '' : text)
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*/g, '')
      .trim();
  }

  function runsInto(el, runs, boldClass) {
    for (var i = 0; i < runs.length; i++) {
      if (runs[i].bold) {
        var b = document.createElement('strong');
        if (boldClass) b.className = boldClass;
        b.textContent = runs[i].text;
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(runs[i].text));
      }
    }
  }

  // Teacher-authored prompts and instructions: **bold** runs become
  // <strong>, line breaks become <br>, nothing else is interpreted (a
  // prompt is one short text, not an AI essay; headings and bullets would
  // be a surprise there). createElement/textContent only.
  function applyInline(el, text) {
    el.textContent = '';
    var lines = String(text == null ? '' : text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) el.appendChild(document.createElement('br'));
      // Prompts are already set heavy, so a bare <strong> would vanish:
      // .prompt-bold paints the words instead (host/player styles.css).
      runsInto(el, inlineRuns(lines[i]), 'prompt-bold');
    }
  }

  // Lay the segments out. className carries the caller's body class
  // (msg-body etc.) so existing font sizing applies; msg-rich switches
  // white-space handling from pre-line to per-segment blocks.
  function buildBody(text, className) {
    var wrap = document.createElement('div');
    wrap.className = (className ? className + ' ' : '') + 'msg-rich';
    var segments = parse(text);
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.type === 'subhead') {
        var h = document.createElement('span');
        h.className = 'msg-subhead';
        h.textContent = seg.text;
        wrap.appendChild(h);
      } else if (seg.type === 'bullets') {
        var list = document.createElement('div');
        list.className = 'msg-bullets';
        for (var j = 0; j < seg.items.length; j++) {
          var row = document.createElement('div');
          row.className = 'msg-bullet';
          var dot = document.createElement('span');
          dot.className = 'msg-bullet-dot';
          row.appendChild(dot);
          var body = document.createElement('span');
          body.className = 'msg-bullet-text';
          runsInto(body, seg.items[j]);
          row.appendChild(body);
          list.appendChild(row);
        }
        wrap.appendChild(list);
      } else {
        var p = document.createElement('span');
        p.className = 'msg-rich-para';
        for (var k = 0; k < seg.lines.length; k++) {
          if (k > 0) p.appendChild(document.createElement('br'));
          runsInto(p, seg.lines[k]);
        }
        wrap.appendChild(p);
      }
    }
    return wrap;
  }

  globalThis.RichText = {
    hasRich: hasRich,
    scrub: scrub,
    parse: parse,
    inlineRuns: inlineRuns,
    plainLine: plainLine,
    applyInline: applyInline,
    buildBody: buildBody
  };
})();
