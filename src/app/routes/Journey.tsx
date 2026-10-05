'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Flag, Check, Navigation, Sun, NotebookPen, Undo2, CircleDot, PartyPopper, Smartphone } from 'lucide-react';
import type { RouteJourney, RouteLeg, RouteMode, RouteStop } from '@/lib/db';
import { distance, estimateSeconds, fmtDistance, fmtDuration, googleLegUrl, appleLegUrl, deviceId, type LatLng } from '@/lib/routing';
import s from './routes.module.css';

/** How close counts as "arrived" (plus some slack for GPS wobble). */
const ARRIVE_M = 35;

export interface JourneyPoint { stop: RouteStop; pt: LatLng; label: string }

export function journeyElapsed(j: RouteJourney, now: number): number {
  return j.elapsed_ms + (j.running_since ? Math.max(0, now - Date.parse(j.running_since)) : 0);
}

function clock(ms: number) {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

/**
 * The live part: where she is, what's next, how far to go. Works while the screen is on
 * (phones don't let websites follow you with the screen locked), so it keeps the screen awake.
 */
export default function Journey({ journey, points, legs, mode, onChange, onFinish, onPosition, notify }: {
  journey: RouteJourney;
  points: JourneyPoint[];
  legs: RouteLeg[] | null;
  mode: RouteMode;
  onChange: (j: RouteJourney) => void;
  onFinish: (notes: string) => void;
  onPosition: (p: LatLng | null, accuracy: number | null) => void;
  notify: (msg: string, color?: string) => void;
}) {
  const running = !!journey.running_since;
  const [me] = useState(deviceId);
  // Only the device she's carrying follows her position; others just show progress.
  const tracking = running && (!journey.device || journey.device === me);
  const [now, setNow] = useState(() => Date.now());
  const [pos, setPos] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [awake, setAwake] = useState(false);
  const [wantAwake, setWantAwake] = useState(true);
  const [noteDraft, setNoteDraft] = useState(journey.notes ?? '');
  const wakeRef = useRef<WakeLockSentinelLike | null>(null);
  const journeyRef = useRef(journey);
  useEffect(() => { journeyRef.current = journey; }, [journey]);

  // Clock
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Follow her position while the journey runs.
  const onPositionRef = useRef(onPosition);
  useEffect(() => { onPositionRef.current = onPosition; }, [onPosition]);
  useEffect(() => {
    if (!tracking || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(next); setGpsError(null);
        onPositionRef.current(next, next.accuracy);
      },
      err => setGpsError(err.code === err.PERMISSION_DENIED
        ? 'Location is blocked, so stops won’t tick off by themselves. Tap "I’m here" instead.'
        : 'Looking for GPS. Tap "I’m here" when you reach a stop.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  // Keep the screen awake (iOS 16.4+, most browsers), re-asking when she comes back to the app.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!tracking || !wantAwake || !nav.wakeLock) return;
    let cancelled = false;
    const grab = async () => {
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeRef.current = lock; setAwake(true);
      } catch { setAwake(false); }
    };
    grab();
    const onVis = () => { if (document.visibilityState === 'visible') grab(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
      setAwake(false);
    };
  }, [tracking, wantAwake]);

  const visited = journey.visited ?? {};
  const remaining = points.filter((p, i) => i > 0 && !visited[p.stop.id]);
  const nextIdx = points.findIndex((p, i) => i > 0 && !visited[p.stop.id]);
  const next = nextIdx > 0 ? points[nextIdx] : null;
  const prev = nextIdx > 0 ? points[nextIdx - 1] : null;
  const done = !next;

  // Arrival detection
  const markVisited = (id: string, auto = false) => {
    const j = journeyRef.current;
    if (j.visited?.[id]) return;
    onChange({ ...j, visited: { ...(j.visited ?? {}), [id]: new Date().toISOString() } });
    const p = points.find(x => x.stop.id === id);
    if (auto) {
      notify(`You reached ${p?.stop.name ?? 'the stop'}`);
      try { navigator.vibrate?.([60, 40, 60]); } catch { /* not supported */ }
    }
  };
  const unvisit = (id: string) => {
    const j = journeyRef.current;
    const v = { ...(j.visited ?? {}) };
    delete v[id];
    onChange({ ...j, visited: v });
  };

  useEffect(() => {
    if (!pos || !next || !tracking || pos.accuracy > 120) return;
    if (distance(pos, next.pt) <= ARRIVE_M + Math.min(pos.accuracy, 40)) markVisited(next.stop.id, true);
  });

  // Distance and time still to go
  const toNext = next ? (pos ? distance(pos, next.pt) * 1.2 : legs?.[nextIdx - 1]?.distance_m ?? (prev ? distance(prev.pt, next.pt) * 1.25 : 0)) : 0;
  const afterNext = legs && nextIdx > 0 ? legs.slice(nextIdx).reduce((a, l) => a + l.distance_m, 0) : 0;
  const afterNextS = legs && nextIdx > 0 ? legs.slice(nextIdx).reduce((a, l) => a + l.duration_s, 0) : 0;
  const leftM = toNext + afterNext;
  const leftS = estimateSeconds(toNext, mode) + afterNextS;
  const elapsed = journeyElapsed(journey, now);

  const toggleRun = () => {
    const j = journeyRef.current, t = Date.now();
    onChange(j.running_since
      ? { ...j, elapsed_ms: journeyElapsed(j, t), running_since: null }
      : { ...j, running_since: new Date(t).toISOString(), device: me });
    if (j.running_since) onPositionRef.current(null, null);
  };

  const saveNote = () => {
    if ((journeyRef.current.notes ?? '') === noteDraft) return;
    onChange({ ...journeyRef.current, notes: noteDraft });
  };

  const from = pos ? null : prev?.pt ?? null; // with a GPS fix, the maps app starts from where she is

  return (
    <section className={s.journey} aria-label="Journey">
      <div className={s.jHead}>
        <span className={`${s.jLive} ${running ? s.jLiveOn : ''}`}><CircleDot size={14} /> {running ? 'On the way' : 'Paused'}</span>
        <span className={s.jClock} aria-label="Time on the way">{clock(elapsed)}</span>
      </div>

      {done ? (
        <div className={s.jDone}>
          <PartyPopper size={28} />
          <p><b>You made it!</b> Every stop visited in {fmtDuration(elapsed / 1000)}.</p>
          <button type="button" className={s.primaryBtn} onClick={() => onFinish(noteDraft)}><Flag size={16} /> Finish and save</button>
        </div>
      ) : (
        <div className={s.jNext}>
          <p className={s.jNextLabel}>Next stop</p>
          <h2 className={s.jNextName}><span className={s.jBadge}>{next!.label}</span>{next!.stop.name}</h2>
          <p className={s.jStats}>
            <span><b>{fmtDistance(toNext)}</b> away</span>
            {mode === 'transit'
              ? remaining.length > 1 && <span><b>{fmtDistance(leftM)}</b> to the end, {remaining.length} stops left</span>
              : remaining.length > 1
                ? <span><b>{fmtDistance(leftM)}</b> and about <b>{fmtDuration(leftS)}</b> to the end, {remaining.length} stops left</span>
                : <span>About <b>{fmtDuration(leftS)}</b> to go</span>}
          </p>
          {next!.stop.note && <p className={s.jStopNote}>{next!.stop.note}</p>}
          <div className={s.jActions}>
            <button type="button" className={s.primaryBtn} onClick={() => markVisited(next!.stop.id)}><Check size={16} strokeWidth={2.5} /> I&rsquo;m here</button>
            <a className={s.ghostBtn} href={googleLegUrl(from, next!.pt, mode)} target="_blank" rel="noopener noreferrer"><Navigation size={15} /> Google Maps</a>
            <a className={s.ghostBtn} href={appleLegUrl(from, next!.pt, mode)} target="_blank" rel="noopener noreferrer"><Navigation size={15} /> Apple Maps</a>
          </div>
        </div>
      )}

      {gpsError && tracking && <p className={s.jWarn}>{gpsError}</p>}
      {running && !tracking && (
        <p className={s.jOther}>
          <span><Smartphone size={15} /> Following along. Your other device is keeping track of where you are.</span>
          <button type="button" className={s.linkBtn} onClick={() => onChange({ ...journeyRef.current, device: me })}>Track on this device</button>
        </p>
      )}

      <ol className={s.jList}>
        {points.map((p, i) => {
          const at = visited[p.stop.id];
          const isNext = next?.stop.id === p.stop.id;
          return (
            <li key={p.stop.id} className={`${s.jRow} ${at ? s.jRowDone : ''} ${isNext ? s.jRowNext : ''}`}>
              <span className={s.jBadgeSm}>{at && i > 0 ? <Check size={12} strokeWidth={3} /> : p.label}</span>
              <span className={s.jRowName}>{p.stop.name}</span>
              {i > 0 && (at
                ? <button type="button" className={s.jUndo} onClick={() => unvisit(p.stop.id)} aria-label={`Not there yet: ${p.stop.name}`}><Undo2 size={14} /></button>
                : <button type="button" className={s.jTick} onClick={() => markVisited(p.stop.id)} aria-label={`Mark ${p.stop.name} as visited`}><Check size={14} strokeWidth={2.5} /></button>)}
              {at && i > 0 && <time className={s.jTime}>{new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}
            </li>
          );
        })}
      </ol>

      <label className={s.jNote}>
        <span><NotebookPen size={14} /> Notes on the way</span>
        <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onBlur={saveNote} rows={2} placeholder="A cafe to come back to, a street to avoid..." />
      </label>

      <div className={s.jFoot}>
        <button type="button" className={s.ghostBtn} onClick={toggleRun}>{running ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Resume</>}</button>
        {tracking && 'wakeLock' in (typeof navigator !== 'undefined' ? navigator : {}) && (
          <button type="button" className={`${s.ghostBtn} ${wantAwake && awake ? s.ghostOn : ''}`} onClick={() => setWantAwake(w => !w)} aria-pressed={wantAwake}>
            <Sun size={15} /> {wantAwake && awake ? 'Screen stays on' : 'Keep screen on'}
          </button>
        )}
        {!done && <button type="button" className={s.ghostBtn} onClick={() => onFinish(noteDraft)}><Flag size={15} /> End journey</button>}
      </div>
    </section>
  );
}
