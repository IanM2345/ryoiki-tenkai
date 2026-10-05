'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Route as RouteIcon, Star, Copy, Archive, ArchiveRestore, Trash2, Footprints, Bike, Car, TramFront, Play, Pencil, MapPin, Clock,
} from 'lucide-react';
import { Btn, SearchBar, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, EmptyState, Toast, useToast, Tag } from '@/components/ui';
import {
  getRoutes, addRoute, updateRoute, deleteRoute, getRouteCollections, updateRouteCollection, deleteRouteCollection, addRouteCollection,
} from '@/lib/db';
import type { DbRoute, DbRouteCollection, RouteMode } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { fmtDistance, fmtDuration, routeTitle } from '@/lib/routing';
import { relDay, localDateStr } from '@/lib/dates';
import s from './routes.module.css';

const MODE_ICON: Record<RouteMode, typeof Footprints> = { walk: Footprints, cycle: Bike, drive: Car, transit: TramFront };
const MODE_PAST: Record<RouteMode, string> = { walk: 'Walked', cycle: 'Cycled', drive: 'Driven', transit: 'Travelled' };

type Filter = 'all' | 'fav' | 'archived' | string;

function whenDone(iso: string) {
  const day = relDay(localDateStr(new Date(iso)));
  return day === 'today' || day === 'yesterday' ? day : `on ${day}`;
}

