// ASL Sign Language lookup table
// Servo positions: [thumb, index, middle, ringPinky]
// 0 = open/extended, 180 = closed/fist

export type ServoPosition = [number, number, number, number];
export type HandSide = 'right' | 'left' | 'both';

export interface HandPose {
  hand: HandSide;
  right?: ServoPosition;
  left?: ServoPosition;
  holdMs: number;
}

export interface SignSequence {
  name: string;
  poses: HandPose[];
}

// ASL Alphabet - right hand only, standard American Sign Language fingerspelling
// Simplified to 4 servos: thumb, index, middle, ringPinky
export const ASL_ALPHABET: Record<string, HandPose> = {
  a: { hand: 'right', right: [0, 180, 180, 180], holdMs: 500 },
  b: { hand: 'right', right: [180, 0, 0, 0], holdMs: 500 },
  c: { hand: 'right', right: [45, 45, 45, 45], holdMs: 500 },
  d: { hand: 'right', right: [180, 0, 180, 180], holdMs: 500 },
  e: { hand: 'right', right: [90, 90, 90, 90], holdMs: 500 },
  f: { hand: 'right', right: [0, 180, 0, 0], holdMs: 500 },
  g: { hand: 'right', right: [0, 0, 180, 180], holdMs: 500 },
  h: { hand: 'right', right: [0, 0, 0, 180], holdMs: 500 },
  i: { hand: 'right', right: [180, 180, 180, 0], holdMs: 500 },
  j: { hand: 'right', right: [180, 180, 180, 0], holdMs: 700 },
  k: { hand: 'right', right: [0, 0, 180, 180], holdMs: 500 },
  l: { hand: 'right', right: [0, 0, 180, 180], holdMs: 500 },
  m: { hand: 'right', right: [0, 180, 180, 180], holdMs: 500 },
  n: { hand: 'right', right: [0, 180, 180, 180], holdMs: 500 },
  o: { hand: 'right', right: [45, 45, 45, 45], holdMs: 500 },
  p: { hand: 'right', right: [0, 0, 180, 180], holdMs: 500 },
  q: { hand: 'right', right: [0, 0, 180, 180], holdMs: 500 },
  r: { hand: 'right', right: [180, 0, 0, 180], holdMs: 500 },
  s: { hand: 'right', right: [180, 180, 180, 180], holdMs: 500 },
  t: { hand: 'right', right: [0, 180, 180, 180], holdMs: 500 },
  u: { hand: 'right', right: [180, 0, 0, 180], holdMs: 500 },
  v: { hand: 'right', right: [180, 0, 0, 180], holdMs: 500 },
  w: { hand: 'right', right: [180, 0, 0, 0], holdMs: 500 },
  x: { hand: 'right', right: [180, 90, 180, 180], holdMs: 500 },
  y: { hand: 'right', right: [0, 180, 180, 0], holdMs: 500 },
  z: { hand: 'right', right: [180, 0, 180, 180], holdMs: 700 },
};

