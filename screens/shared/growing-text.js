// Growing text box: a single-line field that grows DOWNWARD as the entry
// gets longer (library Customize dialogs, 2026-09-02). A plain <input>
// scrolls a long question off its right edge, so the teacher can't see
// what they wrote; this is a one-row <textarea> that fits its content on
// every keystroke while keeping single-line semantics (Enter is swallowed,
// pasted newlines become spaces).
//
// Usage: var ta = GrowingText.create({ css, placeholder, maxLength, value });
// After inserting into the DOM call GrowingText.fit(ta) (create schedules
// one on the next frame too, which covers the usual append-right-away case).
(function () {
  function fit(ta) {
    // Empty = one row (a long placeholder would otherwise wrap and puff
    // the box up before anything is typed; the height should track the
    // entry, not the hint). overflow:clip + a content-box clip margin keeps
    // the placeholder's wrapped second line from peeking through the
    // bottom padding (hidden clips at the border box and shows a sliver).
    if (!ta.value) { ta.style.overflow = 'clip'; ta.style.height = ''; return; }
    // With text, hidden: clip makes the box a non-scroll container and
    // scrollHeight stops reporting the wrapped content height.
    ta.style.overflow = 'hidden';
    ta.style.height = 'auto';
    var h = ta.scrollHeight;
    if (h > 0) ta.style.height = h + 'px';
  }

  function create(opts) {
    opts = opts || {};
    var ta = document.createElement('textarea');
    ta.rows = 1;
    ta.style.cssText = (opts.css || '') +
      ' resize:none; overflow:hidden; overflow-clip-margin:content-box; display:block; line-height:1.35;';
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    if (opts.maxLength) ta.maxLength = opts.maxLength;
    if (opts.value != null) ta.value = opts.value;
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') ev.preventDefault();
    });
    ta.addEventListener('input', function () {
      if (/[\r\n]/.test(ta.value)) ta.value = ta.value.replace(/\r\n|\r|\n/g, ' ');
      fit(ta);
    });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { fit(ta); });
    return ta;
  }

  globalThis.GrowingText = { create: create, fit: fit };
})();
