'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Grid3x3, X } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import { ensureSession } from '@/lib/supabase';
import { recordResult } from '@/lib/games';
import s from './tic-tac-toe.module.css';

type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';
type Mark = 'X' | 'O';
type Cell = Mark | null;
type StartMode = 'you' | 'ai' | 'alternate';
type Outcome = { kind: 'win' | 'loss'; line: number[] } | { kind: 'draw'; line: null };

interface Game { id: number; board: Cell[]; turn: Mark; starter: Mark }

const HUMAN: Mark = 'X';
const AI: Mark = 'O';
const AI_DELAY = 450;

const DIFFICULTIES: { key: Difficulty; label: string; hint: string }[] = [
  { key: 'easy', label: 'Easy', hint: 'Plays random moves' },
  { key: 'medium', label: 'Medium', hint: 'Takes wins and blocks yours' },
  { key: 'hard', label: 'Hard', hint: 'Plays perfectly most of the time' },
  { key: 'impossible', label: 'Impossible', hint: 'Never loses. A draw is a win here.' },
];

const START_MODES: { key: StartMode; label: string }[] = [
  { key: 'you', label: 'You' },
  { key: 'ai', label: 'Computer' },
  { key: 'alternate', label: 'Take turns' },
];

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// ── Pure game logic ─────────────────────────────────────────

function findWinner(board: Cell[]): { winner: Mark; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return { winner: v, line };
  }
  return null;
}

function evaluate(board: Cell[]): Outcome | null {
  const w = findWinner(board);
  if (w) return { kind: w.winner === HUMAN ? 'win' : 'loss', line: w.line };
  if (board.every(c => c !== null)) return { kind: 'draw', line: null };
  return null;
}

