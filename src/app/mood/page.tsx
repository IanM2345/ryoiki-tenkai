'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Trash2, Palette, Cloud, CloudSun, History, Check } from 'lucide-react';
import s from './mood.module.css';
import YearInPixels from './YearInPixels';
import {
  Btn, Lbl, Topbar, Modal, ModalTitle, Confirm, FInput, FArea, EmptyState, Toast, useToast,
} from '@/components/ui';
import {
  getMoodDefs, addMoodDef, deleteMoodDef,
  getMoodLogs, addMoodLog, deleteMoodLog,
  type DbMoodDef, type DbMoodLog,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { localDateStr, localTimeStr, relDay } from '@/lib/dates';

// ─── TYPES & DATA ─────────────────────────────────────────────
interface MoodDef   { id: string; name: string; color: string; }
interface MoodEntry { id: string; name: string; color: string; defId: string | null; intensity: number; note: string; time: string; date: string; }

/** Only used if the account has no moods at all (the signup trigger normally seeds these). */
const STARTER_MOODS: { name: string; color: string }[] = [
  { name: 'happy',      color: '#f59e0b' },
  { name: 'calm',       color: '#3b82f6' },
  { name: 'energised',  color: '#ef4444' },
  { name: 'loved',      color: '#ec4899' },
  { name: 'anxious',    color: '#8b5cf6' },
  { name: 'sad',        color: '#6b7280' },
  { name: 'tired',      color: '#78716c' },
  { name: 'frustrated', color: '#f97316' },
];

/** Colour choices for a new mood (user data, so concrete values are fine). */
const SWATCHES = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#22d3ee', '#10b981', '#84cc16', '#f472b6', '#78716c'];

const INTENSITY = ['A little', 'Mild', 'Noticeable', 'Strong', 'Overwhelming'];
const HISTORY_PAGE = 10;

const toDef = (d: DbMoodDef): MoodDef => ({ id: d.id, name: d.name, color: d.color });
const toEntry = (l: DbMoodLog): MoodEntry => ({
  id: l.id, name: l.feeling_name, color: l.feeling_color, defId: l.mood_def_id,
  intensity: l.intensity, note: l.note ?? '', time: (l.log_time ?? '').slice(0, 5), date: l.log_date,
});
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ─── COLOUR HELPERS (canvas needs concrete colours) ───────────
type RGB = [number, number, number];

/** Parse #rgb, #rgba, #rrggbb, #rrggbbaa or rgb()/rgba(). Returns null when unknown. */
function parseColor(input: string | null | undefined): RGB | null {
  if (!input) return null;
  const c = input.trim();
  const hex = c.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split('').map(ch => ch + ch).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

/** Any colour plus alpha to an rgba() string, with a fallback colour when parsing fails. */
function toRgba(color: string, alpha: number, fallback: RGB): string {
  const [r, g, b] = parseColor(color) ?? fallback;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── BUBBLE FIELD (canvas engine, lives outside React) ────────
interface Bubble {
  log: MoodEntry;
  x: number; y: number; vx: number; vy: number;
  base: number; r: number; squash: number;
  phase: number; speed: number; alpha: number;
}
interface BubbleHit { log: MoodEntry; x: number; y: number; r: number; }

interface Star { x: number; y: number; r: number; a: number; }

class BubbleField {
  private ctx: CanvasRenderingContext2D | null;
  private bubbles: Bubble[] = [];
  private stars: Star[] = Array.from({ length: 60 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.3, a: Math.random() * 0.35 + 0.08,
  }));
  private w = 0; private h = 0; private dpr = 1;
  private raf: number | null = null;
  private hoverId: string | null = null;
  private reduced: boolean;
  private tx: RGB = [245, 230, 208];
  private accentFallback: RGB = [168, 85, 247];
  private fontFamily = 'cursive';
  private ro: ResizeObserver;
  private mo: MutationObserver;
  private mq: MediaQueryList;

  constructor(private canvas: HTMLCanvasElement, private host: HTMLElement) {
    this.ctx = canvas.getContext('2d');
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.mq.matches;
    this.readColors();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    // Theme changes rewrite inline vars on <html>; re-read colours when that happens.
    this.mo = new MutationObserver(() => { this.readColors(); this.requestDraw(); });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-scheme'] });
    this.mq.addEventListener('change', this.onMotionChange);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  destroy() {
    this.stop();
    this.ro.disconnect();
    this.mo.disconnect();
    this.mq.removeEventListener('change', this.onMotionChange);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  setLogs(logs: MoodEntry[]) {
    const prev = new Map(this.bubbles.map(b => [b.log.id, b]));
    // A temp entry replaced by its saved version keeps the same bubble.
    this.bubbles = logs.map((log, i) => {
      const old = prev.get(log.id) ?? this.bubbles.find(b => b.log.id.startsWith('temp-') && b.log.name === log.name && b.log.note === log.note && !logs.some(l => l.id === b.log.id));
      if (old) { old.log = log; old.base = 22 + log.intensity * 10; return old; }
      const angle = (i / Math.max(logs.length, 1)) * Math.PI * 2 + Math.random() * 0.6;
      const d = 30 + Math.random() * Math.min(this.w, this.h) * 0.25;
      return {
        log,
        x: this.w / 2 + Math.cos(angle) * d, y: this.h / 2 + Math.sin(angle) * d,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        base: 22 + log.intensity * 10, r: 0, squash: 0.9 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2, speed: 0.005 + Math.random() * 0.004,
        alpha: this.reduced ? 1 : 0,
      };
    });
    this.fitRadii();
    if (this.reduced) this.settle();
    this.syncLoop();
    this.requestDraw();
  }

  setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.requestDraw();
  }

  hitTest(x: number, y: number): BubbleHit | null {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const dx = x - b.x, dy = (y - b.y) / b.squash;
      if (dx * dx + dy * dy < b.r * b.r * 1.1) return { log: b.log, x: b.x, y: b.y, r: b.r };
    }
    return null;
  }

  // ── internals ───────────────────────────────────────────────
  private onMotionChange = () => {
    this.reduced = this.mq.matches;
    if (this.reduced) { this.bubbles.forEach(b => { b.alpha = 1; }); this.settle(); }
    this.syncLoop();
    this.requestDraw();
  };

  private onVisibility = () => this.syncLoop();

  private readColors() {
    const cs = getComputedStyle(this.host);
    this.tx = parseColor(cs.color) ?? this.tx;
    this.fontFamily = cs.fontFamily || this.fontFamily;
    const pu = parseColor(cs.getPropertyValue('--bubble-fallback'));
    if (pu) this.accentFallback = pu;
  }

  private resize() {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(0, Math.round(rect.width)), h = Math.max(0, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    const sx = this.w ? w / this.w : 1, sy = this.h ? h / this.h : 1;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.bubbles.forEach(b => { b.x *= sx; b.y *= sy; });
    this.fitRadii();
    if (this.reduced) this.settle();
    this.draw();
  }

  /** Shrink bubbles when there are many of them or the stage is small. */
  private fitRadii() {
    if (!this.w || !this.h) return;
    const area = this.bubbles.reduce((sum, b) => sum + Math.PI * b.base * b.base, 0);
    const k = area ? Math.min(1.15, Math.sqrt((this.w * this.h * 0.42) / area)) : 1;
    const small = Math.min(1, Math.min(this.w, this.h) / 300);
    this.bubbles.forEach(b => { b.r = Math.max(14, b.base * Math.min(k, 1.15) * small); this.clamp(b); });
  }

  private clamp(b: Bubble) {
    const ry = b.r * b.squash;
    if (b.x - b.r < 0)      { b.x = b.r;          b.vx = Math.abs(b.vx); }
    if (b.x + b.r > this.w) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y - ry < 0)       { b.y = ry;           b.vy = Math.abs(b.vy); }
    if (b.y + ry > this.h)  { b.y = this.h - ry;  b.vy = -Math.abs(b.vy); }
  }

  private separate(strength: number) {
    const b = this.bubbles;
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        const a = b[i], c = b[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const min = (a.r + c.r) * 0.9;
        if (d < min) {
          const p = (min - d) * strength, nx = dx / d, ny = dy / d;
          a.vx -= nx * p; a.vy -= ny * p; c.vx += nx * p; c.vy += ny * p;
        }
      }
    }
  }

  /** Static layout for reduced motion: relax overlaps offline, then stop. */
  private settle() {
    for (let step = 0; step < 240; step++) {
      this.separate(0.08);
      this.bubbles.forEach(b => { b.x += b.vx; b.y += b.vy; b.vx *= 0.6; b.vy *= 0.6; this.clamp(b); });
    }
    this.bubbles.forEach(b => { b.vx = 0; b.vy = 0; });
  }

  private step() {
    this.separate(0.018);
    this.bubbles.forEach(b => {
      b.phase += b.speed;
      b.x += b.vx; b.y += b.vy;
      b.vy += Math.sin(b.phase * 0.5) * 0.003;
      b.vx += Math.cos(b.phase * 0.4) * 0.002;
      b.vx *= 0.998; b.vy *= 0.998;
      this.clamp(b);
      if (b.alpha < 1) b.alpha = Math.min(1, b.alpha + 0.03);
    });
  }

  private tick = () => {
    this.raf = null;
    this.step();
    this.draw();
    this.syncLoop();
  };

  private shouldAnimate() {
    return !this.reduced && !document.hidden && this.bubbles.length > 0 && this.w > 0;
  }

  private syncLoop() {
    if (this.shouldAnimate()) { if (this.raf === null) this.raf = requestAnimationFrame(this.tick); }
    else this.stop();
  }

  private stop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private requestDraw() {
    // When the loop is running the next frame draws anyway.
    if (this.raf === null) this.draw();
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx || !this.w || !this.h) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const [tr, tg, tb] = this.tx;
    for (const st of this.stars) {
      ctx.beginPath();
      ctx.arc(st.x * this.w, st.y * this.h, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tr},${tg},${tb},${st.a})`;
      ctx.fill();
    }
    for (const b of this.bubbles) this.drawBubble(ctx, b);
  }

  private drawBubble(ctx: CanvasRenderingContext2D, b: Bubble) {
    const { x, y, phase, log } = b;
    const hov = this.hoverId === log.id;
    const r = b.r * (hov ? 1.08 : 1), ry = r * b.squash;
    const col = (a: number) => toRgba(log.color, a, this.accentFallback);
    const wobble = this.reduced ? 0 : 0.14;

    ctx.save();
    ctx.globalAlpha = b.alpha;

    // Glow
    const glow = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 1.7);
    glow.addColorStop(0, col(hov ? 0.32 : 0.22));
    glow.addColorStop(1, col(0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.7, ry * 1.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Blob body
    ctx.beginPath();
    const pts = 24;
    for (let i = 0; i <= pts; i++) {
      const t = (i / pts) * Math.PI * 2;
      const w = 1 + wobble * Math.sin(3 * t + phase) * Math.cos(2 * t + phase * 0.7);
      const px = x + r * w * Math.cos(t), py = y + ry * w * Math.sin(t);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const body = ctx.createRadialGradient(x - r * 0.25, y - ry * 0.28, r * 0.08, x, y, r * 1.1);
    body.addColorStop(0, col(0.93));
    body.addColorStop(0.5, col(0.6));
    body.addColorStop(1, col(0.2));
    ctx.fillStyle = body;
    ctx.fill();
    if (hov) { ctx.strokeStyle = col(0.9); ctx.lineWidth = 1.5; ctx.stroke(); }

    // Highlight
    ctx.beginPath();
    ctx.ellipse(x - r * 0.28, y - ry * 0.3, r * 0.26, ry * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();

    // Label (always light on a coloured bubble, with a soft shadow for contrast)
    const fs = Math.max(11, r * 0.28);
    ctx.font = `700 ${fs}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const showNote = !!log.note && r > 30;
    ctx.fillText(log.name, x, y + (showNote ? -fs * 0.35 : 0), r * 1.7);
    if (showNote) {
      ctx.font = `${Math.max(9, r * 0.18)}px ${this.fontFamily}`;
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      const n = log.note.length > 14 ? `${log.note.slice(0, 12)}...` : log.note;
      ctx.fillText(n, x, y + fs * 0.7, r * 1.6);
    }
    ctx.restore();
  }
}

