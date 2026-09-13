/**
 * designer.js — the game-list landing page (/designer).
 *
 * Lists the teacher's saved games and is the front door to making new ones:
 * the idea-first box (type what you want to play -> recipe matching), plus the
 * template picker, AI-generate, and recipe-picker modal flows. Hands off to the
 * editor (editor.js) once a game exists.
 */
var gamesGrid = document.getElementById('games-grid');
var loadingMessage = document.getElementById('loading-message');
var errorMessage = document.getElementById('error-message');
var ideaInput = document.getElementById('idea-input');
var ideaGoBtn = document.getElementById('idea-go-btn');
var useRecipeLink = document.getElementById('use-recipe-link');

var allGames = [];

// The activity grid moved to /library (docs/SURFACES-PLAN.md); this page
// only hosts the create flows now. The games list is still fetched —
// generateGameId dedupes new ids against it (skipping the fetch once made
// duplicate creations 409 on the second blank) — but rendering only
// happens where a grid exists.
fetchGames();

// --- Idea-first front door ---
// The teacher's idea is the entry point: type it, hit Make It, and the
// existing from-description flow takes over (recipe match → preview, or
// no-match → picker / advanced generator). The old three-button toolbar
// is demoted to the "prefer to build it yourself?" links below the box.

function launchIdea() {
  var idea = (ideaInput.value || '').trim();
  if (idea.length < 10) {
    ideaInput.focus();
    ideaInput.classList.add('idea-input-nudge');
    setTimeout(function () { ideaInput.classList.remove('idea-input-nudge'); }, 600);
    return;
  }
  showAIGenerateModal(idea);
}

if (ideaGoBtn) {
  ideaGoBtn.addEventListener('click', launchIdea);
}

// Speak instead of typing — every text box (idea box, recipe params,
// dialogs) gets the corner mic, current and future-rendered alike.
if (window.Speech) Speech.autoAttach();
if (ideaInput) {
  // Enter submits (ideas are usually one line); Shift+Enter makes a newline.
  ideaInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      launchIdea();
    }
  });
}

// Example chips launch straight into matching — clicking one IS the
// decision, no second "Make it" press. The sentence still lands in the
// box so the teacher sees exactly what was submitted.
var ideaChips = document.querySelectorAll('.idea-example-chip');
for (var ci = 0; ci < ideaChips.length; ci++) {
  ideaChips[ci].addEventListener('click', function (e) {
    ideaInput.value = e.currentTarget.textContent;
    launchIdea();
  });
}

if (useRecipeLink) {
  useRecipeLink.addEventListener('click', function (e) {
    e.preventDefault();
    showRecipePicker();
  });
}
// (The template picker is gone — templates consolidated into recipes
// 2026-08-07. The "Start from scratch" blank-editor link is gone too,
// 2026-08-22: every creation path now starts from an idea or a recipe.)

// Deep link: /designer?idea=... launches the flow immediately (lets the
// home screen or anything else hand an idea straight to the front door).
(function () {
  var params = new URLSearchParams(window.location.search);
  var idea = (params.get('idea') || '').trim();
  if (idea.length >= 10) {
    if (ideaInput) ideaInput.value = idea;
    showAIGenerateModal(idea);
  }
})();

async function fetchGames() {
  try {
    var response = await fetch('/api/games');
    if (!response.ok) {
      throw new Error('Failed to load games (status ' + response.status + ')');
    }
    var data = await response.json();
    allGames = data.games || [];
    if (loadingMessage) loadingMessage.hidden = true;
    if (gamesGrid) refreshLibrary();
  } catch (error) {
    if (loadingMessage) loadingMessage.hidden = true;
    if (errorMessage) {
      errorMessage.textContent = 'Error loading games: ' + error.message;
      errorMessage.hidden = false;
    }
  }
}

// The public list is curated: featured built-ins + activities made on this
// device. Owner mode shows everything (screens/shared/game-visibility.js).
function applyVisibility(games) {
  if (!window.GameVisibility) return games;
  return GameVisibility.visibleGames(games, {
    owner: window.OwnerMode ? OwnerMode.isOn() : false,
    myIds: window.MyGames ? MyGames.list() : []
  });
}

// =======================================================================
// Library: search, goal chips, favorites, recently used (2026-07-26 UI
// review wave 2). Favorites/recents are this-browser only (localStorage) —
// same no-accounts model as MyGames.
// =======================================================================

// Plain words, no emoji (Totem never-list).
var GOAL_LABELS = {
  connect: 'Connect',
  create: 'Create',
  discuss: 'Discuss',
  decide: 'Decide',
  reflect: 'Reflect',
  energize: 'Energize',
  review: 'Review'
};

var libraryQuery = '';
var activeGoal = null;

// Favorites + Recents live in screens/shared/activity-prefs.js now (shared
// with the /library page so both surfaces agree). Local aliases keep every
// call site in this file unchanged.
var Favorites = ActivityPrefs.Favorites;
var Recents = ActivityPrefs.Recents;

