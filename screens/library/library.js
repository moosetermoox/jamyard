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

// Six piles (Totem: 10d + popup): three personal shelves, then the three
// broad goal piles. Placement precedence differs from display order: your
// own copies always live in CUSTOMIZED, hearts beat recency, and each
// activity stands in exactly one pile.
var PILE_GROUPS = [
  { key: 'recent', label: 'Recent' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'customized', label: 'Yours' },
  { key: 'connect', label: 'Connect', goals: ['connect'] },
  { key: 'think', label: 'Think', goals: ['discuss', 'decide', 'reflect', 'review'] },
  { key: 'play', label: 'Play', goals: ['create', 'energize'] }
];

var GOAL_TO_GROUP = {
  connect: 'connect',
  discuss: 'think', decide: 'think', reflect: 'think', review: 'think',
  create: 'play', energize: 'play'
};

// The popup reads the same plain words (kept as an alias since the emoji
// labels retired, 2026-08-20).
var GOAL_WORDS = GOAL_LABELS;

function goalGroupOf(game) {
  var tags = Array.isArray(game.tags) ? game.tags : [];
  for (var i = 0; i < tags.length; i++) {
    if (GOAL_TO_GROUP[tags[i]]) return GOAL_TO_GROUP[tags[i]];
  }
  return 'think';
}

var allGames = [];
var libraryQuery = '';
var activeGoal = null; // a PILE_GROUPS goal key: connect | think | play

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
  if (typeof hideHoverCard === 'function') hideHoverCard();
  var visible = applyVisibility(allGames);
  document.getElementById('library-controls').hidden = visible.length === 0;
  buildGoalChips(visible);
  var filtered = visible.filter(matchesFilters);
  // Subject-search rescue (2026-08-08 field test): the activities are
  // topic-agnostic shells, so "history" matching nothing is our failure to
  // explain, not a real empty result. Show the shelf anyway (goal filter
  // still respected) with an honest note instead of a dead end.
  if (filtered.length === 0 && libraryQuery && visible.length > 0) {
    var goalOnly = visible.filter(matchesGoal);
    renderLibrary(goalOnly.length ? goalOnly : visible, libraryQuery);
    return;
  }
  renderLibrary(filtered);
}

function renderLibrary(games, rescueQuery) {
  libraryGrid.innerHTML = '';

  if (rescueQuery) {
    var rescue = document.createElement('div');
    rescue.className = 'search-rescue';
    var rescueHead = document.createElement('p');
    rescueHead.className = 'search-rescue-head';
    rescueHead.textContent = 'Nothing is named "' + rescueQuery + '", and that\'s okay:';
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
  // three yard piles with their painted labels below. Each activity
  // stands in exactly one place; placement precedence: yours → hearted →
  // recently used → home goal pile.
  var piles = { recent: [], favorites: [], customized: [], connect: [], think: [], play: [] };
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

  var shelf = document.createElement('div');
  shelf.className = 'pile-shelf';
  ['connect', 'think', 'play'].forEach(function (key) {
    if (piles[key].length === 0) return;
    var group = null;
    for (var i = 0; i < PILE_GROUPS.length; i++) {
      if (PILE_GROUPS[i].key === key) { group = PILE_GROUPS[i]; break; }
    }
    shelf.appendChild(buildPileGroup(key, group.label, piles[key]));
  });
  libraryGrid.appendChild(shelf);
}

// A yard pile (Totem 9g): up to 6 chunky planks on a single plinth with
// the painted label BELOW. Bigger piles collapse behind a "+ N MORE"
// plank so the yard keeps its three-totem silhouette.
var PILE_MAX = 6;
var expandedPiles = {};

// Each pile starts its paint cycle somewhere else, so the three piles
// never share the same top color.
var PILE_TONE_OFFSET = { connect: 0, think: 3, play: 6 };

function buildPileGroup(key, label, games) {
  var group = document.createElement('div');
  group.className = 'pile-group';

  var pile = document.createElement('div');
  pile.className = 'pile';

  var collapsed = games.length > PILE_MAX && !expandedPiles[key];
  var list = collapsed ? games.slice(0, PILE_MAX) : games;
  for (var i = 0; i < list.length; i++) {
    // The row wrapper, not the plank, takes the hover: it never moves
    // or clips, so the pulled-out plank cannot jitter at the seams.
    var row = document.createElement('div');
    row.className = 'plank-row';
    row.appendChild(buildPlank(list[i], i + (PILE_TONE_OFFSET[key] || 0)));
    pile.appendChild(row);
  }

  if (games.length > PILE_MAX) {
    var moreRow = document.createElement('div');
    moreRow.className = 'plank-row';
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'plank plank-more';
    var hiddenCount = games.length - PILE_MAX;
    more.textContent = collapsed ? '+ ' + hiddenCount + ' more' : 'show fewer';
    more.setAttribute('aria-label', collapsed
      ? 'Show ' + hiddenCount + ' more ' + label + ' activities'
      : 'Show fewer ' + label + ' activities');
    more.addEventListener('click', function () {
      expandedPiles[key] = collapsed;
      refreshLibrary();
    });
    moreRow.appendChild(more);
    pile.appendChild(moreRow);
  }

  var plinth = document.createElement('div');
  plinth.className = 't-plinth pile-plinth';
  pile.appendChild(plinth);
  group.appendChild(pile);

  var tag = document.createElement('div');
  tag.className = 'pile-tag pile-tag-' + key;
  tag.textContent = label;
  group.appendChild(tag);
  return group;
}

// ── Hover card: what the activity is, without the click ──
// Planks carry only a name; teachers were opening popup after popup just
// to read descriptions (observation 2026-08-27). Rest the mouse on a
// plank and one shared floating card shows the description. Pointer-only
// on purpose: keyboard and touch users get the same words in the popup.
var hoverCard = null;
var hoverCardTimer = null;

function ensureHoverCard() {
  if (hoverCard) return hoverCard;
  hoverCard = document.createElement('div');
  hoverCard.id = 'plank-hovercard';
  hoverCard.setAttribute('aria-hidden', 'true');
  hoverCard.hidden = true;
  hoverCard.appendChild(document.createElement('div')).className = 'hovercard-name';
  hoverCard.appendChild(document.createElement('div')).className = 'hovercard-meta';
  hoverCard.appendChild(document.createElement('div')).className = 'hovercard-desc';
  document.body.appendChild(hoverCard);
  return hoverCard;
}

function hideHoverCard() {
  clearTimeout(hoverCardTimer);
  if (hoverCard) hoverCard.hidden = true;
}

function attachHoverCard(plank, game) {
  plank.addEventListener('mouseenter', function () {
    clearTimeout(hoverCardTimer);
    // A beat of delay so sweeping the mouse across the yard doesn't
    // flash a card per plank.
    hoverCardTimer = setTimeout(function () {
      var card = ensureHoverCard();
      card.querySelector('.hovercard-name').textContent = game.name;
      var metaBits = [];
      if (game.playTime) metaBits.push(game.playTime);
      if (game.family === 'connection') metaBits.push('no scores, no winners');
      var metaEl = card.querySelector('.hovercard-meta');
      metaEl.textContent = metaBits.join(' · ');
      metaEl.hidden = metaBits.length === 0;
      card.querySelector('.hovercard-desc').textContent = game.description || '';
      card.hidden = false;
      // Below the plank, clamped to the window; flip above when the
      // plank sits near the bottom edge.
      var r = plank.getBoundingClientRect();
      var cw = card.offsetWidth;
      var ch = card.offsetHeight;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - cw - 8));
      var top = r.bottom + 8;
      if (top + ch > window.innerHeight - 8) top = Math.max(8, r.top - ch - 8);
      card.style.left = left + 'px';
      card.style.top = top + 'px';
    }, 220);
  });
  plank.addEventListener('mouseleave', hideHoverCard);
  plank.addEventListener('click', hideHoverCard);
}

