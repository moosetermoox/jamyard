// Teacher console — the private second-device view.
//
// The host screen is projected to the class, so anything "teacher-only"
// there is actually public. This page (on the teacher's laptop or a spare Chromebook)
// receives the live moderation list and preview content privately, and can
// hide/kick entries, approve/reject previews, close submissions, and
// advance steps. It joins via the deep link from the host screen's "Copy
// teacher link" button, which carries the room code + PIN in the hash
// (or rides the site password when one is set).

// websocket first (2026-09-20, measured on the live site): the default polling-then-upgrade left the first emits (create-room, join) riding HTTP for 80 to 210 ms; on a socket they take about 30. Polling stays as the fallback for a network that blocks websockets.
var socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
// A network that silently drops the websocket handshake reaches the connect timeout instead of a transport error; from then on connect the classic way (polling first, then upgrade), socket.io's documented fallback.
socket.on('connect_error', function () { socket.io.opts.transports = ['polling', 'websocket']; });

var joinSection = document.getElementById('join-section');
var consoleSection = document.getElementById('console-section');
var codeInput = document.getElementById('code-input');
var pinInput = document.getElementById('pin-input');
var joinBtn = document.getElementById('join-btn');
var joinError = document.getElementById('join-error');
var headerRoom = document.getElementById('header-room');

var phaseLabel = document.getElementById('phase-label');
var countLabel = document.getElementById('count-label');
var entriesBlock = document.getElementById('entries-block');
var entriesList = document.getElementById('entries-list');
var entriesHint = document.getElementById('entries-hint');
// The Live entries hint by who sees this step's answers (the server sends
// the audience key from engine/audience.js on teacher-phase and the join
// snapshot). Says what Hide does for THIS step; "generic" is the old line.
var ENTRIES_HINTS = {
  teacher: 'Only you can see these, now and in the report. They never reach the class or the projector. Hide anything you don\'t want in the report.',
  ai: 'Only you can see these. The AI puts them together for the class; hide anything that shouldn\'t go in, hidden entries are skipped.',
  class: 'Only you can see these until the reveal. Hide anything that shouldn\'t reach the class, hidden entries are skipped by the reveal.',
  'class-after-review': 'Only you can see these until you approve the preview. Hide anything that shouldn\'t reach the class, hidden entries are skipped by the reveal.',
  classmate: 'Only you can see the whole list. Each answer goes to a classmate next; hide anything that shouldn\'t be passed on.',
  'classmate+class': 'Only you can see the whole list. Each answer goes to a classmate next, then the class sees it; hide anything that shouldn\'t be passed on.',
  'classmate+class-after-review': 'Only you can see the whole list. Each answer goes to a classmate next, then the class after your preview; hide anything that shouldn\'t be passed on.',
  author: 'Only you can see the whole list. Each one goes back to the classmate whose work it is about; hide anything that shouldn\'t be passed on.',
  tally: 'Only you can see who gave which answer. The class sees only the totals.',
  scored: 'Only you can see who picked what. The class sees the points on the leaderboard.',
  generic: 'Only you can see these. Hide anything that shouldn\'t reach the class, hidden entries are skipped by the AI and the reveal.'
};
// The finished chains of a return-to-author reveal (server-sent on
// teacher-chains and in the join snapshot), each with a Show button.
var chainsBlock = document.getElementById('chains-block');
var chainsList = document.getElementById('chains-list');
// Who sees this step's answers: a Show button on an entry is offered
// unless the student was told only the teacher reads it.
var entriesAudience = null;
var previewBlock = document.getElementById('preview-block');
var previewText = document.getElementById('preview-text');
var previewRespBlock = document.getElementById('preview-resp-block');
var previewRespList = document.getElementById('preview-resp-list');
var approveBtn = document.getElementById('approve-btn');
var rejectBtn = document.getElementById('reject-btn');
var closeStepBtn = document.getElementById('close-step-btn');
var moreTimeBtn = document.getElementById('more-time-btn');
var revealNextBtn = document.getElementById('reveal-next-btn');
var nextStepBtn = document.getElementById('next-step-btn');
var controlsBlock = document.getElementById('controls-block');
var consoleNote = document.getElementById('console-note');
// Discussion prompt (screenControl.discussionPrompt on the step)
// The answer box for a guessing step (the teacher's own number, typed
// before the close). Console only; the projector learns it at the close.
var answerBlock = document.getElementById('answer-block');
var answerInput = document.getElementById('answer-input');
var setAnswerBtn = document.getElementById('set-answer-btn');
var answerSet = document.getElementById('answer-set');
var answerValue = document.getElementById('answer-value');
function showAnswerSet(answer) {
  if (!answerSet) return;
  var has = typeof answer === 'number' && isFinite(answer);
  answerSet.hidden = !has;
  if (has) answerValue.textContent = String(answer);
}
if (setAnswerBtn) {
  setAnswerBtn.addEventListener('click', function () {
    var n = parseFloat(answerInput.value);
    if (!isFinite(n)) { answerInput.focus(); return; }
    socket.emit('estimate-set-answer', { code: currentCode, answer: n, phaseInstanceId: currentPhaseInstanceId });
  });
  answerInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); setAnswerBtn.click(); }
  });
}
socket.on('teacher-estimate-answer', function (data) {
  if (!data || data.phaseInstanceId !== currentPhaseInstanceId) return;
  showAnswerSet(data.answer);
  if (answerInput && typeof data.answer === 'number') answerInput.value = String(data.answer);
});

var discussionBlock = document.getElementById('discussion-block');
var discussionText = document.getElementById('discussion-text');
var showDiscussionBtn = document.getElementById('show-discussion-btn');
var discussionShown = document.getElementById('discussion-shown');
var discussionForPhase = null;
if (showDiscussionBtn) {
  showDiscussionBtn.addEventListener('click', function () {
    if (!currentCode) return;
    // The server reads the text off the step itself; the console only asks.
    socket.emit('show-discussion', { code: currentCode });
    discussionShown.hidden = false;
    showDiscussionBtn.disabled = true;
  });
}

