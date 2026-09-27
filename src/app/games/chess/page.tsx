'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Crown, X } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { recordResult } from '@/lib/games';
import s from './chess.module.css';

/* ── chess.js 0.10.3, loaded once from the CDN ─────────────────────────── */

type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type PromoType = 'q' | 'r' | 'b' | 'n';

interface Piece { type: PieceType; color: Color }

interface VerboseMove {
  color: Color;
  from: string;
  to: string;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PromoType;
  flags: string;
  san: string;
}

interface ChessGame {
  move: (move: { from: string; to: string; promotion?: PromoType }) => VerboseMove | null;
  undo: () => VerboseMove | null;
  moves: (opts: { verbose: true; square?: string }) => VerboseMove[];
  fen: () => string;
  in_checkmate: () => boolean;
  in_draw: () => boolean;
  in_stalemate: () => boolean;
  insufficient_material: () => boolean;
  in_threefold_repetition: () => boolean;
  in_check: () => boolean;
  turn: () => Color;
  board: () => (Piece | null)[][];
  history: (opts: { verbose: true }) => VerboseMove[];
}

type ChessCtor = new (fen?: string) => ChessGame;

let chessLoader: Promise<ChessCtor> | null = null;

/** Load the bundled chess.js once (no outside website needed). */
function loadChess(): Promise<ChessCtor> {
  if (!chessLoader) {
    chessLoader = import('chess.js')
      .then(mod => {
        const m = mod as unknown as { Chess?: ChessCtor; default?: { Chess?: ChessCtor } };
        const Ctor = m.Chess ?? m.default?.Chess;
        if (!Ctor) throw new Error('chess.js missing');
        return Ctor;
      })
      .catch(err => { chessLoader = null; throw err; });
  }
  return chessLoader;
}

/* ── Engine: alpha-beta over a private copy of the position ─────────────── */

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', hint: 'Loose, often random moves' },
  { key: 'medium', label: 'Medium', hint: 'Looks two moves ahead' },
  { key: 'hard', label: 'Hard', hint: 'Looks three moves ahead' },
];

const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
const MATE = 100000;

const VAL: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece square tables, index 0 = a8 from White's point of view.
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** Static score from White's point of view. */
function evaluate(g: ChessGame): number {
  const board = g.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const idx = p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const v = VAL[p.type] + PST[p.type][idx];
      score += p.color === 'w' ? v : -v;
    }
  }
  return score;
}

/** Captures (most valuable victim first) and promotions before quiet moves. */
function orderMoves(moves: VerboseMove[]): VerboseMove[] {
  const key = (m: VerboseMove) =>
    (m.captured ? 1000 + 10 * VAL[m.captured] - VAL[m.piece] : 0) + (m.promotion ? 800 : 0);
  return moves
    .map(m => ({ m, k: key(m) }))
    .sort((a, b) => b.k - a.k)
    .map(x => x.m);
}

function play(g: ChessGame, m: VerboseMove) {
  return g.move({ from: m.from, to: m.to, promotion: m.promotion });
}

