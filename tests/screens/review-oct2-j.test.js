/**
 * Review oct2 J (2026-10-02): an outside reviewer's designer, Create
 * page, drawing, and home notes, each checked before it was fixed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function fakeCanvas() {
  const listeners = {};
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return {
    width: 360, height: 360, style: {},
    getContext: () => ctx,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 360 }),
    setPointerCapture: () => {},
    fire(type, x, y) { listeners[type]({ clientX: x, clientY: y, pointerId: 1, preventDefault() {} }); }
  };
}

function drawOne(canvas, x) {
  canvas.fire('pointerdown', x, 10);
  canvas.fire('pointermove', x + 20, 40);
  canvas.fire('pointerup', x + 20, 40);
}

describe('31: Clear can be undone', () => {
  beforeAll(async () => {
    globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
    await import('../../screens/shared/drawing.js');
  });

  it('Undo after Clear brings the drawing back', () => {
    const canvas = fakeCanvas();
    const pad = globalThis.Draw.attachPad(canvas);
    drawOne(canvas, 10);
    drawOne(canvas, 100);
    expect(pad.getStrokes()).toHaveLength(2);
    pad.clear();
    expect(pad.isEmpty()).toBe(true);
    pad.undo();
    expect(pad.getStrokes()).toHaveLength(2);
    pad.undo();
    expect(pad.getStrokes()).toHaveLength(1);
  });

  it('a stroke after Clear is undone first, then the cleared drawing returns', () => {
    const canvas = fakeCanvas();
    const pad = globalThis.Draw.attachPad(canvas);
    drawOne(canvas, 10);
    pad.clear();
    drawOne(canvas, 200);
    pad.undo();
    expect(pad.isEmpty()).toBe(true);
    pad.undo();
    expect(pad.getStrokes()).toHaveLength(1);
  });

  it('Undo never removes an inherited drawing, even after Clear', () => {
    const canvas = fakeCanvas();
    const pad = globalThis.Draw.attachPad(canvas);
    pad.setStrokes([{ points: [[0.1, 0.1], [0.2, 0.2]], color: '#111111', width: 4 }]);
    pad.clear();
    pad.undo();
    expect(pad.getStrokes()).toHaveLength(1);
    expect(pad.hasOwnStrokes()).toBe(false);
  });
});

describe('33: add and delete a step without the chat', () => {
  const sv = read('screens/designer/simple-view.js');
  it('the stack carries + Add a step, which opens the step picker', () => {
    expect(sv).toMatch(/'sv-action svb-add-step', '\+ Add a step'\)/);
    expect(sv).toMatch(/addStepBtn\.addEventListener[\s\S]{0,600}addPhase\(\)/);
  });
  it('the card carries Delete this step, asked first, never on the waiting room or the end', () => {
    expect(sv).toMatch(/selPhase\.type !== 'lobby' && selPhase\.type !== 'end'[\s\S]{0,200}'Delete this step'/);
    expect(sv).toMatch(/Dialog\.confirm\(\{ title: 'Delete step '[\s\S]{0,400}deletePhase\(delId\)/);
  });
});

describe('34: the card never scrolls over the step list', () => {
  it('the stack stops being sticky once the card drops under it', () => {
    const css = read('screens/designer/editor.css');
    expect(css).toMatch(/\.sv-wrap \{ container-type: inline-size; \}/);
    expect(css).toMatch(/@container \(max-width: 599\.98px\) \{\s*#sv-stack \{ position: static; \}/);
  });
});

describe('35: Just do it steps aside after Apply', () => {
  beforeAll(async () => { await import('../../screens/designer/chat-panel.js'); });
  const history = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }];
  it('hidden right after an Apply, back once the teacher says something new', () => {
    expect(globalThis.ChatPanel.canJustDoIt({ history, appliedSinceLastTurn: true })).toBe(false);
    expect(globalThis.ChatPanel.canJustDoIt({ history, appliedSinceLastTurn: false })).toBe(true);
  });
  it('the thread scrolls to the Revert, and a send clears the flag', () => {
    const js = read('screens/designer/chat-panel.js');
    expect(js).toMatch(/appliedSinceLastTurn = true;\s*syncQuickRow\(\);[\s\S]{0,120}scrollToEnd\(\);/);
    expect(js).toMatch(/expirePending\(\);\s*appliedSinceLastTurn = false;/);
  });
});

describe('36: a picture address that does not load says so', () => {
  it('the thumbnail error shows the warning for the current address', () => {
    const sv = read('screens/designer/simple-view.js');
    expect(sv).toMatch(/thumb\.addEventListener\('error'[\s\S]{0,300}imageHint\.textContent = BROKEN_PICTURE_LINE/);
    expect(sv).toContain('That picture did not load.');
  });
});

describe('37 and 38: the header name renames, a missing activity says so', () => {
  const html = read('screens/designer/editor.html');
  const js = read('screens/designer/editor.js');
  it('the name is a button that opens Settings at the Name box', () => {
    expect(html).toMatch(/<button id="header-game-name"[^>]*aria-label="Rename this activity"/);
    expect(js).toMatch(/headerGameName\.addEventListener\('click'[\s\S]{0,400}settingsName\.focus\(\)/);
  });
  it('a failed load shows the not-found card and turns off Saved, Check, Try it out, Host', () => {
    expect(html).toContain('We could not find that activity');
    expect(js).toMatch(/showLoadFailure\(error\.status === 404\)/);
    expect(js).toMatch(/\['review-btn', 'test-game-btn', 'host-btn'\][\s\S]{0,120}btn\.disabled = true/);
    expect(js).toMatch(/if \(!el \|\| editorLoadFailed\) return;/);
    expect(read('screens/designer/editor.css')).toMatch(/\.load-error\[hidden\], #editor-body\[hidden\], \.save-status\[hidden\]/);
  });
});

describe('39 to 42: the recipe forms on the Create page', async () => {
  const { loadAllRecipes, getRecipe, listRecipes } = await import('../../engine/recipe-loader.js');
  const { compileRecipe } = await import('../../engine/recipe-compiler.js');
  const { buildActivityMap, joinLines } = await import('../../engine/activity-map.js');
  const { mapPreviewParams } = await import('../../engine/recipe-map-params.js');
  await loadAllRecipes();
  const mapOf = (id) => {
    const { config } = compileRecipe(getRecipe(id), mapPreviewParams(getRecipe(id)));
    return config ? buildActivityMap(config) : null;
  };

  it('39: Idea Chain\'s helper is in teacher words', () => {
    const helper = getRecipe('idea-chain').parameters.transformPrompt.helper;
    expect(helper).not.toMatch(/fresh start|must work on any version/);
  });

  it('40: a title line never runs into the text', () => {
    expect(joinLines('STORY BUILDER\n\nEveryone starts')).toBe('STORY BUILDER: Everyone starts');
    expect(joinLines('Draw from memory: Winnie the Pooh\n\nNo references!')).toBe('Draw from memory: Winnie the Pooh. No references!');
    expect(joinLines('Done.\nNext line')).toBe('Done. Next line');
    expect(mapOf('story-builder').stops[0].detail).toMatch(/^STORY BUILDER: Everyone/);
  });

  it('41: every listed recipe draws What happens before the form is filled', () => {
    for (const r of listRecipes()) {
      const map = mapOf(r.id);
      expect(map && map.stops.length, r.id).toBeGreaterThan(0);
    }
    expect(mapOf('creative-vote').stops[0].detail).toContain('pickle');
  });

  it('42: a poll\'s chart is the class\'s results, not their work', () => {
    const poll = mapOf('class-poll');
    expect(poll.stops[1].carries).toBe('results-go-up-front');
    expect(mapOf('question-share').stops.some((s) => s.carries === 'work-goes-up-front')).toBe(true);
    expect(read('screens/shared/activity-map.js')).toContain("'results-go-up-front': \"the class's results go up on the projector\"");
  });
});

describe('43: a close match is a button, never after a refusal on purpose', () => {
  it('the no-match card builds the suggestion only when it is not harm', () => {
    const js = read('screens/designer/designer.js');
    expect(js).toMatch(/if \(data\.suggestion && !harm\) \{[\s\S]{0,500}'Build the close match'[\s\S]{0,300}renderAIDescriptionStep\(modal, overlay, data\.suggestion\)/);
  });
});

describe('47: the heart is a toggle with one name', () => {
  it('Favorite "X" with aria-pressed, never Remove', () => {
    for (const file of ['screens/shared/my-yard.js', 'screens/designer/designer.js', 'screens/library/library.js']) {
      const js = read(file);
      expect(js, file).not.toMatch(/'Remove "'/);
      expect(js, file).toContain("'Favorite \"' + game.name");
    }
  });
});

describe('32: the drawing pad has a name and an instruction', () => {
  const html = read('screens/player/index.html');
  it('the canvas carries role, label, and a described-by hint', () => {
    expect(html).toMatch(/<canvas id="draw-pad"[^>]*role="img"[^>]*aria-label="Drawing pad"[^>]*aria-describedby="draw-hint"/);
    expect(html).toMatch(/<p id="draw-hint"[^>]*>Draw with a finger, a mouse, or a pen\./);
  });
  it('the label is translated on the student screen', () => {
    expect(read('screens/player/player.js')).toContain("UiLang.t('Drawing pad')");
  });
});
