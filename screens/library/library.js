// Activity Library — the teacher-facing front door (library-first, 2026-07-28).
//
// Built for RUNNING, not building: search + goal chips, cards whose primary
// action is Host, favorites/recents sections, and a "build your own" doorway
// that opens the designer (the second layer) while filing a builder-request
// signal in the feedback inbox. Visibility rules are shared with the designer
// grid (game-visibility.js): featured built-ins + this device's creations,
// everything in owner mode.
//
// Deliberately NOT here (designer-only): editing built-ins, delete, the
// featured ★ toggle, recipes, AI generation.

var libraryGrid = document.getElementById('library-grid');
var loadingMessage = document.getElementById('loading-message');
var errorMessage = document.getElementById('error-message');

var Favorites = ActivityPrefs.Favorites;
var Recents = ActivityPrefs.Recents;

// Connect leads — the library is about doing things together.
var GOAL_ORDER = ['connect', 'discuss', 'decide', 'reflect', 'create', 'review', 'energize'];
var GOAL_LABELS = {
  connect: '🤝 Connect',
  discuss: '💬 Discuss',
  decide: '🗳️ Decide',
  reflect: '🪞 Reflect',
  create: '🎨 Create',
  review: '📚 Review',
  energize: '⚡ Energize'
};

var allGames = [];
var libraryQuery = '';
var activeGoal = null;

function applyVisibility(games) {
  if (!window.GameVisibility) return games;
  return GameVisibility.visibleGames(games, {
    owner: window.OwnerMode ? OwnerMode.isOn() : false,
    myIds: window.MyGames ? MyGames.list() : []
  });
}

function matchesFilters(game) {
  if (activeGoal) {
    var tags = Array.isArray(game.tags) ? game.tags : [];
    if (tags.indexOf(activeGoal) === -1) return false;
  }
  if (libraryQuery) {
    var hay = (game.name + ' ' + (game.description || '') + ' ' +
      (Array.isArray(game.tags) ? game.tags.join(' ') : '')).toLowerCase();
    if (hay.indexOf(libraryQuery) === -1) return false;
  }
  return true;
}

function buildGoalChips(games) {
  var chipsEl = document.getElementById('goal-chips');
  chipsEl.innerHTML = '';
  var counts = {};
  for (var i = 0; i < games.length; i++) {
    var tags = Array.isArray(games[i].tags) ? games[i].tags : [];
    for (var t = 0; t < tags.length; t++) {
      if (GOAL_LABELS[tags[t]]) counts[tags[t]] = (counts[tags[t]] || 0) + 1;
    }
  }
  GOAL_ORDER.forEach(function (goal) {
    if (!counts[goal] && goal !== activeGoal) return;
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'goal-chip' + (goal === activeGoal ? ' active' : '');
    chip.textContent = GOAL_LABELS[goal] + ' ' + (counts[goal] || 0);
    chip.setAttribute('aria-pressed', goal === activeGoal ? 'true' : 'false');
    chip.addEventListener('click', function () {
      activeGoal = (activeGoal === goal) ? null : goal;
      refreshLibrary();
    });
    chipsEl.appendChild(chip);
  });
}

function refreshLibrary() {
  var visible = applyVisibility(allGames);
  document.getElementById('library-controls').hidden = visible.length === 0;
  buildGoalChips(visible);
  renderLibrary(visible.filter(matchesFilters));
}