var checklistBlock = document.getElementById('checklist-block');
var checklistGroups = document.getElementById('checklist-groups');
var wordHelpBlock = document.getElementById('word-help-block');
var wordHelpList = document.getElementById('word-help-list');
var wordHelpEmpty = document.getElementById('word-help-empty');

// Word help: the words the class tapped, most tapped first. The block
// shows whenever the activity has word help on (an array, even empty);
// null means the activity has none.
function renderWordHelp(words) {
  if (!wordHelpBlock) return;
  if (!Array.isArray(words)) { wordHelpBlock.hidden = true; return; }
  wordHelpBlock.hidden = false;
  wordHelpList.textContent = '';
  wordHelpEmpty.hidden = words.length > 0;
  words.forEach(function (entry) {
    var li = document.createElement('li');
    var word = document.createElement('strong');
    word.textContent = entry.word;
    li.appendChild(word);
    li.appendChild(document.createTextNode(' · ' + entry.count + (entry.count === 1 ? ' tap' : ' taps')));
    wordHelpList.appendChild(li);
  });
}

var reportCard = document.getElementById('report-card');
var reportOpenBtn = document.getElementById('report-open-btn');
var reportDismissBtn = document.getElementById('report-dismiss-btn');
var shareCard = document.getElementById('share-card');
var shareCopyBtn = document.getElementById('share-copy-btn');
var shareCopied = document.getElementById('share-copied');
var headerReport = document.getElementById('header-report');

var lobbyBlock = document.getElementById('lobby-block');
var lobbyCount = document.getElementById('lobby-count');
var lobbyRoster = document.getElementById('lobby-roster');
var startActivityBtn = document.getElementById('start-activity-btn');
var deviceNotice = document.getElementById('device-notice');
var lateSeats = document.getElementById('late-seats');
var projectorNotice = document.getElementById('projector-notice');
var reopenProjectorBtn = document.getElementById('reopen-projector-btn');
var reopenHostAddress = document.getElementById('reopen-host-address');
var stepText = document.getElementById('step-text');

// The step's words as the projector draws them: a {{x.barChart}} block is
// a real chart (shared/chart-render.js), not block characters run into one
// line ("Mars ███ 1 (100%) Venus ░░░ 0 (0%)", a reviewer 2026-10-02), and
// the rest keeps its line breaks. textContent only: the words are untrusted.
function renderStepText(el, words) {
  el.textContent = '';
  if (window.ChartRender && ChartRender.containsChart(words)) {
    ChartRender.split(words).forEach(function (seg) {
      if (seg.type === 'text') {
        if (!seg.text.trim()) return;
        var p = document.createElement('div');
        p.className = 'step-text-part';
        p.textContent = seg.text.trim();
        el.appendChild(p);
        return;
      }
      var drawn = ChartRender.buildSegment(seg);
      if (drawn) el.appendChild(drawn);
    });
    return;
  }
  el.textContent = words;
}

var currentCode = null;
var currentPin = null;
// The teacher key (engine/teacher-auth.js): handed over by the projector
// that started the room (the host launch relay, the teacher link), never
// typed. It gets this console past a PIN lockout a guessing student
// caused, so it rides with the PIN on every join and every link.
var linkKey = '';
var currentKey = '';
var reportDismissed = false;
// Before you project: the setup card, once per browser (Got it), and
// never inside Try it out's frame, where the tour does this job.
var setupCard = document.getElementById('setup-card');
var setupDismissBtn = document.getElementById('setup-dismiss-btn');
var SETUP_SEEN_KEY = 'jamyard.consoleSetupSeen';
function setupCardWanted() {
  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }
  if (framed) return false;
  try { return localStorage.getItem(SETUP_SEEN_KEY) !== '1'; } catch (e) { return true; }
}
setupDismissBtn.addEventListener('click', function () {
  try { localStorage.setItem(SETUP_SEEN_KEY, '1'); } catch (e) { /* private window: shows again next time */ }
  setupCard.hidden = true;
});
var currentPhaseType = null;
var currentPhaseInstanceId = 0;
var checklistItemTexts = [];
var latestRoster = { count: 0, players: [] };

var PHASE_LABELS = {
  lobby: 'Lobby, players joining',
  collect: 'Students are writing',
  'collect-choice': 'Students are choosing',
  'solo-quiz': 'Students are taking the quiz',
  'ai-process': 'AI is working…',
  vote: 'Students are voting',
  rank: 'Students are ranking',
  rate: 'Students are rating',
  wager: 'Students are betting',
  relay: 'Relay in progress',
  merge: 'Groups are merging answers',
  'one-voice': 'Counting together',
  foreach: 'Round in progress',
  preview: 'YOUR REVIEW NEEDED',
  announce: 'Announcement showing',
  reveal: 'Results showing',
  'reveal-one': 'Revealing one by one',
  leaderboard: 'Leaderboard showing',
  'team-split': 'Teams showing',
  eliminate: 'Elimination in progress',
  'ai-eliminate': 'AI judging…',
  winner: 'Winner showing',
  turn: 'Charades turn running',
  match: 'Students are matching',
  sort: 'Students are sorting',
  buzz: 'Buzzer round',
  estimate: 'Students are guessing',
  checklist: 'Checklist work time',
  end: 'All done'
};

// --- Join flow ---

codeInput.addEventListener('input', function () {
  this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '');
});

function tryJoin() {
  var code = codeInput.value.trim();
  var pin = pinInput.value.trim();
  if (code.length !== 4) {
    showJoinError('Enter the 4-letter room code from the projector.');
    return;
  }
  joinBtn.disabled = true;
  joinBtn.textContent = 'Connecting…';
  socket.emit('join-teacher', { code: code, pin: pin, key: linkKey });
}

joinBtn.addEventListener('click', tryJoin);
pinInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryJoin(); });

