import { supabase } from './supabase';

export type ImageFolder = 'library' | 'souls' | 'places' | 'gallery';

const BUCKET = 'yourworld';
const SIGN_SECONDS = 60 * 60 * 24; // links are short-lived; they are re-created when needed

/**
 * Images are stored in the database as their storage path ("<user>/<folder>/<file>").
 * Older rows hold 1-year signed URLs; storagePath() pulls the path out of those,
 * so old photos keep working forever instead of breaking after a year.
 */
export function storagePath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!/^https?:/i.test(stored) && !stored.startsWith('blob:')) return stored;
  const m = stored.match(/\/object\/(?:sign|public|authenticated)\/yourworld\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Signed URL cache (per page load) ────────────────────────
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

export async function signedUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith('blob:')) return stored;
  const path = storagePath(stored);
  if (!path) return /^https?:/i.test(stored) ? stored : null; // an external image URL
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  if (inflight.has(path)) return inflight.get(path)!;
  const p = (async () => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_SECONDS);
    inflight.delete(path);
    if (!data?.signedUrl) return null;
    cache.set(path, { url: data.signedUrl, exp: Date.now() + SIGN_SECONDS * 1000 });
    return data.signedUrl;
  })();
  inflight.set(path, p);
  return p;
}

/** Warm the cache for many images in one request (use on list pages). */
export async function preloadSignedUrls(stored: (string | null | undefined)[]): Promise<void> {
  const paths = [...new Set(stored.map(storagePath).filter((p): p is string => !!p && !cache.has(p)))];
  if (!paths.length) return;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
  data?.forEach(d => {
    if (d.signedUrl && d.path) cache.set(d.path, { url: d.signedUrl, exp: Date.now() + SIGN_SECONDS * 1000 });
  });
}

/** Upload an image into the user's folder. Returns the storage path to save in the database. */
export async function uploadImage(file: File, folder: ImageFolder): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is over 15 MB.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Delete an image given its stored value (path or legacy signed URL). Never throws. */
export async function deleteImage(stored: string | null | undefined): Promise<void> {
  const path = storagePath(stored);
  if (!path) return;
  cache.delete(path);
  await supabase.storage.from(BUCKET).remove([path]).then(() => {}, () => {});
}

/**
 * Work out the new image value for a save, safely:
 * uploads the new file first, and returns a cleanup() that removes the
 * old image. Call cleanup() only after the database save succeeded.
 */
export async function prepareImage(opts: {
  current: string | null | undefined;
  file: File | null;
  cleared: boolean;
  folder: ImageFolder;
}): Promise<{ value: string | null; cleanup: () => Promise<void>; rollback: () => Promise<void> }> {
  const { current, file, cleared, folder } = opts;
  if (file) {
    const path = await uploadImage(file, folder);
    return {
      value: path,
      cleanup: () => deleteImage(current),
      rollback: () => deleteImage(path),
    };
  }
  if (cleared) return { value: null, cleanup: () => deleteImage(current), rollback: async () => {} };
  return { value: current ?? null, cleanup: async () => {}, rollback: async () => {} };
}
