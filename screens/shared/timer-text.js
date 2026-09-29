// What a teacher types into a timer box, read the way they mean it
// (a reviewer 2026-09-28: "2" and "2 min" both became 0:10, only "2:00"
// worked). A plain script that attaches to globalThis, like bench-logic.js.
//   "2:30"                 two minutes thirty
//   "2", "2 min", "2m"     minutes (a bare number up to BARE_MINUTES_MAX)
//   "90", "90s", "90 sec"  seconds (a bare number past it, or marked seconds)
//   "1m30s", "1 min 30"    both
// Returns whole seconds, or null when the text is not a time at all.
(function () {
  var BARE_MINUTES_MAX = 20;

  function parse(text) {
    var t = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t) return null;
    var m = /^(\d{1,3}):(\d{1,2})$/.exec(t);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    m = /^(\d+(?:\.\d+)?) ?(?:s|sec|secs|second|seconds)\.?$/.exec(t);
    if (m) return Math.round(parseFloat(m[1]));
    m = /^(\d+(?:\.\d+)?) ?(?:m|min|mins|minute|minutes)\.?$/.exec(t);
    if (m) return Math.round(parseFloat(m[1]) * 60);
    m = /^(\d+) ?(?:m|min|mins|minutes?) ?(?:and )?(\d+) ?(?:s|sec|secs|seconds?)?$/.exec(t);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    m = /^(\d+(?:\.\d+)?)$/.exec(t);
    if (m) {
      var n = parseFloat(m[1]);
      return n <= BARE_MINUTES_MAX ? Math.round(n * 60) : Math.round(n);
    }
    return null;
  }

  // Seconds as m:ss, under a minute too ("0:58", never "58")
  function format(seconds) {
    var s = Math.max(0, Math.round(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  globalThis.TimerText = { parse: parse, format: format, BARE_MINUTES_MAX: BARE_MINUTES_MAX };
})();