function matchesLibraryFilters(game) {
  if (activeGoal) {
    var tags = Array.isArray(game.tags) ? game.tags : [];
    if (tags.indexOf(activeGoal) === -1) return false;
  }
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
  if (!chipsEl) return;
  chipsEl.innerHTML = '';
  // Count activities per goal so each chip promises what it delivers
  // ("Connect 3") — the library should feel predictable.
  var counts = {};
  for (var i = 0; i < games.length; i++) {
    var tags = Array.isArray(games[i].tags) ? games[i].tags : [];
    for (var t = 0; t < tags.length; t++) {
      if (GOAL_LABELS[tags[t]]) counts[tags[t]] = (counts[tags[t]] || 0) + 1;
    }
  }
  var goals = Object.keys(GOAL_LABELS).filter(function (g) {
    return counts[g] || g === activeGoal;
  });
  if (goals.length === 0) return;
  goals.forEach(function (goal) {
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

// One entry point for every list mutation (fetch, delete, owner toggle,
// search, chips) — visibility filter, then library filters, then render.
function refreshLibrary() {
  var visible = applyVisibility(allGames);
  var controls = document.getElementById('library-controls');
  if (controls) controls.hidden = visible.length === 0;
  buildGoalChips(visible);
  renderGames(visible.filter(matchesLibraryFilters));
}

(function initLibraryControls() {
  var searchEl = document.getElementById('library-search');
  if (!searchEl) return;
  searchEl.addEventListener('input', function () {
    libraryQuery = searchEl.value.trim().toLowerCase();
    refreshLibrary();
  });
})();

function rememberMine(id) {
  if (window.MyGames) MyGames.add(id);
}

// Owner ★ toggle: durable curation via /api/games/:id/featured. Built-in
// flips land in the Neon featured_overrides table, so they SURVIVE redeploys
// (the old whole-config PUT wrote to the ephemeral disk and silently reverted
// on every push). The repo config flag stays the default; the card shows a
// marker when the live state differs from it.
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

// Owner view is entered via /owner (which lands on the library); this page
// just reflects the shared OwnerMode flag.
function exitOwnerMode() {
  if (window.OwnerMode) OwnerMode.lock();
  refreshLibrary();
}

// AI output rendered into HTML must be escaped — a model emitting stray
// markup must paint as text in the teacher's browser, never execute.
function escapeHtmlText(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function renderGames(games) {
  gamesGrid.innerHTML = '';

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
    gamesGrid.appendChild(ownerBar);
  }

  if (games.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = (libraryQuery || activeGoal)
      ? 'No matches, try a different search or clear the filter.'
      : 'Nothing here yet. Create your first activity!';
    gamesGrid.appendChild(empty);
    if (!ownerOn) appendOwnerLink();
    return;
  }

  // Sections, each game exactly once: Favorites → Recently used → My
  // Activities (user-saved) → Built-in. Favorites/recents are localStorage
  // (this browser), source is set server-side; legacy payloads without a
  // source count as built-in.
  var favIds = Favorites.list();
  var recentIds = Recents.list();
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

  var favs = take(favIds);
  var recents = take(recentIds);
  var userGames = [];
  var builtIn = [];
  for (var i = 0; i < games.length; i++) {
    if (placed[games[i].id]) continue;
    if ((games[i].source || 'built-in') === 'user') userGames.push(games[i]);
    else builtIn.push(games[i]);
  }

  var sectioned = favs.length > 0 || recents.length > 0 || userGames.length > 0;
  if (favs.length > 0) appendGameSection('♥ Favorites', favs);
  if (recents.length > 0) appendGameSection('Recently used', recents);
  if (userGames.length > 0) appendGameSection('My Activities', userGames);
  if (builtIn.length > 0) {
    // Flat grid (no heading) when it's the only section.
    appendGameSection(sectioned ? 'Built-in Activities' : null, builtIn);
  }
}

function appendGameSection(headingText, games) {
  if (headingText) {
    var heading = document.createElement('h2');
    heading.className = 'games-section-heading';
    heading.textContent = headingText;
    gamesGrid.appendChild(heading);
  }

  var grid = document.createElement('div');
  grid.className = 'games-section-grid';

  for (var i = 0; i < games.length; i++) {
    grid.appendChild(buildGameCard(games[i]));
  }

  gamesGrid.appendChild(grid);
}

function buildGameCard(game) {
  // Deleting your own creations is always allowed; deleting a shipped
  // built-in is owner-only (mirrors the server rule).
  var deletable = (game.source || 'built-in') === 'user' ||
    (window.OwnerMode && OwnerMode.isOn());
  var card = document.createElement('div');
  card.className = 'game-card';
  if ((game.source || 'built-in') === 'built-in') {
    card.classList.add('game-card-built-in');
  } else {
    card.classList.add('game-card-user');
  }
  card.setAttribute('data-game-id', game.id);

  var name = document.createElement('h2');
  name.className = 'game-card-name';
  name.textContent = game.name;
  card.appendChild(name);

  var description = document.createElement('p');
  description.className = 'game-card-description';
  description.textContent = game.description || 'No description';
  card.appendChild(description);

  // Advisory metadata row — only renders fields that exist on the config.
  // Built-in games get curated values; user games show whatever they've set
  // (often nothing, which is fine — the row just stays small).
  var meta = document.createElement('div');
  meta.className = 'game-card-meta';

  if (game.playTime) {
    meta.appendChild(buildMetaBadge('', String(game.playTime)));
  }
  card.appendChild(meta);

  // Tags row (skills / categories). Renders as small chip pills.
  if (Array.isArray(game.tags) && game.tags.length > 0) {
    var tagsRow = document.createElement('div');
    tagsRow.className = 'game-card-tags';
    for (var t = 0; t < game.tags.length; t++) {
      var chip = document.createElement('span');
      chip.className = 'game-card-tag';
      chip.textContent = game.tags[t];
      tagsRow.appendChild(chip);
    }
    card.appendChild(tagsRow);
  }

  if (game.recommendedFor) {
    var rec = document.createElement('p');
    rec.className = 'game-card-recommended';
    rec.textContent = game.recommendedFor;
    card.appendChild(rec);
  }

  // Connection-family promise, made visible: the validator permanently
  // rejects scores/winners/elimination on these — say so on the card.
  if (game.family === 'connection') {
    var noWinner = document.createElement('div');
    noWinner.className = 'game-card-no-winner';
    noWinner.textContent = 'No scores, no winners';
    noWinner.title = 'A connection activity, the framework refuses to add points, rankings, or eliminations to it.';
    card.appendChild(noWinner);
  }

  // Action row — real buttons/links, not a clickable div (keyboard + screen
  // reader accessible, and the primary teacher intent is "run this NOW", so
  // Host leads). 2026-07-26 UI review.
  var actions = document.createElement('div');
  actions.className = 'game-card-actions';

  // Using an activity (any action) files it under "Recently used" next visit.
  var rememberRecent = function () { Recents.add(game.id); };

  var hostBtn = document.createElement('a');
  hostBtn.className = 'game-card-host';
  hostBtn.href = '/host?game=' + encodeURIComponent(game.id);
  // The console opens in a new tab alongside (shared/host-launch.js)
  hostBtn.addEventListener('click', function (e) {
    if (window.HostLaunch) { e.preventDefault(); HostLaunch.launch(game.id); }
  });
  hostBtn.textContent = '▶ Host';
  hostBtn.title = 'Start a live room your class can join right now';
  hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
  hostBtn.addEventListener('click', rememberRecent);
  actions.appendChild(hostBtn);

  var editBtn = document.createElement('a');
  editBtn.className = 'game-card-edit';
  editBtn.href = '/designer/edit?game=' + encodeURIComponent(game.id);
  editBtn.textContent = 'Edit';
  editBtn.title = 'Open this activity in the editor';
  editBtn.setAttribute('aria-label', 'Edit "' + game.name + '"');
  editBtn.addEventListener('click', rememberRecent);
  actions.appendChild(editBtn);

  var previewBtn = document.createElement('a');
  previewBtn.className = 'game-card-preview';
  previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
  previewBtn.textContent = 'Try it out';
  previewBtn.title = 'See the teacher and student screens side by side, with pretend students, no class needed';
  previewBtn.setAttribute('aria-label', 'Try out "' + game.name + '" with pretend students');
  previewBtn.addEventListener('click', rememberRecent);
  actions.appendChild(previewBtn);

  var favBtn = document.createElement('button');
  var isFav = Favorites.has(game.id);
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

  if (deletable) {
    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'game-card-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('data-game-id', game.id);
    deleteBtn.setAttribute('data-game-name', game.name);
    deleteBtn.setAttribute('aria-label', 'Delete "' + game.name + '"');
    deleteBtn.addEventListener('click', handleDeleteClick);
    actions.appendChild(deleteBtn);
  }

  card.appendChild(actions);

  // Owner curation: star = shown to the public. Click stays on the card
  // (no navigation) — mirrors the delete button's stopPropagation approach.
  if (window.OwnerMode && OwnerMode.isOn()) {
    var starBtn = document.createElement('button');
    starBtn.className = 'game-card-star' + (game.featured ? ' is-featured' : '');
    // Live state can legitimately differ from the repo's default (overrides
    // live in the DB) — mark the drift so it's visible, never silent.
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

function buildMetaBadge(icon, text) {
  var badge = document.createElement('span');
  badge.className = 'game-card-meta-badge';
  badge.textContent = (icon ? icon + ' ' : '') + text;
  return badge;
}


async function handleDeleteClick(e) {
  e.stopPropagation();
  var btn = e.currentTarget;
  var id = btn.getAttribute('data-game-id');
  var name = btn.getAttribute('data-game-name');

  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

  try {
    var response = await fetch('/api/games/' + encodeURIComponent(id), {
      method: 'DELETE'
    });
    var result = await response.json();

    if (response.ok) {
      // Remove from allGames and this device's "mine" list, then re-render
      // (refreshLibrary handles sections and the empty state).
      allGames = allGames.filter(function (g) { return g.id !== id; });
      if (window.MyGames) MyGames.remove(id);
      refreshLibrary();
    } else {
      alert('Delete failed: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Delete failed: ' + error.message);
  }
}

// --- Template Picker ---

function generateGameId(templateKey) {
  var base = templateKey;
  var existingIds = allGames.map(function (g) { return g.id; });

  if (existingIds.indexOf(base) === -1) return base;

  var counter = 2;
  while (existingIds.indexOf(base + '-' + counter) !== -1) {
    counter++;
  }
  return base + '-' + counter;
}

// --- Modal plumbing (shared/dialog.js does the a11y heavy lifting) ---

// Close a Dialog-enhanced overlay properly (unbind keys, restore focus);
// falls back to a plain remove for anything not enhanced.
function closeOverlay(overlay) {
  if (overlay && overlay._dlg) overlay._dlg.close();
  else if (overlay) overlay.remove();
}

// Multi-view modals swap their content — clear everything EXCEPT the
// dialog's × close button so it survives view changes.
function clearModal(modal) {
  var kids = Array.prototype.slice.call(modal.children);
  for (var i = 0; i < kids.length; i++) {
    if (!(kids[i].classList && kids[i].classList.contains('dialog-close-btn'))) {
      kids[i].remove();
    }
  }
}

// =======================================================================
// Recipe picker (R2)
//
// Flow: button → picker modal (cards) → param form (per-recipe) →
// compile + save + redirect to editor.
//
// State is shared inside one modal element so the user can flip
// between picker and form without losing the recipe list.
// =======================================================================

async function showRecipePicker() {
  // Remove any existing modal
  var existing = document.getElementById('recipe-picker-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'recipe-picker-modal';
  overlay.className = 'template-picker-overlay';

  var modal = document.createElement('div');
  modal.className = 'template-picker-modal recipe-picker-modal';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay._dlg = Dialog.enhance(overlay, modal, { title: 'Pick a Recipe' });

  // Initial loading state
  var loadingEl = document.createElement('p');
  loadingEl.className = 'recipe-loading';
  loadingEl.textContent = 'Loading recipes…';
  modal.appendChild(loadingEl);

  // Fetch recipes
  var recipes;
  try {
    var resp = await fetch('/api/recipes');
    if (!resp.ok) throw new Error('status ' + resp.status);
    recipes = await resp.json();
  } catch (err) {
    clearModal(modal);
    var errEl = document.createElement('p');
    errEl.style.cssText = 'color:var(--t-red-text, #B02D12); padding:20px; text-align:center;';
    errEl.textContent = 'Could not load recipes: ' + err.message;
    modal.appendChild(errEl);
    return;
  }

  if (!recipes || recipes.length === 0) {
    clearModal(modal);
    var emptyEl = document.createElement('p');
    emptyEl.style.cssText = 'padding:20px; text-align:center;';
    emptyEl.textContent = 'No recipes are available yet.';
    modal.appendChild(emptyEl);
    return;
  }

  renderRecipePickerView(modal, recipes, overlay);
}

function renderRecipePickerView(modal, recipes, overlay) {
  clearModal(modal);

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Pick a Recipe';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Each recipe is a ready-to-go classroom activity. Pick one and fill in a few details.';
  modal.appendChild(subtitle);

  // Split into user-saved + built-in. Within each group, broken recipes
  // sort to the bottom so working ones are reached first.
  var userRecipes = [];
  var builtInRecipes = [];
  for (var i = 0; i < recipes.length; i++) {
    if (recipes[i].source === 'user') userRecipes.push(recipes[i]);
    else builtInRecipes.push(recipes[i]);
  }
  userRecipes.sort(brokenLast);
  builtInRecipes.sort(brokenLast);

  if (userRecipes.length > 0) {
    appendRecipeSection(modal, 'My Recipes', userRecipes, recipes, overlay, /*deletable*/ true);
  }
  if (builtInRecipes.length > 0) {
    appendRecipeSection(
      modal,
      userRecipes.length > 0 ? 'Built-in Recipes' : null,
      builtInRecipes,
      recipes,
      overlay,
      false
    );
  }
  if (userRecipes.length === 0 && builtInRecipes.length === 0) {
    var empty = document.createElement('p');
    empty.style.cssText = 'text-align:center; padding:40px; color:#555;';
    empty.textContent = 'No recipes available.';
    modal.appendChild(empty);
  }
}

function brokenLast(a, b) {
  return (a.broken ? 1 : 0) - (b.broken ? 1 : 0);
}

function appendRecipeSection(modal, headingText, recipes, allRecipes, overlay, deletable) {
  if (headingText) {
    var heading = document.createElement('h3');
    heading.className = 'recipe-section-heading';
    heading.textContent = headingText;
    modal.appendChild(heading);
  }

  var grid = document.createElement('div');
  grid.className = 'template-picker-grid recipe-picker-grid';

  for (var i = 0; i < recipes.length; i++) {
    grid.appendChild(buildRecipeCard(modal, recipes[i], allRecipes, overlay, deletable));
  }

  modal.appendChild(grid);
}

function buildRecipeCard(modal, recipe, allRecipes, overlay, deletable) {
  // A real <button> can't nest the delete button, so the card gets button
  // semantics by hand: role, tab stop, Enter/Space activation.
  var card = document.createElement('div');
  card.className = 'template-card recipe-card';
  card.setAttribute('data-recipe-id', recipe.id);
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.setAttribute('aria-label', 'Use recipe: ' + recipe.name);
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      renderRecipeFormView(modal, recipe, allRecipes, overlay);
    }
  });
  if (recipe.broken) card.classList.add('recipe-card-broken');

  var cardName = document.createElement('div');
  cardName.className = 'template-card-name';
  cardName.textContent = recipe.name;
  card.appendChild(cardName);

  var cardDesc = document.createElement('div');
  cardDesc.className = 'template-card-desc';
  cardDesc.textContent = recipe.description;
  card.appendChild(cardDesc);

  if (recipe.tagline) {
    var cardTagline = document.createElement('div');
    cardTagline.className = 'recipe-card-tagline';
    cardTagline.textContent = recipe.tagline;
    card.appendChild(cardTagline);
  }

  if (recipe.broken) {
    var brokenBadge = document.createElement('div');
    brokenBadge.className = 'recipe-card-broken-badge';
    brokenBadge.textContent = '⚠ Needs update';
    brokenBadge.title = recipe.brokenReason || 'This recipe is incompatible with the current schema.';
    card.appendChild(brokenBadge);
  }

  // Click → open form. Broken recipes can still be opened so the
  // teacher can see what's wrong (compile will fail with diagnostics).
  card.addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('recipe-card-delete')) {
      return; // delete button handled separately
    }
    renderRecipeFormView(modal, recipe, allRecipes, overlay);
  });

  if (deletable) {
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'recipe-card-delete';
    del.textContent = '✕';
    del.title = 'Delete this recipe';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      handleRecipeDelete(recipe, overlay);
    });
    card.appendChild(del);
  }

  return card;
}

