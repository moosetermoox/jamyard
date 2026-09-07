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
let railInstance = 0; // phaseInstanceId: tells a repeat of the same step apart

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
      wireRailClicks();
      updateRailHighlight();
    })
    .catch(() => { /* the rail is garnish, never block the preview */ });
}

function hideMapRail() {
  hideSkipAsk();
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
    railInstance = snap.phaseInstanceId || 0;
    updateRailHighlight();
    fastForwardCheck();
  });
  railSocket.on('teacher-phase', p => {
    railPhaseId = p.phaseId;
    railPhaseType = p.phaseType;
    railInstance = p.phaseInstanceId || 0;
    updateRailHighlight();
    fastForwardCheck();
  });
}

// --- Skip ahead: click a step on the map rail (or arrive with
// ?goto=<phaseId>) and the room is played forward with the two moves a
// teacher makes by hand (Bot Fill, then Skip) until the live "you are
// here" reaches that step, then the teacher takes over. Skip only fires
// when the step did NOT move on its own after the fill (all answers in
// auto-advances many steps; skipping on top would jump PAST the target),
// and it never uses the host's generic-advance fallback unless the room
// has sat still for a while on a step that is not the AI's.
let pendingGoto = null;
let ff = null; // { targets, ticks, still, timer, skipTimer }
const FF_TICK_MS = 1800;
const FF_MAX_TICKS = 90;    // ~2.7 minutes, then hand back
// Submits are async server-side (moderation ladder); give every bot answer
// time to land before the close button is pressed on top of it.
const FF_SKIP_DELAY_MS = 1400;
const FF_STILL_TICKS = 6;   // ~11s without movement: allow the generic advance
const benchHint = document.querySelector('#bench-bar .bench-hint');
const benchHintDefault = benchHint ? benchHint.textContent : '';

function setBenchHint(text, state) {
  if (!benchHint) return;
  benchHint.textContent = text;
  benchHint.classList.toggle('bench-hint-busy', state === 'busy');
  benchHint.classList.toggle('bench-hint-done', state === 'done');
}

// Is the live room on any of these phase ids? A round's inner step wears
// a virtual id (_fe:<parent>:<sub>); the map names the parent, so
// arriving inside the round counts.
function phaseMatches(targets) {
  if (!railPhaseId || !targets || !targets.length) return false;
  for (const target of targets) {
    if (railPhaseId === target) return true;
    if (typeof railPhaseId === 'string' && railPhaseId.indexOf('_fe:' + target + ':') === 0) return true;
  }
  return false;
}

// Which map stop the live room is on: -1 before the first stop (lobby),
// stops.length past the last (wrap up), or -2 when the map can't tell
// (a side branch).
function currentStopIndex() {
  const stops = (railMap && Array.isArray(railMap.stops)) ? railMap.stops : [];
  if (!railPhaseId || railPhaseType === 'lobby') return -1;
  if (railPhaseType === 'end') return stops.length;
  for (let i = 0; i < stops.length; i++) {
    if (phaseMatches(stops[i].ids || [])) return i;
  }
  return -2;
}

// "Rounds" or the step's plain name, plus its excerpt when the map has one.
function stepNameFor(phaseId) {
  const stops = (railMap && Array.isArray(railMap.stops)) ? railMap.stops : [];
  for (const stop of stops) {
    if ((stop.ids || []).indexOf(phaseId) === -1) continue;
    const names = window.PHASE_NAMES || {};
    const base = stop.kind === 'rounds' ? 'Rounds' : (names[stop.type] || stop.type || phaseId);
    return stop.detail ? base + ' (' + stop.detail + ')' : base;
  }
  return phaseId;
}

// --- The rail is clickable: a stop row asks before skipping ahead ---

function railStopRows() {
  return Array.from(mapRailHolder.querySelectorAll('.amap-row:not(.amap-startrow):not(.amap-endrow)'));
}

