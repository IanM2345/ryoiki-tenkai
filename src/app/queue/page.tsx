'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Tv, Headphones, BookOpen, Compass, Play, Check, RotateCcw, Trash2, ListVideo } from 'lucide-react';
import s from './queue.module.css';
import {
  Btn, Pill, InnerTabs, SearchBar, Topbar, Modal, ModalTitle, ModalFooter, FInput, FArea,
  EmptyState, Toast, useToast, Lbl, Confirm,
} from '@/components/ui';
import SoulLinkField from '@/components/ui/SoulLinkField';
import {
  getQueue, addQueueItem, updateQueueItem, deleteQueueItem, getSoulLinksForItem, setSoulLinks,
  deleteSoulLinksForItem, getSouls,
} from '@/lib/db';
import type { DbQueueItem, DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { localDateStr, fmtDate } from '@/lib/dates';

type QStatus = DbQueueItem['status'];
type QTab = DbQueueItem['tab'];

const TABS: Record<QTab, { label: string; verb: string; Icon: typeof Tv; hint: string }> = {
  watch:   { label: 'Watch',   verb: 'watch',        Icon: Tv,         hint: 'Films, shows, videos' },
  listen:  { label: 'Listen',  verb: 'listen to',    Icon: Headphones, hint: 'Albums, podcasts, playlists' },
  read:    { label: 'Read',    verb: 'read',         Icon: BookOpen,   hint: 'Books, articles, comics' },
  explore: { label: 'Explore', verb: 'explore',      Icon: Compass,    hint: 'Places, hobbies, experiences' },
};
const TAB_KEYS = Object.keys(TABS) as QTab[];
const STATUS: Record<QStatus, { label: string; color: string }> = {
  todo:     { label: 'Up next',     color: 'var(--tx-m)' },
  progress: { label: 'In progress', color: 'var(--or)' },
  done:     { label: 'Finished',    color: 'var(--pu-l)' },
};
const TILE_COLORS = ['#4a6d8a', '#8a6a4a', '#7a4a8a', '#4a7a7a', '#6a4a8a', '#4a8a6a', '#8a4a4a', '#5a6a8a'];

const EMPTY = { title: '', meta: '', notes: '', status: 'todo' as QStatus };
type Form = typeof EMPTY;

/** One row. Progress is kept locally while dragging and saved once on release. */
function QueueRow({ item, onOpen, onStatus, onPct, onDelete }: {
  item: DbQueueItem;
  onOpen: () => void;
  onStatus: (s: QStatus) => void;
  onPct: (pct: number) => void;
  onDelete: () => void;
}) {
  const [pct, setPct] = useState(item.pct);
  const [dragging, setDragging] = useState(false);
  const shown = dragging ? pct : item.pct;
  const T = TABS[item.tab];
  const commit = () => { setDragging(false); if (pct !== item.pct) onPct(pct); };

  return (
    <article className={`${s.row} ${item.status === 'done' ? s.rowDone : ''}`}>
      <button type="button" className={s.rowMain} onClick={onOpen} aria-label={`Edit ${item.title}`}>
        <span className={s.tile} style={{ background: `linear-gradient(145deg, ${item.color}, color-mix(in oklab, ${item.color} 55%, #000))` }}>
          <T.Icon size={20} strokeWidth={1.75} />
        </span>
        <span className={s.rowText}>
          <span className={s.rowTitle}>{item.title}</span>
          <span className={s.rowMeta}>
            {item.meta && <span>{item.meta}</span>}
            <span>Added {fmtDate(item.added_date)}</span>
          </span>
          {item.notes && <span className={s.rowNotes}>{item.notes}</span>}
        </span>
      </button>

      {item.status === 'progress' && (
        <div className={s.progress}>
          <input
            type="range" min={0} max={100} step={5}
            value={shown}
            aria-label={`Progress on ${item.title}`}
            className={s.slider}
            style={{ ['--p' as string]: `${shown}%` }}
            onPointerDown={() => { setPct(item.pct); setDragging(true); }}
            onChange={e => { setDragging(true); setPct(+e.target.value); }}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={() => dragging && commit()}
          />
          <span className={s.pct}>{shown}%</span>
        </div>
      )}

      <div className={s.rowActions}>
        {item.status === 'todo' && <button type="button" className={s.stateBtn} onClick={() => onStatus('progress')}><Play size={13} strokeWidth={2.5} /> Start</button>}
        {item.status === 'progress' && <button type="button" className={`${s.stateBtn} ${s.stateDone}`} onClick={() => onStatus('done')}><Check size={14} strokeWidth={2.5} /> Finish</button>}
        {item.status === 'done' && <button type="button" className={s.stateBtn} onClick={() => onStatus('todo')}><RotateCcw size={13} strokeWidth={2.5} /> Again</button>}
        <button type="button" className={s.delBtn} onClick={onDelete} aria-label={`Remove ${item.title}`}><Trash2 size={15} strokeWidth={2} /></button>
      </div>
    </article>
  );
}

export default function QueuePage() {
  const [items, setItems]   = useState<DbQueueItem[]>([]);
  const [souls, setSouls]   = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<QTab>('watch');
  const [statusF, setStatusF] = useState<'all' | QStatus>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<DbQueueItem | null>(null);
  const [form, setForm]     = useState<Form>(EMPTY);
  const [soulIds, setSoulIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [delItem, setDelItem] = useState<DbQueueItem | null>(null);
  const [toast, show] = useToast();

  const reload = useCallback(async () => {
      try {
        if (!(await ensureSession())) return;
        const [data, soulData] = await Promise.all([getQueue(), getSouls().catch(() => [] as DbSoul[])]);
        setItems(data);
        setSouls(soulData);
        // Open on the busiest tab
        const busiest = TAB_KEYS.map(k => [k, data.filter(d => d.tab === k && d.status !== 'done').length] as const).sort((a, b) => b[1] - a[1])[0];
        if (busiest && busiest[1] > 0) setTab(busiest[0]);
      } catch {
        show('Could not load your queue.', 'var(--red)');
      } finally {
        setLoading(false);
      }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['queue'], reload);

  const q = search.trim().toLowerCase();
  const order: Record<QStatus, number> = { progress: 0, todo: 1, done: 2 };
  const visible = useMemo(() => items
    .filter(i => i.tab === tab)
    .filter(i => statusF === 'all' || i.status === statusF)
    .filter(i => !q || `${i.title} ${i.meta ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, tab, statusF, q]);

  const openCount = (t: QTab) => items.filter(i => i.tab === t && i.status !== 'done').length;
  const tabs: [string, string][] = TAB_KEYS.map(k => [k, `${TABS[k].label}${openCount(k) ? ` ${openCount(k)}` : ''}`]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  const patch = async (item: DbQueueItem, updates: Partial<DbQueueItem>, okMsg?: string) => {
    setItems(l => l.map(x => x.id === item.id ? { ...x, ...updates } : x));
    try { await updateQueueItem(item.id, updates); if (okMsg) show(okMsg); }
    catch { setItems(l => l.map(x => x.id === item.id ? item : x)); show('Could not update that.', 'var(--red)'); }
  };

  const setStatus = (item: DbQueueItem, status: QStatus) => patch(item, {
    status,
    pct: status === 'done' ? 100 : status === 'todo' ? 0 : Math.max(item.pct, 5),
  }, status === 'done' ? `Finished "${item.title}"` : undefined);

  const openAdd = () => { setEditItem(null); setForm(EMPTY); setSoulIds([]); setFormOpen(true); };
  const openEdit = (item: DbQueueItem) => {
    setEditItem(item);
    setForm({ title: item.title, meta: item.meta ?? '', notes: item.notes ?? '', status: item.status });
    setSoulIds([]);
    setFormOpen(true);
    getSoulLinksForItem('queue', item.id).then(l => setSoulIds(l.map(x => x.soul_id))).catch(() => {});
  };

  const save = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      const base = { title: form.title.trim(), meta: form.meta.trim() || null, notes: form.notes.trim() || null, status: form.status };
      const saved = editItem
        ? await updateQueueItem(editItem.id, { ...base, pct: form.status === 'done' ? 100 : form.status === 'todo' ? 0 : editItem.pct })
        : await addQueueItem({ ...base, tab, pct: form.status === 'done' ? 100 : 0, color: TILE_COLORS[Math.floor(Math.random() * TILE_COLORS.length)], added_date: localDateStr() });
      setItems(l => editItem ? l.map(x => x.id === saved.id ? saved : x) : [saved, ...l]);
      await setSoulLinks('queue', saved.id, saved.title, saved.meta ?? null, soulIds).catch(() => show('Saved, but the people links did not update.', 'var(--red)'));
      setFormOpen(false);
      show(editItem ? 'Changes saved' : `Added to ${TABS[tab].label}`);
    } catch {
      show('Could not save that.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const item = delItem; if (!item) return;
    const snapshot = items;
    setItems(l => l.filter(x => x.id !== item.id));
    setDelItem(null);
    try { await deleteQueueItem(item.id); await deleteSoulLinksForItem('queue', item.id).catch(() => {}); show('Removed from your queue'); }
    catch { setItems(snapshot); show('Could not remove that.', 'var(--red)'); }
  };

  const T = TABS[editItem?.tab ?? tab];
  const total = items.filter(i => i.status !== 'done').length;

  return (
    <div className={s.page}>
      <Topbar
        title="Queue"
        sub={loading ? 'Loading your queue' : total ? `${total} things to look forward to` : 'Things to watch, hear, read and try'}
        maxWidth={860}
        action={<Btn onClick={openAdd}><Plus size={16} strokeWidth={2.25} /> Add</Btn>}
      />

      <div className={s.wrap}>
        <InnerTabs tabs={tabs} active={tab} onTab={t => setTab(t as QTab)} />
        <div className={s.filters}>
          <SearchBar value={search} onChange={setSearch} placeholder={`Search ${TABS[tab].label.toLowerCase()}`} className={s.search} />
          <div className={s.statusPills}>
            <Pill active={statusF === 'all'} onClick={() => setStatusF('all')}>All</Pill>
            {(['todo', 'progress', 'done'] as QStatus[]).map(st => (
              <Pill key={st} active={statusF === st} color={STATUS[st].color} onClick={() => setStatusF(st)}>{STATUS[st].label}</Pill>
            ))}
          </div>
        </div>

        <div className={s.list}>
          {loading ? (
            [0, 1, 2].map(i => <div key={i} className={`skeleton ${s.skel}`} />)
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<ListVideo size={26} />}
              msg={q || statusF !== 'all' ? 'Nothing matches those filters.' : `Nothing to ${TABS[tab].verb} yet. ${TABS[tab].hint} go here.`}
              action={!q && statusF === 'all' ? <Btn sm onClick={openAdd}><Plus size={15} /> Add something</Btn> : undefined}
            />
          ) : visible.map(item => (
            <QueueRow
              key={item.id}
              item={item}
              onOpen={() => openEdit(item)}
              onStatus={st => setStatus(item, st)}
              onPct={pct => patch(item, { pct, ...(pct === 100 ? { status: 'done' as QStatus } : {}) }, pct === 100 ? `Finished "${item.title}"` : undefined)}
              onDelete={() => setDelItem(item)}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <Modal onClose={() => !saving && setFormOpen(false)}>
          <ModalTitle>{editItem ? 'Edit' : `Add something to ${T.verb}`}</ModalTitle>
          <FInput label="Title" value={form.title} onChange={v => set('title', v)} placeholder={`What do you want to ${T.verb}?`} />
          <FInput label="Details" value={form.meta} onChange={v => set('meta', v)} placeholder="Author, genre, who recommended it" />
          <FArea label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={2} placeholder="Anything to remember" />
          <Lbl>Status</Lbl>
          <div className={s.statusPills}>
            {(['todo', 'progress', 'done'] as QStatus[]).map(st => (
              <Pill key={st} active={form.status === st} color={STATUS[st].color} onClick={() => set('status', st)}>{STATUS[st].label}</Pill>
            ))}
          </div>
          <div style={{ height: 14 }} />
          <SoulLinkField souls={souls} value={soulIds} onChange={setSoulIds} label="Recommended by or shared with" />
          <ModalFooter onCancel={() => setFormOpen(false)} onSave={save} saveLabel={saving ? 'Saving' : editItem ? 'Save changes' : 'Add'} />
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.title}" will be removed from your queue.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
