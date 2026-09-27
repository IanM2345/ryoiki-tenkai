'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Lightbulb, ArrowRight, RotateCcw, Trash2, Brain, ClipboardList, Hammer, PartyPopper } from 'lucide-react';
import s from './ideas.module.css';
import {
  Btn, Lbl, Tag, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea, TagInput,
  EmptyState, Toast, useToast, SearchBar,
} from '@/components/ui';
import SoulLinkField from '@/components/ui/SoulLinkField';
import {
  getIdeas, addIdea, updateIdea, deleteIdea, getSoulLinksForItem, setSoulLinks, deleteSoulLinksForItem, getSouls,
} from '@/lib/db';
import type { DbIdea, DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { PRIORITIES, PRIO_COLOR, PRIO_LABEL, type Priority } from '@/lib/tasks';
import { fmtDate } from '@/lib/dates';

type IStatus = DbIdea['status'];
const ORDER: IStatus[] = ['thinking', 'planning', 'doing', 'done'];
const STATUS: Record<IStatus, { label: string; color: string; Icon: typeof Brain; empty: string }> = {
  thinking: { label: 'Thinking', color: 'var(--pu-l)', Icon: Brain,         empty: 'Half-formed thoughts go here' },
  planning: { label: 'Planning', color: 'var(--or)',   Icon: ClipboardList, empty: 'Nothing being planned yet' },
  doing:    { label: 'Doing',    color: 'var(--gr)',   Icon: Hammer,        empty: 'Nothing in progress' },
  done:     { label: 'Done',     color: 'var(--tx-m)', Icon: PartyPopper,   empty: 'Finished ideas land here' },
};

const EMPTY = { title: '', body: '', status: 'thinking' as IStatus, priority: 'medium' as Priority, tags: [] as string[] };
type Form = typeof EMPTY;

export default function IdeasPage() {
  const [ideas, setIdeas]     = useState<DbIdea[]>([]);
  const [souls, setSouls]     = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm]       = useState<Form>(EMPTY);
  const [editItem, setEditItem] = useState<DbIdea | null>(null);
  const [soulIds, setSoulIds] = useState<string[]>([]);
  const [saving, setSaving]   = useState(false);
  const [delItem, setDelItem] = useState<DbIdea | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [data, soulData] = await Promise.all([getIdeas(), getSouls().catch(() => [] as DbSoul[])]);
        setIdeas(data);
        setSouls(soulData);
      } catch {
        show('Could not load your ideas.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const q = search.trim().toLowerCase();
  const columns = useMemo(() => {
    const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    const list = ideas
      .filter(i => !q || `${i.title} ${i.body} ${(i.tags ?? []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => rank[a.priority] - rank[b.priority] || b.updated_at.localeCompare(a.updated_at));
    return ORDER.map(st => ({ st, items: list.filter(i => i.status === st) }));
  }, [ideas, q]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = (status: IStatus = 'thinking') => {
    setEditItem(null); setForm({ ...EMPTY, status, tags: [] }); setSoulIds([]); setFormOpen(true);
  };
  const openEdit = (i: DbIdea) => {
    setEditItem(i);
    setForm({ title: i.title, body: i.body ?? '', status: i.status, priority: i.priority, tags: [...(i.tags ?? [])] });
    setSoulIds([]);
    setFormOpen(true);
    getSoulLinksForItem('ideas', i.id).then(l => setSoulIds(l.map(x => x.soul_id))).catch(() => {});
  };

  const save = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    const payload = { title: form.title.trim(), body: form.body.trim(), status: form.status, priority: form.priority, tags: form.tags };
    try {
      const saved = editItem ? await updateIdea(editItem.id, payload) : await addIdea(payload);
      setIdeas(l => editItem ? l.map(x => x.id === saved.id ? saved : x) : [saved, ...l]);
      await setSoulLinks('ideas', saved.id, saved.title, saved.body || null, soulIds).catch(() => show('Saved, but the people links did not update.', 'var(--red)'));
      setFormOpen(false);
      show(editItem ? 'Idea updated' : 'Idea saved');
    } catch {
      show('Could not save that idea.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const moveTo = async (idea: DbIdea, status: IStatus) => {
    setIdeas(l => l.map(x => x.id === idea.id ? { ...x, status, updated_at: new Date().toISOString() } : x));
    try { await updateIdea(idea.id, { status }); }
    catch { setIdeas(l => l.map(x => x.id === idea.id ? idea : x)); show('Could not move that idea.', 'var(--red)'); }
  };

  const doDelete = async () => {
    const item = delItem; if (!item) return;
    const snapshot = ideas;
    setIdeas(l => l.filter(x => x.id !== item.id));
    setDelItem(null); setFormOpen(false);
    try { await deleteIdea(item.id); await deleteSoulLinksForItem('ideas', item.id).catch(() => {}); show('Idea deleted'); }
    catch { setIdeas(snapshot); show('Could not delete that idea.', 'var(--red)'); }
  };

  const active = ideas.filter(i => i.status !== 'done').length;

  return (
    <div className={s.page}>
      <Topbar
        title="Ideas"
        sub={loading ? 'Loading your ideas' : ideas.length ? `${active} in the works, ${ideas.length - active} done` : 'Every big thing starts as a small note'}
        action={<Btn onClick={() => openAdd()}><Plus size={16} strokeWidth={2.25} /> New idea</Btn>}
      />

      <div className={s.wrap}>
        {ideas.length > 3 && (
          <SearchBar value={search} onChange={setSearch} placeholder="Search ideas" className={s.search} />
        )}

        {!loading && ideas.length === 0 ? (
          <EmptyState
            icon={<Lightbulb size={26} />}
            msg="No ideas yet. Jot down the first one, even if it's tiny."
            action={<Btn sm onClick={() => openAdd()}><Plus size={15} /> Add an idea</Btn>}
          />
        ) : (
          <div className={s.board}>
            {columns.map(({ st, items }) => {
              const meta = STATUS[st];
              const next = ORDER[ORDER.indexOf(st) + 1];
              return (
                <section key={st} className={s.column} style={{ ['--c' as string]: meta.color }} aria-labelledby={`col-${st}`}>
                  <header className={s.colHead}>
                    <h2 id={`col-${st}`} className={s.colTitle}><meta.Icon size={16} strokeWidth={2} /> {meta.label}</h2>
                    <span className={s.colCount}>{items.length}</span>
                    {st !== 'done' && (
                      <button type="button" className={s.colAdd} onClick={() => openAdd(st)} aria-label={`Add to ${meta.label}`}>
                        <Plus size={16} strokeWidth={2.25} />
                      </button>
                    )}
                  </header>

                  <div className={s.colBody}>
                    {loading ? (
                      [0, 1].map(i => <div key={i} className={`skeleton ${s.skel}`} />)
                    ) : items.length === 0 ? (
                      <p className={s.colEmpty}>{q ? 'No matches' : meta.empty}</p>
                    ) : items.map(idea => (
                      <article key={idea.id} className={`${s.card} ${st === 'done' ? s.cardDone : ''}`}>
                        <button type="button" className={s.cardMain} onClick={() => openEdit(idea)} aria-label={`Edit ${idea.title}`}>
                          <span className={s.cardTop}>
                            <span className={s.prio} style={{ background: PRIO_COLOR[idea.priority] }} title={`${PRIO_LABEL[idea.priority]} priority`} />
                            <span className={s.cardTitle}>{idea.title}</span>
                          </span>
                          {idea.body && <span className={s.cardBody}>{idea.body}</span>}
                          {(idea.tags?.length ?? 0) > 0 && (
                            <span className={s.cardTags}>{idea.tags.map(t => <Tag key={t} color="var(--pu-g)">{t}</Tag>)}</span>
                          )}
                        </button>
                        <div className={s.cardFoot}>
                          <span className={s.cardDate}>{fmtDate(idea.updated_at || idea.created_at)}</span>
                          <div className={s.cardActions}>
                            <button type="button" className={`${s.iconBtn} ${s.danger}`} onClick={() => setDelItem(idea)} aria-label={`Delete ${idea.title}`}>
                              <Trash2 size={15} strokeWidth={2} />
                            </button>
                            {next ? (
                              <button type="button" className={s.moveBtn} onClick={() => moveTo(idea, next)} title={`Move to ${STATUS[next].label}`}>
                                {STATUS[next].label} <ArrowRight size={14} strokeWidth={2.25} />
                              </button>
                            ) : (
                              <button type="button" className={s.moveBtn} onClick={() => moveTo(idea, 'doing')} title="Back to Doing">
                                <RotateCcw size={13} strokeWidth={2.25} /> Reopen
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <Modal onClose={() => !saving && setFormOpen(false)}>
          <ModalTitle>{editItem ? 'Edit idea' : 'New idea'}</ModalTitle>
          <FInput label="Title" value={form.title} onChange={v => set('title', v)} placeholder="What if…" />
          <FArea label="Details" value={form.body} onChange={v => set('body', v)} rows={4} placeholder="Get it out of your head" />

          <Lbl>Stage</Lbl>
          <div className={s.optRow} role="radiogroup" aria-label="Stage">
            {ORDER.map(st => {
              const m = STATUS[st];
              return (
                <button key={st} type="button" role="radio" aria-checked={form.status === st}
                  className={`${s.opt} ${form.status === st ? s.optOn : ''}`} style={{ ['--c' as string]: m.color }}
                  onClick={() => set('status', st)}>
                  <m.Icon size={14} strokeWidth={2} /> {m.label}
                </button>
              );
            })}
          </div>

          <Lbl>Priority</Lbl>
          <div className={s.optRow} role="radiogroup" aria-label="Priority">
            {PRIORITIES.map(p => (
              <button key={p} type="button" role="radio" aria-checked={form.priority === p}
                className={`${s.opt} ${form.priority === p ? s.optOn : ''}`} style={{ ['--c' as string]: PRIO_COLOR[p] }}
                onClick={() => set('priority', p)}>
                <span className={s.optDot} /> {PRIO_LABEL[p]}
              </button>
            ))}
          </div>

          <div className={s.field}>
            <Lbl>Tags</Lbl>
            <TagInput tags={form.tags} color="var(--pu-g)" onAdd={t => set('tags', [...form.tags, t])} onRemove={t => set('tags', form.tags.filter(x => x !== t))} />
          </div>
          <SoulLinkField souls={souls} value={soulIds} onChange={setSoulIds} />
          <ModalFooter onCancel={() => setFormOpen(false)} onSave={save} saveLabel={saving ? 'Saving' : editItem ? 'Save changes' : 'Save idea'} />
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.title}" will be deleted for good.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
