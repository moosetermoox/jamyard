/**
 * A heavy topic in a student's answer (2026-09-26): the filter stops mean
 * words, and the moderation ladder reads tone, but a plain disclosure
 * ("My parents are getting divorced and I can't sleep") passes both and
 * used to go straight up. This is a cheap word list that marks such an
 * answer "Needs a look" on the teacher's console and review screen, the
 * same chip the ladder's unsure verdict uses. It never blocks, never
 * reaches a student or the projector, and the teacher decides.
 *
 * Kept short and on purpose: family break-up, death and grief, self-harm
 * and suicide, abuse, eating, drink and drugs, being unsafe at home. A
 * miss is the teacher's normal job; a false hit costs one glance.
 */

const HEAVY = [
  // family
  /\bdivorc(e|ed|ing)\b/i, /\bcustody\b/i, /\b(moved|moving|kicked) out\b/i, /\bforeclos/i, /\bevict/i, /\bhomeless\b/i,
  // death and grief
  /\b(died|dying|passed away|funeral|grief|grieving)\b/i, /\bcancer\b/i, /\bhospice\b/i, /\bover ?dose/i,
  // self-harm and suicide
  /\bsuicid/i, /\bkill (myself|me)\b/i, /\bself[- ]?harm/i, /\bcutting myself\b/i, /\bhurt(ing)? myself\b/i, /\bdon'?t want to (be alive|live)\b/i, /\bwant to die\b/i, /\bend it all\b/i,
  // abuse and safety
  /\babus(e|ed|ive|ing)\b/i, /\bhits? me\b/i, /\bbeats? me\b/i, /\bmolest/i, /\b(sexual|physical|emotional)ly? (assault|harass)/i, /\brape/i, /\bnot safe at home\b/i, /\bscared (to go|of going) home\b/i,
  // eating, drink, drugs
  /\banorexi/i, /\bbulimi/i, /\bstarv(e|ing) myself\b/i, /\bpurg(e|ing)\b/i, /\bthrow(ing)? up (on purpose|after)\b/i, /\b(drunk|wasted|high) (every|all the)\b/i, /\balcoholic\b/i, /\brehab\b/i,
  // mental health
  /\bdepress(ed|ion)\b/i, /\banxiety attack/i, /\bpanic attack/i, /\bcan'?t sleep\b/i, /\bnobody (cares|would notice)\b/i, /\bhate myself\b/i
];

/** True when the text names a topic the teacher should read first. */
export function heavyTopic(text) {
  const s = String(text == null ? '' : text);
  if (!s.trim()) return false;
  return HEAVY.some(re => re.test(s));
}
