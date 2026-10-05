'use client';
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box, Square, LocateFixed } from 'lucide-react';
import type { DbPlace } from '@/lib/db';
import { mapboxToken } from '@/lib/routing';
import type { MapPoint, RouteMapProps } from './mapTypes';
import RouteMapFlat from './RouteMapFlat';
import s from './routes.module.css';

const PREF_KEY = 'yw-map-3d';
const TILT = 58;

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function readPref(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; }
}

/** Compass direction from a to b, in degrees. */
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function stopEl(p: MapPoint, colors: Record<string, string>) {
  const el = document.createElement('div');
  const bg = p.visited ? colors.done : p.kind === 'start' ? colors.start : p.kind === 'end' ? colors.end : colors.stop;
  el.className = `${s.mbStop} ${p.kind === 'stop' ? '' : s.mbStopSquare} ${p.next ? s.mbStopNext : ''}`;
  el.style.setProperty('--c', bg);
  el.style.setProperty('--ink', p.kind === 'start' && !p.visited ? '#06210f' : p.kind === 'end' && !p.visited ? colors.onAccent : '#fff');
  if (p.visited) {
    el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  } else {
    el.textContent = p.label;
  }
  el.setAttribute('aria-label', p.name);
  return el;
}

function placeEl(p: DbPlace) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `${s.mbPlace} ${p.wishlist ? s.mbPlaceWish : ''}`;
  el.setAttribute('aria-label', p.name);
  return el;
}

function popupFor(title: string, sub: string | null, action?: { label: string; run: () => void }) {
  const box = document.createElement('div');
  box.className = s.popup;
  const strong = document.createElement('strong'); strong.textContent = title; box.appendChild(strong);
  if (sub) { const span = document.createElement('span'); span.textContent = sub; box.appendChild(span); }
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = action.label; b.onclick = action.run;
    box.appendChild(b);
  }
  return box;
}

const EMPTY_LINE: GeoJSON.Feature<GeoJSON.LineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };

/**
 * The 3D map: Mapbox Standard with buildings, landmarks and trees, lit for night on the
 * dark theme. A button flips between 3D and flat. In journey mode the camera tilts and
 * follows her, looking towards the next stop.
 */
