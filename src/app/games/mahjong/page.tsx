'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Hand, Trophy } from 'lucide-react';
import GameShell, { type Difficulty } from '@/components/games/GameShell';
import Tile from '@/components/games/mahjong/Tile';
import { tileName, type Kind } from '@/components/games/mahjong/tiles';
import { recordResult } from '@/lib/games';
import { ensureSession } from '@/lib/supabase';
import {
  newHand, discard, resolveClaims, declareKong, declareWin, claimOptions, selfOptions, bestDiscard, aiClaim, aiSelf,
  counts, shanten, waits, seatWind, WIND_NAME, SEAT_NAME, type State, type Seat, type Level, type Claim, type Meld, type T,
} from './engine';
import s from './mahjong.module.css';

const DIFFS: Difficulty[] = [
  { key: 'easy', label: 'Easy', hint: 'Relaxed computer players. You get a suggested discard and see what you are waiting for' },
  { key: 'medium', label: 'Medium', hint: 'Solid computer players. You still see what you are waiting for' },
  { key: 'hard', label: 'Hard', hint: 'Sharp computer players who play safe when someone is close. No hints' },
];
const AI_DELAY = 750, CLAIM_DELAY = 450;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const OPP: Seat[] = [3, 2, 1]; // shown left, across, right
const SHORT = ['You', 'Right', 'Across', 'Left'];

function MeldRow({ melds, w }: { melds: Meld[]; w: number }) {
  if (!melds.length) return null;
  return (
    <div className={s.melds}>
      {melds.map((m, i) => (
        <span key={i} className={s.meld} title={`${m.concealed ? 'Concealed ' : ''}${m.type}`}>
          {m.tiles.map((t, j) => (
            <Tile key={t.id} kind={t.kind} width={w} faceDown={m.concealed && (j === 0 || j === 3)} state={t.id === m.claimed ? 'claim' : 'normal'} />
          ))}
        </span>
      ))}
    </div>
  );
}
function River({ tiles, claimed, last, w }: { tiles: T[]; claimed: number[]; last: number | null; w: number }) {
  return (
    <div className={s.river}>
      {tiles.map((t, i) => (
        <Tile key={t.id} kind={t.kind} width={w} state={t.id === last ? 'selected' : 'normal'} className={claimed.includes(i) ? s.taken : ''} />
      ))}
    </div>
  );
}

