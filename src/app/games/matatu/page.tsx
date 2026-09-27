'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Scissors, Spade, User } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { CardHand, PlayingCard, SuitIcon, SuitPicker } from '@/components/games/PlayingCard';
import { ensureSession } from '@/lib/supabase';
import { recordResult } from '@/lib/games';
import {
  aiPickSuit, cardName, drawCards, isRedSuit, makeDeck, matchesTarget, other, pickRandom, pickStarter, plural,
  removeCard, shuffle, targetAfter, useIsClient,
  type Card, type Suit, type Target, type Who,
} from '@/lib/cards';
import s from './matatu.module.css';

/* ───────────────────────── Rules engine (pure) ───────────────────────── */

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', hint: 'Plays random cards and cuts on a whim' },
  { key: 'medium', label: 'Medium', hint: 'Answers penalties and cuts with a small hand' },
  { key: 'hard', label: 'Hard', hint: 'Sheds heavy cards and cuts when it is ahead' },
];

const HAND_SIZE = 7;
const AI_DELAY = 850;

interface MatatuState {
  id: number;
  deck: Card[];
  pile: Card[];
  hands: Record<Who, Card[]>;
  turn: Who;
  target: Target;
  /** Cards the player to move must pick up unless they block. Penalties never stack. */
  penalty: number;
  /** The card turned up at the start. Its suit is the cut suit. It sits at the bottom of the deck. */
  cutCard: Card;
  winner: Who | 'draw' | null;
  /** Hand points when the round was cut. */
  points: Record<Who, number> | null;
  note: string;
}

type Move = { type: 'play'; cardId: string; suit?: Suit } | { type: 'draw' };

const penaltyOf = (c: Card) => (c.rank === '2' ? 2 : c.rank === '3' ? 3 : c.rank === 'JOKER' ? 5 : 0);
const isPenalty = (c: Card) => penaltyOf(c) > 0;
const isSkip = (c: Card) => c.rank === '8' || c.rank === 'J';
const isPlain = (c: Card) => ['4', '5', '6', '9', '10', 'Q', 'K'].includes(c.rank);
const nameOf = (w: Who) => (w === 'you' ? 'You' : 'The AI');
const lower = (w: Who) => (w === 'you' ? 'you' : 'the AI');
const cutSuitOf = (st: MatatuState) => st.cutCard.suit ?? 'spades';
const isCutter = (st: MatatuState, c: Card) => c.rank === '7' && c.suit === cutSuitOf(st);

/** Card points used when the round is cut. Lower is better. */
function cardPoints(c: Card): number {
  switch (c.rank) {
    case 'JOKER': return 50;
    case '2': return 20;
    case 'A': return 15;
    case 'K': return 13;
    case 'Q': return 12;
    case 'J': return 11;
    default: return Number(c.rank);
  }
}
const handPoints = (h: Card[]) => h.reduce((n, c) => n + cardPoints(c), 0);

function deal(id: number): MatatuState {
  const full = shuffle(makeDeck(`m${id}`));
  const hands = { you: full.slice(0, HAND_SIZE), ai: full.slice(HAND_SIZE, HAND_SIZE * 2) };
  const rest = full.slice(HAND_SIZE * 2);
  const { deck: afterCut, starter: cutCard } = pickStarter(rest, c => c.rank !== 'JOKER');
  const { deck, starter } = pickStarter(afterCut, isPlain);
  return {
    id,
    deck: [...deck, cutCard],
    pile: [starter],
    hands,
    turn: 'you',
    target: { suit: starter.suit ?? 'hearts', rank: starter.rank },
    penalty: 0,
    cutCard,
    winner: null,
    points: null,
    note: `Cards are dealt. The cut card is the ${cardName(cutCard)}, so the 7 of ${cutCard.suit} cuts the game.`,
  };
}

