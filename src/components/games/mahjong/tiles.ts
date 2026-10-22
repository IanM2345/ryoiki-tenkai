// Mahjong tiles shared by Mahjong Solitaire and classic Mahjong.
//
// A tile *kind* is a number:
//   0-8   characters (1-9)      9-17  dots (1-9)        18-26  bamboo (1-9)
//   27-30 winds East, South, West, North
//   31-33 dragons Red, Green, White
//   34-37 flowers (plum, orchid, chrysanthemum, bamboo)   38-41 seasons (spring, summer, autumn, winter)
// Classic Mahjong uses kinds 0-33 (four of each, 136 tiles). Solitaire adds the eight bonus tiles (144).

export type Kind = number;
export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower' | 'season';

export const KINDS = 34;
export const isSuited = (k: Kind) => k < 27;
export const isHonor = (k: Kind) => k >= 27 && k < 34;
export const isTerminal = (k: Kind) => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isFlower = (k: Kind) => k >= 34 && k < 38;
export const isSeason = (k: Kind) => k >= 38 && k < 42;
export const rank = (k: Kind) => (k < 27 ? (k % 9) + 1 : 0);

export function suitOf(k: Kind): Suit {
  if (k < 9) return 'man';
  if (k < 18) return 'pin';
  if (k < 27) return 'sou';
  if (k < 31) return 'wind';
  if (k < 34) return 'dragon';
  return k < 38 ? 'flower' : 'season';
}

const SUIT_NAME: Record<Suit, string> = { man: 'Characters', pin: 'Dots', sou: 'Bamboo', wind: 'Wind', dragon: 'Dragon', flower: 'Flower', season: 'Season' };
const WINDS = ['East', 'South', 'West', 'North'];
const DRAGONS = ['Red', 'Green', 'White'];
const FLOWERS = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'];
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

/** "3 Dots", "East Wind", "Red Dragon", "Plum (flower)". */
export function tileName(k: Kind): string {
  const s = suitOf(k);
  if (s === 'man' || s === 'pin' || s === 'sou') return `${rank(k)} ${SUIT_NAME[s]}`;
  if (s === 'wind') return `${WINDS[k - 27]} Wind`;
  if (s === 'dragon') return `${DRAGONS[k - 31]} Dragon`;
  if (s === 'flower') return `${FLOWERS[k - 34]} (flower)`;
  return `${SEASONS[k - 38]} (season)`;
}

/** Short corner label for beginners: "3", "E", "R". */
export function cornerLabel(k: Kind): string {
  const s = suitOf(k);
  if (s === 'man' || s === 'pin' || s === 'sou') return String(rank(k));
  if (s === 'wind') return 'ESWN'[k - 27];
  if (s === 'dragon') return 'RGW'[k - 31];
  return String((k - (s === 'flower' ? 34 : 38)) + 1);
}

/** Solitaire: flowers match any flower, seasons any season; everything else matches itself. */
export function solitaireMatch(a: Kind, b: Kind): boolean {
  if (isFlower(a) && isFlower(b)) return true;
  if (isSeason(a) && isSeason(b)) return true;
  return a === b;
}

/** A seeded random generator (mulberry32), so a deal can be replayed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort order for a hand: suits in order, honours last. */
export const byKind = (a: Kind, b: Kind) => a - b;
