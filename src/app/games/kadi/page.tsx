'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Layers, Megaphone, User } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { CardHand, PlayingCard, SuitIcon, SuitPicker } from '@/components/games/PlayingCard';
import { ensureSession } from '@/lib/supabase';
import { recordResult } from '@/lib/games';
import {
  aiPickSuit, cardName, drawCards, makeDeck, matchesTarget, other, pickRandom, pickStarter, plural,
  removeCard, shuffle, targetAfter, useIsClient,
  type Card, type Suit, type Target, type Who,
} from '@/lib/cards';
import s from './kadi.module.css';

/* ───────────────────────── Rules engine (pure) ───────────────────────── */

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', hint: 'Plays random cards and often forgets to call Kadi' },
  { key: 'medium', label: 'Medium', hint: 'Answers penalties sensibly' },
  { key: 'hard', label: 'Hard', hint: 'Bounces penalties, saves Aces and never forgets Kadi' },
];

const HAND_SIZE = 4;
const FORGOT_KADI_DRAW = 2;
const AI_DELAY = 850;

interface KadiState {
  id: number;
  deck: Card[];
  pile: Card[];
  hands: Record<Who, Card[]>;
  turn: Who;
  target: Target;
  /** Cards the player to move must pick up unless they stack or block. */
  penalty: number;
  /** Suit that must answer an open question (Q or 8). */
  question: Suit | null;
  kadi: Record<Who, boolean>;
  winner: Who | null;
  note: string;
}

type Move =
  | { type: 'play'; cardId: string; suit?: Suit; callKadi?: boolean }
  | { type: 'draw' }
  | { type: 'kadi' };

const penaltyOf = (c: Card) => (c.rank === '2' ? 2 : c.rank === '3' ? 3 : c.rank === 'JOKER' ? 5 : 0);
const isPenalty = (c: Card) => penaltyOf(c) > 0;
const isQuestion = (c: Card) => c.rank === 'Q' || c.rank === '8';
const isSkip = (c: Card) => c.rank === 'K' || c.rank === 'J';
const isPlain = (c: Card) => ['4', '5', '6', '7', '9', '10'].includes(c.rank);
const nameOf = (w: Who) => (w === 'you' ? 'You' : 'The AI');
const lower = (w: Who) => (w === 'you' ? 'you' : 'the AI');

function deal(id: number): KadiState {
  const full = shuffle(makeDeck(`k${id}`));
  const hands = { you: full.slice(0, HAND_SIZE), ai: full.slice(HAND_SIZE, HAND_SIZE * 2) };
  const { deck, starter } = pickStarter(full.slice(HAND_SIZE * 2), isPlain);
  return {
    id, deck, pile: [starter], hands, turn: 'you',
    target: { suit: starter.suit ?? 'hearts', rank: starter.rank },
    penalty: 0, question: null, kadi: { you: false, ai: false }, winner: null,
    note: `Cards are dealt. The first card is the ${cardName(starter)}.`,
  };
}

function canPlay(st: KadiState, card: Card): boolean {
  if (st.penalty > 0) return card.rank === 'A' || isSkip(card) || isPenalty(card);
  if (st.question) return card.rank === 'A' || card.suit === st.question;
  if (card.rank === 'A' || card.rank === 'JOKER') return true;
  return matchesTarget(card, st.target);
}

/** Kadi can be called on your own turn while holding exactly two cards, so you can finish next turn. */
function canCallKadi(st: KadiState, who: Who): boolean {
  return !st.winner && st.turn === who && !st.kadi[who] && st.hands[who].length === 2;
}