function wireRailClicks() {
  const rows = railStopRows();
  const stops = railMap.stops;
  for (let i = 0; i < rows.length && i < stops.length; i++) {
    const row = rows[i];
    row.classList.add('amap-clickable');
    row.title = 'Skip ahead to this step';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.addEventListener('click', () => askSkipTo(i));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); askSkipTo(i); }
    });
  }
}

let skipAsk = null; // the one open "Skip ahead?" card

function hideSkipAsk() {
  if (skipAsk) { skipAsk.remove(); skipAsk = null; }
}

// A small card right under the clicked row: what will happen, and the
// choice. Built with textContent (the excerpt is teacher content).
function askSkipTo(index) {
  hideSkipAsk();
  const rows = railStopRows();
  const stop = railMap && railMap.stops[index];
  const row = rows[index];
  if (!stop || !row) return;
  const targets = stop.ids || [];
  const here = currentStopIndex();
  const name = 'step ' + (index + 1) + ', ' + stepNameFor(targets[0]);

  const card = document.createElement('div');
  card.className = 'rail-skip-ask';
  const text = document.createElement('p');
  text.className = 'rail-skip-text';
  card.appendChild(text);
  const btns = document.createElement('div');
  btns.className = 'rail-skip-btns';
  card.appendChild(btns);

  const closeBtn = (label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail-skip-cancel';
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); hideSkipAsk(); });
    return b;
  };

  if (index === here) {
    text.textContent = 'You are on this step now.';
    btns.appendChild(closeBtn('OK'));
  } else if (here !== -2 && index < here) {
    text.textContent = 'That step already happened. Press Reset and try again to see it.';
    btns.appendChild(closeBtn('OK'));
  } else {
    text.textContent = 'Skip ahead to ' + name + '? Pretend students play through the steps in between.';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'rail-skip-go';
    go.textContent = 'Skip ahead';
    go.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSkipAsk();
      startFastForward(targets);
    });
    btns.appendChild(go);
    btns.appendChild(closeBtn('Not now'));
  }
  card.addEventListener('click', (e) => e.stopPropagation());
  row.insertAdjacentElement('afterend', card);
  skipAsk = card;
  const first = btns.querySelector('button');
  if (first) first.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && skipAsk) hideSkipAsk();
});

// --- First-run card: what the simulator is, in three lines. Shown once
// (remembered in localStorage), after the first Launch so Bot Fill and
// Skip timer are on screen when the card names them. The ? button in the
// top bar brings it back any time.
const SIM_INTRO_KEY = 'jamyard-sim-intro-seen';
const simIntro = document.getElementById('sim-intro');
const simIntroOk = document.getElementById('sim-intro-ok');
const simHelpBtn = document.getElementById('sim-help-btn');

function simIntroSeen() {
  try { return localStorage.getItem(SIM_INTRO_KEY) === '1'; } catch (err) { return true; }
}

function showSimIntro() {
  if (!simIntro) return;
  simIntro.hidden = false;
  if (simIntroOk) simIntroOk.focus();
}

function hideSimIntro() {
  if (!simIntro || simIntro.hidden) return;
  simIntro.hidden = true;
  try { localStorage.setItem(SIM_INTRO_KEY, '1'); } catch (err) { /* private mode: it shows again next time */ }
}

function maybeShowSimIntro() {
  if (!simIntroSeen()) showSimIntro();
}

if (simIntroOk) simIntroOk.addEventListener('click', hideSimIntro);
if (simIntro) simIntro.addEventListener('click', (e) => { if (e.target === simIntro) hideSimIntro(); });
if (simHelpBtn) simHelpBtn.addEventListener('click', showSimIntro);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && simIntro && !simIntro.hidden) hideSimIntro();
});

function fireBotFill() {
  const playerIframes = iframeContainer.querySelectorAll('.player-panel iframe');
  for (const iframe of playerIframes) {
    iframe.contentWindow.postMessage({ type: 'bot-fill' }, '*');
  }
}

