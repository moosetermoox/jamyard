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

function matchesGoal(game) {
  if (!activeGoal) return true;
  var tags = Array.isArray(game.tags) ? game.tags : [];
  return tags.indexOf(activeGoal) !== -1;
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
    rescueBody.textContent = 'These activities work with any subject. Pick one and your topic goes in when you host or customize it.';
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
      appendSection('★ Featured right now (' + liveFeatured.length + '), what visitors see', liveFeatured);
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
    noWinner.title = 'A connection activity, the framework refuses to add points, rankings, or eliminations to it.';
    card.appendChild(noWinner);
  }

  var actions = document.createElement('div');
  actions.className = 'game-card-actions';

  var rememberRecent = function () { Recents.add(game.id); };

  // Button order is Customize/Edit, Preview, Host — a teacher meeting an
  // activity for the first time previews before hosting, so Host anchors
  // the right edge (still visually primary via its vermillion style).
  var hostBtn = document.createElement('a');
  hostBtn.className = 'game-card-host library-host';
  hostBtn.href = '/host?game=' + encodeURIComponent(game.id);
  hostBtn.textContent = '▶ Host this';
  hostBtn.title = 'Start a live room your class can join right now';
  hostBtn.setAttribute('aria-label', 'Host "' + game.name + '" now');
  hostBtn.addEventListener('click', rememberRecent);

  var previewBtn = document.createElement('a');
  previewBtn.className = 'game-card-preview';
  previewBtn.href = '/prototype?game=' + encodeURIComponent(game.id);
  previewBtn.textContent = 'Preview';
  previewBtn.title = 'See the teacher and student screens side by side, with practice players, no class needed';
  previewBtn.setAttribute('aria-label', 'Preview "' + game.name + '" with practice players');
  previewBtn.addEventListener('click', rememberRecent);

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
    customizeBtn.setAttribute('data-game-id', game.id);
    customizeBtn.addEventListener('click', function () {
      customizeCopy(game, customizeBtn);
    });
    actions.appendChild(customizeBtn);
  }

  actions.appendChild(previewBtn);
  actions.appendChild(hostBtn);

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
// Save the teacher's copy, then land back on the library with the new
// card highlighted: its Preview and Host buttons are the natural next
// steps (customize, preview it, host it; next time just Host). The
// editor stays one click away via the card's Edit button.
function saveCopyAndReturn(config) {
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
    window.location.href = '/library?highlight=' + encodeURIComponent(copyId);
  });
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

  var LABEL_CSS = 'display:block; font-weight:700; margin:10px 0 4px; font-family:"Nunito", Arial, sans-serif;';
  var INPUT_CSS = 'padding:8px 10px; border:none; background:#FFFDF6; border-radius:2px; box-shadow: inset 2px 2px 0 rgba(34,30,28,0.10), 0 0 0 1px rgba(34,30,28,0.16); font-family:"Nunito", Arial, sans-serif; font-size:0.95rem; font-weight:600; box-sizing:border-box;';

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

  // --- Topic row: AI writes fresh questions ---
  var topicLabel = document.createElement('label');
  topicLabel.style.cssText = LABEL_CSS;
  topicLabel.textContent = 'Want new questions? Give a topic:';
  modal.appendChild(topicLabel);

  var topicRow = document.createElement('div');
  topicRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  var topicInput = document.createElement('input');
  topicInput.type = 'text';
  topicInput.placeholder = 'e.g. fractions, the water cycle, Spanish past tense';
  topicInput.style.cssText = 'flex:1; min-width:200px; ' + INPUT_CSS;
  topicRow.appendChild(topicInput);

  var countLabel = document.createElement('label');
  countLabel.style.cssText = 'font-weight:700; font-family:"Nunito", Arial, sans-serif; white-space:nowrap;';
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
    var inputs = listWrap.querySelectorAll('input[data-role="question"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });
  modal.appendChild(addBtn);

  function renderQuestions() {
    listWrap.textContent = '';
    listHeading.textContent = 'The questions (' + questions.length + '):';
    addBtn.disabled = questions.length >= 20;
    questions.forEach(function (q, qi) {
      var card = document.createElement('div');
      card.style.cssText = 'background:#FFFDF6; box-shadow: 0 0 0 1px rgba(34,30,28,0.16); border-radius:2px; padding:10px; margin-bottom:10px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';
      var headText = document.createElement('strong');
      headText.style.cssText = 'font-family:"Nunito", Arial, sans-serif; flex:1;';
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

      var qInput = document.createElement('input');
      qInput.type = 'text';
      qInput.value = q.question || '';
      qInput.placeholder = 'The question';
      qInput.maxLength = 300;
      qInput.setAttribute('data-role', 'question');
      qInput.style.cssText = 'width:100%; margin-bottom:6px; ' + INPUT_CSS;
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

        var cInput = document.createElement('input');
        cInput.type = 'text';
        cInput.value = choice;
        cInput.placeholder = 'Choice ' + (ci + 1);
        cInput.maxLength = 200;
        cInput.style.cssText = 'flex:1; ' + INPUT_CSS;
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
        addChoice.style.cssText = 'border:none; background:none; cursor:pointer; font-family:"Nunito", Arial, sans-serif; font-weight:700; color:#221E1C; opacity:0.6; padding:2px 0 0 32px;';
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

  // --- Actions ---
  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';
  btnRow.style.marginTop = '14px';
  var makeBtn = document.createElement('button');
  makeBtn.type = 'button';
  makeBtn.className = 'recipe-create-btn';
  makeBtn.textContent = 'Make my copy';
  btnRow.appendChild(makeBtn);
  modal.appendChild(btnRow);

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
    makeBtn.disabled = true;
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
        makeBtn.disabled = false;
        writeBtn.textContent = 'Write my questions';
      });
  });

  makeBtn.addEventListener('click', function () {
    var cleaned = cleanedList();
    var problems = SetupKnobs.validateQuizList(cleaned);
    if (problems.length > 0) {
      showStatus(problems.slice(0, 2).join(' '));
      return;
    }
    makeBtn.disabled = true;
    writeBtn.disabled = true;
    showStatus('Building your copy…');
    var params = JSON.parse(JSON.stringify(stamp.params));
    params.questions = cleaned;
    knobInputs.forEach(function (ki) { params[ki.knob.name] = ki.getValue(); });
    compileWorkingConfig(config, params)
      .then(function (working) {
        working.name = game.name + ' (my version)';
        return saveCopyAndReturn(working);
      })
      .catch(function (err) {
        makeBtn.disabled = false;
        writeBtn.disabled = false;
        showStatus('Could not make your copy: ' + err.message);
      });
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
  topicInput.focus();
}

function customizeCopy(game, btn) {
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
    return fetch('/api/games/customize-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config,
        // The saved class profile rides along so the questions build on it
        // instead of re-asking grade and subject.
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : ''
      })
    }).then(function (r) { return r.ok ? r.json() : { questions: [] }; })
      .catch(function () { return { questions: [] }; });
  });
  Promise.all([configPromise, questionsPromise, recipePromise])
    .then(function (parts) {
      btn.disabled = false;
      btn.textContent = 'Customize';
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
      var questions = (parts[1] && parts[1].questions) || [];
      var knobs = (window.SetupKnobs && summary)
        ? SetupKnobs.knobsFor(summary, config.recipe) : [];
      if (questions.length === 0 && knobs.length === 0) {
        config.name = game.name + ' (my version)';
        return saveCopyAndReturn(config);
      }
      showCustomizeDialog(game, config, questions, knobs);
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Customize';
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

  var LABEL_CSS = 'display:block; font-weight:700; margin:10px 0 4px; font-family:"Nunito", Arial, sans-serif;';
  var INPUT_CSS = 'padding:10px 12px; border:none; background:#FFFDF6; border-radius:2px; box-shadow: inset 2px 2px 0 rgba(34,30,28,0.10), 0 0 0 1px rgba(34,30,28,0.16); font-family:"Nunito", Arial, sans-serif; font-size:0.95rem; font-weight:600; box-sizing:border-box;';

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
      input.addEventListener('input', updateSkipLabel);
      input.addEventListener('change', updateSkipLabel);
    });
  }

  // Only introduce the AI questions when there are any to answer.
  if (questions.length > 0) {
    var subtitle = document.createElement('p');
    subtitle.className = 'template-picker-subtitle';
    subtitle.textContent = 'Answer what you like and we’ll word your copy of “' + game.name + '” for your class. Anything you skip stays as-is.';
    modal.appendChild(subtitle);

    // Show what we already know so the teacher never wonders whether to
    // repeat their grade and subject in the answers.
    var knownClass = window.TeacherProfile ? TeacherProfile.describe() : '';
    if (knownClass) {
      var knownLine = document.createElement('p');
      knownLine.className = 'template-picker-subtitle';
      knownLine.style.fontWeight = '800';
      knownLine.textContent = 'Writing for your class: ' + knownClass + '.';
      modal.appendChild(knownLine);
    }
  }

  var inputs = [];
  questions.forEach(function (q) {
    var label = document.createElement('label');
    label.style.cssText = LABEL_CSS;
    label.textContent = q.question;
    modal.appendChild(label);
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = q.placeholder || '';
    input.style.cssText = 'width:100%; ' + INPUT_CSS;
    modal.appendChild(input);
    inputs.push({ question: q.question, input: input });
  });

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '12px';
  status.hidden = true;
  modal.appendChild(status);

  var btnRow = document.createElement('div');
  btnRow.className = 'recipe-form-buttons';
  btnRow.style.marginTop = '14px';

  var skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  // Knobs-only dialog (no AI questions): one primary button, nothing to skip.
  var knobsOnly = questions.length === 0;
  skipBtn.className = knobsOnly ? 'recipe-create-btn' : 'recipe-cancel-btn';
  skipBtn.textContent = knobsOnly ? 'Make my copy' : 'Skip, just copy it';
  btnRow.appendChild(skipBtn);

  var goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'recipe-create-btn';
  goBtn.textContent = 'Set it up for my class';
  goBtn.hidden = knobsOnly;
  btnRow.appendChild(goBtn);
  modal.appendChild(btnRow);

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

  // "Skip" refers to the AI questions; touched knobs are deliberate input
  // and always apply. Say so on the button.
  function updateSkipLabel() {
    if (knobsOnly) return;
    skipBtn.textContent = anyKnobTouched() ? 'Copy with these settings' : 'Skip, just copy it';
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

  function saveWorking(working) {
    working.name = game.name + ' (my version)';
    return saveCopyAndReturn(working);
  }

  function plainCopy() {
    skipBtn.disabled = true;
    goBtn.disabled = true;
    buildWorkingConfig()
      .then(saveWorking)
      .catch(function (err) {
        skipBtn.disabled = false;
        goBtn.disabled = false;
        status.hidden = false;
        status.textContent = 'Could not make your copy: ' + err.message;
      });
  }

  skipBtn.addEventListener('click', plainCopy);

  goBtn.addEventListener('click', function () {
    var answered = inputs.filter(function (pair) { return pair.input.value.trim(); });
    if (answered.length === 0) return plainCopy();
    skipBtn.disabled = true;
    goBtn.disabled = true;
    goBtn.textContent = 'Setting it up…';
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
            return saveCopyAndReturn(revised);
          })
          .catch(function (err) {
            // The tailoring is a bonus — never strand the teacher without a
            // copy, and never lose their knob settings with it.
            status.textContent = 'The AI setup didn’t work (' + err.message + '), making your copy without the rewording.';
            setTimeout(function () {
              saveWorking(working).catch(function (saveErr) {
                skipBtn.disabled = false;
                goBtn.disabled = false;
                goBtn.textContent = 'Set it up for my class';
                status.textContent = 'Could not make your copy: ' + saveErr.message;
              });
            }, 1400);
          });
      })
      .catch(function (err) {
        // The knob recompile failed (bad settings, recipe drift): let the
        // teacher adjust instead of quietly saving something else.
        skipBtn.disabled = false;
        goBtn.disabled = false;
        goBtn.textContent = 'Set it up for my class';
        status.textContent = 'Could not apply your settings: ' + err.message;
      });
  });

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
  if (TeacherProfile.shouldOffer()) return renderSetupCard();
  renderClassLine(TeacherProfile.get());
}

