// class-examples.js — the yard's cards in the teacher's own subject and
// grade band (2026-09-24). A teacher who sets Your class on the home
// (shared/class-picker.js, saved by TeacherProfile in this browser only)
// sees every card's words swap to an example from their subject at their
// grade: Live Poll asks about the rock cycle, Vocab Match pairs igneous
// with its meaning, Whose Eyes? gathers the people a dam touches. A card
// opened from the yard carries its example to the make page
// (`?ex=<subject>.<band>`), where the same words are already in the
// question box.
//
// Every word here is AUTHORED (owner's call 2026-09-24: never AI-written
// on the way to the home page) and read by a teacher before it merges.
// The table is plain data: TABLE[activity][subject][band] = the example,
// or TABLE[activity].any[band] for a subject-neutral activity. Bands are
// elementary | middle | high; a college or adult class reads the high
// band. A subject with no entry (Something else) shows the template's
// own words, so nothing here ever replaces a word the teacher typed.
//
// The line-only activities (a quiz, a bluff, a to-do list, whose words
// live in a setup panel) compose their hover line from TOPICS, one noun
// phrase per subject and band, and prefill nothing on the make page.
//
// Plain script (browser global): window.ClassExamples = { pick, forKey,
// keyOf, describe, SUBJECTS, BANDS, TABLE, TOPICS }. No DOM, no fetch.
(function () {
  'use strict';

  var SUBJECTS = ['social-studies', 'english', 'science', 'math', 'languages', 'advisory'];
  var BANDS = ['elementary', 'middle', 'high'];
  var BAND_WORDS = { elementary: 'grades K-5', middle: 'grades 6-8', high: 'grades 9-12' };
  var SUBJECT_WORDS = {
    'social-studies': 'social studies', english: 'English', science: 'science',
    math: 'math', languages: 'a world language', advisory: 'advisory'
  };

  // One noun phrase per subject and band, the thing the class is on this
  // week; it follows "about" or "on" in a sentence
  var TOPICS = {
    'social-studies': { elementary: 'community helpers', middle: 'the causes of the American Revolution', high: 'the New Deal' },
    english: { elementary: 'the story we read today', middle: 'the first chapter', high: 'the author\'s argument' },
    science: { elementary: 'what plants need', middle: 'the rock cycle', high: 'natural selection' },
    math: { elementary: 'fractions', middle: 'one-step equations', high: 'derivatives' },
    languages: { elementary: 'this week\'s new words', middle: 'this week\'s verb endings', high: 'the past tense' },
    advisory: { elementary: 'being a good friend', middle: 'handling conflict', high: 'managing stress' }
  };

  var TABLE = {
    // The question and four choices; the card draws the choices as bars
    'live-poll': {
      'social-studies': {
        elementary: { question: 'Which community helper would you shadow for a day?', choices: ['Firefighter', 'Nurse', 'Mail carrier', 'Park ranger'] },
        middle: { question: 'Which cause of the Revolution mattered most?', choices: ['Taxes', 'No voice', 'Soldiers', 'The Massacre'] },
        high: { question: 'Was the New Deal a success?', choices: ['Yes', 'Mostly', 'Not really', 'No'] }
      },
      english: {
        elementary: { question: 'How did the ending make you feel?', choices: ['Happy', 'Surprised', 'Sad', 'Confused'] },
        middle: { question: 'Who changed the most by the end of the book?', choices: ['The narrator', 'The friend', 'The villain', 'Nobody'] },
        high: { question: 'Is the narrator reliable?', choices: ['Yes', 'Mostly', 'Not really', 'No'] }
      },
      science: {
        elementary: { question: 'Which one is a living thing?', choices: ['A rock', 'A tree', 'A cloud', 'A fire'] },
        middle: { question: 'Which state of matter is hardest to explain?', choices: ['Solid', 'Liquid', 'Gas', 'Plasma'] },
        high: { question: 'Which is the strongest evidence for evolution?', choices: ['Fossils', 'DNA', 'Anatomy', 'Antibiotics'] }
      },
      math: {
        elementary: { question: 'Which is bigger?', choices: ['One half', 'One third', 'One fourth', 'All equal'] },
        middle: { question: 'Which is hardest for you right now?', choices: ['Fractions', 'Negatives', 'Ratios', 'Equations'] },
        high: { question: 'Which is hardest for you right now?', choices: ['Factoring', 'Logs', 'Trig', 'Proofs'] }
      },
      languages: {
        elementary: { question: 'Which is the most fun to practice?', choices: ['Listening', 'Speaking', 'Reading', 'Writing'] },
        middle: { question: 'Which is hardest for you right now?', choices: ['Listening', 'Speaking', 'Reading', 'Writing'] },
        high: { question: 'Which tense trips you up most?', choices: ['Past', 'Present', 'Future', 'Conditional'] }
      },
      advisory: {
        elementary: { question: 'How is your morning going?', choices: ['Great', 'Okay', 'Meh', 'Rough'] },
        middle: { question: 'How much sleep did you get last night?', choices: ['8 or more', '7 hours', '6 hours', 'Less than 6'] },
        high: { question: 'How stressed are you about this week?', choices: ['Not at all', 'A little', 'Stressed', 'Very'] }
      }
    },

    // The question, Maya's idea, Jordan's idea, and the pair's one answer
    snowball: {
      'social-studies': {
        elementary: { question: 'What makes a good community?', a: 'Helping out.', b: 'Fair rules.', together: 'Helping out, with fair rules.' },
        middle: { question: 'Why did the Revolution happen?', a: 'Taxes.', b: 'No voice.', together: 'Taxes, and no voice in them.' },
        high: { question: 'Was the Cold War inevitable?', a: 'Yes, ideology.', b: 'No, choices.', together: 'Ideology, but choices too.' }
      },
      english: {
        elementary: { question: 'What is this story really about?', a: 'Being brave.', b: 'A friend.', together: 'Being brave for a friend.' },
        middle: { question: 'What is the theme of the novel?', a: 'Loyalty.', b: 'Growing up.', together: 'Loyalty while growing up.' },
        high: { question: 'What is the author arguing?', a: 'Power corrupts.', b: 'People allow it.', together: 'Power corrupts when people allow it.' }
      },
      science: {
        elementary: { question: 'What do plants need to grow?', a: 'Sun.', b: 'Water.', together: 'Sun, water, and soil.' },
        middle: { question: 'What is energy?', a: 'Doing work.', b: 'Stored up.', together: 'The ability to do work, stored or moving.' },
        high: { question: 'Why does natural selection work?', a: 'Variation.', b: 'Some survive.', together: 'Variation, and only some survive.' }
      },
      math: {
        elementary: { question: 'What is a fraction?', a: 'Part of a whole.', b: 'Equal pieces.', together: 'Equal pieces of a whole.' },
        middle: { question: 'What does a variable do?', a: 'Stands in.', b: 'Unknown number.', together: 'Stands in for an unknown number.' },
        high: { question: 'What is a derivative?', a: 'Slope.', b: 'Rate of change.', together: 'A slope, so a rate of change.' }
      },
      languages: {
        elementary: { question: 'Why learn another language?', a: 'New friends.', b: 'Travel.', together: 'New friends, and travel.' },
        middle: { question: 'What makes a good conversation?', a: 'Listening.', b: 'Asking back.', together: 'Listening, then asking back.' },
        high: { question: 'What gets lost in translation?', a: 'Jokes.', b: 'Tone.', together: 'Jokes, and the tone under them.' }
      },
      advisory: {
        elementary: { question: 'What makes a good friend?', a: 'Kind.', b: 'Shares.', together: 'Kind, and shares.' },
        middle: { question: 'What does respect look like here?', a: 'Listening.', b: 'No put-downs.', together: 'Listening, no put-downs.' },
        high: { question: 'What do we need from this class?', a: 'Honesty.', b: 'Less stress.', together: 'Honesty, and less stress.' }
      }
    },

    // Six pairs: the card shows the first two, the make page fills two
    // rounds of three
    'vocab-match': {
      'social-studies': {
        elementary: { pairs: [['continent', 'a huge piece of land'], ['island', 'land with water all around'], ['capital', 'where a government sits'], ['map key', 'what the symbols mean'], ['border', 'where one place ends'], ['citizen', 'a member of a country']] },
        middle: { pairs: [['tariff', 'a tax on imports'], ['boycott', 'refusing to buy'], ['colony', 'land ruled from far away'], ['treaty', 'a deal between nations'], ['monarchy', 'rule by a king or queen'], ['republic', 'leaders picked by voters']] },
        high: { pairs: [['veto', 'a refusal to sign'], ['precedent', 'an earlier ruling'], ['federalism', 'power split by level'], ['filibuster', 'talking a bill to death'], ['gerrymander', 'drawing districts to win'], ['amendment', 'a change to the constitution']] }
      },
      english: {
        elementary: { pairs: [['noun', 'a person, place, or thing'], ['verb', 'an action word'], ['adjective', 'describes a noun'], ['setting', 'where and when'], ['character', 'who the story is about'], ['plot', 'what happens']] },
        middle: { pairs: [['theme', 'the big idea'], ['irony', 'the opposite of expected'], ['foreshadow', 'a hint of what is coming'], ['narrator', 'who tells the story'], ['conflict', 'the struggle'], ['symbol', 'a thing that stands for more']] },
        high: { pairs: [['allusion', 'a nod to another work'], ['motif', 'a repeated image'], ['diction', 'word choice'], ['syntax', 'sentence structure'], ['paradox', 'true but contradictory'], ['juxtapose', 'set side by side']] }
      },
      science: {
        elementary: { pairs: [['habitat', 'where an animal lives'], ['predator', 'hunts other animals'], ['herbivore', 'eats only plants'], ['evaporate', 'liquid turns to gas'], ['orbit', 'a path around a planet'], ['fossil', 'remains kept in rock']] },
        middle: { pairs: [['igneous', 'rock from cooled lava'], ['density', 'mass per volume'], ['mitosis', 'one cell becomes two'], ['nucleus', 'holds a cell\'s DNA'], ['velocity', 'speed with a direction'], ['inertia', 'resisting a change in motion']] },
        high: { pairs: [['enzyme', 'a protein that speeds reactions'], ['allele', 'one version of a gene'], ['isotope', 'same element, extra neutrons'], ['entropy', 'a measure of disorder'], ['catalyst', 'speeds a reaction, unchanged'], ['osmosis', 'water crossing a membrane']] }
      },
      math: {
        elementary: { pairs: [['sum', 'the answer to adding'], ['perimeter', 'the distance around'], ['numerator', 'the top of a fraction'], ['difference', 'the answer to subtracting'], ['area', 'the space inside'], ['even', 'divisible by two']] },
        middle: { pairs: [['ratio', 'compares two amounts'], ['slope', 'rise over run'], ['integer', 'a whole number, plus or minus'], ['exponent', 'how many times to multiply'], ['coefficient', 'the number by a variable'], ['origin', 'where the axes cross']] },
        high: { pairs: [['asymptote', 'a line the curve nears'], ['vertex', 'the turning point'], ['domain', 'every allowed input'], ['factorial', 'multiply down to one'], ['radian', 'an angle by arc length'], ['matrix', 'a grid of numbers']] }
      },
      languages: {
        elementary: { pairs: [['cognate', 'looks like an English word'], ['plural', 'more than one'], ['noun', 'a person, place, or thing'], ['verb', 'an action word'], ['accent', 'a mark that changes a sound'], ['greeting', 'how you say hello']] },
        middle: { pairs: [['conjugate', 'change a verb\'s ending'], ['infinitive', 'the verb\'s base form'], ['gender', 'masculine or feminine'], ['article', 'the word for the'], ['pronoun', 'I, you, he, she'], ['tense', 'when it happens']] },
        high: { pairs: [['subjunctive', 'the mood of doubt'], ['idiom', 'a phrase that is not literal'], ['reflexive', 'done to oneself'], ['imperative', 'a command'], ['preterite', 'a finished past action'], ['false friend', 'looks alike, means different']] }
      },
      advisory: {
        elementary: { pairs: [['empathy', 'feeling with someone'], ['patience', 'waiting calmly'], ['respect', 'treating others well'], ['honesty', 'telling the truth'], ['courage', 'doing it though scared'], ['gratitude', 'being thankful']] },
        middle: { pairs: [['empathy', 'feeling with someone'], ['boundary', 'a limit you set'], ['bystander', 'someone who only watches'], ['resilience', 'bouncing back'], ['consent', 'a clear yes'], ['integrity', 'doing right when unseen']] },
        high: { pairs: [['burnout', 'worn down by stress'], ['advocate', 'speak up for someone'], ['self-talk', 'the voice in your head'], ['cope', 'handle hard things'], ['ally', 'someone on your side'], ['boundary', 'a limit you set']] }
      }
    },

    // The yellow tag, the topic as the prompt says it, four pairs of eyes
    // (the first is picked and painted, the fourth lands on hover), and
    // the line written from the first pair's eyes
    'whose-eyes': {
      'social-studies': {
        elementary: { tag: 'The new park', topic: 'the new park being built downtown', eyes: ['a kid', 'the mayor', 'a bird', 'a builder'], line: '“Finally somewhere to ride my bike.”' },
        middle: { tag: 'The Tea Party', topic: 'the Boston Tea Party', eyes: ['a colonist', 'the king', 'a sailor', 'a merchant'], line: '“That was my tea in the harbor.”' },
        high: { tag: 'The Dust Bowl', topic: 'the Dust Bowl', eyes: ['a farmer', 'a banker', 'a child', 'the land'], line: '“The bank took the farm, not the dust.”' }
      },
      english: {
        elementary: { tag: 'The Three Pigs', topic: 'the story of the Three Little Pigs', eyes: ['the wolf', 'a pig', 'the bricks', 'a neighbor'], line: '“I was just hungry, honestly.”' },
        middle: { tag: 'The ending', topic: 'the ending of our book', eyes: ['the hero', 'the villain', 'the mother', 'the reader'], line: '“Nobody asked what I wanted.”' },
        high: { tag: 'A banned book', topic: 'banning a book from the school library', eyes: ['a student', 'a parent', 'the author', 'a librarian'], line: '“You can’t skip the hard parts of me.”' }
      },
      science: {
        elementary: { tag: 'The pond', topic: 'the pond behind the school drying up', eyes: ['a frog', 'a heron', 'the reeds', 'a kid'], line: '“My whole house is disappearing.”' },
        middle: { tag: 'The dam', topic: 'the new dam on the river', eyes: ['a salmon', 'a farmer', 'the town', 'the river'], line: '“I can’t get home to spawn.”' },
        high: { tag: 'A new vaccine', topic: 'a new vaccine rollout', eyes: ['a nurse', 'a parent', 'the virus', 'a scientist'], line: '“I’ve seen what the ward looks like.”' }
      },
      math: {
        elementary: { tag: 'One pizza', topic: 'sharing one pizza among the whole class', eyes: ['a hungry kid', 'the cook', 'the pizza', 'the teacher'], line: '“Twenty-four slices is a lot to cut.”' },
        middle: { tag: 'Sales tax', topic: 'adding sales tax to everything we buy', eyes: ['a shopper', 'the store', 'the city', 'a kid'], line: '“My birthday money buys less than I thought.”' },
        high: { tag: 'The lottery', topic: 'the state lottery', eyes: ['a player', 'the state', 'a winner', 'the odds'], line: '“One in three hundred million.”' }
      },
      languages: {
        elementary: { tag: 'A new student', topic: 'a new student who does not speak English yet', eyes: ['the student', 'a classmate', 'the teacher', 'a parent'], line: '“I know the answer, just not the words.”' },
        middle: { tag: 'Moving abroad', topic: 'moving to a country where you do not speak the language', eyes: ['the kid', 'a shopkeeper', 'a teacher', 'a neighbor'], line: '“I point at the menu and hope.”' },
        high: { tag: 'Translating', topic: 'translating at the doctor for a parent', eyes: ['the teen', 'the parent', 'the doctor', 'a nurse'], line: '“I’m fifteen and explaining a diagnosis.”' }
      },
      advisory: {
        elementary: { tag: 'Recess', topic: 'the new recess rules', eyes: ['a kid', 'the aide', 'the swings', 'a shy kid'], line: '“Five minutes isn’t enough.”' },
        middle: { tag: 'The group chat', topic: 'a group chat that left one person out', eyes: ['left out', 'who made it', 'a parent', 'a teacher'], line: '“I saw the photos the next morning.”' },
        high: { tag: 'Phones', topic: 'a no-phones rule in every class', eyes: ['a student', 'a teacher', 'a parent', 'the phone'], line: '“What if my mom texts about my sister?”' }
      }
    },

    // The claim the rope pulls on
    'both-sides-rope': {
      'social-studies': {
        elementary: { claim: 'Every kid should have a job at school.' },
        middle: { claim: 'The colonists were right to rebel.' },
        high: { claim: 'The Electoral College should go.' }
      },
      english: {
        elementary: { claim: 'The wolf was just hungry.' },
        middle: { claim: 'The ending was the right ending.' },
        high: { claim: 'Some books should stay off the shelf.' }
      },
      science: {
        elementary: { claim: 'Zoos are good for animals.' },
        middle: { claim: 'Pluto should still be a planet.' },
        high: { claim: 'Editing human genes should be allowed.' }
      },
      math: {
        elementary: { claim: 'Calculators should be allowed on tests.' },
        middle: { claim: 'Mental math matters more than calculators.' },
        high: { claim: 'Everyone should take statistics before calculus.' }
      },
      languages: {
        elementary: { claim: 'Everyone should learn a second language.' },
        middle: { claim: 'Subtitles beat dubbing.' },
        high: { claim: 'Translation apps make language class pointless.' }
      },
      advisory: {
        elementary: { claim: 'Recess should be longer.' },
        middle: { claim: 'Group projects are unfair.' },
        high: { claim: 'School should start at nine.' }
      }
    },

    // What to draw, as the prompt over the wall
    'art-gallery': {
      'social-studies': {
        elementary: { text: 'Draw your favorite place in our town.' },
        middle: { text: 'Draw a symbol for the Revolution.' },
        high: { text: 'Draw the Cold War as one picture.' }
      },
      english: {
        elementary: { text: 'Draw the wolf\'s side of the story.' },
        middle: { text: 'Draw the setting from memory.' },
        high: { text: 'Draw the poem\'s central image.' }
      },
      science: {
        elementary: { text: 'Draw a plant\'s day.' },
        middle: { text: 'Draw the water cycle, no words.' },
        high: { text: 'Draw a cell as a city.' }
      },
      math: {
        elementary: { text: 'Draw one half three ways.' },
        middle: { text: 'Draw what negative numbers look like.' },
        high: { text: 'Draw exponential growth, no axes.' }
      },
      languages: {
        elementary: { text: 'Draw your family, then label it.' },
        middle: { text: 'Draw a word we learned this week.' },
        high: { text: 'Draw an idiom, literally.' }
      },
      advisory: {
        elementary: { text: 'Draw a good day.' },
        middle: { text: 'Draw what stress looks like.' },
        high: { text: 'Draw yourself in five years.' }
      }
    },

    // The tier-one question a pair talks through out loud
    closer: {
      'social-studies': {
        elementary: { question: 'Which animal would you put on our class flag?' },
        middle: { question: 'Which century would you visit for a day?' },
        high: { question: 'Which law would you repeal first?' }
      },
      english: {
        elementary: { question: 'Which book character would you invite to dinner?' },
        middle: { question: 'Which book should be a movie, and why?' },
        high: { question: 'Which line from a book have you never forgotten?' }
      },
      science: {
        elementary: { question: 'Which animal would you be for a day?' },
        middle: { question: 'Which planet would you visit, and why?' },
        high: { question: 'Which invention would you un-invent?' }
      },
      math: {
        elementary: { question: 'Which number is your favorite, and why?' },
        middle: { question: 'Mental math or puzzles: which would you rather be great at?' },
        high: { question: 'Which is more useful, statistics or calculus?' }
      },
      languages: {
        elementary: { question: 'Which word sounds best in another language?' },
        middle: { question: 'Which country would you live in for a year?' },
        high: { question: 'Which word has no good translation?' }
      },
      advisory: {
        elementary: { question: 'Morning person or night owl, and why?' },
        middle: { question: 'Which song is your walk-up music?' },
        high: { question: 'What small thing made this week better?' }
      }
    },

    // Maya's one real thing and the line a classmate wrote back; the
    // subject never matters here, the grade does
    'someones-got-you': {
      any: {
        elementary: { mine: 'Trying to read a whole chapter book.', reply: 'You have already read more than you think.' },
        middle: { mine: 'Trying to get more sleep.', reply: 'One early night this week is a real win.' },
        high: { mine: 'Applying to jobs and hearing nothing back.', reply: 'Every no is practice for the yes.' }
      }
    },

    // The two questions on the ticket
    'exit-ticket': {
      'social-studies': {
        elementary: { fields: ['One thing you learned about community helpers', 'One question you still have'] },
        middle: { fields: ['One cause of the Revolution, in your own words', 'One thing that still confuses you'] },
        high: { fields: ['One way the New Deal changed the government\'s job', 'One question you still have'] }
      },
      english: {
        elementary: { fields: ['One thing the main character learned', 'One word from today you want to remember'] },
        middle: { fields: ['One piece of evidence for the theme', 'One question you still have about the book'] },
        high: { fields: ['One claim you could make about the narrator', 'One question you still have'] }
      },
      science: {
        elementary: { fields: ['One thing a plant needs to grow', 'One question you still have'] },
        middle: { fields: ['One thing you learned about the rock cycle', 'One question you still have'] },
        high: { fields: ['One piece of evidence for natural selection', 'One question you still have'] }
      },
      math: {
        elementary: { fields: ['One way to show one half', 'One problem that was hard today'] },
        middle: { fields: ['One thing a variable does', 'One problem you got stuck on'] },
        high: { fields: ['One thing a derivative tells you', 'One problem you got stuck on'] }
      },
      languages: {
        elementary: { fields: ['One new word from today', 'One word you wish you knew'] },
        middle: { fields: ['One sentence in the new language about today', 'One thing you could not say yet'] },
        high: { fields: ['One sentence using today\'s tense', 'One thing you could not say yet'] }
      },
      advisory: {
        elementary: { fields: ['One thing that went well today', 'One thing you want help with'] },
        middle: { fields: ['One thing that went well this week', 'One thing that was hard'] },
        high: { fields: ['One thing you are proud of this week', 'One thing you need from us'] }
      }
    }
  };

  // The activities whose words live in a setup panel: one hover line,
  // composed from the topic, nothing prefilled on the make page
  var LINES = {
    'one-more-thing': function (topic) { return 'From memory: the 2-3 most important things about ' + topic + '.'; },
    'solo-quiz': function (topic) { return 'Five questions on ' + topic + ', at your own pace.'; },
    'speed-quiz': function (topic) { return 'Quick questions on ' + topic + '. Faster right answers score more.'; },
    'trivia-bluff': function (topic) { return 'A fact about ' + topic + ' with a blank, and the lies your classmates wrote.'; },
    'doodle-bluff': function (topic) { return 'Strange phrases about ' + topic + ' to draw, then fake titles for each drawing.'; },
    'group-work-day': function (topic) { return 'Jobs and a shared to-do list for today\'s work on ' + topic + '.'; }
  };

  // What the make page fills in from an example: the question box, the
  // field labels, the pairs (two rounds of three), the choices
  var PREFILL = {
    'live-poll': function (w) { return { prompt: w.question, choices: w.choices.slice() }; },
    snowball: function (w) { return { prompt: w.question }; },
    'vocab-match': function (w) { return { pairs: [w.pairs.slice(0, 3), w.pairs.slice(3, 6)] }; },
    'whose-eyes': function (w) { return { prompt: 'Name ONE person, creature, or thing affected by ' + w.topic + '. Anyone whose eyes we could look through.' }; },
    'both-sides-rope': function (w) { return { prompt: 'Where do you stand RIGHT NOW?\n\n“' + w.claim + '”\n\n(It\'s okay not to be sure.)' }; },
    'art-gallery': function (w) { return { prompt: w.text }; },
    'exit-ticket': function (w) { return { fields: w.fields.slice() }; },
    'one-more-thing': function (w) { return { prompt: 'From memory (no notes!): list the 2-3 most important things you remember about ' + w.topic + '. Put each on its own line.' }; }
  };

  // The hover line of a content card is the picture's own (yard-pictograms
  // HOVER_LINES); these are the lines for the cards that carry no words
  function lineFor(id, words) {
    if (LINES[id]) return LINES[id](words.topic);
    if (id === 'exit-ticket') return words.fields[0] + '. ' + words.fields[1] + '.';
    if (id === 'snowball' || id === 'closer') return words.question;
    return '';
  }

  var IDS = Object.keys(TABLE).concat(Object.keys(LINES));

  function bandOf(profile) {
    var b = profile && profile.gradeBand;
    if (b === 'adult') return 'high';
    return BANDS.indexOf(b) !== -1 ? b : null;
  }

  // The subjects the profile names that this activity has words for
  function subjectsFor(id, profile) {
    var list = (profile && Array.isArray(profile.subjects)) ? profile.subjects : [];
    var table = TABLE[id];
    return list.filter(function (s) {
      if (SUBJECTS.indexOf(s) === -1) return false;
      return LINES[id] ? !!TOPICS[s] : !!(table && (table[s] || table.any));
    });
  }

  function lookup(id, subject, band) {
    if (LINES[id]) {
      var topic = TOPICS[subject] && TOPICS[subject][band];
      return topic ? { topic: topic } : null;
    }
    var table = TABLE[id];
    if (!table) return null;
    var bySubject = table[subject] || table.any;
    return (bySubject && bySubject[band]) || null;
  }

  function normalize(id, subject, band, words) {
    var w = {};
    Object.keys(words).forEach(function (k) { w[k] = words[k]; });
    var ex = {
      id: id,
      subject: subject,
      band: band,
      key: subject + '.' + band,
      words: w,
      line: lineFor(id, w),
      prefill: PREFILL[id] ? PREFILL[id](w) : null
    };
    return ex;
  }

  // The example for an activity and a saved profile, or null when the
  // profile names no grade band or no subject with words for it. `seat`
  // deals the profile's subjects round robin across the cards (0, 1, 2
  // ...), so a social studies and science teacher sees both.
  function pick(id, profile, seat) {
    var band = bandOf(profile);
    if (!band) return null;
    var subjects = subjectsFor(id, profile);
    // A subject-neutral activity (someones-got-you) needs a band only
    if (subjects.length === 0) {
      if (TABLE[id] && TABLE[id].any && !LINES[id]) subjects = ['any'];
      else return null;
    }
    var subject = subjects[(seat || 0) % subjects.length];
    var words = lookup(id, subject, band);
    return words ? normalize(id, subject, band, words) : null;
  }

  // The example behind a card's key (`science.middle`, from the make
  // page's ?ex=), or null for anything not in the table
  function forKey(id, key) {
    var m = /^([a-z-]+)\.(elementary|middle|high)$/.exec(String(key || ''));
    if (!m) return null;
    var subject = m[1];
    if (subject !== 'any' && SUBJECTS.indexOf(subject) === -1) return null;
    var words = lookup(id, subject, m[2]);
    return words ? normalize(id, subject, m[2], words) : null;
  }

  function keyOf(ex) { return ex ? ex.key : ''; }

  // "science, grades 6-8" for the make page's line
  function describe(ex) {
    if (!ex) return '';
    var subject = SUBJECT_WORDS[ex.subject];
    var band = BAND_WORDS[ex.band] || '';
    return subject ? subject + ', ' + band : band;
  }

  var api = {
    SUBJECTS: SUBJECTS,
    BANDS: BANDS,
    IDS: IDS,
    TABLE: TABLE,
    TOPICS: TOPICS,
    pick: pick,
    forKey: forKey,
    keyOf: keyOf,
    describe: describe
  };
  if (typeof window !== 'undefined') window.ClassExamples = api;
  else globalThis.ClassExamples = api;
})();
