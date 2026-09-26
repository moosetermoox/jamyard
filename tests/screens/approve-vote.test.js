/**
 * The second Constitutional Convention review (2026-09-25): a vote that
 * passes more than one proposal, the reveal that shows them, the chat that
 * never reads as code, the plan that explains the hand-out, and the small
 * things (the projector's Close Voting label, the timer chip, the feedback
 * corner). Source-level guards beside the engine test
 * (tests/engine/vote-approve.test.js) and the proof
 * (scripts/simulate-approve-vote.js).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import '../../screens/shared/step-suggestions.js';
import { validate } from '../../engine/game-loader.js';
import { PHASE_SCHEMAS } from '../../engine/phase-schemas.js';
import { STRINGS, translate } from '../../engine/i18n/index.js';
import { parseChatTurn, summarizeConfigForChat } from '../../services/ai-service.js';
import { validateSuggestions } from '../../engine/suggest-validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const S = globalThis.StepSuggestions;

const STATES = ['Virginia', 'Georgia', 'Delaware', 'New York'];
const convention = (approve) => ({
  name: 'Convention',
  description: 'clauses',
  steps: [
    { brick: 'announce', text: 'Welcome, delegates.' },
    { brick: 'collect', text: 'You represent {{thisStep.assigned}}. Write one clause.', items: STATES, timer: 120 },
    Object.assign({ brick: 'vote', text: 'Does this clause belong?' }, approve ? { approve: true } : {}),
    { brick: 'end', text: 'Adjourned.' }
  ]
});

describe('the yes-or-no vote in the storyboard', () => {
  it('compiles approve: true to an approve vote followed by a reveal of what passed, never a crown', () => {
    const { config, problems } = S.compileStoryboard(convention(true));
    expect(problems).toEqual([]);
    const ids = Object.keys(config.phases);
    const voteId = ids.find(id => config.phases[id].type === 'vote');
    const vote = config.phases[voteId];
    expect(vote.mode).toBe('approve');
    expect(vote.excludeAuthors).toBe(true);
    const reveal = config.phases[vote.next];
    expect(reveal.type).toBe('reveal');
    expect(reveal.template).toContain('{{' + voteId + '.approvedList}}');
    expect(ids.some(id => config.phases[id].type === 'winner')).toBe(false);
    const result = validate({ name: 'C', description: 'c', phases: config.phases }, 'c', { returnResults: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join('\n')).not.toMatch(/nothing shows the result/);
  });

  it('keeps the crown for a plain vote over answers', () => {
    const { config } = S.compileStoryboard(convention(false));
    const ids = Object.keys(config.phases);
    expect(ids.some(id => config.phases[id].type === 'winner')).toBe(true);
    expect(ids.some(id => config.phases[id].type === 'vote' && config.phases[id].mode === 'approve')).toBe(false);
  });

  it('rides through the suggestion validator', () => {
    const out = validateSuggestions([{ kind: 'storyboard', storyboard: convention(true) }], { games: [], recipes: [] });
    const sb = out.suggestions.find(s => s.kind === 'storyboard');
    expect(sb.storyboard.steps[2].approve).toBe(true);
    expect(sb.storyboard.steps[1].approve).toBeUndefined();
  });

  it('is the golden prompt\'s shape', () => {
    const golden = JSON.parse(read('tests/designer/golden-prompts.json'));
    const entry = golden.prompts.find(p => p.id === 'constitutional-convention');
    expect(entry.expect.storyboard.steps.find(s => s.brick === 'vote').approve).toBe(true);
  });

  it('is taught to the storyboard, the chat, and the editing AI', () => {
    const src = read('services/ai-service.js');
    expect(src).toContain('Set approve: true when SEVERAL answers should be able to pass');
    expect(src).toContain('YES-OR-NO VOTES ("mode": "approve")');
    expect(src).toContain('A vote can pass MORE THAN ONE answer');
    expect(src).toContain('Never suggest capping the class size');
    expect(src).toContain('never cap the class size or minPlayers/maxPlayers to fit a list');
  });
});

describe('the yes-or-no vote on the screens', () => {
  it('gives the student a ballot with Yes and No on every entry and a Send', () => {
    const src = read('screens/player/player.js');
    expect(src).toContain("mode === 'approve'");
    expect(src).toContain('function showApproveVote');
    expect(src).toContain("UiLang.t('Yes or no on each one')");
    expect(src).toContain("UiLang.t('Send my votes')");
    expect(src).toContain("socket.emit('submit-vote', { code: currentRoomCode, votes })");
    expect(src).toContain('approve: answers[id]');
  });

  it('has its labels in every language table', () => {
    for (const lang of Object.keys(STRINGS)) {
      for (const key of ['Yes', 'No', 'Yes or no on each one', 'Send my votes']) {
        expect(STRINGS[lang][key], `${lang}: ${key}`).toBeTruthy();
      }
    }
    expect(translate('es', 'Yes')).toBe('Sí');
  });

  it('names the mode on the projector and the Close Voting button reads ink on paper', () => {
    expect(read('screens/host/host.js')).toContain("UiLang.t('Yes or no on each one')");
    expect(read('screens/host/styles.css')).toMatch(/#close-voting-btn \{ background: var\(--t-paper\); color: var\(--t-ink\); \}/);
  });

  it('is a choice in the editor with its own tokens', () => {
    const editor = read('screens/designer/editor.js');
    expect(editor).toContain("{ value: 'approve', label: 'Yes or no on each one (several can pass)' }");
    expect(editor).toContain("mode: ['pick-one', 'head-to-head', 'approve']");
    expect(editor).toContain(".approvedList}}");
    const sv = read('screens/designer/simple-view.js');
    expect(sv).toContain('Students say yes or no to each of');
    expect(sv).toContain("approvedList:  'the ones that passed'");
  });

  it('has the schema behind it', () => {
    expect(PHASE_SCHEMAS.vote.fields.mode.values).toEqual(['pick-one', 'head-to-head', 'approve']);
    expect(PHASE_SCHEMAS.vote.fields.passAt.type).toBe('integer');
    expect(PHASE_SCHEMAS.vote.output.fields.approvedList.type).toBe('string');
    expect(read('engine/report.js')).toContain("'Did not pass'");
  });

  it('validates the sim fixture and its reveal reads what passed', () => {
    const cfg = JSON.parse(read('games/_sim-approve-vote/config.json'));
    const result = validate(cfg, '_sim-approve-vote', { returnResults: true });
    expect(result.errors).toEqual([]);
    expect(cfg.phases.vote.mode).toBe('approve');
    expect(cfg.phases.passed.template).toContain('{{vote.approvedList}}');
  });
});

describe('the design chat never reads as code', () => {
  it('reads a whole reply, a wrapped one, and salvages a cut-off one', () => {
    expect(parseChatTurn('{"action": "answer", "reply": "Sure."}')).toEqual({ action: 'answer', reply: 'Sure.' });
    expect(parseChatTurn('Here you go:\n{"action": "answer", "reply": "Sure."}\n').reply).toBe('Sure.');
    const cut = '{"action": "edit", "reply": "I will make every clause a yes-or-no vote.", "editRequest": "In step 3, change the vote so that every student says yes or no to each clau';
    const salvaged = parseChatTurn(cut);
    expect(salvaged.reply).toBe('I will make every clause a yes-or-no vote.');
    // the instruction was cut off, so it is not an edit turn
    expect(salvaged.action).toBe('answer');
    expect(salvaged.editRequest).toBeUndefined();
    const withEdit = '{"action": "edit", "reply": "On it.", "editRequest": "Turn step 3 into a yes-or-no vote (mode approve)."} and then some';
    const parsed = parseChatTurn(withEdit);
    expect(parsed.action).toBe('edit');
    expect(parsed.editRequest).toContain('yes-or-no');
    expect(parseChatTurn('Just prose, no braces.')).toBeNull();
    expect(parseChatTurn('')).toBeNull();
  });

  it('never hands raw JSON to the teacher and gives the triage room for a list', () => {
    const src = read('services/ai-service.js');
    expect(src).toContain("const prose = /^\\s*\\{/.test(text) ? '' : text.trim();");
    expect(src).toMatch(/max_tokens: 1800,\r?\n\s+system: DESIGN_CHAT_PROMPT/);
  });

  it('describes steps by number and says how a hand-out and a vote work', () => {
    const summary = summarizeConfigForChat({
      name: 'Convention',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'You represent {{ask.assigned}}.', dealItems: STATES, next: 'vote' },
        vote: { type: 'vote', mode: 'approve', candidates: 'ask.responses', next: 'end' },
        end: { type: 'end' }
      }
    });
    expect(summary).toContain('Step 2 (collect, id "ask")');
    expect(summary).toContain('hands out 4 items in secret, one per student; a bigger class shares them');
    expect(summary).toContain('voting style: yes or no on every answer, the ones with more yes than no pass');
    const src = read('services/ai-service.js');
    expect(src).toContain('NEVER by the id in brackets in the summary');
  });
});

describe('the plan and the editor explain the hand-out', () => {
  it('says what the placeholder is and lists the items in the plan dialog', () => {
    const designer = read('screens/designer/designer.js');
    expect(designer).toContain('each student sees the one item they were handed in secret');
    expect(designer).toContain("replace(/\\{\\{\\s*thisStep\\.assigned\\s*\\}\\}/g, '(their item)')");
    expect(designer).toContain('added: the list of what passed, each with its yes and no counts');
  });

  it('shows and edits the dealt list on the Question card and names the token in its own step', () => {
    const sv = read('screens/designer/simple-view.js');
    expect(sv).toContain('Each student is secretly handed one of these');
    expect(sv).toContain("return phase.dealItems;");
    expect(sv).toContain("if (head === svSelectedId) return 'the item this student was handed';");
    const editor = read('screens/designer/editor.js');
    expect(editor).toContain("Array.isArray(source.dealItems) && source.dealItems.length");
  });
});

describe('the small things', () => {
  it('reads "none" in an empty timer chip and hides the spinner', () => {
    expect(read('screens/designer/simple-view.js')).toContain("input.placeholder = 'none';");
    const css = read('screens/designer/editor.css');
    expect(css).toContain('.sv-timer::placeholder');
    expect(css).toContain('.sv-timer::-webkit-inner-spin-button');
  });

  it('keeps the feedback corner off the Next step button in the editor', () => {
    expect(read('screens/designer/editor.html')).toContain('<body class="editor-page">');
    const css = read('screens/designer/editor.css');
    expect(css).toContain('body.editor-page #feedback-widget-btn { right: auto; left: 18px; }');
    expect(css).toContain('body.editor-page #settings-panel { padding-bottom: 80px; }');
  });
});

describe('the third Convention run (2026-09-26)', () => {
  it('shows what passed, what did not, and the turnout after a yes-or-no vote, and it validates', () => {
    const { config } = S.compileStoryboard(convention(true));
    const ids = Object.keys(config.phases);
    const voteId = ids.find(id => config.phases[id].type === 'vote');
    const tpl = config.phases[config.phases[voteId].next].template;
    expect(tpl).toContain('{{' + voteId + '.approvedList}}');
    expect(tpl).toContain('Did not pass:');
    expect(tpl).toContain('{{' + voteId + '.rejectedList}}');
    expect(tpl).toContain('{{' + voteId + '.turnout}}');
    const result = validate({ name: 'C', description: 'c', phases: config.phases }, 'c', { returnResults: true });
    expect(result.errors).toEqual([]);
    expect(PHASE_SCHEMAS.vote.output.fields.turnout.type).toBe('string');
  });

  it('lets Add sample answers answer a yes-or-no ballot and send it', () => {
    const player = read('screens/player/player.js');
    const bot = player.slice(player.indexOf("} else if (id === 'vote-section') {"), player.indexOf("} else if (id === 'rank-section') {"));
    expect(bot).toContain(".approve-row");
    expect(bot).toContain(".approve-send");
  });

  it('lists the proposals on the projector while the class votes, with textContent', () => {
    expect(read('screens/host/index.html')).toContain('id="vote-proposals"');
    const host = read('screens/host/host.js');
    expect(host).toContain('proposals, hostTemplate');
    expect(host).toMatch(/li\.textContent = text/);
    expect(read('engine/phase-handlers/vote.js')).toContain('proposals: proposalsForProjector(phase.mode, candidates)');
    expect(read('screens/host/styles.css')).toContain('.vote-proposals[hidden] { display: none; }');
  });

  it('teaches the AI to show what failed and to put each item\'s details into the item', () => {
    const ai = read('services/ai-service.js');
    expect(ai).toContain('{{vote.rejectedList}}');
    expect(ai).toContain('write them INTO each item');
  });

  it('carries the new labels in every language table', () => {
    for (const lang of Object.keys(STRINGS)) {
      expect(STRINGS[lang]['None.']).toBeTruthy();
      expect(STRINGS[lang]['{voted} of {total} students voted.']).toMatch(/\{voted\}.*\{total\}|\{total\}.*\{voted\}/);
    }
  });
});
