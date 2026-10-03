/**
 * The transition fields and their walks, for engine code. The one copy
 * lives in screens/shared/transitions.js (a browser global, so the editor
 * reads the same list); this facade gives it ES module exports.
 *
 * A new field that carries a step to another step goes in that file's
 * FIELDS and nowhere else: the state machine's graph, the validator's ref
 * check, cycle finder and reachability walk, the recipe compiler's
 * drop-rewiring, the editor's order, delete-relink and checks, and every
 * primary-path walker read it from here. tests/engine/transitions.test.js
 * sweeps the tree for a file that grows its own copy.
 */
import '../screens/shared/transitions.js';

const T = globalThis.Transitions;

export const TRANSITION_FIELDS = T.FIELDS;
export const TRANSITION_NAMES = T.NAMES;
export const transitionEdges = T.edges;
export const transitionTargets = T.targets;
export const forwardEdges = T.forwardEdges;
export const primaryNext = T.primaryNext;
export const mapTransitionTargets = T.mapTargets;
export const retargetTransitions = T.retarget;
