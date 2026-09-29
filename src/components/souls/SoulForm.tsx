'use client';
import React, { useRef, useState } from 'react';
import { Trash2, Camera, X, Cake } from 'lucide-react';
import { Btn, Lbl, TagInput, ModalTitle, ModalFooter, FInput, FArea } from '@/components/ui';
import StoredImage from '@/components/ui/StoredImage';
import { addSoul, updateSoul, type DbSoul } from '@/lib/db';
import { prepareImage } from '@/lib/upload';
import s from './souls.module.css';
import { MONTHS, UNKNOWN_YEAR } from '@/lib/birthdays';

export const SOUL_EMOJIS = ['🌟', '🫶', '🔥', '✨', '🌙', '🎭', '🌊', '🦋', '🌸', '💫', '🎨', '🎵', '🌿', '🍀', '🐉', '🌺', '🌻', '🎸', '💐', '🐾'];
export const SOUL_COLORS = ['#ff8c00', '#a855f7', '#ffb347', '#c084fc', '#22d3ee', '#4ade80', '#f43f5e', '#818cf8', '#fb923c', '#f59e0b', '#ec4899', '#14b8a6'];

/**
 * Add/edit form for a soul, used inside a <Modal>. Handles its own saving,
 * including the photo, and reports back the saved row.
 */
