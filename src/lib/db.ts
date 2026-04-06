/**
 * db.ts — typed query functions for every yourworld table.
 *
 * Every function:
 *  - Returns typed data or throws an error (never silently swallows)
 *  - Uses the authenticated user's session (RLS enforces user_id)
 *  - Uses snake_case column names matching the Supabase schema
 */

import { supabase } from './supabase';

// ─── HELPER ──────────────────────────────────────────────────
// Unwrap Supabase response — throw on error, return data
function unwrap<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  return data as T;
}


// ================================================================
//  AUTH
// ================================================================

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}


// ================================================================
//  USER SETTINGS
// ================================================================

export interface DbUserSettings {
  user_id:              string;
  first_login:          boolean;
  theme_bg:             string;
  theme_accent:         string;
  theme_secondary:      string;
  theme_text:           string;
  theme_font:           string;
  theme_font_size:      number;
  password_reset_done:  boolean;
  first_login_done:     boolean;
}

export async function getSettings(): Promise<DbUserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .single();
  if (error && error.code === 'PGRST116') return null; // no row yet
  return unwrap(data, error);
}

export async function saveSettings(settings: Partial<Omit<DbUserSettings, 'user_id'>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, ...settings })
    .select()
    .single();
  return unwrap(data, error);
}


// ================================================================
//  TASKS
// ================================================================

export interface DbTask {
  id:           string;
  user_id:      string;
  text:         string;
  done:         boolean;
  done_at:      string | null;  // date string YYYY-MM-DD
  priority:     'high' | 'medium' | 'low';
  due_date:     string | null;  // date string YYYY-MM-DD
  created_date: string;
  created_at:   string;
  updated_at:   string;
}

export async function getTasks(): Promise<DbTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function addTask(task: {
  text: string;
  priority: 'high' | 'medium' | 'low';
  due_date?: string | null;
  created_date: string;
}): Promise<DbTask> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateTask(id: string, updates: Partial<Pick<DbTask, 'text' | 'done' | 'done_at' | 'priority' | 'due_date'>>): Promise<DbTask> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function clearDoneTasks(): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('done', true);
  if (error) throw error;
}


// ================================================================
//  JOURNAL ENTRIES
// ================================================================

export interface DbJournalEntry {
  id:         string;
  user_id:    string;
  title:      string;
  body:       string;
  mood:       string | null;
  pinned:     boolean;
  tags:       string[];
  entry_date: string;
  entry_time: string | null;
  created_at: string;
  updated_at: string;
}

export async function getJournalEntries(): Promise<DbJournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function getJournalEntry(id: string): Promise<DbJournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', id)
    .single();
  return unwrap(data, error);
}

export async function addJournalEntry(entry: {
  title: string;
  body: string;
  mood?: string | null;
  pinned?: boolean;
  tags?: string[];
  entry_date: string;
  entry_time?: string | null;
}): Promise<DbJournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert(entry)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateJournalEntry(id: string, updates: Partial<Omit<DbJournalEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbJournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { error } = await supabase.from('journal_entries').delete().eq('id', id);
  if (error) throw error;
}

// Link/unlink souls to a journal entry
export async function setJournalEntrySouls(entryId: string, soulIds: string[]): Promise<void> {
  // Delete existing links first
  const { error: delError } = await supabase
    .from('journal_entry_souls')
    .delete()
    .eq('journal_entry_id', entryId);
  if (delError) throw delError;

  // Insert new links if any
  if (soulIds.length > 0) {
    const { error } = await supabase
      .from('journal_entry_souls')
      .insert(soulIds.map(soul_id => ({ journal_entry_id: entryId, soul_id })));
    if (error) throw error;
  }
}

export async function getJournalEntrySoulIds(entryId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('journal_entry_souls')
    .select('soul_id')
    .eq('journal_entry_id', entryId);
  const rows = unwrap(data, error) ?? [];
  return rows.map((r: { soul_id: string }) => r.soul_id);
}


// ================================================================
//  LIBRARY
// ================================================================

export interface DbLibraryEntry {
  id:         string;
  user_id:    string;
  type:       'link' | 'media' | 'place' | 'note' | 'idea';
  title:      string;
  meta:       string | null;
  url:        string | null;
  rating:     number;
  notes:      string | null;
  tags:       string[];
  created_at: string;
  updated_at: string;
}

