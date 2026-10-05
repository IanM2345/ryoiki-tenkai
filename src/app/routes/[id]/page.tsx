'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft, Footprints, Bike, Car, TramFront, Plus, ArrowUpDown, Sparkles, GripVertical, X, Navigation,
  Play, Pencil, Trash2, GraduationCap, Star, Archive, ArchiveRestore, Loader2, Route as RouteIcon, ExternalLink, History, Check, CloudOff,
} from 'lucide-react';
import {
  Btn, Lbl, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea, TagInput, EmptyState, Toast, useToast, Toggle,
} from '@/components/ui';
import {
  getRoute, addRoute, updateRoute, deleteRoute, getPlaces, getRouteCollections, addRouteCollection, getRouteTrips, addRouteTrip,
} from '@/lib/db';
import type { DbPlace, DbRoute, DbRouteCollection, DbRouteTrip, RouteMode, RouteStop } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { reverseGeocode } from '@/lib/geocode';
import { fmtDate, localDateStr } from '@/lib/dates';
import {
  MODES, emptyStop, hereStop, stopPoint, planRoute, bestOrder, fmtDistance, fmtDuration, getPosition,
  googleRouteUrl, googleLegUrl, appleLegUrl, routeTitle, deviceId, mapboxToken, type LatLng,
} from '@/lib/routing';
import StopField from '../StopField';
import Journey, { journeyElapsed } from '../Journey';
import type { MapPoint } from '../mapTypes';
import s from '../routes.module.css';

// 3D Mapbox map when the site has a Mapbox token; the flat map otherwise.
const RouteMap = dynamic(() => (mapboxToken() ? import('../RouteMap3D') : import('../RouteMapFlat')), {
  ssr: false,
  loading: () => <div className={`${s.mapBox} skeleton`} />,
});

type Draft = Omit<DbRoute, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const MODE_ICON: Record<RouteMode, typeof Footprints> = { walk: Footprints, cycle: Bike, drive: Car, transit: TramFront };
const FALLBACK_CENTER: [number, number] = [53.3498, -6.2603];

function blankDraft(): Draft {
  return {
    name: '', notes: null, mode: 'walk', stops: [hereStop(), emptyStop()], geometry: null, legs: null,
    distance_m: null, duration_s: null, collection_id: null, tags: [], favourite: false, archived: false,
    journey: null, last_done_at: null,
  };
}

function toDraft(r: DbRoute): Draft {
  return {
    name: r.name ?? '', notes: r.notes, mode: r.mode ?? 'walk',
    stops: Array.isArray(r.stops) && r.stops.length ? r.stops : [hereStop(), emptyStop()],
    geometry: r.geometry, legs: r.legs, distance_m: r.distance_m, duration_s: r.duration_s,
    collection_id: r.collection_id, tags: r.tags ?? [], favourite: !!r.favourite, archived: !!r.archived,
    journey: r.journey, last_done_at: r.last_done_at,
  };
}

function labelFor(i: number, n: number) {
  return i === 0 ? 'A' : i === n - 1 ? 'B' : String(i);
}

function placeholderFor(i: number, n: number) {
  return i === 0 ? 'Starting from' : i === n - 1 ? 'Where to?' : 'Add a stop';
}

interface DragState { from: number; startY: number; dy: number; h: number; centers: number[] }

function dragTarget(d: DragState) {
  const c = d.centers[d.from] + d.dy;
  let to = d.from;
  d.centers.forEach((y, j) => {
    if (j < d.from && c < y) to = Math.min(to, j);
    if (j > d.from && c > y) to = Math.max(to, j);
  });
  return to;
}

function rowShift(i: number, d: DragState | null) {
  if (!d) return 0;
  if (i === d.from) return d.dy;
  const to = dragTarget(d);
  if (d.from < to && i > d.from && i <= to) return -d.h;
  if (to < d.from && i >= to && i < d.from) return d.h;
  return 0;
}

