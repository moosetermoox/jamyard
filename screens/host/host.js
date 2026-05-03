const socket = io();

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

// Elements - Lobby
const lobbySection = document.getElementById('lobby-section');
const gameSelectSection = document.getElementById('game-select-section');
const gameSelect = document.getElementById('game-select');
const roomCodeSection = document.getElementById('room-code-section');
const roomCodeDisplay = document.getElementById('room-code');
const gameNameDisplay = document.getElementById('game-name-display');
const createRoomBtn = document.getElementById('create-room-btn');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');

// Elements - Collect
const collectSection = document.getElementById('collect-section');
const promptDisplay = document.getElementById('prompt-display');
const collectTimer = document.getElementById('collect-timer');
const submissionCount = document.getElementById('submission-count');
const closeSubmissionsBtn = document.getElementById('close-submissions-btn');

// Elements - Process
const processSection = document.getElementById('process-section');

// Elements - Preview
const previewSection = document.getElementById('preview-section');
const previewContent = document.getElementById('preview-content');
const previewResponses = document.getElementById('preview-responses');
const previewResponsesList = document.getElementById('preview-responses-list');
const previewApproveBtn = document.getElementById('preview-approve-btn');
const previewRejectBtn = document.getElementById('preview-reject-btn');

// Elements - Reveal
const revealSection = document.getElementById('reveal-section');
const aiResultDisplay = document.getElementById('ai-result');
const revealResponses = document.getElementById('reveal-responses');
const responsesList = document.getElementById('responses-list');
const continueBtn = document.getElementById('continue-btn');

// Elements - Vote
const voteSection = document.getElementById('vote-section');
const voteModeDisplay = document.getElementById('vote-mode-display');
const voteTimer = document.getElementById('vote-timer');
const voteCount = document.getElementById('vote-count');
const closeVotingBtn = document.getElementById('close-voting-btn');

// Elements - Elimination
const eliminationSection = document.getElementById('elimination-section');
const eliminatedNamesDisplay = document.getElementById('eliminated-names');
const remainingCount = document.getElementById('remaining-count');
const eliminationContinueBtn = document.getElementById('elimination-continue-btn');

// Elements - Winner
const winnerSection = document.getElementById('winner-section');
const winnerNameDisplay = document.getElementById('winner-name');
const standingsList = document.getElementById('standings-list');
const winnerEndBtn = document.getElementById('winner-end-btn');

// Elements - Announce
const announceSection = document.getElementById('announce-section');
const announceMessage = document.getElementById('announce-message');
const announceTimer = document.getElementById('announce-timer');
const announceContinueBtn = document.getElementById('announce-continue-btn');

// Elements - Leaderboard
const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardStandings = document.getElementById('leaderboard-standings');
const leaderboardContinueBtn = document.getElementById('leaderboard-continue-btn');
const leaderboardTimer = document.getElementById('leaderboard-timer');

// Elements - Reveal-one
const revealOneSection = document.getElementById('reveal-one-section');
const revealOneMessage = document.getElementById('reveal-one-message');
const revealOneCounter = document.getElementById('reveal-one-counter');
const revealOneItems = document.getElementById('reveal-one-items');
const revealOneNextBtn = document.getElementById('reveal-one-next-btn');
const revealOneContinueBtn = document.getElementById('reveal-one-continue-btn');

// Elements - Team-split
const teamSplitSection = document.getElementById('team-split-section');
const teamSplitTeams = document.getElementById('team-split-teams');
const teamSplitContinueBtn = document.getElementById('team-split-continue-btn');

// Elements - Rank
const rankSection = document.getElementById('rank-section');
const rankPrompt = document.getElementById('rank-prompt');
const rankCounter = document.getElementById('rank-counter');
const rankTimer = document.getElementById('rank-timer');
const rankCloseBtn = document.getElementById('rank-close-btn');

// Elements - Wager
const wagerSection = document.getElementById('wager-section');
const wagerPrompt = document.getElementById('wager-prompt');
const wagerOptions = document.getElementById('wager-options');
const wagerCounter = document.getElementById('wager-counter');
const wagerTimer = document.getElementById('wager-timer');
const wagerCloseBtn = document.getElementById('wager-close-btn');
const wagerResolveSection = document.getElementById('wager-resolve-section');
const wagerResolveOptions = document.getElementById('wager-resolve-options');

