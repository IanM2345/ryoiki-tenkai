// Classic Mahjong for one person and three computer players (Hong Kong style, simplified).
//
// 136 tiles (no flowers). Seats 0-3 play in order 0 → 1 → 2 → 3 (you are seat 0).
// On your turn: draw a tile, then discard one (or win, or declare a kong).
// After any discard, others may claim it: Mahjong (win) beats Pung/Kong, which beat Chow,
// and only the next player may Chow.
import { type Kind, isSuited, isHonor, isTerminal, rng, shuffle } from '@/components/games/mahjong/tiles';

export type Seat = 0 | 1 | 2 | 3;
export interface T { id: number; kind: Kind }              // a physical tile (id 0-135)
export type MeldType = 'chow' | 'pung' | 'kong';
export interface Meld { type: MeldType; tiles: T[]; concealed?: boolean; from?: Seat; claimed?: number }
export interface Player { hand: T[]; melds: Meld[]; river: T[]; claimedFromRiver: number[] }
export type Level = 'easy' | 'medium' | 'hard';

export interface Win {
  seat: Seat; selfDrawn: boolean; from?: Seat; tile: T;
  faan: number; items: [string, number][]; name: string;
}
export interface State {
  wall: T[];
  players: Player[];
  dealer: Seat;
  turn: Seat;
  /** 'discard': turn player has 14 tiles and must discard. 'claim': a discard is waiting for claims. */
  phase: 'discard' | 'claim' | 'over';
  drawn: T | null;                       // the tile just drawn (shown apart in your hand)
  last: { tile: T; from: Seat } | null;  // the discard on the table
  win: Win | null;
  log: string[];
}

export const SEAT_NAME = ['You', 'Computer (right)', 'Computer (across)', 'Computer (left)'];
export const WIND_NAME = ['East', 'South', 'West', 'North'];
export const seatWind = (st: Pick<State, 'dealer'>, seat: Seat) => ((seat - st.dealer + 4) % 4);
export const next = (s: Seat) => ((s + 1) % 4) as Seat;
const ROUND_WIND = 0; // East round

// ── counting helpers ───────────────────────────────────────────────
export function counts(tiles: { kind: Kind }[]): number[] {
  const c = new Array<number>(34).fill(0);
  for (const t of tiles) c[t.kind]++;
  return c;
}
export const sortHand = (h: T[]) => [...h].sort((a, b) => a.kind - b.kind || a.id - b.id);

// ── shanten: how many tiles away from ready (0 = ready/tenpai, -1 = complete) ──
function shantenStd(c: number[], melds: number): number {
  let best = 8;
  const dfs = (i: number, sets: number, tats: number, pair: boolean) => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const s = sets + melds;
      const v = 8 - 2 * s - Math.min(tats, 4 - s) - (pair ? 1 : 0);
      if (v < best) best = v;
      return;
    }
    if (c[i] >= 3) { c[i] -= 3; dfs(i, sets + 1, tats, pair); c[i] += 3; }
    const suited = i < 27, r = i % 9;
    if (suited && r <= 6 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; dfs(i, sets + 1, tats, pair); c[i]++; c[i + 1]++; c[i + 2]++; }
    if (!pair && c[i] >= 2) { c[i] -= 2; dfs(i, sets, tats, true); c[i] += 2; }
    if (c[i] >= 2) { c[i] -= 2; dfs(i, sets, tats + 1, pair); c[i] += 2; }
    if (suited && r <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; dfs(i, sets, tats + 1, pair); c[i]++; c[i + 1]++; }
    if (suited && r <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; dfs(i, sets, tats + 1, pair); c[i]++; c[i + 2]++; }
    c[i]--; dfs(i, sets, tats, pair); c[i]++;
  };
  dfs(0, 0, 0, false);
  return best;
}
function shantenPairs(c: number[]): number {
  let pairs = 0, kinds = 0;
  for (const n of c) { if (n >= 2) pairs++; if (n > 0) kinds++; }
  return 6 - pairs + Math.max(0, 7 - kinds);
}
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
function shantenOrphans(c: number[]): number {
  let uniq = 0, pair = false;
  for (const k of ORPHANS) { if (c[k]) uniq++; if (c[k] >= 2) pair = true; }
  return 13 - uniq - (pair ? 1 : 0);
}
export function shanten(c: number[], melds: number): number {
  const std = shantenStd(c.slice(), melds);
  if (melds > 0) return std;
  return Math.min(std, shantenPairs(c), shantenOrphans(c));
}
export const isComplete = (c: number[], melds: number) => shanten(c, melds) === -1;