// Deep link from the host screen's "Copy teacher link" button:
// /teacher#code=ABCD&pin=1234. Hash fragment, not query string, so the PIN
// never reaches server logs; it is wiped from the address bar right after
// reading so it doesn't sit on screen or in an over-the-shoulder glance.
var autoJoinFromLink = false;
(function () {
  if (!window.location.hash) return;
  var params = new URLSearchParams(window.location.hash.slice(1));
  var code = (params.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) return;
  codeInput.value = code;
  pinInput.value = params.get('pin') || '';
  linkKey = params.get('key') || '';
  autoJoinFromLink = true;
  try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* old browser */ }
})();

// Opened by a Host button in a new tab before the room existed
// (/teacher#await=<nonce>, shared/host-launch.js): wait for the projector
// tab to publish the room, then join by itself. A minute with nothing
// heard hands the form back, with Copy teacher link as the way in.
(function () {
  if (!window.HostLaunch) return;
  var nonce = HostLaunch.pairFromHash(window.location.hash);
  if (!nonce) return;
  try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* old browser */ }
  var hint = document.querySelector('.join-hint');
  var hintWas = hint ? hint.textContent : '';
  if (hint) hint.textContent = 'Your projector is opening the room in the other tab. This console joins it by itself in a moment.';
  joinBtn.disabled = true;
  joinBtn.textContent = 'Waiting for the projector…';
  var timer = setTimeout(function () {
    stop();
    if (hint) hint.textContent = 'The projector did not report a room. ' + hintWas;
    joinBtn.disabled = false;
    joinBtn.textContent = 'Connect';
  }, 60 * 1000);
  var stop = HostLaunch.listen(nonce, function (rec) {
    clearTimeout(timer);
    codeInput.value = rec.code;
    pinInput.value = rec.pin || '';
    linkKey = rec.key || '';
    if (hint) hint.textContent = hintWas;
    autoJoinFromLink = false;
    tryJoin();
  });
})();

function showJoinError(message) {
  joinError.textContent = message;
  joinError.hidden = false;
  joinBtn.disabled = false;
  joinBtn.textContent = 'Connect';
}

socket.on('teacher-join-error', function (data) {
  showJoinError((data && data.message) || 'Could not connect.');
});

// The server says on every roster and snapshot whether the projector's
// socket is bound to the room. A dropped projector is the one failure a
// teacher cannot see from here otherwise: students keep landing on this
// console and the class's screen stays empty.
function renderProjectorNotice(hostConnected) {
  if (!projectorNotice) return;
  projectorNotice.hidden = hostConnected !== false;
  if (reopenHostAddress) reopenHostAddress.textContent = window.location.host + '/host';
}

// "Open the projector again": a closed projector tab has nothing left to
// reload, so this opens /host in a new tab with the room code in the query
// and the PIN in the hash (never in server logs); the projector rebinds
// with the PIN and the students' screens move on (a reviewer, 2026-09-27).
if (reopenProjectorBtn) {
  reopenProjectorBtn.addEventListener('click', function () {
    if (!currentCode) return;
    var url = '/host?room=' + encodeURIComponent(currentCode) + '#pin=' + encodeURIComponent(currentPin || '') +
      (currentKey ? '&key=' + encodeURIComponent(currentKey) : '');
    var w = window.open(url, '_blank');
    if (!w) window.location.href = url;
  });
}

// The server gave up on the room (no projector came back and no console
// stayed): say so instead of a console that looks live over nothing
socket.on('room-closed', function () {
  if (consoleNote) consoleNote.textContent = 'This room has closed. Start the activity again from the yard to run it with the class.';
  if (controlsBlock) controlsBlock.hidden = true;
  if (projectorNotice) projectorNotice.hidden = true;
});

socket.on('teacher-joined', function (snap) {
  setupCard.hidden = !setupCardWanted();
  renderProjectorNotice(snap && snap.hostConnected);
  currentCode = codeInput.value.trim();
  currentPin = pinInput.value.trim();
  currentKey = linkKey;
  try {
    sessionStorage.setItem('teacherCode', currentCode);
    sessionStorage.setItem('teacherPin', currentPin);
    sessionStorage.setItem('teacherKey', currentKey);
  } catch (e) { /* storage unavailable */ }

  joinSection.hidden = true;
  consoleSection.hidden = false;
  headerRoom.hidden = false;
  headerRoom.textContent = (snap.gameName ? snap.gameName + ' · ' : '') + 'Room ' + snap.code;

  // The report link is live from the moment we're in: mid-activity it shows
  // what's finished so far, and at the end it's the full record. Code + PIN
  // ride in the hash (never the query string) like this page's own deep link.
  headerReport.href = reportUrl();
  headerReport.hidden = false;

  latestRoster = { count: snap.playerCount || 0, players: snap.players || [] };
  setPhase(snap);
  renderEntries(snap.submissions || []);
  // Seed the "X of Y in" count when joining mid-collect (live updates take
  // over from the next response-received event).
  if ((snap.phaseType === 'collect' || snap.phaseType === 'collect-choice') && snap.playerCount) {
    countLabel.textContent = (snap.submissions || []).length + ' of ' + snap.playerCount + ' in';
  }
  if (snap.preview) renderPreview(snap.preview.content, snap.preview.responses);
  renderWordHelp(snap.wordHelp === undefined ? null : snap.wordHelp);
  if (snap.checklist) {
    checklistItemTexts = snap.checklist.items || [];
    checklistBlock.hidden = false;
    renderChecklistGroups(snap.checklist.groups || []);
  }
});

// Auto-rejoin on reconnect (wifi blips, device sleep)
socket.on('connect', function () {
  if (currentCode) {
    socket.emit('join-teacher', { code: currentCode, pin: currentPin, key: currentKey });
  } else if (autoJoinFromLink) {
    // Arrived via the host screen's copied link — connect without a tap.
    autoJoinFromLink = false;
    tryJoin();
  } else {
    // Prefill from a previous session on this device
    try {
      var savedCode = sessionStorage.getItem('teacherCode');
      var savedPin = sessionStorage.getItem('teacherPin');
      if (savedCode) codeInput.value = savedCode;
      if (savedPin) pinInput.value = savedPin;
      if (savedCode) linkKey = sessionStorage.getItem('teacherKey') || '';
      // A reload of a console that was in a room goes straight back in
      // (a reviewer had to tap Connect over their own filled-in form);
      // a room that has ended says so under the form
      if (savedCode && (savedPin || linkKey)) tryJoin();
    } catch (e) { /* storage unavailable */ }
  }
});

