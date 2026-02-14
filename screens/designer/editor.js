// --- State ---
var gameId = null;
var gameConfig = null;
var selectedPhaseId = null;
var draggedPhaseId = null;
var didDrag = false;

// --- Constants ---
var PHASE_TYPES = [
  'lobby', 'collect', 'ai-process', 'vote', 'eliminate',
  'reveal', 'preview', 'winner', 'end'
];

// Detail text shown under phase name on canvas
var PHASE_DETAIL_FIELD = {
  'collect': 'prompt',
  'ai-process': 'task',
  'vote': 'mode',
  'eliminate': 'method',
  'reveal': 'template',
  'end': 'message'
};

// What each screen sees per phase type
var SCREEN_INFO = {
  'lobby': {
    host: 'Player list, player count, Start Game button',
    player: '"Waiting for game to start" message'
  },
  'collect': {
    host: 'Prompt text, submission counter (3/12), Close Submissions button',
    player: 'Prompt text, text input field, Submit button'
  },
  'ai-process': {
    host: '"Processing..." spinner (auto-advances)',
    player: '"Processing..." spinner'
  },
  'vote': {
    host: 'Vote mode, vote counter (5/12), Close Voting button',
    player: 'Voting UI (matchup pairs or pick-one list), Submit Vote button'
  },
  'eliminate': {
    host: 'Eliminated player names, remaining count, Advance button',
    player: '"You were eliminated" or "You survived!" message'
  },
  'reveal': {
    host: 'Rendered template content, Advance button',
    player: 'Rendered template content'
  },
  'preview': {
    host: 'Content preview, Approve / Reject buttons',
    player: '"Waiting for teacher..." message'
  },
  'winner': {
    host: 'Winner name, final standings, Advance button',
    player: 'Winner announcement, standings'
  },
  'end': {
    host: 'Game over message',
    player: 'Game over message'
  }
};

// --- DOM refs ---
var headerGameName = document.getElementById('header-game-name');
var settingsName = document.getElementById('game-name');
var settingsDescription = document.getElementById('game-description');
var settingsMinPlayers = document.getElementById('game-min-players');
var settingsMaxPlayers = document.getElementById('game-max-players');
var canvasLoading = document.getElementById('canvas-loading');
var canvasError = document.getElementById('canvas-error');
var phaseCanvas = document.getElementById('phase-canvas');
var phaseList = document.getElementById('phase-list');
var phasePanel = document.getElementById('phase-panel');
var phaseConfigForm = document.getElementById('phase-config-form');
var addPhaseBtn = document.getElementById('add-phase-btn');
var saveBtn = document.getElementById('save-btn');
var testGameBtn = document.getElementById('test-game-btn');
var closePanelBtn = document.getElementById('close-phase-panel');

// --- Init ---
function init() {
  var params = new URLSearchParams(window.location.search);
  gameId = params.get('game');

  if (gameId) {
    loadGame(gameId);
  } else {
    gameConfig = createBlankConfig();
    onConfigLoaded();
  }

  addPhaseBtn.addEventListener('click', addPhase);
  saveBtn.addEventListener('click', saveGame);
  testGameBtn.addEventListener('click', testGame);
  closePanelBtn.addEventListener('click', deselectPhase);

  // Update config when settings change
  settingsName.addEventListener('input', readSettings);
  settingsDescription.addEventListener('input', readSettings);
  settingsMinPlayers.addEventListener('input', readSettings);
  settingsMaxPlayers.addEventListener('input', readSettings);
}

async function loadGame(id) {
  try {
    var response = await fetch('/api/games/' + encodeURIComponent(id));
    if (!response.ok) {
      throw new Error('Failed to load game (status ' + response.status + ')');
    }
    gameConfig = await response.json();
    onConfigLoaded();
  } catch (error) {
    canvasLoading.hidden = true;
    canvasError.textContent = 'Error: ' + error.message;
    canvasError.hidden = false;
  }
}

function createBlankConfig() {
  return {
    name: 'New Game',
    description: '',
    minPlayers: 2,
    maxPlayers: 36,
    phases: {
      lobby: { type: 'lobby', next: 'end' },
      end: { type: 'end', message: 'Thanks for playing!' }
    }
  };
}

function onConfigLoaded() {
  canvasLoading.hidden = true;
  phaseCanvas.hidden = false;
  renderSettings();
  renderCanvas();
}

