/**
 * Shared socket event constants.
 * Every socket.io event name used between server and clients.
 *
 * Naming convention: CATEGORY_ACTION
 * Usage: import { EVENTS } from './engine/events.js';
 *        ctx.emitToRoom(EVENTS.GAME_ENDED, { ... });
 */

export const EVENTS = {
  // --- Room & Connection ---
  GAMES_LIST:           'games-list',
  ROOM_CREATED:         'room-created',
  CREATE_ROOM_ERROR:    'create-room-error',
  JOIN_ROOM:            'join-room',
  JOIN_SUCCESS:         'join-success',
  JOIN_ERROR:           'join-error',
  ROOM_CLOSED:          'room-closed',
  PLAYER_JOINED:        'player-joined',
  PLAYER_LEFT:          'player-left',
  PLAYER_DISCONNECTED:  'player-disconnected',
  PLAYER_RECONNECTED:   'player-reconnected',

  // --- Game Lifecycle ---
  GET_GAMES:            'get-games',
  CREATE_ROOM:          'create-room',
  START_GAME:           'start-game',
  GAME_STARTED:         'game-started',
  GAME_ENDED:           'game-ended',
  PLAYER_DONE:          'player-done',         // server -> one player: rolling start, your last input landed
  END_GAME:             'end-game',
  ADVANCE_PHASE:        'advance-phase',

  // --- Timer extension (teacher: "a bit more time") ---
  EXTEND_TIMER:         'extend-timer',        // host/console -> server: add seconds to the running input timer
  TIMER_EXTENDED:       'timer-extended',      // server -> room: every screen shifts its countdown by addSeconds

  // --- Collect Phase ---
  SUBMIT_RESPONSE:      'submit-response',
  RESPONSE_RECEIVED:    'response-received',
  LIVE_TALLY:           'live-tally',          // server -> host: live poll chart rows (counts only)
  RESPONSE_REJECTED:    'response-rejected',
  RESPONSE_ACCEPTED:    'response-accepted',    // server -> submitting player only: stored, safe to show "submitted"
  CLOSE_SUBMISSIONS:    'close-submissions',

  // --- Holding screens (2026-08-08 field test: waits had zero content) ---
  // Counts only, never names — mid-phase submission status on a student
  // device must not create who's-slow pressure (names stay on host/console).
  ROOM_PROGRESS:        'room-progress',
  MEADOW_NUDGE:         'meadow-nudge',        // player -> server: move my block (normalized fx/fy)
  MEADOW_MOVED:         'meadow-moved',        // server -> room: block {index} moved (anonymous, no ids)
  MEADOW_YOU:           'meadow-you',          // server -> submitting player only: your block's index

  // --- Word help (engine/word-help.js): tap a word, spend a token, see it translated ---
  WORD_LOOKUP:          'word-lookup',         // player -> server: {word, sentence}
  WORD_LOOKUP_RESULT:   'word-lookup-result',  // server -> that player only: {ok, word, translation, left}
  TEACHER_WORD_HELP:    'teacher-word-help',   // server -> consoles: which words the class tapped (counts, no names)
  // Lobby only — the projected host roster is already public to the class.
  ROOM_ROSTER:          'room-roster',

  // --- Host Moderation ---
  SUBMISSIONS_UPDATE:   'submissions-update',
  MODERATE_HIDE:        'moderate-hide',
  MODERATE_KICK:        'moderate-kick',
  KICKED:               'kicked',
  SESSION_REPLACED:     'session-replaced',   // server -> old tab: same student joined again elsewhere

  // --- Teacher Console (private second-device view; host screen is projected) ---
  JOIN_TEACHER:         'join-teacher',        // console -> server: code + pin
  TEACHER_JOINED:       'teacher-joined',      // server -> console: snapshot of current state
  TEACHER_JOIN_ERROR:   'teacher-join-error',  // server -> console: bad code/pin
  TEACHER_PHASE:        'teacher-phase',       // server -> consoles: phase changed (id/type/seq)
  TEACHER_ROSTER:       'teacher-roster',      // server -> consoles: live joined-player roster
  TEACHER_CONSOLE_JOINED: 'teacher-console-joined', // server -> host: a console paired (pairing visibility)
  TEACHER_LATE_SEAT:    'teacher-late-seat',   // server -> consoles: a late joiner was seated (team / role, or still picking)
  SHOW_DISCUSSION:      'show-discussion',      // console -> server: put this step's discussion prompt on the projector
  DISCUSSION_PROMPT:    'discussion-prompt',    // server -> host: the prompt text to show (from the config, never the client)

  // --- AI Processing ---
  PROCESSING_STARTED:   'processing-started',

  // --- Reveal Phase ---
  SHOW_RESULTS:         'show-results',

  // --- Preview Phase ---
  PREVIEW_CONTENT:      'preview-content',
  PREVIEW_APPROVE:      'preview-approve',
  PREVIEW_REJECT:       'preview-reject',
  PREVIEW_EDIT:         'preview-edit',

  // --- Vote Phase ---
  VOTE_START:           'vote-start',
  SUBMIT_VOTE:          'submit-vote',
  VOTE_RECEIVED:        'vote-received',
  CLOSE_VOTING:         'close-voting',

  // --- Eliminate / Winner ---
  ELIMINATION_RESULTS:  'elimination-results',
  WINNER_ANNOUNCED:     'winner-announced',

  // --- Announce ---
  ANNOUNCE:             'announce',

  // --- Leaderboard ---
  LEADERBOARD:          'leaderboard',

  // --- Reveal-One Phase ---
  REVEAL_ONE_START:     'reveal-one-start',
  REVEAL_ONE_ITEM:      'reveal-one-item',
  REVEAL_ONE_COMPLETE:  'reveal-one-complete',
  REVEAL_NEXT:          'reveal-next',

  // --- Team Split ---
  TEAM_SPLIT:           'team-split',         // server -> all: final teams (every method ends here)
  TEAM_SPLIT_SETUP:     'team-split-setup',   // server -> host/consoles: roster + drafts (teacher mode)
  TEAM_ASSIGN:          'team-assign',        // host/console -> server: put player in team (teacher mode; team '' = unassign)
  TEAM_SPLIT_CONFIRM:   'team-split-confirm', // host/console -> server: finalize (auto-fills stragglers)
  TEAM_CHOICE_START:    'team-choice-start',  // server -> player: pick your spot (choice mode)
  TEAM_PICK:            'team-pick',          // player -> server: I want this team (re-pick allowed until close)
  TEAM_CHOICE_UPDATE:   'team-choice-update', // server -> all: live rosters/open-spot counts

  // --- Team Roles ---
  TEAM_ROLES:           'team-roles-final',   // server -> all: everyone's role (both methods end here)
  TEAM_ROLES_START:     'team-roles-start',   // server -> player: pick your role (choice mode)
  ROLE_PICK:            'role-pick',          // player -> server: I want this role (re-pick allowed until close)
  TEAM_ROLES_UPDATE:    'team-roles-update',  // server -> all: live per-group role claims

  // --- Rank Phase ---
  RANK_START:           'rank-start',
  RANK_SUBMIT:          'rank-submit',
  RANK_RECEIVED:        'rank-received',
  CLOSE_RANKING:        'close-ranking',

  // --- Wager Phase ---
  WAGER_START:          'wager-start',
  WAGER_SUBMIT:         'wager-submit',
  WAGER_RECEIVED:       'wager-received',
  CLOSE_WAGER:          'close-wager',
  WAGER_RESOLVE:        'wager-resolve',
  WAGER_NEED_RESOLVE:   'wager-need-resolve',

  // --- Rate Phase ---
  RATE_START:           'rate-start',
  RATE_SUBMIT:          'rate-submit',
  RATE_RECEIVED:        'rate-received',
  RATE_RESULTS:         'rate-results',
  CLOSE_RATING:         'close-rating',

  // --- Merge Phase (Connection Pack: think-pair-share) ---
  MERGE_START:          'merge-start',         // server -> player: your group's seeds + shared draft
  MERGE_DRAFT:          'merge-draft',         // player -> server: shared draft text (debounced client-side)
  MERGE_DRAFT_UPDATE:   'merge-draft-update',  // server -> other group members: draft changed (last-write-wins)
  MERGE_TAKE_PEN:       'merge-take-pen',      // player -> server: request the group's pen (granted once the holder idles)
  MERGE_PEN:            'merge-pen',           // server -> group members: who holds the pen ({held, mine, holderName})
  MERGE_AGREE:          'merge-agree',         // player -> server: I agree with the current draft
  MERGE_STATUS:         'merge-status',        // server -> group: agreed count / reset notice
  MERGE_PROGRESS:       'merge-progress',      // server -> host: groups submitted / total
  CLOSE_MERGE:          'close-merge',         // host -> server: force-close (current drafts submit)

  // --- One Voice Phase (Connection Pack: cooperative counting) ---
  ONE_VOICE_START:      'one-voice-start',     // server -> all: target, window, current state
  ONE_VOICE_TAP:        'one-voice-tap',       // player -> server: I say the next number
  ONE_VOICE_COUNT:      'one-voice-count',     // server -> all: count advanced (no attribution)
  ONE_VOICE_YOU:        'one-voice-you',       // server -> tapper only: subtle "you said N"
  ONE_VOICE_RESET:      'one-voice-reset',     // server -> all: collision! back to one (no attribution)
  ONE_VOICE_REJECT:     'one-voice-reject',    // server -> tapper only: same-player-twice / lockout
  ONE_VOICE_SUCCESS:    'one-voice-success',   // server -> all: we made it
  CLOSE_ONE_VOICE:      'close-one-voice',     // host -> server: store stats + move on

  // --- Host rejoin (host F5 / server restart recovery) ---
  HOST_REJOIN:          'host-rejoin',         // host -> server: rebind via code + hostToken
  HOST_REJOIN_ERROR:    'host-rejoin-error',   // server -> host: room gone / bad token

  // --- Buzz Phase (first-tap-wins buzzer rounds) ---
  BUZZ_START:           'buzz-start',          // server -> all: prompt, points, question #
  BUZZ_TAP:             'buzz-tap',            // player -> server: I buzz in!
  BUZZ_LOCKED:          'buzz-locked',         // server -> all: who buzzed first
  BUZZ_REJECT:          'buzz-reject',         // server -> tapper only: too late / locked out
  BUZZ_JUDGE:           'buzz-judge',          // host -> server: correct true/false
  BUZZ_RESULT:          'buzz-result',         // server -> all: judged + scores
  BUZZ_NEXT:            'buzz-next',           // host -> server: next question (clear lockouts)
  BUZZ_OPEN:            'buzz-open',           // server -> all: buzzer (re)opened
  BUZZ_FINISH:          'buzz-finish',         // host -> server: store scores + move on

  // --- Estimate Phase (numeric guessing) ---
  SOLO_QUIZ_START:      'solo-quiz-start',      // server -> host: title + progress board (never a question)
  SOLO_QUIZ_QUESTION:   'solo-quiz-question',   // server -> one player: your current question (or done)
  SOLO_QUIZ_ANSWER:     'solo-quiz-answer',     // player -> server: my pick for question N
  SOLO_QUIZ_FEEDBACK:   'solo-quiz-feedback',   // server -> one player: right/wrong + the next question
  SOLO_QUIZ_PROGRESS:   'solo-quiz-progress',   // server -> host/consoles: started/finished + per-question rates
  SOLO_QUIZ_DONE:       'solo-quiz-done',       // server -> one player: your finish line (or the close caught you)
  SOLO_QUIZ_RESULTS:    'solo-quiz-results',    // server -> host/consoles: final board
  CLOSE_SOLO_QUIZ:      'close-solo-quiz',      // host/console -> server: grade everyone, show the board

  ESTIMATE_START:       'estimate-start',      // server -> all: prompt, unit, bounds, timer
  ESTIMATE_SUBMIT:      'estimate-submit',     // player -> server: my number
  ESTIMATE_PROGRESS:    'estimate-progress',   // server -> host: x of y guessed
  CLOSE_ESTIMATES:      'close-estimates',     // host -> server: reveal + score
  ESTIMATE_RESULTS:     'estimate-results',    // server -> all: answer, stats, ranked guesses

  // --- Match Phase (pair two lists: vocab ↔ definitions) ---
  MATCH_START:          'match-start',         // server -> all: prompt, left column, shuffled right column
  MATCH_SUBMIT:         'match-submit',        // player -> server: right texts in left order
  MATCH_RECEIVED:       'match-received',      // server -> host: x of y matched
  CLOSE_MATCHING:       'close-matching',      // host -> server: score + reveal per-pair accuracy
  MATCH_RESULTS:        'match-results',       // server -> all: correct pairs, class accuracy, your score

  // --- Sort Phase (place items into named buckets) ---
  SORT_START:           'sort-start',          // server -> all: prompt, buckets, items
  SORT_SUBMIT:          'sort-submit',         // player -> server: bucket names in item order
  SORT_RECEIVED:        'sort-received',       // server -> host: x of y sorted
  CLOSE_SORTING:        'close-sorting',       // host -> server: score + reveal distributions
  SORT_RESULTS:         'sort-results',        // server -> all: per-item distribution (+accuracy when graded)

  // --- Checklist Phase (shared group to-do list + progress dashboard) ---
  CHECKLIST_START:      'checklist-start',      // server -> all: items, your group's state, dashboard
  CHECK_ITEM:           'check-item',           // player/teacher -> server: toggle one item
  CHECKLIST_UPDATE:     'checklist-update',     // server -> group: live checked state; host/teachers: progress
  CLOSE_CHECKLIST:      'close-checklist',      // host -> server: end work time, store results
  CHECKLIST_RESULTS:    'checklist-results',    // server -> all: final per-group progress

  // --- Relay Phase ---
  RELAY_TURN:           'relay-turn',
  RELAY_SUBMIT:         'relay-submit',
  RELAY_UPDATE:         'relay-update',
  RELAY_WAITING:        'relay-waiting',
  RELAY_FINISH_ALL:     'relay-finish-all',

  // --- Turn Phase (charades/describe-it style) ---
  TURN_START:           'turn-start',         // server -> all: a new describer's turn begins
  TURN_ITEM:            'turn-item',          // server -> all (role-filtered): the current item / waiting view
  TURN_GOT_IT:          'turn-got-it',        // describer -> server: captured this item
  TURN_SKIP:            'turn-skip',          // describer -> server: skip to next item
  TURN_END:             'turn-end',           // server -> all: current describer's turn finished (timer or pool empty)
  TURN_COMPLETE:        'turn-complete',      // server -> all: full pool exhausted, phase done

  // --- Error Recovery ---
  PHASE_ERROR:          'phase-error',
  PHASE_PAUSED:         'phase-paused',
  PHASE_RESUMED:        'phase-resumed',
  RETRY_PHASE:          'retry-phase',
  SKIP_PHASE:           'skip-phase',

  // --- General ---
  WAITING:              'waiting',
};
