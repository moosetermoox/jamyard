/**
 * prototype.js — Try it out (/prototype), the playtest bench.
 *
 * Launches an activity with the host screen (plus the teacher console behind
 * a tab) on the left and ONE pretend-student screen on the right, so a
 * teacher can play through an activity solo before class. The header
 * carries the plan as a row of blocks (click a step to skip ahead) and a
 * yellow NEXT card points at the one control to press now (Totem 14a/15a,
 * 2026-09-09). Adds sample answers, skip, reset, more students, and a relay
 * auto-advance loop that reads the host iframe. Dev/preview tooling — not
 * part of a real class run.
 */
const gameSelect = document.getElementById('game-select');
const activityChip = document.getElementById('activity-chip');
const playerCount = document.getElementById('player-count');
const launchBtn = document.getElementById('launch-btn');
const hostBtn = document.getElementById('host-btn');
const resetBtn = document.getElementById('reset-btn');
const soundBtn = document.getElementById('sound-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const botFillBtn = document.getElementById('bot-fill-btn');
const skipBtn = document.getElementById('skip-btn');
const benchBar = document.getElementById('bench-bar');
const iframeContainer = document.getElementById('iframe-container');
const hostMat = document.getElementById('host-mat');
const hostTabs = document.getElementById('host-tabs');
const studentMat = document.getElementById('student-mat');
const studentBarTitle = document.getElementById('student-bar-title');
const playerHolder = document.getElementById('player-holder');
const pager = document.getElementById('pager');
const carouselPrev = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');
const carouselCount = document.getElementById('carousel-count');
const addStudentBtn = document.getElementById('add-student-btn');
const nextBanner = document.getElementById('next-banner');
const nextText = document.getElementById('next-text');

const MAX_PLAYERS = 8;
let carouselIndex = 0; // 0-based index into player panels

// Live-session state for the add-a-student slot (late join is a supported
// path, so a new pretend student can join the running room directly).
let currentCode = null;
let livePlayers = 0;
// The activity's hand-authored sample answers (config.sampleAnswers),
// fetched at launch and dealt to each seat by Add sample answers.
let currentSamples = null;

// --- The plan row: the activity's steps as blocks in the header, with a
// "you are here" mark that follows the live room. The map comes from the
// same endpoint the library popups use; the live position comes from
// pairing a silent teacher-console socket (the host iframe hands over the
// room PIN on launch, same-origin postMessage).
const mapRail = document.getElementById('map-rail');
const mapRailHolder = document.getElementById('map-rail-holder');
let railMap = null;
let railSocket = null;
let railPhaseId = null;
let railPhaseType = null;
let railInstance = 0; // phaseInstanceId: tells a repeat of the same step apart
let lastStop = -1;    // last map position the row could place (a round's inner step keeps it)
let planExpanded = false;

function showMapRail(gameId) {
  railMap = null;
  railPhaseId = null;
  railPhaseType = null;
  lastStop = -1;
  planExpanded = false;
  if (!mapRail || !window.BenchLogic) return;
  mapRailHolder.textContent = '';
  fetch('/api/games/' + encodeURIComponent(gameId) + '/map')
    .then(r => (r.ok ? r.json() : null))
    .then(map => {
      if (!map || !Array.isArray(map.stops) || map.stops.length === 0) return;
      railMap = map;
      mapRail.hidden = false;
      renderPlan();
    })
    .catch(() => { /* the plan row is garnish, never block the bench */ });
}

function hideMapRail() {
  hideSkipAsk();
  if (railSocket) { railSocket.disconnect(); railSocket = null; }
  railMap = null;
  railPhaseId = null;
  railPhaseType = null;
  lastStop = -1;
  if (mapRail) {
    mapRail.hidden = true;
    mapRail.classList.remove('expanded');
    mapRailHolder.textContent = '';
  }
}

function connectRail(code, pin) {
  if (railSocket) { railSocket.disconnect(); railSocket = null; }
  if (!window.io || !pin) return;
  // websocket first (2026-09-20, measured on the live site): the default polling-then-upgrade left the first emits (create-room, join) riding HTTP for 80 to 210 ms; on a socket they take about 30. Polling stays as the fallback for a network that blocks websockets.
  railSocket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
  railSocket.on('connect', () => railSocket.emit('join-teacher', { code, pin }));
  railSocket.on('teacher-joined', snap => {
    railPhaseId = snap.phaseId;
    railPhaseType = snap.phaseType;
    railInstance = snap.phaseInstanceId || 0;
    // Joining mid-step: seed the "N of M in" count from the snapshot.
    liveCounts = { count: (snap.submissions || []).length, total: snap.playerCount || 0, pos: livePos() };
    onPhaseMoved();
  });
  railSocket.on('teacher-phase', p => {
    railPhaseId = p.phaseId;
    railPhaseType = p.phaseType;
    railInstance = p.phaseInstanceId || 0;
    liveCounts = null;
    onPhaseMoved();
  });
  // The teacher channel gets every submit as a count: the banner moves
  // from the student screen to the teacher screen once everyone is in.
  railSocket.on('response-received', d => {
    if (d && typeof d.count === 'number') {
      liveCounts = { count: d.count, total: d.total, pos: livePos() };
      updateBanner();
    }
  });
}

function livePos() {
  return railPhaseId + '|' + railInstance;
}

function onPhaseMoved() {
  renderPlan();
  fastForwardCheck();
  updateBench();
  // The teacher moved on without pressing the pointed-at control: the
  // "three in a row" streak starts over.
  if (!pressedPointedSincePhase) nextStreak = 0;
  pressedPointedSincePhase = false;
  updateBanner();
}

// --- Skip ahead: click a step on the plan row (or arrive with
// ?goto=<phaseId>) and the room is played forward with the two moves a
// teacher makes by hand (Add sample answers, then Skip) until the live
// "you are here" reaches that step, then the teacher takes over. Skip only
// fires when the step did NOT move on its own after the fill (all answers
// in auto-advances many steps; skipping on top would jump PAST the
// target), and it never uses the host's generic-advance fallback unless
// the room has sat still for a while on a step that is not the AI's.
let pendingGoto = null;
let ff = null; // { targets, ticks, still, timer, skipTimer }
const FF_TICK_MS = 1800;
const FF_MAX_TICKS = 90;    // ~2.7 minutes, then hand back
// Submits are async server-side (moderation ladder); give every bot answer
// time to land before the close button is pressed on top of it.
const FF_SKIP_DELAY_MS = 1400;
const FF_STILL_TICKS = 6;   // ~11s without movement: allow the generic advance

// The NEXT card carries the skip-ahead news while it runs (busy) and the
// hand-over for a few seconds after (done), then goes back to pointing.
let statusText = '';
let statusUntil = 0;
const STATUS_DONE_MS = 5000;

function setStatus(text, state) {
  statusText = text || '';
  statusUntil = state === 'done' ? Date.now() + STATUS_DONE_MS : 0;
  nextBanner.classList.toggle('is-busy', state === 'busy');
  updateBanner();
}

function currentStatus() {
  if (!statusText) return '';
  if (statusUntil && Date.now() > statusUntil) { statusText = ''; return ''; }
  return statusText;
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

function nameOf(type) {
  return (window.PHASE_NAMES && window.PHASE_NAMES[type]) || type;
}

// "Rounds" or the step's plain name, plus its excerpt when the map has one.
function stepNameFor(phaseId) {
  const stops = (railMap && Array.isArray(railMap.stops)) ? railMap.stops : [];
  for (const stop of stops) {
    if ((stop.ids || []).indexOf(phaseId) === -1) continue;
    const base = stop.kind === 'rounds' ? 'Rounds' : nameOf(stop.type);
    return stop.detail ? base + ' (' + stop.detail + ')' : base;
  }
  return phaseId;
}

// --- The row itself: Join, one block per stop, Wrap up. Done blocks fade
// with a check, the live one is yellow with NOW; a long plan folds the
// stops between the first, the live one, and the last into a "…" block,
// folding harder when the header has less room. The "…" opens the full
// list on a paper card under the row.
function makeBlock(block, i) {
  const clickable = block.kind === 'stop' || block.kind === 'fold';
  const el = document.createElement(clickable ? 'button' : 'span');
  if (clickable) el.type = 'button';
  el.className = 'plan-block ' + (i % 2 ? 'cut-b' : 'cut-a');
  if (block.kind === 'end') el.classList.add('tone-oak');
  else if (block.kind === 'stop' && block.index % 2) el.classList.add('tone-pine');
  if (block.state === 'now') el.classList.add('is-now');
  if (block.state === 'done') el.classList.add('is-done');
  el.style.setProperty('--rot', (((i % 2) ? 1 : -1) * (0.8 + (i % 3) * 0.2)).toFixed(1) + 'deg');
  el.setAttribute('role', 'listitem');
  if (block.kind === 'stop') {
    el.dataset.index = String(block.index);
    const num = document.createElement('span');
    num.className = 'plan-num';
    num.textContent = String(block.number);
    el.appendChild(num);
  }
  let text = block.label;
  if (block.state === 'now') text += ' · NOW';
  else if (block.state === 'done') text += ' ✓';
  el.appendChild(document.createTextNode(text));
  if (block.kind === 'fold') {
    el.classList.add('plan-fold', 'clickable');
    el.title = 'Show all ' + block.count + ' folded steps';
    el.setAttribute('aria-label', el.title);
    el.addEventListener('click', () => { planExpanded = true; renderPlan(); });
  } else if (block.kind === 'stop') {
    el.classList.add('clickable');
    el.title = 'Skip ahead to this step';
    el.addEventListener('click', () => {
      // From the full list: close it and ask under the row's own block
      if (planExpanded) {
        planExpanded = false;
        renderPlan();
      }
      const inRow = mapRailHolder.querySelector('.plan-block[data-index="' + block.index + '"]') ||
        mapRailHolder.querySelector('.plan-fold') || el;
      askSkipTo(block.index, inRow);
    });
  }
  return el;
}

function paintRow(blocks) {
  mapRailHolder.textContent = '';
  blocks.forEach((block, i) => mapRailHolder.appendChild(makeBlock(block, i)));
}

function removePlanPopover() {
  const old = mapRail.querySelector('.plan-popover');
  if (old) old.remove();
}

function renderPlan() {
  if (!railMap || !mapRail || mapRail.hidden) return;
  const here = currentStopIndex();
  // No match (a round's inner step, a side branch): keep the last mark
  // rather than leaving the row unmarked.
  if (here !== -2) lastStop = here;
  const stops = railMap.stops;
  // Seven blocks when they fit, five (Join, first, now, last, Wrap up) when not
  for (const cap of [7, 5]) {
    paintRow(BenchLogic.planBlocks(stops, lastStop, { nameOf, cap }));
    if (mapRailHolder.scrollWidth <= mapRailHolder.clientWidth + 1) break;
  }
  removePlanPopover();
  if (!planExpanded) return;
  const pop = document.createElement('div');
  pop.className = 'plan-popover';
  pop.setAttribute('role', 'list');
  BenchLogic.planBlocks(stops, lastStop, { nameOf, expanded: true }).forEach((block, i) => pop.appendChild(makeBlock(block, i)));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'plan-block plan-fold plan-close clickable cut-a';
  close.textContent = 'Fold';
  close.title = 'Back to the short row';
  close.addEventListener('click', () => { planExpanded = false; renderPlan(); });
  pop.appendChild(close);
  mapRail.appendChild(pop);
}

// The full list closes on Escape or a click anywhere else
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && planExpanded) { planExpanded = false; renderPlan(); }
});
document.addEventListener('click', (e) => {
  // The fold block that opened the list is re-rendered away by the time
  // this runs: a click whose target left the page never counts as outside.
  if (!(e.target instanceof Element) || !e.target.isConnected) return;
  if (planExpanded && mapRail && !mapRail.contains(e.target)) { planExpanded = false; renderPlan(); }
});
window.addEventListener('resize', () => { if (!planExpanded) renderPlan(); });

