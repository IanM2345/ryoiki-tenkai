'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import styles from './tic-tac-toe.module.css';

// 4 levels: easy / medium / hard / impossible
type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';
type Cell = 'X' | 'O' | null;
type GameStatus = 'idle' | 'playing' | 'won' | 'lost' | 'draw';

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(board: Cell[]): { winner: Cell; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

function randomMove(board: Cell[]): number {
  const empty = board.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
  return empty[Math.floor(Math.random() * empty.length)];
}

function blockingMove(board: Cell[]): number {
  for (const player of ['O', 'X'] as Cell[]) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      const empties = line.filter(i => board[i] === null);
      const filled  = [board[a], board[b], board[c]].filter(v => v === player);
      if (filled.length === 2 && empties.length === 1) return empties[0];
    }
  }
  if (board[4] === null) return 4;
  return randomMove(board);
}

// Hard: occasionally makes a suboptimal move (70% minimax, 30% blocking only)
function hardMove(board: Cell[]): number {
  if (Math.random() < 0.3) return blockingMove(board);
  return bestMove(board);
}

function minimax(board: Cell[], isMaximising: boolean, depth: number): number {
  const result = checkWinner(board);
  if (result?.winner === 'O') return 10 - depth;
  if (result?.winner === 'X') return depth - 10;
  if (board.every(c => c !== null)) return 0;

  const empty = board.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
  if (isMaximising) {
    let best = -Infinity;
    for (const i of empty) {
      const next = [...board] as Cell[];
      next[i] = 'O';
      best = Math.max(best, minimax(next, false, depth + 1));
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of empty) {
      const next = [...board] as Cell[];
      next[i] = 'X';
      best = Math.min(best, minimax(next, true, depth + 1));
    }
    return best;
  }
}

function bestMove(board: Cell[]): number {
  const empty = board.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
  let best = -Infinity;
  let move = empty[0];
  for (const i of empty) {
    const next = [...board] as Cell[];
    next[i] = 'O';
    const score = minimax(next, false, 0);
    if (score > best) { best = score; move = i; }
  }
  return move;
}

function getAiMove(board: Cell[], difficulty: Difficulty): number {
  if (difficulty === 'easy')       return randomMove(board);
  if (difficulty === 'medium')     return blockingMove(board);
  if (difficulty === 'hard')       return hardMove(board);
  return bestMove(board); // impossible — pure minimax, unbeatable
}

const DIFF_HINTS: Record<Difficulty, string> = {
  easy:       'random moves',
  medium:     'blocks your wins',
  hard:       'mostly minimax',
  impossible: 'pure minimax — unbeatable',
};

export default function TicTacToePage() {
  const router = useRouter();
  const [loading, setLoading]     = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [board, setBoard]         = useState<Cell[]>(Array(9).fill(null));
  const [status, setStatus]       = useState<GameStatus>('idle');
  const [winLine, setWinLine]     = useState<number[] | null>(null);
  const [scores, setScores]       = useState({ wins: 0, losses: 0, draws: 0 });
  const aiTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    setBoard(Array(9).fill(null));
    setStatus('playing');
    setWinLine(null);
  }, []);

  const handleClick = useCallback((idx: number) => {
  if (status !== 'playing') return;

  setBoard(prev => {
    if (prev[idx] !== null) return prev;
    const next = [...prev] as Cell[];
    next[idx] = 'X';

    const result = checkWinner(next);
    if (result) {
      setWinLine(result.line);
      setStatus('won');
      setScores(s => ({ ...s, wins: s.wins + 1 }));
      return next;
    }
    if (next.every(c => c !== null)) {
      setStatus('draw');
      setScores(s => ({ ...s, draws: s.draws + 1 }));
      return next;
    }

    // Schedule AI move using `next` directly — no second setBoard updater
    aiTimeout.current = setTimeout(() => {
      const aiNext = [...next] as Cell[];   // ← use `next`, not a fresh `curr`
      const move = getAiMove(aiNext, difficulty);
      aiNext[move] = 'O';

      const aiResult = checkWinner(aiNext);
      if (aiResult) {
        setWinLine(aiResult.line);
        setStatus('lost');
        setScores(s => ({ ...s, losses: s.losses + 1 }));
      } else if (aiNext.every(c => c !== null)) {
        setStatus('draw');
        setScores(s => ({ ...s, draws: s.draws + 1 }));
      }
      setBoard(aiNext);   // ← single, flat setBoard call
    }, 350);

    return next;
  });
}, [status, difficulty]);

  if (loading) return <div className={styles.loading}><div className={styles.dot} /></div>;

  const isOver = status === 'won' || status === 'lost' || status === 'draw';

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => router.push('/games')}>← arcade</button>
        <div className={styles.scoreboard}>
          <span className={styles.scoreWin}>W {scores.wins}</span>
          <span className={styles.scoreLoss}>L {scores.losses}</span>
          <span className={styles.scoreDraw}>D {scores.draws}</span>
        </div>
      </div>

      <h1 className={styles.title}>Tic Tac Toe</h1>

      {status === 'idle' && (
        <div className={styles.setup}>
          <p className={styles.setupLabel}>choose difficulty</p>
          <div className={styles.diffRow}>
            {(['easy','medium','hard','impossible'] as Difficulty[]).map(d => (
              <button key={d}
                className={`${styles.diffBtn} ${difficulty === d ? styles.diffBtnActive : ''}`}
                onClick={() => setDifficulty(d)}>
                {d}
                <span className={styles.diffHint}>{DIFF_HINTS[d]}</span>
              </button>
            ))}
          </div>
          <button className={styles.startBtn} onClick={startGame}>start game</button>
        </div>
      )}

      {status !== 'idle' && (
        <>
          <div className={styles.statusBar}>
            {status === 'playing' && <span className={styles.statusText}>your turn — you are <strong>X</strong></span>}
            {status === 'won'     && <span className={styles.statusWon}>🎉 you won!</span>}
            {status === 'lost'    && <span className={styles.statusLost}>💀 you lost</span>}
            {status === 'draw'    && <span className={styles.statusDraw}>🤝 draw</span>}
          </div>

          <div className={styles.board}>
            {board.map((cell, i) => {
              const isWin = winLine?.includes(i);
              return (
                <button
                  key={i}
                  className={`${styles.cell}
                    ${cell === 'X' ? styles.cellX : cell === 'O' ? styles.cellO : ''}
                    ${isWin ? styles.cellWin : ''}
                    ${cell !== null || isOver ? styles.cellDone : ''}`}
                  onClick={() => handleClick(i)}
                  disabled={cell !== null || isOver}
                  aria-label={`Cell ${i + 1}${cell ? ` — ${cell}` : ''}`}
                >
                  {cell}
                </button>
              );
            })}
          </div>

          {isOver && (
            <div className={styles.actions}>
              <button className={styles.startBtn} onClick={startGame}>play again</button>
              <button className={styles.diffChange} onClick={() => setStatus('idle')}>change difficulty</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}