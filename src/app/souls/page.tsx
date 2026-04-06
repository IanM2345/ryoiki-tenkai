// src/app/souls/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { colors as C, fonts } from '../../lib/token';
import {
  Btn, Lbl, TagInput, SearchBar, Topbar,
  Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea,
  EmptyState, Toast, useToast,
} from '@/components/ui';
import {
  getSouls, addSoul, updateSoul, deleteSoul, DbSoul,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { uploadImage, deleteImage } from '@/lib/upload';
import ImagePicker from '@/components/ui/ImagePicker';

const EMOJIS = ['🌟','🫶','🔥','✨','🌙','🎭','🌊','🦋','🌸','💫','🎨','🎵','🌿','🍀','🐉','🌺'];
const SOUL_COLORS = [C.or,C.puL,C.orL,C.puG,'#22d3ee','#4ade80','#f43f5e','#818cf8','#fb923c','#a78bfa'];

const EMPTY_FORM = { name:'', emoji:'🌟', color:C.or as string, role:'', since:'', description:'', tags:[] as string[], notes:'' };

const card = { border:`1px solid ${C.bd}`, borderRadius:8, background:C.card, padding:12 } as const;

export default function SoulsPage() {
  const [souls,        setSouls]        = useState<DbSoul[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [modal,        setModal]        = useState<'form'|'delete'|null>(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [editId,       setEditId]       = useState<string|null>(null);
  const [delId,        setDelId]        = useState<string|null>(null);
  // ── image state ──────────────────────────────────────────
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [toast, show] = useToast();

  // ── load ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const data = await getSouls();
        setSouls(data);
      } catch { show('Could not load souls.', C.red); }
      finally { setLoading(false); }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = souls.filter(s =>
    !search || (s.name + (s.role??'') + (s.description??'')).toLowerCase().includes(search.toLowerCase())
  );

  const resetImageState = () => { setImageFile(null); setImagePreview(null); };

  // ── open modals ─────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    resetImageState();
    setModal('form');
  };
  const openEdit = (s: DbSoul) => {
    setForm({ name:s.name, emoji:s.emoji, color:s.color, role:s.role??'', since:s.since??'', description:s.description??'', tags:[...(s.tags??[])], notes:s.notes??'' });
    setEditId(s.id);
    resetImageState();
    setImagePreview((s as DbSoul & { image_url?: string }).image_url ?? null);
    setModal('form');
  };

  // ── save ────────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) return;

    // ── resolve image URL ────────────────────────────────
    const existingSoul = editId !== null ? souls.find(x => x.id === editId) : null;
    const existingImageUrl = existingSoul
      ? ((existingSoul as DbSoul & { image_url?: string }).image_url ?? null)
      : null;

    let finalImageUrl: string | null = existingImageUrl;

    if (imageFile) {
      if (existingImageUrl) await deleteImage(existingImageUrl).catch(() => {});
      finalImageUrl = await uploadImage(imageFile, 'souls');
    } else if (!imagePreview && existingImageUrl) {
      await deleteImage(existingImageUrl).catch(() => {});
      finalImageUrl = null;
    }

    const payload = {
      name:      form.name,
      emoji:     form.emoji,
      color:     form.color,
      role:      form.role        || null,
      since:     form.since       || null,
      description: form.description || null,
      notes:     form.notes       || null,
      tags:      form.tags,
      image_url: finalImageUrl,
    };

    if (editId !== null) {
      const snapshot = [...souls];
      setSouls(ss => ss.map(x => x.id===editId ? { ...x, ...payload } : x));
      setModal(null);
      show('Soul updated!');
      try { await updateSoul(editId, payload); }
      catch { setSouls(snapshot); show('Could not update.', C.red); }
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: DbSoul = { id:tempId, user_id:'', created_at:'', updated_at:'', ...payload, tags:form.tags };
      setSouls(ss => [...ss, optimistic]);
      setModal(null);
      show('Soul added!');
      try {
        const saved = await addSoul(payload);
        setSouls(ss => ss.map(x => x.id===tempId ? saved : x));
      } catch { setSouls(ss => ss.filter(x => x.id!==tempId)); show('Could not add.', C.red); }
    }
  };

  // ── delete ──────────────────────────────────────────────
  const doDelete = async () => {
    if (!delId) return;
    const soul = souls.find(x => x.id === delId);
    const snapshot = [...souls];
    setSouls(ss => ss.filter(x => x.id!==delId));
    setDelId(null); setModal(null);
    show('Soul removed.');
    try {
      await deleteSoul(delId);
      const imgUrl = soul ? (soul as DbSoul & { image_url?: string }).image_url : null;
      if (imgUrl) await deleteImage(imgUrl).catch(() => {});
    } catch { setSouls(snapshot); show('Could not delete.', C.red); }
  };

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontFamily:fonts.main, color:C.txm, fontSize:13 }}>Loading souls…</span>
    </div>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }} className="animate-fade-up">
      <Topbar title="Souls 👁" sub={`${souls.length} in your world`} action={<Btn onClick={openAdd}>+ Add a Soul</Btn>} />

      <div style={{ padding:'8px 12px', borderBottom:`1px solid ${C.bds}` }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search souls..." />
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:12, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:9, alignContent:'start' }}>
        {filtered.length === 0 && !souls.length && (
          <div style={{ gridColumn:'1/-1' }}>
            <EmptyState icon="👁" msg="No souls yet. Add the people who matter." />
          </div>
        )}

        {filtered.map(s => {
          const imgUrl = (s as DbSoul & { image_url?: string }).image_url;
          return (
            <div key={s.id} style={{ ...card, cursor:'pointer', position:'relative', overflow:'hidden', transition:'all .15s' }}
              onMouseEnter={ev => { ev.currentTarget.style.background=C.cardHov; ev.currentTarget.style.borderColor=`${s.color}44`; const b=ev.currentTarget.querySelector('.s-edit') as HTMLElement|null; if(b) b.style.opacity='1'; }}
              onMouseLeave={ev => { ev.currentTarget.style.background=C.card;    ev.currentTarget.style.borderColor=C.bd;          const b=ev.currentTarget.querySelector('.s-edit') as HTMLElement|null; if(b) b.style.opacity='0'; }}>

              <div style={{ position:'absolute', top:-18, right:-18, width:70, height:70, borderRadius:'50%', background:`radial-gradient(circle,${s.color}15,transparent)`, pointerEvents:'none' }} />

              <button className="s-edit" onClick={e => { e.stopPropagation(); openEdit(s); }}
                style={{ position:'absolute', top:7, right:7, background:'none', border:`1px solid ${C.bd}`, borderRadius:5, padding:'2px 8px', fontSize:9, cursor:'pointer', color:C.txs, opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}>
                edit
              </button>

              <Link href={`/souls/${s.id}`} style={{ textDecoration:'none', display:'block' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  {/* Avatar — photo if available, emoji circle otherwise */}
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl} alt={s.name}
                      style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover', border:`2px solid ${s.color}55`, flexShrink:0 }} />
                  ) : (
                    <div style={{ width:38, height:38, borderRadius:'50%', background:`radial-gradient(circle at 35% 35%,${s.color}cc,${s.color}44)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, border:`2px solid ${s.color}55`, flexShrink:0, boxShadow:`0 0 10px ${s.color}22` }}>
                      {s.emoji}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.tx }}>{s.name}</div>
                    <div style={{ fontFamily:fonts.mono, fontSize:8, color:s.color, letterSpacing:1, textTransform:'uppercase' }}>{s.role}</div>
                  </div>
                </div>
                {s.description && (
                  <div style={{ fontSize:11, color:C.txs, opacity:.6, lineHeight:1.45, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', marginBottom:6 }}>
                    {s.description}
                  </div>
                )}
                <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                  {s.since && <span style={{ fontFamily:fonts.mono, fontSize:8, color:C.txs, opacity:.4 }}>since {s.since}</span>}
                </div>
              </Link>
            </div>
          );
        })}

        {/* Add card */}
        <div onClick={openAdd}
          style={{ ...card, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:110, cursor:'pointer', borderStyle:'dashed', background:'rgba(124,58,237,.02)', transition:'background .15s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(124,58,237,.06)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='rgba(124,58,237,.02)'}>
          <span style={{ fontSize:22, color:C.puL, opacity:.3 }}>+</span>
          <span style={{ fontSize:10, color:C.txs, opacity:.3 }}>Add a soul</span>
        </div>
      </div>

      {/* Form modal */}
      {modal === 'form' && (
        <Modal onClose={() => setModal(null)} >
          <ModalTitle>{editId !== null ? 'Edit Soul' : 'Add a Soul 👁'}</ModalTitle>
          <FInput label="Name" value={form.name} onChange={v => setForm(f=>({...f,name:v}))} />

          <div style={{ marginBottom:10 }}>
            <Lbl>Emoji / Avatar</Lbl>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {EMOJIS.map(e => (
                <span key={e} onClick={() => setForm(f=>({...f,emoji:e}))}
                  style={{ fontSize:20, padding:'4px 7px', borderRadius:8, border:`1px solid ${form.emoji===e?C.or:C.bds}`, cursor:'pointer', background:form.emoji===e?'rgba(255,140,0,.1)':'transparent', transition:'all .15s' }}>
                  {e}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:10 }}>
            <Lbl>Colour</Lbl>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {SOUL_COLORS.map(c => (
                <div key={c} onClick={() => setForm(f=>({...f,color:c}))}
                  style={{ width:22, height:22, borderRadius:'50%', background:c, border:`2px solid ${form.color===c?'white':'transparent'}`, cursor:'pointer', transform:form.color===c?'scale(1.15)':'scale(1)', transition:'transform .15s' }} />
              ))}
            </div>
          </div>

          <FInput label="Role / Relationship" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} placeholder="e.g. Best friend, Partner, Family..." />
          <FInput label="Since" value={form.since} onChange={v=>setForm(f=>({...f,since:v}))} placeholder="Year you met, or 'always'" />
          <FArea label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} rows={2} placeholder="How would you describe this person?" />
          <FArea label="Private Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} rows={3} placeholder="Things to remember about them..." />

          <div style={{ marginBottom:10 }}>
            <Lbl>Tags</Lbl>
            <TagInput tags={form.tags} color={form.color}
              onAdd={t => setForm(f=>({...f,tags:[...f.tags,t]}))}
              onRemove={t => setForm(f=>({...f,tags:f.tags.filter(x=>x!==t)}))} />
          </div>

          {/* Image picker */}
          <div style={{ marginBottom:10 }}>
            <ImagePicker
              label="Photo"
              value={imagePreview}
              onChange={(file, preview) => { setImageFile(file); setImagePreview(preview); }}
              onClear={() => { setImageFile(null); setImagePreview(null); }}
            />
          </div>

          {editId !== null && (
            <div style={{ marginBottom:8 }}>
              <Btn variant="danger" sm onClick={() => { setDelId(editId); setModal('delete'); }}>Delete this Soul</Btn>
            </div>
          )}
          <ModalFooter onCancel={() => setModal(null)} onSave={save} saveLabel={editId!==null?'Update Soul':'Create Soul'} />
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal onClose={() => setModal(null)}>
          <Confirm
            msg={`Remove ${souls.find(x=>x.id===delId)?.name} from your Souls? Journal entries won't be affected.`}
            onConfirm={doDelete} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}