async function handleRecipeDelete(recipe, overlay) {
  if (!confirm('Delete recipe "' + recipe.name + '"? This cannot be undone.')) return;
  try {
    var resp = await fetch('/api/recipes/user/' + encodeURIComponent(recipe.id), {
      method: 'DELETE'
    });
    if (!resp.ok) {
      var data;
      try { data = await resp.json(); } catch (e) { data = {}; }
      alert('Delete failed: ' + (data.error || 'Unknown error'));
      return;
    }
    // Re-fetch + re-render the picker so the list reflects the deletion
    closeOverlay(overlay);
    showRecipePicker();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// =======================================================================
// Recipe parameter form
// =======================================================================

// The treasure map: what this recipe builds, the same drawn trail the
// library's activity popups show. Renders into `mount` when the map is
// available; quietly does nothing otherwise (the map is garnish).
function appendRecipeMap(mount, map) {
  if (!map || !Array.isArray(map.stops) || map.stops.length === 0) return;
  if (!window.ActivityMap) return;
  var label = document.createElement('p');
  label.className = 'recipe-map-label';
  label.textContent = 'What happens';
  mount.appendChild(label);
  mount.appendChild(ActivityMap.render(map));
}

function renderRecipeFormView(modal, recipe, allRecipes, overlay) {
  clearModal(modal);

  // Header with back button
  var headerRow = document.createElement('div');
  headerRow.className = 'recipe-form-header';

  var backBtn = document.createElement('button');
  backBtn.className = 'recipe-back-btn';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', function () {
    renderRecipePickerView(modal, allRecipes, overlay);
  });
  headerRow.appendChild(backBtn);

  var titleWrap = document.createElement('div');
  titleWrap.className = 'recipe-form-title-wrap';

  var title = document.createElement('h2');
  title.className = 'recipe-form-title';
  title.textContent = recipe.name;
  titleWrap.appendChild(title);

  headerRow.appendChild(titleWrap);
  modal.appendChild(headerRow);

  var desc = document.createElement('p');
  desc.className = 'recipe-form-description';
  desc.textContent = recipe.description;
  modal.appendChild(desc);

  // The recipe's map at its default settings, drawn while the teacher
  // reads the form (arrives async into this mount, the form never jumps).
  var mapMount = document.createElement('div');
  mapMount.className = 'recipe-map-mount';
  modal.appendChild(mapMount);
  fetch('/api/recipes/' + encodeURIComponent(recipe.id) + '/map')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (map) {
      if (map && mapMount.isConnected) appendRecipeMap(mapMount, map);
    })
    .catch(function () { /* no map, no problem */ });

  // Form
  var form = document.createElement('form');
  form.className = 'recipe-form';
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  var paramNames = Object.keys(recipe.parameters || {});
  for (var i = 0; i < paramNames.length; i++) {
    var name = paramNames[i];
    var spec = recipe.parameters[name];
    form.appendChild(buildField(name, spec));
  }

  modal.appendChild(form);

  // Status / error display
  var status = document.createElement('div');
  status.className = 'recipe-form-status';
  status.id = 'recipe-form-status';
  modal.appendChild(status);

  // Buttons row
  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'recipe-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function () { closeOverlay(overlay); });
  btnRow.appendChild(cancelBtn);

  var createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'recipe-create-btn';
  createBtn.textContent = 'Create Activity';
  createBtn.addEventListener('click', function () {
    submitRecipeForm(modal, recipe, form, status, createBtn, overlay);
  });
  btnRow.appendChild(createBtn);

  modal.appendChild(btnRow);

  // Focus the first input for fast typing
  var firstInput = form.querySelector('input, textarea, select');
  if (firstInput) firstInput.focus();
}

// =======================================================================
// Field rendering — one widget per parameter type
// =======================================================================

function buildField(name, spec) {
  var wrap = document.createElement('div');
  wrap.className = 'recipe-field';
  wrap.setAttribute('data-param-name', name);
  wrap.setAttribute('data-param-type', spec.type);

  var label = document.createElement('label');
  label.className = 'recipe-field-label';
  label.textContent = spec.label || name;
  if (spec.required) {
    var requiredMark = document.createElement('span');
    requiredMark.className = 'recipe-field-required';
    requiredMark.textContent = ' *';
    label.appendChild(requiredMark);
  }
  wrap.appendChild(label);

  if (spec.helper) {
    var helper = document.createElement('div');
    helper.className = 'recipe-field-helper';
    helper.textContent = spec.helper;
    wrap.appendChild(helper);
  }

  var input = buildInputForType(name, spec);
  wrap.appendChild(input);

  return wrap;
}

function buildInputForType(name, spec) {
  switch (spec.type) {
    case 'string':
      return buildStringInput(name, spec, false);
    case 'templateString':
      // Use textarea for templates so multi-line prompts feel natural
      return buildStringInput(name, spec, true);
    case 'promptDeck':
      // A string the teacher usually PICKS from a curated deck (and may
      // then edit) rather than writes from scratch.
      return buildPromptDeckInput(name, spec);
    case 'integer':
      return buildIntegerInput(name, spec);
    case 'boolean':
      return buildBooleanInput(name, spec);
    case 'enum':
      return buildEnumInput(name, spec);
    case 'array':
      return buildArrayInput(name, spec);
    default:
      var fallback = document.createElement('div');
      fallback.style.color = '#FF2D2D';
      fallback.textContent = 'Unknown parameter type "' + spec.type + '"';
      return fallback;
  }
}

function buildStringInput(name, spec, multiline) {
  var input = document.createElement(multiline ? 'textarea' : 'input');
  input.className = 'recipe-field-input';
  input.setAttribute('data-param-name', name);
  if (!multiline) input.type = 'text';
  if (multiline) input.rows = 2;
  if (spec.placeholder) input.placeholder = spec.placeholder;
  if (spec.default != null) input.value = spec.default;
  return input;
}

// --- promptDeck: a textarea + "pick from the deck" (library-first B3) ---

var promptBankCache = {};

function fetchPromptBank(bankId) {
  if (promptBankCache[bankId]) return Promise.resolve(promptBankCache[bankId]);
  return fetch('/api/prompt-banks/' + encodeURIComponent(bankId))
    .then(function (resp) {
      if (!resp.ok) throw new Error('status ' + resp.status);
      return resp.json();
    })
    .then(function (bank) {
      promptBankCache[bankId] = bank;
      return bank;
    });
}

// Does this deck fit the teacher's saved class profile (subject match, and
// grade band not explicitly excluded)? Decks without subject metadata never
// match — they're the generic pool, not a personalized pick.
function deckMatchesClass(deck, profile) {
  if (!profile || !deck || !Array.isArray(deck.subjects)) return false;
  if (!Array.isArray(profile.subjects) || profile.subjects.length === 0) return false;
  var subjectHit = deck.subjects.some(function (s) {
    return profile.subjects.indexOf(s) !== -1;
  });
  if (!subjectHit) return false;
  if (Array.isArray(deck.gradeBands) && profile.gradeBand &&
      deck.gradeBands.indexOf(profile.gradeBand) === -1) return false;
  return true;
}

function buildPromptDeckInput(name, spec) {
  var wrap = document.createElement('div');

  var input = document.createElement('textarea');
  input.className = 'recipe-field-input';
  input.setAttribute('data-param-name', name);
  input.rows = 2;
  if (spec.placeholder) input.placeholder = spec.placeholder;
  if (spec.default != null) input.value = spec.default;
  wrap.appendChild(input);

  var pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'prompt-deck-btn';
  pickBtn.textContent = 'Pick from the deck';
  if (spec.deckHelper) pickBtn.title = spec.deckHelper;
  pickBtn.addEventListener('click', function () {
    openDeckPicker(spec, input);
  });
  wrap.appendChild(pickBtn);

  prefillFromClassDeck(spec, input, wrap);

  return wrap;
}

// Fill the untouched default with a prompt that fits the teacher's saved
// class (their subject, their grade band). Best-effort: any hiccup leaves
// the generic default in place. Prompts carrying answer choices are skipped
// so a prefill never half-fills a companion choices param.
function prefillFromClassDeck(spec, input, wrap) {
  var profile = window.TeacherProfile ? TeacherProfile.get() : null;
  if (!profile || !spec.bank || !Array.isArray(spec.decks)) return;
  fetchPromptBank(spec.bank).then(function (bank) {
    var candidates = [];
    spec.decks.forEach(function (deckId) {
      var deck = (bank.decks || []).find(function (d) { return d.id === deckId; });
      if (!deck || !deckMatchesClass(deck, profile)) return;
      (deck.prompts || []).forEach(function (prompt) {
        if (!prompt.choices) candidates.push(prompt);
      });
    });
    // Only replace a value the teacher hasn't touched.
    if (candidates.length === 0 || input.value !== (spec.default != null ? spec.default : '')) return;
    var pick = candidates[Math.floor(Math.random() * candidates.length)];
    input.value = pick.text;
    var note = document.createElement('div');
    note.className = 'recipe-field-helper';
    note.textContent = 'Filled in for your class. Edit it, or pick another from the deck.';
    wrap.appendChild(note);
  }).catch(function () { /* generic default stays — the picker still works */ });
}

// Fill an array param's rows programmatically (poll choices from a picked
// prompt). Row removal is delegated on the list element, so replacing rows
// is safe.
function setArrayFieldValues(paramName, values) {
  var fieldWrap = document.querySelector('.recipe-field[data-param-name="' + paramName + '"]');
  if (!fieldWrap) return;
  var list = fieldWrap.querySelector('.recipe-field-array-items');
  if (!list) return;
  list.innerHTML = '';
  for (var i = 0; i < values.length; i++) {
    list.appendChild(buildArrayItemRow({ item: { type: 'string' } }, values[i]));
  }
}

