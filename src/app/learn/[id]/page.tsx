'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft, NotebookPen, Layers, Link2, Network, Pencil, Trash2, Plus, Heading, Bold, Italic, List, ListChecks, Link as LinkIcon,
  PlayCircle, Music, FileText, Globe, ExternalLink, X, Check, GraduationCap, Sliders, Undo2,
} from 'lucide-react';
import { Btn, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FArea, EmptyState, Toast, useToast } from '@/components/ui';
import Markdown from '@/components/ui/Markdown';
import {
  updateStudyNode, deleteStudyNode, addStudyNode, addStudyCard, updateStudyCard, deleteStudyCard,
  addStudyResource, deleteStudyResource, addStudyLink, deleteStudyLink, getStudyReviews, type DbStudyCard, type DbStudyNode, type DbStudyReview,
} from '@/lib/db';
import {
  SUBJECT_COLORS, pathTo, subjectOf, subtreeIds, masteryLabel, isDue, fmtInterval, linkKind, linkHost, normaliseUrl,
} from '@/lib/study';
import { wasCorrect } from '@/lib/answerCheck';
import { useStudy } from '../useStudy';
import s from '../learn.module.css';

type Tab = 'notes' | 'cards' | 'links' | 'related';

const KIND_ICON = { video: PlayCircle, music: Music, doc: FileText, link: Globe };

function dueLabel(c: DbStudyCard, now: number) {
  if (c.reps === 0 && !c.last_reviewed_at) return 'New';
  const ms = Date.parse(c.due_at) - now;
  if (ms <= 0) return 'Due now';
  return `Due in ${fmtInterval(ms / 864e5)}`;
}

