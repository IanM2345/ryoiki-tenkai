-- Allow the newer arcade games to save their results.
-- Safe to run on staging and on her project: it only widens a rule, no data touched.
ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;
ALTER TABLE public.game_sessions ADD CONSTRAINT game_sessions_game_type_check
  CHECK (game_type = ANY (ARRAY[
    'tic','sudoku','chess','battleship','kadi','matatu',
    'connect4','memory','wordle','g2048','wordsearch','bao'
  ]::text[]));
