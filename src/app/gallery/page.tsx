// src/app/gallery/page.tsx

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getAllImages, GalleryImage, GallerySource,
  addGalleryImage, deleteGalleryImage, updateGalleryImageCaption,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { uploadImage, deleteImage } from '@/lib/upload';
import { useToast, Toast } from '@/components/ui';
import styles from './gallery.module.css';

const FILTERS: { label: string; value: GallerySource | 'all' }[] = [
  { label: 'All',       value: 'all'     },
  { label: '🖼 Mine',   value: 'gallery' },
  { label: '📚 Library', value: 'library' },
  { label: '👥 Souls',  value: 'souls'   },
  { label: '📍 Places', value: 'places'  },
];

function getRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return ((hash % 90) / 10) - 4.5;
}

export default function GalleryPage() {
  const router = useRouter();
  const [toast, show] = useToast();

  const [images,   setImages]   = useState<GalleryImage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<GallerySource | 'all'>('all');
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
  const [uploading, setUploading] = useState(false);

  // caption editing inside lightbox (gallery-source only)
  const [editCaption, setEditCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const data = await getAllImages();
        setImages(data);
      } catch {
        show('Could not load gallery.', 'var(--red, #e05)');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Direct upload ────────────────────────────────────────────
  async function handleUpload(file: File) {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, 'gallery' as Parameters<typeof uploadImage>[1]);
      const saved = await addGalleryImage(url, null);
      const newImg: GalleryImage = {
        id:        `gallery-${saved.id}`,
        raw_id:    saved.id,
        image_url: saved.image_url,
        title:     saved.caption ?? 'Photo',
        source:    'gallery',
        href:      '/gallery',
      };
      setImages(prev => [newImg, ...prev]);
      show('Photo added!');
    } catch {
      show('Upload failed.', 'var(--red, #e05)');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ── Delete (gallery source only) ─────────────────────────────
  async function handleDelete(img: GalleryImage) {
    if (img.source !== 'gallery' || !img.raw_id) return;
    const snapshot = [...images];
    setImages(prev => prev.filter(i => i.id !== img.id));
    setLightbox(null);
    try {
      await deleteGalleryImage(img.raw_id);
      await deleteImage(img.image_url).catch(() => {});
      show('Deleted.');
    } catch {
      setImages(snapshot);
      show('Could not delete.', 'var(--red, #e05)');
    }
  }

  // ── Caption save ─────────────────────────────────────────────
  async function saveCaption(img: GalleryImage) {
    if (!img.raw_id) return;
    setSavingCaption(true);
    try {
      await updateGalleryImageCaption(img.raw_id, editCaption);
      setImages(prev => prev.map(i =>
        i.id === img.id ? { ...i, title: editCaption || 'Photo', caption: editCaption } : i
      ));
      setLightbox(prev => prev ? { ...prev, title: editCaption || 'Photo', caption: editCaption } : prev);
      show('Caption saved!');
    } catch {
      show('Could not save caption.', 'var(--red, #e05)');
    } finally {
      setSavingCaption(false);
    }
  }

  // ── Lightbox keyboard nav ────────────────────────────────────
  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (lightbox === null) return;
    // Sync caption editor
    setEditCaption(lightbox.caption ?? '');
    const filtered = images.filter(i => filter === 'all' || i.source === filter);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { closeLightbox(); return; }
      if (!lightbox) return;
      const idx = filtered.findIndex(i => i.id === lightbox.id);
      if (e.key === 'ArrowRight') setLightbox(filtered[(idx + 1) % filtered.length]);
      if (e.key === 'ArrowLeft')  setLightbox(filtered[(idx - 1 + filtered.length) % filtered.length]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, images, filter, closeLightbox]);

  function navigateLightbox(dir: 1 | -1) {
    if (lightbox === null) return;
    const filtered = images.filter(i => filter === 'all' || i.source === filter);
    const idx = filtered.findIndex(i => i.id === lightbox.id);
    const next = filtered[(idx + dir + filtered.length) % filtered.length];
    setLightbox(next);
    setEditCaption(next.caption ?? '');
  }

  const visible = filter === 'all' ? images : images.filter(i => i.source === filter);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>memories</h1>
            <p className={styles.sub}>{images.length} photo{images.length !== 1 ? 's' : ''} collected</p>
          </div>
          <button
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : '+ Add Photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
        </div>
      </header>

      {/* Filter pills */}
      <div className={styles.filters}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`${styles.filterBtn} ${filter === f.value ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.empty}>
          <div className={styles.shimmerGrid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.shimmerCard} style={{ animationDelay: `${i * 0.07}s` }} />
            ))}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🖼</div>
          <p className={styles.emptyText}>No photos here yet.</p>
          <p className={styles.emptySub}>
            {filter === 'gallery'
              ? 'Click "+ Add Photo" to upload something.'
              : 'Add images to Library, Souls, or Places entries — or upload directly.'}
          </p>
        </div>
      ) : (
        <div className={styles.board}>
          {visible.map((img) => (
            <button
              key={img.id}
              className={styles.photo}
              style={{ '--rot': `${getRotation(img.id)}deg` } as React.CSSProperties}
              onClick={() => { setLightbox(img); setEditCaption(img.caption ?? ''); }}
              aria-label={`Open ${img.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt={img.title} className={styles.photoImg} loading="lazy" />
              <div className={styles.photoCaption}>
                {img.emoji && <span className={styles.photoEmoji}>{img.emoji}</span>}
                <span className={styles.photoTitle}>{img.title}</span>
                {img.subtitle && <span className={styles.photoSub}>{img.subtitle}</span>}
              </div>
              <div className={styles.photoPinShadow} />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div className={styles.lightboxBackdrop} onClick={closeLightbox}>
          <div className={styles.lightboxCard} onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.image_url} alt={lightbox.title} className={styles.lightboxImg} />

            <div className={styles.lightboxFooter}>
              <div className={styles.lightboxMeta}>
                {lightbox.emoji && <span>{lightbox.emoji}</span>}
                <span className={styles.lightboxTitle}>{lightbox.title}</span>
                <span className={styles.lightboxSource}>{lightbox.source}</span>
              </div>

              {/* Caption editor — gallery source only */}
              {lightbox.source === 'gallery' && (
                <div className={styles.captionRow}>
                  <input
                    className={styles.captionInput}
                    value={editCaption}
                    onChange={e => setEditCaption(e.target.value)}
                    placeholder="Add a caption…"
                    onKeyDown={e => { if (e.key === 'Enter') saveCaption(lightbox); e.stopPropagation(); }}
                  />
                  <button
                    className={styles.captionSave}
                    onClick={() => saveCaption(lightbox)}
                    disabled={savingCaption}
                  >
                    {savingCaption ? '…' : '✓'}
                  </button>
                </div>
              )}

              <div className={styles.lightboxActions}>
                <button className={styles.lightboxNav} onClick={() => navigateLightbox(-1)} aria-label="Previous">←</button>
                <button className={styles.lightboxNav} onClick={() => navigateLightbox(1)}  aria-label="Next">→</button>
                {lightbox.source !== 'gallery' && (
                  <button className={styles.lightboxGo} onClick={() => router.push(lightbox.href)}>
                    Go to {lightbox.source} ↗
                  </button>
                )}
                {lightbox.source === 'gallery' && (
                  <button className={styles.lightboxDelete} onClick={() => handleDelete(lightbox)}>
                    Delete
                  </button>
                )}
                <button className={styles.lightboxClose} onClick={closeLightbox} aria-label="Close">✕</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}