// Word-level signs - common ASL words
// One-handed signs use hand: 'right', two-handed use hand: 'both'
export const WORD_SIGNS: Record<string, SignSequence> = {
  hello: {
    name: 'hello',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 500 },
    ],
  },
  hi: {
    name: 'hi',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 500 },
    ],
  },
  yes: {
    name: 'yes',
    poses: [
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 300 },
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 300 },
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 300 },
    ],
  },
  no: {
    name: 'no',
    poses: [
      { hand: 'right', right: [0, 0, 180, 180], holdMs: 200 },
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 200 },
      { hand: 'right', right: [0, 0, 180, 180], holdMs: 200 },
    ],
  },
  thanks: {
    name: 'thanks',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
    ],
  },
  'thank you': {
    name: 'thank you',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
    ],
  },
  please: {
    name: 'please',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 500 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 500 },
    ],
  },
  help: {
    name: 'help',
    poses: [
      { hand: 'both', right: [0, 0, 0, 0], left: [180, 180, 180, 180], holdMs: 400 },
      { hand: 'both', right: [0, 0, 0, 0], left: [180, 180, 180, 180], holdMs: 400 },
    ],
  },
  sorry: {
    name: 'sorry',
    poses: [
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 400 },
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 400 },
    ],
  },
  love: {
    name: 'love',
    poses: [
      { hand: 'both', right: [180, 180, 180, 180], left: [180, 180, 180, 180], holdMs: 600 },
    ],
  },
  'i love you': {
    name: 'i love you',
    poses: [
      { hand: 'right', right: [0, 0, 180, 0], holdMs: 800 },
    ],
  },
  good: {
    name: 'good',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
    ],
  },
  bad: {
    name: 'bad',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
    ],
  },
  stop: {
    name: 'stop',
    poses: [
      { hand: 'both', right: [0, 0, 0, 0], left: [0, 0, 0, 0], holdMs: 500 },
    ],
  },
  go: {
    name: 'go',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
    ],
  },
  eat: {
    name: 'eat',
    poses: [
      { hand: 'right', right: [90, 90, 90, 90], holdMs: 300 },
      { hand: 'right', right: [90, 90, 90, 90], holdMs: 300 },
    ],
  },
  drink: {
    name: 'drink',
    poses: [
      { hand: 'right', right: [45, 45, 45, 45], holdMs: 400 },
      { hand: 'right', right: [45, 45, 45, 45], holdMs: 400 },
    ],
  },
  water: {
    name: 'water',
    poses: [
      { hand: 'right', right: [180, 0, 0, 0], holdMs: 400 },
      { hand: 'right', right: [180, 0, 0, 0], holdMs: 400 },
    ],
  },
  friend: {
    name: 'friend',
    poses: [
      { hand: 'both', right: [0, 0, 180, 180], left: [0, 0, 180, 180], holdMs: 400 },
      { hand: 'both', right: [0, 0, 180, 180], left: [0, 0, 180, 180], holdMs: 400 },
    ],
  },
  family: {
    name: 'family',
    poses: [
      { hand: 'both', right: [0, 0, 0, 0], left: [0, 0, 0, 0], holdMs: 500 },
      { hand: 'both', right: [180, 180, 180, 180], left: [180, 180, 180, 180], holdMs: 500 },
    ],
  },
  happy: {
    name: 'happy',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
    ],
  },
  sad: {
    name: 'sad',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
    ],
  },
  name: {
    name: 'name',
    poses: [
      { hand: 'both', right: [0, 0, 180, 180], left: [0, 0, 180, 180], holdMs: 400 },
    ],
  },
  more: {
    name: 'more',
    poses: [
      { hand: 'both', right: [90, 90, 90, 90], left: [90, 90, 90, 90], holdMs: 300 },
      { hand: 'both', right: [90, 90, 90, 90], left: [90, 90, 90, 90], holdMs: 300 },
    ],
  },
  done: {
    name: 'done',
    poses: [
      { hand: 'both', right: [0, 0, 0, 0], left: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'both', right: [0, 0, 0, 0], left: [0, 0, 0, 0], holdMs: 300 },
    ],
  },
  want: {
    name: 'want',
    poses: [
      { hand: 'both', right: [45, 45, 45, 45], left: [45, 45, 45, 45], holdMs: 400 },
      { hand: 'both', right: [90, 90, 90, 90], left: [90, 90, 90, 90], holdMs: 400 },
    ],
  },
  like: {
    name: 'like',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [90, 90, 90, 90], holdMs: 300 },
    ],
  },
  welcome: {
    name: 'welcome',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 400 },
    ],
  },
};

// Gestures - common hand gestures
export const GESTURES: Record<string, SignSequence> = {
  thumbs_up: {
    name: 'thumbs_up',
    poses: [
      { hand: 'right', right: [0, 180, 180, 180], holdMs: 800 },
    ],
  },
  wave: {
    name: 'wave',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
      { hand: 'right', right: [45, 45, 45, 45], holdMs: 200 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 200 },
      { hand: 'right', right: [45, 45, 45, 45], holdMs: 200 },
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 300 },
    ],
  },
  point: {
    name: 'point',
    poses: [
      { hand: 'right', right: [180, 0, 180, 180], holdMs: 800 },
    ],
  },
  open: {
    name: 'open',
    poses: [
      { hand: 'right', right: [0, 0, 0, 0], holdMs: 800 },
    ],
  },
  close: {
    name: 'close',
    poses: [
      { hand: 'right', right: [180, 180, 180, 180], holdMs: 800 },
    ],
  },
  peace: {
    name: 'peace',
    poses: [
      { hand: 'right', right: [180, 0, 0, 180], holdMs: 800 },
    ],
  },
};

/**
 * Look up a word-level ASL sign
 */
export function getWordSign(word: string): SignSequence | null {
  const normalized = word.toLowerCase().trim();
  return WORD_SIGNS[normalized] || null;
}

/**
 * Build a fingerspelling sequence for text (letter by letter, right hand)
 */
export function getFingerspellSequence(text: string): SignSequence {
  const poses: HandPose[] = [];
  const normalized = text.toLowerCase().trim();

  for (const char of normalized) {
    const letterPose = ASL_ALPHABET[char];
    if (letterPose) {
      poses.push({ ...letterPose });
    }
    // Skip non-letter characters (spaces, punctuation)
  }

  return {
    name: `fingerspell:${text}`,
    poses,
  };
}

/**
 * Main lookup: tries word sign first, falls back to fingerspelling
 */
export function lookupSign(
  action: 'sign' | 'fingerspell' | 'gesture',
  word: string
): SignSequence {
  const normalized = word.toLowerCase().trim();

  if (action === 'gesture') {
    const gesture = GESTURES[normalized];
    if (gesture) return gesture;
    // Fall back to fingerspell if gesture not found
    return getFingerspellSequence(word);
  }

  if (action === 'fingerspell') {
    return getFingerspellSequence(word);
  }

  // action === 'sign': try word sign first, then fingerspell
  const wordSign = getWordSign(normalized);
  if (wordSign) return wordSign;

  return getFingerspellSequence(word);
}
