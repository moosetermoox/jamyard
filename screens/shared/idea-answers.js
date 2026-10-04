// idea-answers.js — the Create page's follow-up answers become part of the
// idea (2026-10-04). The teacher's words go in as written, under the idea,
// so the matcher, the plan, and the ideas log all read the fuller idea; a
// skipped or blank answer leaves the idea as typed.
(function () {
  'use strict';
  var ANSWER_CAP = 900;

  function combine(description, answered) {
    var idea = String(description || '').trim();
    var lines = [];
    (Array.isArray(answered) ? answered : []).forEach(function (a) {
      if (!a) return;
      var answer = String(a.answer || '').trim();
      if (!answer) return;
      if (answer.length > ANSWER_CAP) answer = answer.slice(0, ANSWER_CAP).trim();
      var question = String(a.question || '').trim();
      lines.push('- ' + (question ? question + ' ' : '') + answer);
    });
    return lines.length ? idea + '\n\nMore from the teacher:\n' + lines.join('\n') : idea;
  }

  window.IdeaAnswers = { combine: combine };
})();
