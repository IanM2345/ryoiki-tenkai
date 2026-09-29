'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Type as TypeIcon, Delete, CornerDownLeft } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import s from './wordle.module.css';
import { recordResult } from '@/lib/games';
import { ensureSession } from '@/lib/supabase';
import { ANSWERS, VALID } from '@/lib/words5';
import { localDateStr } from '@/lib/dates';

// ─── DAILY PUZZLE ─────────────────────────────────────────────
const ROWS = 6;
const COLS = 5;
const EPOCH = Date.UTC(2026, 0, 1); // day 0 of the puzzle sequence

function dayNumber(): number {
  const [y, m, d] = localDateStr().split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000);
}
const answerFor = (day: number) => ANSWERS[((day % ANSWERS.length) + ANSWERS.length) % ANSWERS.length];

type Mark = 'correct' | 'present' | 'absent';

/** Wordle scoring with correct duplicate-letter handling (two passes). */
function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(COLS).fill('absent');
  const rem: Record<string, number> = {};
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) marks[i] = 'correct';
    else rem[answer[i]] = (rem[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < COLS; i++) {
    if (marks[i] === 'correct') continue;
    const g = guess[i];
    if (rem[g] > 0) { marks[i] = 'present'; rem[g]--; }
  }
  return marks;
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const rank: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };

interface Saved { day: number; guesses: string[]; done: 'win' | 'loss' | null; recorded: boolean }
const storeKey = () => `yw-wordle-${localDateStr()}`;

const load = (day: number): Saved => {
  try {
    const raw = localStorage.getItem(storeKey());
    if (raw) { const p = JSON.parse(raw) as Saved; if (p.day === day) return p; }
  } catch { /* ignore */ }
  return { day, guesses: [], done: null, recorded: false };
};
const save = (st: Saved) => { try { localStorage.setItem(storeKey(), JSON.stringify(st)); } catch { /* ignore */ } };

// ─── COMPONENT ────────────────────────────────────────────────
export default function WordleGame() {
  const [day, setDay] = useState(0);
  const [answer, setAnswer] = useState('');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState<'win' | 'loss' | null>(null);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState('');
  const recorded = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mount: work out today's puzzle and restore any progress (client only).
  useEffect(() => {
    const d = dayNumber();
    const st = load(d);
    /* eslint-disable react-hooks/set-state-in-effect */
    setDay(d); setAnswer(answerFor(d));
    setGuesses(st.guesses); setDone(st.done); recorded.current = st.recorded;
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearTimeout(flashTimer.current);
  }, []);

  const showFlash = useCallback((msg: string) => {
    clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(''), 1600);
  }, []);

  const commit = useCallback((nextGuesses: string[], result: 'win' | 'loss' | null) => {
    setGuesses(nextGuesses);
    setDone(result);
    const willRecord = !!result && !recorded.current;
    if (willRecord) recorded.current = true;
    save({ day, guesses: nextGuesses, done: result, recorded: recorded.current });
    if (willRecord) ensureSession().then(ok => { if (ok) recordResult('wordle', 'medium', result === 'win' ? 'win' : 'loss'); }).catch(() => {});
  }, [day]);

  const submit = useCallback(() => {
    if (done) return;
    if (current.length < COLS) { showFlash('Not enough letters'); setShake(true); return; }
    if (!VALID.has(current)) { showFlash('Not in word list'); setShake(true); return; }
    const next = [...guesses, current];
    setCurrent('');
    if (current === answer) { commit(next, 'win'); showFlash('Brilliant!'); }
    else if (next.length >= ROWS) { commit(next, 'loss'); }
    else commit(next, null);
  }, [current, done, guesses, answer, commit, showFlash]);

  const type = useCallback((ch: string) => {
    if (done) return;
    setCurrent(c => (c.length < COLS ? c + ch : c));
  }, [done]);
  const backspace = useCallback(() => setCurrent(c => c.slice(0, -1)), []);

  // Physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') submit();
      else if (e.key === 'Backspace') backspace();
      else if (/^[a-zA-Z]$/.test(e.key)) type(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit, backspace, type]);

  // Clear the shake flag after the animation.
  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(false), 420);
    return () => clearTimeout(t);
  }, [shake]);

  // Best-known state per key, for colouring the on-screen keyboard.
  const keyState: Record<string, Mark> = {};
  for (const g of guesses) {
    const marks = scoreGuess(g, answer);
    for (let i = 0; i < COLS; i++) {
      const k = g[i]; const m = marks[i];
      if (!keyState[k] || rank[m] > rank[keyState[k]]) keyState[k] = m;
    }
  }

  // Build the 6 rows for rendering.
  const rows = Array.from({ length: ROWS }, (_, r) => {
    if (r < guesses.length) return { letters: guesses[r], marks: scoreGuess(guesses[r], answer), state: 'done' as const };
    if (r === guesses.length && !done) return { letters: current, marks: null, state: 'current' as const };
    return { letters: '', marks: null, state: 'empty' as const };
  });

  const status = done === 'win'
    ? `You got it in ${guesses.length}/${ROWS}. Come back tomorrow for a new word.`
    : done === 'loss'
      ? `Out of guesses — today's word was "${answer.toUpperCase()}". A fresh one lands tomorrow.`
      : `Guess the five-letter word. Puzzle #${day}.`;

  return (
    <GameShell
      title="Daily Wordle"
      subtitle="One new word every day."
      icon={<TypeIcon size={22} strokeWidth={2} />}
      status={<>{status}{flash && <span className={s.flash}>{flash}</span>}</>}
      statusTone={done === 'win' ? 'good' : done === 'loss' ? 'bad' : 'neutral'}
      rules={<>
        <p>You have six tries to guess the day&apos;s five-letter word. After each guess, the tiles change colour:</p>
        <p><b className={s.legendGr}>Green</b> — right letter, right spot. <b className={s.legendYe}>Yellow</b> — right letter, wrong spot. Grey — not in the word.</p>
        <p>Everyone gets the same word each day, and it resets at midnight. Type with your keyboard or tap the keys below.</p>
      </>}
    >
      <div className={s.wrap}>
        <div className={s.grid}>
          {rows.map((row, r) => (
            <div key={r} className={`${s.row} ${row.state === 'current' && shake ? s.shake : ''}`}>
              {Array.from({ length: COLS }, (_, c) => {
                const ch = row.letters[c] ?? '';
                const mark = row.marks?.[c];
                return (
                  <div
                    key={c}
                    className={`${s.tile} ${ch && row.state === 'current' ? s.filled : ''} ${mark ? s[mark] : ''}`}
                    style={mark ? { ['--i' as string]: c } : undefined}
                  >
                    {ch.toUpperCase()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={s.keyboard}>
          {KEY_ROWS.map((kr, i) => (
            <div key={i} className={s.krow}>
              {i === 2 && <button type="button" className={`${s.key} ${s.wide}`} onClick={submit} aria-label="Enter"><CornerDownLeft size={16} strokeWidth={2.25} /></button>}
              {kr.split('').map(k => (
                <button
                  key={k}
                  type="button"
                  className={`${s.key} ${keyState[k] ? s[keyState[k]] : ''}`}
                  onClick={() => type(k)}
                >
                  {k.toUpperCase()}
                </button>
              ))}
              {i === 2 && <button type="button" className={`${s.key} ${s.wide}`} onClick={backspace} aria-label="Delete"><Delete size={16} strokeWidth={2.25} /></button>}
            </div>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
