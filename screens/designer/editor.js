// --- State ---
var gameId = null;
var gameConfig = null;
var selectedPhaseId = null;
var draggedPhaseId = null;
var didDrag = false;
var isDirty = false;
var aiIssues = {};
var previewVisible = false;

// --- Constants ---

// Unified catalog: friendly names, icons, descriptions, colors, screen info
var PHASE_CATALOG = {
  'lobby': {
    icon: '\u231B',
    friendlyName: 'Waiting Room',
    description: 'Players join and wait for the teacher to start',
    color: '#0057FF',
    bg: '#BBDEFB',
    detailField: null,
    host: 'Player list, player count, Start Game button',
    player: '"Waiting for game to start" message',
    ai: null
  },
  'collect': {
    icon: '\u270D\uFE0F',
    friendlyName: 'Ask Players',
    description: 'Players type and submit a text response',
    color: '#00C853',
    bg: '#C8E6C9',
    detailField: 'prompt',
    host: 'Prompt text, submission counter, Close Submissions button',
    player: 'Prompt text, text input field, Submit button',
    ai: null
  },
  'ai-process': {
    icon: '\u2728',
    friendlyName: 'AI Does Something',
    description: 'AI reads player answers and creates a result',
    color: '#AA00FF',
    bg: '#E1BEE7',
    detailField: 'task',
    host: '"Processing\u2026" spinner (auto-advances)',
    player: '"Processing\u2026" spinner',
    ai: 'Reads input data, runs the chosen task, returns a result'
  },
  'vote': {
    icon: '\u2611\uFE0F',
    friendlyName: 'Players Vote',
    description: 'Players vote on choices (pick-one or head-to-head)',
    color: '#FF6D00',
    bg: '#FFE0B2',
    detailField: 'mode',
    host: 'Vote counter, Close Voting button',
    player: 'Voting UI with choices, Submit Vote button',
    ai: null
  },
  'eliminate': {
    icon: '\u274C',
    friendlyName: 'Eliminate Players',
    description: 'Remove a percentage of players based on scores',
    color: '#FF2D2D',
    bg: '#FFCDD2',
    detailField: 'method',
    host: 'Eliminated player names, remaining count',
    player: '"You were eliminated" or "You survived!"',
    ai: null
  },
  'reveal': {
    icon: '\uD83D\uDCE2',
    friendlyName: 'Show Everyone',
    description: 'Display content to both host and players',
    color: '#0057FF',
    bg: '#B2EBF2',
    detailField: 'template',
    host: 'Rendered template content, Advance button',
    player: 'Rendered template content',
    ai: null
  },
  'preview': {
    icon: '\uD83D\uDC41\uFE0F',
    friendlyName: 'Teacher Reviews',
    description: 'Teacher sees content and can approve or reject',
    color: '#FFD600',
    bg: '#FFF9C4',
    detailField: 'template',
    host: 'Content preview, Approve / Reject buttons',
    player: '"Waiting for teacher\u2026" message',
    ai: null
  },
  'winner': {
    icon: '\uD83C\uDFC6',
    friendlyName: 'Crown a Winner',
    description: 'Declare the winner based on scores',
    color: '#FF6D00',
    bg: '#FFE0B2',
    detailField: null,
    host: 'Winner name, final standings, Advance button',
    player: 'Winner announcement, standings',
    ai: null
  },
  'announce': {
    icon: '\uD83D\uDCE3',
    friendlyName: 'Show a Message',
    description: 'Display a message to everyone (round intros, instructions)',
    color: '#0057FF',
    bg: '#B2EBF2',
    detailField: 'message',
    host: 'Message text, Continue button (or auto-advance with timer)',
    player: 'Message text',
    ai: null
  },
  'collect-choice': {
    icon: '\uD83D\uDCCB',
    friendlyName: 'Multiple Choice',
    description: 'Players pick from predefined choices',
    color: '#00C853',
    bg: '#C8E6C9',
    detailField: 'prompt',
    host: 'Question text, submission counter, Close Submissions button',
    player: 'Question text, choice buttons',
    ai: null
  },
  'ai-eliminate': {
    icon: '\uD83E\uDD16\u274C',
    friendlyName: 'AI Eliminates',
    description: 'AI judges answers and eliminates rule-breakers',
    color: '#FF2D2D',
    bg: '#FFCDD2',
    detailField: 'instruction',
    host: 'Elimination results with reasons',
    player: '"You were eliminated" or "You survived!"',
    ai: 'Reads answers, applies rules, decides who to eliminate'
  },
  'leaderboard': {
    icon: '\uD83D\uDCCA',
    friendlyName: 'Leaderboard',
    description: 'Show scores and rankings to everyone',
    color: '#FFD600',
    bg: '#FFF9C4',
    detailField: 'from',
    host: 'Full standings with scores, Continue button',
    player: 'Personal rank highlight, full standings',
    ai: null
  },
  'reveal-one': {
    icon: '\uD83C\uDFAD',
    friendlyName: 'Reveal One-by-One',
    description: 'Host reveals items incrementally (countdown style)',
    color: '#FF4081',
    bg: '#FCE4EC',
    detailField: 'from',
    host: 'Reveal Next button, items list, counter',
    player: 'Items appear one at a time as host reveals',
    ai: null
  },
  'team-split': {
    icon: '\uD83D\uDC65',
    friendlyName: 'Split Into Teams',
    description: 'Divide players into teams (random or balanced by score)',
    color: '#00BCD4',
    bg: '#B2EBF2',
    detailField: 'method',
    host: 'Team lists with player names, Continue button',
    player: 'Your team name, all team rosters',
    ai: null
  },
  'rank': {
    icon: '\uD83D\uDCCA',
    friendlyName: 'Rank Items',
    description: 'Players reorder a list by preference or criteria',
    color: '#7C4DFF',
    bg: '#E8D5FF',
    detailField: 'prompt',
    host: 'Prompt, submission counter, Close Ranking button',
    player: 'Prompt, sortable list with up/down arrows, Submit button',
    ai: null
  },
  'wager': {
    icon: '\uD83D\uDCB0',
    friendlyName: 'Place Wagers',
    description: 'Players bet points on an outcome',
    color: '#FF6D00',
    bg: '#FFE0B2',
    detailField: 'prompt',
    host: 'Prompt, options, wager counts, Close Wagers button',
    player: 'Prompt, option selection, amount input, Submit button',
    ai: null
  },
  'relay': {
    icon: '\uD83D\uDD17',
    friendlyName: 'Relay (Take Turns)',
    description: 'Players take turns adding to a growing shared result',
    color: '#009688',
    bg: '#B2DFDB',
    detailField: 'prompt',
    host: 'Shared result, active player, progress',
    player: 'Active: input + shared result. Waiting: watch others',
    ai: null
  },
  'foreach': {
    icon: '\uD83D\uDD01',
    friendlyName: 'For Each Response',
    description: 'Run sub-phases once per item (e.g., guess who said each answer)',
    color: '#6A1B9A',
    bg: '#E1BEE7',
    detailField: 'data',
    host: 'Runs sub-phases per item automatically',
    player: 'Sees sub-phase UI per iteration',
    ai: null
  },
  'end': {
    icon: '\uD83C\uDFC1',
    friendlyName: 'Game Over',
    description: 'End the game and show a final message',
    color: '#555',
    bg: '#E0E0E0',
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
var settingsTheme = document.getElementById('game-theme');
var customThemeSection = document.getElementById('custom-theme-section');
var customThemeDesc = document.getElementById('custom-theme-desc');
var generateThemeBtn = document.getElementById('generate-theme-btn');
var themePreview = document.getElementById('theme-preview');
var themePreviewSwatches = document.getElementById('theme-preview-swatches');
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

  // Live preview toggle
  var togglePreviewBtn = document.getElementById('toggle-preview-btn');
  if (togglePreviewBtn) {
    togglePreviewBtn.addEventListener('click', function () {
      previewVisible = !previewVisible;
      var container = document.getElementById('live-preview-container');
      if (previewVisible) {
        container.classList.remove('hidden');
        togglePreviewBtn.textContent = 'Hide Preview';
        if (selectedPhaseId) renderLivePreview(selectedPhaseId);
      } else {
        container.classList.add('hidden');
        togglePreviewBtn.textContent = 'Show Preview';
      }
    });
  }

  // Update config when settings change
  settingsName.addEventListener('input', readSettings);
  settingsDescription.addEventListener('input', readSettings);
  settingsMinPlayers.addEventListener('input', readSettings);
  settingsMaxPlayers.addEventListener('input', readSettings);

  // Populate theme select
  if (settingsTheme && window.GAME_THEMES) {
    var themes = window.GAME_THEMES;
    for (var key in themes) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = themes[key].icon + ' ' + themes[key].name;
      settingsTheme.appendChild(opt);
    }
    // Add custom option
    var customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '\uD83C\uDFA8 Custom (AI-generated)';
    settingsTheme.appendChild(customOpt);

    settingsTheme.addEventListener('change', handleThemeChange);
  }

  if (generateThemeBtn) {
    generateThemeBtn.addEventListener('click', generateCustomTheme);
  }
  if (customThemeDesc) {
    customThemeDesc.addEventListener('input', function () { isDirty = true; });
  }
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
  if (window.GAME_TEMPLATES && window.GAME_TEMPLATES.blank) {
    return window.GAME_TEMPLATES.blank.config();
  }
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

  // Theme
  if (settingsTheme) {
    var theme = gameConfig.theme;
    if (!theme) {
      settingsTheme.value = '';
      customThemeSection.hidden = true;
      themePreview.hidden = true;
    } else if (typeof theme === 'string') {
      settingsTheme.value = theme;
      customThemeSection.hidden = true;
      renderThemeSwatches(theme);
    } else if (typeof theme === 'object' && theme.name === 'custom') {
      settingsTheme.value = 'custom';
      customThemeSection.hidden = false;
      customThemeDesc.value = theme.description || '';
      if (theme.colors) {
        renderThemeSwatches(theme);
      } else {
        themePreview.hidden = true;
      }
    }
  }
}