function applyMove(st: KadiState, who: Who, move: Move): KadiState {
  if (st.winner || st.turn !== who) return st;
  const opp = other(who);
  const hands = { ...st.hands };
  const kadi = { ...st.kadi };

  if (move.type === 'kadi') {
    if (!canCallKadi(st, who)) return st;
    kadi[who] = true;
    return { ...st, kadi, note: who === 'you' ? 'You called Kadi. Finish on your next turn to win.' : 'The AI called Kadi!' };
  }

  let deck = st.deck;
  let pile = st.pile;

  if (move.type === 'draw') {
    const r = drawCards(hands[who], deck, pile, st.penalty > 0 ? st.penalty : 1);
    hands[who] = r.hand;
    if (hands[who].length > 2) kadi[who] = false;
    const note = st.penalty > 0
      ? `${nameOf(who)} picked up ${plural(r.drawn, 'penalty card')}.`
      : st.question
        ? `${nameOf(who)} could not answer the question and drew a card.`
        : `${nameOf(who)} drew a card.`;
    return { ...st, deck: r.deck, pile: r.pile, hands, kadi, penalty: 0, question: null, turn: opp, note };
  }

  const card = hands[who].find(c => c.id === move.cardId);
  if (!card || !canPlay(st, card)) return st;

  const parts: string[] = [];
  if (move.callKadi && canCallKadi(st, who)) {
    kadi[who] = true;
    parts.push(`${nameOf(who)} called Kadi!`);
  }

  hands[who] = removeCard(hands[who], card.id);
  pile = [...pile, card];
  const target = targetAfter(card, st.target, move.suit);
  let penalty = st.penalty;
  let question: Suit | null = null;
  let turn: Who = opp;
  parts.push(`${nameOf(who)} played the ${cardName(card)}${card.rank === 'A' ? ` and asked for ${target.suit}` : ''}.`);

  if (penalty > 0 && isSkip(card)) {
    const r = drawCards(hands[opp], deck, pile, penalty);
    hands[opp] = r.hand; deck = r.deck; pile = r.pile;
    parts.push(`That sends the penalty back, so ${lower(opp)} picked up ${plural(r.drawn, 'card')}.`);
    penalty = 0;
    turn = who;
  } else if (card.rank === 'A') {
    if (penalty > 0) parts.push('The penalty is cancelled.');
    penalty = 0;
  } else if (isPenalty(card)) {
    penalty += penaltyOf(card);
    if (card.rank === 'JOKER') parts.push(`The suit stays on ${target.suit}.`);
  } else if (isQuestion(card)) {
    question = card.suit;
    parts.push(`That is a question, so ${lower(opp)} must answer with ${card.suit}.`);
  } else if (isSkip(card)) {
    turn = who;
    parts.push(`${nameOf(opp)} ${opp === 'you' ? 'are' : 'is'} skipped.`);
  }

  let winner: Who | null = null;
  if (hands[who].length === 0) {
    if (kadi[who]) {
      winner = who;
    } else {
      const r = drawCards(hands[who], deck, pile, FORGOT_KADI_DRAW);
      hands[who] = r.hand; deck = r.deck; pile = r.pile;
      if (hands[who].length === 0) winner = who;
      else parts.push(`${nameOf(who)} went out without calling Kadi, so ${who === 'you' ? 'you draw' : 'it draws'} ${FORGOT_KADI_DRAW} instead of winning.`);
    }
  }
  for (const w of ['you', 'ai'] as Who[]) if (hands[w].length > 2) kadi[w] = false;

  if (winner) {
    parts.push(winner === 'you' ? 'Kadi! You win.' : 'The AI went out. You lose this one.');
    return { ...st, deck, pile, hands, kadi, target, penalty: 0, question: null, winner, note: parts.join(' ') };
  }
  return { ...st, deck, pile, hands, kadi, target, penalty, question, turn, note: parts.join(' ') };
}

/* ───────────────────────── AI ───────────────────────── */

function aiMove(st: KadiState, diff: Difficulty): Move {
  const hand = st.hands.ai;
  const playable = hand.filter(c => canPlay(st, c));
  const forget = diff === 'easy' ? 0.4 : diff === 'medium' ? 0.12 : 0;
  const callKadi = hand.length === 2 && !st.kadi.ai && Math.random() >= forget;
  if (playable.length === 0) return { type: 'draw' };

  const play = (c: Card): Move => ({ type: 'play', cardId: c.id, callKadi, suit: c.rank === 'A' ? aiPickSuit(hand, c.id) : undefined });
  if (diff === 'easy') return play(pickRandom(playable));

  const skips = playable.filter(isSkip);
  const pens = playable.filter(isPenalty);
  const aces = playable.filter(c => c.rank === 'A');
  const plain = playable.filter(c => !isSkip(c) && !isPenalty(c) && c.rank !== 'A' && !isQuestion(c));
  const questions = playable.filter(isQuestion);

  if (st.penalty > 0) {
    if (diff === 'hard') return play(skips[0] ?? pens[0] ?? aces[0]);
    return play(pens[0] ?? skips[0] ?? aces[0]);
  }
  if (hand.length === 1) return play(playable[0]);

  if (diff === 'hard') {
    // Keep a skip for an extra turn, hit hard when you are close to finishing, keep Aces for emergencies.
    if (skips.length && hand.length > skips.length) return play(skips[0]);
    if (pens.length && st.hands.you.length <= 2) return play(pens[0]);
    const suitCount = (x: Suit | null) => hand.filter(c => c.suit === x).length;
    const byShape = [...plain, ...questions].sort((a, b) => suitCount(b.suit) - suitCount(a.suit));
    if (byShape.length) return play(byShape[0]);
    return play(pens[0] ?? skips[0] ?? aces[0] ?? playable[0]);
  }

  if (plain.length) return play(pickRandom(plain));
  return play(pickRandom(playable));
}

