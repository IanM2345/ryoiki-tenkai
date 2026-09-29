'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Users, Pencil, Cake } from 'lucide-react';
import { nextBirthday, fmtBirthday, countdownLabel } from '@/lib/birthdays';
import s from './souls.module.css';
import { Btn, SearchBar, Topbar, Modal, Confirm, EmptyState, Toast, useToast } from '@/components/ui';
import SoulAvatar from '@/components/souls/SoulAvatar';
import SoulForm from '@/components/souls/SoulForm';
import { getSouls, deleteSoul, type DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { deleteImage, preloadSignedUrls } from '@/lib/upload';

export default function SoulsPage() {
  const [souls, setSouls]     = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState<DbSoul | 'new' | null>(null);
  const [delSoul, setDelSoul] = useState<DbSoul | null>(null);
  const [toast, show] = useToast();

  const reload = useCallback(async () => {
      try {
        if (!(await ensureSession())) return;
        const data = await getSouls();
        await preloadSignedUrls(data.map(x => x.image_url)).catch(() => {});
        setSouls(data);
      } catch {
        show('Could not load your people.', 'var(--red)');
      } finally {
        setLoading(false);
      }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['souls', 'soul_media'], reload);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => souls
    .filter(x => !q || `${x.name} ${x.role ?? ''} ${x.description ?? ''} ${(x.tags ?? []).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name)),
  [souls, q]);

  const doDelete = async () => {
    const soul = delSoul; if (!soul) return;
    const snapshot = souls;
    setSouls(l => l.filter(x => x.id !== soul.id));
    setDelSoul(null); setEditing(null);
    try { await deleteSoul(soul.id); await deleteImage(soul.image_url); show(`${soul.name} removed`); }
    catch { setSouls(snapshot); show('Could not remove them.', 'var(--red)'); }
  };

  return (
    <div className={s.page}>
      <Topbar
        title="Souls"
        sub={loading ? 'Loading your people' : souls.length ? `${souls.length} ${souls.length === 1 ? 'person' : 'people'} in your world` : 'The people who matter'}
        action={<Btn onClick={() => setEditing('new')}><Plus size={16} strokeWidth={2.25} /> Add someone</Btn>}
      />

      <div className={s.wrap}>
        {souls.length > 6 && <SearchBar value={search} onChange={setSearch} placeholder="Find someone" className={s.search} />}

        {loading ? (
          <div className={s.grid}>{[0, 1, 2, 3].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : souls.length === 0 ? (
          <EmptyState icon={<Users size={26} />} msg="No one here yet. Add the people who matter to you." action={<Btn sm onClick={() => setEditing('new')}><Plus size={15} /> Add someone</Btn>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users size={26} />} msg="Nobody matches that search." />
        ) : (
          <div className={s.grid}>
            {filtered.map(soul => (
              <article key={soul.id} className={s.card} style={{ ['--c' as string]: soul.color }}>
                <Link href={`/souls/${soul.id}`} className={s.cardLink}>
                  <SoulAvatar soul={soul} size={64} />
                  <span className={s.name}>{soul.name}</span>
                  {soul.role && <span className={s.role}>{soul.role}</span>}
                  {soul.description && <span className={s.desc}>{soul.description}</span>}
                  {soul.since && <span className={s.since}>Since {soul.since}</span>}
                  {soul.birthday && <span className={s.since}><Cake size={12} /> {fmtBirthday(soul.birthday)} · {countdownLabel(nextBirthday(soul.birthday).days).toLowerCase()}</span>}
                </Link>
                <button type="button" className={s.editBtn} onClick={() => setEditing(soul)} aria-label={`Edit ${soul.name}`}>
                  <Pencil size={14} strokeWidth={2} />
                </button>
              </article>
            ))}
            <button type="button" className={s.addCard} onClick={() => setEditing('new')}>
              <span className={s.addIcon}><Plus size={22} strokeWidth={2} /></span>
              Add someone
            </button>
          </div>
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <SoulForm
            soul={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onError={m => show(m, 'var(--red)')}
            onDelete={editing !== 'new' ? () => setDelSoul(editing) : undefined}
            onSaved={(saved, isNew) => {
              setSouls(l => isNew ? [...l, saved] : l.map(x => x.id === saved.id ? saved : x));
              setEditing(null);
              show(isNew ? `${saved.name} added` : 'Changes saved');
            }}
          />
        </Modal>
      )}

      {delSoul && (
        <Modal onClose={() => setDelSoul(null)}>
          <Confirm msg={`Remove ${delSoul.name}? Your journal entries stay exactly as they are.`} onConfirm={doDelete} onCancel={() => setDelSoul(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
