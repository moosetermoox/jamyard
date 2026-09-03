/**
 * Phase handler registry — imports all handler modules to self-register.
 * Re-exports registry functions for use by the server.
 */

// Wave 1: Simple emit-and-done handlers
import './end.js';
import './announce.js';
import './reveal.js';
import './preview.js';

// Wave 2: Medium complexity (compute + emit, some with room state)
import './eliminate.js';
import './winner.js';
import './leaderboard.js';
import './team-split.js';
import './team-roles.js';
import './ai-process.js';
import './collect.js';
import './collect-choice.js';

// Wave 3: Complex handlers with persistent room state
import './vote.js';
import './reveal-one.js';
import './rank.js';
import './rate.js';
import './wager.js';
import './relay.js';
import './turn.js';
import './merge.js';
import './one-voice.js';
import './buzz.js';
import './estimate.js';
import './match.js';
import './sort.js';
import './checklist.js';
import './solo-quiz.js';

// Wave 4: Orchestration and special handlers
import './foreach.js';
import './ai-eliminate.js';

// Re-export registry API
export { getHandler, hasHandler } from './phase-registry.js';
export { createPhaseContext } from './phase-context.js';
