'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pause, Play, Flag, Check, X, Navigation, MapPin, Eye, CornerDownLeft, SkipForward, Volume2, Sun, Sparkles, RotateCcw, PartyPopper,
} from 'lucide-react';
import { updateRoute, updateStudyCard, addStudyReview, type DbRoute, type DbStudyCard, type RouteJourney, type RouteStop, type StudyMode } from '@/lib/db';
import { distance, estimateSeconds, fmtDistance, fmtDuration, googleLegUrl, appleLegUrl, stopPoint, deviceId, type LatLng } from '@/lib/routing';
import { GRADES, fmtInterval, pathTo, schedule, type Grade, type Tree } from '@/lib/study';
import { checkAnswer, isShortAnswer, wasCorrect, type AnswerCheck, type Piece } from '@/lib/answerCheck';
import { useWakeLock, usePosition } from './useDevice';
import { canSpeak, speak, stopSpeaking, wait } from './speech';
import s from './go.module.css';

const ARRIVE_M = 35;

export interface SessionResult {
  startedAt: string;
  activeSeconds: number;
  reviewed: number;
  right: number;
  heard: number;
  stopsTotal: number;
  stopsVisited: number;
  journey: RouteJourney | null;
}

function Marked({ pieces, tone }: { pieces: Piece[]; tone: 'answer' | 'mine' }) {
  return (
    <span className={s.marked}>
      {pieces.map((p, i) => (p.key || p.hit
        ? <span key={i} className={p.hit ? s.hit : tone === 'answer' ? s.miss : s.extra}>{p.text}</span>
        : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </span>
  );
}

function clock(ms: number) {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * A study session, with the route she's walking (if any) along the top.
 * Cards: tap to flip, then one big button each for "Missed it" and "Got it".
 * Typing: type, check, accept the suggested grade. Listen: the phone reads each card out loud.
 */
export default function Session({ route, startPos, deck: initialDeck, extraIds, tree, mode, onCardSaved, onFinish, notify }: {
  route: DbRoute | null;
  startPos: LatLng | null;
  deck: DbStudyCard[];
  extraIds: Set<string>;
  tree: Tree;
  mode: StudyMode;
  onCardSaved: (c: DbStudyCard) => void;
  onFinish: (r: SessionResult) => void;
  notify: (msg: string, color?: string) => void;
}) {
  const [startedAt] = useState(() => new Date().toISOString());
  const [running, setRunning] = useState(true);
  const [banked, setBanked] = useState(0);
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const elapsed = banked + (running ? now - since : 0);

  // ── Study state ─────────────────────────────────────────
  const [deck, setDeck] = useState(initialDeck);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<AnswerCheck | null>(null);
  const [answers, setAnswers] = useState<{ grade: number; score: number | null }[]>([]);
  const [heard, setHeard] = useState(0);
  const [listening, setListening] = useState(false);
  const [phase, setPhase] = useState<'question' | 'answer'>('question');
  const [gap, setGap] = useState(5);
  const [rate, setRate] = useState(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const card = deck[pos];
  const finishedDeck = pos >= deck.length;

  // ── Route state ─────────────────────────────────────────
  const points = useMemo(() => (Array.isArray(route?.stops) ? route!.stops : [])
    .map((st, i) => ({ stop: st, i, pt: stopPoint(st, route?.journey?.start ?? startPos) }))
    .filter((x): x is { stop: RouteStop; i: number; pt: LatLng } => !!x.pt), [route, startPos]);
  const [journey, setJourney] = useState<RouteJourney | null>(() => {
    if (!route || points.length < 2) return null;
    if (route.journey) return { ...route.journey, running_since: new Date().toISOString(), device: deviceId() };
    const t = new Date().toISOString();
    return { started_at: t, elapsed_ms: 0, running_since: t, visited: { [points[0].stop.id]: t }, start: startPos, notes: '', device: deviceId() };
  });
  const journeyRef = useRef(journey);
  useEffect(() => { journeyRef.current = journey; }, [journey]);

  const saveJourney = useCallback((j: RouteJourney | null) => {
    if (!route) return;
    updateRoute(route.id, { journey: j }).catch(() => {});
  }, [route]);
  useEffect(() => { if (journey) saveJourney(journey); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { pos: here, error: gpsError } = usePosition(running && !!journey);
  const awake = useWakeLock(running);

  // clock
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const visited = journey?.visited ?? {};
  const nextIdx = points.findIndex((p, k) => k > 0 && !visited[p.stop.id]);
  const next = nextIdx > 0 ? points[nextIdx] : null;
  const toNext = next ? (here ? distance(here, next.pt) : distance(points[nextIdx - 1].pt, next.pt) * 1.25) : 0;
  const legs = route?.legs ?? null;
  const afterNext = legs && nextIdx > 0 ? legs.slice(nextIdx).reduce((a, l) => a + l.duration_s, 0) : 0;
  const leftS = next ? estimateSeconds(toNext * 1.2, route?.mode ?? 'walk') + afterNext : 0;

  const markVisited = useCallback((id: string, auto = false) => {
    const j = journeyRef.current;
    if (!j || j.visited[id]) return;
    const nj = { ...j, visited: { ...j.visited, [id]: new Date().toISOString() } };
    setJourney(nj);
    saveJourney(nj);
    if (auto) {
      const p = points.find(x => x.stop.id === id);
      notify(`You reached ${p?.stop.name ?? 'the stop'}`);
      try { navigator.vibrate?.([60, 40, 60]); } catch { /* not supported */ }
    }
  }, [points, saveJourney, notify]);

  // arrived?
  useEffect(() => {
    if (!here || !next || !running || here.accuracy > 120) return;
    if (distance(here, next.pt) <= ARRIVE_M + Math.min(here.accuracy, 40)) markVisited(next.stop.id, true);
  }, [here, next, running, markVisited]);

  // ── Grading ─────────────────────────────────────────────
  const grade = useCallback(async (g: Grade) => {
    if (!card) return;
    const nextSched = schedule(card, g);
    const score = check ? check.score : null;
    const saved = { ...card, ...nextSched };
    onCardSaved(saved);
    setAnswers(a => [...a, { grade: g, score }]);
    if (g === 1) setDeck(d => [...d, saved]); // missed: see it again later in this session
    setFlipped(false); setTyped(''); setCheck(null);
    setPos(p => p + 1);
    try {
      await Promise.all([updateStudyCard(card.id, nextSched), addStudyReview({ card_id: card.id, node_id: card.node_id, grade: g, score })]);
    } catch { notify("That answer didn't save. Check your connection.", 'var(--red)'); }
  }, [card, check, onCardSaved, notify]);

  const submitTyped = () => {
    if (!card) return;
    if (typed.trim()) setCheck(checkAnswer(typed, card.back));
    setFlipped(true);
  };

  useEffect(() => {
    if (mode === 'typing' && card && !flipped && running) inputRef.current?.focus({ preventScroll: true });
  }, [mode, card, flipped, running]);

  // ── Listening ───────────────────────────────────────────
  const listenToken = useRef(0);
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);
  const deckRef = useRef(deck);
  useEffect(() => { deckRef.current = deck; }, [deck]);
  const settings = useRef({ gap, rate });
  useEffect(() => { settings.current = { gap, rate }; }, [gap, rate]);

  const stopListening = useCallback(() => {
    listenToken.current++;
    stopSpeaking();
    setListening(false);
  }, []);

  const startListening = useCallback(async () => {
    const token = ++listenToken.current;
    setListening(true);
    while (token === listenToken.current) {
      const c = deckRef.current[posRef.current];
      if (!c) break;
      setPhase('question');
      await speak(c.front, settings.current.rate);
      if (token !== listenToken.current) return;
      await wait(settings.current.gap * 1000);
      if (token !== listenToken.current) return;
      setPhase('answer');
      await speak(c.back, settings.current.rate);
      if (token !== listenToken.current) return;
      await wait(1400);
      if (token !== listenToken.current) return;
      setHeard(h => h + 1);
      setPos(p => p + 1);
      posRef.current += 1;
    }
    if (token === listenToken.current) setListening(false);
  }, []);

  useEffect(() => () => { listenToken.current++; stopSpeaking(); }, []);

  const skip = () => {
    const wasListening = listening;
    stopListening();
    setPhase('question');
    setPos(p => p + 1);
    posRef.current += 1;
    if (wasListening) setTimeout(() => { startListening(); }, 50);
  };

  // ── Pause / finish ──────────────────────────────────────
  const toggleRun = () => {
    const t = Date.now();
    if (running) {
      setBanked(b => b + (t - since));
      stopListening();
      const j = journeyRef.current;
      if (j) { const nj = { ...j, elapsed_ms: j.elapsed_ms + (j.running_since ? t - Date.parse(j.running_since) : 0), running_since: null }; setJourney(nj); saveJourney(nj); }
    } else {
      setSince(t); setNow(t);
      const j = journeyRef.current;
      if (j) { const nj = { ...j, running_since: new Date(t).toISOString(), device: deviceId() }; setJourney(nj); saveJourney(nj); }
    }
    setRunning(r => !r);
  };

  const finish = () => {
    stopListening();
    const right = answers.filter(wasCorrect).length;
    onFinish({
      startedAt,
      activeSeconds: Math.round(elapsed / 1000),
      reviewed: answers.length,
      right,
      heard,
      stopsTotal: Math.max(0, points.length - 1),
      stopsVisited: points.filter((p, k) => k > 0 && visited[p.stop.id]).length,
      journey,
    });
  };

  const goAgain = () => {
    // another lap of the same cards, for extra practice
    setDeck(d => [...d.slice(pos), ...initialDeck]);
    setPos(0);
  };

  const where = card ? pathTo(tree, card.node_id).map(n => n.title).join(' › ') : '';
  const right = answers.filter(wasCorrect).length;
  const short = card ? isShortAnswer(card.back) : true;

  return (
    <div className={s.session}>
      {/* ── Top bar: time, pause, finish ── */}
      <div className={s.bar}>
        <span className={`${s.live} ${running ? s.liveOn : ''}`}>{running ? 'On the go' : 'Paused'}</span>
        <span className={s.clock}>{clock(elapsed)}</span>
        <span className={s.barStats}>{answers.length ? `${right}/${answers.length} right` : mode === 'listen' ? `${heard} heard` : `${Math.max(0, deck.length - pos)} to go`}</span>
        <button type="button" className={s.iconBtn} onClick={toggleRun} aria-label={running ? 'Pause' : 'Resume'}>{running ? <Pause size={18} /> : <Play size={18} />}</button>
        <button type="button" className={s.finishBtn} onClick={finish}><Flag size={15} /> Finish</button>
      </div>

      {/* ── The route, if she's walking one ── */}
      {journey && (
        <div className={s.routeStrip}>
          {next ? (
            <>
              <div className={s.rsMain}>
                <MapPin size={16} />
                <span><b>{next.stop.here ? 'Start' : next.stop.name}</b> in {fmtDistance(toNext)}<small> · about {fmtDuration(leftS)} to the end</small></span>
              </div>
              <div className={s.rsActions}>
                <button type="button" className={s.rsBtn} onClick={() => markVisited(next.stop.id)}><Check size={14} /> I&rsquo;m here</button>
                <a className={s.rsBtn} href={googleLegUrl(here ? null : points[nextIdx - 1].pt, next.pt, route!.mode)} target="_blank" rel="noopener noreferrer"><Navigation size={13} /> Google</a>
                <a className={s.rsBtn} href={appleLegUrl(here ? null : points[nextIdx - 1].pt, next.pt, route!.mode)} target="_blank" rel="noopener noreferrer"><Navigation size={13} /> Apple</a>
              </div>
              <div className={s.rsDots} aria-hidden>
                {points.map((p, k) => <span key={p.stop.id} className={`${visited[p.stop.id] ? s.dotDone : ''} ${k === nextIdx ? s.dotNext : ''}`} />)}
              </div>
            </>
          ) : (
            <div className={s.rsMain}><PartyPopper size={16} /> <span><b>You&rsquo;ve arrived.</b> Keep going or press Finish.</span></div>
          )}
          {gpsError && running && <p className={s.rsWarn}>{gpsError}</p>}
        </div>
      )}

      {!running && (
        <div className={s.pausedBox}>
          <p>Paused. Time, location and listening are stopped.</p>
          <button type="button" className={s.bigBtn} onClick={toggleRun}><Play size={18} /> Resume</button>
        </div>
      )}

      {/* ── Cards ── */}
      {running && (finishedDeck ? (
        <div className={s.deckDone}>
          <Sparkles size={26} />
          <h2>That&rsquo;s every card{initialDeck.length ? '' : ' (there were none)'}.</h2>
          <p>{answers.length ? `${right} of ${answers.length} right` : heard ? `${heard} cards heard` : ''}{journey && next ? '. Still on the way? Go round again.' : ''}</p>
          <div className={s.rowCenter}>
            {initialDeck.length > 0 && <button type="button" className={s.ghostBtn} onClick={goAgain}><RotateCcw size={15} /> Go round again</button>}
            <button type="button" className={s.bigBtn} onClick={finish}><Flag size={17} /> Finish</button>
          </div>
        </div>
      ) : card && (
        <>
          <section
            className={`${s.card} ${flipped || (mode === 'listen' && phase === 'answer') ? s.cardFlipped : ''}`}
            onClick={() => { if (mode === 'cards' && !flipped) setFlipped(true); }}
            role={mode === 'cards' && !flipped ? 'button' : undefined}
            aria-label={mode === 'cards' && !flipped ? 'Show the answer' : undefined}
          >
            <p className={s.where}>{where}{extraIds.has(card.id) && <span className={s.extraTag}>extra practice</span>}</p>
            <p className={s.front}>{card.front}</p>
            {(flipped || (mode === 'listen' && phase === 'answer')) ? (
              <>
                <hr className={s.rule} />
                {check ? (
                  <div className={s.compare}>
                    <span className={`${s.match} ${check.score >= 85 ? s.mGood : check.score >= 45 ? s.mSome : s.mLow}`}>{check.score}% match</span>
                    <p className={s.back}><Marked pieces={check.expected} tone="answer" /></p>
                    <p className={s.mine}>You wrote: <Marked pieces={check.typed} tone="mine" /></p>
                  </div>
                ) : <p className={s.back}>{card.back}</p>}
              </>
            ) : mode === 'cards' ? (
              <p className={s.tapHint}><Eye size={15} /> Tap to see the answer</p>
            ) : mode === 'typing' ? (
              <form className={s.typeForm} onSubmit={e => { e.preventDefault(); submitTyped(); }}>
                <textarea
                  ref={inputRef}
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTyped(); } }}
                  rows={short ? 1 : 3}
                  placeholder={short ? 'Type the answer' : 'Type what you remember'}
                  aria-label="Your answer"
                  autoCapitalize="off" autoComplete="off" spellCheck={false}
                />
                <button type="submit" className={s.bigBtn}><CornerDownLeft size={17} /> {typed.trim() ? 'Check' : 'Show answer'}</button>
              </form>
            ) : (
              <p className={s.tapHint}><Volume2 size={15} /> {listening ? 'Listening… think of the answer' : 'Press play to hear this card'}</p>
            )}
          </section>

          {/* answer buttons */}
          {mode === 'cards' && flipped && (
            <div className={s.twoBtns}>
              <button type="button" className={`${s.huge} ${s.hugeMiss}`} onClick={() => grade(1)}><X size={22} /> Missed it</button>
              <button type="button" className={`${s.huge} ${s.hugeGot}`} onClick={() => grade(3)}><Check size={22} /> Got it</button>
            </div>
          )}
          {mode === 'typing' && flipped && (
            <div className={s.grades}>
              {GRADES.map(g => (
                <button key={g.grade} type="button" className={`${s.gradeBtn} ${s[`g${g.grade}`]} ${check?.suggested === g.grade ? s.gradeSuggested : ''}`} onClick={() => grade(g.grade)}>
                  <b>{g.label}</b><small>{fmtInterval(schedule(card, g.grade).interval_days)}</small>
                </button>
              ))}
            </div>
          )}
          {mode === 'listen' && (
            <div className={s.listenBar}>
              {canSpeak() ? (
                <>
                  <button type="button" className={s.bigBtn} onClick={() => (listening ? stopListening() : startListening())}>
                    {listening ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Play</>}
                  </button>
                  <button type="button" className={s.ghostBtn} onClick={skip}><SkipForward size={15} /> Skip</button>
                  <label className={s.sel}>Thinking time
                    <select value={gap} onChange={e => setGap(Number(e.target.value))}>
                      {[3, 5, 8, 12].map(n => <option key={n} value={n}>{n} s</option>)}
                    </select>
                  </label>
                  <label className={s.sel}>Speed
                    <select value={rate} onChange={e => setRate(Number(e.target.value))}>
                      {[0.8, 1, 1.2, 1.4].map(n => <option key={n} value={n}>{n}×</option>)}
                    </select>
                  </label>
                </>
              ) : <p className={s.rsWarn}>This browser can&rsquo;t read text out loud.</p>}
            </div>
          )}
        </>
      ))}

      <p className={s.footNote}>
        <Sun size={13} /> {awake ? 'The screen stays on during the session.' : 'Keep the screen on: phones pause websites when locked.'}
        {mode === 'listen' && ' Listening stops if the screen locks.'}
      </p>
    </div>
  );
}
