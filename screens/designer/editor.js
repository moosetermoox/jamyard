/**
 * editor.js — the phase-graph game editor (/designer/edit). The largest client
 * file.
 *
 * Loads a game config and lets the teacher build it: schema-driven settings and
 * per-phase config forms, a drag-to-reorder phase canvas, theme picker, token /
 * template tooling (shows friendly [labels] instead of raw {{refs}}), live
 * client + server validation, AI light/deep review and one-click fixes, a live
 * host/player preview, save, and save-as-recipe. Note the DEFAULT view most
 * teachers see is the plain-English "simple" view (simple-view.js, which wraps
 * functions defined here); this DAG canvas is the "Advanced" mode.
 */

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
    icon: '',
    friendlyName: 'Waiting Room',
    description: 'Players join and wait for the teacher to start',
    color: '#0057FF',
    bg: '#BBDEFB',
    detailField: null,
    host: 'Player list, player count, Start button',
    player: '"Waiting to start" message',
    ai: null
  },
  'collect': {
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
    friendlyName: 'Rank Items',
    description: 'Players reorder a list by preference or criteria',
    color: '#7C4DFF',
    bg: '#E8D5FF',
    detailField: 'prompt',
    host: 'Prompt, submission counter, Close Ranking button',
    player: 'Prompt, sortable list with up/down arrows, Submit button',
    ai: null
  },
  'rate': {
    icon: '',
    friendlyName: 'Rate on Scales',
    description: 'Class rates something (a presentation, idea, pitch) on one or more custom scales',
    color: '#1DE9B6',
    bg: '#B2DFDB',
    detailField: 'prompt',
    host: 'Prompt, submission counter, Close Ratings button \u2192 results',
    player: 'Prompt, scale buttons (1\u2026N) per scale, Submit button',
    ai: null
  },
  'wager': {
    icon: '',
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
    icon: '',
    friendlyName: 'Relay (Take Turns)',
    description: 'Players take turns adding to a growing shared result',
    color: '#009688',
    bg: '#B2DFDB',
    detailField: 'prompt',
    host: 'Shared result, active player, progress',
    player: 'Active: input + shared result. Waiting: watch others',
    ai: null
  },
  'turn': {
    icon: '',
    friendlyName: 'Describe & Guess',
    description: 'Charades-style turn: one describer per team, shared timer, item pool drains',
    color: '#D84315',
    bg: '#FFCCBC',
    detailField: 'instruction',
    host: 'Current item + team + describer + scores + timer',
    player: 'Describer sees item + Got It/Skip. Team sees "guess!". Others see item',
    ai: null
  },
  'foreach': {
    icon: '',
    friendlyName: 'Go Through Answers',
    description: 'Show each player\'s answer one at a time, guess, rate, or discuss',
    color: '#6A1B9A',
    bg: '#E1BEE7',
    detailField: 'data',
    host: 'Runs sub-phases per item automatically',
    player: 'Sees sub-phase UI per iteration',
    ai: null
  },
  'buzz': {
    icon: '🔔',
    friendlyName: 'Buzzer Round',
    description: 'Ask questions out loud, first to buzz answers, you judge Right/Wrong',
    color: '#C62828',
    bg: '#FFCDD2',
    detailField: 'prompt',
    host: 'Who buzzed + Correct/Wrong buttons + scores',
    player: 'One giant BUZZ button',
    ai: null
  },
  'estimate': {
    icon: '🔢',
    friendlyName: 'Guess the Number',
    description: 'Everyone guesses a number, closest to the answer earns points',
    color: '#00838F',
    bg: '#B2EBF2',
    detailField: 'prompt',
    host: 'Guess counter, then the answer + class distribution',
    player: 'Number input (changeable until the reveal)',
    ai: null
  },
  'sort': {
    icon: '🗂️',
    friendlyName: 'Sort into Buckets',
    description: 'Students place each item into a category (metaphor vs simile), scored, or a consensus poll',
    color: '#00695C',
    bg: '#B2DFDB',
    detailField: 'prompt',
    host: 'Submission counter, then per-item class distributions (+accuracy when scored)',
    player: 'Each item with bucket buttons, tap one per item, then submit',
    ai: null
  },
  'match': {
    icon: '🔗',
    friendlyName: 'Match Pairs',
    description: 'Students match items from two lists (vocab ↔ definitions), auto-scored',
    color: '#5E35B1',
    bg: '#D1C4E9',
    detailField: 'prompt',
    host: 'Submission counter, then correct pairs + per-pair class accuracy',
    player: 'Two columns, drag the right column until each row is a correct pair',
    ai: null
  },
  'merge': {
    icon: '',
    friendlyName: 'Groups Combine Answers',
    description: 'Group members merge their answers into one shared answer (think-pair-share)',
    color: '#00897B',
    bg: '#B2DFDB',
    detailField: 'prompt',
    host: 'Live group progress, Close button',
    player: 'Shared live draft, agree-to-submit buttons',
    ai: null
  },
  'one-voice': {
    icon: '',
    friendlyName: 'Count Together',
    description: 'The class counts to a target together, collisions reset, one voice at a time',
    color: '#5E35B1',
    bg: '#D1C4E9',
    detailField: null,
    host: 'Big live count, attempts, celebration',
    player: 'One tap button',
    ai: null
  },
  'collect-two': {
    icon: '',
    friendlyName: 'Secret + Clue',
    description: 'Students type two things, the first stays hidden until the reveal (party-game shape)',
    color: '#00C853',
    bg: '#C8E6C9',
    detailField: 'prompt',
    host: 'Prompt text, submission counter, Close Submissions button',
    player: 'Two labeled text boxes, Submit button',
    ai: null
  },
  'checklist': {
    icon: '✅',
    friendlyName: 'To-Do Checklist',
    description: 'Every group works through the same to-do list; the projector shows live progress',
    color: '#33691E',
    bg: '#DCEDC8',
    detailField: 'prompt',
    host: 'Per-group progress bars, groups-finished count, End Work Time button',
    player: 'The to-do list, tap items to check them off for your group',
    ai: null
  },
  'end': {
    icon: '',
    friendlyName: 'Wrap Up',
    description: 'End the activity and show a final message',
    color: '#555',
    bg: '#E0E0E0',
    detailField: 'message',
    host: 'Final message',
    player: 'Final message',
    ai: null
  }
};

// Canonical step vocabulary: every teacher-facing surface names steps from
// shared/phase-names.js. The catalog literals above are fallbacks only;
// the registry wins so Simple view, pickers, refs, and the Builder all say
// the same thing.
(function () {
  for (var t in PHASE_CATALOG) {
    if (window.PHASE_NAMES && window.PHASE_NAMES[t]) PHASE_CATALOG[t].friendlyName = window.PHASE_NAMES[t];
    if (window.PHASE_BLURBS && window.PHASE_BLURBS[t]) PHASE_CATALOG[t].description = window.PHASE_BLURBS[t];
  }
})();

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

  // Dictation everywhere you can type: every text box carries the corner
  // mic (covers Simple view boxes, Builder rail, Ask AI, dialogs).
  if (window.Speech) Speech.autoAttach();

  var params = new URLSearchParams(window.location.search);
  gameId = params.get('game');

  // Arrived from the library? Send "back" there, not to the designer grid —
  // the two pages look alike and landing on the wrong one is disorienting.
  if (params.get('from') === 'library') {
    var backLink = document.querySelector('.back-link');
    if (backLink) {
      backLink.href = '/library';
      backLink.textContent = '← Back to Library';
    }
  }

  if (gameId) {
    loadGame(gameId);
  } else {
    gameConfig = createBlankConfig();
    onConfigLoaded();
  }

  addPhaseBtn.addEventListener('click', addPhase);
  saveBtn.addEventListener('click', saveGame);

  // Never silently lose edits: a dirty editor warns before the tab
  // navigates away or closes (usability test 2026-08-01 — a teacher lost
  // work twice in one session).
  window.addEventListener('beforeunload', function (e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  var hostBtn = document.getElementById('host-btn');
  if (hostBtn) {
    hostBtn.addEventListener('click', async function () {
      // Save first (validating — a rejected save keeps you here), then
      // straight to a live room with this activity.
      await saveGame();
      if (gameId && !isDirty) {
        window.location.href = '/host?game=' + encodeURIComponent(gameId);
      }
    });
  }

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

  // Click anywhere outside the selected phase block (and not inside a modal
  // or validation panel) to collapse it — triggers an auto-save on the way out.
  document.addEventListener('click', function (e) {
    if (!selectedPhaseId) return;
    if (!e.target.closest) return;
    // Clicks inside any phase-box are handled by handlePhaseClick (or by the
    // inline-form descendant check) — leave them alone.
    if (e.target.closest('.phase-box')) return;
    // The Simple view is its own surface — its clicks (editing boxes,
    // "Advanced settings" buttons) must not trigger the canvas collapse,
    // which would both undo a just-made selection and re-render the
    // simple list out from under a focused textarea.
    if (e.target.closest('#simple-view')) return;
    // The Builder view manages its own selection (cards select, rail
    // edits, suggestion tiles insert) — the canvas collapse would undo a
    // just-made selection on every click. Checked via the body class, not
    // closest(): builder clicks re-render synchronously, so by the time
    // this handler runs the clicked tile is detached and closest() fails.
    if (document.body.classList.contains('builder-mode')) return;
    // Active modal / overlay UIs that the user is interacting with.
    if (e.target.closest('.picker-overlay')) return;
    if (e.target.closest('.ask-ai-modal')) return;
    if (e.target.closest('#validation-panel')) return;
    if (e.target.closest('#review-panel')) return;
    // Header buttons (Save/Test/etc.) run their own handlers — fine to also
    // collapse, since "Save" matches user intent and the others don't care.
    deselectPhase();
  });

  // "More ▾" header menu — parks Ask AI + Save as Recipe so the header
  // reads Save > Check for Errors / Prototype Mode > everything else.
  var headerMoreBtn = document.getElementById('header-more-btn');
  var headerMenuItems = document.getElementById('header-menu-items');
  function setHeaderMenu(open) {
    headerMenuItems.hidden = !open;
    headerMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (headerMoreBtn && headerMenuItems) {
    headerMoreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setHeaderMenu(headerMenuItems.hidden);
    });
    document.addEventListener('click', function (e) {
      if (!headerMenuItems.hidden && !headerMenuItems.contains(e.target)) {
        setHeaderMenu(false);
      }
    });
    // Choosing an item closes the menu (the item's own handler still runs).
    headerMenuItems.addEventListener('click', function () { setHeaderMenu(false); });
  }

  // Ask AI (whole-game revise)
  var askAiBtn = document.getElementById('ask-ai-btn');
  if (askAiBtn) askAiBtn.addEventListener('click', function () { openAskAiModal(null); });

  // Save as Recipe (R5) — turn the current game into a reusable recipe
  var saveAsRecipeBtn = document.getElementById('save-as-recipe-btn');
  if (saveAsRecipeBtn) saveAsRecipeBtn.addEventListener('click', openSaveAsRecipeModal);
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
      throw new Error('Failed to load activity (status ' + response.status + ')');
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
    name: 'New Activity',
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
  headerGameName.textContent = gameConfig.name || 'Untitled Activity';

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
  gameConfig.name = settingsName.value.trim() || 'Untitled Activity';
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
    showToast('Please describe your theme first.');
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
      showToast('Failed: ' + (err.error || 'Unknown error'));
      return;
    }

    var result = await response.json();
    isDirty = true;
    gameConfig.theme = { name: 'custom', description: desc, colors: result.colors };
    renderThemeSwatches(gameConfig.theme);
  } catch (error) {
    showToast('Failed: ' + error.message);
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
  // Inline-settings prototype: the phase-config form may currently be
  // living inside a phase box (from the previous render). Move it back
  // to the (hidden) right panel before we tear down the canvas, so it
  // doesn't get destroyed along with its host box. We re-attach it to
  // the new selected box at the end.
  if (phaseConfigForm.parentNode && phaseConfigForm.parentNode !== phasePanel) {
    phasePanel.appendChild(phaseConfigForm);
  }
  var previewSection = document.getElementById('live-preview-section');
  if (previewSection && previewSection.parentNode && previewSection.parentNode !== phasePanel) {
    phasePanel.appendChild(previewSection);
  }

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

    // Pair-scoped reveals show each pair only its own answers — calling
    // that "Show Everyone" on the canvas was actively misleading.
    var isPairReveal = phase.type === 'reveal' && phase.scope === 'pair';

    var friendlyName = document.createElement('span');
    friendlyName.className = 'phase-box-name';
    friendlyName.textContent = isPairReveal ? 'Show Each Pair' : cat.friendlyName;

    header.appendChild(iconSpan);
    header.appendChild(friendlyName);
    box.appendChild(header);

    // One-line description
    var descLine = document.createElement('div');
    descLine.className = 'phase-box-desc';
    descLine.textContent = isPairReveal
      ? 'Each pair privately sees only its own answers'
      : cat.description;
    box.appendChild(descLine);

    // Primary editable field — the dominant input for this phase type,
    // shown inline on the canvas so you can read+edit the flow without
    // opening the expanded settings panel.
    appendPrimaryField(box, phase, phaseId);

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

  // Inline-settings prototype: after rebuilding the canvas, move the
  // phase-config form INTO the selected phase box so settings render
  // inline rather than in the right sidebar. The form's existing
  // contents (set by renderPhaseConfig) survive the move.
  attachFormToSelectedBox();
}

/**
 * Definition of the "primary" field for each phase type — what gets shown
 * inline on the canvas so the flow reads at a glance.
 *
 * Returns one of:
 *   - { key, type: 'textarea'|'text', placeholder } — editable primary input
 *   - { type: 'summary', summarize: (phase) => string } — read-only one-liner
 *   - null — no primary preview (lobby, etc.)
 */
function getPrimaryFieldDef(type) {
  switch (type) {
    case 'announce':      return { key: 'message',     type: 'textarea', placeholder: 'What everyone sees…' };
    case 'collect':       return { key: 'prompt',      type: 'textarea', placeholder: 'Question to ask…' };
    case 'collect-choice':return { key: 'prompt',      type: 'textarea', placeholder: 'Question to ask…' };
    case 'ai-process':    return { key: 'instruction', type: 'textarea', placeholder: 'Tell the AI what to do…' };
    case 'ai-eliminate':  return { key: 'instruction', type: 'textarea', placeholder: 'Rule the AI enforces…' };
    case 'reveal':        return { key: 'content',     type: 'textarea', placeholder: 'Content to show…' };
    case 'preview':       return { key: 'content',     type: 'textarea', placeholder: 'Content for the teacher to review…' };
    case 'end':           return { key: 'message',     type: 'textarea', placeholder: 'Closing message…' };
    case 'rank':          return { key: 'prompt',      type: 'textarea', placeholder: 'Question to ask…' };
    case 'wager':         return { key: 'prompt',      type: 'textarea', placeholder: 'Question to ask…' };
    case 'relay':         return { key: 'prompt',      type: 'textarea', placeholder: 'Question to ask…' };
    case 'buzz':          return { key: 'prompt',      type: 'textarea', placeholder: 'On-screen prompt (questions are usually asked out loud)…' };
    case 'estimate':      return { key: 'prompt',      type: 'textarea', placeholder: 'The number to guess, e.g. How many liters…' };
    case 'match':         return { key: 'prompt',      type: 'textarea', placeholder: 'e.g. Match each word to its definition…' };
    case 'sort':          return { key: 'prompt',      type: 'textarea', placeholder: 'e.g. Is each line a metaphor or a simile?…' };
    case 'vote': return { type: 'summary', summarize: function (p) {
      var mode = p.mode === 'head-to-head' ? 'Head-to-head vote' : 'Pick-one vote';
      if (p.matchupsFromPairs) {
        var src = gameConfig.phases[p.matchupsFromPairs] ? phaseContentLabel(p.matchupsFromPairs) : p.matchupsFromPairs;
        return mode + ' • paired from ' + src;
      }
      if (Array.isArray(p.candidates)) return mode + ' on ' + p.candidates.length + ' fixed options';
      if (p.candidates) return mode + ' on ' + humanizeRef(p.candidates);
      return mode + ' • (no source set)';
    }};
    case 'eliminate': return { type: 'summary', summarize: function (p) {
      if (p.method === 'hook') return 'Custom rule (hook)';
      if (p.percent) return 'Knock out the bottom ' + p.percent + '%';
      return 'Knock out the bottom %';
    }};
    case 'leaderboard': return { type: 'summary', summarize: function (p) {
      return p.from ? 'Show ' + humanizeRef(p.from) : '(no score source set)';
    }};
    case 'winner': return { type: 'summary', summarize: function (p) {
      return p.from ? 'Winner picked from ' + humanizeRef(p.from) : '(no source set)';
    }};
    case 'foreach': return { type: 'summary', summarize: function (p) {
      var subs = p.subPhases ? Object.keys(p.subPhases).length : 0;
      var source = p.data ? humanizeRef(p.data) : '?';
      return 'For each item in ' + source + ' • ' + subs + ' sub-step' + (subs === 1 ? '' : 's');
    }};
    case 'team-split': return { type: 'summary', summarize: function (p) {
      var sizing = p.groupSize != null ? 'groups of ' + p.groupSize : (p.teamCount || 2) + ' teams';
      var how = { random: 'random', balanced: 'balanced', teacher: 'you arrange', choice: 'students pick' }[p.method];
      return sizing + (how ? ' (' + how + ')' : '');
    }};
    case 'checklist': return { type: 'summary', summarize: function (p) {
      var n = (p.items || []).length;
      return n + ' task' + (n === 1 ? '' : 's') + (p.teamsFrom ? ' per group' : ' per student');
    }};
    case 'rate': return { type: 'summary', summarize: function (p) {
      var scaleCount = (p.scales || []).length;
      var target = p.target ? humanizeRef(p.target) : '?';
      return 'Rate ' + target + ' on ' + scaleCount + ' scale' + (scaleCount === 1 ? '' : 's');
    }};
    case 'reveal-one': return { type: 'summary', summarize: function (p) {
      return 'Reveal items from ' + (p.from ? humanizeRef(p.from) : '?');
    }};
    case 'lobby': return null; // self-explanatory
    default: return null;
  }
}