// One plank per activity (9g): CAPS name over a small meta line, painted
// by position. Clicking opens the activity popup; every card action
// lives there.
function buildPlank(game, index) {
  var plank = document.createElement('button');
  plank.type = 'button';
  plank.className = 'plank plank-tone-' + (index % 8);
  plank.setAttribute('data-game-id', game.id);
  plank.setAttribute('aria-haspopup', 'dialog');
  plank.setAttribute('aria-label', game.name + ', see what it is and make it yours');
  // No native title: the hover card carries the description instead (a
  // browser tooltip on top of it would double up).
  attachHoverCard(plank, game);

  var top = document.createElement('span');
  top.className = 'plank-top';
  if (Favorites.has(game.id)) {
    var fav = document.createElement('span');
    fav.className = 'plank-fav';
    fav.textContent = '♥';
    fav.setAttribute('aria-hidden', 'true');
    top.appendChild(fav);
  }
  var name = document.createElement('span');
  name.className = 'plank-name';
  name.textContent = game.name;
  top.appendChild(name);
  plank.appendChild(top);

  var metaBits = [];
  if (game.playTime) {
    // Planks carry the short time only; parentheticals live in the popup.
    metaBits.push(String(game.playTime).split('(')[0].trim());
  }
  if (game.family === 'connection') metaBits.push('no winners');
  if (metaBits.length > 0) {
    var meta = document.createElement('span');
    meta.className = 'plank-meta';
    meta.textContent = metaBits.join(' · ');
    plank.appendChild(meta);
  }

  plank.addEventListener('click', function () {
    openActivityDialog(game);
  });
  return plank;
}

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
  attachHoverCard(plank, game);

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
    previewBtn.textContent = 'Simulate';
    previewBtn.title = 'See the teacher and student screens side by side, with practice players, no class needed';
    previewBtn.setAttribute('aria-label', 'Simulate "' + game.name + '" with practice players');
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
    previewBtn.textContent = 'Simulate';
    previewBtn.title = 'See the teacher and student screens side by side, with practice players, no class needed';
    previewBtn.setAttribute('aria-label', 'Simulate "' + game.name + '" with practice players');
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

// Clone a built-in into this teacher's own editable copy, then open the
// editor on it. The copy is device-scoped like any user creation.
// Save a finished copy config as this device's activity and open the editor.
// Save the teacher's copy, then go where they said: the designer (Simple
// view), the simulator, or a live host room (`dest`, see COPY_DOORS).
function saveCopyAndReturn(config, dest) {
  delete config.featured; // the copy is yours, not the public front door's
  var base = (config.name || 'my-activity').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 40) || 'my-activity';
  var existing = allGames.map(function (g) { return g.id; });
  var copyId = base;
  var counter = 2;
  while (existing.indexOf(copyId) !== -1) { copyId = base + '-' + counter; counter++; }
  return fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: copyId, config: config })
  }).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return {}; }).then(function (d) {
        throw new Error(d.error || 'save failed');
      });
    }
    if (window.MyGames) MyGames.add(copyId);
    Recents.add(copyId);
    window.location.href = copyDestinationUrl(dest, copyId);
  });
}

// The three doors at the bottom of every Make it yours dialog (owner's
// call 2026-09-02): once the copy is shaped, keep shaping it in the
// designer, watch it run in the simulator, or host it right now. Equal
// weight, three paints (owner's call): the row's CSS colors each door by
// its door-<dest> class. One pick handler receives the destination.
var COPY_DOORS = [
  { dest: 'designer', label: 'Continue setup in the designer',
    title: 'Save your copy and open it in the editor' },
  { dest: 'simulate', label: 'See it in the simulator',
    title: 'Save your copy and watch it run with practice players, no class needed' },
  { dest: 'host', label: 'Host it now',
    title: 'Save your copy and start a live room your class can join right now' }
];

function makeItYoursDoors(onPick) {
  var row = document.createElement('div');
  row.className = 'recipe-form-buttons make-it-yours-doors';
  row.style.marginTop = '14px';
  var buttons = COPY_DOORS.map(function (door) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recipe-create-btn door-' + door.dest;
    btn.textContent = door.label;
    btn.title = door.title;
    btn.addEventListener('click', function () { onPick(door.dest); });
    row.appendChild(btn);
    return btn;
  });
  return {
    row: row,
    setDisabled: function (flag) {
      buttons.forEach(function (b) { b.disabled = !!flag; });
    }
  };
}

// Where a finished copy (or, untouched, the original) goes next.
function copyDestinationUrl(dest, id) {
  var q = encodeURIComponent(id);
  if (dest === 'simulate') return '/prototype?game=' + q;
  if (dest === 'host') return '/host?game=' + q;
  return '/designer/edit?game=' + q + '&from=library';
}

// Open the editor on a copy WITHOUT saving it: the config rides over in
// sessionStorage and the editor persists it on the first real edit. Used
// by the zero-interaction Customize path, where the teacher hasn't chosen
// anything yet; the dialog paths (answers, knobs, quiz/bluff panels) keep
// saving eagerly because filling those in IS editing.
function openDraftCopy(config) {
  delete config.featured; // the copy is yours, not the public front door's
  try {
    sessionStorage.setItem('lanyard-pending-copy', JSON.stringify(config));
  } catch (e) {
    // Storage unavailable (private mode quota): fall back to the old
    // save-first flow rather than losing the Customize click.
    return saveCopyAndReturn(config);
  }
  window.location.href = '/designer/edit?draft=copy&from=library';
}

// Recompile a recipe-born config with new params. The source config's
// card metadata (name, description, tags...) always wins; phases, the
// provenance stamp, and family come from the fresh compile. Rejects with
// the first compile diagnostic so dialogs can show it as-is.
function compileWorkingConfig(config, params) {
  return fetch('/api/recipes/' + encodeURIComponent(config.recipe.id) + '/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: params })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok || !d.config) {
        var diag = d.diagnostics && d.diagnostics[0] && d.diagnostics[0].message;
        throw new Error(diag || d.error || 'could not apply your settings');
      }
      var working = {};
      Object.keys(config).forEach(function (k) { working[k] = config[k]; });
      working.phases = d.config.phases;
      working.recipe = d.config.recipe;
      if (d.config.family != null) working.family = d.config.family;
      return working;
    });
  });
}