// --- Settings ---
function renderSettings() {
  settingsName.value = gameConfig.name || '';
  settingsDescription.value = gameConfig.description || '';
  settingsMinPlayers.value = gameConfig.minPlayers || '';
  settingsMaxPlayers.value = gameConfig.maxPlayers || '';
  headerGameName.textContent = gameConfig.name || 'Untitled Game';
}

function readSettings() {
  gameConfig.name = settingsName.value.trim() || 'Untitled Game';
  gameConfig.description = settingsDescription.value.trim();
  gameConfig.minPlayers = settingsMinPlayers.value ? parseInt(settingsMinPlayers.value) : null;
  gameConfig.maxPlayers = settingsMaxPlayers.value ? parseInt(settingsMaxPlayers.value) : null;
  headerGameName.textContent = gameConfig.name;
}

// --- Canvas ---
function buildPhaseOrder() {
  var phases = gameConfig.phases;
  var order = [];
  var visited = {};

  // Find the lobby phase to start the chain
  var startId = null;
  for (var id in phases) {
    if (phases[id].type === 'lobby') {
      startId = id;
      break;
    }
  }

  // Follow the next chain
  if (startId) {
    var current = startId;
    while (current && !visited[current] && phases[current]) {
      order.push(current);
      visited[current] = true;
      current = phases[current].next || null;
    }
  }

  // Add any orphaned phases not in the chain
  for (var id in phases) {
    if (!visited[id]) {
      order.push(id);
    }
  }

  return order;
}

function renderCanvas() {
  phaseList.innerHTML = '';
  var order = buildPhaseOrder();

  for (var i = 0; i < order.length; i++) {
    var phaseId = order[i];
    var phase = gameConfig.phases[phaseId];

    // Phase box
    var box = document.createElement('div');
    box.className = 'phase-box phase-type-' + phase.type;
    box.setAttribute('data-phase-id', phaseId);
    box.setAttribute('draggable', 'true');
    if (phaseId === selectedPhaseId) {
      box.classList.add('selected');
    }
    box.addEventListener('click', handlePhaseClick);

    // Drag events
    box.addEventListener('dragstart', handleDragStart);
    box.addEventListener('dragend', handleDragEnd);
    box.addEventListener('dragover', handleDragOver);
    box.addEventListener('dragenter', handleDragEnter);
    box.addEventListener('dragleave', handleDragLeave);
    box.addEventListener('drop', handleDrop);

    var header = document.createElement('div');
    header.className = 'phase-box-header';

    var name = document.createElement('span');
    name.className = 'phase-box-name';
    name.textContent = phaseId;

    var typeBadge = document.createElement('span');
    typeBadge.className = 'phase-box-type';
    typeBadge.textContent = phase.type;

    header.appendChild(name);
    header.appendChild(typeBadge);
    box.appendChild(header);

    // Detail line
    var detailField = PHASE_DETAIL_FIELD[phase.type];
    if (detailField && phase[detailField]) {
      var detail = document.createElement('div');
      detail.className = 'phase-box-detail';
      var text = String(phase[detailField]);
      detail.textContent = text.length > 40 ? text.substring(0, 40) + '...' : text;
      box.appendChild(detail);
    }

    phaseList.appendChild(box);

    // Arrow between phases (if this phase has a next that matches the next in order)
    if (i < order.length - 1 && phase.next === order[i + 1]) {
      var arrow = document.createElement('div');
      arrow.className = 'phase-arrow';
      arrow.textContent = '\u2193';
      phaseList.appendChild(arrow);
    } else if (i < order.length - 1) {
      // Show a dotted arrow for non-connected adjacent phases
      var arrow = document.createElement('div');
      arrow.className = 'phase-arrow';
      arrow.textContent = phase.next ? '\u2193' : '\u00b7\u00b7\u00b7';
      arrow.style.color = phase.next ? '#bbb' : '#ddd';
      phaseList.appendChild(arrow);
    }
  }
}

