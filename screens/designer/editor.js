// --- State ---
var gameId = null;
var gameConfig = null;
var selectedPhaseId = null;
var draggedPhaseId = null;
var didDrag = false;
var isDirty = false;
var aiIssues = {};

// --- Constants ---

// Unified catalog: friendly names, icons, descriptions, colors, screen info
var PHASE_CATALOG = {
  'lobby': {
    icon: '\u231B',
    friendlyName: 'Waiting Room',
    description: 'Players join and wait for the teacher to start',
    color: '#1976d2',
    bg: '#e3f2fd',
    detailField: null,
    host: 'Player list, player count, Start Game button',
    player: '"Waiting for game to start" message',
    ai: null
  },
  'collect': {
    icon: '\u270D\uFE0F',
    friendlyName: 'Ask Players',
    description: 'Players type and submit a text response',
    color: '#388e3c',
    bg: '#e8f5e9',
    detailField: 'prompt',
    host: 'Prompt text, submission counter, Close Submissions button',
    player: 'Prompt text, text input field, Submit button',
    ai: null
  },
  'ai-process': {
    icon: '\u2728',
    friendlyName: 'AI Does Something',
    description: 'AI reads player answers and creates a result',
    color: '#7b1fa2',
    bg: '#f3e5f5',
    detailField: 'task',
    host: '"Processing\u2026" spinner (auto-advances)',
    player: '"Processing\u2026" spinner',
    ai: 'Reads input data, runs the chosen task, returns a result'
  },
  'vote': {
    icon: '\u2611\uFE0F',
    friendlyName: 'Players Vote',
    description: 'Players vote on choices (pick-one or head-to-head)',
    color: '#f57c00',
    bg: '#fff3e0',
    detailField: 'mode',
    host: 'Vote counter, Close Voting button',
    player: 'Voting UI with choices, Submit Vote button',
    ai: null
  },
  'eliminate': {
    icon: '\u274C',
    friendlyName: 'Eliminate Players',
    description: 'Remove a percentage of players based on scores',
    color: '#d32f2f',
    bg: '#ffebee',
    detailField: 'method',
    host: 'Eliminated player names, remaining count',
    player: '"You were eliminated" or "You survived!"',
    ai: null
  },
  'reveal': {
    icon: '\uD83D\uDCE2',
    friendlyName: 'Show Everyone',
    description: 'Display content to both host and players',
    color: '#0097a7',
    bg: '#e0f7fa',
    detailField: 'template',
    host: 'Rendered template content, Advance button',
    player: 'Rendered template content',
    ai: null
  },
  'preview': {
    icon: '\uD83D\uDC41\uFE0F',
    friendlyName: 'Teacher Reviews',
    description: 'Teacher sees content and can approve or reject',
    color: '#f9a825',
    bg: '#fffde7',
    detailField: 'template',
    host: 'Content preview, Approve / Reject buttons',
    player: '"Waiting for teacher\u2026" message',
    ai: null
  },
  'winner': {
    icon: '\uD83C\uDFC6',
    friendlyName: 'Crown a Winner',
    description: 'Declare the winner based on scores',
    color: '#ff8f00',
    bg: '#fff8e1',
    detailField: null,
    host: 'Winner name, final standings, Advance button',
    player: 'Winner announcement, standings',
    ai: null
  },
  'end': {
    icon: '\uD83C\uDFC1',
    friendlyName: 'Game Over',
    description: 'End the game and show a final message',
    color: '#757575',
    bg: '#f5f5f5',
    detailField: 'message',
    host: 'Game over message',
    player: 'Game over message',
    ai: null
  }
};

var PHASE_TYPES = Object.keys(PHASE_CATALOG);

