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
var createNewLink = document.getElementById('create-new-link');

var allGames = [];

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
if (ideaInput) {
  // Enter submits (ideas are usually one line); Shift+Enter makes a newline.
  ideaInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      launchIdea();
    }
  });
}

// Example chips fill the box — blank-page paralysis is real.
var ideaChips = document.querySelectorAll('.idea-example-chip');
for (var ci = 0; ci < ideaChips.length; ci++) {
  ideaChips[ci].addEventListener('click', function (e) {
    ideaInput.value = e.currentTarget.textContent;
    ideaInput.focus();
  });
}

if (useRecipeLink) {
  useRecipeLink.addEventListener('click', function (e) {
    e.preventDefault();
    showRecipePicker();
  });
}
if (createNewLink) {
  createNewLink.addEventListener('click', function (e) {
    e.preventDefault();
    showTemplatePicker();
  });
}

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
    loadingMessage.hidden = true;
    refreshLibrary();
  } catch (error) {
    loadingMessage.hidden = true;
    errorMessage.textContent = 'Error loading games: ' + error.message;
    errorMessage.hidden = false;
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

var GOAL_LABELS = {
  connect: '🤝 Connect',
  create: '🎨 Create',
  discuss: '💬 Discuss',
  decide: '🗳️ Decide',
  reflect: '🪞 Reflect',
  energize: '⚡ Energize',
  review: '📚 Review'
};

var libraryQuery = '';
var activeGoal = null;

function readIdList(key) {
  try {
    var raw = localStorage.getItem(key);
    var ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch (e) { return []; }
}

function writeIdList(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
}

var Favorites = {
  KEY: 'lanyard-favorites',
  list: function () { return readIdList(this.KEY); },
  has: function (id) { return this.list().indexOf(id) !== -1; },
  toggle: function (id) {
    var ids = this.list();
    var at = ids.indexOf(id);
    if (at === -1) ids.push(id); else ids.splice(at, 1);
    writeIdList(this.KEY, ids);
  }
};

var Recents = {
  KEY: 'lanyard-recents',
  MAX: 8,
  list: function () { return readIdList(this.KEY); },
  add: function (id) {
    var ids = this.list().filter(function (x) { return x !== id; });
    ids.unshift(id);
    writeIdList(this.KEY, ids.slice(0, this.MAX));
  }
};

function matchesLibraryFilters(game) {
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

// Owner ★ toggle: flips `featured` on the config and saves it back. For
// built-ins the server demands the owner password (the browser has it cached
// after the owner unlock). Note: built-in flags flipped on a deployed server
// last until the next redeploy — the durable place for those is the repo.
async function toggleFeatured(game) {
  try {
    var resp = await fetch('/api/games/' + encodeURIComponent(game.id));
    if (!resp.ok) throw new Error('could not load the activity');
    var config = await resp.json();
    config.featured = !config.featured;
    var save = await fetch('/api/games/' + encodeURIComponent(game.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!save.ok) {
      var saveData = {};
      try { saveData = await save.json(); } catch (e) {}
      throw new Error(saveData.error || 'save failed (status ' + save.status + ')');
    }
    game.featured = !!config.featured;
    refreshLibrary();
  } catch (err) {
    alert('Could not change featured: ' + err.message);
  }
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
    ownerLabel.textContent = '👑 Owner view — showing every activity';
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
    gamesGrid.appendChild(ownerBar);
  }

  if (games.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = (libraryQuery || activeGoal)
      ? 'No matches — try a different search or clear the filter.'
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

  // A quiet doorway to the full list for the site owner.
  if (!ownerOn) appendOwnerLink();
}

function appendOwnerLink() {
  var link = document.createElement('button');
  link.className = 'owner-link';
  link.textContent = 'Show full library (site owner)';
  link.addEventListener('click', enterOwnerMode);
  gamesGrid.appendChild(link);
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
    meta.appendChild(buildMetaBadge('⏱', String(game.playTime)));
  }
  var classSizeText = formatClassSize(game);
  if (classSizeText) {
    meta.appendChild(buildMetaBadge('👥', classSizeText));
  }
  var phases = document.createElement('span');
  phases.className = 'game-card-phases';
  phases.textContent = game.phaseCount + ' steps';
  meta.appendChild(phases);

  card.appendChild(meta);

  // Tags row (skills / categories). Renders as small chip pills.
  if (Array.isArray(game.tags) && game.tags.length > 0) {
    var tagsRow = document.createElement('div');
    tagsRow.className = 'game-card-tags';
    var tagPrefix = document.createElement('span');
    tagPrefix.className = 'game-card-tags-icon';
    tagPrefix.textContent = '🎯';
    tagsRow.appendChild(tagPrefix);
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
  hostBtn.textContent = '▶ Host';
  hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
  hostBtn.addEventListener('click', rememberRecent);
  actions.appendChild(hostBtn);

  var editBtn = document.createElement('a');
  editBtn.className = 'game-card-edit';
  editBtn.href = '/designer/edit?game=' + encodeURIComponent(game.id);
  editBtn.textContent = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit "' + game.name + '"');
  editBtn.addEventListener('click', rememberRecent);
  actions.appendChild(editBtn);

  var previewBtn = document.createElement('a');
  previewBtn.className = 'game-card-preview';
  previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
  previewBtn.textContent = 'Try it';
  previewBtn.setAttribute('aria-label', 'Try "' + game.name + '" in prototype mode');
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
    starBtn.textContent = game.featured ? '★ Featured' : '☆ Feature';
    starBtn.title = game.featured
      ? 'Shown to everyone — click to remove from the public list'
      : 'Hidden from visitors — click to add to the public list';
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
  badge.textContent = icon + ' ' + text;
  return badge;
}

function formatClassSize(game) {
  if (game.classSize) return String(game.classSize);
  if (game.minPlayers) {
    var maxLabel = game.maxPlayers ? '–' + game.maxPlayers : '+';
    return game.minPlayers + maxLabel + ' players';
  }
  return null;
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

function showTemplatePicker() {
  // Remove any existing modal
  var existing = document.getElementById('template-picker-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'template-picker-modal';
  overlay.className = 'template-picker-overlay';

  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Start a New Activity';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Pick a template to get started quickly, or start from scratch.';
  modal.appendChild(subtitle);

  var grid = document.createElement('div');
  grid.className = 'template-picker-grid';

  var templateKeys = Object.keys(window.GAME_TEMPLATES);
  for (var i = 0; i < templateKeys.length; i++) {
    var key = templateKeys[i];
    var tmpl = window.GAME_TEMPLATES[key];

    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'template-card';
    card.setAttribute('data-template-key', key);

    var cardIcon = document.createElement('span');
    cardIcon.className = 'template-card-icon';
    cardIcon.textContent = tmpl.icon;

    var cardName = document.createElement('div');
    cardName.className = 'template-card-name';
    cardName.textContent = tmpl.name;

    var cardDesc = document.createElement('div');
    cardDesc.className = 'template-card-desc';
    cardDesc.textContent = tmpl.description;

    card.appendChild(cardIcon);
    card.appendChild(cardName);
    card.appendChild(cardDesc);

    card.addEventListener('click', (function (chosenKey) {
      return function () {
        closeOverlay(overlay);
        createFromTemplate(chosenKey);
      };
    })(key));

    grid.appendChild(card);
  }

  modal.appendChild(grid);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay._dlg = Dialog.enhance(overlay, modal, { title: 'Start a New Activity' });
}

function showLegacyAIGenerateModal() {
  var existing = document.getElementById('ai-generate-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'ai-generate-modal';
  overlay.className = 'template-picker-overlay';

  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '600px';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'AI Activity Generator (Advanced)';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Custom build — AI will design the whole game from scratch. Slower and more error-prone than recipe-based generation.';
  modal.appendChild(subtitle);

  var textarea = document.createElement('textarea');
  textarea.id = 'ai-game-description';
  textarea.placeholder = 'Example: A game where everyone shares their hot take on a topic, then the class tries to guess who said what. Points for correct guesses.\n\nOr: Students write funny excuses for not doing homework. Everyone votes on the most creative one. Elimination rounds until a winner.';
  textarea.rows = 6;
  textarea.style.cssText = 'width:100%; padding:12px; border:3px solid #000; font-family:inherit; font-size:14px; resize:vertical; box-sizing:border-box; margin:12px 0;';
  modal.appendChild(textarea);

  // Questions section (hidden initially, shown after step 1)
  var questionsDiv = document.createElement('div');
  questionsDiv.id = 'ai-generate-questions';
  questionsDiv.style.display = 'none';
  modal.appendChild(questionsDiv);

  var statusDiv = document.createElement('div');
  statusDiv.id = 'ai-generate-status';
  statusDiv.style.cssText = 'display:none; padding:12px; margin:8px 0; font-weight:bold; text-align:center;';
  modal.appendChild(statusDiv);

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:12px; justify-content:flex-end;';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:10px 24px; border:3px solid #000; background:#eee; cursor:pointer; font-weight:bold; font-size:14px;';
  cancelBtn.onclick = function () { closeOverlay(overlay); };

  var nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.id = 'ai-generate-go-btn';
  nextBtn.style.cssText = 'padding:10px 24px; border:3px solid #000; background:#6A1B9A; color:white; cursor:pointer; font-weight:bold; font-size:14px;';
  nextBtn.onclick = function () {
    var desc = textarea.value.trim();
    if (desc.length < 10) {
      alert('Please write a longer description (at least 10 characters).');
      return;
    }
    nextBtn.disabled = true;
    nextBtn.textContent = 'Thinking...';
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#E1BEE7';
    statusDiv.textContent = 'AI is thinking about your game idea...';
    fetchClarifyQuestions(desc, overlay);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(nextBtn);
  modal.appendChild(btnRow);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay._dlg = Dialog.enhance(overlay, modal, { title: 'AI Activity Generator' });
  textarea.focus();
}

async function fetchClarifyQuestions(description, overlay) {
  var statusDiv = document.getElementById('ai-generate-status');
  var nextBtn = document.getElementById('ai-generate-go-btn');
  var questionsDiv = document.getElementById('ai-generate-questions');

  try {
    var response = await fetch('/api/games/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description })
    });

    var data = await response.json();

    if (!response.ok || data.error) {
      statusDiv.style.background = '#FFCDD2';
      statusDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
      nextBtn.disabled = false;
      nextBtn.textContent = 'Try Again';
      return;
    }

    var questions = data.questions || [];

    // If no questions needed, skip straight to generation
    if (questions.length === 0) {
      statusDiv.textContent = 'AI is designing your activity... This may take 15-30 seconds.';
      createFromAI(description, [], overlay);
      return;
    }

    // Show questions
    statusDiv.style.display = 'none';
    questionsDiv.style.display = 'block';
    questionsDiv.innerHTML = '';

    var qHeader = document.createElement('p');
    qHeader.style.cssText = 'font-weight:bold; margin-bottom:12px; font-size:14px;';
    qHeader.textContent = 'A few quick questions to make sure it works right:';
    questionsDiv.appendChild(qHeader);

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var qBlock = document.createElement('div');
      qBlock.style.cssText = 'margin-bottom:14px;';

      var qLabel = document.createElement('label');
      qLabel.style.cssText = 'display:block; font-weight:bold; margin-bottom:6px; font-size:13px;';
      qLabel.textContent = q.question;
      qBlock.appendChild(qLabel);

      var qSelect = document.createElement('select');
      qSelect.className = 'ai-clarify-select';
      qSelect.setAttribute('data-question', q.question);
      qSelect.style.cssText = 'width:100%; padding:8px 10px; border:2px solid #000; font-size:13px; font-family:inherit; background:white;';

      for (var j = 0; j < q.options.length; j++) {
        var opt = document.createElement('option');
        opt.value = q.options[j];
        opt.textContent = q.options[j];
        if (q.options[j] === q.default) opt.selected = true;
        qSelect.appendChild(opt);
      }
      var otherOpt = document.createElement('option');
      otherOpt.value = '__other__';
      otherOpt.textContent = 'Other (write your own)…';
      qSelect.appendChild(otherOpt);

      var qCustom = document.createElement('input');
      qCustom.type = 'text';
      qCustom.className = 'ai-clarify-custom';
      qCustom.placeholder = 'Type your answer';
      qCustom.style.cssText = 'width:100%; padding:8px 10px; border:2px solid #000; font-size:13px; font-family:inherit; background:white; margin-top:6px; display:none;';

      qSelect.addEventListener('change', (function (sel, inp) {
        return function () {
          if (sel.value === '__other__') {
            inp.style.display = 'block';
            inp.focus();
          } else {
            inp.style.display = 'none';
          }
        };
      })(qSelect, qCustom));

      qBlock.appendChild(qSelect);
      qBlock.appendChild(qCustom);
      questionsDiv.appendChild(qBlock);
    }

    // Disable description editing (already locked in)
    var textarea = document.getElementById('ai-game-description');
    textarea.disabled = true;
    textarea.style.opacity = '0.6';

    // Change button to "Generate Game"
    nextBtn.disabled = false;
    nextBtn.textContent = 'Generate Activity';
    nextBtn.onclick = function () {
      // Gather answers
      var selects = questionsDiv.querySelectorAll('.ai-clarify-select');
      var answers = [];
      for (var k = 0; k < selects.length; k++) {
        var ansVal = selects[k].value;
        if (ansVal === '__other__') {
          var customInp = selects[k].parentNode.querySelector('.ai-clarify-custom');
          ansVal = (customInp && customInp.value.trim()) || '';
        }
        answers.push({
          question: selects[k].getAttribute('data-question'),
          answer: ansVal
        });
      }
      nextBtn.disabled = true;
      nextBtn.textContent = 'Generating...';
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#E1BEE7';
      statusDiv.textContent = 'AI is designing your activity... This may take 15-30 seconds.';
      createFromAI(description, answers, overlay);
    };

  } catch (error) {
    statusDiv.style.background = '#FFCDD2';
    statusDiv.textContent = 'Error: ' + error.message;
    nextBtn.disabled = false;
    nextBtn.textContent = 'Try Again';
  }
}

async function createFromAI(description, answers, overlay) {
  var statusDiv = document.getElementById('ai-generate-status');
  var nextBtn = document.getElementById('ai-generate-go-btn');

  try {
    var response = await fetch('/api/games/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description, answers: answers })
    });

    var data = await response.json();

    if (!response.ok || data.error) {
      statusDiv.style.background = '#FFCDD2';
      statusDiv.textContent = 'Generation failed: ' + (data.error || 'Unknown error');
      nextBtn.disabled = false;
      nextBtn.textContent = 'Try Again';
      return;
    }

    if (data.unsupported) {
      statusDiv.style.background = '#FFF3E0';
      statusDiv.style.border = '2px solid #FF9800';
      statusDiv.style.padding = '12px';
      // data.reason / data.suggestion are AI output — render as text, never markup
      statusDiv.innerHTML = '<strong>This idea is beyond what the framework can do:</strong><br>' +
        escapeHtmlText(data.reason) + '<br><br>' +
        '<strong>But here\'s an idea that would work:</strong><br>' +
        escapeHtmlText(data.suggestion);
      nextBtn.disabled = false;
      nextBtn.textContent = 'Try Again';
      return;
    }

    var config = data.config;

    // Generate a safe game ID from the name
    var gameId = (config.name || 'ai-game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var existingIds = allGames.map(function (g) { return g.id; });
    if (existingIds.indexOf(gameId) !== -1) {
      var counter = 2;
      while (existingIds.indexOf(gameId + '-' + counter) !== -1) counter++;
      gameId = gameId + '-' + counter;
    }

    statusDiv.textContent = 'Saving "' + config.name + '"...';

    // Save the game
    var saveResponse = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: gameId, config: config })
    });

    if (saveResponse.ok) {
      rememberMine(gameId);
      overlay.remove();
      window.location.href = '/designer/edit?game=' + encodeURIComponent(gameId);
    } else {
      var saveResult = await saveResponse.json();
      statusDiv.style.background = '#FFCDD2';
      statusDiv.textContent = 'Save failed: ' + (saveResult.error || 'Unknown error');
      nextBtn.disabled = false;
      nextBtn.textContent = 'Try Again';
    }
  } catch (error) {
    statusDiv.style.background = '#FFCDD2';
    statusDiv.textContent = 'Error: ' + error.message;
    nextBtn.disabled = false;
    nextBtn.textContent = 'Try Again';
  }
}

async function createFromTemplate(templateKey) {
  var tmpl = window.GAME_TEMPLATES[templateKey];
  if (!tmpl) return;

  var newId = generateGameId(templateKey);
  var config = tmpl.config();

  try {
    var response = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId, config: config })
    });

    if (response.ok) {
      rememberMine(newId);
      window.location.href = '/designer/edit?game=' + encodeURIComponent(newId);
    } else {
      var result = await response.json();
      alert('Create failed: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Create failed: ' + error.message);
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
    errEl.style.cssText = 'color:#FF2D2D; padding:20px; text-align:center;';
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

  var cardIcon = document.createElement('span');
  cardIcon.className = 'template-card-icon';
  cardIcon.textContent = recipe.icon || '🎯';
  card.appendChild(cardIcon);

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

  var icon = document.createElement('span');
  icon.className = 'recipe-form-icon';
  icon.textContent = recipe.icon || '🎯';
  titleWrap.appendChild(icon);

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
//   4. On no-match: show reason + suggestion. Buttons: pick a recipe, or fall
//      back to the legacy whole-config generator (showLegacyAIGenerateModal).
//
// Why this replaced the old flow: the legacy generator asked AI to emit a
// 200-line JSON config, which malformed roughly 1-in-N times (real bug
// observed at position 14640 on feedback-coach-academy). The matcher emits
// a tiny structured object — the failure mode is "no match," not parse error.
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
  textarea.placeholder = 'Example: A quick poll about what we should have for lunch — choices are pizza, sushi, tacos, salad.\n\nOr: A 4-round elimination game where students write puns and the bottom 30% gets eliminated each round.';
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
  status.className = 'recipe-form-status';
  status.style.cssText = 'background:#E1BEE7; border:3px solid #000; border-radius:8px; padding:12px; text-align:center; font-weight:bold;';
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

    if (data.config) {
      renderMatchPreview(modal, data, overlay);
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

function renderMatchPreview(modal, data, overlay) {
  clearModal(modal);

  // Header — "Sounds like {recipe.name}"
  var headerRow = document.createElement('div');
  headerRow.className = 'recipe-form-header';

  var titleWrap = document.createElement('div');
  titleWrap.className = 'recipe-form-title-wrap';

  var icon = document.createElement('span');
  icon.className = 'recipe-form-icon';
  icon.textContent = data.recipe.icon || '🎯';
  titleWrap.appendChild(icon);

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
    label.textContent = key;
    row.appendChild(label);

    var value = document.createElement('div');
    value.className = 'ai-match-param-value';
    var v = data.params[key];
    if (Array.isArray(v)) {
      value.textContent = v.join(', ');
    } else {
      value.textContent = String(v);
    }
    row.appendChild(value);

    paramsList.appendChild(row);
  }
  modal.appendChild(paramsList);

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

  var createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'recipe-create-btn';
  createBtn.textContent = 'Create Activity';
  createBtn.addEventListener('click', function () {
    saveMatchedConfig(data, status, createBtn, overlay);
  });
  btnRow.appendChild(createBtn);

  modal.appendChild(btnRow);
}

async function saveMatchedConfig(data, status, createBtn, overlay) {
  status.textContent = '';
  status.className = 'recipe-form-status';
  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';

  var newId = generateGameId(data.recipe.id);

  try {
    var resp = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId, config: data.config })
    });

    if (resp.ok) {
      rememberMine(newId);
      overlay.remove();
      window.location.href = '/designer/edit?game=' + encodeURIComponent(newId);
    } else {
      var saveData;
      try { saveData = await resp.json(); } catch (e) { saveData = {}; }
      showFormError(status, 'Save failed: ' + (saveData.error || 'Unknown error'));
      createBtn.disabled = false;
      createBtn.textContent = 'Create Activity';
    }
  } catch (err) {
    showFormError(status, 'Network error: ' + err.message);
    createBtn.disabled = false;
    createBtn.textContent = 'Create Activity';
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

  var advancedBtn = document.createElement('button');
  advancedBtn.type = 'button';
  advancedBtn.className = 'recipe-create-btn';
  advancedBtn.style.background = '#6A1B9A';
  advancedBtn.textContent = 'Generate Custom (Advanced)';
  advancedBtn.title = 'AI builds a fully custom activity from scratch. Slower and more error-prone.';
  advancedBtn.addEventListener('click', function () {
    closeOverlay(overlay);
    showLegacyAIGenerateModal();
    // Pre-fill the description in the legacy modal
    setTimeout(function () {
      var legacyTextarea = document.getElementById('ai-game-description');
      if (legacyTextarea) legacyTextarea.value = description;
    }, 50);
  });
  btnRow.appendChild(advancedBtn);

  modal.appendChild(btnRow);
}