function fireSkip(noFallback) {
  const hostIframe = iframeContainer.querySelector('.host-panel iframe');
  if (hostIframe) hostIframe.contentWindow.postMessage({ type: 'prototype-skip', noFallback: !!noFallback }, '*');
}

function startFastForward(targets) {
  stopFastForward();
  if (typeof targets === 'string') targets = [targets];
  if (!targets || !targets.length) return;
  ff = { targets, ticks: 0, still: 0, lastPos: null, timer: null, skipTimer: null };
  document.body.classList.add('pt-fastforward');
  setBenchHint('Skipping ahead to ' + stepNameFor(targets[0]) + ' with pretend students...', 'busy');
  fastForwardTick();
  ff.timer = setInterval(fastForwardTick, FF_TICK_MS);
}

function stopFastForward() {
  if (!ff) return;
  clearInterval(ff.timer);
  clearTimeout(ff.skipTimer);
  ff = null;
  document.body.classList.remove('pt-fastforward');
}

// Called on every live phase change: arriving mid-tick must cancel a
// queued Skip before it fires.
function fastForwardCheck() {
  if (!ff) return;
  if (phaseMatches(ff.targets)) fastForwardArrive();
}

function fastForwardArrive() {
  const name = stepNameFor(ff.targets[0]);
  stopFastForward();
  setBenchHint('Here it is: ' + name + '. You play the students from here.', 'done');
}

function fastForwardGiveUp(reason) {
  stopFastForward();
  setBenchHint(reason + ' Use Bot Fill and Skip to walk there.', 'done');
}