// --- Phase tracking: decides which controls show ---

// The drawing the class is looking at this round (Doodle Bluff's title
// and vote steps): strokes only, drawn on the console's own canvas.
var phaseDrawingBlock = document.getElementById('phase-drawing-block');
var phaseDrawingCanvas = document.getElementById('phase-drawing');
function renderPhaseDrawing(strokes) {
  if (!phaseDrawingBlock) return;
  var has = Array.isArray(strokes) && strokes.length > 0 && window.Draw;
  phaseDrawingBlock.hidden = !has;
  if (has) Draw.renderStrokes(phaseDrawingCanvas, strokes);
}

function setPhase(data) {
  var phaseType = data.phaseType;
  renderPhaseDrawing(data.displayDrawing);
  currentPhaseType = phaseType;
  if (data.phaseInstanceId !== undefined && data.phaseInstanceId !== null) {
    currentPhaseInstanceId = data.phaseInstanceId;
  }
  phaseLabel.textContent = PHASE_LABELS[phaseType] || (phaseType || 'Waiting…');
  phaseLabel.classList.toggle('phase-label-attention', phaseType === 'preview');
  countLabel.textContent = '';
  // The words on the projector right now (the step's own text, resolved
  // by the server), so a console on a phone knows which question is up
  if (stepText) {
    var words = typeof data.stepText === 'string' ? data.stepText.trim() : '';
    renderStepText(stepText, words);
    stepText.hidden = !words || phaseType === 'lobby' || phaseType === 'end';
  }

  var isLobby = phaseType === 'lobby';
  lobbyBlock.hidden = !isLobby;
  if (isLobby) renderLobbyRoster();

  var isCollect = phaseType === 'collect' || phaseType === 'collect-choice';
  entriesBlock.hidden = !isCollect;
  entriesAudience = isCollect ? (data.audience || null) : null;
  // A return-to-author reveal lists its finished chains (teacher-chains
  // arrives right after this event; a console joining mid-step gets them
  // in the snapshot). Any other step drops the list.
  renderChains(phaseType === 'reveal' && Array.isArray(data.chains) ? data.chains : null);
  if (isCollect) {
    // The hint says where THIS step's answers go (the server reads the
    // activity's graph, engine/audience.js); an Exit Ticket never mentions
    // a reveal it does not have (a reviewer, 2026-09-23).
    entriesHint.textContent = ENTRIES_HINTS[data.audience] || ENTRIES_HINTS.generic;
    // Seed the count and the empty state right away — a blank area until
    // the first submission reads as "not syncing".
    if (latestRoster.count) countLabel.textContent = '0 of ' + latestRoster.count + ' in';
    renderEntries([]);
  } else {
    entriesList.innerHTML = '';
  }

  if (phaseType !== 'preview') previewBlock.hidden = true;
  if (phaseType !== 'checklist') {
    checklistBlock.hidden = true;
    checklistGroups.innerHTML = '';
  }

  closeStepBtn.hidden = !isCollect;
  closeStepBtn.disabled = false;

  // "A bit more time": only while a stretchable step is open AND it
  // actually has a countdown (mirrors the server's extend-timer guard:
  // EXTENDABLE_TIMER_PHASES + SERVER_TIMED_EXTENDABLE in server.js — keep
  // this list in sync). The rule: any step where the whole class works
  // against one shared countdown; per-turn clocks (relay, turn) and pacing
  // beats (announce, leaderboard) stay out.
  var EXTENDABLE_TYPES = ['collect', 'collect-choice', 'vote', 'estimate',
    'merge', 'rank', 'match', 'sort', 'rate', 'checklist', 'wager'];
  var canExtend = EXTENDABLE_TYPES.indexOf(phaseType) !== -1 &&
    !!data.timer && !data.closed;
  moreTimeBtn.hidden = !canExtend;
  moreTimeBtn.textContent = MORE_TIME_LABEL;

  // Reveal-one is paced from here too: same button the host screen has.
  revealNextBtn.hidden = phaseType !== 'reveal-one';
  revealNextBtn.disabled = false;

  // During preview, Approve / Try again are the only ways forward — a bare
  // next-step would skip the review entirely. In the lobby the only forward
  // path is the explicit Start activity button (an accidental generic
  // advance shouldn't be able to start the class).
  // While an answer step is open, Close submissions is the one way
  // forward (it stores the answers and moves on). A second forward button
  // beside it was the trap: a teacher pressed it, the answers were never
  // gathered, and Doodle Bluff ran its rounds on nothing (2026-09-18). The
  // server closes on a stray advance too; hiding the button keeps one
  // control per moment.
  // At the end there is nothing to advance to; the report card is the next thing (a reviewer, 2026-09-27)
  nextStepBtn.hidden = phaseType === 'preview' || isLobby || isCollect || phaseType === 'end';
  nextStepBtn.disabled = false;
  // The button says what clicking DOES right now: while a two-stage step
  // is open that's the CLOSE action ("End the ratings"); once closed (or
  // for one-stage steps) it's the advance action ("Start the voting").
  var label = (!data.closed && data.closeLabel) ? data.closeLabel : (data.continueLabel || 'Next step');
  nextStepBtn.textContent = label + ' ▸';
  // No visible buttons → no floating dashed divider.
  controlsBlock.hidden = closeStepBtn.hidden && nextStepBtn.hidden && revealNextBtn.hidden && moreTimeBtn.hidden;

  consoleNote.textContent = phaseType === 'end'
    ? 'All done, nice work.'
    : (data.closed ? 'Results are on the projector.' : '');

  // The step's discussion prompt: shown here, put on the projector only
  // when the teacher taps the button. A fresh step resets the "shown" note.
  var prompt = (typeof data.discussionPrompt === 'string') ? data.discussionPrompt.trim() : '';
  // A guessing step that is still open takes the teacher's number here.
  if (answerBlock) {
    var takesAnswer = phaseType === 'estimate' && !data.closed;
    answerBlock.hidden = !takesAnswer;
    if (takesAnswer) {
      var known = (typeof data.estimateAnswer === 'number' && isFinite(data.estimateAnswer)) ? data.estimateAnswer : null;
      answerInput.value = known === null ? '' : String(known);
      showAnswerSet(known);
    }
  }
  if (discussionBlock) {
    discussionBlock.hidden = !prompt;
    discussionText.textContent = prompt;
    if (prompt && (data.phaseId !== discussionForPhase)) {
      discussionForPhase = data.phaseId;
      discussionShown.hidden = true;
      showDiscussionBtn.disabled = false;
    }
  }

  // End of activity: surface the report reminder. The report is built from
  // live room state and never stored, so this is the teacher's window to
  // print it or save it as a PDF.
  var atEnd = phaseType === 'end';
  if (atEnd) reportOpenBtn.href = reportUrl();
  reportCard.hidden = !atEnd || reportDismissed;
  shareCard.hidden = !atEnd;
}