// Elements - Relay
const relaySection = document.getElementById('relay-section');
const relayPrompt = document.getElementById('relay-prompt');
const relayActivePlayer = document.getElementById('relay-active-player');
const relayProgress = document.getElementById('relay-progress');
const relaySharedResult = document.getElementById('relay-shared-result');
const relayTimer = document.getElementById('relay-timer');

// Elements - Phase Error
const phaseErrorSection = document.getElementById('phase-error-section');
const phaseErrorTitle = document.getElementById('phase-error-title');
const phaseErrorMessage = document.getElementById('phase-error-message');
const phaseErrorRetryBtn = document.getElementById('phase-error-retry-btn');
const phaseErrorSkipBtn = document.getElementById('phase-error-skip-btn');
const phaseErrorEndBtn = document.getElementById('phase-error-end-btn');

// Elements - End
const endSection = document.getElementById('end-section');
const playAgainBtn = document.getElementById('play-again-btn');

// --- Screen control helpers ---

function applyShow(show, elementMap) {
  if (!show) return; // null/undefined = show all defaults
  for (const [key, el] of Object.entries(elementMap)) {
    if (el) el.hidden = !show.includes(key);
  }
}

function applyTemplate(section, templateText) {
  const tmplDiv = section.querySelector('.screen-template');
  if (!tmplDiv) return;
  if (templateText) {
    tmplDiv.textContent = templateText;
    tmplDiv.hidden = false;
  } else {
    tmplDiv.textContent = '';
    tmplDiv.hidden = true;
  }
}

// Fetch available games on connect
socket.emit('get-games');

socket.on('games-list', ({ games }) => {
  gameSelect.innerHTML = '';
  if (games.length === 0) {
    gameSelect.innerHTML = '<option value="">No games available</option>';
    createRoomBtn.disabled = true;
    return;
  }
  for (const game of games) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    gameSelect.appendChild(option);
  }

  // Auto-select game from URL param and create room
  const params = new URLSearchParams(window.location.search);
  const autoGame = params.get('game');
  if (autoGame) {
    const match = Array.from(gameSelect.options).find(o => o.value === autoGame);
    if (match) {
      gameSelect.value = autoGame;
      createRoomBtn.click();
    }
  }
});

// --- Button handlers ---

createRoomBtn.addEventListener('click', () => {
  const gameId = gameSelect.value;
  if (!gameId) return;
  socket.emit('create-room', { gameId });
  createRoomBtn.disabled = true;
});

startGameBtn.addEventListener('click', () => {
  socket.emit('start-game', { code: currentRoomCode });
});

closeSubmissionsBtn.addEventListener('click', () => {
  socket.emit('close-submissions', { code: currentRoomCode });
});

continueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

closeVotingBtn.addEventListener('click', () => {
  socket.emit('close-voting', { code: currentRoomCode });
});

previewApproveBtn.addEventListener('click', () => {
  socket.emit('preview-approve', { code: currentRoomCode });
});

previewRejectBtn.addEventListener('click', () => {
  socket.emit('preview-reject', { code: currentRoomCode });
});

eliminationContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

winnerEndBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

announceContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

leaderboardContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

revealOneNextBtn.addEventListener('click', () => {
  socket.emit('reveal-next', { code: currentRoomCode });
});

revealOneContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

teamSplitContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

rankCloseBtn.addEventListener('click', () => {
  socket.emit('close-ranking', { code: currentRoomCode });
});

wagerCloseBtn.addEventListener('click', () => {
  socket.emit('close-wager', { code: currentRoomCode });
});

playAgainBtn.addEventListener('click', () => {
  location.reload();
});

// --- Socket events - Room setup ---

// Prototype skip — clicks whichever advance/close button is currently visible.
// Special-cases relay (no host button — auto-skips remaining turns server-side).
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'prototype-skip') return;

  // Relay has no host-side button to click — turns advance from player devices.
  // Ask the server to fast-forward all remaining turns.
  if (relaySection && !relaySection.hidden && currentRoomCode) {
    socket.emit('relay-finish-all', { code: currentRoomCode });
    return;
  }

  const candidates = [
    'close-submissions-btn',
    'close-voting-btn',
    'rank-close-btn',
    'wager-close-btn',
    'reveal-one-next-btn', 'reveal-one-continue-btn',
    'preview-approve-btn',
    'continue-btn',
    'announce-continue-btn',
    'leaderboard-continue-btn',
    'team-split-continue-btn',
    'elimination-continue-btn',
    'winner-end-btn',
    'start-game-btn'
  ];
  for (const id of candidates) {
    const btn = document.getElementById(id);
    if (btn && !btn.hidden && !btn.disabled && btn.offsetParent !== null) {
      btn.click();
      return;
    }
  }
  // No visible button — fall back to a generic advance
  if (currentRoomCode) socket.emit('advance-phase', { code: currentRoomCode });
});

