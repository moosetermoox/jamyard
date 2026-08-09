// Teacher profile — who is this library for? Grade band + subjects, saved
// on THIS browser only (localStorage, the same no-accounts model as
// ActivityPrefs). The profile personalizes prompt decks ("for your class"
// picks first) and the Customize tailoring; nothing about it leaves the
// device except as plain words inside requests the teacher initiates.
//
// Plain script (browser global) + side-effect-importable in tests; falls
// back to in-memory storage where localStorage doesn't exist.

(function () {
  'use strict';

  var KEY = 'lanyard-teacher-profile';
  var DISMISS_KEY = 'lanyard-teacher-profile-skip';
  var memory = {};

  var GRADE_BANDS = [
    { id: 'elementary', label: 'Elementary (K-5)' },
    { id: 'middle', label: 'Middle school (6-8)' },
    { id: 'high', label: 'High school (9-12)' },
    { id: 'adult', label: 'College, adult, or staff' }
  ];

  var SUBJECTS = [
    { id: 'social-studies', label: 'Social studies' },
    { id: 'english', label: 'English / ELA' },
    { id: 'science', label: 'Science' },
    { id: 'math', label: 'Math' },
    { id: 'languages', label: 'World languages' },
    { id: 'advisory', label: 'Advisory / SEL' },
    { id: 'other', label: 'Something else' }
  ];

  function read(key) {
    try {
      var raw = globalThis.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return memory[key] || null;
    }
  }

  function write(key, value) {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      memory[key] = value;
    }
  }

  function labelFor(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].label;
    }
    return null;
  }

  globalThis.TeacherProfile = {
    GRADE_BANDS: GRADE_BANDS,
    SUBJECTS: SUBJECTS,

    // null when never saved (or storage was cleared).
    get: function () {
      var p = read(KEY);
      if (!p || typeof p !== 'object') return null;
      var gradeBand = labelFor(GRADE_BANDS, p.gradeBand) ? p.gradeBand : null;
      var subjects = Array.isArray(p.subjects)
        ? p.subjects.filter(function (s) { return labelFor(SUBJECTS, s); })
        : [];
      if (!gradeBand && subjects.length === 0) return null;
      return { gradeBand: gradeBand, subjects: subjects };
    },

    save: function (profile) {
      write(KEY, {
        gradeBand: profile.gradeBand || null,
        subjects: Array.isArray(profile.subjects) ? profile.subjects : []
      });
      write(DISMISS_KEY, true);
    },

    clear: function () {
      try {
        globalThis.localStorage.removeItem(KEY);
        globalThis.localStorage.removeItem(DISMISS_KEY);
      } catch (e) {
        delete memory[KEY];
        delete memory[DISMISS_KEY];
      }
    },

    // "Skip for now" hides the setup card without saving anything.
    dismiss: function () {
      write(DISMISS_KEY, true);
    },

    // Should the library offer the first-visit setup card?
    shouldOffer: function () {
      return !this.get() && read(DISMISS_KEY) !== true;
    },

    // "Middle school (6-8), Social studies and Science" — for chips and for
    // the Customize request. Empty string when nothing is set.
    describe: function () {
      var p = this.get();
      if (!p) return '';
      var bits = [];
      if (p.gradeBand) bits.push(labelFor(GRADE_BANDS, p.gradeBand));
      var subjectLabels = p.subjects.map(function (s) {
        return labelFor(SUBJECTS, s);
      }).filter(Boolean);
      if (subjectLabels.length > 0) {
        var joined = subjectLabels.length > 1
          ? subjectLabels.slice(0, -1).join(', ') + ' and ' + subjectLabels[subjectLabels.length - 1]
          : subjectLabels[0];
        bits.push(joined);
      }
      return bits.join(', ');
    }
  };
})();