let skipAsk = null; // the one open "Skip ahead?" card

function hideSkipAsk() {
  if (skipAsk) { skipAsk.remove(); skipAsk = null; }
}

// A small card right under the clicked block: what will happen, and the
// choice. Built with textContent (the excerpt is teacher content).
function askSkipTo(index, blockEl) {
  hideSkipAsk();
  const stop = railMap && railMap.stops[index];
  if (!stop) return;
  const targets = stop.ids || [];
  const here = lastStop;
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
  } else if (here >= 0 && index < here) {
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
  // Under the clicked block, kept inside the window
  const railRect = mapRail.getBoundingClientRect();
  const blockRect = blockEl.getBoundingClientRect();
  const maxLeft = window.innerWidth - railRect.left - 280;
  card.style.setProperty('--ask-left', Math.max(0, Math.min(blockRect.left - railRect.left, maxLeft)) + 'px');
  mapRail.appendChild(card);
  skipAsk = card;
  const first = btns.querySelector('button');
  if (first) first.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && skipAsk) hideSkipAsk();
});

// --- The help card: the bench in four lines. The ? in the toolbar opens
// it and brings the NEXT card back if it was dismissed.
const simIntro = document.getElementById('sim-intro');
const simIntroOk = document.getElementById('sim-intro-ok');
const simHelpBtn = document.getElementById('sim-help-btn');

