// ─── CORE DATA TYPES ─────────────────────────────────────────

export interface Entry {
  id: string;
  user_id: string;
  type: 'link' | 'media' | 'place' | 'note' | 'idea' | 'journal' | 'queue';
  title: string;
  body?: string;
  url?: string;
  mood?: string;
  rating?: number;          // 0–5
  pinned?: boolean;
  tags: string[];
  souls: string[];          // @mentioned soul names
  // Ideas
  status?: 'thinking' | 'planning' | 'doing' | 'done';
  priority?: 'high' | 'medium' | 'low';
  // Queue
  queue_tab?: 'watch' | 'listen' | 'read' | 'explore';
  progress?: number;        // 0–100
  notes?: string;
  date?: string;            // ISO date string
  created_at: string;
  updated_at: string;
}

export interface Place {
  id: string;
  user_id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  visit_date?: string;
  visits?: number;
  rating?: number;
  notes?: string;
  tags: string[];
  created_at: string;
}

export interface Soul {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  role?: string;
  since?: string;
  description?: string;
  notes?: string;
  tags: string[];
  places: string[];
  music: { title: string; meta: string }[];
  shows: { title: string; meta: string }[];
  created_at: string;
}

export interface MoodLog {
  id: string;
  user_id: string;
  feeling_name: string;
  feeling_color: string;
  intensity: number;        // 1–5
  note?: string;
  log_date: string;
  log_time: string;
  created_at: string;
}

export interface MoodDef {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

export interface Rating {
  id: string;
  user_id: string;
  title: string;
  category: string;
  rating: number;           // 1–5
  notes?: string;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  first_login: boolean;
  theme_bg: string;
  theme_accent: string;
  theme_secondary: string;
  theme_text: string;
  theme_font: string;
}

// ─── CLIENT-SIDE FORM TYPES ──────────────────────────────────

export type EntryFormData = Omit<Entry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export type PlaceFormData = Omit<Place, 'id' | 'user_id' | 'created_at'>;

export type SoulFormData = Omit<Soul, 'id' | 'user_id' | 'created_at'>;

export type RatingFormData = Omit<Rating, 'id' | 'user_id' | 'created_at'>;

export type MoodLogFormData = Omit<MoodLog, 'id' | 'user_id' | 'created_at'>;

// ─── UI STATE TYPES ──────────────────────────────────────────

export interface ToastState {
  msg: string;
  color?: string;
}

export interface ModalState<T = unknown> {
  open: boolean;
  mode: 'add' | 'edit' | 'delete' | 'view';
  data?: T;
}

// ─── SEARCH RESULT ───────────────────────────────────────────

export interface SearchResult {
  id: string;
  key: string;
  section: 'Library' | 'Journal' | 'Ideas' | 'Places' | 'Ratings';
  type: string;
  color: string;
  title: string;
  preview?: string;
  rating?: number;
  goTo: string;
}
