// activity-map.js — draws the treasure-map summary of an activity's path
// inside the activity popups (library plank popup, home carousel popup).
//
// The point: a teacher sees WHAT HAPPENS (write, then vote, then reveal,
// then a winner) without reading the whole plan or playing it in preview.
// A pencil-dashed trail runs stop to stop; painted number blocks wear the
// step-family colors (same coding as the editor's stack); the trail ends
// at a drawn red X, the wrap-up. Treasure-map spirit, Totem materials.
//
// Data: GET /api/games/:id/map (engine/activity-map.js). Names come from
// shared/phase-names.js (load it first). Step details are teacher config,
// untrusted: everything renders through textContent.
//
// Plain script (browser global): window.ActivityMap = { attach, render }.

(function () {
  'use strict';

  // Same family coding as the editor's stack (simple-view.js svFamily):
  // ask / show / decide / team / ai.
  function familyOf(type) {
    if (type === 'ai-process' || type === 'ai-eliminate') return 'ai';
    if (type === 'collect' || type === 'collect-choice' || type === 'estimate' ||
        type === 'collect-two' || type === 'match' || type === 'sort' || type === 'buzz' ||
        type === 'solo-quiz') return 'ask';
    if (type === 'announce' || type === 'reveal' || type === 'reveal-one' ||
        type === 'leaderboard' || type === 'winner' || type === 'preview') return 'show';
    if (type === 'vote' || type === 'rank' || type === 'rate' ||
        type === 'wager' || type === 'eliminate') return 'decide';
    return 'team';
  }

  function nameOf(type) {
    return (window.PHASE_NAMES && window.PHASE_NAMES[type]) || type;
  }

  // Trail riders: student-voice labels for the hand-offs the engine found
  // (stop.carries). This is the product's comparative advantage made
  // visible — students working off each other's thoughts — so the wording
  // stays second person and concrete. Unknown keys draw nothing.
  var CARRY_COPY = {
    'classmate-work': "a classmate's work lands on your screen",
    'partner-swap': 'you and a partner trade what you made',
    'back-to-author': 'your work comes back to you, grown',
    'answers-become-choices': "classmates' answers become the choices",
    'class-judges-own': 'the class votes on what everyone made',
    'ai-reads-pile': "AI works on the whole class's answers",
    'work-goes-up-front': "everyone's work goes up on the projector",
    'partners-combine': 'partners combine their answers into one',
    'build-on-last': 'each student adds to what the last one made',
    'round-per-answer': 'a round for each answer the class wrote'
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function render(map) {
    var stops = map.stops;
    var wrap = el('div', 'amap');
    wrap.setAttribute('aria-label', 'How this activity plays out, step by step');
    wrap.appendChild(el('div', 'amap-trail'));

    var start = el('div', 'amap-row amap-startrow');
    start.appendChild(el('span', 'amap-start-chip', 'Everyone joins'));
    wrap.appendChild(start);

    // Talk-driven activity: say it up front, in the trail's own voice.
    if (map.talk) {
      var talkNote = el('div', 'amap-rider');
      talkNote.appendChild(el('span', 'amap-rider-note',
        'nothing to type: the screen asks, the class talks'));
      wrap.appendChild(talkNote);
    }

    for (var i = 0; i < stops.length; i++) {
      var stop = stops[i];

      // The hand-off rides the trail ABOVE the stop it feeds: a small
      // paper note pinned where the student work travels.
      if (stop.carries && CARRY_COPY[stop.carries]) {
        var rider = el('div', 'amap-rider');
        rider.appendChild(el('span', 'amap-rider-note', CARRY_COPY[stop.carries]));
        wrap.appendChild(rider);
      }

      var row = el('div', 'amap-row');

      var isRounds = stop.kind === 'rounds';
      var fam = isRounds ? 'rounds' : familyOf(stop.type);
      var num = el('span', 'amap-num amap-fam-' + fam, String(i + 1));
      num.style.setProperty('--rot', ((i % 2 ? 1 : -1) * (1 + (i % 3) * 0.6)).toFixed(1) + 'deg');
      row.appendChild(num);

      var body = el('div', 'amap-body');
      if (isRounds) {
        var sub = stop.sub || [];
        if (sub.length === 1 && stop.rounds !== null) {
          // A run of one step type: name the step, not "rounds" (Closer's
          // 13 talk screens are not game rounds).
          body.appendChild(el('span', 'amap-name',
            stop.rounds + ' × ' + nameOf(sub[0])));
        } else {
          var roundsLabel = stop.rounds === null
            ? 'Rounds, one per answer'
            : stop.rounds + ' rounds';
          body.appendChild(el('span', 'amap-name', roundsLabel));
          var subNames = sub.map(nameOf).join(' → ');
          if (subNames) body.appendChild(el('span', 'amap-sub', subNames));
        }
      } else {
        body.appendChild(el('span', 'amap-name', nameOf(stop.type)));
        if (stop.branches) {
          body.appendChild(el('span', 'amap-sub',
            'The class\'s pick decides the path (' + stop.branches + ' doors)'));
        }
      }
      var quotes = stop.samples || (stop.detail ? [stop.detail] : []);
      for (var q = 0; q < quotes.length; q++) {
        body.appendChild(el('span', 'amap-detail', '“' + quotes[q] + '”'));
      }
      row.appendChild(body);
      wrap.appendChild(row);
    }

    var endRow = el('div', 'amap-row amap-endrow');
    var x = el('span', 'amap-x');
    x.setAttribute('aria-hidden', 'true');
    endRow.appendChild(x);
    endRow.appendChild(el('span', 'amap-end-label', 'Wrap up'));
    wrap.appendChild(endRow);

    return wrap;
  }

  // Fetch the map and drop it into `container` when it arrives. Quietly
  // does nothing on any failure: the popup works fine without the map.
  // opts.edits (2026-09-24): the class example's words (the make page's
  // edit shape: prompt, fields, pairs, choices), so the map reads the
  // question the card showed, not the template's; it goes through the
  // same make route the make page redraws from.
  function attach(gameId, container, opts) {
    opts = opts || {};
    var request = opts.edits
      ? fetch('/api/games/' + encodeURIComponent(gameId) + '/make', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts.edits)
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.map ? d.map : null; })
      : fetch('/api/games/' + encodeURIComponent(gameId) + '/map').then(function (r) { return r.ok ? r.json() : null; });
    request
      .then(function (map) {
        if (!map || !Array.isArray(map.stops) || map.stops.length === 0) return;
        if (!container.isConnected) return; // popup already closed
        container.appendChild(render(map));
      })
      .catch(function () { /* the map is garnish, never block the popup */ });
  }

  window.ActivityMap = { attach: attach, render: render };
})();
