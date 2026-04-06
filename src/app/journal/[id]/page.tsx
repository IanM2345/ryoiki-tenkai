'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import s from '../journal.module.css';
import { Btn, Lbl, TagInput, Toggle, Modal, Confirm, Toast, useToast } from '@/components/ui';
import { getJournalEntry, addJournalEntry, updateJournalEntry, deleteJournalEntry, setJournalEntrySouls, getJournalEntrySoulIds, getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import type { DbJournalEntry, DbSoul } from '@/lib/db';

const MOODS: Record<string, string> = { '😊':'happy','🌟':'radiant','😌':'calm','😢':'sad','😤':'frustrated','🫶':'loved','✨':'inspired','🔥':'energised','🌧':'heavy','💫':'dreamy' };

export default function JournalEditorPage() {
  const router     = useRouter();
  const params     = useParams();
  const id         = params?.id as string;
  const isNew      = id === 'new';

  const [toast, show] = useToast();
  const [loading,   setLoading]   = useState(!isNew);
  const [saving,    setSaving]    = useState(false);
  const [title,     setTitle]     = useState('');
  const [body,      setBody]      = useState('');
  const [mood,      setMood]      = useState('');
  const [tags,      setTags]      = useState<string[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [pinned,    setPinned]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [chars,     setChars]     = useState(0);
  const [spicker,   setSpicker]   = useState(false);
  const [sq,        setSq]        = useState('');
  const [showDel,   setShowDel]   = useState(false);
  const [allSouls,  setAllSouls]  = useState<DbSoul[]>([]);
  const [origEntry, setOrigEntry] = useState<DbJournalEntry | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const timer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load souls list + entry (if editing)
  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const souls = await getSouls();
        setAllSouls(souls);
        if (!isNew) {
          const entry   = await getJournalEntry(id);
          const soulIds = await getJournalEntrySoulIds(id);
          setOrigEntry(entry);
          setTitle(entry.title);
          setBody(entry.body);
          setMood(entry.mood ?? '');
          setTags(entry.tags ?? []);
          setPinned(entry.pinned);
          setChars(entry.body.length);
          setLinkedIds(soulIds);
        }
      } catch (err) {
        console.error('Journal editor load error:', err);
        show('Could not load entry.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const touch = (val: string) => {
    setSaved(false); setChars(val.length);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(true), 1400);
  };

  const handleBody = (val: string) => {
    setBody(val); touch(val);
    const ta = bodyRef.current; if (!ta) return;
    const pos    = ta.selectionStart ?? 0;
    const before = val.slice(0, pos);
    const at     = before.lastIndexOf('@');
    if (at > -1 && !before.slice(at + 1).includes(' ')) { setSpicker(true); setSq(before.slice(at + 1)); }
    else { setSpicker(false); setSq(''); }
  };

  const insertSoul = (soul: DbSoul) => {
    if (!linkedIds.includes(soul.id)) setLinkedIds(ids => [...ids, soul.id]);
    const ta = bodyRef.current; if (!ta) return;
    const pos    = ta.selectionStart ?? 0;
    const before = body.slice(0, pos);
    const at     = before.lastIndexOf('@');
    const nb     = (at > -1 ? body.slice(0, at) : '') + `@${soul.name} ` + body.slice(pos);
    setBody(nb); setSpicker(false); setSq('');
    setTimeout(() => { ta.focus(); const p = (at > -1 ? at : 0) + soul.name.length + 2; ta.setSelectionRange(p, p); }, 20);
  };

  const save = async () => {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title:      title.trim() || 'Untitled',
        body,
        mood:       mood || null,
        pinned,
        tags,
        entry_date: isNew ? new Date().toISOString().split('T')[0] : (origEntry?.entry_date ?? new Date().toISOString().split('T')[0]),
        entry_time: new Date().toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }),
      };
      if (isNew) {
        const created = await addJournalEntry(payload);
        await setJournalEntrySouls(created.id, linkedIds);
      } else {
        await updateJournalEntry(id, payload);
        await setJournalEntrySouls(id, linkedIds);
      }
      show('Entry saved!');
      setTimeout(() => router.push('/journal'), 400);
    } catch (err) {
      console.error('Save error:', err);
      show('Could not save entry.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    try {
      await deleteJournalEntry(id);
      show('Deleted.');
      router.push('/journal');
    } catch {
      show('Could not delete.');
    }
  };

  const matched = allSouls.filter(s => sq ? s.name.toLowerCase().startsWith(sq.toLowerCase()) : true);
  const linkedSouls = allSouls.filter(s => linkedIds.includes(s.id));

  if (loading) return <div className={s.editorPage}><div className={s.loadingState}>Loading...</div></div>;

  return (
    <div className={`${s.editorPage} aFadeUp`}>
      <div className={s.editorTopbar}>
        <Btn variant="ghost" sm onClick={() => router.push('/journal')}>← Back</Btn>
        <div className={s.editorStatus}>
          <span className={saved ? s.savedText : s.unsavedText}>{saved ? '● saved' : '● unsaved'}</span>
          <span className={s.charCount}>{chars} chars</span>
        </div>
        <div className={s.editorActions}>
          <Btn variant="ghost" sm onClick={() => router.push('/journal')}>Discard</Btn>
          {!isNew && <Btn variant="ghost" sm onClick={() => setShowDel(true)}>Delete</Btn>}
          <Btn sm onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Btn>
        </div>
      </div>

      <div className={s.editorBody}>
        <input
          className={s.titleInput}
          placeholder="Title your entry..."
          value={title}
          onChange={e => { setTitle(e.target.value); touch(body); }}
          autoFocus={isNew}
        />

        <div>
          <Lbl>How are you feeling?</Lbl>
          <div className={s.moodRow}>
            {Object.keys(MOODS).map(m => (
              <button key={m} title={MOODS[m]} onClick={() => setMood(mood === m ? '' : m)}
                className={`${s.moodBtn} ${mood === m ? s.moodBtnActive : ''}`}
              >{m}</button>
            ))}
            {mood && <span className={s.moodName}>{MOODS[mood]}</span>}
          </div>
        </div>

        <div>
          <Lbl>Tags</Lbl>
          <TagInput tags={tags} onAdd={t => setTags(ts => [...ts, t])} onRemove={t => setTags(ts => ts.filter(x => x !== t))} />
        </div>

        <div className={s.pinRow}>
          <Lbl>Pin entry</Lbl>
          <Toggle checked={pinned} onChange={setPinned} />
        </div>

        <div className={s.bodyWrap}>
          <Lbl>Write</Lbl>
          <textarea
            ref={bodyRef}
            className={s.bodyArea}
            placeholder="What's on your mind? Type @ to link a Soul..."
            value={body}
            onChange={e => handleBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setSpicker(false); setSq(''); } }}
            rows={10}
          />
          {spicker && matched.length > 0 && (
            <div className={s.soulPicker}>
              <Lbl>Link a soul</Lbl>
              {matched.map(soul => (
                <div key={soul.id} className={s.soulPickerItem} onClick={() => insertSoul(soul)}>
                  <div className={s.soulAvatar} style={{ background: `${soul.color}22` }}>{soul.emoji}</div>
                  <span className={s.soulPickerName}>{soul.name}</span>
                  <span className={s.soulPickerRole}>{soul.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {linkedSouls.length > 0 && (
          <div className={s.linkedSouls}>
            <span className={s.linkedLabel}>Linked:</span>
            {linkedSouls.map(soul => (
              <strong key={soul.id} style={{ color: soul.color }}>
                {soul.emoji} @{soul.name}
              </strong>
            ))}
          </div>
        )}
      </div>

      {showDel && (
        <Modal onClose={() => setShowDel(false)}>
          <Confirm msg="This entry will be gone forever." onConfirm={doDelete} onCancel={() => setShowDel(false)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}