/** Negamax with alpha-beta. Every move is taken back with undo() so the position is always restored. */
function negamax(g: ChessGame, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return (g.turn() === 'w' ? 1 : -1) * evaluate(g);
  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return g.in_check() ? -MATE + ply : 0;
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    play(g, m);
    const v = -negamax(g, depth - 1, -beta, -alpha, ply + 1);
    g.undo();
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const nextTick = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * Pick a move for the side to move. Runs on a copy of the position and yields
 * to the browser between root moves, so the page stays responsive.
 */
async function findMove(Ctor: ChessCtor, fen: string, difficulty: Difficulty, cancelled: () => boolean) {
  const g = new Ctor(fen);
  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return null;
  if (difficulty === 'easy' && Math.random() < 0.4) return moves[Math.floor(Math.random() * moves.length)];

  // Shuffle first so equal moves vary from game to game, then order.
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  const depth = DEPTH[difficulty];
  let best = moves[0];
  let bestVal = -Infinity;
  for (const m of orderMoves(moves)) {
    play(g, m);
    const v = -negamax(g, depth - 1, -Infinity, -bestVal, 1);
    g.undo();
    if (v > bestVal) { bestVal = v; best = m; }
    await nextTick();
    if (cancelled()) return null;
  }
  return best;
}

/* ── Board helpers ─────────────────────────────────────────────────────── */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const SQUARES = RANKS.flatMap(r => FILES.map(f => f + r));

// Solid glyphs for both sides (coloured by CSS). U+FE0E asks for text, not emoji, rendering.
const GLYPH: Record<PieceType, string> = {
  k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎',
};
const NAME: Record<PieceType, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PROMOS: PromoType[] = ['q', 'r', 'b', 'n'];

type Outcome = { result: 'win' | 'loss' | 'draw'; reason: string };

interface Snap {
  board: (Piece | null)[][];
  turn: Color;
  inCheck: boolean;
  history: VerboseMove[];
  over: Outcome | null;
}

function outcomeOf(g: ChessGame): Outcome | null {
  if (g.in_checkmate()) {
    return g.turn() === 'b'
      ? { result: 'win', reason: 'Checkmate! You win.' }
      : { result: 'loss', reason: 'Checkmate. The computer wins this one.' };
  }
  if (g.in_stalemate()) return { result: 'draw', reason: 'Stalemate, so it is a draw.' };
  if (g.insufficient_material()) return { result: 'draw', reason: 'Not enough pieces left to mate, so it is a draw.' };
  if (g.in_threefold_repetition()) return { result: 'draw', reason: 'Same position three times, so it is a draw.' };
  if (g.in_draw()) return { result: 'draw', reason: 'Fifty moves without a capture or pawn move, so it is a draw.' };
  return null;
}

function snapshot(g: ChessGame): Snap {
  return {
    board: g.board(),
    turn: g.turn(),
    inCheck: g.in_check(),
    history: g.history({ verbose: true }),
    over: outcomeOf(g),
  };
}

function pieceAt(snap: Snap, sq: string): Piece | null {
  const f = sq.charCodeAt(0) - 97;
  const r = 8 - Number(sq[1]);
  return snap.board[r]?.[f] ?? null;
}

function stepSquare(sq: string, key: string): string | null {
  let f = sq.charCodeAt(0) - 97;
  let r = Number(sq[1]);
  if (key === 'ArrowLeft') f--;
  else if (key === 'ArrowRight') f++;
  else if (key === 'ArrowUp') r++;
  else if (key === 'ArrowDown') r--;
  else return null;
  if (f < 0 || f > 7 || r < 1 || r > 8) return null;
  return FILES[f] + r;
}

function CapturedRow({ pieces, color, label }: { pieces: PieceType[]; color: Color; label: string }) {
  const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  const sorted = [...pieces].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className={s.capRow}>
      <span className={s.capLabel}>{label}</span>
      <span className={s.capPieces} data-color={color} aria-label={sorted.length ? sorted.map(p => NAME[p]).join(', ') : 'none'}>
        {sorted.length === 0 ? <span className={s.capNone}>None yet</span> : sorted.map((p, i) => <span key={i}>{GLYPH[p]}</span>)}
      </span>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ChessPage() {
  const [Ctor, setCtor] = useState<ChessCtor | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [gameId, setGameId] = useState(0);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<VerboseMove[]>([]);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [focusSq, setFocusSq] = useState('e2');
  const [scores, setScores] = useState({ wins: 0, draws: 0, losses: 0 });

  const gameRef = useRef<ChessGame | null>(null);
  const recordedRef = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const difficultyRef = useRef<Difficulty>(difficulty);

  const newGame = useCallback((C: ChessCtor) => {
    const g = new C();
    gameRef.current = g;
    setGameId(id => id + 1);
    setSnap(snapshot(g));
    setSelected(null);
    setTargets([]);
    setPromo(null);
  }, []);

  const attemptLoad = useCallback(() => {
    loadChess()
      .then(C => { setLoadError(false); setCtor(() => C); newGame(C); })
      .catch(() => setLoadError(true));
  }, [newGame]);

  useEffect(() => { attemptLoad(); }, [attemptLoad]);

  /** Apply a legal move to the one real game, refresh the view and record the result once. */
  const applyMove = useCallback((m: { from: string; to: string; promotion?: PromoType }, forGame: number) => {
    const g = gameRef.current;
    if (!g || !g.move(m)) return;
    const next = snapshot(g);
    setSnap(next);
    setSelected(null);
    setTargets([]);
    setPromo(null);
    if (next.over && recordedRef.current !== forGame) {
      recordedRef.current = forGame;
      const { result } = next.over;
      setScores(sc => ({
        wins: sc.wins + (result === 'win' ? 1 : 0),
        draws: sc.draws + (result === 'draw' ? 1 : 0),
        losses: sc.losses + (result === 'loss' ? 1 : 0),
      }));
      void recordResult('chess', difficultyRef.current, result);
    }
  }, []);

  const aiTurn = !!snap && snap.turn === 'b' && !snap.over;

  // Computer plays Black: runs whenever it becomes Black's turn.
  useEffect(() => {
    if (!aiTurn || !Ctor || !gameRef.current) return;
    const g = gameRef.current;
    const forGame = gameId;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const m = await findMove(Ctor, g.fen(), difficultyRef.current, () => cancelled);
      if (cancelled || !m || gameRef.current !== g) return;
      applyMove({ from: m.from, to: m.to, promotion: m.promotion }, forGame);
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [aiTurn, Ctor, gameId, applyMove]);

  const handleNewGame = useCallback(() => { if (Ctor) newGame(Ctor); }, [Ctor, newGame]);

  const handleDifficulty = useCallback((key: string) => {
    const d = key as Difficulty;
    difficultyRef.current = d;
    setDifficulty(d);
    if (Ctor) newGame(Ctor);
  }, [Ctor, newGame]);

  const handleSquare = (sq: string) => {
    const g = gameRef.current;
    if (!g || !snap || snap.over || snap.turn !== 'w' || promo) return;
    setFocusSq(sq);
    const hits = targets.filter(t => t.to === sq);
    if (selected && hits.length) {
      if (hits.some(h => h.promotion)) { setPromo({ from: selected, to: sq }); return; }
      applyMove({ from: selected, to: sq }, gameId);
      return;
    }
    const p = pieceAt(snap, sq);
    if (p?.color === 'w' && sq !== selected) {
      setSelected(sq);
      setTargets(g.moves({ verbose: true, square: sq }));
    } else {
      setSelected(null);
      setTargets([]);
    }
  };

  const handleBoardKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = stepSquare(focusSq, e.key);
    if (!next) return;
    e.preventDefault();
    setFocusSq(next);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-sq="${next}"]`)?.focus();
  };

  const derived = useMemo(() => {
    const hist = snap?.history ?? [];
    const last = hist[hist.length - 1] ?? null;
    const byWhite: PieceType[] = [];
    const byBlack: PieceType[] = [];
    for (const m of hist) {
      if (m.captured) (m.color === 'w' ? byWhite : byBlack).push(m.captured);
    }
    // Promotions change material too: a pawn becomes a bigger piece.
    const material = (list: PieceType[]) => list.reduce((n, p) => n + VAL[p], 0);
    const promoGain = (c: Color) =>
      hist.filter(m => m.color === c && m.promotion).reduce((n, m) => n + VAL[m.promotion as PieceType] - VAL.p, 0);
    const diff = Math.round((material(byWhite) + promoGain('w') - material(byBlack) - promoGain('b')) / 100);
    const pairs: [VerboseMove, VerboseMove | undefined][] = [];
    for (let i = 0; i < hist.length; i += 2) pairs.push([hist[i], hist[i + 1]]);
    let checkSq: string | null = null;
    if (snap?.inCheck) {
      checkSq = SQUARES.find(sq => {
        const p = pieceAt(snap, sq);
        return p?.type === 'k' && p.color === snap.turn;
      }) ?? null;
    }
    return { last, byWhite, byBlack, diff, pairs, checkSq };
  }, [snap]);

  const moveListRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = moveListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [derived.pairs.length]);

  let status: ReactNode;
  let tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral';
  if (loadError) { status = 'Could not load the chess engine. Check your connection and try again.'; tone = 'bad'; }
  else if (!snap) status = 'Setting up the board…';
  else if (snap.over) {
    status = snap.over.reason;
    tone = snap.over.result === 'win' ? 'good' : snap.over.result === 'loss' ? 'bad' : 'info';
  } else if (snap.turn === 'b') { status = 'The computer is thinking…'; tone = 'info'; }
  else if (snap.inCheck) { status = 'Check! Get your king to safety.'; tone = 'bad'; }
  else status = snap.history.length ? 'Your move.' : 'You play White. Pick a piece to start.';

  const aside = (
    <>
      <section className={s.panel} aria-label="Captured pieces">
        <h2 className={s.panelTitle}>Captured</h2>
        <CapturedRow pieces={derived.byWhite} color="b" label="You took" />
        <CapturedRow pieces={derived.byBlack} color="w" label="Computer took" />
        {derived.diff !== 0 && (
          <p className={s.material} data-tone={derived.diff > 0 ? 'good' : 'bad'}>
            {derived.diff > 0 ? `You are up ${derived.diff}` : `You are down ${-derived.diff}`} in material
          </p>
        )}
      </section>
      <section className={s.panel} aria-label="Moves">
        <h2 className={s.panelTitle}>Moves</h2>
        {derived.pairs.length === 0 ? (
          <p className={s.empty}>No moves yet.</p>
        ) : (
          <ol className={s.moves} ref={moveListRef}>
            {derived.pairs.map(([w, b], i) => (
              <li key={i} className={s.moveRow}>
                <span className={s.moveNum}>{i + 1}.</span>
                <span className={s.moveSan}>{w.san}</span>
                <span className={s.moveSan}>{b?.san ?? ''}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );

  const locked = !snap || !!snap.over || snap.turn !== 'w' || !!promo;

  return (
    <GameShell
      title="Chess"
      subtitle="You play White against the computer."
      icon={<Crown size={24} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={handleDifficulty}
      score={[
        { label: 'Wins', value: scores.wins, tone: 'win' },
        { label: 'Draws', value: scores.draws, tone: 'draw' },
        { label: 'Losses', value: scores.losses, tone: 'loss' },
      ]}
      status={status}
      statusTone={tone}
      onNewGame={Ctor ? handleNewGame : undefined}
      aside={aside}
      rules={
        <>
          <p>Tap one of your pieces to see where it can go, then tap a highlighted square to move. Dots mark empty squares and rings mark captures.</p>
          <p>Checkmate the black king to win. Stalemate, running out of mating material, repeating the same position three times, or fifty moves without a capture or pawn move all end in a draw.</p>
          <p>On a keyboard, use the arrow keys to move around the board and Enter to pick a square.</p>
        </>
      }
    >
      <div className={s.stage}>
        {loadError ? (
          <div className={s.errorBox}>
            <p>The chess engine did not load.</p>
            <button type="button" className={s.retry} onClick={attemptLoad}>Try again</button>
          </div>
        ) : !snap ? (
          <div className={`skeleton ${s.skel}`} aria-hidden="true" />
        ) : (
          <div className={s.boardWrap} data-thinking={aiTurn || undefined}>
            <div
              ref={boardRef}
              className={s.board}
              role="group"
              aria-label="Chess board"
              aria-busy={aiTurn}
              onKeyDown={handleBoardKey}
            >
              {SQUARES.map((sq, i) => {
                const p = pieceAt(snap, sq);
                const light = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
                const target = targets.some(t => t.to === sq);
                const isLast = derived.last && (derived.last.from === sq || derived.last.to === sq);
                const label = `${sq}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${NAME[p.type]}` : ''}${target ? ', legal move' : ''}`;
                return (
                  <button
                    key={sq}
                    type="button"
                    data-sq={sq}
                    tabIndex={sq === focusSq ? 0 : -1}
                    className={s.sq}
                    data-light={light || undefined}
                    data-last={isLast || undefined}
                    data-selected={selected === sq || undefined}
                    data-check={derived.checkSq === sq || undefined}
                    aria-label={label}
                    aria-pressed={selected === sq}
                    aria-disabled={locked || undefined}
                    onClick={() => handleSquare(sq)}
                    onFocus={() => setFocusSq(sq)}
                  >
                    {sq[0] === 'a' && <span className={s.rankTag} aria-hidden="true">{sq[1]}</span>}
                    {sq[1] === '1' && <span className={s.fileTag} aria-hidden="true">{sq[0]}</span>}
                    {p && <span className={s.piece} data-color={p.color} aria-hidden="true">{GLYPH[p.type]}</span>}
                    {target && <span className={p ? s.ring : s.dot} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {promo && (
              <div className={s.promoScrim}>
                <div
                  className={s.promo}
                  role="dialog"
                  aria-label="Choose a promotion piece"
                  onKeyDown={e => { if (e.key === 'Escape') setPromo(null); }}
                >
                  <p className={s.promoTitle}>Promote your pawn</p>
                  <div className={s.promoRow}>
                    {PROMOS.map(t => (
                      <button
                        key={t}
                        type="button"
                        className={s.promoBtn}
                        aria-label={`Promote to ${NAME[t]}`}
                        onClick={() => applyMove({ ...promo, promotion: t }, gameId)}
                        autoFocus={t === 'q'}
                      >
                        <span className={s.piece} data-color="w">{GLYPH[t]}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className={s.promoCancel} onClick={() => setPromo(null)}>
                    <X size={14} strokeWidth={2.25} /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </GameShell>
  );
}