// --- Drag and drop ---
function handleDragStart(e) {
  draggedPhaseId = e.currentTarget.getAttribute('data-phase-id');
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  if (draggedPhaseId) {
    // Drag ended without a valid drop — still mark as dragged to suppress click
    didDrag = true;
  }
  draggedPhaseId = null;
  e.currentTarget.classList.remove('dragging');
  // Clean up all drop indicators
  var boxes = phaseList.querySelectorAll('.phase-box');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].classList.remove('drop-above', 'drop-below');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  var box = e.currentTarget;
  var targetId = box.getAttribute('data-phase-id');
  if (targetId === draggedPhaseId) return;

  // Show drop indicator based on mouse position within the box
  var rect = box.getBoundingClientRect();
  var midY = rect.top + rect.height / 2;

  // Clear previous indicators on this box
  box.classList.remove('drop-above', 'drop-below');

  if (e.clientY < midY) {
    box.classList.add('drop-above');
  } else {
    box.classList.add('drop-below');
  }
}

function handleDragEnter(e) {
  e.preventDefault();
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drop-above', 'drop-below');
}

function handleDrop(e) {
  e.preventDefault();
  var box = e.currentTarget;
  var targetId = box.getAttribute('data-phase-id');
  if (!draggedPhaseId || targetId === draggedPhaseId) return;

  // Determine if dropping above or below the target
  var rect = box.getBoundingClientRect();
  var midY = rect.top + rect.height / 2;
  var dropAfter = e.clientY >= midY;

  // Clean up indicators
  box.classList.remove('drop-above', 'drop-below');

  reorderPhase(draggedPhaseId, targetId, dropAfter);
  draggedPhaseId = null;
  didDrag = true;
}

function reorderPhase(movedId, targetId, dropAfter) {
  var order = buildPhaseOrder();

  // Remove the moved phase from the order
  var movedIndex = order.indexOf(movedId);
  if (movedIndex === -1) return;
  order.splice(movedIndex, 1);

  // Find target position and insert
  var targetIndex = order.indexOf(targetId);
  if (targetIndex === -1) return;

  var insertAt = dropAfter ? targetIndex + 1 : targetIndex;
  order.splice(insertAt, 0, movedId);

  // Ensure end phase is always last in the chain
  var endIndex = -1;
  for (var i = 0; i < order.length; i++) {
    if (gameConfig.phases[order[i]].type === 'end') {
      endIndex = i;
      break;
    }
  }
  if (endIndex !== -1 && endIndex < order.length - 1) {
    var endId = order.splice(endIndex, 1)[0];
    order.push(endId);
  }

  // Rebuild the next chain from the new order
  for (var i = 0; i < order.length; i++) {
    var phase = gameConfig.phases[order[i]];
    if (i < order.length - 1) {
      phase.next = order[i + 1];
    } else {
      // Last phase (should be end) — no next
      delete phase.next;
    }
  }

  renderCanvas();
  // Re-show phase config if one was selected
  if (selectedPhaseId) {
    renderPhaseConfig(selectedPhaseId);
  }
}

function handlePhaseClick(e) {
  if (didDrag) {
    didDrag = false;
    return;
  }
  var box = e.currentTarget;
  var phaseId = box.getAttribute('data-phase-id');
  selectPhase(phaseId);
}

// --- Phase selection ---
function selectPhase(phaseId) {
  selectedPhaseId = phaseId;
  phasePanel.classList.remove('hidden');
  renderCanvas();
  renderPhaseConfig(phaseId);
}

function deselectPhase() {
  selectedPhaseId = null;
  phasePanel.classList.add('hidden');
  renderCanvas();
}