function readSettings() {
  isDirty = true;
  gameConfig.name = settingsName.value.trim() || 'Untitled Game';
  gameConfig.description = settingsDescription.value.trim();
  gameConfig.minPlayers = settingsMinPlayers.value ? parseInt(settingsMinPlayers.value) : null;
  gameConfig.maxPlayers = settingsMaxPlayers.value ? parseInt(settingsMaxPlayers.value) : null;
  headerGameName.textContent = gameConfig.name;
}

// --- Theme ---
function handleThemeChange() {
  isDirty = true;
  var value = settingsTheme.value;

  if (!value) {
    delete gameConfig.theme;
    customThemeSection.hidden = true;
    themePreview.hidden = true;
  } else if (value === 'custom') {
    var existingDesc = '';
    if (gameConfig.theme && typeof gameConfig.theme === 'object') {
      existingDesc = gameConfig.theme.description || '';
    }
    gameConfig.theme = { name: 'custom', description: existingDesc, colors: null };
    customThemeSection.hidden = false;
    customThemeDesc.value = existingDesc;
    themePreview.hidden = true;
  } else {
    gameConfig.theme = value;
    customThemeSection.hidden = true;
    renderThemeSwatches(value);
  }
}

async function generateCustomTheme() {
  var desc = customThemeDesc.value.trim();
  if (!desc) {
    alert('Please describe your theme first.');
    return;
  }

  generateThemeBtn.disabled = true;
  generateThemeBtn.textContent = 'Generating...';

  try {
    var response = await fetch('/api/games/generate-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc })
    });

    if (!response.ok) {
      var err = await response.json();
      alert('Failed: ' + (err.error || 'Unknown error'));
      return;
    }

    var result = await response.json();
    isDirty = true;
    gameConfig.theme = { name: 'custom', description: desc, colors: result.colors };
    renderThemeSwatches(gameConfig.theme);
  } catch (error) {
    alert('Failed: ' + error.message);
  } finally {
    generateThemeBtn.disabled = false;
    generateThemeBtn.textContent = 'Generate Colors';
  }
}

