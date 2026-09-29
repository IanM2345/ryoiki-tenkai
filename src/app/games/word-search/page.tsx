'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search as SearchIcon, Check } from 'lucide-react';
import GameShell, { Difficulty } from '@/components/games/GameShell';
import s from './word-search.module.css';
import { recordResult } from '@/lib/games';
import { ensureSession } from '@/lib/supabase';

// ─── THEMES ───────────────────────────────────────────────────
const THEMES: { name: string; words: string[] }[] = [
  { name: 'Animals', words: ['TIGER', 'PANDA', 'KOALA', 'OTTER', 'HORSE', 'EAGLE', 'SHARK', 'WHALE', 'ZEBRA', 'MOOSE', 'CAMEL', 'ROBIN', 'HERON', 'LEMUR', 'GECKO'] },
  { name: 'Kitchen', words: ['BREAD', 'MANGO', 'HONEY', 'OLIVE', 'PASTA', 'LEMON', 'PEACH', 'BERRY', 'COCOA', 'MELON', 'SUGAR', 'CREAM', 'BASIL', 'THYME'] },
  { name: 'Nature', words: ['RIVER', 'CLOUD', 'STONE', 'BEACH', 'FROST', 'MEADOW', 'FOREST', 'CANYON', 'VALLEY', 'PETAL', 'STORM', 'OCEAN', 'MAPLE', 'CORAL'] },
  { name: 'Happy', words: ['HEART', 'DREAM', 'SMILE', 'HAPPY', 'PEACE', 'MUSIC', 'LIGHT', 'BLOOM', 'SHINE', 'LAUGH', 'SWEET', 'GLOW', 'HOPE', 'CALM'] },
  { name: 'Travel', words: ['PLANE', 'TRAIN', 'HOTEL', 'COAST', 'CABIN', 'TRAIL', 'OCEAN', 'METRO', 'FERRY', 'TENT', 'MAP', 'BEACH', 'ROUTE'] },
];

interface Level { key: string; label: string; size: number; count: number; diagonals: boolean; reverse: boolean }
const LEVELS: (Difficulty & Level)[] = [
  { key: 'easy',   label: 'Easy',   size: 10, count: 7,  diagonals: false, reverse: false },
  { key: 'medium', label: 'Medium', size: 12, count: 9,  diagonals: true,  reverse: true },
  { key: 'hard',   label: 'Hard',   size: 14, count: 11, diagonals: true,  reverse: true },
];
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const randLetter = () => ALPHA[Math.floor(Math.random() * 26)];
const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

type Dir = [number, number];
const DIRS_STRAIGHT: Dir[] = [[0, 1], [1, 0]];
const DIRS_DIAG: Dir[] = [[1, 1], [1, -1]];

interface Placed { word: string; cells: number[]; found: boolean }
interface Puzzle { grid: string[]; size: number; theme: string; words: Placed[] }

const idx = (r: number, c: number, size: number) => r * size + c;

function build(level: Level): Puzzle {
  const { size, count, diagonals, reverse } = level;
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const pool = [...theme.words].filter(w => w.length <= size).sort(() => Math.random() - 0.5).slice(0, count);

  const grid: (string | null)[] = Array(size * size).fill(null);
  const placed: Placed[] = [];
  let dirs: Dir[] = [...DIRS_STRAIGHT, ...(diagonals ? DIRS_DIAG : [])];
  if (reverse) dirs = dirs.flatMap(([dr, dc]) => [[dr, dc], [-dr, -dc]] as Dir[]);

  for (const word of pool) {
    let done = false;
    for (let attempt = 0; attempt < 120 && !done; attempt++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const r0 = Math.floor(Math.random() * size);
      const c0 = Math.floor(Math.random() * size);
      const rEnd = r0 + dr * (word.length - 1);
      const cEnd = c0 + dc * (word.length - 1);
      if (rEnd < 0 || rEnd >= size || cEnd < 0 || cEnd >= size) continue;
      const cells: number[] = [];
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = r0 + dr * i, c = c0 + dc * i;
        const cell = grid[idx(r, c, size)];
        if (cell !== null && cell !== word[i]) { ok = false; break; }
        cells.push(idx(r, c, size));
      }
      if (!ok) continue;
      cells.forEach((ci, i) => { grid[ci] = word[i]; });
      placed.push({ word, cells, found: false });
      done = true;
    }
  }
  const filled = grid.map(ch => ch ?? randLetter());
  return { grid: filled, size, theme: theme.name, words: placed };
}

