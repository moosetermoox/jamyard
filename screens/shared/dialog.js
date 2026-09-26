// Dialog — accessible-modal behavior for the overlay/modal pattern used by
// the designer's pickers (2026-07-27 UI review: the pickers had no close
// button, no Escape, no focus management, and no dialog semantics).
//
// Usage:
//   var dlg = Dialog.enhance(overlay, modal, { title: 'Pick a Recipe' });
//   ...
//   dlg.close();   // removes the overlay, unbinds keys, restores focus
//
// What enhance() adds:
//   - role="dialog" + aria-modal + aria-label on the modal
//   - a × close button (survives view swaps if callers clear children
//     around it — see clearModal in designer.js)
//   - click-on-backdrop closes
//   - Escape closes; Tab is trapped inside the modal (focusables are
//     queried live, so modals that swap their content keep working)
//   - focus moves into the dialog on open and returns to the previously
//     focused element on close
//
// Plain script (browser global); no-ops safely when imported in tests.

(function () {
  'use strict';

  if (typeof document === 'undefined') {
    globalThis.Dialog = { enhance: function () { return { close: function () {} }; } };
    return;
  }

  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  // Dialogs left open by a flow that navigates away (e.g. the library's
  // builder doorway → /designer) survive inside the browser's back-forward
  // cache — pressing Back restored the page WITH the dialog still covering
  // it. Close any open dialog when a page is served from that cache.
  var openDialogs = [];
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    openDialogs.slice().forEach(function (closeFn) { closeFn(); });
  });

  function enhance(overlay, modal, opts) {
    opts = opts || {};
    var previouslyFocused = document.activeElement;
    var closed = false;

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (opts.title) modal.setAttribute('aria-label', opts.title);
    modal.tabIndex = -1;

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dialog-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', close);
    modal.appendChild(closeBtn);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    function onKeydown(e) {
      // Self-clean if the overlay was removed without close() (e.g. a flow
      // that navigates away) — the listener must not outlive the dialog.
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', onKeydown, true);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        var focusables = modal.querySelectorAll(FOCUSABLE);
        if (focusables.length === 0) { e.preventDefault(); return; }
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        var active = document.activeElement;
        if (e.shiftKey && (active === first || !modal.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeydown, true);

    function close() {
      if (closed) return;
      closed = true;
      var idx = openDialogs.indexOf(close);
      if (idx !== -1) openDialogs.splice(idx, 1);
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      if (typeof opts.onClose === 'function') opts.onClose();
      if (previouslyFocused && previouslyFocused.focus &&
          document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    }

    openDialogs.push(close);

    // Announce + land focus inside the dialog.
    modal.focus();

    return { close: close, closeBtn: closeBtn };
  }

  // The site's own yes-or-no box, in place of the browser's confirm()
  // (a reviewer, 2026-09-26: it looked foreign and froze the page).
  // Resolves true on the red button, false on Cancel, Escape, or the x.
  // Carries its own look (one injected sheet), so any page can ask.
  // opts: { title, message, confirmLabel, cancelLabel (null = none) }
  var CONFIRM_CSS = [
    '.dlg-confirm-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(42, 38, 32, 0.5); display: flex; align-items: center; justify-content: center; padding: 16px; }',
    '.dlg-confirm { position: relative; width: 100%; max-width: 420px; padding: 22px 26px 20px; background: var(--t-paper, #FDF9F0); color: var(--t-ink, #2A2620); box-shadow: 0 0 0 2px var(--t-ink, #2A2620), 6px 8px 0 rgba(80, 60, 30, 0.14); transform: rotate(-0.4deg); font-family: var(--t-body, "DM Sans", Arial, sans-serif); }',
    '.dlg-confirm h2 { margin: 0 0 8px; font-family: var(--t-display, "Bricolage Grotesque", Arial, sans-serif); font-weight: 800; font-size: 1.3rem; line-height: 1.2; overflow-wrap: anywhere; }',
    '.dlg-confirm p { margin: 0; font-size: 1rem; line-height: 1.4; overflow-wrap: anywhere; }',
    '.dlg-confirm-row { display: flex; justify-content: flex-end; gap: 12px; margin-top: 18px; }',
    '.dlg-confirm-btn { border: none; cursor: pointer; padding: 9px 16px; font-family: var(--t-display, "Bricolage Grotesque", Arial, sans-serif); font-weight: 800; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; background: var(--t-paper, #FDF9F0); color: var(--t-ink, #2A2620); box-shadow: 0 3px 4px rgba(50, 35, 15, 0.20); transform: rotate(-0.6deg); transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1); }',
    '.dlg-confirm-btn:hover { transform: rotate(-0.6deg) translateY(-3px); }',
    '.dlg-confirm-go { background: var(--t-red, #E5482B); color: #fff; transform: rotate(0.6deg); }',
    '.dlg-confirm-go:hover { transform: rotate(0.6deg) translateY(-3px); }',
    '.dlg-confirm .dialog-close-btn { position: absolute; top: 8px; right: 10px; border: none; background: none; cursor: pointer; font-size: 1rem; font-weight: 800; color: var(--t-ink, #2A2620); }'
  ].join('\n');
  function ensureConfirmStyles() {
    if (document.getElementById('dlg-confirm-styles')) return;
    var style = document.createElement('style');
    style.id = 'dlg-confirm-styles';
    style.textContent = CONFIRM_CSS;
    document.head.appendChild(style);
  }
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensureConfirmStyles();
      var overlay = document.createElement('div');
      overlay.className = 'dlg-confirm-overlay';
      var modal = document.createElement('div');
      modal.className = 'dlg-confirm';
      var h = document.createElement('h2');
      h.textContent = opts.title || 'Are you sure?';
      modal.appendChild(h);
      if (opts.message) {
        var p = document.createElement('p');
        p.textContent = opts.message;
        modal.appendChild(p);
      }
      var row = document.createElement('div');
      row.className = 'dlg-confirm-row';
      var answered = false;
      var dlg;
      function done(value) {
        if (answered) return;
        answered = true;
        resolve(!!value);
        if (dlg) dlg.close();
      }
      if (opts.cancelLabel !== null) {
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'dlg-confirm-btn';
        cancel.textContent = opts.cancelLabel || 'Cancel';
        cancel.addEventListener('click', function () { done(false); });
        row.appendChild(cancel);
      }
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'dlg-confirm-btn dlg-confirm-go';
      ok.textContent = opts.confirmLabel || 'OK';
      ok.addEventListener('click', function () { done(true); });
      row.appendChild(ok);
      modal.appendChild(row);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      dlg = enhance(overlay, modal, { title: h.textContent, onClose: function () { done(false); } });
      ok.focus();
    });
  }

  globalThis.Dialog = { enhance: enhance, confirm: confirm };
})();
