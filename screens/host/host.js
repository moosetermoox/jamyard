/**
 * host.js — the projector / host screen client.
 *
 * One big socket.io client that renders every phase's PUBLIC, big-screen view:
 * the lobby + QR/code join, prompts and timers, and each phase type's results
 * (buzz, estimate, rank, rate, wager, relay, one-voice, leaderboards, winner).
 * Because this screen is PROJECTED to the whole class, nothing teacher-private
 * (moderation, student names mid-collect) belongs here — that lives on the
 * /teacher console. Phase dispatch is by socket event; showSection() swaps the
 * single active <section>.
 */

// Default theme — paste-up: paper and ink on gesso, one loud vermillion. Applied
// immediately so even pre-game lobby screens look like the rest of the app.
// A game with its own theme will override this on room-created.
if (window.applyGameTheme) {
  window.applyGameTheme('totem');
}

const socket = io();

// --- Juice (sounds + confetti + avatars) ---
// Garnish from /shared/juice.js; guarded so a load failure can't break the game.
const J = window.Juice || null;
const sfxToggle = document.getElementById('sfx-toggle');
function labelSfxToggle(isMuted) {
  sfxToggle.textContent = isMuted ? 'Sound off' : 'Sound on';
  // Screen readers announce the action, not just an emoji.
  sfxToggle.setAttribute('aria-label', isMuted ? 'Turn sound effects on' : 'Turn sound effects off');
  sfxToggle.title = isMuted ? 'Turn sound effects on' : 'Turn sound effects off';
}
if (sfxToggle && J) {
  labelSfxToggle(J.muted());
  sfxToggle.addEventListener('click', () => {
    labelSfxToggle(J.toggleMuted());
  });
} else if (sfxToggle) {
  sfxToggle.hidden = true;
}

// --- Full screen: the projector wants the whole screen, no browser chrome ---
const fullscreenToggle = document.getElementById('fullscreen-toggle');
function labelFullscreenToggle() {
  const on = !!document.fullscreenElement;
  fullscreenToggle.textContent = on ? 'Exit full screen' : 'Full screen';
  fullscreenToggle.title = on
    ? 'Back to the normal window (Esc works too)'
    : 'Show this screen full screen (Esc leaves)';
  fullscreenToggle.setAttribute('aria-label', fullscreenToggle.title);
}
if (fullscreenToggle && document.documentElement.requestFullscreen) {
  labelFullscreenToggle();
  fullscreenToggle.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      // Denied (rare: iframe sandbox, browser policy) = nothing happens;
      // the button is a convenience, F11 still exists.
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  // Esc / F11 / OS gestures change fullscreen without the button: keep the
  // label truthful wherever the change came from.
  document.addEventListener('fullscreenchange', labelFullscreenToggle);
} else if (fullscreenToggle) {
  fullscreenToggle.hidden = true;
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
let isRollingRoom = false; // start:"rolling": the doorway card stays up all activity
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
const previewPrivacyHint = document.getElementById('preview-privacy-hint');

// Elements - Teacher view chip (copy-link pairing)
const teacherViewChip = document.getElementById('teacher-view-chip');
let currentTeacherPin = null;
// The rebind credential for THIS room, kept in memory so a socket
// reconnect can rejoin even when sessionStorage is unavailable.
let currentHostToken = null;
// Where this tab was opened from (a ?game= launch keeps its game here
// after the address is tidied), so Play again relaunches the same thing.
// A Host button that opened the teacher console in a new tab put its
// pairing nonce here (shared/host-launch.js); read at load, because the
// address is tidied to /host as soon as the room exists. Play again gets
// the launch address WITHOUT it: a fresh room pairs a fresh tab or none.
const PAIR_NONCE = new URLSearchParams(window.location.search).get('pair') || null;
const LAUNCH_URL = (function () {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('pair');
    return u.href;
  } catch (e) { return window.location.href; }
})();
let teacherConsolePaired = false;

// The host screen is projected, so pairing never shows the PIN on the wall:
// the button puts a /teacher deep link (code + PIN in the hash fragment, so
// it never reaches server logs) on the clipboard. Paste it into another
// window if you're extending your display, or send it to a second device.
// Console joins are announced loudly (below) so a hijacked pairing can't
// happen silently.
const teacherLinkCopyBtn = document.getElementById('teacher-link-copy');
let copyFeedbackTimer = null;
function showCopyFeedback(text) {
  teacherLinkCopyBtn.textContent = text;
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => {
    teacherLinkCopyBtn.textContent = 'Copy teacher link';
    copyFeedbackTimer = null;
  }, 2500);
}
teacherLinkCopyBtn.addEventListener('click', () => {
  if (!currentRoomCode) return;
  let link = window.location.origin + '/teacher#code=' + currentRoomCode;
  if (currentTeacherPin) link += '&pin=' + currentTeacherPin;
  const done = () => showCopyFeedback('✓ Copied, paste it in a private window');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link, done));
  } else {
    fallbackCopy(link, done);
  }
});

// Pairing visibility: announce every console join on the projector chip.
// Not in preview mode: the map rail pairs as a console on every launch,
// and "Teacher device connected" on the practice board reads as a ghost.
const teacherDeviceNotice = document.getElementById('teacher-device-notice');
// The console put this step's discussion prompt on the class screen. The
// text is the step's own field (server-read, never client text); the card
// clears itself on the next step (showSection).
const discussionCard = document.getElementById('discussion-card');
const discussionCardText = document.getElementById('discussion-card-text');
socket.on('discussion-prompt', ({ text } = {}) => {
  if (!discussionCard || !text) return;
  setRichText(discussionCardText, text);
  discussionCard.hidden = false;
});

socket.on('teacher-console-joined', ({ deviceCount }) => {
  if (new URLSearchParams(window.location.search).get('prototype') === 'true') return;
  teacherConsolePaired = true;
  if (teacherDeviceNotice) {
    teacherDeviceNotice.hidden = false;
    teacherDeviceNotice.textContent = deviceCount > 1
      ? '💻 ' + deviceCount + ' teacher devices connected'
      : '💻 Teacher device connected';
  }
});

// Preview content stays off the projector until deliberately revealed.
previewRevealBtn.addEventListener('click', () => {
  previewPrivate.hidden = !previewPrivate.hidden;
  previewRevealBtn.textContent = previewPrivate.hidden
    ? 'Show on this screen'
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
const winnerEntryDisplay = document.getElementById('winner-entry');
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
const teamSplitHeading = document.getElementById('team-split-heading');
const teamSplitTeams = document.getElementById('team-split-teams');
const teamSplitContinueBtn = document.getElementById('team-split-continue-btn');
const teamArrange = document.getElementById('team-arrange');
const teamArrangeUnassigned = document.getElementById('team-arrange-unassigned');
const teamArrangeTeams = document.getElementById('team-arrange-teams');
const teamArrangeConfirmBtn = document.getElementById('team-arrange-confirm-btn');
const teamChoice = document.getElementById('team-choice');
const teamChoiceCounter = document.getElementById('team-choice-counter');
const teamChoiceTeams = document.getElementById('team-choice-teams');
const teamChoiceConfirmBtn = document.getElementById('team-choice-confirm-btn');

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

// Elements - shared display drawings (drawingFrom: the round's drawing stays
// on the projector while students title it / vote on it)
const collectDrawing = document.getElementById('collect-drawing');
const announceDrawing = document.getElementById('announce-drawing');

// --- Display-drawing helper ---
// Paints a strokes array onto the section's canvas, hides the canvas when
// the phase has no drawing.
function applyDisplayDrawing(canvasEl, strokes) {
  if (!canvasEl) return;
  if (strokes && strokes.length && window.Draw) {
    canvasEl.hidden = false;
    Draw.renderStrokes(canvasEl, strokes);
  } else {
    canvasEl.hidden = true;
  }
}

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
    // Teacher text: **bold** paints, markers never show
    setRichText(tmplDiv, templateText);
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
// The decision itself lives in host-session.js (pure, tested). The one
// rule that matters in a classroom: a tab that is ALREADY hosting a room
// rebinds on every reconnect, whatever its URL says. The 2026-09-10 bug:
// the projector tab sat behind the teacher console, its socket blipped,
// and the old ?game= guard skipped the rejoin, so every student who joined
// afterwards showed on the console and never on the projector.
socket.on('connect', () => {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('lanyardHostSession') || 'null'); } catch (e) { /* storage unavailable */ }
  const action = HostSession.connectAction({
    search: window.location.search,
    live: currentRoomCode && currentHostToken ? { code: currentRoomCode, hostToken: currentHostToken } : null,
    saved
  });
  if (action.kind === 'rejoin') {
    socket.emit('host-rejoin', { code: action.code, hostToken: action.hostToken });
  } else if (action.kind === 'forget') {
    // "Host a Game" from home appends ?new=1 to mean "start fresh": forget any
    // stale host session left in this tab from a prior game and show the picker.
    // We strip the param so a later F5 on this new game still recovers normally.
    try { sessionStorage.removeItem('lanyardHostSession'); } catch (e) { /* ignore */ }
    history.replaceState(null, '', '/host');
  }
  // 'fresh' (?game= / prototype page load) and 'none' fall through to the
  // picker; the games-list handler auto-creates the ?game= room.
});