function openDeckPicker(spec, targetInput) {
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal deck-picker-modal';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  var dlg = Dialog.enhance(overlay, modal, { title: 'Pick a prompt' });

  var loading = document.createElement('p');
  loading.className = 'recipe-loading';
  loading.textContent = 'Shuffling the deck…';
  modal.appendChild(loading);

  fetchPromptBank(spec.bank).then(function (bank) {
    loading.remove();

    var title = document.createElement('h2');
    title.className = 'template-picker-title';
    title.textContent = 'Pick a prompt';
    modal.appendChild(title);

    if (spec.deckHelper) {
      var sub = document.createElement('p');
      sub.className = 'template-picker-subtitle';
      sub.textContent = spec.deckHelper;
      modal.appendChild(sub);
    }

    var deckIds = Array.isArray(spec.decks) ? spec.decks : [];
    var profile = window.TeacherProfile ? TeacherProfile.get() : null;
    var decks = deckIds.map(function (deckId) {
      return (bank.decks || []).find(function (d) { return d.id === deckId; });
    }).filter(function (d) { return d && d.prompts && d.prompts.length > 0; });
    // Decks that fit the teacher's saved class float to the top, marked.
    decks.sort(function (a, b) {
      return (deckMatchesClass(b, profile) ? 1 : 0) - (deckMatchesClass(a, profile) ? 1 : 0);
    });
    decks.forEach(function (deck) {
      var heading = document.createElement('h3');
      heading.className = 'deck-heading';
      heading.textContent = deck.label +
        (deckMatchesClass(deck, profile) ? ' · for your class' : '');
      modal.appendChild(heading);

      if (deck.description) {
        var desc = document.createElement('p');
        desc.className = 'deck-description';
        desc.textContent = deck.description;
        modal.appendChild(desc);
      }

      deck.prompts.forEach(function (prompt) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'deck-prompt';

        var text = document.createElement('span');
        text.className = 'deck-prompt-text';
        text.textContent = prompt.text;
        card.appendChild(text);

        var metaBits = [];
        if (prompt.choices) metaBits.push(prompt.choices.length + ' answer choices included');
        if (prompt.author) metaBits.push(prompt.author);
        if (metaBits.length) {
          var metaEl = document.createElement('span');
          metaEl.className = 'deck-prompt-meta';
          metaEl.textContent = metaBits.join(' · ');
          card.appendChild(metaEl);
        }

        card.addEventListener('click', function () {
          targetInput.value = prompt.text;
          if (spec.choicesParam && prompt.choices) {
            setArrayFieldValues(spec.choicesParam, prompt.choices);
          }
          dlg.close();
        });
        modal.appendChild(card);
      });
    });
  }).catch(function (err) {
    loading.textContent = 'Could not load the deck (' + err.message + '), you can still write your own.';
  });
}

function buildIntegerInput(name, spec) {
  var input = document.createElement('input');
  input.className = 'recipe-field-input';
  input.type = 'number';
  input.setAttribute('data-param-name', name);
  if (spec.min != null) input.min = spec.min;
  if (spec.max != null) input.max = spec.max;
  if (spec.placeholder) input.placeholder = spec.placeholder;
  if (spec.default != null) input.value = spec.default;
  return input;
}

function buildBooleanInput(name, spec) {
  var wrap = document.createElement('label');
  wrap.className = 'recipe-field-checkbox-wrap';

  var input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'recipe-field-checkbox';
  input.setAttribute('data-param-name', name);
  if (spec.default === true) input.checked = true;
  wrap.appendChild(input);

  var span = document.createElement('span');
  span.className = 'recipe-field-checkbox-text';
  span.textContent = spec.helper || 'Yes';
  wrap.appendChild(span);

  return wrap;
}

function buildEnumInput(name, spec) {
  var sel = document.createElement('select');
  sel.className = 'recipe-field-input';
  sel.setAttribute('data-param-name', name);
  for (var i = 0; i < spec.values.length; i++) {
    var opt = document.createElement('option');
    opt.value = spec.values[i];
    opt.textContent = spec.values[i];
    if (spec.values[i] === spec.default) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function buildArrayInput(name, spec) {
  var wrap = document.createElement('div');
  wrap.className = 'recipe-field-array';
  wrap.setAttribute('data-param-name', name);

  var list = document.createElement('div');
  list.className = 'recipe-field-array-items';
  wrap.appendChild(list);

  // Initial values: from default, or one empty row
  var initialValues = Array.isArray(spec.default) ? spec.default.slice() : [''];
  for (var i = 0; i < initialValues.length; i++) {
    list.appendChild(buildArrayItemRow(spec, initialValues[i]));
  }

  // Add-item button
  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'recipe-field-array-add';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', function () {
    var max = spec.maxItems;
    if (max != null && list.children.length >= max) {
      addBtn.disabled = true;
      return;
    }
    list.appendChild(buildArrayItemRow(spec, ''));
    updateArrayAddDisabled(list, addBtn, spec);
  });
  wrap.appendChild(addBtn);

  // Wire up row-remove + initial add-button state
  bindArrayRowControls(list, addBtn, spec);
  updateArrayAddDisabled(list, addBtn, spec);

  return wrap;
}

function buildArrayItemRow(spec, value) {
  var row = document.createElement('div');
  row.className = 'recipe-field-array-row';

  if (spec.item && spec.item.type === 'object' && spec.item.fields) {
    // Object items (e.g. quiz-show questions) render as a card with one
    // labeled input per declared field. Array sub-fields (the choices)
    // are a single comma-separated input — simple beats nested repeaters.
    row.className += ' recipe-field-array-row-object';
    var card = document.createElement('div');
    card.className = 'recipe-object-card';

    var fieldKeys = Object.keys(spec.item.fields);
    for (var fi = 0; fi < fieldKeys.length; fi++) {
      var key = fieldKeys[fi];
      var fspec = spec.item.fields[key];

      var lab = document.createElement('label');
      lab.className = 'recipe-object-field-label';
      lab.textContent = fspec.label || key;
      card.appendChild(lab);

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'recipe-field-input recipe-object-field-input';
      input.setAttribute('data-field-key', key);
      if (fspec.type === 'array') {
        input.setAttribute('data-field-type', 'array');
        input.placeholder = fspec.placeholder || 'Comma-separated, e.g. Red, Green, Blue';
      } else if (fspec.placeholder) {
        input.placeholder = fspec.placeholder;
      }
      var v = (value && typeof value === 'object') ? value[key] : undefined;
      if (v != null) input.value = Array.isArray(v) ? v.join(', ') : v;
      card.appendChild(input);
    }
    row.appendChild(card);
  } else {
    // String items (the v1 widget)
    var strInput = document.createElement('input');
    strInput.type = 'text';
    strInput.className = 'recipe-field-input';
    strInput.value = (typeof value === 'string' ? value : '') || '';
    if (spec.item && spec.item.placeholder) {
      strInput.placeholder = spec.item.placeholder;
    }
    row.appendChild(strInput);
  }

  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'recipe-field-array-remove';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove this item';
  row.appendChild(removeBtn);

  return row;
}

function bindArrayRowControls(list, addBtn, spec) {
  list.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('recipe-field-array-remove')) {
      var min = spec.minItems != null ? spec.minItems : 1;
      if (list.children.length <= min) {
        // Don't go below the minimum — just clear the values instead
        var inputs = e.target.parentNode.querySelectorAll('input');
        for (var ci = 0; ci < inputs.length; ci++) inputs[ci].value = '';
        return;
      }
      e.target.parentNode.remove();
      updateArrayAddDisabled(list, addBtn, spec);
    }
  });
}

function updateArrayAddDisabled(list, addBtn, spec) {
  var max = spec.maxItems;
  addBtn.disabled = (max != null && list.children.length >= max);
}

// =======================================================================
// Form submission — gather → compile → save → redirect
// =======================================================================

function gatherFormParams(form) {
  var params = {};
  var fields = form.querySelectorAll('.recipe-field');

  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var name = field.getAttribute('data-param-name');
    var type = field.getAttribute('data-param-type');

    if (type === 'array') {
      var objRows = field.querySelectorAll('.recipe-field-array-row-object');
      if (objRows.length > 0) {
        // Object items: one object per card, comma-split for array fields,
        // fully-empty cards skipped.
        var objArr = [];
        for (var r = 0; r < objRows.length; r++) {
          var obj = {};
          var any = false;
          var fieldInputs = objRows[r].querySelectorAll('[data-field-key]');
          for (var k = 0; k < fieldInputs.length; k++) {
            var fkey = fieldInputs[k].getAttribute('data-field-key');
            var raw = fieldInputs[k].value.trim();
            if (raw === '') continue;
            any = true;
            if (fieldInputs[k].getAttribute('data-field-type') === 'array') {
              obj[fkey] = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            } else {
              obj[fkey] = raw;
            }
          }
          if (any) objArr.push(obj);
        }
        params[name] = objArr;
      } else {
        var inputs = field.querySelectorAll('.recipe-field-array-row input');
        var arr = [];
        for (var j = 0; j < inputs.length; j++) {
          var v = inputs[j].value.trim();
          if (v !== '') arr.push(v);
        }
        params[name] = arr;
      }
    } else if (type === 'boolean') {
      var checkbox = field.querySelector('.recipe-field-checkbox');
      params[name] = !!checkbox.checked;
    } else if (type === 'integer') {
      var intInput = field.querySelector('input[type="number"]');
      // Pass as string; the server-side compiler coerces "30" → 30.
      // Sending an empty string for a defaulted param is fine — the
      // compiler's applyDefaults() handles it.
      params[name] = intInput.value === '' ? null : intInput.value;
    } else {
      // string, templateString, enum
      var input = field.querySelector('.recipe-field-input');
      params[name] = input ? input.value : '';
    }
  }

  // Strip null/empty so applyDefaults() can fill in
  var stripped = {};
  for (var key in params) {
    var val = params[key];
    if (val === null || val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    stripped[key] = val;
  }
  return stripped;
}