export default function SoulForm({ soul, onSaved, onCancel, onDelete, onError }: {
  soul: DbSoul | null;
  onSaved: (saved: DbSoul, isNew: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onError: (msg: string) => void;
}) {
  const [f, setF] = useState({
    name: soul?.name ?? '', emoji: soul?.emoji ?? SOUL_EMOJIS[0], color: soul?.color ?? SOUL_COLORS[0],
    role: soul?.role ?? '', since: soul?.since ?? '', description: soul?.description ?? '',
    notes: soul?.notes ?? '', tags: [...(soul?.tags ?? [])],
    bDay: soul?.birthday ? String(Number(soul.birthday.slice(8, 10))) : '',
    bMonth: soul?.birthday ? String(Number(soul.birthday.slice(5, 7))) : '',
    bYear: soul?.birthday && Number(soul.birthday.slice(0, 4)) !== UNKNOWN_YEAR ? soul.birthday.slice(0, 4) : '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(soul?.image_url ?? null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  // Day + month make a birthday; the year is optional.
  const birthday = (() => {
    const d = Number(f.bDay), m = Number(f.bMonth);
    if (!d || !m) return null;
    const yNum = Number(f.bYear);
    const y = f.bYear.length === 4 && yNum > 1900 && yNum <= new Date().getFullYear() ? yNum : UNKNOWN_YEAR;
    const maxDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, maxDay)).padStart(2, '0')}`;
  })();

  const save = async () => {
    if (!f.name.trim() || saving) return;
    setSaving(true);
    let img: Awaited<ReturnType<typeof prepareImage>> | null = null;
    try {
      img = await prepareImage({ current: soul?.image_url, file: imageFile, cleared: !imagePreview, folder: 'souls' });
      const payload = {
        name: f.name.trim(), emoji: f.emoji, color: f.color,
        role: f.role.trim() || null, since: f.since.trim() || null,
        description: f.description.trim() || null, notes: f.notes.trim() || null,
        tags: f.tags, image_url: img.value, birthday,
      };
      const saved = soul ? await updateSoul(soul.id, payload) : await addSoul(payload);
      await img.cleanup();
      onSaved(saved, !soul);
    } catch {
      await img?.rollback();
      onError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalTitle>{soul ? `Edit ${soul.name}` : 'Add someone'}</ModalTitle>

      <div className={s.preview} style={{ ['--c' as string]: f.color }}>
        <button
          type="button"
          className={s.photoBtn}
          onClick={() => fileRef.current?.click()}
          aria-label={imagePreview ? 'Change photo' : 'Add a photo'}
        >
          {imagePreview
            ? <StoredImage src={imagePreview} alt="" className={s.photoImg} loading="eager" />
            : <span className={s.previewAvatar}>{f.emoji}</span>}
          <span className={s.photoBadge}><Camera size={14} strokeWidth={2.25} /></span>
        </button>
        <span className={s.previewText}>
          <span className={s.previewName}>{f.name || 'Their name'}</span>
          <span className={s.previewHint}>
            {imagePreview ? 'Tap the picture to change it' : 'Tap the circle to add a photo'}
          </span>
          {imagePreview && (
            <button type="button" className={s.removePhoto} onClick={() => { setImageFile(null); setImagePreview(null); }}>
              <X size={13} strokeWidth={2.5} /> Remove photo, use emoji
            </button>
          )}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      <FInput label="Name" value={f.name} onChange={v => set('name', v)} />

      <Lbl>{imagePreview ? 'Emoji (shown if the photo is removed)' : 'Emoji'}</Lbl>
      <div className={s.emojiGrid} role="radiogroup" aria-label="Emoji">
        {SOUL_EMOJIS.map(e => (
          <button key={e} type="button" role="radio" aria-checked={f.emoji === e}
            className={`${s.emojiOpt} ${f.emoji === e ? s.emojiOn : ''}`} onClick={() => set('emoji', e)}>{e}</button>
        ))}
      </div>

      <Lbl>Colour</Lbl>
      <div className={s.colorRow} role="radiogroup" aria-label="Colour">
        {SOUL_COLORS.map(c => (
          <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c}
            className={`${s.colorOpt} ${f.color === c ? s.colorOn : ''}`} style={{ background: c }} onClick={() => set('color', c)} />
        ))}
      </div>

      <div className={s.twoCol}>
        <FInput label="Who they are to you" value={f.role} onChange={v => set('role', v)} placeholder="Best friend, sister…" />
        <FInput label="Since" value={f.since} onChange={v => set('since', v)} placeholder="2019, or forever" />
      </div>
      <div className={s.field}>
        <Lbl><Cake size={13} strokeWidth={2.25} className={s.lblIcon} /> Birthday</Lbl>
        <div className={s.bdayRow}>
          <select className={s.bdaySelect} value={f.bDay} onChange={e => set('bDay', e.target.value)} aria-label="Birthday day">
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
          </select>
          <select className={s.bdaySelect} value={f.bMonth} onChange={e => set('bMonth', e.target.value)} aria-label="Birthday month">
            <option value="">Month</option>
            {MONTHS.map((mo, i) => <option key={mo} value={String(i + 1)}>{mo}</option>)}
          </select>
          <input className={s.bdayYear} inputMode="numeric" maxLength={4} placeholder="Year (optional)"
            value={f.bYear} onChange={e => set('bYear', e.target.value.replace(/\D/g, ''))} aria-label="Birth year, optional" />
          {(f.bDay || f.bMonth || f.bYear) && (
            <button type="button" className={s.bdayClear} onClick={() => setF(x => ({ ...x, bDay: '', bMonth: '', bYear: '' }))} aria-label="Clear birthday"><X size={14} strokeWidth={2.5} /></button>
          )}
        </div>
        <p className={s.bdayHint}>Add the year to see how old they are turning. You&apos;ll get a reminder a few days before.</p>
      </div>
      <FArea label="About them" value={f.description} onChange={v => set('description', v)} rows={2} placeholder="How would you describe them?" />
      <FArea label="Private notes" value={f.notes} onChange={v => set('notes', v)} rows={3} placeholder="Favourite things, little details" />
      <div className={s.field}>
        <Lbl>Tags</Lbl>
        <TagInput tags={f.tags} color={f.color} onAdd={t => set('tags', [...f.tags, t])} onRemove={t => set('tags', f.tags.filter(x => x !== t))} />
      </div>

      {soul && onDelete && (
        <Btn variant="ghost" sm onClick={onDelete} className={s.deleteLink}><Trash2 size={14} /> Remove {soul.name}</Btn>
      )}
      <ModalFooter onCancel={onCancel} onSave={save} saveLabel={saving ? 'Saving' : soul ? 'Save changes' : 'Add'} />
    </>
  );
}