function renderThemeSwatches(theme) {
  if (!themePreviewSwatches) return;

  var colors = null;
  if (typeof theme === 'string' && window.GAME_THEMES && window.GAME_THEMES[theme]) {
    colors = window.GAME_THEMES[theme].colors;
  } else if (typeof theme === 'object' && theme.colors) {
    colors = theme.colors;
  }

  if (!colors) {
    themePreview.hidden = true;
    return;
  }

  themePreview.hidden = false;
  themePreviewSwatches.innerHTML = '';

  var keys = ['bg', 'surface', 'accent', 'text', 'heading', 'button', 'buttonText', 'border', 'timer', 'success', 'danger'];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!colors[key]) continue;
    var swatch = document.createElement('span');
    swatch.className = 'theme-swatch';
    swatch.style.background = colors[key];
    swatch.title = key + ': ' + colors[key];
    themePreviewSwatches.appendChild(swatch);
  }
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

  // Pre-compute which phases are inside a loop body
  var loopBodies = {};  // phaseId -> { loopPhaseId, loopCount }
  for (var li = 0; li < order.length; li++) {
    var lpid = order[li];
    var lphase = gameConfig.phases[lpid];
    if (lphase.loopBack && lphase.loopCount) {
      var loopStartIdx = order.indexOf(lphase.loopBack);
      if (loopStartIdx !== -1 && loopStartIdx <= li) {
        for (var lj = loopStartIdx; lj <= li; lj++) {
          loopBodies[order[lj]] = { loopPhaseId: lpid, loopCount: lphase.loopCount };
        }
      }
    }
  }

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

    // Loop body indicator
    if (loopBodies[phaseId]) {
      box.classList.add('loop-body');
      // Show loop badge on the phase that defines the loop
      if (loopBodies[phaseId].loopPhaseId === phaseId) {
        var loopBadge = document.createElement('span');
        loopBadge.className = 'loop-badge';
        loopBadge.textContent = 'x' + loopBodies[phaseId].loopCount;
        loopBadge.title = 'Loops ' + loopBodies[phaseId].loopCount + ' times';
        box.appendChild(loopBadge);
      }
    }

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
  var previewSection = document.getElementById('live-preview-section');
  if (previewSection) previewSection.classList.add('hidden');
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

  if (type === 'announce') {
    addSectionHeader('What everyone sees');
    addTextAreaWithHelp('Message', 'Displayed to host and all players. Use {{phaseId.field}} for data.', 'phase-message', phase.message, 'e.g. Round 1: Don\'t Match!', function (value) {
      phase.message = value;
      renderCanvas();
    });
    addFieldWithHelp('Auto-advance timer (seconds)', 'Leave empty to require host to click Continue', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
  }

  if (type === 'collect-choice') {
    addSectionHeader('What players see');
    addTextAreaWithHelp('Question to ask', 'This appears above the choices on every player\'s screen', 'phase-prompt', phase.prompt, 'e.g. Which animal is the fastest?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });

    // Choices editor
    addSectionHeader('Choices');
    var choicesIsRef = typeof phase.choices === 'string';
    if (choicesIsRef) {
      addDataRefDropdown('Choices from', 'Use AI-generated choices from a previous step', 'phase-choices', phaseId, phase.choices, function (value) {
        phase.choices = value || [];
      });
    } else {
      var choicesArr = Array.isArray(phase.choices) ? phase.choices : [];
      for (var ci = 0; ci < choicesArr.length; ci++) {
        (function (index) {
          var choiceGroup = document.createElement('div');
          choiceGroup.className = 'form-group';
          choiceGroup.style.display = 'flex';
          choiceGroup.style.gap = '6px';

          var choiceInput = document.createElement('input');
          choiceInput.type = 'text';
          choiceInput.value = choicesArr[index];
          choiceInput.placeholder = 'Choice ' + (index + 1);
          choiceInput.style.flex = '1';
          choiceInput.addEventListener('input', function () {
            isDirty = true;
            phase.choices[index] = choiceInput.value;
          });

          var removeBtn = document.createElement('button');
          removeBtn.className = 'btn-icon';
          removeBtn.textContent = '\u2716';
          removeBtn.title = 'Remove choice';
          removeBtn.addEventListener('click', function () {
            isDirty = true;
            phase.choices.splice(index, 1);
            renderPhaseConfig(phaseId);
          });

          choiceGroup.appendChild(choiceInput);
          choiceGroup.appendChild(removeBtn);
          phaseConfigForm.appendChild(choiceGroup);
        })(ci);
      }

      var addChoiceBtn = document.createElement('button');
      addChoiceBtn.className = 'btn-secondary';
      addChoiceBtn.textContent = '+ Add Choice';
      addChoiceBtn.style.marginBottom = '12px';
      addChoiceBtn.addEventListener('click', function () {
        isDirty = true;
        if (!Array.isArray(phase.choices)) phase.choices = [];
        phase.choices.push('');
        renderPhaseConfig(phaseId);
      });
      phaseConfigForm.appendChild(addChoiceBtn);
    }

    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits random choice on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
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

  if (type === 'ai-eliminate') {
    addSectionHeader('Rules for AI');
    addTextAreaWithHelp('Elimination rules', 'Tell the AI exactly what rules to enforce', 'phase-instruction', phase.instruction, 'e.g. Eliminate anyone who used more than one sentence.', function (value) {
      phase.instruction = value;
      renderCanvas();
    });

    addSectionHeader('Data');
    addDataRefDropdown('Input data', 'Where the AI reads player answers from', 'phase-input', phaseId, phase.input, function (value) {
      phase.input = value;
    });
    addFieldWithHelp('Pause before advancing (seconds)', 'How long to show results before moving on', 'number', 'phase-pause', phase.pause, false, function (value) {
      phase.pause = value;
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

  if (type === 'leaderboard') {
    addSectionHeader('Data');
    addDataRefDropdown('Scores from', 'Which step\'s scores to display as a leaderboard', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
    addSectionHeader('Display');
    addSelectWithHelp('Style', 'How many players to show', 'phase-style',
      [
        { value: 'full', label: 'Full standings (all players)' },
        { value: 'top3', label: 'Top 3 only' }
      ],
      phase.style || 'full', function (value) {
        phase.style = value;
      }
    );
    addFieldWithHelp('Auto-advance timer (seconds)', 'Leave empty to require host to click Continue', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
  }

  if (type === 'reveal-one') {
    addSectionHeader('Data');
    addDataRefDropdown('Items from', 'Where to get the list of items to reveal one-by-one', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
    addSectionHeader('Display');
    addTextAreaWithHelp('Title message', 'Shown above the reveal area. Use {{phaseId.field}} for data.', 'phase-message', phase.message, 'e.g. And the answers are...', function (value) {
      phase.message = value;
      renderCanvas();
    });
  }

  if (type === 'team-split') {
    addSectionHeader('How to split');
    addSelectWithHelp('Method', 'How players are divided into teams', 'phase-method',
      [
        { value: 'random', label: 'Random shuffle' },
        { value: 'balanced', label: 'Balanced by score' }
      ],
      phase.method || 'random', function (value) {
        phase.method = value;
        renderCanvas();
        renderPhaseConfig(phaseId);
      }
    );
    addFieldWithHelp('Number of teams', 'How many teams to create (2-20)', 'number', 'phase-teamCount', phase.teamCount, false, function (value) {
      phase.teamCount = value;
    });
    addTextAreaWithHelp('Custom team names', 'Comma-separated names (e.g. Red Team, Blue Team). Leave empty for default.', 'phase-teamNames',
      Array.isArray(phase.teamNames) ? phase.teamNames.join(', ') : '',
      'e.g. Cats, Dogs, Birds',
      function (value) {
        if (value && value.trim()) {
          phase.teamNames = value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        } else {
          delete phase.teamNames;
        }
      }
    );
    if (phase.method === 'balanced') {
      addSectionHeader('Balance by');
      addDataRefDropdown('Scores from', 'Score data to balance teams with', 'phase-balanceFrom', phaseId, phase.balanceFrom, function (value) {
        phase.balanceFrom = value || undefined;
      });
    }
    addSectionHeader('Who gets assigned');
    addSelectWithHelp('Eligible players', 'Which players are put into teams', 'phase-from',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'remaining', label: 'Remaining players only' }
      ],
      phase.from || 'all', function (value) {
        if (value === 'all') { delete phase.from; } else { phase.from = value; }
      }
    );
  }

  if (type === 'rank') {
    addSectionHeader('What players rank');
    addTextAreaWithHelp('Question / prompt', 'Tells players what to rank', 'phase-prompt', phase.prompt, 'e.g. Rank these ideas from best to worst', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addDataRefDropdown('Items from', 'Where to get the list of items to rank', 'phase-candidates', phaseId, phase.candidates, function (value) {
      phase.candidates = value;
    });
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
    addSectionHeader('Who ranks');
    addSelectWithHelp('Eligible players', 'Which players can rank', 'phase-from',
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

  if (type === 'wager') {
    addSectionHeader('What players bet on');
    addTextAreaWithHelp('Question / prompt', 'What are players betting on?', 'phase-prompt', phase.prompt, 'e.g. Which answer will the AI pick?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });

    // Options editor (similar to collect-choice)
    addSectionHeader('Options');
    var wagerIsRef = typeof phase.options === 'string';
    if (wagerIsRef) {
      addDataRefDropdown('Options from', 'Use options from a previous step', 'phase-options', phaseId, phase.options, function (value) {
        phase.options = value || [];
      });
    } else {
      var wagerArr = Array.isArray(phase.options) ? phase.options : [];
      for (var wi = 0; wi < wagerArr.length; wi++) {
        (function (index) {
          var wGroup = document.createElement('div');
          wGroup.className = 'form-group';
          wGroup.style.display = 'flex';
          wGroup.style.gap = '6px';
          var wInput = document.createElement('input');
          wInput.type = 'text';
          wInput.value = wagerArr[index];
          wInput.placeholder = 'Option ' + (index + 1);
          wInput.style.flex = '1';
          wInput.addEventListener('input', function () {
            isDirty = true;
            phase.options[index] = wInput.value;
          });
          var wRemove = document.createElement('button');
          wRemove.className = 'btn-icon';
          wRemove.textContent = '\u2716';
          wRemove.title = 'Remove option';
          wRemove.addEventListener('click', function () {
            isDirty = true;
            phase.options.splice(index, 1);
            renderPhaseConfig(phaseId);
          });
          wGroup.appendChild(wInput);
          wGroup.appendChild(wRemove);
          phaseConfigForm.appendChild(wGroup);
        })(wi);
      }
      var addOptBtn = document.createElement('button');
      addOptBtn.className = 'btn-secondary';
      addOptBtn.textContent = '+ Add Option';
      addOptBtn.style.marginBottom = '12px';
      addOptBtn.addEventListener('click', function () {
        isDirty = true;
        if (!Array.isArray(phase.options)) phase.options = [];
        phase.options.push('');
        renderPhaseConfig(phaseId);
      });
      phaseConfigForm.appendChild(addOptBtn);
    }

    addSectionHeader('Points');
    addDataRefDropdown('Scores from', 'Where to get player point totals for betting', 'phase-scoresFrom', phaseId, phase.scoresFrom, function (value) {
      phase.scoresFrom = value || undefined;
    });
    addFieldWithHelp('Minimum bet', 'Smallest amount a player can wager (default 1)', 'number', 'phase-minBet', phase.minBet, false, function (value) {
      phase.minBet = value;
    });
    addFieldWithHelp('Max bet percent', 'Maximum % of points allowed to bet (default 100)', 'number', 'phase-maxBetPercent', phase.maxBetPercent, false, function (value) {
      phase.maxBetPercent = value;
    });
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });

    addSectionHeader('Resolution');
    addFieldWithHelp('Correct option (optional)', 'If set, auto-resolves. Leave empty for host to pick winner.', 'text', 'phase-correctOption', phase.correctOption, false, function (value) {
      phase.correctOption = value || undefined;
    });

    addSectionHeader('Who wagers');
    addSelectWithHelp('Eligible players', 'Which players can place wagers', 'phase-from',
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

  if (type === 'relay') {
    addSectionHeader('What players do');
    addTextAreaWithHelp('Prompt / instruction', 'Shown to the active player on their turn', 'phase-prompt', phase.prompt, 'e.g. Add the next sentence to the story', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addSelectWithHelp('Turn order', 'How to determine the order players take turns', 'phase-order',
      [
        { value: 'random', label: 'Random shuffle' },
        { value: 'join-order', label: 'Order they joined' }
      ],
      phase.order || 'random', function (value) {
        phase.order = value;
      }
    );
    addFieldWithHelp('Time per turn (seconds)', 'Leave empty for no limit. Auto-skips on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
    addSectionHeader('Who participates');
    addSelectWithHelp('Eligible players', 'Which players take turns', 'phase-from',
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

  if (type === 'foreach') {
    addSectionHeader('Data to iterate over');

    // Data ref dropdown
    var foreachDataOptions = [{ value: '', label: '(choose data source)' }];
    for (var fPid in gameConfig.phases) {
      var fP = gameConfig.phases[fPid];
      var fCat = PHASE_CATALOG[fP.type];
      if (fP.type === 'collect') {
        foreachDataOptions.push({ value: fPid + '.responses', label: 'Responses from ' + (fCat ? fCat.friendlyName : fP.type) + ' (' + fPid + ')' });
      }
    }
    addSelectWithHelp('Iterate over', 'Which data to loop through — one iteration per item', 'phase-data',
      foreachDataOptions, phase.data || '', function (value) {
        phase.data = value || undefined;
        isDirty = true;
      }
    );

    addSelectWithHelp('Shuffle order?', 'Randomize the order items are shown', 'phase-shuffle',
      [{ value: 'true', label: 'Yes (random order)' }, { value: 'false', label: 'No (original order)' }],
      phase.shuffle === false ? 'false' : 'true', function (value) {
        phase.shuffle = value === 'true' ? undefined : false;
        isDirty = true;
      }
    );

    addSectionHeader('Candidate generation (Optional)');
    addSelectWithHelp('Auto-generate choices from', 'For guessing games — creates "real author + decoys" choice lists', 'phase-candidateSource',
      [{ value: '', label: '(none)' }, { value: 'players', label: 'Player names (author + random decoys)' }],
      phase.candidateSource || '', function (value) {
        if (value) { phase.candidateSource = value; } else { delete phase.candidateSource; delete phase.decoyCount; }
        isDirty = true;
        renderPhaseConfig(phaseId);
      }
    );
    if (phase.candidateSource === 'players') {
      addFieldWithHelp('Number of decoys', 'How many wrong choices alongside the real author', 'number', 'phase-decoyCount', phase.decoyCount || 3, false, function (value) {
        phase.decoyCount = value;
        isDirty = true;
      });
    }

    addSectionHeader('AI Injection (Optional)');
    var aiInjectEnabled = !!phase.aiInject;
    var aiInjectCheckbox = document.createElement('div');
    aiInjectCheckbox.style.cssText = 'margin-bottom:8px;';
    var aiInjectLabel = document.createElement('label');
    aiInjectLabel.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer;';
    var aiInjectCb = document.createElement('input');
    aiInjectCb.type = 'checkbox';
    aiInjectCb.checked = aiInjectEnabled;
    aiInjectCb.addEventListener('change', function () {
      if (aiInjectCb.checked) {
        phase.aiInject = { count: 3, instruction: 'Generate fake responses matching the style of the real student answers.' };
      } else {
        delete phase.aiInject;
      }
      isDirty = true;
      renderPhaseConfig(phaseId);
    });
    aiInjectLabel.appendChild(aiInjectCb);
    aiInjectLabel.appendChild(document.createTextNode('Mix in AI-generated fake responses (for "human vs AI" games)'));
    aiInjectCheckbox.appendChild(aiInjectLabel);
    sidebar.appendChild(aiInjectCheckbox);

    if (phase.aiInject) {
      addFieldWithHelp('Number of AI fakes', 'How many AI-generated responses to mix in with real ones', 'number', 'phase-aiInject-count', phase.aiInject.count || 3, false, function (value) {
        phase.aiInject.count = value;
        isDirty = true;
      });
      addFieldWithHelp('AI instruction', 'Tell the AI what kind of fake responses to generate', 'text', 'phase-aiInject-instruction', phase.aiInject.instruction || '', false, function (value) {
        phase.aiInject.instruction = value;
        isDirty = true;
      });
      var aiInjectHint = document.createElement('div');
      aiInjectHint.className = 'field-help';
      aiInjectHint.innerHTML = 'Use scoring with <code>correctAnswer: "_current.isHuman"</code> and choices <code>["Human", "AI"]</code> to score detection.';
      sidebar.appendChild(aiInjectHint);

      // Pair mode option (only available when aiInject is enabled)
      var pairModeDiv = document.createElement('div');
      pairModeDiv.style.cssText = 'margin-top:8px;';
      var pairModeLabel = document.createElement('label');
      pairModeLabel.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer;';
      var pairModeCb = document.createElement('input');
      pairModeCb.type = 'checkbox';
      pairModeCb.checked = phase.pairMode === 'human-vs-ai';
      pairModeCb.addEventListener('change', function () {
        if (pairModeCb.checked) {
          phase.pairMode = 'human-vs-ai';
        } else {
          delete phase.pairMode;
        }
        isDirty = true;
        renderSidebar(selectedPhaseId);
      });
      pairModeLabel.appendChild(pairModeCb);
      pairModeLabel.appendChild(document.createTextNode('Side-by-side pair mode (show human vs AI ideas together)'));
      pairModeDiv.appendChild(pairModeLabel);
      sidebar.appendChild(pairModeDiv);

      if (phase.pairMode === 'human-vs-ai') {
        var pairHint = document.createElement('div');
        pairHint.className = 'field-help';
        pairHint.innerHTML = 'Each iteration shows a pair: <code>{{_current.a.text}}</code> and <code>{{_current.b.text}}</code>. One is human, one is AI (random order). Use <code>correctAnswer: "_current.aiPosition"</code> with choices like <code>["Idea A", "Idea B"]</code>.';
        sidebar.appendChild(pairHint);
      }
    }

    addSectionHeader('Sub-phases (run per item)');

    // Render existing sub-phases
    if (!phase.subPhases) phase.subPhases = {};
    var subNames = Object.keys(phase.subPhases);
    for (var si = 0; si < subNames.length; si++) {
      (function (subName) {
        var sub = phase.subPhases[subName];
        var subCat = PHASE_CATALOG[sub.type];
        var subLabel = (subCat ? subCat.icon + ' ' : '') + subName + ' (' + (subCat ? subCat.friendlyName : sub.type) + ')';

        var subDiv = document.createElement('div');
        subDiv.className = 'foreach-sub-phase';
        subDiv.style.cssText = 'border:2px solid #000; padding:8px; margin:6px 0; background:' + (subCat ? subCat.bg : '#eee');

        var header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;';
        header.innerHTML = '<strong>' + subLabel + '</strong>';

        var removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.style.cssText = 'background:#FF2D2D; color:white; border:2px solid #000; padding:2px 8px; cursor:pointer; font-weight:bold;';
        removeBtn.onclick = function () {
          delete phase.subPhases[subName];
          isDirty = true;
          renderPhaseConfig(phaseId);
        };
        header.appendChild(removeBtn);
        subDiv.appendChild(header);

        // Type selector
        var typeLabel = document.createElement('label');
        typeLabel.textContent = 'Type: ';
        typeLabel.style.fontWeight = 'bold';
        var typeSelect = document.createElement('select');
        typeSelect.style.cssText = 'margin:4px 0; padding:4px; border:2px solid #000;';
        var subTypes = ['announce', 'collect', 'collect-choice', 'reveal'];
        for (var sti = 0; sti < subTypes.length; sti++) {
          var opt = document.createElement('option');
          opt.value = subTypes[sti];
          var stCat = PHASE_CATALOG[subTypes[sti]];
          opt.textContent = stCat ? stCat.icon + ' ' + stCat.friendlyName : subTypes[sti];
          if (sub.type === subTypes[sti]) opt.selected = true;
          typeSelect.appendChild(opt);
        }
        typeSelect.onchange = function () {
          sub.type = typeSelect.value;
          isDirty = true;
          renderPhaseConfig(phaseId);
        };
        subDiv.appendChild(typeLabel);
        subDiv.appendChild(typeSelect);

        // Fields based on sub-phase type
        if (sub.type === 'announce') {
          var msgLabel = document.createElement('label');
          msgLabel.textContent = 'Message:';
          msgLabel.style.cssText = 'display:block; margin-top:6px; font-weight:bold;';
          var msgInput = document.createElement('textarea');
          msgInput.value = sub.message || '';
          msgInput.rows = 2;
          msgInput.placeholder = 'Use {{_current.text}}, {{_current.playerName}}, {{_foreach.' + phaseId + '.index}}';
          msgInput.style.cssText = 'width:100%; border:2px solid #000; padding:4px; font-family:inherit;';
          msgInput.onchange = function () { sub.message = msgInput.value; isDirty = true; };
          subDiv.appendChild(msgLabel);
          subDiv.appendChild(msgInput);

          var timerLabel = document.createElement('label');
          timerLabel.textContent = 'Timer (seconds):';
          timerLabel.style.cssText = 'display:block; margin-top:4px; font-weight:bold;';
          var timerInput = document.createElement('input');
          timerInput.type = 'number';
          timerInput.value = sub.timer || '';
          timerInput.style.cssText = 'width:60px; border:2px solid #000; padding:4px;';
          timerInput.onchange = function () { sub.timer = timerInput.value ? parseInt(timerInput.value) : undefined; isDirty = true; };
          subDiv.appendChild(timerLabel);
          subDiv.appendChild(timerInput);
        }

        if (sub.type === 'collect') {
          var pLabel = document.createElement('label');
          pLabel.textContent = 'Prompt:';
          pLabel.style.cssText = 'display:block; margin-top:6px; font-weight:bold;';
          var pInput = document.createElement('textarea');
          pInput.value = sub.prompt || '';
          pInput.rows = 2;
          pInput.placeholder = 'Use {{_current.text}} to reference the current item';
          pInput.style.cssText = 'width:100%; border:2px solid #000; padding:4px; font-family:inherit;';
          pInput.onchange = function () { sub.prompt = pInput.value; isDirty = true; };
          subDiv.appendChild(pLabel);
          subDiv.appendChild(pInput);

          var tLabel2 = document.createElement('label');
          tLabel2.textContent = 'Timer (seconds):';
          tLabel2.style.cssText = 'display:block; margin-top:4px; font-weight:bold;';
          var tInput2 = document.createElement('input');
          tInput2.type = 'number';
          tInput2.value = sub.timer || '';
          tInput2.style.cssText = 'width:60px; border:2px solid #000; padding:4px;';
          tInput2.onchange = function () { sub.timer = tInput2.value ? parseInt(tInput2.value) : undefined; isDirty = true; };
          subDiv.appendChild(tLabel2);
          subDiv.appendChild(tInput2);
        }

        if (sub.type === 'collect-choice') {
          var cpLabel = document.createElement('label');
          cpLabel.textContent = 'Prompt:';
          cpLabel.style.cssText = 'display:block; margin-top:6px; font-weight:bold;';
          var cpInput = document.createElement('textarea');
          cpInput.value = sub.prompt || '';
          cpInput.rows = 2;
          cpInput.placeholder = 'Use {{_current.text}} to reference the current item';
          cpInput.style.cssText = 'width:100%; border:2px solid #000; padding:4px; font-family:inherit;';
          cpInput.onchange = function () { sub.prompt = cpInput.value; isDirty = true; };
          subDiv.appendChild(cpLabel);
          subDiv.appendChild(cpInput);

          var choicesLabel = document.createElement('label');
          choicesLabel.textContent = 'Choices:';
          choicesLabel.style.cssText = 'display:block; margin-top:4px; font-weight:bold;';
          var choicesSelect = document.createElement('select');
          choicesSelect.style.cssText = 'border:2px solid #000; padding:4px;';
          var cOpt1 = document.createElement('option');
          cOpt1.value = '_candidates'; cOpt1.textContent = 'Auto-generated candidates (from foreach)';
          if (sub.choices === '_candidates') cOpt1.selected = true;
          choicesSelect.appendChild(cOpt1);
          var cOpt2 = document.createElement('option');
          cOpt2.value = 'custom'; cOpt2.textContent = 'Custom list';
          if (sub.choices !== '_candidates') cOpt2.selected = true;
          choicesSelect.appendChild(cOpt2);
          choicesSelect.onchange = function () {
            if (choicesSelect.value === '_candidates') {
              sub.choices = '_candidates';
            } else {
              sub.choices = sub.choices === '_candidates' ? ['Option A', 'Option B'] : sub.choices;
            }
            isDirty = true;
            renderPhaseConfig(phaseId);
          };
          subDiv.appendChild(choicesLabel);
          subDiv.appendChild(choicesSelect);

          var ctLabel = document.createElement('label');
          ctLabel.textContent = 'Timer (seconds):';
          ctLabel.style.cssText = 'display:block; margin-top:4px; font-weight:bold;';
          var ctInput = document.createElement('input');
          ctInput.type = 'number';
          ctInput.value = sub.timer || '';
          ctInput.style.cssText = 'width:60px; border:2px solid #000; padding:4px;';
          ctInput.onchange = function () { sub.timer = ctInput.value ? parseInt(ctInput.value) : undefined; isDirty = true; };
          subDiv.appendChild(ctLabel);
          subDiv.appendChild(ctInput);
        }

        if (sub.type === 'reveal') {
          var rvLabel = document.createElement('label');
          rvLabel.textContent = 'Template:';
          rvLabel.style.cssText = 'display:block; margin-top:6px; font-weight:bold;';
          var rvInput = document.createElement('textarea');
          rvInput.value = sub.template || sub.message || '';
          rvInput.rows = 2;
          rvInput.placeholder = 'Use {{_current.text}}, {{_current.playerName}}';
          rvInput.style.cssText = 'width:100%; border:2px solid #000; padding:4px; font-family:inherit;';
          rvInput.onchange = function () { sub.template = rvInput.value; isDirty = true; };
          subDiv.appendChild(rvLabel);
          subDiv.appendChild(rvInput);
        }

        sidebar.appendChild(subDiv);
      })(subNames[si]);
    }

    // Add sub-phase button
    var addSubBtn = document.createElement('button');
    addSubBtn.textContent = '+ Add Sub-Phase';
    addSubBtn.style.cssText = 'width:100%; padding:8px; margin-top:8px; background:#6A1B9A; color:white; border:2px solid #000; cursor:pointer; font-weight:bold; font-size:14px;';
    addSubBtn.onclick = function () {
      if (!phase.subPhases) phase.subPhases = {};
      var subIdx = Object.keys(phase.subPhases).length + 1;
      var subId = 'step-' + subIdx;
      phase.subPhases[subId] = { type: 'announce', message: '', timer: 5 };
      isDirty = true;
      renderPhaseConfig(phaseId);
    };
    sidebar.appendChild(addSubBtn);

    addSectionHeader('Scoring (Optional)');
    var hasScoringCheck = document.createElement('div');
    hasScoringCheck.style.cssText = 'margin:6px 0;';
    var scoringCheckbox = document.createElement('input');
    scoringCheckbox.type = 'checkbox';
    scoringCheckbox.id = 'phase-scoring-enabled';
    scoringCheckbox.checked = !!phase.scoring;
    scoringCheckbox.onchange = function () {
      if (scoringCheckbox.checked) {
        var subKeys = Object.keys(phase.subPhases || {});
        phase.scoring = { subPhase: subKeys[subKeys.length - 1] || '', mode: 'correct', correctAnswer: '_current.playerName', pointsCorrect: 100 };
      } else {
        delete phase.scoring;
      }
      isDirty = true;
      renderPhaseConfig(phaseId);
    };
    var scoringLabel = document.createElement('label');
    scoringLabel.htmlFor = 'phase-scoring-enabled';
    scoringLabel.textContent = ' Enable scoring (award points for correct guesses)';
    scoringLabel.style.fontWeight = 'bold';
    hasScoringCheck.appendChild(scoringCheckbox);
    hasScoringCheck.appendChild(scoringLabel);
    sidebar.appendChild(hasScoringCheck);

    if (phase.scoring) {
      var scoringSubOptions = [{ value: '', label: '(choose sub-phase)' }];
      var sSubNames = Object.keys(phase.subPhases || {});
      for (var ssi = 0; ssi < sSubNames.length; ssi++) {
        scoringSubOptions.push({ value: sSubNames[ssi], label: sSubNames[ssi] });
      }
      addSelectWithHelp('Score based on', 'Which sub-phase contains the player choice to score', 'phase-scoring-subPhase',
        scoringSubOptions, phase.scoring.subPhase || '', function (value) {
          phase.scoring.subPhase = value;
          isDirty = true;
        }
      );
      addSelectWithHelp('Scoring mode', 'How points are awarded', 'phase-scoring-mode',
        [
          { value: 'correct', label: 'Correct guess (guesser earns points)' },
          { value: 'tally', label: 'Tally (author earns points from ratings)' }
        ],
        phase.scoring.mode || 'correct', function (value) {
          phase.scoring.mode = value;
          if (value === 'tally') {
            delete phase.scoring.correctAnswer;
            delete phase.scoring.pointsCorrect;
            if (!phase.scoring.pointMap) phase.scoring.pointMap = {};
          } else {
            delete phase.scoring.pointMap;
            if (!phase.scoring.correctAnswer) phase.scoring.correctAnswer = '_current.playerName';
            if (!phase.scoring.pointsCorrect) phase.scoring.pointsCorrect = 100;
          }
          isDirty = true;
          renderPhaseConfig(phaseId);
        }
      );

      if ((phase.scoring.mode || 'correct') === 'correct') {
        addSelectWithHelp('Correct answer is', 'What counts as the right answer', 'phase-scoring-correctAnswer',
          [
            { value: '_current.playerName', label: 'Player name (who wrote it)' },
            { value: '_current.playerId', label: 'Player ID' },
            { value: '_current.text', label: 'The item text itself' }
          ],
          phase.scoring.correctAnswer || '_current.playerName', function (value) {
            phase.scoring.correctAnswer = value;
            isDirty = true;
          }
        );
        addFieldWithHelp('Points for correct', 'Points awarded for a correct guess', 'number', 'phase-scoring-pointsCorrect', phase.scoring.pointsCorrect || 100, false, function (value) {
          phase.scoring.pointsCorrect = value;
          isDirty = true;
        });
      } else {
        // Tally mode — show pointMap editor
        var pointMapDiv = document.createElement('div');
        pointMapDiv.style.cssText = 'margin:8px 0; padding:8px; background:#FFF3E0; border:2px solid #000;';
        var pmTitle = document.createElement('div');
        pmTitle.style.cssText = 'font-weight:bold; margin-bottom:6px;';
        pmTitle.textContent = 'Point Map (choice → points)';
        pointMapDiv.appendChild(pmTitle);

        var pmHelp = document.createElement('div');
        pmHelp.style.cssText = 'font-size:11px; color:#666; margin-bottom:8px;';
        pmHelp.textContent = 'Map each choice option to the points the author earns when someone picks it.';
        pointMapDiv.appendChild(pmHelp);

        var pointMap = phase.scoring.pointMap || {};
        var pmKeys = Object.keys(pointMap);
        for (var pmi = 0; pmi < pmKeys.length; pmi++) {
          (function (key) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:6px; align-items:center; margin:4px 0;';
            var keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.value = key;
            keyInput.style.cssText = 'flex:1; padding:4px; border:2px solid #000;';
            keyInput.disabled = true;
            var valInput = document.createElement('input');
            valInput.type = 'number';
            valInput.value = pointMap[key];
            valInput.style.cssText = 'width:60px; padding:4px; border:2px solid #000;';
            valInput.onchange = function () {
              phase.scoring.pointMap[key] = parseInt(valInput.value) || 0;
              isDirty = true;
            };
            var delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.style.cssText = 'padding:2px 8px; border:2px solid #000; background:#FFCDD2; cursor:pointer; font-weight:bold;';
            delBtn.onclick = function () {
              delete phase.scoring.pointMap[key];
              isDirty = true;
              renderPhaseConfig(phaseId);
            };
            row.appendChild(keyInput);
            row.appendChild(valInput);
            row.appendChild(delBtn);
            pointMapDiv.appendChild(row);
          })(pmKeys[pmi]);
        }

        var addPmBtn = document.createElement('button');
        addPmBtn.textContent = '+ Add Entry';
        addPmBtn.style.cssText = 'margin-top:4px; padding:4px 12px; border:2px solid #000; background:#C8E6C9; cursor:pointer; font-weight:bold;';
        addPmBtn.onclick = function () {
          var newKey = prompt('Choice text (e.g. "Amazing"):');
          if (newKey && newKey.trim()) {
            phase.scoring.pointMap[newKey.trim()] = 0;
            isDirty = true;
            renderPhaseConfig(phaseId);
          }
        };
        pointMapDiv.appendChild(addPmBtn);
        sidebar.appendChild(pointMapDiv);
      }
    }

    // Helper text
    var helpDiv = document.createElement('div');
    helpDiv.style.cssText = 'margin-top:12px; padding:8px; background:#F3E5F5; border:2px solid #000; font-size:12px;';
    helpDiv.innerHTML = '<strong>Template variables:</strong><br>' +
      '<code>{{_current.text}}</code> — the current item\'s text<br>' +
      '<code>{{_current.playerName}}</code> — who submitted it<br>' +
      '<code>{{_foreach.' + phaseId + '.index}}</code> — iteration number (1-based)<br>' +
      '<code>{{_foreach.' + phaseId + '.total}}</code> — total iterations';
    sidebar.appendChild(helpDiv);
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

    // Loop (Optional) — available on any phase with a next
    addSectionHeader('Loop (Optional)');

    // loopBack dropdown — filter to phases before current
    var loopBackOptions = [{ value: '', label: '(none — no loop)' }];
    var order = buildPhaseOrder();
    var currentIdx = order.indexOf(phaseId);
    for (var li = 0; li < order.length; li++) {
      if (li >= currentIdx) break;
      var lpid = order[li];
      var lp = gameConfig.phases[lpid];
      var lcat = PHASE_CATALOG[lp.type];
      if (lcat) {
        loopBackOptions.push({ value: lpid, label: lcat.icon + ' ' + lcat.friendlyName + ' (' + lpid + ')' });
      }
    }
    addSelectWithHelp('Loop back to', 'After this step, jump back to an earlier step N times before continuing', 'phase-loopBack',
      loopBackOptions, phase.loopBack || '', function (value) {
        isDirty = true;
        if (value) {
          phase.loopBack = value;
          if (!phase.loopCount) phase.loopCount = 3;
        } else {
          delete phase.loopBack;
          delete phase.loopCount;
        }
        renderCanvas();
        renderPhaseConfig(phaseId);
      }
    );

    if (phase.loopBack) {
      addFieldWithHelp('Number of rounds', 'Total times to repeat before continuing to Next step (2-100)', 'number', 'phase-loopCount', phase.loopCount, false, function (value) {
        phase.loopCount = value;
        renderCanvas();
      });
    }
  }

  // --- Screen Control (Optional) — all types except lobby ---
  if (type !== 'lobby') {
    addSectionHeader('Screen Control (Optional)');

    addTextAreaWithHelp('Host template', 'Custom text shown on the host screen. Use {{phaseId.field}} for data. Leave empty for default.', 'phase-hostTemplate', phase.hostTemplate, 'e.g. Full analysis:\n{{process.result}}', function (value) {
      if (value) { phase.hostTemplate = value; } else { delete phase.hostTemplate; }
    });

    addTextAreaWithHelp('Player template', 'Custom text shown on player screens. Use {{phaseId.field}} for data. Leave empty for default.', 'phase-playerTemplate', phase.playerTemplate, 'e.g. Great job everyone!', function (value) {
      if (value) { phase.playerTemplate = value; } else { delete phase.playerTemplate; }
    });

    // Host show toggles
    var hostToggles = VALID_HOST_TOGGLES[type];
    if (hostToggles) {
      addToggleCheckboxes('Host screen elements', 'Choose which built-in elements to show on the host screen', phase, 'hostShow', hostToggles);
    }

    // Player show toggles
    var playerToggles = VALID_PLAYER_TOGGLES[type];
    if (playerToggles) {
      addToggleCheckboxes('Player screen elements', 'Choose which built-in elements to show on player screens', phase, 'playerShow', playerToggles);
    }
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

  // Update live preview
  renderLivePreview(phaseId);
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
    } else if (p.type === 'collect-choice') {
      options.push({ value: pid + '.responses', label: 'Choices from ' + cat.friendlyName + ' (' + pid + ')' });
      options.push({ value: pid + '.tally', label: 'Tally from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'ai-process') {
      options.push({ value: pid + '.result', label: 'AI result from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'vote') {
      options.push({ value: pid + '.scores', label: 'Scores from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'eliminate') {
      options.push({ value: pid + '.eliminated', label: 'Eliminated from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'ai-eliminate') {
      options.push({ value: pid + '.survivors', label: 'Survivors from ' + cat.friendlyName + ' (' + pid + ')' });
      options.push({ value: pid + '.eliminated', label: 'Eliminated from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'leaderboard') {
      options.push({ value: pid + '.standings', label: 'Rankings from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'team-split') {
      options.push({ value: pid + '.teams', label: 'Teams from ' + cat.friendlyName + ' (' + pid + ')' });
      options.push({ value: pid + '.playerTeam', label: 'Player team map from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'rank') {
      options.push({ value: pid + '.rankings', label: 'Rankings from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'wager') {
      options.push({ value: pid + '.scores', label: 'Updated scores from ' + cat.friendlyName + ' (' + pid + ')' });
      options.push({ value: pid + '.wagers', label: 'Wagers from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'relay') {
      options.push({ value: pid + '.result', label: 'Entries from ' + cat.friendlyName + ' (' + pid + ')' });
      options.push({ value: pid + '.text', label: 'Combined text from ' + cat.friendlyName + ' (' + pid + ')' });
    } else if (p.type === 'foreach') {
      options.push({ value: pid + '.scores', label: 'Scores from ' + cat.friendlyName + ' (' + pid + ')' });
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

// Toggle checkboxes for hostShow / playerShow
function addToggleCheckboxes(label, helpText, phase, field, toggleNames) {
  var group = document.createElement('div');
  group.className = 'form-group';

  var lbl = document.createElement('label');
  lbl.textContent = label;
  group.appendChild(lbl);

  if (helpText) {
    var help = document.createElement('span');
    help.className = 'field-help';
    help.textContent = helpText;
    group.appendChild(help);
  }

  var currentList = phase[field];
  var showAll = !currentList;

  // Master checkbox: "Show all (default)"
  var masterLabel = document.createElement('label');
  masterLabel.className = 'toggle-checkbox';
  var masterCb = document.createElement('input');
  masterCb.type = 'checkbox';
  masterCb.checked = showAll;
  masterLabel.appendChild(masterCb);
  masterLabel.appendChild(document.createTextNode(' Show all (default)'));
  group.appendChild(masterLabel);

  var toggleContainer = document.createElement('div');
  toggleContainer.className = 'toggle-checkboxes';
  if (showAll) toggleContainer.hidden = true;

  for (var i = 0; i < toggleNames.length; i++) {
    (function (toggleName) {
      var tLabel = document.createElement('label');
      tLabel.className = 'toggle-checkbox';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = showAll || (currentList && currentList.indexOf(toggleName) !== -1);
      tLabel.appendChild(cb);
      var friendly = TOGGLE_FRIENDLY_NAMES[toggleName] || toggleName;
      tLabel.appendChild(document.createTextNode(' ' + friendly));
      toggleContainer.appendChild(tLabel);

      cb.addEventListener('change', function () {
        isDirty = true;
        // Rebuild the array from checked boxes
        var checked = [];
        var cbs = toggleContainer.querySelectorAll('input[type=checkbox]');
        for (var c = 0; c < cbs.length; c++) {
          if (cbs[c].checked) checked.push(toggleNames[c]);
        }
        phase[field] = checked;
      });
    })(toggleNames[i]);
  }

  masterCb.addEventListener('change', function () {
    isDirty = true;
    if (masterCb.checked) {
      delete phase[field];
      toggleContainer.hidden = true;
    } else {
      // Default to all checked
      phase[field] = toggleNames.slice();
      toggleContainer.hidden = false;
      var cbs = toggleContainer.querySelectorAll('input[type=checkbox]');
      for (var c = 0; c < cbs.length; c++) {
        cbs[c].checked = true;
      }
    }
  });

  group.appendChild(toggleContainer);
  phaseConfigForm.appendChild(group);
}

// --- Phase management ---

// Picker modal: which phase types can be added
var ADDABLE_PHASE_TYPES = ['collect', 'collect-choice', 'ai-process', 'ai-eliminate', 'vote', 'eliminate', 'announce', 'reveal', 'preview', 'winner', 'leaderboard', 'reveal-one', 'team-split', 'rank', 'wager', 'relay', 'foreach'];

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
  } else if (type === 'collect-choice') {
    newPhase.prompt = 'Pick one:';
    newPhase.choices = ['Option A', 'Option B'];
  } else if (type === 'ai-process') {
    newPhase.task = 'summarize';
    newPhase.instruction = '';
    newPhase.format = 'text';
  } else if (type === 'ai-eliminate') {
    newPhase.instruction = '';
  } else if (type === 'vote') {
    newPhase.mode = 'pick-one';
  } else if (type === 'eliminate') {
    newPhase.method = 'bottom-percent';
    newPhase.percent = 50;
  } else if (type === 'announce') {
    newPhase.message = 'Get ready!';
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
    if (gameConfig.phases[id].loopBack === phaseId) {
      delete gameConfig.phases[id].loopBack;
      delete gameConfig.phases[id].loopCount;
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
  'collect-choice': ['prompt', 'choices'],
  'ai-process': ['instruction'],
  'ai-eliminate': ['instruction', 'input'],
  vote: ['mode', 'candidates'],
  eliminate: ['method'],
  announce: ['message'],
  preview: ['approveNext', 'rejectNext'],
  winner: ['from'],
  leaderboard: ['from'],
  'reveal-one': ['from'],
  'team-split': ['method', 'teamCount'],
  rank: ['prompt', 'candidates'],
  wager: ['prompt', 'options'],
  relay: ['prompt'],
  foreach: ['data', 'subPhases']
};

var VALID_ENUMS = {
  from: { types: ['collect', 'collect-choice'], values: ['all', 'remaining', 'eliminated'] },
  voters: { types: ['vote'], values: ['all', 'remaining', 'eliminated'] },
  mode: { types: ['vote'], values: ['pick-one', 'head-to-head'] },
  method: { types: ['eliminate'], values: ['bottom-percent', 'hook'] },
  format: { types: ['ai-process'], values: ['text', 'json'] },
  task: { types: ['ai-process'], values: ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge'] },
  style: { types: ['leaderboard'], values: ['full', 'top3'] },
  order: { types: ['relay'], values: ['random', 'join-order'] }
};

var DATA_REF_FIELDS = ['input', 'candidates', 'content'];

var VALID_HOST_TOGGLES = {
  collect: ['prompt', 'counter', 'timer', 'closeButton'],
  'collect-choice': ['prompt', 'counter', 'timer', 'closeButton'],
  'ai-process': ['message'],
  vote: ['mode', 'counter', 'timer', 'closeButton'],
  eliminate: ['eliminated', 'remaining', 'continueButton'],
  'ai-eliminate': ['eliminated', 'remaining'],
  reveal: ['content', 'responses', 'continueButton'],
  preview: ['content', 'responses', 'approveButton', 'rejectButton'],
  announce: ['message', 'continueButton', 'timer'],
  winner: ['name', 'standings', 'endButton'],
  leaderboard: ['standings', 'continueButton', 'timer'],
  'reveal-one': ['message', 'revealButton', 'counter', 'timer'],
  'team-split': ['teams', 'continueButton'],
  rank: ['prompt', 'counter', 'timer', 'closeButton'],
  wager: ['prompt', 'options', 'counter', 'timer', 'closeButton'],
  relay: ['prompt', 'progress', 'sharedResult', 'timer', 'activePlayer'],
  end: ['message', 'playAgainButton']
};

var VALID_PLAYER_TOGGLES = {
  collect: ['prompt', 'input', 'timer', 'submitButton'],
  'collect-choice': ['prompt', 'choices', 'timer'],
  'ai-process': ['message'],
  vote: ['title', 'options', 'timer', 'progress'],
  eliminate: ['details'],
  'ai-eliminate': ['details'],
  reveal: ['content'],
  announce: ['message', 'timer'],
  winner: ['name', 'details', 'standings'],
  leaderboard: ['rank', 'standings'],
  'reveal-one': ['message', 'items'],
  'team-split': ['team', 'allTeams'],
  rank: ['prompt', 'items', 'timer', 'submitButton'],
  wager: ['prompt', 'options', 'points', 'timer', 'submitButton'],
  relay: ['prompt', 'sharedResult', 'input', 'timer'],
  end: ['message']
};

var TOGGLE_FRIENDLY_NAMES = {
  prompt: 'Question text',
  counter: 'Submission counter',
  timer: 'Timer',
  closeButton: 'Close Submissions button',
  input: 'Text input field',
  submitButton: 'Submit button',
  choices: 'Choice buttons',
  message: 'Message text',
  mode: 'Vote mode display',
  title: 'Title',
  options: 'Vote options',
  progress: 'Match progress',
  eliminated: 'Eliminated names',
  remaining: 'Remaining count',
  continueButton: 'Continue button',
  details: 'Details text',
  content: 'Content',
  responses: 'Player responses',
  approveButton: 'Approve button',
  rejectButton: 'Reject button',
  name: 'Winner name',
  standings: 'Standings',
  endButton: 'End Game button',
  playAgainButton: 'Play Again button',
  rank: 'Personal rank',
  items: 'Revealed items',
  revealButton: 'Reveal Next button',
  counter: 'Item counter',
  teams: 'Team lists',
  team: 'Your team',
  allTeams: 'All team rosters',
  points: 'Available points',
  sharedResult: 'Shared result',
  activePlayer: 'Active player name',
  progress: 'Match progress'
};

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

    // Preview must have content OR template
    if (phase.type === 'preview') {
      var hasContent = phase.content !== undefined && phase.content !== null && phase.content !== '';
      var hasTemplate = phase.template !== undefined && phase.template !== null && phase.template !== '';
      if (!hasContent && !hasTemplate) {
        errors.push(label + ': Must have either "content" or "template" (or both).');
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

    // Loop validation
    if (phase.loopBack !== undefined && phase.loopBack !== null && phase.loopBack !== '') {
      if (!phases[phase.loopBack]) {
        errors.push(label + ': "Loop back to" points to "' + phase.loopBack + '" which does not exist.');
      }
      if (phase.loopCount === undefined || phase.loopCount === null) {
        errors.push(label + ': Has "Loop back to" but is missing "Number of rounds".');
      } else if (typeof phase.loopCount !== 'number' || phase.loopCount < 2 || phase.loopCount > 100) {
        errors.push(label + ': "Number of rounds" must be between 2 and 100.');
      }
      if (!phase.next) {
        errors.push(label + ': Has "Loop back to" but is missing "Next step" (needed as loop exit).');
      }
    }

    // pairMode validation
    if (phase.pairMode) {
      if (phase.pairMode !== 'human-vs-ai') {
        errors.push(label + ': Pair mode must be "human-vs-ai" (got "' + phase.pairMode + '").');
      }
      if (!phase.aiInject) {
        errors.push(label + ': Pair mode requires AI Injection to be enabled.');
      }
    }

    // Screen control validation
    if (phase.hostShow && Array.isArray(phase.hostShow)) {
      var hostToggles = VALID_HOST_TOGGLES[phase.type];
      if (hostToggles) {
        for (var ht = 0; ht < phase.hostShow.length; ht++) {
          if (hostToggles.indexOf(phase.hostShow[ht]) === -1) {
            errors.push(label + ': Invalid hostShow toggle "' + phase.hostShow[ht] + '".');
          }
        }
      }
    }
    if (phase.playerShow && Array.isArray(phase.playerShow)) {
      var playerToggles = VALID_PLAYER_TOGGLES[phase.type];
      if (playerToggles) {
        for (var pt = 0; pt < phase.playerShow.length; pt++) {
          if (playerToggles.indexOf(phase.playerShow[pt]) === -1) {
            errors.push(label + ': Invalid playerShow toggle "' + phase.playerShow[pt] + '".');
          }
        }
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
        if (p.loopBack && !reachable[p.loopBack]) queue.push(p.loopBack);
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

// --- Live Preview ---

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function previewEl(toggleName, label, text, showList) {
  var hidden = showList && showList.indexOf(toggleName) === -1;
  var html = '<div class="preview-element' + (hidden ? ' preview-hidden' : '') + '">';
  html += '<div class="preview-element-label">' + escapeHtml(label) + '</div>';
  if (text) {
    html += '<div class="preview-element-text">' + escapeHtml(text) + '</div>';
  }
  html += '</div>';
  return html;
}

function previewBtn(toggleName, text, showList) {
  var hidden = showList && showList.indexOf(toggleName) === -1;
  return '<div class="' + (hidden ? 'preview-hidden' : '') + '"><span class="preview-btn-mockup">' + escapeHtml(text) + '</span></div>';
}

function previewInput(toggleName, placeholder, showList) {
  var hidden = showList && showList.indexOf(toggleName) === -1;
  return '<div class="preview-input-mockup' + (hidden ? ' preview-hidden' : '') + '">' + escapeHtml(placeholder) + '</div>';
}

function buildPreviewHTML(phase, screen) {
  var type = phase.type;
  var html = '';
  var showList = screen === 'host' ? phase.hostShow : phase.playerShow;
  var templateText = screen === 'host' ? phase.hostTemplate : phase.playerTemplate;

  // Custom template at top
  if (templateText) {
    html += '<div class="preview-template-text">' + escapeHtml(templateText) + '</div>';
  }

  if (type === 'lobby') {
    if (screen === 'host') {
      html += previewEl('counter', 'Players', '3 players joined', null);
      html += previewBtn('startButton', 'Start Game', null);
    } else {
      html += previewEl('message', 'Status', 'Waiting for the game to start...', null);
    }
  }

  if (type === 'collect') {
    if (screen === 'host') {
      html += previewEl('prompt', 'Question', phase.prompt || 'Your question here', showList);
      html += previewEl('counter', 'Submissions', '0 / 3 submitted', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('closeButton', 'Close Submissions', showList);
    } else {
      html += previewEl('prompt', 'Question', phase.prompt || 'Your question here', showList);
      html += previewInput('input', 'Type your answer...', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('submitButton', 'Submit', showList);
    }
  }

  if (type === 'collect-choice') {
    if (screen === 'host') {
      html += previewEl('prompt', 'Question', phase.prompt || 'Your question here', showList);
      html += previewEl('counter', 'Submissions', '0 / 3 submitted', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('closeButton', 'Close Submissions', showList);
    } else {
      html += previewEl('prompt', 'Question', phase.prompt || 'Your question here', showList);
      var choices = Array.isArray(phase.choices) ? phase.choices : [];
      var choicesHtml = '';
      for (var i = 0; i < choices.length && i < 4; i++) {
        choicesHtml += '<span class="preview-btn-mockup">' + escapeHtml(choices[i] || 'Choice') + '</span> ';
      }
      if (choicesHtml) {
        var hidden = showList && showList.indexOf('choices') === -1;
        html += '<div class="' + (hidden ? 'preview-hidden' : '') + '">' + choicesHtml + '</div>';
      }
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
    }
  }

  if (type === 'ai-process') {
    if (screen === 'host') {
      html += previewEl('message', 'Status', 'Processing... (auto-advances)', showList);
    } else {
      html += previewEl('message', 'Status', 'AI is thinking...', showList);
    }
  }

  if (type === 'vote') {
    if (screen === 'host') {
      html += previewEl('mode', 'Mode', (phase.mode || 'pick-one') + ' voting', showList);
      html += previewEl('counter', 'Votes', '0 / 3 voted', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('closeButton', 'Close Voting', showList);
    } else {
      html += previewEl('title', 'Question', phase.question || 'Vote for your favorite', showList);
      html += previewEl('options', 'Choices', 'Option A   Option B', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewEl('progress', 'Progress', 'Match 1 of 3', showList);
    }
  }

  if (type === 'eliminate') {
    if (screen === 'host') {
      html += previewEl('eliminated', 'Eliminated', 'Player1, Player2', showList);
      html += previewEl('remaining', 'Remaining', '3 players left', showList);
      html += previewBtn('continueButton', 'Continue', showList);
    } else {
      html += previewEl('details', 'Result', 'You survived! / You were eliminated', showList);
    }
  }

  if (type === 'ai-eliminate') {
    if (screen === 'host') {
      html += previewEl('eliminated', 'Eliminated', 'Player1 (broke the rule)', showList);
      html += previewEl('remaining', 'Remaining', '3 players left', showList);
    } else {
      html += previewEl('details', 'Result', 'You survived! / You were eliminated', showList);
    }
  }

  if (type === 'announce') {
    if (screen === 'host') {
      html += previewEl('message', 'Message', phase.message || 'Your announcement here', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's auto-advance', showList);
      html += previewBtn('continueButton', 'Continue', showList);
    } else {
      html += previewEl('message', 'Message', phase.message || 'Your announcement here', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's', showList);
    }
  }

  if (type === 'reveal') {
    if (screen === 'host') {
      html += previewEl('content', 'Content', phase.template || '(template content)', showList);
      html += previewEl('responses', 'Responses', 'Player answers shown here', showList);
      html += previewBtn('continueButton', 'Next', showList);
    } else {
      html += previewEl('content', 'Content', phase.template || '(template content)', showList);
    }
  }

  if (type === 'preview') {
    if (screen === 'host') {
      html += previewEl('content', 'Content', phase.template || '(AI content for review)', showList);
      html += previewEl('responses', 'Responses', 'Player answers shown here', showList);
      html += previewBtn('approveButton', 'Approve', showList);
      html += previewBtn('rejectButton', 'Reject', showList);
    } else {
      html += previewEl('message', 'Status', 'Waiting for teacher to review...', null);
    }
  }

  if (type === 'winner') {
    if (screen === 'host') {
      html += previewEl('name', 'Winner', 'Player1!', showList);
      html += previewEl('standings', 'Standings', '1st: Player1, 2nd: Player2...', showList);
      html += previewBtn('endButton', 'End Game', showList);
    } else {
      html += previewEl('name', 'Winner', 'Player1!', showList);
      html += previewEl('details', 'Details', 'Congratulations!', showList);
      html += previewEl('standings', 'Standings', '1st: Player1, 2nd: Player2...', showList);
    }
  }

  if (type === 'leaderboard') {
    if (screen === 'host') {
      html += previewEl('standings', 'Rankings', '1st Player1 — 10pts, 2nd Player2 — 7pts...', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's auto-advance', showList);
      html += previewBtn('continueButton', 'Continue', showList);
    } else {
      html += previewEl('rank', 'Your Rank', '#2 — YourName', showList);
      html += previewEl('standings', 'Rankings', '1st Player1 — 10pts, 2nd Player2 — 7pts...', showList);
    }
  }

  if (type === 'reveal-one') {
    if (screen === 'host') {
      html += previewEl('message', 'Title', phase.message || 'Revealing...', showList);
      html += previewEl('counter', 'Counter', '0 / 5 revealed', showList);
      html += previewBtn('revealButton', 'Reveal Next', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's', showList);
    } else {
      html += previewEl('message', 'Title', phase.message || 'Revealing...', showList);
      html += previewEl('items', 'Items', 'Items appear here one at a time', showList);
    }
  }

  if (type === 'team-split') {
    if (screen === 'host') {
      html += previewEl('teams', 'Teams', 'Team 1: Player1, Player2  |  Team 2: Player3, Player4', showList);
      html += previewBtn('continueButton', 'Continue', showList);
    } else {
      html += previewEl('team', 'Your Team', 'You are on Team 1!', showList);
      html += previewEl('allTeams', 'All Teams', 'Team 1: You, Player2  |  Team 2: ...', showList);
    }
  }

  if (type === 'rank') {
    if (screen === 'host') {
      html += previewEl('prompt', 'Prompt', phase.prompt || 'Rank these items', showList);
      html += previewEl('counter', 'Counter', '0 / 5 ranked', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('closeButton', 'Close Ranking', showList);
    } else {
      html += previewEl('prompt', 'Prompt', phase.prompt || 'Rank these items', showList);
      html += previewEl('items', 'Sortable List', '1. Item A  ▲▼  2. Item B  ▲▼  3. Item C  ▲▼', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('submitButton', 'Submit Ranking', showList);
    }
  }

  if (type === 'wager') {
    if (screen === 'host') {
      html += previewEl('prompt', 'Prompt', phase.prompt || 'Place your bets!', showList);
      html += previewEl('options', 'Options', 'Option A  |  Option B  |  Option C', showList);
      html += previewEl('counter', 'Counter', '0 / 5 wagered', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('closeButton', 'Close Wagers', showList);
    } else {
      html += previewEl('prompt', 'Prompt', phase.prompt || 'Place your bets!', showList);
      html += previewEl('options', 'Options', '[Option A] [Option B] [Option C]', showList);
      html += previewEl('points', 'Points', 'You have 50 points', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('submitButton', 'Place Wager', showList);
    }
  }

  if (type === 'relay') {
    if (screen === 'host') {
      html += previewEl('prompt', 'Prompt', phase.prompt || 'Add your part', showList);
      html += previewEl('activePlayer', 'Active', "Player1's turn", showList);
      html += previewEl('progress', 'Progress', 'Turn 1 / 5', showList);
      html += previewEl('sharedResult', 'Shared Result', 'Player1: First sentence...', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's per turn', showList);
    } else {
      html += previewEl('prompt', 'Status', "It's your turn! / Waiting for Player2...", showList);
      html += previewEl('sharedResult', 'Shared Result', 'Previous entries appear here', showList);
      html += previewEl('input', 'Input', 'Text input (active player only)', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's per turn', showList);
    }
  }

  if (type === 'foreach') {
    var feSubNames = Object.keys(phase.subPhases || {});
    html += '<div style="padding:8px; background:#F3E5F5; border:2px solid #6A1B9A; margin:4px 0;">';
    html += '<strong>For each item:</strong> ' + (phase.data || '?') + '<br>';
    for (var fi = 0; fi < feSubNames.length; fi++) {
      var fSub = phase.subPhases[feSubNames[fi]];
      var fSubCat = PHASE_CATALOG[fSub.type];
      html += (fi + 1) + '. ' + (fSubCat ? fSubCat.icon + ' ' : '') + feSubNames[fi] + ' (' + (fSubCat ? fSubCat.friendlyName : fSub.type) + ')<br>';
    }
    if (phase.aiInject) html += '<em>+ ' + (phase.aiInject.count || 1) + ' AI fakes mixed in</em><br>';
    if (phase.scoring) html += '<em>Scoring enabled</em>';
    html += '</div>';
  }

  if (type === 'end') {
    if (screen === 'host') {
      html += previewEl('message', 'Message', phase.message || 'Game Over', showList);
      html += previewBtn('playAgainButton', 'Play Again', showList);
    } else {
      html += previewEl('message', 'Message', phase.message || 'Game Over', showList);
    }
  }

  if (!html) {
    html = '<div class="preview-element"><div class="preview-element-text">No preview available</div></div>';
  }

  return html;
}

function renderLivePreview(phaseId) {
  var previewSection = document.getElementById('live-preview-section');
  if (!previewSection) return;

  var phase = gameConfig.phases[phaseId];
  if (!phase) {
    previewSection.classList.add('hidden');
    return;
  }

  previewSection.classList.remove('hidden');

  if (!previewVisible) return;

  var hostContent = document.getElementById('preview-host-content');
  var playerContent = document.getElementById('preview-player-content');

  if (hostContent) hostContent.innerHTML = buildPreviewHTML(phase, 'host');
  if (playerContent) playerContent.innerHTML = buildPreviewHTML(phase, 'player');
}

// --- Start ---
init();
