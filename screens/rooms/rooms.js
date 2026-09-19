// Rooms log (owner-only; the server demands the owner password before
// serving this page or /api/room-log). Activity labels can be a teacher's
// own text, so every render uses textContent, never innerHTML.

(function () {
  'use strict';

  var listEl = document.getElementById('list');
  var headlineEl = document.getElementById('headline');
  var hostsEl = document.getElementById('hosts');
  var sinceEl = document.getElementById('since');
  var funnelEl = document.getElementById('funnel');

  function showMessage(className, text) {
    listEl.innerHTML = '';
    var p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    listEl.appendChild(p);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function load() {
    fetch('/api/room-log')
      .then(function (resp) {
        if (!resp.ok) throw new Error('status ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        renderSummary(data.summary || {});
        renderRooms(data.rooms || []);
      })
      .catch(function (err) {
        showMessage('error', 'Could not load the rooms log (' + err.message + '). Refresh to retry.');
      });
  }

  function renderSummary(s) {
    hostsEl.textContent = String(s.hosts || 0);
    var floor = s.unattributedClassRooms ? (' Plus ' + s.unattributedClassRooms + ' class room' + (s.unattributedClassRooms === 1 ? '' : 's') + ' with no host key.') : '';
    sinceEl.textContent = 'Since ' + (s.since || '') + ', distinct host browsers, real rooms with ' + (s.minPlayers || 3) + ' or more students.' + floor;
    headlineEl.hidden = false;

    funnelEl.innerHTML = '';
    var tiles = [
      [s.rooms || 0, 'rooms opened'],
      [s.classRooms || 0, 'class rooms'],
      [s.ended || 0, 'reached the end'],
      [s.pretendRooms || 0, 'pretend rooms']
    ];
    for (var i = 0; i < tiles.length; i++) {
      var tile = el('div', 'tile');
      tile.appendChild(el('b', null, String(tiles[i][0])));
      tile.appendChild(el('span', null, tiles[i][1]));
      funnelEl.appendChild(tile);
    }
    funnelEl.hidden = false;
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function renderRooms(rooms) {
    if (rooms.length === 0) {
      showMessage('empty', 'No rooms yet. The first real room that opens lands here.');
      return;
    }
    listEl.innerHTML = '';
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead');
    var hr = el('tr');
    var heads = ['When', 'Activity', 'Kind', 'Students', 'Step', 'Status', 'Minutes', 'Code', 'Host'];
    for (var h = 0; h < heads.length; h++) hr.appendChild(el('th', null, heads[h]));
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      var tr = el('tr', r.kind === 'pretend' ? 'is-pretend' : 'is-class');
      tr.appendChild(el('td', null, when(r.created_at)));
      var label = r.game_label || r.game_id || '';
      tr.appendChild(el('td', 'label', label + (r.source === 'custom' ? ' (custom)' : '')));
      tr.appendChild(el('td', null, r.kind === 'pretend' ? 'pretend' : 'class'));
      tr.appendChild(el('td', 'players', String(r.players || 0)));
      var stepText = String(r.step || 0) + ' of ' + String(r.steps || 0);
      if (r.step_id) stepText += ' (' + r.step_id + ')';
      tr.appendChild(el('td', null, stepText));
      var statusTd = el('td');
      var status = r.status || 'open';
      statusTd.appendChild(el('span', 'status st-' + status, status));
      tr.appendChild(statusTd);
      tr.appendChild(el('td', null, String(r.minutes || 0)));
      tr.appendChild(el('td', null, r.code || ''));
      var hostTd = el('td');
      if (r.host_key) hostTd.appendChild(el('code', 'key', String(r.host_key).slice(0, 6)));
      else hostTd.textContent = '';
      tr.appendChild(hostTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    listEl.appendChild(wrap);
  }

  load();
})();