socket.on('host-rejoin-error', () => {
  // Room is genuinely gone — forget it and stay on the normal create screen.
  try { sessionStorage.removeItem('lanyardHostSession'); } catch (e) { /* ignore */ }
});

socket.on('games-list', ({ games }) => {
  // Public picker is curated: featured built-ins + this device's creations
  // (owner mode shows everything). A ?game= deep link (Prototype Mode) still
  // works even when the target isn't in the curated list.
  const params0 = new URLSearchParams(window.location.search);
  const deepLinked = params0.get('game');
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
    gameSelect.innerHTML = '<option value="">No activities available</option>';
    createRoomBtn.disabled = true;
    return;
  }
  for (const game of games) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    gameSelect.appendChild(option);
  }

  // Show what the selected activity actually is before committing to a room.
  const descEl = document.getElementById('game-select-desc');
  const updateDesc = () => {
    const chosen = games.find(g => g.id === gameSelect.value);
    if (descEl) descEl.textContent = (chosen && chosen.description) || '';
    // Remembered past room creation: the lobby's start hint reads it.
    selectedGameMinPlayers = (chosen && chosen.minPlayers) || null;
  };
  gameSelect.addEventListener('change', updateDesc);
  updateDesc();

  // Auto-select game from URL param and create room
  const params = new URLSearchParams(window.location.search);
  const autoGame = params.get('game');
  if (autoGame) {
    const match = Array.from(gameSelect.options).find(o => o.value === autoGame);
    if (match) {
      gameSelect.value = autoGame;
      // Programmatic select fires no 'change' — sync the description +
      // minPlayers stash (the start hint read the WRONG game's minimum
      // on every library deep link until 2026-08-08).
      updateDesc();
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
      showQrBtn.textContent = 'Show QR code';
      return;
    }
    if (!qrRendered) renderJoinQr();
    qrPanel.hidden = false;
    showQrBtn.textContent = 'Hide QR code';
  });
}

// --- Rolling start doorway --------------------------------------------
// The code, the address, the QR and a live head count, pinned beside
// every section. Student-facing, so fine on the projector.
const rollingDoor = document.getElementById('rolling-door');

function renderRollingDoor(code) {
  if (!rollingDoor) return;
  const codeEl = document.getElementById('rolling-door-code');
  codeEl.textContent = '';
  for (let i = 0; i < String(code).length; i++) {
    const block = document.createElement('span');
    block.className = 'code-block code-block-' + (i % 4);
    block.textContent = String(code)[i];
    codeEl.appendChild(block);
  }
  const instr = document.getElementById('rolling-door-instructions');
  instr.textContent = '';
  instr.append('Go to ');
  const hostSpan = document.createElement('strong');
  hostSpan.textContent = window.location.host + '/player';
  instr.append(hostSpan);
  instr.append(' and enter this code');
  const qrEl = document.getElementById('rolling-door-qr');
  qrEl.hidden = true;
  if (currentJoinUrl && typeof qrcode === 'function') {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(currentJoinUrl);
      qr.make();
      qrEl.src = qr.createDataURL(5, 8);
      qrEl.hidden = false;
    } catch (e) { /* the code and address still work */ }
  }
  updateRollingDoorCount(playerList ? playerList.children.length : 0);
  rollingDoor.hidden = false;
}

function hideRollingDoor() {
  if (rollingDoor) rollingDoor.hidden = true;
}

function updateRollingDoorCount(n) {
  const el = document.getElementById('rolling-door-count');
  if (!el) return;
  el.textContent = n === 1 ? '1 in the room' : n + ' in the room';
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
  // Inside Try it out the bench owns the room: a reload here would open a
  // new room the pretend students, the console tab and the plan rail
  // never hear about (owner, 2026-09-12). Hand the click to the bench,
  // which resets and relaunches the same activity with the same count.
  if (new URLSearchParams(window.location.search).get('prototype') === 'true' && window.parent !== window) {
    window.parent.postMessage({ type: 'prototype-play-again' }, window.location.origin);
    return;
  }
  // Don't rebind to the finished room after the reload — start fresh. A
  // ?game= launch had its address tidied to /host once the room existed,
  // so go back to the launch address: the same activity, a new room.
  try { sessionStorage.removeItem('lanyardHostSession'); } catch (e) { /* ignore */ }
  if (LAUNCH_URL !== location.href) location.href = LAUNCH_URL;
  else location.reload();
});

// --- Socket events - Room setup ---

// Inside the bench (Try it out) the page wears in-bench: its own sound and
// full-screen chips hide, the bench toolbar drives them instead.
if (new URLSearchParams(window.location.search).get('prototype') === 'true') {
  document.body.classList.add('in-bench');
}

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
    'match-close-btn', 'match-continue-btn',
    'sort-close-btn', 'sort-continue-btn',
    'checklist-close-btn', 'checklist-continue-btn',
    'solo-quiz-close-btn', 'solo-quiz-continue-btn',
    'continue-btn',
    'announce-continue-btn',
    'leaderboard-continue-btn',
    'team-arrange-confirm-btn', 'team-choice-confirm-btn',
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
  // No visible button — fall back to a generic advance. The preview's
  // fast-forward loop opts out (noFallback): it retries on its own tick
  // and must never blow past an AI step that is still working.
  if (e.data.noFallback) return;
  if (currentRoomCode) socket.emit('advance-phase', { code: currentRoomCode });
});

socket.on('room-created', ({ code, game, theme, teacherPin, hostToken, restored, language, strings, start }) => {
  currentRoomCode = code;
  currentTeacherPin = teacherPin || null;
  // The projector's fixed labels (Start!, Close Voting...) in the
  // activity's language; server-generated continue labels arrive already
  // translated.
  if (window.UiLang) { UiLang.set(language, strings); UiLang.apply(); }
  // Each code letter is its own painted block (Totem: 10a)
  roomCodeDisplay.textContent = '';
  for (let i = 0; i < String(code).length; i++) {
    const block = document.createElement('span');
    block.className = 'code-block code-block-' + (i % 4);
    block.textContent = String(code)[i];
    roomCodeDisplay.appendChild(block);
  }
  gameNameDisplay.textContent = game || '';

  // The projected screen must tell students WHERE to go, not just the
  // code (usability test 2026-08-01: "my kids would ask what do I type?").
  var joinInstructions = document.getElementById('join-instructions');
  if (joinInstructions) {
    // The address itself gets its own big span: 16px body text was
    // unreadable from the back row (field feedback 2026-08-24).
    joinInstructions.textContent = '';
    joinInstructions.append('Go to ');
    var hostSpan = document.createElement('strong');
    hostSpan.className = 'join-host';
    hostSpan.textContent = window.location.host + '/player';
    joinInstructions.append(hostSpan);
    joinInstructions.append(' and enter this code');
    joinInstructions.hidden = false;
  }

  // Build the student join link from whatever origin the host loaded from, so
  // it's correct on Render (public URL) and on a LAN IP alike. Student-facing,
  // so it's fine on the projected screen. QR renders lazily on first show.
  currentJoinUrl = window.location.origin + '/player?code=' + encodeURIComponent(code);
  if (joinUrlDisplay) joinUrlDisplay.textContent = currentJoinUrl;
  qrRendered = false;
  if (qrPanel) qrPanel.hidden = true;
  if (showQrBtn) showQrBtn.textContent = 'Show QR code';
  teacherViewChip.hidden = false; // room exists, pairing is possible from any phase

  // Rolling start: the room opens straight into the first step (the
  // server sends it right after this), so the join code lives in a
  // pinned doorway card instead of the lobby.
  isRollingRoom = start === 'rolling';
  document.body.classList.toggle('rolling', isRollingRoom);
  if (isRollingRoom) renderRollingDoor(code);
  else hideRollingDoor();

  // Remember this room so an F5 (or a server restart) can rebind instead of
  // killing the game for the whole class.
  if (hostToken) {
    currentHostToken = hostToken;
    try {
      sessionStorage.setItem('lanyardHostSession', JSON.stringify({ code, hostToken }));
    } catch (e) { /* storage unavailable */ }
  }
  // A ?game= launch drops the param now that the room exists: an F5, or the
  // browser discarding this tab while the teacher console sat in front of
  // it, then rebinds to THIS room instead of minting a new one.
  const tidyPath = HostSession.urlAfterCreate(window.location.search);
  if (tidyPath && !restored) {
    try { history.replaceState(null, '', tidyPath); } catch (e) { /* ignore */ }
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
  // The roster + Start only mean something once a room exists.
  document.getElementById('players-section').hidden = false;
  startGameBtn.hidden = false;
  // Fresh room: show the empty state + the why-is-Start-grey hint now,
  // not on the first join.
  if (playerList.children.length === 0) {
    renderPlayerList([]);
    updateStartButton(0);
  }

  // Prototype mode: notify parent window of room code. The PIN rides
  // along (same-origin only) so the preview page can pair its map rail
  // as a console and follow the live phase.
  const params = new URLSearchParams(window.location.search);
  if (params.get('prototype') === 'true' && window.parent !== window) {
    window.parent.postMessage(
      { type: 'room-created', code: code, teacherPin: teacherPin || null },
      window.location.origin
    );
  }

  // Launched from a Host button that opened the teacher console in a new
  // tab (shared/host-launch.js): hand that tab the room. Same origin, the
  // teacher's own browser; nothing about it lands on this projected
  // screen beyond the checklist line.
  if (PAIR_NONCE && window.HostLaunch) {
    HostLaunch.publish(PAIR_NONCE, code, teacherPin || null);
    const stepConsole = document.getElementById('host-step-console');
    if (stepConsole) stepConsole.textContent = 'Your teacher console is open in another tab. For a second device: Copy teacher link, bottom corner.';
  }
});

socket.on('player-joined', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
  if (isRollingRoom) updateRollingDoorCount(players.length);
  if (J) J.sound('pop');
});

