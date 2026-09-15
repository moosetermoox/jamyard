/**
 * Late-seating sim (2026-09-14).
 *
 * A student who joins AFTER a team step has opened must get a seat where
 * the class is (engine/phases/late-seating.js), never the waiting screen
 * for the rest of the period. Owner: "can the system add people as they
 * enter? If you pick a team you're then added to a team. If you pick a
 * role your role then shows up."
 *
 * Scenario A, group-work-day (random split, roles by choice, checklist):
 *  1. Zoe joins on the team reveal: she is on a team, the projector's
 *     cards include her
 *  2. Yan joins while roles are being picked: he is on a team and gets
 *     his group's role menu; the projector board counts him
 *  3. Ada joins mid-checklist: she gets her team's list with a role, her
 *     check reaches a team-mate, the console was told each time
 *
 * Scenario B, _team-modes (a choice split, then a teacher-arranged one):
 *  4. Zed joins while students are picking: he gets the menu, a spot
 *     opened for him, his pick lands, the split closes with him on a team
 *  5. Yara joins while the teacher is arranging: she is in the console's
 *     unplaced list, Confirm gives her a team
 *
 * Requires the server running: node scripts/simulate-late-seating.js
 */

import {
  connect, waitForEvent, waitForEventOnAll, drainEvent, teardown, wait, log, makeReporter, PLAYER_NAMES
} from './sim-harness.js';

async function makeRoom(gameId, n) {
  const host = await connect('HOST');
  host.emit('create-room', { gameId });
  const roomData = await waitForEvent(host, 'room-created', 5000);
  const code = roomData.code;
  const teacher = await connect('TEACHER');
  teacher.emit('join-teacher', { code, pin: roomData.teacherPin });
  await waitForEvent(teacher, 'teacher-joined', 5000);
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = await connect(`P${i + 1}`);
    p.emit('join-room', { code, name: PLAYER_NAMES[i] });
    await waitForEvent(p, 'join-success', 3000);
    players.push(p);
  }
  log('SIM', `Room ${code} (${gameId}) with ${n} players and a console`);
  return { host, teacher, players, code };
}

async function lateJoin(code, name) {
  const s = await connect('LATE-' + name);
  s.emit('join-room', { code, name });
  const joined = await waitForEvent(s, 'join-success', 3000);
  if (joined.reconnected) throw new Error(`${name} was treated as a reconnect`);
  return s;
}

async function scenarioA(r) {
  const { host, teacher, players, code } = await makeRoom('group-work-day', 5);
  const late = [];
  try {
    host.emit('start-game', { code });
    await wait(600);
    host.emit('advance-phase', { code }); // past the intro announce
    await waitForEventOnAll(players, 'team-split', 8000);
    log('SIM', 'Teams dealt (random split)');

    // 1. On the team reveal
    drainEvent([host], 'team-split');
    const zoe = await lateJoin(code, 'Zoe'); late.push(zoe);
    const zoeTeam = await waitForEvent(zoe, 'team-split', 4000);
    r.check(!!zoeTeam.myTeam, `Zoe joined on the reveal and is on a team (${zoeTeam.myTeam})`);
    const hostTeams = await waitForEvent(host, 'team-split', 4000).catch(() => null);
    const onCard = hostTeams && Object.values(hostTeams.teams).some(members => members.some(m => m.name === 'Zoe'));
    r.check(!!onCard, 'the projector\'s team cards refreshed with Zoe on one');
    const note1 = await waitForEvent(teacher, 'teacher-late-seat', 3000).catch(() => null);
    r.check(!!note1 && note1.name === 'Zoe' && note1.team === zoeTeam.myTeam, 'the console was told where Zoe landed');

    // 2. While roles are being picked
    host.emit('advance-phase', { code });
    await waitForEventOnAll(players, 'team-roles-start', 8000);
    log('SIM', 'Role picking open');
    drainEvent([host], 'team-roles-update');
    const yan = await lateJoin(code, 'Yan'); late.push(yan);
    const yanMenu = await waitForEvent(yan, 'team-roles-start', 4000).catch(() => null);
    r.check(!!yanMenu && Array.isArray(yanMenu.roles) && yanMenu.roles.length > 0 && !!yanMenu.groupLabel,
      `Yan joined mid-pick and got his group's role menu (${yanMenu && yanMenu.groupLabel}: ${yanMenu && yanMenu.roles.map(x => x.name).join('/')})`);
    const board = await waitForEvent(host, 'team-roles-update', 4000).catch(() => null);
    r.check(!!board && board.total === 7, `the projector board counts him (${board && board.total} of 7)`);
    const note2 = await waitForEvent(teacher, 'teacher-late-seat', 3000).catch(() => null);
    r.check(!!note2 && note2.name === 'Yan' && note2.picking === true && !!note2.team, 'the console was told Yan is on a team, picking a job');
    // He can pick like anyone else (drain the roster update his seating
    // sent him, so the wait reads the one his pick produces)
    drainEvent([yan], 'team-roles-update');
    yan.emit('role-pick', { code, role: yanMenu.roles[0].name });
    const picked = await waitForEvent(yan, 'team-roles-update', 4000).catch(() => null);
    r.check(!!picked && picked.yourRole === yanMenu.roles[0].name, `Yan's pick landed (${picked && picked.yourRole})`);

    // Close roles (auto-fill the rest) and open the checklist
    host.emit('team-split-confirm', { code });
    await waitForEventOnAll([...players, yan], 'team-roles-final', 8000);
    host.emit('advance-phase', { code });
    await waitForEventOnAll(players, 'checklist-start', 8000);
    log('SIM', 'Checklist open');

    // 3. Mid-checklist
    drainEvent(players, 'checklist-update');
    const ada = await lateJoin(code, 'Ada'); late.push(ada);
    const list = await waitForEvent(ada, 'checklist-start', 4000).catch(() => null);
    r.check(!!list && list.group && !!list.group.label && Array.isArray(list.items) && list.items.length === 8,
      `Ada joined mid-checklist and got her team's list (${list && list.group && list.group.label}, ${list && list.items && list.items.length} tasks)`);
    r.check(!!list && !!list.yourRole, `Ada was given a job (${list && list.yourRole})`);
    const note3 = await waitForEvent(teacher, 'teacher-late-seat', 3000).catch(() => null);
    r.check(!!note3 && note3.name === 'Ada' && !!note3.team && !!note3.role, `the console was told: Ada on ${note3 && note3.team} as ${note3 && note3.role}`);
    ada.emit('check-item', { code, index: 0, checked: true });
    const seen = await Promise.race([
      ...players.map(p => waitForEvent(p, 'checklist-update', 4000).then(d => d).catch(() => null)),
      wait(4500).then(() => null)
    ]);
    r.check(!!seen && seen.group && seen.group.checked[0] && seen.group.checked[0].name === 'Ada', 'her check reached a team-mate\'s list');
  } finally {
    await teardown(host, [...players, ...late, teacher]);
  }
}