function fastForwardTick() {
  if (!ff) return;
  if (phaseMatches(ff.targets)) { fastForwardArrive(); return; }
  if (railPhaseType === 'end') { fastForwardGiveUp('The activity ended before reaching that step.'); return; }
  if (++ff.ticks > FF_MAX_TICKS) { fastForwardGiveUp('Could not reach that step automatically.'); return; }
  const pos = railPhaseId + '|' + railInstance;
  ff.still = pos === ff.lastPos ? ff.still + 1 : 0;
  ff.lastPos = pos;
  // The AI's own step is never pushed; it finishes when it finishes.
  const allowFallback = ff.still >= FF_STILL_TICKS && railPhaseType !== 'ai-process' && railPhaseType !== 'ai-eliminate';
  fireBotFill();
  ff.skipTimer = setTimeout(() => {
    if (!ff) return;
    if (phaseMatches(ff.targets)) { fastForwardArrive(); return; }
    if (railPhaseId + '|' + railInstance !== pos) return; // it moved on its own
    fireSkip(!allowFallback);
  }, FF_SKIP_DELAY_MS);
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

// One radio group, not eight toggle buttons: the filled blocks are a
// picture of the count, so only the SELECTED seat is "checked" (a screen
// reader hearing "1 pressed, 2 pressed, 3 pressed, 4 pressed" for a count
// of four was the accessibility review's complaint). Roving tabindex: the
// selected seat is the one Tab lands on, arrow keys move the selection.
const SEAT_MAX = 8;

function selectSeatCount(n, focusSeat) {
  const next = Math.min(SEAT_MAX, Math.max(1, n));
  playerCount.value = next;
  playerCountDisplay.textContent = String(next);
  renderSeats();
  if (focusSeat) {
    const target = seatBlocks.querySelector('.seat-block[aria-checked="true"]');
    if (target) target.focus();
  }
  playerCount.dispatchEvent(new Event('change'));
}

function renderSeats() {
  if (!seatBlocks) return;
  const count = parseInt(playerCount.value, 10);
  seatBlocks.textContent = '';
  for (let i = 1; i <= SEAT_MAX; i++) {
    const seat = document.createElement('button');
    seat.type = 'button';
    const filled = i <= count;
    const selected = i === count;
    seat.className = 'seat-block ' + (filled ? 'seat-c' + ((i - 1) % 5) : 'seat-empty');
    seat.style.setProperty('--rot', (((i % 2) ? -1 : 1) * (0.8 + (i % 3) * 0.4)).toFixed(1) + 'deg');
    seat.title = i === 1 ? '1 player' : i + ' players';
    seat.setAttribute('role', 'radio');
    seat.setAttribute('aria-label', i === 1 ? '1 pretend student' : i + ' pretend students');
    seat.setAttribute('aria-checked', selected ? 'true' : 'false');
    seat.tabIndex = selected ? 0 : -1;
    seat.addEventListener('click', () => selectSeatCount(i, false));
    seat.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i + 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i - 1;
      else if (e.key === 'Home') next = 1;
      else if (e.key === 'End') next = SEAT_MAX;
      if (next === null) return;
      e.preventDefault();
      selectSeatCount(next, true);
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
    updateEditLink();

    // Auto-select game from URL param (e.g. from editor's Test Game button)
    const params = new URLSearchParams(window.location.search);
    const autoGame = params.get('game');
    if (autoGame) {
      const match = Array.from(gameSelect.options).find(o => o.value === autoGame);
      if (match) {
        gameSelect.value = autoGame;
        updateEditLink();
        // ?goto=<phaseId> deep link: play forward to that step once the
        // room is up (only for this first, automatic launch).
        const gotoStep = params.get('goto');
        if (gotoStep) pendingGoto = gotoStep;
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

// Spot something to change mid-preview? The designer is one click away,
// whatever door you came in through.
const editLink = document.getElementById('edit-link');
function updateEditLink() {
  if (!editLink) return;
  const id = gameSelect.value;
  editLink.hidden = !id;
  if (id) editLink.href = '/designer/edit?game=' + encodeURIComponent(id);
}
gameSelect.addEventListener('change', updateEditLink);

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
  hostIframe.title = 'Teacher screen';
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
      // First visit: the three-line card, now that the pieces it names
      // (teacher screen, Bot Fill, Skip timer) are on screen.
      maybeShowSimIntro();
      // Apply the current view to the fresh panels (carousel by default;
      // without this the new grid always starts as a grid).
      setViewMode(viewMode);
      // The map rail: draw the plan, then follow the live room.
      showMapRail(gameId);
      connectRail(e.data.code, e.data.teacherPin);
      if (pendingGoto) {
        startFastForward(pendingGoto);
        pendingGoto = null;
      }
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
  iframe.title = 'Player ' + i + ' screen';
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
  const fire = fireBotFill;
  // Steps where one shot cannot finish the job: relay (turns rotate, only
  // the active player can submit) and merge (one pen per pair: the writer
  // agrees first and the partner only after the draft settles, so a single
  // shot left every pair at "1 of 2 agreed"; reviewer 2026-09-06).
  const isHostInLoopStep = () => {
    const hostIframe = iframeContainer.querySelector('.host-panel iframe');
    if (!hostIframe) return false;
    try {
      const doc = hostIframe.contentDocument;
      return ['relay-section', 'merge-section'].some((id) => {
        const sec = doc && doc.getElementById(id);
        return !!(sec && !sec.hidden && sec.classList.contains('active'));
      });
    } catch (_) {
      return false; // cross-origin fallback — single shot is the safe default
    }
  };

  fire();
  if (!isHostInLoopStep()) return;

  // Keep firing while the host stays in that step. Hard cap of ~15s keeps
  // it from running forever if something goes wrong.
  let shots = 25;
  const id = setInterval(() => {
    if (--shots <= 0 || !isHostInLoopStep()) {
      clearInterval(id);
      return;
    }
    fire();
  }, 600);
});

// Skip — tell host iframe to advance the current phase / close submissions / continue
skipBtn.addEventListener('click', () => {
  // A hand on the controls ends the fast-forward; the teacher is driving.
  if (ff) { stopFastForward(); setBenchHint(benchHintDefault); }
  fireSkip(false);
});

// Reset — tear down the pieces and put the empty bench back on the stage
resetBtn.addEventListener('click', () => {
  stopFastForward();
  setBenchHint(benchHintDefault);
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
