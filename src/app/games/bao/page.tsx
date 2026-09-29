'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sprout, RotateCw, RotateCcw, X } from 'lucide-react';
import GameShell, { type Difficulty } from '@/components/games/GameShell';
import s from './bao.module.css';
import { recordResult } from '@/lib/games';
import { ensureSession } from '@/lib/supabase';
import {
  initialBoard, play, chooseMove, hasLost, seedsOf,
  type Board, type Side, type Dir, type Frame, type Level,
} from './engine';

const DIFFS: Difficulty[] = [
  { key: 'easy', label: 'Easy', hint: 'Plays loosely. Good for learning the moves' },
  { key: 'medium', label: 'Medium', hint: 'Always grabs the best capture it can see' },
  { key: 'hard', label: 'Hard', hint: 'Plans a few turns ahead' },
];

type Phase = 'you' | 'animating' | 'ai' | 'won' | 'lost';
const COLS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Seeds drawn as dots for small counts; the number alone once a pit gets crowded. */
function Seeds({ n }: { n: number }) {
  if (n === 0) return null;
  if (n > 9) return <span className={s.bigCount}>{n}</span>;
  return (
    <span className={s.dots}>
      {Array.from({ length: n }, (_, i) => <span key={i} className={s.seed} />)}
    </span>
  );
}

