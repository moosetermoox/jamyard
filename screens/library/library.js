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
function saveCopyAndEdit(config) {
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
}

function customizeCopy(game, btn) {
  btn.disabled = true;
  btn.textContent = 'Loading…';
  var configPromise = fetch('/api/games/' + encodeURIComponent(game.id))
    .then(function (resp) {
      if (!resp.ok) throw new Error('could not load the activity');
      return resp.json();
    });
  // A few AI questions tailor the copy before the editor opens. Best-effort:
  // no questions (error, budget, mock hiccup) = plain copy, like before.
  var questionsPromise = configPromise.then(function (config) {
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
  Promise.all([configPromise, questionsPromise])
    .then(function (parts) {
      btn.disabled = false;
      btn.textContent = 'Customize';
      var config = parts[0];
      var questions = (parts[1] && parts[1].questions) || [];
      if (questions.length === 0) {
        config.name = game.name + ' (my version)';
        return saveCopyAndEdit(config);
      }
      showCustomizeDialog(game, config, questions);
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Customize';
      alert('Could not make your copy: ' + err.message);
    });
}

// The tailoring dialog: answer what you like (or skip), and the AI rewrites
// the copy's WORDS — structure never changes (the revise endpoint validates).
function showCustomizeDialog(game, config, questions) {
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '560px';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

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

  var inputs = [];
  questions.forEach(function (q) {
    var label = document.createElement('label');
    label.style.cssText = 'display:block; font-weight:700; margin:10px 0 4px; font-family:"Nunito", Arial, sans-serif;';
    label.textContent = q.question;
    modal.appendChild(label);
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = q.placeholder || '';
    input.style.cssText = 'width:100%; padding:10px 12px; border:none; background:#FFFDF6; border-radius:2px; box-shadow: inset 2px 2px 0 rgba(34,30,28,0.10), 0 0 0 1px rgba(34,30,28,0.16); font-family:"Nunito", Arial, sans-serif; font-size:0.95rem; font-weight:600; box-sizing:border-box;';
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
  skipBtn.className = 'recipe-cancel-btn';
  skipBtn.textContent = 'Skip, just copy it';
  btnRow.appendChild(skipBtn);

  var goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'recipe-create-btn';
  goBtn.textContent = 'Set it up for my class';
  btnRow.appendChild(goBtn);
  modal.appendChild(btnRow);

  function plainCopy() {
    skipBtn.disabled = true;
    goBtn.disabled = true;
    config.name = game.name + ' (my version)';
    saveCopyAndEdit(config).catch(function (err) {
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
    var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
    var request = 'A teacher is adapting this ready-made activity for their own class. ' +
      'Rewrite ONLY the teacher- and student-facing words (name, description, prompts, messages, choices, reveal templates) to fit their answers below. ' +
      'Keep every step, the structure, timers, data references, and {{tokens}} exactly as they are.\n\n' +
      (classDesc ? 'Their class: ' + classDesc + '.\n' : '') +
      answered.map(function (pair) {
        return 'Q: ' + pair.question + '\nA: ' + pair.input.value.trim();
      }).join('\n');
    fetch('/api/games/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: config, request: request })
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
        return saveCopyAndEdit(revised);
      })
      .catch(function (err) {
        // The tailoring is a bonus — never strand the teacher without a copy.
        status.textContent = 'The AI setup didn’t work (' + err.message + '), making a plain copy instead.';
        setTimeout(plainCopy, 1400);
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
  })
  .catch(function (err) {
    loadingMessage.hidden = true;
    errorMessage.textContent = 'Could not load the library: ' + err.message;
    errorMessage.hidden = false;
  });

// Speak instead of typing — search box, the build-your-own note, feedback:
// every text box (current and future-rendered) carries the corner mic.
if (window.Speech) Speech.autoAttach();
