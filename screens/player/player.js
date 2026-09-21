/**
 * player.js — the student device client (Chromebook / tablet).
 *
 * The socket.io client for one player: join, then the input UI for each phase
 * (text answers, choices, votes, ranks, rates, wagers, relay turns, merge
 * drafts, estimate guesses, buzz/one-voice taps). It mirrors the host's current
 * phase via socket events, guards against stale events left over from a
 * previous phase, restores state on reconnect (token rebind), and — in
 * prototype mode — exposes a bot-fill hook. Stays quiet (no juice) except the
 * student's own moments (their submit, their personal win).
 */

// Default theme — paste-up: paper and ink on gesso, one loud vermillion.
// Overridden by a game-specific theme when one is set.
if (window.applyGameTheme) {
  window.applyGameTheme('totem');
}

// websocket first (2026-09-20, measured on the live site): the default polling-then-upgrade left the first emits (create-room, join) riding HTTP for 80 to 210 ms; on a socket they take about 30. Polling stays as the fallback for a network that blocks websockets.
const socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
// A network that silently drops the websocket handshake reaches the connect timeout instead of a transport error; from then on connect the classic way (polling first, then upgrade), socket.io's documented fallback.
socket.on('connect_error', function () { socket.io.opts.transports = ['polling', 'websocket']; });

// --- Juice (sounds + confetti + avatars) ---
// Garnish from /shared/juice.js; guarded so a load failure can't break the game.
// Player devices stay quiet except for the student's own actions — 30
// Chromebooks chiming in sync is chaos, not juice.
const J = window.Juice || null;

// --- Stale-event guard: echo the last seen phaseInstanceId on every outgoing event ---
let latestPhaseInstanceId = null;
socket.onAny(function (_eventName, payload) {
  if (payload && typeof payload === 'object' && payload.phaseInstanceId !== undefined) {
    latestPhaseInstanceId = payload.phaseInstanceId;
  }
});
const _origEmit = socket.emit.bind(socket);
socket.emit = function (event, payload) {
  if (latestPhaseInstanceId !== null && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.phaseInstanceId === undefined) payload.phaseInstanceId = latestPhaseInstanceId;
  }
  return _origEmit(event, payload);
};

let currentRoomCode = null;
let currentPlayerName = null;
let currentToken = null;
let isEliminated = false;

// Prototype mode: pretend students live in same-origin iframes that SHARE
// one sessionStorage, so a stored playerToken makes every new player "take
// over" the previous one's seat (join-policy takeover, meant for a
// duplicated tab). Prototype players keep their token in memory only.
const IS_PROTOTYPE = new URLSearchParams(window.location.search).get('prototype') === 'true';

// Timer state
let timerInterval = null;
let timerRemaining = 0;
let timerTotal = 0;
let timerWrapperEl = null;
const collectTimerDisplay = document.getElementById('collect-timer');
const voteTimerDisplay = document.getElementById('vote-timer');

// Head-to-head vote state
let currentMatchups = [];
let currentMatchupIndex = 0;
let matchupVotes = [];
let currentCandidates = [];

// --- Screen control helpers ---

// --- Phase image helper ---
function applyImage(imgEl, url, show) {
  if (!imgEl) return;
  if (show && !show.includes('image')) {
    imgEl.hidden = true;
    imgEl.removeAttribute('src');
    return;
  }
  if (url) {
    imgEl.src = url;
    imgEl.hidden = false;
  } else {
    imgEl.hidden = true;
    imgEl.removeAttribute('src');
  }
}

function applyShow(show, elementMap) {
  if (!show) return; // null/undefined = show all defaults
  for (const [key, el] of Object.entries(elementMap)) {
    if (el) el.hidden = !show.includes(key);
  }
}

function applyTemplate(section, templateText) {
  var tmplDiv = section.querySelector('.screen-template');
  if (!tmplDiv) return;
  if (templateText) {
    // Teacher text: **bold** paints, markers never show
    setRichText(tmplDiv, templateText);
    tmplDiv.hidden = false;
  } else {
    tmplDiv.textContent = '';
    tmplDiv.hidden = true;
  }
}

// Escape anything interpolated into an innerHTML string. Student text,
// teacher config, and AI output are all untrusted for rendering — a relay
// answer of "<img onerror=...>" must paint as text, never execute.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Elements - Join
const joinSection = document.getElementById('join-section');
const roomCodeInput = document.getElementById('room-code-input');
const nameInput = document.getElementById('name-input');
const nameField = document.getElementById('name-field');
const anonHint = document.getElementById('anon-hint');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

// Elements - Waiting
const waitingSection = document.getElementById('waiting-section');
const playerNameDisplay = document.getElementById('player-name');

// Elements - Collect
const collectSection = document.getElementById('collect-section');
const promptDisplay = document.getElementById('prompt-display');
const responseInput = document.getElementById('response-input');
const submitBtn = document.getElementById('submit-btn');
const responseCounter = document.getElementById('response-counter');
const audienceLine = document.getElementById('audience-line');
const nextHintEl = document.getElementById('next-hint');
const responseNotice = document.getElementById('response-notice');

const RESPONSE_MAX = 280;
const RESPONSE_MIN = 2;
// Per-phase override (accumulating lists need more room than one answer).
let responseMax = RESPONSE_MAX;

// Live character counter + notice clearing as the student types.
if (responseInput) {
  responseInput.addEventListener('input', () => {
    if (responseCounter) responseCounter.textContent = responseInput.value.length + ' / ' + responseMax;
    if (responseNotice && !responseNotice.hidden) responseNotice.hidden = true;
  });
}

// Mic button — speak instead of typing (hidden on browsers without the Web
// Speech API; text lands in the same box and same submit path as typing).
if (responseInput && window.Speech) {
  Speech.attachMic(responseInput);
}

function showResponseNotice(message) {
  if (!responseNotice) return;
  responseNotice.textContent = message;
  responseNotice.hidden = false;
}

// Elements - Phase images
const collectImage = document.getElementById('collect-image');
const revealImage = document.getElementById('reveal-image');
const announceImage = document.getElementById('announce-image');

// Elements - Other sections
const submittedSection = document.getElementById('submitted-section');
const processSection = document.getElementById('process-section');
const revealSection = document.getElementById('reveal-section');
const aiResultDisplay = document.getElementById('ai-result');
const endSection = document.getElementById('end-section');
const doneSection = document.getElementById('done-section');
const doneMessageEl = document.getElementById('done-message');

// Elements - New sections
const eliminatedBanner = document.getElementById('eliminated-banner');
const gameWaitingSection = document.getElementById('game-waiting-section');
const gameWaitingMessage = document.getElementById('game-waiting-message');
const voteSection = document.getElementById('vote-section');
const voteTitle = document.getElementById('vote-title');
const voteOptions = document.getElementById('vote-options');
const voteProgress = document.getElementById('vote-progress');
const voteSubmittedSection = document.getElementById('vote-submitted-section');
const eliminationResultsSection = document.getElementById('elimination-results-section');
const eliminationDetails = document.getElementById('elimination-details');
const announceSection = document.getElementById('announce-section');
const announceMessage = document.getElementById('announce-message');
const announceTimerDisplay = document.getElementById('announce-timer');
const winnerSection = document.getElementById('winner-section');
const winnerTitle = document.getElementById('winner-title');
const winnerEntryDisplay = document.getElementById('winner-entry');
const winnerDetails = document.getElementById('winner-details');
const standingsList = document.getElementById('standings-list');

// Elements - Leaderboard
const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardRank = document.getElementById('leaderboard-rank');
const leaderboardScore = document.getElementById('leaderboard-score');
const leaderboardStandings = document.getElementById('leaderboard-standings');

// Elements - Reveal-one
const revealOneSection = document.getElementById('reveal-one-section');
const revealOneMessage = document.getElementById('reveal-one-message');
const revealOneItems = document.getElementById('reveal-one-items');

// Elements - Team-split
const teamSplitSection = document.getElementById('team-split-section');
const teamSplitMyTeam = document.getElementById('team-split-my-team');
const teamSplitAllTeams = document.getElementById('team-split-all-teams');
const teamPick = document.getElementById('team-pick');
const teamPickOptions = document.getElementById('team-pick-options');

// Elements - Rank
const rankSection = document.getElementById('rank-section');
const rankPromptDisplay = document.getElementById('rank-prompt-display');
const rankTimerDisplay = document.getElementById('rank-timer-display');
const rankItems = document.getElementById('rank-items');
const rankSubmitBtn = document.getElementById('rank-submit-btn');

// Elements - Match
const matchSection = document.getElementById('match-section');
const matchPromptDisplay = document.getElementById('match-prompt-display');
const matchTimerDisplay = document.getElementById('match-timer-display');
const matchRows = document.getElementById('match-rows');
const matchHint = document.getElementById('match-hint');
const matchSubmitBtn = document.getElementById('match-submit-btn');
const matchPlayerResults = document.getElementById('match-player-results');

// Elements - Sort
const sortSection = document.getElementById('sort-section');
const sortPromptDisplay = document.getElementById('sort-prompt-display');
const sortTimerDisplay = document.getElementById('sort-timer-display');
const sortHint = document.getElementById('sort-hint');
const sortItemsEl = document.getElementById('sort-items');
const sortSubmitBtn = document.getElementById('sort-submit-btn');
const sortPlayerResults = document.getElementById('sort-player-results');

// Elements - Checklist
const checklistSection = document.getElementById('checklist-section');
const checklistPromptDisplay = document.getElementById('checklist-prompt-display');
const checklistGroupLabel = document.getElementById('checklist-group-label');
const checklistTimerDisplay = document.getElementById('checklist-timer-display');
const checklistItemsEl = document.getElementById('checklist-items');
const checklistPlayerResults = document.getElementById('checklist-player-results');

// Elements - One Voice
const oneVoiceSection = document.getElementById('one-voice-section');
const oneVoiceInstruction = document.getElementById('one-voice-instruction');
const oneVoiceTapBtn = document.getElementById('one-voice-tap-btn');
const oneVoiceStatus = document.getElementById('one-voice-status');

// Elements - Merge
const mergeSection = document.getElementById('merge-section');
const mergeInstruction = document.getElementById('merge-instruction');
const mergeTimerDisplay = document.getElementById('merge-timer-display');
const mergeMembers = document.getElementById('merge-members');
const mergeSeeds = document.getElementById('merge-seeds');
const mergeSharedHint = document.getElementById('merge-shared-hint');
const mergeDraftInput = document.getElementById('merge-draft-input');
const mergeStatus = document.getElementById('merge-status');
const mergeAgreeBtn = document.getElementById('merge-agree-btn');

// Elements - Wager
const wagerSection = document.getElementById('wager-section');
const wagerPromptDisplay = document.getElementById('wager-prompt-display');
const wagerPointsDisplay = document.getElementById('wager-points-display');
const wagerTimerDisplay = document.getElementById('wager-timer-display');
const wagerOptionsDisplay = document.getElementById('wager-options-display');
const wagerAmountSection = document.getElementById('wager-amount-section');
const wagerAmountInput = document.getElementById('wager-amount-input');
const wagerSubmitBtn = document.getElementById('wager-submit-btn');

// Elements - Rate
const rateSection = document.getElementById('rate-section');
const ratePromptDisplay = document.getElementById('rate-prompt-display');
const rateTimerDisplay = document.getElementById('rate-timer-display');
const rateScales = document.getElementById('rate-scales');
const rateSubmitBtn = document.getElementById('rate-submit-btn');
const rateResults = document.getElementById('rate-results');

// Elements - Relay
const relaySection = document.getElementById('relay-section');
const relayStatus = document.getElementById('relay-status');
const relayPromptDisplay = document.getElementById('relay-prompt-display');
const relayTimerDisplay = document.getElementById('relay-timer-display');
const relaySharedDisplay = document.getElementById('relay-shared-display');
const relayInputSection = document.getElementById('relay-input-section');
const relayInput = document.getElementById('relay-input');
const relaySubmitBtn = document.getElementById('relay-submit-btn');

// Elements - Turn (charades/describe-it)
const turnSection = document.getElementById('turn-section');
const turnRoleLabel = document.getElementById('turn-role-label');
const turnInstruction = document.getElementById('turn-instruction');
const turnItemDisplay = document.getElementById('turn-item-display');
const turnTeamLine = document.getElementById('turn-team-line');
const turnTimerDisplay = document.getElementById('turn-timer-display');
const turnControls = document.getElementById('turn-controls');
const turnGotItBtn = document.getElementById('turn-got-it-btn');
const turnSkipBtn = document.getElementById('turn-skip-btn');
const turnRemaining = document.getElementById('turn-remaining');
let turnTimerInterval = null;
let turnCurrentInstanceId = null;

// --- Button handlers ---

// Typed code letters fill the painted blocks behind the input (Totem: 10c)
function renderCodeSlots() {
  const letters = roomCodeInput.value.toUpperCase();
  const slots = document.querySelectorAll('.code-slot');
  for (let i = 0; i < slots.length; i++) {
    slots[i].textContent = letters[i] || '';
    slots[i].classList.toggle('code-slot-filled', !!letters[i]);
  }
}

roomCodeInput.addEventListener('input', function () {
  this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '');
  renderCodeSlots();
  checkRoomInfo();
});

// --- Anonymous rooms: no name box ---
// Once four letters are in, ask the server whether this room collects names.
// The lookup is a courtesy for the UI only: if it fails (room not created
// yet, flaky wifi), the name box stays and the server still ignores typed
// names for anonymous rooms.
let roomIsAnonymous = false;
let roomInfoSeq = 0; // ignore out-of-order fetch responses while typing

function setAnonymousJoinUI(on) {
  roomIsAnonymous = on;
  if (nameField) nameField.hidden = on;
  if (anonHint) anonHint.hidden = !on;
}

function checkRoomInfo() {
  const code = roomCodeInput.value.toUpperCase().trim();
  if (code.length !== 4) {
    setAnonymousJoinUI(false);
    return;
  }
  const seq = ++roomInfoSeq;
  fetch('/api/rooms/' + encodeURIComponent(code) + '/info')
    .then(r => (r.ok ? r.json() : null))
    .then(info => {
      if (seq === roomInfoSeq) setAnonymousJoinUI(!!(info && info.anonymous));
      // The join form itself switches language as soon as the code is
      // known (and back to English if the next code is an English room).
      if (seq === roomInfoSeq && info && window.UiLang) {
        UiLang.set(info.language, info.strings);
        UiLang.apply();
      }
    })
    .catch(() => {
      if (seq === roomInfoSeq) setAnonymousJoinUI(false);
    });
}

// Prototype mode: auto-fill and auto-join
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('prototype') === 'true') {
    const code = params.get('code');
    const name = params.get('name');
    if (code && name) {
      roomCodeInput.value = code;
      nameInput.value = name;
      renderCodeSlots();
      // Delay to ensure socket is connected
      setTimeout(() => joinBtn.click(), 500);
    }
  }
})();

// Shared join link / QR (?code=XXXX from the host's "Copy join link" or QR
// code): prefill the room code so the student only types a name. Prototype
// mode is handled above, so skip it here.
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('prototype') === 'true') return;
  const code = params.get('code');
  if (code) {
    roomCodeInput.value = code.toUpperCase().trim().slice(0, 4);
    renderCodeSlots();
    checkRoomInfo();
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
  }
})();

// --- Bot Fill (prototype mode) ---
// Answers come from /shared/bot-brain.js: prompt-aware rules so a snack
// question gets a snack answer. Falls back to a playful generic if the
// script didn't load for some reason.
function botFillAnswer(promptText) {
  if (typeof botAnswerFor === 'function') return botAnswerFor(promptText);
  return 'Pizza is the best food';
}

// The step on screen (from game-started). The template's hand-authored
// sample answers (config.sampleAnswers, dealt by the simulator page per
// seat) are keyed by it; a `respondsTo` set is matched to the classmate's
// text on screen, prompt and inherited block alike.
var currentCollectPhaseId = null;
function sampleFor(samples, seat) {
  if (typeof pickSampleAnswer !== 'function' || !samples) return null;
  var inherited = collectSection.querySelector('.inherited-block');
  var onScreen = promptDisplay.textContent + '\n' + (inherited ? inherited.textContent : '');
  return pickSampleAnswer(samples, currentCollectPhaseId, onScreen, seat);
}

