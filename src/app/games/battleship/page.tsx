'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Eraser, Play, RotateCw, Ship as ShipIcon, Shuffle, X } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { ensureSession } from '@/lib/supabase';
import { recordResult } from '@/lib/games';
import s from './battleship.module.css';

// ── Types and constants ─────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';
type Phase = 'placing' | 'playing' | 'won' | 'lost';
/** 0 = not fired on, 1 = miss, 2 = hit */
type Shot = 0 | 1 | 2;

interface Ship { name: string; size: number; cells: number[] }

interface Game {
  id: number;
  phase: Phase;
  difficulty: Difficulty;
  player: Ship[];
  enemy: Ship[];
  /** Shots the player fired at the enemy fleet. */
  playerShots: Shot[];
  /** Shots the computer fired at the player's fleet. */
  aiShots: Shot[];
  turn: 'player' | 'ai';
  lastPlayer: number | null;
  lastAi: number | null;
  message: string;
}

const G = 10;
const FLEET = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Destroyer', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Patrol Boat', size: 2 },
];
const AI_DELAY = 700;
const ROWS = 'ABCDEFGHIJ';

const DIFFICULTIES: { key: Difficulty; label: string; hint: string }[] = [
  { key: 'easy', label: 'Easy', hint: 'Fires at random' },
  { key: 'medium', label: 'Medium', hint: 'Hunts around every hit until the ship sinks' },
  { key: 'hard', label: 'Hard', hint: 'Plays the odds and never wastes a shot' },
];

// ── Grid helpers ────────────────────────────────────────────

const inBounds = (r: number, c: number) => r >= 0 && r < G && c >= 0 && c < G;
const idx = (r: number, c: number) => r * G + c;
const coord = (i: number) => `${ROWS[Math.floor(i / G)]}${(i % G) + 1}`;

function shipCells(start: number, size: number, horizontal: boolean): number[] | null {
  const r = Math.floor(start / G);
  const c = start % G;
  const cells: number[] = [];
  for (let k = 0; k < size; k++) {
    const rr = horizontal ? r : r + k;
    const cc = horizontal ? c + k : c;
    if (!inBounds(rr, cc)) return null;
    cells.push(idx(rr, cc));
  }
  return cells;
}

function occupied(ships: Ship[]): Set<number> {
  return new Set(ships.flatMap(sh => sh.cells));
}

function canPlace(ships: Ship[], cells: number[] | null): cells is number[] {
  if (!cells) return false;
  const taken = occupied(ships);
  return cells.every(c => !taken.has(c));
}

function randomFleet(): Ship[] {
  const ships: Ship[] = [];
  for (const def of FLEET) {
    for (;;) {
      const horizontal = Math.random() < 0.5;
      const cells = shipCells(Math.floor(Math.random() * G * G), def.size, horizontal);
      if (canPlace(ships, cells)) { ships.push({ ...def, cells }); break; }
    }
  }
  return ships;
}

const isSunk = (ship: Ship, shots: Shot[]) => ship.cells.every(c => shots[c] === 2);
const shipAt = (ships: Ship[], cell: number) => ships.find(sh => sh.cells.includes(cell));
const allSunk = (ships: Ship[], shots: Shot[]) => ships.length > 0 && ships.every(sh => isSunk(sh, shots));