export default function BaoPage() {
  const [difficulty, setDifficulty] = useState<Level>('medium');
  const [board, setBoard] = useState<Board>(initialBoard);
  const [phase, setPhase] = useState<Phase>('you');
  const [picked, setPicked] = useState<number | null>(null);
  const [hi, setHi] = useState<Frame['hi']>(null);
  const [cap, setCap] = useState<Frame['capture'] | null>(null);
  const [score, setScore] = useState({ won: 0, lost: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recorded = useRef(false);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => { ensureSession().catch(() => {}); return clearTimers; }, []);

  const end = useCallback((result: 'won' | 'lost') => {
    setPhase(result); setHi(null); setCap(null);
    setScore(sc => ({ won: sc.won + (result === 'won' ? 1 : 0), lost: sc.lost + (result === 'lost' ? 1 : 0) }));
    if (!recorded.current) {
      recorded.current = true;
      ensureSession().then(ok => { if (ok) recordResult('bao', difficulty, result === 'won' ? 'win' : 'loss'); }).catch(() => {});
    }
  }, [difficulty]);

  /** Step through a move's frames, then call `done` with the final board. */
  const animate = useCallback((frames: Frame[], final: Board, done: (b: Board) => void) => {
    const delay = Math.max(22, Math.min(90, Math.round(1700 / Math.max(1, frames.length))));
    frames.forEach((f, i) => {
      timers.current.push(setTimeout(() => {
        setBoard(f.board); setHi(f.hi); setCap(f.capture ?? null);
      }, i * delay));
    });
    timers.current.push(setTimeout(() => {
      setBoard(final); setHi(null); setCap(null); done(final);
    }, frames.length * delay + 120));
  }, []);

  const aiTurn = useCallback((b: Board) => {
    if (hasLost(b, 1)) { end('won'); return; }
    setPhase('ai');
    timers.current.push(setTimeout(() => {
      const m = chooseMove(b, 1, difficulty);
      if (!m) { end('won'); return; }
      const { board: after, frames } = play(b, 1, m, true);
      setPhase('animating');
      animate(frames, after, final => {
        if (hasLost(final, 0)) end('lost');
        else setPhase('you');
      });
    }, 450));
  }, [animate, difficulty, end]);

  const sow = (dir: Dir) => {
    if (picked === null || phase !== 'you') return;
    const { board: after, frames } = play(board, 0, { pos: picked, dir }, true);
    setPicked(null);
    setPhase('animating');
    animate(frames, after, final => aiTurn(final));
  };

  const newGame = useCallback(() => {
    clearTimers();
    setBoard(initialBoard()); setPhase('you'); setPicked(null); setHi(null); setCap(null);
    recorded.current = false;
  }, []);

  const pit = (side: Side, pos: number) => {
    const n = board[side][pos];
    const mine = side === 0;
    const canPick = mine && phase === 'you' && n >= 2;
    const cls = [
      s.pit,
      pos < 8 ? s.inner : s.outer,
      mine ? s.mine : s.theirs,
      canPick ? s.pickable : '',
      mine && picked === pos ? s.picked : '',
      hi && hi.side === side && hi.pos === pos ? s.hit : '',
      cap && cap.side === side && cap.pos === pos ? s.captured : '',
    ].join(' ');
    return (
      <button
        key={`${side}-${pos}`}
        type="button"
        className={cls}
        disabled={!canPick}
        onClick={() => setPicked(p => (p === pos ? null : pos))}
        aria-label={`${mine ? 'Your' : "Computer's"} ${pos < 8 ? 'front' : 'back'} pit, ${n} seeds`}
      >
        <Seeds n={n} />
        {n > 0 && n <= 9 && <span className={s.count}>{n}</span>}
      </button>
    );
  };

  const you = seedsOf(board, 0), them = seedsOf(board, 1);
  const statusText =
    phase === 'won' ? 'You win! The computer has no moves left.' :
    phase === 'lost' ? 'The computer wins this one. Try again?' :
    phase === 'ai' ? 'The computer is thinking...' :
    phase === 'animating' ? 'Sowing...' :
    picked !== null ? 'Now choose which way to sow.' :
    'Your turn. Tap one of your pits with two or more seeds.';
  const tone = phase === 'won' ? 'good' : phase === 'lost' ? 'bad' : 'neutral';

  return (
    <GameShell
      title="Bao"
      subtitle="The Swahili board game of sowing and capturing."
      icon={<Sprout size={22} strokeWidth={2} />}
      difficulties={DIFFS}
      difficulty={difficulty}
      onDifficulty={k => { setDifficulty(k as Level); newGame(); }}
      score={[
        { label: 'Your seeds', value: you, tone: you > them ? 'win' : undefined },
        { label: 'Computer', value: them, tone: them > you ? 'loss' : undefined },
        { label: 'Won', value: score.won, tone: 'win' },
        { label: 'Lost', value: score.lost, tone: 'loss' },
      ]}
      status={statusText}
      statusTone={tone}
      onNewGame={newGame}
      rules={<>
        <p>Bao is played on four rows of eight pits. You own the two rows nearest you: your <b>front row</b> faces the computer, your <b>back row</b> is behind it. Every pit starts with two seeds.</p>
        <p>On your turn, pick one of your pits with two or more seeds and choose a direction. The seeds are sown one per pit around your own two rows.</p>
        <p>If the last seed lands in an empty pit, your turn ends. If it lands in an occupied pit, you pick those seeds up and keep sowing.</p>
        <p><b>Capturing:</b> if your last seed lands in an occupied pit in your front row and the computer&apos;s pit directly opposite has seeds, you take them all and sow them into your front row from the nearer end.</p>
        <p>You win when the computer&apos;s front row is empty, or when it has no pit with two or more seeds to play.</p>
      </>}
    >
      <div className={s.wrap}>
        <div className={s.board}>
          <div className={s.sideLabel}>Computer</div>
          <div className={s.row}>{COLS.map(c => pit(1, 15 - c))}</div>
          <div className={s.row}>{COLS.map(c => pit(1, c))}</div>
          <div className={s.divider} />
          <div className={s.row}>{COLS.map(c => pit(0, c))}</div>
          <div className={s.row}>{COLS.map(c => pit(0, 15 - c))}</div>
          <div className={s.sideLabel}>You</div>
        </div>

        <div className={`${s.dirBar} ${picked !== null && phase === 'you' ? s.dirBarOn : ''}`} aria-hidden={picked === null}>
          <button type="button" className={s.dirBtn} onClick={() => sow(-1)} tabIndex={picked === null ? -1 : 0}>
            <RotateCcw size={17} strokeWidth={2.25} /> Anticlockwise
          </button>
          <button type="button" className={s.dirBtn} onClick={() => sow(1)} tabIndex={picked === null ? -1 : 0}>
            <RotateCw size={17} strokeWidth={2.25} /> Clockwise
          </button>
          <button type="button" className={s.dirCancel} onClick={() => setPicked(null)} aria-label="Cancel" tabIndex={picked === null ? -1 : 0}>
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </GameShell>
  );
}