function renderLibrary(games) {
  libraryGrid.innerHTML = '';

  if (games.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = (libraryQuery || activeGoal)
      ? 'No matches — try a different search or clear the filter.'
      : 'Nothing here yet.';
    libraryGrid.appendChild(empty);
    return;
  }

  // Sections, each activity exactly once: Favorites → Recently used → rest.
  var placed = {};
  function take(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      for (var g = 0; g < games.length; g++) {
        if (games[g].id === ids[i] && !placed[ids[i]]) {
          out.push(games[g]);
          placed[ids[i]] = true;
        }
      }
    }
    return out;
  }

  var favs = take(Favorites.list());
  var recents = take(Recents.list());
  var rest = games.filter(function (g) { return !placed[g.id]; });

  if (favs.length > 0) appendSection('♥ Favorites', favs);
  if (recents.length > 0) appendSection('Recently used', recents);
  if (rest.length > 0) {
    appendSection(favs.length || recents.length ? 'The library' : null, rest);
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
  if (game.playTime) meta.appendChild(metaBadge('⏱ ' + game.playTime));
  if (game.classSize) meta.appendChild(metaBadge('👥 ' + game.classSize));
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
    noWinner.textContent = '🕊 No scores, no winners';
    noWinner.title = 'A connection activity — the framework refuses to add points, rankings, or eliminations to it.';
    card.appendChild(noWinner);
  }

  var actions = document.createElement('div');
  actions.className = 'game-card-actions';

  var rememberRecent = function () { Recents.add(game.id); };

  var hostBtn = document.createElement('a');
  hostBtn.className = 'game-card-host library-host';
  hostBtn.href = '/host?game=' + encodeURIComponent(game.id);
  hostBtn.textContent = '▶ Host this';
  hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
  hostBtn.addEventListener('click', rememberRecent);
  actions.appendChild(hostBtn);

  var previewBtn = document.createElement('a');
  previewBtn.className = 'game-card-preview';
  previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
  previewBtn.textContent = 'Try it';
  previewBtn.setAttribute('aria-label', 'Try "' + game.name + '" in prototype mode');
  previewBtn.addEventListener('click', rememberRecent);
  actions.appendChild(previewBtn);

  // Editing belongs to the builder layer — only offered on activities made
  // on this device (their author is already a builder).
  if (window.MyGames && MyGames.has(game.id)) {
    var editBtn = document.createElement('a');
    editBtn.className = 'game-card-edit';
    editBtn.href = '/designer/edit?game=' + encodeURIComponent(game.id);
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit "' + game.name + '"');
    editBtn.addEventListener('click', rememberRecent);
    actions.appendChild(editBtn);
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

  card.appendChild(actions);
  return card;
}

function metaBadge(text) {
  var badge = document.createElement('span');
  badge.className = 'game-card-meta-badge';
  badge.textContent = text;
  return badge;
}

// --- Builder doorway: opening the second layer files a signal ------------

document.getElementById('build-your-own-btn').addEventListener('click', function () {
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '520px';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Build your own activity';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'The designer lets you describe an activity in plain words, start from a recipe, or build step by step. One optional question first:';
  modal.appendChild(subtitle);

  var note = document.createElement('textarea');
  note.rows = 3;
  note.placeholder = 'What do you want to make? (optional — this goes straight to the person who builds Lanyard)';
  note.style.cssText = 'width:100%; padding:12px; border:3px solid #000; border-radius:10px; font-family:Arial, sans-serif; font-size:0.95rem; resize:vertical; box-sizing:border-box; margin-bottom:14px;';
  modal.appendChild(note);

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';
  var goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'recipe-create-btn';
  goBtn.textContent = 'Open the designer';
  goBtn.addEventListener('click', function () {
    goBtn.disabled = true;
    try { localStorage.setItem('lanyard-builder', '1'); } catch (e) {}
    var message = note.value.trim();
    var payload = {
      page: '/library',
      category: 'builder-request',
      message: message.length >= 3 ? message : 'Opened the designer from the library (no note).'
    };
    // Best-effort signal — never block the teacher on it.
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {}).finally(function () {
      window.location.href = '/designer';
    });
  });
  btnRow.appendChild(goBtn);
  modal.appendChild(btnRow);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Build your own activity' });
  note.focus();
});

// --- Load ---------------------------------------------------------------

var searchEl = document.getElementById('library-search');
searchEl.addEventListener('input', function () {
  libraryQuery = searchEl.value.trim().toLowerCase();
  refreshLibrary();
});

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
    errorMessage.textContent = 'Could not load the library: ' + err.message;
    errorMessage.hidden = false;
  });
