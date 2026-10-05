'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  GraduationCap, Plus, Network, ListTree, Layers, Link2, Trash2, ChevronRight, ChevronDown, ArrowRight, Wand2, X, BookOpen, Footprints,
} from 'lucide-react';
import { Btn, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, EmptyState, Toast, useToast } from '@/components/ui';
import { addStudyNode, updateStudyNode, deleteStudyNode, addStudyLink, deleteStudyLink, type DbStudyNode } from '@/lib/db';
import { SUBJECT_COLORS, masteryLabel, pathTo, subjectOf, subtreeIds, type Pt } from '@/lib/study';
import { useStudy } from './useStudy';
import StudyMap from './StudyMap';
import s from './learn.module.css';

type ViewMode = 'map' | 'outline';
const VIEW_KEY = 'yw-learn-view';

function readView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'outline' ? 'outline' : 'map'; } catch { return 'map'; }
}

/** A row in the outline, with its sub-topics underneath. */
function OutlineRow({ node, depth, ctx }: { node: DbStudyNode; depth: number; ctx: OutlineCtx }) {
  const kids = ctx.tree.children.get(node.id) ?? [];
  const open = !ctx.collapsed.has(node.id);
  const st = ctx.stats.get(node.id);
  const subject = depth === 0;
  return (
    <li className={s.oItem}>
      <div className={`${s.oRow} ${subject ? s.oSubject : ''}`} style={{ ['--c' as string]: ctx.colorOf(node.id), ['--d' as string]: depth }}>
        {kids.length ? (
          <button type="button" className={s.oToggle} onClick={() => ctx.toggle(node.id)} aria-expanded={open} aria-label={open ? `Fold ${node.title}` : `Unfold ${node.title}`}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : <span className={s.oToggle} aria-hidden><span className={s.oDot} /></span>}
        <Link href={`/learn/${node.id}`} className={s.oTitle}>
          <span>{node.title}</span>
          {st?.cards ? <small>{st.cards} {st.cards === 1 ? 'card' : 'cards'}{st.due ? `, ${st.due} due` : ''}</small> : null}
        </Link>
        <span className={s.oBar} title={masteryLabel(st?.mastery ?? null)}><span style={{ width: `${st?.mastery ?? 0}%` }} /></span>
        <button type="button" className={s.oAdd} onClick={() => ctx.addChild(node)} aria-label={`Add a topic under ${node.title}`}><Plus size={15} /></button>
      </div>
      {open && kids.length > 0 && (
        <ul className={s.oList}>
          {kids.map(k => <OutlineRow key={k.id} node={k} depth={depth + 1} ctx={ctx} />)}
        </ul>
      )}
    </li>
  );
}

interface OutlineCtx {
  tree: ReturnType<typeof useStudy>['tree'];
  stats: ReturnType<typeof useStudy>['stats'];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  colorOf: (id: string) => string;
  addChild: (n: DbStudyNode) => void;
}

export default function LearnPage() {
  const router = useRouter();
  const [toast, show] = useToast();
  const onError = useCallback((m: string) => show(m, 'var(--red)'), [show]);
  const { nodes, setNodes, links, setLinks, tree, stats, loading, missing } = useStudy(onError);

  // Safe to read the window here: nothing that depends on these shows until the data has loaded.
  const [view, setViewState] = useState<ViewMode>(() => (typeof window === 'undefined' ? 'map' : readView()));
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ parent: DbStudyNode | null; title: string; color: string } | null>(null);
  const [delItem, setDelItem] = useState<DbStudyNode | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(mq.matches);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const mode: ViewMode = phone ? 'outline' : view;
  const setView = (v: ViewMode) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  const subjects = useMemo(() => tree.children.get(null) ?? [], [tree]);
  const colorOf = useCallback((id: string) => {
    const subj = subjectOf(tree, id);
    if (!subj) return SUBJECT_COLORS[0];
    return subj.color ?? SUBJECT_COLORS[(tree.children.get(null) ?? []).findIndex(x => x.id === subj.id) % SUBJECT_COLORS.length];
  }, [tree]);

  const totalDue = useMemo(() => subjects.reduce((a, x) => a + (stats.get(x.id)?.due ?? 0), 0), [subjects, stats]);
  const totalCards = useMemo(() => subjects.reduce((a, x) => a + (stats.get(x.id)?.cards ?? 0), 0), [subjects, stats]);
  const sel = selected ? tree.byId.get(selected) ?? null : null;
  const selStats = sel ? stats.get(sel.id) : null;
  const selLinks = sel ? links.filter(l => l.from_id === sel.id || l.to_id === sel.id) : [];

  // ── Changes ────────────────────────────────────────────
  const openAdd = (parent: DbStudyNode | null) => {
    setAdding({ parent, title: '', color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length] });
  };

  const saveAdd = async () => {
    if (!adding?.title.trim()) return;
    const parent = adding.parent;
    const siblings = tree.children.get(parent?.id ?? null) ?? [];
    try {
      const n = await addStudyNode({
        title: adding.title.trim(), parent_id: parent?.id ?? null, sort_order: siblings.length,
        color: parent ? null : adding.color,
      });
      setNodes(l => [...l, n]);
      setAdding(null);
      setSelected(n.id);
      if (parent) setCollapsed(c => { const x = new Set(c); x.delete(parent.id); return x; });
      show(parent ? `Added under ${parent.title}` : 'Subject added');
    } catch { show('Could not add that.', 'var(--red)'); }
  };

  const move = async (id: string, p: Pt) => {
    const before = nodes;
    setNodes(l => l.map(n => (n.id === id ? { ...n, pos_x: p.x, pos_y: p.y } : n)));
    try { await updateStudyNode(id, { pos_x: p.x, pos_y: p.y }); }
    catch { setNodes(before); show('Could not move that.', 'var(--red)'); }
  };

  const tidy = async (subjectId: string) => {
    const ids = [...subtreeIds(tree, subjectId)].filter(id => { const n = tree.byId.get(id); return n && n.pos_x != null && id !== subjectId; });
    if (!ids.length) { show('Already tidy'); return; }
    setNodes(l => l.map(n => (ids.includes(n.id) ? { ...n, pos_x: null, pos_y: null } : n)));
    try { await Promise.all(ids.map(id => updateStudyNode(id, { pos_x: null, pos_y: null }))); show('Tidied up'); }
    catch { show('Could not tidy everything.', 'var(--red)'); }
  };

  const pickForLink = async (id: string) => {
    if (!linkFrom) return;
    const from = linkFrom;
    setLinkFrom(null);
    if (id === from) return;
    if (links.some(l => (l.from_id === from && l.to_id === id) || (l.from_id === id && l.to_id === from))) { show('Those are already linked'); return; }
    try {
      const l = await addStudyLink(from, id);
      setLinks(x => [...x, l]);
      show(`Linked to ${tree.byId.get(id)?.title ?? 'that topic'}`);
    } catch { show('Could not link those.', 'var(--red)'); }
  };

  const unlink = async (linkId: string) => {
    const before = links;
    setLinks(l => l.filter(x => x.id !== linkId));
    try { await deleteStudyLink(linkId); } catch { setLinks(before); show('Could not remove that link.', 'var(--red)'); }
  };

  const doDelete = async () => {
    const item = delItem;
    if (!item) return;
    setDelItem(null);
    const gone = subtreeIds(tree, item.id);
    const before = nodes;
    setNodes(l => l.filter(n => !gone.has(n.id)));
    setSelected(null);
    try { await deleteStudyNode(item.id); show('Deleted'); }
    catch { setNodes(before); show('Could not delete that.', 'var(--red)'); }
  };

  const delCount = delItem ? subtreeIds(tree, delItem.id).size - 1 : 0;
  const delCards = delItem ? stats.get(delItem.id)?.cards ?? 0 : 0;

  const outlineCtx: OutlineCtx = {
    tree, stats, collapsed, colorOf, addChild: n => openAdd(n),
    toggle: id => setCollapsed(c => { const x = new Set(c); if (x.has(id)) x.delete(id); else x.add(id); return x; }),
  };

  return (
    <div className={s.page}>
      <Topbar
        title="Learn"
        maxWidth={1240}
        sub={loading ? 'Loading your study map' : subjects.length ? `${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}, ${totalCards} ${totalCards === 1 ? 'card' : 'cards'}${totalDue ? `, ${totalDue} due` : ''}` : 'Your subjects, topics, notes and flashcards'}
        action={
          <div className={s.topActions}>
            {totalDue > 0 && <Link href="/learn/review" className={s.reviewBtn}><Layers size={16} /> Review {totalDue}</Link>}
            {totalCards > 0 && <Link href="/go" className={s.backBtn}><Footprints size={16} /> On the Go</Link>}
            <Btn onClick={() => openAdd(null)}><Plus size={16} strokeWidth={2.25} /> New subject</Btn>
          </div>
        }
      />

      <div className={`${s.wrap} ${s.wrapWide}`}>
        {loading ? (
          <div className={`skeleton ${s.skelMap}`} />
        ) : missing ? (
          <EmptyState icon={<GraduationCap size={26} />} msg="Learn needs a quick database update before it can be used. See DEPLOY.md." />
        ) : subjects.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={26} />}
            msg="Start with a subject, like Psychology or Spanish. Then add topics around it, with notes and flashcards in each."
            action={<Btn sm onClick={() => openAdd(null)}><Plus size={15} /> Add a subject</Btn>}
          />
        ) : (
          <>
            {!phone && (
              <div className={s.toolbar}>
                <div className={s.viewSwitch} role="tablist" aria-label="View">
                  <button type="button" role="tab" aria-selected={mode === 'map'} className={mode === 'map' ? s.viewOn : ''} onClick={() => setView('map')}><Network size={16} /> Map</button>
                  <button type="button" role="tab" aria-selected={mode === 'outline'} className={mode === 'outline' ? s.viewOn : ''} onClick={() => setView('outline')}><ListTree size={16} /> Outline</button>
                </div>
                {mode === 'map' && <p className={s.mapTip}>Drag to move around. Tap a topic to select it, tap again to open it.</p>}
              </div>
            )}

            {mode === 'map' ? (
              <div className={s.mapGrid}>
                <div className={s.mapCol}>
                  {linkFrom && (
                    <div className={s.linkBanner} role="status">
                      <span>Tap the topic to link <b>{tree.byId.get(linkFrom)?.title}</b> to.</span>
                      <button type="button" className={s.linkBtn} onClick={() => setLinkFrom(null)}>Cancel</button>
                    </div>
                  )}
                  <StudyMap
                    tree={tree}
                    stats={stats}
                    links={links}
                    colorOf={colorOf}
                    selectedId={selected}
                    linkFrom={linkFrom}
                    onSelect={id => { if (linkFrom && id) pickForLink(id); else setSelected(id); }}
                    onOpen={id => { if (linkFrom) pickForLink(id); else router.push(`/learn/${id}`); }}
                    onMove={move}
                  />
                </div>

                <aside className={s.side} aria-label="Selected topic">
                  {sel ? (
                    <>
                      <p className={s.crumbs}>{pathTo(tree, sel.id).slice(0, -1).map(n => n.title).join(' › ') || 'Subject'}</p>
                      <h2 className={s.sideTitle} style={{ ['--c' as string]: colorOf(sel.id) }}>{sel.title}</h2>
                      {sel.summary && <p className={s.sideSummary}>{sel.summary}</p>}
                      <div className={s.sideStats}>
                        <div className={s.ring} style={{ ['--m' as string]: `${selStats?.mastery ?? 0}%`, ['--c' as string]: colorOf(sel.id) }}>
                          <span>{selStats?.mastery != null ? `${selStats.mastery}%` : '–'}</span>
                        </div>
                        <div>
                          <b>{masteryLabel(selStats?.mastery ?? null)}</b>
                          <small>{selStats?.cards ? `${selStats.cards} cards${selStats.due ? `, ${selStats.due} due` : ''}` : 'No flashcards yet'}</small>
                        </div>
                      </div>
                      <div className={s.sideActions}>
                        <Link href={`/learn/${sel.id}`} className={s.primaryLink}><BookOpen size={16} /> Open</Link>
                        {!!selStats?.due && <Link href={`/learn/review?node=${sel.id}`} className={s.ghostBtn}><Layers size={15} /> Review {selStats.due}</Link>}
                        <button type="button" className={s.ghostBtn} onClick={() => openAdd(sel)}><Plus size={15} /> Add topic</button>
                        <button type="button" className={s.ghostBtn} onClick={() => setLinkFrom(sel.id)}><Link2 size={15} /> Link to…</button>
                        {!sel.parent_id && <button type="button" className={s.ghostBtn} onClick={() => tidy(sel.id)}><Wand2 size={15} /> Tidy up</button>}
                        <button type="button" className={`${s.ghostBtn} ${s.danger}`} onClick={() => setDelItem(sel)}><Trash2 size={15} /> Delete</button>
                      </div>
                      {selLinks.length > 0 && (
                        <div className={s.sideLinks}>
                          <p className={s.sideH}>Linked topics</p>
                          {selLinks.map(l => {
                            const other = tree.byId.get(l.from_id === sel.id ? l.to_id : l.from_id);
                            if (!other) return null;
                            return (
                              <div key={l.id} className={s.sideLink}>
                                <button type="button" onClick={() => setSelected(other.id)} style={{ ['--c' as string]: colorOf(other.id) }}><span className={s.oDot} /> {other.title}</button>
                                <button type="button" className={s.iconBtn} onClick={() => unlink(l.id)} aria-label={`Unlink ${other.title}`}><X size={14} /></button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={s.sideEmpty}>
                      <Network size={22} />
                      <p>Tap a subject or topic to see how well you know it, add topics under it, or link it to something related.</p>
                      <div className={s.legend}>
                        <span><i className={s.legBranch} /> Part of</span>
                        <span><i className={s.legLink} /> Linked to</span>
                      </div>
                      {totalDue > 0 && <Link href="/learn/review" className={s.primaryLink}><Layers size={16} /> Review {totalDue} due <ArrowRight size={15} /></Link>}
                    </div>
                  )}
                </aside>
              </div>
            ) : (
              <ul className={s.outline}>
                {subjects.map(n => <OutlineRow key={n.id} node={n} depth={0} ctx={outlineCtx} />)}
                <li><button type="button" className={s.oNew} onClick={() => openAdd(null)}><Plus size={15} /> New subject</button></li>
              </ul>
            )}
          </>
        )}
      </div>

      {adding && (
        <Modal onClose={() => setAdding(null)}>
          <ModalTitle>{adding.parent ? `New topic in ${adding.parent.title}` : 'New subject'}</ModalTitle>
          <form onSubmit={e => { e.preventDefault(); saveAdd(); }}>
            <FInput label={adding.parent ? 'Topic' : 'Subject'} value={adding.title} onChange={v => setAdding({ ...adding, title: v })} placeholder={adding.parent ? 'Memory and forgetting' : 'Psychology'} />
          </form>
          {!adding.parent && (
            <div className={s.colorPick} role="radiogroup" aria-label="Colour">
              {SUBJECT_COLORS.map(c => (
                <button key={c} type="button" role="radio" aria-checked={adding.color === c} aria-label={`Colour ${c}`} className={`${s.swatch} ${adding.color === c ? s.swatchOn : ''}`} style={{ ['--c' as string]: c }} onClick={() => setAdding({ ...adding, color: c })} />
              ))}
            </div>
          )}
          <ModalFooter onCancel={() => setAdding(null)} onSave={saveAdd} saveLabel={adding.parent ? 'Add topic' : 'Add subject'} />
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm
            msg={`Delete "${delItem.title}"${delCount ? `, its ${delCount} ${delCount === 1 ? 'topic' : 'topics'}` : ''}${delCards ? ` and ${delCards} ${delCards === 1 ? 'flashcard' : 'flashcards'}` : ''}? This can't be undone.`}
            onConfirm={doDelete}
            onCancel={() => setDelItem(null)}
          />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