/** Kinds that would complete the hand, and how many of each are still unseen (seen = tiles visible elsewhere). */
export function waits(c: number[], melds: number, seen?: number[]): { kind: Kind; left: number }[] {
  const out: { kind: Kind; left: number }[] = [];
  if (shanten(c, melds) !== 0) return out;
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (isComplete(c, melds)) out.push({ kind: k, left: Math.max(0, 4 - (c[k] - 1) - (seen?.[k] ?? 0)) });
    c[k]--;
  }
  return out;
}

// ── decomposition and scoring ───────────────────────────────────────
type Set3 = { type: 'pung' | 'chow'; kind: Kind };
function decompose(c: number[], need: number): { pair: Kind; sets: Set3[] }[] {
  const out: { pair: Kind; sets: Set3[] }[] = [];
  const rec = (sets: Set3[], i: number) => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) { if (sets.length === need) out.push({ pair: -1, sets: [...sets] }); return; }
    if (c[i] >= 3) { c[i] -= 3; sets.push({ type: 'pung', kind: i }); rec(sets, i); sets.pop(); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ type: 'chow', kind: i }); rec(sets, i); sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const before = out.length;
    rec([], 0);
    for (let k = before; k < out.length; k++) out[k].pair = p;
    c[p] += 2;
  }
  return out;
}

export function scoreWin(p: Player, extra: T | null, selfDrawn: boolean, seatW: number, lastTile: boolean): { faan: number; items: [string, number][]; name: string } {
  const tiles = extra ? [...p.hand, extra] : p.hand;
  const c = counts(tiles);
  const exposed = p.melds.filter(m => !m.concealed).length;
  const options: { faan: number; items: [string, number][]; name: string }[] = [];
  const common: [string, number][] = [];
  if (selfDrawn) common.push(['Self-drawn', 1]);
  if (exposed === 0) common.push(['Concealed hand', 1]);
  if (lastTile) common.push(['Won on the last tile', 1]);

  const allKinds = [...tiles.map(t => t.kind), ...p.melds.flatMap(m => m.tiles.map(t => t.kind))];
  const suits = new Set(allKinds.filter(isSuited).map(k => Math.floor(k / 9)));
  const honors = allKinds.some(isHonor);
  const flush: [string, number][] =
    suits.size === 0 ? [['All honours', 10]] :
    suits.size === 1 && !honors ? [['Full flush (one suit)', 7]] :
    suits.size === 1 ? [['Half flush (one suit + honours)', 3]] : [];

  if (p.melds.length === 0 && shantenOrphans(c) === -1) options.push({ faan: 13, items: [['Thirteen orphans', 13]], name: 'Thirteen Orphans' });
  if (p.melds.length === 0 && shantenPairs(c) === -1) {
    const items: [string, number][] = [...common, ['Seven pairs', 4], ...flush];
    options.push({ faan: items.reduce((a, [, n]) => a + n, 0), items, name: 'Seven Pairs' });
  }
  for (const d of decompose(c.slice(), 4 - p.melds.length)) {
    const sets: Set3[] = [...d.sets, ...p.melds.map(m => ({ type: m.type === 'chow' ? 'chow' as const : 'pung' as const, kind: m.tiles[0].kind }))];
    const items: [string, number][] = [...common];
    const valuePair = d.pair >= 31 || d.pair === 27 + seatW || d.pair === 27 + ROUND_WIND;
    if (sets.every(x => x.type === 'chow') && !valuePair) items.push(['All chows', 1]);
    if (sets.every(x => x.type === 'pung')) items.push(['All pungs', 3]);
    items.push(...flush);
    for (const x of sets) if (x.type === 'pung') {
      if (x.kind >= 31) items.push([['Red', 'Green', 'White'][x.kind - 31] + ' dragon pung', 1]);
      if (x.kind === 27 + seatW) items.push([`Seat wind pung (${WIND_NAME[seatW]})`, 1]);
      if (x.kind === 27 + ROUND_WIND) items.push(['Round wind pung (East)', 1]);
    }
    const faan = items.reduce((a, [, n]) => a + n, 0);
    // Name it after its biggest scoring item; a hand with nothing extra is a "chicken hand".
    const top = [...items].filter(([n]) => !/Self-drawn|Concealed|last tile/.test(n)).sort((a, b) => b[1] - a[1])[0];
    const name = top ? top[0].replace(/ \(.*\)$/, '') : faan === 0 ? 'Chicken hand' : 'Mahjong';
    options.push({ faan, items, name });
  }
  options.sort((a, b) => b.faan - a.faan);
  return options[0] ?? { faan: 0, items: [], name: 'Mahjong' };
}