export default function RouteMap3D(props: RouteMapProps) {
  const { points, line, roads, places, picking, me, follow = false, fitKey, center } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const propsRef = useRef(props);
  const stopMarkers = useRef<mapboxgl.Marker[]>([]);
  const placeMarkers = useRef<mapboxgl.Marker[]>([]);
  const meMarker = useRef<mapboxgl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  // No WebGL (very old device or a locked-down browser): fall back to the flat map.
  const [failed, setFailed] = useState<string | null>(() => (mapboxgl.supported() ? null : 'webgl'));
  const [is3d, setIs3d] = useState(readPref);
  const [following, setFollowing] = useState(true);
  const colors = useRef<Record<string, string>>({});

  useEffect(() => { propsRef.current = props; });

  // ── Create the map once ────────────────────────────────
  useEffect(() => {
    const token = mapboxToken();
    if (!box.current || !token) return;
    if (failed) return;
    colors.current = {
      start: cssVar('--gr', '#4ade80'), stop: cssVar('--pu-l', '#a855f7'), end: cssVar('--or', '#ff8c00'),
      done: cssVar('--tx-d', '#6b6b7b'), line: cssVar('--or', '#ff8c00'), onAccent: cssVar('--on-accent', '#120a02'),
    };
    const light = document.documentElement.dataset.scheme === 'light';
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: box.current,
        style: 'mapbox://styles/mapbox/standard',
        config: { basemap: { lightPreset: light ? 'day' : 'night', show3dObjects: is3d, showPointOfInterestLabels: true } },
        center: [center[1], center[0]],
        zoom: 13,
        pitch: is3d ? 45 : 0,
        attributionControl: true,
        cooperativeGestures: false,
      });
    } catch {
      setTimeout(() => setFailed('webgl'), 0);
      return;
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('style.load', () => {
      map.addSource('route', { type: 'geojson', data: EMPTY_LINE });
      map.addLayer({
        id: 'route-casing', type: 'line', source: 'route', slot: 'middle',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000', 'line-opacity': 0.4, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 12], 'line-emissive-strength': 1 },
      });
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route', slot: 'middle',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.current.line, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 7], 'line-emissive-strength': 1 },
      });
      setReady(true);
    });
    map.on('error', e => {
      const status = (e.error as { status?: number } | undefined)?.status;
      if (status === 401 || status === 403) setFailed('token');
    });
    map.on('click', e => {
      if (propsRef.current.picking) propsRef.current.onPick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    // If she drags the map during a journey, stop pulling the camera back until she taps re-centre.
    map.on('dragstart', () => { if (propsRef.current.follow) setFollowing(false); });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Route line ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource('route') as mapboxgl.GeoJSONSource | undefined;
    src?.setData(line && line.length > 1
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.map(([lat, lng]) => [lng, lat]) } }
      : EMPTY_LINE);
    map.setPaintProperty('route-line', 'line-dasharray', roads ? [1, 0] : [0.2, 2]);
  }, [line, roads, ready]);

  // ── Stop markers ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stopMarkers.current.forEach(m => m.remove());
    stopMarkers.current = points.map(p => {
      const m = new mapboxgl.Marker({ element: stopEl(p, colors.current) })
        .setLngLat([p.lng, p.lat])
        .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setDOMContent(popupFor(p.name, null)))
        .addTo(map);
      return m;
    });
  }, [points, failed]);

  // ── Her saved places (small dots) ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkers.current.forEach(m => m.remove());
    placeMarkers.current = places.filter(p => p.lat != null && p.lng != null).map(p => {
      const el = placeEl(p);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([p.lng!, p.lat!]).addTo(map);
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        const cur = propsRef.current;
        if (cur.picking) { cur.onAddPlace?.(p); return; }
        if (!cur.onAddPlace) return;
        const pop = new mapboxgl.Popup({ offset: 10, closeButton: false })
          .setLngLat([p.lng!, p.lat!])
          .setDOMContent(popupFor(p.name, p.address, { label: 'Add to route', run: () => { pop.remove(); propsRef.current.onAddPlace?.(p); } }))
          .addTo(map);
      });
      return marker;
    });
  }, [places, failed]);

  // ── Her position ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!me) { meMarker.current?.remove(); meMarker.current = null; return; }
    if (!meMarker.current) {
      const el = document.createElement('div');
      el.className = s.mbMe;
      meMarker.current = new mapboxgl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(map);
    } else {
      meMarker.current.setLngLat([me.lng, me.lat]);
    }
  }, [me, failed]);

  // ── Framing the whole route ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const all: [number, number][] = [...points.map(p => [p.lng, p.lat] as [number, number]), ...(line ?? []).map(([lat, lng]) => [lng, lat] as [number, number])];
    if (me && follow) all.push([me.lng, me.lat]);
    if (!all.length) return;
    if (all.length === 1) { map.easeTo({ center: all[0], zoom: 15, duration: 700 }); return; }
    const b = all.reduce((acc, c) => acc.extend(c), new mapboxgl.LngLatBounds(all[0], all[0]));
    map.fitBounds(b, { padding: 56, maxZoom: 16, pitch: is3d ? 45 : 0, duration: 900 });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Journey camera: tilted, behind her, facing the next stop ──
  const nextPoint = points.find(p => p.next) ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow || !me || !following) return;
    map.easeTo({
      center: [me.lng, me.lat],
      zoom: Math.max(map.getZoom(), 16.5),
      pitch: is3d ? TILT : 0,
      bearing: is3d && nextPoint ? bearing(me, nextPoint) : map.getBearing(),
      duration: 900,
    });
  }, [me, follow, following, is3d, nextPoint?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle3d = () => {
    const next = !is3d;
    setIs3d(next);
    try { localStorage.setItem(PREF_KEY, next ? '1' : '0'); } catch { /* private mode */ }
    const map = mapRef.current;
    if (!map) return;
    map.setConfigProperty('basemap', 'show3dObjects', next);
    map.easeTo({ pitch: next ? (follow ? TILT : 50) : 0, bearing: next ? map.getBearing() : 0, duration: 800 });
  };

  if (failed === 'webgl' || !mapboxToken()) return <RouteMapFlat {...props} />;

  return (
    <div className={`${s.mapBox} ${picking ? s.mapPicking : ''}`}>
      <div ref={box} className={s.map} />
      <div className={s.mbTools}>
        <button type="button" className={s.mbBtn} onClick={toggle3d} aria-pressed={is3d} aria-label={is3d ? 'Switch to a flat map' : 'Switch to 3D'}>
          {is3d ? <><Square size={15} /> 2D</> : <><Box size={15} /> 3D</>}
        </button>
        {follow && me && !following && (
          <button type="button" className={`${s.mbBtn} ${s.mbBtnOn}`} onClick={() => setFollowing(true)}>
            <LocateFixed size={15} /> Re-centre
          </button>
        )}
      </div>
      {failed === 'token' && (
        <p className={s.mbError}>The map couldn&rsquo;t load. The Mapbox token was refused: check it allows this site&rsquo;s address.</p>
      )}
    </div>
  );
}
