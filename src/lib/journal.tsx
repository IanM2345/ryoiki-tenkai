import React from 'react';
import type { DbSoul } from './db';

/** Mood emoji and their names. The emoji is what gets stored in the database. */
export const MOODS: Record<string, string> = {
  '😊': 'happy', '🌟': 'radiant', '😌': 'calm', '😢': 'sad', '😤': 'frustrated',
  '🫶': 'loved', '✨': 'inspired', '🔥': 'energised', '🌧': 'heavy', '💫': 'dreamy',
};

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits text into plain parts and @mentions of real souls (names may contain spaces).
 * Unknown @words are left as plain text.
 */
export function renderMentions(body: string, souls: DbSoul[], className?: string): React.ReactNode[] {
  if (!souls.length || !body.includes('@')) return [body];
  const names = [...souls].sort((a, b) => b.name.length - a.name.length).map(s => esc(s.name));
  const re = new RegExp(`@(${names.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const byName = new Map(souls.map(s => [s.name.toLowerCase(), s]));
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const soul = byName.get(m[1].toLowerCase());
    if (!soul || m.index === undefined) continue;
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span
        key={m.index}
        className={className}
        style={{ color: soul.color, background: `color-mix(in oklab, ${soul.color} 14%, transparent)` }}
      >
        @{soul.name}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Gentle prompts shown on a blank journal entry. */
export const JOURNAL_PROMPTS = [
  'What made you smile today?',
  'Who are you grateful for right now, and why?',
  'What is something small that went well today?',
  'What is on your mind that you have not said out loud?',
  'Describe today in three words, then explain one of them.',
  'What is something you are looking forward to?',
  'What did you learn about yourself this week?',
  'If today had a colour, what would it be?',
  'What is a moment from today you want to remember?',
  'What would make tomorrow feel good?',
  'What is something you are proud of lately?',
  'Who did you connect with today, and how did it feel?',
  'What has been taking up space in your head?',
  'What is one kind thing you could do for yourself?',
  'What does your ideal quiet evening look like?',
  'What is a place you keep thinking about?',
  'What song fits your mood right now?',
  'What is something you want to let go of?',
];
