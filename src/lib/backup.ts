// "Download everything": one .zip with
//   backup.json   every row from every table (the complete copy)
//   journal.html  her journal as a readable book that opens in any browser
//   photos/...    every photo she has uploaded
// Built entirely in the browser; nothing is sent anywhere.
import { supabase } from './supabase';
import { storagePath } from './upload';

const BUCKET = 'yourworld';

export const BACKUP_TABLES = [
  'journal_entries', 'journal_entry_souls', 'tasks', 'library', 'ideas', 'queue', 'places',
  'souls', 'soul_media', 'soul_links', 'ratings', 'mood_defs', 'mood_logs', 'gallery_images',
  'time_capsules', 'route_collections', 'routes', 'route_trips', 'study_nodes', 'study_links', 'study_cards', 'study_reviews', 'study_resources', 'study_sessions', 'game_sessions', 'user_settings',
] as const;

export const LAST_BACKUP_KEY = 'yw-last-backup';

export type Progress = { step: string; done: number; total: number };

// ─── Data ─────────────────────────────────────────────────────
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      // A table that doesn't exist yet (migration not applied) shouldn't stop the backup.
      if (/does not exist|schema cache|Could not find/i.test(error.message)) return out;
      throw error;
    }
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// ─── Tiny zip writer (store only; photos are already compressed) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export interface ZipFile { name: string; data: Uint8Array }

export function buildZip(files: ZipFile[]): Blob {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);          // version needed
    local.setUint16(6, 0x0800, true);      // UTF-8 names
    local.setUint16(8, 0, true);           // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer as ArrayBuffer, name as BlobPart, f.data as BlobPart);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, size, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    const entry = new Uint8Array(46 + name.length);
    entry.set(new Uint8Array(cen.buffer), 0);
    entry.set(name, 46);
    central.push(entry);

    offset += 30 + name.length + size;
  }

  const cenSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer as ArrayBuffer], { type: 'application/zip' });
}

// ─── Readable journal ─────────────────────────────────────────
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function journalHtml(data: Record<string, Record<string, unknown>[]>): string {
  const entries = [...(data.journal_entries ?? [])].sort((a, b) =>
    String(b.entry_date ?? '').localeCompare(String(a.entry_date ?? '')));
  const souls = new Map((data.souls ?? []).map(s => [s.id, s.name]));
  const links = data.journal_entry_souls ?? [];
  const nice = (d: unknown) => {
    const s = String(d ?? '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    const [y, m, dd] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  const letters = (data.time_capsules ?? []).filter(l => l.opened_at);

  const body = entries.map(e => {
    const who = links.filter(l => l.journal_entry_id === e.id).map(l => souls.get(l.soul_id)).filter(Boolean);
    const tags = Array.isArray(e.tags) ? (e.tags as string[]) : [];
    return `<article><p class="date">${esc(nice(e.entry_date))}${e.entry_time ? ` · ${esc(e.entry_time)}` : ''} ${esc(e.mood ?? '')}</p>
<h2>${esc(e.title || 'Untitled')}</h2><div class="body">${esc(e.body)}</div>
${who.length || tags.length ? `<p class="meta">${who.length ? `With ${esc(who.join(', '))}` : ''}${who.length && tags.length ? ' · ' : ''}${tags.map(t => `#${esc(t)}`).join(' ')}</p>` : ''}</article>`;
  }).join('\n');

  const letterHtml = letters.map(l => `<article><p class="date">${l.from_name ? `From ${esc(l.from_name)} · ` : ''}written ${esc(nice(l.created_at))}</p>
<h2>${esc(l.title)}</h2><div class="body">${esc(l.body)}</div></article>`).join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>yourworld: journal</title><style>
body{margin:0;background:#faf6ef;color:#2b2118;font:17px/1.7 Georgia,'Times New Roman',serif}
main{max-width:720px;margin:0 auto;padding:48px 22px 80px}
header h1{font-size:2rem;margin:0 0 4px;color:#b35c00}header p{margin:0 0 40px;color:#7a6a5a}
article{padding:28px 0;border-top:1px solid #e6dccd}h2{margin:.2em 0 .5em;font-size:1.35rem}
.date{margin:0;color:#9a7b5a;font-size:.85rem;letter-spacing:.03em}.meta{color:#7a6a5a;font-size:.88rem}
.body{white-space:pre-wrap}h3{margin:56px 0 0;color:#6b3fa0}
</style></head><body><main><header><h1>Journal</h1>
<p>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · saved ${esc(nice(new Date().toISOString()))}</p></header>
${body || '<p>No journal entries yet.</p>'}
${letterHtml ? `<h3>Opened time capsule letters</h3>${letterHtml}` : ''}
</main></body></html>`;
}

// ─── Run ──────────────────────────────────────────────────────
export async function makeBackup(opts: { photos: boolean }, onProgress: (p: Progress) => void): Promise<{ blob: Blob; filename: string; counts: Record<string, number>; photos: number; missedPhotos: number }> {
  const enc = new TextEncoder();
  const data: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  let i = 0;
  for (const t of BACKUP_TABLES) {
    onProgress({ step: 'Gathering your things', done: i++, total: BACKUP_TABLES.length });
    data[t] = await fetchAll(t);
    counts[t] = data[t].length;
  }

  const stamp = new Date();
  const ymd = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`;
  const files: ZipFile[] = [];
  files.push({
    name: 'backup.json',
    data: enc.encode(JSON.stringify({ app: 'yourworld', version: 1, exported_at: stamp.toISOString(), counts, tables: data }, null, 2)),
  });
  files.push({ name: 'journal.html', data: enc.encode(journalHtml(data)) });
  files.push({
    name: 'README.txt',
    data: enc.encode(
      'yourworld backup\r\n================\r\n\r\n' +
      'journal.html  Open in any browser to read your journal like a book.\r\n' +
      'backup.json   Everything, exactly as stored: journal, tasks, places, people, moods, letters and more.\r\n' +
      'photos/       Every photo you uploaded, in folders by where it came from.\r\n\r\n' +
      `Saved on ${stamp.toString()}\r\n`),
  });

  let photos = 0, missedPhotos = 0;
  if (opts.photos) {
    const paths = new Set<string>();
    for (const rows of Object.values(data)) {
      for (const r of rows) {
        const p = storagePath(typeof r.image_url === 'string' ? r.image_url : null);
        if (p) paths.add(p);
      }
    }
    const list = [...paths];
    let n = 0;
    for (const p of list) {
      onProgress({ step: 'Saving your photos', done: n++, total: list.length });
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(p);
      if (error || !blob) { missedPhotos++; continue; }
      // Drop the user-id folder so the zip reads photos/places/..., photos/souls/...
      const rel = p.split('/').slice(1).join('/') || p;
      files.push({ name: `photos/${rel}`, data: new Uint8Array(await blob.arrayBuffer()) });
      photos++;
    }
  }

  onProgress({ step: 'Packing it up', done: 1, total: 1 });
  return { blob: buildZip(files), filename: `yourworld-backup-${ymd}.zip`, counts, photos, missedPhotos };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
