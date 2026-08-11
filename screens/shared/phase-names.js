// phase-names.js — THE canonical display name for every step type.
//
// One name per step, everywhere a teacher sees one: Builder palette tiles
// and canvas cards, Simple view sentences, "Goes to" refs, pickers, and the
// Create page's storyboard. Views may wrap these names in sentence
// scaffolding ("Then: Open answer") but never substitute a different name;
// two names for one step reads as two different steps (teacher feedback
// 2026-08-11).
//
// Keys are phase types, plus the palette/storyboard pseudo-types
// (collect-two, guessing-rounds, ai) that compile into real types.

window.PHASE_NAMES = {
  'lobby': 'Waiting room',
  'collect': 'Open answer',
  'collect-choice': 'Multiple choice',
  'collect-two': 'Secret + clue',
  'estimate': 'Guess a number',
  'match': 'Match pairs',
  'sort': 'Sort into buckets',
  'buzz': 'Buzzer round',
  'announce': 'Announcement',
  'reveal': 'Reveal results',
  'reveal-one': 'Reveal one at a time',
  'leaderboard': 'Leaderboard',
  'winner': 'Crown a winner',
  'preview': 'Teacher preview',
  'vote': 'Vote',
  'rank': 'Rank a list',
  'rate': 'Rate on scales',
  'wager': 'Place bets',
  'eliminate': 'Eliminate players',
  'ai-eliminate': 'AI judges and eliminates',
  'team-split': 'Split into teams',
  'merge': 'Groups combine answers',
  'relay': 'Take turns',
  'turn': 'Team turns',
  'checklist': 'Group checklist',
  'one-voice': 'Count together',
  'ai-process': 'AI transforms answers',
  'ai': 'AI transforms answers',
  'foreach': 'For each answer',
  'guessing-rounds': 'Guessing rounds',
  'end': 'Wrap up'
};
