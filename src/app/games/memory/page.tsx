'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Images } from 'lucide-react';
import GameShell from '@/components/games/GameShell';
import StoredImage from '@/components/ui/StoredImage';
import { ensureSession } from '@/lib/supabase';
import { recordResult } from '@/lib/games';
import { getAllImages, type GalleryImage } from '@/lib/db';
import { preloadSignedUrls } from '@/lib/upload';
import s from './memory.module.css';

type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTIES = [
  { key: 'easy',   label: 'Easy',   hint: '6 pairs' },
  { key: 'medium', label: 'Medium', hint: '8 pairs' },
  { key: 'hard',   label: 'Hard',   hint: '12 pairs' },
];
const PAIRS: Record<Difficulty, number> = { easy: 6, medium: 8, hard: 12 };

/** A face on a card: either one of her photos, or a coloured fallback tile. */
type Face = { kind: 'photo'; src: string; label: string } | { kind: 'pattern'; hue: number };
interface Tile { id: number; pairKey: string; face: Face; flipped: boolean; matched: boolean }

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTiles(images: GalleryImage[], pairs: number): Tile[] {
  const faces: { pairKey: string; face: Face }[] = [];
  const pics = shuffle(images).slice(0, pairs);
  pics.forEach(p => faces.push({ pairKey: p.id, face: { kind: 'photo', src: p.image_url, label: p.title } }));
  // Fill any shortfall with distinct colourful tiles so the game always works
  for (let i = faces.length; i < pairs; i++) {
    faces.push({ pairKey: `pattern-${i}`, face: { kind: 'pattern', hue: Math.round((360 / pairs) * i) } });
  }
  const doubled = faces.flatMap(f => [f, f]);
  return shuffle(doubled).map((f, i) => ({ id: i, pairKey: f.pairKey, face: f.face, flipped: false, matched: false }));
}

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export default function MemoryPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);
  const [best, setBest] = useState<Record<Difficulty, number | null>>({ easy: null, medium: null, hard: null });
  const lockRef = useRef(false);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load her photos once
  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const imgs = await getAllImages();
        await preloadSignedUrls(imgs.map(i => i.image_url)).catch(() => {});
        setImages(imgs);
      } catch { /* game still works with fallback tiles */ }
      finally { setLoading(false); }
    })();
  }, []);

  const deal = useCallback((diff: Difficulty, imgs: GalleryImage[]) => {
    clearTimeout(flipTimer.current);
    lockRef.current = false;
    setTiles(buildTiles(imgs, PAIRS[diff]));
    setPicked([]); setMoves(0); setSeconds(0); setRunning(false); setWon(false);
  }, []);

  // Deal a fresh board when photos arrive or the level changes
  useEffect(() => { if (!loading) deal(difficulty, images); }, [loading, difficulty, images, deal]);

  // Timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => () => clearTimeout(flipTimer.current), []);

  const flip = (i: number) => {
    if (lockRef.current) return;
    const t = tiles[i];
    if (!t || t.flipped || t.matched) return;
    if (!running) setRunning(true);

    const nowFlipped = tiles.map((x, k) => k === i ? { ...x, flipped: true } : x);
    setTiles(nowFlipped);
    const nextPicked = [...picked, i];
    setPicked(nextPicked);

    if (nextPicked.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = nextPicked;
      lockRef.current = true;
      if (nowFlipped[a].pairKey === nowFlipped[b].pairKey) {
        flipTimer.current = setTimeout(() => {
          setTiles(prev => {
            const upd = prev.map((x, k) => (k === a || k === b) ? { ...x, matched: true } : x);
            if (upd.every(x => x.matched)) onWin();
            return upd;
          });
          setPicked([]); lockRef.current = false;
        }, 360);
      } else {
        flipTimer.current = setTimeout(() => {
          setTiles(prev => prev.map((x, k) => (k === a || k === b) ? { ...x, flipped: false } : x));
          setPicked([]); lockRef.current = false;
        }, 900);
      }
    }
  };

  const onWin = () => {
    setRunning(false);
    setWon(true);
    setBest(prev => {
      const cur = prev[difficulty];
      return { ...prev, [difficulty]: cur === null ? moves + 1 : Math.min(cur, moves + 1) };
    });
    ensureSession().then(ok => { if (ok) recordResult('memory', difficulty, 'win'); }).catch(() => {});
  };

  const status = won
    ? `Done! ${moves} moves in ${fmtTime(seconds)}. Lovely.`
    : running
      ? 'Find the matching pairs.'
      : 'Flip two cards to find a matching pair.';

  const cols = difficulty === 'hard' ? 6 : 4;

  return (
    <GameShell
      title="Memory"
      subtitle="Match the pairs, made from your own photos."
      icon={<Images size={22} strokeWidth={2} />}
      difficulties={DIFFICULTIES}
      difficulty={difficulty}
      onDifficulty={k => setDifficulty(k as Difficulty)}
      score={[
        { label: 'Moves', value: moves },
        { label: 'Time', value: fmtTime(seconds) },
        { label: 'Best', value: best[difficulty] === null ? 'Not yet' : String(best[difficulty]) },
      ]}
      status={status}
      statusTone={won ? 'good' : 'neutral'}
      onNewGame={() => deal(difficulty, images)}
      rules={<>
        <p>Flip two cards. If they match, they stay face up. If not, they flip back.</p>
        <p>Clear the whole board in as few moves as you can. The cards use photos from your Gallery, Souls and Places, so every game looks a little different.</p>
        {images.length === 0 && <p>Add some photos around the site and they will start showing up here.</p>}
      </>}
    >
      {loading ? (
        <div className={s.grid} style={{ ['--cols' as string]: cols }}>
          {Array.from({ length: PAIRS[difficulty] * 2 }, (_, i) => <div key={i} className={`skeleton ${s.skel}`} />)}
        </div>
      ) : (
        <div className={s.grid} style={{ ['--cols' as string]: cols }}>
          {tiles.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`${s.card} ${t.flipped || t.matched ? s.flipped : ''} ${t.matched ? s.matched : ''}`}
              onClick={() => flip(i)}
              disabled={t.matched}
              aria-label={t.flipped || t.matched ? (t.face.kind === 'photo' ? t.face.label : 'Card') : 'Hidden card'}
            >
              <span className={s.inner}>
                <span className={s.back}><Images size={20} strokeWidth={1.75} /></span>
                <span className={s.front}>
                  {t.face.kind === 'photo'
                    ? <StoredImage src={t.face.src} alt="" className={s.photo} loading="eager" fallback={<span className={s.photoFallback} />} />
                    : <span className={s.pattern} style={{ ['--h' as string]: t.face.hue }} />}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </GameShell>
  );
}