/**
 * Friendly labels for the common {{phaseId.suffix}} tokens. Used by
 * humanizePreview() to translate raw template syntax into chips a non-coder
 * can scan ("Multiple Choice — bar chart" instead of "{{ask.barChart}}").
 */
var PRIMARY_TOKEN_SUFFIXES = {
  'barChart':  { icon: '', text: 'bar chart' },
  'chart':     { icon: '', text: 'bar chart' },
  'pieChart':  { icon: '', text: 'pie chart' },
  'list':      { icon: '', text: 'list of answers' },
  'result':    { icon: '', text: 'AI result' },
  'scores':    { icon: '', text: 'scores' },
  'tally':     { icon: '', text: 'vote counts' },
  'assigned':  { icon: '', text: 'each player\'s assigned item' },
  'mine':      { icon: '', text: 'each player\'s own answer' },
  'text':      { icon: '', text: 'submitted text' },
  'choice':    { icon: '', text: 'chosen answer' },
  'message':   { icon: '', text: 'message' }
};

/**
 * Returns a teacher-readable label for a step based on its actual content
 * (the prompt / message / instruction it carries). Used when humanizing a
 * data-ref so the reader can tell WHICH step is meant in a game with
 * several of the same type. Falls back to the friendly type name when the
 * step has no primary content yet (e.g. just-added blank step).
 *
 * Examples for a collect-choice with prompt "What is the capital of Australia?":
 *   phaseContentLabel(id)  ->  "'What is the capital of Australia?'"
 *   phaseRefLabel(id, true) ->  "🔘 Multiple Choice"  (used as fallback)
 */
function phaseContentLabel(phaseId) {
  var phase = gameConfig.phases && gameConfig.phases[phaseId];
  if (!phase) return phaseId;
  var content = phase.prompt || phase.message || phase.instruction || phase.content;
  if (typeof content === 'string' && content.trim()) {
    // {{tokens}} are code — never let them leak into a friendly label
    var trimmed = content.replace(/\{\{[^}]*\}\}/g, '…').trim().replace(/\s+/g, ' ');
    if (trimmed.length > 36) trimmed = trimmed.slice(0, 33) + '…';
    if (!trimmed.replace(/[….\s]/g, '')) return phaseRefLabel(phaseId, true);
    return "'" + trimmed + "'";
  }
  return phaseRefLabel(phaseId, true);
}

/**
 * Plain-text humanizer for a single bare data-ref like "ask.scores" or
 * "trivia.result.truth". Used by canvas primary summaries on phases that
 * point at upstream data (leaderboard, winner, foreach, reveal-one).
 * Returns text suitable for textContent — no HTML.
 *
 * Format: "<suffix-text> from <content-label>" so the reader sees both
 * what kind of data and which specific upstream step it comes from.
 *
 *   "ask.scores"            -> "scores from 'What is the capital of...'"
 *   "vote.barChart"         -> "bar chart from 'Pick your favorite'"
 *   "trivia.result.truth"   -> "result / truth from 'Generate a trivia...'"
 *
 * Falls back to the raw ref when the phase doesn't exist (e.g. typo).
 */
function humanizeRef(ref) {
  if (!ref || typeof ref !== 'string') return ref || '';
  var parts = ref.split('.');
  var phaseId = parts[0];
  if (!gameConfig.phases || !gameConfig.phases[phaseId]) return ref;
  var label = phaseContentLabel(phaseId);
  if (parts.length === 1) return label;
  var suffix = parts[parts.length - 1];
  var meta = PRIMARY_TOKEN_SUFFIXES[suffix];
  if (meta) return meta.text + ' from ' + label;
  // Nested / unknown path — show the inner segments before "from"
  return parts.slice(1).join(' / ') + ' from ' + label;
}

/**
 * Replace `{{phaseId.suffix}}` tokens in a string with a friendly chip span
 * that says what the player/host will actually see. Non-token text is
 * HTML-escaped first so user typing can't inject markup.
 *
 * Examples:
 *   "{{ask.barChart}}"            -> [📊 Multiple Choice — bar chart]
 *   "{{trivia.result.truth}}"     -> [🤖 AI Does Something / truth]
 *   "Hi {{prompts.assigned}}"     -> "Hi [👤 AI Does Something — assigned item]"
 */
// Build a deletable chip DOM node for one {{token}} in the preview row.
function buildTokenChip(fullToken, ref, input) {
  var parts = ref.split('.');
  var phaseId = parts[0];
  var label = (gameConfig.phases && gameConfig.phases[phaseId])
    ? phaseContentLabel(phaseId) : phaseId;
  var suffix = parts.length > 1 ? parts[parts.length - 1] : null;
  var meta = suffix ? PRIMARY_TOKEN_SUFFIXES[suffix] : null;
  var chipText;
  if (meta) {
    chipText = (meta.icon ? meta.icon + ' ' : '') + meta.text + ' from ' + label;
  } else if (parts.length > 1) {
    chipText = parts.slice(1).join(' / ') + ' from ' + label;
  } else {
    chipText = label;
  }
  var chip = document.createElement('span');
  chip.className = 'primary-token-chip';
  chip.appendChild(document.createTextNode(chipText));
  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'primary-token-chip-delete';
  del.setAttribute('aria-label', 'Remove');
  del.textContent = '×';
  del.addEventListener('click', function (e) {
    e.stopPropagation();
    input.value = input.value.replace(fullToken, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  chip.appendChild(del);
  return chip;
}

// Rebuild the preview row as DOM nodes so chips are deletable.
function refreshTokenPreview(preview, input) {
  preview.innerHTML = '';
  var text = input.value;
  var tokenRe = /\{\{\s*([a-zA-Z0-9_\-]+(?:\.[a-zA-Z0-9_\-]+)*)\s*\}\}/g;
  if (!tokenRe.test(text)) { preview.style.display = 'none'; return; }
  preview.style.display = '';
  var lbl = document.createElement('span');
  lbl.className = 'primary-preview-label';
  lbl.textContent = 'Will show: ';
  preview.appendChild(lbl);
  tokenRe.lastIndex = 0;
  var lastIdx = 0;
  var match;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      preview.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    preview.appendChild(buildTokenChip(match[0], match[1], input));
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    preview.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

/**
 * For each phase type, returns the list of friendly "things you can insert"
 * that downstream steps can reference. Each entry is { icon, label, token }
 * where token is the raw {{...}} string that gets inserted at the cursor.
 *
 * Conditional refs (e.g. .assigned only when rotateFrom/pairwise is set, or
 * .scores only when correctAnswer is set) are gated so the picker stays
 * truthful — only refs that will actually resolve at runtime are offered.
 */
function getInsertableRefs(sourceId, source) {
  var refs = [];
  var t = source.type;
  if (t === 'collect') {
    refs.push({ icon: '', label: 'List of submitted answers', token: '{{' + sourceId + '.list}}' });
    refs.push({ icon: '', label: 'Raw answers (for AI input)', token: '{{' + sourceId + '.responses}}' });
    if (source.rotateFrom || source.assign === 'pairwise') {
      refs.push({ icon: '', label: "Each player's assigned item", token: '{{' + sourceId + '.assigned}}' });
    }
  } else if (t === 'collect-choice') {
    refs.push({ icon: '', label: 'Bar chart of class picks', token: '{{' + sourceId + '.barChart}}' });
    refs.push({ icon: '', label: 'Vote counts (raw)', token: '{{' + sourceId + '.tally}}' });
    if (source.correctAnswer) {
      refs.push({ icon: '', label: 'Scores (graded)', token: '{{' + sourceId + '.scores}}' });
      refs.push({ icon: '', label: 'The correct answer', token: '{{' + sourceId + '.correctAnswer}}' });
    }
  } else if (t === 'ai-process') {
    refs.push({ icon: '', label: 'AI output', token: '{{' + sourceId + '.result}}' });
    if (source.perPlayer) {
      refs.push({ icon: '', label: "Each player's own AI item", token: '{{' + sourceId + '.mine}}' });
    }
    if (source.format === 'json') {
      refs.push({ icon: '', label: 'A specific JSON field (type the field name)', token: '{{' + sourceId + '.result.}}' });
    }
  } else if (t === 'vote') {
    refs.push({ icon: '', label: 'Bar chart of votes', token: '{{' + sourceId + '.barChart}}' });
    refs.push({ icon: '', label: 'Vote scores', token: '{{' + sourceId + '.scores}}' });
  } else if (t === 'rate') {
    refs.push({ icon: '', label: 'Bar chart of averages', token: '{{' + sourceId + '.barChart}}' });
  } else if (t === 'foreach') {
    refs.push({ icon: '', label: 'Round-by-round scores', token: '{{' + sourceId + '.scores}}' });
  } else if (t === 'rank') {
    refs.push({ icon: '', label: 'Ranked list', token: '{{' + sourceId + '.rankedList}}' });
  } else if (t === 'match') {
    refs.push({ icon: '', label: 'Pair-by-pair results', token: '{{' + sourceId + '.resultsList}}' });
    refs.push({ icon: '', label: 'Match scores', token: '{{' + sourceId + '.scores}}' });
  } else if (t === 'sort') {
    refs.push({ icon: '', label: 'Item-by-item results', token: '{{' + sourceId + '.resultsList}}' });
    refs.push({ icon: '', label: 'Sort scores', token: '{{' + sourceId + '.scores}}' });
  }
  return refs;
}

function insertTokenAtCursor(input, token) {
  var start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
  var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
  var before = input.value.slice(0, start);
  var after = input.value.slice(end);
  input.value = before + token + after;
  input.focus();
  var newPos = before.length + token.length;
  try { input.setSelectionRange(newPos, newPos); } catch (_) {}
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function openInsertMenu(input, phaseId, anchor) {
  // Close any existing menu
  var existing = document.querySelector('.primary-insert-menu');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.className = 'primary-insert-menu';
  menu.addEventListener('click', function (e) { e.stopPropagation(); });

  // Find upstream phases — anything before this one in the linear flow.
  var order = buildPhaseOrder();
  var idx = order.indexOf(phaseId);
  var upstream = idx > 0 ? order.slice(0, idx) : [];

  var groupCount = 0;
  for (var i = 0; i < upstream.length; i++) {
    var sourceId = upstream[i];
    var source = gameConfig.phases[sourceId];
    if (!source) continue;
    var refs = getInsertableRefs(sourceId, source);
    if (refs.length === 0) continue;

    var group = document.createElement('div');
    group.className = 'primary-insert-group';
    var head = document.createElement('div');
    head.className = 'primary-insert-group-head';
    head.textContent = phaseRefLabel(sourceId, true);
    group.appendChild(head);

    for (var j = 0; j < refs.length; j++) {
      (function (ref) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'primary-insert-item';
        var iconEl = document.createElement('span');
        iconEl.className = 'primary-insert-icon';
        iconEl.textContent = ref.icon;
        var labelEl = document.createElement('span');
        labelEl.className = 'primary-insert-label';
        labelEl.textContent = ref.label;
        item.appendChild(iconEl);
        item.appendChild(labelEl);
        item.addEventListener('click', function () {
          // Tokenized inputs get the friendly [label]; raw inputs the {{ref}}
          var toInsert = input._getVars ? tokenize(ref.token, input._getVars()) : ref.token;
          insertTokenAtCursor(input, toInsert);
          menu.remove();
        });
        group.appendChild(item);
      })(refs[j]);
    }
    menu.appendChild(group);
    groupCount++;
  }

  if (groupCount === 0) {
    var empty = document.createElement('div');
    empty.className = 'primary-insert-empty';
    empty.textContent = 'No earlier steps produce content you can reference yet. Add a step like Multiple choice, Open answer, or AI transforms answers first.';
    menu.appendChild(empty);
  }

  // Position below the anchor button
  var rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = Math.min(rect.left, window.innerWidth - 360) + 'px';
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.zIndex = '10000';
  document.body.appendChild(menu);

  // Click outside closes the menu
  setTimeout(function () {
    document.addEventListener('click', function closer(e) {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.remove();
        document.removeEventListener('click', closer);
      }
    });
  }, 0);
}

/**
 * Append the primary field UI to a phase box. For textarea/text inputs,
 * editing updates phase[key] and marks the config dirty. Clicks on the
 * input itself don't trigger box selection — only clicks on chrome do.
 * When the value contains {{tokens}}, a live "Will show:" preview line
 * appears above the textarea translating the tokens into friendly chips.
 * An "+ Insert" button below the textarea lets non-coders add references
 * to earlier steps without typing the {{}} syntax.
 */
function appendPrimaryField(box, phase, phaseId) {
  var prim = getPrimaryFieldDef(phase.type);
  if (!prim) return;

  var wrap = document.createElement('div');
  wrap.className = 'phase-box-primary';

  if (prim.type === 'textarea' || prim.type === 'text') {
    var input = document.createElement(prim.type === 'textarea' ? 'textarea' : 'input');
    if (prim.type === 'text') input.type = 'text';
    input.className = 'phase-box-primary-input';
    input.placeholder = prim.placeholder || '';
    // Friendly-token display: stored {{refs}} render as [labels] in the box;
    // detokenized back to raw refs on every input (same round-trip the
    // sidebar template fields use). Tokens outside the known vocabulary
    // stay raw and are translated by the "Will show:" preview row instead.
    input._getVars = function () { return buildTemplateVariables(phaseId); };
    input.value = tokenize(phase[prim.key] || '', input._getVars());

    // Auto-resize: grows to fit content, capped at 1/3 viewport height.
    var autoResize = null;
    if (prim.type === 'textarea') {
      input.style.overflowY = 'auto';
      autoResize = function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, Math.floor(window.innerHeight / 3)) + 'px';
      };
      setTimeout(autoResize, 0);
    }

    // Don't select the box when interacting with the input
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    // Live preview row with deletable {{token}} chips
    var preview = document.createElement('div');
    preview.className = 'phase-box-primary-preview';
    preview.style.display = 'none';
    refreshTokenPreview(preview, input);

    input.addEventListener('input', function () {
      isDirty = true;
      phase[prim.key] = detokenize(input.value, input._getVars());
      refreshTokenPreview(preview, input);
      if (autoResize) autoResize();
    });

    wrap.appendChild(preview);
    wrap.appendChild(input);

    // "+ Insert from earlier step" — only shown when at least one upstream
    // phase actually has something insertable.
    if (prim.type === 'textarea') {
      var order = buildPhaseOrder();
      var phaseIdx = order.indexOf(phaseId);
      var upstream = phaseIdx > 0 ? order.slice(0, phaseIdx) : [];
      var hasInsertable = upstream.some(function (sid) {
        var s = gameConfig.phases[sid];
        return s && getInsertableRefs(sid, s).length > 0;
      });
      if (hasInsertable) {
        var insertRow = document.createElement('div');
        insertRow.className = 'primary-insert-row';
        var insertBtn = document.createElement('button');
        insertBtn.type = 'button';
        insertBtn.className = 'primary-insert-btn';
        insertBtn.textContent = '+ Insert from earlier step';
        insertBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openInsertMenu(input, phaseId, insertBtn);
        });
        insertRow.appendChild(insertBtn);
        wrap.appendChild(insertRow);
      }
    }
  } else if (prim.type === 'summary') {
    var summary = document.createElement('div');
    summary.className = 'phase-box-primary-summary';
    summary.textContent = prim.summarize(phase);
    wrap.appendChild(summary);
  }

  box.appendChild(wrap);
}