function reportUrl() {
  return '/teacher/report#code=' + encodeURIComponent(currentCode || '') +
    '&pin=' + encodeURIComponent(currentPin || '') +
    (currentKey ? '&key=' + encodeURIComponent(currentKey) : '');
}

socket.on('teacher-phase', function (data) {
  setPhase(data);
});

// --- Lobby: live roster + start control ---

// A row per student with Rename and Remove: a rude or unreadable name is
// fixed from here, not hunted down with the mouse on the projector in
// front of the class, and Rename keeps the student in the room where
// Remove would lock them out (a reviewer, 2026-09-27). Rename stays
// open across roster refreshes for the row being edited.
var renamingId = null;
var renamingFrom = null;
function renderLobbyRoster() {
  var n = latestRoster.count || 0;
  lobbyCount.textContent = n === 1 ? '1 student joined' : n + ' students joined';
  var players = latestRoster.players || [];
  lobbyRoster.innerHTML = '';
  if (!players.length) {
    var empty = document.createElement('li');
    empty.className = 'roster-empty';
    empty.textContent = 'Waiting for students to join…';
    lobbyRoster.appendChild(empty);
  }
  players.forEach(function (p) { lobbyRoster.appendChild(rosterRow(p)); });
  startActivityBtn.disabled = n === 0;
}

function rosterRow(p) {
  var li = document.createElement('li');
  li.dataset.id = p.id;
  var name = document.createElement('span');
  name.className = 'roster-name';
  name.textContent = p.name + (p.connected === false ? ' (offline)' : '');
  li.appendChild(name);
  if (renamingId === p.id) {
    li.appendChild(renameForm(p));
    return li;
  }
  var renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'entry-btn';
  renameBtn.textContent = 'Rename';
  renameBtn.title = 'Give this student a different name on every screen';
  renameBtn.addEventListener('click', function () {
    renamingId = p.id;
    renamingFrom = p.name;
    renderLobbyRoster();
    var box = lobbyRoster.querySelector('li[data-id="' + p.id + '"] input');
    if (box) { box.focus(); box.select(); }
  });
  li.appendChild(renameBtn);
  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'entry-btn entry-btn-danger';
  removeBtn.textContent = 'Remove';
  removeBtn.title = 'Remove this student from the room, they cannot rejoin this session';
  removeBtn.addEventListener('click', function () {
    var ask = window.Dialog && Dialog.confirm
      ? Dialog.confirm({ title: 'Remove ' + p.name + '?', message: 'They cannot rejoin this session. To fix a name instead, use Rename.', confirmLabel: 'Remove', cancelLabel: 'Keep them' })
      : Promise.resolve(true);
    ask.then(function (yes) {
      if (yes) socket.emit('moderate-kick', { code: currentCode, playerId: p.id });
    });
  });
  li.appendChild(removeBtn);
  return li;
}

function renameForm(p) {
  var form = document.createElement('form');
  form.className = 'roster-rename-form';
  var box = document.createElement('input');
  box.type = 'text';
  box.maxLength = 20;
  box.value = p.name;
  box.setAttribute('aria-label', 'New name for ' + p.name);
  form.appendChild(box);
  var save = document.createElement('button');
  save.type = 'submit';
  save.className = 'entry-btn';
  save.textContent = 'Save';
  form.appendChild(save);
  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'entry-btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', function () { renamingId = null; renderLobbyRoster(); });
  form.appendChild(cancel);
  var err = document.createElement('span');
  err.className = 'roster-error';
  err.hidden = true;
  form.appendChild(err);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var wanted = box.value.trim();
    if (wanted.length < 2) { err.textContent = 'A name needs at least two letters.'; err.hidden = false; return; }
    if (wanted === p.name) { renamingId = null; renderLobbyRoster(); return; }
    err.hidden = true;
    socket.emit('moderate-rename', { code: currentCode, playerId: p.id, name: wanted });
  });
  return form;
}

// The server refused the new name (the filter, a duplicate): the row
// keeps the box open and says why
socket.on('teacher-rename-error', function (data) {
  if (!data || !data.playerId) return;
  var row = lobbyRoster.querySelector('li[data-id="' + data.playerId + '"] .roster-error');
  if (row) { row.textContent = data.message || 'That name did not work.'; row.hidden = false; }
});

socket.on('teacher-roster', function (data) {
  latestRoster = { count: (data && data.count) || 0, players: (data && data.players) || [] };
  renderProjectorNotice(data && data.hostConnected);
  // A rename that landed (the name changed) or a student who left closes
  // the open rename box
  if (renamingId) {
    var still = latestRoster.players.filter(function (p) { return p.id === renamingId; })[0];
    if (!still || still.name !== renamingFrom) renamingId = null;
  }
  if (currentPhaseType === 'lobby') renderLobbyRoster();
});