socket.on('room-created', ({ code, game, theme }) => {
  currentRoomCode = code;
  roomCodeDisplay.textContent = code;
  gameNameDisplay.textContent = game || '';

  // Apply game theme
  if (theme && window.applyGameTheme) {
    window.applyGameTheme(theme);
  }
  gameSelectSection.hidden = true;
  roomCodeSection.hidden = false;

  // Prototype mode: notify parent window of room code
  const params = new URLSearchParams(window.location.search);
  if (params.get('prototype') === 'true' && window.parent !== window) {
    window.parent.postMessage({ type: 'room-created', code: code }, '*');
  }
});

socket.on('player-joined', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
});

socket.on('player-left', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
});

socket.on('player-disconnected', ({ players }) => {
  renderPlayerList(players);
});

socket.on('player-reconnected', ({ players }) => {
  renderPlayerList(players);
});

// --- Timer ---
let timerInterval = null;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73

function startTimer(seconds, containerEl, onExpire) {
  clearTimer();
  let remaining = seconds;
  const total = seconds;
  const textEl = containerEl.querySelector('.timer-ring-text');
  const fillEl = containerEl.querySelector('.timer-ring-fill');

  containerEl.hidden = false;
  containerEl.classList.remove('timer-warning');
  textEl.textContent = remaining;
  fillEl.style.strokeDashoffset = '0';

  timerInterval = setInterval(() => {
    remaining--;
    textEl.textContent = remaining;
    const offset = RING_CIRCUMFERENCE * (1 - remaining / total);
    fillEl.style.strokeDashoffset = offset;
    if (remaining <= 5) {
      containerEl.classList.add('timer-warning');
    }
    if (remaining <= 0) {
      clearTimer();
      containerEl.hidden = true;
      if (onExpire) onExpire();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  collectTimer.hidden = true;
  collectTimer.classList.remove('timer-warning');
  voteTimer.hidden = true;
  voteTimer.classList.remove('timer-warning');
  announceTimer.hidden = true;
  announceTimer.classList.remove('timer-warning');
}

// --- Socket events - Game phases ---

socket.on('game-started', ({ prompt, timer, hostTemplate, show }) => {
  showSection(collectSection);
  promptDisplay.textContent = prompt;
  submissionCount.textContent = '0 of 0 submitted';
  applyTemplate(collectSection, hostTemplate);
  applyShow(show, {
    prompt: promptDisplay,
    counter: submissionCount,
    timer: collectTimer,
    closeButton: closeSubmissionsBtn
  });
  if (timer) {
    startTimer(timer, collectTimer, () => {
      closeSubmissionsBtn.click();
    });
  }
});

socket.on('response-received', ({ playerName, count, total }) => {
  submissionCount.textContent = count + ' of ' + total + ' submitted';
});

const processMessage = document.getElementById('process-message');

const AI_TASK_MESSAGES = {
  'summarize': 'AI is summarizing answers...',
  'generate': 'AI is creating something...',
  'generate-choices': 'AI is generating choices...',
  'compare': 'AI is comparing answers...',
  'rank': 'AI is ranking answers...',
  'judge': 'AI is judging answers...'
};

socket.on('processing-started', ({ task, hostTemplate, hostShow } = {}) => {
  processMessage.textContent = AI_TASK_MESSAGES[task] || 'AI is processing...';
  showSection(processSection);
  applyTemplate(processSection, hostTemplate);
  applyShow(hostShow, { message: processMessage });
});

socket.on('preview-content', ({ content, responses, hostTemplate, show }) => {
  showSection(previewSection);
  previewContent.textContent = content;
  applyTemplate(previewSection, hostTemplate);
  applyShow(show, {
    content: previewContent,
    responses: previewResponses,
    approveButton: previewApproveBtn,
    rejectButton: previewRejectBtn
  });

  if (responses && responses.length > 0) {
    if (!show || show.includes('responses')) {
      previewResponses.hidden = false;
    }
    previewResponsesList.innerHTML = '';
    for (const { name, response } of responses) {
      const li = document.createElement('li');
      li.innerHTML = '<strong>' + name + ':</strong> ' + response;
      previewResponsesList.appendChild(li);
    }
  } else {
    previewResponses.hidden = true;
  }
});

socket.on('show-results', ({ content, aiResult, responses, hostTemplate, hostShow }) => {
  showSection(revealSection);
  aiResultDisplay.textContent = content || aiResult;
  aiResultDisplay.classList.toggle('chart', /[█░]/.test(aiResultDisplay.textContent || ''));
  applyTemplate(revealSection, hostTemplate);
  applyShow(hostShow, {
    content: aiResultDisplay,
    responses: revealResponses,
    continueButton: continueBtn
  });

  if (responses && responses.length > 0) {
    if (!hostShow || hostShow.includes('responses')) {
      revealResponses.hidden = false;
    }
    renderResponses(responses);
  } else {
    revealResponses.hidden = true;
  }
});

socket.on('announce', ({ message, timer, hostTemplate, hostShow }) => {
  showSection(announceSection);
  announceMessage.textContent = message;
  applyTemplate(announceSection, hostTemplate);
  applyShow(hostShow, {
    message: announceMessage,
    continueButton: announceContinueBtn,
    timer: announceTimer
  });
  if (timer) {
    if (!hostShow || !hostShow.includes('continueButton')) {
      announceContinueBtn.hidden = true;
    }
    startTimer(timer, announceTimer, () => {
      // Timer auto-advances on server side
    });
  } else {
    if (!hostShow) {
      announceContinueBtn.hidden = false;
    }
  }
});

socket.on('leaderboard', ({ standings, style, timer, hostTemplate, show }) => {
  showSection(leaderboardSection);
  applyTemplate(leaderboardSection, hostTemplate);
  applyShow(show, {
    standings: leaderboardStandings,
    continueButton: leaderboardContinueBtn,
    timer: leaderboardTimer
  });

  leaderboardStandings.innerHTML = '';
  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    const p = document.createElement('p');
    const medal = i === 0 ? '\uD83E\uDD47 ' : i === 1 ? '\uD83E\uDD48 ' : i === 2 ? '\uD83E\uDD49 ' : '';
    p.textContent = medal + '#' + s.rank + ' ' + s.name + ' \u2014 ' + s.score + ' pts';
    leaderboardStandings.appendChild(p);
  }

  if (timer) {
    if (!show || !show.includes('continueButton')) {
      leaderboardContinueBtn.hidden = true;
    }
    startTimer(timer, leaderboardTimer, () => {});
  } else {
    if (!show) {
      leaderboardContinueBtn.hidden = false;
    }
  }
});

socket.on('reveal-one-start', ({ message, total, revealed, timer, hostTemplate, show }) => {
  showSection(revealOneSection);
  revealOneMessage.textContent = message || 'Reveal Time!';
  revealOneCounter.textContent = revealed + ' of ' + total + ' revealed';
  revealOneItems.innerHTML = '';
  revealOneNextBtn.hidden = revealed >= total;
  revealOneContinueBtn.hidden = true;
  applyTemplate(revealOneSection, hostTemplate);
  applyShow(show, {
    message: revealOneMessage,
    revealButton: revealOneNextBtn,
    counter: revealOneCounter
  });
});

socket.on('reveal-one-item', ({ item, index, total }) => {
  revealOneCounter.textContent = index + ' of ' + total + ' revealed';
  const div = document.createElement('div');
  div.className = 'reveal-one-item';
  div.textContent = item;
  revealOneItems.appendChild(div);

  if (index >= total) {
    revealOneNextBtn.hidden = true;
    revealOneContinueBtn.hidden = false;
  }
});

socket.on('reveal-one-complete', () => {
  revealOneNextBtn.hidden = true;
  revealOneContinueBtn.hidden = false;
});

// --- Socket events - Team-split ---

socket.on('team-split', ({ teams, hostTemplate, show }) => {
  showSection(teamSplitSection);
  applyTemplate(teamSplitSection, hostTemplate);
  applyShow(show, {
    teams: teamSplitTeams,
    continueButton: teamSplitContinueBtn
  });

  teamSplitTeams.innerHTML = '';
  for (const [teamName, members] of Object.entries(teams)) {
    const card = document.createElement('div');
    card.className = 'team-card';
    const h3 = document.createElement('h3');
    h3.textContent = teamName;
    card.appendChild(h3);
    for (const m of members) {
      const p = document.createElement('p');
      p.textContent = m.name;
      card.appendChild(p);
    }
    teamSplitTeams.appendChild(card);
  }
});

// --- Socket events - Rank ---

socket.on('rank-start', ({ prompt, totalRankers, timer, hostTemplate, show }) => {
  showSection(rankSection);
  rankPrompt.textContent = prompt || 'Rank the items';
  rankCounter.textContent = '0 of ' + totalRankers + ' ranked';
  applyTemplate(rankSection, hostTemplate);
  applyShow(show, {
    prompt: rankPrompt,
    counter: rankCounter,
    timer: rankTimer,
    closeButton: rankCloseBtn
  });
  if (timer) {
    startTimer(timer, rankTimer, () => {
      socket.emit('close-ranking', { code: currentRoomCode });
    });
  }
});

socket.on('rank-received', ({ count, total }) => {
  rankCounter.textContent = count + ' of ' + total + ' ranked';
});

// --- Socket events - Wager ---

socket.on('wager-start', ({ prompt, options, totalWagerers, timer, hostTemplate, show }) => {
  showSection(wagerSection);
  wagerPrompt.textContent = prompt || 'Place your bets!';
  wagerCounter.textContent = '0 of ' + totalWagerers + ' wagered';
  wagerResolveSection.hidden = true;
  applyTemplate(wagerSection, hostTemplate);
  applyShow(show, {
    prompt: wagerPrompt,
    options: wagerOptions,
    counter: wagerCounter,
    timer: wagerTimer,
    closeButton: wagerCloseBtn
  });

  wagerOptions.innerHTML = '';
  for (const opt of (options || [])) {
    const p = document.createElement('p');
    p.textContent = opt;
    wagerOptions.appendChild(p);
  }

  if (timer) {
    startTimer(timer, wagerTimer, () => {
      socket.emit('close-wager', { code: currentRoomCode });
    });
  }
});

socket.on('wager-received', ({ count, total }) => {
  wagerCounter.textContent = count + ' of ' + total + ' wagered';
});

socket.on('wager-need-resolve', ({ options }) => {
  wagerCloseBtn.hidden = true;
  wagerResolveSection.hidden = false;
  wagerResolveOptions.innerHTML = '';
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      socket.emit('wager-resolve', { code: currentRoomCode, winningOption: opt });
      wagerResolveSection.hidden = true;
    });
    wagerResolveOptions.appendChild(btn);
  }
});