window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'bot-fill') return;
  var sample = sampleFor(e.data.samples, e.data.seat);

  // Find the currently visible section
  var active = document.querySelector('section.active');
  if (!active) return;
  var id = active.id;

  if (id === 'collect-section') {
    // Drawing mode: scribble something plausible and submit
    if (!drawArea.hidden && drawPadApi && window.Draw) {
      drawPadApi.setStrokes(drawPadApi.getStrokes().concat(Draw.scribble()));
      var drawBtn = active.querySelector('#submit-btn');
      if (drawBtn && !drawBtn.disabled) drawBtn.click();
      return;
    }
    // Check for choice buttons first (collect-choice mode)
    var choiceBtns = active.querySelectorAll('.choice-btn');
    if (choiceBtns.length > 0) {
      choiceBtns[Math.floor(Math.random() * choiceBtns.length)].click();
    } else {
      // Check for multi-field inputs
      var fieldInputs = active.querySelectorAll('.field-input');
      if (fieldInputs.length > 0) {
        for (var fi = 0; fi < fieldInputs.length; fi++) {
          // The template's sample (one per field) first; otherwise each
          // field gets an answer matched to its own label/placeholder
          var fieldSample = Array.isArray(sample) ? sample[fi] : null;
          fieldInputs[fi].value = typeof fieldSample === 'string'
            ? fieldSample
            : botFillAnswer(fieldInputs[fi].placeholder || promptDisplay.textContent);
        }
        var btn = active.querySelector('button#submit-btn');
        if (btn && !btn.disabled) btn.click();
      } else {
        // Free text mode: the template's sample answer, else the keyword
        // rules answer the actual question on screen
        var textarea = active.querySelector('textarea');
        var btn = active.querySelector('button#submit-btn');
        if (textarea && btn && !btn.disabled) {
          var line = typeof sample === 'string' ? sample : botFillAnswer(promptDisplay.textContent);
          // appendOnly boxes may already hold inherited text; add, never replace
          textarea.value = textarea.value ? textarea.value.replace(/\s*$/, '\n') + line : line;
          btn.click();
        }
      }
    }
  } else if (id === 'solo-quiz-section') {
    // Play the whole quiz through: a random pick per question, Next after
    // each feedback, until the finish line.
    sqBotAuto = true;
    var sqOpen = active.querySelectorAll('#sq-choices .choice-btn:not(:disabled)');
    if (sqOpen.length > 0) sqOpen[Math.floor(Math.random() * sqOpen.length)].click();
    else if (!sqNextBtn.hidden) sqNextBtn.click();
  } else if (id === 'vote-section') {
    // Click a random vote button
    var voteBtns = active.querySelectorAll('.vote-btn');
    if (voteBtns.length > 0) {
      voteBtns[Math.floor(Math.random() * voteBtns.length)].click();
    }
  } else if (id === 'rank-section') {
    // Shuffle current order and submit
    if (rankCurrentOrder.length > 0) {
      for (var i = rankCurrentOrder.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = rankCurrentOrder[i];
        rankCurrentOrder[i] = rankCurrentOrder[j];
        rankCurrentOrder[j] = tmp;
      }
    }
    var rankBtn = active.querySelector('#rank-submit-btn');
    if (rankBtn && !rankBtn.disabled) rankBtn.click();
  } else if (id === 'match-section') {
    // Shuffle the right column and submit (bots aren't vocab experts)
    if (matchRightOrder.length > 0) {
      for (var mi = matchRightOrder.length - 1; mi > 0; mi--) {
        var mj = Math.floor(Math.random() * (mi + 1));
        var mtmp = matchRightOrder[mi];
        matchRightOrder[mi] = matchRightOrder[mj];
        matchRightOrder[mj] = mtmp;
      }
    }
    var matchBtn = active.querySelector('#match-submit-btn');
    if (matchBtn && !matchBtn.disabled) matchBtn.click();
  } else if (id === 'sort-section') {
    // Tap a random bucket for every item, then submit
    for (var si = 0; si < sortChoices.length; si++) {
      sortChoices[si] = sortBucketNames[Math.floor(Math.random() * sortBucketNames.length)];
    }
    renderSortItems();
    var sortBtn = active.querySelector('#sort-submit-btn');
    if (sortBtn && !sortBtn.disabled) sortBtn.click();
  } else if (id === 'team-split-section') {
    // Choice mode: grab a random open spot
    var pickBtns = active.querySelectorAll('.team-pick-option:not(:disabled):not(.team-pick-mine)');
    if (pickBtns.length > 0) {
      pickBtns[Math.floor(Math.random() * pickBtns.length)].click();
    }
  } else if (id === 'one-voice-section') {
    if (!oneVoiceTapBtn.disabled) oneVoiceTapBtn.click();
  } else if (id === 'buzz-section') {
    if (!buzzTapBtn.disabled) buzzTapBtn.click();
  } else if (id === 'estimate-section') {
    if (!estimateInput.disabled && !estimateInput.value) {
      var picks = estimateScale.hidden ? [] : estimateScale.querySelectorAll('.scale-pick');
      if (picks.length) {
        picks[Math.floor(Math.random() * picks.length)].click();
      } else if (!estimateSlider.hidden) {
        var lo = parseFloat(estimateSlider.min), hi = parseFloat(estimateSlider.max);
        estimateInput.value = String(Math.round(lo + Math.random() * (hi - lo)));
      } else {
        estimateInput.value = String(Math.floor(Math.random() * 200) + 1);
      }
    }
    if (!estimateSubmitBtn.disabled) estimateSubmitBtn.click();
  } else if (id === 'merge-section') {
    // Only the first bot in the group drafts (an empty box means nobody
    // wrote yet); everyone agrees shortly after, so each bot-fill click
    // moves the group forward without endlessly resetting agreements.
    if (!mergeDraftInput.value.trim()) {
      // Actually merge: combine the seed answers shown on screen
      var seedEls = mergeSeeds.querySelectorAll('.merge-seed');
      var seedTexts = [];
      for (var si2 = 0; si2 < seedEls.length && si2 < 2; si2++) {
        // Strip the "Name: " author prefix
        seedTexts.push(seedEls[si2].textContent.replace(/^[^:]{1,20}:\s*/, ''));
      }
      var botDraft = seedTexts.length >= 2
        ? seedTexts[0] + ', and also ' + seedTexts[1].charAt(0).toLowerCase() + seedTexts[1].slice(1)
        : (seedTexts[0] || botFillAnswer(mergeInstruction.textContent));
      mergeDraftInput.value = botDraft;
      socket.emit('merge-draft', { code: currentRoomCode, text: botDraft });
    }
    setTimeout(function() {
      if (!mergeAgreeBtn.hidden && !mergeAgreeBtn.disabled) mergeAgreeBtn.click();
    }, 400);
  } else if (id === 'wager-section') {
    // Pick random option and submit
    var wagerBtns = active.querySelectorAll('.wager-option-btn');
    if (wagerBtns.length > 0) {
      wagerBtns[Math.floor(Math.random() * wagerBtns.length)].click();
    }
    var wagerBtn = active.querySelector('#wager-submit-btn');
    if (wagerBtn && !wagerBtn.disabled) {
      setTimeout(function() { wagerBtn.click(); }, 100);
    }
  } else if (id === 'rate-section') {
    // Pick a random value on each scale, then submit
    var scaleCards = active.querySelectorAll('.rate-scale');
    for (var sci = 0; sci < scaleCards.length; sci++) {
      var btns = scaleCards[sci].querySelectorAll('.rate-btn');
      if (btns.length > 0) {
        btns[Math.floor(Math.random() * btns.length)].click();
      }
    }
    var rateBtn = active.querySelector('#rate-submit-btn');
    if (rateBtn && !rateBtn.disabled) {
      setTimeout(function() { rateBtn.click(); }, 100);
    }
  } else if (id === 'relay-section') {
    // Fill relay input and submit (only if it's our turn)
    var relayIn = active.querySelector('#relay-input');
    var relayBtn = active.querySelector('#relay-submit-btn');
    if (relayIn && relayBtn && !relayBtn.disabled && !document.getElementById('relay-input-section').hidden) {
      relayIn.value = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
      relayBtn.click();
    }
  }
});

joinBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.toUpperCase().trim();
  // Anonymous rooms: never send a typed name (the server would ignore it,
  // but it shouldn't even leave the device).
  const name = roomIsAnonymous ? '' : nameInput.value.trim();

  if (code.length !== 4) {
    showError('Please enter a 4-letter room code');
    return;
  }

  errorMessage.hidden = true;
  joinBtn.disabled = true;
  currentRoomCode = code;
  currentPlayerName = name;
  // Send any saved token so the server can reconnect us (or block us, if the
  // host kicked this token from the room). Tokens are per-room, so passing a
  // stale token from another room is harmless.
  var savedToken = currentToken;
  if (!savedToken && !IS_PROTOTYPE) {
    try { savedToken = sessionStorage.getItem('playerToken'); } catch (e) { /* storage unavailable */ }
  }
  socket.emit('join-room', { code, name, token: savedToken || undefined });
});

// --- Submit acknowledgment ---
// A collect answer shows the "submitted" screen only after the server says
// it stored it ('response-accepted'). Until then the button reads
// "Sending..." and the student stays on the question, so a filtered, lost,
// or late answer never looks submitted (reviewer finding 2026-09-06). If no
// word comes back in SUBMIT_ACK_TIMEOUT_MS the button comes back with a
// notice rather than a false "submitted".
var SUBMIT_ACK_TIMEOUT_MS = 12000;
var submitPending = null; // { btn, label, timer }

function awaitSubmitAck(btn) {
  clearSubmitPending();
  submitPending = { btn: btn || null, label: btn ? btn.textContent : null, timer: null };
  if (btn) {
    btn.disabled = true;
    btn.textContent = UiLang.t('Sending...');
  }
  submitPending.timer = setTimeout(function () {
    if (!submitPending) return;
    clearSubmitPending();
    if (btn) btn.disabled = false;
    showResponseNotice(UiLang.t('Not sent yet. Please try again.'));
  }, SUBMIT_ACK_TIMEOUT_MS);
}

function clearSubmitPending() {
  if (!submitPending) return;
  clearTimeout(submitPending.timer);
  if (submitPending.btn && submitPending.label !== null) submitPending.btn.textContent = submitPending.label;
  submitPending = null;
}

socket.on('response-accepted', function () {
  var wasPending = !!submitPending;
  clearSubmitPending();
  var active = document.querySelector('section.active');
  if (wasPending && active && active.id === 'collect-section') showSection(submittedSection);
});

submitBtn.addEventListener('click', () => {
  // Multi-field and choice modes hide the textarea and drive submission via
  // their own handlers; this listener only governs single-text mode.
  if (responseInput.hidden || responseInput.style.display === 'none') return;

  const response = responseInput.value.trim();

  if (response.length < RESPONSE_MIN) {
    showResponseNotice('Please write a bit more.');
    return;
  }

  if (responseNotice) responseNotice.hidden = true;
  socket.emit('submit-response', { code: currentRoomCode, response });
  awaitSubmitAck(submitBtn);
});

// Server rejected a submission (filtered or invalid). The notice lands on
// whichever input the student is actually using — merge drafts and relay
// turns get rejected too, not just collect answers.
socket.on('response-rejected', ({ message }) => {
  var notice = message || 'That response wasn’t accepted. Please try again.';
  var active = document.querySelector('section.active');
  clearSubmitPending();

  if (active && active.id === 'merge-section') {
    // Stay in the shared-draft editor; the offending text is still local
    // (the server never stored or broadcast it).
    setMergeStatus(notice);
    return;
  }
  if (active && active.id === 'relay-section') {
    // Their turn is still open — revise and resubmit.
    relayInputSection.hidden = false;
    relaySubmitBtn.disabled = false;
    relayStatus.textContent = notice;
    return;
  }

  // Default: collect — back to the question with their text intact.
  showSection(collectSection);
  submitBtn.disabled = false;
  showResponseNotice(notice);
});

// --- Socket events - Join ---

// Early-bird joke (engine/early-joke.js): the server deals one to the
// first N joiners and re-sends the same one on a reconnect. The card sits
// above every section (a rolling-start room never shows the lobby) until
// the student taps Got it; a reconnect after that does not bring it back.
const earlyJokeCard = document.getElementById('early-joke');
const earlyJokeText = document.getElementById('early-joke-text');
let earlyJokeDismissed = false;
document.getElementById('early-joke-dismiss').addEventListener('click', () => {
  earlyJokeDismissed = true;
  earlyJokeCard.hidden = true;
});
const earlyJokeBlock = document.getElementById('early-joke-block');
const earlyJokeDots = document.getElementById('early-joke-dots');
const earlyJokePunchline = document.getElementById('early-joke-punchline');
const earlyJokeDismiss = document.getElementById('early-joke-dismiss');
let earlyJokeTimer = null;
// joke = { setup, punchline, pauseMs } from the server (engine/early-joke.js
// splitJoke): the setup shows at once, the punchline lands after the pause
// (a one-breath joke has no punchline and no pause). A reconnect while the
// pause is running restarts it rather than stacking a second reveal.
function showEarlyJoke(joke) {
  if (!joke || typeof joke !== 'object' || typeof joke.setup !== 'string' || !joke.setup.trim() || earlyJokeDismissed) return;
  // The teller is one of the meadow's nine painted tones, picked once.
  if (earlyJokeBlock && !earlyJokeBlock.dataset.tone) {
    const tone = Math.floor(Math.random() * 9);
    earlyJokeBlock.className = 'meadow-block meadow-tone-' + tone;
    earlyJokeBlock.dataset.tone = String(tone);
  }
  if (earlyJokeTimer) { clearTimeout(earlyJokeTimer); earlyJokeTimer = null; }
  earlyJokeText.textContent = joke.setup;
  earlyJokePunchline.textContent = typeof joke.punchline === 'string' ? joke.punchline : '';
  const waiting = !!earlyJokePunchline.textContent;
  earlyJokePunchline.hidden = true;
  earlyJokeDots.hidden = !waiting;
  earlyJokeDismiss.hidden = waiting;
  earlyJokeCard.hidden = false;
  if (waiting) {
    const pause = Number.isFinite(joke.pauseMs) && joke.pauseMs >= 0 ? joke.pauseMs : 5000;
    earlyJokeTimer = setTimeout(() => {
      earlyJokeTimer = null;
      earlyJokeDots.hidden = true;
      earlyJokePunchline.hidden = false;
      earlyJokeDismiss.hidden = false;
    }, pause);
  }
}

socket.on('join-success', ({ name, reconnected, token, theme, language, strings, wordHelp, joke }) => {
  // Fixed labels (Submit, Skip, You're in!) in the activity's language.
  if (window.UiLang && strings) { UiLang.set(language, strings); UiLang.apply(); }
  showEarlyJoke(joke);
  // Word help (shared/word-help.js): tappable prompt words, a translation
  // budget per student. The server owns the count; this only shows it.
  if (window.WordHelp) {
    WordHelp.configure(wordHelp || null, function (req) {
      socket.emit('word-lookup', { code: currentRoomCode, word: req.word, sentence: req.sentence });
    });
  }
  if (!reconnected) {
    showSection(waitingSection);
  }
  // If reconnected, sendCurrentState on the server will push the right section
  // Plain name, no emoji avatar (owner call 2026-08-27).
  playerNameDisplay.textContent = name;
  currentPlayerName = name;
  if (token) {
    currentToken = token;
    if (!IS_PROTOTYPE) {
      try { sessionStorage.setItem('playerToken', token); } catch (e) { /* storage unavailable */ }
    }
  }

  // Apply game theme
  if (theme && window.applyGameTheme) {
    window.applyGameTheme(theme);
  }
});

// --- Holding screens (2026-08-08): waits show the room, not a void ---

const lobbyCount = document.getElementById('lobby-count');
const lobbyAvatars = document.getElementById('lobby-avatars');
const submittedProgress = document.getElementById('submitted-progress');
const voteSubmittedProgress = document.getElementById('vote-submitted-progress');

// Lobby roster: classmates pop in as they join (lobby only — the projected
// host roster already shows this to the class).
socket.on('room-roster', ({ count, names } = {}) => {
  if (!Array.isArray(names)) return;
  lobbyCount.textContent = names.length <= 1
    ? 'Just you so far...'
    : names.length + ' of us here';
  lobbyCount.hidden = false;
  lobbyAvatars.innerHTML = '';
  for (const n of names) {
    const chip = document.createElement('span');
    chip.className = 'holding-avatar-chip';
    chip.textContent = n;
    lobbyAvatars.appendChild(chip);
  }
  lobbyAvatars.hidden = names.length === 0;
});

// The meadow: submitted classmates as anonymous blocks on the wait screens.
// SHARED SPACE (2026-08-30): the server assigns every submitter a canonical
// block index and relays nudges as anonymous {index, fx, fy}, so the whole
// class stands in ONE field — your nudge walks your block on everyone's
// screen. Your own block is nudgeable on the two screens you can only reach
// by submitting; the generic waiting screen is watch-only (non-eligible
// players share it, so "you" might not be one of the counted) but still
// shows the shared moves.
const gameWaitingProgress = document.getElementById('game-waiting-progress');
function relayNudge(fx, fy) {
  socket.emit('meadow-nudge', { code: currentRoomCode, fx: fx, fy: fy });
}
const meadows = window.Meadow ? [
  Meadow.attach(document.getElementById('submitted-meadow'), { onNudge: relayNudge }),
  Meadow.attach(document.getElementById('vote-submitted-meadow'), { onNudge: relayNudge }),
  Meadow.attach(document.getElementById('game-waiting-meadow'), { you: false })
].filter(Boolean) : [];

// The server tells only THIS student which block is theirs.
socket.on('meadow-you', ({ index } = {}) => {
  if (typeof index !== 'number') return;
  for (const m of meadows) m.setOwnIndex(index);
});

// A classmate's block (or our own echo) walked somewhere — anonymous index.
socket.on('meadow-moved', ({ index, fx, fy } = {}) => {
  if (typeof index !== 'number' || typeof fx !== 'number' || typeof fy !== 'number') return;
  for (const m of meadows) m.applyMove(index, fx, fy);
});

// Submission/vote progress: counts only, never names.
// Word help: the server's answer to a tapped word (and the new count)
socket.on('word-lookup-result', (data) => {
  if (window.WordHelp) WordHelp.result(data);
});

socket.on('room-progress', ({ count, total } = {}) => {
  if (typeof count !== 'number' || typeof total !== 'number') return;
  const text = count + ' of ' + total + ' in';
  submittedProgress.textContent = text;
  submittedProgress.hidden = false;
  voteSubmittedProgress.textContent = text;
  voteSubmittedProgress.hidden = false;
  gameWaitingProgress.textContent = text;
  gameWaitingProgress.hidden = false;
  for (const m of meadows) m.update(count);
});

