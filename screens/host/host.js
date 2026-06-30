// Default theme — bold black borders + flat colors, matches the game designer's
// Keith Haring vibe. Applied immediately so even pre-game lobby screens look
// like the rest of the app. A game with its own theme will override this on
// room-created.
if (window.applyGameTheme) {
  window.applyGameTheme('pop-art');
}

const socket = io();

// --- Juice (sounds + confetti + avatars) ---
// Garnish from /shared/juice.js; guarded so a load failure can't break the game.
const J = window.Juice || null;
const sfxToggle = document.getElementById('sfx-toggle');
if (sfxToggle && J) {
  sfxToggle.textContent = J.muted() ? '🔇' : '🔊';
  sfxToggle.addEventListener('click', () => {
    sfxToggle.textContent = J.toggleMuted() ? '🔇' : '🔊';
  });
} else if (sfxToggle) {
  sfxToggle.hidden = true;
}

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
const copyLinkBtn = document.getElementById('copy-link-btn');
const showQrBtn = document.getElementById('show-qr-btn');
const qrPanel = document.getElementById('qr-panel');
const qrImage = document.getElementById('qr-image');
const joinUrlDisplay = document.getElementById('join-url');
let currentJoinUrl = null;
let qrRendered = false;
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
const previewPrivate = document.getElementById('preview-private');
const previewRevealBtn = document.getElementById('preview-reveal-btn');

// Elements - Teacher view chip (click-to-reveal PIN)
const teacherViewToggle = document.getElementById('teacher-view-toggle');
const teacherViewInfo = document.getElementById('teacher-view-info');
let currentTeacherPin = null;

// The host screen is projected — the PIN only appears on a deliberate
// click (peek before projecting, or cup a hand over it), and a second
// click hides it again.
teacherViewToggle.addEventListener('click', () => {
  if (!teacherViewInfo.hidden) {
    teacherViewInfo.hidden = true;
    return;
  }
  teacherViewInfo.textContent = 'On your phone: ' + window.location.origin +
    '/teacher · PIN ' + (currentTeacherPin || '????');
  teacherViewInfo.hidden = false;
});

// Preview content stays off the projector until deliberately revealed.
previewRevealBtn.addEventListener('click', () => {
  previewPrivate.hidden = !previewPrivate.hidden;
  previewRevealBtn.textContent = previewPrivate.hidden
    ? '👁 Show on this screen'
    : 'Hide from this screen';
});

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

// Elements - Merge
const mergeSection = document.getElementById('merge-section');
const mergeHostInstruction = document.getElementById('merge-host-instruction');
const mergeCounter = document.getElementById('merge-counter');
const mergeHostTimer = document.getElementById('merge-host-timer');
const mergeCloseBtn = document.getElementById('merge-close-btn');

// Elements - One Voice
const oneVoiceSection = document.getElementById('one-voice-section');
const oneVoiceCount = document.getElementById('one-voice-count');
const oneVoiceAttempt = document.getElementById('one-voice-attempt');
const oneVoiceBar = document.getElementById('one-voice-bar');
const oneVoiceBest = document.getElementById('one-voice-best');
const oneVoiceBanner = document.getElementById('one-voice-banner');
const oneVoiceMuteBtn = document.getElementById('one-voice-mute-btn');
const oneVoiceContinueBtn = document.getElementById('one-voice-continue-btn');

// Elements - Rate
const rateSection = document.getElementById('rate-section');
const ratePrompt = document.getElementById('rate-prompt');
const rateCounter = document.getElementById('rate-counter');
const rateTimer = document.getElementById('rate-timer');
const rateCloseBtn = document.getElementById('rate-close-btn');
const rateResults = document.getElementById('rate-results');
const rateContinueBtn = document.getElementById('rate-continue-btn');

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

// Elements - Turn (charades / describe-it)
const turnSection = document.getElementById('turn-section');
const turnTeamName = document.getElementById('turn-team-name');
const turnDescriberLine = document.getElementById('turn-describer-line');
const turnItemCard = document.getElementById('turn-item-card');
const turnInstructionLine = document.getElementById('turn-instruction-line');
const turnScoreboard = document.getElementById('turn-scoreboard');
const turnRemainingLine = document.getElementById('turn-remaining-line');
const turnTimerEl = document.getElementById('turn-timer');
let turnTimerHostInterval = null;

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

// Elements - Phase images
const collectImage = document.getElementById('collect-image');
const revealImage = document.getElementById('reveal-image');
const announceImage = document.getElementById('announce-image');

