// ─── COLOUR TOKENS ───────────────────────────────────────────
export const colors = {
  bg:      '#0d0a0f',
  surf:    '#130d1a',
  card:    '#1a1025',
  cardHov: '#221436',
  or:      '#ff8c00',
  orL:     '#ffb347',
  orD:     '#cc6600',
  pu:      '#7c3aed',
  puL:     '#a855f7',
  puD:     '#4c1d95',
  puG:     '#c084fc',
  tx:      '#f5e6d0',
  txs:     '#c4a882',
  txm:     '#8a7060',
  txd:     '#4a3830',
  bd:      'rgba(255,140,0,0.16)',
  bds:     'rgba(255,140,0,0.07)',
  gr:      '#4ade80',
  red:     '#f87171',
  blue:    '#60a5fa',
} as const;

export const fonts = {
  main: "'Comic Sans MS', 'Comic Neue', cursive",
  mono: "'Courier New', monospace",
} as const;

// ─── ENTRY TYPE META ─────────────────────────────────────────
export const ENTRY_TYPES = {
  Link:   { color: colors.puL,  icon: '🔗' },
  Media:  { color: colors.or,   icon: '🎬' },
  Place:  { color: colors.orL,  icon: '📍' },
  Note:   { color: colors.puG,  icon: '✐'  },
  Idea:   { color: colors.txs,  icon: '💡' },
  Journal:{ color: colors.orL,  icon: '✐'  },
  Queue:  { color: colors.pu,   icon: '▷'  },
} as const;

export type EntryType = keyof typeof ENTRY_TYPES;

// ─── QUEUE CATEGORIES ────────────────────────────────────────
export const QUEUE_TABS = ['watch', 'listen', 'read', 'explore'] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

// ─── IDEA STATUSES ───────────────────────────────────────────
export const IDEA_STATUSES = {
  thinking: { label: 'Thinking',  color: colors.puL },
  planning: { label: 'Planning',  color: colors.or  },
  doing:    { label: 'Doing',     color: colors.gr  },
  done:     { label: 'Done',      color: colors.txm },
} as const;
export type IdeaStatus = keyof typeof IDEA_STATUSES;

// ─── QUEUE STATUSES ──────────────────────────────────────────
export const QUEUE_STATUS = {
  todo:     { label: 'Not Started',  color: colors.txm },
  progress: { label: 'In Progress',  color: colors.or  },
  done:     { label: 'Finished',     color: colors.puL },
} as const;
export type QueueStatus = keyof typeof QUEUE_STATUS;

// ─── RATING CATEGORIES ───────────────────────────────────────
export const RATING_CATS = [
  'Film', 'Book', 'Music', 'Place', 'Series', 'Article', 'Experience',
] as const;
export type RatingCat = (typeof RATING_CATS)[number];

export const RATING_CAT_ICONS: Record<string, string> = {
  Film:       '🎬',
  Book:       '📖',
  Music:      '🎵',
  Place:      '📍',
  Series:     '📺',
  Article:    '📄',
  Experience: '✨',
};

// ─── MOOD EMOJIS ─────────────────────────────────────────────
export const MOOD_EMOJIS: Record<string, string> = {
  '😊': 'happy',
  '🌟': 'radiant',
  '😌': 'calm',
  '😢': 'sad',
  '😤': 'frustrated',
  '🫶': 'loved',
  '✨': 'inspired',
  '🔥': 'energised',
  '🌧': 'heavy',
  '💫': 'dreamy',
};

export const DEFAULT_MOODS = [
  { name: 'happy',     color: '#f59e0b' },
  { name: 'tired',     color: '#f97316' },
  { name: 'anxious',   color: '#a855f7' },
  { name: 'refreshed', color: '#22d3ee' },
  { name: 'sad',       color: '#6366f1' },
  { name: 'calm',      color: '#3b82f6' },
  { name: 'loved',     color: '#ec4899' },
  { name: 'energised', color: '#ef4444' },
];

// ─── PRESET THEMES ───────────────────────────────────────────
export const PRESET_THEMES = [
  { name: 'Default',  bg: '#0d0a0f', accent: '#ff8c00', secondary: '#7c3aed', text: '#f5e6d0' },
  { name: 'Warm',     bg: '#f5f0e8', accent: '#c9736a', secondary: '#9b8ec4', text: '#1a1612' },
  { name: 'Midnight', bg: '#0d0f1a', accent: '#7b8eff', secondary: '#c4b0ff', text: '#e8e0ff' },
  { name: 'Sage',     bg: '#0a1a0a', accent: '#4ade80', secondary: '#a3e635', text: '#d4f5d4' },
  { name: 'Rose',     bg: '#1a0a10', accent: '#f43f5e', secondary: '#fb7185', text: '#ffe4e8' },
  { name: 'Ocean',    bg: '#04111a', accent: '#22d3ee', secondary: '#38bdf8', text: '#e0f2fe' },
];

export const APP_FONTS: Record<string, string> = {
  comic:   "'Comic Sans MS', cursive",
  georgia: 'Georgia, serif',
  mono:    "'Courier New', monospace",
  system:  'system-ui, sans-serif',
};
