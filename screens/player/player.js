/**
 * player.js — the student device client (phone / Chromebook).
 *
 * The socket.io client for one player: join, then the input UI for each phase
 * (text answers, choices, votes, ranks, rates, wagers, relay turns, merge
 * drafts, estimate guesses, buzz/one-voice taps). It mirrors the host's current
 * phase via socket events, guards against stale events left over from a
 * previous phase, restores state on reconnect (token rebind), and — in
 * prototype mode — exposes a bot-fill hook. Stays quiet (no juice) except the
 * student's own moments (their submit, their personal win).
 */

// Default theme — bold black borders + flat colors, matches the game designer's
// Keith Haring vibe. Overridden by a game-specific theme when one is set.
if (window.applyGameTheme) {
  window.applyGameTheme('pop-art');
}

const socket = io();

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

// Timer state
let timerInterval = null;
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
    tmplDiv.textContent = templateText;
    tmplDiv.hidden = false;
  } else {
    tmplDiv.textContent = '';
    tmplDiv.hidden = true;
  }
}

// Elements - Join
const joinSection = document.getElementById('join-section');
const roomCodeInput = document.getElementById('room-code-input');
const nameInput = document.getElementById('name-input');
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
const responseNotice = document.getElementById('response-notice');

const RESPONSE_MAX = 280;
const RESPONSE_MIN = 2;

// Live character counter + notice clearing as the student types.
if (responseInput) {
  responseInput.addEventListener('input', () => {
    if (responseCounter) responseCounter.textContent = responseInput.value.length + ' / ' + RESPONSE_MAX;
    if (responseNotice && !responseNotice.hidden) responseNotice.hidden = true;
  });
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

// Prototype mode: auto-fill and auto-join
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('prototype') === 'true') {
    const code = params.get('code');
    const name = params.get('name');
    if (code && name) {
      roomCodeInput.value = code;
      nameInput.value = name;
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

window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'bot-fill') return;

  // Find the currently visible section
  var active = document.querySelector('section.active');
  if (!active) return;
  var id = active.id;

  if (id === 'collect-section') {
    // Check for choice buttons first (collect-choice mode)
    var choiceBtns = active.querySelectorAll('.choice-btn');
    if (choiceBtns.length > 0) {
      choiceBtns[Math.floor(Math.random() * choiceBtns.length)].click();
    } else {
      // Check for multi-field inputs
      var fieldInputs = active.querySelectorAll('.field-input');
      if (fieldInputs.length > 0) {
        for (var fi = 0; fi < fieldInputs.length; fi++) {
          // Each field gets an answer matched to its own label/placeholder
          fieldInputs[fi].value = botFillAnswer(fieldInputs[fi].placeholder || promptDisplay.textContent);
        }
        var btn = active.querySelector('button#submit-btn');
        if (btn && !btn.disabled) btn.click();
      } else {
        // Free text mode — answer the actual question on screen
        var textarea = active.querySelector('textarea');
        var btn = active.querySelector('button#submit-btn');
        if (textarea && btn && !btn.disabled) {
          textarea.value = botFillAnswer(promptDisplay.textContent);
          btn.click();
        }
      }
    }
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
      estimateInput.value = String(Math.floor(Math.random() * 200) + 1);
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
        ? seedTexts[0] + ' — and also ' + seedTexts[1].charAt(0).toLowerCase() + seedTexts[1].slice(1)
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
  const name = nameInput.value.trim();

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
  if (!savedToken) {
    try { savedToken = sessionStorage.getItem('playerToken'); } catch (e) { /* storage unavailable */ }
  }
  socket.emit('join-room', { code, name, token: savedToken || undefined });
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
  submitBtn.disabled = true;
  socket.emit('submit-response', { code: currentRoomCode, response });
  showSection(submittedSection);
});

