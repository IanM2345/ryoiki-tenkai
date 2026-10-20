'use client';
// Home Screen widget: make a private key, then set up the widget with Scriptable or a web-widget app.
import React, { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, KeyRound, Copy, Check, Trash2, Smartphone, Globe, TriangleAlert, Plus, ShieldCheck } from 'lucide-react';
import s from './settings.module.css';
import w from './widget.module.css';
import { Btn } from '@/components/ui';
import { getWidgetKeys, addWidgetKey, deleteWidgetKey, type DbWidgetKey } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { fmtDate } from '@/lib/dates';
import { scriptableScript } from '@/lib/widgetScript';

function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return 'ywk_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy'); ta.remove(); return ok;
}
const guessDevice = () => {
  if (typeof navigator === 'undefined') return 'iPhone';
  const ua = navigator.userAgent;
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : 'iPhone';
};

export default function WidgetCard({ onMessage }: { onMessage: (msg: string, color?: string) => void }) {
  const [keys, setKeys] = useState<DbWidgetKey[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [label, setLabel] = useState('');
  const [made, setMade] = useState<{ key: string; label: string } | null>(null);
  const [how, setHow] = useState<'scriptable' | 'web'>('scriptable');
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { if (!(await ensureSession())) return; setKeys(await getWidgetKeys()); setMissing(false); }
    catch { setMissing(true); setKeys([]); }
  }, []);
  useEffect(() => { const t = setTimeout(() => { load(); setLabel(guessDevice()); }, 0); return () => clearTimeout(t); }, [load]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const key = newKey();
      const row = await addWidgetKey(label.trim() || 'Widget', await sha256(key));
      setKeys(k => [row, ...(k ?? [])]);
      setMade({ key, label: row.label });
    } catch { onMessage('Could not make a widget key. Please try again.', 'var(--red)'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setConfirm(null);
    try { await deleteWidgetKey(id); setKeys(k => (k ?? []).filter(x => x.id !== id)); onMessage('Widget key switched off. That widget will stop showing tasks.'); }
    catch { onMessage('Could not switch it off. Please try again.', 'var(--red)'); }
  };
  const doCopy = async (what: string, text: string) => {
    if (await copy(text)) { setCopied(what); setTimeout(() => setCopied(c => (c === what ? null : c)), 2500); }
    else onMessage('Copying didn’t work here. Long-press the text to copy it.', 'var(--yellow)');
  };

  // Widgets always use the site's main address: per-deploy Vercel links are behind a Vercel login.
  const mainHost = process.env.NEXT_PUBLIC_SITE_HOST || '';
  const here = typeof window !== 'undefined' ? window.location.host : '';
  const origin = mainHost ? `https://${mainHost}` : typeof window !== 'undefined' ? window.location.origin : '';
  const deployLink = !!mainHost && here !== mainHost && here.endsWith('.vercel.app');
  // A phone can't reach a copy running on this computer, so don't make keys there.
  const testCopy = !mainHost && typeof window !== 'undefined' && /^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)|\.local$/.test(window.location.hostname);
  const pageUrl = made ? `${origin}/w/tasks?k=${made.key}` : '';

  return (
    <section className={s.card} aria-labelledby="widget-h" id="widget">
      <div className={s.cardHead}>
        <span className={s.bigIcon}><LayoutGrid size={22} strokeWidth={1.75} /></span>
        <div>
          <h2 id="widget-h" className={s.title}>Tasks on your Home Screen</h2>
          <p className={s.sub}>A widget with your open tasks and live countdowns, for your iPhone or iPad Home Screen (and Lock Screen). iPhones only allow widgets from apps, so it uses a free app called Scriptable.</p>
        </div>
      </div>

      {missing ? (
        <div className={s.notice}><TriangleAlert size={18} /><p>Widgets need the latest database update first.</p></div>
      ) : made ? (
        <div className={w.made}>
          <div className={w.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={how === 'scriptable'} className={how === 'scriptable' ? w.tabOn : ''} onClick={() => setHow('scriptable')}><Smartphone size={15} /> Scriptable (recommended)</button>
            <button type="button" role="tab" aria-selected={how === 'web'} className={how === 'web' ? w.tabOn : ''} onClick={() => setHow('web')}><Globe size={15} /> A web-widget app</button>
          </div>
          {how === 'scriptable' ? (
            <ol className={w.steps}>
              <li>Install <b>Scriptable</b> from the App Store (free).</li>
              <li>
                Copy your widget script:
                <Btn sm onClick={() => doCopy('script', scriptableScript(origin, made.key))}>
                  {copied === 'script' ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy the script</>}
                </Btn>
              </li>
              <li>Open Scriptable, tap <b>+</b>, paste, and name it <b>yourworld</b> (tap the title at the top). Tap <b>Done</b>. Tap it once to see a preview.</li>
              <li>On your Home Screen, press and hold an empty spot, tap <b>Edit</b> (or <b>+</b>) → <b>Add Widget</b> → <b>Scriptable</b>, pick a size, and add it.</li>
              <li>Press and hold the new widget → <b>Edit Widget</b> → Script: <b>yourworld</b>. Done. Tapping it opens your Tasks.</li>
              <li className={w.tip}>Lock Screen too: customise the Lock Screen, add a Scriptable widget and pick <b>yourworld</b>.</li>
            </ol>
          ) : (
            <ol className={w.steps}>
              <li>In an app that shows a web page as a widget (such as Widget Web), add a new web widget.</li>
              <li>
                Use this address:
                <Btn sm onClick={() => doCopy('url', pageUrl)}>
                  {copied === 'url' ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy the widget address</>}
                </Btn>
              </li>
              <li>Set it to refresh every 15 minutes or so, and add it to your Home Screen. Add <code>&amp;theme=light</code> to the end for a light version.</li>
            </ol>
          )}
          <div className={s.notice}>
            <KeyRound size={18} />
            <p>This key is shown <b>only now</b>. It can read your <b>task list and nothing else</b>, so keep it to yourself. Lost a device? Switch its key off below.</p>
          </div>
          <div className={s.btnRow}><Btn variant="ghost" sm onClick={() => setMade(null)}><Check size={15} /> I&apos;m done</Btn></div>
        </div>
      ) : (
        <div className={w.create}>
          <label className={w.label}>
            <span>Which device is it for?</span>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="iPhone" maxLength={40} />
          </label>
          {testCopy && <div className={s.notice}><TriangleAlert size={18} /><p>This is a test copy on your computer ({typeof window !== 'undefined' ? window.location.host : ''}), and a phone can&apos;t reach it. Set up the widget from the live site.</p></div>}
          {deployLink && !testCopy && <div className={s.notice}><TriangleAlert size={18} /><p>You&apos;re on a link to one deploy ({here}). The widget will use the main address, <b>{mainHost}</b>, which stays the same. Use that one for bookmarks and the Home Screen app too.</p></div>}
          <Btn onClick={create} disabled={busy || testCopy}><Plus size={16} /> {busy ? 'Making it…' : 'Set up a widget'}</Btn>
        </div>
      )}

      {keys && keys.length > 0 && (
        <div className={w.keys}>
          <span className={s.muted}>Widget keys</span>
          {keys.map(k => (
            <div key={k.id} className={s.row}>
              <span className={s.rowText}><ShieldCheck size={16} /> {k.label} <span className={s.muted}>made {fmtDate(k.created_at.slice(0, 10))}{k.last_used_at ? `, last used ${fmtDate(k.last_used_at.slice(0, 10))}` : ', not used yet'}</span></span>
              {confirm === k.id
                ? <Btn sm variant="ghost" onClick={() => remove(k.id)}><Trash2 size={14} /> Tap again to switch off</Btn>
                : <Btn sm variant="ghost" onClick={() => setConfirm(k.id)}><Trash2 size={14} /> Switch off</Btn>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
