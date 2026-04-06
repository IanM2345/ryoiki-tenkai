'use client';
import React, { useState, useEffect } from 'react';
import { colors as C, fonts, QUEUE_STATUS } from '../../lib/token';
import {
  Btn, Pill, Bar, InnerTabs, SearchBar, Topbar, Modal, ModalTitle,
  ModalFooter, FInput, EmptyState, Toast, useToast, SoulPicker, Lbl,
} from '@/components/ui';
import { getQueue, addQueueItem, updateQueueItem, deleteQueueItem, getSoulLinksForItem, setSoulLinks, getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import type { DbQueueItem, DbSoul } from '@/lib/db';

type QStatus = 'todo' | 'progress' | 'done';
type QTab    = 'watch' | 'listen' | 'read' | 'explore';

const TAB_ICON: Record<QTab, string> = { watch:'▷', listen:'♬', read:'📖', explore:'🗺' };
const COLORS = ['#4a6d8a','#8a6a4a','#7a4a8a','#4a7a7a','#6a4a8a','#4a8a6a','#8a4a4a','#5a6a8a'];
const card = () => ({ padding:'10px 12px', borderRadius:8, background:C.card, border:`1px solid ${C.bds}` });

export default function QueuePage() {
  const [items,            setItems]            = useState<DbQueueItem[]>([]);
  const [souls,            setSouls]            = useState<DbSoul[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [tab,              setTab]              = useState<QTab>('watch');
  const [statusF,          setStatusF]          = useState<'all' | QStatus>('all');
  const [search,           setSearch]           = useState('');
  const [modal,            setModal]            = useState(false);
  const [editItem,         setEditItem]         = useState<DbQueueItem | null>(null);
  const [form,             setForm]             = useState({ title:'', meta:'', status:'todo' as QStatus });
  const [linkedSoulIds,    setLinkedSoulIds]    = useState<string[]>([]);
  const [soulPickerActive, setSoulPickerActive] = useState(false);
  const [toast,            show]                = useToast();

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [data, soulData] = await Promise.all([getQueue(), getSouls()]);
        setItems(data);
        setSouls(soulData);
      } catch (err) {
        console.error('Queue load error:', err);
        show('Could not load queue.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tabItems = items
    .filter(i => i.tab === tab)
    .filter(i => statusF === 'all' || i.status === statusF)
    .filter(i => !search || i.title.toLowerCase().includes(search.toLowerCase()));

  const countFor = (t: QTab) => items.filter(i => i.tab === t).length;
  const tabs: [string, string][] = [
    ['watch',   `Watch (${countFor('watch')})`  ],
    ['listen',  `Listen (${countFor('listen')})`],
    ['read',    `Read (${countFor('read')})`    ],
    ['explore', `Explore (${countFor('explore')})`],
  ];

  const openAdd = () => {
    setForm({ title:'', meta:'', status:'todo' });
    setEditItem(null);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    setModal(true);
  };

  const openEdit = async (item: DbQueueItem) => {
    setForm({ title: item.title, meta: item.meta ?? '', status: item.status });
    setEditItem(item);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    setModal(true);
    try {
      const links = await getSoulLinksForItem('queue', item.id);
      setLinkedSoulIds(links.map(l => l.soul_id));
      if (links.length > 0) setSoulPickerActive(true);
    } catch { /* non-fatal */ }
  };

  const save = async () => {
    if (!form.title.trim()) return;

    if (editItem) {
      const payload = {
        title:  form.title.trim(),
        meta:   form.meta || null,
        status: form.status,
        pct:    form.status === 'done' ? 100 : editItem.pct,
      };
      setItems(l => l.map(x => x.id === editItem.id ? { ...x, ...payload } : x));
      setModal(false);
      try {
        await updateQueueItem(editItem.id, payload);
        if (soulPickerActive) {
          await setSoulLinks('queue', editItem.id, payload.title, payload.meta, linkedSoulIds);
        }
        show('Updated!');
      } catch {
        setItems(l => l.map(x => x.id === editItem.id ? editItem : x));
        show('Could not update.');
      }
    } else {
      const payload = {
        tab,
        title:      form.title.trim(),
        meta:       form.meta || null,
        status:     form.status,
        pct:        form.status === 'done' ? 100 : 0,
        color:      COLORS[Math.floor(Math.random() * COLORS.length)],
        added_date: new Date().toISOString().split('T')[0],
      };
      setModal(false);
      setForm({ title:'', meta:'', status:'todo' });
      try {
        const created = await addQueueItem(payload);
        setItems(l => [created, ...l]);
        if (soulPickerActive) {
          await setSoulLinks('queue', created.id, created.title, created.meta ?? null, linkedSoulIds);
        }
        show('Added!');
      } catch {
        show('Could not add item.');
      }
    }
  };

  const del = async (item: DbQueueItem) => {
    const snapshot = [...items];
    setItems(l => l.filter(x => x.id !== item.id));
    try {
      await deleteQueueItem(item.id);
      show('Removed.');
    } catch {
      setItems(snapshot);
      show('Could not remove.');
    }
  };

  const cycle = async (item: DbQueueItem) => {
    const order: QStatus[] = ['todo', 'progress', 'done'];
    const nextStatus = order[(order.indexOf(item.status) + 1) % order.length];
    const nextPct    = nextStatus === 'done' ? 100 : nextStatus === 'progress' ? 50 : 0;
    setItems(l => l.map(x => x.id === item.id ? { ...x, status: nextStatus, pct: nextPct } : x));
    try {
      await updateQueueItem(item.id, { status: nextStatus, pct: nextPct });
      show(`Marked as ${QUEUE_STATUS[nextStatus].label}`);
    } catch {
      setItems(l => l.map(x => x.id === item.id ? item : x));
      show('Could not update status.');
    }
  };

  const setPct = async (item: DbQueueItem, pct: number) => {
    setItems(l => l.map(x => x.id === item.id ? { ...x, pct } : x));
    try {
      await updateQueueItem(item.id, { pct });
    } catch {
      setItems(l => l.map(x => x.id === item.id ? item : x));
      show('Could not update progress.');
    }
  };

  const modalTitle = editItem
    ? `Edit — ${editItem.title}`
    : `Add to ${tab.charAt(0).toUpperCase() + tab.slice(1)}`;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }} className="animate-fade-up">
      <Topbar title="Queue ▷" action={<Btn onClick={openAdd}>+ Add</Btn>} />

      <InnerTabs tabs={tabs} active={tab} onTab={t => setTab(t as QTab)} />

      <div style={{ display:'flex', gap:7, padding:'8px 14px', borderBottom:`1px solid ${C.bds}`, alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <SearchBar value={search} onChange={setSearch} placeholder={`Search ${tab}...`} />
        </div>
        <Pill active={statusF==='all'}      onClick={() => setStatusF('all')}>All</Pill>
        <Pill active={statusF==='todo'}     color={QUEUE_STATUS.todo.color}     onClick={() => setStatusF('todo')}>Not Started</Pill>
        <Pill active={statusF==='progress'} color={QUEUE_STATUS.progress.color} onClick={() => setStatusF('progress')}>In Progress</Pill>
        <Pill active={statusF==='done'}     color={QUEUE_STATUS.done.color}     onClick={() => setStatusF('done')}>Done</Pill>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'8px 14px', display:'flex', flexDirection:'column', gap:7 }}>
        {loading ? (
          <EmptyState icon="▷" msg="Loading your queue..." />
        ) : tabItems.length === 0 ? (
          <EmptyState icon="▷" msg="Nothing here yet — add something!" />
        ) : tabItems.map(item => (
          <div
            key={item.id}
            style={{ ...card(), display:'flex', alignItems:'center', gap:10, position:'relative', cursor:'pointer' }}
            onClick={() => openEdit(item)}
            onMouseEnter={ev => { const el = ev.currentTarget.querySelector('.q-del') as HTMLElement | null; if (el) el.style.opacity = '1'; }}
            onMouseLeave={ev => { const el = ev.currentTarget.querySelector('.q-del') as HTMLElement | null; if (el) el.style.opacity = '0'; }}
          >
            <div style={{ width:36, height:36, borderRadius:6, background:item.color, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
              {TAB_ICON[tab]}
            </div>

            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:1 }}>{item.title}</div>
              <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txs, opacity:.45 }}>{item.meta}</div>
              {item.status === 'progress' && (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                  <Bar pct={item.pct} color={C.or} h={3} />
                  <input
                    type="range" min={0} max={100} step={5} value={item.pct}
                    onChange={e => { e.stopPropagation(); setPct(item, +e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width:55, flexShrink:0, accentColor:C.or }}
                  />
                  <span style={{ fontFamily:fonts.mono, fontSize:9, color:C.or, minWidth:28 }}>{item.pct}%</span>
                </div>
              )}
              {item.status === 'done' && <Bar pct={100} color={C.puL} h={3} />}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'flex-end', flexShrink:0 }}>
              <span
                onClick={e => { e.stopPropagation(); cycle(item); }}
                title="Click to advance"
                style={{ fontFamily:fonts.mono, fontSize:8, textTransform:'uppercase', padding:'2px 7px', borderRadius:3, background:`${QUEUE_STATUS[item.status].color}22`, color:QUEUE_STATUS[item.status].color, cursor:'pointer', letterSpacing:1, whiteSpace:'nowrap' }}
              >{QUEUE_STATUS[item.status].label}</span>
              <span style={{ fontFamily:fonts.mono, fontSize:8, color:C.txm, opacity:.4 }}>{item.added_date}</span>
            </div>

            <button
              className="q-del"
              onClick={e => { e.stopPropagation(); del(item); }}
              style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'3px 7px', fontSize:10, cursor:'pointer', opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}
            >×</button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal onClose={() => { setModal(false); setEditItem(null); }}>
          <ModalTitle>{modalTitle}</ModalTitle>
          <FInput
            label="Title"
            value={form.title}
            onChange={v => setForm(f => ({ ...f, title:v }))}
            placeholder={`What do you want to ${tab==='read'?'read':tab==='listen'?'listen to':tab==='explore'?'explore':'watch'}?`}
          />
          <FInput label="Details" value={form.meta} onChange={v => setForm(f => ({ ...f, meta:v }))} placeholder="Genre, author, length..." />
          <div style={{ marginBottom:14 }}>
            <Lbl>Status</Lbl>
            <div style={{ display:'flex', gap:6, marginTop:4 }}>
              {(['todo','progress','done'] as QStatus[]).map(st => (
                <Pill key={st} active={form.status === st} color={QUEUE_STATUS[st].color} onClick={() => setForm(f => ({ ...f, status:st }))}>
                  {QUEUE_STATUS[st].label}
                </Pill>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            {!soulPickerActive ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setSoulPickerActive(true); }}
                style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 11, padding: '5px 10px', width: '100%' }}
              >+ Link souls</button>
            ) : (
              <>
                <Lbl>Linked Souls</Lbl>
                <SoulPicker
                  souls={souls}
                  linkedIds={linkedSoulIds}
                  onToggle={id => setLinkedSoulIds(prev =>
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                  )}
                />
              </>
            )}
          </div>

          <ModalFooter onCancel={() => { setModal(false); setEditItem(null); }} onSave={save} saveLabel={editItem ? 'Update' : 'Add'} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}