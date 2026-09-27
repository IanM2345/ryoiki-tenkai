'use client';
import React from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import s from './GameShell.module.css';

export interface Difficulty { key: string; label: string; hint?: string }

/**
 * Shared frame for every game: back link, title, difficulty picker,
 * scoreboard, a status line and a "New game" button. The board goes in children.
 */
export default function GameShell({
  title, subtitle, icon, difficulties, difficulty, onDifficulty, score, status, statusTone = 'neutral',
  onNewGame, rules, children, aside,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  difficulties?: Difficulty[];
  difficulty?: string;
  onDifficulty?: (key: string) => void;
  score?: { label: string; value: number | string; tone?: 'win' | 'loss' | 'draw' }[];
  status?: React.ReactNode;
  statusTone?: 'neutral' | 'good' | 'bad' | 'info';
  onNewGame?: () => void;
  rules?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <Link href="/games" className={s.back}><ArrowLeft size={16} strokeWidth={2} /> Arcade</Link>

        <header className={s.head}>
          <div className={s.titleRow}>
            {icon && <span className={s.icon}>{icon}</span>}
            <div>
              <h1 className={s.title}>{title}</h1>
              {subtitle && <p className={s.subtitle}>{subtitle}</p>}
            </div>
          </div>
          {onNewGame && (
            <button type="button" className={s.newGame} onClick={onNewGame}>
              <RotateCcw size={15} strokeWidth={2.25} /> New game
            </button>
          )}
        </header>

        {(difficulties?.length || score?.length) ? (
          <div className={s.controls}>
            {difficulties && difficulties.length > 0 && (
              <div className={s.diffs} role="radiogroup" aria-label="Difficulty">
                {difficulties.map(d => (
                  <button
                    key={d.key}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === d.key}
                    title={d.hint}
                    className={`${s.diff} ${difficulty === d.key ? s.diffOn : ''}`}
                    onClick={() => onDifficulty?.(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            {score && score.length > 0 && (
              <dl className={s.score}>
                {score.map(x => (
                  <div key={x.label} className={s.scoreItem} data-tone={x.tone}>
                    <dt>{x.label}</dt>
                    <dd>{x.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : null}

        {status && <p className={s.status} data-tone={statusTone} aria-live="polite">{status}</p>}

        <div className={aside ? s.withAside : undefined}>
          <div className={s.board}>{children}</div>
          {aside && <aside className={s.aside}>{aside}</aside>}
        </div>

        {rules && (
          <details className={s.rules}>
            <summary>How to play</summary>
            <div className={s.rulesBody}>{rules}</div>
          </details>
        )}
      </div>
    </div>
  );
}