// ─── SMALL PRESENTATIONAL PIECES ───────────────────────────────
function Dots({ n, color }: { n: number; color: string }) {
  return (
    <span className={s.dots} style={{ ['--c' as string]: color }} role="img" aria-label={`Intensity ${n} of 5`}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} className={`${s.dot} ${i <= n ? s.dotOn : ''}`} />)}
    </span>
  );
}

function LogRow({ log, onDelete, showTime = true }: { log: MoodEntry; onDelete: (l: MoodEntry) => void; showTime?: boolean }) {
  return (
    <li className={s.logRow} style={{ ['--c' as string]: log.color }}>
      <span className={s.logBubble} aria-hidden />
      <span className={s.logText}>
        <span className={s.logName}>{log.name}</span>
        {log.note && <span className={s.logNote}>{log.note}</span>}
      </span>
      <span className={s.logMeta}>
        <Dots n={log.intensity} color={log.color} />
        {showTime && log.time && <span className={s.logTime}>{log.time}</span>}
      </span>
      <button type="button" className={s.iconBtn} onClick={() => onDelete(log)} aria-label={`Delete ${log.name} entry`}>
        <Trash2 size={15} strokeWidth={2} />
      </button>
    </li>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────
export default function MoodBubblePage() {
  const stageRef  = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef  = useRef<BubbleField | null>(null);
  const seededRef = useRef(false);

  const [today, setToday]       = useState(localDateStr);
  const [moodDefs, setMoodDefs] = useState<MoodDef[]>([]);
  const [moodLogs, setMoodLogs] = useState<MoodEntry[]>([]);
  const [loading, setLoading]   = useState(true);

  const [sel, setSel]             = useState<MoodDef | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote]           = useState('');
  const [logging, setLogging]     = useState(false);

  const [tip, setTip] = useState<{ x: number; y: number; below: boolean; log: MoodEntry } | null>(null);
  const [historyDays, setHistoryDays] = useState(HISTORY_PAGE);

  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newColor, setNewColor]     = useState(SWATCHES[0]);
  const [delDef, setDelDef]         = useState<MoodDef | null>(null);
  const [delLog, setDelLog]         = useState<MoodEntry | null>(null);
  const [toast, show] = useToast();

  // Keep "today" correct if the page stays open past midnight.
  useEffect(() => {
    const id = setInterval(() => setToday(localDateStr()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Load ───────────────────────────────────────────────────
  const reload = useCallback(async () => {
      try {
        if (!(await ensureSession())) return;
        const [defs, logs] = await Promise.all([getMoodDefs(), getMoodLogs()]);
        let resolved = defs;
        // The signup trigger seeds moods. Only fill in when truly empty, and only once
        // (React dev mode runs effects twice).
        if (defs.length === 0 && !seededRef.current) {
          seededRef.current = true;
          resolved = await Promise.all(STARTER_MOODS.map((m, i) => addMoodDef({ name: m.name, color: m.color, sort_order: i })));
        }
        setMoodDefs(resolved.map(toDef));
        setMoodLogs(logs.map(toEntry));
      } catch {
        show('Could not load your moods.', 'var(--red)');
      } finally {
        setLoading(false);
      }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['mood_defs', 'mood_logs'], reload);

  // ── Canvas engine lifecycle ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return;
    const field = new BubbleField(canvas, stage);
    fieldRef.current = field;
    return () => { field.destroy(); fieldRef.current = null; };
  }, []);

  const todayLogs = useMemo(() => moodLogs.filter(l => l.date === today), [moodLogs, today]);

  useEffect(() => { fieldRef.current?.setLogs(todayLogs); }, [todayLogs]);

  // Drop the tooltip if its entry disappears.
  const tipLog = tip && todayLogs.some(l => l.id === tip.log.id) ? tip : null;

  const history = useMemo(() => {
    const groups = new Map<string, MoodEntry[]>();
    for (const l of moodLogs) {
      if (l.date === today) continue;
      const g = groups.get(l.date);
      if (g) g.push(l); else groups.set(l.date, [l]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [moodLogs, today]);

  // ── Canvas interaction (hover on mouse, tap on touch) ──────
  const locate = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  };
  const showTip = (hit: BubbleHit | null, w: number) => {
    fieldRef.current?.setHover(hit?.log.id ?? null);
    if (!hit) { setTip(null); return; }
    const below = hit.y - hit.r < 70;
    setTip({
      x: Math.min(Math.max(hit.x, 90), w - 90),
      y: below ? hit.y + hit.r + 8 : hit.y - hit.r - 8,
      below, log: hit.log,
    });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const p = locate(e);
    const hit = fieldRef.current?.hitTest(p.x, p.y) ?? null;
    if (hit?.log.id === tipLog?.log.id && hit) return;
    showTip(hit, p.w);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const p = locate(e);
    const hit = fieldRef.current?.hitTest(p.x, p.y) ?? null;
    showTip(hit && hit.log.id === tipLog?.log.id ? null : hit, p.w);
  };
  const onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') showTip(null, 0);
  };

  // ── Mutations ──────────────────────────────────────────────
  const logMood = async () => {
    if (!sel || logging) return;
    setLogging(true);
    const date = localDateStr(), time = localTimeStr();
    const tempId = `temp-${Date.now()}`;
    const entry: MoodEntry = { id: tempId, name: sel.name, color: sel.color, defId: sel.id.startsWith('temp-') ? null : sel.id, intensity, note: note.trim(), time, date };
    setMoodLogs(l => [entry, ...l]);
    setSel(null); setNote(''); setIntensity(3);
    try {
      const saved = await addMoodLog({
        mood_def_id: entry.defId, feeling_name: entry.name, feeling_color: entry.color,
        intensity: entry.intensity, note: entry.note || null, log_date: date, log_time: time,
      });
      setMoodLogs(l => l.map(x => x.id === tempId ? toEntry(saved) : x));
      show(`Logged "${entry.name}"`);
    } catch {
      setMoodLogs(l => l.filter(x => x.id !== tempId));
      setSel(moodDefs.find(d => d.name === entry.name) ?? null); setNote(entry.note); setIntensity(entry.intensity);
      show('Could not log that feeling.', 'var(--red)');
    } finally {
      setLogging(false);
    }
  };

  const doDeleteLog = async () => {
    const item = delLog; if (!item) return;
    setDelLog(null);
    const snapshot = moodLogs;
    setMoodLogs(l => l.filter(x => x.id !== item.id));
    try { await deleteMoodLog(item.id); show('Entry removed'); }
    catch { setMoodLogs(snapshot); show('Could not remove that entry.', 'var(--red)'); }
  };

  const addMood = async () => {
    const name = newName.trim().toLowerCase();
    if (!name) return;
    if (moodDefs.some(d => d.name.toLowerCase() === name)) { show('You already have that mood.', 'var(--red)'); return; }
    const tempId = `temp-${Date.now()}`;
    const color = newColor;
    setMoodDefs(d => [...d, { id: tempId, name, color }]);
    setNewName('');
    try {
      const saved = await addMoodDef({ name, color, sort_order: moodDefs.length });
      setMoodDefs(d => d.map(x => x.id === tempId ? toDef(saved) : x));
      show('Mood added');
    } catch {
      setMoodDefs(d => d.filter(x => x.id !== tempId));
      setNewName(name);
      show('Could not add that mood.', 'var(--red)');
    }
  };

  const doDeleteDef = async () => {
    const def = delDef; if (!def) return;
    setDelDef(null);
    const snapshot = moodDefs;
    setMoodDefs(d => d.filter(x => x.id !== def.id));
    if (sel?.id === def.id) setSel(null);
    try { await deleteMoodDef(def.id); show('Mood removed'); }
    catch { setMoodDefs(snapshot); show('Could not remove that mood.', 'var(--red)'); }
  };

  const shownHistory = history.slice(0, historyDays);
  const accent = sel?.color ?? 'var(--or)';

  return (
    <div className={s.page}>
      <Topbar
        title="Mood Bubble"
        sub={loading ? 'Loading your moods' : todayLogs.length ? `${todayLogs.length} feeling${todayLogs.length > 1 ? 's' : ''} logged today` : 'How is today treating you?'}
        action={<Btn variant="ghost" onClick={() => setManageOpen(true)}><Palette size={16} strokeWidth={2} /> Your moods</Btn>}
        maxWidth={1120}
      />

      <div className={s.wrap}>
        {/* ── Canvas ─────────────────────────────────────── */}
        <div
          ref={stageRef}
          className={s.stage}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        >
          <canvas
            ref={canvasRef}
            className={s.canvas}
            role="img"
            aria-label={todayLogs.length ? `Today's moods: ${todayLogs.map(l => l.name).join(', ')}` : 'No moods logged today'}
          />
          <span className={s.stageLabel}><CloudSun size={14} strokeWidth={2} /> Today</span>
          {!loading && todayLogs.length === 0 && (
            <div className={s.stageEmpty}>
              <Cloud size={28} strokeWidth={1.5} />
              <p>Your sky is clear. Log a feeling below and it will float up here.</p>
            </div>
          )}
          {tipLog && (
            <div
              className={`${s.tip} ${tipLog.below ? s.tipBelow : ''}`}
              style={{ ['--x' as string]: `${tipLog.x}px`, ['--y' as string]: `${tipLog.y}px`, ['--c' as string]: tipLog.log.color }}
              role="status"
            >
              <span className={s.tipHead}>
                <span className={s.tipName}>{tipLog.log.name}</span>
                <Dots n={tipLog.log.intensity} color={tipLog.log.color} />
              </span>
              <span className={s.tipMeta}>{INTENSITY[tipLog.log.intensity - 1] ?? ''}{tipLog.log.time ? ` at ${tipLog.log.time}` : ''}</span>
              {tipLog.log.note && <span className={s.tipNote}>{tipLog.log.note}</span>}
            </div>
          )}
        </div>

        <div className={s.grid}>
          {/* ── Log a feeling ───────────────────────────── */}
          <section className={s.card} aria-labelledby="log-title" style={{ ['--c' as string]: accent }}>
            <h2 id="log-title" className={s.cardTitle}>How are you feeling?</h2>

            {loading ? (
              <div className={s.chips}>{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className={`skeleton ${s.chipSkel}`} />)}</div>
            ) : moodDefs.length === 0 ? (
              <p className={s.muted}>You have no moods yet. <button type="button" className={s.linkBtn} onClick={() => setManageOpen(true)}>Add your first one</button></p>
            ) : (
              <div className={s.chips}>
                <div className={s.chipGroup} role="radiogroup" aria-label="Mood">
                {moodDefs.map(d => {
                  const on = sel?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`${s.chip} ${on ? s.chipOn : ''}`}
                      style={{ ['--m' as string]: d.color }}
                      onClick={() => setSel(on ? null : d)}
                    >
                      <span className={s.chipDot} aria-hidden />
                      {d.name}
                    </button>
                  );
                })}
                </div>
                <button type="button" className={`${s.chip} ${s.chipAdd}`} onClick={() => setManageOpen(true)}>
                  <Plus size={14} strokeWidth={2.25} /> New
                </button>
              </div>
            )}

            <div className={s.field}>
              <div className={s.intensityHead}>
                <label htmlFor="mood-intensity" className={s.fieldLbl}>Intensity</label>
                <span className={s.intensityVal}>{intensity} of 5, {INTENSITY[intensity - 1].toLowerCase()}</span>
              </div>
              <input
                id="mood-intensity"
                type="range"
                min={1}
                max={5}
                step={1}
                value={intensity}
                onChange={e => setIntensity(Number(e.target.value))}
                className={s.slider}
                style={{ ['--pct' as string]: `${((intensity - 1) / 4) * 100}%` }}
              />
              <div className={s.sliderScale} aria-hidden><span>A little</span><span>A lot</span></div>
            </div>

            <FArea label="Note" value={note} onChange={setNote} rows={2} placeholder="What's behind it? (optional)" />

            <Btn full onClick={logMood} disabled={!sel || logging}>
              <Check size={16} strokeWidth={2.25} />
              {sel ? `Log "${sel.name}"` : 'Pick a feeling first'}
            </Btn>
          </section>

          {/* ── Today ───────────────────────────────────── */}
          <section className={s.card} aria-labelledby="today-title">
            <h2 id="today-title" className={s.cardTitle}>
              Today <span className={s.count}>{todayLogs.length}</span>
            </h2>
            {loading ? (
              [0, 1, 2].map(i => <div key={i} className={`skeleton ${s.rowSkel}`} />)
            ) : todayLogs.length === 0 ? (
              <p className={s.muted}>Nothing logged yet today.</p>
            ) : (
              <ul className={s.logList}>
                {todayLogs.map(l => <LogRow key={l.id} log={l} onDelete={setDelLog} />)}
              </ul>
            )}
          </section>
        </div>

        {/* ── Year in pixels ─────────────────────────────── */}
        {!loading && <YearInPixels logs={moodLogs} />}

        {/* ── History ────────────────────────────────────── */}
        <section className={s.history} aria-labelledby="history-title">
          <h2 id="history-title" className={s.sectionTitle}><History size={17} strokeWidth={2} /> Earlier</h2>
          {loading ? (
            [0, 1].map(i => <div key={i} className={`skeleton ${s.daySkel}`} />)
          ) : history.length === 0 ? (
            <EmptyState icon={<Cloud size={26} />} msg="Past days will show up here once you have a few entries." />
          ) : (
            <>
              <div className={s.days}>
                {shownHistory.map(([date, logs]) => (
                  <article key={date} className={s.day}>
                    <header className={s.dayHead}>
                      <h3 className={s.dayTitle}>{cap(relDay(date))}</h3>
                      <span className={s.count}>{logs.length}</span>
                      <span className={s.dayStrip} aria-hidden>
                        {logs.map(l => <span key={l.id} style={{ ['--c' as string]: l.color, ['--w' as string]: l.intensity }} />)}
                      </span>
                    </header>
                    <ul className={s.logList}>
                      {logs.map(l => <LogRow key={l.id} log={l} onDelete={setDelLog} />)}
                    </ul>
                  </article>
                ))}
              </div>
              {history.length > historyDays && (
                <div className={s.more}>
                  <Btn variant="ghost" sm onClick={() => setHistoryDays(n => n + HISTORY_PAGE)}>Show older days</Btn>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── Manage moods ──────────────────────────────────── */}
      {manageOpen && (
        <Modal onClose={() => { if (delDef) setDelDef(null); else setManageOpen(false); }}>
          {delDef ? (
            <Confirm
              msg={`"${delDef.name}" will be removed from your list. Past entries stay as they are.`}
              onConfirm={doDeleteDef}
              onCancel={() => setDelDef(null)}
            />
          ) : (
            <>
              <ModalTitle>Your moods</ModalTitle>
              <div className={s.newMood} style={{ ['--m' as string]: newColor }}>
                <FInput label="New mood" value={newName} onChange={setNewName} placeholder="e.g. nostalgic" />
                <Lbl>Colour</Lbl>
                <div className={s.swatches} role="radiogroup" aria-label="Colour">
                  {SWATCHES.map(c => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={newColor === c}
                      aria-label={c}
                      className={`${s.swatch} ${newColor === c ? s.swatchOn : ''}`}
                      style={{ ['--m' as string]: c }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                  <label className={`${s.swatch} ${s.swatchCustom} ${!SWATCHES.includes(newColor) ? s.swatchOn : ''}`} aria-label="Pick any colour">
                    <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} />
                  </label>
                </div>
                <Btn onClick={addMood} disabled={!newName.trim()}>
                  <Plus size={16} strokeWidth={2.25} /> Add mood
                </Btn>
              </div>

              <Lbl>In your list ({moodDefs.length})</Lbl>
              {moodDefs.length === 0 ? (
                <p className={s.muted}>No moods yet.</p>
              ) : (
                <ul className={s.defList}>
                  {moodDefs.map(d => (
                    <li key={d.id} className={s.defRow} style={{ ['--c' as string]: d.color }}>
                      <span className={s.logBubble} aria-hidden />
                      <span className={s.logName}>{d.name}</span>
                      <button
                        type="button"
                        className={`${s.iconBtn} ${s.iconBtnShow}`}
                        onClick={() => setDelDef(d)}
                        disabled={d.id.startsWith('temp-')}
                        aria-label={`Remove ${d.name}`}
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Modal>
      )}

      {delLog && (
        <Modal onClose={() => setDelLog(null)}>
          <Confirm msg={`This "${delLog.name}" entry will be deleted for good.`} onConfirm={doDeleteLog} onCancel={() => setDelLog(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