// Elements - Phase videos (host/projector only)
const collectVideo = document.getElementById('collect-video');
const revealVideo = document.getElementById('reveal-video');
const announceVideo = document.getElementById('announce-video');

// --- Phase image helper ---
// Sets src on the section's <img.phase-image> and respects the 'image' show toggle.
function applyImage(imgEl, url, show) {
  if (!imgEl) return;
  // If show toggles are set and don't include 'image', hide regardless of url.
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

// --- Phase video helper ---
// Sets the YouTube embed src on the section's <iframe.phase-video> and respects
// the 'video' show toggle. Blanking src (not just hiding) stops playback/audio.
function applyVideo(frameEl, url, show) {
  if (!frameEl) return;
  if (show && !show.includes('video')) {
    frameEl.hidden = true;
    frameEl.src = '';
    return;
  }
  if (url) {
    frameEl.src = url;
    frameEl.hidden = false;
  } else {
    frameEl.hidden = true;
    frameEl.src = '';
  }
}

// Stop every embedded video (blank its src) — called on each phase transition
// so a video never keeps playing audio behind the next phase.
function stopAllVideos() {
  for (const f of document.querySelectorAll('.phase-video')) {
    f.hidden = true;
    f.src = '';
  }
}

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

// --- Host recovery: F5 / browser crash / server restart ---
// If this tab (session) was hosting a room, rebind to it instead of showing
// the create-room screen. The server holds rooms through a host-disconnect
// grace window and can resurrect them from snapshots after a restart.
socket.on('connect', () => {
  try {
    const params = new URLSearchParams(window.location.search);
    // "Host a Game" from home appends ?new=1 to mean "start fresh": forget any
    // stale host session left in this tab from a prior game and show the picker.
    // We strip the param so a later F5 on this new game still recovers normally.
    if (params.get('new')) {
      try { sessionStorage.removeItem('lanyardHostSession'); } catch (e) { /* ignore */ }
      history.replaceState(null, '', '/host');
      return;
    }
    // ?game= / prototype launches always want a FRESH room (the editor's
    // Prototype button, sim harnesses) — never rebind those to an old one.
    if (params.get('game') || params.get('prototype')) return;
    const saved = JSON.parse(sessionStorage.getItem('lanyardHostSession') || 'null');
    if (saved && saved.code && saved.hostToken) {
      socket.emit('host-rejoin', { code: saved.code, hostToken: saved.hostToken });
    }
  } catch (e) { /* storage unavailable */ }
});

socket.on('host-rejoin-error', () => {
  // Room is genuinely gone — forget it and stay on the normal create screen.
  try { sessionStorage.removeItem('lanyardHostSession'); } catch (e) { /* ignore */ }
});

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

// --- Share the room: copy join link + QR code ---
// Both are student-facing (they help kids join), so they belong on the
// projected host screen — unlike the moderation panel, which does not.

if (copyLinkBtn) {
  copyLinkBtn.addEventListener('click', () => {
    if (!currentJoinUrl) return;
    const flash = () => {
      const prev = copyLinkBtn.textContent;
      copyLinkBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyLinkBtn.textContent = prev; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentJoinUrl).then(flash).catch(() => fallbackCopy(currentJoinUrl, flash));
    } else {
      fallbackCopy(currentJoinUrl, flash);
    }
  });
}

function fallbackCopy(text, onDone) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (onDone) onDone();
  } catch (e) { /* clipboard blocked — the link is shown on-screen to copy by hand */ }
}

if (showQrBtn) {
  showQrBtn.addEventListener('click', () => {
    if (!qrPanel) return;
    if (!qrPanel.hidden) {
      qrPanel.hidden = true;
      showQrBtn.textContent = '📱 Show QR code';
      return;
    }
    if (!qrRendered) renderJoinQr();
    qrPanel.hidden = false;
    showQrBtn.textContent = '📱 Hide QR code';
  });
}

