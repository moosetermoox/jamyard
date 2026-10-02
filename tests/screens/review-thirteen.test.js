/**
 * A thirteenth outside review (2026-09-27, a live Draw Gallery run end to
 * end): the gallery's later screens fit any prompt, the projector's
 * Approve & Show asks first, unknown pages get a page with a way in,
 * "Everyone is in" on the counter, the report's roster line, no Next
 * step after All done, a skip link, the lobby names in ink.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('Draw Gallery fits any prompt', () => {
  const cfg = JSON.parse(read('games/art-gallery/config.json'));
  it('the later screens never name the default prompt\'s topic', () => {
    const later = [cfg.phases.gallery.message, cfg.phases.end.message, cfg.phases.intro.message].join('\n');
    expect(later).not.toMatch(/invention|patent/i);
    expect(cfg.phases.gallery.message).toContain('shout your guess: what is it?');
  });
  it('the intro says drawings go up after the teacher takes a look', () => {
    expect(cfg.phases.intro.message).toContain('After your teacher takes a look, every drawing goes up on the wall');
  });
  it('no other yard activity ties a later screen to its default prompt', () => {
    // the sweep that found the gallery: an end or reveal line naming a noun
    // only the default prompt carries
    const tied = { 'art-gallery': /invention|patent/i };
    for (const [id, re] of Object.entries(tied)) {
      const c = JSON.parse(read('games/' + id + '/config.json'));
      for (const p of Object.values(c.phases)) {
        if (p.type === 'end' || p.type === 'reveal' || p.type === 'reveal-one' || p.type === 'announce') {
          expect(String(p.message || p.template || ''), id).not.toMatch(re);
        }
      }
    }
  });
});

describe('the projector asks before showing unreviewed work', () => {
  const js = read('screens/host/host.js');
  it('Approve & Show confirms unless the list was opened on this screen this step', () => {
    expect(js).toContain('let previewLookedHere = false;');
    expect(js).toContain("if (!previewPrivate.hidden) previewLookedHere = true;");
    expect(js).toContain("title: previewOneByOne ? 'Show them to the class?' : 'Show them all to the class?'");
    expect(js).toContain("confirmLabel: 'Show them', cancelLabel: 'Look first'");
    expect(js).toContain('previewLookedHere = false;');
    expect(js).toContain('if (previewLookedHere || !(window.Dialog && Dialog.confirm)) { send(); return; }');
  });
  it('the counter says Everyone is in and Close pulses; still host-paced', () => {
    expect(js).toContain("submissionCount.textContent = 'Everyone is in (' + count + ' of ' + total + ')';");
    expect(js).toContain("closeSubmissionsBtn.classList.toggle('is-all-in', allIn);");
    expect((js.match(/markAllIn\(/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(read('screens/host/styles.css')).toContain('#close-submissions-btn.is-all-in { animation: all-in-pulse');
    expect(js).not.toMatch(/is-all-in[\s\S]{0,200}close-submissions'\)/);
  });
});

describe('unknown pages', () => {
  const server = read('server.js');
  it('/join and /play go to the student page', () => {
    expect(server).toContain("app.get(['/join', '/play'], (req, res) => res.redirect('/player'));");
  });
  it('anything else gets the not-found page; API and socket paths keep JSON', () => {
    expect(server).toContain("await readFile(join(__dirname, 'screens/shared/not-found.html'), 'utf-8')");
    expect(server).toContain("if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) {");
    expect(server).toContain("res.status(404).type('html').send(notFoundPage);");
    // last: after every route and static mount
    expect(server.lastIndexOf('app.use(async (req, res) => {')).toBeGreaterThan(server.lastIndexOf('app.get('));
    expect(server.lastIndexOf('app.use(async (req, res) => {')).toBeGreaterThan(server.lastIndexOf('express.static('));
    const page = read('screens/shared/not-found.html');
    expect(page).toContain('There is nothing at this address.');
    expect(page).toContain('href="/player"');
    expect(page).toContain('href="/#yard"');
    expect(page).not.toContain('—');
  });
});

describe('the smaller answers', () => {
  it('the report lists Students, never Class', () => {
    expect(read('screens/teacher/report.js')).toContain("'Students: ' + report.roster.join(', ')");
  });
  it('the console hides Next step at the end', () => {
    expect(read('screens/teacher/teacher.js')).toContain("nextStepBtn.hidden = phaseType === 'preview' || isLobby || isCollect || phaseType === 'end';");
  });
  it('the home has a skip link to the activities and finger-sized footer links', () => {
    const html = read('screens/home/index.html');
    expect(html).toContain('<a class="skip-link" href="#yard">Skip to the activities</a>');
    expect(html).toMatch(/\.skip-link:focus \{ top: 12px;/);
    expect(html).toMatch(/footer a \{[^}]*min-height: 24px;/);
  });
  it('the lobby name chips are in ink', () => {
    expect(read('screens/player/styles.css')).toMatch(/\.holding-avatar-chip \{\s*border: none;\s*color: var\(--t-ink, #2A2620\);/);
  });
});