export default function RoutePlannerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [initialId] = useState(() => (params.id && params.id !== 'new' ? params.id : null));

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [places, setPlaces] = useState<DbPlace[]>([]);
  const [collections, setCollections] = useState<DbRouteCollection[]>([]);
  const [trips, setTrips] = useState<DbRouteTrip[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [here, setHere] = useState<LatLng | null>(null);
  const [hereError, setHereError] = useState<string | null>(null);
  const [live, setLive] = useState<{ pos: LatLng; accuracy: number | null } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [fitKey, setFitKey] = useState('init');

  const [editStop, setEditStop] = useState<RouteStop | null>(null);
  const [newCollection, setNewCollection] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tripDone, setTripDone] = useState<DbRouteTrip | null>(null);
  const [starting, setStarting] = useState(false);
  const [toast, show] = useToast();

  const idRef = useRef<string | null>(initialId);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const lastSavedAt = useRef<string | null>(null);
  const plannedKey = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const askedHere = useRef(false);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // ── Load ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [r, pl, cols, tr] = await Promise.all([
          initialId ? getRoute(initialId) : Promise.resolve(null),
          getPlaces().catch(() => [] as DbPlace[]),
          getRouteCollections().catch(() => [] as DbRouteCollection[]),
          initialId ? getRouteTrips(initialId).catch(() => [] as DbRouteTrip[]) : Promise.resolve([] as DbRouteTrip[]),
        ]);
        setPlaces(pl); setCollections(cols); setTrips(tr);
        if (initialId && !r) { setMissing(true); return; }
        if (!initialId) {
          const to = new URLSearchParams(window.location.search).get('to');
          const place = to ? pl.find(x => x.id === to && x.lat != null && x.lng != null) : null;
          if (place) {
            const d = blankDraft();
            d.stops[1] = { id: d.stops[1].id, name: place.name, address: place.address, lat: place.lat, lng: place.lng, place_id: place.id };
            setDraft(d);
            draftRef.current = d;
            dirtyRef.current = true;
            setSaveState('dirty');
          }
        }
        if (r) {
          const d = toDraft(r);
          lastSavedAt.current = r.updated_at;
          setDraft(d);
          draftRef.current = d;
          // The saved line is still good if nothing has moved; "my location" is checked once we know where she is.
          plannedKey.current = d.geometry ? keyFor(d, null, null) : null;
          setSaveState('saved');
        }
        setFitKey(`load-${Date.now()}`);
      } catch {
        show('Could not load this route.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialId, show]);

  // ── Saving (automatic) ───────────────────────────────────
  const flush = useCallback(async () => {
    if (savingRef.current || !dirtyRef.current) return;
    const d = draftRef.current;
    if (!idRef.current && !d.name.trim() && !d.stops.some(x => x.lat != null)) return; // nothing worth keeping yet
    savingRef.current = true; dirtyRef.current = false; setSaveState('saving');
    let failed = false;
    try {
      const saved = idRef.current ? await updateRoute(idRef.current, d) : await addRoute(d);
      lastSavedAt.current = saved.updated_at;
      if (!idRef.current) {
        idRef.current = saved.id;
        window.history.replaceState(window.history.state, '', `/routes/${saved.id}`);
      }
    } catch {
      dirtyRef.current = true; failed = true;
    } finally {
      savingRef.current = false;
      setSaveState(failed ? 'error' : dirtyRef.current ? 'dirty' : 'saved');
      if (!failed && dirtyRef.current) setTimeout(() => { flushRef.current(); }, 250);
    }
  }, []);
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  const edit = useCallback((fn: (d: Draft) => Draft) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setDraft(d => fn(d));
  }, []);

  useEffect(() => {
    if (saveState !== 'dirty') return;
    const t = setTimeout(() => flushRef.current(), 700);
    return () => clearTimeout(t);
  }, [draft, saveState]);

  // Save straight away when she leaves the page or puts the phone down.
  useEffect(() => {
    const out = () => { if (dirtyRef.current) flushRef.current(); };
    const onVis = () => { if (document.visibilityState === 'hidden') out(); };
    window.addEventListener('pagehide', out);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', out); document.removeEventListener('visibilitychange', onVis); out(); };
  }, []);

  // Changes from her other device (including ticking off stops on a journey).
  const reloadRemote = useCallback(async () => {
    const id = idRef.current;
    if (!id || dirtyRef.current || savingRef.current) return;
    const r = await getRoute(id).catch(() => null);
    if (!r || r.updated_at === lastSavedAt.current || dirtyRef.current || savingRef.current) return;
    lastSavedAt.current = r.updated_at;
    const d = toDraft(r);
    setDraft(d);
    setSaveState('saved');
  }, []);
  useLiveTables(['routes'], reloadRemote);

  // ── Where she is (for "Your location") ───────────────────
  const needsHere = draft.stops.some(x => x.here) && !draft.journey;
  const askHere = useCallback(() => {
    askedHere.current = true;
    getPosition()
      .then(p => { setHere({ lat: p.lat, lng: p.lng }); setHereError(null); })
      .catch(e => setHereError(e instanceof Error ? e.message : "Couldn't find your location."));
  }, []);
  useEffect(() => {
    if (!loading && needsHere && !here && !askedHere.current) askHere();
  }, [loading, needsHere, here, askHere]);

  // ── Points on the route ─────────────────────────────────
  const n = draft.stops.length;
  const hereFor = draft.journey?.start ?? here;
  const resolved = useMemo(() => draft.stops
    .map((stop, i) => ({ stop, i, pt: stopPoint(stop, hereFor), label: labelFor(i, draft.stops.length) }))
    .filter((x): x is { stop: RouteStop; i: number; pt: LatLng; label: string } => !!x.pt),
  [draft.stops, hereFor]);
  const planKey = keyFor(draft, hereFor, resolved);
  const roads = !!draft.geometry && draft.geometry.length > resolved.length && draft.mode !== 'transit';

  // Re-plan the line whenever the stops or the way of travelling change.
  useEffect(() => {
    if (loading || draft.journey || planKey === plannedKey.current) return;
    let cancelled = false;
    const pts = resolved.map(r => r.pt);
    const t = setTimeout(async () => {
      if (pts.length < 2) {
        plannedKey.current = planKey;
        setPlanNote(null);
        if (draftRef.current.geometry) edit(d => ({ ...d, geometry: null, legs: null, distance_m: null, duration_s: null }));
        return;
      }
      setPlanning(true);
      const r = await planRoute(draft.mode, pts);
      if (cancelled) return;
      plannedKey.current = planKey;
      setPlanning(false);
      setPlanNote(r.note ?? null);
      edit(d => ({ ...d, geometry: r.geometry, legs: r.legs, distance_m: r.distance_m, duration_s: r.duration_s }));
      setFitKey(`plan-${Date.now()}`);
    }, 450);
    return () => { cancelled = true; clearTimeout(t); setPlanning(false); };
  }, [planKey, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Editing stops ───────────────────────────────────────
  const setStop = (id: string, next: RouteStop) => edit(d => ({ ...d, stops: d.stops.map(x => (x.id === id ? next : x)) }));
  const clearStop = (id: string) => edit(d => ({ ...d, stops: d.stops.map(x => (x.id === id ? { ...emptyStop(), id } : x)) }));
  const removeStop = (id: string) => edit(d => ({ ...d, stops: d.stops.length > 2 ? d.stops.filter(x => x.id !== id) : d.stops.map(x => (x.id === id ? { ...emptyStop(), id } : x)) }));
  const addStop = () => {
    const st = emptyStop();
    setFocusId(st.id);
    edit(d => ({ ...d, stops: [...d.stops.slice(0, -1), st, d.stops[d.stops.length - 1]] }));
  };
  const reverse = () => edit(d => ({ ...d, stops: [...d.stops].reverse() }));
  const move = (from: number, to: number) => {
    if (from === to) return;
    edit(d => {
      const list = [...d.stops];
      const [x] = list.splice(from, 1);
      list.splice(to, 0, x);
      return { ...d, stops: list };
    });
  };

  const placeToStop = (p: DbPlace, keep?: RouteStop): RouteStop => ({
    id: keep?.id ?? emptyStop().id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, place_id: p.id,
    note: keep?.note ?? null, link: keep?.link ?? null,
  });

  const addPlace = (p: DbPlace) => {
    if (picking) {
      const target = draft.stops.find(x => x.id === picking);
      if (target) setStop(target.id, placeToStop(p, target));
      setPicking(null);
      return;
    }
    edit(d => {
      const empty = d.stops.findIndex(x => !x.here && x.lat == null);
      if (empty >= 0) return { ...d, stops: d.stops.map((x, i) => (i === empty ? placeToStop(p, x) : x)) };
      return { ...d, stops: [...d.stops.slice(0, -1), placeToStop(p), d.stops[d.stops.length - 1]] };
    });
    show(`${p.name} added to the route`);
  };

  const pickOnMap = (id: string) => {
    setPicking(id);
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onMapPick = async (p: LatLng) => {
    const id = picking;
    if (!id) return;
    setPicking(null);
    const target = draftRef.current.stops.find(x => x.id === id);
    if (!target) return;
    const pinned = { ...target, here: false, place_id: null, name: 'Dropped pin', address: null, lat: p.lat, lng: p.lng };
    setStop(id, pinned);
    const label = await reverseGeocode(p.lat, p.lng).catch(() => null);
    if (label) {
      const [first, ...rest] = label.split(', ');
      edit(d => ({ ...d, stops: d.stops.map(x => (x.id === id && x.lat === p.lat && x.lng === p.lng ? { ...x, name: first, address: rest.join(', ') || null } : x)) }));
    }
  };

  const doBestOrder = async () => {
    const pts = draft.stops.map(x => stopPoint(x, hereFor));
    if (pts.some(p => !p) || n < 4) return;
    setOrdering(true);
    const mids = draft.stops.slice(1, -1);
    const { order, roads: byRoad } = await bestOrder(draft.mode, pts[0]!, pts[n - 1]!, pts.slice(1, -1) as LatLng[]);
    setOrdering(false);
    const same = order.every((v, i) => v === i);
    if (same) { show('These stops are already in the best order'); return; }
    edit(d => ({ ...d, stops: [d.stops[0], ...order.map(k => mids[k]), d.stops[d.stops.length - 1]] }));
    show(byRoad ? 'Stops put in the quickest order' : 'Stops put in the shortest order');
  };

  // ── Drag to reorder ─────────────────────────────────────
  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row]');
    if (!rows) return;
    const rects = Array.from(rows).map(r => r.getBoundingClientRect());
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: i, startY: e.clientY, dy: 0, h: rects.length > 1 ? Math.abs(rects[1].top - rects[0].top) : rects[i].height, centers: rects.map(r => r.top + r.height / 2) });
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, dy: e.clientY - drag.startY });
  };
  const onGripUp = () => {
    if (!drag) return;
    const to = dragTarget(drag);
    setDrag(null);
    move(drag.from, to);
  };
  const onGripKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); move(i, i - 1); }
    if (e.key === 'ArrowDown' && i < n - 1) { e.preventDefault(); move(i, i + 1); }
  };

  // ── Journey ─────────────────────────────────────────────
  const startJourney = async () => {
    if (resolved.length < 2 || starting) return;
    setStarting(true);
    let start: LatLng | null = null;
    if (draft.stops.some(x => x.here)) {
      try {
        const p = await getPosition();
        start = { lat: p.lat, lng: p.lng };
        setHere(start);
      } catch (e) {
        setStarting(false);
        show(e instanceof Error ? e.message : "Couldn't find your location.", 'var(--red)');
        return;
      }
    }
    const now = new Date().toISOString();
    const first = draft.stops[0];
    edit(d => ({ ...d, journey: { started_at: now, elapsed_ms: 0, running_since: now, visited: { [first.id]: now }, start, notes: '', device: deviceId() } }));
    setStarting(false);
    setFitKey(`journey-${Date.now()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finishJourney = async (notes: string) => {
    const j = draft.journey;
    if (!j) return;
    const t = Date.now();
    const pts = resolved;
    const visitedCount = pts.filter((p, i) => i > 0 && j.visited?.[p.stop.id]).length;
    let lastVisited = 0;
    pts.forEach((p, i) => { if (i > 0 && j.visited?.[p.stop.id]) lastVisited = i; });
    const dist = (draft.legs ?? []).slice(0, lastVisited).reduce((a, l) => a + l.distance_m, 0);
    try {
      const trip = await addRouteTrip({
        route_id: idRef.current, route_name: routeTitle(draft), mode: draft.mode,
        started_at: j.started_at, ended_at: new Date(t).toISOString(),
        active_seconds: Math.round(journeyElapsed(j, t) / 1000), distance_m: dist || null,
        stops_total: Math.max(0, pts.length - 1), stops_visited: visitedCount, notes: notes.trim() || null,
      });
      setTrips(list => [trip, ...list]);
      setTripDone(trip);
      setLive(null);
      edit(d => ({ ...d, journey: null, last_done_at: trip.ended_at }));
    } catch {
      show('Could not save this journey. Check your connection and try again.', 'var(--red)');
    }
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    if (!idRef.current) { router.push('/routes'); return; }
    try {
      dirtyRef.current = false;
      await deleteRoute(idRef.current);
      router.push('/routes');
    } catch { show('Could not delete this route.', 'var(--red)'); }
  };

  const createCollection = async () => {
    const name = newCollection?.trim();
    if (!name) return;
    try {
      const c = await addRouteCollection({ name, sort_order: collections.length });
      setCollections(l => [...l, c]);
      edit(d => ({ ...d, collection_id: c.id }));
      setNewCollection(null);
    } catch { show('Could not add that collection.', 'var(--red)'); }
  };

  // ── Derived for display ─────────────────────────────────
  const title = routeTitle(draft);
  const mapPoints: MapPoint[] = resolved.map(r => ({
    id: r.stop.id, lat: r.pt.lat, lng: r.pt.lng, label: r.label,
    kind: r.i === 0 ? 'start' : r.i === n - 1 ? 'end' : 'stop',
    name: r.stop.here ? 'Your location' : r.stop.name,
    visited: !!draft.journey && r.i > 0 && !!draft.journey.visited?.[r.stop.id],
    next: !!draft.journey && resolved.find((x, k) => k > 0 && !draft.journey!.visited?.[x.stop.id])?.stop.id === r.stop.id,
  }));
  const usedPlaceIds = new Set(draft.stops.map(x => x.place_id).filter(Boolean));
  const mapPlaces = places.filter(p => !usedPlaceIds.has(p.id));
  const center: [number, number] = here ? [here.lat, here.lng] : (() => {
    const p = places.find(x => x.lat != null && x.lng != null);
    return p ? [p.lat!, p.lng!] : FALLBACK_CENTER;
  })();
  const near = here ?? (resolved[0]?.pt ?? null);
  const allResolved = resolved.length === n;
  const fromHere = !!draft.stops[0]?.here;
  const rest = resolved.filter(r => r.i > 0).map(r => r.pt);
  const google = resolved.length >= 2 ? googleRouteUrl(fromHere ? null : resolved[0].pt, rest, draft.mode) : null;
  const firstLegTo = resolved[1]?.pt;
  const apple = firstLegTo ? appleLegUrl(fromHere ? null : resolved[0].pt, firstLegTo, draft.mode) : null;
  const ModeIcon = MODE_ICON[draft.mode];
  const modeVerb = MODES.find(m => m.key === draft.mode)?.verb ?? 'trip';
  const note = planNote ?? (draft.mode === 'transit' && resolved.length >= 2
    ? 'Buses and trains change through the day, so Google Maps plans the times. Use the directions buttons for each step.'
    : !roads && resolved.length >= 2 ? 'Straight lines with estimates.' : null);

  const sub = loading ? 'Loading your route'
    : saveState === 'saving' ? 'Saving'
    : saveState === 'error' ? 'Not saved yet. It will try again when you make a change.'
    : draft.journey ? 'Journey in progress'
    : draft.distance_m ? `${fmtDistance(draft.distance_m)}${draft.mode === 'transit' ? '' : `, about ${fmtDuration(draft.duration_s)}`}${saveState === 'saved' ? '. Saved' : ''}`
    : 'Plan a start, an end and any stops in between';

  const pickingLabel = picking ? labelFor(draft.stops.findIndex(x => x.id === picking), n) : '';

  return (
    <div className={s.page}>
      <Topbar
        title={loading ? 'Route' : title}
        sub={sub}
        maxWidth={1240}
        action={<Link href="/routes" className={s.backBtn}><ChevronLeft size={16} /> All routes</Link>}
      />

      <div className={`${s.wrap} ${s.wrapWide}`}>
        {loading ? (
          <div className={s.planner}>
            <div className={`skeleton ${s.skelPanel}`} />
            <div className={`skeleton ${s.mapBox}`} />
          </div>
        ) : missing ? (
          <EmptyState icon={<RouteIcon size={26} />} msg="This route isn't here any more. It may have been deleted on another device." action={<Btn sm onClick={() => router.push('/routes')}>See all routes</Btn>} />
        ) : (
          <div className={`${s.planner} ${draft.journey ? s.plannerJourney : ''}`}>
            {/* 1. Plan (or the live journey) */}
            <div className={s.colPlan}>
              {draft.journey ? (
                <Journey
                  journey={draft.journey}
                  points={resolved.map(r => ({ stop: r.stop.here ? { ...r.stop, name: 'Start' } : r.stop, pt: r.pt, label: r.label }))}
                  legs={draft.legs}
                  mode={draft.mode}
                  onChange={j => edit(d => ({ ...d, journey: j }))}
                  onFinish={finishJourney}
                  onPosition={(pos, accuracy) => setLive(pos ? { pos, accuracy } : null)}
                  notify={show}
                />
              ) : (
                <section className={s.planCard} aria-label="Plan">
                  <div className={s.modes} role="radiogroup" aria-label="How you're travelling">
                    {MODES.map(m => {
                      const Icon = MODE_ICON[m.key];
                      return (
                        <button key={m.key} type="button" role="radio" aria-checked={draft.mode === m.key} className={`${s.mode} ${draft.mode === m.key ? s.modeOn : ''}`} onClick={() => edit(d => ({ ...d, mode: m.key }))}>
                          <Icon size={16} strokeWidth={2} /> {m.label}
                        </button>
                      );
                    })}
                  </div>

                  <ol ref={listRef} className={`${s.stops} ${drag ? s.stopsDragging : ''}`}>
                    {draft.stops.map((st, i) => {
                      const shift = rowShift(i, drag);
                      return (
                        <li
                          key={st.id}
                          data-row
                          className={`${s.stopRow} ${drag?.from === i ? s.stopRowLifted : ''} ${picking === st.id ? s.stopRowPicking : ''}`}
                          style={shift ? { transform: `translateY(${shift}px)` } : undefined}
                        >
                          <span className={`${s.stopBadge} ${i === 0 ? s.badgeStart : i === n - 1 ? s.badgeEnd : ''}`} aria-hidden>{labelFor(i, n)}</span>
                          <StopField
                            stop={st}
                            placeholder={placeholderFor(i, n)}
                            places={places}
                            near={near}
                            autoFocus={focusId === st.id}
                            onChange={v => { setStop(st.id, v); if (v.here && !here) askHere(); }}
                            onPickOnMap={() => pickOnMap(st.id)}
                            onClear={n <= 2 ? () => clearStop(st.id) : undefined}
                          />
                          <button
                            type="button"
                            className={s.grip}
                            aria-label={`Move ${st.name || placeholderFor(i, n)}. Use the arrow keys.`}
                            onPointerDown={e => onGripDown(e, i)}
                            onPointerMove={onGripMove}
                            onPointerUp={onGripUp}
                            onPointerCancel={() => setDrag(null)}
                            onKeyDown={e => onGripKey(e, i)}
                          >
                            <GripVertical size={16} />
                          </button>
                          {n > 2 && (
                            <button type="button" className={s.rowX} onClick={() => removeStop(st.id)} aria-label={`Remove ${st.name || 'this stop'}`}>
                              <X size={15} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {hereError && needsHere && (
                    <p className={s.warn}>{hereError} <button type="button" className={s.linkBtn} onClick={askHere}>Try again</button></p>
                  )}

                  <div className={s.tools}>
                    <button type="button" className={s.toolBtn} onClick={addStop}><Plus size={15} /> Add stop</button>
                    <button type="button" className={s.toolBtn} onClick={reverse}><ArrowUpDown size={15} /> Reverse</button>
                    {n >= 4 && (
                      <button type="button" className={s.toolBtn} onClick={doBestOrder} disabled={!allResolved || ordering} title={allResolved ? undefined : 'Fill in every stop first'}>
                        {ordering ? <Loader2 size={15} className={s.spin} /> : <Sparkles size={15} />} Best order
                      </button>
                    )}
                  </div>

                  {resolved.length >= 2 && (
                    <div className={s.summary}>
                      <span className={s.sumIcon}><ModeIcon size={20} /></span>
                      <div className={s.sumBody}>
                        {planning ? (
                          <span className={s.sumBig}><Loader2 size={16} className={s.spin} /> Planning</span>
                        ) : (
                          draft.mode === 'transit'
                            ? <span className={s.sumBig}>{fmtDistance(draft.distance_m)} <small>as the crow flies</small></span>
                            : <span className={s.sumBig}>{fmtDuration(draft.duration_s)} <small>{fmtDistance(draft.distance_m)}</small></span>
                        )}
                        <span className={s.sumSmall}>
                          {resolved.length - 1} {resolved.length === 2 ? 'leg' : 'legs'}
                          {!roads && draft.mode !== 'transit' && ', estimated'}
                          {resolved.length < n && `. ${n - resolved.length} still to fill in`}
                        </span>
                      </div>
                    </div>
                  )}
                  {note && resolved.length >= 2 && <p className={s.note}>{note}</p>}

                  {resolved.length >= 2 && (
                    <div className={s.openIn}>
                      {google && <a className={s.ghostBtn} href={google.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Google Maps</a>}
                      {apple && <a className={s.ghostBtn} href={apple} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Apple Maps</a>}
                    </div>
                  )}
                  {resolved.length >= 2 && (
                    <p className={s.hint}>
                      {draft.mode === 'transit'
                        ? 'Both apps open the first step. Journey mode has a button for each next stop.'
                        : google?.capped
                          ? 'Google Maps takes up to 10 stops, so it opens the first 10. Apple Maps opens one stop at a time.'
                          : 'Google Maps opens the whole route. Apple Maps opens one stop at a time, and journey mode has a button for each next one.'}
                    </p>
                  )}

                  {idRef.current && resolved.length >= 2 && (
                    <Link href={`/go?route=${idRef.current}`} className={s.studyLink}><GraduationCap size={16} /> Revise on the way (On the Go)</Link>
                  )}
                  <button type="button" className={s.startBtn} onClick={startJourney} disabled={resolved.length < 2 || starting}>
                    {starting ? <Loader2 size={18} className={s.spin} /> : <Play size={18} />} Start journey
                  </button>
                </section>
              )}
            </div>

            {/* 2. Map */}
            <div className={s.colMap} ref={mapRef}>
              {picking && (
                <div className={s.pickBanner} role="status">
                  <span>Tap the map to set <b>{pickingLabel}</b>, or tap one of your places.</span>
                  <button type="button" className={s.linkBtn} onClick={() => setPicking(null)}>Cancel</button>
                </div>
              )}
              <RouteMap
                points={mapPoints}
                line={draft.geometry}
                roads={roads}
                places={mapPlaces}
                picking={!!picking}
                onPick={onMapPick}
                onAddPlace={draft.journey ? undefined : addPlace}
                me={live?.pos ?? (draft.journey ? null : here)}
                meAccuracy={live?.accuracy ?? null}
                follow={!!draft.journey && !!live}
                fitKey={fitKey}
                center={center}
              />
              {!draft.journey && mapPlaces.length > 0 && <p className={s.mapHint}>The small dots are your saved places. Tap one to add it.</p>}
            </div>

            {/* 3. Details */}
            <div className={s.colMore}>
              {resolved.length >= 2 && (
                <section className={s.panelCard} aria-labelledby="stops-h">
                  <h2 id="stops-h" className={s.panelH}>Stops</h2>
                  <ol className={s.itin}>
                    {resolved.map((r, k) => {
                      const leg = k > 0 ? draft.legs?.[k - 1] : null;
                      const prev = k > 0 ? resolved[k - 1] : null;
                      return (
                        <li key={r.stop.id} className={s.itinRow}>
                          {leg && (
                            <div className={s.leg}>
                              <span>{draft.mode === 'transit' ? fmtDistance(leg.distance_m) : `${fmtDuration(leg.duration_s)} ${modeVerb}, ${fmtDistance(leg.distance_m)}`}</span>
                              <span className={s.legLinks}>
                                <a href={googleLegUrl(prev!.stop.here && !draft.journey ? null : prev!.pt, r.pt, draft.mode)} target="_blank" rel="noopener noreferrer"><Navigation size={12} /> Google</a>
                                <a href={appleLegUrl(prev!.stop.here && !draft.journey ? null : prev!.pt, r.pt, draft.mode)} target="_blank" rel="noopener noreferrer"><Navigation size={12} /> Apple</a>
                              </span>
                            </div>
                          )}
                          <div className={s.itinStop}>
                            <span className={`${s.stopBadge} ${r.i === 0 ? s.badgeStart : r.i === n - 1 ? s.badgeEnd : ''}`}>{r.label}</span>
                            <div className={s.itinBody}>
                              <b>{r.stop.here ? 'Your location' : r.stop.name}</b>
                              {r.stop.address && <small>{r.stop.address}</small>}
                              {r.stop.note && <p>{r.stop.note}</p>}
                              {r.stop.link && <a href={r.stop.link} target="_blank" rel="noopener noreferrer" className={s.itinLink}><ExternalLink size={12} /> {r.stop.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>}
                            </div>
                            {!r.stop.here && !draft.journey && (
                              <button type="button" className={s.iconBtn} onClick={() => setEditStop(r.stop)} aria-label={`Notes for ${r.stop.name}`}><Pencil size={14} /></button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}

              <section className={s.panelCard} aria-labelledby="details-h">
                <h2 id="details-h" className={s.panelH}>Details</h2>
                <FInput label="Name" value={draft.name} onChange={v => edit(d => ({ ...d, name: v }))} placeholder={routeTitle({ ...draft, name: '' })} />
                <div className={s.fieldBlock}>
                  <Lbl>Collection</Lbl>
                  <div className={s.colPick}>
                    <button type="button" className={`${s.chip} ${!draft.collection_id ? s.chipOn : ''}`} onClick={() => edit(d => ({ ...d, collection_id: null }))}>None</button>
                    {collections.map(c => (
                      <button key={c.id} type="button" className={`${s.chip} ${draft.collection_id === c.id ? s.chipOn : ''}`} onClick={() => edit(d => ({ ...d, collection_id: c.id }))}>{c.name}</button>
                    ))}
                    <button type="button" className={`${s.chip} ${s.chipAdd}`} onClick={() => setNewCollection('')}><Plus size={13} /> New</button>
                  </div>
                </div>
                <div className={s.fieldBlock}>
                  <Lbl>Tags</Lbl>
                  <TagInput tags={draft.tags} onAdd={t => edit(d => ({ ...d, tags: [...d.tags, t] }))} onRemove={t => edit(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))} />
                </div>
                <FArea label="Notes" value={draft.notes ?? ''} onChange={v => edit(d => ({ ...d, notes: v || null }))} rows={3} placeholder="What to bring, when to go, why it's a good walk" />
                <label className={s.toggleRow}>
                  <span><Star size={16} /> Favourite</span>
                  <Toggle checked={draft.favourite} onChange={v => edit(d => ({ ...d, favourite: v }))} label="Favourite" />
                </label>
                <div className={s.dangerRow}>
                  <button type="button" className={s.toolBtn} onClick={() => { edit(d => ({ ...d, archived: !d.archived })); show(draft.archived ? 'Back in your routes' : 'Archived. Find it under Archived.'); }}>
                    {draft.archived ? <><ArchiveRestore size={15} /> Unarchive</> : <><Archive size={15} /> Archive</>}
                  </button>
                  <button type="button" className={`${s.toolBtn} ${s.toolDanger}`} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete route</button>
                </div>
                {saveState === 'error' && <p className={s.warn}><CloudOff size={14} /> Not saved yet. <button type="button" className={s.linkBtn} onClick={() => { dirtyRef.current = true; flush(); }}>Try again</button></p>}
              </section>

              {trips.length > 0 && (
                <section className={s.panelCard} aria-labelledby="trips-h">
                  <h2 id="trips-h" className={s.panelH}><History size={16} /> Past journeys</h2>
                  <ul className={s.trips}>
                    {trips.slice(0, 8).map(t => (
                      <li key={t.id}>
                        <span>{fmtDate(localDateStr(new Date(t.ended_at)))}</span>
                        <span>{fmtDuration(t.active_seconds)}</span>
                        <span>{t.stops_visited} of {t.stops_total} stops</span>
                        {t.notes && <p>{t.notes}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      {editStop && (
        <StopModal stop={editStop} onClose={() => setEditStop(null)} onSave={v => { setStop(v.id, v); setEditStop(null); }} />
      )}

      {newCollection !== null && (
        <Modal onClose={() => setNewCollection(null)}>
          <ModalTitle>New collection</ModalTitle>
          <FInput label="Name" value={newCollection} onChange={setNewCollection} placeholder="Dublin day trips" />
          <ModalFooter onCancel={() => setNewCollection(null)} onSave={createCollection} saveLabel="Add collection" />
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <Confirm msg={`"${title}" will be deleted. Past journeys stay in your history.`} onConfirm={doDelete} onCancel={() => setConfirmDelete(false)} />
        </Modal>
      )}

      {tripDone && (
        <Modal onClose={() => setTripDone(null)}>
          <ModalTitle>Journey saved</ModalTitle>
          <div className={s.tripSum}>
            <div><b>{fmtDuration(tripDone.active_seconds)}</b><span>on the way</span></div>
            <div><b>{tripDone.stops_visited} of {tripDone.stops_total}</b><span>stops</span></div>
            {tripDone.distance_m ? <div><b>{fmtDistance(tripDone.distance_m)}</b><span>covered</span></div> : null}
          </div>
          {tripDone.notes && <p className={s.tripNotes}>{tripDone.notes}</p>}
          <div className={s.modalEnd}><Btn onClick={() => setTripDone(null)}><Check size={16} /> Done</Btn></div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}

function StopModal({ stop, onClose, onSave }: { stop: RouteStop; onClose: () => void; onSave: (s: RouteStop) => void }) {
  const [name, setName] = useState(stop.name);
  const [note, setNote] = useState(stop.note ?? '');
  const [link, setLink] = useState(stop.link ?? '');
  const save = () => {
    const l = link.trim();
    onSave({ ...stop, name: name.trim() || stop.name, note: note.trim() || null, link: l ? (/^https?:\/\//i.test(l) ? l : `https://${l}`) : null });
  };
  return (
    <Modal onClose={onClose}>
      <ModalTitle>{stop.name}</ModalTitle>
      <FInput label="Name" value={name} onChange={setName} />
      <FArea label="Note" value={note} onChange={setNote} rows={3} placeholder="Order the cardamom bun. Closes at 5." />
      <FInput label="Link" value={link} onChange={setLink} placeholder="Opening hours, tickets, a menu" />
      <ModalFooter onCancel={onClose} onSave={save} saveLabel="Save stop" />
    </Modal>
  );
}

/** What the line was planned from: the travel mode plus every point's position. */
function keyFor(d: Pick<Draft, 'mode' | 'stops'>, here: LatLng | null, resolved: { pt: LatLng }[] | null): string {
  const pts = resolved ?? d.stops.map(x => stopPoint(x, here)).filter((p): p is LatLng => !!p).map(pt => ({ pt }));
  return `${d.mode}|${pts.map(p => `${p.pt.lat.toFixed(5)},${p.pt.lng.toFixed(5)}`).join(';')}`;
}
