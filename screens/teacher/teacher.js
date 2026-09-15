// Teacher console — the private second-device view.
//
// The host screen is projected to the class, so anything "teacher-only"
// there is actually public. This page (on the teacher's laptop or a spare Chromebook)
// receives the live moderation list and preview content privately, and can
// hide/kick entries, approve/reject previews, close submissions, and
// advance steps. It joins via the deep link from the host screen's "Copy
// teacher link" button, which carries the room code + PIN in the hash
// (or rides the site password when one is set).

var socket = io();

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
var headerReport = document.getElementById('header-report');

var lobbyBlock = document.getElementById('lobby-block');
var lobbyCount = document.getElementById('lobby-count');
var lobbyRoster = document.getElementById('lobby-roster');
var startActivityBtn = document.getElementById('start-activity-btn');
var deviceNotice = document.getElementById('device-notice');
var lateSeats = document.getElementById('late-seats');
var projectorNotice = document.getElementById('projector-notice');

var currentCode = null;
var currentPin = null;
var reportDismissed = false;
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
  socket.emit('join-teacher', { code: code, pin: pin });
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
}

socket.on('teacher-joined', function (snap) {
  renderProjectorNotice(snap && snap.hostConnected);
  currentCode = codeInput.value.trim();
  currentPin = pinInput.value.trim();
  try {
    sessionStorage.setItem('teacherCode', currentCode);
    sessionStorage.setItem('teacherPin', currentPin);
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
    socket.emit('join-teacher', { code: currentCode, pin: currentPin });
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

  var isLobby = phaseType === 'lobby';
  lobbyBlock.hidden = !isLobby;
  if (isLobby) renderLobbyRoster();

  var isCollect = phaseType === 'collect' || phaseType === 'collect-choice';
  entriesBlock.hidden = !isCollect;
  if (isCollect) {
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
  nextStepBtn.hidden = phaseType === 'preview' || isLobby;
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
}

function reportUrl() {
  return '/teacher/report#code=' + encodeURIComponent(currentCode || '') +
    '&pin=' + encodeURIComponent(currentPin || '');
}

socket.on('teacher-phase', function (data) {
  setPhase(data);
});

// --- Lobby: live roster + start control ---

function renderLobbyRoster() {
  var n = latestRoster.count || 0;
  lobbyCount.textContent = n === 1 ? '1 student joined' : n + ' students joined';
  var names = (latestRoster.players || []).map(function (p) { return p.name; });
  lobbyRoster.textContent = names.length ? names.join(' · ') : 'Waiting for students to join…';
  startActivityBtn.disabled = n === 0;
}

socket.on('teacher-roster', function (data) {
  latestRoster = { count: (data && data.count) || 0, players: (data && data.players) || [] };
  renderProjectorNotice(data && data.hostConnected);
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
      name.textContent = sub.name;
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

      var kickBtn = document.createElement('button');
      kickBtn.className = 'entry-btn entry-btn-danger';
      kickBtn.textContent = 'Kick';
      kickBtn.title = 'Remove this student from the room, they cannot rejoin this session';
      kickBtn.addEventListener('click', function () {
        if (confirm('Remove ' + sub.name + '? They can\'t rejoin this session.')) {
          socket.emit('moderate-kick', { code: currentCode, playerId: sub.playerId });
        }
      });
      actions.appendChild(kickBtn);

      li.appendChild(actions);
      entriesList.appendChild(li);
    })(submissions[i]);
  }
}

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

rejectBtn.addEventListener('click', function () {
  rejectBtn.disabled = true;
  socket.emit('preview-reject', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
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

nextStepBtn.addEventListener('click', function () {
  socket.emit('advance-phase', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});

// --- Activity report reminder ---

reportDismissBtn.addEventListener('click', function () {
  reportDismissed = true;
  reportCard.hidden = true;
});
