'use client';

/**
 * KADI — Updated rules:
 * - Penalty stacking: any penalty card can be placed on another (2+3+Joker = cumulative)
 * - K or J can BLOCK a penalty (plays on the penalty card, passes turn without drawing)
 * - Q/8 = question cards
 * - A = wild, blocks penalties
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import styles from './kadi.module.css';

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';
type Color = 'red' | 'black';

interface Card {
  suit: Suit | 'joker';
  rank: Rank;
  color: Color;
  id: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUIT_EMOJI: Record<Suit | 'joker', string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠', joker: '🃏',
};
const SUIT_COLOR: Record<Suit | 'joker', Color> = {
  hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black', joker: 'red',
};

function makeDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, color: SUIT_COLOR[suit], id: `${suit}-${rank}-${id++}` });
    }
  }
  deck.push({ suit: 'joker', rank: 'JOKER', color: 'red',   id: `joker-red-${id++}`   });
  deck.push({ suit: 'joker', rank: 'JOKER', color: 'black', id: `joker-black-${id++}` });
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isQuestion(rank: Rank) { return rank === 'Q' || rank === '8'; }
function isPenalty(rank: Rank)  { return rank === '2' || rank === '3' || rank === 'JOKER'; }
function isBlocker(rank: Rank)  { return rank === 'K' || rank === 'J' || rank === 'A'; }
function penaltyCount(rank: Rank) { return rank === '2' ? 2 : rank === '3' ? 3 : rank === 'JOKER' ? 5 : 0; }

function canPlay(
  card: Card,
  topCard: Card,
  chosenSuit: Suit | null,
  questionActive: boolean,
  pendingPenalty: number
): boolean {
  // If there's a pending penalty, you can: stack another penalty, play A/K/J to block
  if (pendingPenalty > 0 && !questionActive) {
    if (card.rank === 'A') return true;
    if (card.rank === 'K' || card.rank === 'J') return true;
    if (isPenalty(card.rank)) return true; // any penalty stacks
    return false;
  }
  if (card.rank === 'A') return true;
  if (card.rank === 'JOKER') return !questionActive;
  if (questionActive) return card.rank === topCard.rank;
  const effectiveSuit = chosenSuit ?? topCard.suit;
  return card.suit === effectiveSuit || card.rank === topCard.rank;
}

function aiChooseCard(
  hand: Card[],
  topCard: Card,
  chosenSuit: Suit | null,
  questionActive: boolean,
  pendingPenalty: number,
  difficulty: Difficulty
): Card | null {
  const playable = hand.filter(c => canPlay(c, topCard, chosenSuit, questionActive, pendingPenalty));
  if (playable.length === 0) return null;
  if (difficulty === 'easy') return playable[Math.floor(Math.random() * playable.length)];

  const penalties = playable.filter(c => isPenalty(c.rank));
  const questions = playable.filter(c => isQuestion(c.rank));
  const aces      = playable.filter(c => c.rank === 'A');
  const blockers  = playable.filter(c => c.rank === 'K' || c.rank === 'J');
  const normals   = playable.filter(c => !isPenalty(c.rank) && !isQuestion(c.rank) && !isBlocker(c.rank));

  if (difficulty === 'hard') {
    if (pendingPenalty > 0) {
      // Stack if possible, else block with K/J, else block with A
      if (penalties.length > 0) return penalties[0];
      if (blockers.length > 0) return blockers[0];
      if (aces.length > 0) return aces[0];
    }
    if (questions.length > 0) return questions[0];
    if (blockers.length > 0 && hand.length <= 3) return blockers[0]; // save blocker til end
    if (normals.length > 0) return normals[Math.floor(Math.random() * normals.length)];
    if (aces.length > 0) return aces[0];
    return playable[0];
  }

  // Medium
  if (pendingPenalty > 0 && penalties.length > 0) return penalties[0];
  if (pendingPenalty > 0 && blockers.length > 0) return blockers[0];
  if (normals.length > 0) return normals[Math.floor(Math.random() * normals.length)];
  if (questions.length > 0) return questions[0];
  return playable[Math.floor(Math.random() * playable.length)];
}

function aiChooseSuit(hand: Card[]): Suit {
  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const c of hand) { if (c.suit !== 'joker') counts[c.suit as Suit]++; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Suit;
}

interface AiTurnArgs {
  ah: Card[]; nd: Card[]; np: Card[];
  currentPendingPenalty: number;
  currentQuestionActive: boolean;
  currentChosenSuit: Suit | null;
  forceDraw?: boolean; // true when K/J was played — AI must draw, no stacking/blocking
}

export default function KadiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [status, setStatus] = useState<GameStatus>('idle');

  const [deck, setDeck] = useState<Card[]>([]);
  const [pile, setPile] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [aiHand, setAiHand] = useState<Card[]>([]);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [chosenSuit, setChosenSuit] = useState<Suit | null>(null);
  const [choosingSuit, setChoosingSuit] = useState(false);
  const [pendingPenalty, setPendingPenalty] = useState(0);
  const [questionActive, setQuestionActive] = useState(false);
  const [kadiCalled, setKadiCalled] = useState(false);
  const [message, setMessage] = useState('');
  const [scores, setScores] = useState({ wins: 0, losses: 0 });

  const aiTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const runAiTurnRef = useRef<(args: AiTurnArgs) => void>(() => { /* filled in useEffect */ });

  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  useEffect(() => {
    async function init() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      setLoading(false);
    }
    init();
    return () => clearTimeout(aiTimeout.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback(() => {
    const d = shuffle(makeDeck());
    const pHand = d.splice(0, 4);
    const aHand = d.splice(0, 4);
    let startIdx = d.findIndex(c => !['JOKER','A','Q','8'].includes(c.rank));
    if (startIdx === -1) startIdx = 0;
    const [firstCard] = d.splice(startIdx, 1);
    setDeck(d); setPile([firstCard]); setPlayerHand(pHand); setAiHand(aHand);
    setPlayerTurn(true); setChosenSuit(null); setChoosingSuit(false);
    setPendingPenalty(0); setQuestionActive(false); setKadiCalled(false);
    setStatus('playing'); setMessage('Your turn!');
  }, []);

  const drawCards = useCallback((count: number, hand: Card[], currentDeck: Card[], currentPile: Card[]): {
    drawn: Card[]; newHand: Card[]; newDeck: Card[]; newPile: Card[];
  } => {
    let d = [...currentDeck];
    let p = [...currentPile];
    const h = [...hand];
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (d.length === 0) {
        const top = p[p.length - 1];
        d = shuffle(p.slice(0, -1));
        p = [top];
      }
      if (d.length === 0) break;
      const card = d.shift()!;
      h.push(card); drawn.push(card);
    }
    return { drawn, newHand: h, newDeck: d, newPile: p };
  }, []);

  useEffect(() => {
    runAiTurnRef.current = ({ ah, nd, np, currentPendingPenalty, currentQuestionActive, currentChosenSuit, forceDraw = false }: AiTurnArgs) => {
      aiTimeout.current = setTimeout(() => {
        setAiHand(() => {
          let aiHand2 = [...ah];
          let nd2 = [...nd];
          let np2 = [...np];
          const topCard = np2[np2.length - 1];
          const diff = difficultyRef.current;

          // AI deals with pending penalty
          if (currentPendingPenalty > 0 && !currentQuestionActive) {
            // forceDraw=true means a K/J was played at us — must draw, no response allowed
            if (!forceDraw) {
              const aiCard = aiChooseCard(aiHand2, topCard, currentChosenSuit, false, currentPendingPenalty, diff);
              if (aiCard) {
                aiHand2 = aiHand2.filter(c => c.id !== aiCard.id);
                np2 = [...np2, aiCard];
                if (isPenalty(aiCard.rank)) {
                  // Stack
                  const newTotal = currentPendingPenalty + penaltyCount(aiCard.rank);
                  setPendingPenalty(newTotal);
                  setMessage(`AI stacked ${aiCard.rank}! You must draw ${newTotal}, stack, or play K/J to pass it on.`);
                  setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
                }
                if (aiCard.rank === 'A') {
                  // Ace cancels
                  const bestSuit = aiChooseSuit(aiHand2);
                  setChosenSuit(bestSuit);
                  setPendingPenalty(0);
                  setMessage(`AI blocked with Ace → ${SUIT_EMOJI[bestSuit]}. Your turn!`);
                  if (aiHand2.length === 0) { setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 })); setMessage('💀 AI wins!'); }
                  setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
                }
                // K or J: skip player AND pass the penalty on to them
                setMessage(`AI played ${aiCard.rank} — you're skipped and must draw ${currentPendingPenalty}!`);
                // pendingPenalty stays — player must deal with it
                if (aiHand2.length === 0) { setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 })); setMessage('💀 AI wins!'); }
                setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
              }
            }
            // No playable response (or forceDraw) — must draw
            const { newHand, newDeck: d2, newPile: p2 } = drawCards(currentPendingPenalty, aiHand2, nd2, np2);
            aiHand2 = newHand; nd2 = d2; np2 = p2;
            setPendingPenalty(0);
            setMessage(`AI drew ${currentPendingPenalty} cards. Your turn!`);
            setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
          }

          // AI must answer a question
          if (currentQuestionActive) {
            const matchQ = aiHand2.find(c => c.rank === topCard.rank);
            if (!matchQ) {
              const { newHand, newDeck: d2, newPile: p2 } = drawCards(1, aiHand2, nd2, np2);
              aiHand2 = newHand; nd2 = d2; np2 = p2;
              setQuestionActive(false);
              setMessage("AI couldn't answer — drew 1. Your turn!");
              setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
            }
            aiHand2 = aiHand2.filter(c => c.id !== matchQ.id);
            np2 = [...np2, matchQ];
            if (aiHand2.length === 0) {
              setPile(np2); setDeck(nd2);
              setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 }));
              setMessage('💀 AI wins!'); return aiHand2;
            }
            setQuestionActive(isQuestion(matchQ.rank));
            setMessage(isQuestion(matchQ.rank)
              ? `AI answered with ${matchQ.rank}! You must match or draw.`
              : 'AI answered the question. Your turn!');
            setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
          }

          // Normal turn
          const aiCard = aiChooseCard(aiHand2, topCard, currentChosenSuit, false, 0, diff);
          if (!aiCard) {
            const { newHand, newDeck: d2, newPile: p2 } = drawCards(1, aiHand2, nd2, np2);
            aiHand2 = newHand; nd2 = d2; np2 = p2;
            setMessage('AI drew a card. Your turn!');
            setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
          }

          aiHand2 = aiHand2.filter(c => c.id !== aiCard.id);
          np2 = [...np2, aiCard];

          if (aiHand2.length === 0) {
            setPile(np2); setDeck(nd2);
            setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 }));
            setMessage('💀 AI played its last card! You lose!'); return aiHand2;
          }

          if (aiCard.rank === 'A') {
            const bestSuit = aiChooseSuit(aiHand2);
            setChosenSuit(bestSuit); setMessage(`AI played Ace → ${SUIT_EMOJI[bestSuit]}. Your turn!`);
            setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
          }
          setChosenSuit(null);

          if (isPenalty(aiCard.rank)) {
            const total = penaltyCount(aiCard.rank);
            setPendingPenalty(total);
            setMessage(`AI played ${aiCard.rank}! Draw ${total}, stack another, or play K/J to skip + pass it back.`);
            setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
          }
          if (isQuestion(aiCard.rank)) {
            setQuestionActive(true);
            setMessage(`AI played ${aiCard.rank}${aiCard.suit !== 'joker' ? ' ' + SUIT_EMOJI[aiCard.suit] : ''}! Match it or draw!`);
            setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
          }
          if (aiCard.rank === 'J' || aiCard.rank === 'K') {
            setMessage(`AI played ${aiCard.rank} — you're skipped! AI goes again…`);
            setPile(np2); setDeck(nd2);
            runAiTurnRef.current({ ah: aiHand2, nd: nd2, np: np2, currentPendingPenalty: 0, currentQuestionActive: false, currentChosenSuit: null });
            return aiHand2;
          }
          setMessage(`AI played ${aiCard.rank}${aiCard.suit !== 'joker' ? ' ' + SUIT_EMOJI[aiCard.suit] : ''}. Your turn!`);
          setPile(np2); setDeck(nd2); setPlayerTurn(true); return aiHand2;
        });
      }, 900);
    };
  }, [drawCards]);

  const handlePlayerPlay = useCallback((card: Card) => {
    if (!playerTurn || status !== 'playing' || choosingSuit) return;
    const topCard = pile[pile.length - 1];

    if (!canPlay(card, topCard, chosenSuit, questionActive, pendingPenalty)) {
      setMessage("Can't play that card!"); return;
    }

    const newPlayerHand = playerHand.filter(c => c.id !== card.id);
    const newPile = [...pile, card];

    // Ace — choose suit (also blocks penalty)
    if (card.rank === 'A') {
      setPile(newPile); setPlayerHand(newPlayerHand);
      setPendingPenalty(0); setQuestionActive(false);
      if (newPlayerHand.length === 0) { setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 })); return; }
      setChoosingSuit(true); setMessage('Choose a suit!'); return;
    }

    // K or J against pending penalty — skips AI AND forces them to draw (no stacking/blocking)
    if ((card.rank === 'K' || card.rank === 'J') && pendingPenalty > 0) {
      setPile(newPile); setPlayerHand(newPlayerHand);
      setQuestionActive(false); setChosenSuit(null);
      setPlayerTurn(false);
      if (newPlayerHand.length === 0) { setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 })); return; }
      setMessage(`${card.rank} played! AI is skipped and must draw ${pendingPenalty}!`);
      runAiTurnRef.current({ ah: [...aiHand], nd: [...deck], np: newPile, currentPendingPenalty: pendingPenalty, currentQuestionActive: false, currentChosenSuit: null, forceDraw: true });
      return;
    }

    setPlayerHand(newPlayerHand);
    setPile(newPile);
    setChosenSuit(null);
    setPlayerTurn(false);

    if (newPlayerHand.length === 0) {
      setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 }));
      setMessage('🎉 Kadi! You win!'); return;
    }

    // Penalty card — stack onto existing penalty
    if (isPenalty(card.rank)) {
      const total = pendingPenalty + penaltyCount(card.rank);
      setPendingPenalty(total); setQuestionActive(false);
      setMessage(`Penalty stacked! AI must draw ${total}, stack, or block.`);
      runAiTurnRef.current({ ah: [...aiHand], nd: [...deck], np: newPile, currentPendingPenalty: total, currentQuestionActive: false, currentChosenSuit: null });
      return;
    }

    if (isQuestion(card.rank)) {
      setPendingPenalty(0); setQuestionActive(true);
      setMessage(`Question! AI must match ${card.rank} or draw.`);
      runAiTurnRef.current({ ah: [...aiHand], nd: [...deck], np: newPile, currentPendingPenalty: 0, currentQuestionActive: true, currentChosenSuit: null });
      return;
    }

    // K or J normal play — just skip AI, player goes again
    if (card.rank === 'K' || card.rank === 'J') {
      setPendingPenalty(0); setQuestionActive(false);
      setMessage(`AI skipped! Your turn again.`);
      setPlayerTurn(true); return;
    }

    setPendingPenalty(0); setQuestionActive(false);
    setMessage("AI's turn…");
    runAiTurnRef.current({ ah: [...aiHand], nd: [...deck], np: newPile, currentPendingPenalty: 0, currentQuestionActive: false, currentChosenSuit: null });
  }, [playerTurn, status, choosingSuit, pile, chosenSuit, questionActive, pendingPenalty, playerHand, aiHand, deck]);

  const handleSuitChoice = useCallback((suit: Suit) => {
    setChosenSuit(suit); setChoosingSuit(false);
    setPendingPenalty(0); setQuestionActive(false);
    setMessage(`Suit → ${SUIT_EMOJI[suit]} ${suit}. AI's turn…`);
    setPlayerTurn(false);
    runAiTurnRef.current({ ah: [...aiHand], nd: [...deck], np: [...pile], currentPendingPenalty: 0, currentQuestionActive: false, currentChosenSuit: suit });
  }, [aiHand, deck, pile]);

  const handlePlayerDraw = useCallback(() => {
    if (!playerTurn || status !== 'playing' || choosingSuit) return;
    const drawCount = pendingPenalty > 0 ? pendingPenalty : 1;
    const { newHand, newDeck: nd, newPile: np } = drawCards(drawCount, playerHand, deck, pile);
    setPlayerHand(newHand); setDeck(nd); setPile(np);
    setPendingPenalty(0); setQuestionActive(false); setPlayerTurn(false);
    setMessage(`You drew ${drawCount}. AI's turn…`);
    runAiTurnRef.current({ ah: [...aiHand], nd, np, currentPendingPenalty: 0, currentQuestionActive: false, currentChosenSuit: chosenSuit });
  }, [playerTurn, status, choosingSuit, pendingPenalty, playerHand, deck, pile, drawCards, aiHand, chosenSuit]);

  const isCardPlayable = (c: Card) => {
    if (!playerTurn || status !== 'playing' || choosingSuit) return false;
    return canPlay(c, pile[pile.length - 1], chosenSuit, questionActive, pendingPenalty);
  };

  const cardLabel = (c: Card) => c.rank === 'JOKER' ? '🃏' : `${c.rank}${SUIT_EMOJI[c.suit]}`;

  if (loading) return <div className={styles.loading}><div className={styles.dot} /></div>;

  const topCard = pile[pile.length - 1];

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => router.push('/games')}>← arcade</button>
        <div className={styles.scoreboard}>
          <span className={styles.scoreWin}>W {scores.wins}</span>
          <span className={styles.scoreLoss}>L {scores.losses}</span>
        </div>
      </div>

      <h1 className={styles.title}>Kadi</h1>

      {status === 'idle' && (
        <div className={styles.setup}>
          <p className={styles.setupLabel}>choose difficulty</p>
          <div className={styles.diffRow}>
            {(['easy','medium','hard'] as Difficulty[]).map(d => (
              <button key={d}
                className={`${styles.diffBtn} ${difficulty === d ? styles.diffBtnActive : ''}`}
                onClick={() => setDifficulty(d)}
              >{d}</button>
            ))}
          </div>
          <button className={styles.startBtn} onClick={startGame}>deal cards</button>
          <div className={styles.rulesBox}>
            <p className={styles.rulesTitle}>Quick rules</p>
            <p>Match suit or rank · K/J = skip opponent (+ force them to draw if penalty active) · A = wild/cancel penalty · Q/8 = question · 2 = draw 2 · 3 = draw 3 · Joker = draw 5 · Penalties stack! · Shout Kadi on second-to-last card</p>
          </div>
        </div>
      )}

      {status !== 'idle' && (
        <>
          <div className={`${styles.messageBar} ${questionActive ? styles.messageQuestion : pendingPenalty > 0 ? styles.messagePenalty : ''}`}>
            <span>{message}</span>
            {playerHand.length === 2 && playerTurn && !kadiCalled && (
              <button className={styles.kadiBtn} onClick={() => setKadiCalled(true)}>Kadi! 🎴</button>
            )}
            {kadiCalled && <span className={styles.kadiTag}>Kadi called!</span>}
          </div>

          <div className={styles.aiArea}>
            <span className={styles.handLabel}>AI — {aiHand.length} cards</span>
            <div className={styles.aiCards}>
              {aiHand.map((_, i) => <div key={i} className={styles.cardBack} />)}
            </div>
          </div>

          <div className={styles.tableArea}>
            <button className={styles.deckBtn} onClick={handlePlayerDraw}
              disabled={!playerTurn || status !== 'playing' || choosingSuit}
              aria-label={`Draw ${pendingPenalty > 0 ? pendingPenalty : 1} card${pendingPenalty > 1 ? 's' : ''}`}>
              <span className={styles.deckCount}>{deck.length}</span>
              <span className={styles.deckLabel}>draw</span>
            </button>
            {topCard && (
              <div className={`${styles.topCard} ${topCard.color === 'red' ? styles.topCardRed : styles.topCardBlack}`}>
                {cardLabel(topCard)}
                {chosenSuit && <div className={styles.chosenSuit}>→ {SUIT_EMOJI[chosenSuit]}</div>}
                {questionActive && <div className={styles.questionBadge}>❓</div>}
              </div>
            )}
            {pendingPenalty > 0 && <div className={styles.penaltyChip}>+{pendingPenalty}</div>}
          </div>

          {choosingSuit && (
            <div className={styles.suitPicker}>
              <p className={styles.setupLabel}>choose a suit</p>
              <div className={styles.suitRow}>
                {SUITS.map(suit => (
                  <button key={suit}
                    className={`${styles.suitBtn} ${SUIT_COLOR[suit] === 'red' ? styles.suitBtnRed : styles.suitBtnBlack}`}
                    onClick={() => handleSuitChoice(suit)}>
                    {SUIT_EMOJI[suit]} {suit}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.playerArea}>
            <span className={styles.handLabel}>Your hand — {playerHand.length} cards</span>
            <div className={styles.playerCards}>
              {playerHand.map(card => (
                <button key={card.id}
                  className={`${styles.card} ${card.color === 'red' ? styles.cardRed : styles.cardBlack} ${isCardPlayable(card) ? styles.cardPlayable : styles.cardDim}`}
                  onClick={() => handlePlayerPlay(card)}
                  disabled={!isCardPlayable(card) || status !== 'playing'}
                  aria-label={`Play ${card.rank}${card.suit !== 'joker' ? ' of ' + card.suit : ''}`}>
                  {cardLabel(card)}
                </button>
              ))}
            </div>
          </div>

          {(status === 'won' || status === 'lost') && (
            <div className={styles.actions}>
              <div className={status === 'won' ? styles.wonText : styles.lostText}>
                {status === 'won' ? '🎉 You win!' : '💀 You lose!'}
              </div>
              <button className={styles.startBtn} onClick={startGame}>play again</button>
              <button className={styles.diffChange} onClick={() => setStatus('idle')}>change difficulty</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}