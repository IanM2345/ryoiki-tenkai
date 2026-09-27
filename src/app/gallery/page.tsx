'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ImagePlus, Images, BookOpen, Users, MapPin, ChevronLeft, ChevronRight, X, Check,
  Trash2, ExternalLink, LoaderCircle, Image as ImageIcon,
} from 'lucide-react';
import {
  getAllImagesWithStatus, addGalleryImage, deleteGalleryImage, updateGalleryImageCaption,
} from '@/lib/db';
import type { GalleryImage, GallerySource } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { uploadImage, deleteImage, preloadSignedUrls } from '@/lib/upload';
import { Btn, Pill, Topbar, Modal, Confirm, EmptyState, Toast, useToast } from '@/components/ui';
import StoredImage from '@/components/ui/StoredImage';
import s from './gallery.module.css';

const MAX_W = 1280;

type Filter = GallerySource | 'all';

const SOURCE_META: Record<GallerySource, { label: string; name: string; Icon: typeof Images }> = {
  gallery: { label: 'Mine',    name: 'Gallery', Icon: Images },
  library: { label: 'Library', name: 'Library', Icon: BookOpen },
  souls:   { label: 'Souls',   name: 'Souls',   Icon: Users },
  places:  { label: 'Places',  name: 'Places',  Icon: MapPin },
};
const SOURCES = Object.keys(SOURCE_META) as GallerySource[];

/** Small, stable tilt per photo so the board feels hand pinned. */
function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 41) / 10 - 2; // -2deg .. 2deg
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─── Caption editor (remounted per image via key, so its draft resets) ───
function CaptionEditor({ initial, onSave }: { initial: string; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== initial.trim();

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try { await onSave(draft.trim()); } finally { setSaving(false); }
  };

  return (
    <form className={s.captionRow} onSubmit={e => { e.preventDefault(); save(); }}>
      <input
        className={s.captionInput}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Add a caption"
        aria-label="Caption"
        maxLength={200}
      />
      <button type="submit" className={s.captionSave} disabled={!dirty || saving} aria-label="Save caption">
        {saving ? <LoaderCircle size={16} className={s.spin} /> : <Check size={16} strokeWidth={2.5} />}
      </button>
    </form>
  );
}

// ─── Lightbox dialog ──────────────────────────────────────────
interface LightboxProps {
  items: GalleryImage[];
  index: number;
  paused: boolean;          // another dialog (delete confirm) is on top
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (img: GalleryImage) => void;
  onCaption: (img: GalleryImage, caption: string) => Promise<void>;
}