function renderClassLine(profile) {
  var line = document.createElement('p');
  line.className = 'class-line';
  var text = document.createElement('span');
  text.textContent = profile
    ? 'Your class: ' + TeacherProfile.describe()
    : 'Tell us your grade and subjects, and Customize will suggest ready-made questions that fit your class.';
  line.appendChild(text);
  var change = document.createElement('button');
  change.type = 'button';
  change.className = 'class-line-change';
  change.textContent = profile ? 'Change' : 'Set up';
  change.addEventListener('click', function () {
    setupEl.innerHTML = '';
    renderSetupCard();
  });
  line.appendChild(change);
  setupEl.appendChild(line);
}

function renderSetupCard() {
  var existing = TeacherProfile.get() || { gradeBand: null, subjects: [] };
  var picked = { gradeBand: existing.gradeBand, subjects: existing.subjects.slice() };

  var card = document.createElement('div');
  card.className = 'teacher-setup-card';

  var title = document.createElement('h2');
  title.className = 'teacher-setup-title';
  title.textContent = 'New here? Start with this';
  card.appendChild(title);

  var intro = document.createElement('ul');
  intro.className = 'teacher-setup-intro';
  [
    'You project the host screen; students join on Chromebooks or tablets with a room code. No student accounts.',
    'Setup takes about 3 minutes the first time.',
    'Not sure yet? Preview any activity to see your screen and practice students side by side, no class needed.'
  ].forEach(function (lineText) {
    var li = document.createElement('li');
    li.textContent = lineText;
    intro.appendChild(li);
  });
  card.appendChild(intro);

  var guideLink = document.createElement('a');
  guideLink.className = 'teacher-setup-guide-link';
  guideLink.href = '/guide';
  guideLink.textContent = 'Read the one-page teacher guide';
  card.appendChild(guideLink);

  var ask = document.createElement('p');
  ask.className = 'teacher-setup-ask';
  ask.textContent = 'What do you teach? When you customize an activity, we\'ll suggest ready-made questions that fit your class.';
  card.appendChild(ask);

  function chipRow(options, isPicked, onPick) {
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
        var active = isPicked(opt.id);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
        // Single-select rows: repaint siblings so only one stays lit.
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

  var gradeLabel = document.createElement('p');
  gradeLabel.className = 'teacher-setup-label';
  gradeLabel.textContent = 'Grade band';
  card.appendChild(gradeLabel);
  card.appendChild(chipRow(
    TeacherProfile.GRADE_BANDS,
    function (id) { return picked.gradeBand === id; },
    function (id) { picked.gradeBand = (picked.gradeBand === id) ? null : id; }
  ));

  var subjectLabel = document.createElement('p');
  subjectLabel.className = 'teacher-setup-label';
  subjectLabel.textContent = 'Subjects, pick any';
  card.appendChild(subjectLabel);
  card.appendChild(chipRow(
    TeacherProfile.SUBJECTS,
    function (id) { return picked.subjects.indexOf(id) !== -1; },
    function (id) {
      var at = picked.subjects.indexOf(id);
      if (at === -1) picked.subjects.push(id); else picked.subjects.splice(at, 1);
    }
  ));

  var btnRow = document.createElement('div');
  btnRow.className = 'teacher-setup-buttons';

  var skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'teacher-setup-skip';
  skipBtn.textContent = 'Skip for now';
  skipBtn.addEventListener('click', function () {
    TeacherProfile.dismiss();
    renderTeacherSetup();
  });
  btnRow.appendChild(skipBtn);

  var saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'teacher-setup-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', function () {
    if (!picked.gradeBand && picked.subjects.length === 0) {
      TeacherProfile.dismiss();
    } else {
      TeacherProfile.save(picked);
    }
    renderTeacherSetup();
  });
  btnRow.appendChild(saveBtn);

  card.appendChild(btnRow);
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
      message: 'Opened the designer from the library.'
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

// ?highlight= (where saveCopyAndReturn lands): scroll the fresh copy's
// card into view and flash it so the teacher sees where their activity
// lives — Preview and Host are right on it. Param stripped so a refresh
// lands on the plain library.
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
  var card = document.querySelector('.library-card[data-game-id="' + CSS.escape(wantedId) + '"]');
  if (!card) return; // filtered out or unknown — the library itself is the fallback
  card.scrollIntoView({ block: 'center' });
  card.classList.add('game-card-highlight');
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
    handleHighlightParam();
  })
  .catch(function (err) {
    loadingMessage.hidden = true;
    errorMessage.textContent = 'Could not load the library: ' + err.message;
    errorMessage.hidden = false;
  });

// Speak instead of typing — search box, the build-your-own note, feedback:
// every text box (current and future-rendered) carries the corner mic.
if (window.Speech) Speech.autoAttach();
