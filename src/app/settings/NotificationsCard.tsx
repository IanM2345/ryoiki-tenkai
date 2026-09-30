'use client';
import React, { useState, useEffect } from 'react';
import { BellRing, BellOff, Send, CheckCircle2, Cake, Mail, Smartphone, TriangleAlert, Loader2 } from 'lucide-react';
import s from './settings.module.css';
import { Btn } from '@/components/ui';
import {
  pushSupport, currentSubscription, enablePush, disablePush, sendTestPush, deviceName, type PushSupport,
} from '@/lib/push-client';

type State = 'loading' | 'on' | 'off' | 'denied';

export default function NotificationsCard({ onMessage }: { onMessage: (msg: string, color?: string) => void }) {
  const [support, setSupport] = useState<PushSupport>('unsupported');
  const [state, setState] = useState<State>('loading');
  const [device, setDevice] = useState('this device');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const sup = pushSupport();
    setSupport(sup);
    setDevice(deviceName());
    if (sup !== 'ok') { setState('off'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    currentSubscription().then(sub => setState(sub ? 'on' : 'off')).catch(() => setState('off'));
  }, []);

  const turnOn = async () => {
    setWorking(true);
    try {
      const r = await enablePush();
      if (r === 'denied') { setState('denied'); return; }
      setState('on');
      const test = await sendTestPush();
      onMessage(test.ok ? 'Notifications are on. A test is on its way.' : `Turned on, but the test failed: ${test.message}`, test.ok ? undefined : 'var(--yellow)');
    } catch {
      onMessage('Could not turn notifications on. Please try again.', 'var(--red)');
    } finally {
      setWorking(false);
    }
  };

  const turnOff = async () => {
    setWorking(true);
    try { await disablePush(); setState('off'); onMessage(`Notifications turned off on this ${device}.`); }
    catch { onMessage('Could not turn them off. Please try again.', 'var(--red)'); }
    finally { setWorking(false); }
  };

  const test = async () => {
    setWorking(true);
    const r = await sendTestPush().catch(() => ({ ok: false, message: 'The test could not be sent.' }));
    onMessage(r.message, r.ok ? undefined : 'var(--red)');
    setWorking(false);
  };

  return (
    <section className={s.card} aria-labelledby="notif-h" id="notifications">
      <div className={s.cardHead}>
        <span className={s.bigIcon}><BellRing size={22} strokeWidth={1.75} /></span>
        <div>
          <h2 id="notif-h" className={s.title}>Notifications</h2>
          <p className={s.sub}>Get a gentle nudge on your phone or iPad, even when yourworld is closed.</p>
        </div>
      </div>

      <ul className={s.what}>
        <li><Cake size={15} strokeWidth={2} /> Birthdays: 3 days before, the day before, and on the day</li>
        <li><Mail size={15} strokeWidth={2} /> Time capsule letters on the morning they unlock</li>
      </ul>

      {support === 'ios-needs-install' ? (
        <div className={s.notice}>
          <Smartphone size={18} strokeWidth={2} />
          <p>On iPhone and iPad, Apple only allows notifications from the installed app. Add yourworld to your Home Screen using the steps above, <b>open it from the Home Screen</b>, then come back to this page and turn them on.</p>
        </div>
      ) : support === 'ios-too-old' ? (
        <div className={s.notice}>
          <TriangleAlert size={18} strokeWidth={2} />
          <p>This needs iOS or iPadOS 16.4 or newer. You can update in <b>Settings → General → Software Update</b>.</p>
        </div>
      ) : support === 'not-configured' ? (
        <div className={s.notice}>
          <TriangleAlert size={18} strokeWidth={2} />
          <p>Notifications aren&apos;t set up on the server yet.</p>
        </div>
      ) : support === 'unsupported' ? (
        <div className={s.notice}>
          <TriangleAlert size={18} strokeWidth={2} />
          <p>This browser can&apos;t show notifications. Try the installed app on your iPhone or iPad.</p>
        </div>
      ) : state === 'loading' ? (
        <div className={`skeleton ${s.skelBtn}`} />
      ) : state === 'denied' ? (
        <div className={s.notice}>
          <BellOff size={18} strokeWidth={2} />
          <p>Notifications are blocked for yourworld. On iPhone or iPad, go to <b>Settings → Notifications → yourworld</b> and switch on <b>Allow Notifications</b>, then come back here.</p>
        </div>
      ) : state === 'on' ? (
        <>
          <p className={s.done}><CheckCircle2 size={18} strokeWidth={2} /> On for this {device}. They arrive at about 8 in the morning.</p>
          <div className={s.btnRow}>
            <Btn sm onClick={test} disabled={working}>{working ? <Loader2 size={15} className={s.spin} /> : <Send size={15} strokeWidth={2} />} Send a test</Btn>
            <Btn sm variant="ghost" onClick={turnOff} disabled={working}><BellOff size={15} strokeWidth={2} /> Turn off on this {device}</Btn>
          </div>
        </>
      ) : (
        <Btn onClick={turnOn} disabled={working}>
          {working ? <Loader2 size={16} className={s.spin} /> : <BellRing size={16} strokeWidth={2} />} Turn on notifications
        </Btn>
      )}
    </section>
  );
}