// ── setting up a hand ───────────────────────────────────────────────
export function newHand(dealer: Seat, seed: number): State {
  const rand = rng(seed);
  const wall = shuffle(Array.from({ length: 136 }, (_, id) => ({ id, kind: Math.floor(id / 4) })), rand);
  const players: Player[] = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], river: [], claimedFromRiver: [] }));
  for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) players[(dealer + s) % 4].hand.push(wall.pop()!);
  const drawn = wall.pop()!;
  players[dealer].hand.push(drawn);
  players.forEach(p => { p.hand = sortHand(p.hand); });
  return { wall, players, dealer, turn: dealer, phase: 'discard', drawn, last: null, win: null, log: [`${SEAT_NAME[dealer]} ${dealer === 0 ? 'are' : 'is'} East and start${dealer === 0 ? '' : 's'}.`] };
}

const clone = (st: State): State => structuredClone(st);
const kindsOf = (h: T[]) => counts(h);

// ── what a player can do ────────────────────────────────────────────
export interface SelfOptions { win: boolean; kongs: Kind[] }
export function selfOptions(st: State, seat: Seat): SelfOptions {
  const p = st.players[seat];
  const c = kindsOf(p.hand);
  // You can only win "self-drawn" with a tile you just drew (claimed tiles are won with Mahjong on the discard).
  const win = st.drawn !== null && st.turn === seat && isComplete(c, p.melds.length);
  const kongs: Kind[] = [];
  if (st.wall.length > 0) {
    for (let k = 0; k < 34; k++) if (c[k] === 4) kongs.push(k);
    for (const m of p.melds) if (m.type === 'pung' && c[m.tiles[0].kind] >= 1) kongs.push(m.tiles[0].kind);
  }
  return { win, kongs };
}

export interface ClaimOptions { win: boolean; pung: boolean; kong: boolean; chows: [Kind, Kind][] }
export function claimOptions(st: State, seat: Seat): ClaimOptions {
  const none = { win: false, pung: false, kong: false, chows: [] };
  if (!st.last || st.last.from === seat) return none;
  const p = st.players[seat], k = st.last.tile.kind;
  const c = kindsOf(p.hand);
  const win = (() => { c[k]++; const w = isComplete(c, p.melds.length); c[k]--; return w; })();
  const pung = c[k] >= 2;
  const kong = c[k] >= 3 && st.wall.length > 0;
  const chows: [Kind, Kind][] = [];
  if (seat === next(st.last.from) && isSuited(k)) {
    const r = k % 9;
    if (r >= 2 && c[k - 2] && c[k - 1]) chows.push([k - 2, k - 1]);
    if (r >= 1 && r <= 7 && c[k - 1] && c[k + 1]) chows.push([k - 1, k + 1]);
    if (r <= 6 && c[k + 1] && c[k + 2]) chows.push([k + 1, k + 2]);
  }
  return { win, pung, kong, chows };
}

// ── actions (each returns a new state) ──────────────────────────────
function takeFromHand(p: Player, kind: Kind, n: number): T[] {
  const out: T[] = [];
  for (let i = p.hand.length - 1; i >= 0 && out.length < n; i--) if (p.hand[i].kind === kind) out.push(...p.hand.splice(i, 1));
  return out;
}

export function discard(st0: State, seat: Seat, tileId: number): State {
  const st = clone(st0);
  const p = st.players[seat];
  const i = p.hand.findIndex(t => t.id === tileId);
  if (i < 0) return st0;
  const [t] = p.hand.splice(i, 1);
  p.hand = sortHand(p.hand);
  p.river.push(t);
  st.last = { tile: t, from: seat };
  st.drawn = null;
  st.phase = 'claim';
  return st;
}

/** Nobody claimed: the next player draws. Ends in a draw if the wall is empty. */
export function passToNext(st0: State): State {
  const st = clone(st0);
  if (st.wall.length === 0) { st.phase = 'over'; st.win = null; st.log.push('The wall is empty. This hand is a draw.'); return st; }
  const s = next(st.last!.from);
  const t = st.wall.pop()!;
  st.players[s].hand.push(t);
  st.turn = s; st.drawn = t; st.phase = 'discard';
  return st;
}

