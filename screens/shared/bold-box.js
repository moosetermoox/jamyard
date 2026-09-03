// Bold box: a text field that shows bold as bold (Simple view, 2026-09-02).
//
// Storage never changes: bold is "**word**" in the config, which is what
// the projector and student screens already render as bold
// (shared/rich-text.js). The teacher saw those stars raw in the editor and
// read them as code. This box is a contenteditable that parses the markers
// into <b> on load and writes them back on every edit, so the field shows
// bold and the config stays plain text plus the one marker. Ctrl/Cmd+B or
// the B chip toggles bold on the selection; paste is plain text; anything
// else the browser sneaks in (fonts, colors, links) is dropped on the way
// out, so a config can only ever hold text and double stars.
//
// runs() and serializeNodes() are pure (unit tested on a fake node tree);
// create() is the browser builder. The returned wrapper has a .value
// accessor, so code written for a textarea keeps working, and the inner
// box carries data-bold-box so the mic badge (speech-input.js) finds it.
(function () {
  'use strict';

  var BOLD_RE = /\*\*([^*\n]+)\*\*/g;

  // "a **b** c" -> [{text:'a ',bold:false},{text:'b',bold:true},{text:' c',bold:false}]
  // Unmatched stars stay literal.
  function runs(line) {
    var out = [];
    var last = 0;
    var m;
    BOLD_RE.lastIndex = 0;
    while ((m = BOLD_RE.exec(line)) !== null) {
      if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
      out.push({ text: m[1], bold: true });
      last = BOLD_RE.lastIndex;
    }
    if (last < line.length) out.push({ text: line.slice(last), bold: false });
    return out;
  }

  // Text with markers -> child nodes on el. createElement/textContent only.
  function render(el, text) {
    el.textContent = '';
    var lines = String(text == null ? '' : text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) el.appendChild(document.createElement('br'));
      var rs = runs(lines[i]);
      for (var j = 0; j < rs.length; j++) {
        if (rs[j].bold) {
          var b = document.createElement('b');
          b.textContent = rs[j].text;
          el.appendChild(b);
        } else {
          el.appendChild(document.createTextNode(rs[j].text));
        }
      }
    }
  }

  // Bold state a node passes to its children: its own tag or inline
  // weight when it says something, otherwise what it inherited. The
  // browser un-bolds with <span style="font-weight: normal"> inside a
  // <b>, so an explicit light weight must win over an inherited bold.
  function boldFor(node, inherited) {
    var n = node.nodeName;
    if (n === 'B' || n === 'STRONG') return true;
    var w = node.style && node.style.fontWeight;
    if (!w) return inherited;
    if (w === 'bold' || w === 'bolder') return true;
    if (w === 'normal' || w === 'lighter') return false;
    var num = parseInt(w, 10);
    return isNaN(num) ? inherited : num >= 600;
  }

  function isBlockNode(node) {
    var n = node.nodeName;
    return n === 'DIV' || n === 'P' || n === 'LI';
  }

  // Node tree -> text with ** markers. Works on any tree exposing
  // nodeType / nodeName / nodeValue / childNodes / style (DOM or fake).
  function serializeNodes(root) {
    var collected = [];
    function push(text, bold) {
      if (!text) return;
      var lastRun = collected[collected.length - 1];
      if (lastRun && lastRun.bold === bold) lastRun.text += text;
      else collected.push({ text: text, bold: bold });
    }
    function endsWithNewline() {
      var lastRun = collected[collected.length - 1];
      return !lastRun || /\n$/.test(lastRun.text);
    }
    function walk(node, bold) {
      var kids = node.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c.nodeType === 3) { push(c.nodeValue, bold); continue; }
        if (c.nodeType !== 1) continue;
        if (c.nodeName === 'BR') { push('\n', false); continue; }
        if (isBlockNode(c)) {
          // A block starts a new line unless we are already at one.
          if (collected.length && !endsWithNewline()) push('\n', false);
          walk(c, bold);
          continue;
        }
        walk(c, boldFor(c, bold));
      }
    }
    walk(root, false);

    var out = '';
    for (var k = 0; k < collected.length; k++) {
      var run = collected[k];
      if (!run.bold) { out += run.text; continue; }
      // Bold never crosses a line; whitespace-only bold is just whitespace.
      // Edge spaces sit outside the markers ("**word** " not "**word **").
      var pieces = run.text.split('\n');
      for (var p = 0; p < pieces.length; p++) {
        if (p > 0) out += '\n';
        var piece = pieces[p];
        var core = piece.trim();
        if (!core) { out += piece; continue; }
        var lead = piece.slice(0, piece.indexOf(core));
        var tail = piece.slice(piece.indexOf(core) + core.length);
        out += lead + '**' + core + '**' + tail;
      }
    }
    // The browser leaves a trailing <br> behind an emptied last line.
    return out.replace(/\n$/, '');
  }

  function exec(cmd, arg) {
    try { document.execCommand(cmd, false, arg); } catch (e) { /* unsupported */ }
  }

  // opts: { value, placeholder, className }
  // Returns a wrapper element: .value get/set (marker text), .focus(),
  // .box (the editable). 'input' events bubble up from the box.
  function create(opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'bold-box-wrap';

    var box = document.createElement('div');
    box.className = (opts.className || '') + ' bold-box';
    box.setAttribute('contenteditable', 'true');
    box.setAttribute('role', 'textbox');
    box.setAttribute('aria-multiline', 'true');
    box.dataset.boldBox = '1';
    if (opts.placeholder) box.setAttribute('data-placeholder', opts.placeholder);
    box.spellcheck = true;
    render(box, opts.value || '');

    Object.defineProperty(box, 'value', {
      get: function () { return serializeNodes(box); },
      set: function (v) { render(box, v); }
    });
    Object.defineProperty(wrap, 'value', {
      get: function () { return serializeNodes(box); },
      set: function (v) { render(box, v); }
    });
    wrap.focus = function () { box.focus(); };
    wrap.box = box;

    box.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        exec('bold');
        box.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    box.addEventListener('paste', function (e) {
      var clip = e.clipboardData || window.clipboardData;
      if (!clip) return;
      e.preventDefault();
      exec('insertText', clip.getData('text/plain'));
    });
    box.addEventListener('input', function () {
      // An emptied box keeps a stray <br>; clear it so the placeholder shows.
      if (box.childNodes.length && !serializeNodes(box)) box.textContent = '';
    });

    var tool = document.createElement('button');
    tool.type = 'button';
    tool.className = 'bold-box-tool';
    tool.textContent = 'B';
    tool.title = 'Bold the selected words (Ctrl+B)';
    tool.setAttribute('aria-label', 'Bold the selected words');
    // mousedown would steal the selection; keep it so bold lands on it.
    tool.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tool.addEventListener('click', function () {
      box.focus();
      exec('bold');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });

    wrap.appendChild(box);
    wrap.appendChild(tool);
    return wrap;
  }

  globalThis.BoldBox = {
    runs: runs,
    render: render,
    serializeNodes: serializeNodes,
    create: create
  };
})();
