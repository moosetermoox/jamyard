// Activity Library — the teacher-facing front door (library-first, 2026-07-28).
//
// THE one shelf (docs/SURFACES-PLAN.md, 2026-08-01): search + goal chips,
// cards whose primary action is Host, favorites/recents sections, delete for
// this device's activities, owner mode (unlock link, ★ featured toggles,
// built-in edit/delete), and a "build your own" doorway that opens /designer
// — now the grid-less Create page — while filing a builder-request signal.
// Visibility rules: game-visibility.js (featured built-ins + this device's
// creations; everything in owner mode).
//
// Deliberately NOT here (create-page/editor territory): recipes, AI
// generation, the idea box.

var libraryGrid = document.getElementById('library-grid');
var loadingMessage = document.getElementById('loading-message');
var errorMessage = document.getElementById('error-message');

var Favorites = ActivityPrefs.Favorites;
var Recents = ActivityPrefs.Recents;
var Archived = ActivityPrefs.Archived;

// Connect leads — the library is about doing things together.
// Fine-grained goal labels (plain words, Totem never-list): owner-mode
// cards and the activity popup; teachers see piles.
var GOAL_LABELS = {
  connect: 'Connect',
  discuss: 'Discuss',
  decide: 'Decide',
  reflect: 'Reflect',
  create: 'Create',
  review: 'Review',
  energize: 'Energize'
};

// Seven piles (Totem: 10d + popup): three personal shelves, then the four
// broad goal piles. Placement precedence differs from display order: your
// own copies always live in CUSTOMIZED, hearts beat recency, and each
// activity stands in exactly one pile.
var PILE_GROUPS = [
  { key: 'recent', label: 'Recent' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'customized', label: 'Yours' },
  // The goal piles and their tag membership come from the shared
  // GoalGroups (screens/shared/goal-groups.js), which the home page's
  // shelf filter reads too.
  // Their labels are the four jobs the home page's planks say (15b home,
  // 2026-09-10): "To connect", "To think", "To review", "To just have fun".
  { key: 'connect', label: GoalGroups.GROUPS[0].job, goals: GoalGroups.goalsIn('connect') },
  { key: 'think', label: GoalGroups.GROUPS[1].job, goals: GoalGroups.goalsIn('think') },
  { key: 'review', label: GoalGroups.GROUPS[2].job, goals: GoalGroups.goalsIn('review') },
  { key: 'play', label: GoalGroups.GROUPS[3].job, goals: GoalGroups.goalsIn('play') }
];

var GOAL_TO_GROUP = GoalGroups.GOAL_TO_GROUP;

// The popup reads the same plain words (kept as an alias since the emoji
// labels retired, 2026-08-20).
var GOAL_WORDS = GOAL_LABELS;

function goalGroupOf(game) {
  return GoalGroups.groupOf(game);
}

var allGames = [];
var libraryQuery = '';
var activeGoal = null; // a PILE_GROUPS goal key: connect | think | review | play

// The time chips (Under 5 / 10 / 20 min) came out on 2026-09-10 (owner's
// call): the minutes still show on every plank, the shelf is not filtered
// by them.

function applyVisibility(games) {
  if (!window.GameVisibility) return games;
  return GameVisibility.visibleGames(games, {
    owner: window.OwnerMode ? OwnerMode.isOn() : false,
    myIds: window.MyGames ? MyGames.list() : []
  });
}

function matchesGoal(game) {
  if (!activeGoal) return true;
  var group = null;
  for (var i = 0; i < PILE_GROUPS.length; i++) {
    if (PILE_GROUPS[i].key === activeGoal) { group = PILE_GROUPS[i]; break; }
  }
  if (!group || !group.goals) return true;
  var tags = Array.isArray(game.tags) ? game.tags : [];
  for (var t = 0; t < tags.length; t++) {
    if (group.goals.indexOf(tags[t]) !== -1) return true;
  }
  return false;
}

function matchesFilters(game) {
  if (!matchesGoal(game)) return false;
  if (libraryQuery) {
    var hay = (game.name + ' ' + (game.description || '') + ' ' +
      (Array.isArray(game.tags) ? game.tags.join(' ') : '') + ' ' +
      (Array.isArray(game.keywords) ? game.keywords.join(' ') : '')).toLowerCase();
    if (hay.indexOf(libraryQuery) === -1) return false;
  }
  return true;
}

function buildGoalChips(games) {
  var chipsEl = document.getElementById('goal-chips');
  chipsEl.innerHTML = '';
  PILE_GROUPS.forEach(function (group) {
    if (!group.goals) return; // personal piles are shelves, not filters
    var count = 0;
    for (var i = 0; i < games.length; i++) {
      var tags = Array.isArray(games[i].tags) ? games[i].tags : [];
      for (var t = 0; t < tags.length; t++) {
        if (group.goals.indexOf(tags[t]) !== -1) { count++; break; }
      }
    }
    if (count === 0 && group.key !== activeGoal) return;
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'goal-chip' + (group.key === activeGoal ? ' active' : '');
    chip.textContent = group.label + ' ' + count;
    chip.setAttribute('aria-pressed', group.key === activeGoal ? 'true' : 'false');
    chip.addEventListener('click', function () {
      activeGoal = (activeGoal === group.key) ? null : group.key;
      refreshLibrary();
    });
    chipsEl.appendChild(chip);
  });
}