function showSimIntro() {
  if (!simIntro) return;
  simIntro.hidden = false;
  if (simIntroOk) simIntroOk.focus();
}

function hideSimIntro() {
  if (!simIntro || simIntro.hidden) return;
  simIntro.hidden = true;
}

if (simIntroOk) simIntroOk.addEventListener('click', hideSimIntro);
if (simIntro) simIntro.addEventListener('click', (e) => { if (e.target === simIntro) hideSimIntro(); });
if (simHelpBtn) simHelpBtn.addEventListener('click', () => { restoreBanner(); showSimIntro(); });

// --- The first-visit tour: names every piece once the room is up (the
// first launch in this browser), and again from the help card's button.
const simTourBtn = document.getElementById('sim-tour-btn');
let tourTimer = null;

function startTour() {
  if (!window.BenchTour || !window.BenchLogic) return;
  hideSimIntro();
  hideSkipAsk();
  BenchTour.start(BenchLogic.TOUR_STOPS, () => updateBanner());
}

// A beat after the pieces land, so the plan row (fetched) is on screen too
function maybeStartTour() {
  if (!window.BenchTour || BenchTour.seen()) return;
  clearTimeout(tourTimer);
  tourTimer = setTimeout(() => { if (currentCode && !BenchTour.running()) startTour(); }, 1400);
}

if (simTourBtn) simTourBtn.addEventListener('click', startTour);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && simIntro && !simIntro.hidden) hideSimIntro();
});

