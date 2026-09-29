// ─── BAO LA KUJIFUNZA (the learner's Bao) ─────────────────────
// Board: 4 rows x 8 pits. Each player owns the two rows on their side:
// an inner (front) row facing the opponent and an outer (back) row.
//
// Each player's 16 pits form a loop, indexed 0..15:
//   0..7  = inner row, screen columns 0 -> 7
//   8..15 = outer row, screen columns 7 -> 0
// so sowing with dir +1 runs clockwise for the bottom player.
// Inner pit i (0..7) sits opposite the opponent's inner pit i.
//
// Rules used here:
// - Every pit starts with 2 seeds (64 in play). Seeds never leave the board.
// - A move: pick one of your pits holding 2+ seeds and a direction. Sow the
//   seeds one by one around your own loop.
// - If the last seed lands in an EMPTY pit, the turn ends.
// - If it lands in one of your INNER pits that already had seeds, and the
//   opponent's opposite inner pit is not empty, you CAPTURE those seeds.
//   Captured seeds are sown into your inner row from the nearer end (kichwa)
//   heading inward, and play continues from wherever they finish.
// - Otherwise, if it lands in an occupied pit, pick all of those seeds up and
//   keep sowing in the same direction (relay sowing).
// - You lose if your inner row is empty, or if on your turn no pit has 2+ seeds.

export type Side = 0 | 1;                // 0 = you (bottom), 1 = computer (top)
export type Board = [number[], number[]];
export type Dir = 1 | -1;
export interface Move { pos: number; dir: Dir }

export interface Frame {
  board: Board;
  hi: { side: Side; pos: number } | null;     // pit that just received a seed
  capture?: { side: Side; pos: number };        // opponent pit just emptied
}

const RING = 16;
const MAX_LAPS = 400;                     // safety cap on relay chains

export const clone = (b: Board): Board => [b[0].slice(), b[1].slice()];
export const initialBoard = (): Board => [Array(RING).fill(2), Array(RING).fill(2)];

/** Screen column of a loop position. */
export const colOf = (pos: number) => (pos < 8 ? pos : 15 - pos);
/** Loop position for an inner / outer row screen column. */
export const posOf = (inner: boolean, col: number) => (inner ? col : 15 - col);

export const legalMoves = (b: Board, side: Side): Move[] => {
  const out: Move[] = [];
  for (let pos = 0; pos < RING; pos++) if (b[side][pos] >= 2) out.push({ pos, dir: 1 }, { pos, dir: -1 });
  return out;
};

export const seedsOf = (b: Board, side: Side) => b[side].reduce((a, n) => a + n, 0);
export const innerEmpty = (b: Board, side: Side) => b[side].slice(0, 8).every(n => n === 0);

/** Play a move. Returns the final board and (optionally) every intermediate frame. */
export function play(start: Board, side: Side, move: Move, record = false): { board: Board; frames: Frame[] } {
  const b = clone(start);
  const me = b[side], opp = b[1 - side as Side];
  const frames: Frame[] = [];
  const snap = (pos: number, capture?: { side: Side; pos: number }) => {
    if (record) frames.push({ board: clone(b), hi: { side, pos }, capture });
  };

  let dir = move.dir;
  let seeds = me[move.pos];
  me[move.pos] = 0;
  let cur = move.pos;
  if (record) frames.push({ board: clone(b), hi: null });

  for (let lap = 0; lap < MAX_LAPS; lap++) {
    while (seeds > 0) {
      cur = (cur + dir + RING) % RING;
      me[cur]++;
      seeds--;
      snap(cur);
    }
    if (me[cur] === 1) break;                         // landed in an empty pit: turn over
    if (lap === MAX_LAPS - 1) break;                  // endless relay: stop with every seed on the board

    if (cur < 8 && opp[cur] > 0) {                    // capture from the opposite inner pit
      seeds = opp[cur];
      opp[cur] = 0;
      if (record) frames.push({ board: clone(b), hi: null, capture: { side: (1 - side) as Side, pos: cur } });
      // Sow the captured seeds from the nearer end of the inner row, heading inward.
      if (cur <= 3) { dir = 1; cur = 0 - dir; } else { dir = -1; cur = 7 - dir; }
      cur = (cur + RING) % RING;
      continue;
    }

    seeds = me[cur];                                  // relay: lift and keep going
    me[cur] = 0;
  }
  return { board: b, frames };
}

/** Has `side` lost, given it is now their turn? */
export const hasLost = (b: Board, side: Side) => innerEmpty(b, side) || legalMoves(b, side).length === 0;

// ─── AI ───────────────────────────────────────────────────────
const WIN = 10_000;

function evaluate(b: Board, me: Side): number {
  const opp = (1 - me) as Side;
  if (hasLost(b, opp)) return WIN;
  if (hasLost(b, me)) return -WIN;
  const inner = (s: Side) => b[s].slice(0, 8).reduce((a, n) => a + n, 0);
  // Seed balance matters most; seeds in your front row are your attack (and your lifeline).
  return (seedsOf(b, me) - seedsOf(b, opp)) + 0.25 * (inner(me) - inner(opp));
}

function search(b: Board, toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || hasLost(b, toMove)) return evaluate(b, me);
  const moves = legalMoves(b, toMove);
  const maximizing = toMove === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of moves) {
    const next = play(b, toMove, m).board;
    const v = search(next, (1 - toMove) as Side, me, depth - 1, alpha, beta);
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

export type Level = 'easy' | 'medium' | 'hard';

export function chooseMove(b: Board, side: Side, level: Level): Move | null {
  const moves = legalMoves(b, side);
  if (!moves.length) return null;
  if (level === 'easy' && Math.random() < 0.8) return moves[Math.floor(Math.random() * moves.length)];

  const depth = level === 'hard' ? 4 : 1;
  let bestScore = -Infinity;
  let best: Move[] = [];
  for (const m of moves) {
    const next = play(b, side, m).board;
    const v = depth === 1 ? evaluate(next, side) : search(next, (1 - side) as Side, side, depth - 1, -Infinity, Infinity);
    if (v > bestScore + 1e-9) { bestScore = v; best = [m]; }
    else if (Math.abs(v - bestScore) < 1e-9) best.push(m);
  }
  return best[Math.floor(Math.random() * best.length)];
}
