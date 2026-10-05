'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Footprints, Route as RouteIcon, Layers, Keyboard, Headphones, Play, Check, ChevronDown, ChevronRight, Music, ExternalLink, Clock,
  Loader2, Trash2, GraduationCap, PartyPopper, MapPin, Bike, Car, TramFront, Ban,
} from 'lucide-react';
import { Btn, Topbar, EmptyState, Toast, useToast, Modal, Confirm } from '@/components/ui';
import {
  getRoutes, updateRoute, addRouteTrip, getStudySessions, addStudySession, deleteStudySession,
  type DbRoute, type DbStudyCard, type DbStudySession, type RouteMode, type StudyMode,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { fmtDistance, fmtDuration, getPosition, routeTitle, type LatLng } from '@/lib/routing';
import { isDue, linkKind, subtreeIds, SUBJECT_COLORS, subjectOf } from '@/lib/study';
import { localDateStr, relDay } from '@/lib/dates';
import { useStudy } from '../learn/useStudy';
import Session, { type SessionResult } from './Session';
import s from './go.module.css';

const MODE_ICON: Record<RouteMode, typeof Footprints> = { walk: Footprints, cycle: Bike, drive: Car, transit: TramFront };
const STUDY_MODES: { key: StudyMode; label: string; Icon: typeof Layers; blurb: string }[] = [
  { key: 'cards', label: 'Flashcards', Icon: Layers, blurb: 'Tap to flip, then one big button: Got it or Missed it. Easy with one hand.' },
  { key: 'typing', label: 'Type answers', Icon: Keyboard, blurb: 'Type each answer and see how close you were. Best sitting on a bus or train.' },
  { key: 'listen', label: 'Listen', Icon: Headphones, blurb: 'Your phone reads each question, gives you time to think, then reads the answer. Keep the screen on.' },
];

type Phase = 'plan' | 'run' | 'done';

function whenLabel(iso: string) {
  const d = relDay(localDateStr(new Date(iso)));
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export default function OnTheGoPage() {
  const [toast, show] = useToast();
  const onError = useCallback((m: string) => show(m, 'var(--red)'), [show]);
  const study = useStudy(onError);
  const { tree, stats, cards, setCards, resources, loading: studyLoading, missing } = study;

  const [routes, setRoutes] = useState<DbRoute[]>([]);
  const [sessions, setSessions] = useState<DbStudySession[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [sessionsMissing, setSessionsMissing] = useState(false);

  const [routeId, setRouteId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<StudyMode>('cards');
  const [phase, setPhase] = useState<Phase>('plan');
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<{ deck: DbStudyCard[]; extra: Set<string>; route: DbRoute | null; startPos: LatLng | null } | null>(null);
  const [result, setResult] = useState<(SessionResult & { saved: boolean }) | null>(null);
  const [delItem, setDelItem] = useState<DbStudySession | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [r, ss] = await Promise.all([
          getRoutes().catch(() => [] as DbRoute[]),
          getStudySessions().catch(e => { if (/does not exist|schema cache|Could not find/i.test(e?.message ?? '')) setSessionsMissing(true); return [] as DbStudySession[]; }),
        ]);
        setRoutes(r.filter(x => !x.archived));
        setSessions(ss);
        // Came from a route's "Study on the way" button, or a journey is already running
        const wanted = new URLSearchParams(window.location.search).get('route');
        const pick = r.find(x => x.id === wanted && !x.archived) ?? r.find(x => x.journey && !x.archived);
        if (pick) setRouteId(pick.id);
      } finally { setLoadingRoutes(false); }
    })();
  }, []);

  const subjects = useMemo(() => tree.children.get(null) ?? [], [tree]);
  const colorOf = (id: string) => {
    const subj = subjectOf(tree, id);
    return subj?.color ?? SUBJECT_COLORS[subjects.findIndex(x => x.id === subj?.id) % SUBJECT_COLORS.length] ?? SUBJECT_COLORS[0];
  };
  const route = routes.find(r => r.id === routeId) ?? null;

  // Everything she ticked, including what's inside
  const scope = useMemo(() => {
    const out = new Set<string>();
    for (const id of picked) for (const x of subtreeIds(tree, id)) out.add(x);
    return out;
  }, [picked, tree]);
  const scopeCards = cards.filter(c => scope.has(c.node_id));
  const [planAt] = useState(() => Date.now());
  const dueCount = scopeCards.filter(c => isDue(c, planAt)).length;
  const minutes = route?.duration_s ? Math.round(route.duration_s / 60) : null;
  const target = minutes ? Math.min(80, Math.max(10, Math.round(minutes * (mode === 'listen' ? 2.5 : 3)))) : 30;
  const playlists = resources.filter(r => scope.has(r.node_id) && linkKind(r.url) === 'music');

  const toggle = (id: string) => setPicked(p => { const x = new Set(p); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const toggleOpen = (id: string) => setOpen(p => { const x = new Set(p); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const pickDue = () => setPicked(new Set(subjects.filter(sj => (stats.get(sj.id)?.due ?? 0) > 0).map(sj => sj.id)));

  // ── Start ──────────────────────────────────────────────
  const start = async () => {
    if (!scopeCards.length || starting) return;
    setStarting(true);
    const now = Date.now();
    const due = scopeCards.filter(c => isDue(c, now)).sort((a, b) => a.due_at.localeCompare(b.due_at));
    // Not enough due for the whole walk? Add the weakest of the rest as extra practice.
    const rest = scopeCards.filter(c => !isDue(c, now)).sort((a, b) => a.interval_days - b.interval_days || (a.last_reviewed_at ?? '').localeCompare(b.last_reviewed_at ?? ''));
    const extra = rest.slice(0, Math.max(0, target - due.length));
    let startPos: LatLng | null = null;
    if (route && !route.journey && (route.stops ?? []).some(x => x.here)) {
      try { const p = await getPosition(); startPos = { lat: p.lat, lng: p.lng }; }
      catch (e) { show(e instanceof Error ? e.message : "Couldn't find your location.", 'var(--yellow)'); }
    }
    setRun({ deck: [...due, ...extra], extra: new Set(extra.map(c => c.id)), route, startPos });
    setPhase('run');
    setStarting(false);
    window.scrollTo({ top: 0 });
  };

  // ── Finish ─────────────────────────────────────────────
  const finish = async (r: SessionResult) => {
    setPhase('done');
    setResult({ ...r, saved: false });
    const names = [...picked].map(id => tree.byId.get(id)?.title).filter((x): x is string => !!x);
    let saved = true;
    try {
      const sess = await addStudySession({
        route_id: run?.route?.id ?? null, route_name: run?.route ? routeTitle(run.route) : null,
        node_ids: [...picked], topic_names: names, mode, started_at: r.startedAt, ended_at: new Date().toISOString(),
        active_seconds: r.activeSeconds, cards_reviewed: r.reviewed, cards_right: r.right, cards_heard: r.heard,
        stops_total: r.stopsTotal, stops_visited: r.stopsVisited,
      });
      setSessions(l => [sess, ...l]);
    } catch { saved = false; }
    // The walk counts as a journey on the route too
    const rt = run?.route;
    if (rt && r.journey) {
      try {
        let lastVisited = 0;
        (rt.stops ?? []).forEach((st, i) => { if (i > 0 && r.journey!.visited[st.id]) lastVisited = i; });
        const dist = (rt.legs ?? []).slice(0, lastVisited).reduce((a, l) => a + l.distance_m, 0);
        const ended = new Date().toISOString();
        await addRouteTrip({
          route_id: rt.id, route_name: routeTitle(rt), mode: rt.mode, started_at: r.journey.started_at, ended_at: ended,
          active_seconds: r.activeSeconds, distance_m: dist || null, stops_total: r.stopsTotal, stops_visited: r.stopsVisited,
          notes: `Studied ${names.join(', ') || 'on the way'}${r.reviewed ? `: ${r.right} of ${r.reviewed} right` : ''}`,
        });
        await updateRoute(rt.id, { journey: null, last_done_at: ended });
        setRoutes(l => l.map(x => (x.id === rt.id ? { ...x, journey: null, last_done_at: ended } : x)));
      } catch { saved = false; }
    }
    setResult(x => (x ? { ...x, saved } : x));
    if (!saved) show("Some of this session didn't save. Check your connection.", 'var(--red)');
  };

  const removeSession = async () => {
    const item = delItem;
    if (!item) return;
    setDelItem(null);
    const before = sessions;
    setSessions(l => l.filter(x => x.id !== item.id));
    try { await deleteStudySession(item.id); } catch { setSessions(before); show('Could not delete that.', 'var(--red)'); }
  };

  const loading = studyLoading || loadingRoutes;

  // ── Running ────────────────────────────────────────────
  if (phase === 'run' && run) {
    return (
      <div className={s.page}>
        <div className={`${s.wrap} ${s.wrapRun}`}>
          <Session
            route={run.route}
            startPos={run.startPos}
            deck={run.deck}
            extraIds={run.extra}
            tree={tree}
            mode={mode}
            onCardSaved={c => setCards(l => l.map(x => (x.id === c.id ? c : x)))}
            onFinish={finish}
            notify={show}
          />
        </div>
        {toast && <Toast msg={toast.msg} color={toast.color} />}
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Topbar
        title="On the Go"
        sub="Revise while you walk, ride or wait"
        maxWidth={900}
      />
      <div className={`${s.wrap} ${s.wrapPlan}`}>
        {phase === 'done' && result && (
          <section className={s.summary}>
            <PartyPopper size={30} />
            <h2>Session done</h2>
            <div className={s.sumGrid}>
              <div><b>{fmtDuration(result.activeSeconds)}</b><span>on the go</span></div>
              {result.reviewed > 0 && <div><b>{Math.round((result.right / result.reviewed) * 100)}%</b><span>{result.right} of {result.reviewed} right</span></div>}
              {result.heard > 0 && <div><b>{result.heard}</b><span>cards heard</span></div>}
              {result.stopsTotal > 0 && <div><b>{result.stopsVisited}/{result.stopsTotal}</b><span>stops reached</span></div>}
            </div>
            <p>{result.saved ? 'Saved. Missed cards come back sooner; the walk is in the route’s past journeys.' : 'Saving…'}</p>
            <Btn onClick={() => { setPhase('plan'); setResult(null); }}>Plan another</Btn>
          </section>
        )}

        {loading ? (
          <div className={`skeleton ${s.skel}`} />
        ) : missing ? (
          <EmptyState icon={<GraduationCap size={26} />} msg="On the Go needs the Learn database update first. See DEPLOY.md." />
        ) : subjects.length === 0 ? (
          <EmptyState icon={<GraduationCap size={26} />} msg="Add a subject and some flashcards in Learn first. Then come back to revise them on the go." action={<Link href="/learn" className={s.ghostBtn}><GraduationCap size={15} /> Go to Learn</Link>} />
        ) : phase === 'plan' && (
          <>
            {/* 1. Where */}
            <section className={s.step}>
              <h2 className={s.stepH}><span>1</span> Where are you going?</h2>
              <div className={s.routeList} role="radiogroup" aria-label="Route">
                <button type="button" role="radio" aria-checked={!routeId} className={`${s.routeOpt} ${!routeId ? s.optOn : ''}`} onClick={() => setRouteId(null)}>
                  <span className={s.routeIcon}><Ban size={18} /></span>
                  <span className={s.routeText}><b>No route</b><small>Just study, for about 30 cards</small></span>
                </button>
                {routes.map(r => {
                  const Icon = MODE_ICON[r.mode] ?? Footprints;
                  return (
                    <button key={r.id} type="button" role="radio" aria-checked={routeId === r.id} className={`${s.routeOpt} ${routeId === r.id ? s.optOn : ''}`} onClick={() => setRouteId(r.id)}>
                      <span className={s.routeIcon}><Icon size={18} /></span>
                      <span className={s.routeText}>
                        <b>{routeTitle(r)}{r.journey && <em className={s.liveTag}>in progress</em>}</b>
                        <small>{[r.duration_s && r.mode !== 'transit' ? fmtDuration(r.duration_s) : null, r.distance_m ? fmtDistance(r.distance_m) : null, `${Math.max(0, (r.stops ?? []).length - 1)} stops`].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button>
                  );
                })}
                <Link href="/routes/new" className={s.routeNew}><RouteIcon size={16} /> Plan a new route</Link>
              </div>
            </section>

            {/* 2. What */}
            <section className={s.step}>
              <h2 className={s.stepH}><span>2</span> What do you want to revise?</h2>
              <div className={s.topicTools}>
                <button type="button" className={s.linkBtn} onClick={pickDue}>Everything with cards due</button>
                {picked.size > 0 && <button type="button" className={s.linkBtn} onClick={() => setPicked(new Set())}>Clear</button>}
              </div>
              <ul className={s.topics}>
                {subjects.map(sj => {
                  const kids = tree.children.get(sj.id) ?? [];
                  const st = stats.get(sj.id);
                  const on = picked.has(sj.id);
                  return (
                    <li key={sj.id} className={s.topicGroup} style={{ ['--c' as string]: colorOf(sj.id) }}>
                      <div className={s.topicRow}>
                        <button type="button" className={`${s.chk} ${on ? s.chkOn : ''}`} onClick={() => toggle(sj.id)} aria-pressed={on}>
                          <span className={s.box}>{on && <Check size={13} strokeWidth={3} />}</span>
                          <b>{sj.title}</b>
                          <small>{st?.cards ?? 0} {(st?.cards ?? 0) === 1 ? 'card' : 'cards'}{st?.due ? `, ${st.due} due` : ''}</small>
                        </button>
                        {kids.length > 0 && (
                          <button type="button" className={s.iconBtn} onClick={() => toggleOpen(sj.id)} aria-expanded={open.has(sj.id)} aria-label={`Topics in ${sj.title}`}>
                            {open.has(sj.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                      </div>
                      {open.has(sj.id) && (
                        <div className={s.subChips}>
                          {kids.map(k => {
                            const ks = stats.get(k.id);
                            const kOn = picked.has(k.id) || on;
                            return (
                              <button key={k.id} type="button" disabled={on} className={`${s.chip} ${kOn ? s.chipOn : ''}`} onClick={() => toggle(k.id)} aria-pressed={kOn}>
                                {k.title}{ks?.cards ? <small>{ks.due ? `${ks.due} due` : ks.cards}</small> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 3. How */}
            <section className={s.step}>
              <h2 className={s.stepH}><span>3</span> How?</h2>
              <div className={s.modes} role="radiogroup" aria-label="How to revise">
                {STUDY_MODES.map(m => (
                  <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={`${s.modeOpt} ${mode === m.key ? s.optOn : ''}`} onClick={() => setMode(m.key)}>
                    <m.Icon size={20} />
                    <b>{m.label}</b>
                    <small>{m.blurb}</small>
                  </button>
                ))}
              </div>
            </section>

            {playlists.length > 0 && (
              <section className={s.music}>
                <p><Music size={15} /> Your study playlists</p>
                {playlists.map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> {p.title || 'Playlist'}</a>
                ))}
              </section>
            )}

            <div className={s.startBar}>
              <p>
                {!picked.size ? 'Pick at least one subject or topic.'
                  : !scopeCards.length ? 'No flashcards in those yet. Add some in Learn.'
                  : <>{route && minutes ? <>About <b>{minutes} min</b> {route.mode === 'walk' ? 'walking' : 'on the way'}. </> : null}<b>{dueCount}</b> due{scopeCards.length > dueCount ? <>, topped up to about <b>{Math.min(scopeCards.length, Math.max(dueCount, target))}</b> with extra practice</> : null}.</>}
              </p>
              <button type="button" className={s.startBtn} onClick={start} disabled={!scopeCards.length || starting}>
                {starting ? <Loader2 size={18} className={s.spin} /> : <Play size={18} />} {route ? 'Start the journey' : 'Start'}
              </button>
            </div>

            {/* History */}
            {sessions.length > 0 && (
              <section className={s.history}>
                <h2 className={s.historyH}><Clock size={16} /> My journeys</h2>
                <ul>
                  {sessions.slice(0, 10).map(x => (
                    <li key={x.id}>
                      <div>
                        <b>{whenLabel(x.ended_at)}</b>
                        {x.route_name && <span><MapPin size={12} /> {x.route_name}</span>}
                        <small>{x.topic_names.join(', ') || 'Study'} · {fmtDuration(x.active_seconds)}{x.cards_reviewed ? ` · ${x.cards_right}/${x.cards_reviewed} right` : ''}{x.cards_heard ? ` · ${x.cards_heard} heard` : ''}</small>
                      </div>
                      <button type="button" className={s.iconBtn} onClick={() => setDelItem(x)} aria-label="Delete this session"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {sessionsMissing && <p className={s.note}>Your sessions will be listed here once the On the Go database update is applied.</p>}
          </>
        )}
      </div>
      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg="Delete this session from your history? Your flashcard progress stays." onConfirm={removeSession} onCancel={() => setDelItem(null)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
