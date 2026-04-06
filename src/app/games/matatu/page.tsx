'use client';

/**
 * MATATU — Updated rules:
 * - 8 = skip AND blocks penalty (if a 2/3/Joker was played, playing an 8 cancels it)
 * - J = skip (same as 8 in 2-player)
 * - A = choose suit / block penalty
 * - Draw cards do NOT stack (unlike Kadi)
 * - 7 = cut game on last card
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import styles from './matatu.module.css';

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
  deck.push({ suit: 'joker', rank: 'JOKER', color: 'red',   id: `joker-red-${id++}` });
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

function isPenaltyCard(rank: Rank): boolean { return rank === '2' || rank === '3' || rank === 'JOKER'; }
function penaltyDrawCount(rank: Rank): number {
  return rank === '2' ? 2 : rank === '3' ? 3 : rank === 'JOKER' ? 5 : 0;
}

function canPlay(card: Card, topCard: Card, chosenSuit: Suit | null, pendingPenalty: number): boolean {
  if (pendingPenalty > 0) {
    if (card.rank === 'A') return true;
    if (card.rank === '8' || card.rank === 'J') return true;
    if (isPenaltyCard(card.rank)) {
      if (topCard.rank === 'JOKER') return card.color === topCard.color;
      return isPenaltyCard(card.rank);
    }
    return false;
  }
  if (card.rank === 'A') return true;
  if (card.rank === 'JOKER') return true;
  const effectiveSuit = chosenSuit ?? topCard.suit;
  return card.suit === effectiveSuit || card.rank === topCard.rank;
}

function aiChooseCard(hand: Card[], topCard: Card, chosenSuit: Suit | null, pendingPenalty: number, difficulty: Difficulty): Card | null {
  const playable = hand.filter(c => canPlay(c, topCard, chosenSuit, pendingPenalty));
  if (playable.length === 0) return null;
  if (difficulty === 'easy') return playable[Math.floor(Math.random() * playable.length)];

  const penalties = playable.filter(c => isPenaltyCard(c.rank));
  const blockers  = playable.filter(c => c.rank === '8' || c.rank === 'J' || c.rank === 'A');
  const normals   = playable.filter(c => !isPenaltyCard(c.rank) && c.rank !== '8' && c.rank !== 'J' && c.rank !== 'A' && c.rank !== '7');

  if (difficulty === 'hard') {
    if (pendingPenalty > 0) {
      const skipBlock = playable.find(c => c.rank === '8' || c.rank === 'J');
      if (skipBlock) return skipBlock;
      const ace = playable.find(c => c.rank === 'A');
      if (ace) return ace;
    }
    if (penalties.length > 0) return penalties[0];
    const cut7 = playable.find(c => c.rank === '7');
    if (cut7 && hand.length <= 2) return cut7;
    const skip = playable.find(c => c.rank === '8' || c.rank === 'J');
    if (skip) return skip;
    if (normals.length > 0) return normals[0];
    return blockers[0] ?? playable[0];
  }

  // Medium
  if (pendingPenalty > 0 && blockers.length > 0) return blockers[Math.floor(Math.random() * blockers.length)];
  if (normals.length > 0) return normals[Math.floor(Math.random() * normals.length)];
  return playable[Math.floor(Math.random() * playable.length)];
}

function aiChooseSuit(hand: Card[]): Suit {
  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const c of hand) { if (c.suit !== 'joker') counts[c.suit as Suit]++; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Suit;
}

export default function MatatuPage() {
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
  const [message, setMessage] = useState('');
  const [scores, setScores] = useState({ wins: 0, losses: 0 });

  const aiTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const runAiTurnRef = useRef<(ah: Card[], nd: Card[], np: Card[], penalty: number, suit: Suit | null, forceDraw?: boolean) => void>(() => { /* filled below */ });

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
    const pHand = d.splice(0, 7);
    const aHand = d.splice(0, 7);
    let startIdx = d.findIndex(c => !['JOKER','7','A'].includes(c.rank));
    if (startIdx === -1) startIdx = 0;
    const [firstCard] = d.splice(startIdx, 1);
    setDeck(d); setPile([firstCard]); setPlayerHand(pHand); setAiHand(aHand);
    setPlayerTurn(true); setChosenSuit(null); setChoosingSuit(false);
    setPendingPenalty(0); setStatus('playing'); setMessage('Your turn!');
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
    runAiTurnRef.current = (
      prevAiHand: Card[], newDeck: Card[], newPile: Card[],
      newPendingPenalty: number, currentChosenSuit: Suit | null,
      forceDraw = false
    ) => {
      aiTimeout.current = setTimeout(() => {
        setAiHand(() => {
          let ah = [...prevAiHand];
          let nd = [...newDeck];
          let np = [...newPile];
          const diff = difficultyRef.current;

          // AI deals with penalty
          if (newPendingPenalty > 0) {
            const topCard = np[np.length - 1];
            if (!forceDraw) {
              const block = aiChooseCard(ah, topCard, currentChosenSuit, newPendingPenalty, diff);
              if (block) {
                ah = ah.filter(c => c.id !== block.id);
                np = [...np, block];
                if (ah.length === 0) {
                  setPile(np); setDeck(nd);
                  setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 }));
                  setMessage('💀 AI wins!'); return ah;
                }
                if (block.rank === 'A') {
                  const bestSuit = aiChooseSuit(ah);
                  setChosenSuit(bestSuit); setPendingPenalty(0);
                  setMessage(`AI blocked with Ace → ${SUIT_EMOJI[bestSuit]}. Your turn!`);
                  setPile(np); setDeck(nd); setPlayerTurn(true); return ah;
                }
                setMessage(`AI played ${block.rank} — you're skipped and must draw ${newPendingPenalty}!`);
                setPile(np); setDeck(nd); setPlayerTurn(true); return ah;
              }
            }
            // No response or forceDraw — AI must draw
            const { newHand, newDeck: d2, newPile: p2 } = drawCards(newPendingPenalty, ah, nd, np);
            ah = newHand; nd = d2; np = p2;
            setPile(np); setDeck(nd); setPendingPenalty(0);
            setMessage(`AI drew ${newPendingPenalty} cards. Your turn!`);
            setPlayerTurn(true); return ah;
          }

          // Normal AI play
          const topCard2 = np[np.length - 1];
          const aiCard = aiChooseCard(ah, topCard2, currentChosenSuit, 0, diff);
          if (!aiCard) {
            const { newHand, newDeck: d2, newPile: p2 } = drawCards(1, ah, nd, np);
            ah = newHand; nd = d2; np = p2;
            setMessage('AI drew a card. Your turn!');
            setPile(np); setDeck(nd); setPlayerTurn(true); return ah;
          }

          ah = ah.filter(c => c.id !== aiCard.id);
          np = [...np, aiCard];

          if (ah.length === 0) {
            setPile(np); setDeck(nd);
            setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 }));
            setMessage('💀 AI played its last card. You lose!'); return ah;
          }

          if (aiCard.rank === 'A') {
            const bestSuit = aiChooseSuit(ah);
            setChosenSuit(bestSuit);
            setPile(np); setDeck(nd);
            setMessage(`AI played Ace → ${SUIT_EMOJI[bestSuit]}. Your turn!`);
            setPlayerTurn(true); return ah;
          }
          setChosenSuit(null);

          if (isPenaltyCard(aiCard.rank)) {
            const drawCount = penaltyDrawCount(aiCard.rank);
            setPendingPenalty(drawCount);
            setPile(np); setDeck(nd);
            setMessage(`AI played ${aiCard.rank}! Draw ${drawCount}, play 8/J to pass it on, or A to cancel.`);
            setPlayerTurn(true); return ah;
          }

          if (aiCard.rank === '8' || aiCard.rank === 'J') {
            setPile(np); setDeck(nd);
            setMessage(`AI played ${aiCard.rank} — skips you! AI plays again…`);
            runAiTurnRef.current(ah, nd, np, 0, null);
            return ah;
          }

          if (aiCard.rank === '7' && ah.length === 1) {
            setPile(np); setDeck(nd);
            setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 }));
            setMessage('💀 AI cut the game! You lose!'); return ah;
          }

          setPile(np); setDeck(nd);
          setMessage(`AI played ${aiCard.rank}${aiCard.suit !== 'joker' ? ' ' + SUIT_EMOJI[aiCard.suit] : ''}. Your turn!`);
          setPlayerTurn(true); return ah;
        });
      }, 900);
    };
  }, [drawCards]);

  const handlePlayerPlay = useCallback((card: Card) => {
    if (!playerTurn || status !== 'playing' || choosingSuit) return;
    const topCard = pile[pile.length - 1];

    if (!canPlay(card, topCard, chosenSuit, pendingPenalty)) {
      setMessage("Can't play that card here!"); return;
    }

    const newPlayerHand = playerHand.filter(c => c.id !== card.id);
    const newPile = [...pile, card];

    // Ace — choose suit, blocks penalty
    if (card.rank === 'A') {
      setPile(newPile); setPlayerHand(newPlayerHand); setPendingPenalty(0);
      if (newPlayerHand.length === 0) { setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 })); return; }
      setChoosingSuit(true); setMessage('Choose a suit!'); return;
    }

    // 8 or J against pending penalty — skips AI and forces them to draw (no blocking)
    if ((card.rank === '8' || card.rank === 'J') && pendingPenalty > 0) {
      setPlayerHand(newPlayerHand); setPile(newPile);
      setChosenSuit(null); setPlayerTurn(false);
      if (newPlayerHand.length === 0) { setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 })); return; }
      setMessage(`${card.rank} played! AI is skipped and must draw ${pendingPenalty}!`);
      runAiTurnRef.current([...aiHand], [...deck], newPile, pendingPenalty, null, true);
      return;
    }

    setPlayerHand(newPlayerHand); setPile(newPile);
    setChosenSuit(null); setPlayerTurn(false);

    if (newPlayerHand.length === 0) {
      setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 }));
      setMessage('🎉 You cut the game!'); return;
    }

    if (isPenaltyCard(card.rank)) {
      const count = penaltyDrawCount(card.rank);
      setPendingPenalty(count);
      setMessage(`AI must draw ${count} or block with 8/J/A!`);
      runAiTurnRef.current([...aiHand], [...deck], newPile, count, null);
      return;
    }

    if (card.rank === '7') {
      if (newPlayerHand.length === 0) { setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 })); return; }
      setMessage("Cutting move! (save 7 for your last card)");
      runAiTurnRef.current([...aiHand], [...deck], newPile, 0, null);
      return;
    }

    // 8 or J normal (no pending penalty) — skip AI
    if (card.rank === '8' || card.rank === 'J') {
      setMessage('AI skipped! Your turn again.');
      setPlayerTurn(true); return;
    }

    setMessage("AI's turn…");
    runAiTurnRef.current([...aiHand], [...deck], newPile, 0, null);
  }, [playerTurn, status, choosingSuit, pile, chosenSuit, pendingPenalty, playerHand, aiHand, deck]);

  const handleSuitChoice = useCallback((suit: Suit) => {
    setChosenSuit(suit); setChoosingSuit(false); setPendingPenalty(0);
    setMessage(`Suit → ${SUIT_EMOJI[suit]} ${suit}. AI's turn…`);
    setPlayerTurn(false);
    runAiTurnRef.current([...aiHand], [...deck], [...pile], 0, suit);
  }, [aiHand, deck, pile]);

  const handlePlayerDraw = useCallback(() => {
    if (!playerTurn || status !== 'playing' || choosingSuit) return;
    const drawCount = pendingPenalty > 0 ? pendingPenalty : 1;
    const { newHand, newDeck: nd, newPile: np } = drawCards(drawCount, playerHand, deck, pile);
    setPlayerHand(newHand); setDeck(nd); setPile(np);
    setPendingPenalty(0); setPlayerTurn(false);
    setMessage(`You drew ${drawCount}. AI's turn…`);
    runAiTurnRef.current([...aiHand], nd, np, 0, chosenSuit);
  }, [playerTurn, status, choosingSuit, pendingPenalty, playerHand, deck, pile, drawCards, aiHand, chosenSuit]);

  const isPlayable = (c: Card) => {
    if (!playerTurn || status !== 'playing' || choosingSuit) return false;
    return canPlay(c, pile[pile.length - 1], chosenSuit, pendingPenalty);
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

      <h1 className={styles.title}>Matatu</h1>

      {status === 'idle' && (
        <div className={styles.setup}>
          <p className={styles.setupLabel}>choose difficulty</p>
          <div className={styles.diffRow}>
            {(['easy','medium','hard'] as Difficulty[]).map(d => (
              <button key={d}
                className={`${styles.diffBtn} ${difficulty === d ? styles.diffBtnActive : ''}`}
                onClick={() => setDifficulty(d)}>{d}</button>
            ))}
          </div>
          <button className={styles.startBtn} onClick={startGame}>deal cards</button>
          <div className={styles.rulesBox}>
            <p className={styles.rulesTitle}>Quick rules</p>
            <p>Match suit or rank · A = choose suit / cancel penalty · 8/J = skip + force opponent to draw · 2 = draw 2 · 3 = draw 3 · Joker = draw 5 · 7 = cut on last card · No stacking</p>
          </div>
        </div>
      )}

      {status !== 'idle' && (
        <>
          <div className={styles.messageBar}>{message}</div>

          <div className={styles.aiArea}>
            <span className={styles.handLabel}>AI — {aiHand.length} cards</span>
            <div className={styles.aiCards}>
              {aiHand.map((_, i) => <div key={i} className={styles.cardBack} />)}
            </div>
          </div>

          <div className={styles.tableArea}>
            <div className={styles.deckPile}>
              <button className={styles.deckBtn} onClick={handlePlayerDraw}
                disabled={!playerTurn || status !== 'playing' || choosingSuit}
                aria-label={`Draw ${pendingPenalty > 0 ? pendingPenalty : 1} card`}>
                <span className={styles.deckCount}>{deck.length}</span>
                <span className={styles.deckLabel}>draw</span>
              </button>
              {topCard && (
                <div className={`${styles.topCard} ${topCard.color === 'red' ? styles.topCardRed : styles.topCardBlack}`}>
                  {cardLabel(topCard)}
                  {chosenSuit && <div className={styles.chosenSuit}>→ {SUIT_EMOJI[chosenSuit]}</div>}
                </div>
              )}
            </div>
            {pendingPenalty > 0 && playerTurn && (
              <div className={styles.penaltyAlert}>⚠ Draw {pendingPenalty}, play 8/J to skip + pass it on, or A to cancel!</div>
            )}
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
                  className={`${styles.card} ${card.color === 'red' ? styles.cardRed : styles.cardBlack} ${isPlayable(card) ? styles.cardPlayable : styles.cardDim}`}
                  onClick={() => handlePlayerPlay(card)}
                  disabled={!isPlayable(card) || status !== 'playing'}
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