export function claim(st0: State, seat: Seat, type: 'pung' | 'kong' | 'chow', chow?: [Kind, Kind]): State {
  const st = clone(st0);
  const { tile, from } = st.last!;
  const p = st.players[seat];
  const giver = st.players[from];
  giver.claimedFromRiver.push(giver.river.length - 1);
  let tiles: T[];
  if (type === 'chow') tiles = [...takeFromHand(p, chow![0], 1), tile, ...takeFromHand(p, chow![1], 1)];
  else tiles = [...takeFromHand(p, tile.kind, type === 'kong' ? 3 : 2), tile];
  tiles.sort((a, b) => a.kind - b.kind);
  p.melds.push({ type, tiles, from, claimed: tile.id });
  st.turn = seat; st.last = null; st.phase = 'discard'; st.drawn = null;
  st.log.push(`${SEAT_NAME[seat]} ${seat === 0 ? 'claim' : 'claims'} a ${type}.`);
  if (type === 'kong') {
    const t = st.wall.shift()!; // replacement tile from the back of the wall
    p.hand.push(t); st.drawn = t;
  }
  p.hand = sortHand(p.hand.filter(t => t.id !== st.drawn?.id)).concat(st.drawn ? [st.drawn] : []);
  return st;
}

/** Concealed kong (four in hand) or adding the fourth tile to an exposed pung. */
export function declareKong(st0: State, seat: Seat, kind: Kind): State {
  const st = clone(st0);
  const p = st.players[seat];
  const pung = p.melds.find(m => m.type === 'pung' && m.tiles[0].kind === kind);
  if (pung) { pung.type = 'kong'; pung.tiles.push(...takeFromHand(p, kind, 1)); }
  else p.melds.push({ type: 'kong', tiles: takeFromHand(p, kind, 4), concealed: true });
  const t = st.wall.shift()!;
  p.hand = sortHand(p.hand);
  p.hand.push(t);
  st.drawn = t;
  st.log.push(`${SEAT_NAME[seat]} ${seat === 0 ? 'declare' : 'declares'} a kong.`);
  return st;
}

export function declareWin(st0: State, seat: Seat, selfDrawn: boolean): State {
  const st = clone(st0);
  const p = st.players[seat];
  const tile = selfDrawn ? (st.drawn ?? p.hand[p.hand.length - 1]) : st.last!.tile;
  if (!selfDrawn) {
    const g = st.players[st.last!.from];
    g.claimedFromRiver.push(g.river.length - 1);
    p.hand.push(tile);
  }
  const sc = scoreWin({ ...p, hand: p.hand.filter(t => t.id !== tile.id) }, tile, selfDrawn, seatWind(st, seat), st.wall.length === 0);
  st.win = { seat, selfDrawn, from: selfDrawn ? undefined : st.last!.from, tile, ...sc };
  st.phase = 'over';
  st.log.push(`${SEAT_NAME[seat]} ${seat === 0 ? 'win' : 'wins'}!`);
  return st;
}

/** Resolve everyone's claims on the current discard by priority. */
export type Claim = { seat: Seat; type: 'win' | 'kong' | 'pung' | 'chow'; chow?: [Kind, Kind] };
export function resolveClaims(st: State, claims: Claim[]): State {
  if (!claims.length) return passToNext(st);
  const from = st.last!.from;
  const dist = (s: Seat) => (s - from + 4) % 4;
  const prio = { win: 3, kong: 2, pung: 2, chow: 1 };
  const best = [...claims].sort((a, b) => prio[b.type] - prio[a.type] || dist(a.seat) - dist(b.seat))[0];
  if (best.type === 'win') return declareWin(st, best.seat, false);
  return claim(st, best.seat, best.type, best.chow);
}

// ── the computer players ────────────────────────────────────────────
function visibleCounts(st: State, seat: Seat): number[] {
  const c = new Array<number>(34).fill(0);
  st.players.forEach((p, s) => {
    p.river.forEach(t => c[t.kind]++);
    p.melds.forEach(m => m.tiles.forEach(t => c[t.kind]++));
    if (s === seat) p.hand.forEach(t => c[t.kind]++);
  });
  return c;
}
function ukeire(c: number[], melds: number, seen: number[]): number {
  const base = shanten(c, melds);
  let n = 0;
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (shanten(c, melds) < base) n += Math.max(0, 4 - seen[k]);
    c[k]--;
  }
  return n;
}
/** Players who look close to winning (3+ melds, or someone who just went quiet). */
function threats(st: State, seat: Seat): Seat[] {
  return ([0, 1, 2, 3] as Seat[]).filter(s => s !== seat && st.players[s].melds.filter(m => !m.concealed).length >= 3);
}
function danger(st: State, k: Kind, against: Seat[], me: Seat): number {
  let d = 0;
  for (const s of against) {
    if (st.players[s].river.some(t => t.kind === k)) continue;       // they threw it: safe against them
    const seen = visibleCounts(st, me)[k];
    d += isHonor(k) ? (seen >= 3 ? 0 : 1) : isTerminal(k) ? 2 : 3;
  }
  return d;
}

