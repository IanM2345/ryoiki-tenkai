'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { colors as C, fonts } from '../../../lib/token';
import {
  Btn, Lbl, Tag, InnerTabs, Modal, ModalTitle, ModalFooter, Confirm,
  FInput, FArea, TagInput, Toast, useToast, EmptyState,
} from '@/components/ui';
import {
  getSoul, updateSoul, deleteSoul,
  getSoulMedia, addSoulMedia, deleteSoulMedia,
  getJournalEntries, getSoulLinks,
  DbSoul, DbSoulMedia, DbSoulLink,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';

const EMOJIS = ['🌟','🫶','🔥','✨','🌙','🎭','🌊','🦋','🌸','💫','🎨','🎵','🌿','🍀','🐉','🌺'];
const SOUL_COLORS = [C.or,C.puL,C.orL,C.puG,'#22d3ee','#4ade80','#f43f5e','#818cf8','#fb923c','#a78bfa'];

type ProfileTab = 'timeline'|'notes'|'music'|'shows'|'places'|'library'|'ratings'|'queue'|'ideas';

interface JournalMention { id: string; title: string; entry_date: string; }

// ── Link card colours per table ──────────────────────────────
const LINK_META: Record<DbSoulLink['table_name'], { label: string; color: string; icon: string }> = {
  library:  { label: 'Library',  color: '#a855f7', icon: '◫' },
  places:   { label: 'Place',    color: C.or,      icon: '📍' },
  ratings:  { label: 'Rating',   color: C.orL,     icon: '★'  },
  queue:    { label: 'Queue',    color: C.puL,     icon: '▷'  },
  ideas:    { label: 'Idea',     color: '#4ade80', icon: '💡' },
};

// Where to deep-link each item
const LINK_HREF: Record<DbSoulLink['table_name'], string> = {
  library: '/library',
  places:  '/places',
  ratings: '/ratings',
  queue:   '/queue',
  ideas:   '/ideas',
};

export default function SoulProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [soul,      setSoul]      = useState<DbSoul | null>(null);
  const [media,     setMedia]     = useState<DbSoulMedia[]>([]);
  const [mentions,  setMentions]  = useState<JournalMention[]>([]);
  const [links,     setLinks]     = useState<DbSoulLink[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [sTab,      setSTab]      = useState<ProfileTab>('timeline');
  const [modal,     setModal]     = useState<'edit'|'delete'|null>(null);
  const [form,      setForm]      = useState({ name:'', emoji:'🌟', color:C.or as string, role:'', since:'', description:'', notes:'', tags:[] as string[] });
  const [newMusic,  setNewMusic]  = useState({ title:'', meta:'' });
  const [newShow,   setNewShow]   = useState({ title:'', meta:'' });
  const [newPlace,  setNewPlace]  = useState({ title:'', meta:'' });
  const [toast, show] = useToast();

  // ── load ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!id) return;
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [s, m, journals, soulLinks] = await Promise.all([
          getSoul(id),
          getSoulMedia(id),
          getJournalEntries(),
          getSoulLinks(id),
        ]);
        setSoul(s);
        setMedia(m);
        setLinks(soulLinks);
        setForm({ name:s.name, emoji:s.emoji, color:s.color, role:s.role??'', since:s.since??'', description:s.description??'', notes:s.notes??'', tags:[...(s.tags??[])] });
        setMentions(
          journals
            .filter(j => j.body?.includes(`@${s.name}`) || j.title?.includes(s.name))
            .map(j => ({ id:j.id, title:j.title, entry_date:j.entry_date }))
        );
      } catch(e) {
        console.error(e);
        show('Could not load soul.', C.red);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontFamily:fonts.main, color:C.txm, fontSize:13 }}>Loading…</span>
    </div>
  );

  if (!soul) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:C.txm }}>
        <div style={{ fontSize:28, marginBottom:8 }}>👁</div>
        <div style={{ fontSize:13 }}>Soul not found.</div>
        <Link href="/souls"><div style={{ marginTop:12 }}><Btn variant="ghost">← Back to Souls</Btn></div></Link>
      </div>
    </div>
  );

  // ── derived data ─────────────────────────────────────────
  const music  = media.filter(m => m.kind === 'music');
  const shows  = media.filter(m => m.kind === 'show' || m.kind === 'film');
  const places = media.filter(m => m.kind === 'other' && m.meta === 'place');

  const linkedLibrary = links.filter(l => l.table_name === 'library');
  const linkedRatings = links.filter(l => l.table_name === 'ratings');
  const linkedQueue   = links.filter(l => l.table_name === 'queue');
  const linkedIdeas   = links.filter(l => l.table_name === 'ideas');
  const linkedPlaces  = links.filter(l => l.table_name === 'places');

  const timeline = [
    ...mentions.map(j    => ({ type:'Journal', color:C.orL,  date:j.entry_date, title:j.title,   note:'Mentioned in entry',             key:'j'+j.id,  href:`/journal/${j.id}` })),
    ...music.map(m       => ({ type:'Music',   color:C.or,   date:'',           title:m.title,   note:m.meta??'',                       key:'m'+m.id,  href:'' })),
    ...shows.map(sh      => ({ type:'Show',    color:C.puL,  date:'',           title:sh.title,  note:sh.meta??'',                      key:'s'+sh.id, href:'' })),
    ...places.map(p      => ({ type:'Place',   color:C.puG,  date:'',           title:p.title,   note:'',                               key:'p'+p.id,  href:'' })),
    ...links.map(l       => ({ type: LINK_META[l.table_name].label, color: LINK_META[l.table_name].color, date:'', title:l.item_title, note:l.item_meta??'', key:'l'+l.id, href: LINK_HREF[l.table_name] })),
  ];

  const PROFILE_TABS: [ProfileTab, string][] = [
    ['timeline', `Timeline (${timeline.length})`],
    ['notes',    'Notes'],
    ['music',    `Music (${music.length})`],
    ['shows',    `Shows (${shows.length})`],
    ['places',   `Places (${places.length + linkedPlaces.length})`],
    ['library',  `Library (${linkedLibrary.length})`],
    ['ratings',  `Ratings (${linkedRatings.length})`],
    ['queue',    `Queue (${linkedQueue.length})`],
    ['ideas',    `Ideas (${linkedIdeas.length})`],
  ];

  // ── edit ─────────────────────────────────────────────────
  const saveEdit = async () => {
    const snapshot = soul;
    const payload = { name:form.name, emoji:form.emoji, color:form.color, role:form.role||null, since:form.since||null, description:form.description||null, notes:form.notes||null, tags:form.tags };
    setSoul(s => s ? { ...s, ...payload } : s);
    setModal(null);
    show('Soul updated!');
    try { await updateSoul(id, payload); }
    catch { setSoul(snapshot); show('Could not update.', C.red); }
  };

  const doDelete = async () => {
    try { await deleteSoul(id); show('Soul removed.'); setTimeout(() => router.push('/souls'), 600); }
    catch { show('Could not delete.', C.red); }
  };

  // ── media mutations ───────────────────────────────────────
  const addMedia = async (kind: DbSoulMedia['kind'], title: string, meta: string | null, isPlace?: boolean) => {
    if (!title.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: DbSoulMedia = { id:tempId, user_id:'', soul_id:id, kind: isPlace ? 'other' : kind, title, meta: isPlace ? 'place' : (meta||null), created_at:'' };
    setMedia(m => [...m, optimistic]);
    try {
      const saved = await addSoulMedia({ soul_id:id, kind: isPlace ? 'other' : kind, title, meta: isPlace ? 'place' : (meta||null) });
      setMedia(m => m.map(x => x.id===tempId ? saved : x));
      show('Added!');
    } catch { setMedia(m => m.filter(x => x.id!==tempId)); show('Could not add.', C.red); }
  };

  const delMedia = async (mediaId: string) => {
    const snapshot = [...media];
    setMedia(m => m.filter(x => x.id!==mediaId));
    try { await deleteSoulMedia(mediaId); }
    catch { setMedia(snapshot); show('Could not remove.', C.red); }
  };

  const cardStyle = { background:C.card, borderRadius:8, border:`1px solid ${C.bds}`, padding:'10px 12px' } as const;

  // ── reusable linked-item list ────────────────────────────
  function LinkedItems({ items, tableName }: { items: DbSoulLink[]; tableName: DbSoulLink['table_name'] }) {
    const meta = LINK_META[tableName];
    if (items.length === 0) return (
      <EmptyState icon={meta.icon} msg={`No ${meta.label.toLowerCase()} items linked to ${soul!.name} yet.\nOpen an item and use "Link souls" to connect it.`} />
    );
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {items.map(item => (
          <Link key={item.id} href={LINK_HREF[tableName]} style={{ textDecoration:'none' }}>
            <div
              style={{ ...cardStyle, display:'flex', alignItems:'center', gap:10, cursor:'pointer', transition:'background .15s' }}
              onMouseEnter={ev => { ev.currentTarget.style.background = C.cardHov; }}
              onMouseLeave={ev => { ev.currentTarget.style.background = C.card; }}
            >
              <div style={{ width:32, height:32, borderRadius:6, background:`${meta.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>
                {meta.icon}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.item_title}</div>
                {item.item_meta && <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.item_meta}</div>}
              </div>
              <Tag color={meta.color}>{meta.label}</Tag>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }} className="animate-fade-up">

      {/* Top nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 18px', borderBottom:`1px solid ${C.bds}`, flexShrink:0 }}>
        <Link href="/souls"><Btn variant="ghost" sm>← All Souls</Btn></Link>
        <div style={{ display:'flex', gap:6 }}>
          <Btn variant="ghost" sm onClick={() => setModal('edit')}>Edit</Btn>
          <Btn variant="danger" sm onClick={() => setModal('delete')}>Delete</Btn>
        </div>
      </div>

      {/* Profile body */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>

        {/* Hero */}
        <div className="animate-fade-in"
          style={{ background:`radial-gradient(ellipse at 50% 0%,${soul.color}18 0%,transparent 70%)`, borderRadius:12, padding:'18px 16px', marginBottom:14, border:`1px solid ${soul.color}22`, textAlign:'center' }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:`radial-gradient(circle at 35% 35%,${soul.color}cc,${soul.color}44)`, margin:'0 auto 12px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, border:`2px solid ${soul.color}55`, boxShadow:`0 0 20px ${soul.color}33` }}>
            {soul.emoji}
          </div>
          <div style={{ fontSize:21, fontWeight:700, color:C.tx, fontFamily:fonts.main }}>{soul.name}</div>
          <div style={{ fontFamily:fonts.mono, fontSize:9, color:soul.color, letterSpacing:2, textTransform:'uppercase', marginTop:4 }}>
            {soul.role}{soul.since ? ` · since ${soul.since}` : ''}
          </div>
          {soul.description && (
            <div style={{ fontSize:12, color:C.txs, marginTop:10, lineHeight:1.75, maxWidth:400, margin:'10px auto 0' }}>
              {soul.description}
            </div>
          )}
          <div style={{ display:'flex', gap:5, justifyContent:'center', marginTop:10, flexWrap:'wrap' }}>
            {(soul.tags??[]).map(t => <Tag key={t} color={soul.color}>{t}</Tag>)}
          </div>
        </div>

        <InnerTabs tabs={PROFILE_TABS} active={sTab} onTab={t => setSTab(t as ProfileTab)} />

        {/* ── Timeline ── */}
        {sTab === 'timeline' && (
          <div style={{ marginTop:10 }}>
            {timeline.length === 0
              ? <EmptyState icon="✐" msg={`Nothing linked to ${soul.name} yet.\nAdd music, shows, or link items from the other tabs.`} />
              : <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {timeline.map(item => (
                    <div key={item.key} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginTop:4, flexShrink:0 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:item.color, boxShadow:`0 0 5px ${item.color}66` }} />
                        <div style={{ width:1, height:20, background:`${item.color}33` }} />
                      </div>
                      <div style={{ ...cardStyle, flex:1, padding:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                            <Tag color={item.color}>{item.type}</Tag>
                            <span style={{ fontSize:12, fontWeight:700, color:C.tx }}>{item.title}</span>
                          </div>
                          {item.date && <span style={{ fontFamily:fonts.mono, fontSize:8, color:C.txm }}>{item.date}</span>}
                        </div>
                        {item.note && <div style={{ fontSize:11, color:C.txs, opacity:.6 }}>{item.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── Notes ── */}
        {sTab === 'notes' && (
          <div style={{ marginTop:10 }}>
            <div style={{ ...cardStyle, fontSize:12, color:C.tx, lineHeight:1.8, minHeight:120, whiteSpace:'pre-wrap' }}>
              {soul.notes || <span style={{ color:C.txm, opacity:.4 }}>No notes yet. Edit this soul to add some.</span>}
            </div>
            <div style={{ marginTop:10 }}><Btn variant="ghost" sm onClick={() => setModal('edit')}>Edit Notes</Btn></div>
          </div>
        )}

        {/* ── Music ── */}
        {sTab === 'music' && (
          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:7 }}>
            {music.map(m => (
              <div key={m.id} style={{ ...cardStyle, display:'flex', alignItems:'center', gap:9 }}
                onMouseEnter={ev => { const b=ev.currentTarget.querySelector('.md') as HTMLElement|null; if(b) b.style.opacity='1'; }}
                onMouseLeave={ev => { const b=ev.currentTarget.querySelector('.md') as HTMLElement|null; if(b) b.style.opacity='0'; }}>
                <div style={{ width:30, height:30, borderRadius:6, background:`${C.or}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>♬</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.tx }}>{m.title}</div>
                  <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm }}>{m.meta}</div>
                </div>
                <button className="md" onClick={() => delMedia(m.id)} style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'2px 7px', fontSize:9, cursor:'pointer', opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}>×</button>
              </div>
            ))}
            <div style={{ ...cardStyle, padding:12, borderStyle:'dashed' }}>
              <Lbl>Link music</Lbl>
              <FInput label="Title" value={newMusic.title} onChange={v => setNewMusic(m=>({...m,title:v}))} placeholder="Song, album, or playlist" />
              <div style={{ display:'flex', gap:8 }}>
                <FInput label="Details" value={newMusic.meta} onChange={v => setNewMusic(m=>({...m,meta:v}))} placeholder="Artist, type..." style={{ flex:1 }} />
                <div style={{ alignSelf:'flex-end', marginBottom:10 }}>
                  <Btn sm onClick={() => { addMedia('music', newMusic.title, newMusic.meta); setNewMusic({title:'',meta:''}); }}>+ Add</Btn>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Shows ── */}
        {sTab === 'shows' && (
          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:7 }}>
            {shows.map(sh => (
              <div key={sh.id} style={{ ...cardStyle, display:'flex', alignItems:'center', gap:9 }}
                onMouseEnter={ev => { const b=ev.currentTarget.querySelector('.sd') as HTMLElement|null; if(b) b.style.opacity='1'; }}
                onMouseLeave={ev => { const b=ev.currentTarget.querySelector('.sd') as HTMLElement|null; if(b) b.style.opacity='0'; }}>
                <div style={{ width:30, height:30, borderRadius:6, background:`${C.puL}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>▷</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.tx }}>{sh.title}</div>
                  <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm }}>{sh.meta}</div>
                </div>
                <button className="sd" onClick={() => delMedia(sh.id)} style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'2px 7px', fontSize:9, cursor:'pointer', opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}>×</button>
              </div>
            ))}
            <div style={{ ...cardStyle, padding:12, borderStyle:'dashed' }}>
              <Lbl>Link a show or film</Lbl>
              <FInput label="Title" value={newShow.title} onChange={v => setNewShow(s=>({...s,title:v}))} placeholder="Series, film, documentary" />
              <div style={{ display:'flex', gap:8 }}>
                <FInput label="Details" value={newShow.meta} onChange={v => setNewShow(s=>({...s,meta:v}))} placeholder="Platform, year..." style={{ flex:1 }} />
                <div style={{ alignSelf:'flex-end', marginBottom:10 }}>
                  <Btn sm onClick={() => { addMedia('show', newShow.title, newShow.meta); setNewShow({title:'',meta:''}); }}>+ Add</Btn>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Places (soul_media places + soul_links places merged) ── */}
        {sTab === 'places' && (
          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:7 }}>
            {places.map(p => (
              <div key={p.id} style={{ ...cardStyle, display:'flex', alignItems:'center', gap:9 }}
                onMouseEnter={ev => { const b=ev.currentTarget.querySelector('.pd') as HTMLElement|null; if(b) b.style.opacity='1'; }}
                onMouseLeave={ev => { const b=ev.currentTarget.querySelector('.pd') as HTMLElement|null; if(b) b.style.opacity='0'; }}>
                <span style={{ fontSize:16 }}>📍</span>
                <span style={{ flex:1, fontSize:12, fontWeight:700, color:C.tx }}>{p.title}</span>
                <button className="pd" onClick={() => delMedia(p.id)} style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'2px 7px', fontSize:9, cursor:'pointer', opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}>×</button>
              </div>
            ))}
            {linkedPlaces.map(item => (
              <Link key={item.id} href="/places" style={{ textDecoration:'none' }}>
                <div
                  style={{ ...cardStyle, display:'flex', alignItems:'center', gap:9, cursor:'pointer', transition:'background .15s' }}
                  onMouseEnter={ev => { ev.currentTarget.style.background = C.cardHov; }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = C.card; }}
                >
                  <span style={{ fontSize:16 }}>📍</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.item_title}</div>
                    {item.item_meta && <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm }}>{item.item_meta}</div>}
                  </div>
                  <Tag color={C.or}>Logged</Tag>
                </div>
              </Link>
            ))}
            {places.length === 0 && linkedPlaces.length === 0 && (
              <EmptyState icon="📍" msg={`No places linked to ${soul.name} yet.`} />
            )}
            <div style={{ ...cardStyle, padding:10, borderStyle:'dashed' }}>
              <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                <FInput label="Link a place" value={newPlace.title} onChange={v => setNewPlace(p=>({...p,title:v}))} placeholder="Place name..." style={{ flex:1, marginBottom:0 }} />
                <div style={{ marginBottom:0, flexShrink:0 }}>
                  <Btn sm onClick={() => { addMedia('other', newPlace.title, 'place', true); setNewPlace({title:'',meta:''}); }}>+ Add</Btn>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Library ── */}
        {sTab === 'library' && (
          <div style={{ marginTop:10 }}>
            <LinkedItems items={linkedLibrary} tableName="library" />
          </div>
        )}

        {/* ── Ratings ── */}
        {sTab === 'ratings' && (
          <div style={{ marginTop:10 }}>
            <LinkedItems items={linkedRatings} tableName="ratings" />
          </div>
        )}

        {/* ── Queue ── */}
        {sTab === 'queue' && (
          <div style={{ marginTop:10 }}>
            <LinkedItems items={linkedQueue} tableName="queue" />
          </div>
        )}

        {/* ── Ideas ── */}
        {sTab === 'ideas' && (
          <div style={{ marginTop:10 }}>
            <LinkedItems items={linkedIdeas} tableName="ideas" />
          </div>
        )}

      </div>

      {/* Edit modal */}
      {modal === 'edit' && (
        <Modal onClose={() => setModal(null)}>
          <ModalTitle>Edit Soul</ModalTitle>
          <FInput label="Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} />
          <div style={{ marginBottom:10 }}>
            <Lbl>Emoji</Lbl>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {EMOJIS.map(e => (
                <span key={e} onClick={() => setForm(f=>({...f,emoji:e}))}
                  style={{ fontSize:19, padding:'4px 7px', borderRadius:8, border:`1px solid ${form.emoji===e?C.or:C.bds}`, cursor:'pointer', background:form.emoji===e?'rgba(255,140,0,.1)':'transparent', transition:'all .15s' }}>{e}</span>
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
          <FInput label="Role"        value={form.role}        onChange={v=>setForm(f=>({...f,role:v}))} />
          <FInput label="Since"       value={form.since}       onChange={v=>setForm(f=>({...f,since:v}))} />
          <FArea  label="Description" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} rows={2} />
          <FArea  label="Private Notes" value={form.notes}     onChange={v=>setForm(f=>({...f,notes:v}))} rows={3} placeholder="Things to remember about them..." />
          <div style={{ marginBottom:10 }}>
            <Lbl>Tags</Lbl>
            <TagInput tags={form.tags} color={form.color}
              onAdd={t => setForm(f=>({...f,tags:[...f.tags,t]}))}
              onRemove={t => setForm(f=>({...f,tags:f.tags.filter(x=>x!==t)}))} />
          </div>
          <ModalFooter onCancel={() => setModal(null)} onSave={saveEdit} saveLabel="Update Soul" />
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal onClose={() => setModal(null)}>
          <Confirm
            msg={`Remove ${soul.name} from your Souls? Journal entries won't be affected.`}
            onConfirm={doDelete} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}