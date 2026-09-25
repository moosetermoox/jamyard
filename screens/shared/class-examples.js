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
// The panel-owned activities (the quizzes, the bluffs, the to-do list)
// compose their hover line from TOPICS, one noun phrase per subject and
// band, and their example is recipe params (three questions with the
// answers, the same facts as blanks, three phrases, four tasks) that the
// make route compiles over the template's stamp.
//
// Plain script (browser global): window.ClassExamples = { pick, forKey,
// keyOf, editsOf, describe, SUBJECTS, BANDS, TABLE, TOPICS }. No DOM, no fetch.
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

    // What to draw, as the prompt over the wall, and four drawings the
    // class would make of it (names in yard-doodles.js)
    'art-gallery': {
      'social-studies': {
        elementary: { text: 'Draw your favorite place in our town.', doodles: ['house', 'tree', 'swing', 'store'] },
        middle: { text: 'Draw a symbol for the Revolution.', doodles: ['flag', 'snake', 'teacup', 'bell'] },
        high: { text: 'Draw the Cold War as one picture.', doodles: ['wall', 'rocket', 'globe', 'phone'] }
      },
      english: {
        elementary: { text: 'Draw the wolf\'s side of the story.', doodles: ['wolf', 'house', 'pig', 'bowl'] },
        middle: { text: 'Draw the setting from memory.', doodles: ['house', 'tree', 'moon', 'mountain'] },
        high: { text: 'Draw the poem\'s central image.', doodles: ['bird', 'flower', 'candle', 'moon'] }
      },
      science: {
        elementary: { text: 'Draw a plant\'s day.', doodles: ['sun', 'plant', 'cloud', 'moon'] },
        middle: { text: 'Draw the water cycle, no words.', doodles: ['cloud', 'wave', 'mountain', 'sun'] },
        high: { text: 'Draw a cell as a city.', doodles: ['cell', 'factory', 'house', 'bridge'] }
      },
      math: {
        elementary: { text: 'Draw one half three ways.', doodles: ['halfcircle', 'halfrect', 'dots', 'glass'] },
        middle: { text: 'Draw what negative numbers look like.', doodles: ['thermometer', 'numberline', 'coin', 'iceberg'] },
        high: { text: 'Draw exponential growth, no axes.', doodles: ['rabbit', 'coins', 'curve', 'city'] }
      },
      languages: {
        elementary: { text: 'Draw your family, then label it.', doodles: ['people', 'house', 'dog', 'cat'] },
        middle: { text: 'Draw a word we learned this week.', doodles: ['apple', 'book', 'bike', 'umbrella'] },
        high: { text: 'Draw an idiom, literally.', doodles: ['cake', 'jar', 'foot', 'cat'] }
      },
      advisory: {
        elementary: { text: 'Draw a good day.', doodles: ['sun', 'icecream', 'ball', 'smile'] },
        middle: { text: 'Draw what stress looks like.', doodles: ['storm', 'clock', 'scribble', 'books'] },
        high: { text: 'Draw yourself in five years.', doodles: ['cap', 'car', 'city', 'plane'] }
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

    // A strange phrase about the topic and the drawing of it (a name in
    // yard-doodles.js); the phrase is the hover line, the drawing sits on
    // the paper. The words themselves live in the setup panel, so the
    // make page prefills nothing.
    'doodle-bluff': {
      'social-studies': {
        elementary: { phrase: 'a mail carrier chased by a giant letter', phrases: ['a mail carrier chased by a giant letter', 'a firefighter afraid of a candle', 'a mayor who is a duck'], doodle: 'envelope' },
        middle: { phrase: 'the Liberty Bell ringing itself awake', phrases: ['the Liberty Bell ringing itself awake', 'a teacup swimming across Boston Harbor', 'a soldier knocking on a door made of cake'], doodle: 'bell' },
        high: { phrase: 'a wall that wants to be a bridge', phrases: ['a wall that wants to be a bridge', 'a rocket that only flies in circles', 'two globes arguing over a phone'], doodle: 'wall' }
      },
      english: {
        elementary: { phrase: 'a wolf knitting a sweater', phrases: ['a wolf knitting a sweater', 'a pig building a house out of pancakes', 'a bowl that runs away from the spoon'], doodle: 'wolf' },
        middle: { phrase: 'the narrator hiding inside a book', phrases: ['the narrator hiding inside a book', 'a house that remembers every story', 'the moon reading a novel'], doodle: 'book' },
        high: { phrase: 'a metaphor stuck in traffic', phrases: ['a metaphor stuck in traffic', 'a candle writing a poem', 'a bird that speaks in similes'], doodle: 'car' }
      },
      science: {
        elementary: { phrase: 'a plant that only grows at night', phrases: ['a plant that only grows at night', 'a cloud carrying an umbrella', 'the sun taking a nap'], doodle: 'plant' },
        middle: { phrase: 'a volcano that forgot how to erupt', phrases: ['a volcano that forgot how to erupt', 'a wave afraid of the beach', 'a mountain wearing a raincoat'], doodle: 'volcano' },
        high: { phrase: 'a cell running a bakery', phrases: ['a cell running a bakery', 'a factory built inside a nucleus', 'a bridge made of DNA'], doodle: 'cell' }
      },
      math: {
        elementary: { phrase: 'a pizza cut into a hundred slices', phrases: ['a pizza cut into a hundred slices', 'half a glass looking for its other half', 'a clock with sixty hands'], doodle: 'pizza' },
        middle: { phrase: 'a thermometer with stage fright', phrases: ['a thermometer with stage fright', 'a number line tied in a knot', 'a coin worth negative one dollar'], doodle: 'thermometer' },
        high: { phrase: 'a parabola on a trampoline', phrases: ['a parabola on a trampoline', 'a rabbit doubling every second', 'a stack of coins taller than the school'], doodle: 'curve' }
      },
      languages: {
        elementary: { phrase: 'a talking apple that only says hello', phrases: ['a talking apple that only says hello', 'a dog learning to say please', 'a house where every room speaks a language'], doodle: 'apple' },
        middle: { phrase: 'an umbrella learning to swim', phrases: ['an umbrella learning to swim', 'a bike that only turns left', 'a book that translates itself'], doodle: 'umbrella' },
        high: { phrase: 'a dictionary on vacation', phrases: ['a dictionary on vacation', 'a cake that spills the beans', 'cats and dogs actually raining'], doodle: 'book' }
      },
      advisory: {
        elementary: { phrase: 'an ice cream cone in a snowstorm', phrases: ['an ice cream cone in a snowstorm', 'a ball that refuses to bounce', 'a smiling sun on a rainy day'], doodle: 'icecream' },
        middle: { phrase: 'a clock that takes naps', phrases: ['a clock that takes naps', 'a storm cloud with a to-do list', 'a stack of books sneaking out of school'], doodle: 'clock' },
        high: { phrase: 'a graduation cap flying south', phrases: ['a graduation cap flying south', 'a car driving to the future', 'a city built out of alarm clocks'], doodle: 'cap' }
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
    },

    // Three how-many challenges per grade band, subject-neutral: the
    // numbers are the recipe's params, so the make page compiles them
    // over the stamp. Every answer was checked (round numbers are the
    // accepted estimates the recipe's own defaults use).
    'estimation-station': {
      any: {
        elementary: { questions: [
          { prompt: 'How many seconds are in one hour?', answer: 3600, unit: 'seconds' },
          { prompt: 'How many keys are on a full-size piano?', answer: 88, unit: 'keys' },
          { prompt: 'How many jelly beans would fill a 1-gallon jar?', answer: 930, unit: 'jelly beans' }
        ] },
        middle: { questions: [
          { prompt: 'How many times does your heart beat in one day?', answer: 100000, unit: 'beats' },
          { prompt: 'How many feet are in a mile?', answer: 5280, unit: 'feet' },
          { prompt: 'How many grains of rice are in one cup?', answer: 7000, unit: 'grains' }
        ] },
        high: { questions: [
          { prompt: 'How many seconds are in one day?', answer: 86400, unit: 'seconds' },
          { prompt: 'How many bones are in an adult human body?', answer: 206, unit: 'bones' },
          { prompt: 'How many breaths does a person take in one day?', answer: 20000, unit: 'breaths' }
        ] }
      }
    }
  };

  // Three quiz questions per subject and band, each with the four choices
  // and the answer, plus the same fact as a blank for Trivia Bluff. Solo
  // Quiz and Speed Quiz share them. Every answer was checked.
  var QUIZ = {
    'social-studies': {
      elementary: [
        { q: 'Which community helper puts out fires?', c: ['A firefighter', 'A nurse', 'A mail carrier', 'A librarian'], a: 'A firefighter', blank: 'The community helper who puts out fires is a ___.', truth: 'firefighter' },
        { q: 'What do we call a drawing that shows where places are?', c: ['A map', 'A globe', 'A calendar', 'A recipe'], a: 'A map', blank: 'A drawing that shows where places are is called a ___.', truth: 'map' },
        { q: 'Who is chosen to lead a city?', c: ['The mayor', 'The principal', 'The coach', 'The chef'], a: 'The mayor', blank: 'The leader chosen to run a city is the ___.', truth: 'mayor' }
      ],
      middle: [
        { q: 'In which year was the Declaration of Independence signed?', c: ['1776', '1492', '1812', '1865'], a: '1776', blank: 'The Declaration of Independence was signed in ___.', truth: '1776' },
        { q: 'What was the Stamp Act?', c: ['A tax on printed paper', 'A ban on tea', 'A law about soldiers', 'A peace treaty'], a: 'A tax on printed paper', blank: 'The Stamp Act was a tax on ___.', truth: 'printed paper' },
        { q: 'Which city held the Tea Party of 1773?', c: ['Boston', 'New York', 'Philadelphia', 'Charleston'], a: 'Boston', blank: 'The Tea Party of 1773 happened in ___.', truth: 'Boston' }
      ],
      high: [
        { q: 'Which president started the New Deal?', c: ['Franklin Roosevelt', 'Herbert Hoover', 'Woodrow Wilson', 'Harry Truman'], a: 'Franklin Roosevelt', blank: 'The New Deal was started by President ___.', truth: 'Franklin Roosevelt' },
        { q: 'Which New Deal program still pays retired workers today?', c: ['Social Security', 'The CCC', 'The WPA', 'The TVA'], a: 'Social Security', blank: 'The New Deal program that still pays retired workers is ___.', truth: 'Social Security' },
        { q: 'What did the Civilian Conservation Corps do?', c: ['Put young men to work on public lands', 'Insured bank deposits', 'Built dams in Tennessee', 'Paid farmers to grow less'], a: 'Put young men to work on public lands', blank: 'The Civilian Conservation Corps put young men to work on public ___.', truth: 'lands' }
      ]
    },
    english: {
      elementary: [
        { q: 'Which word is a noun?', c: ['Dog', 'Run', 'Quickly', 'Blue'], a: 'Dog', blank: 'In the sentence "The dog ran," the noun is ___.', truth: 'dog' },
        { q: 'What is the setting of a story?', c: ['Where and when it happens', 'Who is in it', 'How it ends', 'The lesson it teaches'], a: 'Where and when it happens', blank: 'The setting of a story is where and ___ it happens.', truth: 'when' },
        { q: 'Which word means the same as big?', c: ['Large', 'Tiny', 'Fast', 'Loud'], a: 'Large', blank: 'A word that means the same as big is ___.', truth: 'large' }
      ],
      middle: [
        { q: 'What is a simile?', c: ['A comparison using like or as', 'A word that sounds like its noise', 'An exaggeration', 'A story\'s lesson'], a: 'A comparison using like or as', blank: 'A comparison that uses like or as is called a ___.', truth: 'simile' },
        { q: 'What does the narrator do?', c: ['Tells the story', 'Draws the cover', 'Edits the book', 'Argues with the author'], a: 'Tells the story', blank: 'The person who tells the story is the ___.', truth: 'narrator' },
        { q: 'What is the theme of a story?', c: ['Its big idea', 'Its title', 'Its first sentence', 'Its main character'], a: 'Its big idea', blank: 'A story\'s big idea is called its ___.', truth: 'theme' }
      ],
      high: [
        { q: 'What is an allusion?', c: ['A reference to another work', 'A lie the narrator tells', 'A repeated sound', 'A dramatic pause'], a: 'A reference to another work', blank: 'A reference to another work of art or writing is an ___.', truth: 'allusion' },
        { q: 'Which of these is a paradox?', c: ['Less is more', 'The wind whispered', 'Busy as a bee', 'Boom!'], a: 'Less is more', blank: 'A statement that contradicts itself but holds a truth is a ___.', truth: 'paradox' },
        { q: 'What does diction mean?', c: ['Word choice', 'Sentence length', 'Rhyme scheme', 'Point of view'], a: 'Word choice', blank: 'In writing, a writer\'s word choice is called ___.', truth: 'diction' }
      ]
    },
    science: {
      elementary: [
        { q: 'What do plants need from the sun to make food?', c: ['Light', 'Darkness', 'Sugar', 'Snow'], a: 'Light', blank: 'Plants need ___ from the sun to make their food.', truth: 'light' },
        { q: 'Which is a living thing?', c: ['A tree', 'A rock', 'A cloud', 'A spoon'], a: 'A tree', blank: 'Of a tree, a rock, and a cloud, the living thing is the ___.', truth: 'tree' },
        { q: 'What is frozen water called?', c: ['Ice', 'Steam', 'Fog', 'Mist'], a: 'Ice', blank: 'Frozen water is called ___.', truth: 'ice' }
      ],
      middle: [
        { q: 'Which rock forms from cooled lava?', c: ['Igneous', 'Sedimentary', 'Metamorphic', 'Fossil'], a: 'Igneous', blank: 'Rock that forms from cooled lava is called ___.', truth: 'igneous' },
        { q: 'What is the smallest unit of a living thing?', c: ['A cell', 'An atom', 'A molecule', 'An organ'], a: 'A cell', blank: 'The smallest unit of a living thing is a ___.', truth: 'cell' },
        { q: 'What does a thermometer measure?', c: ['Temperature', 'Weight', 'Speed', 'Volume'], a: 'Temperature', blank: 'A thermometer measures ___.', truth: 'temperature' }
      ],
      high: [
        { q: 'What did Darwin call survival of the best-suited?', c: ['Natural selection', 'Genetic drift', 'Mutation', 'Migration'], a: 'Natural selection', blank: 'Darwin\'s idea that the best-suited survive is called natural ___.', truth: 'selection' },
        { q: 'Which molecule carries genetic instructions?', c: ['DNA', 'ATP', 'Glucose', 'Hemoglobin'], a: 'DNA', blank: 'The molecule that carries genetic instructions is ___.', truth: 'DNA' },
        { q: 'What is a mutation?', c: ['A change in DNA', 'A type of cell', 'A kind of fossil', 'A food chain'], a: 'A change in DNA', blank: 'A change in an organism\'s DNA is called a ___.', truth: 'mutation' }
      ]
    },
    math: {
      elementary: [
        { q: 'What is one half of 10?', c: ['5', '2', '20', '8'], a: '5', blank: 'One half of 10 is ___.', truth: '5' },
        { q: 'Which fraction is the same as one half?', c: ['2/4', '1/3', '3/4', '1/5'], a: '2/4', blank: 'The fraction 2/4 is the same as one ___.', truth: 'half' },
        { q: 'How many minutes are in one hour?', c: ['60', '30', '100', '24'], a: '60', blank: 'One hour has ___ minutes.', truth: '60' }
      ],
      middle: [
        { q: 'Solve: x + 7 = 12.', c: ['x = 5', 'x = 19', 'x = 7', 'x = 84'], a: 'x = 5', blank: 'If x + 7 = 12, then x is ___.', truth: '5' },
        { q: 'What is 25% of 80?', c: ['20', '25', '40', '60'], a: '20', blank: '25% of 80 is ___.', truth: '20' },
        { q: 'What is the ratio 6 to 9 in simplest form?', c: ['2 to 3', '3 to 2', '1 to 3', '6 to 9'], a: '2 to 3', blank: 'The ratio 6 to 9 in simplest form is 2 to ___.', truth: '3' }
      ],
      high: [
        { q: 'What is the derivative of x squared?', c: ['2x', 'x', '2', 'x cubed'], a: '2x', blank: 'The derivative of x squared is ___.', truth: '2x' },
        { q: 'What does a derivative measure?', c: ['Rate of change', 'Total area', 'Average value', 'Highest point'], a: 'Rate of change', blank: 'A derivative measures a function\'s rate of ___.', truth: 'change' },
        { q: 'What is the slope of y = 3x + 1?', c: ['3', '1', '4', '0'], a: '3', blank: 'The slope of y = 3x + 1 is ___.', truth: '3' }
      ]
    },
    languages: {
      elementary: [
        { q: 'What is a cognate?', c: ['A word that looks like an English word', 'A silent letter', 'A greeting', 'A number'], a: 'A word that looks like an English word', blank: 'A word that looks like its English cousin is a ___.', truth: 'cognate' },
        { q: 'What does plural mean?', c: ['More than one', 'Very small', 'Past tense', 'A question'], a: 'More than one', blank: 'A plural noun means more than ___.', truth: 'one' },
        { q: 'Which word is a greeting?', c: ['Hello', 'Table', 'Seven', 'Yellow'], a: 'Hello', blank: 'The word we use to greet someone is ___.', truth: 'hello' }
      ],
      middle: [
        { q: 'What does it mean to conjugate a verb?', c: ['Change its ending for the subject', 'Translate it', 'Spell it backwards', 'Rhyme it'], a: 'Change its ending for the subject', blank: 'Changing a verb\'s ending to match its subject is called ___.', truth: 'conjugating' },
        { q: 'What is an infinitive?', c: ['The verb\'s base form', 'A past tense', 'A pronoun', 'An accent mark'], a: 'The verb\'s base form', blank: 'A verb\'s base form is called the ___.', truth: 'infinitive' },
        { q: 'Which word is a pronoun?', c: ['She', 'Run', 'Blue', 'Under'], a: 'She', blank: 'In the sentence "She reads," the pronoun is ___.', truth: 'she' }
      ],
      high: [
        { q: 'When is the subjunctive used?', c: ['For doubt or wishes', 'For commands', 'For finished actions', 'For counting'], a: 'For doubt or wishes', blank: 'The verb mood used for doubt and wishes is the ___.', truth: 'subjunctive' },
        { q: 'What is a false friend?', c: ['A word that looks alike but means something else', 'A silent letter', 'A rude word', 'A borrowed word'], a: 'A word that looks alike but means something else', blank: 'A word that looks like an English word but means something else is a false ___.', truth: 'friend' },
        { q: 'What is an idiom?', c: ['A phrase that is not meant literally', 'A verb tense', 'A spelling rule', 'A type of accent'], a: 'A phrase that is not meant literally', blank: 'A phrase that is not meant literally is an ___.', truth: 'idiom' }
      ]
    },
    advisory: {
      elementary: [
        { q: 'What is empathy?', c: ['Feeling what someone else feels', 'Winning a game', 'Being the loudest', 'Finishing first'], a: 'Feeling what someone else feels', blank: 'Feeling what someone else feels is called ___.', truth: 'empathy' },
        { q: 'What should you do if a friend is sad?', c: ['Ask if they are okay', 'Laugh', 'Walk away', 'Tell everyone'], a: 'Ask if they are okay', blank: 'When a friend is sad, a kind first step is to ask if they are ___.', truth: 'okay' },
        { q: 'Which is a way to calm down?', c: ['Take slow breaths', 'Yell', 'Run in circles', 'Hold your breath'], a: 'Take slow breaths', blank: 'One way to calm down is to take slow ___.', truth: 'breaths' }
      ],
      middle: [
        { q: 'What is a bystander?', c: ['Someone who watches and does nothing', 'The person being bullied', 'A teacher', 'A best friend'], a: 'Someone who watches and does nothing', blank: 'Someone who sees bullying and does nothing is a ___.', truth: 'bystander' },
        { q: 'What is a boundary?', c: ['A limit you set for how others treat you', 'A fence around school', 'A rule about homework', 'A kind of apology'], a: 'A limit you set for how others treat you', blank: 'A limit you set for how others treat you is a ___.', truth: 'boundary' },
        { q: 'What does resilience mean?', c: ['Bouncing back after a setback', 'Never making mistakes', 'Being the strongest', 'Avoiding hard things'], a: 'Bouncing back after a setback', blank: 'Bouncing back after a setback is called ___.', truth: 'resilience' }
      ],
      high: [
        { q: 'What is burnout?', c: ['Exhaustion from long stress', 'A sunburn', 'A sudden burst of energy', 'A kind of sleep'], a: 'Exhaustion from long stress', blank: 'Exhaustion that comes from long stress is called ___.', truth: 'burnout' },
        { q: 'How much sleep do most teens need?', c: ['8 to 10 hours', '4 to 5 hours', '6 hours', '12 hours'], a: '8 to 10 hours', blank: 'Most teens need ___ to 10 hours of sleep a night.', truth: '8' },
        { q: 'What is a growth mindset?', c: ['Believing skills can grow with effort', 'Believing talent is fixed', 'Growing taller', 'Getting good grades'], a: 'Believing skills can grow with effort', blank: 'Believing skills can grow with effort is a growth ___.', truth: 'mindset' }
      ]
    }
  };

  // Group Work Day: four tasks on the topic, a job tag where one job owns it
  var TASKS = {
    'social-studies': {
      elementary: ['Pick one community helper to learn about', 'Recorder: Write three things that helper does', 'Draw the helper\'s tools', 'Facilitator: Get ready to tell the class one surprising thing'],
      middle: ['Pick one cause of the Revolution', 'Recorder: List two pieces of evidence for it', 'Find one reason a loyalist would disagree', 'Timekeeper: Rehearse a one-minute case for the class'],
      high: ['Pick one New Deal program', 'Recorder: Note who it helped and who opposed it', 'Decide as a group: a success or not?', 'Facilitator: Make sure everyone has argued one side']
    },
    english: {
      elementary: ['Reread the story\'s ending together', 'Recorder: Write what the main character learned', 'Draw your favorite scene', 'Facilitator: Pick one line to read to the class'],
      middle: ['Find the moment the theme shows up', 'Recorder: Copy the quote and the page number', 'Explain it in your own words', 'Timekeeper: Practice presenting it in under a minute'],
      high: ['State the author\'s argument in one sentence', 'Recorder: Gather two pieces of evidence', 'Write one counterargument', 'Facilitator: Check that every voice got in']
    },
    science: {
      elementary: ['Look at the plant and write what it needs', 'Recorder: Draw and label its parts', 'Predict what happens without sunlight', 'Facilitator: Get ready to share one prediction'],
      middle: ['Sort the rock samples into three types', 'Recorder: Note the clues you used', 'Draw the rock cycle from memory', 'Timekeeper: Check the diagram against the book'],
      high: ['Pick one piece of evidence for natural selection', 'Recorder: Summarize it in three sentences', 'Write one question a skeptic would ask', 'Facilitator: Agree on the group\'s strongest point']
    },
    math: {
      elementary: ['Show one half three different ways', 'Recorder: Draw each way on the poster', 'Find a half somewhere in the classroom', 'Facilitator: Pick one to show the class'],
      middle: ['Solve the four equations together', 'Recorder: Write every step for one of them', 'Check each answer by substituting it back', 'Timekeeper: Keep the group to ten minutes'],
      high: ['Sketch the function and its derivative', 'Recorder: Mark where the slope is zero', 'Explain what the derivative says about the graph', 'Facilitator: Make sure everyone can explain it']
    },
    languages: {
      elementary: ['Practice this week\'s words out loud', 'Recorder: Write a sentence with each word', 'Draw one word for the class to guess', 'Facilitator: Give everyone a turn to speak'],
      middle: ['Conjugate this week\'s verbs together', 'Recorder: Write the endings on the chart', 'Write a short dialogue using three of them', 'Timekeeper: Rehearse the dialogue in under two minutes'],
      high: ['Retell yesterday in the past tense', 'Recorder: Write the story in five sentences', 'Find and fix each other\'s endings', 'Facilitator: Pick one sentence to read aloud']
    },
    advisory: {
      elementary: ['Talk about what a good friend does', 'Recorder: Write your group\'s top three', 'Act out one of them', 'Facilitator: Make sure everyone shared one idea'],
      middle: ['Read the conflict scenario together', 'Recorder: List what each person might feel', 'Agree on one way to handle it', 'Timekeeper: Prepare a thirty-second role play'],
      high: ['Share one thing that stresses you this week', 'Recorder: Write down what helps each person', 'Pick one strategy to try together', 'Facilitator: Check that everyone got a say']
    }
  };

  // The quiz table read three ways: Solo Quiz and Speed Quiz take the
  // questions, Trivia Bluff the blanks and their truths
  function fromQuiz(shape) {
    var out = {};
    SUBJECTS.forEach(function (s) {
      out[s] = {};
      BANDS.forEach(function (b) { out[s][b] = shape(QUIZ[s][b]); });
    });
    return out;
  }
  function questionsOf(items) {
    return { questions: items.map(function (i) { return { question: i.q, choices: i.c.slice(), correct: i.a }; }) };
  }
  TABLE['solo-quiz'] = fromQuiz(questionsOf);
  TABLE['speed-quiz'] = fromQuiz(questionsOf);
  TABLE['trivia-bluff'] = fromQuiz(function (items) {
    return { facts: items.map(function (i) { return { question: i.blank, truth: i.truth }; }) };
  });
  TABLE['group-work-day'] = {};
  SUBJECTS.forEach(function (s) {
    TABLE['group-work-day'][s] = {};
    BANDS.forEach(function (b) { TABLE['group-work-day'][s][b] = { tasks: TASKS[s][b].slice() }; });
  });

  // The activities whose words live in a setup panel: one hover line,
  // composed from the topic. Their make page prefill is recipe params
  // (PREFILL below), never a step's prompt.
  var LINES = {
    'one-more-thing': function (topic) { return 'From memory: the 2-3 most important things about ' + topic + '.'; },
    'solo-quiz': function (topic) { return 'Five questions on ' + topic + ', at your own pace.'; },
    'speed-quiz': function (topic) { return 'Quick questions on ' + topic + '. Faster right answers score more.'; },
    'trivia-bluff': function (topic) { return 'A fact about ' + topic + ' with a blank, and the lies your classmates wrote.'; },
    'group-work-day': function (topic) { return 'Jobs and a shared to-do list for today\'s work on ' + topic + '.'; },
    'exquisite-corpse': function (topic) { return 'Six blind folds, one word each, with ' + topic + ' as the theme.'; },
    'class-critique': function (topic) { return 'A presentation on ' + topic + ', rated by the class on three scales.'; }
  };

  // What the make page fills in from an example: the question box, the
  // field labels, the pairs (two rounds of three), the choices
  var PREFILL = {
    'live-poll': function (w) { return { prompt: w.question, choices: w.choices.slice() }; },
    snowball: function (w) { return { prompt: w.question }; },
    'vocab-match': function (w) { return { pairs: [w.pairs.slice(0, 3), w.pairs.slice(3, 6)] }; },
    // The topic sits in more than the first step (the intro, the second
    // vote, the AI's instruction): `swaps` replace it everywhere in the copy
    'whose-eyes': function (w) {
      return {
        prompt: 'Name ONE person, creature, or thing affected by ' + w.topic + '. Anyone whose eyes we could look through.',
        swaps: [{ from: 'our school\'s homework policy', to: w.topic }]
      };
    },
    'both-sides-rope': function (w) {
      return {
        prompt: 'Where do you stand RIGHT NOW?\n\n“' + w.claim + '”\n\n(It\'s okay not to be sure.)',
        swaps: [
          { from: 'Homework should be optional.', to: w.claim },
          { from: '(What if homework took 10 minutes? What if grades didn\'t exist?)', to: '' }
        ]
      };
    },
    // Closer's first question is its first message: swapped, the copy
    // opens on the example and the make page's tier list shows it
    closer: function (w) { return { swaps: [{ from: 'Window seat or aisle seat, and why?', to: w.question }] }; },
    'art-gallery': function (w) { return { prompt: w.text }; },
    'exit-ticket': function (w) { return { fields: w.fields.slice() }; },
    'one-more-thing': function (w) { return { prompt: 'From memory (no notes!): list the 2-3 most important things you remember about ' + w.topic + '. Put each on its own line.' }; },
    // Recipe-born, panel-owned: the example is recipe params, compiled
    // over the template's stamp (the make route and the setup panel)
    'solo-quiz': function (w) { return { params: { questions: w.questions } }; },
    'speed-quiz': function (w) { return { params: { questions: w.questions } }; },
    'trivia-bluff': function (w) { return { params: { questionSource: 'prepared', questions: w.facts, rounds: 3 } }; },
    'doodle-bluff': function (w) { return { params: { phraseSource: 'teacher', phrases: w.phrases.slice() } }; },
    'group-work-day': function (w) { return { params: { tasks: w.tasks.slice() } }; },
    // The theme is a recipe param quoted in every fold's prompt
    'exquisite-corpse': function (w) { return { params: { theme: w.topic } }; },
    'estimation-station': function (w) { return { params: { questions: w.questions.map(function (q) { return { prompt: q.prompt, answer: q.answer, unit: q.unit }; }) } }; }
  };

  // The hover line of a content card is the picture's own (yard-pictograms
  // HOVER_LINES); these are the lines for the cards that carry no words
  function lineFor(id, words) {
    if (LINES[id]) return LINES[id](words.topic);
    if (id === 'exit-ticket') return words.fields[0] + '. ' + words.fields[1] + '.';
    if (id === 'doodle-bluff') return '\u201c' + words.phrase + '\u201d';
    if (id === 'snowball' || id === 'closer') return words.question;
    if (id === 'estimation-station') return words.questions[0].prompt;
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

  // The words for one activity, subject, and band: the table's entry, with
  // the topic on it when the activity's line reads one; null when neither
  function lookup(id, subject, band) {
    var table = TABLE[id];
    var bySubject = table && (table[subject] || table.any);
    var entry = (bySubject && bySubject[band]) || null;
    var topic = TOPICS[subject] && TOPICS[subject][band];
    if (!entry && !(LINES[id] && topic)) return null;
    var w = {};
    if (entry) Object.keys(entry).forEach(function (k) { w[k] = entry[k]; });
    if (LINES[id] && topic) w.topic = topic;
    return w;
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

  // The example as the make route's edits (POST /api/games/:id/make), the
  // shape the make page sends: fields by position and pairs by match step
  // in order, since a card knows no keys. null when there is nothing to
  // prefill. The popup's map reads the example through this.
  function editsOf(ex) {
    var pf = ex && ex.prefill;
    if (!pf) return null;
    var out = {};
    if (pf.prompt) out.prompt = pf.prompt;
    if (pf.fields) out.fields = pf.fields.slice();
    if (pf.pairs) out.pairs = pf.pairs.map(function (round) { return round.map(function (p) { return { left: p[0], right: p[1] }; }); });
    if (pf.choices) out.choices = pf.choices.slice();
    if (pf.params) out.params = JSON.parse(JSON.stringify(pf.params));
    if (pf.swaps) out.swaps = pf.swaps.map(function (s) { return { from: s.from, to: s.to }; });
    return out;
  }

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
    editsOf: editsOf,
    describe: describe
  };
  if (typeof window !== 'undefined') window.ClassExamples = api;
  else globalThis.ClassExamples = api;
})();
