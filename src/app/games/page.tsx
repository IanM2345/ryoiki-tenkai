'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import { getGameStats, type GameType } from '@/lib/db';
import styles from './games.module.css';

const FEATURED = {
  id: 'kadi',
  title: 'Kadi',
  emoji: '🎴',
  description: 'The Kenyan card game — questions, stacking penalties, and calling Kadi on your last card. Easy to learn, hard to beat on Hard.',
};

const GAMES = [
  { id: 'tic-tac-toe', title: 'Tic Tac Toe', emoji: '✕○', description: 'Classic 3×3. The hard AI uses minimax — good luck.', accent: 'orange' },
  { id: 'sudoku',      title: 'Sudoku',      emoji: '🔢', description: 'Fill the grid. Numbers don\'t lie.',                   accent: 'purple' },
  { id: 'battleship',  title: 'Battleship',  emoji: '⚓', description: 'Place your fleet. Sink theirs before they sink yours.', accent: 'cyan'   },
  { id: 'matatu',      title: 'Matatu',      emoji: '🃏', description: 'East African Uno. Sevens cut the game.',                accent: 'orange' },
  { id: 'kadi',        title: 'Kadi',        emoji: '🎴', description: 'Questions, stacking penalties, and calling Kadi!',      accent: 'purple' },
  { id: 'chess',       title: 'Chess',       emoji: '♟', description: 'Classic chess vs AI. Hard uses minimax with alpha-beta pruning.', accent: 'orange' },
];

const SOON = ['Wordle', 'Memory'];

const ALL_GAME_TYPES: GameType[] = ['tic', 'sudoku', 'chess', 'battleship', 'kadi', 'matatu'];

export default function GamesPage() {
  const router = useRouter();
  const [loading,   setLoading]   = useState(true);
  const [totalWins, setTotalWins] = useState<number | null>(null);

  useEffect(() => {
    async function init() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }

      try {
        const results = await Promise.all(ALL_GAME_TYPES.map(g => getGameStats(g)));
        const wins = results.reduce((sum, r) => sum + r.wins, 0);
        setTotalWins(wins);
      } catch {
        setTotalWins(0);
      }

      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.loadingDot} />
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>🎮 <span className={styles.titleAccent}>arcade</span></h1>
        <p className={styles.subtitle}>your little corner of the internet, but make it fun</p>
      </div>

      {/* Stats strip */}
      <div className={styles.statsStrip}>
        <div className={styles.statCell}>
          <div className={styles.statNum}>{GAMES.length}</div>
          <div className={styles.statLabel}>games</div>
        </div>
        <div className={styles.statCell}>
          <div className={`${styles.statNum} ${styles.statNumPurple}`}>3</div>
          <div className={styles.statLabel}>difficulty levels</div>
        </div>
        <div className={styles.statCell}>
          <div className={`${styles.statNum} ${styles.statNumCyan}`}>
            {totalWins === null ? '…' : totalWins}
          </div>
          <div className={styles.statLabel}>wins so far</div>
        </div>
        <div className={styles.statCell}>
          <div className={`${styles.statNum} ${styles.statNumGreen}`}>∞</div>
          <div className={styles.statLabel}>hours to waste</div>
        </div>
      </div>

      {/* Featured banner */}
      <div className={styles.featured}>
        <div className={styles.featuredBody}>
          <span className={styles.featuredBadge}>✦ featured game</span>
          <h2 className={styles.featuredTitle}>{FEATURED.title}</h2>
          <p className={styles.featuredDesc}>{FEATURED.description}</p>
        </div>
        <div className={styles.featuredRight}>
          <div className={styles.featuredEmoji}>{FEATURED.emoji}</div>
          <button
            className={styles.featuredPlay}
            onClick={() => router.push(`/games/${FEATURED.id}`)}
          >
            play now
          </button>
        </div>
      </div>

      {/* Game grid */}
      <p className={styles.sectionLabel}>all games</p>
      <div className={styles.grid}>
        {GAMES.map(game => (
          <button
            key={game.id}
            className={`${styles.card} ${styles[`card-${game.accent}`]}`}
            onClick={() => router.push(`/games/${game.id}`)}
          >
            <div className={styles.cardTop}>
              <span className={styles.cardEmoji}>{game.emoji}</span>
              <span className={styles.cardDiff}>easy · medium · hard</span>
            </div>
            <h2 className={styles.cardTitle}>{game.title}</h2>
            <p className={styles.cardDesc}>{game.description}</p>
            <span className={styles.cardArrow}>play →</span>
          </button>
        ))}
      </div>

      {/* Coming soon */}
      <p className={styles.sectionLabel}>coming soon</p>
      <div className={styles.soonGrid}>
        {SOON.map(name => (
          <div key={name} className={styles.soonCard}>
            <span className={styles.soonPill}>coming soon</span>
            <span className={styles.soonTitle}>{name}</span>
          </div>
        ))}
      </div>

    </div>
  );
}