/* ───────────────────────── Page ───────────────────────── */

export default function KadiPage() {
  const client = useIsClient();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<KadiState>(() => deal(1));
  const [aceId, setAceId] = useState<string | null>(null);
  const [score, setScore] = useState({ win: 0, loss: 0 });
  const recorded = useRef(0);

  useEffect(() => { ensureSession().catch(() => undefined); }, []);

  /** Set the new state and, if the game just ended, record it exactly once. */
  const commit = useCallback((prev: KadiState, next: KadiState) => {
    setGame(next);
    if (next.winner && !prev.winner && recorded.current !== next.id) {
      recorded.current = next.id;
      const res = next.winner === 'you' ? 'win' : 'loss';
      setScore(sc => ({ ...sc, [res]: sc[res] + 1 }));
      void recordResult('kadi', difficulty, res);
    }
  }, [difficulty]);

  // The AI moves in an effect whenever it is its turn, after a short pause.
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
    setGame(deal(game.id + 1));
  }, [game.id]);

  const changeDifficulty = (k: string) => {
    setDifficulty(k as Difficulty);
    newGame();
  };

  const yourTurn = game.turn === 'you' && !game.winner;
  const thinking = game.turn === 'ai' && !game.winner;
  const top = game.pile[game.pile.length - 1];
  const playableIds = new Set(yourTurn ? game.hands.you.filter(c => canPlay(game, c)).map(c => c.id) : []);
  const drawCount = game.penalty > 0 ? game.penalty : 1;

  const playCard = (card: Card) => {
    if (!yourTurn || aceId || !playableIds.has(card.id)) return;
    if (card.rank === 'A') { setAceId(card.id); return; }
    commit(game, applyMove(game, 'you', { type: 'play', cardId: card.id }));
  };
  const pickSuit = (suit: Suit) => {
    if (!aceId) return;
    const id = aceId;
    setAceId(null);
    commit(game, applyMove(game, 'you', { type: 'play', cardId: id, suit }));
  };
  const draw = () => { if (yourTurn && !aceId) commit(game, applyMove(game, 'you', { type: 'draw' })); };
  const callKadi = () => { if (!aceId) commit(game, applyMove(game, 'you', { type: 'kadi' })); };

  // Status line
  let tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral';
  let ask = '';
  if (game.winner) {
    tone = game.winner === 'you' ? 'good' : 'bad';
  } else if (thinking) {
    ask = 'The AI is thinking.';
    tone = 'info';
  } else if (game.penalty > 0) {
    tone = 'bad';
    ask = `Pick up ${game.penalty}, stack a 2, 3 or Joker, send it back with a King or Jack, or cancel it with an Ace.`;
  } else if (game.question) {
    tone = 'info';
    ask = `Answer the question with any ${game.question} card or an Ace, or draw one.`;
  } else if (aceId) {
    ask = 'Pick the suit you want next.';
  } else {
    ask = `Your turn. Play a ${game.target.suit} card${game.target.rank ? ` or any ${game.target.rank}` : ''}.`;
  }
  const status = (
    <>
      <span>{game.note}</span>{ask && <span className={s.ask}> {ask}</span>}
    </>
  );

  const rules = (
    <ul className={s.rules}>
      <li>Each player gets 4 cards. On your turn play one card that matches the suit or rank of the card on the pile, or draw one card.</li>
      <li><b>Ace</b> is wild. Play it on anything and pick the next suit. It also cancels a penalty.</li>
      <li><b>2, 3 and Joker</b> are penalties: the next player picks up 2, 3 or 5. Penalties stack, so you can answer any penalty with another 2, 3 or Joker and pass the growing total on.</li>
      <li><b>King or Jack</b> skips the other player so you go again. Played on a penalty (any suit), it sends the whole penalty back and the other player picks it all up.</li>
      <li><b>Joker</b> can go on any card when there is no question open. The suit stays what it was under the Joker, so play continues from that card.</li>
      <li><b>Queen or 8</b> is a question. The other player must answer with any card of the same suit (or an Ace). If they cannot, they draw 1.</li>
      <li><b>Kadi!</b> When you hold 2 cards on your turn, press Kadi to warn that you can finish next turn. Going out without calling it means you draw 2 instead of winning. The AI has to call it too.</li>
      <li>When the draw pile runs out, the played cards are shuffled back in.</li>
    </ul>
  );

  const ended = !!game.winner;

  return (
    <GameShell
      title="Kadi"
      subtitle="The Kenyan card game of stacking penalties and shouting Kadi."
      icon={<Layers size={24} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={changeDifficulty}
      score={[{ label: 'Wins', value: score.win, tone: 'win' }, { label: 'Losses', value: score.loss, tone: 'loss' }]}
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
              {game.kadi.ai && <span className={s.kadiTag}><Megaphone size={13} strokeWidth={2.25} /> Kadi</span>}
              {thinking && <span className={s.thinking} aria-hidden><i /><i /><i /></span>}
            </div>
            <CardHand label="AI cards" compact={!ended}>
              {game.hands.ai.map(c => <PlayingCard key={c.id} card={c} faceDown={!ended} size={ended ? 'md' : 'sm'} />)}
            </CardHand>
          </section>

          <section className={s.centre} aria-label="Table">
            <div className={s.stack}>
              <PlayingCard
                faceDown
                size="lg"
                onClick={draw}
                disabled={!yourTurn || !!aceId}
                playable={yourTurn && !aceId && playableIds.size === 0}
                label={`Draw ${plural(drawCount, 'card')}`}
              />
              <span className={s.stackLabel}>{game.deck.length} left</span>
            </div>
            <div className={s.stack}>
              {top && <PlayingCard key={top.id} card={top} size="lg" flip />}
              <span className={s.stackLabel}>Pile</span>
            </div>
            <div className={s.chips}>
              <span className={s.chip}>
                <SuitIcon suit={game.target.suit} size={14} className={game.target.suit === 'hearts' || game.target.suit === 'diamonds' ? s.redSuit : undefined} />
                {game.target.suit.charAt(0).toUpperCase() + game.target.suit.slice(1)}{game.target.rank ? ` or any ${game.target.rank}` : ''}
              </span>
              {game.penalty > 0 && <span className={`${s.chip} ${s.chipBad}`}>Pick up {game.penalty}</span>}
              {game.question && <span className={`${s.chip} ${s.chipInfo}`}>Question: {game.question}</span>}
            </div>
          </section>

          {aceId && <SuitPicker onPick={pickSuit} onCancel={() => setAceId(null)} title="Your Ace asks for" />}

          <section className={s.seat} aria-label="Your hand">
            <div className={s.seatHead}>
              <span className={s.who}><User size={16} strokeWidth={2.25} /> You</span>
              <span className={s.count}>{plural(game.hands.you.length, 'card')}</span>
              {game.kadi.you ? (
                <span className={s.kadiTag}><Megaphone size={13} strokeWidth={2.25} /> Kadi called</span>
              ) : (
                <button
                  type="button"
                  className={s.kadiBtn}
                  onClick={callKadi}
                  disabled={!canCallKadi(game, 'you') || !!aceId}
                  title="Call this when you hold 2 cards and can finish next turn"
                >
                  <Megaphone size={15} strokeWidth={2.25} /> Kadi!
                </button>
              )}
            </div>
            <CardHand label="Your cards">
              {game.hands.you.map(c => {
                const ok = playableIds.has(c.id) && !aceId;
                return (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    onClick={() => playCard(c)}
                    disabled={!ok}
                    playable={ok}
                    dim={yourTurn && !ok}
                    label={`${ok ? 'Play' : 'Cannot play'} the ${cardName(c)}`}
                  />
                );
              })}
            </CardHand>
          </section>

          {ended && (
            <div className={s.result} data-tone={game.winner === 'you' ? 'win' : 'loss'}>
              <p>{game.winner === 'you' ? 'You won this round. Nicely played!' : 'The AI took this round.'}</p>
              <button type="button" className={s.againBtn} onClick={newGame}>Deal again</button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}
