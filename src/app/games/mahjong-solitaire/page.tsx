'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Lightbulb, Undo2, Shuffle, Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';
import GameShell, { type Difficulty } from '@/components/games/GameShell';
import Tile from '@/components/games/mahjong/Tile';
import { solitaireMatch, tileName } from '@/components/games/mahjong/tiles';
import { recordResult } from '@/lib/games';
import { ensureSession } from '@/lib/supabase';
import { newGame, buildGraph, isFree, availablePairs, reshuffle, LAYOUTS, type Game } from './engine';
import s from './solitaire.module.css';

type Level = 'easy' | 'medium' | 'hard';
const DIFFS: Difficulty[] = [
  { key: 'easy', label: 'Easy', hint: 'The smaller Pyramid. Free tiles stand out, unlimited hints, 3 shuffles' },
  { key: 'medium', label: 'Medium', hint: 'The classic Turtle, 144 tiles. 5 hints, 2 shuffles' },
  { key: 'hard', label: 'Hard', hint: 'The Turtle with no hints and one shuffle' },
];
const RULES: Record<Level, { layout: string; hints: number; shuffles: number; showFree: boolean }> = {
  easy: { layout: 'pyramid', hints: Infinity, shuffles: 3, showFree: true },
  medium: { layout: 'turtle', hints: 5, shuffles: 2, showFree: false },
  hard: { layout: 'turtle', hints: 0, shuffles: 1, showFree: false },
};

type Phase = 'play' | 'won' | 'stuck';
const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const clock = () => Date.now();
const EMPTY: Game = { layout: 'pyramid', pos: LAYOUTS.pyramid.positions, kind: LAYOUTS.pyramid.positions.map(() => 0), present: LAYOUTS.pyramid.positions.map(() => false) };

