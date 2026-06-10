// Teacher console — the private second-device view.
//
// The host screen is projected to the class, so anything "teacher-only"
// there is actually public. This page (usually on the teacher's phone)
// receives the live moderation list and preview content privately, and can
// hide/kick entries, approve/reject previews, close submissions, and
// advance steps. It joins with the room code + the PIN shown click-to-reveal
// on the host screen (or rides the site password when one is set).

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
var nextStepBtn = document.getElementById('next-step-btn');
var controlsBlock = document.getElementById('controls-block');
var consoleNote = document.getElementById('console-note');

var currentCode = null;
var currentPin = null;
var currentPhaseType = null;
var currentPhaseInstanceId = 0;

var PHASE_LABELS = {
  lobby: 'Lobby — players joining',
  collect: 'Students are writing',
  'collect-choice': 'Students are choosing',
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
  end: 'Game over'
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

function showJoinError(message) {
  joinError.textContent = message;
  joinError.hidden = false;
  joinBtn.disabled = false;
  joinBtn.textContent = 'Connect';
}

socket.on('teacher-join-error', function (data) {
  showJoinError((data && data.message) || 'Could not connect.');
});

socket.on('teacher-joined', function (snap) {
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

  setPhase(snap.phaseType, snap.phaseId, snap.phaseInstanceId);
  renderEntries(snap.submissions || []);
  // Seed the "X of Y in" count when joining mid-collect (live updates take
  // over from the next response-received event).
  if ((snap.phaseType === 'collect' || snap.phaseType === 'collect-choice') && snap.playerCount) {
    countLabel.textContent = (snap.submissions || []).length + ' of ' + snap.playerCount + ' in';
  }
  if (snap.preview) renderPreview(snap.preview.content, snap.preview.responses);
});

// Auto-rejoin on reconnect (wifi blips, phone sleep)
socket.on('connect', function () {
  if (currentCode) {
    socket.emit('join-teacher', { code: currentCode, pin: currentPin });
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

function setPhase(phaseType, phaseId, phaseInstanceId) {
  currentPhaseType = phaseType;
  if (phaseInstanceId !== undefined && phaseInstanceId !== null) {
    currentPhaseInstanceId = phaseInstanceId;
  }
  phaseLabel.textContent = PHASE_LABELS[phaseType] || (phaseType || 'Waiting…');
  phaseLabel.classList.toggle('phase-label-attention', phaseType === 'preview');
  countLabel.textContent = '';

  var isCollect = phaseType === 'collect' || phaseType === 'collect-choice';
  entriesBlock.hidden = !isCollect;
  if (!isCollect) entriesList.innerHTML = '';

  if (phaseType !== 'preview') previewBlock.hidden = true;

  closeStepBtn.hidden = !isCollect;
  closeStepBtn.disabled = false;
  // During preview, Approve / Try again are the only ways forward — a bare
  // "Next step" would skip the review entirely.
  nextStepBtn.hidden = phaseType === 'preview';
  nextStepBtn.disabled = false;
  // No visible buttons → no floating dashed divider.
  controlsBlock.hidden = closeStepBtn.hidden && nextStepBtn.hidden;

  consoleNote.textContent = phaseType === 'end'
    ? 'The game is over — nice work.'
    : '';
}

socket.on('teacher-phase', function (data) {
  setPhase(data.phaseType, data.phaseId, data.phaseInstanceId);
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
      li.appendChild(top);

      var text = document.createElement('div');
      text.className = 'entry-text';
      text.textContent = sub.text;
      li.appendChild(text);

      var actions = document.createElement('div');
      actions.className = 'entry-actions';

      var hideBtn = document.createElement('button');
      hideBtn.className = 'entry-btn';
      hideBtn.textContent = sub.hidden ? 'Unhide' : 'Hide';
      hideBtn.addEventListener('click', function () {
        socket.emit('moderate-hide', { code: currentCode, playerId: sub.playerId, hidden: !sub.hidden });
      });
      actions.appendChild(hideBtn);

      var kickBtn = document.createElement('button');
      kickBtn.className = 'entry-btn entry-btn-danger';
      kickBtn.textContent = 'Kick';
      kickBtn.addEventListener('click', function () {
        if (confirm('Remove ' + sub.name + ' from the game? They can\'t rejoin this session.')) {
          socket.emit('moderate-kick', { code: currentCode, playerId: sub.playerId });
        }
      });
      actions.appendChild(kickBtn);

      li.appendChild(actions);
      entriesList.appendChild(li);
    })(submissions[i]);
  }
}

socket.on('submissions-update', function (data) {
  renderEntries((data && data.submissions) || []);
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
      li.textContent = responses[i].name + ': ' + responses[i].response;
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

nextStepBtn.addEventListener('click', function () {
  socket.emit('advance-phase', { code: currentCode, phaseInstanceId: currentPhaseInstanceId });
});
