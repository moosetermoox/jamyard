// --- Blank activity config ---
// The one surviving "template": the editor's start-from-scratch skeleton
// (createBlankConfig in editor.js reads GAME_TEMPLATES.blank).
//
// The content templates that used to live here (Simple Poll, Creative
// Writing, Elimination Game, Quiz Show, Question & Share) were consolidated
// into recipes on 2026-08-07 — recipes ask for the teacher's content up
// front and compile validated configs, which made static copies redundant.
// See recipes/ (class-poll, story-builder, elimination-tournament,
// quiz-show, question-share).

window.GAME_TEMPLATES = {
  blank: {
    name: 'Blank',
    icon: '📄',
    description: 'Start from scratch with just a lobby and end screen',
    config: function () {
      return {
        name: 'New Activity',
        description: '',
        minPlayers: 2,
        maxPlayers: 36,
        phases: {
          lobby: { type: 'lobby', next: 'end' },
          end: { type: 'end', message: 'Thanks for playing!' }
        }
      };
    }
  }
};