export default function MahjongSolitairePage() {
  const [level, setLevel] = useState<Level>('easy');
  // Dealt in the browser after load (a random deal on the server wouldn't match the one here).
  const [game, setGame] = useState<Game>(() => EMPTY);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const [history, setHistory] = useState<[number, number][]>([]);
  const [hintsLeft, setHintsLeft] = useState(RULES.easy.hints);
  const [shufflesLeft, setShufflesLeft] = useState(RULES.easy.shuffles);
  const [showFree, setShowFree] = useState(RULES.easy.showFree);
  const [phase, setPhase] = useState<Phase>('play');
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [gone, setGone] = useState<number[]>([]);       // tiles fading out
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [score, setScore] = useState({ won: 0, best: 0 });
  const recorded = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(0);
  const [roomH, setRoomH] = useState(0);        // screen height left below the top of the board
  const [zoom, setZoom] = useState(false);

  const graph = useMemo(() => buildGraph(game.pos), [game.pos]);
  const pairs = useMemo(() => availablePairs(game, graph), [game, graph]);
  const left = game.present.filter(Boolean).length;

  useEffect(() => {
    ensureSession().catch(() => {});
    const t = setTimeout(() => {
      // ?seed=123 replays a particular deal; ?level=medium picks the level.
      const q = new URLSearchParams(window.location.search);
      const lv = q.get('level'), seed = Number(q.get('seed'));
      const level0: Level = lv === 'medium' || lv === 'hard' ? lv : 'easy';
      if (level0 !== 'easy') { const r = RULES[level0]; setLevel(level0); setHintsLeft(r.hints); setShufflesLeft(r.shuffles); setShowFree(r.showFree); }
      setGame(newGame(RULES[level0].layout, Number.isInteger(seed) && seed > 0 ? seed : newSeed()));
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const dealt = game !== EMPTY;
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const measure = () => {
      setBoardW(el.clientWidth - 8);
      setRoomH(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 24);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    if (started === null || finishedAt !== null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [started, finishedAt]);

  const finish = useCallback((result: 'won' | 'stuck') => {
    setPhase(result);
    setFinishedAt(Date.now());
    if (result === 'won') setScore(sc => ({ ...sc, won: sc.won + 1 }));
    if (!recorded.current) {
      recorded.current = true;
      ensureSession().then(ok => { if (ok) recordResult('mahjongsol', level, result === 'won' ? 'win' : 'loss'); }).catch(() => {});
    }
  }, [level]);

  const start = useCallback((lv: Level) => {
    const r = RULES[lv];
    setGame(newGame(r.layout, newSeed()));
    setSel(null); setHint(null); setHistory([]); setGone([]);
    setHintsLeft(r.hints); setShufflesLeft(r.shuffles); setShowFree(r.showFree);
    setPhase('play'); setMsg(null); setStarted(null); setFinishedAt(null); setNow(0);
    recorded.current = false;
  }, []);

  // After every move: won, stuck, or carry on.
  useEffect(() => {
    if (phase !== 'play' || !dealt || (left > 0 && pairs.length > 0)) return;
    const t = setTimeout(() => {
      if (left === 0) finish('won');
      else if (shufflesLeft > 0) setMsg('No pairs left to take. Shuffle the tiles to keep going.');
      else finish('stuck');
    }, 0);
    return () => clearTimeout(t);
  }, [left, pairs.length, shufflesLeft, phase, finish, dealt]);

  const click = (i: number) => {
    if (phase !== 'play') return;
    if (started === null) { const t = clock(); setStarted(t); setNow(t); }
    if (!isFree(graph, i, game.present)) {
      setShake(i); setTimeout(() => setShake(x => (x === i ? null : x)), 380);
      setMsg('That tile is stuck. A tile is free when nothing is on top of it and its left or right side is open.');
      return;
    }
    setHint(null);
    if (sel === null || sel === i) { setSel(sel === i ? null : i); setMsg(null); return; }
    if (solitaireMatch(game.kind[sel], game.kind[i])) {
      const a = sel, b = i;
      setSel(null); setMsg(null);
      setGone([a, b]);
      setTimeout(() => {
        setGame(g => ({ ...g, present: g.present.map((v, k) => v && k !== a && k !== b) }));
        setHistory(h => [...h, [a, b]]);
        setGone([]);
      }, 180);
    } else {
      setSel(i);
      setMsg(`${tileName(game.kind[i])} doesn't match ${tileName(game.kind[sel])}. Picked the new one instead.`);
    }
  };

  const undo = () => {
    if (!history.length || phase === 'won') return;
    const [a, b] = history[history.length - 1];
    setGame(g => ({ ...g, present: g.present.map((v, k) => v || k === a || k === b) }));
    setHistory(h => h.slice(0, -1));
    setSel(null); setHint(null); setMsg(null);
    if (phase === 'stuck') setPhase('play');
  };
  const doHint = () => {
    if (phase !== 'play' || hintsLeft <= 0 || !pairs.length) return;
    // Prefer a pair that frees something (higher layers first).
    const best = [...pairs].sort((p, q) => (game.pos[q[0]].z + game.pos[q[1]].z) - (game.pos[p[0]].z + game.pos[p[1]].z))[0];
    setHint(best); setSel(null);
    if (hintsLeft !== Infinity) setHintsLeft(n => n - 1);
  };
  const doShuffle = () => {
    if (phase !== 'play' || shufflesLeft <= 0) return;
    setGame(g => reshuffle(g, newSeed()));
    setShufflesLeft(n => n - 1);
    setSel(null); setHint(null); setMsg('Shuffled. Every arrangement can still be cleared.');
  };

  // ── board geometry ───────────────────────────────
  const geo = useMemo(() => {
    const xs = game.pos.map(p => p.x), ys = game.pos.map(p => p.y), zs = game.pos.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 2, minY = Math.min(...ys), maxY = Math.max(...ys) + 2, maxZ = Math.max(...zs);
    const spanX = maxX - minX, spanY = maxY - minY;
    // A tile is 2 units wide; each layer is lifted up and left by LIFT of a tile so the stack reads.
    const LIFT = 0.17;
    const across = spanX + maxZ * LIFT * 2 + 0.3;               // in units
    const down = (spanY / 2) * (8 / 3) + maxZ * LIFT * 2 + 0.3;  // tile height = 8/3 units
    const byW = boardW > 0 ? boardW / across : 20;
    const byH = roomH > 260 ? roomH / down : Infinity;
    // Fit the screen; with "Bigger tiles" on, keep tiles at least ~36px wide and let the board scroll.
    const unit = zoom ? Math.max(18, Math.min(byW, 34)) : Math.min(byW, byH, 34);
    const tw = unit * 2, th = tw * 4 / 3, lift = tw * LIFT;
    return { minX, minY, tw, th, lift, w: spanX * unit + maxZ * lift + tw * 0.15, h: (spanY / 2) * th + maxZ * lift + tw * 0.15, maxZ };
  }, [game.pos, boardW, roomH, zoom]);

  const order = useMemo(() => game.pos.map((_, i) => i).sort((a, b) => {
    const p = game.pos[a], q = game.pos[b];
    return p.z - q.z || p.y - q.y || p.x - q.x;
  }), [game.pos]);

  // On a narrow screen the Turtle's tiles get small: offer a zoom.
  const small = geo.tw < 34 && boardW < 700;
  const elapsed = started === null ? 0 : Math.floor(((finishedAt ?? now) - started) / 1000);
  const statusText =
    phase === 'won' ? `Cleared in ${fmtTime(elapsed)}! Every tile matched.` :
    phase === 'stuck' ? 'No pairs left and no shuffles. Good try. Start a new game?' :
    msg ?? (sel !== null ? `Now pick another ${tileName(game.kind[sel])}${game.kind[sel] >= 34 ? ' (any ' + (game.kind[sel] >= 38 ? 'season' : 'flower') + ' matches)' : ''}.` :
      'Tap two matching free tiles to take them off. Clear the board to win.');
  const tone = phase === 'won' ? 'good' : phase === 'stuck' ? 'bad' : msg?.startsWith('That tile') ? 'info' : 'neutral';

  return (
    <GameShell
      title="Mahjong Solitaire"
      subtitle={`${LAYOUTS[game.layout].name} layout · match pairs of free tiles`}
      icon={<Layers size={22} strokeWidth={2} />}
      difficulties={DIFFS}
      difficulty={level}
      onDifficulty={k => { setLevel(k as Level); start(k as Level); }}
      score={[
        { label: 'Tiles left', value: left },
        { label: 'Pairs open', value: pairs.length, tone: pairs.length === 0 ? 'loss' : undefined },
        { label: 'Time', value: fmtTime(elapsed) },
        { label: 'Cleared', value: score.won, tone: 'win' },
      ]}
      status={statusText}
      statusTone={tone}
      onNewGame={() => start(level)}
      tutorial="mahjong-solitaire"
      rules={<>
        <p><b>Goal:</b> clear every tile from the board, two at a time.</p>
        <p><b>Free tiles:</b> you can only take a tile that has nothing on top of it and is open on its left or right side.</p>
        <p><b>Pairs:</b> tap two free tiles that match. Any flower matches any flower, and any season matches any season.</p>
        <p><b>Stuck?</b> Use a hint, undo, or shuffle the tiles left on the board. Every deal and every shuffle can be cleared.</p>
        <p>The little number or letter in each corner tells you what the tile is: E S W N are the winds, R G W the dragons.</p>
      </>}
    >
      <div className={s.tools}>
        <button type="button" onClick={doHint} disabled={phase !== 'play' || hintsLeft <= 0 || !pairs.length}>
          <Lightbulb size={16} /> Hint{hintsLeft !== Infinity ? ` (${hintsLeft})` : ''}
        </button>
        <button type="button" onClick={undo} disabled={!history.length || phase === 'won'}><Undo2 size={16} /> Undo</button>
        <button type="button" onClick={doShuffle} disabled={phase !== 'play' || shufflesLeft <= 0}><Shuffle size={16} /> Shuffle ({shufflesLeft})</button>
        <button type="button" onClick={() => setShowFree(v => !v)} aria-pressed={showFree} className={showFree ? s.on : ''}>
          {showFree ? <Eye size={16} /> : <EyeOff size={16} />} Free tiles
        </button>
        {small && (
          <button type="button" onClick={() => setZoom(z => !z)} aria-pressed={zoom} className={zoom ? s.on : ''}>
            {zoom ? <ZoomOut size={16} /> : <ZoomIn size={16} />} {zoom ? 'Fit board' : 'Bigger tiles'}
          </button>
        )}
      </div>
      {small && !zoom && <p className={s.tip}>Small tiles? Turn your phone sideways, or tap Bigger tiles and scroll the board.</p>}
      <div ref={boardRef} className={`${s.boardWrap} ${zoom ? s.zoomed : ''}`}>
        <div className={s.board} style={{ width: geo.w, height: geo.h }}>
          {order.map(i => {
            if (!game.present[i]) return null;
            const p = game.pos[i];
            const free = isFree(graph, i, game.present);
            const state = sel === i ? 'selected' : hint && (hint[0] === i || hint[1] === i) ? 'hint' : showFree && !free ? 'blocked' : 'normal';
            return (
              <Tile
                key={i}
                domId={`mjs-${i}`}
                kind={game.kind[i]}
                width={geo.tw}
                state={state}
                onClick={() => click(i)}
                disabled={phase !== 'play'}
                className={`${s.placed} ${shake === i ? s.shake : ''} ${gone.includes(i) ? s.gone : ''} ${free ? s.free : ''}`}
                style={{
                  left: ((p.x - geo.minX) / 2) * geo.tw + (geo.maxZ - p.z) * geo.lift,
                  top: ((p.y - geo.minY) / 2) * geo.th + (geo.maxZ - p.z) * geo.lift,
                  zIndex: p.z * 1000 + p.y * 20 + p.x + 50,
                  ['--zs' as string]: `${2 + p.z * 3}px`,
                }}
              />
            );
          })}
        </div>
      </div>
      {phase === 'won' && <div className={s.banner}>Cleared in {fmtTime(elapsed)} <button type="button" onClick={() => start(level)}>Play again</button></div>}
      {phase === 'stuck' && <div className={`${s.banner} ${s.bannerBad}`}>No moves left <button type="button" onClick={() => start(level)}>New game</button></div>}
    </GameShell>
  );
}
