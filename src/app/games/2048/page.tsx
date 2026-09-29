'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Grid2x2 } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import s from './g2048.module.css';
import { recordResult } from '@/lib/games';
import { ensureSession } from '@/lib/supabase';

// ─── MODEL ────────────────────────────────────────────────────
const SIZE = 4;
const BEST_KEY = 'yw-2048-best';
let TILE_ID = 1;

interface Tile { id: number; r: number; c: number; value: number; merged?: boolean; isNew?: boolean }
type Dir = 'up' | 'down' | 'left' | 'right';

const readBest = (): number => {
  try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch { return 0; }
};
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* ignore */ } };

const emptyCells = (tiles: Tile[]): [number, number][] => {
  const taken = new Set(tiles.map(t => t.r * SIZE + t.c));
  const out: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!taken.has(r * SIZE + c)) out.push([r, c]);
  return out;
};

const spawn = (tiles: Tile[]): Tile[] => {
  const cells = emptyCells(tiles);
  if (!cells.length) return tiles;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  return [...tiles, { id: TILE_ID++, r, c, value: Math.random() < 0.9 ? 2 : 4, isNew: true }];
};

const freshBoard = (): Tile[] => spawn(spawn([]));

// A line of tiles travelling in the move direction, nearest-to-wall first.
const orient = (dir: Dir) => {
  const rev = dir === 'right' || dir === 'down';
  const horizontal = dir === 'left' || dir === 'right';
  return { rev, horizontal };
};

/** Slide + merge. Returns the new tiles (with merged/new flags), the score gained, and whether anything moved. */
function move(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean } {
  const { rev, horizontal } = orient(dir);
  const next: Tile[] = [];
  let gained = 0, moved = false;

  for (let line = 0; line < SIZE; line++) {
    // Gather the tiles in this row (or column), ordered in travel direction.
    const inLine = tiles
      .filter(t => (horizontal ? t.r : t.c) === line)
      .sort((a, b) => (horizontal ? a.c - b.c : a.r - b.r) * (rev ? -1 : 1));

    const merged: Tile[] = [];
    for (const t of inLine) {
      const prev = merged[merged.length - 1];
      if (prev && prev.value === t.value && !prev.merged) {
        prev.value *= 2; prev.merged = true; gained += prev.value;
        // keep prev's id (the tile that stays), drop t
        moved = true;
      } else {
        merged.push({ ...t, merged: false, isNew: false });
      }
    }
    // Place them against the wall in order.
    merged.forEach((t, idx) => {
      const pos = rev ? SIZE - 1 - idx : idx;
      const nr = horizontal ? line : pos;
      const nc = horizontal ? pos : line;
      if (t.r !== nr || t.c !== nc) moved = true;
      t.r = nr; t.c = nc;
      next.push(t);
    });
  }
  return { tiles: next, gained, moved };
}

const hasMoves = (tiles: Tile[]): boolean => {
  if (emptyCells(tiles).length) return true;
  const grid: number[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  tiles.forEach(t => { grid[t.r][t.c] = t.value; });
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return true;
    if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return true;
  }
  return false;
};

// ─── COMPONENT ────────────────────────────────────────────────
export default function Game2048() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const busy = useRef(false);
  const scoreRef = useRef(0);
  const bestRef = useRef(0);

  const reset = useCallback(() => {
    TILE_ID = 1;
    scoreRef.current = 0;
    setTiles(freshBoard()); setScore(0); setOver(false); setWon(false); setKeepGoing(false);
  }, []);

  // Set the board and best score once on mount (client only, so no hydration mismatch).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const b = readBest(); bestRef.current = b; setBest(b); reset(); }, [reset]);

  const doMove = useCallback((dir: Dir) => {
    if (busy.current || over) return;
    setTiles(cur => {
      const { tiles: moved, gained, moved: didMove } = move(cur, dir);
      if (!didMove) return cur;
      busy.current = true;
      // Let the slide animation play, then score, spawn a new tile and check end states.
      setTimeout(() => {
        if (gained > 0) {
          const ns = scoreRef.current + gained;
          scoreRef.current = ns;
          setScore(ns);
          if (ns > bestRef.current) { bestRef.current = ns; setBest(ns); writeBest(ns); }
        }
        setTiles(afterSlide => {
          const withNew = spawn(afterSlide.map(t => ({ ...t, isNew: false, merged: false })));
          const reached = withNew.some(t => t.value >= 2048);
          if (reached && !won) {
            setWon(true);
            ensureSession().then(ok => { if (ok) recordResult('g2048', 'medium', 'win'); }).catch(() => {});
          }
          if (!hasMoves(withNew)) {
            setOver(true);
            if (!reached && !won) ensureSession().then(ok => { if (ok) recordResult('g2048', 'medium', 'loss'); }).catch(() => {});
          }
          busy.current = false;
          return withNew;
        });
      }, 120);
      return moved;
    });
  }, [over, won]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); doMove(dir); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  // Touch / swipe
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return;
    doMove(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  const status = over
    ? (won || keepGoing || tiles.some(t => t.value >= 2048) ? 'No moves left — great run!' : 'No moves left. Try again!')
    : won && !keepGoing ? 'You reached 2048! Keep going for a higher score.'
    : 'Join the tiles to reach 2048.';

  return (
    <GameShell
      title="2048"
      subtitle="Slide the tiles, add them up, reach 2048."
      icon={<Grid2x2 size={22} strokeWidth={2} />}
      score={[
        { label: 'Score', value: score },
        { label: 'Best', value: best, tone: score >= best && score > 0 ? 'win' : undefined },
      ]}
      status={status}
      statusTone={over ? (won || tiles.some(t => t.value >= 2048) ? 'good' : 'bad') : won ? 'good' : 'neutral'}
      onNewGame={reset}
      rules={<>
        <p>Use the arrow keys, WASD, or swipe on a touch screen. Every move slides all the tiles one way.</p>
        <p>When two tiles with the same number touch, they merge into one worth double. Get a tile to 2048 to win — then keep going for a bigger score.</p>
      </>}
    >
      <div className={s.wrap}>
        <div
          className={s.board}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          role="application"
          aria-label="2048 board"
        >
          {Array.from({ length: SIZE * SIZE }, (_, i) => <div key={i} className={s.cell} />)}
          {tiles.map(t => (
            <div
              key={t.id}
              className={`${s.tile} ${t.isNew ? s.tileNew : ''} ${t.merged ? s.tileMerged : ''}`}
              style={{
                ['--r' as string]: t.r,
                ['--c' as string]: t.c,
                ['--v' as string]: t.value,
              }}
              data-value={t.value}
            >
              {t.value}
            </div>
          ))}

          {over && (
            <div className={s.overlay}>
              <p className={s.overTitle}>{tiles.some(t => t.value >= 2048) ? 'Nice run!' : 'Game over'}</p>
              <p className={s.overScore}>Score {score}</p>
              <button type="button" className={s.overBtn} onClick={reset}>Play again</button>
            </div>
          )}
          {won && !keepGoing && !over && (
            <div className={s.overlay}>
              <p className={s.overTitle}>You made 2048! 🎉</p>
              <div className={s.overRow}>
                <button type="button" className={s.overBtn} onClick={() => setKeepGoing(true)}>Keep going</button>
                <button type="button" className={`${s.overBtn} ${s.overGhost}`} onClick={reset}>New game</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}