function refreshLibrary() {
  // Rebuilding the planks orphans whatever the mouse was resting on.
  if (window.HoverCard) HoverCard.hide();
  var visible = applyVisibility(allGames);
  document.getElementById('library-controls').hidden = visible.length === 0;
  buildGoalChips(visible);
  var filtered = visible.filter(matchesFilters);
  // Subject-search rescue (2026-08-08 field test): the activities are
  // topic-agnostic shells, so "history" matching nothing is our failure to
  // explain, not a real empty result. Show the shelf anyway (goal filter
  // still respected) with an honest note instead of a dead end.
  // The goal chip stays honored in the rescue: goal first (saying so),
  // then everything.
  if (filtered.length === 0 && libraryQuery && visible.length > 0) {
    var goalOnly = visible.filter(matchesGoal);
    renderLibrary(goalOnly.length ? goalOnly : visible, { query: libraryQuery });
    return;
  }
  renderLibrary(filtered);
}

// Search does read names, descriptions, and keywords, so the rescue copy
// says "mentions", never "is named".
function rescueHeadline(rescue) {
  return 'Nothing mentions "' + rescue.query + '", and that\'s okay:';
}

function renderLibrary(games, rescueInfo) {
  libraryGrid.innerHTML = '';

  if (rescueInfo) {
    var rescue = document.createElement('div');
    rescue.className = 'search-rescue';
    var rescueHead = document.createElement('p');
    rescueHead.className = 'search-rescue-head';
    rescueHead.textContent = rescueHeadline(rescueInfo);
    rescue.appendChild(rescueHead);
    var rescueBody = document.createElement('p');
    rescueBody.className = 'search-rescue-body';
    rescueBody.textContent = 'These activities work with any subject. Pick one and your topic goes in when you host it or make it yours.';
    rescue.appendChild(rescueBody);
    var rescueLink = document.createElement('a');
    rescueLink.className = 'search-rescue-link';
    rescueLink.href = '/designer?notsure=1';
    rescueLink.textContent = 'Or tell us what you\'re teaching and we\'ll suggest a fit';
    rescue.appendChild(rescueLink);
    libraryGrid.appendChild(rescue);
  }

  var ownerOn = window.OwnerMode && OwnerMode.isOn();
  if (ownerOn) {
    var ownerBar = document.createElement('div');
    ownerBar.className = 'owner-bar';
    var ownerLabel = document.createElement('span');
    ownerLabel.textContent = 'Owner view, showing every activity';
    ownerBar.appendChild(ownerLabel);
    var inboxLink = document.createElement('a');
    inboxLink.href = '/feedback';
    inboxLink.textContent = 'Feedback inbox';
    ownerBar.appendChild(inboxLink);
    var exitBtn = document.createElement('button');
    exitBtn.className = 'owner-bar-exit';
    exitBtn.textContent = 'Exit owner view';
    exitBtn.addEventListener('click', exitOwnerMode);
    ownerBar.appendChild(exitBtn);
    libraryGrid.appendChild(ownerBar);
  }

  if (games.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = (libraryQuery || activeGoal)
      ? 'No matches, try a different search or clear the filter.'
      : 'Nothing here yet.';
    libraryGrid.appendChild(empty);
    // Dead-end rescue: the concierge on the Create page can suggest
    // something that fits even when the search found nothing.
    var notSure = document.createElement('a');
    notSure.className = 'empty-message';
    notSure.href = '/designer?notsure=1';
    notSure.textContent = 'Not sure what to make? Let\'s figure it out';
    notSure.style.cssText = 'display:block; margin-top:8px; font-weight:800;';
    libraryGrid.appendChild(notSure);
    return;
  }

  if (ownerOn) {
    // Owner view sorts by CURATION, not personal use: what the public shelf
    // shows right now, then everything hidden from visitors — so the owner
    // can read the live featured set at a glance. Owner mode keeps the card
    // grid: it is a curation tool, every control visible at once.
    var liveFeatured = games.filter(function (g) { return g.featured; });
    var hidden = games.filter(function (g) { return !g.featured; });
    if (liveFeatured.length > 0) {
      appendSection('★ Featured right now (' + liveFeatured.length + '), what visitors see', liveFeatured);
    }
    if (hidden.length > 0) {
      appendSection('Hidden from visitors (' + hidden.length + ')', hidden);
    }
    return;
  }

  // Teacher view (Totem 9g): a compact personal shelf up top, then the
  // yard piles with their painted labels below. Each activity
  // stands in exactly one place; placement precedence: yours → hearted →
  // recently used → home goal pile.
  var piles = { recent: [], favorites: [], customized: [] };
  GoalGroups.GROUPS.forEach(function (group) { piles[group.key] = []; });
  var placed = {};
  var shedGames = [];

  games.forEach(function (g) {
    if (placed[g.id]) return; // duplicate rows render once (disk + DB copies)
    if (window.MyGames && MyGames.has(g.id)) {
      // Activities in the shed leave the row but stay searchable: a live
      // search puts them back on the board so nothing is ever lost.
      if (Archived.has(g.id) && !libraryQuery) {
        shedGames.push(g);
      } else {
        piles.customized.push(g);
      }
      placed[g.id] = true;
    }
  });
  Favorites.list().forEach(function (id) {
    for (var g = 0; g < games.length; g++) {
      if (games[g].id === id && !placed[id]) {
        piles.favorites.push(games[g]);
        placed[id] = true;
      }
    }
  });
  Recents.list().forEach(function (id) {
    for (var g = 0; g < games.length; g++) {
      if (games[g].id === id && !placed[id]) {
        piles.recent.push(games[g]);
        placed[id] = true;
      }
    }
  });
  games.forEach(function (g) {
    if (!placed[g.id]) piles[goalGroupOf(g)].push(g);
  });

  // One ordering rule for the whole row: hearted keeps a plank up front,
  // then recently used, then the rest newest-saved first.
  var mine = ActivityPrefs.orderYard(
    piles.recent.concat(piles.favorites, piles.customized),
    {
      hearts: Favorites.list(),
      recents: Recents.list(),
      created: window.MyGames ? MyGames.list() : []
    }
  );
  if (mine.length > 0 || shedGames.length > 0) {
    libraryGrid.appendChild(buildMyYardShelf(mine, shedGames));
  }

  // The rest of the yard: the home page's grid of prints, shortest first
  // (the shared /shared/yard-prints.js, owner's call 2026-09-10: the yard
  // is the home's "The whole yard" without the fold and the carousel).
  // The chips above already narrowed the list; clicking a print opens
  // the activity popup with its doors.
  var rest = [];
  GoalGroups.GROUPS.forEach(function (group) { rest = rest.concat(piles[group.key]); });
  var grid = document.createElement('div');
  grid.className = 'yard-grid';
  YardPrints.buildGrid(grid, rest, { onClick: openActivityDialog, aiHref: '/designer' });
  libraryGrid.appendChild(grid);
}