// A new phase starts fresh — hide stale counts until this phase's first tick.
function resetHoldingProgress() {
  submittedProgress.hidden = true;
  submittedProgress.textContent = '';
  voteSubmittedProgress.hidden = true;
  voteSubmittedProgress.textContent = '';
  gameWaitingProgress.hidden = true;
  gameWaitingProgress.textContent = '';
  for (const m of meadows) m.reset();
}

// Auto-rejoin on socket reconnect
socket.on('connect', () => {
  if (currentRoomCode && currentPlayerName) {
    var savedToken = currentToken;
    if (!savedToken && !IS_PROTOTYPE) {
      try { savedToken = sessionStorage.getItem('playerToken'); } catch (e) { /* storage unavailable */ }
    }
    console.log('[reconnect] Attempting to rejoin room ' + currentRoomCode + (savedToken ? ' (with token)' : ''));
    socket.emit('join-room', { code: currentRoomCode, name: currentPlayerName, token: savedToken });
  }
});

socket.on('join-error', ({ message }) => {
  showError(message);
  joinBtn.disabled = false;
  currentRoomCode = null;
});

socket.on('room-closed', () => {
  eliminatedBanner.hidden = true;
  isEliminated = false;
  showSection(joinSection);
  joinBtn.disabled = false;
  currentRoomCode = null;
  currentPlayerName = null;
  showError('Room was closed by the host');
});

// Host removed this player. Null currentRoomCode/currentPlayerName so the
// auto-rejoin on reconnect won't fire — but KEEP the token: the server blocks
// that token from rejoining this room, and we resend it on manual join so a
// refresh/re-join in the same session stays blocked.
socket.on('kicked', ({ message } = {}) => {
  eliminatedBanner.hidden = true;
  isEliminated = false;
  currentRoomCode = null;
  currentPlayerName = null;
  showSection(joinSection);
  joinBtn.disabled = false;
  showError(message || 'You have been removed from this session.');
});

// This student joined again from another tab (duplicated tab shares the
// token): the seat moved there, this tab bows out. Null the room state so
// the auto-rejoin on reconnect can't steal the seat back, but KEEP the
// token — it's still this student's identity in the room.
socket.on('session-replaced', ({ message } = {}) => {
  eliminatedBanner.hidden = true;
  isEliminated = false;
  currentRoomCode = null;
  currentPlayerName = null;
  showSection(joinSection);
  joinBtn.disabled = false;
  showError(message || 'You joined again on another screen, so this one signed off.');
});

// --- Timer ---
// The Totem timer is a chip that reads like a clock, not a bar
function formatTimerText(seconds) {
  if (seconds >= 60) {
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  return String(seconds);
}

function startTimer(seconds, wrapperEl, onExpire) {
  clearTimer();
  timerRemaining = seconds;
  timerTotal = seconds;
  timerWrapperEl = wrapperEl;
  const textEl = wrapperEl.querySelector('.timer-bar-text');
  const fillEl = wrapperEl.querySelector('.timer-bar-fill');

  wrapperEl.hidden = false;
  wrapperEl.classList.remove('timer-warning');
  textEl.textContent = formatTimerText(timerRemaining);
  fillEl.style.width = '100%';

  timerInterval = setInterval(() => {
    timerRemaining--;
    textEl.textContent = formatTimerText(timerRemaining);
    fillEl.style.width = ((timerRemaining / timerTotal) * 100) + '%';
    if (timerRemaining <= 5) {
      wrapperEl.classList.add('timer-warning');
    }
    if (timerRemaining <= 0) {
      clearTimer();
      wrapperEl.hidden = true;
      if (onExpire) onExpire();
    }
  }, 1000);
}

// The teacher added time ("a bit more time"): shift the running countdown.
// Matters here more than anywhere — this clock does real work at 0 (it
// auto-submits), so an unshifted player would get cut off early.
socket.on('timer-extended', function ({ addSeconds }) {
  var add = Number(addSeconds) || 0;
  if (!timerInterval || !timerWrapperEl || add <= 0) return;
  timerRemaining += add;
  timerTotal += add;
  var textEl = timerWrapperEl.querySelector('.timer-bar-text');
  var fillEl = timerWrapperEl.querySelector('.timer-bar-fill');
  textEl.textContent = formatTimerText(timerRemaining);
  fillEl.style.width = ((timerRemaining / timerTotal) * 100) + '%';
  if (timerRemaining > 5) timerWrapperEl.classList.remove('timer-warning');
});

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerWrapperEl = null;
  collectTimerDisplay.hidden = true;
  collectTimerDisplay.classList.remove('timer-warning');
  voteTimerDisplay.hidden = true;
  voteTimerDisplay.classList.remove('timer-warning');
  announceTimerDisplay.hidden = true;
  announceTimerDisplay.classList.remove('timer-warning');
}

// --- Socket events - Game phases ---

// --- Drawing pad (collect inputType:"drawing") ---
// Lazily attached once; strokes come from /shared/drawing.js (Draw global).
var drawArea = document.getElementById('draw-area');
var drawPadCanvas = document.getElementById('draw-pad');
var drawColors = document.getElementById('draw-colors');
var drawUndoBtn = document.getElementById('draw-undo');
var drawClearBtn = document.getElementById('draw-clear');
var assignedDrawingCanvas = document.getElementById('assigned-drawing');
var displayDrawingCanvas = document.getElementById('display-drawing');
var announceDrawingCanvas = document.getElementById('announce-drawing');
var drawPadApi = null;

// drawingFrom: a shared read-only drawing everyone sees during this step
// (Doodle Bluff: title THIS drawing, then vote). Distinct from the rotated
// assigned-drawing, which is per-player.
function applyDisplayDrawing(canvasEl, strokes) {
  if (!canvasEl) return;
  if (strokes && strokes.length && window.Draw) {
    canvasEl.hidden = false;
    Draw.renderStrokes(canvasEl, strokes);
  } else {
    canvasEl.hidden = true;
  }
}

function initDrawPad() {
  if (drawPadApi || !window.Draw) return;
  // A stroke clears the "Draw something first!" notice the same way typing
  // clears it for text (it used to sit there over a finished drawing).
  drawPadApi = Draw.attachPad(drawPadCanvas, {
    onChange: function () { if (responseNotice && !responseNotice.hidden) responseNotice.hidden = true; }
  });
  // Color swatches (skip white — the canvas is white)
  for (var ci = 0; ci < Draw.PALETTE.length - 1; ci++) {
    (function (color) {
      var swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'draw-swatch' + (color === drawPadApi.getColor() ? ' draw-swatch-active' : '');
      swatch.style.background = color;
      swatch.addEventListener('click', function () {
        drawPadApi.setColor(color);
        drawColors.querySelectorAll('.draw-swatch').forEach(function (s) { s.classList.remove('draw-swatch-active'); });
        swatch.classList.add('draw-swatch-active');
      });
      drawColors.appendChild(swatch);
    })(Draw.PALETTE[ci]);
  }
  drawUndoBtn.addEventListener('click', function () { drawPadApi.undo(); });
  drawClearBtn.addEventListener('click', function () { drawPadApi.clear(); });
}

socket.on('game-started', ({ prompt, image, timer, playerTemplate, show, isChoice, choices, fields, passAllowed, inputType, assignedDrawing, displayDrawing, prefill, appendOnly, maxLength, phaseId, audience, nextHint }) => {
  resetHoldingProgress();
  // Which step this is (Try it out deals the template's sample answers by it)
  currentCollectPhaseId = phaseId || null;
  showSection(collectSection);
  setRichText(promptDisplay, prompt);
  // Who will see this answer (server-computed, engine/audience.js), and
  // the waiting-screen hint when a classmate gets it next
  audienceLine.textContent = audience || '';
  audienceLine.hidden = !audience;
  nextHintEl.textContent = nextHint || '';
  nextHintEl.hidden = !nextHint;
  responseMax = Number(maxLength) || RESPONSE_MAX;
  responseInput.maxLength = responseMax;
  // appendOnly: the inherited text renders read-only ABOVE the box — the
  // student can only add, never edit a classmate's lines (server rebuilds
  // the stored response from its own copy, so this isn't just cosmetic).
  var oldInherited = collectSection.querySelector('.inherited-block');
  if (oldInherited) oldInherited.remove();
  if (appendOnly && typeof prefill === 'string' && prefill !== '') {
    var inheritedBlock = document.createElement('div');
    inheritedBlock.className = 'inherited-block';
    inheritedBlock.textContent = prefill;
    responseInput.parentNode.insertBefore(inheritedBlock, responseInput);
    responseInput.value = '';
    responseInput.placeholder = 'Add your line below theirs...';
  } else {
    // prefillFromAssigned (editable): the passed item starts IN the box so
    // this student adds to it (write → pass → add one).
    responseInput.value = typeof prefill === 'string' ? prefill : '';
    responseInput.placeholder = 'Type your answer here...';
  }
  if (responseCounter) responseCounter.textContent = responseInput.value.length + ' / ' + responseMax;
  if (responseNotice) responseNotice.hidden = true;
  submitBtn.disabled = false;
  drawArea.hidden = true;
  assignedDrawingCanvas.hidden = true;
  applyTemplate(collectSection, playerTemplate);
  applyImage(collectImage, image, show);
  applyDisplayDrawing(displayDrawingCanvas, displayDrawing);

  // A rotated-in drawing shown with a TEXT input = caption mode ("what is
  // this?"). With a drawing input it preloads onto the pad instead.
  if (assignedDrawing && inputType !== 'drawing' && window.Draw) {
    assignedDrawingCanvas.hidden = false;
    Draw.renderStrokes(assignedDrawingCanvas, assignedDrawing);
  }

  // Clean up previous dynamic elements
  var oldChoices = collectSection.querySelector('.choice-buttons');
  if (oldChoices) oldChoices.remove();
  var oldFields = collectSection.querySelector('.multi-fields');
  if (oldFields) oldFields.remove();
  var oldPass = collectSection.querySelector('.pass-btn');
  if (oldPass) oldPass.remove();

  // Pass button (passAllowed steps). A pass lands on the exact same
  // "submitted" screen as a real answer, so nobody nearby can tell the
  // difference.
  if (passAllowed) {
    var passBtn = document.createElement('button');
    passBtn.className = 'pass-btn';
    passBtn.textContent = UiLang.t('Pass this one');
    passBtn.addEventListener('click', function() {
      socket.emit('submit-response', { code: currentRoomCode, response: '', pass: true });
      awaitSubmitAck(passBtn);
    });
    collectSection.appendChild(passBtn);
  }

  // Track current collect mode for timer auto-submit
  var collectMode = 'text';
  // The character counter belongs to text entry only; choice, multi-field
  // and drawing steps hide it (a stray "0 / 280" under a multiple-choice
  // question, outside review 2026-09-07).
  if (responseCounter) responseCounter.hidden = false;

  if (isChoice && Array.isArray(choices) && choices.length > 0) {
    // --- Multiple choice mode ---
    collectMode = 'choice';
    responseInput.hidden = true;
    responseInput.style.display = 'none';
    if (responseCounter) responseCounter.hidden = true;
    submitBtn.hidden = true;
    submitBtn.style.display = 'none';
    var choiceContainer = document.createElement('div');
    choiceContainer.className = 'choice-buttons';
    for (var ci = 0; ci < choices.length; ci++) {
      (function(choiceText) {
        var btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = choiceText;
        btn.addEventListener('click', function() {
          // One tap only: every choice locks until the server answers.
          var all = choiceContainer.querySelectorAll('.choice-btn');
          for (var bi = 0; bi < all.length; bi++) all[bi].disabled = true;
          socket.emit('submit-response', { code: currentRoomCode, response: choiceText });
          awaitSubmitAck(btn);
        });
        choiceContainer.appendChild(btn);
      })(typeof choices[ci] === 'string' ? choices[ci] : (choices[ci].text || choices[ci].name || String(choices[ci])));
    }
    collectSection.appendChild(choiceContainer);
    applyShow(show, {
      prompt: promptDisplay,
      input: choiceContainer,
      timer: collectTimerDisplay,
      submitButton: submitBtn
    });

  } else if (Array.isArray(fields) && fields.length > 0) {
    // --- Multi-field mode ---
    collectMode = 'fields';
    responseInput.hidden = true;
    responseInput.style.display = 'none';
    if (responseCounter) responseCounter.hidden = true;
    var fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'multi-fields';
    for (var fi = 0; fi < fields.length; fi++) {
      var fieldDef = fields[fi];
      var fieldLabel = document.createElement('label');
      fieldLabel.className = 'field-label';
      fieldLabel.textContent = fieldDef.label;
      fieldsContainer.appendChild(fieldLabel);

      var fieldInput = document.createElement('input');
      fieldInput.type = 'text';
      fieldInput.className = 'field-input';
      fieldInput.setAttribute('data-key', fieldDef.key);
      fieldInput.placeholder = fieldDef.placeholder || fieldDef.label;
      // Same cap as the single answer box (the server checks each field too)
      fieldInput.maxLength = responseMax;
      fieldsContainer.appendChild(fieldInput);
      // Per-field mic — dictate into whichever field it sits in.
      if (window.Speech) Speech.attachMic(fieldInput);
    }
    collectSection.insertBefore(fieldsContainer, submitBtn);
    submitBtn.hidden = false;
    submitBtn.style.display = '';

    // Override submit to send field object
    var fieldsSubmitHandler = function() {
      var inputs = fieldsContainer.querySelectorAll('.field-input');
      var result = {};
      var allFilled = true;
      for (var k = 0; k < inputs.length; k++) {
        var val = inputs[k].value.trim();
        if (!val) allFilled = false;
        result[inputs[k].getAttribute('data-key')] = val;
      }
      if (!allFilled) return;
      socket.emit('submit-response', { code: currentRoomCode, response: result });
      awaitSubmitAck(submitBtn);
    };
    submitBtn.onclick = fieldsSubmitHandler;

    applyShow(show, {
      prompt: promptDisplay,
      input: fieldsContainer,
      timer: collectTimerDisplay,
      submitButton: submitBtn
    });

  } else if (inputType === 'drawing') {
    // --- Drawing mode ---
    collectMode = 'drawing';
    responseInput.hidden = true;
    responseInput.style.display = 'none';
    if (responseCounter) { responseCounter.textContent = ''; responseCounter.hidden = true; }
    submitBtn.hidden = false;
    submitBtn.style.display = '';
    drawArea.hidden = false;
    initDrawPad();
    if (drawPadApi) {
      // A rotated-in drawing preloads onto the pad: continue-the-drawing.
      // (Undo/Clear never remove the inherited strokes.)
      drawPadApi.setStrokes(assignedDrawing || []);
    }
    submitBtn.onclick = function () {
      if (!drawPadApi || drawPadApi.isEmpty()) {
        showResponseNotice('Draw something first!');
        return;
      }
      socket.emit('submit-response', { code: currentRoomCode, response: { strokes: drawPadApi.getStrokes() } });
      awaitSubmitAck(submitBtn);
      if (J) J.sound('blip');
    };
    applyShow(show, {
      prompt: promptDisplay,
      input: drawArea,
      timer: collectTimerDisplay,
      submitButton: submitBtn
    });
  } else {
    // --- Single text mode ---
    responseInput.hidden = false;
    responseInput.style.display = '';
    submitBtn.hidden = false;
    submitBtn.style.display = '';
    submitBtn.onclick = null; // clear any multi-field handler
    applyShow(show, {
      prompt: promptDisplay,
      input: responseInput,
      timer: collectTimerDisplay,
      submitButton: submitBtn
    });
  }

  if (timer) {
    startTimer(timer, collectTimerDisplay, () => {
      if (collectMode === 'choice') {
        var randomChoice = choices[Math.floor(Math.random() * choices.length)];
        var text = typeof randomChoice === 'string' ? randomChoice : (randomChoice.text || randomChoice.name || String(randomChoice));
        socket.emit('submit-response', { code: currentRoomCode, response: text });
      } else if (collectMode === 'fields') {
        var inputs = collectSection.querySelectorAll('.field-input');
        var result = {};
        for (var k = 0; k < inputs.length; k++) {
          result[inputs[k].getAttribute('data-key')] = inputs[k].value.trim() || '';
        }
        socket.emit('submit-response', { code: currentRoomCode, response: result });
      } else if (collectMode === 'drawing') {
        // Auto-submit whatever's on the pad; a blank pad submits nothing
        // (the server rejects empties, and the host closes the phase anyway)
        if (drawPadApi && !drawPadApi.isEmpty()) {
          socket.emit('submit-response', { code: currentRoomCode, response: { strokes: drawPadApi.getStrokes() } });
        }
        submitBtn.disabled = true;
      } else {
        submitBtn.disabled = true;
        socket.emit('submit-response', { code: currentRoomCode, response: responseInput.value.trim() || '' });
      }
      showSection(submittedSection);
    });
  }
});

const processTitle = document.getElementById('process-title');

// What the room reads while an ai-process step runs. Never the word AI
// (owner, 2026-09-16: students should be reminded as little as possible
// that the activity was made with AI); the work is described, not the
// worker. Every line has a row in each language table (engine/i18n).
const TASK_MESSAGES = {
  'summarize': 'Putting the answers together...',
  'generate': 'Making something from your answers...',
  'generate-choices': 'Setting up the choices...',
  'compare': 'Comparing the answers...',
  'rank': 'Ranking the answers...',
  'judge': 'Judging the answers...'
};

socket.on('processing-started', ({ task, playerTemplate, playerShow } = {}) => {
  processTitle.textContent = UiLang.t(TASK_MESSAGES[task] || 'Reading everyone\'s answers...');
  showSection(processSection);
  applyTemplate(processSection, playerTemplate);
  applyShow(playerShow, { message: processTitle });
});