// --- Phase config panel ---
function renderPhaseConfig(phaseId) {
  var phase = gameConfig.phases[phaseId];
  if (!phase) return;

  phaseConfigForm.innerHTML = '';

  // Phase ID (read-only display)
  addField('Phase ID', 'text', 'phase-id', phaseId, true);

  // Phase type dropdown
  addSelect('Type', 'phase-type', PHASE_TYPES, phase.type, function (value) {
    phase.type = value;
    renderCanvas();
    renderPhaseConfig(phaseId);
  });

  // Screen info
  var info = SCREEN_INFO[phase.type];
  if (info) {
    addScreenInfo(info.host, info.player);
  }

  // Type-specific fields
  var type = phase.type;

  if (type === 'lobby') {
    addNumberField('Min Players', 'phase-minPlayers', phase.minPlayers, function (value) {
      phase.minPlayers = value;
    });
  }

  if (type === 'collect') {
    addTextField('Prompt', 'phase-prompt', phase.prompt, function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addNumberField('Timer (seconds)', 'phase-timer', phase.timer, function (value) {
      phase.timer = value;
    });
    addSelect('Eligible Players', 'phase-from', ['all', 'remaining', 'eliminated'], phase.from || 'all', function (value) {
      if (value === 'all') {
        delete phase.from;
      } else {
        phase.from = value;
      }
    });
  }

  if (type === 'ai-process') {
    addSelect('AI Task', 'phase-task', ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge'], phase.task || 'summarize', function (value) {
      phase.task = value;
      renderCanvas();
    });
    addTextArea('Instruction', 'phase-instruction', phase.instruction, function (value) {
      phase.instruction = value;
    });
    addTextField('Input Reference', 'phase-input', phase.input, function (value) {
      phase.input = value;
    });
    addSelect('Output Format', 'phase-format', ['text', 'json'], phase.format || 'text', function (value) {
      phase.format = value;
    });
  }

  if (type === 'vote') {
    addSelect('Vote Mode', 'phase-mode', ['pick-one', 'head-to-head'], phase.mode || 'pick-one', function (value) {
      phase.mode = value;
      renderCanvas();
    });
    addTextField('Candidates Reference', 'phase-candidates', phase.candidates, function (value) {
      phase.candidates = value;
    });
    addSelect('Voters', 'phase-voters', ['all', 'remaining', 'eliminated'], phase.voters || 'all', function (value) {
      if (value === 'all') {
        delete phase.voters;
      } else {
        phase.voters = value;
      }
    });
    addTextField('Question', 'phase-question', phase.question, function (value) {
      phase.question = value;
    });
    addNumberField('Timer (seconds)', 'phase-timer', phase.timer, function (value) {
      phase.timer = value;
    });
  }

  if (type === 'eliminate') {
    addSelect('Method', 'phase-method', ['bottom-percent', 'hook'], phase.method || 'bottom-percent', function (value) {
      phase.method = value;
      renderCanvas();
      renderPhaseConfig(phaseId);
    });
    if (phase.method === 'bottom-percent' || !phase.method) {
      addNumberField('Percent to Eliminate', 'phase-percent', phase.percent, function (value) {
        phase.percent = value;
      });
    }
    if (phase.method === 'hook') {
      addTextField('Hook Function', 'phase-hook', phase.hook, function (value) {
        phase.hook = value;
      });
    }
    addTextField('Input Reference', 'phase-input', phase.input, function (value) {
      phase.input = value;
    });
  }

  if (type === 'reveal') {
    addTextArea('Template', 'phase-template', phase.template, function (value) {
      phase.template = value;
      renderCanvas();
    });
  }

  if (type === 'preview') {
    addTextArea('Template', 'phase-template', phase.template, function (value) {
      phase.template = value;
    });
  }

  if (type === 'winner') {
    addTextField('Scores Reference', 'phase-from', phase.from, function (value) {
      phase.from = value;
    });
  }

  if (type === 'end') {
    addTextField('Message', 'phase-message', phase.message, function (value) {
      phase.message = value;
      renderCanvas();
    });
  }

  // Next phase (for all types except end)
  if (type !== 'end') {
    var phaseIds = Object.keys(gameConfig.phases);
    var nextOptions = ['(none)'].concat(phaseIds.filter(function (id) { return id !== phaseId; }));
    addSelect('Next Phase', 'phase-next', nextOptions, phase.next || '(none)', function (value) {
      phase.next = value === '(none)' ? undefined : value;
      renderCanvas();
    });
  }

  // Delete button (don't allow deleting lobby or end if they're the only ones)
  var deleteSection = document.createElement('div');
  deleteSection.className = 'delete-phase-section';
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-danger';
  deleteBtn.textContent = 'Delete Phase';
  deleteBtn.addEventListener('click', function () {
    deletePhase(phaseId);
  });
  deleteSection.appendChild(deleteBtn);
  phaseConfigForm.appendChild(deleteSection);
}

// --- Form field helpers ---
function addScreenInfo(hostText, playerText) {
  var wrapper = document.createElement('div');
  wrapper.className = 'screen-info';

  var hostBox = document.createElement('div');
  hostBox.className = 'screen-info-box screen-info-host';
  var hostLabel = document.createElement('span');
  hostLabel.className = 'screen-info-label';
  hostLabel.textContent = 'Host screen';
  var hostDesc = document.createElement('span');
  hostDesc.className = 'screen-info-desc';
  hostDesc.textContent = hostText;
  hostBox.appendChild(hostLabel);
  hostBox.appendChild(hostDesc);

  var playerBox = document.createElement('div');
  playerBox.className = 'screen-info-box screen-info-player';
  var playerLabel = document.createElement('span');
  playerLabel.className = 'screen-info-label';
  playerLabel.textContent = 'Player screen';
  var playerDesc = document.createElement('span');
  playerDesc.className = 'screen-info-desc';
  playerDesc.textContent = playerText;
  playerBox.appendChild(playerLabel);
  playerBox.appendChild(playerDesc);

  wrapper.appendChild(hostBox);
  wrapper.appendChild(playerBox);
  phaseConfigForm.appendChild(wrapper);
}