function Lightbox({ items, index, paused, onIndex, onClose, onDelete, onCaption }: LightboxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const img = items[index];
  const count = items.length;

  const go = useCallback((dir: 1 | -1) => {
    if (count > 1) onIndex((index + dir + count) % count);
  }, [count, index, onIndex]);

  // Focus in on open, back to the opener on close, and lock page scroll.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    closeBtnRef.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = prevOverflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, []);

  // Keyboard: Esc closes, arrows navigate, Tab stays inside the dialog.
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (!typing && e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
      if (!typing && e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); return; }
      if (e.key === 'Tab' && boxRef.current) {
        const nodes = [...boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        const inside = boxRef.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, go, onClose]);

  if (!img) return null;
  const meta = SOURCE_META[img.source];
  const own = img.source === 'gallery';

  return (
    <div className={s.lbBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className={s.lbBox}
        role="dialog"
        aria-modal="true"
        aria-label={`${img.title}, photo ${index + 1} of ${count}`}
        onTouchStart={e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }}
        onTouchEnd={e => {
          const start = touch.current; touch.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x, dy = t.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className={s.lbTop}>
          <span className={s.lbCounter}>{index + 1} of {count}</span>
          <button ref={closeBtnRef} type="button" className={s.lbIconBtn} onClick={onClose} aria-label="Close photo">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className={s.lbStage}>
          {count > 1 && (
            <button type="button" className={`${s.lbNav} ${s.lbPrev}`} onClick={() => go(-1)} aria-label="Previous photo">
              <ChevronLeft size={24} strokeWidth={2} />
            </button>
          )}
          <StoredImage key={img.id} src={img.image_url} alt={img.title} className={s.lbImg} loading="eager" />
          {count > 1 && (
            <button type="button" className={`${s.lbNav} ${s.lbNext}`} onClick={() => go(1)} aria-label="Next photo">
              <ChevronRight size={24} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className={s.lbFooter}>
          <div className={s.lbMeta}>
            {img.emoji && <span className={s.lbEmoji}>{img.emoji}</span>}
            <span className={s.lbTitle}>{img.title}</span>
            <span className={s.lbSource}><meta.Icon size={13} strokeWidth={2} aria-hidden /> {meta.name}</span>
          </div>

          {own ? (
            <>
              <CaptionEditor key={img.id} initial={img.caption ?? ''} onSave={c => onCaption(img, c)} />
              <Btn variant="danger" sm onClick={() => onDelete(img)}>
                <Trash2 size={15} strokeWidth={2} /> Delete
              </Btn>
            </>
          ) : (
            <Link href={img.href} className={s.lbGo}>
              Open in {meta.name} <ExternalLink size={14} strokeWidth={2} aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function GalleryPage() {
  const [toast, show] = useToast();
  const [images, setImages]   = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>('all');
  const [openId, setOpenId]   = useState<string | null>(null);
  const [delItem, setDelItem] = useState<GalleryImage | null>(null);
  const [upload, setUpload]   = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const { images: data, failed } = await getAllImagesWithStatus();
        setImages(data);
        preloadSignedUrls(data.map(i => i.image_url)).catch(() => {});
        if (failed.length) {
          const names = failed.map(f => SOURCE_META[f].name).join(', ');
          show(`Some photos could not load (${names}).`, 'var(--red)');
        }
      } catch {
        show('Could not load your photos.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: images.length, gallery: 0, library: 0, souls: 0, places: 0 };
    images.forEach(i => { c[i.source] += 1; });
    return c;
  }, [images]);

  const visible = useMemo(
    () => filter === 'all' ? images : images.filter(i => i.source === filter),
    [images, filter],
  );
  const openIndex = openId ? visible.findIndex(i => i.id === openId) : -1;

  // ── Upload (one or many) ─────────────────────────────────────
  const handleFiles = async (list: FileList | File[] | null) => {
    const files = [...(list ?? [])].filter(f => f.type.startsWith('image/'));
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) { if (list && [...list].length) show('Only image files can be added.', 'var(--red)'); return; }
    if (upload) return;

    setUpload({ done: 0, total: files.length });
    const added: GalleryImage[] = [];
    let failed = 0;
    for (const file of files) {
      let path: string | null = null;
      try {
        path = await uploadImage(file, 'gallery');
        const saved = await addGalleryImage(path, null);
        const img: GalleryImage = {
          id: `gallery-${saved.id}`, raw_id: saved.id, image_url: saved.image_url,
          title: saved.caption || 'Photo', caption: saved.caption ?? undefined, source: 'gallery', href: '/gallery',
        };
        added.push(img);
        setImages(prev => [img, ...prev]);
      } catch {
        failed += 1;
        if (path) await deleteImage(path);
      }
      setUpload(u => u ? { ...u, done: u.done + 1 } : u);
    }
    setUpload(null);

    if (failed === 0) show(added.length === 1 ? 'Photo added' : `${added.length} photos added`);
    else if (added.length === 0) show(files.length === 1 ? 'That photo could not be uploaded.' : 'Those photos could not be uploaded.', 'var(--red)');
    else show(`${added.length} added, ${failed} could not be uploaded.`, 'var(--red)');
    if (added.length && filter !== 'all' && filter !== 'gallery') setFilter('gallery');
  };

  // ── Caption (optimistic, with rollback) ──────────────────────
  const saveCaption = async (img: GalleryImage, caption: string) => {
    if (!img.raw_id) return;
    const before = img;
    const patch = (c: string | undefined) => (i: GalleryImage) => i.id === img.id ? { ...i, caption: c, title: c || 'Photo' } : i;
    setImages(prev => prev.map(patch(caption || undefined)));
    try {
      await updateGalleryImageCaption(img.raw_id, caption);
      show('Caption saved');
    } catch {
      setImages(prev => prev.map(i => i.id === img.id ? before : i));
      show('Could not save that caption.', 'var(--red)');
    }
  };

  // ── Delete (gallery photos only) ─────────────────────────────
  const doDelete = async () => {
    const item = delItem;
    setDelItem(null);
    if (!item || item.source !== 'gallery' || !item.raw_id) return;

    // Keep the lightbox open on a neighbour if there is one.
    if (openId === item.id) {
      const rest = visible.filter(i => i.id !== item.id);
      setOpenId(rest.length ? rest[Math.min(openIndex, rest.length - 1)].id : null);
    }
    const snapshot = images;
    setImages(prev => prev.filter(i => i.id !== item.id));
    try {
      await deleteGalleryImage(item.raw_id);
      await deleteImage(item.image_url);
      show('Photo deleted');
    } catch {
      setImages(snapshot);
      show('Could not delete that photo.', 'var(--red)');
    }
  };

  const onIndex = useCallback((i: number) => setOpenId(visible[i]?.id ?? null), [visible]);
  const closeLightbox = useCallback(() => setOpenId(null), []);

  const uploadLabel = upload
    ? (upload.total > 1 ? `Uploading ${Math.min(upload.done + 1, upload.total)} of ${upload.total}` : 'Uploading')
    : 'Add photos';

  const sub = loading
    ? 'Gathering your photos'
    : images.length ? `${images.length} ${images.length === 1 ? 'photo' : 'photos'} collected` : 'Every picture you add, all in one place';

  const emptyMsg = filter === 'all'
    ? 'No photos yet. Add some here, or give your library, souls and places a picture.'
    : filter === 'gallery'
      ? 'You have not uploaded any photos here yet.'
      : `No photos in ${SOURCE_META[filter].name} yet.`;

  return (
    <div
      className={s.page}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); } }}
    >
      <Topbar
        title="Gallery"
        sub={sub}
        maxWidth={MAX_W}
        action={
          <Btn onClick={() => fileRef.current?.click()} disabled={!!upload}>
            {upload ? <LoaderCircle size={16} className={s.spin} /> : <ImagePlus size={16} strokeWidth={2.25} />}
            {uploadLabel}
          </Btn>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className={s.fileInput}
        tabIndex={-1}
        aria-hidden
        onChange={e => handleFiles(e.target.files)}
      />

      <div className={s.wrap}>
        {upload && (
          <div className={s.progress} role="status" aria-live="polite">
            <span>{upload.total > 1 ? `Uploading photo ${Math.min(upload.done + 1, upload.total)} of ${upload.total}` : 'Uploading your photo'}</span>
            <span className={s.progressTrack} aria-hidden>
              <span className={s.progressFill} style={{ ['--p' as string]: `${((upload.done + 0.5) / upload.total) * 100}%` }} />
            </span>
          </div>
        )}

        <div className={s.filters} role="group" aria-label="Filter photos">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className={s.pillCount}>{counts.all}</span>
          </Pill>
          {SOURCES.map(src => {
            const m = SOURCE_META[src];
            return (
              <Pill key={src} active={filter === src} onClick={() => setFilter(src)}>
                <m.Icon size={14} strokeWidth={2} aria-hidden /> {m.label} <span className={s.pillCount}>{counts[src]}</span>
              </Pill>
            );
          })}
        </div>

        {dragging && <div className={s.dropHint} aria-hidden><ImagePlus size={22} /> Drop to add photos</div>}

        {loading ? (
          <div className={s.board}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={`skeleton ${s.skel}`} style={{ ['--h' as string]: `${[200, 260, 180, 240][i % 4]}px` }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={26} />}
            msg={emptyMsg}
            action={(filter === 'all' || filter === 'gallery') && (
              <Btn sm onClick={() => fileRef.current?.click()} disabled={!!upload}><ImagePlus size={15} /> Add photos</Btn>
            )}
          />
        ) : (
          <ul className={s.board}>
            {visible.map(img => {
              const m = SOURCE_META[img.source];
              return (
                <li key={img.id} className={s.photo} style={{ ['--rot' as string]: `${tiltFor(img.id)}deg` }}>
                  <button type="button" className={s.photoBtn} onClick={() => setOpenId(img.id)} aria-label={`Open ${img.title}`}>
                    <span className={s.pin} aria-hidden />
                    <StoredImage src={img.image_url} alt={img.title} className={s.photoImg} loading="lazy"
                      fallback={<span className={s.photoMissing}><ImageIcon size={22} /></span>} />
                    <span className={s.caption}>
                      {img.emoji && <span className={s.captionEmoji}>{img.emoji}</span>}
                      <span className={s.captionTitle}>{img.title}</span>
                      {img.subtitle && <span className={s.captionSub}>{img.subtitle}</span>}
                    </span>
                  </button>
                  {img.source !== 'gallery' && (
                    <Link href={img.href} className={s.badge} aria-label={`From ${m.name}. Open ${img.title} in ${m.name}`}>
                      <m.Icon size={12} strokeWidth={2.25} aria-hidden /> {m.name}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openIndex >= 0 && (
        <Lightbox
          items={visible}
          index={openIndex}
          paused={!!delItem}
          onIndex={onIndex}
          onClose={closeLightbox}
          onDelete={setDelItem}
          onCaption={saveCaption}
        />
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg="This photo will be removed from your gallery for good." onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