function neighbours(i: number): number[] {
  const r = Math.floor(i / G);
  const c = i % G;
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    .filter(([rr, cc]) => inBounds(rr, cc))
    .map(([rr, cc]) => idx(rr, cc));
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

// ── Pure state transitions ──────────────────────────────────

function newGame(id: number, difficulty: Difficulty): Game {
  return {
    id, phase: 'placing', difficulty,
    player: [], enemy: [],
    playerShots: Array<Shot>(G * G).fill(0),
    aiShots: Array<Shot>(G * G).fill(0),
    turn: 'player', lastPlayer: null, lastAi: null,
    message: '',
  };
}

function placeShip(game: Game, start: number, horizontal: boolean): Game {
  if (game.phase !== 'placing' || game.player.length >= FLEET.length) return game;
  const def = FLEET[game.player.length];
  const cells = shipCells(start, def.size, horizontal);
  if (!canPlace(game.player, cells)) return game;
  return { ...game, player: [...game.player, { ...def, cells }] };
}

function startBattle(game: Game, enemy: Ship[]): Game {
  if (game.phase !== 'placing' || game.player.length !== FLEET.length) return game;
  return { ...game, phase: 'playing', enemy, turn: 'player', message: 'Battle stations. Pick a square in enemy waters to fire.' };
}

function playerFire(game: Game, cell: number): Game {
  if (game.phase !== 'playing' || game.turn !== 'player' || game.playerShots[cell] !== 0) return game;
  const shots = [...game.playerShots];
  const ship = shipAt(game.enemy, cell);
  shots[cell] = ship ? 2 : 1;
  let message = `You missed at ${coord(cell)}.`;
  if (ship) message = isSunk(ship, shots) ? `You sank their ${ship.name}!` : `Hit at ${coord(cell)}!`;
  if (allSunk(game.enemy, shots)) {
    return { ...game, playerShots: shots, lastPlayer: cell, phase: 'won', message: 'Victory! You sank the whole enemy fleet.' };
  }
  return { ...game, playerShots: shots, lastPlayer: cell, turn: 'ai', message: `${message} The enemy is taking aim...` };
}

function aiFire(game: Game, cell: number): Game {
  if (game.phase !== 'playing' || game.turn !== 'ai' || game.aiShots[cell] !== 0) return game;
  const shots = [...game.aiShots];
  const ship = shipAt(game.player, cell);
  shots[cell] = ship ? 2 : 1;
  let message = `They missed at ${coord(cell)}.`;
  if (ship) message = isSunk(ship, shots) ? `They sank your ${ship.name}.` : `They hit your ${ship.name} at ${coord(cell)}.`;
  if (allSunk(game.player, shots)) {
    return { ...game, aiShots: shots, lastAi: cell, phase: 'lost', message: 'Your fleet is gone. The enemy wins this one.' };
  }
  return { ...game, aiShots: shots, lastAi: cell, turn: 'player', message: `${message} Your turn.` };
}

// ── Computer targeting ──────────────────────────────────────
// The computer only knows what a real player would: hits, misses and which ships are sunk.

function aiKnowledge(ships: Ship[], shots: Shot[]) {
  const sunkCells = new Set<number>();
  const remaining: number[] = [];
  for (const sh of ships) {
    if (isSunk(sh, shots)) sh.cells.forEach(c => sunkCells.add(c));
    else remaining.push(sh.size);
  }
  const openHits: number[] = [];
  shots.forEach((v, i) => { if (v === 2 && !sunkCells.has(i)) openHits.push(i); });
  return { sunkCells, remaining, openHits };
}

/** Target mode: extend a line of two or more hits, otherwise try squares next to a hit. */
function targetCandidates(shots: Shot[], openHits: number[]): number[] {
  const open = new Set(openHits);
  const onLine = new Set<number>();
  for (const h of openHits) {
    const r = Math.floor(h / G);
    const c = h % G;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const ahead = inBounds(r + dr, c + dc) && open.has(idx(r + dr, c + dc));
      const behind = inBounds(r - dr, c - dc) && open.has(idx(r - dr, c - dc));
      if (!ahead && !behind) continue;
      for (const sign of [1, -1]) {
        let rr = r;
        let cc = c;
        while (inBounds(rr + sign * dr, cc + sign * dc) && open.has(idx(rr + sign * dr, cc + sign * dc))) {
          rr += sign * dr;
          cc += sign * dc;
        }
        const nr = rr + sign * dr;
        const nc = cc + sign * dc;
        if (inBounds(nr, nc) && shots[idx(nr, nc)] === 0) onLine.add(idx(nr, nc));
      }
    }
  }
  if (onLine.size) return [...onLine];
  const adjacent = new Set<number>();
  for (const h of openHits) for (const n of neighbours(h)) if (shots[n] === 0) adjacent.add(n);
  return [...adjacent];
}

/** How many ways a remaining ship could cover each unfired square. */
function density(shots: Shot[], remaining: number[], sunkCells: Set<number>, openHits: number[]): number[] {
  const open = new Set(openHits);
  const score = Array<number>(G * G).fill(0);
  for (const size of remaining) {
    for (let start = 0; start < G * G; start++) {
      for (const horizontal of [true, false]) {
        const cells = shipCells(start, size, horizontal);
        if (!cells || cells.some(c => shots[c] === 1 || sunkCells.has(c))) continue;
        const covers = cells.filter(c => open.has(c)).length;
        if (openHits.length && covers === 0) continue;
        const weight = openHits.length ? covers * covers * 4 : 1;
        for (const c of cells) if (shots[c] === 0) score[c] += weight;
      }
    }
  }
  return score;
}

