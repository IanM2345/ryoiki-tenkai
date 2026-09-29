'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleDot } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { ensureSession } from '@/lib/supabase';
import { recordResult } from '@/lib/games';
import s from './connect-four.module.css';

const COLS = 7, ROWS = 6;
type Cell = 'you' | 'ai' | null;
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES = [
  { key: 'easy',   label: 'Easy',   hint: 'Plays mostly at random' },
  { key: 'medium', label: 'Medium', hint: 'Looks a few moves ahead' },
  { key: 'hard',   label: 'Hard',   hint: 'Looks further and rarely slips' },
];
const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 4, hard: 6 };

const idx = (r: number, c: number) => r * COLS + c;
const emptyBoard = (): Cell[] => Array(COLS * ROWS).fill(null);

/** Columns that still have room. */
function openCols(b: Cell[]): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) if (!b[idx(0, c)]) out.push(c);
  return out;
}

/** Lowest empty row in a column, or -1 if full. */
function landingRow(b: Cell[], c: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!b[idx(r, c)]) return r;
  return -1;
}

const LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c + 3 < COLS) lines.push([idx(r, c), idx(r, c + 1), idx(r, c + 2), idx(r, c + 3)]);
    if (r + 3 < ROWS) lines.push([idx(r, c), idx(r + 1, c), idx(r + 2, c), idx(r + 3, c)]);
    if (r + 3 < ROWS && c + 3 < COLS) lines.push([idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2), idx(r + 3, c + 3)]);
    if (r + 3 < ROWS && c - 3 >= 0) lines.push([idx(r, c), idx(r + 1, c - 1), idx(r + 2, c - 2), idx(r + 3, c - 3)]);
  }
  return lines;
})();

function winningLine(b: Cell[], who: Cell): number[] | null {
  for (const ln of LINES) if (ln.every(i => b[i] === who)) return ln;
  return null;
}

/** Heuristic score from the computer's point of view. */
function scoreBoard(b: Cell[]): number {
  let score = 0;
  for (const ln of LINES) {
    let ai = 0, you = 0;
    for (const i of ln) { if (b[i] === 'ai') ai++; else if (b[i] === 'you') you++; }
    if (ai && you) continue;
    if (ai === 4) return 100000;
    if (you === 4) return -100000;
    if (ai) score += ai === 3 ? 100 : ai === 2 ? 10 : 1;
    if (you) score -= you === 3 ? 120 : you === 2 ? 10 : 1;
  }
  // Prefer the centre column
  for (let r = 0; r < ROWS; r++) if (b[idx(r, 3)] === 'ai') score += 3;
  return score;
}

function drop(b: Cell[], c: number, who: Cell): Cell[] {
  const r = landingRow(b, c);
  if (r < 0) return b;
  const nb = b.slice();
  nb[idx(r, c)] = who;
  return nb;
}

