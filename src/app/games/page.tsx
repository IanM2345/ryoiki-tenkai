'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight, CircleDot, Club, Crown, Flame, Gamepad2, Grid3x3, Hash, Images, Ship, Spade, Trophy,
} from 'lucide-react';
import { Topbar, Toast, useToast } from '@/components/ui';
import { ensureSession } from '@/lib/supabase';
import { getGameStats, type GameStats, type GameType } from '@/lib/games';
import s from './games.module.css';

type Accent = 'or' | 'pu' | 'blue' | 'gr';

interface GameCard {
  type: GameType;
  href: string;
  title: string;
  desc: string;
  levels: string;
  icon: React.ReactNode;
  accent: Accent;
}

const GAMES: GameCard[] = [
  { type: 'tic', href: '/games/tic-tac-toe', title: 'Tic Tac Toe', desc: 'Three in a row. Quick rounds, and the top level never loses.', levels: 'Easy to Impossible', icon: <Grid3x3 size={22} strokeWidth={2} />, accent: 'or' },
  { type: 'sudoku', href: '/games/sudoku', title: 'Sudoku', desc: 'Fill every row, column and box with one to nine.', levels: 'Easy, Medium, Hard', icon: <Hash size={22} strokeWidth={2} />, accent: 'pu' },
  { type: 'chess', href: '/games/chess', title: 'Chess', desc: 'A full game against a computer that thinks a few moves ahead.', levels: 'Easy, Medium, Hard', icon: <Crown size={22} strokeWidth={2} />, accent: 'or' },
  { type: 'battleship', href: '/games/battleship', title: 'Battleship', desc: 'Hide your fleet, then hunt theirs one shot at a time.', levels: 'Easy, Medium, Hard', icon: <Ship size={22} strokeWidth={2} />, accent: 'blue' },
  { type: 'kadi', href: '/games/kadi', title: 'Kadi', desc: 'The Kenyan card game of questions, penalties and calling Kadi on your last card.', levels: 'Easy, Medium, Hard', icon: <Spade size={22} strokeWidth={2} />, accent: 'pu' },
  { type: 'matatu', href: '/games/matatu', title: 'Matatu', desc: 'East African shedding game where a seven can cut the round short.', levels: 'Easy, Medium, Hard', icon: <Club size={22} strokeWidth={2} />, accent: 'gr' },
  { type: 'connect4', href: '/games/connect-four', title: 'Connect Four', desc: 'Drop pieces and line up four before the computer does.', levels: 'Easy, Medium, Hard', icon: <CircleDot size={22} strokeWidth={2} />, accent: 'blue' },
  { type: 'memory', href: '/games/memory', title: 'Memory', desc: 'Match the pairs, made from your own photos.', levels: 'Easy, Medium, Hard', icon: <Images size={22} strokeWidth={2} />, accent: 'or' },
];


const MAX = 1080;

function StatTile({ label, value, icon, loading }: { label: string; value: React.ReactNode; icon: React.ReactNode; loading: boolean }) {
  return (
    <div className={s.stat}>
      <span className={s.statIcon}>{icon}</span>
      <div>
        {loading ? <div className={`skeleton ${s.skelNum}`} /> : <div className={s.statNum}>{value}</div>}
        <div className={s.statLabel}>{label}</div>
      </div>
    </div>
  );
}

function CardRecord({ stats, loading }: { stats?: GameStats; loading: boolean }) {
  if (loading) return <div className={`skeleton ${s.skelLine}`} />;
  if (!stats || stats.played === 0) return <p className={s.record}>Not played yet</p>;
  return (
    <p className={s.record}>
      <span className={s.recWin}>{stats.wins}W</span>
      <span className={s.recLoss}>{stats.losses}L</span>
      <span className={s.recDraw}>{stats.draws}D</span>
      {stats.streak >= 2 && (
        <span className={s.streak}><Flame size={12} strokeWidth={2.5} /> {stats.streak} in a row</span>
      )}
    </p>
  );
}

export default function GamesPage() {
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<GameStats | null>(null);
  const [byGame, setByGame] = useState<Partial<Record<GameType, GameStats>>>({});
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const res = await getGameStats();
        setTotal(res.total);
        setByGame(res.byGame);
      } catch {
        show('Could not load your game stats.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const winRate = total && total.played > 0 ? `${Math.round((total.wins / total.played) * 100)}%` : '0%';

  return (
    <div className={s.page}>
      <Topbar title="Arcade" sub="Pick a game and take on the computer." maxWidth={MAX} />
      <div className={s.wrap}>
        <div className={s.stats}>
          <StatTile label="Total wins" value={total?.wins ?? 0} icon={<Trophy size={18} strokeWidth={2} />} loading={loading} />
          <StatTile label="Win streak" value={total?.streak ?? 0} icon={<Flame size={18} strokeWidth={2} />} loading={loading} />
          <StatTile label="Games played" value={total?.played ?? 0} icon={<Gamepad2 size={18} strokeWidth={2} />} loading={loading} />
          <StatTile label="Win rate" value={winRate} icon={<Crown size={18} strokeWidth={2} />} loading={loading} />
        </div>

        <h2 className={s.section}>All games</h2>
        <div className={s.grid}>
          {GAMES.map(g => (
            <Link key={g.type} href={g.href} className={s.card} data-accent={g.accent}>
              <div className={s.cardTop}>
                <span className={s.cardIcon}>{g.icon}</span>
                <span className={s.levels}>{g.levels}</span>
              </div>
              <h3 className={s.cardTitle}>{g.title}</h3>
              <p className={s.cardDesc}>{g.desc}</p>
              <div className={s.cardFoot}>
                <CardRecord stats={byGame[g.type]} loading={loading} />
                <span className={s.play}>Play <ChevronRight size={15} strokeWidth={2.5} /></span>
              </div>
            </Link>
          ))}
        </div>

      </div>
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