// --- Socket events - Relay ---

socket.on('relay-update', ({ activePlayerName, sharedResult, progress, timer, hostTemplate, show }) => {
  showSection(relaySection);
  relayPrompt.textContent = relayPrompt.textContent || 'Relay';
  relayActivePlayer.textContent = activePlayerName + "'s turn";
  relayProgress.textContent = progress;
  applyTemplate(relaySection, hostTemplate);
  applyShow(show, {
    prompt: relayPrompt,
    progress: relayProgress,
    sharedResult: relaySharedResult,
    timer: relayTimer,
    activePlayer: relayActivePlayer
  });

  relaySharedResult.innerHTML = '';
  for (const entry of (sharedResult || [])) {
    const p = document.createElement('p');
    p.innerHTML = '<strong>' + entry.name + ':</strong> ' + entry.text;
    relaySharedResult.appendChild(p);
  }

  if (timer) {
    startTimer(timer, relayTimer, () => {});
  }
});

socket.on('game-ended', ({ message, hostTemplate, hostShow } = {}) => {
  showSection(endSection);
  const endMsg = endSection.querySelector('.game-over');
  if (message && endMsg) endMsg.textContent = message;
  applyTemplate(endSection, hostTemplate);
  applyShow(hostShow, {
    message: endMsg,
    playAgainButton: playAgainBtn
  });
});

