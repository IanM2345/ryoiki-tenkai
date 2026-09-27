'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Eraser, Grid3x3, Pencil, SearchCheck, Undo2 } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { recordResult } from '@/lib/games';
import s from './sudoku.module.css';

type Difficulty = 'easy' | 'medium' | 'hard';

/** Target number of given cells. Fewer clues means a harder puzzle. */
const CLUES: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 24 };

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', hint: `About ${CLUES.easy} numbers given` },
  { key: 'medium', label: 'Medium', hint: `About ${CLUES.medium} numbers given` },
  { key: 'hard', label: 'Hard', hint: `About ${CLUES.hard} numbers given` },
];

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0x3fe; // bits 1..9

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Indices of every cell sharing a row, column or box with cell i (excluding i). */
const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const out: number[] = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) out.push(j);
  }
  return out;
});

/* ── Solver / generator ────────────────────────────────────────────── */

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function bitsToDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/**
 * Backtracking search with bitmasks, always branching on the cell with the fewest candidates.
 * Returns how many solutions exist, stopping once `limit` is reached. When `fill` is set, the
 * first solution found is written into the grid (with digits tried in random order).
 */
function solve(grid: number[], limit: number, fill = false): number {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & bit) return 0;
    rows[rowOf(i)] |= bit; cols[colOf(i)] |= bit; boxes[boxOf(i)] |= bit;
  }
  const g = fill ? grid : [...grid];
  let count = 0;

  const search = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      let n = 0;
      for (let m = mask; m; m &= m - 1) n++;
      if (n < bestCount) { best = i; bestMask = mask; bestCount = n; if (n <= 1) break; }
    }
    if (best === -1) { count++; return count >= limit || fill; }
    if (bestCount === 0) return false;
    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    const digits = fill ? shuffle(bitsToDigits(bestMask)) : bitsToDigits(bestMask);
    for (const d of digits) {
      const bit = 1 << d;
      g[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      const stop = search();
      if (stop && fill) return true;
      g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      if (stop) return true;
    }
    return false;
  };
  search();
  return count;
}

/** Build a puzzle that has exactly one solution, removing clues only while that stays true. */
function generate(difficulty: Difficulty): { puzzle: number[]; solution: number[] } {
  const target = CLUES[difficulty];
  let best: { puzzle: number[]; solution: number[] } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const solution = new Array(81).fill(0);
    solve(solution, 1, true);
    const puzzle = [...solution];
    let clues = 81;
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k))) {
      if (clues <= target) break;
      const keep = puzzle[i];
      puzzle[i] = 0;
      if (solve(puzzle, 2) !== 1) puzzle[i] = keep;
      else clues--;
    }
    if (!best || clues < best.puzzle.filter(Boolean).length) best = { puzzle, solution };
    if (clues <= target) break;
  }
  return best!;
}

/** Cells that share a digit with a peer. */
function findConflicts(board: number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (v && PEERS[i].some(j => board[j] === v)) out.add(i);
  }
  return out;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/* ── Page ──────────────────────────────────────────────────────────── */

interface Game {
  id: number;
  puzzle: number[];
  solution: number[];
}

interface Step { board: number[]; notes: number[] }