socket.on('show-results', ({ content, aiResult, image, playerTemplate, playerShow, ownReveal }) => {
  showSection(revealSection);
  // A returned chain carries its own headings ("Someone wrote this for
  // you:"); the generic "The Result:" would sit on top of them.
  var revealHeading = revealSection.querySelector('h1');
  if (revealHeading) revealHeading.hidden = !!ownReveal;
  renderPlayerMessage(aiResultDisplay, content || aiResult);
  applyTemplate(revealSection, playerTemplate);
  applyImage(revealImage, image, playerShow);
  applyShow(playerShow, { content: aiResultDisplay });
});

// Same projector formatting rules as the host (docs/PROJECTOR-STYLE.md),
// scaled for a Chromebook screen: first short line = headline, body
// left-aligned with breaks kept, numbered lists become cards.
// createElement/textContent only — message text is untrusted.
function renderPlayerMessage(el, message) {
  el.textContent = '';
  var text = String(message == null ? '' : message);
  // Embedded {{x.barChart}} text renders as a real bar chart (one fixed
  // layout: label | bar | count) via shared/chart-render.js; the text
  // around it keeps the normal headline+body treatment.
  if (window.ChartRender && ChartRender.containsChart(text)) {
    ChartRender.split(text).forEach(function (seg, i) {
      if (seg.type === 'chart') {
        el.appendChild(ChartRender.buildChart(seg.rows));
      } else if (seg.text.trim()) {
        if (i === 0) appendPlayerParts(el, seg.text.trim());
        else el.appendChild(buildPlayerBody(seg.text.trim()));
      }
    });
    return;
  }
  appendPlayerParts(el, text);
}


// Teacher-authored prompts and instructions show **bold** as bold
// (shared/rich-text.js applyInline: createElement/textContent only, so the
// text stays untrusted-safe). Falls back to plain text without the module.
function setRichText(el, text) {
  if (window.RichText && RichText.applyInline) RichText.applyInline(el, text);
  else el.textContent = text;
  // Word help on: every word in a prompt is a tap away from its meaning.
  // (This used to be the else-branch's partner: with word help OFF the
  // raw "**word**" text overwrote the bold, 2026-09-06 to 2026-09-07.)
  if (window.WordHelp && WordHelp.isEnabled()) WordHelp.wrap(el);
}

function appendPlayerParts(el, text) {
  var parts = text.split(/\n\s*\n/);
  var first = (parts[0] || '').trim();
  if (parts.length > 1 && first.length > 0 && first.length <= 60 && first.indexOf('\n') === -1) {
    var head = document.createElement('span');
    head.className = 'msg-headline';
    // AI first lines can arrive as "# HEADING" or "**HEADING**" — the
    // headline slot is already styled, so markers just get stripped.
    head.textContent = window.RichText ? RichText.plainLine(first) : first;
    el.appendChild(head);
    el.appendChild(buildPlayerBody(parts.slice(1).join('\n\n')));
  } else {
    el.appendChild(buildPlayerBody(text));
  }
}

function buildPlayerBody(text) {
  var lines = text.split('\n');
  var numbered = lines.filter(function (l) { return /^\d+\.\s/.test(l.trim()); });
  if (numbered.length >= 2 && numbered.length >= lines.filter(Boolean).length - 1) {
    var wrap = document.createElement('span');
    wrap.className = 'msg-list';
    lines.forEach(function (line) {
      var m = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (!m) return;
      var card = document.createElement('span');
      card.className = 'msg-card';
      var num = document.createElement('span');
      num.className = 'msg-card-num';
      num.textContent = m[1];
      card.appendChild(num);
      var body = document.createElement('span');
      body.textContent = window.RichText ? RichText.plainLine(m[2]) : m[2];
      card.appendChild(body);
      wrap.appendChild(card);
    });
    return wrap;
  }
  // AI results arrive markdown-flavored (# headings, ** bold, - bullets);
  // shared/rich-text.js structures them instead of showing the markers.
  if (window.RichText && RichText.hasRich(text)) {
    return RichText.buildBody(text, 'msg-body');
  }
  var span = document.createElement('span');
  span.className = text.indexOf('\n') !== -1 || text.length > 90 ? 'msg-body' : 'msg-solo';
  span.textContent = text;
  return span;
}

socket.on('announce', ({ message, image, displayDrawing, timer, playerTemplate, playerShow }) => {
  showSection(announceSection);
  renderPlayerMessage(announceMessage, message);
  applyTemplate(announceSection, playerTemplate);
  applyImage(announceImage, image, playerShow);
  applyDisplayDrawing(announceDrawingCanvas, displayDrawing);
  applyShow(playerShow, {
    message: announceMessage,
    timer: announceTimerDisplay
  });
  if (timer) {
    startTimer(timer, announceTimerDisplay, () => {
      // Timer auto-advances on server side
    });
  }
});

// --- Socket events - Leaderboard ---

socket.on('leaderboard', ({ standings, allStandings, teamStandings, myTeam, style, timer, playerTemplate, show }) => {
  showSection(leaderboardSection);
  applyTemplate(leaderboardSection, playerTemplate);
  applyShow(show, {
    rank: leaderboardRank,
    standings: leaderboardStandings
  });

  // Find current player in standings
  var myStanding = (allStandings || standings || []).find(function(s) { return s.playerId === socket.id; });
  var myTeamStanding = (teamStandings || []).find(function(t) { return t.team === myTeam; });
  if (myTeamStanding) {
    // Team competition: lead with the team result, own contribution below.
    // Default team names already read "Team 1", so only add the word for
    // custom names that lack it ("Team Team 1" looked broken on the wall).
    var myTeamLabel = /^team\b/i.test(String(myTeamStanding.team))
      ? myTeamStanding.team : 'Team ' + myTeamStanding.team;
    leaderboardRank.textContent = '#' + myTeamStanding.rank + '. ' + myTeamLabel;
    leaderboardScore.textContent = myTeamStanding.score + ' team points' +
      (myStanding ? ' (' + myStanding.score + ' from you)' : '');
    // The whole winning team celebrates on their own devices.
    if (myTeamStanding.rank === 1 && J) J.confetti({ count: 60 });
  } else if (myStanding) {
    leaderboardRank.textContent = '#' + myStanding.rank + '. ' + myStanding.name;
    leaderboardScore.textContent = myStanding.score + ' points';
    // First place gets a personal celebration on their own device.
    if (myStanding.rank === 1 && J) J.confetti({ count: 60 });
  } else {
    leaderboardRank.textContent = '';
    leaderboardScore.textContent = '';
  }

  leaderboardStandings.innerHTML = '';
  if (teamStandings && teamStandings.length > 0) {
    // Team standings list; the student's own team gets the highlight.
    for (var ti = 0; ti < teamStandings.length; ti++) {
      var t = teamStandings[ti];
      var tp = document.createElement('p');
      tp.textContent = t.rank + '. ' + t.team + ': ' + t.score + ' points';
      if (t.team === myTeam) {
        tp.className = 'leaderboard-highlight';
      }
      leaderboardStandings.appendChild(tp);
    }
  } else {
    // Render standings list \u2014 medal/number based on rank so tied players
    // share the same medal (two tied for 1st \u2192 both gold; no silver).
    var list = allStandings || standings || [];
    for (var i = 0; i < list.length; i++) {
      var p = document.createElement('p');
      var r = list[i].rank;
      var prefix = r + '. ';
      p.textContent = prefix + list[i].name + ': ' + list[i].score + ' points';
      if (list[i].playerId === socket.id) {
        p.className = 'leaderboard-highlight';
      }
      leaderboardStandings.appendChild(p);
    }
  }
});

// --- Socket events - Reveal-one ---

socket.on('reveal-one-start', ({ message, total, revealed, timer, playerTemplate, show }) => {
  showSection(revealOneSection);
  applyTemplate(revealOneSection, playerTemplate);
  applyShow(show, {
    message: revealOneMessage,
    items: revealOneItems
  });
  setRichText(revealOneMessage, message || 'Revealing...');
  revealOneItems.innerHTML = '';

  // If reconnecting, revealed items come as array
  if (revealed && Array.isArray(revealed)) {
    for (var i = 0; i < revealed.length; i++) {
      appendRevealOneItem(revealed[i]);
    }
  }
});

socket.on('reveal-one-item', ({ item }) => {
  appendRevealOneItem(item);
});

socket.on('reveal-one-complete', () => {
  // No action needed on player
});

function appendRevealOneItem(item) {
  var div = document.createElement('div');
  div.className = 'reveal-one-item';
  // Drawing items paint onto a canvas (animated stroke replay); everything
  // else stays text.
  if (item && typeof item === 'object' && item.drawing && window.Draw) {
    var caption = document.createElement('p');
    caption.className = 'reveal-drawing-caption';
    caption.textContent = item.text || '';
    var canvas = document.createElement('canvas');
    canvas.className = 'reveal-drawing';
    canvas.width = 300;
    canvas.height = 225;
    div.appendChild(caption);
    div.appendChild(canvas);
    Draw.renderStrokes(canvas, item.drawing, { animate: true });
  } else {
    div.textContent = typeof item === 'string' ? item : (item.text || item.name || JSON.stringify(item));
  }
  revealOneItems.appendChild(div);
}

// --- Socket events - Team-split ---

// Choice mode: tap the team you want; switching allowed until close.
function renderTeamPick(payload) {
  var rosters = payload.rosters || [];
  var yourTeam = payload.yourTeam || null;
  showSection(teamSplitSection);
  teamPick.hidden = false;
  teamSplitAllTeams.innerHTML = '';
  teamSplitMyTeam.textContent = yourTeam ? 'You’re in ' + yourTeam + '!' : 'Pick your team!';

  teamPickOptions.innerHTML = '';
  for (var i = 0; i < rosters.length; i++) {
    (function (r) {
      var card = document.createElement('button');
      card.className = 'team-pick-option' + (r.name === yourTeam ? ' team-pick-mine' : '');
      var full = r.open === 0 && r.name !== yourTeam;
      card.disabled = full;

      var title = document.createElement('span');
      title.className = 'team-pick-title';
      // open == null means no caps (capacity:"open") — just show the name
      title.textContent = r.open == null ? r.name
        : r.name + '. ' + (full ? 'full' : r.open + (r.open === 1 ? ' spot left' : ' spots left'));
      card.appendChild(title);

      if (r.members.length > 0) {
        var names = document.createElement('span');
        names.className = 'team-pick-names';
        names.textContent = r.members.map(function (m) { return m.name; }).join(', ');
        card.appendChild(names);
      }

      card.addEventListener('click', function () {
        if (r.name === yourTeam) return;
        socket.emit('team-pick', { code: currentRoomCode, team: r.name });
        if (J) J.sound('blip');
      });
      teamPickOptions.appendChild(card);
    })(rosters[i]);
  }
}

socket.on('team-choice-start', renderTeamPick);
socket.on('team-choice-update', function (payload) {
  // Only players get yourTeam in their payload; ignore host-shaped extras
  if (teamSplitSection) renderTeamPick(payload);
});

// --- Socket events - Team roles (reuses the team-split section) ---

// Choice mode: tap the role you want in your group; switching allowed
// until close. Payload: { groupLabel, yourRole, roles: [{name, takenBy, open}] }
function renderRolePick(payload) {
  var roles = payload.roles || [];
  var yourRole = payload.yourRole || null;
  showSection(teamSplitSection);
  teamPick.hidden = false;
  teamSplitAllTeams.innerHTML = '';
  teamSplitMyTeam.textContent = yourRole
    ? 'You are the ' + yourRole + '!'
    : 'Pick your role' + (payload.groupLabel ? ' (' + payload.groupLabel + ')' : '') + '!';

  teamPickOptions.innerHTML = '';
  for (var i = 0; i < roles.length; i++) {
    (function (r) {
      var card = document.createElement('button');
      card.className = 'team-pick-option' + (r.name === yourRole ? ' team-pick-mine' : '');
      var full = r.open === 0 && r.name !== yourRole;
      card.disabled = full;

      var title = document.createElement('span');
      title.className = 'team-pick-title';
      title.textContent = full ? r.name + '. taken' : r.name;
      card.appendChild(title);

      if (r.takenBy && r.takenBy.length > 0) {
        var names = document.createElement('span');
        names.className = 'team-pick-names';
        names.textContent = r.takenBy.join(', ');
        card.appendChild(names);
      }

      card.addEventListener('click', function () {
        if (r.name === yourRole) return;
        socket.emit('role-pick', { code: currentRoomCode, role: r.name });
        if (J) J.sound('blip');
      });
      teamPickOptions.appendChild(card);
    })(roles[i]);
  }
}

socket.on('team-roles-start', renderRolePick);
socket.on('team-roles-update', function (payload) {
  if (teamSplitSection) renderRolePick(payload);
});

// Final deal (either method): the "You are the ..." card.
socket.on('team-roles-final', function (payload) {
  showSection(teamSplitSection);
  teamPick.hidden = true;
  applyTemplate(teamSplitSection, payload.playerTemplate);
  teamSplitAllTeams.innerHTML = '';
  teamSplitMyTeam.textContent = payload.myRole
    ? 'You are the ' + payload.myRole + '!' + (payload.groupLabel ? ' (' + payload.groupLabel + ')' : '')
    : 'The roles are set!';
});

// Hand out choices (assign, 2026-09-16): the choice your group (or you) got.
socket.on('assign-final', function (payload) {
  showSection(teamSplitSection);
  teamPick.hidden = true;
  applyTemplate(teamSplitSection, payload.playerTemplate);
  teamSplitAllTeams.innerHTML = '';
  if (payload.mine) {
    var lead = payload.perGroup === false ? UiLang.t('You got:') : UiLang.t('Your group got:');
    teamSplitMyTeam.textContent = lead + ' ' + payload.mine;
    var sub = null;
    if (payload.choiceRank === 1) sub = UiLang.t('1st choice');
    else if (payload.choiceRank === 2) sub = UiLang.t('2nd choice');
    else if (payload.choiceRank === 3) sub = UiLang.t('3rd choice');
    else if (typeof payload.choiceRank === 'number' && payload.choiceRank >= 4) sub = UiLang.t('Choice number') + ' ' + payload.choiceRank;
    if (sub || payload.groupLabel) {
      var p = document.createElement('p');
      p.className = 'assign-sub';
      p.textContent = [payload.groupLabel, sub].filter(Boolean).join(' · ');
      teamSplitAllTeams.appendChild(p);
    }
  } else {
    teamSplitMyTeam.textContent = UiLang.t('The choices are handed out.');
  }
});

socket.on('team-split', ({ myTeam, teams, playerTemplate, show }) => {
  showSection(teamSplitSection);
  teamPick.hidden = true;
  applyTemplate(teamSplitSection, playerTemplate);
  applyShow(show, {
    team: teamSplitMyTeam,
    allTeams: teamSplitAllTeams
  });

  teamSplitMyTeam.textContent = myTeam ? 'You are on ' + myTeam + '!' : 'No team assigned';

  teamSplitAllTeams.innerHTML = '';
  for (var teamName in teams) {
    var card = document.createElement('div');
    card.className = 'team-card';
    var h3 = document.createElement('h3');
    h3.textContent = teamName;
    card.appendChild(h3);
    for (var i = 0; i < teams[teamName].length; i++) {
      var p = document.createElement('p');
      p.textContent = teams[teamName][i].name;
      if (teams[teamName][i].playerId === socket.id) {
        p.className = 'team-highlight';
      }
      card.appendChild(p);
    }
    teamSplitAllTeams.appendChild(card);
  }
});

// --- Socket events - Rank ---

var rankCurrentOrder = [];

socket.on('rank-start', ({ prompt, candidates, timer, playerTemplate, show }) => {
  showSection(rankSection);
  setRichText(rankPromptDisplay, prompt || 'Rank the items');
  rankSubmitBtn.disabled = false;
  applyTemplate(rankSection, playerTemplate);
  applyShow(show, {
    prompt: rankPromptDisplay,
    items: rankItems,
    timer: rankTimerDisplay,
    submitButton: rankSubmitBtn
  });

  rankCurrentOrder = Array.isArray(candidates) ? candidates.slice() : [];
  renderRankItems();

  if (timer) {
    startTimer(timer, rankTimerDisplay, function() {
      socket.emit('rank-submit', { code: currentRoomCode, ranking: rankCurrentOrder });
      rankSubmitBtn.disabled = true;
      showSection(submittedSection);
    });
  }
});

rankSubmitBtn.addEventListener('click', function() {
  socket.emit('rank-submit', { code: currentRoomCode, ranking: rankCurrentOrder });
  rankSubmitBtn.disabled = true;
  showSection(submittedSection);
});

// --- Socket events - One Voice (Connection Pack: cooperative counting) ---

var oneVoiceLockout = null;

function setOneVoiceNext(count) {
  oneVoiceTapBtn.textContent = count + 1;
}

socket.on('one-voice-start', ({ count, playerTemplate }) => {
  showSection(oneVoiceSection);
  oneVoiceTapBtn.disabled = false;
  oneVoiceStatus.textContent = '';
  setOneVoiceNext(count || 0);
  applyTemplate(oneVoiceSection, playerTemplate);
});

oneVoiceTapBtn.addEventListener('click', function() {
  socket.emit('one-voice-tap', { code: currentRoomCode });
  // Tiny client-side debounce against double-taps; the server is the
  // real referee (same-player-twice is rejected there).
  oneVoiceTapBtn.disabled = true;
  setTimeout(function() {
    if (!oneVoiceLockout) oneVoiceTapBtn.disabled = false;
  }, 250);
});

socket.on('one-voice-count', ({ count }) => {
  setOneVoiceNext(count);
});

