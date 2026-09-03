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
  'solo-quiz': 'Self-paced quiz',
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
  'team-roles': 'Assign roles',
  'merge': 'Groups combine answers',
  'relay': 'Take turns',
  'turn': 'Team turns',
  'checklist': 'Group checklist',
  'one-voice': 'Count together',
  'ai-process': 'AI transforms answers',
  'ai': 'AI transforms answers',
  'foreach': 'For each answer',
  'guessing-rounds': 'Guessing rounds',
  'quiz': 'Quiz rounds',
  'teams': 'Split into teams',
  'end': 'Wrap up'
};

// One-sentence teacher-facing blurb per step type. Shown as hover
// tooltips on Builder palette tiles and anywhere else a step needs a
// short "what does this do". Same rule as names: this is the only copy
// of each blurb.
window.PHASE_BLURBS = {
  'lobby': 'Students join with the room code and wait for you to start.',
  'collect': 'Every student types a short answer to your question.',
  'collect-choice': 'Students pick one of the choices you set; add a correct answer to make it a quiz.',
  'solo-quiz': 'Students work through a question list on their own devices at their own pace; the projector shows progress only.',
  'collect-two': 'Students submit two linked answers; the secret one stays hidden until a reveal.',
  'estimate': 'Everyone guesses a number; closest to the answer earns points. No answer set makes it a poll.',
  'match': 'Students pair up two lists (like words and definitions), scored automatically.',
  'sort': 'Students place each item into the right bucket, graded or as a class poll.',
  'buzz': 'You ask a question out loud; the first student to buzz answers and you judge it.',
  'announce': 'Puts a message on every screen, good for intros and instructions.',
  'reveal': 'Shows results or content from an earlier step to the whole class.',
  'reveal-one': 'You reveal submissions one at a time, at your own pace.',
  'leaderboard': 'Shows current scores and rankings to everyone.',
  'winner': 'Crowns the winner with a drumroll and shows what they won for.',
  'preview': 'Only you see the content first; approve it before the class does.',
  'vote': 'The class votes for a favorite, one pick each or head-to-head.',
  'rank': 'Students put a list in their preferred order; the class ranking combines them.',
  'rate': 'Students rate something on scales you define.',
  'wager': 'Students bet points on which option will be right.',
  'eliminate': 'Removes the lowest-scoring players from the running.',
  'ai-eliminate': 'AI checks each answer against your rule and eliminates rule-breakers.',
  'team-split': 'Divides the class into teams: random, balanced, your picks, or student choice.',
  'team-roles': 'Gives every group member a job (Facilitator, Recorder, ...), dealt or student-picked.',
  'merge': 'Pairs or small groups combine their answers into one shared answer.',
  'relay': 'Students take turns adding to one growing piece, one at a time.',
  'turn': 'Charades style: one describer per team, the team guesses against the clock.',
  'checklist': 'Each group works through the same to-do list; the projector shows live progress.',
  'one-voice': 'The class counts to a target together; two voices at once resets it.',
  'ai-process': 'AI reads the class\'s answers and turns them into something new.',
  'ai': 'AI reads the class\'s answers and turns them into something new.',
  'foreach': 'Repeats a set of steps once for each answer from an earlier step.',
  'guessing-rounds': 'A round per submission: show each clue, everyone guesses, then the reveal.',
  'quiz': 'Scored questions with one right answer each; fast correct answers earn more, leaderboard at the end.',
  'teams': 'Divides the class into teams: random, balanced, your picks, or student choice.',
  'end': 'Wraps up the activity with a final message.'
};
