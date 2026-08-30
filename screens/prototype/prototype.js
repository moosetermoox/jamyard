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
const hostBtn = document.getElementById('host-btn');
const botFillBtn = document.getElementById('bot-fill-btn');
const skipBtn = document.getElementById('skip-btn');
const benchBar = document.getElementById('bench-bar');
const resetBtn = document.getElementById('reset-btn');
const iframeContainer = document.getElementById('iframe-container');
const viewToggle = document.getElementById('view-toggle');
const viewGridBtn = document.getElementById('view-grid-btn');
const viewCarouselBtn = document.getElementById('view-carousel-btn');
const carouselPrev = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');
const carouselDots = document.getElementById('carousel-dots');

// One-at-a-time is the default (observation 2026-08-27): the grid of
// eight tiny screens read as noise; one teacher board plus one student
// screen is the picture a first-timer can actually follow.
let viewMode = 'carousel';
let carouselIndex = 0; // 0-based index into player panels

// Live-session state for the add-a-player slot (late join is a supported
// path, so a new pretend student can join the running room directly).
let currentCode = null;
let livePlayers = 0;

// --- The map rail: the activity's treasure map beside the screens, with
// a "you are here" mark that follows the live room. The map comes from
// the same endpoint the library popups use; the live position comes from
// pairing a silent teacher-console socket (the host iframe hands over
// the room PIN on launch, same-origin postMessage).
const mapRail = document.getElementById('map-rail');
const mapRailHolder = document.getElementById('map-rail-holder');
let railMap = null;
let railSocket = null;
let railPhaseId = null;
let railPhaseType = null;

function showMapRail(gameId) {
  railMap = null;
  railPhaseId = null;
  railPhaseType = null;
  if (!mapRail || !window.ActivityMap) return;
  mapRailHolder.textContent = '';
  fetch('/api/games/' + encodeURIComponent(gameId) + '/map')
    .then(r => (r.ok ? r.json() : null))
    .then(map => {
      if (!map || !Array.isArray(map.stops) || map.stops.length === 0) return;
      railMap = map;
      mapRailHolder.textContent = '';
      mapRailHolder.appendChild(ActivityMap.render(map));
      mapRail.hidden = false;
      updateRailHighlight();
    })
    .catch(() => { /* the rail is garnish, never block the preview */ });
}

function hideMapRail() {
  if (railSocket) { railSocket.disconnect(); railSocket = null; }
  railMap = null;
  railPhaseId = null;
  railPhaseType = null;
  if (mapRail) {
    mapRail.hidden = true;
    mapRailHolder.textContent = '';
  }
}

function connectRail(code, pin) {
  if (railSocket) { railSocket.disconnect(); railSocket = null; }
  if (!window.io || !pin) return;
  railSocket = io();
  railSocket.on('connect', () => railSocket.emit('join-teacher', { code, pin }));
  railSocket.on('teacher-joined', snap => {
    railPhaseId = snap.phaseId;
    railPhaseType = snap.phaseType;
    updateRailHighlight();
  });
  railSocket.on('teacher-phase', p => {
    railPhaseId = p.phaseId;
    railPhaseType = p.phaseType;
    updateRailHighlight();
  });
}