startActivityBtn.addEventListener('click', function () {
  startActivityBtn.disabled = true;
  socket.emit('start-game', { code: currentCode });
});

// Pairing visibility: every console join is announced to every teacher
// surface, so a device the teacher doesn't recognize can't connect silently.
socket.on('teacher-console-joined', function (data) {
  var n = (data && data.deviceCount) || 2;
  deviceNotice.hidden = false;
  deviceNotice.textContent = 'Another teacher device just connected (' + n +
    ' total). If that wasn\'t you, a student may have the PIN, end the session or change rooms.';
});

// Late seating: a student who joined after a team step opened was given
// a seat (engine/phases/late-seating.js); one line each says where they
// landed, so the teacher never wonders why a name is missing from a team.
socket.on('teacher-late-seat', function (data) {
  if (!data || !data.name || !lateSeats) return;
  var where;
  if (data.picking) {
    where = data.team ? 'on ' + data.team + ', picking a job' : 'picking a team';
  } else if (data.team) {
    where = 'on ' + data.team + (data.role ? ' as ' + data.role : '');
  } else {
    where = data.role ? 'as ' + data.role : 'seated';
  }
  var li = document.createElement('li');
  li.textContent = data.name + ' joined late: ' + where + '.';
  lateSeats.appendChild(li);
  lateSeats.hidden = false;
});

socket.on('response-received', function (data) {
  if (data && typeof data.count === 'number') {
    countLabel.textContent = data.count + ' of ' + data.total + ' in';
  }
});

// The filter stopped a student's message: the teacher hears who, never
// the words (a reviewer, 2026-09-26). Same list the late seats use.
// An AI step says how many answers it read and how many it left out
// (counts only, never the words): a trick answer that the AI ignored
// used to vanish without a word (a reviewer, 2026-09-26).
function aiNoteLine(data) {
  var total = Number(data.total) || 0;
  var left = Math.max(0, Math.min(total, Number(data.leftOut) || 0));
  var used = total - left;
  var verb = data.task === 'summarize' ? 'summed up' : 'read';
  var line = 'The AI ' + verb + ' ' + used + ' of ' + total + ' ' + (total === 1 ? 'answer' : 'answers');
  if (left === 0) return line + '.';
  return line + ' and left ' + left + ' out: ' + (left === 1 ? 'it was' : 'they were') + ' not appropriate, or tried to give the AI instructions.';
}
socket.on('teacher-ai-note', function (data) {
  if (!data || !lateSeats) return;
  var li = document.createElement('li');
  li.textContent = aiNoteLine(data);
  lateSeats.appendChild(li);
  lateSeats.hidden = false;
});

socket.on('teacher-blocked', function (data) {
  if (!data || !data.name || !lateSeats) return;
  var li = document.createElement('li');
  li.textContent = data.reason === 'about_classmate'
    ? data.name + ' tried to send a line about a classmate that the filter stopped. They were asked to leave classmates out of it.'
    : data.name + ' tried to send a message the filter stopped. They were asked to reword it.';
  lateSeats.appendChild(li);
  lateSeats.hidden = false;
});

// --- Live entries (moderation) ---

function renderEntries(submissions) {
  entriesList.innerHTML = '';
  if (!submissions || submissions.length === 0) {
    var empty = document.createElement('li');
    empty.className = 'entry-empty';
    empty.textContent = 'No entries yet…';
    entriesList.appendChild(empty);
    return;
  }
  for (var i = 0; i < submissions.length; i++) {
    (function (sub) {
      var li = document.createElement('li');
      li.className = 'entry' + (sub.hidden ? ' entry-hidden' : '');

      var top = document.createElement('div');
      top.className = 'entry-top';
      var name = document.createElement('span');
      name.className = 'entry-name';
      // An unattributed step promised students the teacher sees what was
      // said, not who said it: the server sends no name, and the row
      // carries no Kick either (a kick would point at the writer).
      name.textContent = sub.unattributed ? 'Anonymous' : sub.name;
      top.appendChild(name);
      if (sub.flagged) {
        // Moderation ladder rung 3: the auto-checks couldn't settle this
        // one, so the teacher is the verdict. Console-only, never projected.
        var flag = document.createElement('span');
        flag.className = 'entry-flag';
        flag.textContent = 'Needs a look';
        flag.title = 'The auto-filter wasn\'t sure about this one. Read it, and Hide it if the class shouldn\'t see it.';
        top.appendChild(flag);
      }
      li.appendChild(top);

      if (sub.drawing && window.Draw) {
        // Drawing submission: a thumbnail IS the moderation surface —
        // "[drawing]" text would be unmoderatable.
        var thumb = document.createElement('canvas');
        thumb.className = 'entry-drawing';
        thumb.width = 160;
        thumb.height = 120;
        Draw.renderStrokes(thumb, sub.drawing);
        li.appendChild(thumb);
      } else {
        var text = document.createElement('div');
        text.className = 'entry-text';
        text.textContent = sub.text;
        li.appendChild(text);
      }

      var actions = document.createElement('div');
      actions.className = 'entry-actions';

      var hideBtn = document.createElement('button');
      hideBtn.className = 'entry-btn';
      hideBtn.textContent = sub.hidden ? 'Unhide' : 'Hide';
      hideBtn.title = sub.hidden ? 'Put this entry back in the activity' : 'Hide this entry from the class and the AI, you can unhide it later';
      hideBtn.addEventListener('click', function () {
        socket.emit('moderate-hide', { code: currentCode, playerId: sub.playerId, hidden: !sub.hidden });
      });
      actions.appendChild(hideBtn);

      // Put this one answer on the class screen now, with the name. Only
      // offered where the answer box told the student the class sees their
      // words anyway (the answer box's own line, engine/audience.js; the
      // same list as spotlightAllowed in engine/spotlight.js, which the
      // server checks too), never on a single tap, never for a hidden entry.
      if (currentPhaseType === 'collect' && SHOW_AUDIENCES.indexOf(entriesAudience) !== -1 && !sub.hidden) {
        actions.appendChild(showButton(sub.playerId, sub.drawing ? 'this drawing' : 'this answer'));
      }

      var kickBtn = document.createElement('button');
      kickBtn.className = 'entry-btn entry-btn-danger';
      kickBtn.textContent = 'Kick';
      kickBtn.title = 'Remove this student from the room, they cannot rejoin this session';
      kickBtn.addEventListener('click', function () {
        // The site's own yes-or-no box (never the browser's: it freezes
        // the page and reads as foreign, standing rule 2026-09-26)
        var ask = window.Dialog && Dialog.confirm
          ? Dialog.confirm({ title: 'Remove ' + sub.name + '?', message: 'They can\'t rejoin this session.', confirmLabel: 'Remove', cancelLabel: 'Keep them' })
          : Promise.resolve(true);
        ask.then(function (yes) {
          if (yes) socket.emit('moderate-kick', { code: currentCode, playerId: sub.playerId });
        });
      });
      if (!sub.unattributed) actions.appendChild(kickBtn);

      li.appendChild(actions);
      entriesList.appendChild(li);
    })(submissions[i]);
  }
}