function hostFrame() {
  return hostMat.querySelector('iframe.host-frame');
}

function fireBotFill() {
  const playerIframes = playerHolder.querySelectorAll('.player-panel iframe');
  let seat = 0;
  for (const iframe of playerIframes) {
    // Seat order deals sample line i to student i (see bot-brain.js)
    iframe.contentWindow.postMessage({ type: 'bot-fill', samples: currentSamples, seat: seat++ }, '*');
  }
}

function fireSkip(noFallback) {
  const host = hostFrame();
  if (host) host.contentWindow.postMessage({ type: 'prototype-skip', noFallback: !!noFallback }, '*');
}

function startFastForward(targets) {
  stopFastForward();
  if (typeof targets === 'string') targets = [targets];
  if (!targets || !targets.length) return;
  ff = { targets, ticks: 0, still: 0, lastPos: null, timer: null, skipTimer: null };
  document.body.classList.add('pt-fastforward');
  setStatus('Skipping ahead to ' + stepNameFor(targets[0]) + ' with pretend students...', 'busy');
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
  setStatus('Here it is: ' + name + '. You play the students from here.', 'done');
}

function fastForwardGiveUp(reason) {
  stopFastForward();
  setStatus(reason + ' Use Add sample answers and Skip timer to walk there.', 'done');
}

function fastForwardTick() {
  if (!ff) return;
  if (phaseMatches(ff.targets)) { fastForwardArrive(); return; }
  if (railPhaseType === 'end') { fastForwardGiveUp('The activity ended before reaching that step.'); return; }
  if (++ff.ticks > FF_MAX_TICKS) { fastForwardGiveUp('Could not reach that step automatically.'); return; }
  const pos = livePos();
  ff.still = pos === ff.lastPos ? ff.still + 1 : 0;
  ff.lastPos = pos;
  // The AI's own step is never pushed; it finishes when it finishes.
  const allowFallback = ff.still >= FF_STILL_TICKS && railPhaseType !== 'ai-process' && railPhaseType !== 'ai-eliminate';
  fireBotFill();
  ff.skipTimer = setTimeout(() => {
    if (!ff) return;
    if (phaseMatches(ff.targets)) { fastForwardArrive(); return; }
    if (livePos() !== pos) return; // it moved on its own
    fireSkip(!allowFallback);
  }, FF_SKIP_DELAY_MS);
}

// --- The shortcuts strip: only while a step students answer is open.
function updateBench() {
  const open = !!currentCode && BenchLogic.isStudentStep(railPhaseType);
  benchBar.hidden = !open;
}

// --- The NEXT card: one sentence, over the control to press now. Hides
// for the session after the pointed-at control is pressed three times in
// a row (a teacher who knows the page); the ? brings it back.
const NEXT_OFF_KEY = 'jamyard-next-banner-off';
let bannerOff = false;
try { bannerOff = localStorage.getItem(NEXT_OFF_KEY) === '1'; } catch (err) { /* private mode: always on */ }
let nextStreak = 0;
let pressedPointedSincePhase = false;
let pointedEl = null;       // the element the card points at (page or iframe)
let liveCounts = null;      // { count, total, pos } from the teacher channel
let samplesPressedAt = null; // { pos, time } the last Add sample answers press
const SAMPLES_SETTLE_MS = 2500;
let bannerTimer = null;

function restoreBanner() {
  bannerOff = false;
  nextStreak = 0;
  try { localStorage.removeItem(NEXT_OFF_KEY); } catch (err) { /* ignore */ }
  updateBanner();
}

function dismissBanner() {
  bannerOff = true;
  try { localStorage.setItem(NEXT_OFF_KEY, '1'); } catch (err) { /* shows again next visit */ }
  updateBanner();
}

const nextClose = document.getElementById('next-close');
if (nextClose) nextClose.addEventListener('click', (e) => { e.stopPropagation(); dismissBanner(); });

function onPointedClick() {
  pressedPointedSincePhase = true;
  nextStreak += 1;
  if (nextStreak >= 3) dismissBanner();
}

function bindPointed(el) {
  if (el === pointedEl) return;
  if (pointedEl) pointedEl.removeEventListener('click', onPointedClick);
  pointedEl = el;
  if (!pointedEl) return;
  pointedEl.addEventListener('click', onPointedClick);
  // A control below the fold of its own screen (the host lobby's START
  // sits under the join instructions) is scrolled into view once, so the
  // card has something to point at.
  try { pointedEl.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* ignore */ }
}

// Any other button on the page breaks the streak
document.addEventListener('click', (e) => {
  if (!pointedEl || !(e.target instanceof Element)) return;
  if (pointedEl.contains(e.target)) return;
  if (e.target.closest('button, a')) nextStreak = 0;
}, true);

// The host's own document, when the class screen is showing (same origin)
function hostDoc() {
  const host = hostFrame();
  if (!host || host.hidden) return null;
  try { return host.contentDocument; } catch (err) { return null; }
}

