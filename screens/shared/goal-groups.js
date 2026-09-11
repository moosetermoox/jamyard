/**
 * goal-groups.js — the four goal piles (Connect / Think / Review / Play) and how
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
    discuss: 'think', decide: 'think', reflect: 'think',
    review: 'review',
    create: 'play', energize: 'play'
  };

  // `label` is the one-word pile name; `job` is how the front door and
  // the yard's chips say it since the 15b home (2026-09-10): the four jobs
  // a class needs done. Keys never change (internals keep them).
  var GROUPS = [
    { key: 'connect', label: 'Connect', job: 'To connect' },
    { key: 'think', label: 'Think', job: 'To think' },
    { key: 'review', label: 'Review', job: 'To review' },
    { key: 'play', label: 'Play', job: 'To just have fun' }
  ];

  function groupOf(game) {
    var tags = (game && Array.isArray(game.tags)) ? game.tags : [];
    for (var i = 0; i < tags.length; i++) {
      if (GOAL_TO_GROUP[tags[i]]) return GOAL_TO_GROUP[tags[i]];
    }
    return 'think';
  }

  // The job line an activity's meta carries ("To think · ~10 min")
  function jobOf(game) {
    var key = groupOf(game);
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].key === key) return GROUPS[i].job;
    }
    return GROUPS[1].job;
  }

  // Goal tags that belong to a group (the yard's chip filter reads these).
  function goalsIn(key) {
    var out = [];
    for (var goal in GOAL_TO_GROUP) {
      if (GOAL_TO_GROUP[goal] === key) out.push(goal);
    }
    return out;
  }

  window.GoalGroups = { GOAL_TO_GROUP: GOAL_TO_GROUP, GROUPS: GROUPS, groupOf: groupOf, jobOf: jobOf, goalsIn: goalsIn };
})();
