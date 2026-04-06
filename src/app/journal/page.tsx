'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import s from './journal.module.css';
import { Btn, Tag, SearchBar, Topbar, Pill, Modal, Confirm, Toast, useToast, EmptyState } from '@/components/ui';
import { getJournalEntries, updateJournalEntry, deleteJournalEntry } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import type { DbJournalEntry } from '@/lib/db';

const SOUL_COLORS: Record<string, string> = { Sofia:'#ff8c00', Mum:'#a855f7', Zara:'#ffb347', Leo:'#c084fc' };
const MOODS = ['😊','🌟','😌','😢','😤','🫶','✨','🔥','🌧','💫'];

export default function JournalPage() {
  const [entries, setEntries] = useState<DbJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [moodF,   setMoodF]   = useState<string | null>(null);
  const [pinF,    setPinF]    = useState(false);
  const [delItem, setDelItem] = useState<DbJournalEntry | null>(null);
  const [toast,   show]       = useToast();

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const data = await getJournalEntries();
        setEntries(data);
      } catch (err) {
        console.error('Journal load error:', err);
        show('Could not load journal.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = [...entries]
    .filter(e => !pinF   || e.pinned)
    .filter(e => !moodF  || e.mood === moodF)
    .filter(e => !search || (e.title + e.body).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1);

  const grouped: Record<string, DbJournalEntry[]> = {};
  filtered.forEach(e => {
    const k = new Date(e.entry_date).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' });
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(e);
  });

  const togglePin = async (entry: DbJournalEntry) => {
    setEntries(es => es.map(e => e.id === entry.id ? { ...e, pinned: !e.pinned } : e));
    try {
      await updateJournalEntry(entry.id, { pinned: !entry.pinned });
      show('Updated!');
    } catch {
      setEntries(es => es.map(e => e.id === entry.id ? entry : e));
      show('Could not update.');
    }
  };

  const doDelete = async () => {
    if (!delItem) return;
    const snapshot = [...entries];
    setEntries(es => es.filter(e => e.id !== delItem.id));
    setDelItem(null);
    try {
      await deleteJournalEntry(delItem.id);
      show('Deleted.');
    } catch {
      setEntries(snapshot);
      show('Could not delete.');
    }
  };

  const renderBody = (body: string) =>
    body.split(/(@\w+)/g).map((part, i) => {
      if (part.startsWith('@')) {
        const name = part.slice(1);
        const col  = SOUL_COLORS[name] ?? '#c084fc';
        return <span key={i} style={{ color: col, background: `${col}18`, borderRadius: 3, padding: '0 3px' }}>{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });

  const fmtDate = (date: string, time: string | null) =>
    time ? `${date} · ${time}` : date;

  return (
    <div className={`${s.page} aFadeUp`}>
      <Topbar
        title="Journal ✐"
        sub={loading ? 'Loading...' : `${entries.length} entries`}
        action={<Link href="/journal/new"><Btn>+ New entry</Btn></Link>}
      />

      <div className={s.filterBar}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search entries..." />
        <div className={s.moodChips}>
          {MOODS.slice(0, 6).map(m => (
            <button key={m} className={`${s.moodChip} ${moodF === m ? s.moodChipActive : ''}`} onClick={() => setMoodF(moodF === m ? null : m)}>{m}</button>
          ))}
        </div>
        <Pill active={pinF} onClick={() => setPinF(!pinF)}>📌 Pinned</Pill>
        <span className={s.filterCount}>{filtered.length}</span>
      </div>

      {loading ? (
        <div className={s.loadingState}>Loading your journal...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="✐" msg={search || moodF || pinF ? 'No entries match your filters.' : 'No entries yet — write your first!'} />
      ) : (
        <div className={s.list}>
          {Object.entries(grouped).map(([month, ents]) => (
            <div key={month}>
              <div className={s.monthLabel}>{month} · {ents.length}</div>
              {ents.map(e => (
                <div key={e.id} className={`${s.entryCard} ${e.pinned ? s.entryCardPinned : ''}`}>
                  <div className={s.entryActions}>
                    <button className={s.moodChip} onClick={ev => { ev.stopPropagation(); togglePin(e); }}>
                      {e.pinned ? '📌' : '📍'}
                    </button>
                    <button
                      style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', color: '#f87171', borderRadius: 5, padding: '2px 7px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}
                      onClick={ev => { ev.stopPropagation(); setDelItem(e); }}
                    >×</button>
                  </div>
                  <Link href={`/journal/${e.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div className={s.entryMeta}>
                      <span className={s.entryDate}>{fmtDate(e.entry_date, e.entry_time)}</span>
                      {e.mood && <span className={s.entryMood}>{e.mood}</span>}
                    </div>
                    <div className={s.entryTitle}>{e.title}</div>
                    <div className={s.entryPreview}>{renderBody(e.body)}</div>
                    <div className={s.tagRow}>
                      {(e.tags ?? []).map(t => <Tag key={t} color="#ff8c00">{t}</Tag>)}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg="This entry will be gone forever." onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}