function canPlay(st: MatatuState, card: Card): boolean {
  if (st.penalty > 0) return card.rank === 'A' || isSkip(card);
  if (card.rank === 'A' || card.rank === 'JOKER') return true;
  return matchesTarget(card, st.target);
}

function applyMove(st: MatatuState, who: Who, move: Move): MatatuState {
  if (st.winner || st.turn !== who) return st;
  const opp = other(who);
  const hands = { ...st.hands };
  let deck = st.deck;
  let pile = st.pile;

  if (move.type === 'draw') {
    const r = drawCards(hands[who], deck, pile, st.penalty > 0 ? st.penalty : 1);
    hands[who] = r.hand;
    const note = st.penalty > 0 ? `${nameOf(who)} picked up ${plural(r.drawn, 'penalty card')}.` : `${nameOf(who)} drew a card.`;
    return { ...st, deck: r.deck, pile: r.pile, hands, penalty: 0, turn: opp, note };
  }

  const card = hands[who].find(c => c.id === move.cardId);
  if (!card || !canPlay(st, card)) return st;

  hands[who] = removeCard(hands[who], card.id);
  pile = [...pile, card];
  const target = targetAfter(card, st.target, move.suit);
  let penalty = st.penalty;
  let turn: Who = opp;
  const parts = [`${nameOf(who)} played the ${cardName(card)}${card.rank === 'A' ? ` and asked for ${target.suit}` : ''}.`];

  if (hands[who].length === 0) {
    parts.push(who === 'you' ? 'That was your last card. You win!' : 'That was its last card. You lose this one.');
    return { ...st, deck, pile, hands, target, penalty: 0, winner: who, note: parts.join(' ') };
  }

  if (isCutter(st, card)) {
    const points = { you: handPoints(hands.you), ai: handPoints(hands.ai) };
    const winner: Who | 'draw' = points.you === points.ai ? 'draw' : points.you < points.ai ? 'you' : 'ai';
    parts.push(`The game is cut! You have ${points.you} points and the AI has ${points.ai}.`);
    parts.push(winner === 'draw' ? 'It is a tie.' : winner === 'you' ? 'Fewest points wins, so you win!' : 'Fewest points wins, so the AI wins.');
    return { ...st, deck, pile, hands, target, penalty: 0, winner, points, note: parts.join(' ') };
  }

  if (penalty > 0 && isSkip(card)) {
    const r = drawCards(hands[opp], deck, pile, penalty);
    hands[opp] = r.hand; deck = r.deck; pile = r.pile;
    parts.push(`That turns the penalty around, so ${lower(opp)} picked up ${plural(r.drawn, 'card')} and ${nameOf(who).toLowerCase()} ${who === 'you' ? 'go' : 'goes'} again.`);
    penalty = 0;
    turn = who;
  } else if (card.rank === 'A') {
    if (penalty > 0) parts.push('The penalty is cancelled.');
    penalty = 0;
  } else if (isPenalty(card)) {
    penalty = penaltyOf(card);
    if (card.rank === 'JOKER') parts.push(`The suit stays on ${target.suit}.`);
  } else if (isSkip(card)) {
    turn = who;
    parts.push(`${nameOf(opp)} ${opp === 'you' ? 'are' : 'is'} skipped.`);
  }

  return { ...st, deck, pile, hands, target, penalty, turn, note: parts.join(' ') };
}

/* ───────────────────────── AI ───────────────────────── */

