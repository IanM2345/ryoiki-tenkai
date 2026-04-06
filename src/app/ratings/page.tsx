'use client';
import React, { useState, useEffect } from 'react';
import { colors as C, fonts, RATING_CATS, RATING_CAT_ICONS } from '../../lib/token';
import {
  Btn, Lbl, Tag, Stars, Pill, SearchBar, InnerTabs, Topbar,
  Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea,
  EmptyState, Toast, useToast, SoulPicker,
} from '@/components/ui';
import { getRatings, addRating, updateRating, deleteRating, getSoulLinksForItem, setSoulLinks, getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import type { DbRating, DbSoul } from '@/lib/db';

type RCat = typeof RATING_CATS[number];

const STAR_LABELS = ['','Disappointing','It was ok','Pretty good','Really good','Perfect ✨'];
const EMPTY_FORM = { title: '', category: 'Film' as RCat, rating: 0, notes: '' };
type FormState = typeof EMPTY_FORM;

const card = () => ({ background: C.card, borderRadius: 6, border: `1px solid ${C.bds}` });

export default function RatingsPage() {
  const [ratings,          setRatings]          = useState<DbRating[]>([]);
  const [souls,            setSouls]            = useState<DbSoul[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [tab,              setTab]              = useState('all');
  const [sort,             setSort]             = useState<'rating' | 'newest' | 'alpha'>('rating');
  const [search,           setSearch]           = useState('');
  const [modal,            setModal]            = useState<'form' | 'delete' | null>(null);
  const [form,             setForm]             = useState<FormState>(EMPTY_FORM);
  const [editItem,         setEditItem]         = useState<DbRating | null>(null);
  const [delItem,          setDelItem]          = useState<DbRating | null>(null);
  const [linkedSoulIds,    setLinkedSoulIds]    = useState<string[]>([]);
  const [soulPickerActive, setSoulPickerActive] = useState(false);
  const [toast,            show]                = useToast();

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [data, soulData] = await Promise.all([getRatings(), getSouls()]);
        setRatings(data);
        setSouls(soulData);
      } catch (err) {
        console.error('Ratings load error:', err);
        show('Could not load ratings.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = ratings
    .filter(r => tab === 'all' || r.category.toLowerCase() === tab)
    .filter(r => !search || (r.title + (r.notes ?? '')).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === 'rating' ? b.rating - a.rating :
      sort === 'alpha'  ? a.title.localeCompare(b.title) :
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const avg = ratings.length
    ? (ratings.reduce((a, b) => a + b.rating, 0) / ratings.length).toFixed(1)
    : '—';

  const avgByCat = (cat: string) => {
    const r = ratings.filter(x => x.category === cat);
    return r.length ? (r.reduce((a, b) => a + b.rating, 0) / r.length).toFixed(1) : '—';
  };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditItem(null);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    setModal('form');
  };

  const openEdit = async (r: DbRating) => {
    setForm({ title: r.title, category: r.category as RCat, rating: r.rating, notes: r.notes ?? '' });
    setEditItem(r);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    setModal('form');
    try {
      const links = await getSoulLinksForItem('ratings', r.id);
      setLinkedSoulIds(links.map(l => l.soul_id));
      if (links.length > 0) setSoulPickerActive(true);
    } catch { /* non-fatal */ }
  };

  const save = async () => {
    if (!form.title.trim() || !form.rating) return;
    const payload = {
      title:    form.title.trim(),
      category: form.category,
      rating:   form.rating,
      notes:    form.notes || null,
    };
    if (editItem) {
      setRatings(rs => rs.map(x => x.id === editItem.id ? { ...x, ...payload } : x));
      setModal(null);
      try {
        await updateRating(editItem.id, payload);
        if (soulPickerActive) {
          await setSoulLinks('ratings', editItem.id, payload.title, payload.notes, linkedSoulIds);
        }
        show('Updated!');
      } catch {
        setRatings(rs => rs.map(x => x.id === editItem.id ? editItem : x));
        show('Could not update.');
      }
    } else {
      setModal(null);
      try {
        const created = await addRating(payload);
        setRatings(rs => [created, ...rs]);
        if (soulPickerActive) {
          await setSoulLinks('ratings', created.id, created.title, created.notes ?? null, linkedSoulIds);
        }
        show('Rating saved!');
      } catch {
        show('Could not save.');
      }
    }
  };

  const doDelete = async () => {
    if (!delItem) return;
    const snapshot = [...ratings];
    setRatings(rs => rs.filter(x => x.id !== delItem.id));
    setDelItem(null); setModal(null);
    try {
      await deleteRating(delItem.id);
      show('Deleted.');
    } catch {
      setRatings(snapshot);
      show('Could not delete.');
    }
  };

  const byStars = sort === 'rating'
    ? [5,4,3,2,1].map(n => ({ n, items: filtered.filter(r => r.rating === n) })).filter(x => x.items.length > 0)
    : [{ n: null, items: filtered }];

  const tabsData: [string, string][] = [
    ['all', `All (${ratings.length})`],
    ...(['film','book','music','place','series','article'] as string[]).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)] as [string, string]),
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }} className="animate-fade-up">
      <Topbar
        title="Ratings ★"
        sub={loading ? 'Loading...' : `${ratings.length} ratings · avg ${avg} ★`}
        action={<Btn onClick={openAdd}>+ Rate Something</Btn>}
      />

      <InnerTabs tabs={tabsData} active={tab} onTab={setTab} />

      {tab === 'all' && (
        <div style={{ display:'flex', gap:7, padding:'8px 14px', borderBottom:`1px solid ${C.bds}`, overflowX:'auto' }}>
          {RATING_CATS.slice(0, 5).map(cat => (
            <div
              key={cat}
              onClick={() => setTab(cat.toLowerCase())}
              style={{ ...card(), padding:'5px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, flexShrink:0, transition:'all .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHov}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.card}
            >
              <span style={{ fontSize:13 }}>{RATING_CAT_ICONS[cat]}</span>
              <span style={{ fontSize:11, fontWeight:700, color:C.tx }}>{cat}</span>
              <span style={{ fontFamily:fonts.mono, fontSize:9, color:C.or }}>{avgByCat(cat)}★</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:7, padding:'7px 14px', borderBottom:`1px solid ${C.bds}`, alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search ratings..." />
        </div>
        <Pill active={sort === 'rating'} onClick={() => setSort('rating')}>★</Pill>
        <Pill active={sort === 'newest'} onClick={() => setSort('newest')}>New</Pill>
        <Pill active={sort === 'alpha'}  onClick={() => setSort('alpha')}>A–Z</Pill>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'8px 14px' }}>
        {loading ? (
          <EmptyState icon="★" msg="Loading your ratings..." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="★" msg="No ratings yet in this category." />
        ) : byStars.map(({ n, items }) => (
          <div key={n ?? 'all'} style={{ marginBottom:12 }}>
            {n && (
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7 }}>
                <Stars n={n} size={12} />
                <span style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm, letterSpacing:1 }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            {items.map(r => (
              <div
                key={r.id}
                style={{ ...card(), marginBottom:5, cursor:'pointer', transition:'background .15s', position:'relative' }}
                onClick={() => openEdit(r)}
                onMouseEnter={ev => {
                  ev.currentTarget.style.background = C.cardHov;
                  (ev.currentTarget.querySelector('.r-del') as HTMLElement | null)?.style && ((ev.currentTarget.querySelector('.r-del') as HTMLElement).style.opacity = '1');
                }}
                onMouseLeave={ev => {
                  ev.currentTarget.style.background = C.card;
                  (ev.currentTarget.querySelector('.r-del') as HTMLElement | null)?.style && ((ev.currentTarget.querySelector('.r-del') as HTMLElement).style.opacity = '0');
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: r.notes ? 3 : 0 }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ fontSize:14 }}>{RATING_CAT_ICONS[r.category] || '★'}</span>
                    <Tag color={C.or}>{r.category}</Tag>
                    <span style={{ fontSize:12, fontWeight:700, color:C.tx }}>{r.title}</span>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <Stars n={r.rating} size={12} />
                    <button
                      className="r-del"
                      onClick={e => { e.stopPropagation(); setDelItem(r); setModal('delete'); }}
                      style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'2px 7px', fontSize:9, cursor:'pointer', opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}
                    >×</button>
                  </div>
                </div>
                {r.notes && <div style={{ fontSize:11, color:C.txs, opacity:.65, lineHeight:1.5 }}>{r.notes}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {modal === 'form' && (
        <Modal onClose={() => setModal(null)}>
          <ModalTitle>{editItem ? 'Edit Rating' : 'Rate Something ★'}</ModalTitle>
          <FInput label="What are you rating?" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <div style={{ marginBottom:10 }}>
            <Lbl>Category</Lbl>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {RATING_CATS.map(c => (
                <Pill key={c} active={form.category === c} onClick={() => setForm(f => ({ ...f, category: c }))}>
                  {RATING_CAT_ICONS[c]} {c}
                </Pill>
              ))}
            </div>
          </div>
          <div style={{ textAlign:'center', padding:'14px 0', marginBottom:6 }}>
            <Lbl>Your Rating</Lbl>
            <Stars n={form.rating} onSet={r => setForm(f => ({ ...f, rating: r }))} size={34} />
            {form.rating > 0 && (
              <div style={{ fontSize:13, fontStyle:'italic', color:C.txs, marginTop:8 }}>
                {STAR_LABELS[form.rating]}
              </div>
            )}
          </div>
          <FArea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} placeholder="What did you think?" />

          <div style={{ marginTop: 10, marginBottom: 4 }}>
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

          <ModalFooter onCancel={() => setModal(null)} onSave={save} saveLabel={editItem ? 'Update' : 'Save Rating'} />
        </Modal>
      )}

      {modal === 'delete' && delItem && (
        <Modal onClose={() => setModal(null)}>
          <Confirm msg={`"${delItem.title}" will be deleted.`} onConfirm={doDelete} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}