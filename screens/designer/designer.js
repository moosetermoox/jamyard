var gamesGrid = document.getElementById('games-grid');
var loadingMessage = document.getElementById('loading-message');
var errorMessage = document.getElementById('error-message');
var createNewBtn = document.getElementById('create-new-btn');
var aiGenerateBtn = document.getElementById('ai-generate-btn');

var allGames = [];

fetchGames();

createNewBtn.addEventListener('click', function () {
  showTemplatePicker();
});

aiGenerateBtn.addEventListener('click', function () {
  showAIGenerateModal();
});

async function fetchGames() {
  try {
    var response = await fetch('/api/games');
    if (!response.ok) {
      throw new Error('Failed to load games (status ' + response.status + ')');
    }
    var data = await response.json();
    allGames = data.games || [];
    loadingMessage.hidden = true;
    renderGames(allGames);
  } catch (error) {
    loadingMessage.hidden = true;
    errorMessage.textContent = 'Error loading games: ' + error.message;
    errorMessage.hidden = false;
  }
}

function renderGames(games) {
  gamesGrid.innerHTML = '';

  if (games.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = 'No games found. Create your first game!';
    gamesGrid.appendChild(empty);
    return;
  }

  for (var i = 0; i < games.length; i++) {
    var game = games[i];

    var card = document.createElement('div');
    card.className = 'game-card';
    card.setAttribute('data-game-id', game.id);
    card.addEventListener('click', handleCardClick);

    var name = document.createElement('h2');
    name.className = 'game-card-name';
    name.textContent = game.name;

    var description = document.createElement('p');
    description.className = 'game-card-description';
    description.textContent = game.description || 'No description';

    var meta = document.createElement('div');
    meta.className = 'game-card-meta';

    var phases = document.createElement('span');
    phases.className = 'game-card-phases';
    phases.textContent = game.phaseCount + ' phases';
    meta.appendChild(phases);

    if (game.minPlayers) {
      var players = document.createElement('span');
      players.className = 'game-card-players';
      var maxLabel = game.maxPlayers ? '-' + game.maxPlayers : '+';
      players.textContent = game.minPlayers + maxLabel + ' players';
      meta.appendChild(players);
    }

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'game-card-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('data-game-id', game.id);
    deleteBtn.setAttribute('data-game-name', game.name);
    deleteBtn.addEventListener('click', handleDeleteClick);

    card.appendChild(name);
    card.appendChild(description);
    card.appendChild(meta);
    card.appendChild(deleteBtn);
    gamesGrid.appendChild(card);
  }
}

function handleCardClick(e) {
  // Don't navigate if the delete button was clicked
  if (e.target.classList.contains('game-card-delete')) return;
  var card = e.currentTarget;
  var gameId = card.getAttribute('data-game-id');
  window.location.href = '/designer/edit?game=' + encodeURIComponent(gameId);
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
      var card = btn.closest('.game-card');
      if (card) card.remove();

      // Remove from allGames
      allGames = allGames.filter(function (g) { return g.id !== id; });

      // Show empty message if no games left
      if (gamesGrid.querySelectorAll('.game-card').length === 0) {
        var empty = document.createElement('p');
        empty.className = 'empty-message';
        empty.textContent = 'No games found. Create your first game!';
        gamesGrid.appendChild(empty);
      }
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

function showTemplatePicker() {
  // Remove any existing modal
  var existing = document.getElementById('template-picker-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'template-picker-modal';
  overlay.className = 'template-picker-overlay';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Start a New Game';
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

    var card = document.createElement('div');
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
        overlay.remove();
        createFromTemplate(chosenKey);
      };
    })(key));

    grid.appendChild(card);
  }

  modal.appendChild(grid);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function showAIGenerateModal() {
  var existing = document.getElementById('ai-generate-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'ai-generate-modal';
  overlay.className = 'template-picker-overlay';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '600px';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'AI Game Generator';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Describe the game you want and AI will create it for you.';
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
  cancelBtn.onclick = function () { overlay.remove(); };

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
      statusDiv.textContent = 'AI is designing your game... This may take 15-30 seconds.';
      createFromAI(description, [], overlay);
      return;
    }

    // Show questions
    statusDiv.style.display = 'none';
    questionsDiv.style.display = 'block';
    questionsDiv.innerHTML = '';

    var qHeader = document.createElement('p');
    qHeader.style.cssText = 'font-weight:bold; margin-bottom:12px; font-size:14px;';
    qHeader.textContent = 'A few quick questions to make sure the game works right:';
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

      qBlock.appendChild(qSelect);
      questionsDiv.appendChild(qBlock);
    }

    // Disable description editing (already locked in)
    var textarea = document.getElementById('ai-game-description');
    textarea.disabled = true;
    textarea.style.opacity = '0.6';

    // Change button to "Generate Game"
    nextBtn.disabled = false;
    nextBtn.textContent = 'Generate Game';
    nextBtn.onclick = function () {
      // Gather answers
      var selects = questionsDiv.querySelectorAll('.ai-clarify-select');
      var answers = [];
      for (var k = 0; k < selects.length; k++) {
        answers.push({
          question: selects[k].getAttribute('data-question'),
          answer: selects[k].value
        });
      }
      nextBtn.disabled = true;
      nextBtn.textContent = 'Generating...';
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#E1BEE7';
      statusDiv.textContent = 'AI is designing your game... This may take 15-30 seconds.';
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
      statusDiv.innerHTML = '<strong>This idea is beyond what the framework can do:</strong><br>' +
        data.reason + '<br><br>' +
        '<strong>But here\'s an idea that would work:</strong><br>' +
        data.suggestion;
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
      window.location.href = '/designer/edit?game=' + encodeURIComponent(newId);
    } else {
      var result = await response.json();
      alert('Create failed: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Create failed: ' + error.message);
  }
}
