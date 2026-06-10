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
  END_GAME:             'end-game',
  ADVANCE_PHASE:        'advance-phase',

  // --- Collect Phase ---
  SUBMIT_RESPONSE:      'submit-response',
  RESPONSE_RECEIVED:    'response-received',
  RESPONSE_REJECTED:    'response-rejected',
  CLOSE_SUBMISSIONS:    'close-submissions',

  // --- Host Moderation ---
  SUBMISSIONS_UPDATE:   'submissions-update',
  MODERATE_HIDE:        'moderate-hide',
  MODERATE_KICK:        'moderate-kick',
  KICKED:               'kicked',

  // --- Teacher Console (private second-device view; host screen is projected) ---
  JOIN_TEACHER:         'join-teacher',        // console -> server: code + pin
  TEACHER_JOINED:       'teacher-joined',      // server -> console: snapshot of current state
  TEACHER_JOIN_ERROR:   'teacher-join-error',  // server -> console: bad code/pin
  TEACHER_PHASE:        'teacher-phase',       // server -> consoles: phase changed (id/type/seq)

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
  TEAM_SPLIT:           'team-split',

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
  ESTIMATE_START:       'estimate-start',      // server -> all: prompt, unit, bounds, timer
  ESTIMATE_SUBMIT:      'estimate-submit',     // player -> server: my number
  ESTIMATE_PROGRESS:    'estimate-progress',   // server -> host: x of y guessed
  CLOSE_ESTIMATES:      'close-estimates',     // host -> server: reveal + score
  ESTIMATE_RESULTS:     'estimate-results',    // server -> all: answer, stats, ranked guesses

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