function addField(label, type, id, value, readOnly) {
  var group = document.createElement('div');
  group.className = 'form-group';

  var lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;

  var input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.value = value || '';
  if (readOnly) {
    input.readOnly = true;
    input.style.background = '#f5f5f5';
    input.style.color = '#999';
  }

  group.appendChild(lbl);
  group.appendChild(input);
  phaseConfigForm.appendChild(group);
  return input;
}

function addTextField(label, id, value, onChange) {
  var input = addField(label, 'text', id, value, false);
  input.addEventListener('input', function () {
    onChange(input.value);
  });
  return input;
}

function addNumberField(label, id, value, onChange) {
  var input = addField(label, 'number', id, value, false);
  input.addEventListener('input', function () {
    var num = input.value ? parseInt(input.value) : null;
    onChange(num);
  });
  return input;
}

function addTextArea(label, id, value, onChange) {
  var group = document.createElement('div');
  group.className = 'form-group';

  var lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;

  var textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.rows = 4;
  textarea.value = value || '';
  textarea.addEventListener('input', function () {
    onChange(textarea.value);
  });

  group.appendChild(lbl);
  group.appendChild(textarea);
  phaseConfigForm.appendChild(group);
  return textarea;
}

function addSelect(label, id, options, selected, onChange) {
  var group = document.createElement('div');
  group.className = 'form-group';

  var lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;

  var select = document.createElement('select');
  select.id = id;

  for (var i = 0; i < options.length; i++) {
    var opt = document.createElement('option');
    opt.value = options[i];
    opt.textContent = options[i];
    if (options[i] === selected) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  select.addEventListener('change', function () {
    onChange(select.value);
  });

  group.appendChild(lbl);
  group.appendChild(select);
  phaseConfigForm.appendChild(group);
  return select;
}

// --- Phase management ---
function addPhase() {
  var phaseIds = Object.keys(gameConfig.phases);
  var count = phaseIds.length;
  var newId = 'phase-' + count;

  // Ensure unique ID
  while (gameConfig.phases[newId]) {
    count++;
    newId = 'phase-' + count;
  }

  // Find the phase before "end" to insert the new phase into the chain
  var endId = null;
  for (var id in gameConfig.phases) {
    if (gameConfig.phases[id].type === 'end') {
      endId = id;
      break;
    }
  }

  // Find the phase whose next points to end
  var beforeEnd = null;
  if (endId) {
    for (var id in gameConfig.phases) {
      if (gameConfig.phases[id].next === endId) {
        beforeEnd = id;
        break;
      }
    }
  }

  // Create the new phase
  gameConfig.phases[newId] = {
    type: 'collect',
    prompt: 'Enter your response',
    next: endId || undefined
  };

  // Re-link: previous phase before end now points to new phase
  if (beforeEnd) {
    gameConfig.phases[beforeEnd].next = newId;
  }

  renderCanvas();
  selectPhase(newId);
}

function deletePhase(phaseId) {
  var phase = gameConfig.phases[phaseId];
  if (!phase) return;

  // Don't delete the only lobby or end
  if (phase.type === 'lobby' || phase.type === 'end') {
    alert('Cannot delete the ' + phase.type + ' phase.');
    return;
  }

  // Re-link: any phase pointing to this one should point to this phase's next
  var nextId = phase.next || undefined;
  for (var id in gameConfig.phases) {
    if (gameConfig.phases[id].next === phaseId) {
      gameConfig.phases[id].next = nextId;
    }
  }

  delete gameConfig.phases[phaseId];
  deselectPhase();
}

// --- Save / Test ---
function saveGame() {
  alert('Save not yet implemented.\n\nConfig JSON:\n' + JSON.stringify(gameConfig, null, 2));
}

function testGame() {
  // Open host screen — in the future this could create a test room
  window.open('/host', '_blank');
}

// --- Start ---
init();