// The goal piles of planks (Totem 9g) retired on 2026-09-10: the yard
// draws the home's grid of prints instead (/shared/yard-prints.js). The
// personal shelf below keeps its mini planks.

// The personal shelf: recents, hearts, and your copies as small planks
// resting on one long board, "MY YARD" painted underneath. Hidden until
// there's something on it (renderLibrary only calls with 1+). Activities
// put away live behind the collapsed "In the shed" line beneath the board.
var shedOpen = false;

function buildMyYardShelf(games, shedGames) {
  // Outer wrap so the shed line sits OUTSIDE .myyard: the board's hard
  // drop-shadow filter would ghost the toggle's text (misprint effect).
  var outer = document.createElement('div');
  outer.className = 'myyard-wrap';

  var wrap = document.createElement('div');
  wrap.className = 'myyard';
  outer.appendChild(wrap);

  var row = document.createElement('div');
  row.className = 'myyard-row';
  for (var i = 0; i < games.length; i++) {
    row.appendChild(buildMiniPlank(games[i], i));
  }
  wrap.appendChild(row);

  var board = document.createElement('div');
  board.className = 'myyard-board';
  wrap.appendChild(board);

  var tag = document.createElement('div');
  tag.className = 'pile-tag pile-tag-mine';
  tag.textContent = 'My yard';
  wrap.appendChild(tag);
  // Where these live, and how to carry one somewhere else (outside review,
  // 2026-09-06: teachers could not tell that copies are per-browser).
  if (games.length > 0) {
    var note = document.createElement('p');
    note.className = 'myyard-note';
    note.textContent = 'Your copies live in this browser. Open one and use Share for a link that works on any device.';
    outer.appendChild(note);
  }

  if (shedGames && shedGames.length > 0) {
    var shedToggle = document.createElement('button');
    shedToggle.type = 'button';
    shedToggle.className = 'shed-toggle';
    shedToggle.textContent = (shedOpen ? '▾' : '▸') + ' In the shed (' + shedGames.length + ')';
    shedToggle.setAttribute('aria-expanded', shedOpen ? 'true' : 'false');
    shedToggle.addEventListener('click', function () {
      shedOpen = !shedOpen;
      refreshLibrary();
    });
    outer.appendChild(shedToggle);

    if (shedOpen) {
      var shedRow = document.createElement('div');
      shedRow.className = 'myyard-row shed-row';
      for (var s = 0; s < shedGames.length; s++) {
        shedRow.appendChild(buildMiniPlank(shedGames[s], s));
      }
      outer.appendChild(shedRow);
    }
  }
  return outer;
}

function buildMiniPlank(game, index) {
  var plank = document.createElement('button');
  plank.type = 'button';
  plank.className = 'plank-mini plank-tone-' + (index % 8);
  plank.setAttribute('data-game-id', game.id);
  plank.setAttribute('aria-haspopup', 'dialog');
  plank.setAttribute('aria-label', game.name + ', see what it is and make it yours');
  HoverCard.attach(plank, game);

  if (Favorites.has(game.id)) {
    var fav = document.createElement('span');
    fav.className = 'plank-fav';
    fav.textContent = '♥';
    fav.setAttribute('aria-hidden', 'true');
    plank.appendChild(fav);
  }
  var name = document.createElement('span');
  name.className = 'plank-name';
  name.textContent = game.name;
  plank.appendChild(name);

  plank.addEventListener('click', function () {
    openActivityDialog(game);
  });
  return plank;
}