function minimax(b: Cell[], depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (winningLine(b, 'ai')) return 100000 + depth;
  if (winningLine(b, 'you')) return -100000 - depth;
  const moves = openCols(b);
  if (depth === 0 || moves.length === 0) return scoreBoard(b);
  // Search the middle columns first for better pruning
  moves.sort((a, c) => Math.abs(3 - a) - Math.abs(3 - c));
  if (maximizing) {
    let best = -Infinity;
    for (const c of moves) {
      best = Math.max(best, minimax(drop(b, c, 'ai'), depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const c of moves) {
    best = Math.min(best, minimax(drop(b, c, 'you'), depth - 1, alpha, beta, true));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function chooseMove(b: Cell[], difficulty: Difficulty): number {
  const moves = openCols(b);
  if (moves.length === 0) return -1;
  // Always take an immediate win, and always block an immediate loss
  for (const c of moves) if (winningLine(drop(b, c, 'ai'), 'ai')) return c;
  for (const c of moves) if (winningLine(drop(b, c, 'you'), 'you')) return c;
  if (difficulty === 'easy' && Math.random() < 0.5) return moves[Math.floor(Math.random() * moves.length)];
  let bestScore = -Infinity, best = moves[0];
  for (const c of moves) {
    const sc = minimax(drop(b, c, 'ai'), DEPTH[difficulty] - 1, -Infinity, Infinity, false);
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  return best;
}

type Status = 'playing' | 'won' | 'lost' | 'draw';

export default function ConnectFourPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [board, setBoard] = useState<Cell[]>(emptyBoard);
  const [status, setStatus] = useState<Status>('playing');
  const [win, setWin] = useState<number[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [drops, setDrops] = useState<Set<number>>(new Set());
  const [score, setScore] = useState({ won: 0, lost: 0, drawn: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { ensureSession().catch(() => {}); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const finish = useCallback((result: Status, line: number[] | null) => {
    setStatus(result); setWin(line); setThinking(false);
    setScore(s => ({
      won: s.won + (result === 'won' ? 1 : 0),
      lost: s.lost + (result === 'lost' ? 1 : 0),
      drawn: s.drawn + (result === 'draw' ? 1 : 0),
    }));
    if (result !== 'playing') {
      const r = result === 'won' ? 'win' : result === 'lost' ? 'loss' : 'draw';
      ensureSession().then(ok => { if (ok) recordResult('connect4', difficulty, r); }).catch(() => {});
    }
  }, [difficulty]);

  const newGame = useCallback(() => {
    clearTimeout(timer.current);
    setBoard(emptyBoard()); setStatus('playing'); setWin(null); setThinking(false); setDrops(new Set());
  }, []);

  const play = (col: number) => {
    if (status !== 'playing' || thinking) return;
    const r = landingRow(board, col);
    if (r < 0) return;
    const afterYou = drop(board, col, 'you');
    setBoard(afterYou);
    setDrops(new Set([idx(r, col)]));
    const youWin = winningLine(afterYou, 'you');
    if (youWin) { finish('won', youWin); return; }
    if (openCols(afterYou).length === 0) { finish('draw', null); return; }

    setThinking(true);
    timer.current = setTimeout(() => {
      const aiCol = chooseMove(afterYou, difficulty);
      const ar = landingRow(afterYou, aiCol);
      const afterAi = drop(afterYou, aiCol, 'ai');
      setBoard(afterAi);
      setDrops(new Set([idx(ar, aiCol)]));
      const aiWin = winningLine(afterAi, 'ai');
      if (aiWin) { finish('lost', aiWin); return; }
      if (openCols(afterAi).length === 0) { finish('draw', null); return; }
      setThinking(false);
    }, 320);
  };

  const statusText =
    status === 'won' ? 'Four in a row. You win!' :
    status === 'lost' ? 'The computer got four in a row.' :
    status === 'draw' ? 'The board is full. It is a draw.' :
    thinking ? 'The computer is thinking...' : 'Your turn. Drop a piece into a column.';
  const tone = status === 'won' ? 'good' : status === 'lost' ? 'bad' : status === 'draw' ? 'info' : 'neutral';

  return (
    <GameShell
      title="Connect Four"
      subtitle="Line up four before the computer does."
      icon={<CircleDot size={22} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={k => { setDifficulty(k as Difficulty); newGame(); }}
      score={[
        { label: 'Won', value: score.won, tone: 'win' },
        { label: 'Lost', value: score.lost, tone: 'loss' },
        { label: 'Drawn', value: score.drawn, tone: 'draw' },
      ]}
      status={statusText}
      statusTone={tone}
      onNewGame={newGame}
      rules={<>
        <p>Take turns dropping pieces into the seven columns. A piece falls to the lowest free slot.</p>
        <p>The first to line up four of their own pieces, in a row, column or diagonal, wins.</p>
      </>}
    >
      <div className={s.frame}>
        <div className={s.cols} role="grid" aria-label="Connect Four board">
          {Array.from({ length: COLS }, (_, c) => {
            const full = landingRow(board, c) < 0;
            return (
              <button
                key={c}
                type="button"
                className={s.col}
                onClick={() => play(c)}
                disabled={status !== 'playing' || thinking || full}
                aria-label={`Drop into column ${c + 1}`}
              >
                {Array.from({ length: ROWS }, (_, r) => {
                  const v = board[idx(r, c)];
                  return (
                    <span key={r} className={s.slot}>
                      <span
                        className={`${s.disc} ${v ? s[v] : ''} ${drops.has(idx(r, c)) ? s.dropIn : ''} ${win?.includes(idx(r, c)) ? s.winDisc : ''}`}
                      />
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      </div>
    </GameShell>
  );
}