// Subtle personal confirmation — only the tapper sees it (attribution
// invites blame, so it's never broadcast).
socket.on('one-voice-you', ({ number }) => {
  oneVoiceStatus.textContent = 'You said ' + number + '.';
});

socket.on('one-voice-reset', ({ lockoutMs, final, bestRun, target }) => {
  setOneVoiceNext(0);
  oneVoiceStatus.textContent = final
    ? 'That was our last try, best run: ' + bestRun + ' of ' + target + '. Look up!'
    : 'Two voices! Back to one…';
  oneVoiceTapBtn.disabled = true;
  if (oneVoiceLockout) clearTimeout(oneVoiceLockout);
  oneVoiceLockout = setTimeout(function() {
    oneVoiceLockout = null;
    if (!final) {
      oneVoiceTapBtn.disabled = false;
      oneVoiceStatus.textContent = '';
    }
  }, lockoutMs || 800);
});

socket.on('one-voice-reject', ({ reason }) => {
  if (reason === 'same-player') {
    oneVoiceStatus.textContent = 'You just went, let someone else take this one.';
    oneVoiceTapBtn.disabled = false;
  }
  // 'lockout' and 'finished' need no message — the screen already shows why.
});

socket.on('one-voice-success', ({ target, attempt }) => {
  oneVoiceTapBtn.disabled = true;
  oneVoiceStatus.textContent = 'WE DID IT! ' + target + ', as one voice. (Attempt ' + attempt + ')';
  // Everyone won this together — confetti on every device, but no sound
  // (the room's shared voice on the host speakers is the soundtrack).
  if (J) J.confetti({ count: 60 });
});

// --- Socket events - Buzz (first-tap-wins buzzer rounds) ---

const buzzSection = document.getElementById('buzz-section');
const buzzPlayerPrompt = document.getElementById('buzz-player-prompt');
const buzzTapBtn = document.getElementById('buzz-tap-btn');
const buzzPlayerStatus = document.getElementById('buzz-player-status');

socket.on('buzz-start', ({ prompt, playerTemplate, show }) => {
  showSection(buzzSection);
  setRichText(buzzPlayerPrompt, prompt || 'Listen for the question!');
  buzzTapBtn.disabled = false;
  buzzPlayerStatus.textContent = '';
  applyTemplate(buzzSection, playerTemplate);
  applyShow(show, {
    prompt: buzzPlayerPrompt,
    button: buzzTapBtn,
    status: buzzPlayerStatus
  });
});

buzzTapBtn.addEventListener('click', function () {
  socket.emit('buzz-tap', { code: currentRoomCode });
  // Tiny debounce against double-taps; the server is the real referee.
  buzzTapBtn.disabled = true;
  setTimeout(function () {
    // Re-enabled by buzz-open / buzz-result events when appropriate;
    // this only covers the no-reply case (e.g. packet loss).
    if (buzzPlayerStatus.textContent === '') buzzTapBtn.disabled = false;
  }, 400);
});

socket.on('buzz-locked', ({ playerId, playerName }) => {
  buzzTapBtn.disabled = true;
  if (playerId === socket.id) {
    buzzPlayerStatus.textContent = 'You buzzed first, answer out loud!';
    if (J) J.sound('tada');
  } else {
    buzzPlayerStatus.textContent = playerName + ' buzzed first.';
  }
});

socket.on('buzz-reject', ({ reason }) => {
  buzzTapBtn.disabled = true;
  buzzPlayerStatus.textContent = reason === 'locked-out'
    ? 'Locked out until the next question.'
    : 'Too late, someone beat you to it!';
});

socket.on('buzz-result', ({ correct, playerId, playerName, points }) => {
  if (correct) {
    buzzTapBtn.disabled = true;
    if (playerId === socket.id) {
      buzzPlayerStatus.textContent = '✓ Correct! +' + points + ' points!';
      if (J) J.confetti({ count: 50 });
    } else {
      buzzPlayerStatus.textContent = '✓ ' + playerName + ' got it!';
    }
  } else {
    // Wrong answer — buzzer reopens for everyone but the locked-out player
    if (playerId === socket.id) {
      buzzPlayerStatus.textContent = '✗ Not this time, locked out until the next question.';
      if (J) J.sound('womp');
      buzzTapBtn.disabled = true;
    } else {
      buzzPlayerStatus.textContent = 'Buzzer reopened, go!';
      buzzTapBtn.disabled = false;
    }
  }
});

socket.on('buzz-open', () => {
  buzzTapBtn.disabled = false;
  buzzPlayerStatus.textContent = '';
});

// --- Socket events - Estimate (numeric guessing) ---

const estimateSection = document.getElementById('estimate-section');
const estimatePlayerPrompt = document.getElementById('estimate-player-prompt');
const estimateImage = document.getElementById('estimate-image');
const estimateTimerDisplay = document.getElementById('estimate-timer-display');
const estimateInput = document.getElementById('estimate-input');
const estimateUnit = document.getElementById('estimate-unit');
const estimateSubmitBtn = document.getElementById('estimate-submit-btn');
const estimatePlayerStatus = document.getElementById('estimate-player-status');
const estimatePlayerResults = document.getElementById('estimate-player-results');
const estimateScale = document.getElementById('estimate-scale');
const estimateSlider = document.getElementById('estimate-slider');
const estimateInputRow = document.getElementById('estimate-input-row');

// A known range gets a picker instead of a bare number box ("On a scale
// of 1 to 10" showed a typed number with no bounds, owner 2026-09-12):
// up to twelve whole numbers are a row to tap, a longer range is a
// slider with the number as its readout, anything open stays typed. The
// range comes from the server (the step's min/max, or its own wording).
var ESTIMATE_SCALE_MAX_STEPS = 12;

function markScalePick(val) {
  var picks = estimateScale.querySelectorAll('.scale-pick');
  for (var i = 0; i < picks.length; i++) {
    picks[i].classList.toggle('is-picked', picks[i].textContent === String(val));
  }
}

function renderEstimatePicker(min, max) {
  estimateScale.innerHTML = '';
  estimateScale.hidden = true;
  estimateSlider.hidden = true;
  estimateSlider.disabled = false;
  estimateInputRow.hidden = false;
  var hasRange = typeof min === 'number' && typeof max === 'number' && max > min;
  if (!hasRange) return;
  var span = max - min;
  var whole = Number.isInteger(min) && Number.isInteger(max);
  if (whole && span < ESTIMATE_SCALE_MAX_STEPS) {
    for (var v = min; v <= max; v++) {
      (function (val) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'scale-pick';
        b.textContent = String(val);
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          estimateInput.value = String(val);
          markScalePick(val);
          var picks = estimateScale.querySelectorAll('.scale-pick');
          for (var i = 0; i < picks.length; i++) picks[i].setAttribute('aria-pressed', picks[i] === b ? 'true' : 'false');
        });
        estimateScale.appendChild(b);
      })(v);
    }
    estimateScale.hidden = false;
    estimateInputRow.hidden = true;
    return;
  }
  if (span <= 1000) {
    estimateSlider.min = String(min);
    estimateSlider.max = String(max);
    estimateSlider.step = whole ? '1' : 'any';
    estimateSlider.value = String(whole ? min + Math.round(span / 2) : min + span / 2);
    estimateInput.value = estimateSlider.value;
    estimateSlider.hidden = false;
  }
}

function setEstimatePickerDisabled(flag) {
  var picks = estimateScale.querySelectorAll('.scale-pick');
  for (var i = 0; i < picks.length; i++) picks[i].disabled = flag;
  estimateSlider.disabled = flag;
}

// The slider moves the number; typing moves the slider
estimateSlider.addEventListener('input', function () { estimateInput.value = estimateSlider.value; });
estimateInput.addEventListener('input', function () {
  if (!estimateSlider.hidden && estimateInput.value !== '') estimateSlider.value = estimateInput.value;
});

function submitEstimate() {
  var v = parseFloat(estimateInput.value);
  if (!isFinite(v)) {
    estimatePlayerStatus.textContent = 'Type a number first.';
    return false;
  }
  // Inside the range, when there is one (the server clamps too)
  var lo = estimateInput.min !== '' ? parseFloat(estimateInput.min) : NaN;
  var hi = estimateInput.max !== '' ? parseFloat(estimateInput.max) : NaN;
  if (isFinite(lo) && v < lo) v = lo;
  if (isFinite(hi) && v > hi) v = hi;
  estimateInput.value = String(v);
  socket.emit('estimate-submit', { code: currentRoomCode, value: v });
  estimatePlayerStatus.textContent =
    'Got it, you guessed ' + v + '. You can change it until the teacher reveals.';
  if (J) J.sound('blip');
  return true;
}

socket.on('estimate-start', ({ prompt, unit, image, min, max, timer, playerTemplate, show }) => {
  showSection(estimateSection);
  setRichText(estimatePlayerPrompt, prompt || 'Guess the number!');
  applyImage(estimateImage, image, show);
  estimateUnit.textContent = unit || '';
  estimateInput.value = '';
  estimateInput.disabled = false;
  if (min != null) estimateInput.min = min; else estimateInput.removeAttribute('min');
  if (max != null) estimateInput.max = max; else estimateInput.removeAttribute('max');
  renderEstimatePicker(min, max);
  estimateSubmitBtn.disabled = false;
  estimatePlayerStatus.textContent = '';
  estimatePlayerResults.hidden = true;
  estimatePlayerResults.innerHTML = '';
  applyTemplate(estimateSection, playerTemplate);
  applyShow(show, {
    prompt: estimatePlayerPrompt,
    input: estimateInput,
    timer: estimateTimerDisplay,
    submitButton: estimateSubmitBtn
  });
  if (timer) {
    startTimer(timer, estimateTimerDisplay, function () {
      // Auto-submit whatever is typed; the host closes server-side.
      submitEstimate();
      estimateInput.disabled = true;
      estimateSubmitBtn.disabled = true;
      setEstimatePickerDisabled(true);
    });
  }
});

estimateSubmitBtn.addEventListener('click', submitEstimate);

socket.on('estimate-results', ({ answer, unit, stats, guesses }) => {
  showSection(estimateSection);
  clearTimer();
  estimateTimerDisplay.hidden = true;
  estimateInput.disabled = true;
  estimateSubmitBtn.disabled = true;
  setEstimatePickerDisabled(true);
  estimatePlayerStatus.textContent = '';

  var mine = (guesses || []).find(function (g) { return g.playerId === socket.id; });
  var html = '';
  if (answer != null) {
    html += '<div class="estimate-answer">The answer: <strong>' + escapeHtml(answer) +
            (unit ? ' ' + escapeHtml(unit) : '') + '</strong></div>';
  }
  if (mine) {
    html += '<p>You guessed <strong>' + escapeHtml(mine.value) + '</strong>' +
            (mine.score > 0 ? ', +' + mine.score + ' points!' : '') + '</p>';
    if (mine.score > 0 && J) J.confetti({ count: 40 });
  }
  if (stats && stats.count > 0) {
    html += '<p class="estimate-stats">Class average: ' + Math.round(stats.average * 100) / 100 +
            (stats.median != null ? ' · median: ' + stats.median : '') + '</p>';
  }
  estimatePlayerResults.innerHTML = html;
  estimatePlayerResults.hidden = false;
});

// --- Socket events - Match (pair two lists: vocab ↔ definitions) ---

var matchLeftItems = [];
var matchRightOrder = [];

socket.on('match-start', ({ prompt, leftItems, rightItems, timer, playerTemplate, show }) => {
  showSection(matchSection);
  setRichText(matchPromptDisplay, prompt || 'Match the pairs!');
  matchSubmitBtn.disabled = false;
  matchSubmitBtn.hidden = false;
  matchHint.hidden = false;
  matchPlayerResults.hidden = true;
  matchPlayerResults.innerHTML = '';
  matchRows.hidden = false;
  applyTemplate(matchSection, playerTemplate);
  applyShow(show, {
    prompt: matchPromptDisplay,
    items: matchRows,
    timer: matchTimerDisplay,
    submitButton: matchSubmitBtn
  });
  matchLeftItems = Array.isArray(leftItems) ? leftItems.slice() : [];
  matchRightOrder = Array.isArray(rightItems) ? rightItems.slice() : [];
  renderMatchRows();
  if (timer) {
    startTimer(timer, matchTimerDisplay, function() {
      // Auto-submit the current arrangement; partial credit beats nothing.
      if (!matchSubmitBtn.disabled) matchSubmitBtn.click();
    });
  }
});

matchSubmitBtn.addEventListener('click', function() {
  socket.emit('match-submit', { code: currentRoomCode, matching: matchRightOrder });
  matchSubmitBtn.disabled = true;
  if (J) J.sound('blip');
});

socket.on('match-results', function(payload) {
  showSection(matchSection);
  clearTimer();
  matchTimerDisplay.hidden = true;
  matchSubmitBtn.disabled = true;
  matchSubmitBtn.hidden = true;
  matchHint.hidden = true;
  matchRows.hidden = true;

  var pairs = payload.pairs || [];
  var pairCount = payload.pairCount || pairs.length;
  var mine = (payload.players || []).find(function(p) { return p.playerId === socket.id; });

  matchPlayerResults.innerHTML = '';
  if (mine) {
    var myLine = document.createElement('p');
    myLine.className = 'match-my-score';
    myLine.textContent = 'You matched ' + mine.correct + ' of ' + pairCount +
      (mine.score > 0 ? ', +' + mine.score + ' points!' : '');
    matchPlayerResults.appendChild(myLine);
    // Own-moment juice only: a perfect board earns confetti.
    if (mine.correct === pairCount && pairCount > 0 && J) J.confetti({ count: 40 });
  }
  var list = document.createElement('div');
  list.className = 'match-answer-list';
  for (var i = 0; i < pairs.length; i++) {
    var row = document.createElement('p');
    row.textContent = pairs[i].left + ' → ' + pairs[i].right;
    list.appendChild(row);
  }
  matchPlayerResults.appendChild(list);
  matchPlayerResults.hidden = false;
});

// --- Socket events - Sort (place items into named buckets) ---

var sortItemTexts = [];
var sortBucketNames = [];
var sortChoices = []; // chosen bucket per item (null until tapped)

function renderSortItems() {
  sortItemsEl.innerHTML = '';
  for (var i = 0; i < sortItemTexts.length; i++) {
    (function (index) {
      var card = document.createElement('div');
      card.className = 'sort-item';

      var label = document.createElement('p');
      label.className = 'sort-item-text';
      label.textContent = sortItemTexts[index];
      card.appendChild(label);

      var row = document.createElement('div');
      row.className = 'sort-bucket-row';
      for (var b = 0; b < sortBucketNames.length; b++) {
        (function (bucket) {
          var btn = document.createElement('button');
          btn.className = 'sort-bucket-btn' + (sortChoices[index] === bucket ? ' sort-bucket-chosen' : '');
          btn.textContent = bucket;
          btn.addEventListener('click', function () {
            sortChoices[index] = bucket;
            renderSortItems();
            if (J) J.sound('blip');
          });
          row.appendChild(btn);
        })(sortBucketNames[b]);
      }
      card.appendChild(row);
      sortItemsEl.appendChild(card);
    })(i);
  }
  var allChosen = sortChoices.length > 0 && sortChoices.every(function (c) { return !!c; });
  sortSubmitBtn.disabled = !allChosen;
}

function submitSorting() {
  socket.emit('sort-submit', { code: currentRoomCode, sorting: sortChoices });
  sortSubmitBtn.disabled = true;
}

socket.on('sort-start', ({ prompt, buckets, items, timer, playerTemplate, show }) => {
  showSection(sortSection);
  setRichText(sortPromptDisplay, prompt || 'Sort the items!');
  sortSubmitBtn.hidden = false;
  sortHint.hidden = false;
  sortItemsEl.hidden = false;
  sortPlayerResults.hidden = true;
  sortPlayerResults.innerHTML = '';
  applyTemplate(sortSection, playerTemplate);
  applyShow(show, {
    prompt: sortPromptDisplay,
    items: sortItemsEl,
    timer: sortTimerDisplay,
    submitButton: sortSubmitBtn
  });
  sortItemTexts = Array.isArray(items) ? items.slice() : [];
  sortBucketNames = Array.isArray(buckets) ? buckets.slice() : [];
  sortChoices = sortItemTexts.map(function () { return null; });
  renderSortItems();
  if (timer) {
    startTimer(timer, sortTimerDisplay, function () {
      // Auto-submit whatever is placed; partial credit beats nothing.
      submitSorting();
    });
  }
});

sortSubmitBtn.addEventListener('click', function () {
  submitSorting();
  if (J) J.sound('blip');
});

socket.on('sort-results', function (payload) {
  showSection(sortSection);
  clearTimer();
  sortTimerDisplay.hidden = true;
  sortSubmitBtn.disabled = true;
  sortSubmitBtn.hidden = true;
  sortHint.hidden = true;
  sortItemsEl.hidden = true;

  var results = payload.results || [];
  var mine = (payload.players || []).find(function (p) { return p.playerId === socket.id; });

  sortPlayerResults.innerHTML = '';
  if (payload.graded && mine) {
    var myLine = document.createElement('p');
    myLine.className = 'match-my-score';
    myLine.textContent = 'You got ' + mine.correct + ' of ' + (payload.itemCount || results.length) +
      (mine.score > 0 ? ', +' + mine.score + ' points!' : '');
    sortPlayerResults.appendChild(myLine);
    // Own-moment juice only: a perfect sort earns confetti.
    if (mine.correct === (payload.itemCount || results.length) && results.length > 0 && J) J.confetti({ count: 40 });
  }
  var list = document.createElement('div');
  list.className = 'match-answer-list';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var row = document.createElement('p');
    if (r.correct) {
      row.textContent = r.text + ' → ' + r.correct;
    } else {
      // Consensus poll: show how the class voted
      var top = Object.keys(r.counts || {}).sort(function (a, b) { return r.counts[b] - r.counts[a]; })[0];
      row.textContent = r.text + ' → ' + (top || '?') + ' (' + ((r.counts || {})[top] || 0) + ' of ' + r.total + ')';
    }
    list.appendChild(row);
  }
  sortPlayerResults.appendChild(list);
  sortPlayerResults.hidden = false;
});