function bestOf(cells: number[], score: number[]): number | null {
  let best = 0;
  let out: number[] = [];
  for (const c of cells) {
    if (score[c] > best) { best = score[c]; out = [c]; }
    else if (score[c] === best && best > 0) out.push(c);
  }
  return out.length ? pick(out) : null;
}

function chooseAiShot(ships: Ship[], shots: Shot[], difficulty: Difficulty): number {
  const unfired: number[] = [];
  shots.forEach((v, i) => { if (v === 0) unfired.push(i); });
  if (difficulty === 'easy') return pick(unfired);

  const { sunkCells, remaining, openHits } = aiKnowledge(ships, shots);

  if (difficulty === 'medium') {
    if (openHits.length) {
      const targets = targetCandidates(shots, openHits);
      if (targets.length) return pick(targets);
    }
    return pick(unfired);
  }

  // Hard: probability density. While hunting, stick to a checkerboard since every ship is at least two long.
  const score = density(shots, remaining, sunkCells, openHits);
  if (openHits.length) {
    const targets = targetCandidates(shots, openHits);
    const choice = bestOf(targets, score) ?? bestOf(unfired, score) ?? (targets.length ? pick(targets) : null);
    if (choice !== null) return choice;
  } else {
    const minSize = Math.min(...remaining);
    const parity = unfired.filter(i => (Math.floor(i / G) + (i % G)) % minSize === 0);
    const choice = bestOf(parity, score) ?? bestOf(unfired, score);
    if (choice !== null) return choice;
  }
  return pick(unfired);
}

// ── Small presentational helpers (module level) ─────────────

function onGridKey(e: React.KeyboardEvent<HTMLElement>) {
  const i = Number((e.target as HTMLElement).dataset.idx);
  if (Number.isNaN(i)) return;
  const r = Math.floor(i / G);
  const c = i % G;
  let n = -1;
  if (e.key === 'ArrowRight' && c < G - 1) n = i + 1;
  else if (e.key === 'ArrowLeft' && c > 0) n = i - 1;
  else if (e.key === 'ArrowDown' && r < G - 1) n = i + G;
  else if (e.key === 'ArrowUp' && r > 0) n = i - G;
  if (n < 0) return;
  e.preventDefault();
  e.currentTarget.querySelector<HTMLElement>(`[data-idx="${n}"]`)?.focus();
}

function Marker({ shot }: { shot: Shot }) {
  if (shot === 2) return <span className={s.hit} aria-hidden="true"><X size={16} strokeWidth={3} /></span>;
  if (shot === 1) return <span className={s.miss} aria-hidden="true" />;
  return null;
}

