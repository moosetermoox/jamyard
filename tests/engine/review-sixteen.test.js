/**
 * Review sixteen (2026-09-27, an outside reviewer's live pass):
 *   - a poll's labels broke mid-word on the projector ("Listenin / g"):
 *     the live tally shrink-wrapped inside the collect section's flex
 *     column, and overflow-wrap: anywhere let the label column collapse
 *   - fist to five's poll said "One classmate will read this": pairing by
 *     a pick-one's answers only decides who sits together
 *   - a pair step never named the partner ("Your partner: Jordan")
 *   - Try it out's pretend students stopped partway through Solo Quiz:
 *     a hidden frame's timers crawl, so off screen the bot takes no pause
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { audienceFor, AUDIENCE } from '../../engine/audience.js';
import { partnerLineFor } from '../../engine/phase-handlers/collect.js';

const read = (p) => readFileSync(p, 'utf8');

const SCALE = ['Fist', 'One', 'Two', 'Three', 'Four', 'Five'];
function fistToFive(extra = {}) {
  return {
    name: 'Fist to five', description: 'test',
    phases: {
      lobby: { type: 'lobby', next: 'pick' },
      pick: { type: 'collect-choice', prompt: 'How sure are you?', choices: SCALE, next: 'help' },
      help: { type: 'collect', prompt: 'Explain it to your partner.', assign: 'pairwise', oddHandling: 'triple', pairBy: { from: 'pick', mode: 'far' }, next: 'end', ...extra },
      end: { type: 'end', message: 'Bye' }
    }
  };
}

describe('the poll that only decides the pairs', () => {
  it('is read by nobody, so the teacher line, never "One classmate"', () => {
    const a = audienceFor(fistToFive(), 'pick');
    expect(a.key).toBe(AUDIENCE.TEACHER);
  });

  it('still counts when the pair step also quotes it', () => {
    const a = audienceFor(fistToFive({ prompt: 'You said {{pick.mine}}. Explain it to your partner.' }), 'pick');
    expect(a.key).not.toBe(AUDIENCE.TEACHER);
  });

  it('a poll whose results go up is the class line', () => {
    const cfg = fistToFive();
    cfg.phases.pick.next = 'show';
    cfg.phases.show = { type: 'reveal', content: '{{pick.barChart}}', next: 'help' };
    expect(audienceFor(cfg, 'pick').key).toBe(AUDIENCE.CLASS);
  });

  it('the pair step itself still goes to a classmate', () => {
    const cfg = fistToFive();
    cfg.phases.help.next = 'back';
    cfg.phases.back = { type: 'reveal', scope: 'pair', pairsFrom: 'help', content: '{{help.responses}}', next: 'end' };
    expect(audienceFor(cfg, 'help').key).toBe(AUDIENCE.CLASSMATE);
  });
});

describe('partnerLineFor', () => {
  const names = { a: 'Maya', b: 'Jordan', c: 'Sam', d: 'Lee' };
  const engine = (lang = 'en') => ({
    language: lang,
    phaseData: { help: { pairs: [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd', 'e'] }] } },
    players: { find: (id) => (names[id] ? { id, name: names[id] } : undefined) }
  });
  const phase = { id: 'help', type: 'collect', assign: 'pairwise' };

  it('names the one partner', () => {
    expect(partnerLineFor(engine(), phase, 'a')).toBe('Your partner: Jordan');
  });

  it('names both in a triple, skipping one who left', () => {
    expect(partnerLineFor(engine(), phase, 'c')).toBe('Your partner: Lee');
    expect(partnerLineFor({ ...engine(), players: { find: (id) => ({ id, name: id.toUpperCase() }) } }, phase, 'c'))
      .toBe('Your partners: D, E');
  });

  it('is translated', () => {
    expect(partnerLineFor(engine('es'), phase, 'b')).toBe('Tu pareja: Maya');
  });

  it('says nothing off a pair step or for someone not paired', () => {
    expect(partnerLineFor(engine(), { id: 'help', type: 'collect' }, 'a')).toBe(null);
    expect(partnerLineFor(engine(), phase, 'zz')).toBe(null);
  });

  it('rides the student payload on enter and on reconnect, and the screen shows it as text', () => {
    const src = read('engine/phase-handlers/collect.js');
    expect(src.match(/partnerLine: /g).length).toBe(2);
    const player = read('screens/player/player.js');
    expect(player).toMatch(/partnerLineEl\.textContent = partnerLine/);
    expect(read('screens/player/index.html')).toMatch(/id="partner-line"/);
    expect(read('screens/player/styles.css')).toMatch(/\.partner-line\[hidden\] \{ display: none; \}/);
  });
});

describe('chart labels wrap between words', () => {
  it('never overflow-wrap: anywhere on a chart label', () => {
    for (const p of ['screens/host/styles.css', 'screens/player/styles.css']) {
      const block = read(p).match(/\.msg-chart-label \{[^}]*\}/)[0];
      expect(block).not.toMatch(/overflow-wrap: anywhere/);
      expect(block).toMatch(/overflow-wrap: break-word/);
    }
  });

  it('the live tally takes the width it is given', () => {
    const block = read('screens/host/styles.css').match(/\.live-tally \{[^}]*\}/)[0];
    expect(block).toMatch(/width: 100%/);
  });
});

describe('pretend students finish a solo quiz', () => {
  it('off screen, the bot takes no timed pause', () => {
    const player = read('screens/player/player.js');
    expect(player).toMatch(/function sqBotStep/);
    expect(player).toMatch(/frame\.offsetParent === null\) Promise\.resolve\(\)\.then\(fn\)/);
    expect(player).not.toMatch(/if \(sqBotAuto\) setTimeout/);
  });
});