// --- Socket events - Checklist (shared group to-do list) ---

var checklistItemTexts = [];
var checklistChecked = []; // per item: null or {playerId, name}
var checklistItemRoles = []; // per item: null or role name (rolesFrom)
var checklistYourRole = null;

function renderChecklistItems() {
  checklistItemsEl.innerHTML = '';
  for (var i = 0; i < checklistItemTexts.length; i++) {
    (function (index) {
      var done = !!checklistChecked[index];
      var itemRole = checklistItemRoles[index] || null;
      var yours = itemRole && checklistYourRole && itemRole === checklistYourRole;
      var row = document.createElement('button');
      row.className = 'checklist-item' + (done ? ' checklist-item-done' : '') +
        (yours ? ' checklist-item-yours' : '');

      var box = document.createElement('span');
      box.className = 'checklist-box';
      box.textContent = done ? '✓' : '';
      row.appendChild(box);

      var text = document.createElement('span');
      text.className = 'checklist-item-text';
      text.textContent = checklistItemTexts[index];
      row.appendChild(text);

      // Role tag: whose job this is; "your job" when it's the viewer's role.
      if (itemRole) {
        var roleTag = document.createElement('span');
        roleTag.className = 'checklist-item-role' + (yours ? ' checklist-item-role-yours' : '');
        roleTag.textContent = yours ? itemRole + ' · your job' : itemRole;
        row.appendChild(roleTag);
      }

      if (done && checklistChecked[index].name) {
        var by = document.createElement('span');
        by.className = 'checklist-item-by';
        by.textContent = checklistChecked[index].name;
        row.appendChild(by);
      }

      row.addEventListener('click', function () {
        socket.emit('check-item', { code: currentRoomCode, index: index, checked: !done });
        if (J) J.sound('blip');
      });
      checklistItemsEl.appendChild(row);
    })(i);
  }
}

socket.on('checklist-start', ({ prompt, items, itemRoles, yourRole, group, timer, playerTemplate, show }) => {
  showSection(checklistSection);
  setRichText(checklistPromptDisplay, prompt || 'Work through today\'s tasks!');
  checklistItemsEl.hidden = false;
  checklistPlayerResults.hidden = true;
  checklistPlayerResults.innerHTML = '';
  applyTemplate(checklistSection, playerTemplate);
  applyShow(show, {
    prompt: checklistPromptDisplay,
    items: checklistItemsEl,
    timer: checklistTimerDisplay
  });

  checklistItemTexts = Array.isArray(items) ? items.slice() : [];
  checklistItemRoles = Array.isArray(itemRoles) ? itemRoles.slice() : [];
  checklistYourRole = yourRole || null;
  checklistChecked = (group && Array.isArray(group.checked))
    ? group.checked.slice()
    : checklistItemTexts.map(function () { return null; });
  if (group && group.label) {
    checklistGroupLabel.textContent = 'Your group: ' + group.label;
    checklistGroupLabel.hidden = false;
  } else {
    checklistGroupLabel.hidden = true;
  }
  renderChecklistItems();

  if (timer) {
    startTimer(timer, checklistTimerDisplay, function () {
      // Server closes the phase when its own timer fires; nothing to submit.
    });
  }
});

socket.on('checklist-update', function (payload) {
  if (!payload || !payload.group) return; // host-shaped payloads carry progress instead
  if (checklistSection.hidden) return;
  var wasDone = checklistChecked.filter(Boolean).length;
  checklistChecked = Array.isArray(payload.group.checked) ? payload.group.checked.slice() : checklistChecked;
  renderChecklistItems();
  // Own-group finish moment: every item just got checked
  var nowDone = checklistChecked.filter(Boolean).length;
  if (J && nowDone === checklistItemTexts.length && checklistItemTexts.length > 0 && wasDone < nowDone) {
    J.confetti({ count: 40 });
  }
});

socket.on('checklist-results', function (payload) {
  showSection(checklistSection);
  clearTimer();
  checklistTimerDisplay.hidden = true;
  checklistItemsEl.hidden = true;
  checklistGroupLabel.hidden = true;

  var mineDone = checklistChecked.filter(Boolean).length;
  checklistPlayerResults.innerHTML = '';
  var myLine = document.createElement('p');
  myLine.className = 'match-my-score';
  myLine.textContent = checklistItemTexts.length > 0
    ? (mineDone >= checklistItemTexts.length
        ? 'All ' + checklistItemTexts.length + ' tasks done, nice work!'
        : 'Your list: ' + mineDone + ' of ' + checklistItemTexts.length + ' done')
    : 'Work time is over!';
  checklistPlayerResults.appendChild(myLine);

  var list = document.createElement('div');
  list.className = 'match-answer-list';
  for (var i = 0; i < (payload.results || []).length; i++) {
    var r = payload.results[i];
    var row = document.createElement('p');
    row.textContent = r.team + ': ' + r.checked + '/' + r.total + (r.done ? ' ✓' : '');
    list.appendChild(row);
  }
  checklistPlayerResults.appendChild(list);
  checklistPlayerResults.hidden = false;
});

// --- Socket events - Merge (Connection Pack: think-pair-share) ---

var mergeDraftDebounce = null;

// The pen: one group member writes at a time. Writing claims it, agreeing
// releases it, and after the holder idles this long the "Take the pen"
// button lights up (the server enforces the same window, so an early tap
// just gets the truth back).
var MERGE_PEN_IDLE_MS = 2500;
var mergePenBtn = document.getElementById('merge-pen-btn');
var mergePenHeld = false;
var mergePenMine = false;
var mergePenHolderName = '';
var mergePenIdleTimer = null;

function applyMergePen() {
  if (mergePenIdleTimer) {
    clearTimeout(mergePenIdleTimer);
    mergePenIdleTimer = null;
  }
  if (mergePenHeld && !mergePenMine) {
    mergeDraftInput.readOnly = true;
    mergeDraftInput.classList.add('merge-locked');
    mergePenBtn.hidden = false;
    mergePenBtn.disabled = true;
    mergePenBtn.textContent = (mergePenHolderName || 'Your partner') + ' is writing…';
    mergePenIdleTimer = setTimeout(function () {
      mergePenBtn.disabled = false;
      mergePenBtn.textContent = UiLang.t('Take the pen');
    }, MERGE_PEN_IDLE_MS);
  } else {
    mergeDraftInput.readOnly = false;
    mergeDraftInput.classList.remove('merge-locked');
    mergePenBtn.hidden = true;
  }
}

mergePenBtn.addEventListener('click', function () {
  mergePenBtn.disabled = true;
  socket.emit('merge-take-pen', { code: currentRoomCode });
});

socket.on('merge-pen', function ({ held, mine, holderName }) {
  var gained = held && mine && !mergePenMine;
  mergePenHeld = !!held;
  mergePenMine = !!mine;
  mergePenHolderName = holderName || '';
  applyMergePen();
  if (gained) {
    mergeDraftInput.focus();
    setMergeStatus('');
  } else if (mergePenHeld && !mergePenMine) {
    setMergeStatus(mergePenHolderName + ' has the pen. Talk it out, or take it when they pause.');
  } else if (!mergePenHeld) {
    setMergeStatus('');
  }
});

function setMergeStatus(text) {
  if (!text) {
    mergeStatus.hidden = true;
    mergeStatus.textContent = '';
  } else {
    mergeStatus.hidden = false;
    mergeStatus.textContent = text;
  }
}

socket.on('merge-start', ({ instruction, seeds, draft, memberNames, agreeMode, agreedCount, agreesNeeded, penHeld, penMine, penHolderName, timer, playerTemplate, show }) => {
  showSection(mergeSection);
  setRichText(mergeInstruction, instruction || 'Combine your answers into one stronger answer.');
  mergeDraftInput.value = draft || '';
  mergeAgreeBtn.disabled = false;
  setMergeStatus(agreedCount > 0 ? agreedCount + ' of ' + agreesNeeded + ' agreed' : '');
  mergePenHeld = !!penHeld;
  mergePenMine = !!penMine;
  mergePenHolderName = penHolderName || '';
  applyMergePen();
  applyTemplate(mergeSection, playerTemplate);

  // Agree button label/visibility per mode
  if (agreeMode === 'timer') {
    mergeAgreeBtn.hidden = true;
  } else {
    mergeAgreeBtn.hidden = false;
    mergeAgreeBtn.textContent = agreeMode === 'any' ? 'Submit for the group' : 'We agree, submit';
  }

  // Who you're working with
  mergeMembers.textContent = memberNames && memberNames.length > 1
    ? 'Working together: ' + memberNames.join(' + ')
    : '';

  // Each member's starting answer
  mergeSeeds.innerHTML = '';
  if (Array.isArray(seeds) && seeds.length > 0) {
    var seedsTitle = document.createElement('p');
    seedsTitle.className = 'merge-seeds-title';
    seedsTitle.textContent = 'What you each said:';
    mergeSeeds.appendChild(seedsTitle);
    for (var si = 0; si < seeds.length; si++) {
      var card = document.createElement('div');
      card.className = 'merge-seed';
      var s = seeds[si];
      card.textContent = s.author ? s.author + ': ' + s.text : s.text;
      mergeSeeds.appendChild(card);
    }
  }

  applyShow(show, {
    instruction: mergeInstruction,
    seeds: mergeSeeds,
    draft: mergeDraftInput,
    agreeButton: mergeAgreeBtn,
    timer: mergeTimerDisplay
  });

  // The shared-box note travels with the box it explains.
  mergeSharedHint.hidden = mergeDraftInput.hidden;

  if (timer) {
    // Server closes the phase authoritatively at expiry; the bar is just a countdown.
    startTimer(timer, mergeTimerDisplay, function() {});
  }
});

// Shared draft: debounce sends while typing (the first send claims the
// pen server-side; a lost claim race gets this box snapped back).
mergeDraftInput.addEventListener('input', function() {
  // Local edit invalidates earlier agreements — reflect that immediately.
  mergeAgreeBtn.disabled = false;
  setMergeStatus('');
  if (mergeDraftDebounce) clearTimeout(mergeDraftDebounce);
  mergeDraftDebounce = setTimeout(function() {
    mergeDraftDebounce = null;
    socket.emit('merge-draft', { code: currentRoomCode, text: mergeDraftInput.value });
  }, 300);
});

// Leaving the box flushes the last few keystrokes, so a quick tap on
// Agree (or a partner taking over) never loses the final word.
mergeDraftInput.addEventListener('blur', function() {
  if (mergeDraftDebounce) {
    clearTimeout(mergeDraftDebounce);
    mergeDraftDebounce = null;
    socket.emit('merge-draft', { code: currentRoomCode, text: mergeDraftInput.value });
  }
});

// A group-mate changed the shared draft (they hold the pen; the latest
// text replaces the box). Also how the server snaps this box back if a
// local edit raced the pen.
socket.on('merge-draft-update', ({ draft }) => {
  if (mergeDraftInput.value !== draft) {
    mergeDraftInput.value = draft;
    // Flash the box so a group-mate's edit reads as "shared", not a glitch.
    mergeDraftInput.classList.remove('merge-remote-flash');
    void mergeDraftInput.offsetWidth; // restart the animation
    mergeDraftInput.classList.add('merge-remote-flash');
  }
  // The writer is clearly still at it: restart the take-the-pen countdown.
  if (mergePenHeld && !mergePenMine) applyMergePen();
  mergeAgreeBtn.disabled = false;
  setMergeStatus('The shared answer changed, agree again when it looks right.');
});

mergeAgreeBtn.addEventListener('click', function() {
  if (!mergeDraftInput.value.trim()) {
    setMergeStatus('Write your shared answer first.');
    return;
  }
  // Flush any pending draft edit before agreeing so the server agrees to
  // the text on screen.
  if (mergeDraftDebounce) {
    clearTimeout(mergeDraftDebounce);
    mergeDraftDebounce = null;
    socket.emit('merge-draft', { code: currentRoomCode, text: mergeDraftInput.value });
  }
  socket.emit('merge-agree', { code: currentRoomCode });
  mergeAgreeBtn.disabled = true;
  setMergeStatus('You agreed, waiting for the rest of your group...');
});

socket.on('merge-status', ({ agreedCount, agreesNeeded, youAgreed }) => {
  mergeAgreeBtn.disabled = !!youAgreed;
  setMergeStatus(agreedCount + ' of ' + agreesNeeded + ' agreed' + (youAgreed ? ', waiting for the rest of your group...' : ''));
});

var rankDragSrcIndex = null;

function renderRankItems() {
  rankItems.innerHTML = '';
  for (var i = 0; i < rankCurrentOrder.length; i++) {
    (function(index) {
      var item = rankCurrentOrder[index];
      var row = document.createElement('div');
      row.className = 'rank-item';
      row.draggable = true;
      row.dataset.index = index;

      // Drag handle
      var handle = document.createElement('span');
      handle.className = 'rank-handle';
      handle.textContent = '\u2630';
      handle.title = 'Drag to reorder';

      var label = document.createElement('span');
      label.className = 'rank-item-label';
      label.textContent = (index + 1) + '. ' + (typeof item === 'string' ? item : (item.text || item.name || JSON.stringify(item)));

      var upBtn = document.createElement('button');
      upBtn.className = 'rank-arrow';
      upBtn.textContent = '\u25B2';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', function() {
        var temp = rankCurrentOrder[index - 1];
        rankCurrentOrder[index - 1] = rankCurrentOrder[index];
        rankCurrentOrder[index] = temp;
        renderRankItems();
      });

      var downBtn = document.createElement('button');
      downBtn.className = 'rank-arrow';
      downBtn.textContent = '\u25BC';
      downBtn.disabled = index === rankCurrentOrder.length - 1;
      downBtn.addEventListener('click', function() {
        var temp = rankCurrentOrder[index + 1];
        rankCurrentOrder[index + 1] = rankCurrentOrder[index];
        rankCurrentOrder[index] = temp;
        renderRankItems();
      });

      // HTML5 drag events
      row.addEventListener('dragstart', function(e) {
        rankDragSrcIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('rank-dragging');
      });
      row.addEventListener('dragend', function() {
        row.classList.remove('rank-dragging');
        document.querySelectorAll('.rank-item').forEach(function(r) {
          r.classList.remove('rank-drag-over');
        });
      });
      row.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.rank-item').forEach(function(r) {
          r.classList.remove('rank-drag-over');
        });
        row.classList.add('rank-drag-over');
      });
      row.addEventListener('drop', function(e) {
        e.preventDefault();
        if (rankDragSrcIndex === null || rankDragSrcIndex === index) return;
        var moved = rankCurrentOrder.splice(rankDragSrcIndex, 1)[0];
        rankCurrentOrder.splice(index, 0, moved);
        rankDragSrcIndex = null;
        renderRankItems();
      });

      // Touch drag (touchscreen Chromebooks/tablets)
      addTouchDrag(row, index);

      row.appendChild(handle);
      row.appendChild(label);
      row.appendChild(upBtn);
      row.appendChild(downBtn);
      rankItems.appendChild(row);
    })(i);
  }
}

function addTouchDrag(row, index) {
  var startY = 0;
  var startIndex = index;
  row.addEventListener('touchstart', function(e) {
    startY = e.touches[0].clientY;
    startIndex = index;
    row.classList.add('rank-dragging');
  }, { passive: true });
  row.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var y = e.touches[0].clientY;
    var rows = Array.from(rankItems.querySelectorAll('.rank-item'));
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      var rect = rows[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) { target = i; break; }
    }
    rows.forEach(function(r) { r.classList.remove('rank-drag-over'); });
    if (target !== null && target !== startIndex) rows[target].classList.add('rank-drag-over');
  }, { passive: false });
  row.addEventListener('touchend', function(e) {
    row.classList.remove('rank-dragging');
    var y = e.changedTouches[0].clientY;
    var rows = Array.from(rankItems.querySelectorAll('.rank-item'));
    var targetIndex = null;
    for (var i = 0; i < rows.length; i++) {
      var rect = rows[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) { targetIndex = i; break; }
    }
    rows.forEach(function(r) { r.classList.remove('rank-drag-over'); });
    if (targetIndex !== null && targetIndex !== startIndex) {
      var moved = rankCurrentOrder.splice(startIndex, 1)[0];
      rankCurrentOrder.splice(targetIndex, 0, moved);
      renderRankItems();
    }
  }, { passive: true });
}

// --- Match rendering (left column fixed, right column drag-to-swap) ---
// Unlike rank (splice-reorder), dropping a right item onto another row
// SWAPS the two — every other row keeps its alignment.

var matchDragSrcIndex = null;

function swapMatchRows(a, b) {
  var tmp = matchRightOrder[a];
  matchRightOrder[a] = matchRightOrder[b];
  matchRightOrder[b] = tmp;
  renderMatchRows();
}

