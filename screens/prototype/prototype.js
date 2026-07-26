/**
 * prototype.js — the prototype / playtest harness (/prototype).
 *
 * Launches a game with the host screen plus N player iframes side by side
 * (grid or one-at-a-time carousel) so a teacher can play through a game solo
 * before class. Adds bot-fill, skip, reset, and a relay auto-advance loop that
 * reads the host iframe. Dev/preview tooling — not part of a real class run.
 */
const gameSelect = document.getElementById('game-select');
const playerCount = document.getElementById('player-count');
const playerCountDisplay = document.getElementById('player-count-display');
const launchBtn = document.getElementById('launch-btn');
const botFillBtn = document.getElementById('bot-fill-btn');
const skipBtn = document.getElementById('skip-btn');
const resetBtn = document.getElementById('reset-btn');
const iframeContainer = document.getElementById('iframe-container');
const viewToggle = document.getElementById('view-toggle');
const viewGridBtn = document.getElementById('view-grid-btn');
const viewCarouselBtn = document.getElementById('view-carousel-btn');
const carouselPrev = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');
const carouselDots = document.getElementById('carousel-dots');

let viewMode = 'grid';
let carouselIndex = 0; // 0-based index into player panels

playerCount.addEventListener('input', () => {
  playerCountDisplay.textContent = playerCount.value;
});

// Fetch available games
fetch('/api/games')
  .then(res => res.json())
  .then(({ games }) => {
    // Same curated-list rule as the designer/host pickers; a ?game= deep
    // link (editor's Prototype Mode button) still works for hidden games.
    const linkParams = new URLSearchParams(window.location.search);
    const deepLinked = linkParams.get('game');
    if (window.GameVisibility) {
      const visible = GameVisibility.visibleGames(games, {
        owner: window.OwnerMode ? OwnerMode.isOn() : false,
        myIds: window.MyGames ? MyGames.list() : []
      });
      if (deepLinked && !visible.some(g => g.id === deepLinked)) {
        const target = games.find(g => g.id === deepLinked);
        if (target) visible.push(target);
      }
      games = visible;
    }

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
      botFillBtn.hidden = false;
      skipBtn.hidden = false;
      resetBtn.hidden = false;
      viewToggle.hidden = false;
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

// Bot Fill — send auto-fill to all player iframes. Single shot is enough for
// most phases; relay needs follow-up shots because turns rotate and only the
// active player can submit. We loop only while the host is in the relay
// section, so bot-fill never bleeds into the next phase (which would auto-skip
// e.g. the vote phase before the user can see it).
botFillBtn.addEventListener('click', () => {
  const fire = () => {
    const playerIframes = iframeContainer.querySelectorAll('.player-panel iframe');
    for (const iframe of playerIframes) {
      iframe.contentWindow.postMessage({ type: 'bot-fill' }, '*');
    }
  };
  const isHostInRelay = () => {
    const hostIframe = iframeContainer.querySelector('.host-panel iframe');
    if (!hostIframe) return false;
    try {
      const sec = hostIframe.contentDocument && hostIframe.contentDocument.getElementById('relay-section');
      return !!(sec && !sec.hidden);
    } catch (_) {
      return false; // cross-origin fallback — single shot is the safe default
    }
  };

  fire();
  if (!isHostInRelay()) return;

  // Relay loop: keep firing while the host stays in relay-section. Hard cap of
  // ~15s keeps it from running forever if something goes wrong.
  let shots = 25;
  const id = setInterval(() => {
    if (--shots <= 0 || !isHostInRelay()) {
      clearInterval(id);
      return;
    }
    fire();
  }, 600);
});

// Skip — tell host iframe to advance the current phase / close submissions / continue
skipBtn.addEventListener('click', () => {
  const hostIframe = iframeContainer.querySelector('.host-panel iframe');
  if (hostIframe) hostIframe.contentWindow.postMessage({ type: 'prototype-skip' }, '*');
});

// Reset
resetBtn.addEventListener('click', () => {
  iframeContainer.innerHTML = '';
  launchBtn.disabled = false;
  gameSelect.disabled = false;
  playerCount.disabled = false;
  botFillBtn.hidden = true;
  skipBtn.hidden = true;
  resetBtn.hidden = true;
  viewToggle.hidden = true;
  setViewMode('grid');
});

// --- View toggle ---

viewGridBtn.addEventListener('click', () => setViewMode('grid'));
viewCarouselBtn.addEventListener('click', () => setViewMode('carousel'));

function setViewMode(mode) {
  viewMode = mode;
  viewGridBtn.classList.toggle('active', mode === 'grid');
  viewCarouselBtn.classList.toggle('active', mode === 'carousel');

  const count = parseInt(iframeContainer.dataset.players || '0', 10);
  // Carousel chrome only exists when there are player panels to rotate —
  // never before Launch, never in grid mode.
  const hasPanels = getPlayerPanels().length > 0;

  if (mode === 'grid' || !hasPanels) {
    iframeContainer.removeAttribute('data-view');
    carouselPrev.hidden = true;
    carouselNext.hidden = true;
    carouselDots.hidden = true;
    getPlayerPanels().forEach(p => p.style.display = '');
  } else {
    iframeContainer.dataset.view = 'carousel';
    carouselIndex = Math.min(carouselIndex, Math.max(0, count - 1));
    carouselPrev.hidden = false;
    carouselNext.hidden = false;
    carouselDots.hidden = false;
    showCarouselPlayer(carouselIndex);
  }
}

function getPlayerPanels() {
  return Array.from(iframeContainer.querySelectorAll('.player-panel'));
}

function showCarouselPlayer(index) {
  const panels = getPlayerPanels();
  if (!panels.length) return;
  carouselIndex = ((index % panels.length) + panels.length) % panels.length;
  panels.forEach((p, i) => { p.style.display = i === carouselIndex ? '' : 'none'; });
  carouselPrev.disabled = false;
  carouselNext.disabled = false;
  // Update dots
  carouselDots.innerHTML = '';
  panels.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === carouselIndex ? ' active' : '');
    dot.title = 'Player ' + (i + 1);
    dot.addEventListener('click', () => showCarouselPlayer(i));
    carouselDots.appendChild(dot);
  });
}

carouselPrev.addEventListener('click', () => showCarouselPlayer(carouselIndex - 1));
carouselNext.addEventListener('click', () => showCarouselPlayer(carouselIndex + 1));

// Keyboard ← → to navigate carousel
document.addEventListener('keydown', (e) => {
  if (viewMode !== 'carousel') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowLeft') showCarouselPlayer(carouselIndex - 1);
  if (e.key === 'ArrowRight') showCarouselPlayer(carouselIndex + 1);
});
