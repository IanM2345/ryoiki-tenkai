// Mahjong Solitaire: layouts, the "free tile" rule, and deals that can always be cleared.
//
// Positions use half-tile units: a tile at (x, y) covers x..x+2 and y..y+2, so tiles can sit
// half a tile apart. z is the layer (0 = table).
import { type Kind, rng, shuffle, solitaireMatch } from '@/components/games/mahjong/tiles';

export interface Pos { x: number; y: number; z: number }
export interface Layout { key: string; name: string; positions: Pos[] }

function rect(z: number, c0: number, c1: number, r0: number, r1: number, dx = 0, dy = 0): Pos[] {
  const out: Pos[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push({ x: c * 2 + dx, y: r * 2 + dy, z });
  return out;
}
function rows(z: number, spec: [number, number, number][]): Pos[] {
  // [row, firstCol, lastCol]
  return spec.flatMap(([r, a, b]) => rect(z, a, b, r, r));
}

/** The classic Turtle: 144 tiles. */
const TURTLE: Pos[] = [
  ...rows(0, [[0, 0, 11], [1, 2, 9], [2, 1, 10], [3, 0, 11], [4, 0, 11], [5, 1, 10], [6, 2, 9], [7, 0, 11]]),
  { x: -2, y: 7, z: 0 }, { x: 24, y: 7, z: 0 }, { x: 26, y: 7, z: 0 },
  ...rect(1, 3, 8, 1, 6),
  ...rect(2, 4, 7, 2, 5),
  ...rect(3, 5, 6, 3, 4),
  { x: 11, y: 7, z: 4 },
];

/** A smaller pyramid for a gentler game: 82 tiles. */
const PYRAMID: Pos[] = [
  ...rect(0, 0, 7, 0, 5),
  ...rect(1, 1, 6, 1, 4),
  ...rect(2, 2, 5, 2, 3),
  { x: 6, y: 5, z: 3 }, { x: 8, y: 5, z: 3 },
];

export const LAYOUTS: Record<string, Layout> = {
  pyramid: { key: 'pyramid', name: 'Pyramid', positions: PYRAMID },
  turtle: { key: 'turtle', name: 'Turtle', positions: TURTLE },
};

/** Every tile in a full set: 4 of each of the 34 kinds, plus the 8 flowers and seasons. */
function fullPairs(): [Kind, Kind][] {
  const pairs: [Kind, Kind][] = [];
  for (let k = 0; k < 34; k++) { pairs.push([k, k]); pairs.push([k, k]); }
  pairs.push([34, 35], [36, 37], [38, 39], [40, 41]);
  return pairs;
}

const overlaps = (a: Pos, b: Pos) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

/**
 * Index of which positions touch which, so "is it free?" is quick.
 * above[i]: positions one layer up that overlap i. left[i]/right[i]: same-layer neighbours.
 */
export interface Graph { above: number[][]; left: number[][]; right: number[][] }
export function buildGraph(pos: Pos[]): Graph {
  const n = pos.length, above: number[][] = [], left: number[][] = [], right: number[][] = [];
  for (let i = 0; i < n; i++) {
    above.push([]); left.push([]); right.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = pos[i], b = pos[j];
      if (b.z === a.z + 1 && overlaps(a, b)) above[i].push(j);
      else if (b.z === a.z && Math.abs(a.y - b.y) < 2) {
        if (b.x === a.x - 2) left[i].push(j);
        else if (b.x === a.x + 2) right[i].push(j);
      }
    }
  }
  return { above, left, right };
}

/** Free = nothing on top, and nothing on the left or nothing on the right. */
export function isFree(g: Graph, i: number, present: ArrayLike<boolean>): boolean {
  if (!present[i]) return false;
  for (const j of g.above[i]) if (present[j]) return false;
  const leftOpen = g.left[i].every(j => !present[j]);
  const rightOpen = g.right[i].every(j => !present[j]);
  return leftOpen || rightOpen;
}

/**
 * Deal kinds onto the given positions so that the board can always be cleared.
 * Works backwards: start with an empty table and repeatedly put down two tiles that would be
 * free at that moment. Playing forwards then removes them in the reverse order.
 */
