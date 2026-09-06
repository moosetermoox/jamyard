/**
 * goal-groups.js — the three goal piles (Connect / Think / Play) and how
 * an activity's goal tags land in one of them. One source for the yard's
 * chips and the home page's shelf filter, so an activity never sits in
 * one pile on the yard and another on the front door.
 *
 * Every activity stands in exactly one group: the first goal tag that
 * maps wins; an untagged activity is Think.
 */
(function () {
  var GOAL_TO_GROUP = {
    connect: 'connect',
    discuss: 'think', decide: 'think', reflect: 'think', review: 'think',
    create: 'play', energize: 'play'
  };

  var GROUPS = [
    { key: 'connect', label: 'Connect' },
    { key: 'think', label: 'Think' },
    { key: 'play', label: 'Play' }
  ];

  function groupOf(game) {
    var tags = (game && Array.isArray(game.tags)) ? game.tags : [];
    for (var i = 0; i < tags.length; i++) {
      if (GOAL_TO_GROUP[tags[i]]) return GOAL_TO_GROUP[tags[i]];
    }
    return 'think';
  }

  // Goal tags that belong to a group (the yard's chip filter reads these).
  function goalsIn(key) {
    var out = [];
    for (var goal in GOAL_TO_GROUP) {
      if (GOAL_TO_GROUP[goal] === key) out.push(goal);
    }
    return out;
  }

  window.GoalGroups = { GOAL_TO_GROUP: GOAL_TO_GROUP, GROUPS: GROUPS, groupOf: groupOf, goalsIn: goalsIn };
})();
