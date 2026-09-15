// The owner's curation console (the yard page until 2026-09-13, when the
// yard folded into the home page: one yard, shared/my-yard.js carries the
// teacher's shelf and popup now). Reached through /owner; any other visit
// goes to the home's yard (the server redirects; the check below covers a
// cached page). What stays: search + goal chips over EVERY activity,
// cards with every control at once (Edit, Try it out, Host, heart, Delete,
// the ★ Featured toggle that decides what visitors see).
(function () {
  var params = null;
  try { params = new URLSearchParams(window.location.search); } catch (e) { /* old browser */ }
  var ownerOn = window.OwnerMode && OwnerMode.isOn();
  if (!(params && params.get('owner') === '1') && !ownerOn) window.location.replace('/#yard');
})();

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

// An activity stands in exactly ONE job (its first goal tag, the same
// rule the print's meta line and the home page use): a chip shows what
// its label promises. Snowball (discuss, connect) is a thinking activity
// and no longer turns up under "To connect" (owner's call, 2026-09-12).
function matchesGoal(game) {
  if (!activeGoal) return true;
  return goalGroupOf(game) === activeGoal;
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
      if (goalGroupOf(games[i]) === group.key) count++;
    }
    if (count === 0 && group.key !== activeGoal) return;
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'goal-chip' + (group.key === activeGoal ? ' active' : '');
    chip.setAttribute('data-goal', group.key);
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

  // Not the owner (unlock declined, or a stale page): the yard lives on
  // the home page now (one yard, 2026-09-13)
  var away = document.createElement('p');
  away.className = 'empty-message';
  var link = document.createElement('a');
  link.href = '/#yard';
  link.textContent = 'The yard is on the home page now. This way.';
  away.appendChild(link);
  libraryGrid.appendChild(away);
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
    customizeBtn.textContent = 'Pick this one';
    customizeBtn.title = 'Open it as your class will see it, change the question, then host it';
    customizeBtn.setAttribute('aria-label', 'Pick "' + game.name + '"');
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
    // The console opens in a new tab alongside (shared/host-launch.js)
    hostBtn.addEventListener('click', function (e) {
      if (window.HostLaunch) { e.preventDefault(); HostLaunch.launch(game.id); }
    });
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
function customizeCopy(game) {
  window.location.href = '/make?game=' + encodeURIComponent(game.id) + '&from=yard';
}

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

fetch('/api/games')
  .then(function (resp) {
    if (!resp.ok) throw new Error('status ' + resp.status);
    return resp.json();
  })
  .then(function (data) {
    allGames = data.games || [];
    loadingMessage.hidden = true;
    refreshLibrary();
  })
  .catch(function (err) {
    loadingMessage.hidden = true;
    errorMessage.textContent = 'Could not load the yard: ' + err.message;
    errorMessage.hidden = false;
  });

// Speak instead of typing — search box, the build-your-own note, feedback:
// every text box (current and future-rendered) carries the corner mic.
if (window.Speech) Speech.autoAttach();