// Server rejected a submission (filtered or invalid). The notice lands on
// whichever input the student is actually using — merge drafts and relay
// turns get rejected too, not just collect answers.
socket.on('response-rejected', ({ message }) => {
  var notice = message || 'That response wasn’t accepted. Please try again.';
  var active = document.querySelector('section.active');

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

socket.on('join-success', ({ name, reconnected, token, theme }) => {
  if (!reconnected) {
    showSection(waitingSection);
  }
  // If reconnected, sendCurrentState on the server will push the right section
  playerNameDisplay.textContent = (J ? J.avatarFor(name) + ' ' : '') + name;
  currentPlayerName = name;
  if (token) {
    currentToken = token;
    try { sessionStorage.setItem('playerToken', token); } catch (e) { /* storage unavailable */ }
  }

  // Apply game theme
  if (theme && window.applyGameTheme) {
    window.applyGameTheme(theme);
  }
});

// Auto-rejoin on socket reconnect
socket.on('connect', () => {
  if (currentRoomCode && currentPlayerName) {
    var savedToken = currentToken;
    if (!savedToken) {
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
  showError(message || 'You have been removed from the game.');
});

// --- Timer ---
function startTimer(seconds, wrapperEl, onExpire) {
  clearTimer();
  let remaining = seconds;
  const total = seconds;
  const textEl = wrapperEl.querySelector('.timer-bar-text');
  const fillEl = wrapperEl.querySelector('.timer-bar-fill');

  wrapperEl.hidden = false;
  wrapperEl.classList.remove('timer-warning');
  textEl.textContent = remaining + 's';
  fillEl.style.width = '100%';

  timerInterval = setInterval(() => {
    remaining--;
    textEl.textContent = remaining + 's';
    fillEl.style.width = ((remaining / total) * 100) + '%';
    if (remaining <= 5) {
      wrapperEl.classList.add('timer-warning');
    }
    if (remaining <= 0) {
      clearTimer();
      wrapperEl.hidden = true;
      if (onExpire) onExpire();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  collectTimerDisplay.hidden = true;
  collectTimerDisplay.classList.remove('timer-warning');
  voteTimerDisplay.hidden = true;
  voteTimerDisplay.classList.remove('timer-warning');
  announceTimerDisplay.hidden = true;
  announceTimerDisplay.classList.remove('timer-warning');
}

// --- Socket events - Game phases ---

socket.on('game-started', ({ prompt, image, timer, playerTemplate, show, isChoice, choices, fields, passAllowed }) => {
  showSection(collectSection);
  promptDisplay.textContent = prompt;
  responseInput.value = '';
  if (responseCounter) responseCounter.textContent = '0 / ' + RESPONSE_MAX;
  if (responseNotice) responseNotice.hidden = true;
  submitBtn.disabled = false;
  applyTemplate(collectSection, playerTemplate);
  applyImage(collectImage, image, show);

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
    passBtn.textContent = 'Pass this one';
    passBtn.addEventListener('click', function() {
      socket.emit('submit-response', { code: currentRoomCode, response: '', pass: true });
      showSection(submittedSection);
    });
    collectSection.appendChild(passBtn);
  }

  // Track current collect mode for timer auto-submit
  var collectMode = 'text';

  if (isChoice && Array.isArray(choices) && choices.length > 0) {
    // --- Multiple choice mode ---
    collectMode = 'choice';
    responseInput.hidden = true;
    responseInput.style.display = 'none';
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
          socket.emit('submit-response', { code: currentRoomCode, response: choiceText });
          showSection(submittedSection);
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
      fieldsContainer.appendChild(fieldInput);
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
      submitBtn.disabled = true;
      socket.emit('submit-response', { code: currentRoomCode, response: result });
      showSection(submittedSection);
    };
    submitBtn.onclick = fieldsSubmitHandler;

    applyShow(show, {
      prompt: promptDisplay,
      input: fieldsContainer,
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
      } else {
        submitBtn.disabled = true;
        socket.emit('submit-response', { code: currentRoomCode, response: responseInput.value.trim() || '' });
      }
      showSection(submittedSection);
    });
  }
});

const processTitle = document.getElementById('process-title');

const AI_TASK_MESSAGES = {
  'summarize': 'AI is summarizing answers...',
  'generate': 'AI is creating something...',
  'generate-choices': 'AI is generating choices...',
  'compare': 'AI is comparing answers...',
  'rank': 'AI is ranking answers...',
  'judge': 'AI is judging answers...'
};

socket.on('processing-started', ({ task, playerTemplate, playerShow } = {}) => {
  processTitle.textContent = AI_TASK_MESSAGES[task] || 'AI is working on something special...';
  showSection(processSection);
  applyTemplate(processSection, playerTemplate);
  applyShow(playerShow, { message: processTitle });
});

socket.on('show-results', ({ content, aiResult, image, playerTemplate, playerShow }) => {
  showSection(revealSection);
  aiResultDisplay.textContent = content || aiResult;
  aiResultDisplay.classList.toggle('chart', /[█░]/.test(aiResultDisplay.textContent || ''));
  applyTemplate(revealSection, playerTemplate);
  applyImage(revealImage, image, playerShow);
  applyShow(playerShow, { content: aiResultDisplay });
});

socket.on('announce', ({ message, image, timer, playerTemplate, playerShow }) => {
  showSection(announceSection);
  announceMessage.textContent = message;
  applyTemplate(announceSection, playerTemplate);
  applyImage(announceImage, image, playerShow);
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

socket.on('leaderboard', ({ standings, allStandings, style, timer, playerTemplate, show }) => {
  showSection(leaderboardSection);
  applyTemplate(leaderboardSection, playerTemplate);
  applyShow(show, {
    rank: leaderboardRank,
    standings: leaderboardStandings
  });

  // Find current player in standings
  var myStanding = (allStandings || standings || []).find(function(s) { return s.playerId === socket.id; });
  if (myStanding) {
    leaderboardRank.textContent = '#' + myStanding.rank + ' — ' + myStanding.name;
    leaderboardScore.textContent = myStanding.score + ' points';
    // First place gets a personal celebration on their own device.
    if (myStanding.rank === 1 && J) J.confetti({ count: 60 });
  } else {
    leaderboardRank.textContent = '';
    leaderboardScore.textContent = '';
  }

  // Render standings list \u2014 medal/number based on rank so tied players
  // share the same medal (two tied for 1st \u2192 both gold; no silver).
  leaderboardStandings.innerHTML = '';
  var list = allStandings || standings || [];
  for (var i = 0; i < list.length; i++) {
    var p = document.createElement('p');
    var r = list[i].rank;
    var prefix = r + '. ';
    p.textContent = prefix + list[i].name + ' \u2014 ' + list[i].score + ' points';
    if (list[i].playerId === socket.id) {
      p.className = 'leaderboard-highlight';
    }
    leaderboardStandings.appendChild(p);
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
  revealOneMessage.textContent = message || 'Revealing...';
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
  div.textContent = typeof item === 'string' ? item : (item.text || item.name || JSON.stringify(item));
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
      title.textContent = r.name + ' — ' + (full ? 'full' : r.open + (r.open === 1 ? ' spot left' : ' spots left'));
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
  rankPromptDisplay.textContent = prompt || 'Rank the items';
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
    ? 'That was our last try — best run: ' + bestRun + ' of ' + target + '. Look up!'
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
    oneVoiceStatus.textContent = 'You just went — let someone else take this one.';
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
  buzzPlayerPrompt.textContent = prompt || 'Listen for the question!';
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
    buzzPlayerStatus.textContent = '🔔 You buzzed first — answer out loud!';
    if (J) J.sound('tada');
  } else {
    buzzPlayerStatus.textContent = playerName + ' buzzed first.';
  }
});

socket.on('buzz-reject', ({ reason }) => {
  buzzTapBtn.disabled = true;
  buzzPlayerStatus.textContent = reason === 'locked-out'
    ? 'Locked out until the next question.'
    : 'Too late — someone beat you to it!';
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
      buzzPlayerStatus.textContent = '✗ Not this time — locked out until the next question.';
      if (J) J.sound('womp');
      buzzTapBtn.disabled = true;
    } else {
      buzzPlayerStatus.textContent = 'Buzzer reopened — go!';
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

function submitEstimate() {
  var v = parseFloat(estimateInput.value);
  if (!isFinite(v)) {
    estimatePlayerStatus.textContent = 'Type a number first.';
    return false;
  }
  socket.emit('estimate-submit', { code: currentRoomCode, value: v });
  estimatePlayerStatus.textContent =
    'Got it — you guessed ' + v + '. You can change it until the teacher reveals.';
  if (J) J.sound('blip');
  return true;
}

socket.on('estimate-start', ({ prompt, unit, image, min, max, timer, playerTemplate, show }) => {
  showSection(estimateSection);
  estimatePlayerPrompt.textContent = prompt || 'Guess the number!';
  applyImage(estimateImage, image, show);
  estimateUnit.textContent = unit || '';
  estimateInput.value = '';
  estimateInput.disabled = false;
  if (min != null) estimateInput.min = min; else estimateInput.removeAttribute('min');
  if (max != null) estimateInput.max = max; else estimateInput.removeAttribute('max');
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
  estimatePlayerStatus.textContent = '';

  var mine = (guesses || []).find(function (g) { return g.playerId === socket.id; });
  var html = '';
  if (answer != null) {
    html += '<div class="estimate-answer">The answer: <strong>' + answer +
            (unit ? ' ' + unit : '') + '</strong></div>';
  }
  if (mine) {
    html += '<p>You guessed <strong>' + mine.value + '</strong>' +
            (mine.score > 0 ? ' — +' + mine.score + ' points! 🎯' : '') + '</p>';
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
  matchPromptDisplay.textContent = prompt || 'Match the pairs!';
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
      (mine.score > 0 ? ' — +' + mine.score + ' points!' : '');
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
  sortPromptDisplay.textContent = prompt || 'Sort the items!';
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
      (mine.score > 0 ? ' — +' + mine.score + ' points!' : '');
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

// --- Socket events - Merge (Connection Pack: think-pair-share) ---

var mergeDraftDebounce = null;

function setMergeStatus(text) {
  if (!text) {
    mergeStatus.hidden = true;
    mergeStatus.textContent = '';
  } else {
    mergeStatus.hidden = false;
    mergeStatus.textContent = text;
  }
}

socket.on('merge-start', ({ instruction, seeds, draft, memberNames, agreeMode, agreedCount, agreesNeeded, timer, playerTemplate, show }) => {
  showSection(mergeSection);
  mergeInstruction.textContent = instruction || 'Combine your answers into one stronger answer.';
  mergeDraftInput.value = draft || '';
  mergeAgreeBtn.disabled = false;
  setMergeStatus(agreedCount > 0 ? agreedCount + ' of ' + agreesNeeded + ' agreed' : '');
  applyTemplate(mergeSection, playerTemplate);

  // Agree button label/visibility per mode
  if (agreeMode === 'timer') {
    mergeAgreeBtn.hidden = true;
  } else {
    mergeAgreeBtn.hidden = false;
    mergeAgreeBtn.textContent = agreeMode === 'any' ? 'Submit for the group' : 'We agree — submit';
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

  if (timer) {
    // Server closes the phase authoritatively at expiry; the bar is just a countdown.
    startTimer(timer, mergeTimerDisplay, function() {});
  }
});

// Shared draft: debounce sends while typing (last write wins server-side).
mergeDraftInput.addEventListener('input', function() {
  // Local edit invalidates earlier agreements — reflect that immediately.
  mergeAgreeBtn.disabled = false;
  setMergeStatus('');
  if (mergeDraftDebounce) clearTimeout(mergeDraftDebounce);
  mergeDraftDebounce = setTimeout(function() {
    socket.emit('merge-draft', { code: currentRoomCode, text: mergeDraftInput.value });
  }, 300);
});

// A group-mate changed the shared draft (last write wins — v1 has no
// merge cursors; the latest text simply replaces the box).
socket.on('merge-draft-update', ({ draft }) => {
  if (mergeDraftInput.value !== draft) {
    mergeDraftInput.value = draft;
  }
  mergeAgreeBtn.disabled = false;
  setMergeStatus('The shared answer changed — agree again when it looks right.');
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
  setMergeStatus('You agreed — waiting for the rest of your group...');
});

socket.on('merge-status', ({ agreedCount, agreesNeeded, youAgreed }) => {
  mergeAgreeBtn.disabled = !!youAgreed;
  setMergeStatus(agreedCount + ' of ' + agreesNeeded + ' agreed' + (youAgreed ? ' — waiting for the rest of your group...' : ''));
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

      // Touch drag (phones/Chromebooks without mouse)
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

      // Touch drag (phones/Chromebooks without mouse)
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
  ratePromptDisplay.textContent = prompt || 'Rate on each scale';
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
        endLabels.innerHTML = '<span>' + (scale.labels.min || scale.min) + '</span>' +
                              '<span>' + (scale.labels.max || scale.max) + '</span>';
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
              '<div class="rate-avg-label">' + s.label + '</div>' +
              '<div class="rate-avg-bar-track"><div class="rate-avg-bar-fill" style="width:' + pct + '%; background:' + color + ';"></div></div>' +
              '<div class="rate-avg-value">' + avg.toFixed(2) + ' / ' + s.max + '</div>' +
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
              '<div class="rate-pie-title">' + s.label + '</div>' +
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
  wagerPromptDisplay.textContent = prompt || 'Place your bet!';
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
  relayPromptDisplay.textContent = prompt || '';
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
      relayStatus.textContent = 'Submitted! Waiting...';
    });
  }
});

socket.on('relay-waiting', ({ activePlayerName, prompt, sharedResult, progress, playerTemplate, show }) => {
  showSection(relaySection);
  relayStatus.textContent = "Waiting for " + activePlayerName + "...";
  relayPromptDisplay.textContent = prompt || '';
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
  relayStatus.textContent = 'Submitted! Waiting...';
});

function renderRelayShared(sharedResult) {
  relaySharedDisplay.innerHTML = '';
  if (!sharedResult || !sharedResult.length) return;
  for (var i = 0; i < sharedResult.length; i++) {
    var p = document.createElement('p');
    p.innerHTML = '<strong>' + sharedResult[i].name + ':</strong> ' + sharedResult[i].text;
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

  turnInstruction.textContent = instruction || '';
  turnInstruction.hidden = !instruction;

  if (role === 'describer') {
    turnRoleLabel.textContent = "Your turn — describe this!";
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
    turnRoleLabel.textContent = "Watching — " + (teamName || 'other team') + " plays";
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
  turnRoleLabel.textContent = reason === 'pool-empty' ? 'Pool empty — round over!' : "Time's up!";
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
    voteTitle.textContent = 'Pick your favorite!';
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
    eliminationDetails.textContent =
      eliminatedNames.join(', ') + ' eliminated! ' + remaining + ' players remain.';
  }
});

// --- Socket events - Winner ---

socket.on('winner-announced', ({ winnerName, winnerScore, winnerIds, winnerNames, isTie, standings, playerTemplate, playerShow }) => {
  showSection(winnerSection);
  // Personal celebration only on the winner's own device.
  if (J && winnerIds && winnerIds.indexOf(socket.id) !== -1) {
    J.sound('fanfare');
    J.confetti();
  }
  if (isTie && winnerNames && winnerNames.length > 1) {
    winnerTitle.textContent = formatTieNamesPlayer(winnerNames) + ' tie!';
    winnerDetails.textContent = winnerScore + ' each';
  } else {
    winnerTitle.textContent = winnerName + ' wins!';
    winnerDetails.textContent = String(winnerScore);
  }
  applyTemplate(winnerSection, playerTemplate);
  applyShow(playerShow, {
    name: winnerTitle,
    details: winnerDetails,
    standings: standingsList
  });

  standingsList.innerHTML = '';
  if (standings && standings.length > 0) {
    for (let i = 0; i < standings.length; i++) {
      const p = document.createElement('p');
      p.textContent = (i + 1) + '. ' + standings[i].name + ' \u2014 ' + standings[i].score;
      standingsList.appendChild(p);
    }
  }
});

function formatTieNamesPlayer(names) {
  if (names.length === 2) return names[0] + ' and ' + names[1];
  if (names.length === 3) return names[0] + ', ' + names[1] + ', and ' + names[2];
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

// --- Voting functions ---

function showPickOneVote(candidates) {
  for (const candidate of candidates) {
    const btn = document.createElement('button');
    btn.className = 'vote-btn';
    // Literal option lists (branching votes) are plain strings — the string
    // is both the label and the choice id.
    const isString = typeof candidate === 'string';
    btn.textContent = isString ? candidate : (candidate.text || candidate.name || candidate.playerId);
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

  voteTitle.textContent = 'Which is better?';
  voteProgress.hidden = false;
  voteProgress.textContent =
    'Match ' + (currentMatchupIndex + 1) + ' of ' + currentMatchups.length;

  voteOptions.innerHTML = '';

  const btnA = document.createElement('button');
  btnA.className = 'vote-btn';
  btnA.textContent = matchup.optionA.text || matchup.optionA.name || matchup.optionA.playerId;
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
  btnB.textContent = matchup.optionB.text || matchup.optionB.name || matchup.optionB.playerId;
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
  buzzSection, estimateSection
];

function showSection(el) {
  clearTimer();
  for (const s of allPlayerSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('active');
  // Personal confirmation blip — only on the student's own submit.
  if (J && (el === submittedSection || el === voteSubmittedSection)) {
    J.sound('blip');
  }
}