// The audience keys where Show is offered on an open answer step: the
// class sees the words anyway, Show puts one up sooner (spotlightAllowed).
var SHOW_AUDIENCES = ['class', 'class-after-review', 'classmate+class', 'classmate+class-after-review'];

// A Show button: the server puts that student's work on the projector,
// read from the room's own data (the console only names the student).
function showButton(playerId, what) {
  var btn = document.createElement('button');
  btn.className = 'entry-btn entry-btn-show';
  btn.textContent = 'Show';
  btn.title = 'Put ' + what + ' on the class screen right now, big, with the name, so the class can talk about it';
  btn.addEventListener('click', function () {
    socket.emit('spotlight', { code: currentCode, playerId: playerId });
    btn.textContent = 'On the class screen';
    btn.disabled = true;
    setTimeout(function () { btn.textContent = 'Show'; btn.disabled = false; }, 2500);
  });
  return btn;
}

// --- Finished chains (a return-to-author reveal) ---

function renderChains(chains) {
  if (!chainsBlock) return;
  chainsBlock.hidden = !chains;
  chainsList.innerHTML = '';
  if (!chains) return;
  if (chains.length === 0) {
    var empty = document.createElement('li');
    empty.className = 'entry-empty';
    empty.textContent = 'No chains came back this time.';
    chainsList.appendChild(empty);
    return;
  }
  for (var i = 0; i < chains.length; i++) {
    (function (chain) {
      var li = document.createElement('li');
      li.className = 'entry';
      var top = document.createElement('div');
      top.className = 'entry-top';
      var name = document.createElement('span');
      name.className = 'entry-name';
      name.textContent = chain.name + ' started it';
      top.appendChild(name);
      li.appendChild(top);
      var text = document.createElement('div');
      text.className = 'entry-text';
      text.textContent = chain.text;
      li.appendChild(text);
      var actions = document.createElement('div');
      actions.className = 'entry-actions';
      actions.appendChild(showButton(chain.playerId, 'this chain'));
      li.appendChild(actions);
      chainsList.appendChild(li);
    })(chains[i]);
  }
}

socket.on('teacher-chains', function (data) {
  renderChains((data && data.chains) || []);
});

socket.on('teacher-word-help', function (data) {
  renderWordHelp((data && data.words) || []);
});

socket.on('submissions-update', function (data) {
  renderEntries((data && data.submissions) || []);
});

// --- Checklist detail (full per-group lists + check-on-behalf) ---

function renderChecklistGroups(groups) {
  checklistGroups.innerHTML = '';
  for (var g = 0; g < (groups || []).length; g++) {
    (function (group) {
      var card = document.createElement('div');
      card.className = 'checklist-console-group';

      var doneCount = 0;
      for (var k = 0; k < group.checked.length; k++) { if (group.checked[k]) doneCount++; }
      var title = document.createElement('h3');
      title.textContent = group.label + '. ' + doneCount + '/' + group.checked.length;
      card.appendChild(title);

      for (var i = 0; i < checklistItemTexts.length; i++) {
        (function (index) {
          var entry = group.checked[index];
          var row = document.createElement('button');
          row.className = 'checklist-console-item' + (entry ? ' checklist-console-done' : '');
          row.textContent = (entry ? '✓ ' : '○ ') + checklistItemTexts[index] +
            (entry && entry.name ? ' · ' + entry.name : '');
          row.addEventListener('click', function () {
            socket.emit('check-item', {
              code: currentCode,
              index: index,
              checked: !entry,
              team: group.key,
              phaseInstanceId: currentPhaseInstanceId
            });
          });
          card.appendChild(row);
        })(i);
      }
      checklistGroups.appendChild(card);
    })(groups[g]);
  }
}

socket.on('checklist-start', function (data) {
  checklistItemTexts = (data && data.items) || [];
  checklistBlock.hidden = false;
  renderChecklistGroups((data && data.groups) || []);
});

socket.on('checklist-update', function (data) {
  if (!data || !data.groups) return;
  if (checklistBlock.hidden) checklistBlock.hidden = false;
  renderChecklistGroups(data.groups);
});

socket.on('checklist-results', function () {
  checklistBlock.hidden = true;
  checklistGroups.innerHTML = '';
});

// --- Preview approval ---