function visible(el) {
  return !!(el && !el.hidden && !el.disabled && el.offsetParent !== null);
}

// The visible advance/close button on the host, in the order the host's
// own skip tries them (the list is guarded against host.js by a test).
function findHostButton() {
  const doc = hostDoc();
  if (!doc) return null;
  for (const id of BenchLogic.HOST_ADVANCE_BUTTONS) {
    const btn = doc.getElementById(id);
    if (visible(btn)) return { el: btn, label: (btn.textContent || '').trim() };
  }
  return null;
}

function bannerState() {
  const state = { launched: !!currentCode, phaseType: railPhaseType, busy: currentStatus() };
  const doc = hostDoc();
  if (doc && (!railPhaseType || railPhaseType === 'lobby')) {
    const start = doc.getElementById('start-game-btn');
    const hint = doc.getElementById('start-hint');
    if (start) state.startEnabled = !start.disabled;
    if (hint && !hint.hidden) state.startHint = (hint.textContent || '').trim();
  }
  const found = findHostButton();
  state.hostButtonLabel = found ? found.label : null;
  if (liveCounts && liveCounts.pos === livePos() && liveCounts.total > 0) {
    state.allIn = liveCounts.count >= liveCounts.total;
  }
  if (samplesPressedAt && samplesPressedAt.pos === livePos() && Date.now() - samplesPressedAt.time > SAMPLES_SETTLE_MS) {
    state.samplesPressed = true;
  }
  return state;
}

// The element a slot points at: on the page, or inside the host iframe
function resolveTarget(at) {
  switch (at) {
    case 'launch': return { el: launchBtn };
    case 'reset': return { el: resetBtn };
    case 'add-student': return { el: addStudentBtn };
    case 'samples': return benchBar.hidden ? null : { el: botFillBtn };
    case 'skip': return benchBar.hidden ? null : { el: skipBtn };
    case 'teacher-controls': {
      const tab = document.getElementById('teacher-tab-btn');
      return visible(tab) && !tab.classList.contains('active') ? { el: tab } : null;
    }
    case 'start': {
      const doc = hostDoc();
      const start = doc && doc.getElementById('start-game-btn');
      return visible(start) ? { el: start, frame: hostFrame() } : null;
    }
    case 'close':
    case 'continue': {
      const found = findHostButton();
      return found ? { el: found.el, frame: hostFrame() } : null;
    }
    default: return null;
  }
}

function targetRect(target) {
  const r = target.el.getBoundingClientRect();
  if (!target.frame) return r;
  const f = target.frame.getBoundingClientRect();
  return { left: f.left + r.left, right: f.left + r.right, top: f.top + r.top, bottom: f.top + r.bottom, width: r.width, height: r.height };
}

function updateBanner() {
  if (!window.BenchLogic) return;
  if (bannerOff) { nextBanner.hidden = true; bindPointed(null); return; }
  const step = BenchLogic.nextStep(bannerState());
  const target = step.at ? resolveTarget(step.at) : null;
  nextText.textContent = step.text;
  nextBanner.hidden = false;
  nextBanner.classList.toggle('no-notch', !target);
  bindPointed(target ? target.el : null);

  const box = iframeContainer.getBoundingClientRect();
  const w = nextBanner.offsetWidth;
  const h = nextBanner.offsetHeight;
  let left;
  let top;
  let flip = false;
  if (target) {
    const r = targetRect(target);
    const cx = r.left + r.width / 2;
    // The card hangs away from the middle of the bench: leftward over a
    // right-hand control, rightward over a left-hand one.
    const rightHalf = cx > box.left + box.width / 2;
    left = rightHalf ? cx - w + Math.min(60, w / 2) : cx - Math.min(60, w / 2);
    left = Math.max(box.left + 8, Math.min(left, box.right - w - 8));
    top = r.top - h - 6;
    if (top < box.top - 40 || target.el === launchBtn || target.el === resetBtn) {
      flip = true;
      top = r.bottom + 6;
    }
    top = Math.min(top, box.bottom - h - 4);
    const notchLeft = Math.max(12, Math.min(cx - left - 13, w - 40));
    nextBanner.style.setProperty('--notch-left', notchLeft + 'px');
    nextBanner.classList.toggle('tilt-right', rightHalf);
  } else {
    // Nothing to point at: the card rests over the teacher screen's top right
    const hostBox = document.getElementById('host-column').getBoundingClientRect();
    left = hostBox.right - w - 24;
    top = hostBox.top + 56;
    nextBanner.classList.remove('tilt-right');
  }
  nextBanner.classList.toggle('flip', flip);
  nextBanner.style.left = (left - box.left) + 'px';
  nextBanner.style.top = (top - box.top) + 'px';
}

// The host's screen changes with no word to this page (a button appears,
// a hint hides): a slow poll keeps the card honest while a room is open.
function startBannerPoll() {
  stopBannerPoll();
  bannerTimer = setInterval(updateBanner, 700);
}