function renderMatchRows() {
  matchRows.innerHTML = '';
  for (var i = 0; i < matchLeftItems.length; i++) {
    (function(index) {
      var row = document.createElement('div');
      row.className = 'match-row';

      var left = document.createElement('span');
      left.className = 'match-left';
      left.textContent = matchLeftItems[index];

      var arrow = document.createElement('span');
      arrow.className = 'match-arrow-glyph';
      arrow.textContent = '↔';

      var right = document.createElement('div');
      right.className = 'match-right';
      right.draggable = true;

      var handle = document.createElement('span');
      handle.className = 'rank-handle';
      handle.textContent = '☰';
      handle.title = 'Drag to swap';

      var label = document.createElement('span');
      label.className = 'match-right-label';
      label.textContent = matchRightOrder[index] != null ? matchRightOrder[index] : '';

      var upBtn = document.createElement('button');
      upBtn.className = 'rank-arrow';
      upBtn.textContent = '▲';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', function() { swapMatchRows(index, index - 1); });

      var downBtn = document.createElement('button');
      downBtn.className = 'rank-arrow';
      downBtn.textContent = '▼';
      downBtn.disabled = index === matchLeftItems.length - 1;
      downBtn.addEventListener('click', function() { swapMatchRows(index, index + 1); });

      right.addEventListener('dragstart', function(e) {
        matchDragSrcIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        right.classList.add('rank-dragging');
      });
      right.addEventListener('dragend', function() {
        right.classList.remove('rank-dragging');
        document.querySelectorAll('.match-row').forEach(function(r) {
          r.classList.remove('rank-drag-over');
        });
      });
      row.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.match-row').forEach(function(r) {
          r.classList.remove('rank-drag-over');
        });
        row.classList.add('rank-drag-over');
      });
      row.addEventListener('drop', function(e) {
        e.preventDefault();
        if (matchDragSrcIndex === null || matchDragSrcIndex === index) return;
        swapMatchRows(matchDragSrcIndex, index);
        matchDragSrcIndex = null;
      });

      // Touch drag (touchscreen Chromebooks/tablets)
      addMatchTouchDrag(right, index);

      right.appendChild(handle);
      right.appendChild(label);
      row.appendChild(left);
      row.appendChild(arrow);
      row.appendChild(right);
      row.appendChild(upBtn);
      row.appendChild(downBtn);
      matchRows.appendChild(row);
    })(i);
  }
}

function addMatchTouchDrag(el, index) {
  el.addEventListener('touchstart', function() {
    el.classList.add('rank-dragging');
  }, { passive: true });
  el.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var y = e.touches[0].clientY;
    var rows = Array.from(matchRows.querySelectorAll('.match-row'));
    rows.forEach(function(r, ri) {
      r.classList.toggle('rank-drag-over', (function() {
        var rect = r.getBoundingClientRect();
        return y >= rect.top && y <= rect.bottom && ri !== index;
      })());
    });
  }, { passive: false });
  el.addEventListener('touchend', function(e) {
    el.classList.remove('rank-dragging');
    var y = e.changedTouches[0].clientY;
    var rows = Array.from(matchRows.querySelectorAll('.match-row'));
    var targetIndex = null;
    for (var i = 0; i < rows.length; i++) {
      var rect = rows[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) { targetIndex = i; break; }
    }
    rows.forEach(function(r) { r.classList.remove('rank-drag-over'); });
    if (targetIndex !== null && targetIndex !== index) swapMatchRows(index, targetIndex);
  }, { passive: true });
}

// --- Socket events - Rate ---

var rateCurrentRatings = {}; // { scaleId: value }
var rateCurrentScales = [];

socket.on('rate-start', function(payload) {
  var prompt = payload.prompt, scales = payload.scales, timer = payload.timer;
  var playerTemplate = payload.playerTemplate, show = payload.show;
  showSection(rateSection);
  setRichText(ratePromptDisplay, prompt || 'Rate on each scale');
  rateCurrentScales = scales || [];
  rateCurrentRatings = {};
  rateResults.hidden = true;
  rateResults.innerHTML = '';
  rateSubmitBtn.disabled = true;
  rateSubmitBtn.hidden = false;
  applyTemplate(rateSection, playerTemplate);
  applyShow(show, {
    prompt: ratePromptDisplay,
    scales: rateScales,
    timer: rateTimerDisplay,
    submitButton: rateSubmitBtn,
    results: rateResults
  });
  renderRateScales();
  if (timer) {
    startTimer(timer, rateTimerDisplay, function() {
      // Auto-submit whatever is selected (or empty)
      socket.emit('rate-submit', { code: currentRoomCode, ratings: rateCurrentRatings });
      rateSubmitBtn.disabled = true;
    });
  }
});

socket.on('rate-results', function(payload) {
  var scales = payload.scales || rateCurrentScales;
  var averages = payload.averages || {};
  var distributions = payload.distributions || {};
  var raterCount = payload.raterCount || 0;
  // After submitting, the player may have been switched to the generic
  // waiting section. Bring them back to rate-section so they can see the
  // chart. Hide the scale buttons and submit button (already disabled, but
  // hide them entirely so it reads as "here's the result", not "still rating").
  showSection(rateSection);
  rateScales.hidden = true;
  rateSubmitBtn.hidden = true;
  rateResults.hidden = false;
  rateResults.innerHTML = renderRateResults(scales, averages, distributions, raterCount);
});

rateSubmitBtn.addEventListener('click', function() {
  socket.emit('rate-submit', { code: currentRoomCode, ratings: rateCurrentRatings });
  rateSubmitBtn.disabled = true;
});

function renderRateScales() {
  rateScales.innerHTML = '';
  for (var i = 0; i < rateCurrentScales.length; i++) {
    (function(scale) {
      var card = document.createElement('div');
      card.className = 'rate-scale';

      var label = document.createElement('div');
      label.className = 'rate-scale-label';
      label.textContent = scale.label;
      card.appendChild(label);

      if (scale.labels && (scale.labels.min || scale.labels.max)) {
        var endLabels = document.createElement('div');
        endLabels.className = 'rate-scale-endlabels';
        endLabels.innerHTML = '<span>' + escapeHtml(scale.labels.min || scale.min) + '</span>' +
                              '<span>' + escapeHtml(scale.labels.max || scale.max) + '</span>';
        card.appendChild(endLabels);
      }

      var btnRow = document.createElement('div');
      btnRow.className = 'rate-scale-buttons';
      var btns = [];
      for (var v = scale.min; v <= scale.max; v++) {
        (function(val) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'rate-btn';
          b.textContent = String(val);
          b.addEventListener('click', function() {
            rateCurrentRatings[scale.id] = val;
            for (var k = 0; k < btns.length; k++) btns[k].classList.remove('rate-btn-selected');
            b.classList.add('rate-btn-selected');
            // Enable submit when all scales rated
            var ready = true;
            for (var s = 0; s < rateCurrentScales.length; s++) {
              if (rateCurrentRatings[rateCurrentScales[s].id] == null) { ready = false; break; }
            }
            rateSubmitBtn.disabled = !ready;
          });
          btnRow.appendChild(b);
          btns.push(b);
        })(v);
      }
      card.appendChild(btnRow);
      rateScales.appendChild(card);
    })(rateCurrentScales[i]);
  }
}

function renderRateResults(scales, averages, distributions, raterCount) {
  return '<h3>Class results (' + raterCount + ' rater' + (raterCount === 1 ? '' : 's') + ')</h3>' +
         renderAveragesChart(scales, averages) +
         renderDistributionPies(scales, distributions);
}

// HSL hue from 0 (red) at min to 120 (green) at max — works for the typical
// 1=bad / 5=good rating scale. Same palette on host and player so they match.
function rateValueColor(v, min, max) {
  var range = (max - min) || 1;
  var t = (v - min) / range;
  var hue = Math.round(t * 120);
  return 'hsl(' + hue + ', 70%, 50%)';
}

// Horizontal bar chart of average scores across all scales — one bar per scale,
// makes it easy to compare originality/feasibility/effectiveness at a glance.
function renderAveragesChart(scales, averages) {
  var html = '<div class="rate-avg-section"><h4>Average</h4><div class="rate-avg-bars">';
  for (var i = 0; i < scales.length; i++) {
    var s = scales[i];
    var avg = averages[s.id] || 0;
    var range = (s.max - s.min) || 1;
    var pct = Math.max(0, Math.min(100, ((avg - s.min) / range) * 100));
    var color = rateValueColor(avg, s.min, s.max);
    html += '<div class="rate-avg-row">' +
              '<div class="rate-avg-label">' + escapeHtml(s.label) + '</div>' +
              '<div class="rate-avg-bar-track"><div class="rate-avg-bar-fill" style="width:' + pct + '%; background:' + color + ';"></div></div>' +
              '<div class="rate-avg-value">' + avg.toFixed(2) + ' / ' + escapeHtml(s.max) + '</div>' +
            '</div>';
  }
  html += '</div></div>';
  return html;
}

// One pie chart per scale showing how votes were distributed across values.
// Uses CSS conic-gradient — no SVG, no library. Tiny legend below each pie.
function renderDistributionPies(scales, distributions) {
  var html = '<div class="rate-dist-section"><h4>Distribution</h4><div class="rate-pies">';
  for (var i = 0; i < scales.length; i++) {
    var s = scales[i];
    var dist = distributions[s.id] || {};
    var total = 0;
    for (var v = s.min; v <= s.max; v++) total += (dist[v] || 0);
    html += '<div class="rate-pie-card">' +
              '<div class="rate-pie-title">' + escapeHtml(s.label) + '</div>' +
              renderPie(s, dist, total) +
              renderPieLegend(s, dist) +
            '</div>';
  }
  html += '</div></div>';
  return html;
}

function renderPie(scale, dist, total) {
  if (total === 0) return '<div class="rate-pie rate-pie-empty">no ratings</div>';
  var stops = [];
  var cumDeg = 0;
  for (var v = scale.min; v <= scale.max; v++) {
    var n = dist[v] || 0;
    if (n === 0) continue;
    var deg = (n / total) * 360;
    var color = rateValueColor(v, scale.min, scale.max);
    stops.push(color + ' ' + cumDeg + 'deg ' + (cumDeg + deg) + 'deg');
    cumDeg += deg;
  }
  return '<div class="rate-pie" style="background: conic-gradient(' + stops.join(', ') + ');"></div>';
}

function renderPieLegend(scale, dist) {
  var html = '<div class="rate-pie-legend">';
  for (var v = scale.min; v <= scale.max; v++) {
    var n = dist[v] || 0;
    var color = rateValueColor(v, scale.min, scale.max);
    html += '<div class="rate-pie-legend-row">' +
              '<span class="rate-pie-swatch" style="background:' + color + ';"></span>' +
              '<span class="rate-pie-legend-val">' + v + '</span>' +
              '<span class="rate-pie-legend-count">' + n + '</span>' +
            '</div>';
  }
  html += '</div>';
  return html;
}

// --- Socket events - Wager ---

var wagerSelectedOption = null;
var wagerAvailablePoints = 0;

socket.on('wager-start', ({ prompt, options, availablePoints, timer, minBet, maxBetPercent, playerTemplate, show }) => {
  showSection(wagerSection);
  setRichText(wagerPromptDisplay, prompt || 'Place your bet!');
  wagerAvailablePoints = availablePoints || 0;
  wagerPointsDisplay.textContent = 'You have ' + wagerAvailablePoints + ' points';
  wagerSelectedOption = null;
  wagerSubmitBtn.disabled = false;
  applyTemplate(wagerSection, playerTemplate);
  applyShow(show, {
    prompt: wagerPromptDisplay,
    options: wagerOptionsDisplay,
    points: wagerPointsDisplay,
    timer: wagerTimerDisplay,
    submitButton: wagerSubmitBtn
  });

  var maxBet = Math.floor(wagerAvailablePoints * ((maxBetPercent || 100) / 100));
  wagerAmountInput.min = minBet || 1;
  wagerAmountInput.max = maxBet;
  wagerAmountInput.value = minBet || 1;

  wagerOptionsDisplay.innerHTML = '';
  var optionsList = Array.isArray(options) ? options : [];
  for (var i = 0; i < optionsList.length; i++) {
    (function(opt) {
      var btn = document.createElement('button');
      btn.className = 'wager-option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', function() {
        wagerSelectedOption = opt;
        var allBtns = wagerOptionsDisplay.querySelectorAll('.wager-option-btn');
        for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('selected');
        btn.classList.add('selected');
      });
      wagerOptionsDisplay.appendChild(btn);
    })(optionsList[i]);
  }

  if (timer) {
    startTimer(timer, wagerTimerDisplay, function() {
      if (!wagerSelectedOption && optionsList.length > 0) {
        wagerSelectedOption = optionsList[Math.floor(Math.random() * optionsList.length)];
      }
      socket.emit('wager-submit', {
        code: currentRoomCode,
        option: wagerSelectedOption,
        amount: parseInt(wagerAmountInput.value) || 1
      });
      wagerSubmitBtn.disabled = true;
      showSection(submittedSection);
    });
  }
});

wagerSubmitBtn.addEventListener('click', function() {
  if (!wagerSelectedOption) return;
  socket.emit('wager-submit', {
    code: currentRoomCode,
    option: wagerSelectedOption,
    amount: parseInt(wagerAmountInput.value) || 1
  });
  wagerSubmitBtn.disabled = true;
  showSection(submittedSection);
});

// --- Socket events - Relay ---

socket.on('relay-turn', ({ prompt, sharedResult, timer, progress, playerTemplate, show }) => {
  showSection(relaySection);
  relayStatus.textContent = "It's your turn!";
  setRichText(relayPromptDisplay, prompt || '');
  relayPromptDisplay.hidden = !prompt;
  relayInputSection.hidden = false;
  relayInput.value = '';
  relayInput.focus();
  relaySubmitBtn.disabled = false;
  applyTemplate(relaySection, playerTemplate);
  applyShow(show, {
    prompt: relayPromptDisplay,
    sharedResult: relaySharedDisplay,
    input: relayInputSection,
    timer: relayTimerDisplay
  });

  renderRelayShared(sharedResult);

  if (timer) {
    startTimer(timer, relayTimerDisplay, function() {
      socket.emit('relay-submit', { code: currentRoomCode, text: relayInput.value || '' });
      relaySubmitBtn.disabled = true;
      relayInputSection.hidden = true;
      relayStatus.textContent = UiLang.t('Submitted! Waiting...');
    });
  }
});

socket.on('relay-waiting', ({ activePlayerName, prompt, sharedResult, progress, playerTemplate, show }) => {
  showSection(relaySection);
  relayStatus.textContent = "Waiting for " + activePlayerName + "...";
  setRichText(relayPromptDisplay, prompt || '');
  relayPromptDisplay.hidden = !prompt;
  relayInputSection.hidden = true;
  applyTemplate(relaySection, playerTemplate);
  applyShow(show, {
    prompt: relayPromptDisplay,
    sharedResult: relaySharedDisplay,
    input: relayInputSection,
    timer: relayTimerDisplay
  });

  renderRelayShared(sharedResult);
});

relaySubmitBtn.addEventListener('click', function() {
  socket.emit('relay-submit', { code: currentRoomCode, text: relayInput.value || '' });
  relaySubmitBtn.disabled = true;
  relayInputSection.hidden = true;
  relayStatus.textContent = UiLang.t('Submitted! Waiting...');
});

function renderRelayShared(sharedResult) {
  relaySharedDisplay.innerHTML = '';
  if (!sharedResult || !sharedResult.length) return;
  for (var i = 0; i < sharedResult.length; i++) {
    var p = document.createElement('p');
    p.innerHTML = '<strong>' + escapeHtml(sharedResult[i].name) + ':</strong> ' + escapeHtml(sharedResult[i].text);
    relaySharedDisplay.appendChild(p);
  }
}

// --- Socket events - Turn (charades / describe-it) ---

function startTurnTimerCountdown(endAt) {
  if (turnTimerInterval) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  if (!endAt) { turnTimerDisplay.hidden = true; return; }
  turnTimerDisplay.hidden = false;
  const totalMs = endAt - Date.now();
  const totalSec = Math.max(1, Math.round(totalMs / 1000));
  const textEl = turnTimerDisplay.querySelector('.timer-bar-text');
  const fillEl = turnTimerDisplay.querySelector('.timer-bar-fill');
  function tick() {
    const remainingMs = Math.max(0, endAt - Date.now());
    const sec = Math.ceil(remainingMs / 1000);
    if (textEl) textEl.textContent = sec + 's';
    if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, (remainingMs / (totalSec * 1000)) * 100)) + '%';
    if (remainingMs <= 0) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  }
  tick();
  turnTimerInterval = setInterval(tick, 250);
}

socket.on('turn-start', ({ phaseInstanceId } = {}) => {
  turnCurrentInstanceId = phaseInstanceId;
  showSection(turnSection);
});

socket.on('turn-item', (data = {}) => {
  const { role, item, teamName, describerName, instruction, allowSkip, timerEndAt, remaining, phaseInstanceId } = data;
  turnCurrentInstanceId = phaseInstanceId;
  showSection(turnSection);

  setRichText(turnInstruction, instruction || '');
  turnInstruction.hidden = !instruction;

  if (role === 'describer') {
    turnRoleLabel.textContent = "Your turn, describe this!";
    turnRoleLabel.className = 'turn-role-label role-describer';
    turnItemDisplay.textContent = item || '';
    turnItemDisplay.hidden = false;
    turnTeamLine.textContent = teamName ? '(Playing for ' + teamName + ')' : '';
    turnControls.hidden = false;
    turnGotItBtn.disabled = false;
    turnSkipBtn.disabled = false;
    turnSkipBtn.hidden = !allowSkip;
  } else if (role === 'teammate') {
    turnRoleLabel.textContent = "Your turn to GUESS!";
    turnRoleLabel.className = 'turn-role-label role-teammate';
    turnItemDisplay.textContent = '🤐';
    turnItemDisplay.hidden = false;
    turnTeamLine.textContent = describerName ? describerName + ' is describing' : '';
    turnControls.hidden = true;
  } else {
    // audience (other team)
    turnRoleLabel.textContent = "Watching. " + (teamName || 'other team') + " plays";
    turnRoleLabel.className = 'turn-role-label role-audience';
    turnItemDisplay.textContent = item || '';
    turnItemDisplay.hidden = false;
    turnTeamLine.textContent = describerName ? describerName + ' is describing' : '';
    turnControls.hidden = true;
  }

  turnRemaining.textContent = (typeof remaining === 'number') ? (remaining + ' left in pool') : '';
  startTurnTimerCountdown(timerEndAt);
});