// Friendly names for AI task types
var AI_TASK_CATALOG = {
  'summarize':        { friendlyName: 'Summarize answers',   description: 'Combine responses into a short insight' },
  'generate':         { friendlyName: 'Create something new', description: 'Generate original content from player input' },
  'generate-choices': { friendlyName: 'Generate choices',     description: 'Create multiple-choice options from input' },
  'compare':          { friendlyName: 'Find similar answers', description: 'Group responses by semantic similarity' },
  'rank':             { friendlyName: 'Rank answers',         description: 'Order responses by a given criteria' },
  'judge':            { friendlyName: 'Pick a winner',        description: 'Choose the best response with explanation' }
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
var reviewBtn = document.getElementById('review-btn');
var reviewPanel = document.getElementById('review-panel');
var reviewContent = document.getElementById('review-content');
var reviewCloseBtn = document.getElementById('review-close');
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
  reviewBtn.addEventListener('click', runDeepReview);
  reviewCloseBtn.addEventListener('click', function () { reviewPanel.hidden = true; });
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
  isDirty = false;
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
  isDirty = true;
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

  // Follow the next chain (preview uses approveNext instead of next)
  if (startId) {
    var current = startId;
    while (current && !visited[current] && phases[current]) {
      order.push(current);
      visited[current] = true;
      var p = phases[current];
      current = p.next || p.approveNext || null;
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
    var cat = PHASE_CATALOG[phase.type] || PHASE_CATALOG['end'];

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

    // Icon + friendly name row
    var header = document.createElement('div');
    header.className = 'phase-box-header';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'phase-box-icon';
    iconSpan.textContent = cat.icon;

    var friendlyName = document.createElement('span');
    friendlyName.className = 'phase-box-name';
    friendlyName.textContent = cat.friendlyName;

    header.appendChild(iconSpan);
    header.appendChild(friendlyName);
    box.appendChild(header);

    // Phase ID in muted text
    var idLine = document.createElement('div');
    idLine.className = 'phase-box-id';
    idLine.textContent = phaseId;
    box.appendChild(idLine);

    // Content summary
    var detailField = cat.detailField;
    if (detailField && phase[detailField]) {
      var detail = document.createElement('div');
      detail.className = 'phase-box-detail';
      var text = String(phase[detailField]);
      detail.textContent = text.length > 50 ? text.substring(0, 50) + '\u2026' : text;
      box.appendChild(detail);
    }

    // Role indicator dots (H = host, P = player, AI)
    var dots = document.createElement('div');
    dots.className = 'phase-box-dots';

    var hostDot = document.createElement('span');
    hostDot.className = 'role-dot role-host';
    hostDot.textContent = 'H';
    hostDot.title = 'Host';
    dots.appendChild(hostDot);

    var playerDot = document.createElement('span');
    playerDot.className = 'role-dot role-player';
    playerDot.textContent = 'P';
    playerDot.title = 'Players';
    dots.appendChild(playerDot);

    if (cat.ai) {
      var aiDot = document.createElement('span');
      aiDot.className = 'role-dot role-ai';
      aiDot.textContent = 'AI';
      aiDot.title = 'AI is active';
      dots.appendChild(aiDot);
    }

    box.appendChild(dots);

    // AI issue badge
    var phaseAiIssues = aiIssues[phaseId];
    if (phaseAiIssues && phaseAiIssues.length > 0) {
      var badge = document.createElement('span');
      badge.className = 'ai-issue-badge';
      var hasError = phaseAiIssues.some(function (iss) { return iss.severity === 'error'; });
      if (hasError) badge.classList.add('has-errors');
      badge.textContent = phaseAiIssues.length;
      badge.title = phaseAiIssues.map(function (iss) { return iss.message; }).join('\n');
      box.appendChild(badge);
    }

    phaseList.appendChild(box);

    // Arrow between phases
    var phaseNext = phase.next || phase.approveNext;
    if (i < order.length - 1 && phaseNext === order[i + 1]) {
      var arrow = document.createElement('div');
      arrow.className = 'phase-arrow';
      arrow.textContent = '\u2193';
      phaseList.appendChild(arrow);
    } else if (i < order.length - 1) {
      var arrow = document.createElement('div');
      arrow.className = 'phase-arrow';
      arrow.textContent = phaseNext ? '\u2193' : '\u00b7\u00b7\u00b7';
      arrow.style.color = phaseNext ? '#bbb' : '#ddd';
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
  isDirty = true;
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
      if (phase.type === 'preview') {
        phase.approveNext = order[i + 1];
        delete phase.next;
      } else {
        phase.next = order[i + 1];
      }
    } else {
      // Last phase (should be end) — no next
      delete phase.next;
      delete phase.approveNext;
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
  var cat = PHASE_CATALOG[phase.type] || PHASE_CATALOG['end'];

  phaseConfigForm.innerHTML = '';

  // --- Header: icon + friendly name + description ---
  var headerDiv = document.createElement('div');
  headerDiv.className = 'config-phase-header';

  var headerIcon = document.createElement('span');
  headerIcon.className = 'config-phase-icon';
  headerIcon.textContent = cat.icon;
  headerIcon.style.background = cat.bg;
  headerIcon.style.borderColor = cat.color;

  var headerInfo = document.createElement('div');
  headerInfo.className = 'config-phase-info';

  var headerName = document.createElement('div');
  headerName.className = 'config-phase-name';
  headerName.textContent = cat.friendlyName;

  var headerDesc = document.createElement('div');
  headerDesc.className = 'config-phase-desc';
  headerDesc.textContent = cat.description;

  headerInfo.appendChild(headerName);
  headerInfo.appendChild(headerDesc);
  headerDiv.appendChild(headerIcon);
  headerDiv.appendChild(headerInfo);
  phaseConfigForm.appendChild(headerDiv);

  // Phase ID (read-only)
  addFieldWithHelp('Step ID', 'Internal name used in config', 'text', 'phase-id', phaseId, true);

  // Phase type dropdown
  addPhaseTypeSelect('Step type', 'What this step does in the game', 'phase-type', phase.type, function (value) {
    phase.type = value;
    renderCanvas();
    renderPhaseConfig(phaseId);
  });

  // Screen info with AI lane
  addScreenInfo(cat.host, cat.player, cat.ai);

  // --- Type-specific fields grouped into sections ---
  var type = phase.type;

  if (type === 'lobby') {
    addSectionHeader('Settings');
    addFieldWithHelp('Min players to start', 'Game won\'t start until this many join', 'number', 'phase-minPlayers', phase.minPlayers, false, function (value) {
      phase.minPlayers = value;
    });
  }

  if (type === 'collect') {
    addSectionHeader('What players see');
    addTextAreaWithHelp('Question to ask', 'This appears on every player\'s screen', 'phase-prompt', phase.prompt, 'e.g. What did you do this weekend?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits when time runs out.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });

    addSectionHeader('Who answers');
    addSelectWithHelp('Eligible players', 'Which players can submit answers', 'phase-from',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'remaining', label: 'Remaining players only' },
        { value: 'eliminated', label: 'Eliminated players only' }
      ],
      phase.from || 'all', function (value) {
        if (value === 'all') { delete phase.from; } else { phase.from = value; }
      }
    );
  }

  if (type === 'ai-process') {
    addSectionHeader('What AI does');
    var taskOptions = [];
    var taskTypes = Object.keys(AI_TASK_CATALOG);
    for (var t = 0; t < taskTypes.length; t++) {
      var key = taskTypes[t];
      taskOptions.push({ value: key, label: AI_TASK_CATALOG[key].friendlyName + ' (' + key + ')' });
    }
    addSelectWithHelp('AI task', AI_TASK_CATALOG[phase.task || 'summarize'] ? AI_TASK_CATALOG[phase.task || 'summarize'].description : '', 'phase-task', taskOptions, phase.task || 'summarize', function (value) {
      phase.task = value;
      renderCanvas();
      renderPhaseConfig(phaseId);
    });

    var instrPlaceholder = 'e.g. Write a funny poem combining all these weekend activities';
    if (phase.task === 'compare') instrPlaceholder = 'e.g. Group similar answers together';
    if (phase.task === 'rank') instrPlaceholder = 'e.g. Rank from most to least creative';
    if (phase.task === 'judge') instrPlaceholder = 'e.g. Pick the funniest answer and explain why';

    addTextAreaWithHelp('Instructions for AI', 'Tell the AI exactly what to do with the player answers', 'phase-instruction', phase.instruction, instrPlaceholder, function (value) {
      phase.instruction = value;
    });

    addSectionHeader('Data');
    addDataRefDropdown('Input data', 'Where the AI reads player answers from', 'phase-input', phaseId, phase.input, function (value) {
      phase.input = value;
    });
    addSelectWithHelp('Output format', 'Use JSON when the result needs structure (lists, groups)', 'phase-format',
      [
        { value: 'text', label: 'Plain text' },
        { value: 'json', label: 'Structured (JSON)' }
      ],
      phase.format || 'text', function (value) {
        phase.format = value;
      }
    );
  }

  if (type === 'vote') {
    addSectionHeader('Voting setup');
    addSelectWithHelp('Vote style', 'How choices are shown to players', 'phase-mode',
      [
        { value: 'pick-one', label: 'Pick one from a list' },
        { value: 'head-to-head', label: 'Head-to-head matchups' }
      ],
      phase.mode || 'pick-one', function (value) {
        phase.mode = value;
        renderCanvas();
      }
    );
    addDataRefDropdown('Candidates from', 'Where to get the list of choices', 'phase-candidates', phaseId, phase.candidates, function (value) {
      phase.candidates = value;
    });
    addFieldWithHelp('Question', 'Shown above the voting choices', 'text', 'phase-question', phase.question, false, function (value) {
      phase.question = value;
    });

    addSectionHeader('Who votes');
    addSelectWithHelp('Voters', 'Which players can vote', 'phase-voters',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'remaining', label: 'Remaining players only' },
        { value: 'eliminated', label: 'Eliminated players only' }
      ],
      phase.voters || 'all', function (value) {
        if (value === 'all') { delete phase.voters; } else { phase.voters = value; }
      }
    );
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Random vote on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
  }

  if (type === 'eliminate') {
    addSectionHeader('Elimination rules');
    addSelectWithHelp('Method', 'How players are eliminated', 'phase-method',
      [
        { value: 'bottom-percent', label: 'Bottom percentage of scores' },
        { value: 'hook', label: 'Custom hook function' }
      ],
      phase.method || 'bottom-percent', function (value) {
        phase.method = value;
        renderCanvas();
        renderPhaseConfig(phaseId);
      }
    );
    if (phase.method === 'bottom-percent' || !phase.method) {
      addFieldWithHelp('Percent to eliminate', 'e.g. 60 means bottom 60% are eliminated', 'number', 'phase-percent', phase.percent, false, function (value) {
        phase.percent = value;
      });
    }
    if (phase.method === 'hook') {
      addFieldWithHelp('Hook function name', 'Name of the function in your game\'s hooks file', 'text', 'phase-hook', phase.hook, false, function (value) {
        phase.hook = value;
      });
    }

    addSectionHeader('Data');
    addDataRefDropdown('Scores from', 'Where to read player scores for elimination', 'phase-input', phaseId, phase.input, function (value) {
      phase.input = value;
    });
  }

  if (type === 'reveal') {
    addSectionHeader('What everyone sees');
    addTextAreaWithHelp('Display template', 'Use {{phaseId.field}} to insert data. e.g. {{process.result}}', 'phase-template', phase.template, 'e.g. Here\'s what AI created:\n\n{{process.result}}', function (value) {
      phase.template = value;
      renderCanvas();
    });
  }

  if (type === 'preview') {
    addSectionHeader('What teacher reviews');
    addDataRefDropdown('Content from', 'Which step\'s output to show the teacher', 'phase-content', phaseId, phase.content, function (value) {
      phase.content = value || undefined;
    });
    addTextAreaWithHelp('Display template', 'Use {{phaseId.field}} to insert data', 'phase-template', phase.template, 'e.g. {{process.result}}', function (value) {
      phase.template = value || undefined;
    });
    addSelectWithHelp('Show player answers', 'Display original responses alongside AI content', 'phase-showResponses',
      [
        { value: 'true', label: 'Yes, show them' },
        { value: 'false', label: 'No, hide them' }
      ],
      phase.showResponses === false ? 'false' : 'true', function (value) {
        phase.showResponses = value === 'true';
      }
    );

    addSectionHeader('Flow');
    addPhaseRefSelect('If approved, go to', 'Which step to go to when teacher approves', 'phase-approveNext', phaseId, phase.approveNext, function (value) {
      phase.approveNext = value === '(none)' ? undefined : value;
      renderCanvas();
    });
    addPhaseRefSelect('If rejected, go to', 'Which step to go to when teacher rejects (usually back to AI)', 'phase-rejectNext', phaseId, phase.rejectNext, function (value) {
      phase.rejectNext = value === '(none)' ? undefined : value;
      renderCanvas();
    });
  }

  if (type === 'winner') {
    addSectionHeader('Data');
    addDataRefDropdown('Scores from', 'Which step\'s scores determine the winner', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
  }

  if (type === 'end') {
    addSectionHeader('What everyone sees');
    addFieldWithHelp('Final message', 'Shown to all players when the game ends', 'text', 'phase-message', phase.message, false, function (value) {
      phase.message = value;
      renderCanvas();
    });
  }

  // --- Flow: Next phase (for all types except end and preview) ---
  if (type !== 'end' && type !== 'preview') {
    addSectionHeader('Flow');
    addPhaseRefSelect('Next step', 'Which step comes after this one', 'phase-next', phaseId, phase.next, function (value) {
      phase.next = value === '(none)' ? undefined : value;
      renderCanvas();
    });
  }

  // --- AI Suggestions (if any) ---
  if (aiIssues[phaseId] && aiIssues[phaseId].length > 0) {
    addSectionHeader('AI Suggestions');
    for (var ai = 0; ai < aiIssues[phaseId].length; ai++) {
      var issue = aiIssues[phaseId][ai];
      var item = document.createElement('div');
      item.className = 'ai-suggestion-item severity-' + (issue.severity || 'warning');

      var msg = document.createElement('div');
      msg.className = 'ai-suggestion-message';
      msg.textContent = issue.message;
      item.appendChild(msg);

      if (issue.suggestion) {
        var fix = document.createElement('div');
        fix.className = 'ai-suggestion-fix';
        fix.textContent = issue.suggestion;
        item.appendChild(fix);
      }

      phaseConfigForm.appendChild(item);
    }
  }

  // --- Delete button ---
  var deleteSection = document.createElement('div');
  deleteSection.className = 'delete-phase-section';
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-danger';
  deleteBtn.textContent = 'Delete Step';
  deleteBtn.addEventListener('click', function () {
    deletePhase(phaseId);
  });
  deleteSection.appendChild(deleteBtn);
  phaseConfigForm.appendChild(deleteSection);
}

// --- Form field helpers ---

// Get friendly display name for a phase (e.g. "Ask Players (collect)")
function getFriendlyPhaseName(phaseId) {
  var phase = gameConfig.phases[phaseId];
  if (!phase) return phaseId;
  var cat = PHASE_CATALOG[phase.type];
  if (!cat) return phaseId;
  return cat.icon + ' ' + cat.friendlyName + ' (' + phaseId + ')';
}

// Section header divider
function addSectionHeader(title) {
  var header = document.createElement('div');
  header.className = 'config-section-header';
  header.textContent = title;
  phaseConfigForm.appendChild(header);
}

// Screen info boxes with optional AI lane
function addScreenInfo(hostText, playerText, aiText) {
  var wrapper = document.createElement('div');
  wrapper.className = 'screen-info';

  var hostBox = document.createElement('div');
  hostBox.className = 'screen-info-box screen-info-host';
  var hostLabel = document.createElement('span');
  hostLabel.className = 'screen-info-label';
  hostLabel.textContent = 'Host sees';
  var hostDesc = document.createElement('span');
  hostDesc.className = 'screen-info-desc';
  hostDesc.textContent = hostText;
  hostBox.appendChild(hostLabel);
  hostBox.appendChild(hostDesc);

  var playerBox = document.createElement('div');
  playerBox.className = 'screen-info-box screen-info-player';
  var playerLabel = document.createElement('span');
  playerLabel.className = 'screen-info-label';
  playerLabel.textContent = 'Players see';
  var playerDesc = document.createElement('span');
  playerDesc.className = 'screen-info-desc';
  playerDesc.textContent = playerText;
  playerBox.appendChild(playerLabel);
  playerBox.appendChild(playerDesc);

  wrapper.appendChild(hostBox);
  wrapper.appendChild(playerBox);

  if (aiText) {
    var aiBox = document.createElement('div');
    aiBox.className = 'screen-info-box screen-info-ai';
    var aiLabel = document.createElement('span');
    aiLabel.className = 'screen-info-label';
    aiLabel.textContent = 'AI does';
    var aiDesc = document.createElement('span');
    aiDesc.className = 'screen-info-desc';
    aiDesc.textContent = aiText;
    aiBox.appendChild(aiLabel);
    aiBox.appendChild(aiDesc);
    wrapper.appendChild(aiBox);
  }

  phaseConfigForm.appendChild(wrapper);
}

// Text field with helper text
function addFieldWithHelp(label, helpText, type, id, value, readOnly, onChange) {
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
  if (onChange && !readOnly) {
    input.addEventListener('input', function () {
      isDirty = true;
      if (type === 'number') {
        onChange(input.value ? parseInt(input.value) : null);
      } else {
        onChange(input.value);
      }
    });
  }

  group.appendChild(lbl);
  group.appendChild(input);

  if (helpText) {
    var help = document.createElement('span');
    help.className = 'field-help';
    help.textContent = helpText;
    group.appendChild(help);
  }

  phaseConfigForm.appendChild(group);
  return input;
}

// Textarea with helper text
function addTextAreaWithHelp(label, helpText, id, value, placeholder, onChange) {
  var group = document.createElement('div');
  group.className = 'form-group';

  var lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;

  var textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.rows = 4;
  textarea.value = value || '';
  if (placeholder) textarea.placeholder = placeholder;
  textarea.addEventListener('input', function () {
    isDirty = true;
    onChange(textarea.value);
  });

  group.appendChild(lbl);
  group.appendChild(textarea);

  if (helpText) {
    var help = document.createElement('span');
    help.className = 'field-help';
    help.textContent = helpText;
    group.appendChild(help);
  }

  phaseConfigForm.appendChild(group);
  return textarea;
}

// Select with friendly option labels and helper text
function addSelectWithHelp(label, helpText, id, options, selected, onChange) {
  var group = document.createElement('div');
  group.className = 'form-group';

  var lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;

  var select = document.createElement('select');
  select.id = id;

  // options: array of { value, label } or plain strings
  for (var i = 0; i < options.length; i++) {
    var opt = document.createElement('option');
    if (typeof options[i] === 'object') {
      opt.value = options[i].value;
      opt.textContent = options[i].label;
    } else {
      opt.value = options[i];
      opt.textContent = options[i];
    }
    if (opt.value === selected) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  select.addEventListener('change', function () {
    isDirty = true;
    onChange(select.value);
  });

  group.appendChild(lbl);
  group.appendChild(select);

  if (helpText) {
    var help = document.createElement('span');
    help.className = 'field-help';
    help.textContent = helpText;
    group.appendChild(help);
  }

  phaseConfigForm.appendChild(group);
  return select;
}

// Build data reference dropdown options from phases before currentPhaseId
function buildDataRefOptions(currentPhaseId) {
  var order = buildPhaseOrder();
  var currentIndex = order.indexOf(currentPhaseId);
  var options = [{ value: '', label: '(none)' }];

  for (var i = 0; i < order.length; i++) {
    if (i >= currentIndex) break;
    var pid = order[i];
    var p = gameConfig.phases[pid];
    var cat = PHASE_CATALOG[p.type];
    if (!cat) continue;

    if (p.type === 'collect') {
      options.push({ value: pid + '.responses', label: 'Answers from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'ai-process') {
      options.push({ value: pid + '.result', label: 'AI result from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'vote') {
      options.push({ value: pid + '.scores', label: 'Scores from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'eliminate') {
      options.push({ value: pid + '.eliminated', label: 'Eliminated from ' + cat.friendlyName + ' (' + pid + ')' });
    }
  }

  return options;
}

// Data reference dropdown
function addDataRefDropdown(label, helpText, id, currentPhaseId, value, onChange) {
  var options = buildDataRefOptions(currentPhaseId);

  // If current value isn't in the list, add it as a custom option
  var found = false;
  for (var i = 0; i < options.length; i++) {
    if (options[i].value === value) { found = true; break; }
  }
  if (value && !found) {
    options.push({ value: value, label: value + ' (custom)' });
  }

  return addSelectWithHelp(label, helpText, id, options, value || '', function (val) {
    onChange(val || undefined);
  });
}

// Phase type select with friendly names
function addPhaseTypeSelect(label, helpText, id, selected, onChange) {
  var options = [];
  for (var i = 0; i < PHASE_TYPES.length; i++) {
    var type = PHASE_TYPES[i];
    var cat = PHASE_CATALOG[type];
    options.push({ value: type, label: cat.icon + ' ' + cat.friendlyName + ' (' + type + ')' });
  }
  return addSelectWithHelp(label, helpText, id, options, selected, onChange);
}

// Next-phase select with friendly names
function addPhaseRefSelect(label, helpText, id, currentPhaseId, selected, onChange) {
  var phaseIds = Object.keys(gameConfig.phases);
  var options = [{ value: '(none)', label: '(none)' }];
  for (var i = 0; i < phaseIds.length; i++) {
    var pid = phaseIds[i];
    if (pid === currentPhaseId) continue;
    var p = gameConfig.phases[pid];
    var cat = PHASE_CATALOG[p.type];
    if (cat) {
      options.push({ value: pid, label: cat.icon + ' ' + cat.friendlyName + ' (' + pid + ')' });
    } else {
      options.push({ value: pid, label: pid });
    }
  }
  return addSelectWithHelp(label, helpText, id, options, selected || '(none)', onChange);
}

// --- Phase management ---

// Picker modal: which phase types can be added
var ADDABLE_PHASE_TYPES = ['collect', 'ai-process', 'vote', 'eliminate', 'reveal', 'preview', 'winner'];

function addPhase() {
  showPhasePickerModal();
}

function showPhasePickerModal() {
  // Remove any existing modal
  var existing = document.getElementById('phase-picker-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'phase-picker-modal';
  overlay.className = 'picker-overlay';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  var modal = document.createElement('div');
  modal.className = 'picker-modal';

  var title = document.createElement('h2');
  title.className = 'picker-title';
  title.textContent = 'What should this step do?';
  modal.appendChild(title);

  var grid = document.createElement('div');
  grid.className = 'picker-grid';

  for (var i = 0; i < ADDABLE_PHASE_TYPES.length; i++) {
    var type = ADDABLE_PHASE_TYPES[i];
    var cat = PHASE_CATALOG[type];

    var card = document.createElement('div');
    card.className = 'picker-card';
    card.setAttribute('data-type', type);
    card.style.borderColor = cat.color;

    var cardIcon = document.createElement('span');
    cardIcon.className = 'picker-card-icon';
    cardIcon.textContent = cat.icon;

    var cardName = document.createElement('div');
    cardName.className = 'picker-card-name';
    cardName.textContent = cat.friendlyName;

    var cardDesc = document.createElement('div');
    cardDesc.className = 'picker-card-desc';
    cardDesc.textContent = cat.description;

    card.appendChild(cardIcon);
    card.appendChild(cardName);
    card.appendChild(cardDesc);

    card.addEventListener('click', (function (chosenType) {
      return function () {
        overlay.remove();
        addPhaseOfType(chosenType);
      };
    })(type));

    grid.appendChild(card);
  }

  modal.appendChild(grid);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function addPhaseOfType(type) {
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
      var p = gameConfig.phases[id];
      if (p.next === endId || p.approveNext === endId) {
        beforeEnd = id;
        break;
      }
    }
  }

  // Create the new phase with sensible defaults
  var newPhase = { type: type };

  if (type === 'collect') {
    newPhase.prompt = 'Enter your response';
  } else if (type === 'ai-process') {
    newPhase.task = 'summarize';
    newPhase.instruction = '';
    newPhase.format = 'text';
  } else if (type === 'vote') {
    newPhase.mode = 'pick-one';
  } else if (type === 'eliminate') {
    newPhase.method = 'bottom-percent';
    newPhase.percent = 50;
  } else if (type === 'reveal') {
    newPhase.template = '';
  } else if (type === 'preview') {
    newPhase.approveNext = endId || undefined;
    newPhase.rejectNext = undefined;
  } else if (type === 'winner') {
    // no extra defaults
  }

  // Set next (preview uses approveNext instead)
  if (type === 'preview') {
    newPhase.approveNext = endId || undefined;
  } else {
    newPhase.next = endId || undefined;
  }

  gameConfig.phases[newId] = newPhase;
  isDirty = true;

  // Re-link: previous phase before end now points to new phase
  if (beforeEnd) {
    var beforePhase = gameConfig.phases[beforeEnd];
    if (beforePhase.type === 'preview') {
      beforePhase.approveNext = newId;
    } else {
      beforePhase.next = newId;
    }
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
  var nextId = phase.next || phase.approveNext || undefined;
  for (var id in gameConfig.phases) {
    if (gameConfig.phases[id].next === phaseId) {
      gameConfig.phases[id].next = nextId;
    }
    if (gameConfig.phases[id].approveNext === phaseId) {
      gameConfig.phases[id].approveNext = nextId;
    }
    if (gameConfig.phases[id].rejectNext === phaseId) {
      gameConfig.phases[id].rejectNext = nextId;
    }
  }

  delete gameConfig.phases[phaseId];
  isDirty = true;
  deselectPhase();
}

// --- Validation ---

var VALID_TYPES = Object.keys(PHASE_CATALOG);

var REQUIRED_FIELDS = {
  collect: ['prompt'],
  'ai-process': ['instruction', 'input'],
  vote: ['mode', 'candidates'],
  eliminate: ['method'],
  preview: ['content', 'approveNext', 'rejectNext'],
  winner: ['from']
};

var VALID_ENUMS = {
  from: { types: ['collect'], values: ['all', 'remaining', 'eliminated'] },
  voters: { types: ['vote'], values: ['all', 'remaining', 'eliminated'] },
  mode: { types: ['vote'], values: ['pick-one', 'head-to-head'] },
  method: { types: ['eliminate'], values: ['bottom-percent', 'hook'] },
  format: { types: ['ai-process'], values: ['text', 'json'] },
  task: { types: ['ai-process'], values: ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge'] }
};

var DATA_REF_FIELDS = ['input', 'candidates', 'content'];

function validateConfig() {
  var errors = [];
  var warnings = [];
  var phases = gameConfig.phases || {};
  var phaseIds = Object.keys(phases);

  // Top-level checks
  if (!gameConfig.name || !gameConfig.name.trim()) {
    errors.push('Game is missing a name.');
  }

  var hasLobby = phaseIds.some(function (id) { return phases[id].type === 'lobby'; });
  var hasEnd = phaseIds.some(function (id) { return phases[id].type === 'end'; });
  if (!hasLobby) errors.push('Game needs a Waiting Room (lobby) step.');
  if (!hasEnd) errors.push('Game needs a Game Over (end) step.');

  for (var i = 0; i < phaseIds.length; i++) {
    var id = phaseIds[i];
    var phase = phases[id];
    var cat = PHASE_CATALOG[phase.type];
    var label = cat ? cat.friendlyName + ' (' + id + ')' : id;

    // Type check
    if (!phase.type || VALID_TYPES.indexOf(phase.type) === -1) {
      errors.push(label + ': Invalid step type "' + phase.type + '".');
      continue;
    }

    // Required fields
    var required = REQUIRED_FIELDS[phase.type];
    if (required) {
      for (var r = 0; r < required.length; r++) {
        var field = required[r];
        if (phase[field] === undefined || phase[field] === null || phase[field] === '') {
          errors.push(label + ': Missing required field "' + field + '".');
        }
      }
    }

    // Enum checks
    for (var enumField in VALID_ENUMS) {
      var spec = VALID_ENUMS[enumField];
      if (spec.types.indexOf(phase.type) === -1) continue;
      if (phase[enumField] !== undefined && phase[enumField] !== null) {
        if (spec.values.indexOf(phase[enumField]) === -1) {
          errors.push(label + ': Invalid ' + enumField + ' value "' + phase[enumField] + '".');
        }
      }
    }

    // Timer check
    if (phase.timer !== undefined && phase.timer !== null) {
      if (typeof phase.timer !== 'number' || phase.timer < 1 || phase.timer > 3600) {
        errors.push(label + ': Timer must be a number between 1 and 3600.');
      }
    }

    // Eliminate specifics
    if (phase.type === 'eliminate') {
      if (phase.method === 'bottom-percent') {
        if (!phase.percent || typeof phase.percent !== 'number' || phase.percent < 1 || phase.percent > 100) {
          errors.push(label + ': Bottom-percent requires a percent value between 1 and 100.');
        }
      }
      if (phase.method === 'hook' && !phase.hook) {
        errors.push(label + ': Hook method requires a hook function name.');
      }
    }

    // Data ref checks
    for (var d = 0; d < DATA_REF_FIELDS.length; d++) {
      var df = DATA_REF_FIELDS[d];
      if (phase[df] && typeof phase[df] === 'string' && phase[df].indexOf('.') !== -1) {
        var refPhaseId = phase[df].split('.')[0];
        if (!phases[refPhaseId]) {
          errors.push(label + ': References "' + phase[df] + '" but step "' + refPhaseId + '" does not exist.');
        }
      }
    }

    // Winner from data ref check
    if (phase.type === 'winner' && phase.from && typeof phase.from === 'string' && phase.from.indexOf('.') !== -1) {
      var winnerRef = phase.from.split('.')[0];
      if (!phases[winnerRef]) {
        errors.push(label + ': References "' + phase.from + '" but step "' + winnerRef + '" does not exist.');
      }
    }

    // Next/approveNext/rejectNext refs
    if (phase.next && !phases[phase.next]) {
      errors.push(label + ': "Next step" points to "' + phase.next + '" which does not exist.');
    }
    if (phase.approveNext && !phases[phase.approveNext]) {
      errors.push(label + ': "Approve next" points to "' + phase.approveNext + '" which does not exist.');
    }
    if (phase.rejectNext && !phases[phase.rejectNext]) {
      errors.push(label + ': "Reject next" points to "' + phase.rejectNext + '" which does not exist.');
    }
  }

  // Warnings: unreachable phases (BFS from lobby)
  if (hasLobby) {
    var reachable = {};
    var queue = [];
    for (var j = 0; j < phaseIds.length; j++) {
      if (phases[phaseIds[j]].type === 'lobby') {
        queue.push(phaseIds[j]);
        break;
      }
    }
    while (queue.length > 0) {
      var cur = queue.shift();
      if (reachable[cur]) continue;
      reachable[cur] = true;
      var p = phases[cur];
      if (p) {
        if (p.next && !reachable[p.next]) queue.push(p.next);
        if (p.approveNext && !reachable[p.approveNext]) queue.push(p.approveNext);
        if (p.rejectNext && !reachable[p.rejectNext]) queue.push(p.rejectNext);
      }
    }
    for (var k = 0; k < phaseIds.length; k++) {
      if (!reachable[phaseIds[k]]) {
        var uCat = PHASE_CATALOG[phases[phaseIds[k]].type];
        var uLabel = uCat ? uCat.friendlyName + ' (' + phaseIds[k] + ')' : phaseIds[k];
        warnings.push(uLabel + ': This step is unreachable from the game flow.');
      }
    }
  }

  return { errors: errors, warnings: warnings };
}

// --- Validation panel display ---

var validationPanel = document.getElementById('validation-panel');
var validationTitle = document.getElementById('validation-title');
var validationList = document.getElementById('validation-list');
var validationClose = document.getElementById('validation-close');

validationClose.addEventListener('click', function () {
  validationPanel.hidden = true;
});

function showValidationPanel(errors, warnings) {
  validationPanel.hidden = false;
  validationPanel.className = errors.length > 0 ? 'has-errors' : 'warnings-only';
  validationTitle.textContent = errors.length > 0
    ? errors.length + ' error' + (errors.length > 1 ? 's' : '') + ' found'
    : warnings.length + ' warning' + (warnings.length > 1 ? 's' : '');
  validationList.innerHTML = '';

  for (var i = 0; i < errors.length; i++) {
    var li = document.createElement('li');
    li.className = 'validation-error';
    li.textContent = errors[i];
    validationList.appendChild(li);
  }
  for (var j = 0; j < warnings.length; j++) {
    var li2 = document.createElement('li');
    li2.className = 'validation-warning';
    li2.textContent = warnings[j];
    validationList.appendChild(li2);
  }
}

// --- Save / Test ---
async function saveGame() {
  // Run validation
  var validation = validateConfig();
  if (validation.errors.length > 0) {
    showValidationPanel(validation.errors, validation.warnings);
    return;
  }
  if (validation.warnings.length > 0) {
    showValidationPanel(validation.errors, validation.warnings);
    if (!confirm('There are ' + validation.warnings.length + ' warning(s). Save anyway?')) {
      return;
    }
  }
  validationPanel.hidden = true;

  saveBtn.disabled = true;
  var originalText = saveBtn.textContent;

  try {
    var response;

    if (gameId) {
      // Update existing game
      response = await fetch('/api/games/' + encodeURIComponent(gameId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameConfig)
      });
    } else {
      // Create new game — prompt for ID
      var newId = prompt('Enter a game ID (lowercase letters, numbers, hyphens):');
      if (!newId) {
        saveBtn.disabled = false;
        return;
      }
      newId = newId.trim().toLowerCase();

      response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, config: gameConfig })
      });

      if (response.ok) {
        gameId = newId;
        var newUrl = window.location.pathname + '?game=' + encodeURIComponent(newId);
        window.history.replaceState(null, '', newUrl);
      }
    }

    var result = await response.json();

    if (response.ok) {
      isDirty = false;
      saveBtn.textContent = 'Saved!';
      runLightReview();  // async, non-blocking
    } else {
      alert('Save failed: ' + (result.error || 'Unknown error'));
      saveBtn.textContent = originalText;
    }
  } catch (error) {
    alert('Save failed: ' + error.message);
    saveBtn.textContent = originalText;
  }

  saveBtn.disabled = false;
  setTimeout(function () {
    saveBtn.textContent = originalText;
  }, 2000);
}

async function testGame() {
  // Save first if needed
  if (!gameId || isDirty) {
    await saveGame();
  }
  // Only open if we have a valid gameId (save succeeded)
  if (gameId) {
    window.open('/prototype?game=' + encodeURIComponent(gameId), '_blank');
  }
}

// --- AI Review ---

async function runLightReview() {
  try {
    var response = await fetch('/api/games/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: gameConfig, depth: 'light' })
    });
    if (!response.ok) return;
    var result = await response.json();
    applyReviewResults(result.ai);
  } catch (error) {
    console.log('Light review failed:', error.message);
  }
}

async function runDeepReview() {
  reviewBtn.disabled = true;
  reviewBtn.textContent = 'Checking...';

  try {
    var response = await fetch('/api/games/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: gameConfig, depth: 'deep' })
    });
    if (!response.ok) {
      var err = await response.json();
      alert('Review failed: ' + (err.error || 'Unknown error'));
      return;
    }
    var result = await response.json();
    applyReviewResults(result.ai);
    showReviewPanel(result);
  } catch (error) {
    alert('Review failed: ' + error.message);
  } finally {
    reviewBtn.disabled = false;
    reviewBtn.textContent = 'Check My Game';
  }
}

function applyReviewResults(aiResult) {
  aiIssues = {};
  if (aiResult && aiResult.issues) {
    for (var i = 0; i < aiResult.issues.length; i++) {
      var issue = aiResult.issues[i];
      if (!issue.phaseId) continue;
      if (!aiIssues[issue.phaseId]) aiIssues[issue.phaseId] = [];
      aiIssues[issue.phaseId].push(issue);
    }
  }
  renderCanvas();
  if (selectedPhaseId) {
    renderPhaseConfig(selectedPhaseId);
  }
}

function showReviewPanel(result) {
  reviewPanel.hidden = false;
  reviewContent.innerHTML = '';

  var ai = result.ai || {};
  var structural = result.structural || {};

  // Summary
  if (ai.summary) {
    var summaryDiv = document.createElement('div');
    summaryDiv.className = 'review-summary';
    summaryDiv.textContent = ai.summary;
    reviewContent.appendChild(summaryDiv);
  }

  // Collect all issues: structural errors + AI issues
  var allIssues = [];

  if (structural.errors) {
    for (var e = 0; e < structural.errors.length; e++) {
      allIssues.push({ severity: 'error', message: structural.errors[e], phaseId: null, suggestion: null });
    }
  }
  if (structural.warnings) {
    for (var w = 0; w < structural.warnings.length; w++) {
      allIssues.push({ severity: 'warning', message: structural.warnings[w], phaseId: null, suggestion: null });
    }
  }
  if (ai.issues) {
    for (var a = 0; a < ai.issues.length; a++) {
      allIssues.push(ai.issues[a]);
    }
  }

  if (allIssues.length === 0) {
    var noIssues = document.createElement('div');
    noIssues.className = 'review-summary';
    noIssues.textContent = 'No issues found. Your game looks good!';
    reviewContent.appendChild(noIssues);
    return;
  }

  // Sort: errors first, then warnings, then suggestions
  var severityOrder = { error: 0, warning: 1, suggestion: 2 };
  allIssues.sort(function (a, b) {
    return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
  });

  var list = document.createElement('div');
  list.className = 'review-issues';

  for (var i = 0; i < allIssues.length; i++) {
    var issue = allIssues[i];
    var item = document.createElement('div');
    item.className = 'review-issue review-issue-' + (issue.severity || 'warning');

    if (issue.phaseId && gameConfig.phases[issue.phaseId]) {
      var phaseLink = document.createElement('div');
      phaseLink.className = 'review-issue-phase';
      phaseLink.textContent = getFriendlyPhaseName(issue.phaseId);
      phaseLink.setAttribute('data-phase-id', issue.phaseId);
      phaseLink.addEventListener('click', function () {
        var pid = this.getAttribute('data-phase-id');
        selectPhase(pid);
      });
      item.appendChild(phaseLink);
    }

    var msgDiv = document.createElement('div');
    msgDiv.className = 'review-issue-message';
    msgDiv.textContent = issue.message;
    item.appendChild(msgDiv);

    if (issue.suggestion) {
      var sugDiv = document.createElement('div');
      sugDiv.className = 'review-issue-suggestion-text';
      sugDiv.textContent = issue.suggestion;
      item.appendChild(sugDiv);
    }

    list.appendChild(item);
  }

  reviewContent.appendChild(list);
}

// --- Start ---
init();