async function scenarioB(r) {
  const { host, teacher, players, code } = await makeRoom('_team-modes', 4);
  const late = [];
  try {
    host.emit('start-game', { code });
    await waitForEventOnAll(players, 'team-choice-start', 8000);
    log('SIM', 'Choice split open (groups of 2, 4 students)');

    // 4. While students are picking
    const zed = await lateJoin(code, 'Zed'); late.push(zed);
    const menu = await waitForEvent(zed, 'team-choice-start', 4000).catch(() => null);
    r.check(!!menu && Array.isArray(menu.rosters) && menu.rosters.length === 2, 'Zed joined mid-pick and got the team menu');
    const spots = menu ? menu.rosters.reduce((n, t) => n + (t.open == null ? 0 : t.open), 0) : 0;
    r.check(spots === 5, `a spot opened for him (${spots} open spots for 5 students)`);
    const bumped = menu ? menu.rosters.find(t => t.capacity === 3) : null;
    r.check(!!bumped, `the emptiest team grew to 3 (${bumped && bumped.name})`);
    const note4 = await waitForEvent(teacher, 'teacher-late-seat', 3000).catch(() => null);
    r.check(!!note4 && note4.name === 'Zed' && note4.picking === true && !note4.team, 'the console was told Zed is picking a team');
    // Everyone picks; Zed takes the grown team's third spot
    const names = menu.rosters.map(t => t.name);
    for (let i = 0; i < players.length; i++) players[i].emit('team-pick', { code, team: names[i % 2] });
    await wait(400);
    zed.emit('team-pick', { code, team: bumped.name });
    const final = await waitForEvent(zed, 'team-split', 6000).catch(() => null);
    r.check(!!final && final.myTeam === bumped.name, `the split closed with Zed on ${final && final.myTeam}`);

    // 5. While the teacher is arranging
    host.emit('advance-phase', { code });
    await waitForEvent(host, 'team-split-setup', 8000);
    log('SIM', 'Teacher-arranged split open');
    drainEvent([host], 'team-split-setup');
    const yara = await lateJoin(code, 'Yara'); late.push(yara);
    const setup = await waitForEvent(host, 'team-split-setup', 4000).catch(() => null);
    r.check(!!setup && setup.unassigned.some(p => p.name === 'Yara'), 'Yara joined mid-arrangement and is in the unplaced list');
    const wait5 = await waitForEvent(yara, 'waiting', 4000).catch(() => null);
    r.check(!!wait5 && /arranging/.test(wait5.message || ''), 'she sees "your teacher is arranging the teams"');
    host.emit('team-split-confirm', { code });
    const placed = await waitForEvent(yara, 'team-split', 6000).catch(() => null);
    r.check(!!placed && !!placed.myTeam, `Confirm gave her a team (${placed && placed.myTeam})`);
  } finally {
    await teardown(host, [...players, ...late, teacher]);
  }
}

async function run() {
  const r = makeReporter();
  await scenarioA(r);
  await scenarioB(r);
  r.summary('LATE-SEATING SIMULATION');
  process.exit(r.errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(`\nSim crashed: ${err.message}`);
  process.exit(1);
});