/** A tiny drawing of the route's shape for the card. */
function RouteSketch({ r }: { r: DbRoute }) {
  const stops = (Array.isArray(r.stops) ? r.stops : []).filter(x => x.lat != null && x.lng != null);
  const line: [number, number][] = r.geometry?.length ? r.geometry : stops.map(x => [x.lat!, x.lng!]);
  if (line.length < 2) {
    return <span className={s.sketch}><RouteIcon size={26} strokeWidth={1.6} /></span>;
  }
  const W = 96, H = 72, P = 9;
  const lat0 = line.reduce((a, p) => a + p[0], 0) / line.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = line.map(p => p[1] * k), ys = line.map(p => -p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((W - 2 * P) / Math.max(maxX - minX, 1e-6), (H - 2 * P) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
  const X = (lng: number) => ox + (lng * k - minX) * scale;
  const Y = (lat: number) => oy + (-lat - minY) * scale;
  const step = Math.max(1, Math.floor(line.length / 160));
  const d = line.filter((_, i) => i % step === 0 || i === line.length - 1).map((p, i) => `${i ? 'L' : 'M'}${X(p[1]).toFixed(1)},${Y(p[0]).toFixed(1)}`).join('');
  const first = line[0], last = line[line.length - 1];
  return (
    <span className={s.sketch} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <path d={d} className={s.sketchLine} />
        {stops.slice(1, -1).map(x => <circle key={x.id} cx={X(x.lng!)} cy={Y(x.lat!)} r={2.6} className={s.sketchStop} />)}
        <circle cx={X(first[1])} cy={Y(first[0])} r={3.6} className={s.sketchStart} />
        <circle cx={X(last[1])} cy={Y(last[0])} r={3.6} className={s.sketchEnd} />
      </svg>
    </span>
  );
}

export default function RoutesPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<DbRoute[]>([]);
  const [collections, setCollections] = useState<DbRouteCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [delItem, setDelItem] = useState<DbRoute | null>(null);
  const [colEdit, setColEdit] = useState<{ id: string | null; name: string } | null>(null);
  const [colDelete, setColDelete] = useState<DbRouteCollection | null>(null);
  const [toast, show] = useToast();

  const reload = useCallback(async () => {
    try {
      if (!(await ensureSession())) return;
      const [r, c] = await Promise.all([getRoutes(), getRouteCollections()]);
      setRoutes(r);
      setCollections(c);
    } catch {
      show('Could not load your routes.', 'var(--red)');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['routes', 'route_collections'], reload);

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => routes
    .filter(r => (filter === 'archived' ? r.archived : !r.archived))
    .filter(r => filter === 'all' || filter === 'archived' || (filter === 'fav' ? r.favourite : r.collection_id === filter))
    .filter(r => !q || `${routeTitle(r)} ${r.notes ?? ''} ${(r.tags ?? []).join(' ')} ${(r.stops ?? []).map(x => x.name).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.journey) - Number(!!a.journey) || Number(b.favourite) - Number(a.favourite) || b.updated_at.localeCompare(a.updated_at)),
  [routes, filter, q]);

  const active = routes.filter(r => !r.archived);
  const archivedCount = routes.length - active.length;
  const activeCollection = collections.find(c => c.id === filter) ?? null;

  const patch = async (r: DbRoute, updates: Partial<DbRoute>, msg?: string) => {
    setRoutes(l => l.map(x => (x.id === r.id ? { ...x, ...updates } : x)));
    try { await updateRoute(r.id, updates); if (msg) show(msg); }
    catch { setRoutes(l => l.map(x => (x.id === r.id ? r : x))); show('Could not update that route.', 'var(--red)'); }
  };

  const duplicate = async (r: DbRoute) => {
    try {
      const copy = await addRoute({
        name: `${routeTitle(r)} (copy)`, notes: r.notes, mode: r.mode, stops: r.stops, geometry: r.geometry, legs: r.legs,
        distance_m: r.distance_m, duration_s: r.duration_s, collection_id: r.collection_id, tags: r.tags, favourite: false, archived: false,
      });
      setRoutes(l => [copy, ...l]);
      show('Copy made');
    } catch { show('Could not copy that route.', 'var(--red)'); }
  };

  const doDelete = async () => {
    const item = delItem;
    if (!item) return;
    const snapshot = routes;
    setRoutes(l => l.filter(x => x.id !== item.id));
    setDelItem(null);
    try { await deleteRoute(item.id); show('Route deleted'); }
    catch { setRoutes(snapshot); show('Could not delete that route.', 'var(--red)'); }
  };

  const saveCollection = async () => {
    const name = colEdit?.name.trim();
    if (!colEdit || !name) return;
    try {
      if (colEdit.id) {
        const c = await updateRouteCollection(colEdit.id, { name });
        setCollections(l => l.map(x => (x.id === c.id ? c : x)));
      } else {
        const c = await addRouteCollection({ name, sort_order: collections.length });
        setCollections(l => [...l, c]);
        setFilter(c.id);
      }
      setColEdit(null);
    } catch { show('Could not save that collection.', 'var(--red)'); }
  };

  const removeCollection = async () => {
    const c = colDelete;
    if (!c) return;
    setColDelete(null);
    try {
      await deleteRouteCollection(c.id);
      setCollections(l => l.filter(x => x.id !== c.id));
      setRoutes(l => l.map(r => (r.collection_id === c.id ? { ...r, collection_id: null } : r)));
      setFilter('all');
      show('Collection removed. Its routes are still here.');
    } catch { show('Could not remove that collection.', 'var(--red)'); }
  };

  const colName = (id: string | null) => collections.find(c => c.id === id)?.name;

  return (
    <div className={s.page}>
      <Topbar
        title="Routes"
        sub={loading ? 'Loading your routes' : active.length ? `${active.length} ${active.length === 1 ? 'route' : 'routes'}${collections.length ? `, ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}` : ''}` : 'Plan where you are going and the stops on the way'}
        action={<Btn onClick={() => router.push('/routes/new')}><Plus size={16} strokeWidth={2.25} /> New route</Btn>}
      />

      <div className={s.wrap}>
        {!loading && routes.length > 0 && (
          <>
            <div className={s.toolbar}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search routes and stops" className={s.search} />
              <Link href="/places" className={s.backBtn}><MapPin size={15} /> Places</Link>
            </div>
            <div className={s.filters} role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={filter === 'all'} className={`${s.chip} ${filter === 'all' ? s.chipOn : ''}`} onClick={() => setFilter('all')}>All</button>
              <button type="button" role="tab" aria-selected={filter === 'fav'} className={`${s.chip} ${filter === 'fav' ? s.chipOn : ''}`} onClick={() => setFilter('fav')}><Star size={13} /> Favourites</button>
              {collections.map(c => (
                <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} className={`${s.chip} ${filter === c.id ? s.chipOn : ''}`} onClick={() => setFilter(c.id)}>{c.name}</button>
              ))}
              <button type="button" className={`${s.chip} ${s.chipAdd}`} onClick={() => setColEdit({ id: null, name: '' })}><Plus size={13} /> Collection</button>
              {archivedCount > 0 && (
                <button type="button" role="tab" aria-selected={filter === 'archived'} className={`${s.chip} ${filter === 'archived' ? s.chipOn : ''}`} onClick={() => setFilter('archived')}><Archive size={13} /> Archived ({archivedCount})</button>
              )}
            </div>
            {activeCollection && (
              <div className={s.colBar}>
                <span>{activeCollection.name}</span>
                <button type="button" className={s.linkBtn} onClick={() => setColEdit({ id: activeCollection.id, name: activeCollection.name })}><Pencil size={13} /> Rename</button>
                <button type="button" className={`${s.linkBtn} ${s.linkDanger}`} onClick={() => setColDelete(activeCollection)}><Trash2 size={13} /> Remove collection</button>
              </div>
            )}
          </>
        )}

        {loading ? (
          <div className={s.grid}>{[0, 1, 2].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : routes.length === 0 ? (
          <EmptyState
            icon={<RouteIcon size={26} />}
            msg="No routes yet. Plan your first one: where you start, where you are going, and any stops on the way."
            action={<Btn sm onClick={() => router.push('/routes/new')}><Plus size={15} /> Plan a route</Btn>}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<RouteIcon size={26} />}
            msg={q ? 'No routes match that search.' : filter === 'fav' ? 'No favourites yet. Star a route to keep it here.' : filter === 'archived' ? 'Nothing archived.' : 'No routes in this collection yet. Pick it under Details when you plan one.'}
          />
        ) : (
          <div className={s.grid}>
            {shown.map(r => {
              const Icon = MODE_ICON[r.mode] ?? Footprints;
              const stops = Array.isArray(r.stops) ? r.stops : [];
              const named = stops.filter(x => x.name || x.here);
              const from = named[0], to = named.length > 1 ? named[named.length - 1] : null;
              const mids = Math.max(0, named.length - 2);
              return (
                <article key={r.id} className={`${s.card} ${r.journey ? s.cardLive : ''}`}>
                  <Link href={`/routes/${r.id}`} className={s.cardMain}>
                    <RouteSketch r={r} />
                    <span className={s.cardBody}>
                      <span className={s.cardName}>
                        {routeTitle(r)}
                        {r.favourite && <Star size={14} className={s.favStar} fill="currentColor" aria-label="Favourite" />}
                      </span>
                      {from && (
                        <span className={s.cardRoute}>
                          {from.here ? 'Your location' : from.name}{to ? ` to ${to.here ? 'your location' : to.name}` : ''}
                          {mids > 0 ? `, ${mids} ${mids === 1 ? 'stop' : 'stops'} on the way` : ''}
                        </span>
                      )}
                      <span className={s.cardMeta}>
                        <span><Icon size={13} /> {!r.duration_s ? 'Not planned yet' : r.mode === 'transit' ? 'Transit' : fmtDuration(r.duration_s)}</span>
                        {r.distance_m ? <span>{fmtDistance(r.distance_m)}</span> : null}
                        {r.last_done_at && <span><Clock size={13} /> {MODE_PAST[r.mode]} {whenDone(r.last_done_at)}</span>}
                      </span>
                      {(r.collection_id || r.tags?.length > 0) && (
                        <span className={s.cardTags}>
                          {r.collection_id && colName(r.collection_id) && <Tag color="var(--pu-l)">{colName(r.collection_id)}</Tag>}
                          {(r.tags ?? []).map(t => <Tag key={t}>{t}</Tag>)}
                        </span>
                      )}
                    </span>
                  </Link>
                  <div className={s.cardActions}>
                    {r.journey
                      ? <Link href={`/routes/${r.id}`} className={`${s.actBtn} ${s.actGo}`}><Play size={14} /> Continue journey</Link>
                      : <Link href={`/routes/${r.id}`} className={s.actBtn}><Pencil size={14} /> Open</Link>}
                    <button type="button" className={`${s.iconBtn} ${r.favourite ? s.iconOn : ''}`} onClick={() => patch(r, { favourite: !r.favourite })} aria-label={r.favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={r.favourite}>
                      <Star size={15} fill={r.favourite ? 'currentColor' : 'none'} />
                    </button>
                    <button type="button" className={s.iconBtn} onClick={() => duplicate(r)} aria-label={`Copy ${routeTitle(r)}`}><Copy size={15} /></button>
                    <button type="button" className={s.iconBtn} onClick={() => patch(r, { archived: !r.archived }, r.archived ? 'Back in your routes' : 'Archived')} aria-label={r.archived ? 'Unarchive' : 'Archive'}>
                      {r.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                    <button type="button" className={`${s.iconBtn} ${s.danger}`} onClick={() => setDelItem(r)} aria-label={`Delete ${routeTitle(r)}`}><Trash2 size={15} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {colEdit && (
        <Modal onClose={() => setColEdit(null)}>
          <ModalTitle>{colEdit.id ? 'Rename collection' : 'New collection'}</ModalTitle>
          <FInput label="Name" value={colEdit.name} onChange={v => setColEdit({ ...colEdit, name: v })} placeholder="Dublin day trips" />
          <ModalFooter onCancel={() => setColEdit(null)} onSave={saveCollection} saveLabel={colEdit.id ? 'Save' : 'Add collection'} />
        </Modal>
      )}
      {colDelete && (
        <Modal onClose={() => setColDelete(null)}>
          <Confirm msg={`Remove the "${colDelete.name}" collection? The routes in it stay, just without a collection.`} onConfirm={removeCollection} onCancel={() => setColDelete(null)} />
        </Modal>
      )}
      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${routeTitle(delItem)}" will be deleted.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
