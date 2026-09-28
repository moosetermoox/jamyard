/**
 * Review seventeen (2026-09-28, a reviewer ran all 48 built-ins through
 * Try it out with four pretend students, then poked the edges):
 *   - Dream Vacation printed {{rank-destinations.rankings.1.item}} when the
 *     shortlist had fewer than three places, and its pitch read
 *     "(skipped) (skipped) (skipped) (skipped)"
 *   - "jackass" joined, "dumbass" went through Rename
 *   - Class Critique said "Only your teacher sees your answers" over a
 *     rating whose averages go up live
 *   - leaderboards said "1 pts"
 *   - a mistyped share link was called "real"; a missing activity's make
 *     page kept two empty headings; Vocab Match's arrows had no names
 *   - the Create page called Vocab Match a fit for Spanish color words,
 *     and a mood check kept Live Poll's understanding choices
 *   - pretend students copied "(City, country, or place)", wrote story
 *     lines for arguments, and never took a relay turn
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relayFullText, SKIPPED_TEXT, NOBODY_WROTE } from '../../engine/phases/relay-text.js';
import { filterName, filterContent } from '../../engine/content-filter.js';
import { audienceFor, AUDIENCE, AUDIENCE_LABELS } from '../../engine/audience.js';
import { translate } from '../../engine/i18n/index.js';
import '../../screens/shared/bot-brain.js';

const read = (p) => readFileSync(p, 'utf8');

describe('Dream Vacation', () => {
  const cfg = JSON.parse(read('games/dream-vacation/config.json'));

  it('never names a runner-up slot the shortlist may not have', () => {
    const msg = cfg.phases['announce-winner'].message;
    expect(msg).not.toMatch(/rankings\.[12]\./);
    expect(msg).toMatch(/\{\{rank-destinations\.rankedList\}\}/);
  });

  it('no built-in reaches past the first ranked item', () => {
    for (const id of ['dream-vacation']) {
      expect(read(`games/${id}/config.json`)).not.toMatch(/rankings\.[1-9]/);
    }
  });
});

describe('relayFullText', () => {
  it('keeps the lines students wrote, in order, without the skipped turns', () => {
    const entries = [
      { text: 'Paris is calling.' },
      { text: SKIPPED_TEXT, skipped: true },
      { text: '  Pack light.  ' },
      { text: '' }
    ];
    expect(relayFullText(entries, 'en')).toBe('Paris is calling. Pack light.');
  });

  it('says plainly that nobody wrote, in the room language', () => {
    const skipped = [1, 2, 3, 4].map(() => ({ text: SKIPPED_TEXT, skipped: true }));
    expect(relayFullText(skipped, 'en')).toBe(NOBODY_WROTE);
    expect(relayFullText(skipped, 'es')).toBe(translate('es', NOBODY_WROTE));
    expect(translate('es', NOBODY_WROTE)).not.toBe(NOBODY_WROTE);
  });

  it('every relay event a student gets carries the step id, or the stale guard drops each line', () => {
    const server = read('server.js');
    const fn = server.slice(server.indexOf('function emitRelayTurn'), server.indexOf('// Tell host', server.indexOf('function emitRelayTurn')));
    expect(fn.match(/phaseInstanceId: room\.phaseInstanceId/g).length).toBe(2);
    expect(read('engine/phase-handlers/relay.js').match(/phaseInstanceId: ctx\.phaseInstanceId/g).length).toBe(2);
  });

  it('every place the server finishes a relay goes through it', () => {
    const server = read('server.js');
    expect(server).not.toMatch(/sharedResult\.map\(r => r\.text\)\.join/);
    expect(server.match(/relayFullText\(rs\.sharedResult/g).length).toBe(3);
  });
});

describe('names', () => {
  it('refuses the insults the reviewer got through', () => {
    for (const n of ['jackass', 'dumbass', 'Dumb Ass', 'idiot', 'Stupid', 'Mr Idiot', 'Loser Face', 'big dummy', 'Stupidhead', 'j4ckass']) {
      expect(filterName(n).blocked, n).toBe(true);
    }
  });

  it('keeps real names and surnames', () => {
    for (const n of ['Maya', 'Jordan', 'Dumbledore', 'Spicer', 'Dickson', 'Moron', 'Butt', 'Jack', 'Assad', 'Doris', 'Cassidy']) {
      expect(filterName(n).blocked, n).toBe(false);
    }
  });

  it('an answer may still say stupid or idiot', () => {
    expect(filterContent('that was a stupid mistake').blocked).toBe(false);
    expect(filterContent('I felt like an idiot').blocked).toBe(false);
  });
});

describe('a rating says the class sees the totals', () => {
  const critique = JSON.parse(read('games/class-critique/config.json'));

  it('Class Critique is the tally line, never "only your teacher"', () => {
    const a = audienceFor(critique, 'rate-it');
    expect(a.key).toBe(AUDIENCE.TALLY);
    expect(a.label).not.toMatch(/Only your teacher/);
  });

  it('a host-only rating is the teacher line again', () => {
    const cfg = JSON.parse(JSON.stringify(critique));
    cfg.phases['rate-it'].visibility = 'host-only';
    expect(audienceFor(cfg, 'rate-it').key).toBe(AUDIENCE.TEACHER);
  });

  it('a live poll is the tally line', () => {
    const cfg = { name: 'p', description: 'p', phases: {
      lobby: { type: 'lobby', next: 'ask' },
      ask: { type: 'collect-choice', prompt: 'Q?', choices: ['a', 'b'], liveResults: true, next: 'end' },
      end: { type: 'end', message: 'Bye' } } };
    expect(audienceFor(cfg, 'ask').key).toBe(AUDIENCE.TALLY);
  });

  it('the line is in every language and the console has a hint for it', () => {
    for (const lang of ['es', 'fr', 'de', 'pt', 'it']) {
      expect(translate(lang, AUDIENCE_LABELS[AUDIENCE.TALLY])).not.toBe(AUDIENCE_LABELS[AUDIENCE.TALLY]);
    }
    expect(read('screens/teacher/teacher.js')).toMatch(/^\s+tally: 'Only you can see who gave which answer/m);
  });
});

describe('small ones', () => {
  it('one point is "1 pt"', () => {
    const host = read('screens/host/host.js');
    expect(host).not.toMatch(/ \+ ' pts'/);
    const src = host.match(/function ptsLabel\(n\) \{[\s\S]*?\n\}/)[0];
    const ptsLabel = new Function(src + '; return ptsLabel;')();
    expect(ptsLabel(1)).toBe('1 pt');
    expect(ptsLabel(0)).toBe('0 pts');
    expect(ptsLabel(12)).toBe('12 pts');
  });

  it('a dead share link never claims to be real', () => {
    const html = read('screens/share/index.html');
    expect(html).not.toMatch(/The share link is real/);
    expect(html).toMatch(/may have been mistyped/);
  });

  it('a missing activity hides the empty make-page sections', () => {
    const js = read('screens/make/make.js');
    expect(js.match(/hideEmptySections\(\);/g).length).toBe(2);
    expect(read('screens/make/styles.css')).toMatch(/\.fit-section\[hidden\], \.map-section\[hidden\] \{ display: none; \}/);
  });

  it('every reorder arrow on the student screen has a spoken name', () => {
    const player = read('screens/player/player.js');
    expect(player.match(/upBtn\.setAttribute\('aria-label', UiLang\.t\('Move up'\)/g).length).toBe(2);
    expect(player.match(/downBtn\.setAttribute\('aria-label', UiLang\.t\('Move down'\)/g).length).toBe(2);
    for (const lang of ['es', 'fr', 'de', 'pt', 'it']) {
      expect(translate(lang, 'Move up')).not.toBe('Move up');
      expect(translate(lang, 'Move down')).not.toBe('Move down');
    }
  });
});

describe('the Create page', () => {
  const ai = read('services/ai-service.js');

  it('a ready-made pick never claims the teacher\'s content, and says when the idea has its own', () => {
    expect(ai).toMatch(/Never say it already has the teacher's topic/);
    expect(ai).toMatch(/carriesContent: parsed\.carriesContent === true/);
    expect(read('server.js')).toMatch(/carriesContent: match\.carriesContent === true/);
  });

  it('the card says "closest" and carries the idea to the make page, whose pair writer takes it', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toMatch(/'The closest ready-made activity'/);
    expect(designer).toMatch(/'&idea=' \+ encodeURIComponent/);
    const make = read('screens/make/make.js');
    expect(make).toMatch(/params\.get\('idea'\)/);
    expect(make).toMatch(/topic\.value = ideaText;/);
  });

  it('a written question gets written choices', () => {
    expect(ai).toMatch(/write the answer choices for THAT question too/);
    const golden = JSON.parse(read('tests/designer/golden-prompts.json'));
    const ids = golden.prompts.map(p => p.id);
    expect(ids).toContain('mood-check-start');
    expect(ids).toContain('spanish-color-match');
  });
});

describe('pretend students', () => {
  const answer = globalThis.botAnswerFor;

  it('never answer with a bracketed hint', () => {
    for (let i = 0; i < 20; i++) {
      expect(answer("Where's your dream vacation destination? (City, country, or place)")).not.toMatch(/^(City|Country|Place)$/i);
    }
  });

  it('argue when asked to argue, pitch when asked to pitch', () => {
    const argue = answer('Your debate topic: recess. Write your most persuasive argument (3-5 sentences).');
    expect(argue).not.toMatch(/dragon|lights flickered|cafeteria|snow day|creaking/);
    const pitch = answer('ROUND 2: Pitch a brand-new use for chicken that nobody in history has thought of.');
    expect(pitch).not.toMatch(/dragon|lights flickered|cafeteria|snow day|creaking/);
  });

  it('take relay turns (the old branch named BOT_PHRASES, which never existed)', () => {
    const player = read('screens/player/player.js');
    expect(player).not.toMatch(/BOT_PHRASES\[/);
    expect(player).toMatch(/relayBotAuto = true;/);
    expect(player).toMatch(/if \(relayBotAuto\) setTimeout\(relayBotTakeTurn, 400\);/);
  });
});
