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

  var ownerOn = window.OwnerMode && OwnerMode.isOn();
  if (ownerOn) {
    var ownerBar = document.createElement('div');
    ownerBar.className = 'owner-bar';
    var ownerLabel = document.createElement('span');
    ownerLabel.textContent = 'Owner view — showing every activity';
    ownerBar.appendChild(ownerLabel);
    var inboxLink = document.createElement('a');
    inboxLink.href = '/feedback';
    inboxLink.textContent = '📬 Feedback inbox';
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
      ? 'No matches — try a different search or clear the filter.'
      : 'Nothing here yet.';
    libraryGrid.appendChild(empty);
    if (!ownerOn) appendOwnerLink();
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

  if (ownerOn) {
    // Owner view sorts by CURATION, not personal use: what the public shelf
    // shows right now, then everything hidden from visitors — so the owner
    // can read the live featured set at a glance.
    var liveFeatured = games.filter(function (g) { return g.featured; });
    var hidden = games.filter(function (g) { return !g.featured; });
    if (liveFeatured.length > 0) {
      appendSection('★ Featured right now (' + liveFeatured.length + ') — what visitors see', liveFeatured);
    }
    if (hidden.length > 0) {
      appendSection('Hidden from visitors (' + hidden.length + ')', hidden);
    }
    return;
  }

  var favs = take(Favorites.list());
  var recents = take(Recents.list());
  var rest = games.filter(function (g) { return !placed[g.id]; });

  if (favs.length > 0) appendSection('♥ Favorites', favs);
  if (recents.length > 0) appendSection('Recently used', recents);
  if (rest.length > 0) {
    appendSection(favs.length || recents.length ? 'The library' : null, rest);
  }

  // A quiet doorway to the full list for the site owner.
  appendOwnerLink();
}

function appendOwnerLink() {
  var link = document.createElement('button');
  link.className = 'owner-link';
  link.textContent = 'Show full library (site owner)';
  link.addEventListener('click', enterOwnerMode);
  libraryGrid.appendChild(link);
}

async function enterOwnerMode() {
  var ok = window.OwnerMode ? await OwnerMode.unlock() : false;
  if (ok) {
    refreshLibrary();
  } else {
    alert('That didn\'t unlock owner view — check the password and try again.');
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
  hostBtn.title = 'Start a live room your class can join right now';
  hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
  hostBtn.addEventListener('click', rememberRecent);
  actions.appendChild(hostBtn);

  var previewBtn = document.createElement('a');
  previewBtn.className = 'game-card-preview';
  previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
  previewBtn.textContent = 'Preview';
  previewBtn.title = 'See the teacher and student screens side by side, with practice players — no class needed';
  previewBtn.setAttribute('aria-label', 'Preview "' + game.name + '" with practice players');
  previewBtn.addEventListener('click', rememberRecent);
  actions.appendChild(previewBtn);

  // Customization is the point (play community: the players change the
  // rules). Own activities — and the owner — edit directly. Built-ins get
  // "Customize": clone into an editable copy first, because saving over a
  // shared built-in is owner-only server-side.
  var canEditDirectly = (window.MyGames && MyGames.has(game.id)) ||
    (window.OwnerMode && OwnerMode.isOn());
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
    customizeBtn.className = 'game-card-edit';
    customizeBtn.textContent = 'Customize';
    customizeBtn.title = 'Make your own editable copy of this activity';
    customizeBtn.setAttribute('aria-label', 'Customize a copy of "' + game.name + '"');
    customizeBtn.addEventListener('click', function () {
      customizeCopy(game, customizeBtn);
    });
    actions.appendChild(customizeBtn);
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
    deleteBtn.title = 'Delete this activity — this cannot be undone';
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
      ? 'Shown to everyone — click to remove from the public list'
      : 'Hidden from visitors — click to add to the public list')
      + (drift ? ' (differs from the repo default — a saved override is in effect)' : '');
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
function customizeCopy(game, btn) {
  btn.disabled = true;
  btn.textContent = 'Copying…';
  fetch('/api/games/' + encodeURIComponent(game.id))
    .then(function (resp) {
      if (!resp.ok) throw new Error('could not load the activity');
      return resp.json();
    })
    .then(function (config) {
      config.name = game.name + ' (my version)';
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
        window.location.href = '/designer/edit?game=' + encodeURIComponent(copyId) + '&from=library';
      });
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Customize';
      alert('Could not make your copy: ' + err.message);
    });
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
  note.placeholder = 'What do you want to make? (optional — the designer starts from your words, and your request also goes to the person who builds Lanyard)';
  note.style.cssText = 'width:100%; padding:12px; border:3px solid #000; border-radius:10px; font-family:"Nunito", Arial, sans-serif; font-size:0.95rem; resize:vertical; box-sizing:border-box; margin-bottom:14px;';
  modal.appendChild(note);

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';
  var goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'recipe-create-btn';
  goBtn.textContent = 'Start building';
  goBtn.addEventListener('click', function () {
    goBtn.disabled = true;
    try { localStorage.setItem('lanyard-builder', '1'); } catch (e) {}
    var message = note.value.trim();
    var payload = {
      page: '/library',
      category: 'builder-request',
      message: message.length >= 3 ? message : 'Opened the designer from the library (no note).'
    };
    // A real idea rides along as the ?idea= deep link, so the Create page
    // starts the flow from their words instead of asking again. (10+ chars
    // matches the Create page's own launch threshold.)
    var target = message.length >= 10
      ? '/designer?idea=' + encodeURIComponent(message)
      : '/designer';
    // Best-effort signal — never block the teacher on it.
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {}).finally(function () {
      window.location.href = target;
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

// Speak instead of typing — search box, the build-your-own note, feedback:
// every text box (current and future-rendered) carries the corner mic.
if (window.Speech) Speech.autoAttach();