function updateRailHighlight() {
  if (!railMap || !mapRail || mapRail.hidden) return;
  let target = null;
  if (!railPhaseId || railPhaseType === 'lobby') {
    target = mapRailHolder.querySelector('.amap-startrow');
  } else if (railPhaseType === 'end') {
    target = mapRailHolder.querySelector('.amap-endrow');
  } else {
    const stopRows = mapRailHolder.querySelectorAll(
      '.amap-row:not(.amap-startrow):not(.amap-endrow)');
    for (let i = 0; i < railMap.stops.length && i < stopRows.length; i++) {
      const ids = railMap.stops[i].ids || [];
      if (ids.indexOf(railPhaseId) !== -1) { target = stopRows[i]; break; }
    }
  }
  // No match (a round's inner step, a side branch): keep the last mark
  // rather than leaving the trail unmarked.
  if (!target) return;
  mapRailHolder.querySelectorAll('.amap-here').forEach(r => r.classList.remove('amap-here'));
  target.classList.add('amap-here');
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// The empty test bench (stands + hint). Launch clears the container but we
// keep the detached node and put it back on Reset, so the stage is never
// silently blank.
const prelaunchStage = document.getElementById('prelaunch-stage');

// --- Seat blocks: the visible player-count control ---
// Filled painted blocks are players, dashed blocks are empty seats
// (preview-prototype.png). The hidden range input stays the value holder:
// every existing relaunch path listens to its change event.
const seatBlocks = document.getElementById('seat-blocks');

function renderSeats() {
  if (!seatBlocks) return;
  const count = parseInt(playerCount.value, 10);
  seatBlocks.textContent = '';
  for (let i = 1; i <= 8; i++) {
    const seat = document.createElement('button');
    seat.type = 'button';
    const filled = i <= count;
    seat.className = 'seat-block ' + (filled ? 'seat-c' + ((i - 1) % 5) : 'seat-empty');
    seat.style.setProperty('--rot', (((i % 2) ? -1 : 1) * (0.8 + (i % 3) * 0.4)).toFixed(1) + 'deg');
    seat.title = i === 1 ? '1 player' : i + ' players';
    seat.setAttribute('aria-label', i === 1 ? '1 pretend student' : i + ' pretend students');
    seat.setAttribute('aria-pressed', filled ? 'true' : 'false');
    seat.addEventListener('click', () => {
      playerCount.value = i;
      playerCountDisplay.textContent = String(i);
      renderSeats();
      playerCount.dispatchEvent(new Event('change'));
    });
    seatBlocks.appendChild(seat);
  }
}

renderSeats();

// Arrived from the editor's Preview button? "Back" should return to the
// editor, not the library — you preview, spot something to change, and need
// the way back to change it. Preview opens in a new tab, so if the original
// editor tab is still open, just close this one and land back on it.
(function () {
  const navParams = new URLSearchParams(window.location.search);
  const fromEditor = navParams.get('from') === 'editor';
  const navGame = navParams.get('game');
  if (!fromEditor || !navGame) return;
  const backLink = document.getElementById('back-link');
  if (!backLink) return;
  backLink.textContent = '← Back to editor';
  backLink.href = '/designer/edit?game=' + encodeURIComponent(navGame);
  backLink.addEventListener('click', function (e) {
    try {
      if (window.opener && !window.opener.closed) {
        e.preventDefault();
        window.close();
      }
    } catch (err) { /* opener gone or blocked — the href navigation covers it */ }
  });
})();

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
    hostBtn.disabled = false;

    // Auto-select game from URL param (e.g. from editor's Test Game button)
    const params = new URLSearchParams(window.location.search);
    const autoGame = params.get('game');
    if (autoGame) {
      const match = Array.from(gameSelect.options).find(o => o.value === autoGame);
      if (match) {
        gameSelect.value = autoGame;
        // Arrived via a Preview button with the activity chosen — launch
        // right away instead of showing a blank stage (usability test
        // 2026-08-01: the empty page read as broken).
        launchBtn.click();
      }
    }
  })
  .catch(() => {
    gameSelect.innerHTML = '<option value="">Failed to load games</option>';
  });

// Host for real — the step after a good preview. Same activity the
// preview is showing; the practice room is simply left behind.
hostBtn.addEventListener('click', () => {
  const gameId = gameSelect.value;
  if (!gameId) return;
  window.location.href = '/host?game=' + encodeURIComponent(gameId);
});

// Launch prototype
launchBtn.addEventListener('click', () => {
  const gameId = gameSelect.value;
  if (!gameId) return;

  const count = parseInt(playerCount.value, 10);

  // Disable Launch while a session runs. The activity select and player
  // seats stay enabled — changing either relaunches with the new value.
  launchBtn.disabled = true;
  // Bench running: Launch steps aside, the red moves to ▶ Host this.
  document.body.classList.add('pt-running');

  // Clear previous iframes
  iframeContainer.innerHTML = '';
  iframeContainer.dataset.players = count;

  // Create host iframe
  const hostWrapper = document.createElement('div');
  hostWrapper.className = 'iframe-panel host-panel';
  const hostLabel = document.createElement('div');
  hostLabel.className = 'panel-label';
  hostLabel.textContent = 'Teacher screen';
  hostWrapper.appendChild(hostLabel);

  const hostIframe = document.createElement('iframe');
  hostIframe.src = '/host?game=' + encodeURIComponent(gameId) + '&prototype=true';
  hostWrapper.appendChild(hostIframe);
  iframeContainer.appendChild(hostWrapper);

  // Listen for room code from host iframe
  window.addEventListener('message', function onMessage(e) {
    if (e.data && e.data.type === 'room-created') {
      window.removeEventListener('message', onMessage);
      currentCode = e.data.code;
      hostLabel.textContent = 'Teacher screen · Room ' + e.data.code;
      createPlayerIframes(e.data.code, count);
      benchBar.hidden = false;
      resetBtn.hidden = false;
      viewToggle.hidden = false;
      // Apply the current view to the fresh panels (carousel by default;
      // without this the new grid always starts as a grid).
      setViewMode(viewMode);
      // The map rail: draw the plan, then follow the live room.
      showMapRail(gameId);
      connectRail(e.data.code, e.data.teacherPin);
    }
  });
});

