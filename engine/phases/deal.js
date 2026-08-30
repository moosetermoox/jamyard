/**
 * Shuffled deal: hand every player a random classmate's item.
 *
 * Fisher-Yates the ids into a random order, then close them into one
 * circle: each player's sender is the next person around the ring. A
 * single cycle guarantees no player is dealt their own item (N >= 2)
 * and that every item is dealt exactly once, while keeping who-got-whose
 * unpredictable (unlike rotateOffset, which always maps to a fixed
 * join-order neighbor).
 *
 * Returns { receiverId: senderId }. A lone player gets themselves,
 * matching plain rotation's single-player behavior.
 */
export function shuffleDeal(ids, rand = Math.random) {
  const n = ids.length;
  if (n === 0) return {};
  if (n === 1) return { [ids[0]]: ids[0] };

  const ring = ids.slice();
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }

  const senderOf = {};
  for (let i = 0; i < n; i++) {
    senderOf[ring[i]] = ring[(i + 1) % n];
  }
  return senderOf;
}