export default function MahjongPage() {
  const [level, setLevel] = useState<Level>('easy');
  const [st, setSt] = useState<State | null>(null);
  const [dealer, setDealer] = useState<Seat>(0);
  const [sel, setSel] = useState<number | null>(null);
  const [tally, setTally] = useState({ won: 0, lost: 0, drawn: 0 });
  const [handW, setHandW] = useState(46);
  const handRef = useRef<HTMLDivElement>(null);
  const recorded = useRef(false);

  const start = useCallback((d: Seat) => {
    setSt(newHand(d, newSeed())); setSel(null); recorded.current = false;
  }, []);
  useEffect(() => {
    ensureSession().catch(() => {});
    // Dealt in the browser. ?seed=123 replays a particular deal; ?level=medium picks the level.
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const lv = q.get('level');
      if (lv === 'easy' || lv === 'medium' || lv === 'hard') setLevel(lv);
      const seed = Number(q.get('seed'));
      if (Number.isInteger(seed) && seed > 0) { setSt(newHand(0, seed)); recorded.current = false; } else start(0);
    }, 0);
    return () => clearTimeout(t);
  }, [start]);

  const dealtYet = st !== null;
  // Size your tiles to fit 14 in a row.
  useEffect(() => {
    const el = handRef.current; if (!el) return;
    // 14 tiles plus the gap before the drawn tile, with 2-3px between tiles.
    // Wide: 14 in a row. Narrow (phones): two rows of 7, so tiles stay big enough to tap.
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, perRow = w < 520 ? 7 : 14.2;
      setHandW(Math.max(20, Math.min(54, Math.floor((w - 12 - perRow * 3) / perRow))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [dealtYet]);

  // ── the computer players take their turns ─────────────────────
  const human = useMemo(() => (st && st.phase === 'claim' && st.last!.from !== 0 ? claimOptions(st, 0) : null), [st]);
  const humanCanClaim = !!human && (human.win || human.pung || human.kong || human.chows.length > 0);
  const aiClaims = useCallback((x: State): Claim[] => {
    const out: Claim[] = [];
    for (const seat of [1, 2, 3] as Seat[]) {
      if (seat === x.last!.from) continue;
      const c = aiClaim(x, seat, level);
      if (c) out.push(c);
    }
    return out;
  }, [level]);

  useEffect(() => {
    if (!st || st.phase === 'over') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    if (st.phase === 'discard' && st.turn !== 0) {
      t = setTimeout(() => {
        const seat = st.turn;
        const self = aiSelf(st, seat, level);
        if (self?.type === 'win') setSt(declareWin(st, seat, true));
        else if (self?.type === 'kong') setSt(declareKong(st, seat, self.kind));
        else setSt(discard(st, seat, bestDiscard(st, seat, level).id));
      }, AI_DELAY);
    } else if (st.phase === 'claim' && !humanCanClaim) {
      t = setTimeout(() => setSt(resolveClaims(st, aiClaims(st))), CLAIM_DELAY);
    }
    return () => clearTimeout(t);
  }, [st, level, humanCanClaim, aiClaims]);

  // ── end of hand ───────────────────────────────────────────────
  useEffect(() => {
    if (!st || st.phase !== 'over' || recorded.current) return;
    recorded.current = true;
    const result = st.win ? (st.win.seat === 0 ? 'win' : 'loss') : 'draw';
    const t = setTimeout(() => setTally(x => ({ won: x.won + (result === 'win' ? 1 : 0), lost: x.lost + (result === 'loss' ? 1 : 0), drawn: x.drawn + (result === 'draw' ? 1 : 0) })), 0);
    ensureSession().then(ok => { if (ok) recordResult('mahjong', level, result); }).catch(() => {});
    return () => clearTimeout(t);
  }, [st, level]);

  // ── your moves ────────────────────────────────────────────────
  const myTurn = !!st && st.phase === 'discard' && st.turn === 0;
  const self = useMemo(() => (st && myTurn ? selfOptions(st, 0) : null), [st, myTurn]);
  const suggestion = useMemo(() => (st && myTurn && level === 'easy' ? bestDiscard(st, 0, 'medium').id : null), [st, myTurn, level]);
  const me = st?.players[0];
  const ready = useMemo(() => {
    if (!st || !me || level === 'hard') return null;
    const c = counts(me.hand);
    if (me.hand.length % 3 !== 1) return null;   // only when holding 13 (not mid-turn)
    if (shanten(c, me.melds.length) !== 0) return null;
    const seen = new Array<number>(34).fill(0);
    st.players.forEach((p, i) => { p.river.forEach(t => seen[t.kind]++); p.melds.forEach(m => m.tiles.forEach(t => seen[t.kind]++)); if (i !== 0) return; });
    return waits(c, me.melds.length, seen);
  }, [st, me, level]);

  const tapTile = (t: T) => {
    if (!st || !myTurn) return;
    if (sel === t.id) { setSt(discard(st, 0, t.id)); setSel(null); }
    else setSel(t.id);
  };
  const doClaim = (c: Claim | null) => {
    if (!st) return;
    const claims = aiClaims(st);
    if (c) claims.push(c);
    setSt(resolveClaims(st, claims));
  };

  if (!st || !me) {
    return <GameShell title="Mahjong" subtitle="Dealing…" icon={<Dices size={22} strokeWidth={2} />}><div className={s.table} /></GameShell>;
  }

  const lastId = st.last?.tile.id ?? null;
  const drawnId = st.turn === 0 ? st.drawn?.id : undefined;
  const handTiles = me.hand.filter(t => t.id !== drawnId);
  const drawnTile = me.hand.find(t => t.id === drawnId);
  const wind = (seat: Seat) => WIND_NAME[seatWind(st, seat)];

  const statusText = (() => {
    if (st.phase === 'over') return st.win ? (st.win.seat === 0 ? `Mahjong! You win with ${st.win.faan} faan.` : `${SEAT_NAME[st.win.seat]} wins this hand.`) : 'The wall ran out. This hand is a draw.';
    if (humanCanClaim) {
      const what = [human!.win && 'win with it', (human!.pung || human!.kong) && 'pung it', human!.chows.length && 'chow it'].filter(Boolean).join(', or ');
      return `${SEAT_NAME[st.last!.from]} threw ${tileName(st.last!.tile.kind)}. You can ${what}.`;
    }
    if (myTurn) {
      if (self?.win) return 'Your hand is complete! Tap Mahjong to win.';
      return sel !== null ? 'Tap it again to throw it away.' : 'Your turn: tap a tile, then tap it again to discard it.';
    }
    if (st.phase === 'claim') return `${SEAT_NAME[st.last!.from]} threw ${tileName(st.last!.tile.kind)}.`;
    return `${SEAT_NAME[st.turn]} is thinking…`;
  })();
  const tone = st.phase === 'over' ? (st.win?.seat === 0 ? 'good' : st.win ? 'bad' : 'neutral') : humanCanClaim || self?.win ? 'info' : 'neutral';

  return (
    <GameShell
      title="Mahjong"
      subtitle={`East round · you are ${wind(0)} wind${st.dealer === 0 ? ' (dealer)' : ''}`}
      icon={<Dices size={22} strokeWidth={2} />}
      difficulties={DIFFS}
      difficulty={level}
      onDifficulty={k => { setLevel(k as Level); start(dealer); }}
      score={[
        { label: 'Wall', value: st.wall.length },
        { label: 'Won', value: tally.won, tone: 'win' },
        { label: 'Lost', value: tally.lost, tone: 'loss' },
        { label: 'Draws', value: tally.drawn, tone: 'draw' },
      ]}
      status={statusText}
      statusTone={tone}
      onNewGame={() => start(dealer)}
      tutorial="mahjong"
      rules={<>
        <p><b>Goal:</b> be first to make a complete hand: <b>four sets and a pair</b> (14 tiles). A set is a <b>Chow</b> (three in a row of one suit, like 3-4-5 Dots) or a <b>Pung</b> (three the same). Four the same is a <b>Kong</b> and counts as a set (you draw an extra tile).</p>
        <p><b>Your turn:</b> you draw a tile, then throw one away. Tap a tile, then tap it again to discard.</p>
        <p><b>Claiming:</b> when someone throws a tile you need, you can take it. Anyone can claim for a Pung, Kong or to win; only the next player can claim for a Chow. Winning beats everything, and Pung beats Chow. Claimed sets are shown face up.</p>
        <p><b>Special hands:</b> seven pairs, or thirteen orphans (one of each 1 and 9 plus every wind and dragon, with one pair).</p>
        <p><b>Faan (points):</b> self-drawn +1, concealed hand +1, all chows +1, a pung of dragons or your wind +1 each, all pungs +3, one suit with honours +3, a single suit +7, seven pairs +4. Any complete hand wins.</p>
        <p>The wall shows how many tiles are left. If it runs out, the hand is a draw. The dealer moves round after each hand.</p>
      </>}
    >
      <div className={s.table}>
        <div className={s.opps}>
          {OPP.map(seat => {
            const p = st.players[seat];
            const active = st.phase !== 'over' && ((st.phase === 'discard' && st.turn === seat) || (st.phase === 'claim' && st.last!.from === seat));
            const reveal = st.phase === 'over';
            return (
              <section key={seat} className={`${s.opp} ${active ? s.active : ''} ${st.win?.seat === seat ? s.winner : ''}`} aria-label={`${SEAT_NAME[seat]}, ${wind(seat)} wind`}>
                <header className={s.oppHead}>
                  <span className={s.windBadge} data-dealer={st.dealer === seat}>{WIND_NAME[seatWind(st, seat)][0]}</span>
                  <b>{SHORT[seat]}</b>
                  <span className={s.count}>{p.hand.length} tiles</span>
                </header>
                <div className={s.backs} aria-hidden>
                  {reveal
                    ? p.hand.map(t => <Tile key={t.id} kind={t.kind} width={17} />)
                    : p.hand.map(t => <Tile key={t.id} kind={t.kind} width={13} faceDown />)}
                </div>
                <MeldRow melds={p.melds} w={19} />
                <River tiles={p.river} claimed={p.claimedFromRiver} last={lastId} w={21} />
              </section>
            );
          })}
        </div>

        <div className={s.center}>
          {st.last && st.phase === 'claim' ? (
            <div className={s.lastDiscard}>
              <Tile kind={st.last.tile.kind} width={44} state="selected" />
              <span><b>{SHORT[st.last.from]}</b> threw<br />{tileName(st.last.tile.kind)}</span>
            </div>
          ) : <div className={s.wallInfo}><b>{st.wall.length}</b> tiles in the wall</div>}
          <ul className={s.log}>{st.log.slice(-3).map((l, i) => <li key={st.log.length - 3 + i}>{l}</li>)}</ul>
        </div>

        <section className={`${s.mine} ${myTurn ? s.active : ''}`} aria-label="Your tiles">
          <div className={s.myHead}>
            <span className={s.windBadge} data-dealer={st.dealer === 0}>{wind(0)[0]}</span>
            <b>You</b>
            {ready && ready.length > 0 && st.phase !== 'over' && (
              <span className={s.ready}>Ready! Waiting on {ready.map(w => `${tileName(w.kind)} (${w.left} left)`).join(', ')}</span>
            )}
          </div>
          <River tiles={me.river} claimed={me.claimedFromRiver} last={lastId} w={25} />
          <MeldRow melds={me.melds} w={30} />
          <div ref={handRef} className={s.hand}>
            {handTiles.map(t => (
              <Tile key={t.id} kind={t.kind} width={handW}
                state={sel === t.id ? 'selected' : suggestion === t.id && sel === null ? 'hint' : st.win?.seat === 0 ? 'win' : 'normal'}
                onClick={myTurn ? () => tapTile(t) : undefined} />
            ))}
            {drawnTile && (
              <span className={s.drawn}>
                <Tile kind={drawnTile.kind} width={handW} state={sel === drawnTile.id ? 'selected' : suggestion === drawnTile.id && sel === null ? 'hint' : 'normal'}
                  onClick={myTurn ? () => tapTile(drawnTile) : undefined} label={`${tileName(drawnTile.kind)} (just drawn)`} />
              </span>
            )}
          </div>
          {suggestion !== null && sel === null && <p className={s.hintLine}>Hint: the dashed tile is a good one to throw.</p>}

          <div className={s.actions}>
            {myTurn && self?.win && <button type="button" className={s.win} onClick={() => setSt(declareWin(st, 0, true))}><Trophy size={16} /> Mahjong!</button>}
            {myTurn && self?.kongs.map(k => (
              <button key={k} type="button" onClick={() => { setSel(null); setSt(declareKong(st, 0, k)); }}>Kong <Tile kind={k} width={18} /></button>
            ))}
            {myTurn && sel !== null && <button type="button" className={s.primary} onClick={() => { setSt(discard(st, 0, sel)); setSel(null); }}>Discard</button>}
            {humanCanClaim && (<>
              {human!.win && <button type="button" className={s.win} onClick={() => doClaim({ seat: 0, type: 'win' })}><Trophy size={16} /> Mahjong!</button>}
              {human!.kong && <button type="button" onClick={() => doClaim({ seat: 0, type: 'kong' })}>Kong</button>}
              {human!.pung && <button type="button" onClick={() => doClaim({ seat: 0, type: 'pung' })}>Pung <Tile kind={st.last!.tile.kind} width={18} /></button>}
              {human!.chows.map(ch => {
                const run = [ch[0], st.last!.tile.kind, ch[1]].sort((a, b) => a - b) as Kind[];
                return <button key={ch.join('-')} type="button" onClick={() => doClaim({ seat: 0, type: 'chow', chow: ch })}>Chow {run.map((k, i) => <Tile key={i} kind={k} width={18} />)}</button>;
              })}
              <button type="button" className={s.pass} onClick={() => doClaim(null)}><Hand size={16} /> Pass</button>
            </>)}
          </div>
        </section>

        {st.phase === 'over' && (
          <div className={s.result} role="status">
            <h3>{st.win ? (st.win.seat === 0 ? 'You win!' : `${SEAT_NAME[st.win.seat]} wins`) : 'Draw: the wall ran out'}</h3>
            {st.win && (<>
              <p className={s.resultSub}>
                {st.win.name} · {st.win.selfDrawn ? 'self-drawn' : `on ${SEAT_NAME[st.win.from!]}'s discard`} · <b>{st.win.faan} faan</b>
              </p>
              <div className={s.winHand}>
                {st.players[st.win.seat].melds.map((m, i) => <span key={i} className={s.meld}>{m.tiles.map(t => <Tile key={t.id} kind={t.kind} width={28} />)}</span>)}
                <span className={s.meld}>{[...st.players[st.win.seat].hand].sort((a, b) => a.kind - b.kind).map(t => <Tile key={t.id} kind={t.kind} width={28} state={t.id === st.win!.tile.id ? 'win' : 'normal'} />)}</span>
              </div>
              {st.win.items.length > 0
                ? <ul className={s.items}>{st.win.items.map(([n, v]) => <li key={n}><span>{n}</span><b>+{v}</b></li>)}</ul>
                : <p className={s.resultSub}>A plain winning hand (no bonus faan).</p>}
            </>)}
            <button type="button" className={s.primary} onClick={() => { const d = ((st.dealer + 1) % 4) as Seat; setDealer(d); start(d); }}>Next hand</button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
