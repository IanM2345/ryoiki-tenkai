import { supabase } from './supabase';
import type { GameType, GameResult, GameDifficulty } from './db';

export type { GameType, GameResult, GameDifficulty };

export const GAME_LABEL: Record<GameType, string> = {
  tic: 'Tic Tac Toe', sudoku: 'Sudoku', chess: 'Chess', battleship: 'Battleship', kadi: 'Kadi', matatu: 'Matatu',
};

/** Map any in-game difficulty name onto the three the database accepts. */
export function dbDifficulty(d: string): GameDifficulty {
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  return d === 'impossible' || d === 'expert' ? 'hard' : 'medium';
}

/**
 * Save a finished game. Call once when a game ends.
 * Never throws: a failed save must not break the game.
 */
export async function recordResult(game: GameType, difficulty: string, result: GameResult): Promise<boolean> {
  try {
    const { error } = await supabase.from('game_sessions').insert({
      game_type: game, difficulty: dbDifficulty(difficulty), state: null, status: 'finished', result,
    });
    return !error;
  } catch {
    return false;
  }
}

export interface GameStats { wins: number; losses: number; draws: number; played: number; streak: number }

/** Totals per game plus overall, newest results first for the win streak. */
export async function getGameStats(): Promise<{ total: GameStats; byGame: Partial<Record<GameType, GameStats>> }> {
  const empty = (): GameStats => ({ wins: 0, losses: 0, draws: 0, played: 0, streak: 0 });
  const total = empty();
  const byGame: Partial<Record<GameType, GameStats>> = {};
  const { data, error } = await supabase
    .from('game_sessions')
    .select('game_type, result, created_at')
    .eq('status', 'finished')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error || !data) return { total, byGame };
  const streakOpen: Partial<Record<GameType, boolean>> = {};
  let totalStreakOpen = true;
  for (const row of data as { game_type: GameType; result: GameResult | null }[]) {
    const g = (byGame[row.game_type] ??= empty());
    for (const s of [g, total]) {
      s.played++;
      if (row.result === 'win') s.wins++;
      else if (row.result === 'loss') s.losses++;
      else if (row.result === 'draw') s.draws++;
    }
    if (streakOpen[row.game_type] !== false) {
      if (row.result === 'win') g.streak++; else streakOpen[row.game_type] = false;
    }
    if (totalStreakOpen) { if (row.result === 'win') total.streak++; else totalStreakOpen = false; }
  }
  return { total, byGame };
}
