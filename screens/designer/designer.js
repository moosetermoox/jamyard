var gamesGrid = document.getElementById('games-grid');
var loadingMessage = document.getElementById('loading-message');
var errorMessage = document.getElementById('error-message');
var createNewBtn = document.getElementById('create-new-btn');

var allGames = [];

fetchGames();

createNewBtn.addEventListener('click', function () {
  showTemplatePicker();
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
