const gamesGrid = document.getElementById('games-grid');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');
const createNewBtn = document.getElementById('create-new-btn');

fetchGames();

createNewBtn.addEventListener('click', function () {
  window.location.href = '/designer/edit';
});

async function fetchGames() {
  try {
    var response = await fetch('/api/games');
    if (!response.ok) {
      throw new Error('Failed to load games (status ' + response.status + ')');
    }
    var data = await response.json();
    loadingMessage.hidden = true;
    renderGames(data.games);
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