socket.on('player-left', ({ players }) => {
  renderPlayerList(players);
  updateStartButton(players.length);
  if (isRollingRoom) updateRollingDoorCount(players.length);
});

socket.on('player-disconnected', ({ players }) => {
  renderPlayerList(players);
});

socket.on('player-reconnected', ({ players }) => {
  renderPlayerList(players);
});

// --- Timer ---
let timerInterval = null;
let timerRemaining = 0;
let timerTotal = 0;
let timerContainerEl = null;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73

// "A bit more time" — sits under the countdown on the input phases the
// teacher can stretch (collect, choices, vote, estimate). One press asks
// the server for more time; the server broadcasts timer-extended so the
// projector and every student clock jump together (student timers do real
// work at 0: they auto-submit, so a projector-only stretch would be a lie).
const moreTimeBtn = document.createElement('button');
moreTimeBtn.type = 'button';
moreTimeBtn.id = 'more-time-btn';
moreTimeBtn.textContent = 'A bit more time';
moreTimeBtn.title = 'Add 30 seconds';
moreTimeBtn.hidden = true;
moreTimeBtn.addEventListener('click', () => {
  socket.emit('extend-timer', { code: currentRoomCode });
});

function showMoreTimeBtn(containerEl) {
  containerEl.insertAdjacentElement('afterend', moreTimeBtn);
  moreTimeBtn.hidden = false;
}

// The Totem timer is a chip that reads like a clock, not a ring
function formatTimerText(seconds) {
  if (seconds >= 60) {
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  return String(seconds);
}

function startTimer(seconds, containerEl, onExpire) {
  clearTimer();
  timerRemaining = seconds;
  timerTotal = seconds;
  timerContainerEl = containerEl;
  const textEl = containerEl.querySelector('.timer-ring-text');
  const fillEl = containerEl.querySelector('.timer-ring-fill');

  containerEl.hidden = false;
  containerEl.classList.remove('timer-warning');
  textEl.textContent = formatTimerText(timerRemaining);
  fillEl.style.strokeDashoffset = '0';

  timerInterval = setInterval(() => {
    timerRemaining--;
    textEl.textContent = formatTimerText(timerRemaining);
    const offset = RING_CIRCUMFERENCE * (1 - timerRemaining / timerTotal);
    fillEl.style.strokeDashoffset = offset;
    if (timerRemaining <= 5) {
      containerEl.classList.add('timer-warning');
      if (timerRemaining > 0 && J) J.sound('tick');
    }
    if (timerRemaining <= 0) {
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
  timerContainerEl = null;
  moreTimeBtn.hidden = true;
  collectTimer.hidden = true;
  collectTimer.classList.remove('timer-warning');
  voteTimer.hidden = true;
  voteTimer.classList.remove('timer-warning');
  announceTimer.hidden = true;
  announceTimer.classList.remove('timer-warning');
}

// The server said yes (any teacher device may have asked): shift the
// running countdown and let the ring breathe again.
socket.on('timer-extended', ({ addSeconds }) => {
  const add = Number(addSeconds) || 0;
  if (!timerInterval || !timerContainerEl || add <= 0) return;
  timerRemaining += add;
  timerTotal += add;
  const textEl = timerContainerEl.querySelector('.timer-ring-text');
  const fillEl = timerContainerEl.querySelector('.timer-ring-fill');
  textEl.textContent = formatTimerText(timerRemaining);
  fillEl.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - timerRemaining / timerTotal);
  if (timerRemaining > 5) timerContainerEl.classList.remove('timer-warning');
  if (J) J.sound('blip');
});

// --- Socket events - Game phases ---

// The pile IS the count (Totem: 10b): one block per submission, newest
// lands on top with the arrival animation. The chip carries the number,
// so the pile can cap its height for big classes.
const SUBMISSION_PILE_MAX = 10;

function renderSubmissionPile(count) {
  const wrap = document.getElementById('submission-pile-wrap');
  const pile = document.getElementById('submission-pile');
  if (!wrap || !pile) return;
  // Live Poll: the tally is the picture, the pile stays down.
  wrap.hidden = liveTallyOn;
  const want = Math.min(count || 0, SUBMISSION_PILE_MAX);
  while (pile.children.length > want) pile.removeChild(pile.firstChild);
  while (pile.children.length < want) {
    const block = document.createElement('div');
    block.className = 'pile-block pile-block-' + (pile.children.length % 9) + ' t-arrive';
    pile.insertBefore(block, pile.firstChild);
  }
}

// Live Poll: the tally is the picture. Rows come from the server
// (counts only); the first draw is every choice at zero.
const liveTallyEl = document.getElementById('live-tally');
let liveTallyOn = false;

function renderLiveTally(rows) {
  if (!liveTallyEl || !window.ChartRender) return;
  liveTallyEl.textContent = '';
  liveTallyEl.appendChild(ChartRender.buildChart(rows || []));
}

socket.on('live-tally', ({ rows }) => {
  if (!liveTallyOn) return;
  renderLiveTally(rows);
});

socket.on('game-started', ({ prompt, image, video, displayDrawing, timer, count, total, hostTemplate, show, liveResults, choices }) => {
  document.body.classList.add('in-activity');
  showSection(collectSection);
  setRichText(promptDisplay, prompt);
  submissionCount.textContent = (count || 0) + ' of ' + (total || 0) + ' submitted';
  liveTallyOn = !!liveResults;
  if (liveTallyEl) liveTallyEl.hidden = !liveTallyOn;
  if (liveTallyOn) {
    renderLiveTally((Array.isArray(choices) ? choices : []).map(c => ({ label: String(c), count: 0, pct: 0 })));
  }
  const pileWrap = document.getElementById('submission-pile-wrap');
  if (pileWrap && liveTallyOn) pileWrap.hidden = true;
  renderSubmissionPile(count || 0);
  applyTemplate(collectSection, hostTemplate);
  applyImage(collectImage, image, show);
  applyVideo(collectVideo, video, show);
  applyDisplayDrawing(collectDrawing, displayDrawing);
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
    showMoreTimeBtn(collectTimer);
  }
});

socket.on('response-received', ({ playerName, count, total }) => {
  submissionCount.textContent = count + ' of ' + total + ' submitted';
  renderSubmissionPile(count);
  if (J) J.sound('blip');
});

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  // their Teacher view, or deliberately reveals here. If no console is
  // paired yet, point at the corner chip instead of a view they don't have.
  previewPrivacyHint.textContent = teacherConsolePaired
    ? 'The content is hidden from this (projected) screen. Review it on your Teacher view, or reveal it here.'
    : 'The content is hidden from this (projected) screen. No Teacher view open yet? Use "Copy teacher link" in the corner and paste it in a private window, or reveal it here.';
  previewPrivate.hidden = true;
  previewRevealBtn.textContent = 'Show on this screen';
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
    for (const { name, response, drawing } of responses) {
      const li = document.createElement('li');
      if (drawing && window.Draw) {
        li.innerHTML = '<strong>' + escapeHtml(name) + ':</strong> ';
        const thumb = document.createElement('canvas');
        thumb.className = 'reveal-drawing preview-drawing-thumb';
        thumb.width = 240;
        thumb.height = 180;
        Draw.renderStrokes(thumb, drawing);
        li.appendChild(thumb);
      } else {
        li.innerHTML = '<strong>' + escapeHtml(name) + ':</strong> ' + escapeHtml(response);
      }
      previewResponsesList.appendChild(li);
    }
  } else {
    previewResponses.hidden = true;
  }
});

