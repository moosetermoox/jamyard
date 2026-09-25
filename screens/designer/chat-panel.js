/**
 * Design chat panel — the editor's right-side AI chat (Simple view only).
 *
 * Replaces the old single-shot Ask AI modal (2026-08-15). The bot
 * brainstorms and answers in cheap fast turns; when the teacher asks for
 * a concrete change, the server returns a PROPOSAL card with the revised
 * config attached. Nothing touches gameConfig until the teacher clicks
 * Apply, Apply is disabled while the proposal has validation errors, and
 * an applied change can be reverted (one step: a new Apply replaces the
 * snapshot).
 *
 * Loads LAST on the page: its renderCanvas wrapper must be outermost so
 * visibility syncs after the Simple/Builder wrappers run. Talks to the
 * editor through the classic-script globals (gameConfig, isDirty,
 * renderCanvas, renderSettings, ...). All message DOM is built with
 * createElement + textContent — AI output is untrusted for rendering.
 *
 * Conversation state is per page load by design: history lives in this
 * file, is capped client-side (and re-trimmed server-side), and proposal
 * turns enter history as prose with a status token, never as configs.
 *
 * Browser global (window.ChatPanel) + side-effect-importable for tests.
 */
(function (global) {
  'use strict';

  // ---- Pure helpers (unit-tested directly) ----

  // A proposal can only be applied when server validation found no
  // structural errors. Warnings do not block.
  function canApply(proposal) {
    if (!proposal || !proposal.updatedConfig) return false;
    var errors = (proposal.structural && proposal.structural.errors) || [];
    return errors.length === 0;
  }

  // What a proposal turn looks like in the history sent back to the
  // model: the reply plus a status token, NEVER the config itself.
  function historyEntryForProposal(reply, summary, status) {
    return (reply || '') + ' [Proposed a change: ' + (summary || '') + ' | status: ' + status + ']';
  }

  // Rewrite the status token when the teacher acts, so the model's
  // context stays truthful ("that change was discarded, try smaller").
  function setProposalStatus(entry, status) {
    return String(entry).replace(/\| status: [a-z]+\]$/, '| status: ' + status + ']');
  }

  // "Just do it" is the way out of a conversation that has said enough:
  // offered once the AI has replied at least once, never while a reply is
  // in flight or a proposal card is still waiting for a decision (that
  // card IS the change; a second ask would only expire it).
  function canJustDoIt(state) {
    state = state || {};
    if (state.inFlight || state.hasPendingProposal) return false;
    var history = state.history || [];
    for (var i = 0; i < history.length; i++) {
      if (history[i] && history[i].role === 'assistant') return true;
    }
    return false;
  }

  var JUST_DO_IT_TEXT = 'Just do it.';

  global.ChatPanel = {
    canApply: canApply,
    canJustDoIt: canJustDoIt,
    JUST_DO_IT_TEXT: JUST_DO_IT_TEXT,
    historyEntryForProposal: historyEntryForProposal,
    setProposalStatus: setProposalStatus
  };

  // ---- DOM wiring (browser only) ----
  if (typeof document === 'undefined') return;
  var panel = document.getElementById('chat-panel');
  if (!panel) return;

  var messagesEl = document.getElementById('chat-messages');
  var inputEl = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');
  var clearBtn = document.getElementById('chat-clear');
  var chipEl = document.getElementById('chat-context-chip');
  var chipLabelEl = document.getElementById('chat-context-label');
  var chipClearBtn = document.getElementById('chat-context-clear');
  var quickRow = document.getElementById('chat-quick-row');
  var justDoItBtn = document.getElementById('chat-just-do-it');

  var chatHistory = [];        // {role, content} — what the server sees
  var chatFocusPhaseId = null; // rides the next send, then clears
  var chatUndoSnapshot = null; // config before the last Apply (single depth)
  var inFlight = false;
  var liveCard = null;         // the one pending proposal card, if any
  var revertCard = null;       // the one applied card whose Revert is live

  function humanize(text) {
    return typeof humanizeReviewText === 'function' ? humanizeReviewText(text) : text;
  }

  function scrollToEnd() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addLine(className, text) {
    var div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollToEnd();
    return div;
  }

  function addBubble(role, text) {
    return addLine(role === 'user' ? 'chat-msg chat-msg-user' : 'chat-msg chat-msg-ai', text);
  }

  function addSystem(text) {
    return addLine('chat-system', text);
  }

  // ---- Proposal cards ----

  function setCardState(card, label) {
    var actions = card.querySelector('.chat-proposal-actions');
    if (actions) actions.remove();
    var status = card.querySelector('.chat-proposal-status');
    if (status) status.textContent = label;
    card.className = 'chat-proposal chat-proposal-' + label.toLowerCase();
  }

  function expirePending() {
    if (liveCard) {
      setCardState(liveCard, 'Expired');
      liveCard = null;
    }
  }

  function dropOldRevert() {
    if (revertCard) {
      var btn = revertCard.querySelector('.chat-revert-btn');
      if (btn) btn.remove();
      revertCard = null;
    }
  }

  function updateHistoryStatus(historyIndex, status) {
    if (chatHistory[historyIndex]) {
      chatHistory[historyIndex].content = setProposalStatus(chatHistory[historyIndex].content, status);
    }
  }

  function addProposalCard(proposal, historyIndex) {
    expirePending();
    var card = document.createElement('div');
    card.className = 'chat-proposal';

    var status = document.createElement('div');
    status.className = 'chat-proposal-status';
    status.textContent = 'Proposed change';
    card.appendChild(status);

    var summary = document.createElement('div');
    summary.className = 'chat-proposal-summary';
    summary.textContent = humanize(proposal.summary || 'The AI drafted a change.');
    card.appendChild(summary);

    // What the draft actually changes, read off the two configs, never
    // the AI's words (shared/config-diff.js): a summary that promises
    // more than the draft does is caught here, before Apply.
    if (global.ConfigDiff && proposal.updatedConfig) {
      var changes = global.ConfigDiff.describe(gameConfig, proposal.updatedConfig);
      var diffHead = document.createElement('div');
      diffHead.className = 'chat-proposal-diff-head';
      diffHead.textContent = changes.length ? 'What actually changes:' : 'Nothing in the activity changes with this draft.';
      card.appendChild(diffHead);
      if (changes.length) {
        var diffList = document.createElement('ul');
        diffList.className = 'chat-proposal-diff';
        for (var c = 0; c < changes.length && c < 12; c++) {
          var item = document.createElement('li');
          item.textContent = changes[c];
          diffList.appendChild(item);
        }
        if (changes.length > 12) {
          var more = document.createElement('li');
          more.textContent = 'and ' + (changes.length - 12) + ' more';
          diffList.appendChild(more);
        }
        card.appendChild(diffList);
      }
    }

    var errors = (proposal.structural && proposal.structural.errors) || [];
    if (errors.length > 0) {
      var errHead = document.createElement('div');
      errHead.className = 'chat-proposal-errors-head';
      errHead.textContent = 'This draft has problems, so it can\'t be applied:';
      card.appendChild(errHead);
      var list = document.createElement('ul');
      list.className = 'chat-proposal-errors';
      for (var i = 0; i < errors.length; i++) {
        var li = document.createElement('li');
        li.textContent = humanize(errors[i]);
        list.appendChild(li);
      }
      card.appendChild(list);
    }

    var actions = document.createElement('div');
    actions.className = 'chat-proposal-actions';

    var applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-primary chat-apply-btn';
    applyBtn.textContent = 'Apply';
    if (!canApply(proposal)) {
      applyBtn.disabled = true;
      applyBtn.title = 'Fix these problems first, or Discard and ask again';
    }
    applyBtn.addEventListener('click', function () {
      applyProposal(card, proposal, historyIndex);
    });
    actions.appendChild(applyBtn);

    var discardBtn = document.createElement('button');
    discardBtn.type = 'button';
    discardBtn.className = 'btn btn-secondary';
    discardBtn.textContent = 'Discard';
    discardBtn.addEventListener('click', function () {
      if (liveCard === card) liveCard = null;
      setCardState(card, 'Discarded');
      updateHistoryStatus(historyIndex, 'discarded');
      syncQuickRow();
    });
    actions.appendChild(discardBtn);

    card.appendChild(actions);
    messagesEl.appendChild(card);
    liveCard = card;
    syncQuickRow();
    scrollToEnd();
  }

  function refreshEditorAfterConfigSwap() {
    isDirty = true;
    renderCanvas();
    // The old modal forgot this: AI changes to name/description/theme
    // must refresh the left settings sidebar too.
    renderSettings();
    if (selectedPhaseId && !(gameConfig.phases && gameConfig.phases[selectedPhaseId])) {
      deselectPhase();
    }
  }

  function applyProposal(card, proposal, historyIndex) {
    if (!canApply(proposal) || !gameConfig) return;
    // Snapshot at APPLY time, not proposal time: Revert then also
    // restores any inline edits made while the card sat waiting.
    dropOldRevert();
    chatUndoSnapshot = JSON.parse(JSON.stringify(gameConfig));
    gameConfig = proposal.updatedConfig;
    refreshEditorAfterConfigSwap();
    if (liveCard === card) liveCard = null;
    setCardState(card, 'Applied');
    updateHistoryStatus(historyIndex, 'applied');

    var revertBtn = document.createElement('button');
    revertBtn.type = 'button';
    revertBtn.className = 'btn btn-secondary chat-revert-btn';
    revertBtn.textContent = 'Revert';
    revertBtn.title = 'Put the activity back the way it was before this change';
    revertBtn.addEventListener('click', function () {
      if (!chatUndoSnapshot) return;
      gameConfig = chatUndoSnapshot;
      chatUndoSnapshot = null;
      refreshEditorAfterConfigSwap();
      revertBtn.remove();
      revertCard = null;
      setCardState(card, 'Reverted');
      updateHistoryStatus(historyIndex, 'reverted');
      if (typeof showToast === 'function') showToast('Change reverted');
    });
    card.appendChild(revertBtn);
    revertCard = card;
    syncQuickRow();
    if (typeof showToast === 'function') showToast('Change applied');
  }

  // ---- Send flow ----

  function updateSendState() {
    sendBtn.disabled = inFlight;
    inputEl.disabled = inFlight;
    syncQuickRow();
  }

  function syncQuickRow() {
    if (!quickRow) return;
    quickRow.hidden = !canJustDoIt({
      history: chatHistory,
      inFlight: inFlight,
      hasPendingProposal: !!liveCard
    });
  }

  // opts.text sends that instead of the box (the box is left alone);
  // opts.forceEdit tells the server this turn must come back as a
  // proposal, not more conversation (the Just do it button).
  function sendMessage(opts) {
    opts = opts || {};
    var fromButton = typeof opts.text === 'string';
    var text = fromButton ? opts.text.trim() : inputEl.value.trim();
    if (!text || inFlight || !gameConfig) return;

    expirePending();
    chatHistory.push({ role: 'user', content: text });
    addBubble('user', text);
    if (!fromButton) inputEl.value = '';

    var focusId = chatFocusPhaseId;
    clearContextChip();

    inFlight = true;
    updateSendState();
    var thinking = addLine('chat-thinking', 'Thinking...');
    var slowTimer = setTimeout(function () {
      thinking.textContent = 'Working on it, a big change can take a minute or two';
    }, 5000);

    var controller = new AbortController();
    // Past the server's own limit on the rewrite (ai-service.js, 110 s)
    var abortTimer = setTimeout(function () { controller.abort(); }, 125000);

    fetch('/api/games/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: gameConfig,
        messages: chatHistory.slice(-12),
        focusPhaseId: focusId,
        forceEdit: !!opts.forceEdit,
        classDescription: global.TeacherProfile ? TeacherProfile.describe() : ''
      }),
      signal: controller.signal
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          addSystem('Couldn\'t reach the AI: ' + (data.error || 'Server error'));
          return;
        }
        if (data.kind === 'proposal' && data.proposal) {
          var idx = chatHistory.length;
          chatHistory.push({
            role: 'assistant',
            content: historyEntryForProposal(data.reply, data.proposal.summary, 'pending')
          });
          if (data.reply) addBubble('ai', humanize(data.reply));
          addProposalCard(data.proposal, idx);
        } else {
          var reply = data.reply || 'Sorry, I lost my train of thought. Ask me again?';
          chatHistory.push({ role: 'assistant', content: reply });
          addBubble('ai', humanize(reply));
        }
      });
    }).catch(function (e) {
      addSystem(e.name === 'AbortError'
        ? 'That took too long and was cancelled. Try asking again.'
        : 'Error: ' + e.message);
    }).finally(function () {
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      thinking.remove();
      inFlight = false;
      updateSendState();
      inputEl.focus();
      scrollToEnd();
    });
  }

  // ---- Context chip (per-step entry point) ----

  function showContextChip(phaseId) {
    chatFocusPhaseId = phaseId;
    var name = typeof getFriendlyPhaseName === 'function' ? getFriendlyPhaseName(phaseId) : phaseId;
    chipLabelEl.textContent = 'Talking about: ' + name;
    chipEl.hidden = false;
  }

  function clearContextChip() {
    chatFocusPhaseId = null;
    chipEl.hidden = true;
  }

  // ---- Visibility: Simple view only ----

  function syncChatVisibility() {
    var simpleView = document.getElementById('simple-view');
    var show = simpleView && !simpleView.hidden &&
      !document.body.classList.contains('builder-mode');
    panel.hidden = !show;
    // The feedback widget's fixed corner button would sit on top of the
    // chat input; the body class shifts it left of the panel (editor.css).
    document.body.classList.toggle('chat-open', show);
  }

  // Entry point for the header ✨ button and the per-step buttons.
  function openDesignChat(phaseId) {
    var simpleView = document.getElementById('simple-view');
    if (simpleView && simpleView.hidden) {
      var simpleBtn = document.getElementById('view-simple-btn');
      if (simpleBtn) simpleBtn.click();
    }
    if (phaseId) showContextChip(phaseId);
    syncChatVisibility();
    inputEl.focus();
  }
  global.openDesignChat = openDesignChat;

  // Programmatic entry: the robot playtest hands its findings here so
  // fixing flows through the one pipeline teachers already know
  // (proposal card, Apply, Revert). The text lands as a normal user
  // message, visible in the thread. Returns false when the chat is busy.
  function sendDesignChat(text) {
    if (inFlight || !text || !gameConfig) return false;
    openDesignChat();
    inputEl.value = String(text);
    sendMessage();
    return true;
  }
  global.sendDesignChat = sendDesignChat;

  // ---- Wiring ----

  sendBtn.addEventListener('click', function () { sendMessage(); });
  if (justDoItBtn) {
    justDoItBtn.addEventListener('click', function () {
      sendMessage({ text: JUST_DO_IT_TEXT, forceEdit: true });
    });
  }
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chipClearBtn.addEventListener('click', clearContextChip);
  clearBtn.addEventListener('click', function () {
    if (inFlight) return;
    chatHistory = [];
    messagesEl.textContent = '';
    clearContextChip();
    liveCard = null;
    syncQuickRow();
    addHint();
  });

  function addHint() {
    addLine('chat-hint',
      'Ask about your activity, brainstorm ideas, or describe a change. Nothing is changed until you approve it. Done talking? Press Just do it and the AI drafts the change.');
  }
  addHint();

  // renderCanvas is reassigned by simple-view.js and builder-view.js;
  // this file loads last, so this wrapper is outermost and visibility
  // syncs after every view change and re-render.
  var _origRenderCanvas = renderCanvas;
  renderCanvas = function () {
    _origRenderCanvas();
    syncChatVisibility();
  };

  var viewBtnIds = ['view-simple-btn', 'view-builder-btn', 'view-advanced-btn'];
  for (var b = 0; b < viewBtnIds.length; b++) {
    var btn = document.getElementById(viewBtnIds[b]);
    if (btn) btn.addEventListener('click', syncChatVisibility);
  }
  syncChatVisibility();
})(typeof window !== 'undefined' ? window : globalThis);