function renderJoinQr() {
  if (!currentJoinUrl || !qrImage || typeof qrcode !== 'function') return;
  try {
    const qr = qrcode(0, 'M');        // type 0 = auto-size, 'M' = ~15% error correction
    qr.addData(currentJoinUrl);
    qr.make();
    qrImage.src = qr.createDataURL(8, 16); // cellSize px, margin px
    qrRendered = true;
  } catch (e) {
    // QR is a convenience; the code + link still work if generation fails.
    if (qrPanel) qrPanel.hidden = true;
  }
}

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
  // Don't rebind to the finished room after the reload — start fresh.
  try { sessionStorage.removeItem('lanyardHostSession'); } catch (e) { /* ignore */ }
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
    'merge-close-btn',
    'one-voice-continue-btn',
    'buzz-finish-btn',
    'estimate-close-btn', 'estimate-continue-btn',
    'rate-close-btn', 'rate-continue-btn',
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

socket.on('room-created', ({ code, game, theme, teacherPin, hostToken, restored }) => {
  currentRoomCode = code;
  currentTeacherPin = teacherPin || null;
  roomCodeDisplay.textContent = code;
  gameNameDisplay.textContent = game || '';

  // Build the student join link from whatever origin the host loaded from, so
  // it's correct on Render (public URL) and on a LAN IP alike. Student-facing,
  // so it's fine on the projected screen. QR renders lazily on first show.
  currentJoinUrl = window.location.origin + '/player?code=' + encodeURIComponent(code);
  if (joinUrlDisplay) joinUrlDisplay.textContent = currentJoinUrl;
  qrRendered = false;
  if (qrPanel) qrPanel.hidden = true;
  if (showQrBtn) showQrBtn.textContent = '📱 Show QR code';
  teacherViewInfo.hidden = true; // PIN stays hidden until deliberately revealed

  // Remember this room so an F5 (or a server restart) can rebind instead of
  // killing the game for the whole class.
  if (hostToken) {
    try {
      sessionStorage.setItem('lanyardHostSession', JSON.stringify({ code, hostToken }));
    } catch (e) { /* storage unavailable */ }
  }
  if (restored) {
    console.log('[host] Rebound to room ' + code);
  }

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
  if (J) J.sound('pop');
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
      if (remaining > 0 && J) J.sound('tick');
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

socket.on('game-started', ({ prompt, image, video, timer, hostTemplate, show }) => {
  showSection(collectSection);
  promptDisplay.textContent = prompt;
  submissionCount.textContent = '0 of 0 submitted';
  applyTemplate(collectSection, hostTemplate);
  applyImage(collectImage, image, show);
  applyVideo(collectVideo, video, show);
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
  if (J) J.sound('blip');
});

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
  // Private by default: this screen is projected. The teacher reviews on
  // their Teacher view, or deliberately reveals here.
  previewPrivate.hidden = true;
  previewRevealBtn.textContent = '👁 Show on this screen';
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

socket.on('show-results', ({ content, aiResult, responses, image, video, hostTemplate, hostShow }) => {
  showSection(revealSection);
  if (J) J.sound('reveal');
  aiResultDisplay.textContent = content || aiResult;
  aiResultDisplay.classList.toggle('chart', /[█░]/.test(aiResultDisplay.textContent || ''));
  applyTemplate(revealSection, hostTemplate);
  applyImage(revealImage, image, hostShow);
  applyVideo(revealVideo, video, hostShow);
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

socket.on('announce', ({ message, image, video, timer, hostTemplate, hostShow }) => {
  showSection(announceSection);
  announceMessage.textContent = message;
  applyTemplate(announceSection, hostTemplate);
  applyImage(announceImage, image, hostShow);
  applyVideo(announceVideo, video, hostShow);
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

  if (J) J.sound('tada');
  leaderboardStandings.innerHTML = '';
  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    const p = document.createElement('p');
    // Medal based on rank, not array index, so tied players share medals
    // (e.g. two players tied for 1st both get gold; no silver awarded).
    const avatar = J ? J.avatarFor(s.name) + ' ' : '';
    p.textContent = '#' + s.rank + ' ' + avatar + s.name + ' \u2014 ' + s.score + ' pts';
    // Rows pop in one after another, top rank first.
    p.classList.add('juice-stagger');
    p.style.animationDelay = Math.min(i * 0.12, 1.2) + 's';
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
  if (J) J.sound('reveal');
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
      p.textContent = (J ? J.avatarFor(m.name) + ' ' : '') + m.name;
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
  if (J) J.sound('blip');
});

// --- Socket events - One Voice (Connection Pack: cooperative counting) ---

// Teacher-speaker audio (spec §4.5 v1): every successful tap is spoken
// through the TEACHER's machine via the Web Speech API — the room hears
// one shared voice counting upward. No mics, no streaming, no permissions.
// This tiny util is the host bundle's room-audio seed; future phases that
// want room audio should reuse it.
let roomVoiceMuted = false;
function roomSpeak(text) {
  if (roomVoiceMuted) return;
  if (typeof speechSynthesis === 'undefined') return; // not supported — silent fallback
  try {
    speechSynthesis.cancel(); // fast taps shouldn't queue up a backlog
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 1.1;
    speechSynthesis.speak(u);
  } catch (e) { /* audio is garnish — never break the game over it */ }
}

let oneVoiceTarget = 20;

function renderOneVoice({ count, attempt, bestRun, target }) {
  if (target) oneVoiceTarget = target;
  oneVoiceCount.textContent = count;
  oneVoiceAttempt.textContent = 'Attempt ' + attempt;
  oneVoiceBest.textContent = bestRun > 0 ? 'Best run so far: ' + bestRun + ' of ' + oneVoiceTarget : '';
  oneVoiceBar.style.width = Math.min(100, Math.round((count / oneVoiceTarget) * 100)) + '%';
}

socket.on('one-voice-start', (data) => {
  showSection(oneVoiceSection);
  oneVoiceBanner.hidden = true;
  oneVoiceSection.classList.remove('one-voice-celebrating');
  renderOneVoice(data);
  applyTemplate(oneVoiceSection, data.hostTemplate);
});

socket.on('one-voice-count', (data) => {
  renderOneVoice(data);
  roomSpeak(data.count);
});

socket.on('one-voice-reset', (data) => {
  renderOneVoice(data);
  oneVoiceBanner.hidden = false;
  oneVoiceBanner.textContent = data.final
    ? 'That was our last try — what a run. Best: ' + data.bestRun + ' of ' + oneVoiceTarget + '.'
    : 'Two voices! Back to one…';
  if (!data.final) {
    setTimeout(() => { oneVoiceBanner.hidden = true; }, (data.lockoutMs || 800) + 1200);
  }
});

socket.on('one-voice-success', (data) => {
  renderOneVoice(data);
  if (J) J.confetti(); // shared win — no fanfare; roomSpeak below is the voice of this moment
  oneVoiceSection.classList.add('one-voice-celebrating');
  oneVoiceBanner.hidden = false;
  oneVoiceBanner.textContent = 'WE DID IT — ' + oneVoiceTarget + ', as one voice! (Attempt ' + data.attempt + ')';
  roomSpeak(data.count + '! We did it!');
});

oneVoiceMuteBtn.addEventListener('click', () => {
  roomVoiceMuted = !roomVoiceMuted;
  oneVoiceMuteBtn.textContent = roomVoiceMuted ? '🔇 Voice off' : '🔊 Voice on';
});

oneVoiceContinueBtn.addEventListener('click', () => {
  socket.emit('close-one-voice', { code: currentRoomCode });
});

// --- Socket events - Buzz (first-tap-wins buzzer rounds) ---

const buzzSection = document.getElementById('buzz-section');
const buzzPrompt = document.getElementById('buzz-prompt');
const buzzQuestionNum = document.getElementById('buzz-question-num');
const buzzStatus = document.getElementById('buzz-status');
const buzzJudgeRow = document.getElementById('buzz-judge-row');
const buzzCorrectBtn = document.getElementById('buzz-correct-btn');
const buzzWrongBtn = document.getElementById('buzz-wrong-btn');
const buzzControls = document.getElementById('buzz-controls');
const buzzNextBtn = document.getElementById('buzz-next-btn');
const buzzFinishBtn = document.getElementById('buzz-finish-btn');
const buzzScores = document.getElementById('buzz-scores');

function renderBuzzScores(scores) {
  buzzScores.innerHTML = '';
  const entries = Object.entries(scores || {});
  buzzScores.hidden = entries.length === 0; // .standings draws a surface box even when empty
  if (!entries.length) return;
  // Names come with the scores via the players list we can't see here, so
  // the server sends scores keyed by playerId — resolve via the lobby list?
  // Simpler: the server includes names in buzz events; this renders the
  // last-known name map.
  entries.sort((a, b) => b[1] - a[1]);
  for (const [pid, pts] of entries) {
    const p = document.createElement('p');
    const name = buzzNames[pid] || '…';
    p.textContent = (J ? J.avatarFor(name) + ' ' : '') + name + ' — ' + pts + ' pts';
    buzzScores.appendChild(p);
  }
}
const buzzNames = {}; // playerId → name, learned from buzz events

socket.on('buzz-start', ({ prompt, question, scores, hostTemplate, show }) => {
  showSection(buzzSection);
  buzzPrompt.textContent = prompt || 'Listen for the question!';
  buzzQuestionNum.textContent = 'Question ' + (question || 1);
  buzzStatus.textContent = 'Buzzer is OPEN — ask away!';
  buzzStatus.classList.remove('buzz-status-locked');
  buzzJudgeRow.hidden = true;
  renderBuzzScores(scores);
  applyTemplate(buzzSection, hostTemplate);
  applyShow(show, {
    prompt: buzzPrompt,
    buzzed: buzzStatus,
    scores: buzzScores,
    controls: buzzControls
  });
});

socket.on('buzz-locked', ({ playerId, playerName }) => {
  buzzNames[playerId] = playerName;
  buzzStatus.textContent = '🔔 ' + (J ? J.avatarFor(playerName) + ' ' : '') + playerName + ' buzzed in!';
  buzzStatus.classList.add('buzz-status-locked');
  buzzJudgeRow.hidden = false;
  if (J) J.sound('reveal');
});

socket.on('buzz-result', ({ correct, playerId, playerName, scores, points }) => {
  buzzNames[playerId] = playerName;
  buzzJudgeRow.hidden = true;
  if (correct) {
    buzzStatus.textContent = '✓ ' + playerName + ' +' + points + ' — click "Next question" when ready';
    if (J) J.sound('tada');
  } else {
    buzzStatus.textContent = '✗ ' + playerName + ' — buzzer reopened!';
    buzzStatus.classList.remove('buzz-status-locked');
    if (J) J.sound('womp');
  }
  renderBuzzScores(scores);
});

socket.on('buzz-open', ({ question, scores }) => {
  buzzQuestionNum.textContent = 'Question ' + question;
  buzzStatus.textContent = 'Buzzer is OPEN — ask away!';
  buzzStatus.classList.remove('buzz-status-locked');
  buzzJudgeRow.hidden = true;
  renderBuzzScores(scores);
});

buzzCorrectBtn.addEventListener('click', () => {
  socket.emit('buzz-judge', { code: currentRoomCode, correct: true });
});
buzzWrongBtn.addEventListener('click', () => {
  socket.emit('buzz-judge', { code: currentRoomCode, correct: false });
});
buzzNextBtn.addEventListener('click', () => {
  socket.emit('buzz-next', { code: currentRoomCode });
});
buzzFinishBtn.addEventListener('click', () => {
  socket.emit('buzz-finish', { code: currentRoomCode });
});

// --- Socket events - Estimate (numeric guessing) ---

const estimateSection = document.getElementById('estimate-section');
const estimatePrompt = document.getElementById('estimate-prompt');
const estimateImage = document.getElementById('estimate-image');
const estimateTimer = document.getElementById('estimate-timer');
const estimateCounter = document.getElementById('estimate-counter');
const estimateCloseBtn = document.getElementById('estimate-close-btn');
const estimateResults = document.getElementById('estimate-results');
const estimateContinueBtn = document.getElementById('estimate-continue-btn');

socket.on('estimate-start', ({ prompt, unit, image, count, total, timer, hostTemplate, show }) => {
  showSection(estimateSection);
  estimatePrompt.textContent = prompt + (unit ? ' (' + unit + ')' : '');
  applyImage(estimateImage, image, show);
  estimateCounter.textContent = (count || 0) + ' of ' + total + ' guessed';
  estimateCloseBtn.hidden = false;
  estimateCloseBtn.disabled = false;
  estimateResults.hidden = true;
  estimateResults.innerHTML = '';
  estimateContinueBtn.hidden = true;
  applyTemplate(estimateSection, hostTemplate);
  applyShow(show, {
    prompt: estimatePrompt,
    counter: estimateCounter,
    timer: estimateTimer,
    closeButton: estimateCloseBtn,
    results: estimateResults
  });
  if (timer) {
    startTimer(timer, estimateTimer, () => {
      estimateCloseBtn.click();
    });
  }
});

socket.on('estimate-progress', ({ count, total }) => {
  estimateCounter.textContent = count + ' of ' + total + ' guessed';
  if (J) J.sound('blip');
});

socket.on('estimate-results', ({ answer, unit, stats, guesses }) => {
  clearTimer();
  estimateTimer.hidden = true;
  estimateCloseBtn.hidden = true;
  estimateContinueBtn.hidden = false;
  if (J) J.sound('reveal');

  let html = '';
  if (answer != null) {
    html += '<div class="estimate-answer">The answer: <strong>' + answer +
            (unit ? ' ' + unit : '') + '</strong></div>';
  }
  if (stats && stats.count > 0) {
    html += '<p class="estimate-stats">' + stats.count + ' guesses · average ' +
            Math.round(stats.average * 100) / 100 +
            ' · median ' + stats.median + '</p>';
  }
  html += '<div class="estimate-guess-list">';
  for (let i = 0; i < (guesses || []).length; i++) {
    const g = guesses[i];
    const avatar = J ? J.avatarFor(g.name) + ' ' : '';
    html += '<p class="' + (g.score > 0 ? 'estimate-winner' : '') + '">' +
            avatar + escapeHtml(g.name) + ' — ' + g.value +
            (g.score > 0 ? ' (+' + g.score + ')' : '') + '</p>';
  }
  html += '</div>';
  estimateResults.innerHTML = html;
  estimateResults.hidden = false;
});

estimateCloseBtn.addEventListener('click', () => {
  socket.emit('close-estimates', { code: currentRoomCode });
  estimateCloseBtn.disabled = true;
});

estimateContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

// --- Socket events - Merge (Connection Pack: think-pair-share) ---

socket.on('merge-progress', ({ instruction, totalGroups, submittedGroups, timer, hostTemplate, show }) => {
  // First emit (phase enter) carries the instruction — set up the section.
  // Later emits only update the progress counter.
  if (instruction !== undefined) {
    showSection(mergeSection);
    mergeHostInstruction.textContent = instruction || 'Groups are merging their answers';
    applyTemplate(mergeSection, hostTemplate);
    applyShow(show, {
      instruction: mergeHostInstruction,
      counter: mergeCounter,
      timer: mergeHostTimer,
      closeButton: mergeCloseBtn
    });
    if (timer) {
      startTimer(timer, mergeHostTimer, () => {
        socket.emit('close-merge', { code: currentRoomCode });
      });
    }
  }
  mergeCounter.textContent = (submittedGroups || 0) + ' of ' + totalGroups + ' groups merged';
});

mergeCloseBtn.addEventListener('click', () => {
  socket.emit('close-merge', { code: currentRoomCode });
});

// --- Socket events - Rate ---

socket.on('rate-start', ({ prompt, scales, visibility, totalRaters, timer, hostTemplate, show }) => {
  showSection(rateSection);
  ratePrompt.textContent = prompt || (visibility === 'host-only' ? 'Rate (results private to you)' : 'Rate');
  rateCounter.textContent = '0 of ' + totalRaters + ' rated';
  rateResults.hidden = true;
  rateResults.innerHTML = '';
  rateContinueBtn.hidden = true;
  rateCloseBtn.hidden = false;
  rateCloseBtn.disabled = false;
  applyTemplate(rateSection, hostTemplate);
  applyShow(show, {
    prompt: ratePrompt,
    counter: rateCounter,
    timer: rateTimer,
    closeButton: rateCloseBtn,
    results: rateResults
  });
  if (timer) {
    startTimer(timer, rateTimer, () => {
      socket.emit('close-rating', { code: currentRoomCode });
    });
  }
});

socket.on('rate-received', ({ count, total }) => {
  rateCounter.textContent = count + ' of ' + total + ' rated';
  if (J) J.sound('blip');
});

socket.on('rate-results', ({ scales, averages, distributions, raterCount, visibility }) => {
  rateResults.hidden = false;
  rateCloseBtn.hidden = true;
  rateContinueBtn.hidden = false;
  rateResults.innerHTML = renderHostRateResults(scales, averages, distributions, raterCount, visibility);
});

rateCloseBtn.addEventListener('click', () => {
  socket.emit('close-rating', { code: currentRoomCode });
  rateCloseBtn.disabled = true;
});

rateContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

function renderHostRateResults(scales, averages, distributions, raterCount, visibility) {
  scales = scales || [];
  averages = averages || {};
  distributions = distributions || {};
  return '<p class="rate-results-header">' + raterCount + ' rater' + (raterCount === 1 ? '' : 's') +
         (visibility === 'host-only' ? ' &middot; <em>only you see this</em>' : '') + '</p>' +
         hostAveragesChart(scales, averages) +
         hostDistributionPies(scales, distributions);
}

function hostValueColor(v, min, max) {
  const range = (max - min) || 1;
  const t = (v - min) / range;
  const hue = Math.round(t * 120);
  return `hsl(${hue}, 70%, 50%)`;
}

function hostAveragesChart(scales, averages) {
  let html = '<div class="rate-avg-section"><h3>Average</h3><div class="rate-avg-bars">';
  for (const s of scales) {
    const avg = averages[s.id] || 0;
    const range = (s.max - s.min) || 1;
    const pct = Math.max(0, Math.min(100, ((avg - s.min) / range) * 100));
    const color = hostValueColor(avg, s.min, s.max);
    html += `<div class="rate-avg-row">
               <div class="rate-avg-label">${s.label}</div>
               <div class="rate-avg-bar-track"><div class="rate-avg-bar-fill" style="width:${pct}%; background:${color};"></div></div>
               <div class="rate-avg-value">${avg.toFixed(2)} / ${s.max}</div>
             </div>`;
  }
  html += '</div></div>';
  return html;
}

function hostDistributionPies(scales, distributions) {
  let html = '<div class="rate-dist-section"><h3>Distribution</h3><div class="rate-pies">';
  for (const s of scales) {
    const dist = distributions[s.id] || {};
    let total = 0;
    for (let v = s.min; v <= s.max; v++) total += (dist[v] || 0);
    html += `<div class="rate-pie-card">
               <div class="rate-pie-title">${s.label}</div>
               ${hostRenderPie(s, dist, total)}
               ${hostRenderPieLegend(s, dist)}
             </div>`;
  }
  html += '</div></div>';
  return html;
}

function hostRenderPie(scale, dist, total) {
  if (total === 0) return '<div class="rate-pie rate-pie-empty">no ratings</div>';
  const stops = [];
  let cumDeg = 0;
  for (let v = scale.min; v <= scale.max; v++) {
    const n = dist[v] || 0;
    if (n === 0) continue;
    const deg = (n / total) * 360;
    const color = hostValueColor(v, scale.min, scale.max);
    stops.push(`${color} ${cumDeg}deg ${cumDeg + deg}deg`);
    cumDeg += deg;
  }
  return `<div class="rate-pie" style="background: conic-gradient(${stops.join(', ')});"></div>`;
}

function hostRenderPieLegend(scale, dist) {
  let html = '<div class="rate-pie-legend">';
  for (let v = scale.min; v <= scale.max; v++) {
    const n = dist[v] || 0;
    const color = hostValueColor(v, scale.min, scale.max);
    html += `<div class="rate-pie-legend-row">
               <span class="rate-pie-swatch" style="background:${color};"></span>
               <span class="rate-pie-legend-val">${v}</span>
               <span class="rate-pie-legend-count">${n}</span>
             </div>`;
  }
  html += '</div>';
  return html;
}

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
  if (J) J.sound('blip');
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

// --- Socket events - Turn (charades / describe-it) ---

function renderTurnScoreboard(teamScores) {
  turnScoreboard.innerHTML = '';
  if (!teamScores) return;
  for (const [t, s] of Object.entries(teamScores)) {
    const div = document.createElement('div');
    div.className = 'turn-score-row';
    div.innerHTML = '<span class="turn-score-team">' + t + '</span>' +
                    '<span class="turn-score-value">' + s + '</span>';
    turnScoreboard.appendChild(div);
  }
}

function startHostTurnTimer(endAt) {
  if (turnTimerHostInterval) { clearInterval(turnTimerHostInterval); turnTimerHostInterval = null; }
  if (!endAt) { turnTimerEl.hidden = true; return; }
  turnTimerEl.hidden = false;
  const totalSec = Math.max(1, Math.round((endAt - Date.now()) / 1000));
  const txt = turnTimerEl.querySelector('.timer-ring-text');
  const fill = turnTimerEl.querySelector('.timer-ring-fill');
  const circumference = 2 * Math.PI * 52;
  if (fill) {
    fill.style.strokeDasharray = circumference;
    fill.style.strokeDashoffset = 0;
  }
  function tick() {
    const remainingMs = Math.max(0, endAt - Date.now());
    const sec = Math.ceil(remainingMs / 1000);
    if (txt) txt.textContent = sec;
    if (fill) {
      const frac = Math.max(0, remainingMs / (totalSec * 1000));
      fill.style.strokeDashoffset = (1 - frac) * circumference;
    }
    if (remainingMs <= 0) { clearInterval(turnTimerHostInterval); turnTimerHostInterval = null; }
  }
  tick();
  turnTimerHostInterval = setInterval(tick, 200);
}

socket.on('turn-start', ({ teamName, describerName, timerEndAt, teamScores }) => {
  showSection(turnSection);
  turnTeamName.textContent = teamName ? teamName + "'s turn" : '';
  turnDescriberLine.textContent = describerName ? describerName + ' is describing' : '';
  renderTurnScoreboard(teamScores);
  startHostTurnTimer(timerEndAt);
});

socket.on('turn-item', ({ role, item, teamName, describerName, instruction, teamScores, remaining, timerEndAt }) => {
  if (role !== 'host') return; // host listens for its host-role packet
  showSection(turnSection);
  turnTeamName.textContent = teamName ? teamName + "'s turn" : '';
  turnDescriberLine.textContent = describerName ? describerName + ' is describing' : '';
  turnItemCard.textContent = item || '';
  turnItemCard.hidden = !item;
  turnInstructionLine.textContent = instruction || '';
  turnInstructionLine.hidden = !instruction;
  turnRemainingLine.textContent = (typeof remaining === 'number') ? (remaining + ' items left') : '';
  renderTurnScoreboard(teamScores);
  startHostTurnTimer(timerEndAt);
});

socket.on('turn-end', ({ reason, teamScores }) => {
  turnItemCard.textContent = reason === 'pool-empty' ? 'Pool empty!' : "Time's up!";
  renderTurnScoreboard(teamScores);
  if (turnTimerHostInterval) { clearInterval(turnTimerHostInterval); turnTimerHostInterval = null; }
  turnTimerEl.hidden = true;
});

socket.on('turn-complete', ({ teamScores }) => {
  turnTeamName.textContent = 'Round complete!';
  turnItemCard.textContent = '';
  turnItemCard.hidden = true;
  turnDescriberLine.textContent = '';
  turnInstructionLine.hidden = true;
  turnRemainingLine.textContent = '';
  renderTurnScoreboard(teamScores);
  if (turnTimerHostInterval) { clearInterval(turnTimerHostInterval); turnTimerHostInterval = null; }
  turnTimerEl.hidden = true;
});

socket.on('game-ended', ({ message, hostTemplate, hostShow } = {}) => {
  showSection(endSection);
  if (J) J.sound('tada');
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
  if (J) J.sound('blip');
});

// --- Socket events - Elimination ---

socket.on('elimination-results', ({ eliminatedNames, remaining, hostTemplate, hostShow }) => {
  showSection(eliminationSection);
  if (J) J.sound('womp');
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
  if (J) {
    J.sound('fanfare');
    J.confetti();
  }
  if (isTie && winnerNames && winnerNames.length > 1) {
    winnerNameDisplay.textContent = formatTieNames(winnerNames) + ' tie!';
  } else {
    const avatar = J ? J.avatarFor(winnerName) + ' ' : '';
    winnerNameDisplay.textContent = avatar + winnerName + ' wins!';
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
      var rowAvatar = J ? J.avatarFor(standings[i].name) + ' ' : '';
      p.textContent = (i + 1) + '. ' + rowAvatar + standings[i].name + ' \u2014 ' + standings[i].score;
      p.classList.add('juice-stagger');
      p.style.animationDelay = Math.min(i * 0.12, 1.2) + 's';
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
    if (J) {
      avatar.classList.add('juice-emoji');
      avatar.textContent = J.avatarFor(player.name);
    } else {
      avatar.textContent = player.name.charAt(0).toUpperCase();
    }
    avatar.style.background = nameToColor(player.name);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;

    const kickBtn = document.createElement('button');
    kickBtn.type = 'button';
    kickBtn.className = 'player-kick-btn';
    kickBtn.title = 'Remove ' + player.name;
    kickBtn.textContent = '✕';
    kickBtn.addEventListener('click', () => {
      if (window.confirm('Remove ' + player.name + ' from the game? They cannot rejoin this session.')) {
        socket.emit('moderate-kick', { code: currentRoomCode, playerId: player.id });
      }
    });

    li.appendChild(avatar);
    li.appendChild(nameSpan);
    li.appendChild(kickBtn);
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
  teamSplitSection, rankSection, mergeSection, oneVoiceSection, wagerSection, relaySection, rateSection,
  buzzSection, estimateSection,
  phaseErrorSection, endSection
];

function showSection(el) {
  clearTimer();
  stopAllVideos();
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
