/**
 * study.ts — the maths behind Learn: the topic tree, spaced repetition for flashcards,
 * how well she knows each topic, and where things sit on the map.
 */
import type { DbStudyCard, DbStudyNode } from './db';

// ─── Tree ────────────────────────────────────────────────────

export interface Tree {
  byId: Map<string, DbStudyNode>;
  children: Map<string | null, DbStudyNode[]>;
}

export function buildTree(nodes: DbStudyNode[]): Tree {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string | null, DbStudyNode[]>();
  for (const n of nodes) {
    // A topic whose parent vanished (deleted on another device) shows as a subject until the next refresh.
    const key = n.parent_id && byId.has(n.parent_id) ? n.parent_id : null;
    const list = children.get(key) ?? [];
    list.push(n);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  return { byId, children };
}

/** Subject → … → node */
export function pathTo(tree: Tree, id: string): DbStudyNode[] {
  const out: DbStudyNode[] = [];
  let cur = tree.byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent_id ? tree.byId.get(cur.parent_id) : undefined;
  }
  return out;
}

export function subjectOf(tree: Tree, id: string): DbStudyNode | null {
  return pathTo(tree, id)[0] ?? null;
}

/** The node and everything under it. */
export function subtreeIds(tree: Tree, id: string): Set<string> {
  const out = new Set<string>();
  const walk = (n: string) => {
    if (out.has(n)) return;
    out.add(n);
    for (const c of tree.children.get(n) ?? []) walk(c.id);
  };
  walk(id);
  return out;
}

export const SUBJECT_COLORS = ['#ff8c00', '#a855f7', '#22d3ee', '#4ade80', '#f472b6', '#facc15', '#60a5fa', '#fb7185'];

// ─── Spaced repetition ───────────────────────────────────────
// A small SM-2: four buttons. "Again" brings the card back in 10 minutes; the others push
// it further out each time she gets it right, faster when it felt easy.

export type Grade = 1 | 2 | 3 | 4;
export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 1, label: 'Again', key: '1' },
  { grade: 2, label: 'Hard', key: '2' },
  { grade: 3, label: 'Good', key: '3' },
  { grade: 4, label: 'Easy', key: '4' },
];

const DAY = 864e5;

export type CardSchedule = Pick<DbStudyCard, 'ease' | 'interval_days' | 'reps' | 'lapses' | 'due_at' | 'last_reviewed_at'>;

export function schedule(card: Pick<DbStudyCard, 'ease' | 'interval_days' | 'reps' | 'lapses'>, grade: Grade, now = Date.now()): CardSchedule {
  let { ease, interval_days: interval, reps, lapses } = card;
  if (grade === 1) {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    return { ease, interval_days: 0, reps, lapses, due_at: new Date(now + 10 * 60e3).toISOString(), last_reviewed_at: new Date(now).toISOString() };
  }
  if (reps === 0) interval = grade === 2 ? 1 : grade === 3 ? 1 : 4;
  else if (reps === 1) interval = grade === 2 ? 2 : grade === 3 ? 3 : 7;
  else interval = Math.max(interval + 1, interval * (grade === 2 ? 1.2 : grade === 3 ? ease : ease * 1.3));
  ease = Math.max(1.3, ease + (grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0));
  interval = Math.min(365, Math.round(interval * 10) / 10);
  return { ease, interval_days: interval, reps: reps + 1, lapses, due_at: new Date(now + interval * DAY).toISOString(), last_reviewed_at: new Date(now).toISOString() };
}

/** "10 min", "1 day", "3 days", "2 wk", "4 mo" */
export function fmtInterval(days: number): string {
  if (days <= 0) return '10 min';
  if (days < 1.5) return '1 day';
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) return `${Math.round(days / 7)} wk`;
  return `${Math.round(days / 30)} mo`;
}

export function isDue(c: DbStudyCard, now = Date.now()): boolean {
  return Date.parse(c.due_at) <= now;
}

// ─── Mastery ─────────────────────────────────────────────────
// A card counts as fully learnt once she's remembered it three weeks out.

function cardStrength(c: DbStudyCard): number {
  if (c.reps === 0) return 0;
  return Math.min(1, Math.max(0.1, c.interval_days / 21));
}

