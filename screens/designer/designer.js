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

    card.appendChild(name);
    card.appendChild(description);
    card.appendChild(meta);
    gamesGrid.appendChild(card);
  }
}

function handleCardClick(e) {
  var card = e.currentTarget;
  var gameId = card.getAttribute('data-game-id');
  window.location.href = '/designer/edit?game=' + encodeURIComponent(gameId);
}
