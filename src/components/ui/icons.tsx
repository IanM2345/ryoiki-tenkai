'use client';
import React from 'react';
import {
  House, LibraryBig, NotebookPen, ListChecks, Lightbulb, ListVideo, MapPin,
  Search, Star, Cloudy, Gamepad2, Palette, Users, Images, ChartColumn, KeyRound,
  LogOut, Sparkles, Heart, Film, BookOpen, Music, Tv, FileText, Link2, StickyNote,
  Eye, Headphones, Compass, Smile, type LucideIcon,
} from 'lucide-react';

/**
 * One place that maps the site's old text symbols and emoji to real icons,
 * so any page can pass a legacy glyph and get a consistent Lucide icon.
 */
const GLYPHS: Record<string, LucideIcon> = {
  '⌂': House, '◫': LibraryBig, '✐': NotebookPen, '✓': ListChecks, '💡': Lightbulb,
  '▷': ListVideo, '◎': MapPin, '📍': MapPin, '⌕': Search, '★': Star, '☁': Cloudy,
  '🎮': Gamepad2, '◑': Palette, '👁': Users, '🖼': Images, '📊': ChartColumn,
  '🔑': KeyRound, '⎋': LogOut, '✦': Sparkles, '🫶': Heart, '🎬': Film, '📖': BookOpen,
  '🎵': Music, '📺': Tv, '📄': FileText, '🔗': Link2, '📝': StickyNote, '✨': Sparkles,
  '👀': Eye, '🎧': Headphones, '🧭': Compass, '😊': Smile,
};

export function glyphIcon(glyph: string): LucideIcon | null {
  return GLYPHS[glyph.trim()] ?? null;
}

/** Renders a Lucide icon for a known glyph, otherwise the glyph itself (e.g. a mood emoji). */
export function Glyph({ g, size = 18, strokeWidth = 1.75, className }: {
  g: React.ReactNode; size?: number; strokeWidth?: number; className?: string;
}) {
  if (typeof g === 'string') {
    const icon = glyphIcon(g);
    if (icon) return React.createElement(icon, { size, strokeWidth, className, 'aria-hidden': true });
  }
  return <span className={className} aria-hidden>{g}</span>;
}