// The plank popup: what it is, then the doors the old card offered.
// One red action per screen: Customize while an activity is untouched
// (the customize-first funnel), Host once it has been tried. Untouched
// activities show ONLY Customize (owner call 2026-08-20) — Preview,
// Host, and the heart appear once it has been used; Delete is already
// yours/owner-only. The heart also shows when already hearted, so a
// favorited-but-untried activity can still be un-hearted.
function openActivityDialog(game) {
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal activity-dialog';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  var dlg = Dialog.enhance(overlay, modal, { title: game.name });

  var name = document.createElement('h2');
  name.className = 'activity-dialog-name';
  name.textContent = game.name;
  modal.insertBefore(name, dlg.closeBtn);

  var metaBits = [];
  if (game.playTime) metaBits.push(game.playTime);
  if (game.family === 'connection') metaBits.push('no scores, no winners');
  if (game.start === 'rolling') metaBits.push('rolling start, students begin as they arrive');
  var goals = (Array.isArray(game.tags) ? game.tags : [])
    .filter(function (t) { return GOAL_WORDS[t]; })
    .map(function (t) { return GOAL_WORDS[t]; });
  if (goals.length > 0) metaBits.push(goals.join(' · '));
  if (metaBits.length > 0) {
    var meta = document.createElement('p');
    meta.className = 'activity-dialog-meta';
    meta.textContent = metaBits.join(' · ');
    modal.appendChild(meta);
  }

  var desc = document.createElement('p');
  desc.className = 'activity-dialog-desc';
  desc.textContent = game.description || '';
  modal.appendChild(desc);

  // The treasure map: what happens, stop by stop, without reading the
  // plan or opening preview. Arrives async into this holder so the
  // actions row below never jumps out from under the mouse.
  var mapHolder = document.createElement('div');
  modal.appendChild(mapHolder);
  if (window.ActivityMap) ActivityMap.attach(game.id, mapHolder);

  var actions = document.createElement('div');
  actions.className = 'game-card-actions activity-dialog-actions';

  var rememberRecent = function () { Recents.add(game.id); };
  var canEditDirectly = (window.MyGames && MyGames.has(game.id)) ||
    (window.OwnerMode && OwnerMode.isOn());
  var touched = canEditDirectly || Recents.has(game.id);

  if (canEditDirectly) {
    var editBtn = document.createElement('a');
    editBtn.className = 'game-card-edit';
    editBtn.href = '/designer/edit?game=' + encodeURIComponent(game.id) + '&from=library';
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit "' + game.name + '"');
    editBtn.addEventListener('click', rememberRecent);
    actions.appendChild(editBtn);
  } else {
    var customizeBtn = document.createElement('button');
    customizeBtn.type = 'button';
    customizeBtn.className = 'game-card-edit' + (touched ? '' : ' game-card-customize-only');
    customizeBtn.textContent = 'Make it yours';
    customizeBtn.title = 'Make your own editable copy of this activity';
    customizeBtn.setAttribute('aria-label', 'Make a copy of "' + game.name + '" yours');
    customizeBtn.setAttribute('data-game-id', game.id);
    customizeBtn.addEventListener('click', function () {
      customizeCopy(game, customizeBtn);
    });
    actions.appendChild(customizeBtn);
  }

  if (touched) {
    var previewBtn = document.createElement('a');
    previewBtn.className = 'game-card-preview';
    previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
    previewBtn.textContent = 'Try it out';
    previewBtn.title = 'See the teacher and student screens side by side, with pretend students, no class needed';
    previewBtn.setAttribute('aria-label', 'Try out "' + game.name + '" with pretend students');
    previewBtn.addEventListener('click', rememberRecent);
    actions.appendChild(previewBtn);

    var hostBtn = document.createElement('a');
    hostBtn.className = 'game-card-host library-host';
    hostBtn.href = '/host?game=' + encodeURIComponent(game.id);
    hostBtn.textContent = '▶ Host this';
    hostBtn.title = 'Start a live room your class can join right now';
    hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
    hostBtn.addEventListener('click', rememberRecent);
    actions.appendChild(hostBtn);
  }

  var isFav = Favorites.has(game.id);
  if (touched || isFav) {
    var favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'game-card-fav' + (isFav ? ' is-fav' : '');
    favBtn.textContent = isFav ? '♥' : '♡';
    favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
    favBtn.setAttribute('aria-label', (isFav ? 'Remove "' : 'Favorite "') + game.name + '"');
    favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    favBtn.addEventListener('click', function () {
      Favorites.toggle(game.id);
      var nowFav = Favorites.has(game.id);
      favBtn.textContent = nowFav ? '♥' : '♡';
      favBtn.className = 'game-card-fav' + (nowFav ? ' is-fav' : '');
      favBtn.setAttribute('aria-pressed', nowFav ? 'true' : 'false');
      refreshLibrary(); // the plank moves piles behind the popup
    });
    actions.appendChild(favBtn);
  }

  // Share: copy a link a colleague opens to save THEIR OWN copy of this
  // activity (never this row — the import page calls /api/games/:id/copy).
  // Only your own activities; built-ins already have library links.
  if (window.MyGames && MyGames.has(game.id)) {
    var shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'game-card-share';
    shareBtn.textContent = 'Share';
    shareBtn.title = 'Copy a link another teacher can open to save their own copy';
    shareBtn.setAttribute('aria-label', 'Copy a share link for "' + game.name + '"');
    shareBtn.addEventListener('click', function () {
      copyShareLink(game.id, shareBtn);
    });
    actions.appendChild(shareBtn);
  }

  // The shed is the safe cousin of Delete: put an activity away, get it
  // back any time. Only your own copies (built-ins live in the piles, and
  // shedding one would silently do nothing).
  if (window.MyGames && MyGames.has(game.id)) {
    var inShed = Archived.has(game.id);
    var shedBtn = document.createElement('button');
    shedBtn.type = 'button';
    shedBtn.className = 'game-card-shed';
    shedBtn.textContent = inShed ? 'Take out of the shed' : 'Put in the shed';
    shedBtn.title = inShed
      ? 'Bring this back onto your yard board'
      : 'Tuck this away without deleting it, it moves under "In the shed"';
    shedBtn.setAttribute('aria-label',
      (inShed ? 'Take "' : 'Put "') + game.name + (inShed ? '" out of the shed' : '" in the shed'));
    shedBtn.addEventListener('click', function () {
      Archived.toggle(game.id);
      refreshLibrary();
      dlg.close();
    });
    actions.appendChild(shedBtn);
  }

  var canDelete = (window.MyGames && MyGames.has(game.id)) ||
    (window.OwnerMode && OwnerMode.isOn());
  if (canDelete) {
    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'game-card-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Delete this activity, this cannot be undone';
    deleteBtn.setAttribute('aria-label', 'Delete "' + game.name + '"');
    deleteBtn.addEventListener('click', function () {
      deleteOwnGame(game);
      dlg.close();
    });
    actions.appendChild(deleteBtn);
  }

  modal.appendChild(actions);
}