export interface NodeStats {
  /** 0–100, or null when there's nothing to go on (no cards, not set by her) */
  mastery: number | null;
  /** true when the number came from her, not the cards */
  manual: boolean;
  cards: number;
  due: number;
}

/** Stats for each node, including everything under it. */
export function computeStats(tree: Tree, cards: DbStudyCard[], now = Date.now()): Map<string, NodeStats> {
  const byNode = new Map<string, DbStudyCard[]>();
  for (const c of cards) byNode.set(c.node_id, [...(byNode.get(c.node_id) ?? []), c]);
  const out = new Map<string, NodeStats>();

  const visit = (n: DbStudyNode, seen: Set<string>): { sum: number; count: number; cards: number; due: number } => {
    if (seen.has(n.id)) return { sum: 0, count: 0, cards: 0, due: 0 };
    seen.add(n.id);
    const own = byNode.get(n.id) ?? [];
    let sum = 0, count = 0, total = own.length, due = own.filter(c => isDue(c, now)).length;
    let ownMastery: number | null = null;
    if (n.mastery_override != null) ownMastery = n.mastery_override;
    else if (own.length) ownMastery = Math.round((own.reduce((a, c) => a + cardStrength(c), 0) / own.length) * 100);
    if (ownMastery != null) { sum += ownMastery; count += 1; }
    for (const ch of tree.children.get(n.id) ?? []) {
      const r = visit(ch, seen);
      sum += r.sum; count += r.count; total += r.cards; due += r.due;
    }
    const mastery = n.mastery_override != null ? n.mastery_override : count ? Math.round(sum / count) : null;
    out.set(n.id, { mastery, manual: n.mastery_override != null, cards: total, due });
    return { sum, count, cards: total, due };
  };
  for (const s of tree.children.get(null) ?? []) visit(s, new Set());
  return out;
}

export function masteryLabel(m: number | null): string {
  if (m == null) return 'Not started';
  if (m < 25) return 'Just starting';
  if (m < 55) return 'Learning';
  if (m < 85) return 'Confident';
  return 'Mastered';
}

// ─── Map layout ──────────────────────────────────────────────
// Anything she hasn't dragged gets placed automatically: subjects side by side,
// topics in a ring around their subject, sub-topics fanning outwards.

export interface Pt { x: number; y: number }

export function layout(tree: Tree): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  const subjects = tree.children.get(null) ?? [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(subjects.length)));
  subjects.forEach((s, i) => {
    const p = s.pos_x != null && s.pos_y != null ? { x: s.pos_x, y: s.pos_y } : { x: (i % cols) * 700, y: Math.floor(i / cols) * 640 };
    pos.set(s.id, p);
    place(s.id, p, -Math.PI / 2, Math.PI * 2, 1);
  });

  function place(parentId: string, parentPt: Pt, centre: number, spread: number, depth: number) {
    const kids = tree.children.get(parentId) ?? [];
    if (!kids.length || depth > 12) return;
    const full = spread >= Math.PI * 2 - 1e-6;
    const step = full ? spread / kids.length : spread / Math.max(1, kids.length);
    const radius = depth === 1 ? 230 : 190;
    kids.forEach((k, i) => {
      const angle = full ? centre + i * step : centre - spread / 2 + step * (i + 0.5);
      const auto = { x: parentPt.x + Math.cos(angle) * radius, y: parentPt.y + Math.sin(angle) * radius * 0.82 };
      const p = k.pos_x != null && k.pos_y != null ? { x: k.pos_x, y: k.pos_y } : auto;
      pos.set(k.id, p);
      place(k.id, p, angle, Math.min(Math.PI * 0.9, step * 1.1), depth + 1);
    });
  }
  return pos;
}

// ─── Links ───────────────────────────────────────────────────

export type LinkKind = 'video' | 'music' | 'doc' | 'link';

export function linkKind(url: string): LinkKind {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  if (/youtube\.com|youtu\.be|vimeo\.com|loom\.com/.test(h)) return 'video';
  if (/spotify\.com|music\.apple\.com|soundcloud\.com|deezer\.com/.test(h)) return 'music';
  if (/docs\.google\.com|drive\.google\.com|notion\.so|onedrive|sharepoint|dropbox\.com/.test(h) || /\.pdf($|\?)/i.test(url)) return 'doc';
  return 'link';
}

export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function normaliseUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); return u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}
