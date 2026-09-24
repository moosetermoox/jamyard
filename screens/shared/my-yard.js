// my-yard.js — the teacher's own shelf on the yard (one yard, 2026-09-13).
//
// Your copies, hearts, and recently used activities as the grid's own
// prints (shared/yard-prints.js) on one long board, "MY YARD" painted
// under it, each print with a row of tiny tools on its paper (play hosts
// it, the pen edits it or makes it yours, the heart hearts it, the bin
// deletes it), and the popup with the doors (Edit or Pick this one, Try
// it out, Host this, the heart, Share, the shed, Delete). This lived in
// screens/library/library.js until the yard page folded into the home
// (owner: "there's just one place to view the activities"); the yard
// page is the owner's curation console now.
//
// Placement rule (Totem 9g): an activity stands in exactly one place.
// Your own copies live on the shelf (or in the shed), hearts beat
// recency, everything else is the yard's grid. A search brings shed
// items back so nothing is ever lost.
//
// Needs: YardPrints, ActivityPrefs, MyGames, Dialog; HostLaunch for Host;
// HoverCard, ActivityMap, OwnerMode when present. Activity text is
// untrusted: textContent only, never HTML strings.
(function () {
  'use strict';

  var shedOpen = false;

  function prefs() { return window.ActivityPrefs; }
  function isOwn(id) { return !!(window.MyGames && MyGames.has(id)); }
  function ownerOn() { return !!(window.OwnerMode && OwnerMode.isOn()); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Every door that is not a room: the make page (the print, then Try it
  // out or Host it now)
  function makeHref(g) {
    return '/make?game=' + encodeURIComponent(g.id) + '&from=yard';
  }

  // Is this one the teacher's (a copy, a heart, or recently used)?
  function onShelf(g) {
    var P = prefs();
    return isOwn(g.id) || (P && (P.Favorites.has(g.id) || P.Recents.has(g.id)));
  }

  // {mine, shed, rest}: the shelf in its own order (hearted first, then
  // recently used, then newest-saved), the shed, and the rest of the
  // yard. Duplicate rows (a disk and a DB copy) render once.
  // Every row the page knows, kept from the last split so a shelf print
  // can find the built-in it was copied from (18d)
  var allGames = [];
  function templateOf(g) {
    return window.YardPrints && YardPrints.templateOf ? YardPrints.templateOf(g, allGames) : null;
  }

  function split(games, opts) {
    allGames = games || [];
    var query = (opts && opts.query) || '';
    var P = prefs();
    var placed = {};
    var copies = [], hearts = [], recent = [], shed = [], rest = [];
    games.forEach(function (g) {
      if (placed[g.id] || !isOwn(g.id)) return;
      if (P.Archived.has(g.id) && !query) shed.push(g); else copies.push(g);
      placed[g.id] = true;
    });
    P.Favorites.list().forEach(function (id) {
      games.forEach(function (g) { if (g.id === id && !placed[id]) { hearts.push(g); placed[id] = true; } });
    });
    P.Recents.list().forEach(function (id) {
      games.forEach(function (g) { if (g.id === id && !placed[id]) { recent.push(g); placed[id] = true; } });
    });
    games.forEach(function (g) {
      if (!placed[g.id]) { rest.push(g); placed[g.id] = true; }
    });
    var mine = P.orderYard(recent.concat(hearts, copies), {
      hearts: P.Favorites.list(),
      recents: P.Recents.list(),
      created: window.MyGames ? MyGames.list() : []
    });
    return { mine: mine, shed: shed, rest: rest };
  }

  // The shelf: "My yard" as a heading ABOVE the prints, the same weight
  // as "The yard" under it (the painted tag under the board read as a
  // label for what came next: owner, 2026-09-13), the note on where
  // copies live beside it, the prints on a board, and the shed line.
  // Returns null when there is nothing to show. opts.onOpen(game) opens
  // the popup; opts.onChange(change) is called after a heart, a shed
  // move, or a delete ({removedId}).
  function buildShelf(mine, shed, opts) {
    opts = opts || {};
    if ((!mine || mine.length === 0) && (!shed || shed.length === 0)) return null;
    var outer = el('div', 'myyard-wrap');
    var head = el('div', 'myyard-head');
    head.appendChild(el('h2', null, 'My yard'));
    // Where these live, and how to carry one somewhere else (outside review,
    // 2026-09-06: teachers could not tell that copies are per-browser).
    if (mine.length > 0) {
      head.appendChild(el('p', 'myyard-note', 'Your copies live in this browser. Open one and use Share for a link that works on any device.'));
    }
    outer.appendChild(head);
    // The board's hard shadow would ghost the shed toggle's text, so the
    // shed line sits outside .myyard
    var wrap = el('div', 'myyard');
    outer.appendChild(wrap);

    var row = el('div', 'myyard-row yard-grid');
    for (var i = 0; i < mine.length; i++) row.appendChild(buildShelfPrint(mine[i], i, opts));
    wrap.appendChild(row);
    wrap.appendChild(el('div', 'myyard-board'));

    if (shed && shed.length > 0) {
      var shedToggle = el('button', 'shed-toggle', (shedOpen ? '▾' : '▸') + ' In the shed (' + shed.length + ')');
      shedToggle.type = 'button';
      shedToggle.setAttribute('aria-expanded', shedOpen ? 'true' : 'false');
      shedToggle.addEventListener('click', function () {
        shedOpen = !shedOpen;
        if (opts.onChange) opts.onChange({});
      });
      outer.appendChild(shedToggle);
      if (shedOpen) {
        var shedRow = el('div', 'myyard-row shed-row yard-grid');
        for (var s = 0; s < shed.length; s++) shedRow.appendChild(buildShelfPrint(shed[s], s, opts));
        outer.appendChild(shedRow);
      }
    }
    return outer;
  }

  // One print on the shelf: the grid's own print (the hover card comes
  // with it) with a row of tiny tools under its name row (18d, 2026-09-24;
  // they sat on the paper's bottom margin before). The tools sit beside
  // the card in the DOM, never inside it (the card is itself a button);
  // the wrapper takes the card's tilt so the tools turn with the paper.
  function buildShelfPrint(game, index, opts) {
    var item = el('div', 'shelf-item');
    // A teacher's own copy prints on a sanded mat with its own words on
    // the block and the template's name over its own (18d)
    var own = isOwn(game.id) && YardPrints.ownDetails ? YardPrints.ownDetails(game, templateOf(game)) : null;
    var card = YardPrints.buildCard(game, index, { onClick: function (g) { if (opts.onOpen) opts.onOpen(g); }, own: own });
    card.setAttribute('aria-label', game.name + ', see what it is and make it yours');
    item.style.setProperty('--rot', card.style.getPropertyValue('--rot') || '0deg');
    card.style.setProperty('--rot', '0deg');
    item.appendChild(card);

    var tools = el('div', 'shelf-tools');
    var editable = isOwn(game.id) || ownerOn();
    var P = prefs();

    var play = shelfTool('a', 'play', 'Host "' + game.name + '" now');
    play.href = '/host?game=' + encodeURIComponent(game.id);
    play.title = 'Host it: start a live room your class can join right now';
    // The console opens in a new tab alongside (shared/host-launch.js)
    play.addEventListener('click', function (e) {
      P.Recents.add(game.id);
      if (window.HostLaunch) { e.preventDefault(); HostLaunch.launch(game.id); }
    });
    tools.appendChild(play);

    var pen = shelfTool('a', 'pen', (editable ? 'Edit "' : 'Make "') + game.name + '" yours');
    if (editable) {
      pen.href = '/designer/edit?game=' + encodeURIComponent(game.id) + '&from=yard';
      pen.title = 'Open it in the designer';
    } else {
      pen.href = makeHref(game);
      pen.title = 'Make it yours: change the question, then host it';
    }
    pen.addEventListener('click', function () { P.Recents.add(game.id); });
    tools.appendChild(pen);

    var isFav = P.Favorites.has(game.id);
    var heart = shelfTool('button', 'heart', (isFav ? 'Remove "' : 'Heart "') + game.name + '"');
    heart.type = 'button';
    heart.title = isFav ? 'Hearted: keeps it up front. Click to remove' : 'Heart it: keeps it up front';
    heart.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    heart.addEventListener('click', function () {
      P.Favorites.toggle(game.id);
      if (opts.onChange) opts.onChange({}); // the shelf reorders: hearted first
    });
    tools.appendChild(heart);

    // Share: the popup's link, from the shelf (18d); own copies only
    if (isOwn(game.id)) {
      var share = shelfTool('button', 'share', 'Copy a share link for "' + game.name + '"');
      share.type = 'button';
      share.title = 'Copy a link another teacher can open to save their own copy';
      share.addEventListener('click', function () { copyShareLink(game.id, share, flashTool(share)); });
      tools.appendChild(share);
    }

    if (editable) {
      var bin = shelfTool('button', 'bin', 'Delete "' + game.name + '"');
      bin.type = 'button';
      bin.title = 'Delete it, this cannot be undone';
      bin.addEventListener('click', function () { deleteOwnGame(game, opts.onChange); });
      tools.appendChild(bin);
    }

    item.appendChild(tools);
    return item;
  }

  // "Link copied!" beside a tool for a moment (a tool holds a mark, not
  // text, so the popup button's own flash cannot be reused)
  function flashTool(tool) {
    return function () {
      var tag = el('span', 'shelf-flash', 'Link copied!');
      tag.setAttribute('role', 'status');
      tool.parentNode.appendChild(tag);
      setTimeout(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); }, 1800);
    };
  }

  // A 24px paper square holding one drawn mark (ink strokes, no emoji).
  var SHELF_ICONS = {
    play: { d: 'M4.5 2.5 L13 8 L4.5 13.5 Z', fill: true },
    pen: { d: 'M2.5 13.5 L3.3 10.2 L10.6 2.9 L13.1 5.4 L5.8 12.7 Z M9.4 4.1 L11.9 6.6', fill: false },
    heart: { d: 'M8 13.6 L2.9 8.6 C1.5 7.2 1.6 4.9 3.2 3.8 C4.6 2.8 6.6 3.2 8 4.9 C9.4 3.2 11.4 2.8 12.8 3.8 C14.4 4.9 14.5 7.2 13.1 8.6 Z', fill: false },
    share: { d: 'M13.6 3.6 a1.7 1.7 0 1 1 -3.4 0 a1.7 1.7 0 1 1 3.4 0 Z M5.7 8 a1.7 1.7 0 1 1 -3.4 0 a1.7 1.7 0 1 1 3.4 0 Z M13.6 12.4 a1.7 1.7 0 1 1 -3.4 0 a1.7 1.7 0 1 1 3.4 0 Z M5.5 7.2 L10.4 4.4 M5.5 8.8 L10.4 11.6', fill: false },
    bin: { d: 'M2.8 4.3 H13.2 M6 4.3 V2.6 H10 V4.3 M4.3 4.3 L5 13.4 H11 L11.7 4.3 M6.9 6.8 V11.2 M9.1 6.8 V11.2', fill: false }
  };

  function shelfTool(tag, icon, label) {
    var tool = el(tag, 'shelf-tool shelf-tool-' + icon);
    tool.setAttribute('aria-label', label);
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', SHELF_ICONS[icon].d);
    path.setAttribute('fill', SHELF_ICONS[icon].fill ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    tool.appendChild(svg);
    return tool;
  }

  // The popup for a shelf print: what it is, what happens (the map), then
  // the doors. One red action: Pick this one while an activity is a
  // template you have not made yours, Host once it is yours or tried.
  // opts.onChange as above; opts.onClose runs when the popup closes.
  function openDialog(game, opts) {
    opts = opts || {};
    var P = prefs();
    var overlay = el('div', 'myyard-dialog-overlay');
    var modal = el('div', 'myyard-dialog');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var dlg = Dialog.enhance(overlay, modal, { title: game.name, onClose: opts.onClose });

    var name = el('h2', 'myyard-dialog-name', game.name);
    modal.insertBefore(name, dlg.closeBtn);
    var metaBits = [YardPrints.metaOf(game)];
    if (game.family === 'connection') metaBits.push('no scores, no winners');
    modal.appendChild(el('p', 'myyard-dialog-meta', metaBits.join(' · ')));
    modal.appendChild(el('p', 'myyard-dialog-desc', game.description || ''));

    // What happens, stop by stop; arrives async into this holder so the
    // doors below never jump out from under the mouse
    var mapHolder = el('div');
    modal.appendChild(mapHolder);
    if (window.ActivityMap) ActivityMap.attach(game.id, mapHolder);

    var actions = el('div', 'myyard-actions');
    var rememberRecent = function () { P.Recents.add(game.id); };
    var editable = isOwn(game.id) || ownerOn();
    var touched = editable || P.Recents.has(game.id);

    if (editable) {
      var editBtn = el('a', 'myyard-act', 'Edit');
      editBtn.href = '/designer/edit?game=' + encodeURIComponent(game.id) + '&from=yard';
      editBtn.setAttribute('aria-label', 'Edit "' + game.name + '"');
      editBtn.addEventListener('click', rememberRecent);
      actions.appendChild(editBtn);
    } else {
      var pickBtn = el('a', 'myyard-act' + (touched ? '' : ' myyard-act-red'), 'Pick this one');
      pickBtn.href = makeHref(game);
      pickBtn.title = 'Open it as your class will see it, change the question, then host it';
      pickBtn.setAttribute('aria-label', 'Pick "' + game.name + '"');
      actions.appendChild(pickBtn);
    }

    if (touched) {
      var tryBtn = el('a', 'myyard-act', 'Try it out');
      tryBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
      tryBtn.title = 'See the teacher and student screens side by side, with pretend students, no class needed';
      tryBtn.setAttribute('aria-label', 'Try out "' + game.name + '" with pretend students');
      tryBtn.addEventListener('click', rememberRecent);
      actions.appendChild(tryBtn);

      var hostBtn = el('a', 'myyard-act myyard-act-red', '▶ Host this');
      hostBtn.href = '/host?game=' + encodeURIComponent(game.id);
      hostBtn.title = 'Start a live room your class can join right now';
      hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
      // The console opens in a new tab alongside (shared/host-launch.js)
      hostBtn.addEventListener('click', function (e) {
        rememberRecent();
        if (window.HostLaunch) { e.preventDefault(); HostLaunch.launch(game.id); }
      });
      actions.appendChild(hostBtn);
    }

    var isFav = P.Favorites.has(game.id);
    var favBtn = el('button', 'myyard-act myyard-act-fav' + (isFav ? ' is-fav' : ''), isFav ? '♥' : '♡');
    favBtn.type = 'button';
    favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
    favBtn.setAttribute('aria-label', (isFav ? 'Remove "' : 'Favorite "') + game.name + '"');
    favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    favBtn.addEventListener('click', function () {
      P.Favorites.toggle(game.id);
      var nowFav = P.Favorites.has(game.id);
      favBtn.textContent = nowFav ? '♥' : '♡';
      favBtn.className = 'myyard-act myyard-act-fav' + (nowFav ? ' is-fav' : '');
      favBtn.setAttribute('aria-pressed', nowFav ? 'true' : 'false');
      if (opts.onChange) opts.onChange({}); // the shelf reorders behind the popup
    });
    actions.appendChild(favBtn);

    // Share: a link a colleague opens to save THEIR OWN copy (never this
    // row; the import page calls /api/games/:id/copy). Own copies only.
    if (isOwn(game.id)) {
      var shareBtn = el('button', 'myyard-act myyard-act-quiet', 'Share');
      shareBtn.type = 'button';
      shareBtn.title = 'Copy a link another teacher can open to save their own copy';
      shareBtn.setAttribute('aria-label', 'Copy a share link for "' + game.name + '"');
      shareBtn.addEventListener('click', function () { copyShareLink(game.id, shareBtn); });
      actions.appendChild(shareBtn);

      // The shed is the safe cousin of Delete: put it away, get it back
      var inShed = P.Archived.has(game.id);
      var shedBtn = el('button', 'myyard-act myyard-act-quiet', inShed ? 'Take out of the shed' : 'Put in the shed');
      shedBtn.type = 'button';
      shedBtn.title = inShed ? 'Bring this back onto your yard board' : 'Tuck this away without deleting it, it moves under "In the shed"';
      shedBtn.setAttribute('aria-label', (inShed ? 'Take "' : 'Put "') + game.name + (inShed ? '" out of the shed' : '" in the shed'));
      shedBtn.addEventListener('click', function () {
        P.Archived.toggle(game.id);
        dlg.close();
        if (opts.onChange) opts.onChange({});
      });
      actions.appendChild(shedBtn);
    }

    if (editable) {
      var deleteBtn = el('button', 'myyard-act myyard-act-quiet myyard-act-delete', 'Delete');
      deleteBtn.type = 'button';
      deleteBtn.title = 'Delete this activity, this cannot be undone';
      deleteBtn.setAttribute('aria-label', 'Delete "' + game.name + '"');
      deleteBtn.addEventListener('click', function () {
        dlg.close();
        deleteOwnGame(game, opts.onChange);
      });
      actions.appendChild(deleteBtn);
    }

    modal.appendChild(actions);
    return dlg;
  }

  function deleteOwnGame(game, onChange) {
    if (!window.confirm('Delete "' + game.name + '"? This cannot be undone.')) return;
    fetch('/api/games/' + encodeURIComponent(game.id), { method: 'DELETE' })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (result) {
          if (!response.ok) throw new Error(result.error || 'Unknown error');
          if (window.MyGames) MyGames.remove(game.id);
          if (onChange) onChange({ removedId: game.id });
        });
      })
      .catch(function (error) { window.alert('Delete failed: ' + error.message); });
  }

  // Copies the share link to the clipboard; the button itself reports
  // success. Same clipboard fallback ladder as the host screen's join link.
  function copyShareLink(id, btn, flashFn) {
    var link = location.origin + '/share/' + encodeURIComponent(id);
    var flash = flashFn || function () {
      var old = btn.textContent;
      btn.textContent = 'Link copied!';
      setTimeout(function () { btn.textContent = old; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(flash).catch(function () { fallbackCopy(link, flash); });
    } else {
      fallbackCopy(link, flash);
    }
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) {
      // Clipboard fully blocked: show the link so it can be copied by hand
      window.prompt('Copy this share link:', text);
    }
  }

  window.MyYard = {
    split: split,
    onShelf: onShelf,
    buildShelf: buildShelf,
    openDialog: openDialog,
    makeHref: makeHref
  };
})();
