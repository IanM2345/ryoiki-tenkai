import { useSyncExternalStore } from 'react';

/**
 * Shared playing card helpers for the Kadi and Matatu games:
 * card types, deck building, Fisher-Yates shuffle, drawing with a reshuffle
 * of the discard pile, the "target" a card must match, and AI suit choice.
 * Everything here is pure (apart from Math.random in shuffle).
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';
export type Who = 'you' | 'ai';

export interface Card {
  id: string;
  rank: Rank;
  /** null for jokers */
  suit: Suit | null;
  red: boolean;
}

/** What the next card has to match: the suit, or the rank (null after an Ace was declared). */
export interface Target { suit: Suit; rank: Rank | null }

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const RANK_NAME: Record<Rank, string> = {
  A: 'Ace', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'Jack', Q: 'Queen', K: 'King', JOKER: 'Joker',
};

export const isRedSuit = (s: Suit) => s === 'hearts' || s === 'diamonds';
export const other = (w: Who): Who => (w === 'you' ? 'ai' : 'you');

/** A full 52 card deck plus two jokers (one red, one black). Ids are unique per deal. */
export function makeDeck(prefix: string, jokers = true): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ id: `${prefix}-${rank}-${suit}`, rank, suit, red: isRedSuit(suit) });
  }
  if (jokers) {
    deck.push({ id: `${prefix}-joker-red`, rank: 'JOKER', suit: null, red: true });
    deck.push({ id: `${prefix}-joker-black`, rank: 'JOKER', suit: null, red: false });
  }
  return deck;
}

/** Fisher-Yates shuffle, returns a new array. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw `count` cards into `hand`. When the deck runs out, every discard except
 * the top card is shuffled back in. Stops early if there is nothing left anywhere.
 */
export function drawCards(hand: Card[], deck: Card[], pile: Card[], count: number): {
  hand: Card[]; deck: Card[]; pile: Card[]; drawn: number;
} {
  let d = deck;
  let p = pile;
  const h = [...hand];
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (p.length <= 1) break;
      d = shuffle(p.slice(0, -1));
      p = p.slice(-1);
    }
    h.push(d[0]);
    d = d.slice(1);
    drawn++;
  }
  return { hand: h, deck: d, pile: p, drawn };
}

export const removeCard = (hand: Card[], id: string) => hand.filter(c => c.id !== id);

/** Does the card follow the current target by suit or rank? Jokers and Aces are handled by each game. */
export function matchesTarget(card: Card, target: Target): boolean {
  if (card.suit === null) return false;
  return card.suit === target.suit || (target.rank !== null && card.rank === target.rank);
}

/**
 * The target after a card is played. An Ace sets the declared suit (any rank),
 * a Joker leaves the target unchanged so play continues from the card under it,
 * any other card becomes the new target.
 */
export function targetAfter(card: Card, prev: Target, declared?: Suit): Target {
  if (card.rank === 'JOKER' || card.suit === null) return prev;
  if (card.rank === 'A') return { suit: declared ?? card.suit, rank: null };
  return { suit: card.suit, rank: card.rank };
}

/** The suit the AI holds most of (ignoring the card it is about to play). */
export function aiPickSuit(hand: Card[], exceptId?: string): Suit {
  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const c of hand) if (c.suit && c.id !== exceptId && c.rank !== 'A') counts[c.suit] += 1;
  let best: Suit = SUITS[Math.floor(Math.random() * 4)];
  for (const s of SUITS) if (counts[s] > counts[best]) best = s;
  return best;
}

/** Pick a plain starting card (no specials) and move it from the deck to the pile. */
export function pickStarter(deck: Card[], isPlain: (c: Card) => boolean): { deck: Card[]; starter: Card } {
  let idx = deck.findIndex(isPlain);
  if (idx === -1) idx = 0;
  return { starter: deck[idx], deck: [...deck.slice(0, idx), ...deck.slice(idx + 1)] };
}

export const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Short corner label: "A", "10", "Q", or "JK" for jokers. */
export const rankShort = (c: Card) => (c.rank === 'JOKER' ? 'JK' : c.rank);

/** Spoken name: "Queen of hearts", "Red joker". */
export function cardName(c: Card): string {
  if (c.rank === 'JOKER' || c.suit === null) return c.red ? 'Red joker' : 'Black joker';
  return `${RANK_NAME[c.rank]} of ${c.suit}`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const noopSubscribe = () => () => {};
/** False during server render and hydration, true afterwards. Lets games deal random cards client side only. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