async function submitRecipeForm(modal, recipe, form, status, createBtn, overlay) {
  status.textContent = '';
  status.className = 'recipe-form-status';
  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';

  var params = gatherFormParams(form);

  // Compile via the API
  var compileResp;
  try {
    compileResp = await fetch('/api/recipes/' + encodeURIComponent(recipe.id) + '/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: params })
    });
  } catch (err) {
    showFormError(status, 'Network error: ' + err.message);
    createBtn.disabled = false;
    createBtn.textContent = 'Create Activity';
    return;
  }

  var compileData;
  try {
    compileData = await compileResp.json();
  } catch (err) {
    showFormError(status, 'Recipe service returned an unexpected response.');
    createBtn.disabled = false;
    createBtn.textContent = 'Create Activity';
    return;
  }

  if (!compileResp.ok) {
    showFormDiagnostics(status, compileData);
    createBtn.disabled = false;
    createBtn.textContent = 'Create Activity';
    return;
  }

  // Generate a unique game id from the recipe id (e.g. "class-poll", "class-poll-2")
  var newId = generateGameId(recipe.id);

  var saveResp;
  try {
    saveResp = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId, config: compileData.config })
    });
  } catch (err) {
    showFormError(status, 'Save failed: ' + err.message);
    createBtn.disabled = false;
    createBtn.textContent = 'Create Activity';
    return;
  }

  if (saveResp.ok) {
    rememberMine(newId);
    overlay.remove();
    window.location.href = '/designer/edit?game=' + encodeURIComponent(newId);
  } else {
    var saveData;
    try { saveData = await saveResp.json(); } catch (e) { saveData = {}; }
    showFormError(status, 'Save failed: ' + (saveData.error || 'Unknown error'));
    createBtn.disabled = false;
    createBtn.textContent = 'Create Activity';
  }
}

function showFormError(status, message) {
  status.className = 'recipe-form-status recipe-form-status-error';
  status.textContent = message;
}

function showFormDiagnostics(status, data) {
  status.className = 'recipe-form-status recipe-form-status-error';
  status.innerHTML = '';

  var heading = document.createElement('strong');
  heading.textContent = data.error || 'Please fix these issues:';
  status.appendChild(heading);

  if (data.diagnostics && data.diagnostics.length > 0) {
    var ul = document.createElement('ul');
    ul.className = 'recipe-form-diagnostic-list';
    for (var i = 0; i < data.diagnostics.length; i++) {
      var d = data.diagnostics[i];
      if (d.severity !== 'error') continue;
      var li = document.createElement('li');
      li.textContent = d.message;
      ul.appendChild(li);
    }
    status.appendChild(ul);
  }
}

// =======================================================================
// AI Generate flow (R4) — recipe-matcher first, custom-build as fallback
//
// Flow:
//   1. Teacher types description.
//   2. POST /api/games/from-description → AI matches a recipe + fills params.
//   3. On match: show preview ("Sounds like Class Poll. Here's what I'd set up:")
//      → confirm → save → redirect to editor.
//   4. On no-match: show reason + suggestion. Buttons: pick a recipe, or
//      plan it step by step (storyboard → validated bricks).
//
// Why the legacy whole-config generator is GONE (2026-08-07): it asked AI
// to emit a 200-line JSON config, which malformed roughly 1-in-N times
// (real bug observed at position 14640 on feedback-coach-academy). The
// matcher emits a tiny structured object — the failure mode is "no match,"
// not parse error — and the storyboard compiles only validated bricks.
// =======================================================================

function showAIGenerateModal(initialDescription) {
  var existing = document.getElementById('ai-match-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'ai-match-modal';
  overlay.className = 'template-picker-overlay';

  var modal = document.createElement('div');
  modal.className = 'template-picker-modal recipe-picker-modal';
  modal.style.maxWidth = '640px';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay._dlg = Dialog.enhance(overlay, modal, { title: 'Describe Your Activity' });

  renderAIDescriptionStep(modal, overlay, initialDescription);
}

function renderAIDescriptionStep(modal, overlay, initialDescription) {
  clearModal(modal);

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Describe Your Activity';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Tell us what you want and AI will pick a recipe and fill in the details.';
  modal.appendChild(subtitle);

  var textarea = document.createElement('textarea');
  textarea.id = 'ai-match-description';
  textarea.placeholder = 'Example: A quick poll about what we should have for lunch, choices are pizza, sushi, tacos, salad.\n\nOr: A 4-round elimination game where students write puns and the bottom 30% gets eliminated each round.';
  textarea.rows = 5;
  textarea.className = 'recipe-field-input';
  textarea.style.cssText = 'width:100%; resize:vertical; box-sizing:border-box; margin:0 0 16px 0;';
  if (initialDescription) textarea.value = initialDescription;
  modal.appendChild(textarea);

  var status = document.createElement('div');
  status.className = 'recipe-form-status';
  status.id = 'ai-match-status';
  modal.appendChild(status);

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'recipe-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function () { closeOverlay(overlay); });
  btnRow.appendChild(cancelBtn);

  var generateBtn = document.createElement('button');
  generateBtn.type = 'button';
  generateBtn.className = 'recipe-create-btn';
  generateBtn.textContent = 'Generate';
  generateBtn.addEventListener('click', function () {
    var desc = textarea.value.trim();
    if (desc.length < 10) {
      showFormError(status, 'Please write a longer description (at least 10 characters).');
      return;
    }
    submitAIDescription(modal, desc, status, generateBtn, overlay);
  });
  btnRow.appendChild(generateBtn);

  modal.appendChild(btnRow);

  textarea.focus();

  // Front-door path: the idea was already typed in the hero box — skip
  // straight to matching instead of asking the teacher to re-confirm.
  if (initialDescription && initialDescription.trim().length >= 10) {
    submitAIDescription(modal, initialDescription.trim(), status, generateBtn, overlay);
  }
}

async function submitAIDescription(modal, description, status, generateBtn, overlay) {
  status.textContent = '';
  status.className = 'recipe-form-status recipe-form-status-working';
  status.textContent = 'AI is matching your idea to a recipe…';
  generateBtn.disabled = true;
  generateBtn.textContent = 'Thinking…';

  try {
    var resp = await fetch('/api/games/from-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description })
    });
    var data = await resp.json();

    if (!resp.ok) {
      showFormError(status, data.error || 'AI matcher failed. Try again.');
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate';
      return;
    }

    if (data.noMatch) {
      renderNoMatchView(modal, description, data, overlay);
      return;
    }

    if (data.existingGame) {
      renderExistingGameView(modal, data, overlay, description);
      return;
    }

    if (data.config) {
      renderMatchPreview(modal, data, overlay, description);
      return;
    }

    showFormError(status, 'Unexpected response from AI matcher.');
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  } catch (err) {
    showFormError(status, 'Network error: ' + err.message);
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }
}

function renderMatchPreview(modal, data, overlay, description) {
  clearModal(modal);

  // Header — "Sounds like {recipe.name}"
  var headerRow = document.createElement('div');
  headerRow.className = 'recipe-form-header';

  var titleWrap = document.createElement('div');
  titleWrap.className = 'recipe-form-title-wrap';

  var title = document.createElement('h2');
  title.className = 'recipe-form-title';
  title.textContent = 'Sounds like ' + data.recipe.name;
  titleWrap.appendChild(title);

  headerRow.appendChild(titleWrap);
  modal.appendChild(headerRow);

  if (data.explanation) {
    var explain = document.createElement('p');
    explain.className = 'recipe-form-description';
    explain.textContent = data.explanation;
    modal.appendChild(explain);
  }

  // Running time, computed by the server from the timers (never the AI's
  // word). When it runs over the minutes the teacher asked for, the server
  // sends a trimmed copy and the note names the exact timer changes.
  appendTimingNote(modal, data, function (trimmed) {
    var next = {};
    for (var k in data) next[k] = data[k];
    next.config = trimmed.config;
    if (trimmed.params) next.params = trimmed.params; // the settings list follows the timers
    var stillOver = data.timing.requestedMinutes && trimmed.estimatedMinutes > data.timing.requestedMinutes;
    next.timing = {
      estimatedMinutes: trimmed.estimatedMinutes,
      requestedMinutes: data.timing.requestedMinutes,
      over: !!stillOver,
      trim: null,
      note: 'Timers trimmed: about ' + trimmed.estimatedMinutes + ' minutes now.' +
        (stillOver ? ' Still over your ' + data.timing.requestedMinutes + '. Drop a step in the editor to get under.' : '')
    };
    renderMatchPreview(modal, next, overlay, description);
  });

  // Show the params that AI filled in (read-only display)
  var paramsHeader = document.createElement('p');
  paramsHeader.style.cssText = 'margin:0 0 8px 0; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; font-size:0.85rem;';
  paramsHeader.textContent = "Here's what I'd set up:";
  modal.appendChild(paramsHeader);

  var paramsList = document.createElement('div');
  paramsList.className = 'ai-match-params';
  for (var key in data.params) {
    var row = document.createElement('div');
    row.className = 'ai-match-param-row';

    var label = document.createElement('div');
    label.className = 'ai-match-param-label';
    // The recipe's own label ("Tier 1, light & playful"), never the raw
    // param id; humanize as a fallback for labels the server didn't send.
    label.textContent = (data.paramLabels && data.paramLabels[key]) || humanizeParamName(key);
    row.appendChild(label);

    var value = document.createElement('div');
    value.className = 'ai-match-param-value';
    var v = data.params[key];
    if (Array.isArray(v)) {
      // One line per item — prompt lists joined with commas read as one
      // run-on sentence ("...why?, If our class had a mascot...").
      for (var vi = 0; vi < v.length; vi++) {
        var line = document.createElement('div');
        line.className = 'ai-match-param-item';
        var item = v[vi];
        line.textContent = (item && typeof item === 'object')
          ? (item.text || JSON.stringify(item))
          : String(item);
        value.appendChild(line);
      }
    } else {
      value.textContent = String(v);
    }
    row.appendChild(value);

    paramsList.appendChild(row);
  }
  modal.appendChild(paramsList);

  // The matched activity's map: what those settings actually build.
  var matchMapMount = document.createElement('div');
  matchMapMount.className = 'recipe-map-mount';
  modal.appendChild(matchMapMount);
  appendRecipeMap(matchMapMount, data.map);

  // "Or maybe": the matcher's runner-up recipes. A goal-shaped idea
  // ("laugh together") genuinely fits several recipes, so the top pick
  // is one answer, not the only one. Clicking a card re-matches the same
  // idea against that recipe.
  if (Array.isArray(data.alternates) && data.alternates.length > 0 && description) {
    var altHeader = document.createElement('p');
    altHeader.style.cssText = 'margin:16px 0 8px 0; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; font-size:0.85rem;';
    altHeader.textContent = 'Or maybe one of these instead:';
    modal.appendChild(altHeader);

    data.alternates.forEach(function (alt) {
      var altBtn = document.createElement('button');
      altBtn.type = 'button';
      altBtn.className = 'ai-match-alternate';
      altBtn.style.cssText = 'display:block; width:100%; text-align:left; border:2px solid #000; border-radius:12px; background:#fff; padding:10px 12px; margin-bottom:8px; cursor:pointer; font-family:"Nunito", Arial, sans-serif;';

      var altName = document.createElement('div');
      altName.style.cssText = 'font-weight:900;';
      altName.textContent = alt.name;
      altBtn.appendChild(altName);

      var altWhy = document.createElement('div');
      altWhy.style.cssText = 'font-size:0.85rem; color:#444;';
      altWhy.textContent = alt.why || alt.description || '';
      altBtn.appendChild(altWhy);

      altBtn.addEventListener('click', function () {
        refitToAlternate(modal, data, alt, overlay, description);
      });
      modal.appendChild(altBtn);
    });
  }

  var status = document.createElement('div');
  status.className = 'recipe-form-status';
  status.id = 'ai-match-preview-status';
  modal.appendChild(status);

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';

  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'recipe-cancel-btn';
  backBtn.textContent = '← Try a different idea';
  backBtn.addEventListener('click', function () {
    renderAIDescriptionStep(modal, overlay);
  });
  btnRow.appendChild(backBtn);

  // The yard's word for "set this up as mine": the match is already
  // filled in, one click saves it and opens the three doors.
  var createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'recipe-create-btn';
  createBtn.textContent = 'Make it yours';
  createBtn.addEventListener('click', function () {
    saveMatchedConfig(data, status, createBtn, overlay, modal);
  });
  btnRow.appendChild(createBtn);

  modal.appendChild(btnRow);
}

