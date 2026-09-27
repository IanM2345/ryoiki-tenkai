'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Trash2, Pin, AtSign, Check, Loader2 } from 'lucide-react';
import s from '../journal.module.css';
import { Btn, Lbl, TagInput, Toggle, Modal, Confirm, Toast, useToast } from '@/components/ui';
import {
  getJournalEntry, addJournalEntry, updateJournalEntry, deleteJournalEntry,
  setJournalEntrySouls, getJournalEntrySoulIds, getSouls,
} from '@/lib/db';
import type { DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { localDateStr, localTimeStr, parseLocalDate } from '@/lib/dates';
import { MOODS, wordCount } from '@/lib/journal';
import SoulAvatar from '@/components/souls/SoulAvatar';

interface Draft { title: string; body: string; mood: string; tags: string[]; pinned: boolean; souls: string[]; }
const EMPTY: Draft = { title: '', body: '', mood: '', tags: [], pinned: false, souls: [] };
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

export default function JournalEditorPage() {
  const router = useRouter();
  const id = useParams()?.id as string;
  const isNew = id === 'new';

  const [toast, show] = useToast();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving]   = useState(false);
  const [draft, setDraft]     = useState<Draft>(EMPTY);
  const [original, setOriginal] = useState<Draft>(EMPTY);
  const [entryDate, setEntryDate] = useState(localDateStr());
  const [entryTime, setEntryTime] = useState<string | null>(null);
  const [allSouls, setAllSouls] = useState<DbSoul[]>([]);
  const [showDel, setShowDel]   = useState(false);
  const [leaveTo, setLeaveTo]   = useState<string | null>(null);

  // @mention picker
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const dirty = !same(draft, original);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const souls = await getSouls().catch(() => [] as DbSoul[]);
        setAllSouls(souls);
        if (!isNew) {
          const [entry, soulIds] = await Promise.all([getJournalEntry(id), getJournalEntrySoulIds(id).catch(() => [])]);
          const d: Draft = {
            title: entry.title ?? '', body: entry.body ?? '', mood: entry.mood ?? '',
            tags: entry.tags ?? [], pinned: entry.pinned, souls: soulIds,
          };
          setDraft(d); setOriginal(d);
          setEntryDate(entry.entry_date);
          setEntryTime(entry.entry_time);
        }
      } catch {
        show('Could not open that entry.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, show]);

  // Auto-grow the writing area
  useEffect(() => {
    const ta = bodyRef.current; if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, 320)}px`;
  }, [draft.body, loading]);

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useCallback(async () => {
    if (saving || (!draft.title.trim() && !draft.body.trim())) return false;
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim() || 'Untitled',
        body: draft.body,
        mood: draft.mood || null,
        pinned: draft.pinned,
        tags: draft.tags,
        entry_date: entryDate,
        entry_time: entryTime ?? localTimeStr(),   // keep the original time when editing
      };
      if (isNew) {
        const created = await addJournalEntry(payload);
        await setJournalEntrySouls(created.id, draft.souls);
        setOriginal(draft);
        router.replace(`/journal/${created.id}`);
      } else {
        await updateJournalEntry(id, payload);
        await setJournalEntrySouls(id, draft.souls);
        setOriginal(draft);
      }
      setEntryTime(payload.entry_time);
      show('Saved');
      return true;
    } catch {
      show('Could not save. Your text is still here, so try again.', 'var(--red)');
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, draft, entryDate, entryTime, isNew, id, router, show]);

  // Ctrl/Cmd + S saves
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save]);

  const leave = (to: string) => { if (dirty) setLeaveTo(to); else router.push(to); };

  const doDelete = async () => {
    try { await deleteJournalEntry(id); setOriginal(draft); router.push('/journal'); }
    catch { setShowDel(false); show('Could not delete that entry.', 'var(--red)'); }
  };

  // ── @mentions ────────────────────────────────────────────
  const matches = useMemo(() => {
    if (mentionQ === null) return [];
    const q = mentionQ.toLowerCase();
    return allSouls.filter(x => x.name.toLowerCase().startsWith(q) || x.name.toLowerCase().includes(` ${q}`)).slice(0, 6);
  }, [mentionQ, allSouls]);

  const onBody = (val: string) => {
    set('body', val);
    const ta = bodyRef.current; if (!ta) return;
    const before = val.slice(0, ta.selectionStart ?? val.length);
    const at = before.lastIndexOf('@');
    const frag = at > -1 ? before.slice(at + 1) : '';
    const validStart = at > -1 && (at === 0 || /\s/.test(before[at - 1]));
    if (validStart && frag.length <= 24 && !frag.includes('\n')) { setMentionQ(frag); setMentionIdx(0); }
    else setMentionQ(null);
  };

  const insertSoul = (soul: DbSoul) => {
    const ta = bodyRef.current; if (!ta) return;
    const pos = ta.selectionStart ?? draft.body.length;
    const before = draft.body.slice(0, pos);
    const at = before.lastIndexOf('@');
    const next = draft.body.slice(0, at) + `@${soul.name} ` + draft.body.slice(pos);
    setDraft(d => ({ ...d, body: next, souls: d.souls.includes(soul.id) ? d.souls : [...d.souls, soul.id] }));
    setMentionQ(null);
    requestAnimationFrame(() => { ta.focus(); const p = at + soul.name.length + 2; ta.setSelectionRange(p, p); });
  };

  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQ === null || matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => (i - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertSoul(matches[mentionIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); setMentionQ(null); }
  };

  const linkedSouls = allSouls.filter(x => draft.souls.includes(x.id));
  const dateLabel = parseLocalDate(entryDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const words = wordCount(draft.body);

  if (loading) {
    return (
      <div className={s.editor}>
        <div className={s.editorInner}>
          <div className={`skeleton ${s.skelTitle}`} />
          <div className={`skeleton ${s.skelBody}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={s.editor}>
      <div className={s.editorBar}>
        <button type="button" className={s.backBtn} onClick={() => leave('/journal')}>
          <ArrowLeft size={18} strokeWidth={2} /> Journal
        </button>
        <div className={s.status} aria-live="polite">
          {saving ? <><Loader2 size={14} className="aSpin" /> Saving</>
            : dirty ? <><span className={s.dotUnsaved} /> Unsaved changes</>
            : !isNew ? <><Check size={14} strokeWidth={2.5} /> Saved</> : null}
        </div>
        <div className={s.barActions}>
          {!isNew && (
            <button type="button" className={`${s.iconBtn} ${s.danger}`} onClick={() => setShowDel(true)} aria-label="Delete entry" title="Delete">
              <Trash2 size={17} strokeWidth={2} />
            </button>
          )}
          <Btn sm onClick={save} disabled={saving || (!draft.title.trim() && !draft.body.trim()) || (!dirty && !isNew)}>
            {saving ? 'Saving' : 'Save'}
          </Btn>
        </div>
      </div>

      <div className={s.editorInner}>
        <p className={s.editorDate} suppressHydrationWarning>{dateLabel}{entryTime ? `, ${entryTime.slice(0, 5)}` : ''}</p>

        <input
          className={s.titleInput}
          placeholder="Give it a title"
          aria-label="Title"
          value={draft.title}
          onChange={e => set('title', e.target.value)}
          autoFocus={isNew}
        />

        <div className={s.moodRow} role="radiogroup" aria-label="How are you feeling?">
          {Object.entries(MOODS).map(([m, name]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={draft.mood === m}
              aria-label={name}
              title={name}
              onClick={() => set('mood', draft.mood === m ? '' : m)}
              className={`${s.moodBtn} ${draft.mood === m ? s.moodBtnOn : ''}`}
            >{m}</button>
          ))}
          <span className={s.moodName}>{draft.mood ? `Feeling ${MOODS[draft.mood]}` : 'How are you feeling?'}</span>
        </div>

        <div className={s.bodyWrap}>
          <textarea
            ref={bodyRef}
            className={s.bodyArea}
            placeholder="What's on your mind? Type @ to mention someone."
            aria-label="Entry"
            value={draft.body}
            onChange={e => onBody(e.target.value)}
            onKeyDown={onBodyKey}
            onBlur={() => setTimeout(() => setMentionQ(null), 150)}
          />
          {mentionQ !== null && matches.length > 0 && (
            <div className={s.mentionMenu} role="listbox" aria-label="Mention someone">
              <div className={s.mentionHead}><AtSign size={13} strokeWidth={2.25} /> Mention someone</div>
              {matches.map((soul, i) => (
                <button
                  key={soul.id}
                  type="button"
                  role="option"
                  aria-selected={i === mentionIdx}
                  className={`${s.mentionItem} ${i === mentionIdx ? s.mentionItemOn : ''}`}
                  onMouseDown={e => { e.preventDefault(); insertSoul(soul); }}
                  onMouseEnter={() => setMentionIdx(i)}
                >
                  <SoulAvatar soul={soul} size={28} />
                  <span className={s.mentionName}>{soul.name}</span>
                  {soul.role && <span className={s.mentionRole}>{soul.role}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={s.editorFoot}>
          <div className={s.footBlock}>
            <Lbl>Tags</Lbl>
            <TagInput
              tags={draft.tags}
              onAdd={t => set('tags', [...draft.tags, t])}
              onRemove={t => set('tags', draft.tags.filter(x => x !== t))}
            />
          </div>

          {linkedSouls.length > 0 && (
            <div className={s.footBlock}>
              <Lbl>Mentioned</Lbl>
              <div className={s.linked}>
                {linkedSouls.map(soul => (
                  <span key={soul.id} className={s.linkedSoul} style={{ ['--c' as string]: soul.color }}>
                    <SoulAvatar soul={soul} size={22} />{soul.name}
                    <button
                      type="button"
                      aria-label={`Unlink ${soul.name}`}
                      onClick={() => set('souls', draft.souls.filter(x => x !== soul.id))}
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={s.footRow}>
            <label className={s.pinToggle}>
              <Pin size={15} strokeWidth={2} /> Pin to the top
              <Toggle checked={draft.pinned} onChange={v => set('pinned', v)} label="Pin to the top" />
            </label>
            <span className={s.words}>{words} {words === 1 ? 'word' : 'words'}</span>
          </div>
        </div>
      </div>

      {showDel && (
        <Modal onClose={() => setShowDel(false)}>
          <Confirm msg="This entry will be gone for good." onConfirm={doDelete} onCancel={() => setShowDel(false)} />
        </Modal>
      )}

      {leaveTo && (
        <Modal onClose={() => setLeaveTo(null)}>
          <div className={s.leave}>
            <h2 className={s.leaveTitle}>Leave without saving?</h2>
            <p className={s.leaveMsg}>Your latest changes to this entry haven&apos;t been saved yet.</p>
            <div className={s.leaveActions}>
              <Btn variant="ghost" onClick={() => { const to = leaveTo; setLeaveTo(null); setOriginal(draft); router.push(to); }}>Discard changes</Btn>
              <Btn onClick={async () => { const to = leaveTo; setLeaveTo(null); if (await save()) router.push(to); }}>Save and leave</Btn>
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