function attachFormToSelectedBox() {
  if (!selectedPhaseId) return;
  var box = phaseList.querySelector('.phase-box.selected');
  if (!box) return;
  // Wrap the form in an "inline settings" container for clearer
  // visual separation from the box's header.
  var inlineWrap = document.createElement('div');
  inlineWrap.className = 'phase-box-inline-form';
  inlineWrap.appendChild(phaseConfigForm);
  var preview = document.getElementById('live-preview-section');
  if (preview) inlineWrap.appendChild(preview);

  // Add a Done/collapse button at the bottom \u2014 replaces the right
  // panel's close X which is no longer visible.
  var doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'phase-box-done-btn';
  doneBtn.textContent = '\u2713 Done editing';
  doneBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    deselectPhase();
  });
  inlineWrap.appendChild(doneBtn);

  box.appendChild(inlineWrap);
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
  // Clicks inside the inline-attached form (inputs, buttons, etc.) shouldn't
  // re-trigger selectPhase — the phase is already selected, and rebuilding the
  // form would destroy the user's focus/cursor mid-edit.
  if (e.target.closest && e.target.closest('.phase-box-inline-form')) return;
  var box = e.currentTarget;
  var phaseId = box.getAttribute('data-phase-id');
  selectPhase(phaseId);
}

// --- Phase selection ---
function selectPhase(phaseId) {
  // Switching to a different phase — flush pending edits on the old one first.
  if (selectedPhaseId && selectedPhaseId !== phaseId) {
    autoSaveIfDirty(); // fire-and-forget; safe because we're about to re-render anyway
  }
  selectedPhaseId = phaseId;
  phasePanel.classList.remove('hidden');
  renderCanvas();
  renderPhaseConfig(phaseId);
}

async function deselectPhase() {
  await autoSaveIfDirty();
  selectedPhaseId = null;
  phasePanel.classList.add('hidden');
  var previewSection = document.getElementById('live-preview-section');
  if (previewSection) previewSection.classList.add('hidden');
  renderCanvas();
}

// Quietly PUT the current config to the server when the user has unsaved
// changes. Called when collapsing a phase or switching between phases, so
// teachers don't have to scroll to the Save button.
//
// - Skips entirely if !isDirty (nothing to save) or !gameId (brand-new game
//   that still needs an ID prompt — leave that to the explicit Save button).
// - Surfaces validation errors via the validation panel but does NOT block
//   the deselect — the panel stays visible so the user can fix.
async function autoSaveIfDirty() {
  if (!isDirty || !gameId) return;
  var validation = validateConfig();
  if (validation.errors.length > 0) {
    showValidationPanel(validation.errors, validation.warnings);
    return; // leave isDirty=true; manual Save or next deselect will retry
  }
  try {
    var resp = await fetch('/api/games/' + encodeURIComponent(gameId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameConfig)
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function () { return {}; });
      console.warn('[autosave] save failed:', err.error || resp.statusText);
      return;
    }
    isDirty = false;
    validationPanel.hidden = true;
    runLightReview(); // async, non-blocking
  } catch (err) {
    console.warn('[autosave] error:', err.message);
  }
}

// --- Phase config panel ---