// Copies the share link to the clipboard; the button itself reports
// success. Same clipboard fallback ladder as the host screen's join link.
function copyShareLink(id, btn) {
  var link = location.origin + '/share/' + encodeURIComponent(id);
  var flash = function () {
    var old = btn.textContent;
    btn.textContent = 'Link copied!';
    setTimeout(function () { btn.textContent = old; }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(flash).catch(function () {
      fallbackShareCopy(link, flash);
    });
  } else {
    fallbackShareCopy(link, flash);
  }
}

function fallbackShareCopy(text, done) {
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
    // Clipboard fully blocked: show the link so it can be copied by hand.
    window.prompt('Copy this share link:', text);
  }
}

async function enterOwnerMode() {
  var ok = window.OwnerMode ? await OwnerMode.unlock() : false;
  if (ok) {
    refreshLibrary();
  } else {
    alert('That didn\'t unlock owner view, check the password and try again.');
  }
}

function exitOwnerMode() {
  if (window.OwnerMode) OwnerMode.lock();
  refreshLibrary();
}

// Owner ★ toggle: durable curation via /api/games/:id/featured — built-in
// flips persist in the Neon featured_overrides table and survive redeploys
// (the old whole-config PUT wrote to the ephemeral disk and silently
// reverted on every push).
async function toggleFeatured(game) {
  try {
    var save = await fetch('/api/games/' + encodeURIComponent(game.id) + '/featured', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: !game.featured })
    });
    if (!save.ok) {
      var saveData = {};
      try { saveData = await save.json(); } catch (e) {}
      throw new Error(saveData.error || 'save failed (status ' + save.status + ')');
    }
    var result = await save.json();
    game.featured = !!result.featured;
    refreshLibrary();
  } catch (err) {
    alert('Could not change featured: ' + err.message);
  }
}

function appendSection(headingText, games) {
  if (headingText) {
    var heading = document.createElement('h2');
    heading.className = 'games-section-heading';
    heading.textContent = headingText;
    libraryGrid.appendChild(heading);
  }
  var grid = document.createElement('div');
  grid.className = 'games-section-grid';
  for (var i = 0; i < games.length; i++) {
    grid.appendChild(buildCard(games[i]));
  }
  libraryGrid.appendChild(grid);
}