function stopBannerPoll() {
  if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; }
}

window.addEventListener('resize', updateBanner);

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

// Fetch available games: what this visitor can see, plus a ?game= deep
// link's id so a hidden or freshly copied activity still opens (2026-09-20)
const wantIds = (window.MyGames ? MyGames.list() : []).slice();
const deepLinkedId = new URLSearchParams(window.location.search).get('game');
if (deepLinkedId) wantIds.push(deepLinkedId);
fetch((window.OwnerMode && OwnerMode.isOn()) ? '/api/games' : '/api/games?mine=' + encodeURIComponent(wantIds.join(',')))
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
    updateBanner();

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
  // Host this: the projector here, the teacher console in a new tab
  // (shared/host-launch.js)
  if (window.HostLaunch) HostLaunch.launch(gameId);
  else window.location.href = '/host?game=' + encodeURIComponent(gameId);
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

function selectedName() {
  const opt = gameSelect.options[gameSelect.selectedIndex];
  return opt ? opt.textContent : '';
}

// Launch prototype
launchBtn.addEventListener('click', () => {
  const gameId = gameSelect.value;
  if (!gameId) return;

  const count = Math.min(MAX_PLAYERS, Math.max(1, parseInt(playerCount.value, 10) || 1));

  // Disable Launch while a session runs. The activity select stays live
  // behind the chip: Reset brings it back, changing it relaunches.
  launchBtn.disabled = true;
  // Bench running: Launch steps aside, Host this joins the toolbar, the
  // select gives way to the activity's name chip.
  document.body.classList.add('pt-running');
  activityChip.textContent = selectedName();
  activityChip.hidden = false;

  // The template's sample answers ride along with Add sample answers.
  // Fetched fresh per launch (the activity select may have changed);
  // a miss just means the keyword bot answers, as before.
  currentSamples = null;
  fetch('/api/games/' + encodeURIComponent(gameId))
    .then((r) => (r.ok ? r.json() : null))
    .then((config) => {
      if (config && config.sampleAnswers && typeof config.sampleAnswers === 'object') {
        currentSamples = config.sampleAnswers;
      }
    })
    .catch(() => { /* keyword bot fallback */ });

  // The teacher mat: the host iframe first (Skip finds it by class)
  clearMats();
  hostMat.classList.remove('empty');
  const hostIframe = document.createElement('iframe');
  hostIframe.className = 'host-frame';
  hostIframe.title = 'Teacher screen';
  hostIframe.src = '/host?game=' + encodeURIComponent(gameId) + '&prototype=true';
  forwardArrowKeys(hostIframe);
  hostMat.appendChild(hostIframe);

  // Listen for room code from host iframe
  window.addEventListener('message', function onMessage(e) {
    if (e.data && e.data.type === 'room-created') {
      window.removeEventListener('message', onMessage);
      currentCode = e.data.code;
      // Teacher controls: the real /teacher console in the same mat,
      // behind a tab (outside review #2: rehearsal should include the
      // private console, not a "copy a link" detour). The console auto-
      // joins from the hash; the host iframe stays first so Skip finds it.
      if (e.data.teacherPin) addTeacherTab(hostIframe, e.data.code, e.data.teacherPin);
      studentMat.classList.remove('empty');
      createPlayerIframes(e.data.code, count);
      pager.hidden = false;
      addStudentBtn.hidden = false;
      resetBtn.disabled = false;
      labelSound(readMuted());
      // The plan row: draw the steps, then follow the live room.
      showMapRail(gameId);
      connectRail(e.data.code, e.data.teacherPin);
      updateBench();
      startBannerPoll();
      updateBanner();
      maybeStartTour();
      if (pendingGoto) {
        startFastForward(pendingGoto);
        pendingGoto = null;
      }
    }
  });
  updateBanner();
});

