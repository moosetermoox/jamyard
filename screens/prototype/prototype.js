const gameSelect = document.getElementById('game-select');
const playerCount = document.getElementById('player-count');
const playerCountDisplay = document.getElementById('player-count-display');
const launchBtn = document.getElementById('launch-btn');
const resetBtn = document.getElementById('reset-btn');
const iframeContainer = document.getElementById('iframe-container');

playerCount.addEventListener('input', () => {
  playerCountDisplay.textContent = playerCount.value;
});

// Fetch available games
fetch('/api/games')
  .then(res => res.json())
  .then(({ games }) => {
    gameSelect.innerHTML = '';
    if (games.length === 0) {
      gameSelect.innerHTML = '<option value="">No games available</option>';
      return;
    }
    for (const game of games) {
      const option = document.createElement('option');
      option.value = game.id;
      option.textContent = game.name;
      gameSelect.appendChild(option);
    }
    launchBtn.disabled = false;

    // Auto-select game from URL param (e.g. from editor's Test Game button)
    const params = new URLSearchParams(window.location.search);
    const autoGame = params.get('game');
    if (autoGame) {
      const match = Array.from(gameSelect.options).find(o => o.value === autoGame);
      if (match) {
        gameSelect.value = autoGame;
      }
    }
  })
  .catch(() => {
    gameSelect.innerHTML = '<option value="">Failed to load games</option>';
  });

// Launch prototype
launchBtn.addEventListener('click', () => {
  const gameId = gameSelect.value;
  if (!gameId) return;

  const count = parseInt(playerCount.value, 10);

  // Disable controls
  launchBtn.disabled = true;
  gameSelect.disabled = true;
  playerCount.disabled = true;

  // Clear previous iframes
  iframeContainer.innerHTML = '';
  iframeContainer.dataset.players = count;

  // Create host iframe
  const hostWrapper = document.createElement('div');
  hostWrapper.className = 'iframe-panel host-panel';
  hostWrapper.innerHTML = '<div class="panel-label">Host</div>';

  const hostIframe = document.createElement('iframe');
  hostIframe.src = '/host?game=' + encodeURIComponent(gameId) + '&prototype=true';
  hostWrapper.appendChild(hostIframe);
  iframeContainer.appendChild(hostWrapper);

  // Listen for room code from host iframe
  window.addEventListener('message', function onMessage(e) {
    if (e.data && e.data.type === 'room-created') {
      window.removeEventListener('message', onMessage);
      createPlayerIframes(e.data.code, count);
      resetBtn.hidden = false;
    }
  });
});

function createPlayerIframes(code, count) {
  for (let i = 1; i <= count; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'iframe-panel player-panel';
    wrapper.innerHTML = '<div class="panel-label">Player ' + i + '</div>';

    const iframe = document.createElement('iframe');
    iframe.src = '/player?prototype=true&code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent('Player ' + i);
    wrapper.appendChild(iframe);
    iframeContainer.appendChild(wrapper);
  }
}

// Reset
resetBtn.addEventListener('click', () => {
  iframeContainer.innerHTML = '';
  launchBtn.disabled = false;
  gameSelect.disabled = false;
  playerCount.disabled = false;
  resetBtn.hidden = true;
});