socket.on('show-results', ({ content, aiResult, responses, image, video, continueLabel, hostTemplate, hostShow }) => {
  showSection(revealSection);
  if (J) J.sound('reveal');
  // The button says what happens next ("Start the voting"), not "Continue".
  continueBtn.textContent = continueLabel || UiLang.t('Continue');
  renderProjectorMessage(aiResultDisplay, content || aiResult);
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

// Projector formatting rule (docs/PROJECTOR-STYLE.md): a message's first
// line, when short, is the HEADLINE; everything after renders left-aligned
// with its line breaks kept — no more centered paragraph blobs.
// createElement/textContent only (student/teacher text is untrusted).

// Teacher-authored prompts and instructions show **bold** as bold
// (shared/rich-text.js applyInline: createElement/textContent only, so the
// text stays untrusted-safe). Falls back to plain text without the module.
function setRichText(el, text) {
  if (window.RichText && RichText.applyInline) RichText.applyInline(el, text);
  else el.textContent = text;
}

function renderProjectorMessage(el, message) {
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
        if (i === 0) appendProjectorParts(el, seg.text.trim());
        else el.appendChild(buildMessageBody(seg.text.trim(), 'msg-body'));
      }
    });
    return;
  }
  appendProjectorParts(el, text);
}

function appendProjectorParts(el, text) {
  var parts = text.split(/\n\s*\n/);
  var first = (parts[0] || '').trim();
  if (parts.length > 1 && first.length > 0 && first.length <= 60 && first.indexOf('\n') === -1) {
    var head = document.createElement('span');
    head.className = 'msg-headline';
    // AI first lines can arrive as "# HEADING" or "**HEADING**" — the
    // headline slot is already styled, so markers just get stripped.
    head.textContent = window.RichText ? RichText.plainLine(first) : first;
    el.appendChild(head);
    el.appendChild(buildMessageBody(parts.slice(1).join('\n\n'), 'msg-body'));
  } else {
    el.appendChild(buildMessageBody(text,
      text.indexOf('\n') !== -1 ? 'msg-body msg-body-solo' : 'msg-solo'));
  }
}