// Two tabs on the teacher screen's bar: Class screen (the projector) and
// Teacher controls (the private console, joined with the room's PIN).
// Only the chosen one shows.
function addTeacherTab(hostIframe, code, pin) {
  const teacherIframe = document.createElement('iframe');
  teacherIframe.className = 'teacher-frame';
  teacherIframe.title = 'Teacher controls';
  teacherIframe.src = '/teacher#code=' + encodeURIComponent(code) + '&pin=' + encodeURIComponent(pin);
  teacherIframe.hidden = true;
  forwardArrowKeys(teacherIframe);
  hostMat.appendChild(teacherIframe);

  hostTabs.textContent = '';
  const make = (label, title, active, id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'panel-tab' + (active ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', active ? 'true' : 'false');
    b.textContent = label;
    b.title = title;
    return b;
  };
  const classTab = make('Class screen', 'The projected screen the class sees', true, 'class-tab-btn');
  const teacherTab = make('Teacher controls', 'Your private console: live entries, hide, approve, pacing. In class it opens on your own laptop or phone, never the projector.', false, 'teacher-tab-btn');
  const hostBar = document.querySelector('.host-bar');
  const hostBarTitle = document.getElementById('host-bar-title');
  const setBarTitle = (teacher) => {
    hostBarTitle.textContent = '';
    hostBarTitle.appendChild(document.createTextNode(teacher ? 'Teacher controls ' : 'Teacher screen '));
    const sub = document.createElement('span');
    sub.className = 'screen-bar-sub';
    sub.textContent = teacher ? '· on your own device' : '· what the class sees';
    hostBarTitle.appendChild(sub);
  };
  const select = (which) => {
    const teacher = which === 'teacher';
    hostIframe.hidden = teacher;
    teacherIframe.hidden = !teacher;
    classTab.classList.toggle('active', !teacher);
    teacherTab.classList.toggle('active', teacher);
    classTab.setAttribute('aria-selected', teacher ? 'false' : 'true');
    teacherTab.setAttribute('aria-selected', teacher ? 'true' : 'false');
    hostMat.classList.toggle('showing-teacher', teacher);
    if (hostBar) hostBar.classList.toggle('showing-teacher', teacher);
    setBarTitle(teacher);
    updateBanner();
  };
  classTab.addEventListener('click', () => select('class'));
  teacherTab.addEventListener('click', () => select('teacher'));
  hostTabs.appendChild(classTab);
  hostTabs.appendChild(teacherTab);
  hostTabs.hidden = false;
}

function addPlayerPanel(code, i) {
  const wrapper = document.createElement('div');
  wrapper.className = 'player-panel';
  wrapper.hidden = true;
  const iframe = document.createElement('iframe');
  iframe.title = 'Player ' + i + ' screen';
  iframe.src = '/player?prototype=true&code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent('Player ' + i);
  // Same-origin embed; lets the mic button work during teacher previews.
  iframe.allow = 'microphone';
  forwardArrowKeys(iframe);
  wrapper.appendChild(iframe);
  playerHolder.appendChild(wrapper);
}

function createPlayerIframes(code, count) {
  for (let i = 1; i <= count; i++) addPlayerPanel(code, i);
  livePlayers = count;
  carouselIndex = 0;
  showCarouselPlayer(0);
  refreshAddSlot();
}

// + Add another student: one click drops one more pretend student into
// the live room (no relaunch; they late-join into the current step, same
// as a real Chromebook would). The pager jumps to the newcomer.
function refreshAddSlot() {
  addStudentBtn.disabled = !currentCode || livePlayers >= MAX_PLAYERS;
  addStudentBtn.title = livePlayers >= MAX_PLAYERS
    ? 'Eight pretend students is the most this bench holds'
    : 'Add one more pretend student to the running room';
}

addStudentBtn.addEventListener('click', () => {
  if (!currentCode || livePlayers >= MAX_PLAYERS) return;
  livePlayers += 1;
  addPlayerPanel(currentCode, livePlayers);
  // Keep the value holder honest without firing a relaunch (setting
  // .value programmatically never emits a change event).
  playerCount.value = livePlayers;
  showCarouselPlayer(livePlayers - 1);
  refreshAddSlot();
  updateBanner();
});

// Add sample answers — send auto-fill to all player iframes. Single shot is
// enough for most phases; relay needs follow-up shots because turns rotate
// and only the active player can submit. We loop only while the host is in
// the relay section, so bot-fill never bleeds into the next phase (which
// would auto-skip e.g. the vote phase before the user can see it).
botFillBtn.addEventListener('click', () => {
  samplesPressedAt = { pos: livePos(), time: Date.now() };
  const fire = fireBotFill;
  // Steps where one shot cannot finish the job: relay (turns rotate, only
  // the active player can submit) and merge (one pen per pair: the writer
  // agrees first and the partner only after the draft settles, so a single
  // shot left every pair at "1 of 2 agreed"; reviewer 2026-09-06).
  const isHostInLoopStep = () => {
    const host = hostFrame();
    if (!host) return false;
    try {
      const doc = host.contentDocument;
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
  if (ff) { stopFastForward(); setStatus(''); }
  fireSkip(false);
});

// Empty both mats: every iframe goes, the dashed outlines come back
function clearMats() {
  hostMat.querySelectorAll('iframe').forEach(f => f.remove());
  hostMat.classList.remove('showing-teacher');
  const bar = document.querySelector('.host-bar');
  if (bar) bar.classList.remove('showing-teacher');
  const title = document.getElementById('host-bar-title');
  if (title) {
    title.textContent = 'Teacher screen ';
    const sub = document.createElement('span');
    sub.className = 'screen-bar-sub';
    sub.textContent = '· what the class sees';
    title.appendChild(sub);
  }
  hostTabs.textContent = '';
  hostTabs.hidden = true;
  playerHolder.textContent = '';
}

// Reset — tear down the pieces and put the empty bench back
resetBtn.addEventListener('click', () => {
  clearTimeout(tourTimer);
  if (window.BenchTour) BenchTour.stop();
  stopFastForward();
  setStatus('');
  stopBannerPoll();
  clearMats();
  hostMat.classList.add('empty');
  studentMat.classList.add('empty');
  hideMapRail();
  currentCode = null;
  livePlayers = 0;
  liveCounts = null;
  samplesPressedAt = null;
  carouselIndex = 0;
  document.body.classList.remove('pt-running');
  activityChip.hidden = true;
  launchBtn.disabled = false;
  resetBtn.disabled = true;
  gameSelect.disabled = false;
  playerCount.disabled = false;
  benchBar.hidden = true;
  pager.hidden = true;
  addStudentBtn.hidden = true;
  studentBarTitle.textContent = 'Student screen';
  updateBanner();
});

// A programmatic change to the value holder mid-preview relaunches with
// the new count (the old players slider's contract, kept for deep links).
playerCount.addEventListener('change', () => {
  if (!launchBtn.disabled) return; // not launched yet — Launch will use it
  playerCount.disabled = false;
  resetBtn.click();
  launchBtn.click();
});

// Picking a different activity mid-preview relaunches with it (the select
// is behind the chip while running, but a deep link or script can still
// change it).
gameSelect.addEventListener('change', () => {
  if (!launchBtn.disabled) return; // not launched yet — Launch will use it
  resetBtn.click();
  launchBtn.click();
});

// Play Again on the projector inside the bench (owner, 2026-09-12): the
// host frame used to reload into a new room that the pretend students,
// the console tab and the plan rail never heard about. The host hands
// the click here instead; the bench resets and relaunches the same
// activity with the same number of students.
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'prototype-play-again') return;
  if (e.origin !== window.location.origin) return;
  if (!launchBtn.disabled) return; // nothing running
  resetBtn.click();
  launchBtn.click();
});