// Render AI suggestions for this phase (or a "looks good" note if none).
// Pinned near the top so the teacher sees advice before editing other fields.
function renderAISuggestions(phaseId) {
  var issues = aiIssues[phaseId] || [];

  if (issues.length === 0) {
    // Only confirm "looks good" once a review has actually run. Before that,
    // lastReviewResult is null and a green check would imply a check happened
    // when it didn't \u2014 so render nothing.
    if (lastReviewResult) {
      var ok = document.createElement('div');
      ok.className = 'ai-suggestion-ok';
      ok.textContent = '\u2713 This step looks good';
      phaseConfigForm.appendChild(ok);
    }
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

  // No phase-name header here. The form renders inline inside the selected
  // phase box, whose own header already shows the icon + friendly name —
  // repeating it printed the title twice in a row on every step.

  // (No screen-summary line here. The canvas box description + the inline
  // "Show Preview" toggle already convey what host/players see, so the
  // "Host: … · Players: …" caption was redundant.)

  // AI Suggestions — pinned near the top so the teacher sees advice before editing
  renderAISuggestions(phaseId);

  // (Live "Show Preview" toggle lives at the bottom of the inline form;
  // the old per-step preview modal was redundant with it and was removed.
  // Ask AI is a meta action and sits at the bottom near Delete.)

  // --- Type-specific fields grouped into sections ---
  var type = phase.type;

  if (type === 'lobby') {
    addFieldWithHelp('Min players to start', 'Game won\'t start until this many join', 'number', 'phase-minPlayers', phase.minPlayers, false, function (value) {
      phase.minPlayers = value;
    });
  }

  if (type === 'collect') {
    var collectPromptTA = addTextAreaWithHelp('Question to ask', 'This appears on every player\'s screen', 'phase-prompt', phase.prompt, 'e.g. What did you do this weekend?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addExampleChips(collectPromptTA, [
      'What did you do this weekend?',
      'What\'s one word that describes how you feel today?',
      'What\'s one thing you learned this week?'
    ]);
    addSelectWithHelp('Students answer with', 'A drawing pad replaces the text box. Drawings show in reveal galleries and pass through rotation chains. AI steps can\'t read them.', 'phase-inputType',
      [
        { value: 'text', label: 'Text' },
        { value: 'drawing', label: 'A drawing' }
      ],
      phase.inputType === 'drawing' ? 'drawing' : 'text', function (value) {
        isDirty = true;
        if (value === 'drawing') { phase.inputType = 'drawing'; } else { delete phase.inputType; }
        renderCanvas();
      });
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

    // Pairing & privacy — the connection-game toolkit (Closer-style):
    // pair students up, let them pass, hide answers until everyone's done.
    var pairingActive = phase.assign === 'pairwise' || phase.passAllowed || phase.simultaneousReveal;
    var pairingHandle = beginCollapsible('player', 'Pairing & privacy', phaseId + ':pairing', !!pairingActive);

    // Build the pairing-mode options: random, or tied to an earlier paired step
    var pairingValue = 'none';
    if (phase.assign === 'pairwise') {
      if (phase.reusePairsFrom) pairingValue = 'reuse:' + phase.reusePairsFrom;
      else if (phase.rotatePairsFrom) pairingValue = 'rotate:' + phase.rotatePairsFrom;
      else pairingValue = 'random';
    }
    var pairingOptions = [
      { value: 'none', label: 'No pairing, everyone answers solo' },
      { value: 'random', label: 'Pair players up (random pairs)' }
    ];
    var collectOrder = buildPhaseOrder();
    var collectIdx = collectOrder.indexOf(phaseId);
    for (var poi = 0; poi < collectOrder.length; poi++) {
      if (collectIdx !== -1 && poi >= collectIdx) break;
      var poPhase = gameConfig.phases[collectOrder[poi]];
      if (poPhase && poPhase.type === 'collect' && poPhase.assign === 'pairwise') {
        var poLabel = phaseRefLabel(collectOrder[poi], false);
        pairingOptions.push({ value: 'reuse:' + collectOrder[poi], label: 'Same partners as "' + poLabel + '"' });
        pairingOptions.push({ value: 'rotate:' + collectOrder[poi], label: 'New partners (different from "' + poLabel + '")' });
      }
    }

    addSelectWithHelp('Pair players up', 'Pairs answer privately and can see each other\'s answers in a later "Show Each Pair" step. Chain steps with "Same partners" (one conversation, several questions) or "New partners" (mix the class up).', 'phase-pairing', pairingOptions, pairingValue, function (value) {
      isDirty = true;
      delete phase.reusePairsFrom;
      delete phase.rotatePairsFrom;
      if (value === 'none') {
        delete phase.assign;
        delete phase.oddHandling;
      } else {
        phase.assign = 'pairwise';
        // Connection-style default: nobody sits out with an odd class
        if (!phase.oddHandling) phase.oddHandling = 'triple';
        if (value.indexOf('reuse:') === 0) phase.reusePairsFrom = value.slice(6);
        if (value.indexOf('rotate:') === 0) phase.rotatePairsFrom = value.slice(7);
      }
      renderCanvas();
      renderPhaseConfig(phaseId);
    });

    if (phase.assign === 'pairwise') {
      addSelectWithHelp('Odd number of players', 'What happens when someone can\'t be paired', 'phase-oddHandling',
        [
          { value: 'triple', label: 'Make one group of 3, nobody sits out' },
          { value: 'sit-out', label: 'Last player sits out this round' }
        ],
        phase.oddHandling === 'sit-out' ? 'sit-out' : 'triple', function (value) {
          isDirty = true;
          if (value === 'sit-out') { delete phase.oddHandling; } else { phase.oddHandling = 'triple'; }
        });
    }

    addSelectWithHelp('Allow passing', 'Adds a Pass button. A pass counts like an answer (the step can finish) and is never shown to anyone.', 'phase-passAllowed',
      [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes, students can pass quietly' }
      ],
      phase.passAllowed ? 'yes' : 'no', function (value) {
        isDirty = true;
        if (value === 'yes') { phase.passAllowed = true; } else { delete phase.passAllowed; }
      });

    addSelectWithHelp('Hide answers until everyone is done', 'The projected counter shows numbers only, no names, until the step closes. You still see everything on your Teacher view.', 'phase-simultaneousReveal',
      [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes, reveal all at once' }
      ],
      phase.simultaneousReveal ? 'yes' : 'no', function (value) {
        isDirty = true;
        if (value === 'yes') { phase.simultaneousReveal = true; } else { delete phase.simultaneousReveal; }
      });

    endCollapsible(pairingHandle);

    addSelectWithHelp('Who answers', 'Which players can submit answers', 'phase-from',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'remaining', label: 'Remaining players only' },
        { value: 'eliminated', label: 'Eliminated players only' }
      ],
      phase.from || 'all', function (value) {
        if (value === 'all') { delete phase.from; } else { phase.from = value; }
      }
    );
    addImageUploadWidget(phase, phaseId);
    addVideoUrlField(phase);
  }

  if (type === 'ai-process') {
    // Primary field first: what to ask the AI to do.
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

    var taskOptions = [];
    var taskTypes = Object.keys(AI_TASK_CATALOG);
    for (var t = 0; t < taskTypes.length; t++) {
      var key = taskTypes[t];
      taskOptions.push({ value: key, label: AI_TASK_CATALOG[key].friendlyName });
    }
    addSelectWithHelp('AI task', AI_TASK_CATALOG[phase.task || 'summarize'] ? AI_TASK_CATALOG[phase.task || 'summarize'].description : '', 'phase-task', taskOptions, phase.task || 'summarize', function (value) {
      phase.task = value;
      renderCanvas();
      renderPhaseConfig(phaseId);
    });

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
    // Question first — that's the actual prompt players see.
    addFieldWithHelp('Question', 'Shown above the voting choices', 'text', 'phase-question', phase.question, false, function (value) {
      phase.question = value;
    });

    var voteIsOwnList = Array.isArray(phase.candidates);
    addSelectWithHelp('Choices come from', 'Pull the choices from an earlier step, or write your own fixed list (fixed lists can branch what happens next by winner)', 'phase-vote-source',
      [
        { value: 'step', label: 'An earlier step (answers, AI output)' },
        { value: 'own', label: 'My own list. I\'ll type the options' }
      ],
      voteIsOwnList ? 'own' : 'step', function (value) {
        isDirty = true;
        if (value === 'own') {
          phase.candidates = ['Option A', 'Option B'];
        } else {
          phase.candidates = '';
          delete phase.nextByWinner; // branching needs a fixed list
        }
        renderPhaseConfig(phaseId);
        renderCanvas();
      });

    if (voteIsOwnList) {
      // Per-option row: text + optional "if this wins, go to" branch + remove.
      var phaseOrderForBranch = buildPhaseOrder();
      var voteOptsArr = phase.candidates;
      for (var voi = 0; voi < voteOptsArr.length; voi++) {
        (function (index) {
          var optGroup = document.createElement('div');
          optGroup.className = 'form-group vote-option-row';

          var rowTop = document.createElement('div');
          rowTop.style.display = 'flex';
          rowTop.style.gap = '6px';

          var optInput = document.createElement('input');
          optInput.type = 'text';
          optInput.value = voteOptsArr[index];
          optInput.placeholder = 'Option ' + (index + 1);
          optInput.style.flex = '1';
          optInput.addEventListener('input', function () {
            isDirty = true;
            // Keep the branch map keyed by the option's current text
            var oldText = phase.candidates[index];
            phase.candidates[index] = optInput.value;
            if (phase.nextByWinner && Object.prototype.hasOwnProperty.call(phase.nextByWinner, oldText)) {
              phase.nextByWinner[optInput.value] = phase.nextByWinner[oldText];
              delete phase.nextByWinner[oldText];
            }
          });

          var removeBtn = document.createElement('button');
          removeBtn.className = 'btn-icon';
          removeBtn.textContent = '✖';
          removeBtn.title = 'Remove option';
          removeBtn.addEventListener('click', function () {
            isDirty = true;
            var removed = phase.candidates.splice(index, 1)[0];
            if (phase.nextByWinner) {
              delete phase.nextByWinner[removed];
              if (Object.keys(phase.nextByWinner).length === 0) delete phase.nextByWinner;
            }
            renderPhaseConfig(phaseId);
          });

          rowTop.appendChild(optInput);
          rowTop.appendChild(removeBtn);
          optGroup.appendChild(rowTop);

          // Branch select: where the game goes if this option wins
          var branchRow = document.createElement('div');
          branchRow.style.display = 'flex';
          branchRow.style.alignItems = 'center';
          branchRow.style.gap = '6px';
          branchRow.style.marginTop = '4px';

          var branchLabel = document.createElement('span');
          branchLabel.className = 'field-help';
          branchLabel.style.whiteSpace = 'nowrap';
          branchLabel.textContent = 'If this wins →';
          branchRow.appendChild(branchLabel);

          var branchSel = document.createElement('select');
          branchSel.style.flex = '1';
          var defOpt = document.createElement('option');
          defOpt.value = '';
          defOpt.textContent = '(the normal next step)';
          branchSel.appendChild(defOpt);
          for (var bo = 0; bo < phaseOrderForBranch.length; bo++) {
            var pid = phaseOrderForBranch[bo];
            if (pid === phaseId) continue;
            var o = document.createElement('option');
            o.value = pid;
            o.textContent = 'step ' + (bo + 1) + '. ' + phaseRefLabel(pid, false);
            branchSel.appendChild(o);
          }
          var curText = voteOptsArr[index];
          branchSel.value = (phase.nextByWinner && phase.nextByWinner[curText]) || '';
          branchSel.addEventListener('change', function () {
            isDirty = true;
            var optText = phase.candidates[index];
            if (branchSel.value) {
              if (!phase.nextByWinner) phase.nextByWinner = {};
              phase.nextByWinner[optText] = branchSel.value;
            } else if (phase.nextByWinner) {
              delete phase.nextByWinner[optText];
              if (Object.keys(phase.nextByWinner).length === 0) delete phase.nextByWinner;
            }
            renderCanvas();
          });
          branchRow.appendChild(branchSel);
          optGroup.appendChild(branchRow);

          phaseConfigForm.appendChild(optGroup);
        })(voi);
      }

      var addVoteOptBtn = document.createElement('button');
      addVoteOptBtn.className = 'btn-secondary';
      addVoteOptBtn.textContent = '+ Add Option';
      addVoteOptBtn.style.marginBottom = '12px';
      addVoteOptBtn.addEventListener('click', function () {
        isDirty = true;
        if (!Array.isArray(phase.candidates)) phase.candidates = [];
        phase.candidates.push('');
        renderPhaseConfig(phaseId);
      });
      phaseConfigForm.appendChild(addVoteOptBtn);
    } else {
      addDataRefDropdown('Candidates from', 'Where to get the list of choices', 'phase-candidates', phaseId, phase.candidates, function (value) {
        phase.candidates = value;
      });
    }

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
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Random vote on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
    addSelectWithHelp('Who votes', 'Which players can vote', 'phase-voters',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'remaining', label: 'Remaining players only' },
        { value: 'eliminated', label: 'Eliminated players only' }
      ],
      phase.voters || 'all', function (value) {
        if (value === 'all') { delete phase.voters; } else { phase.voters = value; }
      }
    );
  }

  if (type === 'eliminate') {
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
    addDataRefDropdown('Scores from', 'Where to read player scores for elimination', 'phase-input', phaseId, phase.input, function (value) {
      phase.input = value;
    });
  }

  if (type === 'announce') {
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
    addImageUploadWidget(phase, phaseId);
    addVideoUrlField(phase);
  }

  if (type === 'collect-choice') {
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
    addSelectWithHelp('Who answers', 'Which players can submit answers', 'phase-from',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'remaining', label: 'Remaining players only' },
        { value: 'eliminated', label: 'Eliminated players only' }
      ],
      phase.from || 'all', function (value) {
        if (value === 'all') { delete phase.from; } else { phase.from = value; }
      }
    );

    // --- Speed-bonus quiz scoring (Kahoot-style) ---
    var hasCorrect = phase.correctAnswer !== undefined && phase.correctAnswer !== '';
    var scoreHandle = beginCollapsible('ai', 'Score this question (quiz mode)', phaseId + ':scoring', hasCorrect);
    addFieldWithHelp(
      'Correct answer',
      'The choice that earns points. Leave empty for a non-graded poll. Plain text or a {{ref}} (e.g. {{trivia.result.truth}}).',
      'text', 'phase-correctAnswer', phase.correctAnswer || '', false,
      function (value) {
        if (value) phase.correctAnswer = value;
        else delete phase.correctAnswer;
      }
    );
    addFieldWithHelp(
      'Max points',
      'Points awarded for an instant correct answer. Default 1000.',
      'number', 'phase-pointsCorrect', phase.pointsCorrect != null ? phase.pointsCorrect : '', false,
      function (value) {
        if (value === '' || value == null) delete phase.pointsCorrect;
        else phase.pointsCorrect = parseInt(value, 10);
      }
    );
    // Speed-bonus checkbox
    var spLabel = document.createElement('label');
    spLabel.className = 'form-group';
    spLabel.style.display = 'flex';
    spLabel.style.alignItems = 'flex-start';
    spLabel.style.gap = '8px';
    spLabel.style.cursor = 'pointer';
    var spCb = document.createElement('input');
    spCb.type = 'checkbox';
    spCb.style.marginTop = '4px';
    spCb.checked = phase.speedBonus !== false; // default true
    spCb.addEventListener('change', function () {
      isDirty = true;
      if (spCb.checked) delete phase.speedBonus; // true is default — keep config clean
      else phase.speedBonus = false;
    });
    var spText = document.createElement('div');
    spText.innerHTML = '<strong>Faster answers earn more</strong><div style="font-size:12px;color:#666;margin-top:2px;">Kahoot-style: 100% at instant, dropping to 50% at the timer expiry. Requires a time limit above. Off = flat points for any correct answer.</div>';
    spLabel.appendChild(spCb);
    spLabel.appendChild(spText);
    phaseConfigForm.appendChild(spLabel);
    endCollapsible(scoreHandle);

    addImageUploadWidget(phase, phaseId);
    addVideoUrlField(phase);
  }

  if (type === 'buzz') {
    addTextAreaWithHelp('On-screen prompt', 'Shown above the buzzer. The actual questions are usually asked out loud.', 'phase-prompt', phase.prompt, 'e.g. Listen for the question, then BUZZ!', function (value) {
      if (value) { phase.prompt = value; } else { delete phase.prompt; }
      renderCanvas();
    });
    addFieldWithHelp('Points per correct answer', 'Default 10. Scores feed a later Leaderboard or Crown a Winner step.', 'number', 'phase-points', phase.points, false, function (value) {
      if (value == null || value === '') delete phase.points;
      else phase.points = value;
    });
    var loLabel = document.createElement('label');
    loLabel.className = 'form-group';
    loLabel.style.display = 'flex';
    loLabel.style.alignItems = 'flex-start';
    loLabel.style.gap = '8px';
    loLabel.style.cursor = 'pointer';
    var loCb = document.createElement('input');
    loCb.type = 'checkbox';
    loCb.style.marginTop = '4px';
    loCb.checked = phase.lockoutOnWrong !== false; // default true
    loCb.addEventListener('change', function () {
      isDirty = true;
      if (loCb.checked) delete phase.lockoutOnWrong; // true is default — keep config clean
      else phase.lockoutOnWrong = false;
    });
    var loText = document.createElement('div');
    loText.innerHTML = '<strong>Lock out wrong answers</strong><div style="font-size:12px;color:#666;margin-top:2px;">A wrong answer locks that player out until the next question, stops buzz-spamming.</div>';
    loLabel.appendChild(loCb);
    loLabel.appendChild(loText);
    phaseConfigForm.appendChild(loLabel);
  }

  if (type === 'estimate') {
    addTextAreaWithHelp('The question', 'A question with a numeric answer.', 'phase-prompt', phase.prompt, 'e.g. How many liters of water does a cow drink in a day?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });
    addFieldWithHelp('The answer (optional)', 'The true value (decimals ok). Leave empty for poll-the-room mode, no scoring, just the class distribution.', 'text', 'phase-answer', phase.answer, false, function (value) {
      var n = parseFloat(value);
      if (value == null || value === '' || !isFinite(n)) delete phase.answer;
      else phase.answer = n;
    });
    addFieldWithHelp('Unit (optional)', 'Shown next to the input and the answer, e.g. "liters".', 'text', 'phase-unit', phase.unit, false, function (value) {
      if (value) { phase.unit = value; } else { delete phase.unit; }
    });
    addFieldWithHelp('Points for the closest guess', 'Default 10.', 'number', 'phase-est-points', phase.points, false, function (value) {
      if (value == null || value === '') delete phase.points;
      else phase.points = value;
    });
    addSelectWithHelp('Scoring', 'closest: the closest guess takes all the points. graduated: points fall off by closeness rank, everyone earns something.', 'phase-scoring', [
      { value: 'closest', label: 'Closest guess takes all' },
      { value: 'graduated', label: 'Graduated, points by closeness rank' }
    ], phase.scoring || 'closest', function (value) {
      if (value === 'closest') delete phase.scoring; // default — keep config clean
      else phase.scoring = value;
    });
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit, you close guessing manually.', 'number', 'phase-timer', phase.timer, false, function (value) {
      if (value == null || value === '') delete phase.timer;
      else phase.timer = value;
    });
    addImageUploadWidget(phase, phaseId);
  }

  if (type === 'ai-eliminate') {
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
    // Audience: the whole class, or each pair privately (Closer-style).
    addSelectWithHelp('Who sees it', 'Everyone = the class and the projector see the same thing. Each pair privately = every pair sees only its own two answers (needs an earlier "Open answer" step with pairing turned on).', 'phase-scope',
      [
        { value: 'all', label: 'Everyone' },
        { value: 'pair', label: 'Each pair privately' }
      ],
      phase.scope === 'pair' ? 'pair' : 'all', function (value) {
        isDirty = true;
        if (value === 'pair') {
          phase.scope = 'pair';
        } else {
          delete phase.scope;
          delete phase.pairsFrom;
        }
        renderCanvas();
        renderPhaseConfig(phaseId);
      });

    if (phase.scope === 'pair') {
      // Source: only paired Ask steps that run before this reveal qualify
      var pairSourceOptions = [];
      var revealOrder = buildPhaseOrder();
      var revealIdx = revealOrder.indexOf(phaseId);
      for (var psi = 0; psi < revealOrder.length; psi++) {
        if (revealIdx !== -1 && psi >= revealIdx) break;
        var psPhase = gameConfig.phases[revealOrder[psi]];
        if (psPhase && psPhase.type === 'collect' && psPhase.assign === 'pairwise') {
          pairSourceOptions.push({ value: revealOrder[psi], label: phaseRefLabel(revealOrder[psi], false) });
        }
      }
      if (pairSourceOptions.length === 0) {
        var noPairsMsg = document.createElement('p');
        noPairsMsg.className = 'field-help';
        noPairsMsg.style.color = '#C62828';
        noPairsMsg.textContent = 'No paired step found before this one. Add an "Open answer" step earlier and turn on "Pair players up" in its Pairing & privacy section, that\'s where the pairs and their answers come from.';
        phaseConfigForm.appendChild(noPairsMsg);
      } else {
        // Default to the nearest paired step before this reveal
        if (!phase.pairsFrom || !gameConfig.phases[phase.pairsFrom]) {
          phase.pairsFrom = pairSourceOptions[pairSourceOptions.length - 1].value;
          isDirty = true;
        }
        addSelectWithHelp('Pairs & answers from', 'The paired Ask step whose answers each pair will see', 'phase-pairsFrom', pairSourceOptions, phase.pairsFrom, function (value) {
          phase.pairsFrom = value;
          isDirty = true;
        });
      }

      var pairTipMsg = document.createElement('p');
      pairTipMsg.className = 'field-help';
      pairTipMsg.textContent = 'Tip: leave the template empty to show each pair their answers plainly, or use {{_pair.prompt}} (the pair\'s question) and {{_pair.answers}} (both answers) to arrange it yourself.';
      phaseConfigForm.appendChild(pairTipMsg);
    }

    var revealTA = addTextAreaWithHelp('Display template', 'Insert data from earlier steps.', 'phase-template', phase.template, 'e.g. Here\'s what AI created! Use the insert buttons below.', function (value) {
      phase.template = value;
      renderCanvas();
    });
    addVariableChips(revealTA, phaseId);
    addImageUploadWidget(phase, phaseId);
    addVideoUrlField(phase);
  }

  if (type === 'preview') {
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
    addDataRefDropdown('Scores from', 'Which step\'s scores determine the winner', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
    var entryOptions = [{ value: '', label: '(auto, traced from the vote)' }].concat(buildDataRefOptions(phaseId));
    if (phase.entryFrom && !entryOptions.some(function (o) { return o.value === phase.entryFrom; })) {
      entryOptions.push({ value: phase.entryFrom, label: phase.entryFrom + ' (custom)' });
    }
    addSelectWithHelp('What they won for', 'The step whose answers were judged, the winner\'s own entry is shown with the crown. Usually auto-detected from the vote.', 'phase-entryFrom', entryOptions, phase.entryFrom || '', function (value) {
      phase.entryFrom = value || undefined;
    });
  }

  if (type === 'leaderboard') {
    addDataRefDropdown('Scores from', 'Which step\'s scores to display as a leaderboard', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
    var lbTeamOpts = [{ value: '', label: 'No teams, rank each student' }];
    for (var lbPid in gameConfig.phases) {
      if (gameConfig.phases[lbPid].type === 'team-split') {
        lbTeamOpts.push({ value: lbPid, label: 'Teams from "' + phaseContentLabel(lbPid) + '"' });
      }
    }
    addSelectWithHelp('Team totals', 'Point at a Split into Teams step to roll individual scores up into ranked team totals. Students still see their own contribution.', 'phase-teamsFrom',
      lbTeamOpts, phase.teamsFrom || '', function (value) {
        if (value) { phase.teamsFrom = value; } else { delete phase.teamsFrom; }
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
    addDataRefDropdown('Items from', 'Where to get the list of items to reveal one-by-one', 'phase-from', phaseId, phase.from, function (value) {
      phase.from = value;
    });
    addFieldWithHelp('How many get shown', 'Leave empty to reveal every item. A number reveals a random sample of that many. Keep it empty when every student\'s item must appear (galleries, encouragement walls).', 'number', 'phase-limit',
      phase.limit, false, function (value) {
        var n = parseInt(value, 10);
        phase.limit = (n >= 1) ? Math.min(n, 100) : undefined;
        isDirty = true;
      }
    );
    var revOneTA = addTextAreaWithHelp('Title message', 'Shown above the reveal area.', 'phase-message', phase.message, 'e.g. And the answers are...', function (value) {
      phase.message = value;
      renderCanvas();
    });
    addVariableChips(revOneTA, phaseId);
  }

  if (type === 'team-split') {
    addSelectWithHelp('How teams are made', 'random/balanced assign instantly. "You arrange them" shows the roster on your screen. "Students pick" lets them tap the group they want (open spots only).', 'phase-method',
      [
        { value: 'random', label: 'Random shuffle' },
        { value: 'balanced', label: 'Balanced by score' },
        { value: 'teacher', label: 'You arrange them on screen' },
        { value: 'choice', label: 'Students pick their own' }
      ],
      phase.method || 'random', function (value) {
        phase.method = value;
        renderCanvas();
        renderPhaseConfig(phaseId);
      }
    );

    // Sizing: a number of teams OR a group size (exactly one)
    var sizedByGroup = phase.groupSize != null && phase.teamCount == null;
    addSelectWithHelp('Size teams by', '"Number of teams" makes exactly N teams. "Group size" makes as many groups of that size as the class needs (22 kids in groups of 4 → 4,4,4,4,3,3).', 'phase-team-sizing',
      [
        { value: 'count', label: 'Number of teams' },
        { value: 'size', label: 'Group size' }
      ],
      sizedByGroup ? 'size' : 'count', function (value) {
        isDirty = true;
        if (value === 'size') {
          phase.groupSize = phase.groupSize || 4;
          delete phase.teamCount;
        } else {
          phase.teamCount = phase.teamCount || 2;
          delete phase.groupSize;
        }
        renderCanvas();
        renderPhaseConfig(phaseId);
      });

    if (sizedByGroup) {
      addFieldWithHelp('Group size', 'Students per group (2-12)', 'number', 'phase-groupSize', phase.groupSize, false, function (value) {
        phase.groupSize = value;
      });
    } else {
      addFieldWithHelp('Number of teams', 'How many teams to create (2-20)', 'number', 'phase-teamCount', phase.teamCount, false, function (value) {
        phase.teamCount = value;
      });
    }
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
    if (phase.method === 'choice') {
      addSelectWithHelp('Team spots', 'Even spots keep a free pick fair. Open spots let students join any team, use when the class already has teams and kids should tap their own (uneven sizes and absences are fine).', 'phase-team-capacity',
        [
          { value: 'even', label: 'Even, spots capped for fairness' },
          { value: 'open', label: 'Open, any team, any size' }
        ],
        phase.capacity || 'even', function (value) {
          if (value === 'open') { phase.capacity = 'open'; } else { delete phase.capacity; }
        });
    }
    if (phase.method === 'balanced') {
      addDataRefDropdown('Balance scores from', 'Score data to balance teams with', 'phase-balanceFrom', phaseId, phase.balanceFrom, function (value) {
        phase.balanceFrom = value || undefined;
      });
    }
    addSelectWithHelp('Who gets assigned', 'Which players are put into teams', 'phase-from',
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
    addTextAreaWithHelp('Question / prompt', 'Tells players what to rank', 'phase-prompt', phase.prompt, 'e.g. Rank these ideas from best to worst', function (value) {
      phase.prompt = value;
      renderCanvas();
    });

    // Items can come from an earlier step (student answers, AI output) OR be
    // a fixed list the teacher types right here (stored as an array — the
    // engine accepts both).
    addSectionHeader('Items to rank');
    var rankIsOwnList = Array.isArray(phase.candidates);
    addSelectWithHelp('Items come from', 'Pull the list from an earlier step, or write your own fixed list', 'phase-rank-source',
      [
        { value: 'step', label: 'An earlier step (answers, AI output)' },
        { value: 'own', label: 'My own list. I\'ll type the items' }
      ],
      rankIsOwnList ? 'own' : 'step', function (value) {
        isDirty = true;
        if (value === 'own') {
          phase.candidates = ['Option A', 'Option B', 'Option C'];
        } else {
          phase.candidates = '';
        }
        renderPhaseConfig(phaseId);
        renderCanvas();
      });

    if (rankIsOwnList) {
      var rankItemsArr = phase.candidates;
      for (var rki = 0; rki < rankItemsArr.length; rki++) {
        (function (index) {
          var itemGroup = document.createElement('div');
          itemGroup.className = 'form-group';
          itemGroup.style.display = 'flex';
          itemGroup.style.gap = '6px';

          var itemInput = document.createElement('input');
          itemInput.type = 'text';
          itemInput.value = rankItemsArr[index];
          itemInput.placeholder = 'Item ' + (index + 1);
          itemInput.style.flex = '1';
          itemInput.addEventListener('input', function () {
            isDirty = true;
            phase.candidates[index] = itemInput.value;
          });

          var removeBtn = document.createElement('button');
          removeBtn.className = 'btn-icon';
          removeBtn.textContent = '✖';
          removeBtn.title = 'Remove item';
          removeBtn.addEventListener('click', function () {
            isDirty = true;
            phase.candidates.splice(index, 1);
            renderPhaseConfig(phaseId);
          });

          itemGroup.appendChild(itemInput);
          itemGroup.appendChild(removeBtn);
          phaseConfigForm.appendChild(itemGroup);
        })(rki);
      }

      var addRankItemBtn = document.createElement('button');
      addRankItemBtn.className = 'btn-secondary';
      addRankItemBtn.textContent = '+ Add Item';
      addRankItemBtn.style.marginBottom = '12px';
      addRankItemBtn.addEventListener('click', function () {
        isDirty = true;
        if (!Array.isArray(phase.candidates)) phase.candidates = [];
        phase.candidates.push('');
        renderPhaseConfig(phaseId);
      });
      phaseConfigForm.appendChild(addRankItemBtn);
    } else {
      addDataRefDropdown('Items from', 'Where to get the list of items to rank', 'phase-candidates', phaseId, phase.candidates, function (value) {
        phase.candidates = value;
      });
    }
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
    addSelectWithHelp('Who ranks', 'Which players can rank', 'phase-from',
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

  if (type === 'sort') {
    addTextAreaWithHelp('Instructions', 'Tells players what the categories mean', 'phase-prompt', phase.prompt, 'e.g. Is each line a metaphor or a simile?', function (value) {
      phase.prompt = value;
      renderCanvas();
    });

    addSectionHeader('The buckets');
    if (!Array.isArray(phase.buckets)) phase.buckets = [];
    for (var sbIdx = 0; sbIdx < phase.buckets.length; sbIdx++) {
      (function (index) {
        var bGroup = document.createElement('div');
        bGroup.className = 'form-group';
        bGroup.style.display = 'flex';
        bGroup.style.gap = '6px';

        var bInput = document.createElement('input');
        bInput.type = 'text';
        bInput.value = phase.buckets[index] || '';
        bInput.placeholder = 'Bucket ' + (index + 1);
        bInput.style.flex = '1';
        bInput.addEventListener('input', function () {
          isDirty = true;
          phase.buckets[index] = bInput.value;
        });
        // Bucket names feed the per-item dropdowns — refresh them on blur
        bInput.addEventListener('blur', function () { renderPhaseConfig(phaseId); });

        var bRemove = document.createElement('button');
        bRemove.className = 'btn-icon';
        bRemove.textContent = '✖';
        bRemove.title = 'Remove bucket';
        bRemove.addEventListener('click', function () {
          isDirty = true;
          phase.buckets.splice(index, 1);
          renderPhaseConfig(phaseId);
        });

        bGroup.appendChild(bInput);
        bGroup.appendChild(bRemove);
        phaseConfigForm.appendChild(bGroup);
      })(sbIdx);
    }
    var addBucketBtn = document.createElement('button');
    addBucketBtn.className = 'btn-secondary';
    addBucketBtn.textContent = '+ Add Bucket';
    addBucketBtn.style.marginBottom = '12px';
    addBucketBtn.addEventListener('click', function () {
      isDirty = true;
      if (!Array.isArray(phase.buckets)) phase.buckets = [];
      phase.buckets.push('');
      renderPhaseConfig(phaseId);
    });
    phaseConfigForm.appendChild(addBucketBtn);

    addSectionHeader('The items to sort');
    var sortHelp = document.createElement('p');
    sortHelp.className = 'field-help';
    sortHelp.textContent = 'Set the correct bucket on every item for a scored round, or leave them all on "no right answer" for a consensus poll.';
    phaseConfigForm.appendChild(sortHelp);

    if (!Array.isArray(phase.items)) phase.items = [];
    var sortBucketOpts = phase.buckets.map(function (b) { return String(b || '').trim(); }).filter(Boolean);
    for (var siIdx = 0; siIdx < phase.items.length; siIdx++) {
      (function (index) {
        var item = phase.items[index];
        if (!item || typeof item !== 'object') { item = {}; phase.items[index] = item; }

        var iGroup = document.createElement('div');
        iGroup.className = 'form-group';
        iGroup.style.display = 'flex';
        iGroup.style.gap = '6px';

        var iInput = document.createElement('input');
        iInput.type = 'text';
        iInput.value = item.text || '';
        iInput.placeholder = 'Item ' + (index + 1);
        iInput.style.flex = '1';
        iInput.addEventListener('input', function () {
          isDirty = true;
          phase.items[index].text = iInput.value;
        });

        var iSelect = document.createElement('select');
        var noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'no right answer';
        iSelect.appendChild(noneOpt);
        for (var bo = 0; bo < sortBucketOpts.length; bo++) {
          var opt = document.createElement('option');
          opt.value = sortBucketOpts[bo];
          opt.textContent = sortBucketOpts[bo];
          iSelect.appendChild(opt);
        }
        iSelect.value = sortBucketOpts.indexOf(String(item.bucket || '').trim()) !== -1 ? String(item.bucket).trim() : '';
        iSelect.addEventListener('change', function () {
          isDirty = true;
          if (iSelect.value) phase.items[index].bucket = iSelect.value;
          else delete phase.items[index].bucket;
        });

        var iRemove = document.createElement('button');
        iRemove.className = 'btn-icon';
        iRemove.textContent = '✖';
        iRemove.title = 'Remove item';
        iRemove.addEventListener('click', function () {
          isDirty = true;
          phase.items.splice(index, 1);
          renderPhaseConfig(phaseId);
        });

        iGroup.appendChild(iInput);
        iGroup.appendChild(iSelect);
        iGroup.appendChild(iRemove);
        phaseConfigForm.appendChild(iGroup);
      })(siIdx);
    }
    var addSortItemBtn = document.createElement('button');
    addSortItemBtn.className = 'btn-secondary';
    addSortItemBtn.textContent = '+ Add Item';
    addSortItemBtn.style.marginBottom = '12px';
    addSortItemBtn.addEventListener('click', function () {
      isDirty = true;
      if (!Array.isArray(phase.items)) phase.items = [];
      phase.items.push({ text: '' });
      renderPhaseConfig(phaseId);
    });
    phaseConfigForm.appendChild(addSortItemBtn);

    addFieldWithHelp('Points per correct placement', 'Default 10. Only used when items have correct buckets.', 'number', 'phase-sort-points', phase.pointsPerItem, false, function (value) {
      if (value == null || value === '') delete phase.pointsPerItem;
      else phase.pointsPerItem = value;
    });
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits what\'s placed on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      if (value == null || value === '') delete phase.timer;
      else phase.timer = value;
    });
    addSelectWithHelp('Who sorts', 'Which players play this round', 'phase-from',
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

  if (type === 'checklist') {
    addTextAreaWithHelp('Instructions', 'Shown above the to-do list on every screen', 'phase-prompt', phase.prompt, 'e.g. Finish these five things with your lab group', function (value) {
      phase.prompt = value;
      renderCanvas();
    });

    addSectionHeader('The to-do items');
    if (!Array.isArray(phase.items)) phase.items = [];
    for (var clIdx = 0; clIdx < phase.items.length; clIdx++) {
      (function (index) {
        var cGroup = document.createElement('div');
        cGroup.className = 'form-group';
        cGroup.style.display = 'flex';
        cGroup.style.gap = '6px';

        var cInput = document.createElement('input');
        cInput.type = 'text';
        cInput.value = phase.items[index] || '';
        cInput.placeholder = 'Task ' + (index + 1);
        cInput.style.flex = '1';
        cInput.addEventListener('input', function () {
          isDirty = true;
          phase.items[index] = cInput.value;
        });

        var cRemove = document.createElement('button');
        cRemove.className = 'btn-icon';
        cRemove.textContent = '✖';
        cRemove.title = 'Remove task';
        cRemove.addEventListener('click', function () {
          isDirty = true;
          phase.items.splice(index, 1);
          renderPhaseConfig(phaseId);
        });

        cGroup.appendChild(cInput);
        cGroup.appendChild(cRemove);
        phaseConfigForm.appendChild(cGroup);
      })(clIdx);
    }
    var addTaskBtn = document.createElement('button');
    addTaskBtn.className = 'btn-secondary';
    addTaskBtn.textContent = '+ Add Task';
    addTaskBtn.style.marginBottom = '12px';
    addTaskBtn.addEventListener('click', function () {
      isDirty = true;
      if (!Array.isArray(phase.items)) phase.items = [];
      phase.items.push('');
      renderPhaseConfig(phaseId);
    });
    phaseConfigForm.appendChild(addTaskBtn);

    // Groups: any earlier team-split step, or solo checklists
    var teamSplitOpts = [{ value: '', label: 'No groups, one checklist per student' }];
    for (var pid in gameConfig.phases) {
      if (gameConfig.phases[pid].type === 'team-split') {
        teamSplitOpts.push({ value: pid, label: 'Teams from "' + phaseContentLabel(pid) + '"' });
      }
    }
    addSelectWithHelp('Who shares a checklist', 'Point at a Split into Teams step for group checklists, or give every student their own.', 'phase-teamsFrom',
      teamSplitOpts, phase.teamsFrom || '', function (value) {
        if (value) { phase.teamsFrom = value; } else { delete phase.teamsFrom; }
      });

    addFieldWithHelp('Work time (seconds)', 'Leave empty for no limit, you end work time from the host screen.', 'number', 'phase-timer', phase.timer, false, function (value) {
      if (value == null || value === '') delete phase.timer;
      else phase.timer = value;
    });
  }

  if (type === 'match') {
    addTextAreaWithHelp('Instructions', 'Tells players what the two lists are', 'phase-prompt', phase.prompt, 'e.g. Match each French word to its English meaning', function (value) {
      phase.prompt = value;
      renderCanvas();
    });

    // The pairs ARE the content — one left/right row each. Students see
    // the left column fixed and drag the right column into place.
    addSectionHeader('The correct pairs');
    if (!Array.isArray(phase.pairs)) phase.pairs = [];

    for (var mpIdx = 0; mpIdx < phase.pairs.length; mpIdx++) {
      (function (index) {
        var pair = phase.pairs[index];
        if (!pair || typeof pair !== 'object') { pair = {}; phase.pairs[index] = pair; }

        var pairGroup = document.createElement('div');
        pairGroup.className = 'form-group';
        pairGroup.style.display = 'flex';
        pairGroup.style.gap = '6px';
        pairGroup.style.alignItems = 'center';

        var leftInput = document.createElement('input');
        leftInput.type = 'text';
        leftInput.value = pair.left || '';
        leftInput.placeholder = 'Left (e.g. chat)';
        leftInput.style.flex = '1';
        leftInput.addEventListener('input', function () {
          isDirty = true;
          phase.pairs[index].left = leftInput.value;
        });

        var pairArrow = document.createElement('span');
        pairArrow.textContent = '↔';

        var rightInput = document.createElement('input');
        rightInput.type = 'text';
        rightInput.value = pair.right || '';
        rightInput.placeholder = 'Right (e.g. cat)';
        rightInput.style.flex = '1';
        rightInput.addEventListener('input', function () {
          isDirty = true;
          phase.pairs[index].right = rightInput.value;
        });

        var removePairBtn = document.createElement('button');
        removePairBtn.className = 'btn-icon';
        removePairBtn.textContent = '✖';
        removePairBtn.title = 'Remove pair';
        removePairBtn.addEventListener('click', function () {
          isDirty = true;
          phase.pairs.splice(index, 1);
          renderPhaseConfig(phaseId);
        });

        pairGroup.appendChild(leftInput);
        pairGroup.appendChild(pairArrow);
        pairGroup.appendChild(rightInput);
        pairGroup.appendChild(removePairBtn);
        phaseConfigForm.appendChild(pairGroup);
      })(mpIdx);
    }

    var addPairBtn = document.createElement('button');
    addPairBtn.className = 'btn-secondary';
    addPairBtn.textContent = '+ Add Pair';
    addPairBtn.style.marginBottom = '12px';
    addPairBtn.addEventListener('click', function () {
      isDirty = true;
      if (!Array.isArray(phase.pairs)) phase.pairs = [];
      phase.pairs.push({ left: '', right: '' });
      renderPhaseConfig(phaseId);
    });
    phaseConfigForm.appendChild(addPairBtn);

    addFieldWithHelp('Points per correct match', 'Default 10.', 'number', 'phase-match-points', phase.pointsPerMatch, false, function (value) {
      if (value == null || value === '') delete phase.pointsPerMatch;
      else phase.pointsPerMatch = value;
    });
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits the current board on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      if (value == null || value === '') delete phase.timer;
      else phase.timer = value;
    });
    addSelectWithHelp('Who matches', 'Which players play this round', 'phase-from',
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

  if (type === 'rate') {
    // Scales first — they're the actual rating instrument. Instructions
    // are optional ("explain verbally" works fine for most teachers).
    if (!Array.isArray(phase.scales)) phase.scales = [];

    for (var sIdx = 0; sIdx < phase.scales.length; sIdx++) {
      (function (index) {
        var scale = phase.scales[index];
        var card = document.createElement('div');
        card.style.cssText = 'border:2px solid #000; padding:10px; margin:8px 0; background:#FFF;';

        var topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';

        var labelIn = document.createElement('input');
        labelIn.type = 'text';
        labelIn.placeholder = 'Label (e.g. Originality)';
        labelIn.value = scale.label || '';
        labelIn.style.cssText = 'flex:1; padding:4px 8px; border:2px solid #000; font-family:inherit;';
        labelIn.addEventListener('input', function () {
          scale.label = labelIn.value;
          if (!scale.id || scale.id === '') {
            scale.id = labelIn.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('scale-' + (index + 1));
          }
          isDirty = true;
        });

        var rmBtn = document.createElement('button');
        rmBtn.textContent = 'X';
        rmBtn.title = 'Remove scale';
        rmBtn.style.cssText = 'background:#FF2D2D; color:white; border:2px solid #000; padding:2px 8px; cursor:pointer; font-weight:bold;';
        rmBtn.addEventListener('click', function () {
          phase.scales.splice(index, 1);
          isDirty = true;
          renderPhaseConfig(phaseId);
        });

        topRow.appendChild(labelIn);
        topRow.appendChild(rmBtn);
        card.appendChild(topRow);

        var idRow = document.createElement('div');
        idRow.style.cssText = 'font-size:0.85rem; color:#555; margin-bottom:6px;';
        idRow.textContent = 'id: ' + (scale.id || '(auto from label)');
        card.appendChild(idRow);

        var rangeRow = document.createElement('div');
        rangeRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
        rangeRow.innerHTML = '<span style="font-size:0.9rem;">Range</span>';
        var minIn = document.createElement('input');
        minIn.type = 'number';
        minIn.style.cssText = 'width:70px; padding:4px 8px; border:2px solid #000;';
        minIn.value = (scale.min == null ? 1 : scale.min);
        minIn.addEventListener('input', function () { scale.min = parseInt(minIn.value, 10); isDirty = true; });
        var dash = document.createElement('span'); dash.textContent = '–';
        var maxIn = document.createElement('input');
        maxIn.type = 'number';
        maxIn.style.cssText = 'width:70px; padding:4px 8px; border:2px solid #000;';
        maxIn.value = (scale.max == null ? 5 : scale.max);
        maxIn.addEventListener('input', function () { scale.max = parseInt(maxIn.value, 10); isDirty = true; });
        rangeRow.appendChild(minIn); rangeRow.appendChild(dash); rangeRow.appendChild(maxIn);
        card.appendChild(rangeRow);

        var endLabelHeader = document.createElement('div');
        endLabelHeader.style.cssText = 'font-size:0.85rem; color:#555; margin-top:6px; margin-bottom:2px;';
        endLabelHeader.textContent = 'End labels (optional, shown next to the buttons on the player screen)';
        card.appendChild(endLabelHeader);

        var endRow = document.createElement('div');
        endRow.style.cssText = 'display:flex; gap:6px; align-items:center;';

        var minLabelWrap = document.createElement('label');
        minLabelWrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:2px;';
        var minLabelCaption = document.createElement('span');
        minLabelCaption.style.cssText = 'font-size:0.75rem; color:#777;';
        minLabelCaption.textContent = 'Low end (' + (scale.min == null ? 1 : scale.min) + ')';
        var minLabel = document.createElement('input');
        minLabel.type = 'text';
        minLabel.placeholder = 'e.g. Familiar';
        minLabel.value = (scale.labels && scale.labels.min) || '';
        minLabel.style.cssText = 'padding:4px 8px; border:2px solid #000; font-family:inherit; font-size:0.9rem;';
        minLabel.addEventListener('input', function () {
          if (!scale.labels) scale.labels = {};
          scale.labels.min = minLabel.value;
          isDirty = true;
        });
        minLabelWrap.appendChild(minLabelCaption);
        minLabelWrap.appendChild(minLabel);

        var maxLabelWrap = document.createElement('label');
        maxLabelWrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:2px;';
        var maxLabelCaption = document.createElement('span');
        maxLabelCaption.style.cssText = 'font-size:0.75rem; color:#777;';
        maxLabelCaption.textContent = 'High end (' + (scale.max == null ? 5 : scale.max) + ')';
        var maxLabel = document.createElement('input');
        maxLabel.type = 'text';
        maxLabel.placeholder = 'e.g. Fresh';
        maxLabel.value = (scale.labels && scale.labels.max) || '';
        maxLabel.style.cssText = 'padding:4px 8px; border:2px solid #000; font-family:inherit; font-size:0.9rem;';
        maxLabel.addEventListener('input', function () {
          if (!scale.labels) scale.labels = {};
          scale.labels.max = maxLabel.value;
          isDirty = true;
        });
        maxLabelWrap.appendChild(maxLabelCaption);
        maxLabelWrap.appendChild(maxLabel);

        endRow.appendChild(minLabelWrap);
        endRow.appendChild(maxLabelWrap);
        card.appendChild(endRow);

        phaseConfigForm.appendChild(card);
      })(sIdx);
    }

    var addScaleBtn = document.createElement('button');
    addScaleBtn.className = 'btn-secondary';
    addScaleBtn.textContent = '+ Add Scale';
    addScaleBtn.style.marginBottom = '12px';
    addScaleBtn.addEventListener('click', function () {
      var n = phase.scales.length + 1;
      phase.scales.push({ id: 'scale-' + n, label: 'Scale ' + n, min: 1, max: 5 });
      isDirty = true;
      renderPhaseConfig(phaseId);
    });
    phaseConfigForm.appendChild(addScaleBtn);

    addTextAreaWithHelp(
      'Instructions (optional)',
      'What students see above the scales. You can also explain verbally.',
      'phase-prompt', phase.prompt,
      'e.g. Rate the presentation on each scale below.',
      function (value) {
        if (value && value.trim()) { phase.prompt = value; } else { delete phase.prompt; }
        renderCanvas();
      }
    );
    addFieldWithHelp('Time limit (seconds)', 'Leave empty for no limit. Auto-submits whatever is selected on expiry.', 'number', 'phase-timer', phase.timer, false, function (value) {
      phase.timer = value;
    });
    addSelectWithHelp('Who sees results', 'Show averages to the class or keep them on the teacher screen only', 'phase-visibility',
      [
        { value: 'all', label: 'Everyone sees results' },
        { value: 'host-only', label: 'Only the teacher sees results' }
      ],
      phase.visibility || 'all', function (value) {
        if (value === 'all') { delete phase.visibility; } else { phase.visibility = value; }
      }
    );
    addSelectWithHelp('Who rates', 'Which players can submit ratings', 'phase-from',
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

    addDataRefDropdown('Scores from', 'Where to get player point totals for betting', 'phase-scoresFrom', phaseId, phase.scoresFrom, function (value) {
      phase.scoresFrom = value || undefined;
    });
    addFieldWithHelp('Correct option (optional)', 'If set, auto-resolves. Leave empty for host to pick winner.', 'text', 'phase-correctOption', phase.correctOption, false, function (value) {
      phase.correctOption = value || undefined;
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
    addSelectWithHelp('Who wagers', 'Which players can place wagers', 'phase-from',
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
    addSelectWithHelp('Who participates', 'Which players take turns', 'phase-from',
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

    addFieldWithHelp('How many get read', 'Leave empty to run every answer. A number runs a random sample of that many (a round per answer drags past ~12 in a full class).', 'number', 'phase-limit',
      phase.limit, false, function (value) {
        var n = parseInt(value, 10);
        phase.limit = (n >= 1) ? Math.min(n, 100) : undefined;
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
      { value: 'guess-author', label: 'Guess who wrote it, players see the answer and pick from a list of names' },
      { value: 'guess-the-truth', label: 'Guess the right answer, players answer each other\'s questions (1 correct + decoys)' },
      { value: 'rate-answers', label: 'Rate each answer, players rate responses and authors earn points' },
      { value: 'spot-the-lie', label: 'Spot the lie, players pick which of someone\'s statements is false' },
      { value: 'discuss', label: 'Just show and discuss, show each answer with time to talk' },
      { value: 'custom', label: 'Custom, build your own steps' }
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
          header.innerHTML = '<strong>Step ' + stepNum + ': ' + escapeHtml(subCat ? subCat.friendlyName : sub.type) + '</strong>';
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
    addFieldWithHelp('Final message', 'Shown to all players when the activity ends', 'text', 'phase-message', phase.message, false, function (value) {
      phase.message = value;
      renderCanvas();
    });
  }

  // --- Flow: Next phase (for all types except end and preview) ---
  if (type !== 'end' && type !== 'preview') {
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
    // Tag the wrapper so the Builder rail can hide this power feature
    // (one shipped game uses loops; the recipe covers it for teachers).
    if (phaseConfigForm && phaseConfigForm.closest) {
      var loopWrap = phaseConfigForm.closest('.collapsible-section');
      if (loopWrap) loopWrap.classList.add('loop-collapsible');
    }

    // loopBack dropdown — filter to phases before current
    var loopBackOptions = [{ value: '', label: '(none, no loop)' }];
    var order = buildPhaseOrder();
    var currentIdx = order.indexOf(phaseId);
    for (var li = 0; li < order.length; li++) {
      if (li >= currentIdx) break;
      var lpid = order[li];
      var lp = gameConfig.phases[lpid];
      var lcat = PHASE_CATALOG[lp.type];
      if (lcat) {
        loopBackOptions.push({ value: lpid, label: phaseRefLabel(lpid, true) });
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

  // --- Customize screens (Optional) — one collapsible holding both the host
  // and player sub-groups; expanded when either screen is already customized. ---
  if (type !== 'lobby') {
    var screensCustomized = !!phase.hostTemplate || !!phase.playerTemplate ||
      (Array.isArray(phase.hostShow) && phase.hostShow.length > 0) ||
      (Array.isArray(phase.playerShow) && phase.playerShow.length > 0);
    var screensHandle = beginCollapsible('both', 'Customize screens', phaseId + ':screens', screensCustomized);

    // Host sub-group
    addRoleHeader('host', 'Host screen');
    var hostTemplateTA = addTextAreaWithHelp('Host template', 'Custom text shown on the host screen. Leave empty for default.', 'phase-hostTemplate', phase.hostTemplate, 'Leave empty for default, or type custom text. Use insert buttons below to add data.', function (value) {
      if (value) { phase.hostTemplate = value; } else { delete phase.hostTemplate; }
    });
    addVariableChips(hostTemplateTA, phaseId);

    var hostToggles = VALID_HOST_TOGGLES[type];
    if (hostToggles) {
      addToggleCheckboxes('Host screen elements', 'Choose which built-in elements to show on the host screen', phase, 'hostShow', hostToggles);
    }

    // Player sub-group
    addRoleHeader('player', "Players' screens");
    var playerTemplateTA = addTextAreaWithHelp('Player template', 'Custom text shown on player screens. Leave empty for default.', 'phase-playerTemplate', phase.playerTemplate, 'e.g. Great job everyone!', function (value) {
      if (value) { phase.playerTemplate = value; } else { delete phase.playerTemplate; }
    });
    addVariableChips(playerTemplateTA, phaseId);

    var playerToggles = VALID_PLAYER_TOGGLES[type];
    if (playerToggles) {
      addToggleCheckboxes('Player screen elements', 'Choose which built-in elements to show on player screens', phase, 'playerShow', playerToggles);
    }
    endCollapsible(screensHandle);
  }

  // --- Ask AI about this step (meta action, sits near the Advanced row) ---
  addAskAiStepButton(phaseId);

  // (No "change step type" control — to switch a step's type, delete it and
  // add a new one. Changing type in place orphaned most settings anyway.)

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

  // Dedup: when a phase's primary field is already shown inline on the
  // canvas box, strip the matching field from the expanded form so the
  // teacher doesn't see two textareas editing the same value (which would
  // also create a stale-write bug if edited in both places).
  stripPrimaryFieldFromForm(phase.type);

  // Update live preview
  renderLivePreview(phaseId);
}

// Map of phase type -> form input IDs that are also shown as the canvas
// primary. Skipped at form-render time to avoid duplication.
var PRIMARY_FORM_IDS_BY_TYPE = {
  'announce':       ['phase-message'],
  'collect':        ['phase-prompt'],
  'collect-choice': ['phase-prompt'],
  'ai-process':     ['phase-instruction'],
  'ai-eliminate':   ['phase-instruction'],
  'reveal':         ['phase-content'],
  'preview':        ['phase-content'],
  'end':            ['phase-message'],
  'rank':           ['phase-prompt'],
  'wager':          ['phase-prompt'],
  'relay':          ['phase-prompt'],
  'buzz':           ['phase-prompt'],
  'estimate':       ['phase-prompt'],
  'match':          ['phase-prompt'],
  'sort':           ['phase-prompt']
  // reveal-one keeps its phase-message (title) — its primary is a summary
};
function stripPrimaryFieldFromForm(type) {
  var ids = PRIMARY_FORM_IDS_BY_TYPE[type];
  if (!ids) return;
  for (var i = 0; i < ids.length; i++) {
    var el = phaseConfigForm.querySelector('#' + ids[i]);
    if (!el) continue;
    var group = el.closest ? el.closest('.form-group') : null;
    if (group && group.parentNode) group.parentNode.removeChild(group);
  }
}

// --- Form field helpers ---

// True when 2+ steps share the same friendly name (e.g. two "Open answer").
// Used to decide whether a disambiguating "(step N)" suffix is needed.
function phaseNameIsAmbiguous(phaseId) {
  var phase = gameConfig.phases[phaseId];
  if (!phase) return false;
  var cat = PHASE_CATALOG[phase.type];
  if (!cat) return false;
  var count = 0;
  for (var id in gameConfig.phases) {
    var c = PHASE_CATALOG[gameConfig.phases[id].type];
    if (c && c.friendlyName === cat.friendlyName) count++;
  }
  return count > 1;
}

// Teacher-facing label for a phase in dropdowns/refs. Never shows the raw
// internal id; appends "(step N)" only when another step shares the same
// name, so duplicates stay distinguishable without leaking jargon.
function phaseRefLabel(phaseId, withIcon) {
  var phase = gameConfig.phases[phaseId];
  if (!phase) return phaseId;
  var cat = PHASE_CATALOG[phase.type];
  if (!cat) return phaseId;
  var name = (phase.type === 'reveal' && phase.scope === 'pair') ? 'Show each pair' : cat.friendlyName;
  var label = (withIcon ? cat.icon + ' ' : '') + name;
  if (phaseNameIsAmbiguous(phaseId)) {
    var n = buildPhaseOrder().indexOf(phaseId) + 1;
    if (n > 0) label += ' (step ' + n + ')';
  }
  return label;
}

// Get friendly display name for a phase (used in modal/review titles).
function getFriendlyPhaseName(phaseId) {
  return phaseRefLabel(phaseId, true);
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

/**
 * Image upload widget. Renders a file input + thumbnail preview + remove button.
 * Calls onChange(newPath | null) when the image changes.
 *
 * @param {object} phase  — the phase config object (so we can read/write phase.image)
 * @param {string} phaseId — id (used only for refresh)
 */
/**
 * YouTube video URL field. A plain text input (no upload) that reads/writes
 * phase.video. Trimmed; empty clears the field. Plays on the host screen only.
 */
function addVideoUrlField(phase) {
  return addFieldWithHelp(
    'YouTube video URL (optional)',
    'Paste a YouTube link (e.g. youtu.be/abc123 or youtube.com/watch?v=…). Plays on the host/projector screen only. Toggle off with the host "video" control.',
    'text', 'phase-video', phase.video, false,
    function (value) {
      var v = (value || '').trim();
      if (v) { phase.video = v; } else { delete phase.video; }
    }
  );
}

function addImageUploadWidget(phase, phaseId) {
  var section = document.createElement('div');
  section.className = 'form-group';
  section.style.cssText = 'margin-top:8px;';

  var label = document.createElement('label');
  label.textContent = 'Image (optional)';
  label.style.fontWeight = '600';
  section.appendChild(label);

  var help = document.createElement('p');
  help.className = 'field-help';
  help.textContent = 'Drop an image here or click below to choose one. Uploaded to this game\'s assets folder. Use the host/player "image" toggle to control which screens show it.';
  section.appendChild(help);

  var previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'margin:6px 0;';

  function renderPreview() {
    previewWrap.innerHTML = '';
    if (phase.image && gameId) {
      var img = document.createElement('img');
      img.src = '/games/' + encodeURIComponent(gameId) + '/' + phase.image.replace(/^\.?\//, '');
      img.alt = '';
      img.style.cssText = 'max-width:200px; max-height:150px; border:2px solid #000; display:block; object-fit:contain; background:#FFF;';
      previewWrap.appendChild(img);

      var pathLine = document.createElement('div');
      pathLine.style.cssText = 'font-size:0.8rem; color:#555; margin-top:4px;';
      pathLine.textContent = phase.image;
      previewWrap.appendChild(pathLine);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove image';
      removeBtn.style.cssText = 'margin-top:6px; background:#FF2D2D; color:white; border:2px solid #000; padding:4px 10px; cursor:pointer; font-weight:bold;';
      removeBtn.addEventListener('click', function () {
        delete phase.image;
        isDirty = true;
        renderPhaseConfig(phaseId);
      });
      previewWrap.appendChild(removeBtn);
    }
  }
  renderPreview();
  section.appendChild(previewWrap);

  // Drop zone — clicking opens the file picker; dropping an image uploads it.
  var dropZone = document.createElement('div');
  dropZone.className = 'image-drop-zone';
  dropZone.style.cssText = 'margin-top:6px; padding:18px 12px; border:2px dashed #999; border-radius:6px; text-align:center; cursor:pointer; background:#FAFAFA; font-size:0.9rem; color:#555; transition:background 0.15s, border-color 0.15s;';
  dropZone.textContent = phase.image ? 'Drop a new image here to replace, or click to choose…' : 'Drop an image here, or click to choose…';

  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
  fileInput.style.cssText = 'display:none;';

  var status = document.createElement('div');
  status.style.cssText = 'font-size:0.85rem; margin-top:4px; min-height:1em;';

  async function uploadFile(file) {
    if (!file) return;
    if (!gameId) {
      status.textContent = 'Save first, then upload an image.';
      status.style.color = '#C00';
      return;
    }
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(file.type || '')) {
      status.textContent = 'Only JPEG, PNG, GIF, or WebP images allowed.';
      status.style.color = '#C00';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = 'File too large (max 5MB).';
      status.style.color = '#C00';
      return;
    }
    status.textContent = 'Uploading…';
    status.style.color = '#555';
    try {
      var fd = new FormData();
      fd.append('file', file);
      var resp = await fetch('/api/games/' + encodeURIComponent(gameId) + '/assets', {
        method: 'POST', body: fd
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      phase.image = data.path;
      isDirty = true;
      status.textContent = 'Uploaded.';
      status.style.color = '#080';
      renderPhaseConfig(phaseId);
    } catch (err) {
      status.textContent = 'Upload failed: ' + err.message;
      status.style.color = '#C00';
    }
  }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    uploadFile(file);
  });

  dropZone.addEventListener('click', function () { fileInput.click(); });

  // Drag-and-drop. stopPropagation so the phase-block's own drag handlers
  // (which reorder steps on the canvas) don't interfere.
  function highlight(on) {
    dropZone.style.borderColor = on ? '#0057FF' : '#999';
    dropZone.style.background = on ? '#E6F0FF' : '#FAFAFA';
  }
  ['dragenter', 'dragover'].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      highlight(true);
    });
  });
  ['dragleave', 'dragend'].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      highlight(false);
    });
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    highlight(false);
    var dt = e.dataTransfer;
    if (!dt) return;
    // Prefer files (a real file dropped from the OS)
    var file = dt.files && dt.files[0];
    if (file) {
      uploadFile(file);
      return;
    }
    // Fallback: an image dragged from another browser tab arrives as a URL,
    // not as a file. We can't upload that directly without a fetch+CORS dance,
    // so just tell the user.
    status.textContent = 'Drop the image file from your computer (not a link from a webpage).';
    status.style.color = '#C00';
  });

  section.appendChild(dropZone);
  section.appendChild(fileInput);
  section.appendChild(status);
  phaseConfigForm.appendChild(section);
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

// Build template variables available for a given phase (phases that come before it).
// Labels MUST be unique per ref — they include the step number ("AI result —
// step 5") because tokenize/detokenize round-trips on the label text. With
// duplicate labels (a game with two AI steps), detokenize would silently
// rewire a {{ref}} to the wrong step.
function buildTemplateVariables(currentPhaseId, extraVars) {
  var order = buildPhaseOrder();
  var currentIndex = order.indexOf(currentPhaseId);
  var vars = [];

  function stepN(pid) {
    return 'step ' + (order.indexOf(pid) + 1);
  }

  for (var i = 0; i < order.length; i++) {
    if (i >= currentIndex) break;
    var pid = order[i];
    var p = gameConfig.phases[pid];
    var cat = PHASE_CATALOG[p.type];
    if (!cat) continue;
    var at = '. ' + stepN(pid);

    if (p.type === 'collect') {
      vars.push({ label: 'List of answers' + at, variable: '{{' + pid + '.responses.list}}' });
      vars.push({ label: 'Raw answers (for AI)' + at, variable: '{{' + pid + '.responses}}' });
      if (p.rotateFrom || p.assign === 'pairwise') {
        vars.push({ label: "Each player's assigned item" + at, variable: '{{' + pid + '.assigned}}' });
      }
    }
    if (p.type === 'collect-choice') {
      vars.push({ label: 'Bar chart of picks' + at, variable: '{{' + pid + '.barChart}}' });
      vars.push({ label: 'Vote counts' + at, variable: '{{' + pid + '.tally}}' });
      if (p.correctAnswer) {
        vars.push({ label: 'Scores (graded)' + at, variable: '{{' + pid + '.scores}}' });
        vars.push({ label: 'The correct answer' + at, variable: '{{' + pid + '.correctAnswer}}' });
      }
    }
    if (p.type === 'ai-process') {
      vars.push({ label: 'AI result' + at, variable: '{{' + pid + '.result}}' });
      if (p.perPlayer) {
        vars.push({ label: "Each player's own AI item" + at, variable: '{{' + pid + '.mine}}' });
      }
    }
    if (p.type === 'vote') {
      vars.push({ label: 'Winning answer' + at, variable: '{{' + pid + '.winner}}' });
      vars.push({ label: 'Vote scores' + at, variable: '{{' + pid + '.scores}}' });
      vars.push({ label: 'Bar chart of votes' + at, variable: '{{' + pid + '.barChart}}' });
    }
    if (p.type === 'wager') {
      vars.push({ label: 'Wager scores' + at, variable: '{{' + pid + '.scores}}' });
    }
    if (p.type === 'rank') {
      vars.push({ label: 'Ranked list' + at, variable: '{{' + pid + '.rankedList}}' });
    }
    if (p.type === 'match') {
      vars.push({ label: 'Pair-by-pair results' + at, variable: '{{' + pid + '.resultsList}}' });
      vars.push({ label: 'Match scores' + at, variable: '{{' + pid + '.scores}}' });
    }
    if (p.type === 'sort') {
      vars.push({ label: 'Item-by-item results' + at, variable: '{{' + pid + '.resultsList}}' });
      vars.push({ label: 'Sort scores' + at, variable: '{{' + pid + '.scores}}' });
    }
    if (p.type === 'rate') {
      vars.push({ label: 'Bar chart of averages' + at, variable: '{{' + pid + '.barChart}}' });
    }
    if (p.type === 'foreach') {
      vars.push({ label: 'Round-by-round scores' + at, variable: '{{' + pid + '.scores}}' });
    }
    if (p.type === 'merge') {
      vars.push({ label: 'List of combined answers' + at, variable: '{{' + pid + '.merged.list}}' });
    }
    if (p.type === 'one-voice') {
      vars.push({ label: 'Attempts' + at, variable: '{{' + pid + '.attempts}}' });
      vars.push({ label: 'Best run' + at, variable: '{{' + pid + '.bestRun}}' });
      vars.push({ label: 'Times reset' + at, variable: '{{' + pid + '.resets}}' });
      vars.push({ label: 'The target number' + at, variable: '{{' + pid + '.target}}' });
    }
    if (p.type === 'eliminate' || p.type === 'ai-eliminate') {
      vars.push({ label: 'How many knocked out' + at, variable: '{{' + pid + '.eliminated.length}}' });
    }
  }

  // Global: how many players are still in (used by elimination games)
  vars.push({ label: 'Players remaining', variable: '{{remaining.length}}' });

  // Hidden vars: tokenized for friendly display but not offered as insert
  // chips — aliases of refs above, or scopes only valid in special contexts.
  // Aliases come AFTER their canonical twin so detokenize (first label match
  // wins) normalizes to the canonical form.
  for (var ai = 0; ai < order.length && ai < currentIndex; ai++) {
    var ap = gameConfig.phases[order[ai]];
    if (!ap) continue;
    var aat = '. ' + stepN(order[ai]);
    if (ap.type === 'collect') {
      vars.push({ label: 'List of answers' + aat, variable: '{{' + order[ai] + '.list}}', hidden: true });
    }
    if (ap.type === 'ai-process') {
      vars.push({ label: 'AI result as a list' + aat, variable: '{{' + order[ai] + '.list}}', hidden: true });
    }
  }
  vars.push({ label: "This pair's question", variable: '{{_pair.prompt}}', hidden: true });
  vars.push({ label: "This pair's answers", variable: '{{_pair.answers}}', hidden: true });

  // Add loop variables if any phase has loopBack pointing at an ancestor
  for (var li = 0; li < order.length; li++) {
    var lp = gameConfig.phases[order[li]];
    if (lp && lp.loopBack) {
      vars.push({ label: 'Round number (' + stepN(order[li]) + ' loop)', variable: '{{_loop.' + order[li] + '.iteration}}' });
      vars.push({ label: 'Total rounds (' + stepN(order[li]) + ' loop)', variable: '{{_loop.' + order[li] + '.total}}' });
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
    if (vars[i].hidden) continue; // tokenize-only vars (aliases, special scopes)
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
    } else if (p.type === 'match') {
      options.push({ value: pid + '.scores', label: 'Match scores from ' + stepLabel });
    } else if (p.type === 'sort') {
      options.push({ value: pid + '.scores', label: 'Sort scores from ' + stepLabel });
    } else if (p.type === 'checklist') {
      options.push({ value: pid + '.resultsList', label: 'Checklist progress from ' + stepLabel });
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

// Compact "→ Next: <Name> [Change]" display. Click Change to swap in the full dropdown.
function addCompactNextRef(currentPhaseId) {
  var phase = gameConfig.phases[currentPhaseId];
  var targetId = phase.next;
  var target = gameConfig.phases[targetId];
  var cat = target ? PHASE_CATALOG[target.type] : null;
  var name = cat ? phaseRefLabel(targetId, true) : (targetId || '(none)');

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
      options.push({ value: pid, label: phaseRefLabel(pid, true) });
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
// One taxonomy with the Builder palette (same verb groups, ALL step types)
// — Simple's "Add a Step" must never show fewer steps than the Builder
// sidebar. 'collect-two' is the Builder's Secret + Clue brick (compiles to
// a two-field collect via StepSuggestions.defaultPhaseFor).
var PHASE_CATEGORIES = [
  {
    name: 'Ask the class',
    description: 'Get responses from students',
    types: ['collect', 'collect-two', 'collect-choice', 'estimate', 'match', 'sort', 'buzz']
  },
  {
    name: 'Show the class',
    description: 'Put something on the projector',
    types: ['announce', 'reveal', 'reveal-one', 'leaderboard', 'winner', 'preview']
  },
  {
    name: 'Decide together',
    description: 'Vote, rank, rate, bet, eliminate',
    types: ['vote', 'rank', 'rate', 'wager', 'eliminate']
  },
  {
    name: 'Team up',
    description: 'Groups, turns, and cooperation',
    types: ['team-split', 'merge', 'relay', 'turn', 'checklist', 'one-voice']
  },
  {
    name: 'Rounds',
    description: 'Repeat steps for each answer',
    types: ['foreach']
  },
  {
    name: 'AI',
    description: 'Let AI process or judge',
    types: ['ai-process', 'ai-eliminate']
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

  // Create the new phase with sensible defaults that produce a working step
  // out of the box. The Builder's certified hostable-as-is defaults win when
  // they exist (also turns the 'collect-two' brick into its real two-field
  // collect); the per-type chain below covers the rest.
  var certified = (window.StepSuggestions && StepSuggestions.defaultPhaseFor)
    ? StepSuggestions.defaultPhaseFor(type, { phases: gameConfig.phases })
    : null;
  var newPhase = certified || { type: type };

  if (certified) {
    // done — certified defaults are complete
  } else if (type === 'collect') {
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
  } else if (type === 'rate') {
    newPhase.prompt = 'Rate on each scale below.';
    newPhase.scales = [
      { id: 'originality',   label: 'Originality',   min: 1, max: 5, labels: { min: 'Familiar', max: 'Fresh' } },
      { id: 'effectiveness', label: 'Effectiveness', min: 1, max: 5, labels: { min: 'Weak',     max: 'Strong' } }
    ];
    newPhase.timer = 60;
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
  } else if (type === 'match') {
    newPhase.prompt = 'Match each item to its pair:';
    newPhase.pairs = [
      { left: 'chat', right: 'cat' },
      { left: 'chien', right: 'dog' },
      { left: 'oiseau', right: 'bird' }
    ];
    newPhase.timer = 60;
  } else if (type === 'sort') {
    newPhase.prompt = 'Which bucket does each item belong in?';
    newPhase.buckets = ['Metaphor', 'Simile'];
    newPhase.items = [
      { text: 'Her smile was the sun', bucket: 'Metaphor' },
      { text: 'Brave as a lion', bucket: 'Simile' },
      { text: 'Time is a thief', bucket: 'Metaphor' }
    ];
    newPhase.timer = 60;
  } else if (type === 'checklist') {
    newPhase.prompt = 'Work through today\'s tasks with your group.';
    newPhase.items = ['First task', 'Second task', 'Third task'];
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
  showToast('We added a typical setup, change anything you want');
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
    showToast('Cannot delete the ' + phase.type + ' phase.');
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
    // Branching votes: branch targets pointing at the deleted phase follow its next
    var nbw = gameConfig.phases[id].nextByWinner;
    if (nbw && typeof nbw === 'object') {
      for (var nbwKey in nbw) {
        if (nbw[nbwKey] === phaseId) {
          if (nextId) { nbw[nbwKey] = nextId; } else { delete nbw[nbwKey]; }
        }
      }
      if (Object.keys(nbw).length === 0) delete gameConfig.phases[id].nextByWinner;
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
  'team-split': ['method'],
  rank: ['prompt', 'candidates'],
  wager: ['prompt', 'options'],
  relay: ['prompt'],
  checklist: ['items'],
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
  checklist: ['prompt', 'progress', 'summary', 'timer', 'closeButton'],
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
  checklist: ['prompt', 'items', 'timer'],
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
  endButton: 'End Session button',
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
  progress: 'Progress display',
  summary: 'Groups-finished count'
};

function validateConfig() {
  var errors = [];
  var warnings = [];
  var phases = gameConfig.phases || {};
  var phaseIds = Object.keys(phases);

  // Top-level checks
  if (!gameConfig.name || !gameConfig.name.trim()) {
    errors.push('Your activity is missing a name.');
  }

  var hasLobby = phaseIds.some(function (id) { return phases[id].type === 'lobby'; });
  var hasEnd = phaseIds.some(function (id) { return phases[id].type === 'end'; });
  if (!hasLobby) errors.push('Your activity needs a Waiting room (lobby) step.');
  if (!hasEnd) errors.push('Your activity needs a Wrap Up (end) step.');

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

    // Branching votes: literal options + branch targets
    if (phase.type === 'vote') {
      if (Array.isArray(phase.candidates)) {
        var realOpts = phase.candidates.filter(function (c) { return typeof c === 'string' && c.trim().length > 0; });
        if (realOpts.length < 2) {
          errors.push(label + ': Needs at least 2 options to vote on.');
        }
      }
      if (phase.nextByWinner && typeof phase.nextByWinner === 'object') {
        for (var nbwOpt in phase.nextByWinner) {
          var nbwTarget = phase.nextByWinner[nbwOpt];
          if (!phases[nbwTarget]) {
            errors.push(label + ': "If this wins" for option "' + nbwOpt + '" points to a step that does not exist.');
          }
        }
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
        // Branching votes: nextByWinner targets are reachable too
        if (p.nextByWinner && typeof p.nextByWinner === 'object') {
          for (var nbw in p.nextByWinner) {
            if (p.nextByWinner[nbw] && !reachable[p.nextByWinner[nbw]]) queue.push(p.nextByWinner[nbw]);
          }
        }
      }
    }
    for (var k = 0; k < phaseIds.length; k++) {
      if (!reachable[phaseIds[k]]) {
        var uCat = PHASE_CATALOG[phases[phaseIds[k]].type];
        var uLabel = uCat ? uCat.friendlyName + ' (' + phaseIds[k] + ')' : phaseIds[k];
        warnings.push(uLabel + ': This step is unreachable from the flow.');
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
      // Create new game — derive ID from the game name
      var newId = (gameConfig.name || 'my-game')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40) || 'my-game';

      response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, config: gameConfig })
      });

      if (response.ok) {
        gameId = newId;
        if (window.MyGames) MyGames.add(newId);
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
      showToast('Save failed: ' + (result.error || 'Unknown error'));
      saveBtn.textContent = originalText;
    }
  } catch (error) {
    showToast('Save failed: ' + error.message);
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
  // Only open if we have a valid gameId (save succeeded). from=editor makes
  // the prototype page's back link return HERE, not to the library — you
  // preview, spot a fix, and need the way back (teacher feedback 2026-08-03).
  if (gameId) {
    window.open('/prototype?game=' + encodeURIComponent(gameId) + '&from=editor', '_blank');
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
      showToast('Review failed: ' + (err.error || 'Unknown error'));
      return;
    }
    var result = await response.json();
    lastReviewResult = result;
    applyReviewResults(result.ai);
    showReviewPanel(result);
  } catch (error) {
    showToast('Review failed: ' + error.message);
  } finally {
    reviewBtn.disabled = false;
    reviewBtn.textContent = 'Check for Errors';
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
  var sim = result.simulation || null;

  // Robot playtest banner — what actually happened when bots played it
  if (sim && !sim.failed) {
    var simDiv = document.createElement('div');
    var simErrors = (sim.findings || []).filter(function (f) { return f.severity === 'error'; });
    var seconds = Math.round((sim.durationMs || 0) / 1000);
    var steps = (sim.phaseLog || []).length;
    if (sim.completed && simErrors.length === 0) {
      simDiv.className = 'review-summary review-playtest review-playtest-ok';
      simDiv.textContent = '🤖 Robot playtest: 4 bots played your activity start to finish in ' +
        seconds + 's (' + steps + ' steps). No runtime problems.';
    } else if (sim.completed) {
      simDiv.className = 'review-summary review-playtest review-playtest-warn';
      simDiv.textContent = '🤖 Robot playtest: 4 bots reached the end in ' + seconds +
        's, but hit ' + simErrors.length + ' problem' + (simErrors.length === 1 ? '' : 's') + ' along the way, see below.';
    } else {
      simDiv.className = 'review-summary review-playtest review-playtest-bad';
      simDiv.textContent = '🤖 Robot playtest: 4 bots could NOT finish your activity, see below for where it got stuck.';
    }
    reviewContent.appendChild(simDiv);
  }

  // Summary
  if (ai.summary) {
    var summaryDiv = document.createElement('div');
    summaryDiv.className = 'review-summary';
    summaryDiv.textContent = humanizeReviewText(ai.summary);
    reviewContent.appendChild(summaryDiv);
  }

  // Collect all issues: structural errors + AI issues + playtest findings
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
  if (sim && sim.findings) {
    for (var s = 0; s < sim.findings.length; s++) {
      var f = sim.findings[s];
      allIssues.push({
        severity: f.severity,
        message: '🤖 ' + f.message,
        phaseId: f.phaseId || null,
        suggestion: null
      });
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
    noIssues.textContent = 'No issues found. Your activity looks good!';
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
      showToast('Could not generate fix: ' + (err.error || 'Unknown error'));
      return;
    }
    var result = await response.json();
    showFixPreview(phaseId, gameConfig.phases[phaseId], result.updatedPhase, result.explanation, issue);
  } catch (error) {
    showToast('Fix request failed: ' + error.message);
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
      html += previewBtn('startButton', 'Start!', null);
    } else {
      html += previewEl('message', 'Status', 'Waiting to start...', null);
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
      html += previewEl('name', 'Winner', '👑 Player1 wins!', showList);
      html += previewEl('entry', 'Winning entry', '“Their winning answer”', showList);
      html += previewEl('standings', 'Standings', '1st: Player1, 2nd: Player2...', showList);
      html += previewBtn('endButton', 'End Session', showList);
    } else {
      html += previewEl('name', 'Winner', '👑 Player1 wins!', showList);
      html += previewEl('entry', 'Winning entry', '“Their winning answer”', showList);
      html += previewEl('details', 'Details', 'Congratulations!', showList);
      html += previewEl('standings', 'Standings', '1st: Player1, 2nd: Player2...', showList);
    }
  }

  if (type === 'leaderboard') {
    if (screen === 'host') {
      html += previewEl('standings', 'Rankings', '1st Player1, 10pts, 2nd Player2, 7pts...', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's auto-advance', showList);
      html += previewBtn('continueButton', 'Continue', showList);
    } else {
      html += previewEl('rank', 'Your Rank', '#2: YourName', showList);
      html += previewEl('standings', 'Rankings', '1st Player1, 10pts, 2nd Player2, 7pts...', showList);
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

  if (type === 'checklist') {
    if (screen === 'host') {
      html += previewEl('prompt', 'Instructions', phase.prompt || 'Work through today\'s tasks!', showList);
      html += previewEl('summary', 'Summary', '2 of 6 groups finished', showList);
      html += previewEl('progress', 'Progress bars', 'Group 1 ▓▓▓░ 3/4  |  Group 2 ▓▓▓▓ 4/4 ✓', showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
      html += previewBtn('closeButton', 'End Work Time', showList);
    } else {
      html += previewEl('prompt', 'Instructions', phase.prompt || 'Work through today\'s tasks!', showList);
      html += previewEl('items', 'To-do list', '☑ ' + ((phase.items || [])[0] || 'First task') + '  |  ☐ ' + ((phase.items || [])[1] || 'Second task'), showList);
      if (phase.timer) html += previewEl('timer', 'Timer', phase.timer + 's countdown', showList);
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
    html += '<strong>For each item:</strong> ' + escapeHtml(phase.data || '?') + '<br>';
    for (var fi = 0; fi < feSubNames.length; fi++) {
      var fSub = phase.subPhases[feSubNames[fi]];
      var fSubCat = PHASE_CATALOG[fSub.type];
      html += (fi + 1) + '. ' + (fSubCat ? fSubCat.icon + ' ' : '') + escapeHtml(feSubNames[fi]) + ' (' + escapeHtml(fSubCat ? fSubCat.friendlyName : fSub.type) + ')<br>';
    }
    if (phase.aiInject) html += '<em>+ ' + (phase.aiInject.count || 1) + ' AI fakes mixed in</em><br>';
    if (phase.scoring) html += '<em>Scoring enabled</em>';
    html += '</div>';
  }

  if (type === 'end') {
    if (screen === 'host') {
      html += previewEl('message', 'Message', phase.message || 'That\'s a wrap!', showList);
      html += previewBtn('playAgainButton', 'Play Again', showList);
    } else {
      html += previewEl('message', 'Message', phase.message || 'That\'s a wrap!', showList);
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
    title.textContent = 'Ask AI to revise this activity';
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
  status.textContent = 'AI is revising' + (askAiContext ? ' this step' : ' the activity') + '... (10-30 seconds)';
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
        errors.map(function (e) { return '<li>' + escapeHtml(humanizeReviewText(e)) + '</li>'; }).join('') +
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

// =======================================================================
// Save as Recipe modal (R5)
//
// Two-step modal:
//
//   Step 1: Pick parameters
//     POST /api/recipes/draft with current gameConfig → list of candidates
//     Render each as a row with checkbox + name + label inputs
//     Defaults: all checked, names auto-generated, labels humanized
//
//   Step 2: Recipe metadata
//     ID (auto from name), display name, description, icon emoji, tagline
//
//   Submit → POST /api/recipes/user → success toast → close modal
//
// The user can then go to /designer and see their recipe in the picker.
// =======================================================================

async function openSaveAsRecipeModal() {
  if (!gameConfig) {
    showToast('Still loading. Try again in a moment.');
    return;
  }

  var existing = document.getElementById('save-as-recipe-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'save-as-recipe-modal';
  overlay.className = 'sar-overlay';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  var modal = document.createElement('div');
  modal.className = 'sar-modal';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.innerHTML = '<p class="sar-loading">Analyzing your activity...</p>';

  // Fetch candidates
  var candidates;
  try {
    var resp = await fetch('/api/recipes/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: gameConfig })
    });
    if (!resp.ok) throw new Error('status ' + resp.status);
    var data = await resp.json();
    candidates = data.candidates || [];
  } catch (err) {
    modal.innerHTML = '';
    var errEl = document.createElement('p');
    errEl.style.cssText = 'color:#FF2D2D; padding:20px; text-align:center;';
    errEl.textContent = 'Could not analyze activity: ' + err.message;
    modal.appendChild(errEl);
    return;
  }

  if (candidates.length === 0) {
    modal.innerHTML = '<p class="sar-loading">No parameterizable fields found. Try adding some prompts or messages first.</p>';
    return;
  }

  renderSarCandidatesView(modal, candidates, overlay);
}

function renderSarCandidatesView(modal, candidates, overlay) {
  modal.innerHTML = '';

  var title = document.createElement('h2');
  title.className = 'sar-title';
  title.textContent = 'Save as Recipe';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'sar-subtitle';
  subtitle.textContent = 'Pick which fields other teachers can fill in. Unchecked fields stay fixed at their current values.';
  modal.appendChild(subtitle);

  var listWrap = document.createElement('div');
  listWrap.className = 'sar-candidate-list';
  listWrap.id = 'sar-candidate-list';

  for (var i = 0; i < candidates.length; i++) {
    listWrap.appendChild(buildSarCandidateRow(candidates[i], i));
  }

  modal.appendChild(listWrap);

  var footer = document.createElement('div');
  footer.className = 'sar-modal-footer';

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'sar-btn sar-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function () { overlay.remove(); });
  footer.appendChild(cancelBtn);

  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'sar-btn sar-btn-primary';
  nextBtn.textContent = 'Next: Recipe Details →';
  nextBtn.addEventListener('click', function () {
    var paramSpecs = collectSarParamSpecs(listWrap);
    if (paramSpecs.error) {
      showToast(paramSpecs.error);
      return;
    }
    if (paramSpecs.specs.length === 0) {
      if (!confirm('No parameters selected. The recipe will produce the exact same activity every time. Continue anyway?')) {
        return;
      }
    }
    renderSarMetadataView(modal, candidates, paramSpecs.specs, overlay);
  });
  footer.appendChild(nextBtn);

  modal.appendChild(footer);
}

function buildSarCandidateRow(candidate, idx) {
  var row = document.createElement('div');
  row.className = 'sar-candidate-row';
  row.setAttribute('data-path', candidate.path);
  row.setAttribute('data-idx', idx);

  // Checkbox
  var checkLabel = document.createElement('label');
  checkLabel.className = 'sar-candidate-check-wrap';
  var check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'sar-candidate-check';
  check.checked = true;
  checkLabel.appendChild(check);

  // Field info (path + current value preview)
  var info = document.createElement('div');
  info.className = 'sar-candidate-info';

  var pathLabel = document.createElement('div');
  pathLabel.className = 'sar-candidate-path';
  pathLabel.textContent = candidate.suggestedLabel;
  info.appendChild(pathLabel);

  var pathTech = document.createElement('div');
  pathTech.className = 'sar-candidate-path-tech';
  pathTech.textContent = candidate.path + ' (' + candidate.fieldType + ')';
  info.appendChild(pathTech);

  var preview = document.createElement('div');
  preview.className = 'sar-candidate-preview';
  preview.textContent = sarFormatPreview(candidate.currentValue);
  info.appendChild(preview);

  checkLabel.appendChild(info);
  row.appendChild(checkLabel);

  // Editable name + label fields (only visible when checked)
  var details = document.createElement('div');
  details.className = 'sar-candidate-details';

  var nameField = document.createElement('div');
  nameField.className = 'sar-candidate-field';
  var nameLabel = document.createElement('label');
  nameLabel.textContent = 'Parameter name';
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'sar-input sar-name-input';
  nameInput.value = candidate.suggestedName;
  nameInput.placeholder = 'paramName';
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);
  details.appendChild(nameField);

  var labelField = document.createElement('div');
  labelField.className = 'sar-candidate-field';
  var labelLabel = document.createElement('label');
  labelLabel.textContent = 'Display label';
  var labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'sar-input sar-label-input';
  labelInput.value = candidate.suggestedLabel;
  labelInput.placeholder = 'What teachers see';
  labelField.appendChild(labelLabel);
  labelField.appendChild(labelInput);
  details.appendChild(labelField);

  row.appendChild(details);

  // Toggle details visibility when checkbox changes
  check.addEventListener('change', function () {
    if (check.checked) {
      details.style.display = '';
      row.classList.remove('sar-candidate-row-disabled');
    } else {
      details.style.display = 'none';
      row.classList.add('sar-candidate-row-disabled');
    }
  });

  return row;
}

function sarFormatPreview(value) {
  if (value == null) return '(empty)';
  if (Array.isArray(value)) return value.join(', ').slice(0, 80);
  var str = String(value);
  return str.length > 80 ? str.slice(0, 80) + '…' : str;
}

function collectSarParamSpecs(listWrap) {
  var specs = [];
  var seenNames = {};
  var rows = listWrap.querySelectorAll('.sar-candidate-row');

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var check = row.querySelector('.sar-candidate-check');
    if (!check.checked) continue;

    var path = row.getAttribute('data-path');
    var nameInput = row.querySelector('.sar-name-input');
    var labelInput = row.querySelector('.sar-label-input');

    var name = (nameInput.value || '').trim();
    if (!name) {
      return { error: 'A parameter is missing a name. Edit or uncheck it before continuing.' };
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return { error: 'Parameter name "' + name + '" must start with a letter or underscore and contain only letters, numbers, and underscores.' };
    }
    if (seenNames[name]) {
      return { error: 'Duplicate parameter name "' + name + '". Each parameter needs a unique name.' };
    }
    seenNames[name] = true;

    specs.push({
      path: path,
      name: name,
      label: (labelInput.value || '').trim()
    });
  }

  return { specs: specs };
}

function renderSarMetadataView(modal, candidates, paramSpecs, overlay) {
  modal.innerHTML = '';

  var title = document.createElement('h2');
  title.className = 'sar-title';
  title.textContent = 'Recipe Details';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'sar-subtitle';
  subtitle.textContent = 'How will this recipe appear in the picker?';
  modal.appendChild(subtitle);

  // Form
  var form = document.createElement('div');
  form.className = 'sar-metadata-form';

  // Recipe id (auto from name, editable)
  var idField = sarBuildField('id', 'Recipe ID', 'short, lowercase, no spaces. Used as the filename.');
  var idInput = idField.input;
  idInput.placeholder = 'my-discussion-game';
  form.appendChild(idField.wrap);

  // Recipe name
  var nameField = sarBuildField('name', 'Recipe name', 'What teachers see in the picker.');
  var nameInput = nameField.input;
  nameInput.placeholder = 'My Discussion Game';
  // Auto-derive id from name
  nameInput.addEventListener('input', function () {
    if (!idInput.dataset.userEdited) {
      idInput.value = nameInput.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
  });
  idInput.addEventListener('input', function () {
    idInput.dataset.userEdited = 'true';
  });
  // Pre-fill name from gameConfig
  if (gameConfig && gameConfig.name) {
    nameInput.value = gameConfig.name;
    idInput.value = gameConfig.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  form.appendChild(nameField.wrap);

  // Icon
  var iconField = sarBuildField('icon', 'Icon (one emoji)', 'A visual marker for the picker card.');
  iconField.input.placeholder = '🧩';
  iconField.input.value = '🧩';
  iconField.input.maxLength = 4;
  form.appendChild(iconField.wrap);

  // Description
  var descField = sarBuildField('description', 'Description', 'What this recipe is for. One or two sentences.', /* multiline */ true);
  descField.input.placeholder = 'A discussion activity where students share ideas and AI groups them into themes.';
  if (gameConfig && gameConfig.description) {
    descField.input.value = gameConfig.description;
  }
  form.appendChild(descField.wrap);

  // Tagline
  var taglineField = sarBuildField('tagline', 'Tagline (optional)', "Perfect for...");
  taglineField.input.placeholder = 'Perfect for opening a unit.';
  form.appendChild(taglineField.wrap);

  modal.appendChild(form);

  // Status display
  var status = document.createElement('div');
  status.className = 'sar-status';
  status.id = 'sar-save-status';
  modal.appendChild(status);

  // Footer buttons
  var footer = document.createElement('div');
  footer.className = 'sar-modal-footer';

  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'sar-btn sar-btn-cancel';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', function () {
    renderSarCandidatesView(modal, candidates, overlay);
  });
  footer.appendChild(backBtn);

  var saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'sar-btn sar-btn-primary';
  saveBtn.textContent = 'Save Recipe';
  saveBtn.addEventListener('click', function () {
    var metadata = {
      id: idField.input.value.trim(),
      name: nameField.input.value.trim(),
      icon: iconField.input.value.trim() || '🧩',
      description: descField.input.value.trim(),
      tagline: taglineField.input.value.trim() || undefined
    };
    submitSaveAsRecipe(modal, paramSpecs, metadata, status, saveBtn, overlay);
  });
  footer.appendChild(saveBtn);

  modal.appendChild(footer);

  nameField.input.focus();
}

function sarBuildField(id, label, helper, multiline) {
  var wrap = document.createElement('div');
  wrap.className = 'sar-field';

  var lbl = document.createElement('label');
  lbl.className = 'sar-field-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  if (helper) {
    var help = document.createElement('div');
    help.className = 'sar-field-helper';
    help.textContent = helper;
    wrap.appendChild(help);
  }

  var input = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) input.type = 'text';
  if (multiline) input.rows = 2;
  input.id = 'sar-field-' + id;
  input.className = 'sar-input';
  wrap.appendChild(input);

  return { wrap: wrap, input: input };
}

async function submitSaveAsRecipe(modal, paramSpecs, metadata, status, saveBtn, overlay) {
  status.className = 'sar-status';
  status.textContent = '';

  // Front-end sanity check
  if (!metadata.id) {
    showSarError(status, 'Recipe ID is required.');
    return;
  }
  if (!/^[a-z0-9-]+$/.test(metadata.id)) {
    showSarError(status, 'Recipe ID must be lowercase letters, numbers, and dashes only.');
    return;
  }
  if (!metadata.name) {
    showSarError(status, 'Recipe name is required.');
    return;
  }
  if (!metadata.description) {
    showSarError(status, 'Recipe description is required.');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    var resp = await fetch('/api/recipes/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: gameConfig,
        params: paramSpecs,
        metadata: metadata
      })
    });
    var data = await resp.json();

    if (!resp.ok) {
      showSarError(status, data.error || 'Save failed.', data.diagnostics);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Recipe';
      return;
    }

    // Success view
    renderSarSuccessView(modal, data.recipe, overlay);
  } catch (err) {
    showSarError(status, 'Network error: ' + err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Recipe';
  }
}

function renderSarSuccessView(modal, recipe, overlay) {
  modal.innerHTML = '';

  var title = document.createElement('h2');
  title.className = 'sar-title';
  title.textContent = '✓ Recipe Saved';
  modal.appendChild(title);

  var card = document.createElement('div');
  card.className = 'sar-success-card';

  var iconEl = document.createElement('div');
  iconEl.className = 'sar-success-icon';
  iconEl.textContent = recipe.icon || '🧩';
  card.appendChild(iconEl);

  var nameEl = document.createElement('div');
  nameEl.className = 'sar-success-name';
  nameEl.textContent = recipe.name;
  card.appendChild(nameEl);

  var descEl = document.createElement('div');
  descEl.className = 'sar-success-desc';
  descEl.textContent = recipe.description;
  card.appendChild(descEl);

  modal.appendChild(card);

  var note = document.createElement('p');
  note.className = 'sar-subtitle';
  note.textContent = 'Your recipe is now available in the picker. Open the designer to use it.';
  modal.appendChild(note);

  var footer = document.createElement('div');
  footer.className = 'sar-modal-footer';

  var doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'sar-btn sar-btn-primary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', function () { overlay.remove(); });
  footer.appendChild(doneBtn);

  var openDesignerBtn = document.createElement('button');
  openDesignerBtn.type = 'button';
  openDesignerBtn.className = 'sar-btn sar-btn-cancel';
  openDesignerBtn.textContent = 'Open Designer';
  openDesignerBtn.addEventListener('click', function () { window.location.href = '/designer'; });
  footer.appendChild(openDesignerBtn);

  modal.appendChild(footer);
}

function showSarError(status, message, diagnostics) {
  status.className = 'sar-status sar-status-error';
  status.innerHTML = '';

  var heading = document.createElement('strong');
  heading.textContent = message;
  status.appendChild(heading);

  if (diagnostics && diagnostics.length > 0) {
    var ul = document.createElement('ul');
    for (var i = 0; i < diagnostics.length; i++) {
      var d = diagnostics[i];
      if (d.severity !== 'error') continue;
      var li = document.createElement('li');
      li.textContent = d.message;
      ul.appendChild(li);
    }
    status.appendChild(ul);
  }
}

// --- Start ---
init();
