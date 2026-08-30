/**
 * team-roles — role picking + role-tagged checklist simulation (2026-08-30).
 *
 * Drives the real games/group-work-day (split into groups of 3 → students
 * pick Facilitator/Recorder/Timekeeper → role-tagged checklist):
 *
 *   - every player gets a role menu for their own group
 *   - a deliberate collision (two group-mates claim Recorder) bounces the
 *     second with full:"Recorder" and their re-pick lands
 *   - all-picked auto-closes: the final deal reaches everyone, roles are
 *     unique inside each full group of 3
 *   - the checklist arrives with itemRoles + each player's yourRole
 *     matching the role they picked
 *
 * Usage: node scripts/simulate-team-roles.js   (server running)
 */

import {
  wait, log, setupRoom, teardown,
  waitForEvent, waitForEventOnAll, makeReporter
} from './sim-harness.js';

const GAME_ID = 'group-work-day';
const NUM_PLAYERS = 6;
const ROLES = ['Facilitator', 'Recorder', 'Timekeeper'];

const r = makeReporter();

async function run() {
  console.log('\n=== TEAM ROLES SIMULATION (group-work-day) ===');
  const { host, players, names, code } = await setupRoom(GAME_ID, NUM_PLAYERS);
  try {
    host.emit('start-game', { code });

    // --- intro (timed announce; skip ahead) ---
    await waitForEvent(players[0], 'announce', 8000);
    host.emit('advance-phase', { code });

    // --- make-groups (random team-split, instant reveal) ---
    const splits = await waitForEventOnAll(players, 'team-split', 8000);
    const myTeam = splits.map(ev => ev.myTeam);
    r.check(myTeam.every(Boolean), 'everyone landed on a team');
    host.emit('advance-phase', { code });

    // --- pick-roles (choice mode) ---
    const menus = await waitForEventOnAll(players, 'team-roles-start', 8000);
    r.check(menus.every(m => Array.isArray(m.roles) && m.roles.length === 3),
      'every player got a 3-role menu');

    // Find two players in the same group and collide them on Recorder.
    let first = 0;
    let mate = myTeam.findIndex((t, i) => i !== first && t === myTeam[first]);
    r.check(mate !== -1, 'found two players sharing a group');
    players[first].emit('role-pick', { code, role: 'Recorder' });
    await wait(400);
    players[mate].emit('role-pick', { code, role: 'Recorder' });
    // The mate also receives broadcast updates from other picks; scan for
    // the personal rejection (carries full:"Recorder").
    let bounce = null;
    for (let tries = 0; tries < 5 && !bounce; tries++) {
      const ev = await waitForEvent(players[mate], 'team-roles-update', 4000);
      if (ev && ev.full) bounce = ev;
    }
    r.check(!!bounce && bounce.full === 'Recorder' && !bounce.yourRole,
      `collision bounced with full:"Recorder" (got ${bounce && bounce.full})`);

    // Everyone else picks a role no group-mate holds yet (Recorder is
    // taken in the first group by the first player).
    const taken = {};
    taken[myTeam[first]] = ['Recorder'];
    players.forEach((p, i) => {
      if (i === first) { log(names[i], 'holds Recorder'); return; }
      const team = myTeam[i];
      taken[team] = taken[team] || [];
      const role = ROLES.find(role0 => taken[team].indexOf(role0) === -1) || ROLES[0];
      taken[team].push(role);
      p.emit('role-pick', { code, role });
      log(names[i], `picked ${role}`);
    });

    // All picked → auto-close → the final deal.
    const finals = await waitForEventOnAll(players, 'team-roles-final', 8000);
    const myRole = finals.map(ev => ev.myRole);
    r.check(myRole.every(role => ROLES.includes(role)), 'everyone ended with a real role');
    const byTeam = {};
    players.forEach((p, i) => {
      byTeam[myTeam[i]] = byTeam[myTeam[i]] || [];
      byTeam[myTeam[i]].push(myRole[i]);
    });
    for (const [team, roles] of Object.entries(byTeam)) {
      if (roles.length === 3) {
        r.check(new Set(roles).size === 3,
          `${team}: all three roles distinct (${roles.join(', ')})`);
      }
    }
    host.emit('advance-phase', { code });

    // --- worktime (role-tagged checklist) ---
    const lists = await waitForEventOnAll(players, 'checklist-start', 8000);
    lists.forEach((ev, i) => {
      const tagged = (ev.itemRoles || []).filter(Boolean);
      r.check(ev.items.length === 8 && tagged.length === 3,
        `${names[i]}: checklist has 8 items, 3 role-tagged (got ${ev.items.length}/${tagged.length})`);
      r.check(ev.yourRole === myRole[i],
        `${names[i]}: checklist knows their role (${ev.yourRole} vs ${myRole[i]})`);
    });

    // A few checks land, then the host ends work time and wraps up.
    players.forEach((p, i) => p.emit('check-item', { code, index: i % 8, checked: true }));
    await wait(500);
    host.emit('advance-phase', { code }); // close checklist + move on
    await waitForEvent(players[0], 'announce', 8000); // wrap
    host.emit('advance-phase', { code });
    try {
      await waitForEvent(players[0], 'game-ended', 8000);
      r.check(true, 'game reached the end phase');
    } catch {
      r.warn('game-ended not observed');
    }
  } finally {
    await teardown(host, players);
  }

  r.summary('TEAM ROLES SUMMARY');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mSimulator crashed:\x1b[0m', err.message);
  process.exit(1);
});
