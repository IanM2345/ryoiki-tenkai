'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, MailOpen, Lock, PenLine, Trash2, Sparkles, Hourglass, CalendarClock } from 'lucide-react';
import s from './capsules.module.css';
import {
  Btn, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea, EmptyState, Toast, useToast, Lbl, DatePicker,
} from '@/components/ui';
import { getCapsules, addCapsule, markCapsuleOpened, deleteCapsule, type DbCapsule } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { localDateStr, addDays, fmtDate, parseLocalDate } from '@/lib/dates';

const MAX = 1000;

const daysUntil = (ymd: string, today: string) =>
  Math.round((parseLocalDate(ymd).getTime() - parseLocalDate(today).getTime()) / 86_400_000);

function untilLabel(days: number): string {
  if (days <= 0) return 'Ready to open';
  if (days === 1) return 'Opens tomorrow';
  if (days < 14) return `Opens in ${days} days`;
  if (days < 60) return `Opens in ${Math.round(days / 7)} weeks`;
  if (days < 350) return `Opens in ${Math.round(days / 30.4)} months`;
  if (days < 540) return 'Opens in a year';
  return `Opens in ${Math.round(days / 365)} years`;
}

/** Quick picks for the open date. */
function presets(today: string) {
  const d = parseLocalDate(today);
  const nextNewYear = `${d.getFullYear() + 1}-01-01`;
  const plusMonths = (n: number) => localDateStr(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()));
  return [
    { label: 'In a month', value: plusMonths(1) },
    { label: 'In 6 months', value: plusMonths(6) },
    { label: 'In a year', value: plusMonths(12) },
    { label: "New Year's Day", value: nextNewYear },
    { label: 'In 5 years', value: plusMonths(60) },
  ];
}

const EMPTY = { title: '', body: '', open_on: '' };