export function deal(pos: Pos[], which: number[], kinds: [Kind, Kind][], seed: number, orderOut?: [number, number][]): Map<number, Kind> | null {
  const g = buildGraph(pos);
  const inSet = new Array<boolean>(pos.length).fill(false);
  which.forEach(i => { inSet[i] = true; });
  const rand = rng(seed);
  for (let attempt = 0; attempt < 400; attempt++) {
    const placed = new Array<boolean>(pos.length).fill(false);
    const left = new Set(which);
    const order: [number, number][] = [];
    let ok = true;
    while (left.size) {
      // Candidates: positions whose support below is already down (no floating tiles).
      const cands = [...left].filter(i => pos[i].z === 0 || below(pos, i, placed, inSet));
      // Try pairs, preferring tiles next to ones already placed (grows rows from the inside out).
      const scored = shuffle(cands, rand).map(i => ({ i, w: neighbours(g, i, placed) + rand() * 0.9 + pos[i].z * 0.3 }));
      scored.sort((a, b) => b.w - a.w);
      let found: [number, number] | null = null;
      outer:
      for (let a = 0; a < Math.min(scored.length, 14); a++) {
        for (let b = a + 1; b < Math.min(scored.length, 22); b++) {
          const i = scored[a].i, j = scored[b].i;
          placed[i] = placed[j] = true;
          const good = isFree(g, i, placed) && isFree(g, j, placed) && noTrap(g, pos, placed, left, i, j);
          if (good) { found = [i, j]; break outer; }
          placed[i] = placed[j] = false;
        }
      }
      if (!found) { ok = false; break; }
      left.delete(found[0]); left.delete(found[1]);
      order.push(found);
    }
    if (!ok) continue;
    const pk = shuffle(kinds, rand);
    const out = new Map<number, Kind>();
    order.forEach(([i, j], n) => { out.set(i, pk[n][0]); out.set(j, pk[n][1]); });
    if (orderOut) orderOut.push(...order);
    return out;
  }
  return null;
}
function below(pos: Pos[], i: number, placed: boolean[], inSet: boolean[]): boolean {
  const p = pos[i];
  for (let j = 0; j < pos.length; j++) if (inSet[j] && pos[j].z === p.z - 1 && overlaps(p, pos[j]) && !placed[j]) return false;
  return true;
}
function neighbours(g: Graph, i: number, placed: boolean[]): number {
  return g.left[i].filter(j => placed[j]).length + g.right[i].filter(j => placed[j]).length;
}
/** Don't leave a gap that could only be filled by a tile with tiles on both sides. */
function noTrap(g: Graph, pos: Pos[], placed: boolean[], left: Set<number>, i: number, j: number): boolean {
  for (const k of [...g.left[i], ...g.right[i], ...g.left[j], ...g.right[j]]) {
    if (placed[k] || !left.has(k)) continue;
    const lClosed = g.left[k].some(m => placed[m]), rClosed = g.right[k].some(m => placed[m]);
    if (lClosed && rClosed) return false;
  }
  return true;
}

export interface Game {
  layout: string;
  pos: Pos[];
  kind: Kind[];         // kind at each position
  present: boolean[];   // still on the board
}

export function newGame(layoutKey: string, seed: number): Game {
  const layout = LAYOUTS[layoutKey] ?? LAYOUTS.turtle;
  const pos = layout.positions;
  const all = fullPairs();
  const need = pos.length / 2;
  const kinds = need >= all.length ? all : shuffle(all, rng(seed ^ 0x9e3779b9)).slice(0, need);
  const m = deal(pos, pos.map((_, i) => i), kinds, seed);
  if (!m) throw new Error('Could not deal this layout');
  return { layout: layout.key, pos, kind: pos.map((_, i) => m.get(i)!), present: pos.map(() => true) };
}

/** All pairs that can be taken right now. */
export function availablePairs(game: Game, g: Graph): [number, number][] {
  const free = game.pos.map((_, i) => i).filter(i => isFree(g, i, game.present));
  const out: [number, number][] = [];
  for (let a = 0; a < free.length; a++)
    for (let b = a + 1; b < free.length; b++)
      if (solitaireMatch(game.kind[free[a]], game.kind[free[b]])) out.push([free[a], free[b]]);
  return out;
}

/** Shuffle the tiles still on the board into a new arrangement that can still be cleared. */
export function reshuffle(game: Game, seed: number): Game {
  const idx = game.pos.map((_, i) => i).filter(i => game.present[i]);
  // Re-pair the remaining tiles (flowers with flowers, seasons with seasons, the rest by kind).
  const groups = new Map<string, Kind[]>();
  for (const i of idx) {
    const k = game.kind[i];
    const key = k >= 38 ? 'S' : k >= 34 ? 'F' : String(k);
    groups.set(key, [...(groups.get(key) ?? []), k]);
  }
  const pairs: [Kind, Kind][] = [];
  for (const arr of groups.values()) for (let i = 0; i + 1 < arr.length; i += 2) pairs.push([arr[i], arr[i + 1]]);
  const m = deal(game.pos, idx, pairs, seed);
  if (!m) return game;
  return { ...game, kind: game.kind.map((k, i) => m.get(i) ?? k) };
}