// Numbered lists ({{x.responses.list}} resolves to "1. …\n2. …") render as
// cards, one per row — not a text blob (PROJECTOR-STYLE rule 4).
function buildMessageBody(text, className) {
  var lines = text.split('\n');
  var numbered = lines.filter(function (l) { return /^\d+\.\s/.test(l.trim()); });
  if (numbered.length >= 2 && numbered.length >= lines.filter(Boolean).length - 1) {
    var wrap = document.createElement('div');
    wrap.className = 'msg-list';
    lines.forEach(function (line) {
      var m = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (!m) return;
      var card = document.createElement('div');
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
    return RichText.buildBody(text, className);
  }
  var span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

socket.on('announce', ({ message, image, video, displayDrawing, timer, continueLabel, hostTemplate, hostShow }) => {
  showSection(announceSection);
  announceContinueBtn.textContent = continueLabel || UiLang.t('Continue');
  renderProjectorMessage(announceMessage, message);
  applyTemplate(announceSection, hostTemplate);
  applyImage(announceImage, image, hostShow);
  applyVideo(announceVideo, video, hostShow);
  applyDisplayDrawing(announceDrawing, displayDrawing);
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

socket.on('leaderboard', ({ standings, teamStandings, style, final, timer, hostTemplate, show }) => {
  showSection(leaderboardSection);
  applyTemplate(leaderboardSection, hostTemplate);
  applyShow(show, {
    standings: leaderboardStandings,
    continueButton: leaderboardContinueBtn,
    timer: leaderboardTimer
  });

  if (J) {
    J.sound('tada');
    // The finale board (server says the end screen is next) is the winning
    // moment for leaderboard-ended activities like Speed Quiz — the meadow
    // blocks cheer on the projector. Mid-game boards stay quiet.
    if (final && J.cheer) J.cheer();
  }
  leaderboardStandings.innerHTML = '';
  if (teamStandings && teamStandings.length > 0) {
    // Team competition: teams lead the projector, each with its members'
    // contributions underneath.
    for (let i = 0; i < teamStandings.length; i++) {
      const t = teamStandings[i];
      const p = document.createElement('p');
      p.textContent = '#' + t.rank + ' ' + t.team + ': ' + t.score + ' pts';
      p.classList.add('juice-stagger', 'team-standing-row');
      p.style.animationDelay = Math.min(i * 0.12, 1.2) + 's';
      leaderboardStandings.appendChild(p);
      const members = document.createElement('p');
      members.className = 'team-standing-members juice-stagger';
      members.style.animationDelay = Math.min(i * 0.12, 1.2) + 's';
      members.textContent = t.members
        .map(m => m.name + ' ' + m.score)
        .join('  ·  ');
      leaderboardStandings.appendChild(members);
    }
  } else {
    for (let i = 0; i < standings.length; i++) {
      const s = standings[i];
      const p = document.createElement('p');
      // Medal based on rank, not array index, so tied players share medals
      // (e.g. two players tied for 1st both get gold; no silver awarded).
      p.textContent = '#' + s.rank + ' ' + s.name + ': ' + s.score + ' pts';
      // Rows pop in one after another, top rank first.
      p.classList.add('juice-stagger');
      p.style.animationDelay = Math.min(i * 0.12, 1.2) + 's';
      leaderboardStandings.appendChild(p);
    }
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
  setRichText(revealOneMessage, message || 'Reveal Time!');
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
  // Drawing items paint onto a canvas with an animated stroke replay —
  // the gallery moment. Everything else stays text.
  if (item && typeof item === 'object' && item.drawing && window.Draw) {
    const caption = document.createElement('p');
    caption.className = 'reveal-drawing-caption';
    caption.textContent = item.text || '';
    const canvas = document.createElement('canvas');
    canvas.className = 'reveal-drawing';
    canvas.width = 480;
    canvas.height = 360;
    div.appendChild(caption);
    div.appendChild(canvas);
    Draw.renderStrokes(canvas, item.drawing, { animate: true });
  } else {
    div.textContent = typeof item === 'string' ? item : ((item && (item.text || item.name)) || '');
  }
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

// Teacher-assign mode: tap a name, tap a team. Server re-emits the full
// setup after every assignment, so this just renders the payload.
let teamArrangeSelected = null; // playerId currently highlighted

socket.on('team-split-setup', ({ rosters, unassigned }) => {
  showSection(teamSplitSection);
  teamSplitHeading.textContent = 'Make the teams';
  teamArrange.hidden = false;
  teamChoice.hidden = true;
  teamSplitTeams.innerHTML = '';
  teamSplitContinueBtn.hidden = true;

  // Selected player may have just been assigned — drop stale selection
  if (teamArrangeSelected && !(unassigned || []).some(u => u.playerId === teamArrangeSelected)) {
    teamArrangeSelected = null;
  }

  teamArrangeUnassigned.innerHTML = '';
  for (const u of (unassigned || [])) {
    const chip = document.createElement('button');
    chip.className = 'team-chip' + (u.playerId === teamArrangeSelected ? ' team-chip-selected' : '');
    chip.textContent = u.name;
    chip.addEventListener('click', () => {
      teamArrangeSelected = teamArrangeSelected === u.playerId ? null : u.playerId;
      document.querySelectorAll('#team-arrange-unassigned .team-chip').forEach(c => c.classList.remove('team-chip-selected'));
      if (teamArrangeSelected === u.playerId) chip.classList.add('team-chip-selected');
    });
    teamArrangeUnassigned.appendChild(chip);
  }
  if ((unassigned || []).length === 0) {
    const done = document.createElement('p');
    done.className = 'team-arrange-hint';
    done.textContent = 'Everyone is placed. Confirm when it looks right.';
    teamArrangeUnassigned.appendChild(done);
  }

  teamArrangeTeams.innerHTML = '';
  for (const r of (rosters || [])) {
    const card = document.createElement('div');
    card.className = 'team-card team-card-tappable';
    const h3 = document.createElement('h3');
    h3.textContent = r.capacity == null
      ? r.name + ' (' + r.members.length + ')'
      : r.name + ' (' + r.members.length + '/' + r.capacity + ')';
    card.appendChild(h3);
    for (const m of r.members) {
      const p = document.createElement('p');
      p.className = 'team-chip-assigned';
      p.textContent = m.name;
      p.title = 'Tap to send back';
      p.addEventListener('click', (e) => {
        e.stopPropagation();
        socket.emit('team-assign', { code: currentRoomCode, playerId: m.playerId, team: '' });
      });
      card.appendChild(p);
    }
    card.addEventListener('click', () => {
      if (!teamArrangeSelected) return;
      socket.emit('team-assign', { code: currentRoomCode, playerId: teamArrangeSelected, team: r.name });
      teamArrangeSelected = null;
    });
    teamArrangeTeams.appendChild(card);
  }
});

teamArrangeConfirmBtn.addEventListener('click', () => {
  socket.emit('team-split-confirm', { code: currentRoomCode });
});

// Student-choice mode: the projector shows live rosters filling up.
function renderTeamChoiceHost(rosters, placed, total) {
  showSection(teamSplitSection);
  teamSplitHeading.textContent = 'Pick your team!';
  teamChoice.hidden = false;
  teamArrange.hidden = true;
  teamSplitTeams.innerHTML = '';
  teamSplitContinueBtn.hidden = true;
  teamChoiceCounter.textContent = placed + ' of ' + total + ' picked a spot';

  teamChoiceTeams.innerHTML = '';
  for (const r of (rosters || [])) {
    const card = document.createElement('div');
    card.className = 'team-card';
    const h3 = document.createElement('h3');
    // open == null means no caps (capacity:"open") — show the name only
    h3.textContent = r.open == null ? r.name
      : r.name + '. ' + r.open + (r.open === 1 ? ' spot' : ' spots') + ' left';
    card.appendChild(h3);
    for (const m of r.members) {
      const p = document.createElement('p');
      p.textContent = m.name;
      card.appendChild(p);
    }
    teamChoiceTeams.appendChild(card);
  }
}

socket.on('team-choice-start', ({ rosters, placed, total }) => {
  renderTeamChoiceHost(rosters, placed || 0, total || 0);
});

socket.on('team-choice-update', ({ rosters, placed, total }) => {
  renderTeamChoiceHost(rosters, placed, total);
  if (J) J.sound('blip');
});

teamChoiceConfirmBtn.addEventListener('click', () => {
  socket.emit('team-split-confirm', { code: currentRoomCode });
});

socket.on('team-split', ({ teams, hostTemplate, show }) => {
  showSection(teamSplitSection);
  teamSplitHeading.textContent = 'Teams';
  teamArrange.hidden = true;
  teamChoice.hidden = true;
  teamSplitContinueBtn.hidden = false;
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

// --- Socket events - Team roles (reuses the team-split boards) ---

// Choice mode: the projector shows each group's members claiming jobs.
function renderRoleBoardHost(groups, placed, total, headline) {
  showSection(teamSplitSection);
  teamSplitHeading.textContent = headline || 'Pick your role!';
  teamChoice.hidden = false;
  teamArrange.hidden = true;
  teamSplitTeams.innerHTML = '';
  teamSplitContinueBtn.hidden = true;
  teamChoiceCounter.textContent = placed + ' of ' + total + ' picked a role';

  teamChoiceTeams.innerHTML = '';
  for (const g of (groups || [])) {
    const card = document.createElement('div');
    card.className = 'team-card';
    const h3 = document.createElement('h3');
    h3.textContent = g.label;
    card.appendChild(h3);
    for (const m of (g.picks || [])) {
      const p = document.createElement('p');
      p.textContent = m.role ? m.name + ' · ' + m.role : m.name + ' ...';
      card.appendChild(p);
    }
    teamChoiceTeams.appendChild(card);
  }
}

socket.on('team-roles-start', (d) => {
  renderRoleBoardHost(d.groups, d.placed || 0, d.total || 0, d.prompt);
});

socket.on('team-roles-update', (d) => {
  renderRoleBoardHost(d.groups, d.placed, d.total, 'Pick your role!');
  if (J) J.sound('blip');
});

// Final deal (either method): the role lineup per group, host-paced.
socket.on('team-roles-final', (payload) => {
  showSection(teamSplitSection);
  teamSplitHeading.textContent = 'The roles';
  teamArrange.hidden = true;
  teamChoice.hidden = true;
  teamSplitContinueBtn.hidden = false;
  applyTemplate(teamSplitSection, payload.hostTemplate);

  teamSplitTeams.innerHTML = '';
  const groups = (payload.board && payload.board.groups) || [];
  for (const g of groups) {
    const card = document.createElement('div');
    card.className = 'team-card';
    const h3 = document.createElement('h3');
    h3.textContent = g.label;
    card.appendChild(h3);
    for (const m of (g.picks || [])) {
      const p = document.createElement('p');
      p.textContent = m.role ? m.name + ' · ' + m.role : m.name;
      card.appendChild(p);
    }
    teamSplitTeams.appendChild(card);
  }
  // Reconnect replays carry only the text lineup — show it as one card.
  if (groups.length === 0 && payload.rolesList) {
    const card = document.createElement('div');
    card.className = 'team-card';
    for (const line of String(payload.rolesList).split('\n')) {
      const p = document.createElement('p');
      p.textContent = line;
      card.appendChild(p);
    }
    teamSplitTeams.appendChild(card);
  }
});

// --- Socket events - Rank ---

socket.on('rank-start', ({ prompt, totalRankers, timer, hostTemplate, show }) => {
  showSection(rankSection);
  setRichText(rankPrompt, prompt || 'Rank the items');
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
    showMoreTimeBtn(rankTimer);
  }
});

socket.on('rank-received', ({ count, total }) => {
  rankCounter.textContent = count + ' of ' + total + ' ranked';
  if (J) J.sound('blip');
});

// --- Socket events - Match (pair two lists: vocab ↔ definitions) ---

const matchSection = document.getElementById('match-section');
const matchPrompt = document.getElementById('match-prompt');
const matchTimer = document.getElementById('match-timer');
const matchCounter = document.getElementById('match-counter');
const matchCloseBtn = document.getElementById('match-close-btn');
const matchResults = document.getElementById('match-results');
const matchContinueBtn = document.getElementById('match-continue-btn');

socket.on('match-start', ({ prompt, totalMatchers, timer, hostTemplate, show }) => {
  showSection(matchSection);
  setRichText(matchPrompt, prompt || 'Match the pairs!');
  matchCounter.textContent = '0 of ' + totalMatchers + ' matched';
  matchCloseBtn.hidden = false;
  matchCloseBtn.disabled = false;
  matchResults.hidden = true;
  matchResults.innerHTML = '';
  matchContinueBtn.hidden = true;
  applyTemplate(matchSection, hostTemplate);
  applyShow(show, {
    prompt: matchPrompt,
    counter: matchCounter,
    timer: matchTimer,
    closeButton: matchCloseBtn,
    results: matchResults
  });
  if (timer) {
    startTimer(timer, matchTimer, () => {
      matchCloseBtn.click();
    });
    showMoreTimeBtn(matchTimer);
  }
});

socket.on('match-received', ({ count, total }) => {
  matchCounter.textContent = count + ' of ' + total + ' matched';
  if (J) J.sound('blip');
});

// The reveal is a discussion moment: per-pair class accuracy shows which
// pairs the room nailed or missed. Host clicks Continue when done talking.
socket.on('match-results', ({ results, players }) => {
  clearTimer();
  matchTimer.hidden = true;
  matchCloseBtn.hidden = true;
  matchContinueBtn.hidden = false;
  if (J) J.sound('reveal');

  let html = '<div class="match-accuracy-list">';
  for (const r of (results || [])) {
    html += '<div class="match-accuracy-row">' +
      '<span class="match-accuracy-pair">' + escapeHtml(r.left) + ' → ' + escapeHtml(r.right) + '</span>' +
      '<span class="match-accuracy-bar"><span class="match-accuracy-fill" style="width:' + r.pct + '%"></span></span>' +
      '<span class="match-accuracy-pct">' + r.pct + '%</span>' +
      '</div>';
  }
  html += '</div>';
  if ((players || []).length > 0) {
    html += '<div class="match-player-list">';
    for (const p of players) {
      html += '<p>' + escapeHtml(p.name) + '. ' + p.correct + ' correct' +
        (p.score > 0 ? ' (+' + p.score + ')' : '') + '</p>';
    }
    html += '</div>';
  }
  matchResults.innerHTML = html;
  matchResults.hidden = false;
});

matchCloseBtn.addEventListener('click', () => {
  socket.emit('close-matching', { code: currentRoomCode });
  matchCloseBtn.disabled = true;
});

matchContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

// --- Socket events - Sort (place items into named buckets) ---

const sortSection = document.getElementById('sort-section');
const sortPrompt = document.getElementById('sort-prompt');
const sortTimer = document.getElementById('sort-timer');
const sortCounter = document.getElementById('sort-counter');
const sortCloseBtn = document.getElementById('sort-close-btn');
const sortResults = document.getElementById('sort-results');
const sortContinueBtn = document.getElementById('sort-continue-btn');

socket.on('sort-start', ({ prompt, totalSorters, timer, hostTemplate, show }) => {
  showSection(sortSection);
  setRichText(sortPrompt, prompt || 'Sort the items!');
  sortCounter.textContent = '0 of ' + totalSorters + ' sorted';
  sortCloseBtn.hidden = false;
  sortCloseBtn.disabled = false;
  sortResults.hidden = true;
  sortResults.innerHTML = '';
  sortContinueBtn.hidden = true;
  applyTemplate(sortSection, hostTemplate);
  applyShow(show, {
    prompt: sortPrompt,
    counter: sortCounter,
    timer: sortTimer,
    closeButton: sortCloseBtn,
    results: sortResults
  });
  if (timer) {
    startTimer(timer, sortTimer, () => {
      sortCloseBtn.click();
    });
    showMoreTimeBtn(sortTimer);
  }
});

socket.on('sort-received', ({ count, total }) => {
  sortCounter.textContent = count + ' of ' + total + ' sorted';
  if (J) J.sound('blip');
});

// The reveal is a discussion moment: graded rounds show per-item accuracy,
// consensus polls show how the class split. Host clicks Continue when done.
socket.on('sort-results', ({ graded, results, players }) => {
  clearTimer();
  sortTimer.hidden = true;
  sortCloseBtn.hidden = true;
  sortContinueBtn.hidden = false;
  if (J) J.sound('reveal');

  let html = '<div class="sort-results-list">';
  for (const r of (results || [])) {
    html += '<div class="sort-result-row">';
    html += '<span class="sort-result-text">' + escapeHtml(r.text) +
            (r.correct ? ' → <strong>' + escapeHtml(r.correct) + '</strong>' : '') + '</span>';
    html += '<span class="sort-result-counts">';
    for (const [bucket, n] of Object.entries(r.counts || {})) {
      const isCorrect = r.correct === bucket;
      html += '<span class="sort-count' + (isCorrect ? ' sort-count-correct' : '') + '">' +
              escapeHtml(bucket) + ': ' + n + '</span>';
    }
    html += '</span>';
    if (r.pct != null) {
      html += '<span class="match-accuracy-pct">' + r.pct + '%</span>';
    }
    html += '</div>';
  }
  html += '</div>';
  if (graded && (players || []).length > 0) {
    html += '<div class="match-player-list">';
    for (const p of players) {
      html += '<p>' + escapeHtml(p.name) + '. ' + p.correct + ' correct' +
        (p.score > 0 ? ' (+' + p.score + ')' : '') + '</p>';
    }
    html += '</div>';
  }
  sortResults.innerHTML = html;
  sortResults.hidden = false;
});

sortCloseBtn.addEventListener('click', () => {
  socket.emit('close-sorting', { code: currentRoomCode });
  sortCloseBtn.disabled = true;
});

sortContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
});

// --- Socket events - Checklist (shared group to-do dashboard) ---

const checklistSection = document.getElementById('checklist-section');
const checklistPrompt = document.getElementById('checklist-prompt');
const checklistTimer = document.getElementById('checklist-timer');
const checklistSummary = document.getElementById('checklist-summary');
const checklistProgress = document.getElementById('checklist-progress');
const checklistCloseBtn = document.getElementById('checklist-close-btn');
const checklistHostResults = document.getElementById('checklist-host-results');
const checklistContinueBtn = document.getElementById('checklist-continue-btn');

let checklistDoneKeys = new Set(); // groups already celebrated

function renderChecklistDashboard(progress, solo) {
  const doneCount = (progress || []).filter(p => p.complete).length;
  checklistSummary.textContent = doneCount + ' of ' + (progress || []).length +
    (solo ? ' students' : ' groups') + ' finished';

  checklistProgress.innerHTML = '';
  for (const p of (progress || [])) {
    const card = document.createElement('div');
    card.className = 'checklist-group' + (p.complete ? ' checklist-group-done' : '');
    const label = document.createElement('p');
    label.className = 'checklist-group-label';
    label.textContent = p.label + (p.complete ? ' ✓' : '');
    card.appendChild(label);
    const bar = document.createElement('div');
    bar.className = 'checklist-bar';
    const fill = document.createElement('div');
    fill.className = 'checklist-bar-fill';
    fill.style.width = (p.total > 0 ? Math.round((p.done / p.total) * 100) : 0) + '%';
    bar.appendChild(fill);
    card.appendChild(bar);
    const count = document.createElement('p');
    count.className = 'checklist-group-count';
    count.textContent = p.done + ' / ' + p.total;
    card.appendChild(count);
    checklistProgress.appendChild(card);

    // Celebrate each group exactly once, the moment it finishes
    if (p.complete && !checklistDoneKeys.has(p.key)) {
      checklistDoneKeys.add(p.key);
      if (J) { J.sound('tada'); J.confetti({ count: 30 }); }
    }
  }
}

socket.on('checklist-start', ({ prompt, progress, solo, timer, hostTemplate, show }) => {
  showSection(checklistSection);
  setRichText(checklistPrompt, prompt || 'Work through today\'s tasks!');
  checklistDoneKeys = new Set((progress || []).filter(p => p.complete).map(p => p.key));
  checklistCloseBtn.hidden = false;
  checklistCloseBtn.disabled = false;
  checklistHostResults.hidden = true;
  checklistHostResults.innerHTML = '';
  checklistContinueBtn.hidden = true;
  checklistProgress.hidden = false;
  applyTemplate(checklistSection, hostTemplate);
  applyShow(show, {
    prompt: checklistPrompt,
    summary: checklistSummary,
    progress: checklistProgress,
    timer: checklistTimer,
    closeButton: checklistCloseBtn
  });
  renderChecklistDashboard(progress, solo);
  if (timer) {
    startTimer(timer, checklistTimer, () => {
      checklistCloseBtn.click();
    });
    showMoreTimeBtn(checklistTimer);
  }
});

socket.on('checklist-update', (payload) => {
  if (!payload || !payload.progress) return; // player-shaped payloads carry group state
  if (checklistSection.hidden) return;
  renderChecklistDashboard(payload.progress, checklistSummary.textContent.includes('students'));
});

socket.on('checklist-results', ({ results, doneCount, groupCount, solo }) => {
  if (checklistSection.hidden) showSection(checklistSection);
  clearTimer();
  checklistTimer.hidden = true;
  checklistCloseBtn.hidden = true;
  checklistProgress.hidden = true;
  checklistContinueBtn.hidden = false;
  if (J) J.sound('reveal');

  let html = '<p class="big-text">' + doneCount + ' of ' + groupCount +
    (solo ? ' students' : ' groups') + ' finished everything</p>';
  html += '<div class="sort-results-list">';
  for (const r of (results || [])) {
    html += '<div class="sort-result-row"><span class="sort-result-text">' +
      escapeHtml(r.team) + '</span><span class="sort-result-counts">' +
      r.checked + ' / ' + r.total + (r.done ? ' ✓' : '') + '</span></div>';
  }
  html += '</div>';
  checklistHostResults.innerHTML = html;
  checklistHostResults.hidden = false;
});

checklistCloseBtn.addEventListener('click', () => {
  socket.emit('close-checklist', { code: currentRoomCode });
  checklistCloseBtn.disabled = true;
});

checklistContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode });
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
    ? 'That was our last try, what a run. Best: ' + data.bestRun + ' of ' + oneVoiceTarget + '.'
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
  oneVoiceBanner.textContent = 'WE DID IT. ' + oneVoiceTarget + ', as one voice! (Attempt ' + data.attempt + ')';
  roomSpeak(data.count + '! We did it!');
});

oneVoiceMuteBtn.addEventListener('click', () => {
  roomVoiceMuted = !roomVoiceMuted;
  oneVoiceMuteBtn.textContent = roomVoiceMuted ? 'Voice off' : 'Voice on';
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
    p.textContent = name + '. ' + pts + ' pts';
    buzzScores.appendChild(p);
  }
}
const buzzNames = {}; // playerId → name, learned from buzz events

socket.on('buzz-start', ({ prompt, question, scores, hostTemplate, show }) => {
  showSection(buzzSection);
  setRichText(buzzPrompt, prompt || 'Listen for the question!');
  buzzQuestionNum.textContent = 'Question ' + (question || 1);
  buzzStatus.textContent = 'Buzzer is OPEN, ask away!';
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
  buzzStatus.textContent = playerName + ' buzzed in!';
  buzzStatus.classList.add('buzz-status-locked');
  buzzJudgeRow.hidden = false;
  if (J) J.sound('reveal');
});

socket.on('buzz-result', ({ correct, playerId, playerName, scores, points }) => {
  buzzNames[playerId] = playerName;
  buzzJudgeRow.hidden = true;
  if (correct) {
    buzzStatus.textContent = '✓ ' + playerName + ' +' + points + ', click "Next question" when ready';
    if (J) J.sound('tada');
  } else {
    buzzStatus.textContent = '✗ ' + playerName + ', buzzer reopened!';
    buzzStatus.classList.remove('buzz-status-locked');
    if (J) J.sound('womp');
  }
  renderBuzzScores(scores);
});

socket.on('buzz-open', ({ question, scores }) => {
  buzzQuestionNum.textContent = 'Question ' + question;
  buzzStatus.textContent = 'Buzzer is OPEN, ask away!';
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
  setRichText(estimatePrompt, prompt + (unit ? ' (' + unit + ')' : ''));
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
    showMoreTimeBtn(estimateTimer);
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
    html += '<div class="estimate-answer">The answer: <strong>' + escapeHtml(answer) +
            (unit ? ' ' + escapeHtml(unit) : '') + '</strong></div>';
  }
  if (stats && stats.count > 0) {
    html += '<p class="estimate-stats">' + stats.count + ' guesses · average ' +
            Math.round(stats.average * 100) / 100 +
            ' · median ' + stats.median + '</p>';
  }
  html += '<div class="estimate-guess-list">';
  for (let i = 0; i < (guesses || []).length; i++) {
    const g = guesses[i];
    html += '<p class="' + (g.score > 0 ? 'estimate-winner' : '') + '">' +
            escapeHtml(g.name) + '. ' + escapeHtml(g.value) +
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
    setRichText(mergeHostInstruction, instruction || 'Groups are merging their answers');
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
      showMoreTimeBtn(mergeHostTimer);
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
  setRichText(ratePrompt, prompt || (visibility === 'host-only' ? 'Rate (results private to you)' : 'Rate'));
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
    showMoreTimeBtn(rateTimer);
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
               <div class="rate-avg-label">${escapeHtml(s.label)}</div>
               <div class="rate-avg-bar-track"><div class="rate-avg-bar-fill" style="width:${pct}%; background:${color};"></div></div>
               <div class="rate-avg-value">${avg.toFixed(2)} / ${escapeHtml(s.max)}</div>
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
               <div class="rate-pie-title">${escapeHtml(s.label)}</div>
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
  setRichText(wagerPrompt, prompt || 'Place your bets!');
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
    showMoreTimeBtn(wagerTimer);
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
    p.innerHTML = '<strong>' + escapeHtml(entry.name) + ':</strong> ' + escapeHtml(entry.text);
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
    div.innerHTML = '<span class="turn-score-team">' + escapeHtml(t) + '</span>' +
                    '<span class="turn-score-value">' + escapeHtml(s) + '</span>';
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
  setRichText(turnInstructionLine, instruction || '');
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

// End-screen report link: the door for teachers who never opened the
// console. Copies the PIN-carrying /teacher/report deep link WITHOUT ever
// displaying it (same projector rule as Copy teacher link; the fallback is
// a hidden textarea, so nothing appears on the wall). The report only
// exists while the room does, which is why this sits on the wrap-up screen.
const copyReportBtn = document.getElementById('copy-report-btn');
let reportCopyTimer = null;

// Back to the yard: the wrap-up screen's way out. Hidden in the simulator,
// where this screen sits in an iframe and the yard would open inside it.
const backToYardRow = document.querySelector('.end-yard-row');
if (backToYardRow && new URLSearchParams(window.location.search).get('prototype') === 'true') {
  backToYardRow.hidden = true;
}
copyReportBtn.addEventListener('click', () => {
  if (!currentRoomCode) return;
  let link = window.location.origin + '/teacher/report#code=' + currentRoomCode;
  if (currentTeacherPin) link += '&pin=' + currentTeacherPin;
  const done = () => {
    copyReportBtn.textContent = '✓ Copied, open it in a private window';
    if (reportCopyTimer) clearTimeout(reportCopyTimer);
    reportCopyTimer = setTimeout(() => {
      copyReportBtn.textContent = 'Copy report link';
      reportCopyTimer = null;
    }, 2500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link, done));
  } else {
    fallbackCopy(link, done);
  }
});

// --- Solo quiz (self-paced): the projector shows progress, never a question ---
const soloQuizSection = document.getElementById('solo-quiz-section');
const soloQuizTitle = document.getElementById('solo-quiz-title');
const soloQuizStatus = document.getElementById('solo-quiz-status');
const soloQuizBoard = document.getElementById('solo-quiz-board');
const soloQuizCloseBtn = document.getElementById('solo-quiz-close-btn');
const soloQuizContinueBtn = document.getElementById('solo-quiz-continue-btn');
let soloQuizInstanceId = null;

function renderSoloQuizBoard(data, final) {
  const total = data.total || 0;
  const finished = data.finished || 0;
  const working = Math.max(0, (data.started || 0) - finished);
  soloQuizStatus.textContent = final
    ? finished + ' ' + UiLang.t('finished') + (typeof data.averagePct === 'number' ? ' · ' + UiLang.t('class average') + ' ' + data.averagePct + '%' : '')
    : finished + ' ' + UiLang.t('finished') + ' · ' + working + ' ' + UiLang.t('working') + ' · ' + total + ' ' + UiLang.t('in the room');
  soloQuizBoard.textContent = '';
  (data.perQuestion || []).forEach((q) => {
    const row = document.createElement('div');
    row.className = 'sq-row';
    const label = document.createElement('span');
    label.className = 'sq-label';
    label.textContent = 'Q' + (q.index + 1);
    const track = document.createElement('div');
    track.className = 'sq-track';
    const fill = document.createElement('div');
    fill.className = 'sq-fill';
    fill.style.width = (q.answered > 0 ? Math.max(q.pct, 3) : 0) + '%';
    track.appendChild(fill);
    const value = document.createElement('span');
    value.className = 'sq-value';
    value.textContent = q.answered > 0 ? q.correct + ' / ' + q.answered : '\u2013';
    row.append(label, track, value);
    soloQuizBoard.appendChild(row);
  });
}

socket.on('solo-quiz-start', (data) => {
  showSection(soloQuizSection);
  soloQuizInstanceId = data.phaseInstanceId;
  soloQuizTitle.textContent = data.title || 'Quiz';
  soloQuizCloseBtn.hidden = false;
  soloQuizCloseBtn.disabled = false;
  soloQuizContinueBtn.hidden = true;
  applyTemplate(soloQuizSection, data.hostTemplate);
  renderSoloQuizBoard(data, false);
});

socket.on('solo-quiz-progress', (data) => {
  if (data.phaseInstanceId !== soloQuizInstanceId) return;
  renderSoloQuizBoard(data, false);
});

socket.on('solo-quiz-results', (data) => {
  if (data.phaseInstanceId !== soloQuizInstanceId) return;
  renderSoloQuizBoard(data, true);
  soloQuizCloseBtn.hidden = true;
  soloQuizContinueBtn.hidden = false;
  if (J) J.sound('reveal');
});

soloQuizCloseBtn.addEventListener('click', () => {
  soloQuizCloseBtn.disabled = true;
  socket.emit('close-solo-quiz', { code: currentRoomCode, phaseInstanceId: soloQuizInstanceId });
});

soloQuizContinueBtn.addEventListener('click', () => {
  socket.emit('advance-phase', { code: currentRoomCode, phaseInstanceId: soloQuizInstanceId });
});

socket.on('game-ended', ({ message, hostTemplate, hostShow } = {}) => {
  // The doorway closes with the activity.
  hideRollingDoor();
  document.body.classList.remove('rolling');
  showSection(endSection);
  if (J) J.sound('tada');
  const endMsg = endSection.querySelector('.game-over');
  if (message && endMsg) setRichText(endMsg, message);
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
  if (confirm('End the session for everyone?')) {
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
    showMoreTimeBtn(voteTimer);
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
  // A full tie eliminates nobody (engine/phases/eliminate-handler.js); say
  // so instead of an empty " eliminated!".
  eliminatedNamesDisplay.textContent = eliminatedNames.length
    ? eliminatedNames.join(', ') + ' eliminated!'
    : UiLang.t('Everyone tied, nobody is out this round.');
  remainingCount.textContent = remaining + ' players remaining';
  applyTemplate(eliminationSection, hostTemplate);
  applyShow(hostShow, {
    eliminated: eliminatedNamesDisplay,
    remaining: remainingCount,
    continueButton: eliminationContinueBtn
  });
});

// --- Socket events - Winner ---

let winnerRevealTimer = null;

socket.on('winner-announced', ({ winnerName, winnerScore, winnerNames, isTie, standings, winnerEntry, winnerEntries, hostTemplate, hostShow }) => {
  showSection(winnerSection);

  // Build-up beat: drumroll while the room holds its breath, then the crown
  // lands. The teacher-facing toggles still decide what's visible.
  const entryAllowed = !hostShow || hostShow.indexOf('entry') !== -1;
  winnerNameDisplay.classList.remove('winner-reveal');
  winnerNameDisplay.classList.add('winner-buildup');
  winnerNameDisplay.textContent = 'And the winner is\u2026';
  winnerEntryDisplay.hidden = true;
  winnerEntryDisplay.innerHTML = '';
  standingsList.innerHTML = '';
  if (J) J.sound('drumroll');
  applyTemplate(winnerSection, hostTemplate);
  applyShow(hostShow, {
    name: winnerNameDisplay,
    entry: winnerEntryDisplay,
    standings: standingsList,
    endButton: winnerEndBtn
  });
  winnerEntryDisplay.hidden = true; // stays hidden until the reveal fills it

  clearTimeout(winnerRevealTimer);
  winnerRevealTimer = setTimeout(function () {
    if (winnerSection.hidden) return; // phase moved on during the build-up
    winnerNameDisplay.classList.remove('winner-buildup');
    winnerNameDisplay.classList.add('winner-reveal');
    if (J) {
      J.sound('fanfare');
      // The winner's signature moment: the meadow blocks run in and cheer
      // (torn-paper confetti stays the garnish everywhere else).
      if (J.cheer) J.cheer(); else J.confetti();
    }
    if (isTie && winnerNames && winnerNames.length > 1) {
      winnerNameDisplay.textContent = '\ud83d\udc51 ' + formatTieNames(winnerNames) + ' tie!';
    } else {
      winnerNameDisplay.textContent = '\ud83d\udc51 ' + winnerName + ' wins!';
    }

    // What they won FOR \u2014 the winning entry itself, big on the projector.
    const entries = (isTie && winnerEntries && winnerEntries.length > 0) ? winnerEntries
      : (winnerEntry ? [{ text: winnerEntry }] : []);
    if (entries.length > 0 && entryAllowed) {
      for (var e = 0; e < entries.length; e++) {
        var quote = document.createElement('p');
        quote.className = 'winner-entry-quote';
        quote.textContent = '\u201c' + entries[e].text + '\u201d';
        winnerEntryDisplay.appendChild(quote);
        if (entries.length > 1 && entries[e].name) {
          var by = document.createElement('p');
          by.className = 'winner-entry-by';
          by.textContent = 'by ' + entries[e].name;
          winnerEntryDisplay.appendChild(by);
        }
      }
      winnerEntryDisplay.hidden = false;
    }

    if (standings && standings.length > 0) {
      for (var i = 0; i < standings.length; i++) {
        var p = document.createElement('p');
        p.textContent = (i + 1) + '. ' + standings[i].name + ': ' + standings[i].score;
        p.classList.add('juice-stagger');
        p.style.animationDelay = Math.min(i * 0.12, 1.2) + 's';
        standingsList.appendChild(p);
      }
    }
  }, 1500);
});

function formatTieNames(names) {
  if (names.length === 2) return names[0] + ' and ' + names[1];
  if (names.length === 3) return names[0] + ', ' + names[1] + ', and ' + names[2];
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

// --- Render functions ---

let selectedGameMinPlayers = null;

function renderPlayerList(players) {
  const emptyEl = document.getElementById('roster-empty');
  if (emptyEl) emptyEl.hidden = players.length > 0;
  const countEl = document.getElementById('roster-count');
  if (countEl) {
    countEl.textContent = players.length > 0 ? String(players.length) : '';
    countEl.hidden = players.length === 0;
  }
  playerList.innerHTML = '';
  for (const player of players) {
    const li = document.createElement('li');
    li.dataset.id = player.id;

    if (player.connected === false) {
      li.classList.add('player-disconnected');
    }

    // No avatar mark on the roster planks (owner call 2026-08-30: the
    // painted initial read as clutter) — the name alone is the block.
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;

    const kickBtn = document.createElement('button');
    kickBtn.type = 'button';
    kickBtn.className = 'player-kick-btn';
    kickBtn.title = 'Remove ' + player.name;
    kickBtn.textContent = '✕';
    kickBtn.addEventListener('click', () => {
      if (window.confirm('Remove ' + player.name + '? They cannot rejoin this session.')) {
        socket.emit('moderate-kick', { code: currentRoomCode, playerId: player.id });
      }
    });

    li.appendChild(nameSpan);
    li.appendChild(kickBtn);
    playerList.appendChild(li);
  }

  // Big classes wrap into side-by-side piles; the plinth and base board
  // widen so every pile still stands on the footing (stacks never float).
  const footing = document.querySelector('.roster-footing');
  if (footing) {
    const width = playerList.offsetWidth;
    const plinth = footing.querySelector('.t-plinth');
    const base = footing.querySelector('.t-baseboard');
    if (plinth) plinth.style.width = Math.max(130, Math.round(width * 0.45)) + 'px';
    if (base) base.style.width = Math.max(250, width + 36) + 'px';
  }
}

function updateStartButton(playerCount) {
  startGameBtn.disabled = playerCount < 1;
  // Say WHY Start is grey (2026-08-08 field test: a disabled button with no
  // explanation). Real rule: unlocks at the first student; below the
  // activity's minPlayers the hint stays informational, never blocking.
  const hint = document.getElementById('start-hint');
  if (!hint) return;
  if (playerCount < 1) {
    hint.textContent = 'Start unlocks when the first student joins.';
    hint.hidden = false;
  } else if (selectedGameMinPlayers && playerCount < selectedGameMinPlayers) {
    hint.textContent = 'Made for ' + selectedGameMinPlayers + '+ students, ' + playerCount + ' in so far.';
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
}

function renderResponses(responses) {
  responsesList.innerHTML = '';
  for (const { name, response } of responses) {
    const li = document.createElement('li');
    li.innerHTML = '<strong>' + escapeHtml(name) + ':</strong> ' + escapeHtml(response);
    responsesList.appendChild(li);
  }
}

const allSections = [
  lobbySection, collectSection, processSection, previewSection,
  revealSection, voteSection, eliminationSection, winnerSection,
  announceSection, leaderboardSection, revealOneSection,
  teamSplitSection, rankSection, mergeSection, oneVoiceSection, wagerSection, relaySection, rateSection,
  turnSection, buzzSection, estimateSection, matchSection, sortSection, checklistSection,
  soloQuizSection,
  phaseErrorSection, endSection
];

function showSection(el) {
  clearTimer();
  stopAllVideos();
  // A discussion prompt belongs to the step it was shown on (looked up
  // here, not via the const below: showSection can run before it exists)
  var shownPrompt = document.getElementById('discussion-card');
  if (shownPrompt) shownPrompt.hidden = true;
  // Content owns the projector: outside the lobby the brand shrinks to a
  // corner mark (docs/PROJECTOR-STYLE.md rule 1).
  document.body.classList.toggle('in-activity', el !== lobbySection);
  for (const s of allSections) {
    s.classList.remove('active');
    s.hidden = true;
  }
  el.hidden = false;
  // Force reflow so transition triggers
  void el.offsetWidth;
  el.classList.add('active');
}