/** Wraps the selection in the notes box with markdown, or starts a line with it. */
function applyFormat(ta: HTMLTextAreaElement, kind: 'h' | 'b' | 'i' | 'ul' | 'check' | 'link'): { value: string; caret: [number, number] } {
  const { value, selectionStart: a, selectionEnd: b } = ta;
  const sel = value.slice(a, b);
  const wrap = (l: string, r = l, ph = 'text') => {
    const inner = sel || ph;
    return { value: value.slice(0, a) + l + inner + r + value.slice(b), caret: [a + l.length, a + l.length + inner.length] as [number, number] };
  };
  if (kind === 'b') return wrap('**');
  if (kind === 'i') return wrap('*');
  if (kind === 'link') {
    const inner = sel || 'link text';
    const v = `${value.slice(0, a)}[${inner}](https://)${value.slice(b)}`;
    const at = a + inner.length + 3;
    return { value: v, caret: [at, at + 8] };
  }
  const prefix = kind === 'h' ? '## ' : kind === 'ul' ? '- ' : '- [ ] ';
  const lineStart = value.lastIndexOf('\n', a - 1) + 1;
  const v = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  return { value: v, caret: [a + prefix.length, b + prefix.length] };
}

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [toast, show] = useToast();
  const onError = useCallback((m: string) => show(m, 'var(--red)'), [show]);
  const { nodes, setNodes, links, setLinks, cards, setCards, resources, setResources, tree, stats, loading, missing } = useStudy(onError);

  const node = tree.byId.get(id) ?? null;
  const [tab, setTab] = useState<Tab>('notes');
  const [now] = useState(() => Date.now());

  // header fields (saved when she leaves the box)
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (node && loadedFor !== `${node.id}:${node.updated_at}`) {
    setLoadedFor(`${node.id}:${node.updated_at}`);
    setTitle(node.title);
    setSummary(node.summary ?? '');
  }

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const [editCard, setEditCard] = useState<DbStudyCard | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [relQuery, setRelQuery] = useState('');
  const [newSub, setNewSub] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviews, setReviews] = useState<DbStudyReview[]>([]);

  // Answers from the last 8 weeks, for accuracy over time
  useEffect(() => {
    getStudyReviews(new Date(now - 56 * 864e5).toISOString()).then(setReviews).catch(() => {});
  }, [now]);

  const path = node ? pathTo(tree, node.id) : [];
  const subject = node ? subjectOf(tree, node.id) : null;
  const color = subject?.color ?? SUBJECT_COLORS[0];
  const st = node ? stats.get(node.id) : undefined;
  const ownCards = useMemo(() => cards.filter(c => c.node_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)), [cards, id]);
  const ownDue = ownCards.filter(c => isDue(c, now)).length;
  const ownLinks = resources.filter(r => r.node_id === id);
  const subs = node ? tree.children.get(node.id) ?? [] : [];
  const related = links.filter(l => l.from_id === id || l.to_id === id);
  const scope = node ? subtreeIds(tree, node.id) : new Set<string>();
  const mine = reviews.filter(r => r.node_id && scope.has(r.node_id));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * 864e5, start = end - 7 * 864e5;
    const wk = mine.filter(r => { const t = Date.parse(r.reviewed_at); return t > start && t <= end; });
    return { n: wk.length, pct: wk.length ? Math.round((wk.filter(wasCorrect).length / wk.length) * 100) : null, label: i === 7 ? 'This week' : `${7 - i}w ago` };
  });
  const recent = mine.filter(r => Date.parse(r.reviewed_at) > now - 30 * 864e5);
  const recentPct = recent.length ? Math.round((recent.filter(wasCorrect).length / recent.length) * 100) : null;

  // Cmd/Ctrl+S saves notes while editing
  const saveNotesRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editingNotes) { e.preventDefault(); saveNotesRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingNotes]);

  const patchNode = async (u: Partial<DbStudyNode>, msg?: string) => {
    if (!node) return;
    const before = nodes;
    setNodes(l => l.map(n => (n.id === node.id ? { ...n, ...u } : n)));
    try { await updateStudyNode(node.id, u); if (msg) show(msg); }
    catch { setNodes(before); show('Could not save that.', 'var(--red)'); }
  };

  const saveHeader = () => {
    if (!node) return;
    const t = title.trim();
    const u: Partial<DbStudyNode> = {};
    if (t && t !== node.title) u.title = t;
    if ((summary.trim() || null) !== (node.summary ?? null)) u.summary = summary.trim() || null;
    if (!t) setTitle(node.title);
    if (Object.keys(u).length) patchNode(u);
  };

  const startNotes = () => {
    setNotesDraft(node?.notes ?? '');
    setEditingNotes(true);
    requestAnimationFrame(() => notesRef.current?.focus());
  };
  const saveNotes = async () => {
    await patchNode({ notes: notesDraft.trim() ? notesDraft : null }, 'Notes saved');
    setEditingNotes(false);
  };
  useEffect(() => { saveNotesRef.current = saveNotes; });

  const format = (kind: Parameters<typeof applyFormat>[1]) => {
    const ta = notesRef.current;
    if (!ta) return;
    const r = applyFormat(ta, kind);
    setNotesDraft(r.value);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.caret[0], r.caret[1]); });
  };

  const toggleCheck = (lineIndex: number) => {
    if (!node?.notes) return;
    const lines = node.notes.replace(/\r\n/g, '\n').split('\n');
    lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, m => (m === '[ ]' ? '[x]' : '[ ]'));
    patchNode({ notes: lines.join('\n') });
  };

  // ── Flashcards ─────────────────────────────────────────
  const addCard = async () => {
    if (!front.trim() || !back.trim()) return;
    try {
      const c = await addStudyCard({ node_id: id, front: front.trim(), back: back.trim() });
      setCards(l => [...l, c]);
      setFront(''); setBack('');
      frontRef.current?.focus();
    } catch { show('Could not add that card.', 'var(--red)'); }
  };
  const saveCard = async () => {
    const c = editCard;
    if (!c || !c.front.trim() || !c.back.trim()) return;
    setEditCard(null);
    const before = cards;
    setCards(l => l.map(x => (x.id === c.id ? c : x)));
    try { await updateStudyCard(c.id, { front: c.front.trim(), back: c.back.trim() }); }
    catch { setCards(before); show('Could not save that card.', 'var(--red)'); }
  };
  const removeCard = async (c: DbStudyCard) => {
    const before = cards;
    setCards(l => l.filter(x => x.id !== c.id));
    setEditCard(null);
    try { await deleteStudyCard(c.id); } catch { setCards(before); show('Could not delete that card.', 'var(--red)'); }
  };

  // ── Links ──────────────────────────────────────────────
  const addLink = async () => {
    const url = normaliseUrl(linkUrl);
    if (!url) { show("That doesn't look like a web address.", 'var(--yellow)'); return; }
    try {
      const r = await addStudyResource({ node_id: id, url, title: linkTitle.trim() || null, sort_order: ownLinks.length });
      setResources(l => [...l, r]);
      setLinkUrl(''); setLinkTitle('');
    } catch { show('Could not add that link.', 'var(--red)'); }
  };
  const removeLink = async (rid: string) => {
    const before = resources;
    setResources(l => l.filter(x => x.id !== rid));
    try { await deleteStudyResource(rid); } catch { setResources(before); show('Could not remove that link.', 'var(--red)'); }
  };

  // ── Related ────────────────────────────────────────────
  const addSub = async () => {
    const t = newSub.trim();
    if (!t || !node) return;
    try {
      const n = await addStudyNode({ title: t, parent_id: node.id, sort_order: subs.length });
      setNodes(l => [...l, n]);
      setNewSub('');
    } catch { show('Could not add that topic.', 'var(--red)'); }
  };
  const linkTo = async (other: DbStudyNode) => {
    setRelQuery('');
    if (related.some(l => l.from_id === other.id || l.to_id === other.id)) return;
    try { const l = await addStudyLink(id, other.id); setLinks(x => [...x, l]); show(`Linked to ${other.title}`); }
    catch { show('Could not link those.', 'var(--red)'); }
  };
  const unlink = async (lid: string) => {
    const before = links;
    setLinks(l => l.filter(x => x.id !== lid));
    try { await deleteStudyLink(lid); } catch { setLinks(before); show('Could not remove that link.', 'var(--red)'); }
  };
  const q = relQuery.trim().toLowerCase();
  const own = node ? subtreeIds(tree, node.id) : new Set<string>();
  const candidates = q
    ? nodes.filter(n => !own.has(n.id) && n.id !== node?.parent_id && n.title.toLowerCase().includes(q) && !related.some(l => l.from_id === n.id || l.to_id === n.id)).slice(0, 6)
    : [];

  const doDelete = async () => {
    if (!node) return;
    setConfirmDelete(false);
    try {
      await deleteStudyNode(node.id);
      router.push(node.parent_id ? `/learn/${node.parent_id}` : '/learn');
    } catch { show('Could not delete that.', 'var(--red)'); }
  };

  const TABS: { key: Tab; label: string; Icon: typeof NotebookPen; count?: number }[] = [
    { key: 'notes', label: 'Notes', Icon: NotebookPen },
    { key: 'cards', label: 'Flashcards', Icon: Layers, count: ownCards.length },
    { key: 'links', label: 'Links', Icon: Link2, count: ownLinks.length },
    { key: 'related', label: 'Related', Icon: Network, count: subs.length + related.length },
  ];

  if (!loading && (missing || !node)) {
    return (
      <div className={s.page}>
        <Topbar title="Learn" maxWidth={900} action={<Link href="/learn" className={s.backBtn}><ChevronLeft size={16} /> Study map</Link>} />
        <div className={`${s.wrap} ${s.wrapNarrow}`}>
          <EmptyState icon={<GraduationCap size={26} />} msg={missing ? 'Learn needs a quick database update first. See DEPLOY.md.' : "This topic isn't here any more. It may have been deleted on another device."} action={<Btn sm onClick={() => router.push('/learn')}>Back to the study map</Btn>} />
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Topbar
        title={node?.title ?? 'Topic'}
        sub={path.length > 1 ? path.slice(0, -1).map(n => n.title).join(' › ') : node ? 'Subject' : 'Loading'}
        maxWidth={900}
        action={<Link href="/learn" className={s.backBtn}><ChevronLeft size={16} /> Study map</Link>}
      />

      <div className={`${s.wrap} ${s.wrapNarrow}`}>
        {loading || !node ? (
          <div className={`skeleton ${s.skelMap}`} />
        ) : (
          <>
            <section className={s.head} style={{ ['--c' as string]: color }}>
              <div className={s.headMain}>
                {path.length > 1 && (
                  <nav className={s.crumbNav} aria-label="Where this sits">
                    {path.slice(0, -1).map(n => <Link key={n.id} href={`/learn/${n.id}`}>{n.title}</Link>)}
                  </nav>
                )}
                <input className={s.titleInput} value={title} onChange={e => setTitle(e.target.value)} onBlur={saveHeader} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="Topic name" />
                <textarea className={s.summaryInput} value={summary} onChange={e => setSummary(e.target.value)} onBlur={saveHeader} rows={2} placeholder="In a sentence: what is this topic about?" aria-label="Summary" />
              </div>
              <div className={s.headSide}>
                <div className={s.ringBig} style={{ ['--m' as string]: `${st?.mastery ?? 0}%` }}>
                  <span>{st?.mastery != null ? `${st.mastery}%` : '–'}</span>
                </div>
                <b>{masteryLabel(st?.mastery ?? null)}</b>
                <small>{st?.manual ? 'Set by you' : st?.cards ? 'From your flashcards' : 'Add flashcards to track this'}</small>
                <button type="button" className={s.linkBtn} onClick={() => setShowOverride(v => !v)}><Sliders size={13} /> {showOverride ? 'Done' : 'Set it myself'}</button>
                {showOverride && (
                  <div className={s.override}>
                    <input type="range" min={0} max={100} step={5} value={node.mastery_override ?? st?.mastery ?? 0} onChange={e => patchNode({ mastery_override: Number(e.target.value) })} aria-label="How well you know this" />
                    {node.mastery_override != null && <button type="button" className={s.linkBtn} onClick={() => patchNode({ mastery_override: null }, 'Back to automatic')}><Undo2 size={13} /> Automatic</button>}
                  </div>
                )}
              </div>
            </section>

            <div className={s.tabs} role="tablist">
              {TABS.map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`} onClick={() => setTab(t.key)}>
                  <t.Icon size={15} /> {t.label}{t.count ? <span className={s.tabCount}>{t.count}</span> : null}
                </button>
              ))}
            </div>

            {tab === 'notes' && (
              <section className={s.panel}>
                {editingNotes ? (
                  <>
                    <div className={s.fmtBar} role="toolbar" aria-label="Formatting">
                      <button type="button" onClick={() => format('h')} aria-label="Heading"><Heading size={16} /></button>
                      <button type="button" onClick={() => format('b')} aria-label="Bold"><Bold size={16} /></button>
                      <button type="button" onClick={() => format('i')} aria-label="Italic"><Italic size={16} /></button>
                      <button type="button" onClick={() => format('ul')} aria-label="Bullet list"><List size={16} /></button>
                      <button type="button" onClick={() => format('check')} aria-label="Checklist"><ListChecks size={16} /></button>
                      <button type="button" onClick={() => format('link')} aria-label="Link"><LinkIcon size={16} /></button>
                    </div>
                    <textarea ref={notesRef} className={s.notesArea} value={notesDraft} onChange={e => setNotesDraft(e.target.value)} placeholder={'## Key ideas\n- Short-term memory holds about 7 things\n- [ ] Re-read chapter 4'} />
                    <div className={s.rowEnd}>
                      <button type="button" className={s.ghostBtn} onClick={() => setEditingNotes(false)}>Cancel</button>
                      <Btn onClick={saveNotes}><Check size={16} /> Save notes</Btn>
                    </div>
                  </>
                ) : node.notes ? (
                  <>
                    <Markdown text={node.notes} onToggle={toggleCheck} />
                    <div className={s.rowEnd}><button type="button" className={s.ghostBtn} onClick={startNotes}><Pencil size={15} /> Edit notes</button></div>
                  </>
                ) : (
                  <div className={s.blank}>
                    <p>No notes yet. Headings, bullet points and checklists all work.</p>
                    <Btn sm onClick={startNotes}><Pencil size={15} /> Write notes</Btn>
                  </div>
                )}
              </section>
            )}

            {tab === 'cards' && (
              <section className={s.panel}>
                <div className={s.cardsHead}>
                  <p>{ownCards.length ? `${ownCards.length} ${ownCards.length === 1 ? 'card' : 'cards'}${ownDue ? `, ${ownDue} due` : ', none due'}` : 'Make a card for each thing worth remembering.'}</p>
                  {ownCards.length > 0 && (
                    <Link href={`/learn/review?node=${id}&all=1`} className={s.primaryLink}><Layers size={16} /> Study {subs.length ? 'this topic' : 'these'}</Link>
                  )}
                </div>
                {mine.length > 0 && (
                  <div className={s.accBox}>
                    <div className={s.accHead}>
                      <b>{recentPct != null ? `${recentPct}% right` : 'No answers this month'}</b>
                      <span>{recent.length ? `last 30 days, ${recent.length} ${recent.length === 1 ? 'answer' : 'answers'}${subs.length ? ' (with the topics inside)' : ''}` : ''}</span>
                    </div>
                    <div className={s.accBars} role="img" aria-label={`Accuracy by week: ${weeks.map(w => (w.pct == null ? 'no answers' : `${w.pct}%`)).join(', ')}`}>
                      {weeks.map((w, i) => (
                        <div key={i} className={s.accCol} title={w.pct == null ? `${w.label}: no answers` : `${w.label}: ${w.pct}% of ${w.n}`}>
                          <span className={s.accBar} style={{ height: `${w.pct == null ? 0 : Math.max(6, w.pct)}%` }} data-empty={w.pct == null || undefined} />
                          <small>{i === 7 ? 'Now' : i % 2 === 1 ? `${7 - i}w` : ''}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <form className={s.newCard} onSubmit={e => { e.preventDefault(); addCard(); }}>
                  <label><span>Question</span><textarea ref={frontRef} value={front} onChange={e => setFront(e.target.value)} rows={2} placeholder="What does the hippocampus do?" /></label>
                  <label><span>Answer</span><textarea value={back} onChange={e => setBack(e.target.value)} rows={2} placeholder="Turns short-term memories into long-term ones" onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addCard(); }} /></label>
                  <div className={s.rowEnd}><Btn type="submit" disabled={!front.trim() || !back.trim()}><Plus size={16} /> Add card</Btn></div>
                </form>
                <ul className={s.cardList}>
                  {ownCards.map(c => (
                    <li key={c.id} className={s.cardItem}>
                      <button type="button" className={s.cardBody} onClick={() => setEditCard({ ...c })} aria-label={`Edit card: ${c.front}`}>
                        <b>{c.front}</b>
                        <span>{c.back}</span>
                      </button>
                      <span className={`${s.cardDue} ${isDue(c, now) ? s.cardDueNow : ''}`}>{dueLabel(c, now)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tab === 'links' && (
              <section className={s.panel}>
                <form className={s.newLink} onSubmit={e => { e.preventDefault(); addLink(); }}>
                  <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="Paste a link: a lecture, an article, a study playlist" aria-label="Link" inputMode="url" />
                  <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Name (optional)" aria-label="Name" />
                  <Btn type="submit" disabled={!linkUrl.trim()}><Plus size={16} /> Add</Btn>
                </form>
                {ownLinks.length === 0 ? (
                  <p className={s.blankLine}>Links open in their own app, so a Spotify playlist opens in Spotify and a YouTube lecture in YouTube.</p>
                ) : (
                  <ul className={s.linkList}>
                    {ownLinks.map(r => {
                      const Icon = KIND_ICON[linkKind(r.url)];
                      return (
                        <li key={r.id}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className={s.linkRow}>
                            <span className={`${s.linkIcon} ${s[`k_${linkKind(r.url)}`]}`}><Icon size={17} /></span>
                            <span className={s.linkText}><b>{r.title || linkHost(r.url)}</b><small>{linkHost(r.url)}</small></span>
                            <ExternalLink size={14} />
                          </a>
                          <button type="button" className={s.iconBtn} onClick={() => removeLink(r.id)} aria-label={`Remove ${r.title || linkHost(r.url)}`}><X size={15} /></button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {tab === 'related' && (
              <section className={s.panel}>
                <h3 className={s.panelH}>Topics inside {node.title}</h3>
                {subs.length > 0 && (
                  <ul className={s.relList}>
                    {subs.map(n => {
                      const ss = stats.get(n.id);
                      return (
                        <li key={n.id}>
                          <Link href={`/learn/${n.id}`} className={s.relRow} style={{ ['--c' as string]: color }}>
                            <span className={s.oDot} /> <b>{n.title}</b>
                            <span className={s.oBar}><span style={{ width: `${ss?.mastery ?? 0}%` }} /></span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <form className={s.inlineAdd} onSubmit={e => { e.preventDefault(); addSub(); }}>
                  <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Add a topic inside this one" aria-label="New topic" />
                  <Btn type="submit" sm disabled={!newSub.trim()}><Plus size={15} /> Add</Btn>
                </form>

                <h3 className={s.panelH}>Linked to</h3>
                {related.length > 0 && (
                  <ul className={s.relList}>
                    {related.map(l => {
                      const other = tree.byId.get(l.from_id === id ? l.to_id : l.from_id);
                      if (!other) return null;
                      const where = pathTo(tree, other.id).slice(0, -1).map(n => n.title).join(' › ');
                      return (
                        <li key={l.id} className={s.relLinked}>
                          <Link href={`/learn/${other.id}`} className={s.relRow} style={{ ['--c' as string]: subjectOf(tree, other.id)?.color ?? color }}>
                            <span className={s.oDot} /> <b>{other.title}</b>{where && <small>{where}</small>}
                          </Link>
                          <button type="button" className={s.iconBtn} onClick={() => unlink(l.id)} aria-label={`Unlink ${other.title}`}><X size={15} /></button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className={s.relSearch}>
                  <input value={relQuery} onChange={e => setRelQuery(e.target.value)} placeholder="Link a related topic from any subject" aria-label="Find a topic to link" />
                  {candidates.length > 0 && (
                    <ul className={s.relDrop}>
                      {candidates.map(n => (
                        <li key={n.id}>
                          <button type="button" onClick={() => linkTo(n)}>
                            <b>{n.title}</b>
                            <small>{pathTo(tree, n.id).slice(0, -1).map(x => x.title).join(' › ') || 'Subject'}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            <div className={s.footRow}>
              <button type="button" className={`${s.ghostBtn} ${s.danger}`} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete {node.parent_id ? 'topic' : 'subject'}</button>
            </div>
          </>
        )}
      </div>

      {editCard && (
        <Modal onClose={() => setEditCard(null)}>
          <ModalTitle>Edit card</ModalTitle>
          <FArea label="Question" value={editCard.front} onChange={v => setEditCard({ ...editCard, front: v })} rows={3} />
          <FArea label="Answer" value={editCard.back} onChange={v => setEditCard({ ...editCard, back: v })} rows={3} />
          <div className={s.modalRow}>
            <button type="button" className={`${s.ghostBtn} ${s.danger}`} onClick={() => removeCard(editCard)}><Trash2 size={15} /> Delete card</button>
          </div>
          <ModalFooter onCancel={() => setEditCard(null)} onSave={saveCard} saveLabel="Save card" />
        </Modal>
      )}
      {confirmDelete && node && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <Confirm msg={`Delete "${node.title}"${subs.length ? ' and every topic inside it' : ''}, with its notes, links and ${st?.cards ?? 0} flashcards? This can't be undone.`} onConfirm={doDelete} onCancel={() => setConfirmDelete(false)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}