function emptyCells(board: Cell[]): number[] {
  const out: number[] = [];
  board.forEach((v, i) => { if (v === null) out.push(i); });
  return out;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomMove(board: Cell[]): number {
  return pick(emptyCells(board));
}

/** Finish a line for `player` if one is open. */
function completingMove(board: Cell[], player: Mark): number | null {
  for (const line of WIN_LINES) {
    const marks = line.filter(i => board[i] === player).length;
    const empty = line.filter(i => board[i] === null);
    if (marks === 2 && empty.length === 1) return empty[0];
  }
  return null;
}

function blockingMove(board: Cell[]): number {
  const win = completingMove(board, AI);
  if (win !== null) return win;
  const block = completingMove(board, HUMAN);
  if (block !== null) return block;
  if (board[4] === null) return 4;
  return randomMove(board);
}

function minimax(board: Cell[], aiToMove: boolean, depth: number): number {
  const w = findWinner(board);
  if (w) return w.winner === AI ? 10 - depth : depth - 10;
  const empty = emptyCells(board);
  if (empty.length === 0) return 0;
  let best = aiToMove ? -Infinity : Infinity;
  for (const i of empty) {
    board[i] = aiToMove ? AI : HUMAN;
    const score = minimax(board, !aiToMove, depth + 1);
    board[i] = null;
    best = aiToMove ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

function bestMove(board: Cell[]): number {
  const empty = emptyCells(board);
  // Any corner or the centre is a perfect opening, so skip the search and add variety.
  if (empty.length === 9) return pick([0, 2, 4, 6, 8]);
  const work = [...board];
  let best = -Infinity;
  let moves: number[] = [];
  for (const i of empty) {
    work[i] = AI;
    const score = minimax(work, false, 1);
    work[i] = null;
    if (score > best) { best = score; moves = [i]; }
    else if (score === best) moves.push(i);
  }
  return pick(moves);
}

function aiMove(board: Cell[], difficulty: Difficulty): number {
  if (difficulty === 'easy') return randomMove(board);
  if (difficulty === 'medium') return blockingMove(board);
  if (difficulty === 'hard') return Math.random() < 0.25 ? blockingMove(board) : bestMove(board);
  return bestMove(board);
}

function newGame(id: number, starter: Mark): Game {
  return { id, board: Array<Cell>(9).fill(null), turn: starter, starter };
}

function applyMove(game: Game, idx: number, mark: Mark): Game {
  if (game.board[idx] !== null || game.turn !== mark || evaluate(game.board)) return game;
  const board = [...game.board];
  board[idx] = mark;
  return { ...game, board, turn: mark === HUMAN ? AI : HUMAN };
}

function nextStarter(mode: StartMode, prev: Mark): Mark {
  if (mode === 'you') return HUMAN;
  if (mode === 'ai') return AI;
  return prev === HUMAN ? AI : HUMAN;
}

/** Arrow keys move focus between cells of a square grid. */
function onGridKey(e: React.KeyboardEvent<HTMLElement>, size: number) {
  const i = Number((e.target as HTMLElement).dataset.idx);
  if (Number.isNaN(i)) return;
  const r = Math.floor(i / size);
  const c = i % size;
  let n = -1;
  if (e.key === 'ArrowRight' && c < size - 1) n = i + 1;
  else if (e.key === 'ArrowLeft' && c > 0) n = i - 1;
  else if (e.key === 'ArrowDown' && r < size - 1) n = i + size;
  else if (e.key === 'ArrowUp' && r > 0) n = i - size;
  if (n < 0) return;
  e.preventDefault();
  e.currentTarget.querySelector<HTMLElement>(`[data-idx="${n}"]`)?.focus();
}

/** Centre of a cell in a 300 unit square. */
function centre(i: number): [number, number] {
  return [(i % 3) * 100 + 50, Math.floor(i / 3) * 100 + 50];
}

function WinStroke({ line }: { line: number[] }) {
  const [x1, y1] = centre(line[0]);
  const [x2, y2] = centre(line[2]);
  const dx = Math.sign(x2 - x1) * 32;
  const dy = Math.sign(y2 - y1) * 32;
  return (
    <svg className={s.winSvg} viewBox="0 0 300 300" aria-hidden="true">
      <line className={s.winLine} x1={x1 - dx} y1={y1 - dy} x2={x2 + dx} y2={y2 + dy} pathLength={1} />
    </svg>
  );
}

const POS = ['top left', 'top middle', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];

// ── Page ────────────────────────────────────────────────────

export default function TicTacToePage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [startMode, setStartMode] = useState<StartMode>('alternate');
  const [game, setGame] = useState<Game>(() => newGame(1, HUMAN));
  const [scores, setScores] = useState({ wins: 0, losses: 0, draws: 0 });
  const recordedFor = useRef(0);

  const outcome = evaluate(game.board);
  const aiThinking = !outcome && game.turn === AI;

  // Warm up the session so the first result can be saved.
  useEffect(() => { ensureSession().catch(() => {}); }, []);

  const finish = useCallback((g: Game, diff: Difficulty) => {
    const o = evaluate(g.board);
    if (!o || recordedFor.current === g.id) return;
    recordedFor.current = g.id;
    setScores(sc => ({
      wins: sc.wins + (o.kind === 'win' ? 1 : 0),
      losses: sc.losses + (o.kind === 'loss' ? 1 : 0),
      draws: sc.draws + (o.kind === 'draw' ? 1 : 0),
    }));
    void (async () => {
      if (await ensureSession()) await recordResult('tic', diff, o.kind);
    })();
  }, []);

  // Computer's turn: one timer per position, cleared if the game changes.
  useEffect(() => {
    if (!aiThinking) return;
    const t = setTimeout(() => {
      const next = applyMove(game, aiMove(game.board, difficulty), AI);
      setGame(next);
      finish(next, difficulty);
    }, AI_DELAY);
    return () => clearTimeout(t);
  }, [aiThinking, game, difficulty, finish]);

  const play = (idx: number) => {
    if (game.turn !== HUMAN || outcome || game.board[idx] !== null) return;
    const next = applyMove(game, idx, HUMAN);
    setGame(next);
    finish(next, difficulty);
  };

  const restart = (mode: StartMode = startMode) => {
    setGame(g => newGame(g.id + 1, nextStarter(mode, g.starter)));
  };

  const changeDifficulty = (d: string) => {
    setDifficulty(d as Difficulty);
    restart();
  };

  const changeStart = (m: StartMode) => {
    setStartMode(m);
    restart(m);
  };

  let status: React.ReactNode = 'Your turn. You are X.';
  let tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral';
  if (outcome?.kind === 'win') { status = 'You win! Nicely played.'; tone = 'good'; }
  else if (outcome?.kind === 'loss') { status = 'The computer wins this round.'; tone = 'bad'; }
  else if (outcome?.kind === 'draw') {
    status = difficulty === 'impossible' ? 'A draw. That is as good as it gets on Impossible.' : 'It is a draw.';
    tone = 'info';
  } else if (aiThinking) { status = 'The computer is thinking...'; tone = 'info'; }
  else if (game.board.every(c => c === null) && game.starter === HUMAN) status = 'You go first. Pick any square.';

  return (
    <GameShell
      title="Tic Tac Toe"
      subtitle="Three in a row wins. You are X."
      icon={<Grid3x3 size={24} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={changeDifficulty}
      score={[
        { label: 'Wins', value: scores.wins, tone: 'win' },
        { label: 'Losses', value: scores.losses, tone: 'loss' },
        { label: 'Draws', value: scores.draws, tone: 'draw' },
      ]}
      status={status}
      statusTone={tone}
      onNewGame={() => restart()}
      rules={
        <>
          <p>Take turns placing marks on the grid. Get three in a row across, down or diagonally to win.</p>
          <p>Choose who goes first below the board. Take turns swaps the first move every game.</p>
          <p>Use the arrow keys to move between squares and Enter to play.</p>
        </>
      }
    >
      <div className={s.stage}>
        <div
          className={s.board}
          role="grid"
          aria-label="Tic tac toe board"
          aria-busy={aiThinking}
          data-locked={aiThinking || !!outcome}
          onKeyDown={e => onGridKey(e, 3)}
        >
          {game.board.map((cell, i) => {
            const inLine = outcome?.line?.includes(i);
            const blocked = cell !== null || !!outcome || aiThinking;
            return (
              <button
                key={`${game.id}-${i}`}
                type="button"
                data-idx={i}
                className={`${s.cell} ${inLine ? s.cellWin : ''}`}
                aria-disabled={blocked}
                aria-label={`${POS[i]}${cell ? `, ${cell === HUMAN ? 'your X' : 'computer O'}` : ', empty'}`}
                onClick={() => play(i)}
              >
                {cell === 'X' && <X className={`${s.mark} ${s.markX}`} strokeWidth={2.6} aria-hidden="true" />}
                {cell === 'O' && <Circle className={`${s.mark} ${s.markO}`} strokeWidth={2.6} aria-hidden="true" />}
              </button>
            );
          })}
          {outcome?.line && <WinStroke key={game.id} line={outcome.line} />}
        </div>

        <div className={s.starter}>
          <span className={s.starterLabel} id="ttt-first">First move</span>
          <div className={s.seg} role="radiogroup" aria-labelledby="ttt-first">
            {START_MODES.map(m => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={startMode === m.key}
                className={`${s.segBtn} ${startMode === m.key ? s.segOn : ''}`}
                onClick={() => changeStart(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {outcome && (
          <button type="button" className={s.again} onClick={() => restart()}>Play again</button>
        )}
      </div>
    </GameShell>
  );
}
