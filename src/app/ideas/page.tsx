'use client';
import React, { useState, useEffect } from 'react';
import s from './ideas.module.css';
import { Btn, Lbl, Tag, Pill, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea, TagInput, EmptyState, Toast, useToast, SoulPicker } from '@/components/ui';
import { getIdeas, addIdea, updateIdea, deleteIdea, getSoulLinksForItem, setSoulLinks, getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import type { DbIdea, DbSoul } from '@/lib/db';

type IStatus   = 'thinking' | 'planning' | 'doing' | 'done';
type IPriority = 'high' | 'medium' | 'low';

const STATUS_META: Record<IStatus, { label: string; color: string }> = {
  thinking: { label: 'Thinking', color: '#a855f7' },
  planning: { label: 'Planning', color: '#ff8c00' },
  doing:    { label: 'Doing',    color: '#4ade80' },
  done:     { label: 'Done',     color: '#8a7060' },
};
const PRIO_COL: Record<IPriority, string> = { high: '#f87171', medium: '#ff8c00', low: '#4ade80' };
const ORDER: IStatus[] = ['thinking', 'planning', 'doing', 'done'];

const EMPTY = {
  title:    '',
  body:     '',
  status:   'thinking' as IStatus,
  priority: 'medium'   as IPriority,
  tags:     [] as string[],
};

type FormState = typeof EMPTY;

export default function IdeasPage() {
  const [ideas,            setIdeas]            = useState<DbIdea[]>([]);
  const [souls,            setSouls]            = useState<DbSoul[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [filter,           setFilter]           = useState<'all' | IStatus>('all');
  const [modal,            setModal]            = useState<'form' | 'delete' | null>(null);
  const [form,             setForm]             = useState<FormState>(EMPTY);
  const [editItem,         setEditItem]         = useState<DbIdea | null>(null);
  const [delItem,          setDelItem]          = useState<DbIdea | null>(null);
  const [linkedSoulIds,    setLinkedSoulIds]    = useState<string[]>([]);
  const [soulPickerActive, setSoulPickerActive] = useState(false);
  const [toast,            show]                = useToast();

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [data, soulData] = await Promise.all([getIdeas(), getSouls()]);
        setIdeas(data);
        setSouls(soulData);
      } catch (err) {
        console.error('Ideas load error:', err);
        show('Could not load ideas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = ideas.filter(i => filter === 'all' || i.status === filter);

  const openAdd = () => {
    setForm({ ...EMPTY, tags: [] });
    setEditItem(null);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    setModal('form');
  };

  const openEdit = async (i: DbIdea) => {
    setForm({ title: i.title, body: i.body ?? '', status: i.status, priority: i.priority, tags: [...(i.tags ?? [])] });
    setEditItem(i);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    setModal('form');
    try {
      const links = await getSoulLinksForItem('ideas', i.id);
      setLinkedSoulIds(links.map(l => l.soul_id));
      if (links.length > 0) setSoulPickerActive(true);
    } catch { /* non-fatal */ }
  };

  const save = async () => {
    if (!form.title.trim()) return;
    const payload = {
      title:    form.title.trim(),
      body:     form.body    || '',
      status:   form.status,
      priority: form.priority,
      tags:     form.tags,
    };

    if (editItem) {
      setIdeas(l => l.map(x => x.id === editItem.id ? { ...x, ...payload } : x));
      setModal(null);
      try {
        await updateIdea(editItem.id, payload);
        if (soulPickerActive) {
          await setSoulLinks('ideas', editItem.id, payload.title, payload.body || null, linkedSoulIds);
        }
        show('Updated!');
      } catch {
        setIdeas(l => l.map(x => x.id === editItem.id ? editItem : x));
        show('Could not update.');
      }
    } else {
      setModal(null);
      try {
        const created = await addIdea(payload);
        setIdeas(l => [created, ...l]);
        if (soulPickerActive) {
          await setSoulLinks('ideas', created.id, created.title, created.body || null, linkedSoulIds);
        }
        show('Idea saved!');
      } catch {
        show('Could not save.');
      }
    }
  };

  const doDelete = async () => {
    if (!delItem) return;
    const snapshot = [...ideas];
    setIdeas(l => l.filter(x => x.id !== delItem.id));
    setDelItem(null);
    setModal(null);
    try {
      await deleteIdea(delItem.id);
      show('Deleted.');
    } catch {
      setIdeas(snapshot);
      show('Could not delete.');
    }
  };

  const cycle = async (idea: DbIdea) => {
    const nextStatus = ORDER[(ORDER.indexOf(idea.status) + 1) % ORDER.length];
    setIdeas(l => l.map(x => x.id === idea.id ? { ...x, status: nextStatus } : x));
    try {
      await updateIdea(idea.id, { status: nextStatus });
    } catch {
      setIdeas(l => l.map(x => x.id === idea.id ? idea : x));
      show('Could not update status.');
    }
  };

  const fmtDate = (iso: string) => iso.split('T')[0];

  return (
    <div className={`${s.page} aFadeUp`}>
      <Topbar
        title="Ideas 💡"
        sub={loading ? 'Loading...' : `${ideas.length} ideas`}
        action={<Btn onClick={openAdd}>+ New Idea</Btn>}
      />

      <div className={s.filterBar}>
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All ({ideas.length})</Pill>
        {ORDER.map(st => (
          <Pill key={st} active={filter === st} color={STATUS_META[st].color} onClick={() => setFilter(st)}>
            {STATUS_META[st].label} ({ideas.filter(i => i.status === st).length})
          </Pill>
        ))}
      </div>

      {loading ? (
        <div className={s.loadingState}>Loading your ideas...</div>
      ) : items.length === 0 ? (
        <EmptyState icon="💡" msg={filter === 'all' ? 'No ideas yet — add your first!' : `No ideas in "${STATUS_META[filter as IStatus]?.label ?? filter}".`} />
      ) : (
        <div className={s.list}>
          {items.map(idea => (
            <div key={idea.id} className={s.ideaCard} onClick={() => openEdit(idea)}>
              <div
                className={s.prioDot}
                style={{ background: PRIO_COL[idea.priority], boxShadow: `0 0 5px ${PRIO_COL[idea.priority]}88` }}
              />
              <div className={s.ideaBody}>
                <div className={s.ideaTop}>
                  <div className={s.ideaTitle}>{idea.title}</div>
                  <span
                    className={s.statusBadge}
                    onClick={e => { e.stopPropagation(); cycle(idea); }}
                    style={{
                      background: `${STATUS_META[idea.status].color}22`,
                      color:       STATUS_META[idea.status].color,
                      border:     `1px solid ${STATUS_META[idea.status].color}44`,
                    }}
                  >
                    {STATUS_META[idea.status].label}
                  </span>
                </div>
                {idea.body && <div className={s.ideaPreview}>{idea.body}</div>}
                <div className={s.ideaMeta}>
                  {(idea.tags ?? []).map(t => <Tag key={t} color="#a855f7">{t}</Tag>)}
                  <span className={s.ideaDate}>{fmtDate(idea.created_at)}</span>
                </div>
              </div>
              <div className={s.ideaActions}>
                <button
                  onClick={e => { e.stopPropagation(); setDelItem(idea); setModal('delete'); }}
                  style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', color: '#f87171', borderRadius: 5, padding: '3px 7px', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}
                >×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'form' && (
        <Modal onClose={() => setModal(null)}>
          <ModalTitle>{editItem ? 'Edit Idea' : 'New Idea 💡'}</ModalTitle>
          <FInput label="Title"   value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <FArea  label="Details" value={form.body}  onChange={v => setForm(f => ({ ...f, body: v }))}  rows={3} />
          <div className={s.formGrid}>
            <div>
              <Lbl>Status</Lbl>
              {ORDER.map(st => (
                <div key={st} className={s.statusOption}
                  onClick={() => setForm(f => ({ ...f, status: st }))}
                  style={{ background: form.status === st ? STATUS_META[st].color : 'transparent', border: `1px solid ${STATUS_META[st].color}44`, color: form.status === st ? '#000' : '#c4a882' }}
                >{STATUS_META[st].label}</div>
              ))}
            </div>
            <div>
              <Lbl>Priority</Lbl>
              {(['high', 'medium', 'low'] as IPriority[]).map(p => (
                <div key={p} className={s.statusOption}
                  onClick={() => setForm(f => ({ ...f, priority: p }))}
                  style={{ background: form.priority === p ? PRIO_COL[p] : 'transparent', border: `1px solid ${PRIO_COL[p]}44`, color: form.priority === p ? '#000' : '#c4a882', textTransform: 'capitalize' }}
                >{p}</div>
              ))}
            </div>
          </div>
          <div>
            <Lbl>Tags</Lbl>
            <TagInput
              tags={form.tags}
              color="#a855f7"
              onAdd={t => setForm(f => ({ ...f, tags: [...f.tags, t] }))}
              onRemove={t => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}
            />
          </div>

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

          <ModalFooter onCancel={() => setModal(null)} onSave={save} saveLabel={editItem ? 'Update' : 'Save Idea'} />
        </Modal>
      )}

      {modal === 'delete' && delItem && (
        <Modal onClose={() => setModal(null)}>
          <Confirm
            msg={`"${delItem.title}" will be deleted.`}
            onConfirm={doDelete}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}