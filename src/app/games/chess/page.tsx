'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import styles from './chess.module.css';

// chess.js is loaded via CDN script tag — we use the global Chess constructor
declare const Chess: new (fen?: string) => ChessInstance;

interface ChessInstance {
  move: (move: string | { from: string; to: string; promotion?: string }) => MoveResult | null;
  moves: (opts?: { verbose?: boolean; square?: string }) => string[] | VerboseMove[];
  fen: () => string;
  game_over: () => boolean;
  in_checkmate: () => boolean;
  in_draw: () => boolean;
  in_stalemate: () => boolean;
  insufficient_material: () => boolean;
  in_threefold_repetition: () => boolean;
  in_check: () => boolean;
  turn: () => 'w' | 'b';
  get: (square: string) => Piece | null;
  board: () => (Piece | null)[][];
  history: (opts?: { verbose?: boolean }) => string[] | VerboseMove[];
  load: (fen: string) => boolean;
  reset: () => void;
}

interface Piece {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
}

interface VerboseMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  flags: string;
  san: string;
}

interface MoveResult {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  flags: string;
  san: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'idle' | 'playing' | 'won' | 'lost' | 'draw';

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

const PIECE_UNICODE: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

// Piece-square tables for positional evaluation (from white's perspective)
const PST: Record<string, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 97; // a=0
  const rank = 8 - parseInt(square[1]);   // 8=0, 1=7
  return rank * 8 + file;
}

function evaluateBoard(chess: ChessInstance): number {
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] ?? 0;
      const idx = piece.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const pst = PST[piece.type]?.[idx] ?? 0;
      score += piece.color === 'w' ? val + pst : -(val + pst);
    }
  }
  return score;
}

function minimax(
  chess: ChessInstance,
  depth: number,
  alpha: number,
  beta: number,
  isMax: boolean
): number {
  if (depth === 0 || chess.game_over()) return evaluateBoard(chess);

  const moves = chess.moves() as string[];
  if (isMax) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false));
      chess.move('--' as never); // undo — use history trick below
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true));
      chess.move('--' as never);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// chess.js doesn't have undo() natively in all versions — we use FEN snapshots
function getBestMove(chess: ChessInstance, depth: number): string {
  const moves = chess.moves() as string[];
  let bestMove = moves[0];
  let bestVal = Infinity; // AI plays black → minimise

  for (const move of moves) {
    const fen = chess.fen();
    chess.move(move);
    const val = minimax(chess, depth - 1, -Infinity, Infinity, true);
    chess.load(fen);
    if (val < bestVal) { bestVal = val; bestMove = move; }
  }
  return bestMove;
}