export default function SudokuPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<Game | null>(null);
  const [board, setBoard] = useState<number[]>([]);
  const [notes, setNotes] = useState<number[]>([]);
  const [history, setHistory] = useState<Step[]>([]);
  const [selected, setSelected] = useState(40);
  const [pencil, setPencil] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [won, setWon] = useState(false);
  const [solvedCount, setSolvedCount] = useState(0);

  const recordedRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  // Generate off the render path (random, so it must not run during SSR).
  const startGame = useCallback((d: Difficulty) => {
    const t = setTimeout(() => {
      const { puzzle, solution } = generate(d);
      idRef.current += 1;
      setGame({ id: idRef.current, puzzle, solution });
      setBoard([...puzzle]);
      setNotes(new Array(81).fill(0));
      setHistory([]);
      setSelected(puzzle.findIndex(v => v === 0));
      setPencil(false);
      setReveal(false);
      setMistakes(0);
      setSeconds(0);
      setWon(false);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => startGame('medium'), [startGame]);

  // Timer runs while a puzzle is on screen and unsolved.
  const running = !!game && !won;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const conflicts = useMemo(() => findConflicts(board), [board]);

  const finish = useCallback((next: number[], g: Game) => {
    const full = next.every(Boolean);
    if (!full || findConflicts(next).size > 0) return;
    setWon(true);
    if (recordedRef.current !== g.id) {
      recordedRef.current = g.id;
      setSolvedCount(n => n + 1);
      void recordResult('sudoku', difficulty, 'win');
    }
  }, [difficulty]);

  /** Put a digit (or 0 to erase) into the selected cell, honouring pencil mode. */
  const input = useCallback((digit: number) => {
    if (!game || won || selected < 0 || game.puzzle[selected]) return;
    const i = selected;
    if (pencil && digit) {
      if (board[i]) return;
      const nextNotes = [...notes];
      nextNotes[i] ^= 1 << digit;
      setHistory(h => [...h, { board, notes }]);
      setNotes(nextNotes);
      return;
    }
    if (board[i] === digit && !(digit === 0 && notes[i])) return;
    const nextBoard = [...board];
    const nextNotes = [...notes];
    nextBoard[i] = digit;
    if (digit === 0) nextNotes[i] = 0;
    else for (const j of PEERS[i]) nextNotes[j] &= ~(1 << digit);
    setHistory(h => [...h, { board, notes }]);
    setBoard(nextBoard);
    setNotes(nextNotes);
    if (digit && digit !== game.solution[i]) setMistakes(m => m + 1);
    finish(nextBoard, game);
  }, [game, won, selected, pencil, board, notes, finish]);

  const undo = useCallback(() => {
    if (won || history.length === 0) return;
    const last = history[history.length - 1];
    setBoard(last.board);
    setNotes(last.notes);
    setHistory(history.slice(0, -1));
  }, [won, history]);

  const move = useCallback((key: string) => {
    if (selected < 0) { setSelected(0); return; }
    let r = rowOf(selected), c = colOf(selected);
    if (key === 'ArrowUp') r = (r + 8) % 9;
    else if (key === 'ArrowDown') r = (r + 1) % 9;
    else if (key === 'ArrowLeft') c = (c + 8) % 9;
    else if (key === 'ArrowRight') c = (c + 1) % 9;
    const next = r * 9 + c;
    setSelected(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-i="${next}"]`)?.focus();
  }, [selected]);

  // Keyboard: digits, arrows, backspace/delete, N for notes, Ctrl+Z to undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); input(Number(e.key)); }
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); input(0); }
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); move(e.key); }
      else if (e.key === 'n' || e.key === 'N') setPencil(p => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input, move, undo]);

  const handleDifficulty = (key: string) => {
    const d = key as Difficulty;
    setDifficulty(d);
    startGame(d);
  };

  const selVal = selected >= 0 ? board[selected] : 0;
  const placed = useMemo(() => {
    const n = new Array(10).fill(0);
    for (const v of board) if (v) n[v]++;
    return n;
  }, [board]);

  let status: ReactNode;
  let tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral';
  if (!game) status = 'Making a fresh puzzle…';
  else if (won) {
    status = `Solved in ${fmtTime(seconds)} with ${mistakes === 0 ? 'no mistakes' : mistakes === 1 ? '1 mistake' : `${mistakes} mistakes`}. Nice work!`;
    tone = 'good';
  } else if (conflicts.size > 0) {
    status = 'Some numbers clash in a row, column or box. They are shown in red.';
    tone = 'bad';
  } else if (pencil) { status = 'Notes mode is on. Numbers go in as small pencil marks.'; tone = 'info'; }
  else status = 'Pick a cell, then a number.';

  return (
    <GameShell
      title="Sudoku"
      subtitle="Fill every row, column and box with 1 to 9."
      icon={<Grid3x3 size={24} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={handleDifficulty}
      score={[
        { label: 'Time', value: fmtTime(seconds) },
        { label: 'Mistakes', value: mistakes, tone: mistakes ? 'loss' : undefined },
        { label: 'Solved', value: solvedCount, tone: 'win' },
      ]}
      status={status}
      statusTone={tone}
      onNewGame={() => startGame(difficulty)}
      rules={
        <>
          <p>Every row, column and 3 by 3 box must hold each number from 1 to 9 exactly once. Every puzzle here has one single solution.</p>
          <p>Tap a cell, then tap a number. Turn on Notes to jot small candidates in a cell. Numbers that clash with another in the same row, column or box turn red, and each wrong entry adds a mistake.</p>
          <p>Keyboard works too: arrows to move, 1 to 9 to fill, Backspace to clear, N for notes and Ctrl+Z to undo.</p>
        </>
      }
    >
      <div className={s.stage}>
        {!game ? (
          <div className={`skeleton ${s.skel}`} aria-hidden="true" />
        ) : (
          <>
            <div ref={gridRef} className={s.grid} role="group" aria-label="Sudoku grid" data-won={won || undefined}>
              {board.map((v, i) => {
                const given = game.puzzle[i] !== 0;
                const peer = selected >= 0 && i !== selected
                  && (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected));
                const same = !!selVal && v === selVal && i !== selected;
                const clash = conflicts.has(i);
                const wrong = reveal && !given && v !== 0 && v !== game.solution[i];
                const noteMask = notes[i];
                const label = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}, ${v ? v : 'empty'}${given ? ', given' : ''}${clash ? ', clashes' : ''}${wrong ? ', incorrect' : ''}`;
                return (
                  <button
                    key={i}
                    type="button"
                    data-i={i}
                    className={s.cell}
                    tabIndex={i === selected ? 0 : -1}
                    data-given={given || undefined}
                    data-selected={i === selected || undefined}
                    data-peer={peer || undefined}
                    data-same={same || undefined}
                    data-clash={clash || undefined}
                    data-wrong={wrong || undefined}
                    data-edge-r={colOf(i) === 2 || colOf(i) === 5 || undefined}
                    data-edge-b={rowOf(i) === 2 || rowOf(i) === 5 || undefined}
                    aria-label={label}
                    aria-pressed={i === selected}
                    onClick={() => setSelected(i)}
                  >
                    {v ? (
                      <span className={s.value}>{v}</span>
                    ) : noteMask ? (
                      <span className={s.notes} aria-hidden="true">
                        {DIGITS.map(d => (
                          <span key={d} data-hit={(!!selVal && d === selVal) || undefined}>
                            {noteMask & (1 << d) ? d : ''}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className={s.tools}>
              <button type="button" className={s.tool} onClick={undo} disabled={won || history.length === 0}>
                <Undo2 size={18} strokeWidth={2} /> Undo
              </button>
              <button type="button" className={s.tool} onClick={() => input(0)} disabled={won}>
                <Eraser size={18} strokeWidth={2} /> Erase
              </button>
              <button
                type="button"
                className={s.tool}
                aria-pressed={pencil}
                data-on={pencil || undefined}
                onClick={() => setPencil(p => !p)}
                disabled={won}
              >
                <Pencil size={18} strokeWidth={2} /> Notes {pencil ? 'on' : 'off'}
              </button>
              <button
                type="button"
                className={s.tool}
                aria-pressed={reveal}
                data-on={reveal || undefined}
                onClick={() => setReveal(r => !r)}
                disabled={won}
              >
                <SearchCheck size={18} strokeWidth={2} /> Check
              </button>
            </div>

            <div className={s.pad} role="group" aria-label="Number pad">
              {DIGITS.map(d => {
                const left = 9 - placed[d];
                return (
                  <button
                    key={d}
                    type="button"
                    className={s.key}
                    data-pencil={pencil || undefined}
                    disabled={won || left <= 0}
                    aria-label={`${pencil ? 'Note' : 'Place'} ${d}, ${Math.max(left, 0)} left`}
                    onClick={() => input(d)}
                  >
                    <span className={s.keyNum}>{d}</span>
                    <span className={s.keyLeft}>{Math.max(left, 0)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </GameShell>
  );
}