function addPlayerPanel(code, i) {
  const wrapper = document.createElement('div');
  wrapper.className = 'iframe-panel player-panel';
  const label = document.createElement('div');
  label.className = 'panel-label plabel-' + ((i - 1) % 5);
  label.textContent = 'Player ' + i;
  wrapper.appendChild(label);

  const iframe = document.createElement('iframe');
  iframe.src = '/player?prototype=true&code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent('Player ' + i);
  // Same-origin embed; lets the mic button work during teacher previews.
  iframe.allow = 'microphone';
  wrapper.appendChild(iframe);
  // The dashed add-a-player slot stays the last cell.
  const slot = iframeContainer.querySelector('.add-player-slot');
  iframeContainer.insertBefore(wrapper, slot || null);
}

function createPlayerIframes(code, count) {
  for (let i = 1; i <= count; i++) addPlayerPanel(code, i);
  livePlayers = count;
  refreshAddSlot();
}

// The dashed "+ Add a player" seat at the end of the running grid — one
// click drops one more pretend student into the live room (no relaunch;
// they late-join into the current step, same as a real Chromebook would).
function refreshAddSlot() {
  const old = iframeContainer.querySelector('.add-player-slot');
  if (old) old.remove();
  if (!currentCode || livePlayers >= 8) {
    iframeContainer.dataset.players = Math.min(livePlayers, 8);
    return;
  }
  // The slot occupies a grid seat of its own, so the row count includes it.
  iframeContainer.dataset.players = Math.min(livePlayers + 1, 8);
  const slot = document.createElement('button');
  slot.type = 'button';
  slot.className = 'add-player-slot';
  slot.textContent = '+ Add a player';
  slot.title = 'Add one more pretend student to the running room';
  slot.addEventListener('click', () => {
    if (!currentCode || livePlayers >= 8) return;
    livePlayers += 1;
    addPlayerPanel(currentCode, livePlayers);
    // Keep the seat blocks honest without firing a relaunch (setting
    // .value programmatically never emits a change event).
    playerCount.value = livePlayers;
    playerCountDisplay.textContent = String(livePlayers);
    renderSeats();
    refreshAddSlot();
  });
  iframeContainer.appendChild(slot);
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

// Reset — tear down the pieces and put the empty bench back on the stage
resetBtn.addEventListener('click', () => {
  iframeContainer.innerHTML = '';
  iframeContainer.removeAttribute('data-players');
  if (prelaunchStage) iframeContainer.appendChild(prelaunchStage);
  hideMapRail();
  currentCode = null;
  livePlayers = 0;
  document.body.classList.remove('pt-running');
  launchBtn.disabled = false;
  gameSelect.disabled = false;
  playerCount.disabled = false;
  benchBar.hidden = true;
  resetBtn.hidden = true;
  viewToggle.hidden = true;
  // Keep the chosen view for the next launch (a mid-preview relaunch
  // goes through Reset; snapping back to grid lost the teacher's pick).
  setViewMode(viewMode);
});

// Moving the players slider mid-preview relaunches with the new count —
// auto-launch (arriving via a Preview button) had left the slider
// disabled, which read as broken (teacher report 2026-08-02).
playerCount.addEventListener('input', () => {
  if (playerCount.disabled) return;
  const display = document.getElementById('player-count-display');
  if (display) display.textContent = playerCount.value;
});
playerCount.addEventListener('change', () => {
  if (!launchBtn.disabled) return; // not launched yet — Launch will use it
  playerCount.disabled = false;
  resetBtn.click();
  launchBtn.click();
});

// Picking a different activity mid-preview relaunches with it (same
// pattern as the players slider; the select used to be disabled after
// launch, which read as a broken dropdown).
gameSelect.addEventListener('change', () => {
  if (!launchBtn.disabled) return; // not launched yet — Launch will use it
  resetBtn.click();
  launchBtn.click();
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