function buildCard(game) {
  var card = document.createElement('div');
  card.className = 'game-card library-card' +
    ((game.source || 'built-in') === 'user' ? ' game-card-user' : ' game-card-built-in');
  card.setAttribute('data-game-id', game.id);

  var name = document.createElement('h2');
  name.className = 'game-card-name';
  name.textContent = game.name;
  card.appendChild(name);

  var description = document.createElement('p');
  description.className = 'game-card-description';
  description.textContent = game.description || '';
  card.appendChild(description);

  var meta = document.createElement('div');
  meta.className = 'game-card-meta';
  if (game.playTime) meta.appendChild(metaBadge(game.playTime));
  card.appendChild(meta);

  if (Array.isArray(game.tags)) {
    var goals = game.tags.filter(function (t) { return GOAL_LABELS[t]; });
    if (goals.length > 0) {
      var tagsRow = document.createElement('div');
      tagsRow.className = 'game-card-tags';
      goals.forEach(function (g) {
        var chip = document.createElement('span');
        chip.className = 'game-card-tag';
        chip.textContent = GOAL_LABELS[g];
        tagsRow.appendChild(chip);
      });
      card.appendChild(tagsRow);
    }
  }

  if (game.family === 'connection') {
    var noWinner = document.createElement('div');
    noWinner.className = 'game-card-no-winner';
    noWinner.textContent = 'No scores, no winners';
    noWinner.title = 'A connection activity, the framework refuses to add points, rankings, or eliminations to it.';
    card.appendChild(noWinner);
  }

  var actions = document.createElement('div');
  actions.className = 'game-card-actions';

  var rememberRecent = function () { Recents.add(game.id); };

  // Customization is the point (play community: the players change the
  // rules). Own activities — and the owner — edit directly. Built-ins get
  // "Customize": clone into an editable copy first, because saving over a
  // shared built-in is owner-only server-side.
  var canEditDirectly = (window.MyGames && MyGames.has(game.id)) ||
    (window.OwnerMode && OwnerMode.isOn());
  // Untouched activities get ONE door: Customize, in the vermillion cut.
  // Preview and Host appear once the activity has been tried (it is in
  // recents) or is editable (yours, or owner view) — the customize flow
  // drops your copy into recents, so the copy arrives with all three.
  var touched = canEditDirectly || Recents.has(game.id);

  if (canEditDirectly) {
    var editBtn = document.createElement('a');
    editBtn.className = 'game-card-edit';
    editBtn.href = '/designer/edit?game=' + encodeURIComponent(game.id) + '&from=library';
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit "' + game.name + '"');
    editBtn.addEventListener('click', rememberRecent);
    actions.appendChild(editBtn);
  } else {
    var customizeBtn = document.createElement('button');
    customizeBtn.type = 'button';
    customizeBtn.className = 'game-card-edit' + (touched ? '' : ' game-card-customize-only');
    customizeBtn.textContent = 'Make it yours';
    customizeBtn.title = 'Make your own editable copy of this activity';
    customizeBtn.setAttribute('aria-label', 'Make a copy of "' + game.name + '" yours');
    customizeBtn.setAttribute('data-game-id', game.id);
    customizeBtn.addEventListener('click', function () {
      customizeCopy(game, customizeBtn);
    });
    actions.appendChild(customizeBtn);
  }

  if (touched) {
    // Button order is Customize/Edit, Preview, Host — a teacher meeting an
    // activity previews before hosting, so Host anchors the right edge
    // (still visually primary via its vermillion style).
    var previewBtn = document.createElement('a');
    previewBtn.className = 'game-card-preview';
    previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
    previewBtn.textContent = 'Try it out';
    previewBtn.title = 'See the teacher and student screens side by side, with pretend students, no class needed';
    previewBtn.setAttribute('aria-label', 'Try out "' + game.name + '" with pretend students');
    previewBtn.addEventListener('click', rememberRecent);
    actions.appendChild(previewBtn);

    var hostBtn = document.createElement('a');
    hostBtn.className = 'game-card-host library-host';
    hostBtn.href = '/host?game=' + encodeURIComponent(game.id);
    hostBtn.textContent = '▶ Host this';
    hostBtn.title = 'Start a live room your class can join right now';
    hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
    hostBtn.addEventListener('click', rememberRecent);
    actions.appendChild(hostBtn);
  }

  var favBtn = document.createElement('button');
  var isFav = Favorites.has(game.id);
  favBtn.type = 'button';
  favBtn.className = 'game-card-fav' + (isFav ? ' is-fav' : '');
  favBtn.textContent = isFav ? '♥' : '♡';
  favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  favBtn.setAttribute('aria-label', (isFav ? 'Remove "' : 'Favorite "') + game.name + '"');
  favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
  favBtn.addEventListener('click', function () {
    Favorites.toggle(game.id);
    refreshLibrary();
  });
  actions.appendChild(favBtn);

  // Delete for activities made on this device; owner mode can also delete
  // built-ins (mirrors the server rule — the password is required there).
  var canDelete = (window.MyGames && MyGames.has(game.id)) ||
    (window.OwnerMode && OwnerMode.isOn());
  if (canDelete) {
    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'game-card-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Delete this activity, this cannot be undone';
    deleteBtn.setAttribute('aria-label', 'Delete "' + game.name + '"');
    deleteBtn.addEventListener('click', function () {
      deleteOwnGame(game);
    });
    actions.appendChild(deleteBtn);
  }

  card.appendChild(actions);

  // Owner curation: star = shown to the public.
  if (window.OwnerMode && OwnerMode.isOn()) {
    var starBtn = document.createElement('button');
    starBtn.className = 'game-card-star' + (game.featured ? ' is-featured' : '');
    // • marks drift: the live flag differs from the repo default (an
    // override row in the DB is in effect).
    var drift = game.featuredDefault !== undefined && game.featuredDefault !== game.featured;
    starBtn.textContent = (game.featured ? '★ Featured' : '☆ Feature') + (drift ? ' •' : '');
    starBtn.title = (game.featured
      ? 'Shown to everyone, click to remove from the public list'
      : 'Hidden from visitors, click to add to the public list')
      + (drift ? ' (differs from the repo default, a saved override is in effect)' : '');
    starBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFeatured(game);
    });
    card.appendChild(starBtn);
  }

  return card;
}

