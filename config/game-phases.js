/**
 * Game phase configuration
 * Defines the state machine transitions for game flow
 */
export const gamePhases = {
  initialState: 'lobby',
  transitions: {
    lobby: ['collect'],
    collect: ['process'],
    process: ['reveal'],
    reveal: ['collect', 'end'],
    end: []
  }
};
