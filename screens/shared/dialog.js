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
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      if (typeof opts.onClose === 'function') opts.onClose();
      if (previouslyFocused && previouslyFocused.focus &&
          document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    }

    // Announce + land focus inside the dialog.
    modal.focus();

    return { close: close, closeBtn: closeBtn };
  }

  globalThis.Dialog = { enhance: enhance };
})();
