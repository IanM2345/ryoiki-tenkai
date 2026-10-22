// "How to play" videos for the Arcade. Each one has a portrait (phones) and a landscape
// (laptops, iPad sideways) version in /public/tutorials. Add a game here once its video exists.
export const TUTORIALS: Record<string, { title: string; seconds: number; href: string }> = {
  'mahjong-solitaire': { title: 'Mahjong Solitaire', seconds: 80, href: '/games/mahjong-solitaire' },
  mahjong: { title: 'Mahjong', seconds: 112, href: '/games/mahjong' },
  'tic-tac-toe': { title: 'Tic Tac Toe', seconds: 27, href: '/games/tic-tac-toe' },
  sudoku: { title: 'Sudoku', seconds: 63, href: '/games/sudoku' },
  chess: { title: 'Chess', seconds: 56, href: '/games/chess' },
  battleship: { title: 'Battleship', seconds: 59, href: '/games/battleship' },
  kadi: { title: 'Kadi', seconds: 65, href: '/games/kadi' },
  matatu: { title: 'Matatu', seconds: 58, href: '/games/matatu' },
  'connect-four': { title: 'Connect Four', seconds: 42, href: '/games/connect-four' },
  memory: { title: 'Memory', seconds: 43, href: '/games/memory' },
  '2048': { title: '2048', seconds: 41, href: '/games/2048' },
  wordle: { title: 'Wordle', seconds: 42, href: '/games/wordle' },
  'word-search': { title: 'Word Search', seconds: 31, href: '/games/word-search' },
  bao: { title: 'Bao', seconds: 46, href: '/games/bao' },
};

/** Every video in Arcade order. (Object.entries would put '2048' first, since number-like keys sort ahead.) */
export const TUTORIAL_ORDER = ['mahjong-solitaire', 'mahjong', 'tic-tac-toe', 'sudoku', 'chess', 'battleship', 'kadi', 'matatu', 'connect-four', 'memory', '2048', 'wordle', 'word-search', 'bao']
  .filter(slug => TUTORIALS[slug]);

export const tutorialSrc = (slug: string, portrait: boolean) => ({
  src: `/tutorials/${slug}-${portrait ? 'portrait' : 'landscape'}.mp4`,
  poster: `/tutorials/${slug}-${portrait ? 'portrait' : 'landscape'}.jpg`,
});
