// Bot Brain — prompt-aware answers for prototype-mode Bot Fill.
//
// Pure rules, no AI: free, instant, works in mock mode. The goal is
// "plausible for the question", not clever — a teacher previewing a snack
// poll should see snack answers, not "Dinosaurs were awesome."
//
// Plain script (loaded with a <script> tag by the player screen); it also
// works as a side-effect ESM import in tests because it attaches to
// globalThis. Keep it dependency-free.

(function () {
  'use strict';

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  var BANKS = {
    food: [
      'Cold pizza, no contest', 'Spicy ramen with extra everything',
      'Tacos, crunchy, never soft', 'My grandma\'s dumplings',
      'Mac and cheese with hot sauce', 'Watermelon on a hot day'
    ],
    feelings: [
      'Pretty good, a little sleepy', 'Excited but nervous',
      'Calm and ready', 'Tired but happy', 'Curious about today',
      'Better than yesterday'
    ],
    animals: [
      'A red panda', 'An octopus, eight arms, zero rules', 'A golden retriever',
      'A snow leopard', 'A capybara, obviously', 'A very confident pigeon'
    ],
    places: [
      'The aquarium', 'Tokyo for the food', 'A cabin by a lake',
      'The moon, just for an hour', 'Iceland to see the northern lights',
      'My grandparents\' kitchen'
    ],
    names: [
      'Captain Waffles', 'Sir Reginald the Third', 'Sparky',
      'Professor Snuggles', 'The Mighty Bartholomew', 'Mochi'
    ],
    numbers: ['Three', 'Seven', 'Forty-two', 'A dozen', 'Exactly five'],
    excuses: [
      'My dog reorganized my backpack alphabetically',
      'A wizard turned my homework into a sandwich',
      'I was busy rescuing a cat from a tree, twice',
      'Time travel mishap. I did it tomorrow',
      'My little brother traded it for a juice box'
    ],
    ideas: [
      'Shoes with tiny umbrellas for rainy days',
      'A backpack that does your homework reminders out loud',
      'Solar-powered lunch box that keeps pizza warm',
      'A library slide between every floor',
      'Plants that glow when they need water'
    ],
    story: [
      'And then the lights flickered and everyone gasped.',
      'Suddenly, a tiny dragon landed on the teacher\'s desk.',
      'Nobody noticed the door slowly creaking open.',
      'That\'s when the principal announced a snow day, in May.',
      'The map led them straight back to the cafeteria.'
    ],
    questions: [
      'What\'s the best meal you\'ve ever had?',
      'If you could swap lives with anyone for a day, who?',
      'What\'s a skill you wish you had?',
      'What place do you want to visit before you\'re 30?',
      'What\'s your most controversial snack opinion?'
    ],
    media: [
      'Spirited Away', 'The first Spider-Verse movie', 'Holes, book AND movie',
      'Anything with a heist in it', 'The one everyone says is overrated (it\'s not)'
    ],
    songs: [
      'Anything by Queen', 'The theme from my favorite game',
      'That one song everyone knows the dance to', 'Lo-fi beats, always'
    ],
    colors: ['Teal', 'Sunset orange', 'Forest green', 'That blue-purple at dusk'],
    powers: [
      'Pausing time for naps', 'Talking to animals',
      'Teleporting but only to places I\'ve been', 'Never needing to charge my phone',
      'Perfect parallel parking, every time'
    ],
    activities: [
      'Played soccer until it got dark', 'Built a fort and read in it',
      'Tried baking bread, half success', 'Watched movies with my cousins',
      'Went on a long bike ride'
    ],
    norms: [
      'Listen first, then speak', 'Help before being asked',
      'Mistakes are part of learning', 'Start on time so we end on time',
      'Phones away during discussions'
    ],
    personal: [
      'I can solve a Rubik\'s cube', 'I\'ve never broken a bone',
      'I once met a famous athlete', 'I can name every country in South America',
      'I\'ve been to four countries'
    ],
    generic: [
      'Pizza is the best food', 'I love recess', 'Homework should be banned',
      'Cats are better than dogs', 'Summer vacation rocks', 'Math is actually fun',
      'I want to be an astronaut', 'Tacos every Tuesday', 'Rain is the best weather',
      'Video games teach strategy', 'Reading is an adventure', 'Chocolate milk forever',
      'Naps should be mandatory', 'The ocean is amazing', 'Robots will do our chores',
      'Snow days are the best', 'Dinosaurs were awesome', 'Ice cream for breakfast'
    ]
  };

  var ONE_WORD = ['Connected', 'Curious', 'Energized', 'Calm', 'Inspired', 'Hungry', 'Ready'];
  var YES_NO = ['Yes, definitely', 'No way', 'Absolutely yes', 'Probably not', 'Yes, no doubt about it'];

  function containsAny(text, words) {
    for (var i = 0; i < words.length; i++) {
      if (text.indexOf(words[i]) !== -1) return true;
    }
    return false;
  }

  // "pizza, sushi, or tacos?" → pick one of the offered options.
  // Conservative: only when we can extract 2+ short, clean fragments.
  function pickEmbeddedOption(text) {
    if (text.indexOf(' or ') === -1) return null;
    // Work on the clause that contains the "or" (after the last colon/dash)
    var clause = text.split(/[:—]/).pop() || text;
    var parts = clause.replace(/[?!.]/g, '').split(/,| or /);
    var options = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.length >= 2 && part.length <= 25 && part.split(' ').length <= 4) {
        options.push(part);
      }
    }
    if (options.length < 2) return null;
    var chosen = pick(options);
    // Capitalize like an answer
    return chosen.charAt(0).toUpperCase() + chosen.slice(1);
  }

  /**
   * Generate a plausible bot answer for a prompt. Ordered rules, first
   * match wins; falls back to the generic playful bank.
   */
  function botAnswerFor(prompt) {
    var p = String(prompt || '').toLowerCase();

    if (p.indexOf('one word') !== -1) return pick(ONE_WORD);

    var option = pickEmbeddedOption(p);
    if (option) return option;

    if (containsAny(p, ['snack', 'food', 'eat', 'lunch', 'dinner', 'breakfast', 'meal', 'dessert', 'pizza'])) return pick(BANKS.food);
    if (containsAny(p, ['feel', 'mood', 'emotion', 'how are you'])) return pick(BANKS.feelings);
    if (containsAny(p, ['excuse', 'didn\'t do', 'forgot my homework'])) return pick(BANKS.excuses);
    if (containsAny(p, ['animal', 'pet', 'creature', 'mascot'])) return pick(BANKS.animals);
    if (containsAny(p, ['question for', 'write a question', 'ask a question', 'get-to-know'])) return pick(BANKS.questions);
    if (containsAny(p, ['where', 'place', 'travel', 'trip', 'vacation', 'visit', 'teleport', 'country', 'city'])) return pick(BANKS.places);
    if (containsAny(p, ['name for', 'name it', 'call it', 'rename', 'a name'])) return pick(BANKS.names);
    if (containsAny(p, ['how many', 'a number', 'count'])) return pick(BANKS.numbers);
    if (containsAny(p, ['idea', 'invent', 'improve', 'design', 'brainstorm', 'better way'])) return pick(BANKS.ideas);
    if (containsAny(p, ['story', 'sentence', 'once upon', 'add to', 'happens next', 'happened next', 'line for'])) return pick(BANKS.story);
    if (containsAny(p, ['song', 'music', 'playlist'])) return pick(BANKS.songs);
    if (containsAny(p, ['movie', 'show', 'book', 'film', 'series'])) return pick(BANKS.media);
    if (containsAny(p, ['color', 'colour'])) return pick(BANKS.colors);
    if (containsAny(p, ['superpower', 'power would', 'super power', 'hero'])) return pick(BANKS.powers);
    if (containsAny(p, ['weekend', 'yesterday', 'last summer', 'after school', 'free time'])) return pick(BANKS.activities);
    if (containsAny(p, ['norm', 'class rule', 'our rules', 'agreement'])) return pick(BANKS.norms);
    if (containsAny(p, ['truth', 'about yourself', 'fact about you', 'nobody knows'])) return pick(BANKS.personal);

    // Yes/no questions ("Should homework be banned?")
    if (/^(should|would|do you|does|is |are |can |could |will |have you|did you)/.test(p.trim())) return pick(YES_NO);

    return pick(BANKS.generic);
  }

  // Browser global + testable side-effect export
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.botAnswerFor = botAnswerFor;
})();
