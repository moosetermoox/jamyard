import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A reviewer (2026-09-23): "I still had to assemble the workflow myself"
// (which screen to project, where private answers appear), and two
// messages about the report disagreed (the projector's checklist said a
// copied link keeps the work; the console said it is gone when the room
// closes). And the browser-only nature of a copy was discovered after
// the copy was made. These pin the words where the decisions arise.

const teacherHtml = readFileSync('screens/teacher/index.html', 'utf8');
const teacherJs = readFileSync('screens/teacher/teacher.js', 'utf8');
const hostHtml = readFileSync('screens/host/index.html', 'utf8');
const hostCss = readFileSync('screens/host/styles.css', 'utf8');
const guide = readFileSync('screens/guide/index.html', 'utf8');
const makeHtml = readFileSync('screens/make/index.html', 'utf8');
const makeCss = readFileSync('screens/make/styles.css', 'utf8');

describe('Before you project: the console setup card', () => {
  it('names both setups, which screen to project, and where private answers appear', () => {
    expect(teacherHtml).toContain('id="setup-card"');
    expect(teacherHtml).toContain('<h2>Before you project</h2>');
    expect(teacherHtml).toContain('<strong>One laptop:</strong> set your display to extend, not duplicate.');
    expect(teacherHtml).toContain('<strong>Laptop plus a phone or a second device:</strong>');
    expect(teacherHtml).toContain('Nothing on this screen ever reaches the projector.');
    expect(teacherHtml).toContain('Private answers land here, under Live entries, and in the activity report at the end.');
    expect(teacherHtml).toContain('an exit ticket for one, puts only the question and a count on the projector, never an answer.');
    expect(teacherHtml).toContain('id="setup-dismiss-btn"');
  });

  it('shows once per browser on join, never inside a frame (Try it out), and Got it remembers', () => {
    expect(teacherJs).toContain("var SETUP_SEEN_KEY = 'jamyard.consoleSetupSeen';");
    expect(teacherJs).toContain('setupCard.hidden = !setupCardWanted();');
    const fn = teacherJs.slice(teacherJs.indexOf('function setupCardWanted('), teacherJs.indexOf('setupDismissBtn.addEventListener'));
    expect(fn).toContain('window.self !== window.top');
    expect(fn).toContain("localStorage.getItem(SETUP_SEEN_KEY) !== '1'");
    expect(teacherJs).toContain("localStorage.setItem(SETUP_SEEN_KEY, '1');");
  });

  it('is never an agree line: the button dismisses information, nothing is gated on it', () => {
    expect(teacherHtml).not.toMatch(/I agree|type="checkbox"[^>]*agree/i);
  });
});

describe('the report: what keeps it, said the same way everywhere', () => {
  it('the projector checklist no longer says a copied link keeps the work', () => {
    expect(hostHtml).not.toContain('Copy report link keeps what the class made');
    // One line at the checklist's width: a second line shrinks the whole
    // lobby under the fit zoom (the owner saw the code blocks get small)
    expect(hostHtml).toContain('At the end, print or save the report. It goes when the room closes.');
    // Inside Try it out the checklist and the share row hide: pretend
    // students never scan a code, and the lobby in a 725px frame was at
    // zoom 0.54 with them
    expect(hostCss).toContain('body.in-bench .host-checklist,');
    expect(hostCss).toContain('body.in-bench .join-share { display: none; }');
    expect(hostHtml).toContain('The link works only while this room is open: print the report or save the PDF to keep it.');
  });

  it('the console card and header say printing or saving keeps it, a link does not', () => {
    expect(teacherHtml).toContain('printing it or saving the PDF is what keeps it. Once the room closes it is gone, and a copied link will not bring it back.');
    expect(teacherHtml).toContain('Print it or save the PDF to keep it; it is gone when the room closes');
  });

  it('the guide says the same, and where a changed activity lives', () => {
    expect(guide).toContain('<strong>One laptop and a projector:</strong> set the display to extend, not duplicate.');
    expect(guide).toContain('<strong>Laptop plus a phone or a second device:</strong>');
    expect(guide).toContain('<strong>Keeping things:</strong> an activity you changed is saved as your copy in that browser, under My yard on the home page');
    expect(guide).toContain('What a class made lives only in the activity report, printed or saved as a PDF before the room closes.');
  });
});

describe('the make page says where a copy goes before it is made', () => {
  it('a keep note sits under the doors, always on', () => {
    expect(makeHtml).toContain('id="keep-note"');
    expect(makeHtml).toContain('Change anything and it is saved as your copy in this browser, under My yard on the home page. On another computer, open it from its Share link.');
    expect(makeHtml).not.toMatch(/id="keep-note"[^>]*hidden/);
    expect(makeCss).toContain('.keep-note {');
  });
});