// The matcher pointed at a finished built-in activity: nothing to build.
// The card shows the yard popup's map and ends in the yard's doors: Make
// it yours (the yard's dialog, then designer / try it out / host), Try it
// out, Host this.
// ("Human or AI" 2026-08-22: the idea already existed as a built-in, but
// the matcher only knew recipes, so it fell to the storyboard and faked it.)
function renderExistingGameView(modal, data, overlay, description) {
  clearModal(modal);

  var game = data.existingGame;

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Good news: this already exists';
  modal.appendChild(title);

  var card = document.createElement('div');
  card.style.cssText = 'border:3px solid #000; border-radius:12px; padding:14px 16px; margin:0 0 12px 0; background:#fff;';
  var cardName = document.createElement('div');
  cardName.style.cssText = 'font-weight:900; font-size:1.1rem;';
  cardName.textContent = game.name + (game.playTime ? ' (' + game.playTime + ')' : '');
  card.appendChild(cardName);
  if (game.description) {
    var cardDesc = document.createElement('div');
    cardDesc.style.cssText = 'font-size:0.9rem; color:#444; margin-top:4px;';
    cardDesc.textContent = game.description;
    card.appendChild(cardDesc);
  }
  modal.appendChild(card);

  if (data.explanation) {
    var explain = document.createElement('p');
    explain.className = 'recipe-form-description';
    explain.textContent = data.explanation;
    modal.appendChild(explain);
  }

  // Running time against the minutes the teacher asked for (report only:
  // the copy is made from the yard, so there is no config to trim here).
  appendTimingNote(modal, data, null);

  // The activity's map, same as the yard's popup: what happens, stop by
  // stop, so the teacher can judge the match without leaving this page
  // (owner's ask 2026-09-07). Arrives async into its own mount so the
  // buttons below never jump.
  var existingMapMount = document.createElement('div');
  existingMapMount.className = 'recipe-map-mount';
  modal.appendChild(existingMapMount);
  fetch('/api/games/' + encodeURIComponent(game.id) + '/map')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (map) {
      if (existingMapMount.isConnected) appendRecipeMap(existingMapMount, map);
    })
    .catch(function () { /* the map is garnish, the doors below still work */ });

  // Runner-up recipes still render: "already exists" is one answer, and
  // building an own version from a recipe is the other.
  if (Array.isArray(data.alternates) && data.alternates.length > 0 && description) {
    var altHeader = document.createElement('p');
    altHeader.style.cssText = 'margin:16px 0 8px 0; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; font-size:0.85rem;';
    altHeader.textContent = 'Or build your own version:';
    modal.appendChild(altHeader);

    data.alternates.forEach(function (alt) {
      var altBtn = document.createElement('button');
      altBtn.type = 'button';
      altBtn.className = 'ai-match-alternate';
      altBtn.style.cssText = 'display:block; width:100%; text-align:left; border:2px solid #000; border-radius:12px; background:#fff; padding:10px 12px; margin-bottom:8px; cursor:pointer; font-family:"Nunito", Arial, sans-serif;';

      var altName = document.createElement('div');
      altName.style.cssText = 'font-weight:900;';
      altName.textContent = alt.name;
      altBtn.appendChild(altName);

      var altWhy = document.createElement('div');
      altWhy.style.cssText = 'font-size:0.85rem; color:#444;';
      altWhy.textContent = alt.why || alt.description || '';
      altBtn.appendChild(altWhy);

      altBtn.addEventListener('click', function () {
        refitToAlternate(modal, data, alt, overlay, description);
      });
      modal.appendChild(altBtn);
    });
  }

  var status = document.createElement('div');
  status.className = 'recipe-form-status';
  status.id = 'ai-match-preview-status';
  modal.appendChild(status);

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';
  btnRow.style.flexWrap = 'wrap';

  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'recipe-cancel-btn';
  backBtn.textContent = '← Try a different idea';
  backBtn.addEventListener('click', function () {
    renderAIDescriptionStep(modal, overlay);
  });
  btnRow.appendChild(backBtn);

  // Make it yours opens the make page for this activity, the same door as
  // a yard plank or a home tile (never the yard's ?customize= detour,
  // which sends an owner-mode browser to the editor instead).
  var customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.className = 'recipe-cancel-btn';
  customizeBtn.textContent = 'Make it yours';
  customizeBtn.title = 'Make your own editable copy of "' + game.name + '"';
  customizeBtn.addEventListener('click', function () {
    window.location.href = '/make?game=' + encodeURIComponent(game.id) + '&from=designer';
  });
  btnRow.appendChild(customizeBtn);

  var previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'recipe-cancel-btn';
  previewBtn.textContent = 'Try it out';
  previewBtn.title = 'See the teacher and student screens side by side, with pretend students, no class needed';
  previewBtn.addEventListener('click', function () {
    window.location.href = '/prototype?game=' + encodeURIComponent(game.id);
  });
  btnRow.appendChild(previewBtn);

  var hostBtn = document.createElement('button');
  hostBtn.type = 'button';
  hostBtn.className = 'recipe-create-btn';
  hostBtn.textContent = '▶ Host this';
  hostBtn.title = 'Start a live room your class can join right now';
  hostBtn.addEventListener('click', function () {
    if (window.HostLaunch) HostLaunch.launch(game.id);
    else window.location.href = '/host?game=' + encodeURIComponent(game.id);
  });
  btnRow.appendChild(hostBtn);

  modal.appendChild(btnRow);
}

// "tier1Prompts" -> "Tier 1 prompts": fallback when a param has no label.
// The server's timing report under a match: one sentence, and when the
// activity runs over the minutes the teacher asked for, a button that swaps
// in the server's trimmed copy (onTrim receives {config, changes,
// estimatedMinutes}). Report-only views pass no onTrim.
function appendTimingNote(modal, data, onTrim) {
  var timing = data && data.timing;
  if (!timing || !timing.note) return;
  var wrap = document.createElement('div');
  wrap.className = 'ai-match-timing' + (timing.over ? ' is-over' : '');
  var note = document.createElement('p');
  note.className = 'ai-match-timing-note';
  note.textContent = timing.note;
  wrap.appendChild(note);
  if (onTrim && timing.trim && timing.trim.config) {
    var trimBtn = document.createElement('button');
    trimBtn.type = 'button';
    trimBtn.className = 'recipe-cancel-btn ai-match-trim-btn';
    trimBtn.textContent = 'Trim the timers (about ' + timing.trim.estimatedMinutes + ' min)';
    trimBtn.addEventListener('click', function () { onTrim(timing.trim); });
    wrap.appendChild(trimBtn);
  }
  modal.appendChild(wrap);
}

function humanizeParamName(name) {
  var words = String(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function saveMatchedConfig(data, status, createBtn, overlay, modal) {
  status.textContent = '';
  status.className = 'recipe-form-status';
  createBtn.disabled = true;
  createBtn.textContent = 'Saving…';

  var newId = generateGameId(data.recipe.id);

  try {
    var resp = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId, config: data.config })
    });

    if (resp.ok) {
      rememberMine(newId);
      // Saved: the make page, the same door every Make it yours ends in
      // since 2026-09-09 (this used to show its own doors dialog, and
      // before that jump straight into the editor). The copy is the
      // teacher's, so the page saves edits back to it.
      window.location.href = '/make?game=' + encodeURIComponent(newId) + '&from=designer';
    } else {
      var saveData;
      try { saveData = await resp.json(); } catch (e) { saveData = {}; }
      showFormError(status, 'Save failed: ' + (saveData.error || 'Unknown error'));
      createBtn.disabled = false;
      createBtn.textContent = 'Make it yours';
    }
  } catch (err) {
    showFormError(status, 'Network error: ' + err.message);
    createBtn.disabled = false;
    createBtn.textContent = 'Make it yours';
  }
}

// Re-run the same idea forced onto one alternate recipe (the server's
// recipeId narrows the matcher, so AI only fills that recipe's params).
// The outgoing pick and the unchosen alternates carry over as the next
// view's alternates, so flipping between candidates never dead-ends.
async function refitToAlternate(modal, data, alt, overlay, description) {
  var buttons = modal.querySelectorAll('button');
  function setButtonsDisabled(disabled) {
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = disabled;
  }
  setButtonsDisabled(true);

  var status = document.getElementById('ai-match-preview-status');
  if (status) {
    status.className = 'recipe-form-status recipe-form-status-working';
    status.textContent = 'Setting your idea up as ' + alt.name + '…';
  }

  try {
    var resp = await fetch('/api/games/from-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description, recipeId: alt.id })
    });
    var next = await resp.json();
    if (!resp.ok || next.noMatch || !next.config) {
      throw new Error(next.error || next.reason || 'that recipe could not take this idea');
    }
    if (!Array.isArray(next.alternates) || next.alternates.length === 0) {
      // The outgoing pick carries over only when it WAS a recipe; from the
      // "already exists" view there is no recipe to carry, just the other
      // unchosen alternates.
      var carried = [];
      if (data.recipe) {
        carried.push({
          id: data.recipe.id,
          name: data.recipe.name,
          icon: data.recipe.icon,
          why: 'The first suggestion for this idea.'
        });
      }
      (data.alternates || []).forEach(function (a) {
        if (a.id !== alt.id) carried.push(a);
      });
      if (carried.length) next.alternates = carried;
    }
    setButtonsDisabled(false);
    renderMatchPreview(modal, next, overlay, description);
  } catch (err) {
    setButtonsDisabled(false);
    if (status) {
      status.style.cssText = '';
      var reason = String(err.message || 'something went wrong').replace(/\.+\s*$/, '');
      showFormError(status, 'Could not set that up: ' + reason + '. The current match still works.');
    }
  }
}

