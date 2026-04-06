'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import styles from './sudoku.module.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'idle' | 'playing' | 'won';

// How many cells to REVEAL (leave visible) per difficulty
const REVEAL_COUNT: Record<Difficulty, number> = {
  easy: 45,
  medium: 32,
  hard: 22,
};

// --- Puzzle generation ---
function generateSolvedGrid(): number[][] {
  const grid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  function isValid(g: number[][], row: number, col: number, num: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (g[row][i] === num) return false;
      if (g[i][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++)
        if (g[r][c] === num) return false;
    return true;
  }

  function solve(g: number[][]): boolean {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (g[row][col] === 0) {
          const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
          for (const n of nums) {
            if (isValid(g, row, col, n)) {
              g[row][col] = n;
              if (solve(g)) return true;
              g[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  solve(grid);
  return grid;
}

function makePuzzle(solved: number[][], difficulty: Difficulty): number[][] {
  const puzzle = solved.map(r => [...r]);
  const positions = Array.from({ length: 81 }, (_, i) => i)
    .sort(() => Math.random() - 0.5);
  const toHide = 81 - REVEAL_COUNT[difficulty];
  for (let i = 0; i < toHide; i++) {
    const pos = positions[i];
    puzzle[Math.floor(pos / 9)][pos % 9] = 0;
  }
  return puzzle;
}

export default function SudokuPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [status, setStatus] = useState<GameStatus>('idle');

  const [solved, setSolved] = useState<number[][]>([]);
  const [puzzle, setPuzzle] = useState<number[][]>([]);   // original (fixed cells)
  const [board, setBoard] = useState<number[][]>([]);     // player's current state
  const [selected, setSelected] = useState<[number,number] | null>(null);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function init() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback(() => {
    const s = generateSolvedGrid();
    const p = makePuzzle(s, difficulty);
    setSolved(s);
    setPuzzle(p);
    setBoard(p.map(r => [...r]));
    setSelected(null);
    setErrors(new Set());
    setStatus('playing');
  }, [difficulty]);

  const handleCellClick = (row: number, col: number) => {
    if (puzzle[row]?.[col] !== 0) return; // fixed cell
    setSelected([row, col]);
  };

  const handleNumber = useCallback((num: number) => {
    if (!selected || status !== 'playing') return;
    const [row, col] = selected;
    if (puzzle[row][col] !== 0) return;

    const next = board.map(r => [...r]);
    next[row][col] = num;
    setBoard(next);

    // Mark errors
    const newErrors = new Set<string>();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (next[r][c] !== 0 && next[r][c] !== solved[r][c]) {
          newErrors.add(`${r}-${c}`);
        }
      }
    }
    setErrors(newErrors);

    // Check win
    if (next.every((row, r) => row.every((v, c) => v === solved[r][c]))) {
      setStatus('won');
    }
  }, [selected, board, puzzle, solved, status]);

  // Keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9) handleNumber(n);
      if (e.key === 'Backspace' || e.key === '0') handleNumber(0);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNumber]);

  if (loading) return <div className={styles.loading}><div className={styles.dot} /></div>;

  const isFixed = (r: number, c: number) => puzzle[r]?.[c] !== 0;
  const isSelected = (r: number, c: number) => selected?.[0] === r && selected?.[1] === c;
  const isSameNum = (r: number, c: number) => {
    if (!selected) return false;
    const selVal = board[selected[0]]?.[selected[1]];
    return selVal && selVal !== 0 && board[r]?.[c] === selVal;
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => router.push('/games')}>← arcade</button>
        {status === 'playing' && (
          <button className={styles.restartBtn} onClick={startGame}>restart</button>
        )}
      </div>

      <h1 className={styles.title}>Sudoku</h1>

      {status === 'idle' && (
        <div className={styles.setup}>
          <p className={styles.setupLabel}>choose difficulty</p>
          <div className={styles.diffRow}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                className={styles.diffBtn}
                style={difficulty === d ? { borderColor: '#a855f7', color: '#a855f7' } : {}}
                onClick={() => setDifficulty(d)}
              >
                {d}
                <span className={styles.diffHint}>
                  {d === 'easy' ? '45 given' : d === 'medium' ? '32 given' : '22 given'}
                </span>
              </button>
            ))}
          </div>
          <button className={styles.startBtn} onClick={startGame}>start game</button>
        </div>
      )}

      {status === 'won' && (
        <div className={styles.wonBanner}>
          🎉 puzzle solved!
          <button className={styles.startBtn} onClick={() => setStatus('idle')} style={{ marginTop: '1rem' }}>
            play again
          </button>
        </div>
      )}

      {(status === 'playing' || status === 'won') && board.length > 0 && (
        <>
          <div className={styles.grid}>
            {Array.from({ length: 9 }, (_, r) =>
              Array.from({ length: 9 }, (_, c) => {
                const val = board[r][c];
                const fixed = isFixed(r, c);
                const sel = isSelected(r, c);
                const sameNum = isSameNum(r, c);
                const err = errors.has(`${r}-${c}`);
                const boxShade = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0;

                return (
                  <button
                    key={`${r}-${c}`}
                    className={styles.cell}
                    style={{
                      background: sel ? 'rgba(168,85,247,0.2)' : sameNum ? 'rgba(168,85,247,0.08)' : boxShade ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderRight: (c === 2 || c === 5) ? '2px solid #4a3060' : undefined,
                      borderBottom: (r === 2 || r === 5) ? '2px solid #4a3060' : undefined,
                      color: err ? '#f87171' : fixed ? '#f5e6d0' : '#a855f7',
                      fontWeight: fixed ? 'bold' : 'normal',
                      cursor: fixed ? 'default' : 'pointer',
                    }}
                    onClick={() => handleCellClick(r, c)}
                    disabled={status === 'won'}
                  >
                    {val !== 0 ? val : ''}
                  </button>
                );
              })
            )}
          </div>

          {status === 'playing' && (
            <div className={styles.numPad}>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button
                  key={n}
                  className={styles.numBtn}
                  onClick={() => handleNumber(n)}
                >
                  {n}
                </button>
              ))}
              <button className={styles.numBtn} style={{ color: '#8a6f5a' }} onClick={() => handleNumber(0)}>⌫</button>
            </div>
          )}

          <p className={styles.hint}>
            {status === 'playing'
              ? errors.size > 0
                ? `${errors.size} error${errors.size > 1 ? 's' : ''} — cells in red don't match the solution`
                : 'click a cell then tap a number (or use your keyboard)'
              : ''}
          </p>
        </>
      )}
    </div>
  );
}