async function deleteOwnGame(game) {
  if (!confirm('Delete "' + game.name + '"? This cannot be undone.')) return;
  try {
    var response = await fetch('/api/games/' + encodeURIComponent(game.id), {
      method: 'DELETE'
    });
    var result = await response.json();
    if (response.ok) {
      allGames = allGames.filter(function (g) { return g.id !== game.id; });
      MyGames.remove(game.id);
      refreshLibrary();
    } else {
      alert('Delete failed: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Delete failed: ' + error.message);
  }
}

function metaBadge(text) {
  var badge = document.createElement('span');
  badge.className = 'game-card-meta-badge';
  badge.textContent = text;
  return badge;
}

// The Make it yours flow (copy, tailor, launch) lives in
// /shared/make-it-yours.js since 2026-09-07, so the home page opens the
// same dialog in place instead of jumping here. This page hands it the
// card's button for loading feedback, and seeds its id list.
function customizeCopy(game, btn) {
  if (window.MakeItYours) MakeItYours.seedIds(allGames.map(function (g) { return g.id; }));
  MakeItYours.open(game, btn);
}

// --- Teacher setup (first visit) ------------------------------------------
// Grade band + subjects, saved on this device only (no accounts). Drives the
// "for your class" prompt picks in recipe forms and the Customize tailoring.

var setupEl = document.getElementById('teacher-setup');

function renderTeacherSetup() {
  if (!setupEl || !window.TeacherProfile) return;
  setupEl.innerHTML = '';
  if (TeacherProfile.shouldOffer()) renderSetupCard();
}

// The first-visit strip: one line of what happens here, in workflow
// order, and a way out. Slim on purpose (owner call 2026-09-02: the old
// card also asked grade and subjects; that question moved into Make it
// yours, where the answer is actually used).
function renderSetupCard() {
  var card = document.createElement('div');
  card.className = 'teacher-setup-card';

  var title = document.createElement('h2');
  title.className = 'teacher-setup-title';
  title.textContent = 'New here?';
  card.appendChild(title);

  // Icon rows in WORKFLOW ORDER (owner call 2026-08-31: choosing and
  // customizing come before projecting), one short line each (2026-08-27:
  // nobody reads the bullet wall). Marks are drawn CSS shapes, not emojis.
  var introRows = [
    { icon: 'pick', text: 'Pick an activity and make it yours.' },
    { icon: 'play', text: 'Try it out first, no class needed.' },
    { icon: 'board', text: 'Then host it, projected up front.' },
    { icon: 'code', text: 'Students join with a room code. No accounts.' }
  ];
  introRows.forEach(function (r) {
    var row = document.createElement('div');
    row.className = 'setup-intro-row';
    var mark = document.createElement('span');
    mark.className = 'su-mark su-mark-' + r.icon;
    mark.setAttribute('aria-hidden', 'true');
    row.appendChild(mark);
    var p = document.createElement('p');
    p.textContent = r.text;
    row.appendChild(p);
    card.appendChild(row);
  });

  var tail = document.createElement('div');
  tail.className = 'teacher-setup-tail';

  var guideLink = document.createElement('a');
  guideLink.className = 'teacher-setup-guide-link';
  guideLink.href = '/guide';
  guideLink.textContent = 'Teacher guide';
  tail.appendChild(guideLink);

  var gotIt = document.createElement('button');
  gotIt.type = 'button';
  gotIt.className = 'teacher-setup-skip';
  gotIt.textContent = 'Got it';
  gotIt.title = 'Hide this';
  gotIt.addEventListener('click', function () {
    TeacherProfile.dismiss();
    renderTeacherSetup();
  });
  tail.appendChild(gotIt);

  card.appendChild(tail);
  setupEl.appendChild(card);
}

renderTeacherSetup();

// --- Builder doorway ------------------------------------------------------
// Straight to the Create page — its idea box asks the question once (the
// old intermediate dialog asked it twice; teacher's call 2026-08-07). The
// builder-request signal still files quietly on the way.

document.getElementById('build-your-own-btn').addEventListener('click', function () {
  try { localStorage.setItem('lanyard-builder', '1'); } catch (e) {}
  // Best-effort signal — never block the teacher on it.
  fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: '/library',
      category: 'builder-request',
      message: 'Opened the designer from the yard.'
    })
  }).catch(function () {}).finally(function () {
    window.location.href = '/designer';
  });
});

// --- Load ---------------------------------------------------------------