function Axis({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.gridFrame}>
      <div className={s.colLabels} aria-hidden="true">
        {Array.from({ length: G }, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      <div className={s.rowLabels} aria-hidden="true">
        {ROWS.split('').map(l => <span key={l}>{l}</span>)}
      </div>
      {children}
    </div>
  );
}

function FleetStatus({ title, ships, shots, pending }: { title: string; ships: Ship[]; shots: Shot[]; pending?: boolean }) {
  return (
    <div className={s.fleet}>
      <p className={s.fleetTitle}>{title}</p>
      <ul className={s.fleetList}>
        {FLEET.map((def, k) => {
          const ship = ships[k];
          const sunk = !!ship && isSunk(ship, shots);
          const hits = ship ? ship.cells.filter(c => shots[c] === 2).length : 0;
          return (
            <li key={def.name} className={s.fleetItem} data-sunk={sunk} data-pending={pending && !ship}>
              <span className={s.pips} aria-hidden="true">
                {Array.from({ length: def.size }, (_, p) => (
                  <span key={p} className={s.pip} data-hit={p < hits} />
                ))}
              </span>
              <span className={s.fleetName}>{def.name}</span>
              {sunk && <span className={s.sunkTag}>Sunk</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────

export default function BattleshipPage() {
  const [game, setGame] = useState<Game>(() => newGame(1, 'medium'));
  const [horizontal, setHorizontal] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [scores, setScores] = useState({ wins: 0, losses: 0 });
  const recordedFor = useRef(0);

  useEffect(() => { ensureSession().catch(() => {}); }, []);

  const finish = useCallback((g: Game) => {
    if ((g.phase !== 'won' && g.phase !== 'lost') || recordedFor.current === g.id) return;
    recordedFor.current = g.id;
    const result = g.phase === 'won' ? 'win' : 'loss';
    setScores(sc => ({ wins: sc.wins + (result === 'win' ? 1 : 0), losses: sc.losses + (result === 'loss' ? 1 : 0) }));
    void (async () => {
      if (await ensureSession()) await recordResult('battleship', g.difficulty, result);
    })();
  }, []);

  const aiTurn = game.phase === 'playing' && game.turn === 'ai';

  // The computer fires after a short pause. The timer is cleared if the game changes first.
  useEffect(() => {
    if (!aiTurn) return;
    const t = setTimeout(() => {
      const next = aiFire(game, chooseAiShot(game.player, game.aiShots, game.difficulty));
      setGame(next);
      finish(next);
    }, AI_DELAY);
    return () => clearTimeout(t);
  }, [aiTurn, game, finish]);

  // R rotates the ship being placed.
  const placing = game.phase === 'placing';
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        setHorizontal(h => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  const nextShip = placing ? FLEET[game.player.length] : undefined;
  const preview = useMemo(() => {
    if (!nextShip || hover === null) return null;
    const cells = shipCells(hover, nextShip.size, horizontal);
    const ok = canPlace(game.player, cells);
    return { cells: new Set(cells ?? shipCells(hover, 1, true) ?? []), ok };
  }, [nextShip, hover, horizontal, game.player]);

  const playerCells = useMemo(() => occupied(game.player), [game.player]);
  const sunkPlayer = useMemo(() => new Set(game.player.filter(sh => isSunk(sh, game.aiShots)).flatMap(sh => sh.cells)), [game.player, game.aiShots]);
  const sunkEnemy = useMemo(() => new Set(game.enemy.filter(sh => isSunk(sh, game.playerShots)).flatMap(sh => sh.cells)), [game.enemy, game.playerShots]);

  const restart = (d: Difficulty = game.difficulty) => {
    setHover(null);
    setGame(g => newGame(g.id + 1, d));
  };

  const changeDifficulty = (key: string) => {
    const d = key as Difficulty;
    if (game.phase === 'placing') setGame(g => ({ ...g, difficulty: d }));
    else restart(d);
  };

  const onPlayerCell = (cell: number) => {
    if (!placing) return;
    setGame(placeShip(game, cell, horizontal));
  };

  const onEnemyCell = (cell: number) => {
    if (game.phase !== 'playing' || game.turn !== 'player' || game.playerShots[cell] !== 0) return;
    const next = playerFire(game, cell);
    setGame(next);
    finish(next);
  };

  const shuffle = () => setGame(g => (g.phase === 'placing' ? { ...g, player: randomFleet() } : g));
  const clearFleet = () => setGame(g => (g.phase === 'placing' ? { ...g, player: [] } : g));
  const begin = () => setGame(startBattle(game, randomFleet()));

  const playerHits = game.playerShots.filter(v => v === 2).length;
  const fired = game.playerShots.filter(v => v !== 0).length;

  let status: string;
  let tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral';
  if (placing) {
    status = nextShip
      ? `Place your ${nextShip.name} (${nextShip.size} squares). Press R or Rotate to turn it, or shuffle for a random fleet.`
      : 'Fleet ready. Start the battle when you are.';
    tone = nextShip ? 'neutral' : 'info';
  } else {
    status = game.message;
    if (game.phase === 'won') tone = 'good';
    else if (game.phase === 'lost') tone = 'bad';
    else if (aiTurn) tone = 'info';
  }

  const over = game.phase === 'won' || game.phase === 'lost';

  return (
    <GameShell
      title="Battleship"
      subtitle="Hide your fleet and hunt down theirs."
      icon={<ShipIcon size={24} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={game.difficulty}
      onDifficulty={changeDifficulty}
      score={[
        { label: 'Wins', value: scores.wins, tone: 'win' },
        { label: 'Losses', value: scores.losses, tone: 'loss' },
        { label: 'Accuracy', value: fired ? `${Math.round((playerHits / fired) * 100)}%` : '0%' },
      ]}
      status={status}
      statusTone={tone}
      onNewGame={() => restart()}
      rules={
        <>
          <p>Place five ships on your grid. Click a square to drop the next ship there, and rotate with the button or the R key. Shuffle gives you a random fleet.</p>
          <p>Then take turns firing at the enemy grid. A cross is a hit, a dot is a miss. Sink all five enemy ships before they sink yours.</p>
          <p>Use the arrow keys to move around a grid and Enter to fire.</p>
        </>
      }
    >
      {placing && (
        <div className={s.toolbar}>
          <button type="button" className={s.tool} onClick={() => setHorizontal(h => !h)} disabled={!nextShip}>
            <RotateCw size={15} strokeWidth={2.25} /> Rotate ({horizontal ? 'across' : 'down'})
          </button>
          <button type="button" className={s.tool} onClick={shuffle}>
            <Shuffle size={15} strokeWidth={2.25} /> Shuffle ships
          </button>
          <button type="button" className={s.tool} onClick={clearFleet} disabled={game.player.length === 0}>
            <Eraser size={15} strokeWidth={2.25} /> Clear
          </button>
          <button type="button" className={`${s.tool} ${s.toolPrimary}`} onClick={begin} disabled={!!nextShip}>
            <Play size={15} strokeWidth={2.25} /> Start battle
          </button>
        </div>
      )}

      <div className={s.boards}>
        <section className={s.side} aria-label="Your waters">
          <p className={s.sideTitle}>Your waters</p>
          <Axis>
            <div
              className={s.grid}
              role="grid"
              aria-label="Your fleet"
              onKeyDown={onGridKey}
              onMouseLeave={() => setHover(null)}
            >
              {game.aiShots.map((shot, i) => {
                const ship = playerCells.has(i);
                const inPreview = preview?.cells.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    data-idx={i}
                    className={s.cell}
                    data-ship={ship}
                    data-sunk={sunkPlayer.has(i)}
                    data-last={game.lastAi === i}
                    data-preview={inPreview ? (preview?.ok ? 'ok' : 'bad') : undefined}
                    aria-disabled={!placing || !nextShip}
                    aria-label={`${coord(i)}${ship ? ', your ship' : ''}${shot === 2 ? ', hit' : shot === 1 ? ', miss' : ''}`}
                    onClick={() => onPlayerCell(i)}
                    onMouseEnter={() => placing && setHover(i)}
                    onFocus={() => placing && setHover(i)}
                  >
                    <Marker shot={shot} />
                  </button>
                );
              })}
            </div>
          </Axis>
          <FleetStatus title="Your fleet" ships={game.player} shots={game.aiShots} pending={placing} />
        </section>

        <section className={s.side} aria-label="Enemy waters" data-inactive={placing}>
          <p className={s.sideTitle}>
            <Crosshair size={14} strokeWidth={2.25} /> Enemy waters
          </p>
          <Axis>
            <div
              className={s.grid}
              role="grid"
              aria-label="Enemy waters"
              aria-busy={aiTurn}
              data-target={game.phase === 'playing' && game.turn === 'player'}
              onKeyDown={onGridKey}
            >
              {game.playerShots.map((shot, i) => {
                const reveal = game.phase === 'lost' && shot === 0 && game.enemy.some(sh => sh.cells.includes(i));
                const blocked = game.phase !== 'playing' || game.turn !== 'player' || shot !== 0;
                return (
                  <button
                    key={i}
                    type="button"
                    data-idx={i}
                    className={s.cell}
                    data-enemy="true"
                    data-sunk={sunkEnemy.has(i)}
                    data-reveal={reveal}
                    data-last={game.lastPlayer === i}
                    aria-disabled={blocked}
                    aria-label={`${coord(i)}${shot === 2 ? (sunkEnemy.has(i) ? ', sunk ship' : ', hit') : shot === 1 ? ', miss' : ''}`}
                    onClick={() => onEnemyCell(i)}
                  >
                    <Marker shot={shot} />
                  </button>
                );
              })}
            </div>
          </Axis>
          <FleetStatus title="Enemy fleet" ships={placing ? [] : game.enemy} shots={game.playerShots} />
        </section>
      </div>

      {over && (
        <div className={s.endRow}>
          <button type="button" className={`${s.tool} ${s.toolPrimary}`} onClick={() => restart()}>
            <RotateCw size={15} strokeWidth={2.25} /> Play again
          </button>
        </div>
      )}
    </GameShell>
  );
}