function aiMove(st: MatatuState, diff: Difficulty): Move {
  const hand = st.hands.ai;
  const playable = hand.filter(c => canPlay(st, c));
  if (playable.length === 0) return { type: 'draw' };
  const play = (c: Card): Move => ({ type: 'play', cardId: c.id, suit: c.rank === 'A' ? aiPickSuit(hand, c.id) : undefined });

  const cutter = playable.find(c => isCutter(st, c));
  const rest = playable.filter(c => !isCutter(st, c));
  if (hand.length === 1) return play(playable[0]);

  if (diff === 'easy') {
    if (cutter && Math.random() < 0.3) return play(cutter);
    return rest.length ? play(pickRandom(rest)) : { type: 'draw' };
  }

  if (st.penalty > 0) {
    const bounce = playable.filter(isSkip);
    const ace = playable.find(c => c.rank === 'A');
    return play(bounce[0] ?? ace ?? playable[0]);
  }

  if (cutter) {
    const left = handPoints(hand) - cardPoints(cutter);
    // Hard guesses about 7 points per card in your hand; medium only cuts with a light hand.
    const worthIt = diff === 'hard' ? left < st.hands.you.length * 7 : left <= 12;
    if (worthIt) return play(cutter);
  }

  if (!rest.length) return { type: 'draw' };
  const skips = rest.filter(isSkip);
  const pens = rest.filter(isPenalty);
  const plain = rest.filter(c => !isSkip(c) && !isPenalty(c) && c.rank !== 'A');

  if (diff === 'hard') {
    if (skips.length && hand.length > skips.length) return play(skips[0]);
    if (pens.length && st.hands.you.length <= 3) return play(pens[0]);
    // Shed the heaviest cards first so a cut goes our way.
    const heavy = [...plain, ...pens].sort((a, b) => cardPoints(b) - cardPoints(a));
    if (heavy.length) return play(heavy[0]);
    return play(rest[0]);
  }

  if (plain.length) return play(pickRandom(plain));
  return play(pickRandom(rest));
}

/* ───────────────────────── Page ───────────────────────── */