// --- The pager: one student screen at a time, ‹ N of M › in the bar ---

function getPlayerPanels() {
  return Array.from(playerHolder.querySelectorAll('.player-panel'));
}

function showCarouselPlayer(index) {
  const panels = getPlayerPanels();
  if (!panels.length) return;
  carouselIndex = ((index % panels.length) + panels.length) % panels.length;
  panels.forEach((p, i) => { p.hidden = i !== carouselIndex; });
  studentBarTitle.textContent = 'Student screen · Player ' + (carouselIndex + 1);
  carouselCount.textContent = (carouselIndex + 1) + ' of ' + panels.length;
  carouselPrev.disabled = panels.length < 2;
  carouselNext.disabled = panels.length < 2;
}

carouselPrev.addEventListener('click', () => showCarouselPlayer(carouselIndex - 1));
carouselNext.addEventListener('click', () => showCarouselPlayer(carouselIndex + 1));

// Keyboard ← → to step through students. A key pressed inside a frame
// (the class screen, the teacher controls, a student screen) never
// reaches this document, so once the teacher had clicked into a frame the
// arrows went dead until they clicked out (owner, 2026-09-13): every
// frame forwards the same keys on load (same origin). Typing in a text
// box keeps its arrows: they move the caret.
function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}
function onArrowKey(e) {
  if (isTyping(e.target)) return;
  if (e.key === 'ArrowLeft') showCarouselPlayer(carouselIndex - 1);
  if (e.key === 'ArrowRight') showCarouselPlayer(carouselIndex + 1);
}
document.addEventListener('keydown', onArrowKey);
function forwardArrowKeys(iframe) {
  iframe.addEventListener('load', () => {
    try { iframe.contentDocument.addEventListener('keydown', onArrowKey); } catch (err) { /* cross-origin or gone */ }
  });
}

// --- Sound: the host's own toggle, driven from here. The sounds play
// inside the host iframe, so its switch is the one that counts; before a
// room exists the shared setting (localStorage) is flipped for the next
// launch to read.
function readMuted() {
  const host = hostFrame();
  try {
    if (host && host.contentWindow && host.contentWindow.Juice) return host.contentWindow.Juice.muted();
  } catch (err) { /* not ready yet */ }
  return window.Juice ? Juice.muted() : false;
}

function labelSound(muted) {
  soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  soundBtn.title = muted ? 'Sound effects are off. Turn them on' : 'Sound effects are on. Turn them off';
}

soundBtn.addEventListener('click', () => {
  const host = hostFrame();
  let muted;
  try {
    const win = host && host.contentWindow;
    const toggle = win && win.document.getElementById('sfx-toggle');
    if (toggle && win.Juice) { toggle.click(); muted = win.Juice.muted(); }
  } catch (err) { /* fall through to the shared setting */ }
  if (muted === undefined && window.Juice) muted = Juice.toggleMuted();
  labelSound(!!muted);
});
labelSound(readMuted());

// --- Full screen: the whole bench, Esc leaves ---
if (!document.fullscreenEnabled) {
  fullscreenBtn.hidden = true;
} else {
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => { /* blocked: nothing to do */ });
  });
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    fullscreenBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullscreenBtn.title = on ? 'Leave full screen' : 'Show this page full screen (Esc leaves)';
    updateBanner();
  });
}

updateBench();
updateBanner();