// Straight line of cell indices from a to b, or null if not a clean line.
function lineCells(a: number, b: number, size: number): number[] | null {
  const ar = Math.floor(a / size), ac = a % size;
  const br = Math.floor(b / size), bc = b % size;
  const dr = br - ar, dc = bc - ac;
  const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  if (!straight) return null;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = sign(dr), sc = sign(dc);
  const out: number[] = [];
  for (let i = 0; i <= len; i++) out.push(idx(ar + sr * i, ac + sc * i, size));
  return out;
}

// ─── COMPONENT ────────────────────────────────────────────────
export default function WordSearchGame() {
  const [level, setLevel] = useState('easy');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [foundCells, setFoundCells] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number[]>([]);
  const [won, setWon] = useState(false);
  const startRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const conf = LEVELS.find(l => l.key === level)!;

  const deal = useCallback((lv: string) => {
    const cfg = LEVELS.find(l => l.key === lv)!;
    setPuzzle(build(cfg)); setFoundCells(new Set()); setSel([]); setWon(false); startRef.current = null;
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { deal(level); }, [deal, level]);

  const cellFromPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const c = el?.closest('[data-cell]') as HTMLElement | null;
    if (!c) return null;
    const n = Number(c.dataset.cell);
    return Number.isFinite(n) ? n : null;
  };

  const onDown = (e: React.PointerEvent) => {
    if (won || !puzzle) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell == null) return;
    startRef.current = cell; setSel([cell]);
  };
  const onMove = (e: React.PointerEvent) => {
    if (startRef.current == null || !puzzle) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell == null) return;
    const line = lineCells(startRef.current, cell, puzzle.size);
    setSel(line ?? [startRef.current]);
  };
  const onUp = () => {
    if (startRef.current == null || !puzzle) { startRef.current = null; return; }
    const chosen = sel;
    startRef.current = null; setSel([]);
    if (chosen.length < 2) return;
    const str = chosen.map(i => puzzle.grid[i]).join('');
    const rev = [...str].reverse().join('');
    const hit = puzzle.words.find(w => !w.found && (w.word === str || w.word === rev));
    if (!hit) return;
    hit.found = true;
    const nf = new Set(foundCells); hit.cells.forEach(c => nf.add(c));
    setFoundCells(nf);
    const remaining = puzzle.words.filter(w => !w.found).length;
    setPuzzle({ ...puzzle });
    if (remaining === 0) {
      setWon(true);
      ensureSession().then(ok => { if (ok) recordResult('wordsearch', level, 'win'); }).catch(() => {});
    }
  };

  const foundCount = puzzle ? puzzle.words.filter(w => w.found).length : 0;
  const total = puzzle ? puzzle.words.length : 0;

  return (
    <GameShell
      title="Word Search"
      subtitle={puzzle ? `Theme: ${puzzle.theme}` : 'Find the hidden words.'}
      icon={<SearchIcon size={22} strokeWidth={2} />}
      difficulties={LEVELS}
      difficulty={level}
      onDifficulty={k => setLevel(k)}
      score={[{ label: 'Found', value: `${foundCount}/${total}` }]}
      status={won ? 'You found them all! Lovely.' : 'Drag across the letters to trace each word.'}
      statusTone={won ? 'good' : 'neutral'}
      onNewGame={() => deal(level)}
      rules={<>
        <p>Every word in the list is hidden in the grid. Press on the first letter and drag to the last to trace it — across, down{conf.diagonals ? ', or diagonally' : ''}{conf.reverse ? ', forwards or backwards' : ''}.</p>
        <p>Find them all to finish. Tap a new difficulty for a bigger grid and more words, or New game for a fresh theme.</p>
      </>}
      aside={puzzle && (
        <div className={s.words}>
          <h3 className={s.wordsTitle}>{puzzle.theme}</h3>
          <ul className={s.wordList}>
            {puzzle.words.map(w => (
              <li key={w.word} className={`${s.word} ${w.found ? s.wordFound : ''}`}>
                {w.found && <Check size={14} strokeWidth={2.5} />} {w.word}
              </li>
            ))}
          </ul>
        </div>
      )}
    >
      {puzzle && (
        <div
          ref={gridRef}
          className={s.grid}
          style={{ ['--n' as string]: puzzle.size }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {puzzle.grid.map((ch, i) => {
            const isFound = foundCells.has(i);
            const isSel = sel.includes(i);
            return (
              <div
                key={i}
                data-cell={i}
                className={`${s.cell} ${isFound ? s.found : ''} ${isSel ? s.sel : ''}`}
              >
                {ch}
              </div>
            );
          })}
        </div>
      )}
    </GameShell>
  );
}
