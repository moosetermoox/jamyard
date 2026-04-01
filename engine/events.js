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
  CLOSE_SUBMISSIONS:    'close-submissions',

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

  // --- Relay Phase ---
  RELAY_TURN:           'relay-turn',
  RELAY_SUBMIT:         'relay-submit',
  RELAY_UPDATE:         'relay-update',
  RELAY_WAITING:        'relay-waiting',

  // --- Error Recovery ---
  PHASE_ERROR:          'phase-error',
  RETRY_PHASE:          'retry-phase',
  SKIP_PHASE:           'skip-phase',

  // --- General ---
  WAITING:              'waiting',
};