export async function getLibrary(): Promise<DbLibraryEntry[]> {
  const { data, error } = await supabase
    .from('library')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function addLibraryEntry(entry: {
  type: DbLibraryEntry['type'];
  title: string;
  meta?: string | null;
  url?: string | null;
  rating?: number;
  notes?: string | null;
  tags?: string[];
}): Promise<DbLibraryEntry> {
  const { data, error } = await supabase
    .from('library')
    .insert(entry)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateLibraryEntry(id: string, updates: Partial<Omit<DbLibraryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbLibraryEntry> {
  const { data, error } = await supabase
    .from('library')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('library').delete().eq('id', id);
  if (error) throw error;
}


// ================================================================
//  IDEAS
// ================================================================

export interface DbIdea {
  id:         string;
  user_id:    string;
  title:      string;
  body:       string;
  status:     'thinking' | 'planning' | 'doing' | 'done';
  priority:   'high' | 'medium' | 'low';
  tags:       string[];
  created_at: string;
  updated_at: string;
}

export async function getIdeas(): Promise<DbIdea[]> {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function addIdea(idea: {
  title: string;
  body?: string;
  status?: DbIdea['status'];
  priority?: DbIdea['priority'];
  tags?: string[];
}): Promise<DbIdea> {
  const { data, error } = await supabase
    .from('ideas')
    .insert(idea)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateIdea(id: string, updates: Partial<Omit<DbIdea, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbIdea> {
  const { data, error } = await supabase
    .from('ideas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteIdea(id: string): Promise<void> {
  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw error;
}


// ================================================================
//  QUEUE
// ================================================================

export interface DbQueueItem {
  notes: string;
  id:         string;
  user_id:    string;
  tab:        'watch' | 'listen' | 'read' | 'explore';
  title:      string;
  meta:       string | null;
  status:     'todo' | 'progress' | 'done';
  pct:        number;
  color:      string;
  added_date: string;
  created_at: string;
  updated_at: string;
}

export async function getQueue(): Promise<DbQueueItem[]> {
  const { data, error } = await supabase
    .from('queue')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function addQueueItem(item: {
  tab: DbQueueItem['tab'];
  title: string;
  meta?: string | null;
  status?: DbQueueItem['status'];
  pct?: number;
  color?: string;
  added_date?: string;
}): Promise<DbQueueItem> {
  const { data, error } = await supabase
    .from('queue')
    .insert(item)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateQueueItem(id: string, updates: Partial<Omit<DbQueueItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbQueueItem> {
  const { data, error } = await supabase
    .from('queue')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteQueueItem(id: string): Promise<void> {
  const { error } = await supabase.from('queue').delete().eq('id', id);
  if (error) throw error;
}


// ================================================================
//  PLACES
// ================================================================

export interface DbPlace {
  id:         string;
  user_id:    string;
  name:       string;
  address:    string | null;
  lat:        number | null;
  lng:        number | null;
  visit_date: string | null;
  visits:     number;
  rating:     number;
  notes:      string | null;
  tags:       string[];
  created_at: string;
  updated_at: string;
}

export async function getPlaces(): Promise<DbPlace[]> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function addPlace(place: {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  visit_date?: string | null;
  visits?: number;
  rating?: number;
  notes?: string | null;
  tags?: string[];
}): Promise<DbPlace> {
  const { data, error } = await supabase
    .from('places')
    .insert(place)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updatePlace(id: string, updates: Partial<Omit<DbPlace, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbPlace> {
  const { data, error } = await supabase
    .from('places')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deletePlace(id: string): Promise<void> {
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) throw error;
}


// ================================================================
//  RATINGS
// ================================================================

export interface DbRating {
  id:         string;
  user_id:    string;
  title:      string;
  category:   string;
  rating:     number;
  notes:      string | null;
  created_at: string;
  updated_at: string;
}

export async function getRatings(): Promise<DbRating[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .order('rating', { ascending: false })
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

export async function addRating(rating: {
  title: string;
  category: string;
  rating: number;
  notes?: string | null;
}): Promise<DbRating> {
  const { data, error } = await supabase
    .from('ratings')
    .insert(rating)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateRating(id: string, updates: Partial<Omit<DbRating, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbRating> {
  const { data, error } = await supabase
    .from('ratings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteRating(id: string): Promise<void> {
  const { error } = await supabase.from('ratings').delete().eq('id', id);
  if (error) throw error;
}


// ================================================================
//  SOULS
// ================================================================

export interface DbSoul {
  id:          string;
  user_id:     string;
  name:        string;
  emoji:       string;
  color:       string;
  role:        string | null;
  since:       string | null;
  description: string | null;
  notes:       string | null;
  tags:        string[];
  created_at:  string;
  updated_at:  string;
}

export interface DbSoulMedia {
  id:         string;
  user_id:    string;
  soul_id:    string;
  kind:       'show' | 'music' | 'book' | 'film' | 'other';
  title:      string;
  meta:       string | null;
  created_at: string;
}

export async function getSouls(): Promise<DbSoul[]> {
  const { data, error } = await supabase
    .from('souls')
    .select('*')
    .order('created_at', { ascending: true });
  return unwrap(data, error) ?? [];
}

export async function getSoul(id: string): Promise<DbSoul> {
  const { data, error } = await supabase
    .from('souls')
    .select('*')
    .eq('id', id)
    .single();
  return unwrap(data, error);
}

export async function getSoulMedia(soulId: string): Promise<DbSoulMedia[]> {
  const { data, error } = await supabase
    .from('soul_media')
    .select('*')
    .eq('soul_id', soulId)
    .order('created_at', { ascending: true });
  return unwrap(data, error) ?? [];
}

export async function addSoul(soul: {
  name: string;
  emoji: string;
  color: string;
  role?: string | null;
  since?: string | null;
  description?: string | null;
  notes?: string | null;
  tags?: string[];
}): Promise<DbSoul> {
  const { data, error } = await supabase
    .from('souls')
    .insert(soul)
    .select()
    .single();
  return unwrap(data, error);
}

export async function updateSoul(id: string, updates: Partial<Omit<DbSoul, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbSoul> {
  const { data, error } = await supabase
    .from('souls')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteSoul(id: string): Promise<void> {
  const { error } = await supabase.from('souls').delete().eq('id', id);
  if (error) throw error;
}

export async function addSoulMedia(media: {
  soul_id: string;
  kind: DbSoulMedia['kind'];
  title: string;
  meta?: string | null;
}): Promise<DbSoulMedia> {
  const { data, error } = await supabase
    .from('soul_media')
    .insert(media)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteSoulMedia(id: string): Promise<void> {
  const { error } = await supabase.from('soul_media').delete().eq('id', id);
  if (error) throw error;
}


// ================================================================
//  MOOD
// ================================================================

export interface DbMoodDef {
  id:         string;
  user_id:    string;
  name:       string;
  color:      string;
  sort_order: number;
  created_at: string;
}

export interface DbMoodLog {
  id:            string;
  user_id:       string;
  mood_def_id:   string | null;
  feeling_name:  string;
  feeling_color: string;
  intensity:     number;
  note:          string | null;
  log_date:      string;
  log_time:      string | null;
  created_at:    string;
}

export async function getMoodDefs(): Promise<DbMoodDef[]> {
  const { data, error } = await supabase
    .from('mood_defs')
    .select('*')
    .order('sort_order', { ascending: true });
  return unwrap(data, error) ?? [];
}

export async function addMoodDef(def: {
  name: string;
  color: string;
  sort_order?: number;
}): Promise<DbMoodDef> {
  const { data, error } = await supabase
    .from('mood_defs')
    .insert(def)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteMoodDef(id: string): Promise<void> {
  const { error } = await supabase.from('mood_defs').delete().eq('id', id);
  if (error) throw error;
}

export async function getMoodLogs(date?: string): Promise<DbMoodLog[]> {
  let query = supabase
    .from('mood_logs')
    .select('*')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (date) query = query.eq('log_date', date);

  const { data, error } = await query;
  return unwrap(data, error) ?? [];
}

export async function addMoodLog(log: {
  mood_def_id?: string | null;
  feeling_name: string;
  feeling_color: string;
  intensity: number;
  note?: string | null;
  log_date: string;
  log_time?: string | null;
}): Promise<DbMoodLog> {
  const { data, error } = await supabase
    .from('mood_logs')
    .insert(log)
    .select()
    .single();
  return unwrap(data, error);
}

export async function deleteMoodLog(id: string): Promise<void> {
  const { error } = await supabase.from('mood_logs').delete().eq('id', id);
  if (error) throw error;
}


export interface DbSoulLink {
  id:         string;
  user_id:    string;
  soul_id:    string;
  table_name: 'library' | 'places' | 'ratings' | 'queue' | 'ideas';
  item_id:    string;
  item_title: string;
  item_meta:  string | null;
  created_at: string;
}

/** All links for a given soul (used on soul profile page) */
export async function getSoulLinks(soulId: string): Promise<DbSoulLink[]> {
  const { data, error } = await supabase
    .from('soul_links')
    .select('*')
    .eq('soul_id', soulId)
    .order('created_at', { ascending: true });
  return unwrap(data, error) ?? [];
}

/** All soul links for a specific item (used when opening edit modal) */
export async function getSoulLinksForItem(
  tableName: DbSoulLink['table_name'],
  itemId: string
): Promise<DbSoulLink[]> {
  const { data, error } = await supabase
    .from('soul_links')
    .select('*')
    .eq('table_name', tableName)
    .eq('item_id', itemId)
    .order('created_at', { ascending: true });
  return unwrap(data, error) ?? [];
}

/** Add a single soul link */
export async function addSoulLink(link: {
  soul_id:    string;
  table_name: DbSoulLink['table_name'];
  item_id:    string;
  item_title: string;
  item_meta?: string | null;
}): Promise<DbSoulLink> {
  const { data, error } = await supabase
    .from('soul_links')
    .insert(link)
    .select()
    .single();
  return unwrap(data, error);
}

/** Delete a single soul link by its own id */
export async function deleteSoulLink(id: string): Promise<void> {
  const { error } = await supabase.from('soul_links').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sync soul links for an item — replaces ALL existing links for that item
 * with exactly the provided soulIds. Call after saving the item itself.
 *
 * @param tableName  which table the item belongs to
 * @param itemId     the item's uuid
 * @param itemTitle  denormalised title stored on each link row
 * @param itemMeta   denormalised subtitle/details (nullable)
 * @param soulIds    the full desired set of linked soul ids (empty = unlink all)
 */
export async function setSoulLinks(
  tableName: DbSoulLink['table_name'],
  itemId: string,
  itemTitle: string,
  itemMeta: string | null,
  soulIds: string[]
): Promise<void> {
  // 1. Delete all existing links for this item
  const { error: delError } = await supabase
    .from('soul_links')
    .delete()
    .eq('table_name', tableName)
    .eq('item_id', itemId);
  if (delError) throw delError;

  // 2. Insert fresh links (skip if none)
  if (soulIds.length === 0) return;

  const rows = soulIds.map(soul_id => ({
    soul_id,
    table_name: tableName,
    item_id:    itemId,
    item_title: itemTitle,
    item_meta:  itemMeta,
  }));

  const { error: insError } = await supabase
    .from('soul_links')
    .insert(rows);
  if (insError) throw insError;
}

// ================================================================
//  GAME SESSIONS
//  Append this block to the bottom of src/lib/db.ts
// ================================================================

export type GameType = 'tic' | 'sudoku' | 'chess' | 'battleship' | 'kadi' | 'matatu';
export type GameDifficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'in_progress' | 'finished';
export type GameResult = 'win' | 'loss' | 'draw';

export interface DbGameSession {
  id:         string;
  user_id:    string;
  game_type:  GameType;
  difficulty: GameDifficulty;
  state:      Record<string, unknown> | null;
  status:     GameStatus;
  result:     GameResult | null;
  created_at: string;
  updated_at: string;
}

/** Save or update an in-progress game state */
export async function saveGame(
  gameType: GameType,
  difficulty: GameDifficulty,
  state: Record<string, unknown>
): Promise<DbGameSession> {
  // Load existing in-progress session for this game type
  const { data: existing } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('game_type', gameType)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ state, difficulty, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    return unwrap(data, error);
  } else {
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({ game_type: gameType, difficulty, state, status: 'in_progress' })
      .select()
      .single();
    return unwrap(data, error);
  }
}

/** Load the most recent in-progress session for a game type */
export async function loadGame(gameType: GameType): Promise<DbGameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('game_type', gameType)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Mark a game as finished and record the result */
export async function saveResult(
  gameType: GameType,
  difficulty: GameDifficulty,
  result: GameResult
): Promise<void> {
  // Close any in-progress session for this game
  const { data: existing } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('game_type', gameType)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('game_sessions')
      .update({ status: 'finished', result, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    // No in-progress session — create a finished one directly (e.g. very fast game)
    const { error } = await supabase
      .from('game_sessions')
      .insert({ game_type: gameType, difficulty, state: null, status: 'finished', result });
    if (error) throw error;
  }
}

/** Get all finished sessions for a game type (for stats/leaderboard) */
export async function getGameHistory(gameType: GameType): Promise<DbGameSession[]> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('game_type', gameType)
    .eq('status', 'finished')
    .order('created_at', { ascending: false });
  return unwrap(data, error) ?? [];
}

/** Win/loss/draw counts per game type */
export async function getGameStats(gameType: GameType): Promise<{
  wins: number; losses: number; draws: number;
}> {
  const sessions = await getGameHistory(gameType);
  return {
    wins:   sessions.filter(s => s.result === 'win').length,
    losses: sessions.filter(s => s.result === 'loss').length,
    draws:  sessions.filter(s => s.result === 'draw').length,
  };
}


// ============================================================
// GALLERY — append these to the bottom of src/lib/db.ts
// ============================================================

export type GallerySource = 'library' | 'souls' | 'places' | 'gallery';

export interface GalleryImage {
  id:        string;
  image_url: string;
  title:     string;
  source:    GallerySource;
  href:      string;
  emoji?:    string;
  subtitle?: string;
  // gallery_images only
  caption?:  string;
  raw_id?:   string; // original DB id for deletion
}

// ── Direct gallery uploads ────────────────────────────────────

export interface DbGalleryImage {
  id:         string;
  user_id:    string;
  image_url:  string;
  caption:    string | null;
  created_at: string;
}

export async function getGalleryImages(): Promise<DbGalleryImage[]> {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addGalleryImage(
  image_url: string,
  caption: string | null
): Promise<DbGalleryImage> {
  const { data, error } = await supabase
    .from('gallery_images')
    .insert({ image_url, caption })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const { error } = await supabase.from('gallery_images').delete().eq('id', id);
  if (error) throw error;
}

export async function updateGalleryImageCaption(id: string, caption: string): Promise<void> {
  const { error } = await supabase.from('gallery_images').update({ caption }).eq('id', id);
  if (error) throw error;
}

// ── getAllImages — pulls from all 4 sources ───────────────────

export async function getAllImages(): Promise<GalleryImage[]> {
  const [lib, soulsRes, placesRes, galleryRes] = await Promise.all([
    supabase.from('library').select('id, title, image_url, type').not('image_url', 'is', null),
    supabase.from('souls').select('id, name, image_url, emoji').not('image_url', 'is', null),
    supabase.from('places').select('id, name, image_url').not('image_url', 'is', null),
    supabase.from('gallery_images').select('*').order('created_at', { ascending: false }),
  ]);

  const images: GalleryImage[] = [];

  for (const item of galleryRes.data ?? []) {
    if (!item.image_url) continue;
    images.push({
      id:        `gallery-${item.id}`,
      raw_id:    item.id,
      image_url: item.image_url,
      title:     item.caption ?? 'Photo',
      caption:   item.caption ?? undefined,
      source:    'gallery',
      href:      '/gallery',
    });
  }

  for (const item of lib.data ?? []) {
    if (!item.image_url) continue;
    images.push({
      id:        `library-${item.id}`,
      image_url: item.image_url,
      title:     item.title,
      source:    'library',
      href:      '/library',
      subtitle:  item.type,
    });
  }

  for (const item of soulsRes.data ?? []) {
    if (!item.image_url) continue;
    images.push({
      id:        `souls-${item.id}`,
      image_url: item.image_url,
      title:     item.name,
      source:    'souls',
      href:      `/souls/${item.id}`,
      emoji:     item.emoji ?? undefined,
    });
  }

  for (const item of placesRes.data ?? []) {
    if (!item.image_url) continue;
    images.push({
      id:        `places-${item.id}`,
      image_url: item.image_url,
      title:     item.name,
      source:    'places',
      href:      '/places',
    });
  }

  return images;
}