// Review eighteen (2026-09-28): a stray tap no longer casts a vote, and
// every countdown reads m:ss (a reviewer saw "58" where "0:58" belonged).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const player = readFileSync('screens/player/player.js', 'utf8');
const host = readFileSync('screens/host/host.js', 'utf8');
const css = readFileSync('screens/player/styles.css', 'utf8');

function timerFn(src) {
  const m = src.match(/function formatTimerText\(seconds\) \{[\s\S]*?\n\}/);
  expect(m, 'formatTimerText').toBeTruthy();
  return new Function(m[0] + '\nreturn formatTimerText;')();
}

describe('timers read m:ss everywhere', () => {
  for (const [name, src] of [['player', player], ['host', host]]) {
    it(name, () => {
      const f = timerFn(src);
      expect(f(58)).toBe('0:58');
      expect(f(5)).toBe('0:05');
      expect(f(0)).toBe('0:00');
      expect(f(90)).toBe('1:30');
      expect(f(600)).toBe('10:00');
    });
  }
  it('the charades countdowns use it too', () => {
    expect(player).not.toMatch(/textContent = sec \+ 's'/);
    expect(host).not.toMatch(/txt\.textContent = sec;/);
  });
});

describe('pick, then confirm', () => {
  it('a pick-one vote, a head-to-head matchup, and a pick-one step select first', () => {
    expect(player).toContain('function pickThenConfirm(');
    // showPickOneVote no longer emits from the option's own click
    const pickOne = player.slice(player.indexOf('function showPickOneVote'), player.indexOf('// The yes-or-no ballot'));
    expect(pickOne).toContain('pickThenConfirm(');
    expect(pickOne).toContain('.option(btn');
    const matchup = player.slice(player.indexOf('function showNextMatchup'), player.indexOf('// --- Helper functions ---'));
    expect(matchup).toContain('pickThenConfirm(');
    expect(matchup).not.toMatch(/btnA\.addEventListener\('click'/);
    expect(player).toMatch(/choiceBallot = pickThenConfirm\(UiLang\.t\('Submit'\)/);
  });
  it('a timer sends the picked option before a random one', () => {
    expect(player).toContain('pickOneBallot.picked()');
    expect(player).toContain('matchupBallot.picked()');
    expect(player).toContain('choiceBallot.picked()');
  });
  it('pretend students press the confirm button after picking', () => {
    const fill = player.slice(player.indexOf("e.data.type !== 'bot-fill'"), player.indexOf("id === 'rank-section'"));
    expect(fill.match(/\.ballot-confirm/g).length).toBeGreaterThanOrEqual(2);
  });
  it('the pick shows as a ring and the confirm button is the red action', () => {
    expect(css).toMatch(/\.vote-btn\.is-selected/);
    expect(css).toMatch(/\.ballot-confirm \{/);
    expect(css).toMatch(/\.ballot-confirm:disabled/);
  });
});
