/**
 * anonymous-names — play-name generator for anonymous mode.
 *
 * When a game config sets `anonymous: true`, students never type a name:
 * the join handler hands each one a random "Color Animal" play name from
 * these lists instead. The lists are curated to be classroom-safe, easy to
 * say out loud ("Amber Fox, you're up"), and every combo fits the
 * PlayerRegistry 20-char name cap.
 */

export const ANON_COLORS = [
  'Amber', 'Aqua', 'Coral', 'Crimson', 'Golden', 'Indigo', 'Ivory', 'Jade',
  'Lilac', 'Maroon', 'Navy', 'Olive', 'Onyx', 'Pearl', 'Plum', 'Ruby',
  'Rust', 'Sage', 'Scarlet', 'Silver', 'Teal', 'Violet'
];

export const ANON_ANIMALS = [
  'Badger', 'Bear', 'Bison', 'Crane', 'Dolphin', 'Eagle', 'Falcon', 'Fox',
  'Gecko', 'Heron', 'Ibex', 'Koala', 'Lemur', 'Lynx', 'Marmot', 'Moose',
  'Otter', 'Owl', 'Panda', 'Puffin', 'Raven', 'Seal', 'Tiger', 'Walrus',
  'Wombat', 'Yak'
];

/**
 * Picks a play name not already present in `existingNames`.
 * The combo space (~570 names) dwarfs any class, so random tries almost
 * always land; if the room somehow exhausts it, numbered Player names
 * take over ("Player 2" matches PlayerRegistry.makeUnique's counter style).
 *
 * @param {string[]} [existingNames] names already taken in the room
 * @returns {string}
 */
export function pickAnonymousName(existingNames = []) {
  const taken = new Set(existingNames);

  for (let attempt = 0; attempt < 60; attempt++) {
    const color = ANON_COLORS[Math.floor(Math.random() * ANON_COLORS.length)];
    const animal = ANON_ANIMALS[Math.floor(Math.random() * ANON_ANIMALS.length)];
    const name = `${color} ${animal}`;
    if (!taken.has(name)) return name;
  }

  // Random tries kept colliding: walk the full space in order.
  for (const color of ANON_COLORS) {
    for (const animal of ANON_ANIMALS) {
      const name = `${color} ${animal}`;
      if (!taken.has(name)) return name;
    }
  }

  let counter = 2;
  while (taken.has(`Player ${counter}`)) counter++;
  return `Player ${counter}`;
}