function renderNoMatchView(modal, description, data, overlay) {
  clearModal(modal);

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = "Hmm, that's beyond our recipes";
  modal.appendChild(title);

  // Reason
  var reasonBlock = document.createElement('div');
  reasonBlock.className = 'ai-no-match-reason';
  var reasonLabel = document.createElement('div');
  reasonLabel.className = 'ai-no-match-label';
  reasonLabel.textContent = 'Why this is tricky:';
  reasonBlock.appendChild(reasonLabel);
  var reasonText = document.createElement('div');
  reasonText.className = 'ai-no-match-text';
  reasonText.textContent = data.reason;
  reasonBlock.appendChild(reasonText);
  modal.appendChild(reasonBlock);

  // Suggestion
  if (data.suggestion) {
    var suggestBlock = document.createElement('div');
    suggestBlock.className = 'ai-no-match-suggestion';
    var suggestLabel = document.createElement('div');
    suggestLabel.className = 'ai-no-match-label';
    suggestLabel.textContent = 'A close match might work:';
    suggestBlock.appendChild(suggestLabel);
    var suggestText = document.createElement('div');
    suggestText.className = 'ai-no-match-text';
    suggestText.textContent = data.suggestion;
    suggestBlock.appendChild(suggestText);
    modal.appendChild(suggestBlock);
  }

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';
  btnRow.style.flexWrap = 'wrap';

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'recipe-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function () { closeOverlay(overlay); });
  btnRow.appendChild(cancelBtn);

  var pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'recipe-cancel-btn';
  pickBtn.style.background = '#FFEB3B';
  pickBtn.textContent = 'Pick from Recipes';
  pickBtn.addEventListener('click', function () {
    closeOverlay(overlay);
    showRecipePicker();
  });
  btnRow.appendChild(pickBtn);

  var storyboardBtn = document.createElement('button');
  storyboardBtn.type = 'button';
  storyboardBtn.className = 'recipe-create-btn';
  storyboardBtn.textContent = 'Plan it step by step';
  storyboardBtn.title = 'AI sketches your activity as steps you approve and edit BEFORE anything is built, the safest way to a custom activity.';
  storyboardBtn.addEventListener('click', function () {
    closeOverlay(overlay);
    showStoryboardFlow(description);
  });
  btnRow.appendChild(storyboardBtn);

  // Deliberately NO whole-config generator here (removed 2026-08-07):
  // if it can't be assembled from the storyboard bricks, it shouldn't be
  // makeable — raw-config generation added too many ways to break.
  modal.appendChild(btnRow);
}

// =======================================================================
// Storyboard-before-generate (SURFACES-PLAN Phase 4): the AI proposes a
// step outline in the Builder's brick vocabulary; the teacher approves
// and edits the WORDS here; compileStoryboard assembles guaranteed-valid
// structure; the finished activity opens in the Builder.
// =======================================================================

// Storyboard bricks use the canonical step names (shared/phase-names.js),
// the same vocabulary the Builder shows once the activity opens there.
var SB_BRICK_LABELS = window.PHASE_NAMES || {};

async function showStoryboardFlow(description, seededStoryboard) {
  // template-picker-overlay/-modal: the page's centered, Totem-skinned
  // dialog pair. (The old picker-overlay classes live in editor.css,
  // which this page does not load — the modal rendered unpositioned,
  // jammed against the left edge.)
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '640px';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Plan it step by step' });

  function sbEl(tag, text, cls) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  var title = sbEl('h2', 'Here’s the plan', 'template-picker-title');
  modal.appendChild(title);
  var status = sbEl('p', 'Sketching the steps…', 'sb-status');
  modal.appendChild(status);

  var storyboard;
  if (seededStoryboard) {
    // The concierge already proposed a plan; open it for approval directly.
    storyboard = seededStoryboard;
  } else {
    var resp;
    try {
      var r = await fetch('/api/games/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description })
      });
      resp = await r.json();
      if (resp && resp.cantBuild) {
        // Honest refusal: the idea's heart needs a mechanic the bricks
        // can't deliver. Better a straight answer here than a built
        // activity that fakes its own premise with words.
        title.textContent = 'This one needs a trick we don\'t have yet';
        status.textContent = resp.reason || 'The step-by-step builder cannot deliver the heart of this idea yet.';
        var cbHint = sbEl('p', 'A recipe or a ready-made activity from the yard may get close. Or reshape the idea around what students type and see, and try again.', 'sb-hint');
        modal.appendChild(cbHint);
        var cbRow = sbEl('div', null, 'recipe-form-buttons');
        var cbClose = sbEl('button', 'Close', 'recipe-cancel-btn');
        cbClose.type = 'button';
        cbClose.addEventListener('click', function () { closeOverlay(overlay); });
        cbRow.appendChild(cbClose);
        var cbPick = sbEl('button', 'Pick from Recipes', 'recipe-create-btn');
        cbPick.type = 'button';
        cbPick.addEventListener('click', function () {
          closeOverlay(overlay);
          showRecipePicker();
        });
        cbRow.appendChild(cbPick);
        modal.appendChild(cbRow);
        return;
      }
      if (!r.ok || !resp.storyboard) throw new Error(resp.error || 'No storyboard came back.');
    } catch (err) {
      status.textContent = 'Could not sketch the plan: ' + err.message;
      return;
    }
    storyboard = resp.storyboard;
  }
  status.textContent = 'Change any words you like, drop steps you don’t, then build it. Nothing exists until you do.';

  var nameRow = sbEl('div', null, 'sb-name-row');
  nameRow.appendChild(sbEl('label', 'Activity name', 'recipe-field-label'));
  var nameInput = document.createElement('input');
  nameInput.className = 'recipe-field-input';
  nameInput.value = storyboard.name || 'New Activity';
  nameRow.appendChild(nameInput);
  modal.appendChild(nameRow);

  var list = sbEl('div');
  modal.appendChild(list);

  var steps = storyboard.steps.slice();
  function renderSteps() {
    list.textContent = '';
    steps.forEach(function (step, i) {
      var row = sbEl('div', null, 'sb-step');
      var head = sbEl('div', null, 'sb-step-head');
      head.appendChild(sbEl('span', String(i + 1) + '.', 'sb-step-num'));
      head.appendChild(sbEl('span', SB_BRICK_LABELS[step.brick] || step.brick));
      var rm = sbEl('button', '✕', 'sb-remove');
      rm.type = 'button';
      rm.title = 'Drop this step';
      rm.addEventListener('click', function () {
        steps.splice(i, 1);
        renderSteps();
      });
      head.appendChild(rm);
      row.appendChild(head);
      if (step.text != null || SB_BRICK_LABELS[step.brick]) {
        if (typeof step.text === 'string') {
          var box = document.createElement('textarea');
          box.className = 'recipe-field-input sb-step-text';
          box.value = step.text;
          box.rows = 2;
          box.addEventListener('input', function () { step.text = box.value; });
          row.appendChild(box);
        }
      }
      // Quiz questions are the teacher's fact-check moment: every question
      // and its correct answer is visible BEFORE anything is built. ✕ drops
      // a single wrong question; deeper edits happen in the editor after.
      if (step.brick === 'quiz' && Array.isArray(step.questions)) {
        var qList = sbEl('div', null, 'sb-questions');
        step.questions.forEach(function (q, qi) {
          var qRow = sbEl('div', null, 'sb-question-row');
          var qText = sbEl('span', (qi + 1) + '. ' + (q.text || '') + '  ✓ ' + (q.correct || ''), 'sb-question-text');
          qRow.appendChild(qText);
          var qRm = sbEl('button', '✕', 'sb-remove sb-remove-small');
          qRm.type = 'button';
          qRm.title = 'Drop this question';
          qRm.addEventListener('click', function () {
            step.questions.splice(qi, 1);
            renderSteps();
          });
          qRow.appendChild(qRm);
          qList.appendChild(qRow);
        });
        var qHint = sbEl('div', 'Check every answer, drop any question that is wrong. You can rewrite them after building.', 'sb-hint');
        qList.appendChild(qHint);
        row.appendChild(qList);
      }
      list.appendChild(row);
    });
  }
  renderSteps();

  var problems = sbEl('p', null, 'sb-problems');
  modal.appendChild(problems);

  var btnRow = sbEl('div', null, 'recipe-form-buttons');
  var buildBtn = sbEl('button', 'Build it', 'recipe-create-btn');
  buildBtn.type = 'button';
  buildBtn.addEventListener('click', async function () {
    problems.textContent = '';
    var result = StepSuggestions.compileStoryboard({
      name: nameInput.value.trim() || 'New Activity',
      description: storyboard.description || description,
      steps: steps
    });
    if (!result.config || result.problems.length) {
      problems.textContent = result.problems.join(' ') || 'Nothing to build yet.';
      return;
    }
    buildBtn.disabled = true;
    buildBtn.textContent = 'Building…';
    var base = (result.config.name || 'activity').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'activity';
    var newId = generateGameId(base);
    try {
      var save = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, config: result.config })
      });
      var saved = await save.json();
      if (!save.ok) throw new Error(saved.error || 'save failed');
      rememberMine(newId);
      try { localStorage.setItem('lanyardEditorBuilder', '1'); } catch (e) { /* ignore */ }
      window.location.href = '/designer/edit?game=' + encodeURIComponent(newId);
    } catch (err) {
      buildBtn.disabled = false;
      buildBtn.textContent = 'Build it';
      problems.textContent = 'Could not build: ' + err.message;
    }
  });
  btnRow.appendChild(buildBtn);
  modal.appendChild(btnRow);
}