export default function CapsulesPage() {
  const [letters, setLetters] = useState<DbCapsule[]>([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState<DbCapsule | null>(null);
  const [unsealing, setUnsealing] = useState<string | null>(null);
  const [delItem, setDelItem] = useState<DbCapsule | null>(null);
  const [toast, show] = useToast();
  const today = localDateStr();

  const reload = useCallback(async () => {
    try {
      if (!(await ensureSession())) return;
      setLetters(await getCapsules());
    } catch {
      show('Could not load your letters.', 'var(--red)');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['time_capsules'], reload);

  const { ready, sealed, opened } = useMemo(() => ({
    ready:  letters.filter(l => !l.opened_at && l.open_on <= today),
    sealed: letters.filter(l => !l.opened_at && l.open_on > today).sort((a, b) => a.open_on.localeCompare(b.open_on)),
    opened: letters.filter(l => !!l.opened_at).sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? '')),
  }), [letters, today]);

  const openWriter = () => { setForm({ ...EMPTY, open_on: presets(today)[2].value }); setWriting(true); };

  const seal = async () => {
    if (!form.body.trim() || !form.open_on || saving) return;
    if (form.open_on <= today) { show('Pick a date in the future to open it.', 'var(--yellow)'); return; }
    setSaving(true);
    try {
      const saved = await addCapsule({ title: form.title.trim() || 'A letter', body: form.body.trim(), open_on: form.open_on });
      setLetters(l => [...l, saved].sort((a, b) => a.open_on.localeCompare(b.open_on)));
      setWriting(false);
      show(`Sealed until ${fmtDate(saved.open_on)}`);
    } catch {
      show('Could not seal that letter.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const unseal = async (l: DbCapsule) => {
    setUnsealing(l.id);
    // Let the envelope animation play before the letter appears.
    setTimeout(async () => {
      try {
        const saved = { ...l, ...(await markCapsuleOpened(l.id)), id: l.id };
        setLetters(list => list.map(x => (x.id === l.id ? saved : x)));
        setReading(saved);
      } catch {
        setReading(l);
      } finally {
        setUnsealing(null);
      }
    }, 900);
  };

  const remove = async () => {
    if (!delItem) return;
    const item = delItem;
    setDelItem(null);
    setLetters(l => l.filter(x => x.id !== item.id));
    try { await deleteCapsule(item.id); show('Letter removed'); }
    catch { setLetters(l => [...l, item]); show('Could not remove that letter.', 'var(--red)'); }
  };

  const from = (l: DbCapsule) => (l.from_name ? `From ${l.from_name}` : 'From you');

  return (
    <div className={s.page}>
      <Topbar
        title="Time capsule"
        sub={loading ? 'Loading your letters' : sealed.length ? `${sealed.length} sealed, ${ready.length ? `${ready.length} ready to open` : `next opens ${fmtDate(sealed[0].open_on)}`}` : 'Letters to open later'}
        action={<Btn onClick={openWriter}><PenLine size={16} strokeWidth={2} /> Write a letter</Btn>}
        maxWidth={MAX}
      />
      <div className={s.wrap}>
        {loading ? (
          <div className={s.grid}>{[0, 1, 2].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : letters.length === 0 ? (
          <EmptyState
            icon={<Hourglass size={26} />}
            msg="Write a letter to your future self and lock it until a date you choose. A birthday, a new year, five years from now."
            action={<Btn sm onClick={openWriter}><PenLine size={15} /> Write your first letter</Btn>}
          />
        ) : (
          <>
            {ready.length > 0 && (
              <section className={s.section} aria-labelledby="ready-h">
                <h2 id="ready-h" className={s.sectionTitle}><Sparkles size={16} strokeWidth={2} /> Ready to open</h2>
                <div className={s.grid}>
                  {ready.map(l => (
                    <article key={l.id} className={`${s.envelope} ${s.readyEnv} ${unsealing === l.id ? s.unsealing : ''}`}>
                      <div className={s.flap} aria-hidden />
                      <div className={s.seal} aria-hidden><Mail size={18} strokeWidth={2} /></div>
                      <div className={s.envBody}>
                        <span className={s.from}>{from(l)}</span>
                        <span className={s.title}>{l.title}</span>
                        <span className={s.meta}>Sealed {fmtDate(l.created_at)}</span>
                      </div>
                      <Btn sm onClick={() => unseal(l)} disabled={!!unsealing}><MailOpen size={15} /> Open it</Btn>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {sealed.length > 0 && (
              <section className={s.section} aria-labelledby="sealed-h">
                <h2 id="sealed-h" className={s.sectionTitle}><Lock size={16} strokeWidth={2} /> Sealed</h2>
                <div className={s.grid}>
                  {sealed.map(l => {
                    const days = daysUntil(l.open_on, today);
                    const total = Math.max(1, daysUntil(l.open_on, l.created_at.slice(0, 10)));
                    const pct = Math.min(100, Math.max(3, Math.round(((total - days) / total) * 100)));
                    return (
                      <article key={l.id} className={s.envelope}>
                        <div className={s.flap} aria-hidden />
                        <div className={s.seal} aria-hidden><Lock size={16} strokeWidth={2.25} /></div>
                        <div className={s.envBody}>
                          <span className={s.from}>{from(l)}</span>
                          <span className={s.title}>{l.from_name ? 'A sealed letter' : l.title}</span>
                          <span className={s.meta}><CalendarClock size={13} /> {fmtDate(l.open_on)}</span>
                        </div>
                        <div className={s.progress} aria-hidden><span style={{ width: `${pct}%` }} /></div>
                        <div className={s.envFoot}>
                          <span className={s.until}>{untilLabel(days)}</span>
                          {!l.from_name && (
                            <button type="button" className={s.iconBtn} onClick={() => setDelItem(l)} aria-label="Remove this letter">
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {opened.length > 0 && (
              <section className={s.section} aria-labelledby="opened-h">
                <h2 id="opened-h" className={s.sectionTitle}><MailOpen size={16} strokeWidth={2} /> Opened</h2>
                <ul className={s.openedList}>
                  {opened.map(l => (
                    <li key={l.id}>
                      <button type="button" className={s.openedRow} onClick={() => setReading(l)}>
                        <MailOpen size={16} strokeWidth={2} />
                        <span className={s.openedTitle}>{l.title}</span>
                        <span className={s.meta}>{from(l)} · written {fmtDate(l.created_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {writing && (
        <Modal onClose={() => !saving && setWriting(false)}>
          <ModalTitle>Write a letter to the future</ModalTitle>
          <FInput label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Dear future me" />
          <FArea label="Your letter" value={form.body} onChange={v => setForm(f => ({ ...f, body: v }))} rows={9}
            placeholder="What's happening in your life right now? What are you hoping for? What do you want to remember?" />
          <Lbl>Open on</Lbl>
          <div className={s.presets}>
            {presets(today).map(p => (
              <button key={p.label} type="button" className={`${s.preset} ${form.open_on === p.value ? s.presetOn : ''}`} onClick={() => setForm(f => ({ ...f, open_on: p.value }))}>
                {p.label}
              </button>
            ))}
          </div>
          <DatePicker value={form.open_on} min={addDays(today, 1)} onChange={v => setForm(f => ({ ...f, open_on: v }))} placeholder="Or pick any date" />
          <p className={s.hint}><Lock size={12} /> Once sealed, the letter stays hidden until that day.</p>
          <ModalFooter onCancel={() => setWriting(false)} onSave={seal} saveLabel={saving ? 'Sealing' : 'Seal the letter'} />
        </Modal>
      )}

      {reading && (
        <Modal onClose={() => setReading(null)}>
          <div className={s.paper}>
            <span className={s.paperFrom}>{from(reading)} · written {fmtDate(reading.created_at)}</span>
            <h2 className={s.paperTitle}>{reading.title}</h2>
            <div className={s.paperBody}>{reading.body}</div>
          </div>
          <div className={s.readFoot}>
            {!reading.from_name && (
              <Btn variant="ghost" sm onClick={() => { setDelItem(reading); setReading(null); }}><Trash2 size={14} /> Remove</Btn>
            )}
            <Btn sm onClick={() => setReading(null)}>Close</Btn>
          </div>
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.title}" will be removed for good.`} onConfirm={remove} onCancel={() => setDelItem(null)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