function renderPreview(content, responses) {
  previewBlock.hidden = false;
  previewHasDrawings = !!(responses && responses.some(function (x) { return x && x.drawing; }));
  previewText.textContent = content || '(no content)';
  approveBtn.disabled = false;
  rejectBtn.disabled = false;
  if (responses && responses.length > 0) {
    previewRespBlock.hidden = false;
    previewRespList.innerHTML = '';
    for (var i = 0; i < responses.length; i++) {
      var li = document.createElement('li');
      li.className = 'entry';
      if (responses[i].drawing && window.Draw) {
        li.textContent = responses[i].name + ':';
        var thumb = document.createElement('canvas');
        thumb.className = 'entry-drawing';
        thumb.width = 200;
        thumb.height = 150;
        Draw.renderStrokes(thumb, responses[i].drawing);
        li.appendChild(thumb);
      } else {
        li.textContent = responses[i].name + ': ' + responses[i].response;
      }
      // "Needs a look": the ladder was unsure, or the answer names a heavy
      // topic (a divorce, a death, self-harm; engine/heavy-topics.js)
      if (responses[i].flagged) {
        var look = document.createElement('span');
        look.className = 'entry-flag';
        look.textContent = 'Needs a look';
        look.title = 'Read this one before the class sees it. Hide it if it should stay private.';
        li.appendChild(document.createTextNode(' '));
        li.appendChild(look);
      }
      // Hide on the review screen itself (a reviewer read "Hide anything
      // that isn't kind" and found no button, 2026-09-26): the line leaves
      // the step's stored rows, so the wall never shows it
      if (responses[i].playerId) {
        (function (row) {
          var hideBtn = document.createElement('button');
          hideBtn.className = 'entry-btn';
          hideBtn.textContent = 'Hide';
          hideBtn.title = 'Keep this one off the class screen';
          hideBtn.setAttribute('aria-label', 'Hide ' + row.name + "'s entry");
          hideBtn.addEventListener('click', function () {
            hideBtn.disabled = true;
            socket.emit('moderate-hide', { code: currentCode, playerId: row.playerId, hidden: true });
          });
          li.appendChild(document.createTextNode(' '));
          li.appendChild(hideBtn);
        })(responses[i]);
      }
      previewRespList.appendChild(li);
    }
  } else {
    previewRespBlock.hidden = true;
  }
}

socket.on('preview-content', function (data) {
  renderPreview(data.content, data.responses);
});

approveBtn.addEventListener('click', function () {
  approveBtn.disabled = true;
  socket.emit('preview-approve', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});

// Try again starts the step over for the WHOLE class: every answer gone,
// every pad blank. It sits next to Approve on a phone, so it asks first
// (a reviewer, 2026-09-26); Hide on one line is the tool for one bad entry.
var previewHasDrawings = false;
function sendReject() {
  rejectBtn.disabled = true;
  socket.emit('preview-reject', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
}
rejectBtn.addEventListener('click', function () {
  if (window.Dialog && Dialog.confirm) {
    var thing = previewHasDrawings ? 'drawing' : 'answer';
    Dialog.confirm({
      title: 'Start this step over?',
      message: 'Every ' + thing + ' so far is thrown out and the class does the step again. To keep one ' + thing + ' off the class screen, use Hide on that one instead.',
      confirmLabel: 'Start over', cancelLabel: 'Keep them'
    }).then(function (yes) { if (yes) sendReject(); });
    return;
  }
  sendReject();
});

// --- Step controls ---

closeStepBtn.addEventListener('click', function () {
  closeStepBtn.disabled = true;
  socket.emit('close-submissions', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});

// "A bit more time": +30s per press, presses stack. The console has no
// countdown of its own, so the server's timer-extended broadcast is the
// confirmation (it reaches every console, whichever device asked).
var MORE_TIME_LABEL = 'A bit more time +30s';
var moreTimeFlashTimer = null;
moreTimeBtn.addEventListener('click', function () {
  socket.emit('extend-timer', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});
socket.on('timer-extended', function () {
  if (moreTimeBtn.hidden) return;
  moreTimeBtn.textContent = 'Added 30 seconds';
  if (moreTimeFlashTimer) clearTimeout(moreTimeFlashTimer);
  moreTimeFlashTimer = setTimeout(function () {
    moreTimeBtn.textContent = MORE_TIME_LABEL;
    moreTimeFlashTimer = null;
  }, 1500);
});

revealNextBtn.addEventListener('click', function () {
  socket.emit('reveal-next', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});

// Gallery progress mirrors here so this screen tracks the projector.
socket.on('reveal-one-item', function (data) {
  if (currentPhaseType !== 'reveal-one' || !data) return;
  countLabel.textContent = data.index + ' of ' + data.total + ' revealed';
});

socket.on('reveal-one-complete', function () {
  if (currentPhaseType !== 'reveal-one') return;
  revealNextBtn.disabled = true;
  consoleNote.textContent = 'All revealed.';
});

// A quick second click on Next step (about 60 ms after the first) landed
// on the next step and skipped it (a reviewer, 2026-09-29, Closer's
// friend question); a press inside ADVANCE_GUARD_MS of the last one that
// went out is dropped.
var ADVANCE_GUARD_MS = 500;
var lastAdvanceAt = 0;
nextStepBtn.addEventListener('click', function () {
  var now = Date.now();
  if (now - lastAdvanceAt < ADVANCE_GUARD_MS) return;
  lastAdvanceAt = now;
  socket.emit('advance-phase', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});

// --- Activity report reminder ---

reportDismissBtn.addEventListener('click', function () {
  reportDismissed = true;
  reportCard.hidden = true;
});

// --- Send a colleague the link ---
// The tag on the link is one of our own campaign tags (the analytics
// allowlist reads utm_source / utm_medium from the URL bar on the home
// page), so a visit that came from a colleague's copy shows up as one.
function shareLink() {
  return window.location.origin + '/?utm_source=colleague&utm_medium=console';
}

shareCopyBtn.addEventListener('click', function () {
  var link = shareLink();
  var done = function () {
    shareCopied.hidden = false;
    setTimeout(function () { shareCopied.hidden = true; }, 2500);
  };
  var fallback = function () {
    // No clipboard (an http dev server, an old browser): show the link to select.
    shareCopied.textContent = link;
    shareCopied.hidden = false;
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(done, fallback);
  } else {
    fallback();
  }
});