socket.on('turn-end', (data = {}) => {
  const { teamScores, reason } = data;
  turnRoleLabel.textContent = reason === 'pool-empty' ? 'Pool empty, round over!' : "Time's up!";
  turnRoleLabel.className = 'turn-role-label';
  turnItemDisplay.textContent = '';
  turnItemDisplay.hidden = true;
  turnTeamLine.textContent = teamScores ? Object.entries(teamScores).map(([t, s]) => t + ': ' + s).join(' • ') : '';
  turnControls.hidden = true;
  if (turnTimerInterval) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  turnTimerDisplay.hidden = true;
});

socket.on('turn-complete', (data = {}) => {
  const { teamScores } = data;
  turnRoleLabel.textContent = 'Round complete!';
  turnRoleLabel.className = 'turn-role-label';
  turnItemDisplay.textContent = '';
  turnItemDisplay.hidden = true;
  turnTeamLine.textContent = teamScores ? Object.entries(teamScores).map(([t, s]) => t + ': ' + s).join(' • ') : '';
  turnControls.hidden = true;
  if (turnTimerInterval) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  turnTimerDisplay.hidden = true;
});

turnGotItBtn.addEventListener('click', () => {
  turnGotItBtn.disabled = true;
  turnSkipBtn.disabled = true;
  socket.emit('turn-got-it', { code: currentRoomCode, phaseInstanceId: turnCurrentInstanceId });
});
turnSkipBtn.addEventListener('click', () => {
  turnGotItBtn.disabled = true;
  turnSkipBtn.disabled = true;
  socket.emit('turn-skip', { code: currentRoomCode, phaseInstanceId: turnCurrentInstanceId });
});

// --- Solo quiz (self-paced): one question at a time, at your own speed ---
const soloQuizSection = document.getElementById('solo-quiz-section');
const sqCounter = document.getElementById('sq-counter');
const sqQuestion = document.getElementById('sq-question');
const sqChoices = document.getElementById('sq-choices');
const sqFeedback = document.getElementById('sq-feedback');
const sqNextBtn = document.getElementById('sq-next-btn');
const sqDone = document.getElementById('sq-done');
const sqDoneScore = document.getElementById('sq-done-score');
let sqPending = null;     // the payload behind the Next button
let sqInstanceId = null;
let sqBotAuto = false;    // prototype Bot Fill: play the whole quiz through

function renderSoloQuestion(data) {
  showSection(soloQuizSection);
  sqDone.hidden = true;
  sqFeedback.hidden = true;
  sqNextBtn.hidden = true;
  sqCounter.textContent = UiLang.t('Question') + ' ' + (data.index + 1) + ' ' + UiLang.t('of') + ' ' + data.total;
  setRichText(sqQuestion, data.question || '');
  sqChoices.textContent = '';
  (data.choices || []).forEach(function (choiceText) {
    var btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = choiceText;
    btn.addEventListener('click', function () {
      var all = sqChoices.querySelectorAll('.choice-btn');
      for (var i = 0; i < all.length; i++) all[i].disabled = true;
      btn.classList.add('picked');
      socket.emit('solo-quiz-answer', { code: currentRoomCode, index: data.index, choice: choiceText, phaseInstanceId: sqInstanceId });
    });
    sqChoices.appendChild(btn);
  });
  if (sqBotAuto) {
    setTimeout(function () {
      var open = sqChoices.querySelectorAll('.choice-btn:not(:disabled)');
      if (open.length) open[Math.floor(Math.random() * open.length)].click();
    }, 300);
  }
}

function renderSoloDone(data) {
  showSection(soloQuizSection);
  sqBotAuto = false;
  sqCounter.textContent = '';
  sqQuestion.textContent = '';
  sqChoices.textContent = '';
  sqFeedback.hidden = true;
  sqNextBtn.hidden = true;
  sqDone.hidden = false;
  sqDoneScore.textContent = UiLang.t('Your score') + ': ' + (data.correct || 0) + ' ' + UiLang.t('of') + ' ' + (data.total || 0);
  if (J) J.sound('tada');
}

socket.on('solo-quiz-question', function (data) {
  sqInstanceId = data.phaseInstanceId;
  sqPending = null;
  applyTemplate(soloQuizSection, data.playerTemplate);
  if (data.done) renderSoloDone(data); else renderSoloQuestion(data);
});

socket.on('solo-quiz-feedback', function (data) {
  // Stale guard only when both sides know the instance (a student who
  // joined mid-step got their question without one).
  if (sqInstanceId != null && data.phaseInstanceId != null && data.phaseInstanceId !== sqInstanceId) return;
  if (data.phaseInstanceId != null) sqInstanceId = data.phaseInstanceId;
  sqFeedback.hidden = false;
  sqFeedback.className = 'sq-feedback ' + (data.correct ? 'sq-right' : 'sq-wrong');
  sqFeedback.textContent = data.correct
    ? UiLang.t('Correct!')
    : (data.correctAnswer
      ? UiLang.t('Not quite.') + ' ' + UiLang.t('The answer was') + ' ' + data.correctAnswer
      : UiLang.t('Not quite.'));
  if (J) J.sound(data.correct ? 'blip' : 'womp');
  sqPending = data;
  sqNextBtn.hidden = false;
  sqNextBtn.textContent = data.done ? UiLang.t('See my score') : UiLang.t('Next question');
  if (sqBotAuto) setTimeout(function () { sqNextBtn.click(); }, 350);
});

sqNextBtn.addEventListener('click', function () {
  if (!sqPending) return;
  var data = sqPending;
  sqPending = null;
  if (data.done) renderSoloDone(data); else renderSoloQuestion(data);
});

socket.on('solo-quiz-done', function (data) {
  sqPending = null;
  renderSoloDone(data);
});

// Rolling start: this student's last input landed, nothing else needs
// them. Their own screen, not the shared wait screen.
socket.on('player-done', ({ message } = {}) => {
  showSection(doneSection);
  if (doneMessageEl) setRichText(doneMessageEl, message || '');
  if (J) J.sound('tada');
});

socket.on('game-ended', ({ message, playerTemplate, playerShow } = {}) => {
  eliminatedBanner.hidden = true;
  isEliminated = false;
  showSection(endSection);
  applyTemplate(endSection, playerTemplate);
  const endMsg = endSection.querySelector('h1');
  applyShow(playerShow, { message: endMsg });
});

// --- Socket events - Waiting ---

socket.on('waiting', ({ message }) => {
  showSection(gameWaitingSection);
  gameWaitingMessage.textContent = message;
});

socket.on('phase-paused', ({ message }) => {
  showSection(gameWaitingSection);
  gameWaitingMessage.textContent = message || 'The teacher is resolving an issue. Please wait...';
});

// --- Socket events - Voting ---

socket.on('vote-start', ({ mode, candidates, matchups, timer, playerTemplate, show }) => {
  resetHoldingProgress();
  showSection(voteSection);
  voteOptions.innerHTML = '';
  applyTemplate(voteSection, playerTemplate);
  applyShow(show, {
    title: voteTitle,
    options: voteOptions,
    timer: voteTimerDisplay,
    progress: voteProgress
  });

  if (mode === 'pick-one') {
    voteTitle.textContent = UiLang.t('Pick your favorite!');
    voteProgress.hidden = true;
    currentCandidates = candidates || [];
    showPickOneVote(candidates);
    if (timer) {
      startTimer(timer, voteTimerDisplay, () => {
        // Auto-vote: pick a random candidate (string candidates ARE the choice)
        if (currentCandidates.length > 0) {
          const randomIdx = Math.floor(Math.random() * currentCandidates.length);
          const c = currentCandidates[randomIdx];
          socket.emit('submit-vote', { code: currentRoomCode, choice: typeof c === 'string' ? c : c.playerId });
        }
        showSection(voteSubmittedSection);
      });
    }
  } else if (mode === 'head-to-head') {
    currentMatchups = matchups;
    currentMatchupIndex = 0;
    matchupVotes = [];
    showNextMatchup();
    if (timer) {
      startTimer(timer, voteTimerDisplay, () => {
        // Auto-vote: randomly pick remaining matchups
        for (let i = currentMatchupIndex; i < currentMatchups.length; i++) {
          const matchup = currentMatchups[i];
          const pick = Math.random() < 0.5 ? matchup.optionA.playerId : matchup.optionB.playerId;
          matchupVotes.push(pick);
        }
        socket.emit('submit-vote', {
          code: currentRoomCode,
          votes: matchupVotes.map(function(choice) { return { choice: choice }; })
        });
        showSection(voteSubmittedSection);
      });
    }
  }
});

// --- Socket events - Elimination ---

socket.on('elimination-results', ({ eliminated, eliminatedNames, remaining, playerTemplate, playerShow }) => {
  showSection(eliminationResultsSection);
  applyTemplate(eliminationResultsSection, playerTemplate);
  applyShow(playerShow, { details: eliminationDetails });

  if (eliminated.includes(socket.id)) {
    isEliminated = true;
    eliminatedBanner.hidden = false;
    if (J) J.sound('womp');
    eliminationDetails.textContent =
      'You were eliminated! ' + remaining + ' players remain.';
  } else {
    eliminationDetails.textContent = eliminatedNames.length
      ? eliminatedNames.join(', ') + ' eliminated! ' + remaining + ' players remain.'
      : UiLang.t('Everyone tied, nobody is out this round.');
  }
});

// --- Socket events - Winner ---

let winnerRevealTimer = null;

socket.on('winner-announced', ({ winnerName, winnerScore, winnerIds, winnerNames, isTie, standings, winnerEntry, winnerEntries, playerTemplate, playerShow }) => {
  showSection(winnerSection);

  // Same build-up beat as the projector, quietly \u2014 sound stays reserved for
  // the winner's own device at the reveal.
  const entryAllowed = !playerShow || playerShow.indexOf('entry') !== -1;
  winnerTitle.textContent = UiLang.t('And the winner is\u2026');
  winnerDetails.textContent = '';
  winnerEntryDisplay.hidden = true;
  winnerEntryDisplay.innerHTML = '';
  standingsList.innerHTML = '';
  applyTemplate(winnerSection, playerTemplate);
  applyShow(playerShow, {
    name: winnerTitle,
    entry: winnerEntryDisplay,
    details: winnerDetails,
    standings: standingsList
  });
  winnerEntryDisplay.hidden = true; // stays hidden until the reveal fills it

  clearTimeout(winnerRevealTimer);
  winnerRevealTimer = setTimeout(() => {
    if (winnerSection.hidden) return; // phase moved on during the build-up
    // Personal celebration only on the winner's own device.
    const iWon = winnerIds && winnerIds.indexOf(socket.id) !== -1;
    if (J && iWon) {
      J.sound('fanfare');
      J.confetti();
    }
    if (isTie && winnerNames && winnerNames.length > 1) {
      winnerTitle.textContent = '\ud83d\udc51 ' + formatTieNamesPlayer(winnerNames) + ' tie!';
      winnerDetails.textContent = iWon ? 'That\'s you! ' + winnerScore + ' each' : winnerScore + ' each';
    } else {
      winnerTitle.textContent = '\ud83d\udc51 ' + winnerName + ' wins!';
      winnerDetails.textContent = iWon ? 'That\'s you! ' + winnerScore : String(winnerScore);
    }

    // What they won for \u2014 the winning entry itself.
    const entries = (isTie && winnerEntries && winnerEntries.length > 0) ? winnerEntries
      : (winnerEntry ? [{ text: winnerEntry }] : []);
    if (entries.length > 0 && entryAllowed) {
      for (const entry of entries) {
        const quote = document.createElement('p');
        quote.className = 'winner-entry-quote';
        quote.textContent = '\u201c' + entry.text + '\u201d';
        winnerEntryDisplay.appendChild(quote);
        if (entries.length > 1 && entry.name) {
          const by = document.createElement('p');
          by.className = 'winner-entry-by';
          by.textContent = 'by ' + entry.name;
          winnerEntryDisplay.appendChild(by);
        }
      }
      winnerEntryDisplay.hidden = false;
    }

    if (standings && standings.length > 0) {
      for (let i = 0; i < standings.length; i++) {
        const p = document.createElement('p');
        p.textContent = (i + 1) + '. ' + standings[i].name + ': ' + standings[i].score;
        standingsList.appendChild(p);
      }
    }
  }, 1500);
});

function formatTieNamesPlayer(names) {
  if (names.length === 2) return names[0] + ' and ' + names[1];
  if (names.length === 3) return names[0] + ', ' + names[1] + ', and ' + names[2];
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

// --- Voting functions ---

// A ballot button's face: the candidate's text, or a thumbnail of their
// drawing when the vote is over drawings (the ballot carries thin strokes).
function fillVoteButton(btn, candidate) {
  if (candidate && typeof candidate === 'object' && Array.isArray(candidate.drawing) && window.Draw) {
    btn.classList.add('vote-btn-drawing');
    const thumb = document.createElement('canvas');
    thumb.className = 'vote-thumb';
    thumb.width = 240;
    thumb.height = 180;
    Draw.renderStrokes(thumb, candidate.drawing);
    btn.appendChild(thumb);
    return;
  }
  btn.textContent = typeof candidate === 'string' ? candidate : (candidate.text || candidate.name || candidate.playerId);
}

function showPickOneVote(candidates) {
  for (const candidate of candidates) {
    const btn = document.createElement('button');
    btn.className = 'vote-btn';
    // Literal option lists (branching votes) are plain strings — the string
    // is both the label and the choice id.
    const isString = typeof candidate === 'string';
    fillVoteButton(btn, candidate);
    btn.addEventListener('click', () => {
      socket.emit('submit-vote', { code: currentRoomCode, choice: isString ? candidate : candidate.playerId });
      showSection(voteSubmittedSection);
    });
    voteOptions.appendChild(btn);
  }
}

function showNextMatchup() {
  if (currentMatchupIndex >= currentMatchups.length) {
    // All matchups voted on — send all votes to server
    socket.emit('submit-vote', {
      code: currentRoomCode,
      votes: matchupVotes.map(function(choice) { return { choice: choice }; })
    });
    showSection(voteSubmittedSection);
    return;
  }

  const matchup = currentMatchups[currentMatchupIndex];

  voteTitle.textContent = UiLang.t('Which is better?');
  voteProgress.hidden = false;
  voteProgress.textContent =
    'Match ' + (currentMatchupIndex + 1) + ' of ' + currentMatchups.length;

  voteOptions.innerHTML = '';

  const btnA = document.createElement('button');
  btnA.className = 'vote-btn';
  fillVoteButton(btnA, matchup.optionA);
  btnA.addEventListener('click', () => {
    matchupVotes.push(matchup.optionA.playerId);
    currentMatchupIndex++;
    showNextMatchup();
  });

  const vsLabel = document.createElement('p');
  vsLabel.className = 'vs-label';
  vsLabel.textContent = 'VS';

  const btnB = document.createElement('button');
  btnB.className = 'vote-btn';
  fillVoteButton(btnB, matchup.optionB);
  btnB.addEventListener('click', () => {
    matchupVotes.push(matchup.optionB.playerId);
    currentMatchupIndex++;
    showNextMatchup();
  });

  voteOptions.appendChild(btnA);
  voteOptions.appendChild(vsLabel);
  voteOptions.appendChild(btnB);
}

// --- Helper functions ---

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

const allPlayerSections = [
  joinSection, waitingSection, collectSection, submittedSection,
  processSection, revealSection, endSection, gameWaitingSection,
  voteSection, voteSubmittedSection, eliminationResultsSection,
  announceSection, winnerSection, leaderboardSection, revealOneSection,
  teamSplitSection, rankSection, mergeSection, oneVoiceSection, wagerSection, relaySection, rateSection,
  turnSection, buzzSection, estimateSection, matchSection, sortSection, checklistSection,
  doneSection, soloQuizSection
];

function showSection(el) {
  clearTimer();
  // Leaving a screen always ends any live dictation.
  if (window.Speech) Speech.stopAll();
  // Entering a wait screen fresh clears its stale meadow/count; the phase's
  // own first room-progress tick repopulates it within a beat.
  const wasActive = document.querySelector('section.active');
  if (el !== wasActive &&
      (el === submittedSection || el === voteSubmittedSection || el === gameWaitingSection)) {
    resetHoldingProgress();
  }
  for (const s of allPlayerSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('active');
  // The screen that is up fits the lid (shared/fit-screen.js): sized now,
  // before it paints.
  if (window.FitScreen) FitScreen.fitNow();
  // Personal confirmation blip — only on the student's own submit.
  if (J && (el === submittedSection || el === voteSubmittedSection)) {
    J.sound('blip');
  }
}

// A Chromebook lid is 1366x768: the screen that is up fits it without a
// scroll (owner 2026-09-18). shared/fit-screen.js shrinks the active
// section (and the early-bird joke above it) with CSS zoom, down to 60%
// so the words stay readable, then lets the page scroll.
if (window.FitScreen) {
  FitScreen.install({
    floor: 0.6,
    targets: function () {
      return [document.querySelector('section.active'), document.getElementById('early-joke')];
    }
  });
}
