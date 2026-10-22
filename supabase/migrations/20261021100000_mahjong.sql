-- Let Mahjong Solitaire ('mahjongsol') and classic Mahjong ('mahjong') save their results.
-- Only widens a rule; no data is touched. Safe to run more than once.
ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;
ALTER TABLE public.game_sessions ADD CONSTRAINT game_sessions_game_type_check
  CHECK (game_type = ANY (ARRAY[
    'tic','sudoku','chess','battleship','kadi','matatu',
    'connect4','memory','wordle','g2048','wordsearch','bao',
    'mahjongsol','mahjong'
  ]::text[]));