var searchEl = document.getElementById('library-search');
searchEl.addEventListener('input', function () {
  libraryQuery = searchEl.value.trim().toLowerCase();
  refreshLibrary();
});

// ?q= deep link: land on the library with a search already applied.
try {
  var urlQuery = new URLSearchParams(window.location.search).get('q');
  if (urlQuery) {
    searchEl.value = urlQuery;
    libraryQuery = urlQuery.trim().toLowerCase();
  }
} catch (e) { /* URL parsing unavailable — search box still works */ }

// /owner lands here as ?owner=1 — the only doorway into owner view (the old
// in-page link confused teachers). Strip the param so a refresh doesn't
// re-prompt for the password.
try {
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('owner') === '1') {
    urlParams.delete('owner');
    var cleaned = window.location.pathname +
      (urlParams.toString() ? '?' + urlParams.toString() : '');
    window.history.replaceState(null, '', cleaned);
    if (!(window.OwnerMode && OwnerMode.isOn())) enterOwnerMode();
  }
} catch (e) { /* URL parsing unavailable — owner view still reachable later */ }

// ?customize= deep link (the designer's concierge points here): open the
// Customize flow for that activity once the library knows its games. The
// param is stripped first so a refresh lands on the plain library.
function handleCustomizeDeepLink() {
  var wantedId;
  try {
    var params = new URLSearchParams(window.location.search);
    wantedId = params.get('customize');
    if (!wantedId) return;
    params.delete('customize');
    window.history.replaceState(null, '', window.location.pathname +
      (params.toString() ? '?' + params.toString() : ''));
  } catch (e) { return; }
  var game = null;
  for (var i = 0; i < allGames.length; i++) {
    if (allGames[i].id === wantedId) { game = allGames[i]; break; }
  }
  if (!game) return; // unknown id — the teacher still has the full library
  // Own activities (and the owner) edit directly, same as the card.
  var canEditDirectly = (window.MyGames && MyGames.has(game.id)) ||
    (window.OwnerMode && OwnerMode.isOn());
  if (canEditDirectly) {
    window.location.href = '/designer/edit?game=' + encodeURIComponent(game.id) + '&from=library';
    return;
  }
  // Reuse the card's own button for loading feedback when it's on screen;
  // a detached one keeps the flow working if the card is filtered out.
  var btn = document.querySelector('.game-card-edit[data-game-id="' + game.id + '"]') ||
    document.createElement('button');
  customizeCopy(game, btn);
}

// ?about= deep link (the home carousel points here): open the activity
// popup, exactly as if its plank had been clicked, once the library knows
// its games. The param is stripped first so a refresh lands on the plain
// library. Landing straight in Customize skipped the "what is this?" step
// (observation 2026-08-27).
function handleAboutDeepLink() {
  var wantedId;
  try {
    var params = new URLSearchParams(window.location.search);
    wantedId = params.get('about');
    if (!wantedId) return;
    params.delete('about');
    window.history.replaceState(null, '', window.location.pathname +
      (params.toString() ? '?' + params.toString() : ''));
  } catch (e) { return; }
  for (var i = 0; i < allGames.length; i++) {
    if (allGames[i].id === wantedId) {
      openActivityDialog(allGames[i]);
      return; // unknown id falls through to the full library
    }
  }
}

// ?highlight= (where the editor's Back-to-Library link lands): scroll the
// activity's card into view and flash it so the teacher sees where their
// activity lives — Preview and Host are right on it. Param stripped so a
// refresh lands on the plain library.
function handleHighlightParam() {
  var wantedId;
  try {
    var params = new URLSearchParams(window.location.search);
    wantedId = params.get('highlight');
    if (!wantedId) return;
    params.delete('highlight');
    window.history.replaceState(null, '', window.location.pathname +
      (params.toString() ? '?' + params.toString() : ''));
  } catch (e) { return; }
  var piece = document.querySelector('.yard-card[data-game-id="' + CSS.escape(wantedId) + '"]') ||
    document.querySelector('.plank[data-game-id="' + CSS.escape(wantedId) + '"]') ||
    document.querySelector('.plank-mini[data-game-id="' + CSS.escape(wantedId) + '"]') ||
    document.querySelector('.library-card[data-game-id="' + CSS.escape(wantedId) + '"]');
  if (!piece) return; // filtered out or unknown — the library itself is the fallback
  piece.scrollIntoView({ block: 'center' });
  piece.classList.add('game-card-highlight');
}

fetch('/api/games')
  .then(function (resp) {
    if (!resp.ok) throw new Error('status ' + resp.status);
    return resp.json();
  })
  .then(function (data) {
    allGames = data.games || [];
    loadingMessage.hidden = true;
    refreshLibrary();
    handleCustomizeDeepLink();
    handleAboutDeepLink();
    handleHighlightParam();
  })
  .catch(function (err) {
    loadingMessage.hidden = true;
    errorMessage.textContent = 'Could not load the yard: ' + err.message;
    errorMessage.hidden = false;
  });

// Speak instead of typing — search box, the build-your-own note, feedback:
// every text box (current and future-rendered) carries the corner mic.
if (window.Speech) Speech.autoAttach();