// =======================================================================
// "Not sure what to make" concierge (2026-08-08). Three fixed questions,
// one AI call, up to three suggestion cards. Every card points at
// something real: a featured activity (host it), a recipe (opens the
// form prefilled), or a bricks-only storyboard (opens the approval flow,
// which compiles through validated builders). The server drops anything
// that does not resolve, so an impossible suggestion never renders.
// =======================================================================

var CONCIERGE_OCCASIONS = [
  'Help the class connect',
  'Discuss something',
  'Review material',
  'Decide together',
  'Reflect',
  'Fill some time',
  'Just have fun'
];
var CONCIERGE_TIMES = ['About 5 minutes', '10 to 20 minutes', 'Half the period', 'The whole period'];

function showConciergeDialog() {
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '600px';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Let’s figure it out' });

  function cEl(tag, text, cls) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function chipRow(options) {
    var row = cEl('div');
    row.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 14px;';
    var picked = { value: null };
    options.forEach(function (label) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = label;
      chip.style.cssText = 'padding:7px 14px; border:2px solid #000; border-radius:16px; background:#fff; cursor:pointer; font-family:"Nunito", Arial, sans-serif; font-size:0.9rem; font-weight:700;';
      chip.addEventListener('click', function () {
        picked.value = (picked.value === label) ? null : label;
        Array.prototype.forEach.call(row.children, function (c) {
          c.style.background = (c.textContent === picked.value) ? '#FFD600' : '#fff';
        });
      });
      row.appendChild(chip);
    });
    return { row: row, picked: picked };
  }

  modal.appendChild(cEl('h2', 'Not sure what to make?', 'template-picker-title'));
  modal.appendChild(cEl('p', 'Three quick questions and we’ll suggest something that fits.', 'template-picker-subtitle'));

  var q1 = cEl('label', 'What’s the moment?');
  q1.style.cssText = 'display:block; font-weight:800; margin-top:6px; font-family:"Nunito", Arial, sans-serif;';
  modal.appendChild(q1);
  var occasion = chipRow(CONCIERGE_OCCASIONS);
  modal.appendChild(occasion.row);

  var q2 = cEl('label', 'Topic or subject? (optional)');
  q2.style.cssText = 'display:block; font-weight:800; font-family:"Nunito", Arial, sans-serif;';
  modal.appendChild(q2);
  var topicInput = document.createElement('input');
  topicInput.type = 'text';
  topicInput.placeholder = 'e.g. photosynthesis, fractions, our field trip';
  topicInput.style.cssText = 'width:100%; padding:10px 12px; border:2px solid #000; border-radius:10px; font-family:"Nunito", Arial, sans-serif; font-size:0.95rem; box-sizing:border-box; margin:6px 0 14px;';
  modal.appendChild(topicInput);

  var q3 = cEl('label', 'How much time do you have?');
  q3.style.cssText = 'display:block; font-weight:800; font-family:"Nunito", Arial, sans-serif;';
  modal.appendChild(q3);
  var timeRow = chipRow(CONCIERGE_TIMES);
  modal.appendChild(timeRow.row);

  var status = cEl('p', '', 'template-picker-subtitle');
  status.hidden = true;
  modal.appendChild(status);

  var resultsEl = cEl('div');
  modal.appendChild(resultsEl);

  var btnRow = cEl('div', null, 'recipe-form-buttons');
  var goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'recipe-create-btn';
  goBtn.textContent = 'Get ideas';
  btnRow.appendChild(goBtn);
  modal.appendChild(btnRow);

  goBtn.addEventListener('click', function () {
    var topic = topicInput.value.trim();
    if (!occasion.picked.value && !topic) {
      status.hidden = false;
      status.textContent = 'Pick a moment or type a topic first.';
      return;
    }
    goBtn.disabled = true;
    goBtn.textContent = 'Thinking…';
    status.hidden = false;
    status.textContent = 'Looking at what would fit your class…';
    resultsEl.textContent = '';
    fetch('/api/games/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occasion: occasion.picked.value || '',
        topic: topic,
        time: timeRow.picked.value || ''
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        goBtn.disabled = false;
        goBtn.textContent = 'Get more ideas';
        if (!result.ok || result.data.error) throw new Error(result.data.error || 'no ideas came back');
        renderConciergeResults(result.data, resultsEl, status, overlay);
      })
      .catch(function (err) {
        goBtn.disabled = false;
        goBtn.textContent = 'Try again';
        status.textContent = 'That didn’t work (' + err.message + '). Browsing the yard by goal is a good plan B.';
      });
  });
}

function renderConciergeResults(data, resultsEl, status, overlay) {
  resultsEl.textContent = '';
  var suggestions = data.suggestions || [];
  if (suggestions.length === 0) {
    status.textContent = 'Nothing clicked for that combination. The yard sorted by goal is the best next stop.';
    var libLink = document.createElement('a');
    libLink.href = '/library';
    libLink.textContent = 'Open the yard';
    libLink.style.cssText = 'font-weight:800;';
    resultsEl.appendChild(libLink);
    return;
  }
  status.textContent = data.note ? data.note : 'Here’s what would fit:';

  suggestions.forEach(function (s) {
    var card = document.createElement('div');
    card.style.cssText = 'border:2px solid #000; border-radius:12px; padding:12px 14px; margin:10px 0; background:#fff; text-align:left;';

    var kindLabel = s.kind === 'host' ? 'Ready to run'
      : s.kind === 'recipe' ? 'Fill in a recipe' : 'A new plan, step by step';
    var tag = document.createElement('div');
    tag.textContent = kindLabel;
    tag.style.cssText = 'font-size:0.7rem; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; color:#888; font-family:"Nunito", Arial, sans-serif;';
    card.appendChild(tag);

    var name = document.createElement('div');
    name.textContent = s.name || (s.storyboard && s.storyboard.name) || '';
    name.style.cssText = 'font-weight:900; font-size:1.05rem; margin:2px 0;';
    card.appendChild(name);

    var desc = document.createElement('div');
    desc.textContent = s.description || (s.storyboard && s.storyboard.description) || '';
    desc.style.cssText = 'font-family:"Nunito", Arial, sans-serif; font-size:0.85rem; color:#444;';
    card.appendChild(desc);

    if (s.why) {
      var why = document.createElement('div');
      why.textContent = s.why;
      why.style.cssText = 'font-family:"Nunito", Arial, sans-serif; font-size:0.85rem; color:#0057FF; margin-top:4px;';
      card.appendChild(why);
    }

    if (s.kind === 'host') {
      // Ready-to-run cards get the same three doors as a library card:
      // host it now, preview it with practice players, or customize a copy.
      var row = document.createElement('div');
      row.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;';

      var hostBtn = document.createElement('button');
      hostBtn.type = 'button';
      hostBtn.className = 'recipe-create-btn';
      hostBtn.textContent = '▶ Host this' + (s.playTime ? ' (' + s.playTime + ')' : '');
      hostBtn.title = 'Start a live room your class can join right now';
      hostBtn.addEventListener('click', function () {
        if (window.HostLaunch) HostLaunch.launch(s.id);
        else window.location.href = '/host?game=' + encodeURIComponent(s.id);
      });
      row.appendChild(hostBtn);

      var previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'recipe-cancel-btn';
      previewBtn.textContent = 'Try it out';
      previewBtn.title = 'See the teacher and student screens side by side, with pretend students, no class needed';
      previewBtn.addEventListener('click', function () {
        window.location.href = '/prototype?game=' + encodeURIComponent(s.id);
      });
      row.appendChild(previewBtn);

      var customizeBtn = document.createElement('button');
      customizeBtn.type = 'button';
      customizeBtn.className = 'recipe-cancel-btn';
      customizeBtn.textContent = 'Make it yours';
      customizeBtn.title = 'Make your own editable copy of this activity';
      customizeBtn.addEventListener('click', function () {
        window.location.href = '/make?game=' + encodeURIComponent(s.id) + '&from=designer';
      });
      row.appendChild(customizeBtn);

      card.appendChild(row);
      resultsEl.appendChild(card);
      return;
    }

    var action = document.createElement('button');
    action.type = 'button';
    action.className = 'recipe-create-btn';
    action.style.marginTop = '8px';
    if (s.kind === 'recipe') {
      action.textContent = 'Use this recipe';
      action.addEventListener('click', function () {
        closeOverlay(overlay);
        openRecipeFormPrefilled(s.id, s.params || {});
      });
    } else {
      action.textContent = 'Plan it step by step';
      action.addEventListener('click', function () {
        closeOverlay(overlay);
        showStoryboardFlow(null, s.storyboard);
      });
    }
    card.appendChild(action);
    resultsEl.appendChild(card);
  });

  var footer = document.createElement('p');
  footer.className = 'template-picker-subtitle';
  footer.style.marginTop = '10px';
  var libLink2 = document.createElement('a');
  libLink2.href = '/library';
  libLink2.textContent = 'None of these? Browse the whole yard';
  footer.appendChild(libLink2);
  resultsEl.appendChild(footer);
}

// Open a recipe's form directly (skipping the picker), prefilled with the
// concierge's proposed params. Values land through the same inputs the
// teacher would type into, so recipe validation applies unchanged.
async function openRecipeFormPrefilled(recipeId, params) {
  try {
    var listResp = await fetch('/api/recipes');
    var allRecipes = await listResp.json();
    var recipe = null;
    for (var i = 0; i < allRecipes.length; i++) {
      if (allRecipes[i].id === recipeId) { recipe = allRecipes[i]; break; }
    }
    if (!recipe) throw new Error('recipe not found');

    var overlay = document.createElement('div');
    overlay.id = 'recipe-picker-modal';
    overlay.className = 'template-picker-overlay';
    var modal = document.createElement('div');
    modal.className = 'template-picker-modal recipe-picker-modal';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay._dlg = Dialog.enhance(overlay, modal, { title: recipe.name });
    renderRecipeFormView(modal, recipe, allRecipes, overlay);

    for (var key in params) {
      var input = modal.querySelector('[data-param-name="' + key + '"]');
      if (input && 'value' in input) {
        input.value = params[key];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  } catch (err) {
    alert('Could not open that recipe: ' + err.message);
  }
}

// Entry points: the link under the idea box, and ?notsure=1 (used by the
// library's empty search results).
var notSureLink = document.getElementById('not-sure-link');
if (notSureLink) {
  notSureLink.addEventListener('click', function (e) {
    e.preventDefault();
    showConciergeDialog();
  });
}
if (new URLSearchParams(window.location.search).get('notsure') === '1') {
  showConciergeDialog();
}
