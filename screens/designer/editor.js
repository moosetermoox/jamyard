// --- State ---
var gameId = null;
var gameConfig = null;
var selectedPhaseId = null;
var draggedPhaseId = null;
var didDrag = false;
var isDirty = false;
var foreachAdvancedOpen = false;
var aiIssues = {};
var lastReviewResult = null;
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
    friendlyName: 'Go Through Answers',
    description: 'Show each player\'s answer one at a time — guess, rate, or discuss',
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
async function fetchSchemas() {
  try {
    var resp = await fetch('/api/phase-schemas');
    if (!resp.ok) return;
    var data = await resp.json();
    for (var type in data) {
      REQUIRED_FIELDS[type] = data[type].requiredFields;
      VALID_HOST_TOGGLES[type] = data[type].hostToggles;
      VALID_PLAYER_TOGGLES[type] = data[type].playerToggles;
      _schemaEnums[type] = data[type].enumFields;
    }
  } catch (e) {
    console.warn('[editor] Failed to load phase schemas from server:', e);
  }
}

async function init() {
  await fetchSchemas();
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

  // Save-status indicator: poll isDirty every 250ms. Cheap, avoids refactoring
  // the ~40 `isDirty = true` call sites scattered through the editor.
  var lastShownDirty = null;
  setInterval(function () {
    var el = document.getElementById('save-status');
    if (!el) return;
    if (isDirty === lastShownDirty) return;
    lastShownDirty = isDirty;
    if (isDirty) {
      el.textContent = 'Unsaved changes';
      el.className = 'save-status save-status-dirty';
    } else {
      el.textContent = 'Saved';
      el.className = 'save-status save-status-clean';
    }
  }, 250);
  testGameBtn.addEventListener('click', testGame);
  reviewBtn.addEventListener('click', runDeepReview);
  reviewCloseBtn.addEventListener('click', function () { reviewPanel.hidden = true; });
  closePanelBtn.addEventListener('click', deselectPhase);

  // Ask AI (whole-game revise)
  var askAiBtn = document.getElementById('ask-ai-btn');
  if (askAiBtn) askAiBtn.addEventListener('click', function () { openAskAiModal(null); });
  var askAiCloseBtn = document.getElementById('ask-ai-close');
  if (askAiCloseBtn) askAiCloseBtn.addEventListener('click', closeAskAiModal);
  var askAiSubmitBtn = document.getElementById('ask-ai-submit');
  if (askAiSubmitBtn) askAiSubmitBtn.addEventListener('click', submitAskAi);
  var askAiApplyBtn = document.getElementById('ask-ai-apply');
  if (askAiApplyBtn) askAiApplyBtn.addEventListener('click', applyAskAiResult);
  var askAiDiscardBtn = document.getElementById('ask-ai-discard');
  if (askAiDiscardBtn) askAiDiscardBtn.addEventListener('click', closeAskAiModal);

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

    // One-line description
    var descLine = document.createElement('div');
    descLine.className = 'phase-box-desc';
    descLine.textContent = cat.description;
    box.appendChild(descLine);

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

// Render AI suggestions for this phase (or a "looks good" note if none).
// Pinned near the top so the teacher sees advice before editing other fields.
function renderAISuggestions(phaseId) {
  var issues = aiIssues[phaseId] || [];

  if (issues.length === 0) {
    // No suggestions — show a subtle "looks good" confirmation
    var ok = document.createElement('div');
    ok.className = 'ai-suggestion-ok';
    ok.textContent = '\u2713 This step looks good';
    phaseConfigForm.appendChild(ok);
    return;
  }

  var header = document.createElement('div');
  header.className = 'config-section-header ai-suggestions-header';
  header.textContent = 'AI Suggestions';
  phaseConfigForm.appendChild(header);

  for (var i = 0; i < issues.length; i++) {
    (function (issue) {
      var item = document.createElement('div');
      item.className = 'ai-suggestion-item severity-' + (issue.severity || 'warning');

      var msg = document.createElement('div');
      msg.className = 'ai-suggestion-message';
      msg.textContent = humanizeReviewText(issue.message);
      item.appendChild(msg);

      if (issue.suggestion) {
        var fix = document.createElement('div');
        fix.className = 'ai-suggestion-fix';
        fix.textContent = humanizeReviewText(issue.suggestion);
        item.appendChild(fix);
      }

      if (issue.severity !== 'error') {
        var fixBtn = document.createElement('button');
        fixBtn.className = 'review-fix-btn';
        fixBtn.textContent = '\u2728 Apply Fix';
        fixBtn.addEventListener('click', function () {
          requestFix(phaseId, issue, fixBtn);
        });
        item.appendChild(fixBtn);
      }

      phaseConfigForm.appendChild(item);
    })(issues[i]);
  }
}

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

  // Phase type dropdown
  addPhaseTypeSelect('Step type', 'What this step does in the game', 'phase-type', phase.type, function (value) {
    phase.type = value;
    renderCanvas();
    renderPhaseConfig(phaseId);
  });

  // Screen info with AI lane
  addScreenInfo(cat.host, cat.player, cat.ai);

  // AI Suggestions — pinned near the top so the teacher sees advice before editing
  renderAISuggestions(phaseId);

  // Ask AI about this step — quick AI revise scoped to a single phase
  addAskAiStepButton(phaseId);

  // Preview this step — quick look at what host + players will see
  addPreviewStepButton(phaseId);

  // --- Type-specific fields grouped into sections ---
  var type = phase.type;

  if (type === 'lobby') {
    addSectionHeader('Settings');
    addFieldWithHelp('Min players to start', 'Game won\'t start until this many join', 'number', 'phase-minPlayers', phase.minPlayers, false, function (value) {
      phase.minPlayers = value;
    });
  }

  if (type === 'collect') {
    addRoleHeader('player', 'Players see & do');
    var collectPromptTA = addTextAreaWithHelp('Question to ask', 'This appears on every player\'s screen', 'phase-prompt', phase.prompt, 'e.g. What did you do this weekend?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addExampleChips(collectPromptTA, [
      'What did you do this weekend?',
      'What\'s one word that describes how you feel today?',
      'What\'s one thing you learned this week?'
    ]);
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits when time runs out.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });

    // Multi-field inputs — collapsible; expanded when fields already exist
    if (!phase.fields) phase.fields = null;
    var fieldsList = phase.fields || [];
    var fieldsHandle = beginCollapsible('player', 'Multiple answer boxes', phaseId + ':fields', fieldsList.length > 0);
    var fieldsHelp = document.createElement('p');
    fieldsHelp.className = 'field-help';
    fieldsHelp.textContent = 'Add named fields when you need separate inputs (e.g. "Truth 1", "Truth 2", "The Lie"). Leave empty for a single text box.';
    phaseConfigForm.appendChild(fieldsHelp);

    for (var fIdx = 0; fIdx < fieldsList.length; fIdx++) {
      (function(idx) {
        var f = fieldsList[idx];
        var row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:6px; align-items:center; margin:4px 0;';

        var labelIn = document.createElement('input');
        labelIn.type = 'text';
        labelIn.value = f.label || '';
        labelIn.placeholder = 'Label (shown to players)';
        labelIn.style.cssText = 'flex:1; padding:4px 8px; border:2px solid #000; font-family:inherit;';
        labelIn.onchange = function() {
          f.label = labelIn.value;
          f.key = labelIn.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field' + idx;
          isDirty = true;
        };

        var rmBtn = document.createElement('button');
        rmBtn.textContent = 'X';
        rmBtn.style.cssText = 'background:#FF2D2D; color:white; border:2px solid #000; padding:2px 8px; cursor:pointer; font-weight:bold;';
        rmBtn.onclick = function() {
          fieldsList.splice(idx, 1);
          phase.fields = fieldsList.length > 0 ? fieldsList : null;
          isDirty = true;
          renderPhaseConfig(phaseId);
        };

        row.appendChild(labelIn);
        row.appendChild(rmBtn);
        phaseConfigForm.appendChild(row);
      })(fIdx);
    }

    var addFieldBtn = document.createElement('button');
    addFieldBtn.textContent = '+ Add Field';
    addFieldBtn.style.cssText = 'padding:4px 12px; margin-top:4px; background:#00C853; color:white; border:2px solid #000; cursor:pointer; font-weight:bold;';
    addFieldBtn.onclick = function() {
      if (!phase.fields) phase.fields = [];
      var num = phase.fields.length + 1;
      phase.fields.push({ label: 'Field ' + num, key: 'field-' + num });
      isDirty = true;
      renderPhaseConfig(phaseId);
    };
    phaseConfigForm.appendChild(addFieldBtn);
    endCollapsible(fieldsHandle);

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
    addRoleHeader('ai', 'AI does');
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

    var aiInstrTA = addTextAreaWithHelp('Instructions for AI', 'Tell the AI exactly what to do with the player answers', 'phase-instruction', phase.instruction, instrPlaceholder, function (value) {
      phase.instruction = value;
    });
    addExampleChips(aiInstrTA, [
      'Summarize what the class said in 2-3 sentences.',
      'Write a short funny poem combining everyone\'s answers.',
      'Group similar answers into categories.'
    ]);

    addRoleHeader('ai', 'AI input & output');
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
    addRoleHeader('player', 'Players see & do');
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
    addRoleHeader('both', 'Both see');
    var announceTA = addTextAreaWithHelp('Message', 'Displayed to host and all players.', 'phase-message', phase.message, 'e.g. Round 1: Don\'t Match!', function (value) {
      phase.message = value;
      renderCanvas();
    });
    addExampleChips(announceTA, [
      'Get ready! Here we go.',
      'Great work everyone!',
      'Time to vote on your favorite.'
    ]);
    addVariableChips(announceTA, phaseId);
    addFieldWithHelp('Auto-advance timer (seconds)', 'Leave empty to require host to click Continue', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
  }

  if (type === 'collect-choice') {
    addRoleHeader('player', 'Players see & do');
    var choicePromptTA = addTextAreaWithHelp('Question to ask', 'This appears above the choices on every player\'s screen', 'phase-prompt', phase.prompt, 'e.g. Which animal is the fastest?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addExampleChips(choicePromptTA, [
      'Which answer do you agree with most?',
      'Pick your favorite',
      'Vote for the best idea'
    ]);

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
    addRoleHeader('ai', 'AI does');
    var aiElimTA = addTextAreaWithHelp('Elimination rules', 'Tell the AI exactly what rules to enforce', 'phase-instruction', phase.instruction, 'e.g. Eliminate anyone who used more than one sentence.', function (value) {
      phase.instruction = value;
      renderCanvas();
    });
    addExampleChips(aiElimTA, [
      'Eliminate any answer longer than 10 words.',
      'Eliminate answers that don\'t mention a color.',
      'Eliminate any response that isn\'t a complete sentence.'
    ]);
    addDataRefDropdown('Input data', 'Where the AI reads player answers from', 'phase-input', phaseId, phase.input, function (value) {
      phase.input = value;
    });
    addFieldWithHelp('Pause before advancing (seconds)', 'How long to show results before moving on', 'number', 'phase-pause', phase.pause, false, function (value) {
      phase.pause = value;
    });
  }

  if (type === 'reveal') {
    addRoleHeader('both', 'Both see');
    var revealTA = addTextAreaWithHelp('Display template', 'Insert data from earlier steps.', 'phase-template', phase.template, 'e.g. Here\'s what AI created! Use the insert buttons below.', function (value) {
      phase.template = value;
      renderCanvas();
    });
    addVariableChips(revealTA, phaseId);
  }

  if (type === 'preview') {
    addRoleHeader('host', 'Host reviews');
    addDataRefDropdown('Content from', 'Which step\'s output to show the teacher', 'phase-content', phaseId, phase.content, function (value) {
      phase.content = value || undefined;
    });
    var previewTA = addTextAreaWithHelp('Display template', 'Insert data from earlier steps.', 'phase-template', phase.template, 'Use the insert buttons below to add data.', function (value) {
      phase.template = value || undefined;
    });
    addVariableChips(previewTA, phaseId);
    addSelectWithHelp('Show player answers', 'Display original responses alongside AI content', 'phase-showResponses',
      [
        { value: 'true', label: 'Yes, show them' },
        { value: 'false', label: 'No, hide them' }
      ],
      phase.showResponses === false ? 'false' : 'true', function (value) {
        phase.showResponses = value === 'true';
      }
    );

    addRoleHeader('flow', "What's next");
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
    addRoleHeader('both', 'Both see');
    addDataRefDropdown('Scores from', 'Which step\'s scores to display as a leaderboard', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
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
    addRoleHeader('both', 'Both see');
    addDataRefDropdown('Items from', 'Where to get the list of items to reveal one-by-one', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
    var revOneTA = addTextAreaWithHelp('Title message', 'Shown above the reveal area.', 'phase-message', phase.message, 'e.g. And the answers are...', function (value) {
      phase.message = value;
      renderCanvas();
    });
    addVariableChips(revOneTA, phaseId);
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
    addRoleHeader('player', 'Players see & do');
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
    addRoleHeader('player', 'Players see & do');
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
    addRoleHeader('player', 'Players see & do');
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
    // --- Data source ---
    addSectionHeader('Which answers to go through');
    var foreachDataOptions = [{ value: '', label: '(choose which answers)' }];
    var phaseOrder = buildPhaseOrder();
    var currentIdx = phaseOrder.indexOf(phaseId);
    for (var fdi = 0; fdi < phaseOrder.length; fdi++) {
      if (fdi >= currentIdx) break;
      var fdPid = phaseOrder[fdi];
      var fdP = gameConfig.phases[fdPid];
      if (fdP && fdP.type === 'collect') {
        var fdN = fdi + 1;
        foreachDataOptions.push({ value: fdPid + '.responses', label: 'Answers from step ' + fdN });
      }
    }
    addSelectWithHelp('Go through', 'Pick which set of player answers to show one at a time', 'phase-data',
      foreachDataOptions, phase.data || '', function (value) {
        phase.data = value || undefined;
        isDirty = true;
      }
    );

    // --- Detect current pattern ---
    var detectedPattern = detectForeachPattern(phase);

    // --- Pattern picker ---
    addSectionHeader('What happens each round');
    var patternHelp = document.createElement('p');
    patternHelp.className = 'field-help';
    patternHelp.textContent = 'Pick a pattern and the steps will be set up automatically.';
    phaseConfigForm.appendChild(patternHelp);

    var patternOptions = [
      { value: 'guess-author', label: 'Guess who wrote it — players see the answer and pick from a list of names' },
      { value: 'guess-the-truth', label: 'Guess the right answer — players answer each other\'s questions (1 correct + decoys)' },
      { value: 'rate-answers', label: 'Rate each answer — players rate responses and authors earn points' },
      { value: 'spot-the-lie', label: 'Spot the lie — players pick which of someone\'s statements is false' },
      { value: 'discuss', label: 'Just show and discuss — show each answer with time to talk' },
      { value: 'custom', label: 'Custom — build your own steps' }
    ];

    for (var pi = 0; pi < patternOptions.length; pi++) {
      (function(pat) {
        var radio = document.createElement('div');
        radio.style.cssText = 'margin:6px 0; padding:8px 12px; border:2px solid ' + (detectedPattern === pat.value ? '#6A1B9A' : '#ccc') + '; background:' + (detectedPattern === pat.value ? '#F3E5F5' : 'white') + '; cursor:pointer; border-radius:6px;';
        var inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'foreach-pattern-' + phaseId;
        inp.value = pat.value;
        inp.checked = detectedPattern === pat.value;
        inp.style.cssText = 'margin-right:8px;';
        var lbl = document.createElement('span');
        lbl.style.fontWeight = 'bold';
        lbl.textContent = pat.label;
        radio.appendChild(inp);
        radio.appendChild(lbl);
        radio.onclick = function() {
          if (detectedPattern !== pat.value) {
            applyForeachPattern(phase, phaseId, pat.value);
            isDirty = true;
            renderPhaseConfig(phaseId);
          }
        };
        phaseConfigForm.appendChild(radio);
      })(patternOptions[pi]);
    }

    // --- Pattern-specific settings ---
    if (detectedPattern === 'guess-author') {
      addSectionHeader('Settings');
      addFieldWithHelp('Time to guess (seconds)', 'How long players have to pick a name', 'number', 'phase-guess-timer',
        getSubPhaseField(phase, 'guess', 'timer') || 12, false, function(value) {
          setSubPhaseField(phase, 'guess', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
      addFieldWithHelp('Time to show answer (seconds)', 'How long to show who really wrote it', 'number', 'phase-reveal-timer',
        getSubPhaseField(phase, 'reveal', 'timer') || 5, false, function(value) {
          setSubPhaseField(phase, 'reveal', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
      addFieldWithHelp('Points for correct guess', 'Points earned for guessing the right person', 'number', 'phase-points',
        (phase.scoring && phase.scoring.pointsCorrect) || 100, false, function(value) {
          if (phase.scoring) phase.scoring.pointsCorrect = value ? parseInt(value) : 100;
          isDirty = true;
        });
    }

    if (detectedPattern === 'rate-answers') {
      addSectionHeader('Rating Options');
      var pointMap = (phase.scoring && phase.scoring.pointMap) || {};
      var pmKeys = Object.keys(pointMap);
      for (var rki = 0; rki < pmKeys.length; rki++) {
        (function(key) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex; gap:6px; align-items:center; margin:4px 0;';
          var keyInput = document.createElement('input');
          keyInput.type = 'text';
          keyInput.value = key;
          keyInput.style.cssText = 'flex:1; padding:6px; border:2px solid #000; font-weight:bold;';
          keyInput.onchange = function() {
            var pts = phase.scoring.pointMap[key];
            delete phase.scoring.pointMap[key];
            phase.scoring.pointMap[keyInput.value] = pts;
            isDirty = true;
            renderPhaseConfig(phaseId);
          };
          var valInput = document.createElement('input');
          valInput.type = 'number';
          valInput.value = pointMap[key];
          valInput.placeholder = 'pts';
          valInput.style.cssText = 'width:60px; padding:6px; border:2px solid #000;';
          valInput.onchange = function() {
            phase.scoring.pointMap[key] = parseInt(valInput.value) || 0;
            // Update the matching choice in the sub-phase
            updateTallyChoices(phase);
            isDirty = true;
          };
          var delBtn = document.createElement('button');
          delBtn.textContent = 'X';
          delBtn.style.cssText = 'padding:2px 8px; border:2px solid #000; background:#FFCDD2; cursor:pointer; font-weight:bold;';
          delBtn.onclick = function() {
            delete phase.scoring.pointMap[key];
            updateTallyChoices(phase);
            isDirty = true;
            renderPhaseConfig(phaseId);
          };
          row.appendChild(keyInput);
          row.appendChild(document.createTextNode(' pts: '));
          row.appendChild(valInput);
          row.appendChild(delBtn);
          phaseConfigForm.appendChild(row);
        })(pmKeys[rki]);
      }
      var addRatingBtn = document.createElement('button');
      addRatingBtn.textContent = '+ Add Rating';
      addRatingBtn.style.cssText = 'padding:6px 12px; margin-top:4px; background:#C8E6C9; border:2px solid #000; cursor:pointer; font-weight:bold;';
      addRatingBtn.onclick = function() {
        if (!phase.scoring) phase.scoring = { mode: 'tally', pointMap: {} };
        var num = Object.keys(phase.scoring.pointMap).length + 1;
        phase.scoring.pointMap['Rating ' + num] = 10;
        updateTallyChoices(phase);
        isDirty = true;
        renderPhaseConfig(phaseId);
      };
      phaseConfigForm.appendChild(addRatingBtn);

      addSectionHeader('Timing');
      addFieldWithHelp('Time to rate (seconds)', 'How long players have to pick a rating', 'number', 'phase-rate-timer',
        getSubPhaseField(phase, 'rate', 'timer') || 12, false, function(value) {
          setSubPhaseField(phase, 'rate', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
    }

    if (detectedPattern === 'spot-the-lie') {
      addSectionHeader('Settings');
      var sourcePhaseId = (phase.data || '').split('.')[0];
      var sourcePhase = gameConfig.phases[sourcePhaseId];
      if (sourcePhase && sourcePhase.fields) {
        var correctOptions = [];
        for (var cfi = 0; cfi < sourcePhase.fields.length; cfi++) {
          correctOptions.push({ value: '_current.fields.' + sourcePhase.fields[cfi].key, label: sourcePhase.fields[cfi].label });
        }
        addSelectWithHelp('Which field is the "wrong" answer?', 'The one players are trying to find', 'phase-correct-field',
          correctOptions, (phase.scoring && phase.scoring.correctAnswer) || '', function(value) {
            if (phase.scoring) phase.scoring.correctAnswer = value;
            isDirty = true;
          });
      }
      addFieldWithHelp('Time to pick (seconds)', 'How long players have to choose', 'number', 'phase-guess-timer',
        getSubPhaseField(phase, 'guess', 'timer') || 15, false, function(value) {
          setSubPhaseField(phase, 'guess', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
      addFieldWithHelp('Points for finding it', 'Points for picking the correct answer', 'number', 'phase-points',
        (phase.scoring && phase.scoring.pointsCorrect) || 100, false, function(value) {
          if (phase.scoring) phase.scoring.pointsCorrect = value ? parseInt(value) : 100;
          isDirty = true;
        });
    }

    if (detectedPattern === 'guess-the-truth') {
      addSectionHeader('Settings');
      var gtSourcePhaseId = (phase.data || '').split('.')[0];
      var gtSourcePhase = gameConfig.phases[gtSourcePhaseId];
      if (gtSourcePhase && gtSourcePhase.fields) {
        var gtCorrectOptions = [];
        for (var gfi = 0; gfi < gtSourcePhase.fields.length; gfi++) {
          gtCorrectOptions.push({ value: '_current.fields.' + gtSourcePhase.fields[gfi].key, label: gtSourcePhase.fields[gfi].label });
        }
        addSelectWithHelp('Which field is the correct answer?', 'The right answer players are trying to find', 'phase-correct-field',
          gtCorrectOptions, (phase.scoring && phase.scoring.correctAnswer) || '', function(value) {
            if (phase.scoring) phase.scoring.correctAnswer = value;
            isDirty = true;
          });
      }
      addFieldWithHelp('Time to pick (seconds)', 'How long players have to choose', 'number', 'phase-guess-timer',
        getSubPhaseField(phase, 'guess', 'timer') || 20, false, function(value) {
          setSubPhaseField(phase, 'guess', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
      addFieldWithHelp('Points for correct answer', 'Points for picking the right answer', 'number', 'phase-points',
        (phase.scoring && phase.scoring.pointsCorrect) || 100, false, function(value) {
          if (phase.scoring) phase.scoring.pointsCorrect = value ? parseInt(value) : 100;
          isDirty = true;
        });
    }

    if (detectedPattern === 'discuss') {
      addSectionHeader('Timing');
      addFieldWithHelp('Time to show answer (seconds)', 'How long each answer is displayed', 'number', 'phase-show-timer',
        getSubPhaseField(phase, 'show', 'timer') || 8, false, function(value) {
          setSubPhaseField(phase, 'show', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
      addFieldWithHelp('Discussion time (seconds)', 'Time to talk about each answer', 'number', 'phase-discuss-timer',
        getSubPhaseField(phase, 'discuss', 'timer') || 15, false, function(value) {
          setSubPhaseField(phase, 'discuss', 'timer', value ? parseInt(value) : undefined);
          isDirty = true;
        });
    }

    if (detectedPattern === 'custom') {
      // Show raw sub-phase editor for power users
      addSectionHeader('Steps (run for each answer)');
      if (!phase.subPhases) phase.subPhases = {};
      var subNames = Object.keys(phase.subPhases);
      for (var si = 0; si < subNames.length; si++) {
        (function(subName, stepNum) {
          var sub = phase.subPhases[subName];
          var subCat = PHASE_CATALOG[sub.type];
          var subDiv = document.createElement('div');
          subDiv.className = 'foreach-sub-phase';
          subDiv.style.cssText = 'border:2px solid #000; padding:8px; margin:6px 0; background:' + (subCat ? subCat.bg : '#eee');
          var header = document.createElement('div');
          header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;';
          header.innerHTML = '<strong>Step ' + stepNum + ': ' + (subCat ? subCat.friendlyName : sub.type) + '</strong>';
          var removeBtn = document.createElement('button');
          removeBtn.textContent = 'Remove';
          removeBtn.style.cssText = 'background:#FF2D2D; color:white; border:2px solid #000; padding:2px 8px; cursor:pointer; font-weight:bold;';
          removeBtn.onclick = function() { delete phase.subPhases[subName]; isDirty = true; renderPhaseConfig(phaseId); };
          header.appendChild(removeBtn);
          subDiv.appendChild(header);

          // Type selector
          var typeSelect = document.createElement('select');
          typeSelect.style.cssText = 'margin:4px 0; padding:4px; border:2px solid #000;';
          var subTypes = ['announce', 'collect', 'collect-choice'];
          for (var sti = 0; sti < subTypes.length; sti++) {
            var opt = document.createElement('option');
            opt.value = subTypes[sti]; opt.textContent = (PHASE_CATALOG[subTypes[sti]] || {}).friendlyName || subTypes[sti];
            if (sub.type === subTypes[sti]) opt.selected = true;
            typeSelect.appendChild(opt);
          }
          typeSelect.onchange = function() { sub.type = typeSelect.value; isDirty = true; renderPhaseConfig(phaseId); };
          subDiv.appendChild(typeSelect);

          // Message/prompt field
          var fieldKey = sub.type === 'announce' ? 'message' : 'prompt';
          var tw = document.createElement('div');
          var ta = document.createElement('textarea');
          ta.value = sub[fieldKey] || '';
          ta.rows = 2;
          ta.style.cssText = 'width:100%; border:2px solid #000; padding:4px; font-family:inherit; margin-top:4px;';
          ta.onchange = function() { sub[fieldKey] = ta.value; isDirty = true; };
          tw.appendChild(ta);
          addForeachVariableChips(ta, phaseId);
          subDiv.appendChild(tw);

          // Timer
          var tIn = document.createElement('input');
          tIn.type = 'number'; tIn.value = sub.timer || ''; tIn.placeholder = 'Timer (sec)';
          tIn.style.cssText = 'width:80px; border:2px solid #000; padding:4px; margin-top:4px;';
          tIn.onchange = function() { sub.timer = tIn.value ? parseInt(tIn.value) : undefined; isDirty = true; };
          subDiv.appendChild(tIn);

          phaseConfigForm.appendChild(subDiv);
        })(subNames[si], si + 1);
      }
      var addSubBtn = document.createElement('button');
      addSubBtn.textContent = '+ Add Step';
      addSubBtn.style.cssText = 'width:100%; padding:8px; margin-top:8px; background:#6A1B9A; color:white; border:2px solid #000; cursor:pointer; font-weight:bold;';
      addSubBtn.onclick = function() {
        if (!phase.subPhases) phase.subPhases = {};
        var n = Object.keys(phase.subPhases).length + 1;
        phase.subPhases['step-' + n] = { type: 'announce', message: '', timer: 5 };
        isDirty = true;
        renderPhaseConfig(phaseId);
      };
      phaseConfigForm.appendChild(addSubBtn);
    }

    // Shuffle toggle (always visible)
    addSectionHeader('Options');
    addSelectWithHelp('Shuffle order?', 'Randomize the order answers are shown', 'phase-shuffle',
      [{ value: 'true', label: 'Yes (random order)' }, { value: 'false', label: 'No (original order)' }],
      phase.shuffle === false ? 'false' : 'true', function(value) {
        phase.shuffle = value === 'true' ? undefined : false;
        isDirty = true;
      }
    );
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
    addRoleHeader('flow', "What's next");
    // When next is already set, show a compact read-only display with a "Change" chip.
    // This hides a dropdown teachers rarely need to touch (canvas order = next = correct 90% of the time).
    if (phase.next && gameConfig.phases[phase.next]) {
      addCompactNextRef(phaseId);
    } else {
      addPhaseRefSelect('Next step', 'Which step comes after this one', 'phase-next', phaseId, phase.next, function (value) {
        phase.next = value === '(none)' ? undefined : value;
        renderCanvas();
      });
    }

    // Loop (Optional) — collapsible; expanded when already configured
    var loopHandle = beginCollapsible('flow', 'Loop this section', phaseId + ':loop', !!phase.loopBack);

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
    endCollapsible(loopHandle);
  }

  // --- Screen Control (Optional) — collapsible per role; expanded when configured ---
  if (type !== 'lobby') {
    var hostCustomized = !!phase.hostTemplate || (Array.isArray(phase.hostShow) && phase.hostShow.length > 0);
    var hostHandle = beginCollapsible('host', 'Customize host screen', phaseId + ':hostScreen', hostCustomized);
    var hostTemplateTA = addTextAreaWithHelp('Host template', 'Custom text shown on the host screen. Leave empty for default.', 'phase-hostTemplate', phase.hostTemplate, 'Leave empty for default, or type custom text. Use insert buttons below to add data.', function (value) {
      if (value) { phase.hostTemplate = value; } else { delete phase.hostTemplate; }
    });
    addVariableChips(hostTemplateTA, phaseId);

    var hostToggles = VALID_HOST_TOGGLES[type];
    if (hostToggles) {
      addToggleCheckboxes('Host screen elements', 'Choose which built-in elements to show on the host screen', phase, 'hostShow', hostToggles);
    }
    endCollapsible(hostHandle);

    var playerCustomized = !!phase.playerTemplate || (Array.isArray(phase.playerShow) && phase.playerShow.length > 0);
    var playerHandle = beginCollapsible('player', 'Customize player screens', phaseId + ':playerScreen', playerCustomized);
    var playerTemplateTA = addTextAreaWithHelp('Player template', 'Custom text shown on player screens. Leave empty for default.', 'phase-playerTemplate', phase.playerTemplate, 'e.g. Great job everyone!', function (value) {
      if (value) { phase.playerTemplate = value; } else { delete phase.playerTemplate; }
    });
    addVariableChips(playerTemplateTA, phaseId);

    var playerToggles = VALID_PLAYER_TOGGLES[type];
    if (playerToggles) {
      addToggleCheckboxes('Player screen elements', 'Choose which built-in elements to show on player screens', phase, 'playerShow', playerToggles);
    }
    endCollapsible(playerHandle);
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

// --- Foreach pattern helpers ---

function detectForeachPattern(phase) {
  if (!phase.subPhases) return 'custom';
  var subNames = Object.keys(phase.subPhases);
  var scoring = phase.scoring || {};
  var hasChoiceSub = false;
  var choicesSrc = null;
  for (var i = 0; i < subNames.length; i++) {
    var sub = phase.subPhases[subNames[i]];
    if (sub.type === 'collect-choice') {
      hasChoiceSub = true;
      choicesSrc = sub.choices;
    }
  }
  // spot-the-lie / guess-the-truth: choices are shuffled fields. Distinguish by source field keys
  // or by the prompt wording (lie vs correct/right/true).
  if (hasChoiceSub && choicesSrc === '_current.shuffledFields') {
    var srcId = (phase.data || '').split('.')[0];
    var srcPhase = gameConfig && gameConfig.phases && gameConfig.phases[srcId];
    var keys = (srcPhase && srcPhase.fields) ? srcPhase.fields.map(function(f){ return f.key; }) : [];
    if (keys.indexOf('correct') !== -1) return 'guess-the-truth';
    if (keys.indexOf('lie') !== -1) return 'spot-the-lie';
    var corr = (scoring.correctAnswer || '').toLowerCase();
    if (corr.indexOf('correct') !== -1 || corr.indexOf('right') !== -1 || corr.indexOf('true') !== -1) return 'guess-the-truth';
    return 'spot-the-lie';
  }
  // guess-author: correct scoring + candidates
  if (hasChoiceSub && scoring.correctAnswer && scoring.mode !== 'tally' && (phase.candidateSource || choicesSrc === '_candidates')) return 'guess-author';
  // rate-answers: tally scoring
  if (hasChoiceSub && scoring.mode === 'tally') return 'rate-answers';
  // discuss: only announce sub-phases (no collect-choice)
  if (!hasChoiceSub && subNames.length > 0) return 'discuss';
  // fallback
  if (subNames.length === 0) return 'guess-author';
  return 'custom';
}

function applyForeachPattern(phase, phaseId, pattern) {
  if (pattern === 'guess-author') {
    phase.candidateSource = 'players';
    phase.decoyCount = 99;
    phase.subPhases = {
      'show': { type: 'announce', message: '{{_current.playerName}} wrote:\n\n"{{_current.text}}"', timer: 5 },
      'guess': { type: 'collect-choice', prompt: 'Who wrote this?', choices: '_candidates', timer: 12 },
      'reveal': { type: 'announce', message: 'It was {{_current.playerName}}!', timer: 5 }
    };
    phase.scoring = { subPhase: 'guess', correctAnswer: '_current.playerName', pointsCorrect: 100 };
  } else if (pattern === 'rate-answers') {
    delete phase.candidateSource;
    delete phase.decoyCount;
    phase.subPhases = {
      'show': { type: 'announce', message: '"{{_current.text}}"', timer: 5 },
      'rate': { type: 'collect-choice', prompt: 'Rate this answer:', choices: ['Meh', 'Not Bad', 'Pretty Good', 'Amazing'], timer: 12 },
      'reveal': { type: 'announce', message: 'That was by {{_current.playerName}}!', timer: 4 }
    };
    phase.scoring = { subPhase: 'rate', mode: 'tally', pointMap: { 'Meh': 10, 'Not Bad': 25, 'Pretty Good': 50, 'Amazing': 100 } };
  } else if (pattern === 'spot-the-lie') {
    delete phase.candidateSource;
    delete phase.decoyCount;
    phase.subPhases = {
      'show': { type: 'announce', message: '{{_current.playerName}} wrote these statements.\n\nWhich one is false?', timer: 5 },
      'guess': { type: 'collect-choice', prompt: 'Which is the lie?', choices: '_current.shuffledFields', timer: 15 },
      'reveal': { type: 'announce', message: 'The answer was: "{{_current.fields.lie}}"', timer: 6 }
    };
    // Try to detect the correct field from the source collect phase
    var correctField = '_current.fields.lie';
    var srcId = (phase.data || '').split('.')[0];
    var srcPhase = gameConfig.phases[srcId];
    if (srcPhase && srcPhase.fields && srcPhase.fields.length > 0) {
      correctField = '_current.fields.' + srcPhase.fields[srcPhase.fields.length - 1].key;
    }
    phase.scoring = { subPhase: 'guess', correctAnswer: correctField, pointsCorrect: 100 };
  } else if (pattern === 'guess-the-truth') {
    delete phase.candidateSource;
    delete phase.decoyCount;
    // Try to find a "question" field for the prompt and a "correct" field for scoring
    var gtSrcId = (phase.data || '').split('.')[0];
    var gtSrcPhase = gameConfig.phases[gtSrcId];
    var questionKey = 'question';
    var correctKey = 'correct';
    if (gtSrcPhase && gtSrcPhase.fields && gtSrcPhase.fields.length > 0) {
      var keys = gtSrcPhase.fields.map(function(f){ return f.key; });
      if (keys.indexOf('question') === -1) questionKey = keys[0];
      if (keys.indexOf('correct') === -1) {
        var nonQ = keys.filter(function(k){ return k !== questionKey; });
        correctKey = nonQ[0] || keys[0];
      }
    }
    phase.subPhases = {
      'show': { type: 'announce', message: '{{_current.playerName}} asks:\n\n{{_current.fields.' + questionKey + '}}', timer: 4 },
      'guess': { type: 'collect-choice', prompt: 'Pick the right answer:', choices: '_current.shuffledFields', timer: 20 },
      'reveal': { type: 'announce', message: 'The correct answer was:\n\n{{_current.fields.' + correctKey + '}}', timer: 6 }
    };
    phase.scoring = { subPhase: 'guess', correctAnswer: '_current.fields.' + correctKey, pointsCorrect: 100 };
  } else if (pattern === 'discuss') {
    delete phase.candidateSource;
    delete phase.decoyCount;
    delete phase.scoring;
    phase.subPhases = {
      'show': { type: 'announce', message: '{{_current.playerName}} wrote:\n\n"{{_current.text}}"', timer: 8 },
      'discuss': { type: 'announce', message: 'Take a moment to discuss!', timer: 15 }
    };
  } else if (pattern === 'custom') {
    // Keep existing sub-phases or start with empty
    if (!phase.subPhases || Object.keys(phase.subPhases).length === 0) {
      phase.subPhases = { 'step-1': { type: 'announce', message: '', timer: 5 } };
    }
  }
}

function getSubPhaseField(phase, subName, field) {
  if (!phase.subPhases) return undefined;
  // Direct name match
  if (phase.subPhases[subName]) return phase.subPhases[subName][field];
  // Search by type or partial name match
  var names = Object.keys(phase.subPhases);
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (n.indexOf(subName) !== -1) return phase.subPhases[n][field];
  }
  // Search by sub-phase type (e.g. 'guess' matches collect-choice, 'rate' matches collect-choice)
  var typeMap = { 'guess': 'collect-choice', 'rate': 'collect-choice', 'show': 'announce', 'reveal': 'announce', 'discuss': 'announce' };
  var targetType = typeMap[subName];
  if (targetType) {
    // For 'reveal'/'discuss', try to match the later announce (not first)
    var isLater = subName === 'reveal' || subName === 'discuss';
    var found = null;
    for (var j = 0; j < names.length; j++) {
      if (phase.subPhases[names[j]].type === targetType) {
        if (!isLater || found !== null) return phase.subPhases[names[j]][field];
        found = names[j];
      }
    }
    if (found !== null) return phase.subPhases[found][field];
  }
  return undefined;
}

function setSubPhaseField(phase, subName, field, value) {
  if (!phase.subPhases) return;
  // Direct name match
  if (phase.subPhases[subName]) { phase.subPhases[subName][field] = value; return; }
  // Search by partial name match
  var names = Object.keys(phase.subPhases);
  for (var i = 0; i < names.length; i++) {
    if (names[i].indexOf(subName) !== -1) { phase.subPhases[names[i]][field] = value; return; }
  }
  // Search by type
  var typeMap = { 'guess': 'collect-choice', 'rate': 'collect-choice', 'show': 'announce', 'reveal': 'announce', 'discuss': 'announce' };
  var targetType = typeMap[subName];
  if (targetType) {
    var isLater = subName === 'reveal' || subName === 'discuss';
    var found = null;
    for (var j = 0; j < names.length; j++) {
      if (phase.subPhases[names[j]].type === targetType) {
        if (!isLater || found !== null) { phase.subPhases[names[j]][field] = value; return; }
        found = names[j];
      }
    }
    if (found !== null) { phase.subPhases[found][field] = value; }
  }
}

function updateTallyChoices(phase) {
  if (!phase.subPhases || !phase.scoring || !phase.scoring.pointMap) return;
  var choices = Object.keys(phase.scoring.pointMap);
  var names = Object.keys(phase.subPhases);
  for (var i = 0; i < names.length; i++) {
    if (phase.subPhases[names[i]].type === 'collect-choice') {
      phase.subPhases[names[i]].choices = choices;
      break;
    }
  }
}

// Section header divider
function addSectionHeader(title) {
  var header = document.createElement('div');
  header.className = 'config-section-header';
  header.textContent = title;
  phaseConfigForm.appendChild(header);
}

// Collapse state per phase per section. Keyed "<phaseId>:<sectionKey>".
// Undefined = use the heuristic caller passes (e.g. expand if any field is set).
var collapseState = {};

/**
 * Begin a collapsible section. All addXXX calls between this and endCollapsible()
 * render inside the section's content div. Header click toggles visibility.
 * @param {string} role — host | player | ai | both | flow
 * @param {string} title — section title (will prefix with "+" when collapsed)
 * @param {string} stateKey — unique key for remembering user's open/close choice
 * @param {boolean} defaultExpanded — fallback when no user state stored
 */
function beginCollapsible(role, title, stateKey, defaultExpanded) {
  var expanded = collapseState[stateKey];
  if (expanded === undefined) expanded = defaultExpanded;

  var originalForm = phaseConfigForm;

  var wrapper = document.createElement('div');
  wrapper.className = 'collapsible-section';

  var header = document.createElement('div');
  header.className = 'config-section-header role-section-' + role + ' collapsible-header';

  var arrow = document.createElement('span');
  arrow.className = 'collapsible-arrow';
  arrow.textContent = expanded ? '▼ ' : '▶ ';

  var labelEl = document.createElement('span');
  labelEl.textContent = (expanded ? '' : '+ ') + title;

  header.appendChild(arrow);
  header.appendChild(labelEl);

  var content = document.createElement('div');
  content.className = 'collapsible-content';
  if (!expanded) content.style.display = 'none';

  header.addEventListener('click', function () {
    expanded = !expanded;
    collapseState[stateKey] = expanded;
    content.style.display = expanded ? '' : 'none';
    arrow.textContent = expanded ? '▼ ' : '▶ ';
    labelEl.textContent = (expanded ? '' : '+ ') + title;
  });

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  originalForm.appendChild(wrapper);

  // Redirect subsequent addXXX calls into the collapsible content div
  phaseConfigForm = content;
  return { originalForm: originalForm };
}

function endCollapsible(handle) {
  phaseConfigForm = handle.originalForm;
}

// Role-coded section header. role: 'host' (blue), 'player' (green), 'ai' (purple),
// 'both' (yellow neutral, both audiences see this), or 'flow' (gray, engine config).
function addRoleHeader(role, title) {
  var header = document.createElement('div');
  header.className = 'config-section-header role-section-' + role;
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
    var val = textarea.value;
    if (textarea._getVars) {
      val = detokenize(val, textarea._getVars());
    }
    onChange(val);
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

// --- Friendly-token translation for template fields ---
// Users see [Player's name] in textareas, but the stored config still uses {{_current.playerName}}.

function tokenize(text, vars) {
  if (!text || !vars) return text || '';
  var result = text;
  for (var i = 0; i < vars.length; i++) {
    var v = vars[i];
    var raw = v.variable;
    var token = '[' + v.label + ']';
    // Replace all occurrences — escape regex special chars in raw
    var escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), token);
  }
  return result;
}

function detokenize(text, vars) {
  if (!text || !vars) return text || '';
  var result = text;
  for (var i = 0; i < vars.length; i++) {
    var v = vars[i];
    var token = '[' + v.label + ']';
    var escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), v.variable);
  }
  return result;
}

// Build template variables available for a given phase (phases that come before it)
function buildTemplateVariables(currentPhaseId, extraVars) {
  var order = buildPhaseOrder();
  var currentIndex = order.indexOf(currentPhaseId);
  var vars = [];

  for (var i = 0; i < order.length; i++) {
    if (i >= currentIndex) break;
    var pid = order[i];
    var p = gameConfig.phases[pid];
    var cat = PHASE_CATALOG[p.type];
    if (!cat) continue;

    if (p.type === 'collect' || p.type === 'collect-choice') {
      vars.push({ label: cat.friendlyName + ' answers', variable: '{{' + pid + '.responses}}' });
    }
    if (p.type === 'ai-process') {
      vars.push({ label: 'AI result', variable: '{{' + pid + '.result}}' });
    }
    if (p.type === 'vote' || p.type === 'wager') {
      vars.push({ label: cat.friendlyName + ' scores', variable: '{{' + pid + '.scores}}' });
    }
    if (p.type === 'foreach') {
      vars.push({ label: 'Foreach scores', variable: '{{' + pid + '.scores}}' });
    }
  }

  // Add loop variables if any phase has loopBack pointing at an ancestor
  for (var li = 0; li < order.length; li++) {
    var lp = gameConfig.phases[order[li]];
    if (lp && lp.loopBack) {
      vars.push({ label: 'Loop ' + order[li] + ' iteration', variable: '{{_loop.' + order[li] + '.iteration}}' });
      vars.push({ label: 'Loop ' + order[li] + ' total', variable: '{{_loop.' + order[li] + '.total}}' });
    }
  }

  if (extraVars) {
    for (var ei = 0; ei < extraVars.length; ei++) {
      vars.push(extraVars[ei]);
    }
  }
  return vars;
}

// Build foreach-specific template variables based on the data source collect phase
function buildForeachVariables(foreachPhaseId) {
  var phase = gameConfig.phases[foreachPhaseId];
  if (!phase) return [];
  var vars = [
    { label: "Player's name", variable: '{{_current.playerName}}' },
    { label: "Player's response", variable: '{{_current.text}}' },
    { label: 'Round number', variable: '{{_foreach.' + foreachPhaseId + '.index}}' },
    { label: 'Total rounds', variable: '{{_foreach.' + foreachPhaseId + '.total}}' }
  ];

  // If the data source collect phase has fields, add field-specific variables
  var dataRef = phase.data || '';
  var sourcePhaseId = dataRef.split('.')[0];
  var sourcePhase = gameConfig.phases[sourcePhaseId];
  if (sourcePhase && sourcePhase.fields && Array.isArray(sourcePhase.fields)) {
    for (var fi = 0; fi < sourcePhase.fields.length; fi++) {
      var f = sourcePhase.fields[fi];
      vars.push({ label: f.label, variable: '{{_current.fields.' + f.key + '}}' });
    }
  }

  return vars;
}

// Add foreach variable chips below a textarea
function addForeachVariableChips(textarea, foreachPhaseId) {
  var getVars = function () { return buildForeachVariables(foreachPhaseId); };
  var vars = getVars();
  if (vars.length === 0) return;

  // Tokenize the existing value (convert stored {{}} to friendly [labels])
  textarea.value = tokenize(textarea.value, vars);
  textarea._getVars = getVars;

  var container = document.createElement('div');
  container.className = 'variable-chips';

  var chipLabel = document.createElement('span');
  chipLabel.className = 'variable-chips-label';
  chipLabel.textContent = 'Insert: ';
  container.appendChild(chipLabel);

  for (var i = 0; i < vars.length; i++) {
    (function (v) {
      var token = '[' + v.label + ']';
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'variable-chip';
      chip.textContent = v.label;
      chip.title = token;
      chip.onclick = function (e) {
        e.preventDefault();
        var start = textarea.selectionStart || textarea.value.length;
        var end = textarea.selectionEnd || start;
        textarea.value = textarea.value.substring(0, start) + token + textarea.value.substring(end);
        textarea.focus();
        var newPos = start + token.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.dispatchEvent(new Event('input'));
      };
      container.appendChild(chip);
    })(vars[i]);
  }

  textarea.parentNode.appendChild(container);
}

// Add clickable variable chips below a textarea
function addVariableChips(textarea, currentPhaseId, extraVars) {
  var getVars = function () { return buildTemplateVariables(currentPhaseId, extraVars); };
  var vars = getVars();
  if (vars.length === 0) return;

  // Tokenize the existing value (convert stored {{}} to friendly [labels])
  textarea.value = tokenize(textarea.value, vars);
  textarea._getVars = getVars;

  var container = document.createElement('div');
  container.className = 'variable-chips';

  var chipLabel = document.createElement('span');
  chipLabel.className = 'variable-chips-label';
  chipLabel.textContent = 'Insert: ';
  container.appendChild(chipLabel);

  for (var i = 0; i < vars.length; i++) {
    (function (v) {
      var token = '[' + v.label + ']';
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'variable-chip';
      chip.textContent = v.label;
      chip.title = token;
      chip.onclick = function (e) {
        e.preventDefault();
        var start = textarea.selectionStart || textarea.value.length;
        var end = textarea.selectionEnd || start;
        textarea.value = textarea.value.substring(0, start) + token + textarea.value.substring(end);
        textarea.focus();
        var newPos = start + token.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.dispatchEvent(new Event('input'));
      };
      container.appendChild(chip);
    })(vars[i]);
  }

  // Insert after the textarea in its parent group
  textarea.parentNode.appendChild(container);
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

    var stepLabel = cat.friendlyName + ' (step ' + (i + 1) + ')';
    if (p.type === 'collect') {
      options.push({ value: pid + '.responses', label: 'Answers from ' + stepLabel });
    } else if (p.type === 'collect-choice') {
      options.push({ value: pid + '.responses', label: 'Choices from ' + stepLabel });
      options.push({ value: pid + '.tally', label: 'Tally from ' + stepLabel });
    } else if (p.type === 'ai-process') {
      options.push({ value: pid + '.result', label: 'AI result from ' + stepLabel });
    } else if (p.type === 'vote') {
      options.push({ value: pid + '.scores', label: 'Scores from ' + stepLabel });
    } else if (p.type === 'eliminate') {
      options.push({ value: pid + '.eliminated', label: 'Eliminated from ' + stepLabel });
    } else if (p.type === 'ai-eliminate') {
      options.push({ value: pid + '.survivors', label: 'Survivors from ' + stepLabel });
      options.push({ value: pid + '.eliminated', label: 'Eliminated from ' + stepLabel });
    } else if (p.type === 'leaderboard') {
      options.push({ value: pid + '.standings', label: 'Rankings from ' + stepLabel });
    } else if (p.type === 'team-split') {
      options.push({ value: pid + '.teams', label: 'Teams from ' + stepLabel });
      options.push({ value: pid + '.playerTeam', label: 'Player team map from ' + stepLabel });
    } else if (p.type === 'rank') {
      options.push({ value: pid + '.rankings', label: 'Rankings from ' + stepLabel });
    } else if (p.type === 'wager') {
      options.push({ value: pid + '.scores', label: 'Updated scores from ' + stepLabel });
      options.push({ value: pid + '.wagers', label: 'Wagers from ' + stepLabel });
    } else if (p.type === 'relay') {
      options.push({ value: pid + '.result', label: 'Entries from ' + stepLabel });
      options.push({ value: pid + '.text', label: 'Combined text from ' + stepLabel });
    } else if (p.type === 'foreach') {
      options.push({ value: pid + '.scores', label: 'Scores from ' + stepLabel });
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

  var select = addSelectWithHelp(label, helpText, id, options, value || '', function (val) {
    onChange(val || undefined);
  });

  // Inline warning for broken data references
  if (value && value.indexOf('.') !== -1) {
    var refPhaseId = value.split('.')[0];
    if (!gameConfig.phases[refPhaseId]) {
      var warning = document.createElement('div');
      warning.className = 'data-ref-warning';
      warning.textContent = '\u26A0 Step "' + refPhaseId + '" no longer exists';
      select.style.borderColor = '#FF2D2D';
      select.parentNode.appendChild(warning);
    }
  }

  return select;
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
/**
 * Add 2-3 clickable example chips below a textarea. Clicking a chip fills the
 * textarea with that example (overwriting existing content — hint "Replace with").
 * Teachers learn the format by example without wading through hint text.
 * @param {HTMLTextAreaElement} textarea
 * @param {string[]} examples - short example strings
 */
function addExampleChips(textarea, examples) {
  if (!examples || examples.length === 0) return;
  var container = document.createElement('div');
  container.className = 'example-chips';

  var hint = document.createElement('span');
  hint.className = 'example-chips-label';
  hint.textContent = 'Try: ';
  container.appendChild(hint);

  for (var i = 0; i < examples.length; i++) {
    (function (text) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'example-chip';
      // Show a shortened preview on the chip, full text on hover
      chip.textContent = text.length > 32 ? text.slice(0, 30) + '…' : text;
      chip.title = text;
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
        textarea.focus();
      });
      container.appendChild(chip);
    })(examples[i]);
  }

  textarea.parentNode.appendChild(container);
}

// Preview-this-step button: opens a modal with host + player mock renders side-by-side.
// Answers the "what does this step actually look like?" question without launching prototype mode.
function addPreviewStepButton(phaseId) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'preview-step-btn';
  btn.textContent = '👀 Preview this step';
  btn.addEventListener('click', function () {
    showPreviewStepModal(phaseId);
  });
  phaseConfigForm.appendChild(btn);
}

function addAskAiStepButton(phaseId) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ask-step-btn';
  btn.textContent = '✨ Ask AI about this step';
  btn.addEventListener('click', function () {
    openAskAiModal(phaseId);
  });
  phaseConfigForm.appendChild(btn);
}

function showPreviewStepModal(phaseId) {
  var phase = gameConfig.phases[phaseId];
  if (!phase) return;

  var existing = document.getElementById('preview-step-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'preview-step-overlay';
  overlay.className = 'picker-overlay';

  var modal = document.createElement('div');
  modal.className = 'picker-modal preview-step-modal';

  var title = document.createElement('h2');
  var cat = PHASE_CATALOG[phase.type] || {};
  title.textContent = 'Preview: ' + (cat.friendlyName || phase.type);
  modal.appendChild(title);

  var subtitle = document.createElement('div');
  subtitle.className = 'preview-step-subtitle';
  subtitle.textContent = 'This is roughly what the host and players see on this step.';
  modal.appendChild(subtitle);

  var split = document.createElement('div');
  split.className = 'preview-step-split';

  var hostCol = document.createElement('div');
  hostCol.className = 'preview-step-col preview-step-host';
  var hostLabel = document.createElement('div');
  hostLabel.className = 'preview-step-label';
  hostLabel.textContent = 'Host screen';
  var hostBody = document.createElement('div');
  hostBody.className = 'preview-step-body';
  hostBody.innerHTML = buildPreviewHTML(phase, 'host');
  hostCol.appendChild(hostLabel);
  hostCol.appendChild(hostBody);

  var playerCol = document.createElement('div');
  playerCol.className = 'preview-step-col preview-step-player';
  var playerLabel = document.createElement('div');
  playerLabel.className = 'preview-step-label';
  playerLabel.textContent = 'Player screen';
  var playerBody = document.createElement('div');
  playerBody.className = 'preview-step-body';
  playerBody.innerHTML = buildPreviewHTML(phase, 'player');
  playerCol.appendChild(playerLabel);
  playerCol.appendChild(playerBody);

  split.appendChild(hostCol);
  split.appendChild(playerCol);
  modal.appendChild(split);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'btn-secondary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', function () { overlay.remove(); });
  var btnRow = document.createElement('div');
  btnRow.className = 'fix-btn-row';
  btnRow.appendChild(closeBtn);
  modal.appendChild(btnRow);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// Compact "→ Next: <Name> [Change]" display. Click Change to swap in the full dropdown.
function addCompactNextRef(currentPhaseId) {
  var phase = gameConfig.phases[currentPhaseId];
  var targetId = phase.next;
  var target = gameConfig.phases[targetId];
  var cat = target ? PHASE_CATALOG[target.type] : null;
  var name = cat ? (cat.icon + ' ' + cat.friendlyName) : (targetId || '(none)');

  var wrapper = document.createElement('div');
  wrapper.className = 'compact-next-ref';

  var arrow = document.createElement('span');
  arrow.textContent = '→ ';
  arrow.style.opacity = '0.6';

  var text = document.createElement('span');
  text.textContent = 'Goes to: ' + name;
  text.style.fontWeight = 'bold';

  var changeBtn = document.createElement('button');
  changeBtn.className = 'compact-next-change';
  changeBtn.textContent = 'Change';
  changeBtn.type = 'button';
  changeBtn.addEventListener('click', function () {
    // Replace compact display with the full dropdown
    wrapper.remove();
    addPhaseRefSelect('Next step', 'Which step comes after this one', 'phase-next', currentPhaseId, phase.next, function (value) {
      phase.next = value === '(none)' ? undefined : value;
      renderCanvas();
    });
  });

  wrapper.appendChild(arrow);
  wrapper.appendChild(text);
  wrapper.appendChild(changeBtn);
  phaseConfigForm.appendChild(wrapper);
}

function addPhaseRefSelect(label, helpText, id, currentPhaseId, selected, onChange) {
  var phaseIds = Object.keys(gameConfig.phases);
  var options = [{ value: '(none)', label: '(none)' }];
  for (var i = 0; i < phaseIds.length; i++) {
    var pid = phaseIds[i];
    if (pid === currentPhaseId) continue;
    var p = gameConfig.phases[pid];
    var cat = PHASE_CATALOG[p.type];
    if (cat) {
      options.push({ value: pid, label: cat.icon + ' ' + cat.friendlyName + ' (step ' + (i + 1) + ')' });
    } else {
      options.push({ value: pid, label: 'Step ' + (i + 1) });
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
var PHASE_CATEGORIES = [
  {
    name: 'Player Input',
    description: 'Get responses from players',
    types: ['collect', 'collect-choice', 'rank', 'wager', 'relay']
  },
  {
    name: 'AI',
    description: 'Let AI process or judge',
    types: ['ai-process', 'ai-eliminate']
  },
  {
    name: 'Display',
    description: 'Show info to the class',
    types: ['announce', 'reveal', 'reveal-one', 'leaderboard', 'preview']
  },
  {
    name: 'Game Flow',
    description: 'Control how the game plays out',
    types: ['vote', 'eliminate', 'winner', 'team-split', 'foreach']
  }
];

var ADDABLE_PHASE_TYPES = [];
for (var ci = 0; ci < PHASE_CATEGORIES.length; ci++) {
  for (var ti = 0; ti < PHASE_CATEGORIES[ci].types.length; ti++) {
    ADDABLE_PHASE_TYPES.push(PHASE_CATEGORIES[ci].types[ti]);
  }
}

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

  for (var gi = 0; gi < PHASE_CATEGORIES.length; gi++) {
    var group = PHASE_CATEGORIES[gi];

    var header = document.createElement('div');
    header.className = 'picker-category-header';
    header.textContent = group.name;
    grid.appendChild(header);

    for (var pi = 0; pi < group.types.length; pi++) {
      var type = group.types[pi];
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

  // Create the new phase with sensible defaults that produce a working step out of the box
  var newPhase = { type: type };

  if (type === 'collect') {
    newPhase.prompt = 'What do you think?';
    newPhase.timer = 60;
  } else if (type === 'collect-choice') {
    newPhase.prompt = 'Pick one:';
    newPhase.choices = ['Option A', 'Option B'];
    newPhase.timer = 30;
  } else if (type === 'ai-process') {
    newPhase.task = 'summarize';
    newPhase.instruction = 'Summarize what the class said in 2-3 sentences. Highlight any common themes.';
    newPhase.format = 'text';
  } else if (type === 'ai-eliminate') {
    newPhase.instruction = 'Eliminate any player whose answer does not follow the rules.';
  } else if (type === 'vote') {
    newPhase.mode = 'pick-one';
    newPhase.timer = 30;
  } else if (type === 'eliminate') {
    newPhase.method = 'bottom-percent';
    newPhase.percent = 50;
  } else if (type === 'announce') {
    newPhase.message = 'Get ready!';
    newPhase.timer = 5;
  } else if (type === 'reveal') {
    newPhase.template = 'Results:';
  } else if (type === 'leaderboard') {
    newPhase.style = 'full';
    newPhase.timer = 15;
  } else if (type === 'preview') {
    newPhase.approveNext = endId || undefined;
    newPhase.rejectNext = undefined;
  } else if (type === 'rank') {
    newPhase.prompt = 'Rank these from best to worst:';
    newPhase.timer = 45;
  } else if (type === 'wager') {
    newPhase.prompt = 'Bet your points!';
    newPhase.options = ['Yes', 'No'];
    newPhase.timer = 20;
  } else if (type === 'relay') {
    newPhase.prompt = 'Add to the story...';
    newPhase.timer = 20;
    newPhase.order = 'random';
  } else if (type === 'team-split') {
    newPhase.method = 'random';
    newPhase.teamCount = 2;
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
  showToast('We added a typical setup — change anything you want');
}

// Transient bottom-of-screen toast (4s). Re-used for any "here's what happened" messages.
var _toastTimer = null;
function showToast(message) {
  var el = document.getElementById('editor-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'editor-toast';
    el.className = 'editor-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('editor-toast-visible');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    el.classList.remove('editor-toast-visible');
  }, 4000);
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

// These tables are populated from /api/phase-schemas at init time.
// The values here are fallbacks used only if the schema fetch fails.
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

// Per-phase enum validation: { phaseType: { fieldName: allowedValues[] } }
// Populated from /api/phase-schemas at init time; hardcoded values are fallback.
var _schemaEnums = {
  collect: { from: ['all', 'remaining', 'eliminated'] },
  'collect-choice': { from: ['all', 'remaining', 'eliminated'] },
  vote: { voters: ['all', 'remaining', 'eliminated'], mode: ['pick-one', 'head-to-head'] },
  eliminate: { method: ['bottom-percent', 'hook'] },
  'ai-process': { task: ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge'], format: ['text', 'json'] },
  'ai-eliminate': { format: ['text', 'json'] },
  leaderboard: { style: ['full', 'top3'] },
  relay: { order: ['random', 'join-order'] },
  foreach: { candidateSource: ['players'], pairMode: ['human-vs-ai'] }
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

    // Enum checks (schema-driven via _schemaEnums)
    var phaseEnums = _schemaEnums[phase.type] || {};
    for (var enumField in phaseEnums) {
      if (phase[enumField] !== undefined && phase[enumField] !== null) {
        if (phaseEnums[enumField].indexOf(phase[enumField]) === -1) {
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
    lastReviewResult = result;
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

// Strip technical syntax from AI review output so teachers see plain language.
// Replaces {{phaseId.field}} with "the <Friendly Name> step", removes backticks,
// trims stray quote artifacts.
function humanizeReviewText(text) {
  if (!text || typeof text !== 'string') return text || '';
  var out = text;
  out = out.replace(/\{\{\s*([a-zA-Z0-9_\-]+)(?:\.[a-zA-Z0-9_\-\.]+)?\s*\}\}/g, function (_match, phaseId) {
    if (gameConfig && gameConfig.phases && gameConfig.phases[phaseId]) {
      return 'the "' + getFriendlyPhaseName(phaseId) + '" step';
    }
    return 'the "' + phaseId + '" step';
  });
  out = out.replace(/`([^`]+)`/g, '$1');
  return out;
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
    summaryDiv.textContent = humanizeReviewText(ai.summary);
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
    msgDiv.textContent = humanizeReviewText(issue.message);
    item.appendChild(msgDiv);

    if (issue.suggestion) {
      var sugDiv = document.createElement('div');
      sugDiv.className = 'review-issue-suggestion-text';
      sugDiv.textContent = humanizeReviewText(issue.suggestion);
      item.appendChild(sugDiv);
    }

    // Apply Fix button — only for issues scoped to a specific phase
    if (issue.phaseId && gameConfig.phases[issue.phaseId] && issue.severity !== 'error') {
      var fixBtn = document.createElement('button');
      fixBtn.className = 'review-fix-btn';
      fixBtn.textContent = '✨ Apply Fix';
      fixBtn.setAttribute('data-phase-id', issue.phaseId);
      fixBtn.setAttribute('data-issue-idx', String(i));
      fixBtn.addEventListener('click', function () {
        var pid = this.getAttribute('data-phase-id');
        var idx = parseInt(this.getAttribute('data-issue-idx'));
        requestFix(pid, allIssues[idx], this);
      });
      item.appendChild(fixBtn);
    }

    list.appendChild(item);
  }

  reviewContent.appendChild(list);
}

async function requestFix(phaseId, issue, btn) {
  btn.disabled = true;
  btn.textContent = 'Thinking...';
  try {
    var response = await fetch('/api/games/fix-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: gameConfig, phaseId: phaseId, issue: issue })
    });
    if (!response.ok) {
      var err = await response.json();
      alert('Could not generate fix: ' + (err.error || 'Unknown error'));
      return;
    }
    var result = await response.json();
    showFixPreview(phaseId, gameConfig.phases[phaseId], result.updatedPhase, result.explanation, issue);
  } catch (error) {
    alert('Fix request failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Apply Fix';
  }
}

function showFixPreview(phaseId, oldPhase, newPhase, explanation, appliedIssue) {
  var existing = document.getElementById('fix-preview-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'fix-preview-overlay';
  overlay.className = 'picker-overlay';

  var modal = document.createElement('div');
  modal.className = 'picker-modal fix-preview-modal';

  var title = document.createElement('h2');
  title.textContent = 'Review Fix for ' + getFriendlyPhaseName(phaseId);
  modal.appendChild(title);

  if (explanation) {
    var explDiv = document.createElement('div');
    explDiv.className = 'fix-explanation';
    explDiv.textContent = explanation;
    modal.appendChild(explDiv);
  }

  var diffContainer = document.createElement('div');
  diffContainer.className = 'fix-diff';
  renderFieldDiff(diffContainer, oldPhase, newPhase);
  modal.appendChild(diffContainer);

  var btnRow = document.createElement('div');
  btnRow.className = 'fix-btn-row';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.addEventListener('click', function () { overlay.remove(); });

  var applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply Fix';
  applyBtn.className = 'btn-primary';
  applyBtn.addEventListener('click', function () {
    gameConfig.phases[phaseId] = newPhase;
    isDirty = true;
    dismissIssue(phaseId, appliedIssue);
    overlay.remove();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(applyBtn);
  modal.appendChild(btnRow);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function dismissIssue(phaseId, issue) {
  if (!issue) return;
  // Remove from aiIssues sidebar store
  if (aiIssues[phaseId]) {
    aiIssues[phaseId] = aiIssues[phaseId].filter(function (x) {
      return x.message !== issue.message;
    });
    if (aiIssues[phaseId].length === 0) delete aiIssues[phaseId];
  }
  // Remove from cached review result so panel re-render drops it
  if (lastReviewResult && lastReviewResult.ai && lastReviewResult.ai.issues) {
    lastReviewResult.ai.issues = lastReviewResult.ai.issues.filter(function (x) {
      return !(x.phaseId === phaseId && x.message === issue.message);
    });
  }
  // Re-render review panel if open
  if (lastReviewResult && !reviewPanel.hidden) {
    showReviewPanel(lastReviewResult);
  }
  // Re-render canvas + current phase sidebar
  renderCanvas();
  if (selectedPhaseId) renderPhaseConfig(selectedPhaseId);
}

function renderFieldDiff(container, oldObj, newObj) {
  var allKeys = {};
  for (var k in oldObj) allKeys[k] = true;
  for (var k2 in newObj) allKeys[k2] = true;
  var keys = Object.keys(allKeys);
  var hasChanges = false;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var oldVal = oldObj[key];
    var newVal = newObj[key];
    var oldStr = oldVal === undefined ? '(not set)' : (typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal));
    var newStr = newVal === undefined ? '(not set)' : (typeof newVal === 'string' ? newVal : JSON.stringify(newVal));
    if (oldStr === newStr) continue;
    hasChanges = true;
    var row = document.createElement('div');
    row.className = 'fix-diff-row';
    var label = document.createElement('div');
    label.className = 'fix-diff-key';
    label.textContent = key;
    row.appendChild(label);
    var oldDiv = document.createElement('div');
    oldDiv.className = 'fix-diff-old';
    oldDiv.textContent = '- ' + oldStr;
    row.appendChild(oldDiv);
    var newDiv = document.createElement('div');
    newDiv.className = 'fix-diff-new';
    newDiv.textContent = '+ ' + newStr;
    row.appendChild(newDiv);
    container.appendChild(row);
  }
  if (!hasChanges) {
    var noChange = document.createElement('div');
    noChange.className = 'fix-diff-no-change';
    noChange.textContent = 'No changes detected.';
    container.appendChild(noChange);
  }
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

// --- Ask AI (whole-game and per-step revise) ---

var askAiContext = null; // null = whole game, or { phaseId } for per-step
var askAiPendingResult = null; // { updatedConfig } or { phaseId, updatedPhase }

function openAskAiModal(phaseId) {
  askAiContext = phaseId ? { phaseId: phaseId } : null;
  askAiPendingResult = null;
  var modal = document.getElementById('ask-ai-modal');
  var title = document.getElementById('ask-ai-title');
  var subtitle = document.getElementById('ask-ai-subtitle');
  var input = document.getElementById('ask-ai-input');
  var status = document.getElementById('ask-ai-status');
  var result = document.getElementById('ask-ai-result');

  if (phaseId) {
    title.textContent = 'Ask AI to revise: ' + getFriendlyPhaseName(phaseId);
    subtitle.textContent = 'Describe what you\'d like to change about this step.';
    input.placeholder = 'e.g. Give players more time, make the prompt friendlier, add a hint';
  } else {
    title.textContent = 'Ask AI to revise this game';
    subtitle.textContent = 'Describe what you\'d like to change in plain English.';
    input.placeholder = 'e.g. Make round 1 longer, add a leaderboard at the end, change the AI roast to be more sarcastic';
  }

  input.value = '';
  status.hidden = true;
  status.textContent = '';
  result.hidden = true;
  modal.hidden = false;
  setTimeout(function () { input.focus(); }, 50);
}

function closeAskAiModal() {
  askAiContext = null;
  askAiPendingResult = null;
  document.getElementById('ask-ai-modal').hidden = true;
}

async function submitAskAi() {
  var input = document.getElementById('ask-ai-input');
  var status = document.getElementById('ask-ai-status');
  var result = document.getElementById('ask-ai-result');
  var submitBtn = document.getElementById('ask-ai-submit');
  var request = (input.value || '').trim();
  if (!request) {
    status.hidden = false;
    status.textContent = 'Please describe what you\'d like to change.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Thinking...';
  status.hidden = false;
  status.textContent = 'AI is revising' + (askAiContext ? ' this step' : ' the game') + '... (10-30 seconds)';
  result.hidden = true;

  try {
    var response;
    if (askAiContext && askAiContext.phaseId) {
      response = await fetch('/api/games/revise-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: gameConfig, phaseId: askAiContext.phaseId, request: request })
      });
    } else {
      response = await fetch('/api/games/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: gameConfig, request: request })
      });
    }
    if (!response.ok) {
      var err = await response.json().catch(function () { return { error: 'Server error' }; });
      status.textContent = 'Couldn\'t revise: ' + (err.error || 'Unknown error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ask AI';
      return;
    }
    var data = await response.json();
    askAiPendingResult = data;
    status.hidden = true;

    // Show summary
    var summary = document.getElementById('ask-ai-summary');
    summary.textContent = humanizeReviewText(data.summary || 'AI made changes.');

    // Show structural errors if any (whole-game revise only)
    var errBox = document.getElementById('ask-ai-errors');
    var errors = (data.structural && data.structural.errors) || [];
    if (errors.length > 0) {
      errBox.hidden = false;
      errBox.innerHTML = '<strong>The AI\'s revision has problems:</strong><ul>' +
        errors.map(function (e) { return '<li>' + humanizeReviewText(e) + '</li>'; }).join('') +
        '</ul>';
    } else {
      errBox.hidden = true;
    }

    result.hidden = false;
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Ask AI';
}

function applyAskAiResult() {
  if (!askAiPendingResult) return closeAskAiModal();
  if (askAiContext && askAiContext.phaseId) {
    gameConfig.phases[askAiContext.phaseId] = askAiPendingResult.updatedPhase;
  } else if (askAiPendingResult.updatedConfig) {
    gameConfig = askAiPendingResult.updatedConfig;
  }
  isDirty = true;
  closeAskAiModal();
  renderCanvas();
  if (selectedPhaseId && gameConfig.phases[selectedPhaseId]) {
    renderPhaseConfig(selectedPhaseId);
  } else {
    deselectPhase();
  }
}

// --- Start ---
init();
