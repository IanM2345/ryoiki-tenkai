'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PenLine, Pin, PinOff, Trash2, NotebookPen } from 'lucide-react';
import s from './journal.module.css';
import { Btn, Tag, SearchBar, Topbar, Pill, Modal, Confirm, Toast, useToast, EmptyState } from '@/components/ui';
import { getJournalEntries, updateJournalEntry, deleteJournalEntry, getSouls } from '@/lib/db';
import type { DbJournalEntry, DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { parseLocalDate, relDay } from '@/lib/dates';
import { MOODS, renderMentions } from '@/lib/journal';

function entryWhen(e: DbJournalEntry) {
  const rel = relDay(e.entry_date);
  const day = rel === 'today' || rel === 'yesterday'
    ? rel.charAt(0).toUpperCase() + rel.slice(1)
    : parseLocalDate(e.entry_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return e.entry_time ? `${day}, ${e.entry_time.slice(0, 5)}` : day;
}

function EntryCard({ e, souls, onPin, onDelete }: {
  e: DbJournalEntry; souls: DbSoul[]; onPin: (e: DbJournalEntry) => void; onDelete: (e: DbJournalEntry) => void;
}) {
  return (
    <article className={`${s.card} ${e.pinned ? s.cardPinned : ''}`}>
      <Link href={`/journal/${e.id}`} className={s.cardLink}>
        <div className={s.cardMeta}>
          {e.mood && <span className={s.cardMood} title={MOODS[e.mood]}>{e.mood}</span>}
          <span>{entryWhen(e)}</span>
          {e.pinned && <span className={s.pinBadge}><Pin size={12} strokeWidth={2.25} /> Pinned</span>}
        </div>
        <h3 className={s.cardTitle}>{e.title || 'Untitled'}</h3>
        {e.body && <p className={s.cardPreview}>{renderMentions(e.body, souls, s.mention)}</p>}
        {(e.tags?.length ?? 0) > 0 && (
          <div className={s.cardTags}>{e.tags!.map(t => <Tag key={t}>{t}</Tag>)}</div>
        )}
      </Link>
      <div className={s.cardActions}>
        <button type="button" className={s.iconBtn} onClick={() => onPin(e)} aria-label={e.pinned ? 'Unpin entry' : 'Pin entry'} title={e.pinned ? 'Unpin' : 'Pin'}>
          {e.pinned ? <PinOff size={16} strokeWidth={2} /> : <Pin size={16} strokeWidth={2} />}
        </button>
        <button type="button" className={`${s.iconBtn} ${s.danger}`} onClick={() => onDelete(e)} aria-label="Delete entry" title="Delete">
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}

export default function JournalPage() {
  const [entries, setEntries] = useState<DbJournalEntry[]>([]);
  const [souls, setSouls]     = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [moodF, setMoodF]     = useState<string | null>(null);
  const [pinF, setPinF]       = useState(false);
  const [delItem, setDelItem] = useState<DbJournalEntry | null>(null);
  const [toast, show]         = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [e, so] = await Promise.all([getJournalEntries(), getSouls().catch(() => [] as DbSoul[])]);
        setEntries(e);
        setSouls(so);
      } catch {
        show('Could not load your journal.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  // Only offer mood filters for moods actually used
  const usedMoods = useMemo(() => {
    const set = new Set(entries.map(e => e.mood).filter(Boolean) as string[]);
    return Object.keys(MOODS).filter(m => set.has(m));
  }, [entries]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => entries
    .filter(e => !pinF || e.pinned)
    .filter(e => !moodF || e.mood === moodF)
    .filter(e => !q || `${e.title} ${e.body} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.entry_date.localeCompare(a.entry_date) ||
      (b.entry_time ?? '').localeCompare(a.entry_time ?? '')),
  [entries, pinF, moodF, q]);

  const pinned = filtered.filter(e => e.pinned);
  const groups = useMemo(() => {
    const map = new Map<string, DbJournalEntry[]>();
    filtered.filter(e => !e.pinned).forEach(e => {
      const k = parseLocalDate(e.entry_date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      map.set(k, [...(map.get(k) ?? []), e]);
    });
    return [...map.entries()];
  }, [filtered]);

  const togglePin = async (entry: DbJournalEntry) => {
    setEntries(es => es.map(e => e.id === entry.id ? { ...e, pinned: !e.pinned } : e));
    try { await updateJournalEntry(entry.id, { pinned: !entry.pinned }); }
    catch { setEntries(es => es.map(e => e.id === entry.id ? entry : e)); show('Could not update that entry.', 'var(--red)'); }
  };

  const doDelete = async () => {
    const item = delItem; if (!item) return;
    const snapshot = entries;
    setEntries(es => es.filter(e => e.id !== item.id));
    setDelItem(null);
    try { await deleteJournalEntry(item.id); show('Entry deleted'); }
    catch { setEntries(snapshot); show('Could not delete that entry.', 'var(--red)'); }
  };

  const sub = loading ? 'Loading your entries'
    : entries.length === 0 ? 'Your private space to think out loud'
    : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;

  return (
    <div className={s.page}>
      <Topbar
        title="Journal"
        sub={sub}
        maxWidth={760}
        action={<Link href="/journal/new" className={s.linkReset}><Btn><PenLine size={16} strokeWidth={2} /> New entry</Btn></Link>}
      />

      <div className={s.wrap}>
        {entries.length > 0 && (
          <div className={s.filters}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search your entries" className={s.search} />
            <div className={s.filterRow}>
              <Pill active={pinF} onClick={() => setPinF(v => !v)}><Pin size={13} strokeWidth={2.25} /> Pinned</Pill>
              {usedMoods.map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${s.moodChip} ${moodF === m ? s.moodChipOn : ''}`}
                  onClick={() => setMoodF(moodF === m ? null : m)}
                  aria-pressed={moodF === m}
                  aria-label={`Only ${MOODS[m]} entries`}
                  title={MOODS[m]}
                >{m}</button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className={s.skels}>{[0, 1, 2].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<NotebookPen size={26} />}
            msg={q || moodF || pinF ? 'Nothing matches those filters.' : 'No entries yet. Write your first one whenever you feel like it.'}
            action={!(q || moodF || pinF) ? <Link href="/journal/new" className={s.linkReset}><Btn sm><PenLine size={15} /> Start writing</Btn></Link> : undefined}
          />
        ) : (
          <>
            {pinned.length > 0 && (
              <section className={s.group}>
                <h2 className={s.groupLabel}>Pinned</h2>
                {pinned.map(e => <EntryCard key={e.id} e={e} souls={souls} onPin={togglePin} onDelete={setDelItem} />)}
              </section>
            )}
            {groups.map(([month, ents]) => (
              <section key={month} className={s.group}>
                <h2 className={s.groupLabel}>{month}<span>{ents.length}</span></h2>
                {ents.map(e => <EntryCard key={e.id} e={e} souls={souls} onPin={togglePin} onDelete={setDelItem} />)}
              </section>
            ))}
          </>
        )}
      </div>

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.title || 'Untitled'}" will be gone for good.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