// The quiz Customize panel (recipes with setupPanel:"quiz", e.g. Speed
// Quiz): the questions ARE the content, so instead of the generic
// words-tailoring interview the teacher gets the actual question list,
// editable in place, plus a topic box that has the AI write fresh ones.
// Every question shows its ✓ answer; nothing is saved until the teacher
// has the list in front of them (the wrong-facts review gate).
function showQuizCustomizeDialog(game, config, recipeSummary) {
  var stamp = config.recipe;
  var questions = JSON.parse(JSON.stringify(stamp.params.questions || []));
  var paceKnobs = SetupKnobs.knobsFor(recipeSummary, stamp).filter(function (k) {
    return k.kind !== 'count'; // the visible list IS the count
  });

  var LABEL_CSS = 'display:block; font-weight:700; margin:12px 0 6px; font-family:"DM Sans", Arial, sans-serif; color:#2A2620;';
  var INPUT_CSS = 'padding:9px 12px 7px; border:none; background:#EAD9BA; background-image:repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px); border-bottom:3px dashed rgba(110,75,40,0.45); font-family:"DM Sans", Arial, sans-serif; font-size:0.95rem; font-weight:500; color:#2A2620; box-sizing:border-box;';

  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '640px';
  modal.style.maxHeight = '88vh';
  modal.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Your copy of “' + game.name + '”. Keep these questions, adjust them, or have new ones written for your topic.';
  modal.appendChild(subtitle);
  renderClassPicker(modal);

  // --- Topic row: AI writes fresh questions ---
  var topicLabel = document.createElement('label');
  topicLabel.style.cssText = LABEL_CSS;
  topicLabel.textContent = 'Want new questions? Give a topic:';
  modal.appendChild(topicLabel);

  var topicRow = document.createElement('div');
  topicRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  var topicInput = GrowingText.create({
    css: 'flex:1; min-width:200px; ' + INPUT_CSS,
    placeholder: 'e.g. fractions, the water cycle, Spanish past tense'
  });
  topicRow.appendChild(topicInput);

  var countLabel = document.createElement('label');
  countLabel.style.cssText = 'font-weight:700; font-family:"DM Sans", Arial, sans-serif; white-space:nowrap;';
  countLabel.textContent = 'How many:';
  topicRow.appendChild(countLabel);
  var countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = 1;
  countInput.max = 20;
  countInput.value = Math.max(1, questions.length);
  countInput.style.cssText = 'width:70px; ' + INPUT_CSS;
  topicRow.appendChild(countInput);

  var writeBtn = document.createElement('button');
  writeBtn.type = 'button';
  writeBtn.className = 'recipe-cancel-btn';
  writeBtn.textContent = 'Write my questions';
  topicRow.appendChild(writeBtn);
  modal.appendChild(topicRow);

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '10px';
  status.hidden = true;
  modal.appendChild(status);

  // --- The question list, always visible and editable ---
  var listHeading = document.createElement('p');
  listHeading.className = 'template-picker-subtitle';
  listHeading.style.fontWeight = '800';
  listHeading.style.marginTop = '14px';
  modal.appendChild(listHeading);

  var listHint = document.createElement('p');
  listHint.className = 'template-picker-subtitle';
  listHint.textContent = 'Check every answer. Tap ○ to mark the right choice, ✕ to drop one.';
  modal.appendChild(listHint);

  var listWrap = document.createElement('div');
  listWrap.style.cssText = 'max-height:320px; overflow-y:auto; padding-right:4px; margin-top:6px;';
  modal.appendChild(listWrap);

  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'recipe-cancel-btn';
  addBtn.textContent = '+ Add a question';
  addBtn.style.marginTop = '8px';
  addBtn.addEventListener('click', function () {
    if (questions.length >= 20) return;
    questions.push({ question: '', choices: ['', '', '', ''], correct: '' });
    renderQuestions();
    var inputs = listWrap.querySelectorAll('[data-role="question"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });
  modal.appendChild(addBtn);

  function renderQuestions() {
    listWrap.textContent = '';
    listHeading.textContent = 'The questions (' + questions.length + '):';
    addBtn.disabled = questions.length >= 20;
    questions.forEach(function (q, qi) {
      var card = document.createElement('div');
      card.style.cssText = 'background:#FDF9F0; box-shadow: 0 2px 3px rgba(50,35,15,0.16); padding:10px 12px; margin-bottom:10px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';
      var headText = document.createElement('strong');
      headText.style.cssText = 'font-family:"DM Sans", Arial, sans-serif; flex:1;';
      headText.textContent = 'Question ' + (qi + 1);
      head.appendChild(headText);
      var qRemove = document.createElement('button');
      qRemove.type = 'button';
      qRemove.textContent = '✕';
      qRemove.title = 'Drop this question';
      qRemove.setAttribute('aria-label', 'Drop question ' + (qi + 1));
      qRemove.style.cssText = 'border:none; background:none; cursor:pointer; font-size:1rem; font-weight:800; color:#221E1C; opacity:0.6;';
      qRemove.addEventListener('click', function () {
        questions.splice(qi, 1);
        renderQuestions();
      });
      head.appendChild(qRemove);
      card.appendChild(head);

      var qInput = GrowingText.create({
        css: 'width:100%; margin-bottom:6px; ' + INPUT_CSS,
        value: q.question || '',
        placeholder: 'The question',
        maxLength: 300
      });
      qInput.setAttribute('data-role', 'question');
      qInput.addEventListener('input', function () { q.question = qInput.value; });
      card.appendChild(qInput);

      q.choices.forEach(function (choice, ci) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:4px;';

        var mark = document.createElement('button');
        mark.type = 'button';
        var isCorrect = choice !== '' && q.correct === choice;
        mark.textContent = isCorrect ? '✓' : '○';
        mark.title = isCorrect ? 'The correct answer' : 'Mark as the correct answer';
        mark.setAttribute('aria-label', 'Mark choice ' + (ci + 1) + ' of question ' + (qi + 1) + ' as correct');
        mark.style.cssText = 'border:none; background:none; cursor:pointer; font-size:1.05rem; font-weight:800; width:26px; color:' + (isCorrect ? '#1B7F3B' : '#221E1C') + '; opacity:' + (isCorrect ? '1' : '0.45') + ';';
        mark.addEventListener('click', function () {
          q.correct = q.choices[ci];
          renderQuestions();
        });
        row.appendChild(mark);

        var cInput = GrowingText.create({
          css: 'flex:1; ' + INPUT_CSS,
          value: choice,
          placeholder: 'Choice ' + (ci + 1),
          maxLength: 200
        });
        cInput.addEventListener('input', function () {
          // Editing the marked choice keeps the ✓ on it (blank rows are
          // never silently marked: '' matches every other blank).
          if (q.choices[ci] !== '' && q.correct === q.choices[ci]) q.correct = cInput.value;
          q.choices[ci] = cInput.value;
        });
        row.appendChild(cInput);

        if (q.choices.length > 2) {
          var cRemove = document.createElement('button');
          cRemove.type = 'button';
          cRemove.textContent = '✕';
          cRemove.title = 'Drop this choice';
          cRemove.setAttribute('aria-label', 'Drop choice ' + (ci + 1) + ' of question ' + (qi + 1));
          cRemove.style.cssText = 'border:none; background:none; cursor:pointer; font-weight:800; color:#221E1C; opacity:0.4;';
          cRemove.addEventListener('click', function () {
            if (q.correct === q.choices[ci]) q.correct = '';
            q.choices.splice(ci, 1);
            renderQuestions();
          });
          row.appendChild(cRemove);
        }
        card.appendChild(row);
      });

      if (q.choices.length < 6) {
        var addChoice = document.createElement('button');
        addChoice.type = 'button';
        addChoice.textContent = '+ choice';
        addChoice.style.cssText = 'border:none; background:none; cursor:pointer; font-family:"DM Sans", Arial, sans-serif; font-weight:700; color:#221E1C; opacity:0.6; padding:2px 0 0 32px;';
        addChoice.addEventListener('click', function () {
          q.choices.push('');
          renderQuestions();
        });
        card.appendChild(addChoice);
      }

      listWrap.appendChild(card);
    });
  }
  renderQuestions();

  // --- Pace knobs (timer, speed bonus) ---
  var knobInputs = [];
  paceKnobs.forEach(function (knob) {
    if (knob.kind === 'boolean') {
      var boolLabel = document.createElement('label');
      boolLabel.style.cssText = LABEL_CSS + ' cursor:pointer;';
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = knob.value === true;
      check.style.cssText = 'margin-right:8px; width:18px; height:18px; vertical-align:middle;';
      boolLabel.appendChild(check);
      boolLabel.appendChild(document.createTextNode(knob.label));
      if (knob.helper) boolLabel.title = knob.helper;
      modal.appendChild(boolLabel);
      knobInputs.push({ knob: knob, getValue: function (el) {
        return function () { return el.checked; };
      }(check) });
    } else {
      var numLabel = document.createElement('label');
      numLabel.style.cssText = LABEL_CSS;
      numLabel.textContent = knob.label +
        (knob.min != null && knob.max != null ? ' (' + knob.min + '–' + knob.max + ')' : '');
      if (knob.helper) numLabel.title = knob.helper;
      modal.appendChild(numLabel);
      var num = document.createElement('input');
      num.type = 'number';
      if (knob.min != null) num.min = knob.min;
      if (knob.max != null) num.max = knob.max;
      num.value = knob.value;
      num.style.cssText = 'width:120px; ' + INPUT_CSS;
      modal.appendChild(num);
      knobInputs.push({ knob: knob, getValue: function (el, k) {
        return function () {
          var n = parseInt(el.value, 10);
          if (isNaN(n)) return k.value;
          if (k.min != null && n < k.min) n = k.min;
          if (k.max != null && n > k.max) n = k.max;
          return n;
        };
      }(num, knob) });
    }
  });

  // --- Actions: the three doors (makeCopy below gets the pick) ---
  var doors = makeItYoursDoors(makeCopy);
  modal.appendChild(doors.row);

  function showStatus(text) {
    status.hidden = false;
    status.textContent = text;
  }

  // Trim question rows the way the save will see them: empty choices
  // fall away, everything trimmed.
  function cleanedList() {
    return questions.map(function (q) {
      var choices = q.choices.map(function (c) { return String(c).trim(); })
        .filter(function (c) { return c.length > 0; });
      return {
        question: String(q.question || '').trim(),
        choices: choices,
        correct: String(q.correct || '').trim()
      };
    });
  }

  writeBtn.addEventListener('click', function () {
    var topic = topicInput.value.trim();
    if (topic.length < 3) {
      showStatus('Give a topic first, a few words is plenty.');
      topicInput.focus();
      return;
    }
    var n = parseInt(countInput.value, 10);
    if (isNaN(n) || n < 1) n = 5;
    if (n > 20) n = 20;
    writeBtn.disabled = true;
    doors.setDisabled(true);
    writeBtn.textContent = 'Writing…';
    showStatus('Writing ' + n + ' questions about "' + topic + '", this can take ~20 seconds.');
    fetch('/api/games/quiz-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        count: n,
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : ''
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok || result.data.error || !Array.isArray(result.data.questions)) {
          throw new Error(result.data.error || 'no questions came back');
        }
        questions = result.data.questions;
        renderQuestions();
        showStatus('Check every answer before you save, fix or drop anything that looks wrong.');
        listWrap.scrollTop = 0;
      })
      .catch(function (err) {
        showStatus('Could not write questions: ' + err.message);
      })
      .then(function () {
        writeBtn.disabled = false;
        doors.setDisabled(false);
        writeBtn.textContent = 'Write my questions';
      });
  });

  function makeCopy(dest) {
    var cleaned = cleanedList();
    var problems = SetupKnobs.validateQuizList(cleaned);
    if (problems.length > 0) {
      showStatus(problems.slice(0, 2).join(' '));
      return;
    }
    doors.setDisabled(true);
    writeBtn.disabled = true;
    showStatus('Building your copy…');
    var params = JSON.parse(JSON.stringify(stamp.params));
    params.questions = cleaned;
    knobInputs.forEach(function (ki) { params[ki.knob.name] = ki.getValue(); });
    compileWorkingConfig(config, params)
      .then(function (working) {
        working.name = game.name + ' (my version)';
        return saveCopyAndReturn(working, dest);
      })
      .catch(function (err) {
        doors.setDisabled(false);
        writeBtn.disabled = false;
        showStatus('Could not make your copy: ' + err.message);
      });
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
  topicInput.focus();
}

// The bluff Customize panel (recipes with setupPanel:"bluff", Trivia
// Bluff): where do the facts come from? Three doors: the AI finds facts
// live during the game (the classic), the AI writes a reviewable list
// now, or the teacher writes their own. The two prepared doors share one
// editable fact list; nothing is saved until the teacher has the list in
// front of them (the wrong-facts review gate, same as the quiz panel).
function showBluffCustomizeDialog(game, config, recipeSummary) {
  var stamp = config.recipe;
  var questions = JSON.parse(JSON.stringify(stamp.params.questions || []));
  var knobs = SetupKnobs.knobsFor(recipeSummary, stamp);
  var roundsKnob = null;
  var lieTimerKnob = null;
  knobs.forEach(function (k) {
    if (k.name === 'rounds') roundsKnob = k;
    if (k.name === 'lieTimer') lieTimerKnob = k;
  });

  var LABEL_CSS = 'display:block; font-weight:700; margin:12px 0 6px; font-family:"DM Sans", Arial, sans-serif; color:#2A2620;';
  var INPUT_CSS = 'padding:9px 12px 7px; border:none; background:#EAD9BA; background-image:repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px); border-bottom:3px dashed rgba(110,75,40,0.45); font-family:"DM Sans", Arial, sans-serif; font-size:0.95rem; font-weight:500; color:#2A2620; box-sizing:border-box;';

  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '640px';
  modal.style.maxHeight = '88vh';
  modal.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Your copy of “' + game.name + '”. Choose where the fill-in-the-blank facts come from.';
  modal.appendChild(subtitle);
  renderClassPicker(modal);

  // --- The three source doors ---
  var SOURCES = [
    {
      id: 'live',
      title: 'AI picks facts during the game',
      detail: 'Fresh obscure facts every time you play. You see each fact when the class does.'
    },
    {
      id: 'ai-now',
      title: 'AI writes the facts now',
      detail: 'Give a topic, get a fact list you can check and edit before class.'
    },
    {
      id: 'own',
      title: 'I write my own facts',
      detail: 'Fill-in-the-blank facts with the real answer, written by you.'
    }
  ];
  var selectedSource = (stamp.params.questionSource === 'prepared' && questions.length > 0)
    ? 'own' : 'live';

  var sourceRow = document.createElement('div');
  sourceRow.setAttribute('role', 'radiogroup');
  sourceRow.setAttribute('aria-label', 'Where the facts come from');
  sourceRow.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-top:10px;';
  var sourceButtons = {};
  SOURCES.forEach(function (src) {
    var card = document.createElement('button');
    card.type = 'button';
    card.setAttribute('role', 'radio');
    card.style.cssText = 'text-align:left; cursor:pointer; border:none; background:#FDF9F0; box-shadow: 0 2px 3px rgba(50,35,15,0.18); padding:10px 12px; font-family:"DM Sans", Arial, sans-serif;';
    var cardTitle = document.createElement('strong');
    cardTitle.textContent = src.title;
    card.appendChild(cardTitle);
    var cardDetail = document.createElement('span');
    cardDetail.style.cssText = 'display:block; font-weight:600; opacity:0.75; font-size:0.9rem; margin-top:2px;';
    cardDetail.textContent = src.detail;
    card.appendChild(cardDetail);
    card.addEventListener('click', function () {
      selectedSource = src.id;
      renderSourceState();
    });
    sourceButtons[src.id] = card;
    sourceRow.appendChild(card);
  });
  modal.appendChild(sourceRow);

  // --- Live section: how many rounds ---
  var liveSection = document.createElement('div');
  var roundsLabel = document.createElement('label');
  roundsLabel.style.cssText = LABEL_CSS;
  roundsLabel.textContent = (roundsKnob ? roundsKnob.label : 'How many rounds') +
    (roundsKnob && roundsKnob.min != null ? ' (' + roundsKnob.min + '–' + roundsKnob.max + ')' : '');
  if (roundsKnob && roundsKnob.helper) roundsLabel.title = roundsKnob.helper;
  liveSection.appendChild(roundsLabel);
  var roundsInput = document.createElement('input');
  roundsInput.type = 'number';
  roundsInput.min = roundsKnob && roundsKnob.min != null ? roundsKnob.min : 1;
  roundsInput.max = roundsKnob && roundsKnob.max != null ? roundsKnob.max : 6;
  roundsInput.value = roundsKnob ? roundsKnob.value : 3;
  roundsInput.style.cssText = 'width:120px; ' + INPUT_CSS;
  liveSection.appendChild(roundsInput);
  modal.appendChild(liveSection);

  // --- Topic section (AI writes now) ---
  var topicSection = document.createElement('div');
  var topicLabel = document.createElement('label');
  topicLabel.style.cssText = LABEL_CSS;
  topicLabel.textContent = 'What should the facts be about?';
  topicSection.appendChild(topicLabel);
  var topicRow = document.createElement('div');
  topicRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  var topicInput = GrowingText.create({
    css: 'flex:1; min-width:200px; ' + INPUT_CSS,
    placeholder: 'e.g. ocean animals, ancient Rome, anything surprising'
  });
  topicRow.appendChild(topicInput);
  var countLabel = document.createElement('label');
  countLabel.style.cssText = 'font-weight:700; font-family:"DM Sans", Arial, sans-serif; white-space:nowrap;';
  countLabel.textContent = 'How many:';
  topicRow.appendChild(countLabel);
  var countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = 1;
  countInput.max = 10;
  countInput.value = Math.min(10, Math.max(1, questions.length || 3));
  countInput.style.cssText = 'width:70px; ' + INPUT_CSS;
  topicRow.appendChild(countInput);
  var writeBtn = document.createElement('button');
  writeBtn.type = 'button';
  writeBtn.className = 'recipe-cancel-btn';
  writeBtn.textContent = 'Write my facts';
  topicRow.appendChild(writeBtn);
  topicSection.appendChild(topicRow);
  modal.appendChild(topicSection);

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '10px';
  status.hidden = true;
  modal.appendChild(status);

  // --- The fact list, editable in place (both prepared doors) ---
  var listSection = document.createElement('div');
  var listHeading = document.createElement('p');
  listHeading.className = 'template-picker-subtitle';
  listHeading.style.fontWeight = '800';
  listHeading.style.marginTop = '14px';
  listSection.appendChild(listHeading);
  var listHint = document.createElement('p');
  listHint.className = 'template-picker-subtitle';
  listHint.textContent = 'Each fact is a sentence with a blank shown as ___ plus the real answer. The decoy is one extra wrong choice, mixed in with student lies.';
  listSection.appendChild(listHint);
  var listWrap = document.createElement('div');
  listWrap.style.cssText = 'max-height:320px; overflow-y:auto; padding-right:4px; margin-top:6px;';
  listSection.appendChild(listWrap);
  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'recipe-cancel-btn';
  addBtn.textContent = '+ Add a fact';
  addBtn.style.marginTop = '8px';
  addBtn.addEventListener('click', function () {
    if (questions.length >= 10) return;
    questions.push({ question: '', truth: '', houseLie: '' });
    renderQuestions();
    var inputs = listWrap.querySelectorAll('[data-role="question"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });
  listSection.appendChild(addBtn);
  modal.appendChild(listSection);

  function renderQuestions() {
    listWrap.textContent = '';
    listHeading.textContent = 'The facts (' + questions.length + '):';
    addBtn.disabled = questions.length >= 10;
    questions.forEach(function (q, qi) {
      var card = document.createElement('div');
      card.style.cssText = 'background:#FDF9F0; box-shadow: 0 2px 3px rgba(50,35,15,0.16); padding:10px 12px; margin-bottom:10px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';
      var headText = document.createElement('strong');
      headText.style.cssText = 'font-family:"DM Sans", Arial, sans-serif; flex:1;';
      headText.textContent = 'Fact ' + (qi + 1);
      head.appendChild(headText);
      var qRemove = document.createElement('button');
      qRemove.type = 'button';
      qRemove.textContent = '✕';
      qRemove.title = 'Drop this fact';
      qRemove.setAttribute('aria-label', 'Drop fact ' + (qi + 1));
      qRemove.style.cssText = 'border:none; background:none; cursor:pointer; font-size:1rem; font-weight:800; color:#221E1C; opacity:0.6;';
      qRemove.addEventListener('click', function () {
        questions.splice(qi, 1);
        renderQuestions();
      });
      head.appendChild(qRemove);
      card.appendChild(head);

      var qInput = GrowingText.create({
        css: 'width:100%; margin-bottom:6px; ' + INPUT_CSS,
        value: q.question || '',
        placeholder: 'A sentence with a blank shown as ___',
        maxLength: 300
      });
      qInput.setAttribute('data-role', 'question');
      qInput.addEventListener('input', function () { q.question = qInput.value; });
      card.appendChild(qInput);

      var answerRow = document.createElement('div');
      answerRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
      var truthWrap = document.createElement('label');
      truthWrap.style.cssText = 'flex:1; min-width:140px; font-weight:700; font-size:0.85rem; font-family:"DM Sans", Arial, sans-serif;';
      truthWrap.appendChild(document.createTextNode('The real answer'));
      var truthInput = GrowingText.create({
        css: 'width:100%; margin-top:2px; ' + INPUT_CSS,
        value: q.truth || '',
        placeholder: 'e.g. dog',
        maxLength: 100
      });
      truthInput.addEventListener('input', function () { q.truth = truthInput.value; });
      truthWrap.appendChild(truthInput);
      answerRow.appendChild(truthWrap);
      var lieWrap = document.createElement('label');
      lieWrap.style.cssText = 'flex:1; min-width:140px; font-weight:700; font-size:0.85rem; font-family:"DM Sans", Arial, sans-serif;';
      lieWrap.appendChild(document.createTextNode('Decoy (optional)'));
      var lieInput = GrowingText.create({
        css: 'width:100%; margin-top:2px; ' + INPUT_CSS,
        value: q.houseLie || '',
        placeholder: 'e.g. chicken',
        maxLength: 100
      });
      lieInput.addEventListener('input', function () { q.houseLie = lieInput.value; });
      lieWrap.appendChild(lieInput);
      answerRow.appendChild(lieWrap);
      card.appendChild(answerRow);

      listWrap.appendChild(card);
    });
  }
  renderQuestions();

  // --- Lie timer (applies to every source) ---
  var timerLabel = document.createElement('label');
  timerLabel.style.cssText = LABEL_CSS;
  timerLabel.textContent = (lieTimerKnob ? lieTimerKnob.label : 'Lie-writing time (seconds)') +
    (lieTimerKnob && lieTimerKnob.min != null ? ' (' + lieTimerKnob.min + '–' + lieTimerKnob.max + ')' : '');
  if (lieTimerKnob && lieTimerKnob.helper) timerLabel.title = lieTimerKnob.helper;
  modal.appendChild(timerLabel);
  var timerInput = document.createElement('input');
  timerInput.type = 'number';
  timerInput.min = lieTimerKnob && lieTimerKnob.min != null ? lieTimerKnob.min : 15;
  timerInput.max = lieTimerKnob && lieTimerKnob.max != null ? lieTimerKnob.max : 180;
  timerInput.value = lieTimerKnob ? lieTimerKnob.value : 45;
  timerInput.style.cssText = 'width:120px; ' + INPUT_CSS;
  modal.appendChild(timerInput);

  function renderSourceState() {
    SOURCES.forEach(function (src) {
      var card = sourceButtons[src.id];
      var on = selectedSource === src.id;
      card.setAttribute('aria-checked', on ? 'true' : 'false');
      // Totem selection: the inset ink ring, never a color change
      card.style.boxShadow = on
        ? '0 2px 3px rgba(50,35,15,0.18), inset 0 0 0 3px #2A2620'
        : '0 2px 3px rgba(50,35,15,0.18)';
      card.style.opacity = on ? '1' : '0.85';
    });
    liveSection.hidden = selectedSource !== 'live';
    topicSection.hidden = selectedSource !== 'ai-now';
    listSection.hidden = selectedSource === 'live';
  }
  renderSourceState();

  // --- Actions: the three doors (makeCopy below gets the pick) ---
  var doors = makeItYoursDoors(makeCopy);
  modal.appendChild(doors.row);

  function showStatus(text) {
    status.hidden = false;
    status.textContent = text;
  }

  function clampedInt(el, min, max, fallback) {
    var n = parseInt(el.value, 10);
    if (isNaN(n)) return fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  // Trim fact rows the way the save will see them; the houseLie key is
  // always present because the recipe template reads ${item.houseLie}.
  function cleanedList() {
    return questions.map(function (q) {
      return {
        question: String(q.question || '').trim(),
        truth: String(q.truth || '').trim(),
        houseLie: String(q.houseLie || '').trim()
      };
    });
  }

  writeBtn.addEventListener('click', function () {
    var topic = topicInput.value.trim();
    if (topic.length < 3) {
      showStatus('Give a topic first, a few words is plenty.');
      topicInput.focus();
      return;
    }
    var n = clampedInt(countInput, 1, 10, 3);
    writeBtn.disabled = true;
    doors.setDisabled(true);
    writeBtn.textContent = 'Writing…';
    showStatus('Writing ' + n + ' facts about "' + topic + '", this can take ~20 seconds.');
    fetch('/api/games/bluff-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        count: n,
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : ''
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok || result.data.error || !Array.isArray(result.data.questions)) {
          throw new Error(result.data.error || 'no facts came back');
        }
        questions = result.data.questions;
        renderQuestions();
        showStatus('Check every fact before you save, fix or drop anything that looks wrong.');
        listWrap.scrollTop = 0;
      })
      .catch(function (err) {
        showStatus('Could not write facts: ' + err.message);
      })
      .then(function () {
        writeBtn.disabled = false;
        doors.setDisabled(false);
        writeBtn.textContent = 'Write my facts';
      });
  });

  function makeCopy(dest) {
    var params = JSON.parse(JSON.stringify(stamp.params));
    if (selectedSource === 'live') {
      params.questionSource = 'live';
      params.rounds = clampedInt(roundsInput,
        roundsKnob && roundsKnob.min != null ? roundsKnob.min : 1,
        roundsKnob && roundsKnob.max != null ? roundsKnob.max : 6,
        roundsKnob ? roundsKnob.value : 3);
    } else {
      var cleaned = cleanedList();
      var problems = SetupKnobs.validateBluffList(cleaned);
      if (problems.length > 0) {
        showStatus(problems.slice(0, 2).join(' '));
        return;
      }
      params.questionSource = 'prepared';
      params.questions = cleaned;
    }
    params.lieTimer = clampedInt(timerInput,
      lieTimerKnob && lieTimerKnob.min != null ? lieTimerKnob.min : 15,
      lieTimerKnob && lieTimerKnob.max != null ? lieTimerKnob.max : 180,
      lieTimerKnob ? lieTimerKnob.value : 45);
    doors.setDisabled(true);
    writeBtn.disabled = true;
    showStatus('Building your copy…');
    compileWorkingConfig(config, params)
      .then(function (working) {
        working.name = game.name + ' (my version)';
        return saveCopyAndReturn(working, dest);
      })
      .catch(function (err) {
        doors.setDisabled(false);
        writeBtn.disabled = false;
        showStatus('Could not make your copy: ' + err.message);
      });
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
}

function customizeCopy(game, btn) {
  // Deliberately NOT Recents.add(game.id) here: clicking Customize is
  // opening-to-look, and looking must leave no trace in the yard (field
  // feedback 2026-08-24). The original enters recents only via Preview/
  // Host clicks; a copy enters the yard only once it's actually saved.
  btn.disabled = true;
  btn.textContent = 'Loading…';
  var configPromise = fetch('/api/games/' + encodeURIComponent(game.id))
    .then(function (resp) {
      if (!resp.ok) throw new Error('could not load the activity');
      return resp.json();
    });
  // Recipe-born games (config.recipe provenance stamp) get setup knobs in
  // the dialog: instant, no-AI controls like "how many questions". Best-
  // effort: recipe missing/broken/version-drifted = no knobs, flow as before.
  var recipePromise = configPromise.then(function (config) {
    var stamp = config && config.recipe;
    if (!stamp || typeof stamp.id !== 'string' || !window.SetupKnobs) return null;
    return fetch('/api/recipes/' + encodeURIComponent(stamp.id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  });
  // A few AI questions tailor the copy before the editor opens. Best-effort:
  // no questions (error, budget, mock hiccup) = plain copy, like before.
  // Waits on the recipe summary so games with a dedicated setup panel
  // never spend this AI call (their panel owns the content).
  var questionsPromise = Promise.all([configPromise, recipePromise]).then(function (parts) {
    var config = parts[0];
    if (window.SetupKnobs && parts[1] && SetupKnobs.panelFor(parts[1], config.recipe)) {
      return { questions: [] };
    }
    // Labels of the setup knobs this dialog already renders (round count,
    // timers...) ride along so the AI never asks about a setting the
    // teacher can see a control for (trivia-bluff's rounds knob, 2026-08-16).
    var knobs = (window.SetupKnobs && parts[1])
      ? SetupKnobs.knobsFor(parts[1], config.recipe) : [];
    return fetch('/api/games/customize-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config,
        // The saved class profile rides along so the questions build on it
        // instead of re-asking grade and subject.
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : '',
        // The class picker sits in the dialog itself, so grade and subject
        // are settings with a visible control: never re-asked.
        knownSettings: ['Grade band', 'Subjects'].concat((knobs || []).map(function (k) { return k.label; }))
      })
    }).then(function (r) { return r.ok ? r.json() : { questions: [] }; })
      .catch(function () { return { questions: [] }; });
  });
  Promise.all([configPromise, questionsPromise, recipePromise])
    .then(function (parts) {
      btn.disabled = false;
      btn.textContent = 'Make it yours';
      var config = parts[0];
      var summary = parts[2];
      // A recipe with a dedicated panel (quiz) owns the whole dialog: the
      // questions ARE the content, so the generic words-tailoring flow
      // (which can rewrite choices out from under a correct answer) is
      // skipped entirely for these games.
      var panel = (window.SetupKnobs && summary)
        ? SetupKnobs.panelFor(summary, config.recipe) : null;
      if (panel === 'quiz') {
        return showQuizCustomizeDialog(game, config, summary);
      }
      if (panel === 'bluff') {
        return showBluffCustomizeDialog(game, config, summary);
      }
      var questions = (parts[1] && parts[1].questions) || [];
      var knobs = (window.SetupKnobs && summary)
        ? SetupKnobs.knobsFor(summary, config.recipe) : [];
      if (questions.length === 0 && knobs.length === 0) {
        // Nothing to ask: the teacher hasn't chosen anything yet, so hand
        // the editor an UNSAVED draft. The copy is only created (and only
        // then joins the yard) on their first real edit over there.
        config.name = game.name + ' (my version)';
        return openDraftCopy(config);
      }
      showCustomizeDialog(game, config, questions, knobs);
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Make it yours';
      alert('Could not make your copy: ' + err.message);
    });
}

// The tailoring dialog: setup knobs first (instant, no AI — question count,
// timers), then the AI questions. Answer what you like (or skip); the AI
// rewrites the copy's WORDS — structure only changes through the knobs'
// recipe recompile (the revise endpoint validates).
function showCustomizeDialog(game, config, questions, knobs) {
  knobs = knobs || [];
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '560px';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

  var LABEL_CSS = 'display:block; font-weight:700; margin:12px 0 6px; font-family:"DM Sans", Arial, sans-serif; color:#2A2620;';
  var INPUT_CSS = 'padding:11px 14px 9px; border:none; background:#EAD9BA; background-image:repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px); border-bottom:3px dashed rgba(110,75,40,0.45); font-family:"DM Sans", Arial, sans-serif; font-size:0.95rem; font-weight:500; color:#2A2620; box-sizing:border-box;';

  // --- Setup knobs (recipe-born games only) ---
  var knobInputs = [];
  if (knobs.length > 0) {
    var knobsHeading = document.createElement('p');
    knobsHeading.className = 'template-picker-subtitle';
    knobsHeading.style.fontWeight = '800';
    knobsHeading.textContent = 'Set it up:';
    modal.appendChild(knobsHeading);

    knobs.forEach(function (knob) {
      var input;
      if (knob.kind === 'boolean') {
        var boolLabel = document.createElement('label');
        boolLabel.style.cssText = LABEL_CSS + ' cursor:pointer;';
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = knob.value === true;
        input.style.cssText = 'margin-right:8px; width:18px; height:18px; vertical-align:middle;';
        boolLabel.appendChild(input);
        boolLabel.appendChild(document.createTextNode(knob.label));
        if (knob.helper) boolLabel.title = knob.helper;
        modal.appendChild(boolLabel);
        knobInputs.push({ knob: knob, getValue: function (el) {
          return function () { return el.checked; };
        }(input) });
      } else if (knob.kind === 'enum') {
        var enumLabel = document.createElement('label');
        enumLabel.style.cssText = LABEL_CSS;
        enumLabel.textContent = knob.label;
        modal.appendChild(enumLabel);
        input = document.createElement('select');
        input.style.cssText = 'width:100%; ' + INPUT_CSS;
        (knob.values || []).forEach(function (v) {
          var opt = document.createElement('option');
          opt.value = String(v);
          opt.textContent = String(v);
          if (String(v) === String(knob.value)) opt.selected = true;
          input.appendChild(opt);
        });
        modal.appendChild(input);
        knobInputs.push({ knob: knob, getValue: function (el) {
          return function () { return el.value; };
        }(input) });
      } else {
        // count + integer share a number input
        var numLabel = document.createElement('label');
        numLabel.style.cssText = LABEL_CSS;
        numLabel.textContent = knob.label +
          (knob.min != null && knob.max != null ? ' (' + knob.min + '–' + knob.max + ')' : '');
        if (knob.helper) numLabel.title = knob.helper;
        modal.appendChild(numLabel);
        input = document.createElement('input');
        input.type = 'number';
        if (knob.min != null) input.min = knob.min;
        if (knob.max != null) input.max = knob.max;
        input.value = knob.value;
        input.style.cssText = 'width:120px; ' + INPUT_CSS;
        modal.appendChild(input);
        knobInputs.push({ knob: knob, getValue: function (el, k) {
          return function () {
            var n = parseInt(el.value, 10);
            if (isNaN(n)) return k.value; // blank/garbage = leave it alone
            if (k.min != null && n < k.min) n = k.min;
            if (k.max != null && n > k.max) n = k.max;
            return n;
          };
        }(input, knob) });
      }
    });
  }

  // Only introduce the AI questions when there are any to answer.
  if (questions.length > 0) {
    var subtitle = document.createElement('p');
    subtitle.className = 'template-picker-subtitle';
    subtitle.textContent = 'Answer what you like and we’ll word your copy of “' + game.name + '” for your class. Anything you skip stays as-is.';
    modal.appendChild(subtitle);

    // Who it's for: the saved grade and subjects, changeable right here,
    // so the teacher never wonders whether to repeat them in the answers.
    // Changing them re-asks the AI for questions that fit the new class
    // (a moment after the last pick, or at once on Done).
    renderClassPicker(modal, {
      hint: 'The questions below update to fit your class.',
      onChange: function () {
        clearTimeout(questionsTimer);
        questionsTimer = setTimeout(refreshQuestions, 1500);
      },
      onDone: function () {
        clearTimeout(questionsTimer);
        refreshQuestions();
      }
    });
  }

  var questionsBox = document.createElement('div');
  questionsBox.className = 'customize-questions';
  modal.appendChild(questionsBox);

  var inputs = [];
  // (Re)build the question inputs. Answers already typed survive when the
  // same question comes back, the rest start blank.
  function renderQuestions(list) {
    var typed = {};
    inputs.forEach(function (pair) {
      if (pair.input.value.trim()) typed[pair.question] = pair.input.value;
    });
    questionsBox.textContent = '';
    inputs = [];
    list.forEach(function (q) {
      var label = document.createElement('label');
      label.style.cssText = LABEL_CSS;
      label.textContent = q.question;
      questionsBox.appendChild(label);
      var input = GrowingText.create({
        css: 'width:100%; ' + INPUT_CSS,
        placeholder: q.placeholder || '',
        value: typed[q.question] || ''
      });
      questionsBox.appendChild(input);
      inputs.push({ question: q.question, input: input });
    });
  }
  renderQuestions(questions);

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '12px';
  status.hidden = true;
  modal.appendChild(status);

  // The class the current questions were written for; a refresh is a
  // no-op while it matches, so Done after a debounced fetch never
  // double-asks.
  var questionsClass = window.TeacherProfile ? TeacherProfile.describe() : '';
  var questionsTimer = null;
  var questionsInFlight = false;
  function refreshQuestions() {
    if (questions.length === 0) return;
    var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
    if (classDesc === questionsClass) return;
    if (questionsInFlight) {
      // Picks changed mid-fetch: go again once this one lands.
      clearTimeout(questionsTimer);
      questionsTimer = setTimeout(refreshQuestions, 800);
      return;
    }
    questionsInFlight = true;
    questionsBox.classList.add('customize-questions-stale');
    status.hidden = false;
    status.textContent = classDesc
      ? 'Updating the questions for ' + classDesc + '...'
      : 'Updating the questions...';
    fetch('/api/games/customize-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config,
        classDescription: classDesc,
        knownSettings: ['Grade band', 'Subjects'].concat(knobs.map(function (k) { return k.label; }))
      })
    })
      .then(function (r) { return r.ok ? r.json() : { questions: [] }; })
      .then(function (d) {
        if (Array.isArray(d.questions) && d.questions.length > 0) renderQuestions(d.questions);
        questionsClass = classDesc;
        status.hidden = true;
      })
      .catch(function () {
        status.textContent = 'Could not update the questions, the ones below still work.';
      })
      .finally(function () {
        questionsInFlight = false;
        questionsBox.classList.remove('customize-questions-stale');
        // The class moved on while we were fetching? Catch up.
        var now = window.TeacherProfile ? TeacherProfile.describe() : '';
        if (now !== questionsClass) refreshQuestions();
      });
  }

  var doors = makeItYoursDoors(pickDoor);
  modal.appendChild(doors.row);

  function currentKnobValues() {
    return knobInputs.map(function (ki) {
      return { name: ki.knob.name, kind: ki.knob.kind, value: ki.getValue() };
    });
  }

  function anyKnobTouched() {
    return knobInputs.some(function (ki) {
      var now = ki.getValue();
      return ki.knob.kind === 'boolean' ? now !== ki.knob.value : String(now) !== String(ki.knob.value);
    });
  }

  // The config the save/revise steps work from: the source config, with
  // phases rebuilt by the recipe compiler when any knob was touched.
  // Untouched knobs never recompile, so a hand-edited copy of a stamped
  // game can't be silently clobbered.
  function buildWorkingConfig() {
    if (knobInputs.length === 0 || !anyKnobTouched()) return Promise.resolve(config);
    var params = SetupKnobs.applyKnobs(config.recipe.params, currentKnobValues());
    return compileWorkingConfig(config, params);
  }

  function saveWorking(working, dest) {
    working.name = game.name + ' (my version)';
    return saveCopyAndReturn(working, dest);
  }

  function fail(text) {
    doors.setDisabled(false);
    status.hidden = false;
    status.textContent = text;
  }

  // No question answered: the copy is the original, with the knobs
  // applied when any was touched.
  function plainCopy(dest) {
    doors.setDisabled(true);
    if (!anyKnobTouched()) {
      // Nothing chosen at all. The designer gets an UNSAVED draft, same
      // rule as the no-dialog path: opening to look leaves no trace in
      // the yard. The simulator and the host screen run the original
      // itself, an untouched copy would be the same activity under a
      // second name.
      if (dest === 'designer') {
        var draft = JSON.parse(JSON.stringify(config));
        draft.name = game.name + ' (my version)';
        return openDraftCopy(draft);
      }
      Recents.add(game.id);
      window.location.href = copyDestinationUrl(dest, game.id);
      return;
    }
    buildWorkingConfig()
      .then(function (working) { return saveWorking(working, dest); })
      .catch(function (err) { fail('Could not make your copy: ' + err.message); });
  }

  // Any door: answers typed = the AI rewords the copy first, then it is
  // saved and the teacher lands at the door they picked.
  function pickDoor(dest) {
    var answered = inputs.filter(function (pair) { return pair.input.value.trim(); });
    if (answered.length === 0) return plainCopy(dest);
    doors.setDisabled(true);
    status.hidden = false;
    status.textContent = 'Rewording the activity for your class, this can take ~20 seconds.';
    buildWorkingConfig()
      .then(function (working) {
        var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
        var request = 'A teacher is adapting this ready-made activity for their own class. ' +
          'Rewrite ONLY the teacher- and student-facing words (name, description, prompts, messages, choices, reveal templates) to fit their answers below. ' +
          'Keep every step, the structure, timers, data references, and {{tokens}} exactly as they are.\n\n' +
          (classDesc ? 'Their class: ' + classDesc + '.\n' : '') +
          answered.map(function (pair) {
            return 'Q: ' + pair.question + '\nA: ' + pair.input.value.trim();
          }).join('\n');
        return fetch('/api/games/revise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: working, request: request })
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (result) {
            var d = result.data;
            var structuralErrors = d.structural && d.structural.errors ? d.structural.errors.length : 0;
            if (!result.ok || d.error || !d.updatedConfig || structuralErrors > 0) {
              throw new Error(d.error || (structuralErrors > 0 ? 'the reworded copy had problems' : 'no config returned'));
            }
            var revised = d.updatedConfig;
            if (!revised.name || revised.name === game.name) {
              revised.name = game.name + ' (my version)';
            }
            return saveCopyAndReturn(revised, dest);
          })
          .catch(function (err) {
            // The tailoring is a bonus — never strand the teacher without a
            // copy, and never lose their knob settings with it.
            status.textContent = 'The AI setup didn’t work (' + err.message + '), making your copy without the rewording.';
            setTimeout(function () {
              saveWorking(working, dest).catch(function (saveErr) {
                fail('Could not make your copy: ' + saveErr.message);
              });
            }, 1400);
          });
      })
      .catch(function (err) {
        // The knob recompile failed (bad settings, recipe drift): let the
        // teacher adjust instead of quietly saving something else.
        fail('Could not apply your settings: ' + err.message);
      });
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
  if (inputs.length > 0) inputs[0].input.focus();
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

// A row of toggle chips. Single-select rows repaint their siblings so
// only one stays lit; multi-select rows just flip the clicked chip.
function buildChipRow(options, isPicked, onPick) {
  var row = document.createElement('div');
  row.className = 'teacher-setup-chips';
  options.forEach(function (opt) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'setup-chip' + (isPicked(opt.id) ? ' active' : '');
    chip.textContent = opt.label;
    chip.setAttribute('aria-pressed', isPicked(opt.id) ? 'true' : 'false');
    chip.addEventListener('click', function () {
      onPick(opt.id);
      var siblings = row.querySelectorAll('.setup-chip');
      for (var i = 0; i < siblings.length; i++) {
        var lit = isPicked(options[i].id);
        siblings[i].classList.toggle('active', lit);
        siblings[i].setAttribute('aria-pressed', lit ? 'true' : 'false');
      }
    });
    row.appendChild(chip);
  });
  return row;
}

// --- Your class, inside Make it yours ----------------------------------
// The grade band + subjects picker lives in the Customize dialogs (owner
// call 2026-09-02; it used to be a first-visit card in the yard). Every
// pick saves to TeacherProfile at once, so the next Customize opens
// already set, and the submit paths read TeacherProfile.describe() at
// send time and see the current picks with no plumbing. Opens folded to
// one line when a class is already saved; open when nothing is yet.
// opts.onChange fires after every saved pick, opts.onDone when the
// teacher folds the picker with Done; opts.hint is a line under the head
// while it is open (the generic dialog says the questions will update).
function renderClassPicker(container, opts) {
  opts = opts || {};
  if (!window.TeacherProfile) return;
  var existing = TeacherProfile.get() || { gradeBand: null, subjects: [], otherText: '' };
  var picked = { gradeBand: existing.gradeBand, subjects: existing.subjects.slice(), otherText: existing.otherText || '' };

  var box = document.createElement('div');
  box.className = 'class-picker';

  var head = document.createElement('div');
  head.className = 'class-picker-head';
  var label = document.createElement('span');
  label.className = 'class-picker-label';
  label.textContent = 'Your class';
  head.appendChild(label);
  var summary = document.createElement('span');
  summary.className = 'class-picker-summary';
  head.appendChild(summary);
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'class-line-change';
  head.appendChild(toggle);
  box.appendChild(head);

  var body = document.createElement('div');
  body.className = 'class-picker-body';
  box.appendChild(body);

  if (opts.hint) {
    var hint = document.createElement('p');
    hint.className = 'class-picker-hint';
    hint.textContent = opts.hint;
    body.appendChild(hint);
  }

  function refreshHead() {
    var desc = TeacherProfile.describe();
    summary.textContent = desc || 'Pick a grade and subjects and the wording fits your class. Optional.';
    summary.classList.toggle('class-picker-empty', !desc);
  }

  function persist() {
    if (!picked.gradeBand && picked.subjects.length === 0) {
      TeacherProfile.clear();
      TeacherProfile.dismiss();
    } else {
      TeacherProfile.save(picked);
    }
    refreshHead();
    if (opts.onChange) opts.onChange();
  }

  function setOpen(open) {
    body.hidden = !open;
    toggle.textContent = open ? 'Done' : 'Change';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  toggle.addEventListener('click', function () {
    var closing = !body.hidden;
    setOpen(body.hidden);
    if (closing && opts.onDone) opts.onDone();
  });

  var gradeLabel = document.createElement('p');
  gradeLabel.className = 'teacher-setup-label';
  gradeLabel.textContent = 'Grade band';
  body.appendChild(gradeLabel);
  body.appendChild(buildChipRow(
    TeacherProfile.GRADE_BANDS,
    function (id) { return picked.gradeBand === id; },
    function (id) {
      picked.gradeBand = (picked.gradeBand === id) ? null : id;
      persist();
    }
  ));

  var subjectLabel = document.createElement('p');
  subjectLabel.className = 'teacher-setup-label';
  subjectLabel.textContent = 'Subjects, pick any';
  body.appendChild(subjectLabel);
  body.appendChild(buildChipRow(
    TeacherProfile.SUBJECTS,
    function (id) { return picked.subjects.indexOf(id) !== -1; },
    function (id) {
      var at = picked.subjects.indexOf(id);
      if (at === -1) {
        picked.subjects.push(id);
        if (id === 'other') askOtherSubject(picked, persist);
      } else {
        picked.subjects.splice(at, 1);
        if (id === 'other') picked.otherText = '';
      }
      persist();
    }
  ));

  refreshHead();
  setOpen(!TeacherProfile.get());
  container.appendChild(box);
}

// "Something else" is a blank to fill: a small popup asks what it actually
// is, so personalization can say "Robotics" instead of "Something else".
// Closing without typing is fine, the chip stays picked with no text.
function askOtherSubject(picked, onDone) {
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal subject-other-modal';

  var title = document.createElement('h2');
  title.textContent = 'What do you teach?';
  modal.appendChild(title);

  var hint = document.createElement('p');
  hint.className = 'subject-other-hint';
  hint.textContent = 'A word or two is plenty. It helps suggest questions that fit your class.';
  modal.appendChild(hint);

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'subject-other-input';
  input.maxLength = 60;
  input.placeholder = 'Health, music, robotics...';
  input.value = picked.otherText || '';
  modal.appendChild(input);

  var saveRow = document.createElement('div');
  saveRow.className = 'subject-other-save-row';
  var saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'teacher-setup-save';
  saveBtn.textContent = 'Save';
  saveRow.appendChild(saveBtn);
  modal.appendChild(saveRow);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  var dlg = Dialog.enhance(overlay, modal, { title: 'What do you teach?' });

  saveBtn.addEventListener('click', function () {
    picked.otherText = input.value.trim();
    dlg.close();
    if (onDone) onDone();
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveBtn.click();
  });
  input.focus();
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
    { icon: 'play', text: 'Simulate it first, no class needed.' },
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
  var piece = document.querySelector('.plank[data-game-id="' + CSS.escape(wantedId) + '"]') ||
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