/** Which tile a player should throw. Also used as the "suggested discard" hint for you. */
export function bestDiscard(st: State, seat: Seat, level: Level, rand: () => number = Math.random): T {
  const p = st.players[seat];
  const c = kindsOf(p.hand);
  const seen = visibleCounts(st, seat);
  const kinds = [...new Set(p.hand.map(t => t.kind))];
  const scored = kinds.map(k => {
    c[k]--;
    const sh = shanten(c, p.melds.length);
    const uk = level === 'easy' ? 0 : ukeire(c, p.melds.length, seen);
    c[k]++;
    // keep value honours a little longer (dragons, own wind, round wind)
    const valuable = k >= 31 || k === 27 + seatWind(st, seat) || k === 27 + ROUND_WIND;
    const pairBonus = valuable && c[k] >= 2 ? 1 : 0;
    return { k, sh, uk, pairBonus };
  });
  const minSh = Math.min(...scored.map(x => x.sh));
  let pool = scored.filter(x => x.sh === minSh);
  if (level === 'easy') {
    const loose = scored.filter(x => x.sh <= minSh + 1);
    pool = rand() < 0.35 ? loose : pool;
    const pick = pool[Math.floor(rand() * pool.length)];
    return p.hand.find(t => t.kind === pick.k)!;
  }
  const th = level === 'hard' ? threats(st, seat) : [];
  pool.sort((a, b) =>
    (th.length && minSh >= 1 ? danger(st, a.k, th, seat) - danger(st, b.k, th, seat) : 0) ||
    b.uk - a.uk || a.pairBonus - b.pairBonus ||
    // prefer throwing isolated honours and terminals first
    (isHonor(b.k) ? 2 : isTerminal(b.k) ? 1 : 0) - (isHonor(a.k) ? 2 : isTerminal(a.k) ? 1 : 0));
  return p.hand.find(t => t.kind === pool[0].k)!;
}

/** A computer player's decision about the tile on the table. */
export function aiClaim(st: State, seat: Seat, level: Level, rand: () => number = Math.random): Claim | null {
  const o = claimOptions(st, seat);
  if (o.win) return level === 'easy' && rand() < 0.15 ? null : { seat, type: 'win' };
  const p = st.players[seat], k = st.last!.tile.kind;
  const c = kindsOf(p.hand);
  const now = shanten(c, p.melds.length);
  const after = (rem: Kind[], melds: number) => {
    rem.forEach(x => c[x]--);
    // after claiming they discard one; the best possible shanten after that
    let best = 9;
    for (let d = 0; d < 34; d++) if (c[d]) { c[d]--; best = Math.min(best, shanten(c, melds)); c[d]++; }
    rem.forEach(x => c[x]++);
    return best;
  };
  const valuable = k >= 31 || k === 27 + seatWind(st, seat) || k === 27 + ROUND_WIND;
  if (o.kong && level !== 'easy' && after([k, k, k], p.melds.length + 1) <= now) return { seat, type: 'kong' };
  if (o.pung) {
    const better = after([k, k], p.melds.length + 1) < now;
    if (level === 'easy' ? rand() < 0.55 : better || (valuable && now <= 3)) return { seat, type: 'pung' };
  }
  if (o.chows.length && level !== 'easy') {
    for (const ch of o.chows) if (after([ch[0], ch[1]], p.melds.length + 1) < now && (level === 'medium' || now <= 2)) return { seat, type: 'chow', chow: ch };
  } else if (o.chows.length && rand() < 0.4) return { seat, type: 'chow', chow: o.chows[0] };
  return null;
}

/** A computer player's choice after drawing: win, kong, or nothing. */
export function aiSelf(st: State, seat: Seat, level: Level): { type: 'win' } | { type: 'kong'; kind: Kind } | null {
  const o = selfOptions(st, seat);
  if (o.win) return { type: 'win' };
  if (o.kongs.length && level !== 'easy') {
    const p = st.players[seat], c = kindsOf(p.hand);
    const now = shanten(c, p.melds.length);
    for (const k of o.kongs) {
      const n = c[k] === 4 ? 4 : 1; c[k] -= n;
      const sh = shanten(c, p.melds.length + (n === 4 ? 1 : 0));
      c[k] += n;
      if (sh <= now) return { type: 'kong', kind: k };
    }
  }
  return null;
}