export default function MatatuPage() {
  const client = useIsClient();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<MatatuState>(() => deal(1));
  const [aceId, setAceId] = useState<string | null>(null);
  const [cutId, setCutId] = useState<string | null>(null);
  const [score, setScore] = useState({ win: 0, loss: 0, draw: 0 });
  const recorded = useRef(0);

  useEffect(() => { ensureSession().catch(() => undefined); }, []);

  /** Set the new state and, if the game just ended, record it exactly once. */
  const commit = useCallback((prev: MatatuState, next: MatatuState) => {
    setGame(next);
    if (next.winner && !prev.winner && recorded.current !== next.id) {
      recorded.current = next.id;
      const res = next.winner === 'draw' ? 'draw' : next.winner === 'you' ? 'win' : 'loss';
      setScore(sc => ({ ...sc, [res]: sc[res] + 1 }));
      void recordResult('matatu', difficulty, res);
    }
  }, [difficulty]);

  useEffect(() => {
    if (!client || game.winner || game.turn !== 'ai') return;
    const t = setTimeout(() => {
      let next = applyMove(game, 'ai', aiMove(game, difficulty));
      if (next === game) next = applyMove(game, 'ai', { type: 'draw' });
      commit(game, next);
    }, AI_DELAY);
    return () => clearTimeout(t);
  }, [client, game, difficulty, commit]);

  const newGame = useCallback(() => {
    setAceId(null);
    setCutId(null);
    setGame(deal(game.id + 1));
  }, [game.id]);

  const changeDifficulty = (k: string) => {
    setDifficulty(k as Difficulty);
    newGame();
  };

  const yourTurn = game.turn === 'you' && !game.winner;
  const thinking = game.turn === 'ai' && !game.winner;
  const busy = !!aceId || !!cutId;
  const top = game.pile[game.pile.length - 1];
  const cutSuit = cutSuitOf(game);
  const playableIds = new Set(yourTurn ? game.hands.you.filter(c => canPlay(game, c)).map(c => c.id) : []);
  const drawCount = game.penalty > 0 ? game.penalty : 1;

  const playCard = (card: Card) => {
    if (!yourTurn || busy || !playableIds.has(card.id)) return;
    if (card.rank === 'A') { setAceId(card.id); return; }
    if (isCutter(game, card) && game.hands.you.length > 1) { setCutId(card.id); return; }
    commit(game, applyMove(game, 'you', { type: 'play', cardId: card.id }));
  };
  const pickSuit = (suit: Suit) => {
    if (!aceId) return;
    const id = aceId;
    setAceId(null);
    commit(game, applyMove(game, 'you', { type: 'play', cardId: id, suit }));
  };
  const confirmCut = () => {
    if (!cutId) return;
    const id = cutId;
    setCutId(null);
    commit(game, applyMove(game, 'you', { type: 'play', cardId: id }));
  };
  const draw = () => { if (yourTurn && !busy) commit(game, applyMove(game, 'you', { type: 'draw' })); };

  let tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral';
  let ask = '';
  if (game.winner) {
    tone = game.winner === 'you' ? 'good' : game.winner === 'ai' ? 'bad' : 'info';
  } else if (thinking) {
    tone = 'info';
    ask = 'The AI is thinking.';
  } else if (game.penalty > 0) {
    tone = 'bad';
    ask = `Pick up ${game.penalty}, turn it around with an 8 or Jack, or cancel it with an Ace.`;
  } else if (aceId) {
    ask = 'Pick the suit you want next.';
  } else if (cutId) {
    ask = 'Cut the game now?';
  } else {
    ask = `Your turn. Play a ${game.target.suit} card${game.target.rank ? ` or any ${game.target.rank}` : ''}.`;
  }
  const status = <><span>{game.note}</span>{ask && <span className={s.ask}> {ask}</span>}</>;

  const rules = (
    <ul className={s.rules}>
      <li>Each player gets 7 cards. One more card is turned face up and tucked under the deck: that is the <b>cut card</b>, and its suit is the cut suit for the round.</li>
      <li>On your turn play one card matching the suit or rank of the pile, or draw one card. Empty your hand to win.</li>
      <li><b>Ace</b> is wild: play it on anything and pick the next suit. It also cancels a penalty.</li>
      <li><b>2, 3 and Joker</b> make the next player pick up 2, 3 or 5. Penalties never stack: you cannot answer one penalty with another.</li>
      <li><b>8 or Jack</b> skips the other player so you go again. Played on a penalty (any suit), it turns the penalty around and the other player picks it up.</li>
      <li><b>Joker</b> can go on any card. The suit stays what it was under the Joker, so play continues from that card.</li>
      <li><b>The 7 of the cut suit</b> cuts the game when you play it (it follows the normal matching rule). Both hands are counted and the fewest points wins: number cards count their value, Jack 11, Queen 12, King 13, Ace 15, 2 counts 20 and a Joker 50.</li>
      <li>When the draw pile runs out, the played cards are shuffled back in.</li>
    </ul>
  );

  const ended = !!game.winner;
  const yourPoints = handPoints(game.hands.you);

  return (
    <GameShell
      title="Matatu"
      subtitle="Shed your cards, or cut the game with the right 7."
      icon={<Spade size={24} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={changeDifficulty}
      score={[
        { label: 'Wins', value: score.win, tone: 'win' },
        { label: 'Losses', value: score.loss, tone: 'loss' },
        { label: 'Ties', value: score.draw, tone: 'draw' },
      ]}
      status={client ? status : 'Shuffling the deck.'}
      statusTone={tone}
      onNewGame={newGame}
      rules={rules}
    >
      {!client ? (
        <div className={`skeleton ${s.skel}`} />
      ) : (
        <div className={s.table}>
          <section className={s.seat} aria-label="AI hand">
            <div className={s.seatHead}>
              <span className={s.who}><Bot size={16} strokeWidth={2.25} /> AI</span>
              <span className={s.count}>{plural(game.hands.ai.length, 'card')}</span>
              {game.points && <span className={s.points}>{game.points.ai} points</span>}
              {thinking && <span className={s.thinking} aria-hidden><i /><i /><i /></span>}
            </div>
            <CardHand label="AI cards" compact={!ended}>
              {game.hands.ai.map(c => <PlayingCard key={c.id} card={c} faceDown={!ended} size={ended ? 'md' : 'sm'} />)}
            </CardHand>
          </section>

          <section className={s.centre} aria-label="Table">
            <div className={s.stack}>
              <div className={s.deckWrap}>
                <PlayingCard card={game.cutCard} size="md" className={s.cutCard} label={`Cut card, the ${cardName(game.cutCard)}`} />
                <PlayingCard
                  faceDown
                  size="lg"
                  onClick={draw}
                  disabled={!yourTurn || busy}
                  playable={yourTurn && !busy && playableIds.size === 0}
                  label={`Draw ${plural(drawCount, 'card')}`}
                  className={s.deckCard}
                />
              </div>
              <span className={s.stackLabel}>{game.deck.length} left</span>
            </div>
            <div className={s.stack}>
              {top && <PlayingCard key={top.id} card={top} size="lg" flip />}
              <span className={s.stackLabel}>Pile</span>
            </div>
            <div className={s.chips}>
              <span className={s.chip}>
                <SuitIcon suit={game.target.suit} size={14} className={isRedSuit(game.target.suit) ? s.redSuit : undefined} />
                {game.target.suit.charAt(0).toUpperCase() + game.target.suit.slice(1)}{game.target.rank ? ` or any ${game.target.rank}` : ''}
              </span>
              <span className={`${s.chip} ${s.chipCut}`}>
                <Scissors size={14} strokeWidth={2.25} /> 7 of <SuitIcon suit={cutSuit} size={14} className={isRedSuit(cutSuit) ? s.redSuit : undefined} /> {cutSuit} cuts
              </span>
              {game.penalty > 0 && <span className={`${s.chip} ${s.chipBad}`}>Pick up {game.penalty}</span>}
            </div>
          </section>

          {aceId && <SuitPicker onPick={pickSuit} onCancel={() => setAceId(null)} title="Your Ace asks for" />}
          {cutId && (
            <div className={s.confirm} role="group" aria-label="Cut the game">
              <p>
                Cut now? You would finish with {yourPoints - 7} points against the AI&apos;s {plural(game.hands.ai.length, 'card')}.
              </p>
              <div className={s.confirmRow}>
                <button type="button" className={s.primaryBtn} onClick={confirmCut}><Scissors size={15} strokeWidth={2.25} /> Cut the game</button>
                <button type="button" className={s.ghostBtn} onClick={() => setCutId(null)}>Keep it</button>
              </div>
            </div>
          )}

          <section className={s.seat} aria-label="Your hand">
            <div className={s.seatHead}>
              <span className={s.who}><User size={16} strokeWidth={2.25} /> You</span>
              <span className={s.count}>{plural(game.hands.you.length, 'card')}</span>
              <span className={s.points}>{game.points ? game.points.you : yourPoints} points</span>
            </div>
            <CardHand label="Your cards">
              {game.hands.you.map(c => {
                const ok = playableIds.has(c.id) && !busy;
                return (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    onClick={() => playCard(c)}
                    disabled={!ok}
                    playable={ok}
                    dim={yourTurn && !ok}
                    className={isCutter(game, c) ? s.cutter : undefined}
                    label={`${ok ? 'Play' : 'Cannot play'} the ${cardName(c)}${isCutter(game, c) ? ', this card cuts the game' : ''}`}
                  />
                );
              })}
            </CardHand>
          </section>

          {ended && (
            <div className={s.result} data-tone={game.winner === 'you' ? 'win' : game.winner === 'ai' ? 'loss' : 'draw'}>
              <p>
                {game.winner === 'you' ? 'You won this round. Nicely played!' : game.winner === 'ai' ? 'The AI took this round.' : 'A tie on points.'}
              </p>
              <button type="button" className={s.primaryBtn} onClick={newGame}>Deal again</button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}
