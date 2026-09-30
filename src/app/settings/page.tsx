'use client';
import React, { useState, useEffect } from 'react';
import {
  Smartphone, Download, CheckCircle2, Share, SquarePlus, EllipsisVertical, HardDriveDownload,
  Images, ShieldCheck, Loader2, Sparkles,
} from 'lucide-react';
import s from './settings.module.css';
import { Btn, Topbar, Toggle, Toast, useToast } from '@/components/ui';
import { ensureSession } from '@/lib/supabase';
import { makeBackup, downloadBlob, LAST_BACKUP_KEY, type Progress } from '@/lib/backup';
import { fmtDate } from '@/lib/dates';
import NotificationsCard from './NotificationsCard';
import { openWhatsNew } from '@/lib/whatsNew';

const MAX = 860;
type Platform = 'ios' | 'android' | 'desktop';

const TABLE_LABEL: Record<string, string> = {
  journal_entries: 'journal entries', tasks: 'tasks', library: 'library items', ideas: 'ideas', queue: 'queue items',
  places: 'places', souls: 'people', ratings: 'ratings', mood_logs: 'mood logs', gallery_images: 'gallery photos',
  time_capsules: 'letters',
};

export default function SettingsPage() {
  // ── Install ────────────────────────────────────────────────
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
     
    setPlatform(ios ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop');
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    setCanPrompt(!!window.__ywInstall);
     
    const onReady = () => setCanPrompt(!!window.__ywInstall);
    window.addEventListener('yw-install-ready', onReady);
    return () => window.removeEventListener('yw-install-ready', onReady);
  }, []);

  const install = async () => {
    const e = window.__ywInstall;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    window.__ywInstall = null;
    setCanPrompt(false);
    if (outcome === 'accepted') setInstalled(true);
  };

  // ── Backup ─────────────────────────────────────────────────
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(LAST_BACKUP_KEY); } catch { /* ignore */ }
     
    setLast(v);
  }, []);

  const backup = async () => {
    if (busy) return;
    setBusy(true); setSummary(null);
    try {
      if (!(await ensureSession())) { show('Please sign in again first.', 'var(--red)'); return; }
      const res = await makeBackup({ photos: withPhotos }, setProgress);
      downloadBlob(res.blob, res.filename);
      const now = new Date().toISOString();
      try { localStorage.setItem(LAST_BACKUP_KEY, now); } catch { /* ignore */ }
      setLast(now);
      const bits = Object.entries(TABLE_LABEL)
        .filter(([t]) => res.counts[t])
        .map(([t, label]) => `${res.counts[t]} ${label}`);
      if (withPhotos) bits.push(`${res.photos} photos`);
      setSummary(`Saved ${bits.join(', ') || 'your settings'}.${res.missedPhotos ? ` ${res.missedPhotos} photos could not be downloaded.` : ''}`);
      show('Backup downloaded');
    } catch {
      show('The backup could not be made. Please try again.', 'var(--red)');
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={s.page}>
      <Topbar
        title="App & backup"
        sub="Put yourworld on your phone, and keep a copy of everything."
        action={<Btn variant="ghost" onClick={openWhatsNew}><Sparkles size={16} strokeWidth={2} /> What&apos;s new</Btn>}
        maxWidth={MAX}
      />
      <div className={s.wrap}>
        {/* ── Install ─────────────────────────────────────── */}
        <section className={s.card} aria-labelledby="install-h">
          <div className={s.cardHead}>
            <span className={s.bigIcon}><Smartphone size={22} strokeWidth={1.75} /></span>
            <div>
              <h2 id="install-h" className={s.title}>Install on your phone</h2>
              <p className={s.sub}>Add yourworld to your home screen. It opens full screen with its own icon, just like an app.</p>
            </div>
          </div>

          {installed ? (
            <p className={s.done}><CheckCircle2 size={18} strokeWidth={2} /> You&apos;re using the installed app. Nothing else to do.</p>
          ) : canPrompt ? (
            <Btn onClick={install}><Download size={16} strokeWidth={2} /> Install yourworld</Btn>
          ) : platform === 'ios' ? (
            <ol className={s.steps}>
              <li><span className={s.stepIcon}><Share size={16} /></span> Open this site in <b>Safari</b> and tap the <b>Share</b> button (at the bottom on iPhone, at the top next to the address bar on iPad).</li>
              <li><span className={s.stepIcon}><SquarePlus size={16} /></span> Scroll down and tap <b>Add to Home Screen</b>.</li>
              <li><span className={s.stepIcon}><CheckCircle2 size={16} /></span> Tap <b>Add</b>. The star icon appears on your Home Screen. From now on, open yourworld from there.</li>
            </ol>
          ) : platform === 'android' ? (
            <ol className={s.steps}>
              <li><span className={s.stepIcon}><EllipsisVertical size={16} /></span> In <b>Chrome</b>, tap the <b>⋮</b> menu at the top right.</li>
              <li><span className={s.stepIcon}><SquarePlus size={16} /></span> Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li>
              <li><span className={s.stepIcon}><CheckCircle2 size={16} /></span> Confirm, and it will appear with your other apps.</li>
            </ol>
          ) : (
            <p className={s.sub}>On your phone, open this site and come back to this page for the steps. On a computer, look for the install icon at the end of the address bar in Chrome or Edge.</p>
          )}

        </section>

        <NotificationsCard onMessage={show} />

        {/* ── Backup ──────────────────────────────────────── */}
        <section className={s.card} aria-labelledby="backup-h">
          <div className={s.cardHead}>
            <span className={s.bigIcon}><HardDriveDownload size={22} strokeWidth={1.75} /></span>
            <div>
              <h2 id="backup-h" className={s.title}>Back up everything</h2>
              <p className={s.sub}>Download one file with everything you&apos;ve written and saved: journal, tasks, places, people, moods, letters and more. Keep it somewhere safe.</p>
            </div>
          </div>

          <ul className={s.contents}>
            <li><b>journal.html</b> your journal as a book you can open and read in any browser</li>
            <li><b>backup.json</b> a complete copy of every list, exactly as it&apos;s stored</li>
            {withPhotos && <li><b>photos</b> every picture you&apos;ve uploaded</li>}
          </ul>

          <div className={s.row}>
            <span className={s.rowText}><Images size={16} strokeWidth={2} /> Include photos <span className={s.muted}>(bigger file)</span></span>
            <Toggle checked={withPhotos} onChange={setWithPhotos} label="Include photos" />
          </div>

          {busy && progress ? (
            <div className={s.progress} aria-live="polite">
              <div className={s.progressText}><Loader2 size={15} className={s.spin} /> {progress.step}{progress.total > 1 ? ` · ${progress.done} of ${progress.total}` : ''}</div>
              <div className={s.bar}><span style={{ width: `${Math.max(4, pct)}%` }} /></div>
            </div>
          ) : (
            <Btn onClick={backup} disabled={busy}><Download size={16} strokeWidth={2} /> Download everything</Btn>
          )}

          {summary && <p className={s.done}><CheckCircle2 size={18} strokeWidth={2} /> {summary}</p>}
          <p className={s.footnote}>
            <ShieldCheck size={14} strokeWidth={2} />
            {last ? `Last backup on this device: ${fmtDate(last)}. ` : 'No backup made on this device yet. '}
            The file is made right here in your browser and goes straight to your downloads. Nothing is sent anywhere.
          </p>
        </section>
      </div>
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