// --- Socket events - Phase Error ---

socket.on('phase-error', ({ phaseId, phaseType, message, canRetry, canSkip }) => {
  showSection(phaseErrorSection);
  phaseErrorTitle.textContent = 'Error in "' + phaseId + '" (' + phaseType + ')';
  phaseErrorMessage.textContent = message || 'Something went wrong.';
  phaseErrorRetryBtn.hidden = !canRetry;
  phaseErrorSkipBtn.hidden = !canSkip;
});

phaseErrorRetryBtn.addEventListener('click', () => {
  socket.emit('retry-phase', { code: currentRoomCode });
});

phaseErrorSkipBtn.addEventListener('click', () => {
  socket.emit('skip-phase', { code: currentRoomCode });
});

phaseErrorEndBtn.addEventListener('click', () => {
  if (confirm('End the game for everyone?')) {
    socket.emit('end-game', { code: currentRoomCode });
  }
});

// --- Socket events - Voting ---

socket.on('vote-start', ({ mode, totalVoters, timer, hostTemplate, show }) => {
  showSection(voteSection);
  voteModeDisplay.textContent = mode === 'head-to-head' ? 'Head-to-Head' : 'Pick One';
  voteCount.textContent = '0 of ' + totalVoters + ' votes received';
  applyTemplate(voteSection, hostTemplate);
  applyShow(show, {
    mode: voteModeDisplay,
    counter: voteCount,
    timer: voteTimer,
    closeButton: closeVotingBtn
  });
  if (timer) {
    startTimer(timer, voteTimer, () => {
      closeVotingBtn.click();
    });
  }
});

