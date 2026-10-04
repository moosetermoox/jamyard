/**
 * Proof: a late joiner who turns a Snowball pair into a trio changes the
 * PROJECTOR's merge line from "partner" to "group" (2026-10-04, PR #181:
 * the line was sent once at enter and kept "sit next to your partner").
 * Also checks the projector's clock is not restarted by the re-send.
 *
 *   node scripts/simulate-late-trio.js      (server running; SIM_SERVER to point elsewhere)
 */
import { connect, waitForEvent, makeReporter, wait, DEFAULT_SERVER } from './sim-harness.js';

const r = makeReporter();
// description first, then the condition, then what was seen (the reporter takes condition, description)
const ok = (description, condition, seen) => r.check(!!condition, description + (seen !== undefined ? '  [' + seen + ']' : ''));

async function main() {
  const host = await connect('HOST', DEFAULT_SERVER);
  const progress = [];
  host.on('merge-progress', (p) => progress.push(p));
  host.emit('create-room', { gameId: 'snowball', pretend: true });
  const { code } = await waitForEvent(host, 'room-created', 5000);

  const players = [];
  for (const name of ['Maya', 'Jordan']) {
    const p = await connect(name, DEFAULT_SERVER);
    p.emit('join-room', { code, name });
    await waitForEvent(p, 'join-success', 3000);
    players.push(p);
  }

  host.emit('start-game', { code });
  await wait(800);
  host.emit('advance-phase', { code }); // past the intro card
  await Promise.all(players.map(p => waitForEvent(p, 'game-started', 5000)));
  players.forEach((p, i) => p.emit('submit-response', { code, response: i ? 'Denominators set the piece size.' : 'A fraction is a division.' }));
  await wait(800);
  host.emit('close-submissions', { code });
  await Promise.all(players.map(p => waitForEvent(p, 'merge-start', 5000)));
  await wait(500);

  const atEnter = progress.find(p => p.instruction !== undefined);
  ok('the projector opens the merge with the pair words', !!atEnter && /partner/i.test(atEnter.instruction) && !/group/i.test(atEnter.instruction), atEnter && atEnter.instruction);
  const enterCount = progress.length;

  const late = await connect('Sofia', DEFAULT_SERVER);
  late.emit('join-room', { code, name: 'Sofia' });
  await waitForEvent(late, 'join-success', 3000);
  const lateStart = await waitForEvent(late, 'merge-start', 5000);
  await wait(800);

  ok('the late joiner is seated in the pair, making a trio', (lateStart.memberNames || []).length === 3, (lateStart.memberNames || []).join(' + '));
  ok("the late joiner's screen reads group words", /group/i.test(lateStart.instruction || ''), lateStart.instruction);
  const resent = progress.slice(enterCount).find(p => p.instruction !== undefined);
  ok('the projector gets the line again with group words', !!resent && /sit with your group/i.test(resent.instruction) && !/partner/i.test(resent.instruction), resent && resent.instruction);
  ok('the re-send carries no timer, so the projector clock keeps running', !!resent && !('timer' in resent));
  ok('the re-send counts the groups', !!resent && resent.totalGroups === 1 && resent.submittedGroups === 0);

  for (const s of [host, ...players, late]) s.disconnect();
}

main()
  .then(() => { r.summary(); process.exit(r.errors > 0 ? 1 : 0); })
  .catch((e) => { console.error(e); process.exit(1); });
