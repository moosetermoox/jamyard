// Nothing a student or the projector reads names the AI (owner,
// 2026-09-16: "there is an increased backlash against AI so I would like
// to remind them as little as possible that this was made with AI").
// The teacher surfaces keep their wording; this guards the student
// screen, the projector, the labels the server sends them in every
// language, and the built-in activity text, minus the two activities
// whose fun IS the AI (Human vs AI, Mad Lib Mashup: the owner's call).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// AI in English, IA in Spanish/French/Portuguese/Italian, KI in German
const TELL = /\b(AI|A\.I\.|IA|KI)\b/;

function stringLiterals(js) {
  const noComments = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  const out = [];
  const re = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(noComments)) !== null) out.push(m[0].slice(1, -1));
  return out;
}

function htmlText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
}

const JS_SURFACES = [
  'screens/player/player.js',
  'screens/host/host.js',
  'engine/phases/continue-labels.js',
  'engine/audience.js',
  'engine/i18n/index.js'
];
const HTML_SURFACES = ['screens/player/index.html', 'screens/host/index.html'];

describe('no AI mention on student or projector surfaces', () => {
  for (const file of JS_SURFACES) {
    it(`${file} has no AI in any string`, () => {
      const hits = stringLiterals(read(file)).filter((s) => TELL.test(s));
      expect(hits, file).toEqual([]);
    });
  }

  for (const file of HTML_SURFACES) {
    it(`${file} has no AI in its text`, () => {
      expect(TELL.test(htmlText(read(file))), file).toBe(false);
    });
  }

  it('the wait screen tables on both screens agree and name the work, not the worker', () => {
    const grab = (src) => {
      const m = src.match(/const TASK_MESSAGES = \{([\s\S]*?)\};/);
      expect(m, 'TASK_MESSAGES table').toBeTruthy();
      return m[1];
    };
    const player = grab(read('screens/player/player.js'));
    const host = grab(read('screens/host/host.js'));
    expect(player).toBe(host);
    for (const task of ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge']) {
      expect(player).toContain(`'${task}':`);
    }
  });

  it('the AI service never puts the tool\'s name into reveal text', () => {
    const src = read('services/ai-service.js');
    expect(src).not.toMatch(/\[AI Error\]/);
    expect(src).not.toMatch(/\[MOCK AI\]/);
  });

  it('built-in activities keep AI out of student text, except the two whose fun is the AI', () => {
    const KEEP = new Set(['human-vs-ai-birthday-party-battle', 'mad-lib-mashup']);
    const STUDENT_FIELDS = ['message', 'prompt', 'instruction', 'template', 'content', 'question', 'chainHeading'];
    const hits = [];
    for (const dir of readdirSync(join(ROOT, 'games'))) {
      if (dir.startsWith('_') || KEEP.has(dir)) continue;
      const file = join(ROOT, 'games', dir, 'config.json');
      if (!existsSync(file)) continue;
      const config = JSON.parse(readFileSync(file, 'utf8'));
      const phases = Array.isArray(config.phases) ? config.phases : Object.values(config.phases || {});
      const walk = (phase, path) => {
        for (const f of STUDENT_FIELDS) {
          if (typeof phase[f] === 'string' && TELL.test(phase[f])) hits.push(`${dir}/${path}.${f}: ${phase[f].slice(0, 60)}`);
        }
        const subs = Array.isArray(phase.phases) ? phase.phases : Object.values(phase.phases || {});
        subs.forEach((s, i) => walk(s, `${path}/${s.id || i}`));
      };
      phases.forEach((p, i) => walk(p, p.id || String(i)));
    }
    expect(hits).toEqual([]);
  });
});