socket.on('vote-received', ({ count, total }) => {
  voteCount.textContent = count + ' of ' + total + ' votes received';
});

// --- Socket events - Elimination ---

socket.on('elimination-results', ({ eliminatedNames, remaining, hostTemplate, hostShow }) => {
  showSection(eliminationSection);
  eliminatedNamesDisplay.textContent = eliminatedNames.join(', ') + ' eliminated!';
  remainingCount.textContent = remaining + ' players remaining';
  applyTemplate(eliminationSection, hostTemplate);
  applyShow(hostShow, {
    eliminated: eliminatedNamesDisplay,
    remaining: remainingCount,
    continueButton: eliminationContinueBtn
  });
});

// --- Socket events - Winner ---

socket.on('winner-announced', ({ winnerName, winnerScore, winnerNames, isTie, standings, hostTemplate, hostShow }) => {
  showSection(winnerSection);
  if (isTie && winnerNames && winnerNames.length > 1) {
    winnerNameDisplay.textContent = formatTieNames(winnerNames) + ' tie!';
  } else {
    winnerNameDisplay.textContent = winnerName + ' wins!';
  }
  applyTemplate(winnerSection, hostTemplate);
  applyShow(hostShow, {
    name: winnerNameDisplay,
    standings: standingsList,
    endButton: winnerEndBtn
  });

  standingsList.innerHTML = '';
  if (standings && standings.length > 0) {
    for (var i = 0; i < standings.length; i++) {
      var p = document.createElement('p');
      p.textContent = (i + 1) + '. ' + standings[i].name + ' \u2014 ' + standings[i].score;
      standingsList.appendChild(p);
    }
  }
});

function formatTieNames(names) {
  if (names.length === 2) return names[0] + ' and ' + names[1];
  if (names.length === 3) return names[0] + ', ' + names[1] + ', and ' + names[2];
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

// --- Render functions ---

function nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return 'hsl(' + hue + ', 55%, 50%)';
}

function renderPlayerList(players) {
  playerList.innerHTML = '';
  for (const player of players) {
    const li = document.createElement('li');
    li.dataset.id = player.id;

    if (player.connected === false) {
      li.classList.add('player-disconnected');
    }

    const avatar = document.createElement('span');
    avatar.className = 'player-avatar';
    avatar.textContent = player.name.charAt(0).toUpperCase();
    avatar.style.background = nameToColor(player.name);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;

    li.appendChild(avatar);
    li.appendChild(nameSpan);
    playerList.appendChild(li);
  }
}

function updateStartButton(playerCount) {
  startGameBtn.disabled = playerCount < 1;
}

function renderResponses(responses) {
  responsesList.innerHTML = '';
  for (const { name, response } of responses) {
    const li = document.createElement('li');
    li.innerHTML = '<strong>' + name + ':</strong> ' + response;
    responsesList.appendChild(li);
  }
}

const allSections = [
  lobbySection, collectSection, processSection, previewSection,
  revealSection, voteSection, eliminationSection, winnerSection,
  announceSection, leaderboardSection, revealOneSection,
  teamSplitSection, rankSection, wagerSection, relaySection,
  phaseErrorSection, endSection
];

function showSection(el) {
  clearTimer();
  for (const s of allSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  el.hidden = false;
  // Force reflow so transition triggers
  void el.offsetWidth;
  el.classList.add('active');
}

function hideAllSections() {
  clearTimer();
  for (const s of allSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
}
