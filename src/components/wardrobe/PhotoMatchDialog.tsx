'use client';
// "Start from a photo": she picks a photo, the page reads her colouring and face shape from it
// (on her device), shows what it found next to the avatar, and she chooses what to keep.
import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Btn, Modal, ModalTitle } from '@/components/ui';
import Avatar from './Avatar';
import { matchPhoto, type PhotoMatch } from '@/lib/wardrobe/photoMatch';
import { FACE_SHAPES, type Look } from '@/lib/wardrobe/body';
import s from './wardrobe-ui.module.css';

const COLOUR_KEYS = ['skin', 'hairColor', 'eyes', 'lips'] as const;
const NAMES: Record<(typeof COLOUR_KEYS)[number], string> = { skin: 'Skin', hairColor: 'Hair', eyes: 'Eyes', lips: 'Lips' };

export default function PhotoMatchDialog({ look, onClose, onApply }: { look: Look; onClose: () => void; onApply: (patch: Partial<Look>) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [found, setFound] = useState<PhotoMatch | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [useFace, setUseFace] = useState(true);
  const toggle = (k: string) => setSkip(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('That file is not a photo.'); return; }
    setErr(''); setBusy(true); setFound(null);
    const u = URL.createObjectURL(f);
    setUrl(u);
    try {
      const im = new Image();
      await new Promise<void>((res, rej) => { im.onload = () => res(); im.onerror = () => rej(new Error('bad image')); im.src = u; });
      setSize({ w: im.naturalWidth, h: im.naturalHeight });
      const m = await matchPhoto(f);
      if (!m) setErr("Couldn't find a face in that photo. A clear, front-facing photo in good light works best.");
      else { setFound(m); setSkip(new Set(m.unsure)); }
    } catch { setErr("That photo couldn't be read. Try a JPG or PNG."); } finally { setBusy(false); }
  };

  const patch: Partial<Look> = found ? Object.fromEntries(Object.entries(found.patch).filter(([k]) =>
    (COLOUR_KEYS as readonly string[]).includes(k) ? !skip.has(k) : useFace)) : {};
  const preview = { ...look, ...patch };

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <ModalTitle>Start from a photo</ModalTitle>
      {!found && (
        <div className={s.pickBox}>
          <p className={s.hint}>Use a clear, front-facing photo with her face in good, even light (daylight is best) and hair off the face if you can. The page picks up skin, hair, eye and lip colour and the shape of the face. Hairstyle and body you set yourself.</p>
          <p className={s.hint}><ShieldCheck size={16} /> The photo stays on this device. It isn&apos;t uploaded or saved anywhere.</p>
          <div className={s.pickBtns}>
            <button type="button" onClick={() => camRef.current?.click()} disabled={busy}><Camera size={22} /> Take a selfie</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus size={22} /> Choose a photo</button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="user" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {busy && <p className={s.hint}><LoaderCircle size={16} className={s.spin} /> Reading the photo (the first time takes a few seconds)</p>}
          {err && <p className={s.err}>{err}</p>}
        </div>
      )}

      {found && url && size && (
        <div className={s.matchWrap}>
          <div className={s.matchPair}>
            <div className={s.matchPhoto}>
              <svg viewBox={`${found.box.x - found.box.width * 0.35} ${found.box.y - found.box.height * 0.55} ${found.box.width * 1.7} ${found.box.height * 1.9}`} preserveAspectRatio="xMidYMid slice" aria-label="Your photo with the points that were found">
                <image href={url} width={size.w} height={size.h} />
                {found.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={Math.max(1.5, found.box.width / 110)} fill="#ff8c00" opacity={0.85} />)}
              </svg>
            </div>
            <div className={s.matchAvatar}><Avatar look={preview} crop={[70, 250]} fill label="Your avatar's face with these settings" /></div>
          </div>
          <div className={s.found}>
            <div className={s.check}>Colours
              <span className={s.chips}>{COLOUR_KEYS.map(k => found.patch[k] ? (
                <label key={k} className={skip.has(k) ? s.chipOff : ''}><input type="checkbox" checked={!skip.has(k)} onChange={() => toggle(k)} /><i style={{ background: found.patch[k] as string }} />{NAMES[k]}</label>
              ) : null)}</span>
            </div>
            {found.unsure.includes('hairColor') && <p className={s.hint}>The hair colour may have picked up the background, so it&apos;s left off. Tick it if it looks right.</p>}
            <label className={s.check}><input type="checkbox" checked={useFace} onChange={e => setUseFace(e.target.checked)} /> Face shape and features
              <span className={s.chips}><span>{FACE_SHAPES.find(f => f.id === found.patch.faceShape)?.name} face</span></span>
            </label>
            <p className={s.hint}>Everything can be fine-tuned afterwards under Face. Photos often come out a little darker than real life; nudge the skin colour if so.</p>
          </div>
          {err && <p className={s.err}>{err}</p>}
          <div className={s.footer}>
            <Btn variant="ghost" onClick={() => { setFound(null); setUrl(null); }}>Different photo</Btn>
            <Btn onClick={() => { onApply(patch); onClose(); }} disabled={!useFace && COLOUR_KEYS.every(k => skip.has(k) || !found.patch[k])}>Use this</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