function getAiMove(chess: ChessInstance, difficulty: Difficulty): string {
  const moves = chess.moves() as string[];
  if (difficulty === 'easy') {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  if (difficulty === 'medium') {
    return getBestMove(chess, 1);
  }
  return getBestMove(chess, 3);
}

export default function ChessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [libReady, setLibReady] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [status, setStatus] = useState<GameStatus>('idle');

  // Board state derived from chess.js — re-render by bumping this
  const chessRef = useRef<ChessInstance | null>(null);
  const [fen, setFen] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [inCheck, setInCheck] = useState(false);
  const [message, setMessage] = useState('');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [scores, setScores] = useState({ wins: 0, losses: 0, draws: 0 });
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [playerTurn, setPlayerTurn] = useState(true);

  const aiTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load chess.js from CDN
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as never as Record<string,unknown>)['Chess']) {
      setLibReady(true); return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js';
    script.onload = () => setLibReady(true);
    document.head.appendChild(script);
    return () => clearTimeout(aiTimeout.current);
  }, []);

  useEffect(() => {
    async function init() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncState = useCallback(() => {
    const chess = chessRef.current;
    if (!chess) return;
    setFen(chess.fen());
    setInCheck(chess.in_check());
    setMoveHistory(chess.history() as string[]);
  }, []);

  const endGame = useCallback((chess: ChessInstance) => {
    if (chess.in_checkmate()) {
      const winner = chess.turn() === 'b' ? 'w' : 'b';
      if (winner === 'w') {
        setStatus('won'); setScores(s => ({ ...s, wins: s.wins + 1 }));
        setMessage('Checkmate! 🎉 You win!');
      } else {
        setStatus('lost'); setScores(s => ({ ...s, losses: s.losses + 1 }));
        setMessage('Checkmate. 💀 You lose.');
      }
    } else if (chess.in_draw()) {
      setStatus('draw'); setScores(s => ({ ...s, draws: s.draws + 1 }));
      const reason = chess.in_stalemate() ? 'Stalemate'
        : chess.insufficient_material() ? 'Insufficient material'
        : chess.in_threefold_repetition() ? 'Threefold repetition'
        : 'Draw';
      setMessage(`${reason} — it's a draw.`);
    }
  }, []);

  const startGame = useCallback(() => {
    if (!libReady) return;
    const chess = new Chess();
    chessRef.current = chess;
    setSelected(null);
    setLegalTargets([]);
    setLastMove(null);
    setPromotion(null);
    setPlayerTurn(true);
    setMessage("Your turn — you play White");
    setStatus('playing');
    syncState();
  }, [libReady, syncState]);

  const runAiTurn = useCallback(() => {
    const chess = chessRef.current;
    if (!chess || chess.game_over()) return;

    setMessage('AI is thinking…');
    aiTimeout.current = setTimeout(() => {
      const move = getAiMove(chess, difficulty);
      const result = chess.move(move);
      if (result) setLastMove({ from: result.from, to: result.to });
      syncState();

      if (chess.game_over()) { endGame(chess); return; }
      if (chess.in_check()) setMessage('Check! Your move.');
      else setMessage('Your turn.');
      setPlayerTurn(true);
    }, difficulty === 'hard' ? 600 : 300);
  }, [difficulty, syncState, endGame]);

  const handleSquareClick = useCallback((square: string) => {
    const chess = chessRef.current;
    if (!chess || !playerTurn || status !== 'playing' || promotion) return;

    const piece = chess.get(square);

    if (selected) {
      if (legalTargets.includes(square)) {
        // Check for pawn promotion
        const movingPiece = chess.get(selected);
        const isPromotion = movingPiece?.type === 'p' &&
          ((movingPiece.color === 'w' && square[1] === '8') ||
           (movingPiece.color === 'b' && square[1] === '1'));

        if (isPromotion) {
          setPromotion({ from: selected, to: square });
          setSelected(null); setLegalTargets([]);
          return;
        }

        const result = chess.move({ from: selected, to: square });
        if (result) {
          setLastMove({ from: result.from, to: result.to });
          setSelected(null); setLegalTargets([]);
          syncState();

          if (chess.game_over()) { endGame(chess); return; }
          setPlayerTurn(false);
          runAiTurn();
        }
        return;
      }
      // Clicked a different own piece — re-select
      if (piece && piece.color === 'w') {
        setSelected(square);
        const moves = chess.moves({ verbose: true, square }) as VerboseMove[];
        setLegalTargets(moves.map(m => m.to));
        return;
      }
      setSelected(null); setLegalTargets([]);
      return;
    }

    // Nothing selected yet — select own piece
    if (piece && piece.color === 'w') {
      setSelected(square);
      const moves = chess.moves({ verbose: true, square }) as VerboseMove[];
      setLegalTargets(moves.map(m => m.to));
    }
  }, [selected, legalTargets, playerTurn, status, promotion, syncState, endGame, runAiTurn]);

  const handlePromotion = useCallback((pieceType: 'q' | 'r' | 'b' | 'n') => {
    const chess = chessRef.current;
    if (!chess || !promotion) return;
    const result = chess.move({ from: promotion.from, to: promotion.to, promotion: pieceType });
    if (result) setLastMove({ from: result.from, to: result.to });
    setPromotion(null);
    syncState();
    if (chess.game_over()) { endGame(chess); return; }
    setPlayerTurn(false);
    runAiTurn();
  }, [promotion, syncState, endGame, runAiTurn]);

  // Derive board squares from FEN / chess.board()
  const getBoardPiece = useCallback((square: string): Piece | null => {
    return chessRef.current?.get(square) ?? null;
  }, [fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOver = status === 'won' || status === 'lost' || status === 'draw';

  if (loading) return <div className={styles.loading}><div className={styles.dot} /></div>;

  return (
    <div className={styles.page}>
      {/* chess.js CDN — must be in DOM */}
      {typeof window !== 'undefined' && (
        <script
          src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"
          async
        />
      )}

      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => router.push('/games')}>← arcade</button>
        <div className={styles.scoreboard}>
          <span className={styles.scoreWin}>W {scores.wins}</span>
          <span className={styles.scoreDraw}>D {scores.draws}</span>
          <span className={styles.scoreLoss}>L {scores.losses}</span>
        </div>
      </div>

      <h1 className={styles.title}>Chess</h1>

      {status === 'idle' && (
        <div className={styles.setup}>
          <p className={styles.setupLabel}>choose difficulty</p>
          <div className={styles.diffRow}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                className={`${styles.diffBtn} ${difficulty === d ? styles.diffBtnActive : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {d}
                <span className={styles.diffHint}>
                  {d === 'easy' ? 'random moves' : d === 'medium' ? '1-ply eval' : '3-ply minimax'}
                </span>
              </button>
            ))}
          </div>
          <button
            className={styles.startBtn}
            onClick={startGame}
            disabled={!libReady}
          >
            {libReady ? 'start game' : 'loading…'}
          </button>
        </div>
      )}

      {status !== 'idle' && (
        <div className={styles.gameWrap}>
          {/* Board + sidebar */}
          <div className={styles.boardCol}>
            <div className={styles.messageBar}>
              {inCheck && status === 'playing' && <span className={styles.checkAlert}>⚠ check — </span>}
              {message}
            </div>

            {/* Promotion picker */}
            {promotion && (
              <div className={styles.promotionBar}>
                <span className={styles.promoLabel}>promote to:</span>
                {(['q','r','b','n'] as const).map(p => (
                  <button
                    key={p}
                    className={styles.promoBtn}
                    onClick={() => handlePromotion(p)}
                    aria-label={`Promote to ${p}`}
                  >
                    {PIECE_UNICODE[`w${p}`]}
                  </button>
                ))}
              </div>
            )}

            {/* Board */}
            <div className={styles.boardWrap}>
              {/* Rank labels */}
              <div className={styles.rankLabels}>
                {RANKS.map(r => <span key={r} className={styles.rankLabel}>{r}</span>)}
              </div>

              <div className={styles.board}>
                {RANKS.map((rank, ri) =>
                  FILES.map((file, fi) => {
                    const square = `${file}${rank}`;
                    const piece = getBoardPiece(square);
                    const isLight = (ri + fi) % 2 === 0;
                    const isSelected = selected === square;
                    const isTarget = legalTargets.includes(square);
                    const isLastFrom = lastMove?.from === square;
                    const isLastTo = lastMove?.to === square;
                    const isKingInCheck = inCheck && piece?.type === 'k' && piece?.color === chess_turn();

                    let cellClass = `${styles.cell} ${isLight ? styles.cellLight : styles.cellDark}`;
                    if (isSelected)    cellClass += ` ${styles.cellSelected}`;
                    if (isLastFrom || isLastTo) cellClass += ` ${styles.cellLastMove}`;
                    if (isKingInCheck) cellClass += ` ${styles.cellCheck}`;

                    return (
                      <button
                        key={square}
                        className={cellClass}
                        onClick={() => handleSquareClick(square)}
                        aria-label={`${square}${piece ? ` — ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
                      >
                        {piece && (
                          <span className={`${styles.piece} ${piece.color === 'w' ? styles.pieceWhite : styles.pieceBlack}`}>
                            {PIECE_UNICODE[`${piece.color}${piece.type}`]}
                          </span>
                        )}
                        {isTarget && (
                          <span className={piece ? styles.targetCapture : styles.targetDot} aria-hidden="true" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* File labels */}
              <div className={styles.fileLabels}>
                {FILES.map(f => <span key={f} className={styles.fileLabel}>{f}</span>)}
              </div>
            </div>
          </div>

          {/* Sidebar: move history */}
          <div className={styles.sidebar}>
            <p className={styles.historyLabel}>moves</p>
            <div className={styles.historyList}>
              {moveHistory.length === 0
                ? <span className={styles.historyEmpty}>no moves yet</span>
                : moveHistory.reduce((pairs: string[][], move, i) => {
                    if (i % 2 === 0) pairs.push([move]);
                    else pairs[pairs.length - 1].push(move);
                    return pairs;
                  }, []).map((pair, i) => (
                    <div key={i} className={styles.historyRow}>
                      <span className={styles.historyNum}>{i + 1}.</span>
                      <span className={styles.historyWhite}>{pair[0]}</span>
                      <span className={styles.historyBlack}>{pair[1] ?? ''}</span>
                    </div>
                  ))
              }
            </div>

            {isOver && (
              <div className={styles.overActions}>
                <div className={
                  status === 'won' ? styles.wonText :
                  status === 'lost' ? styles.lostText : styles.drawText
                }>
                  {status === 'won' ? '🎉 You win!' : status === 'lost' ? '💀 You lose.' : '🤝 Draw.'}
                </div>
                <button className={styles.startBtn} onClick={startGame}>play again</button>
                <button className={styles.diffChange} onClick={() => setStatus('idle')}>change difficulty</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function chess_turn(): 'w' | 'b' {
    return chessRef.current?.turn() ?? 'w';
  }
}