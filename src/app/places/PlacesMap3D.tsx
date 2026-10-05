'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box, Square, Maximize } from 'lucide-react';
import type { DbPlace } from '@/lib/db';
import { mapboxToken } from '@/lib/routing';
import { signedUrl } from '@/lib/upload';
import MapView from './MapView';
import s from './places.module.css';

type Pinned = DbPlace & { lat: number; lng: number };
type Show = 'all' | 'been' | 'wish';

const PREF_KEY = 'yw-map-3d'; // shared with the Routes map
const PIN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

function readPref(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; }
}

/** A round pin with her photo of the place (or a map pin), orange for been, purple for want to go. */
function pinEl(p: Pinned, onClick: () => void) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `${s.mbPin} ${p.wishlist ? s.mbPinWish : ''}`;
  el.setAttribute('aria-label', p.name);
  const face = document.createElement('span');
  face.className = s.mbPinFace;
  face.innerHTML = PIN_SVG;
  el.appendChild(face);
  const label = document.createElement('span');
  label.className = s.mbPinLabel;
  label.textContent = p.name;
  el.appendChild(label);
  if (p.image_url) {
    signedUrl(p.image_url).then(url => {
      if (!url) return;
      face.innerHTML = '';
      face.style.backgroundImage = `url("${url}")`;
      face.classList.add(s.mbPinPhoto);
    }).catch(() => {});
  }
  el.addEventListener('click', ev => { ev.stopPropagation(); onClick(); });
  return el;
}

/**
 * Places on Mapbox's 3D map: a globe when zoomed out (so trips abroad sit where they are on Earth),
 * 3D buildings and landmarks up close, photo pins, and a camera that flies to whichever place she picks.
 */
export default function PlacesMap3D({ places, selected, onSelect }: {
  places: DbPlace[];
  selected: DbPlace | null;
  onSelect: (p: DbPlace | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLElement; key: string }>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(() => !mapboxgl.supported());
  const [is3d, setIs3d] = useState(readPref);
  const [show, setShow] = useState<Show>('all');

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected?.id]);

  const pinned = useMemo(() => places.filter((p): p is Pinned => p.lat != null && p.lng != null), [places]);
  const visible = useMemo(() => pinned.filter(p => show === 'all' || (show === 'wish' ? p.wishlist : !p.wishlist)), [pinned, show]);
  const hasWish = pinned.some(p => p.wishlist), hasBeen = pinned.some(p => !p.wishlist);

  // ── Create the map once ────────────────────────────────
  useEffect(() => {
    const token = mapboxToken();
    if (!box.current || !token || failed) return;
    const light = document.documentElement.dataset.scheme === 'light';
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: box.current,
        style: 'mapbox://styles/mapbox/standard',
        config: { basemap: { lightPreset: light ? 'day' : 'night', show3dObjects: is3d } },
        projection: 'globe',
        center: pinned[0] ? [pinned[0].lng, pinned[0].lat] : [-6.2603, 53.3498],
        zoom: pinned.length ? 3 : 2,
      });
    } catch {
      setTimeout(() => setFailed(true), 0);
      return;
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('click', () => onSelectRef.current(null));
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    const pins = markers.current;
    return () => {
      ro.disconnect();
      pins.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pins (rebuilt only when a place's photo, name or list changes) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const want = new Map(visible.map(p => [p.id, `${p.image_url ?? ''}|${p.wishlist}|${p.name}`]));
    for (const [id, m] of markers.current) {
      if (want.get(id) !== m.key) { m.marker.remove(); markers.current.delete(id); }
    }
    for (const p of visible) {
      const old = markers.current.get(p.id);
      if (old) { old.marker.setLngLat([p.lng, p.lat]); continue; }
      const el = pinEl(p, () => onSelectRef.current(p));
      el.classList.toggle(s.mbPinOn, p.id === selectedIdRef.current);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
      markers.current.set(p.id, { marker, el, key: want.get(p.id)! });
    }
  }, [visible]);

  // ── Highlight and fly to the chosen place ──────────────
  useEffect(() => {
    for (const [id, m] of markers.current) m.el.classList.toggle(s.mbPinOn, id === selected?.id);
    const map = mapRef.current;
    if (!map || selected?.lat == null || selected?.lng == null) return;
    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 15.5),
      pitch: is3d ? 62 : 0,
      bearing: is3d ? map.getBearing() - 25 : 0,
      duration: 2600,
      essential: true,
      padding: { top: 60, bottom: 20, left: 0, right: 0 },
    });
  }, [selected?.id, selected?.lat, selected?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show everything ────────────────────────────────────
  const fitAll = (animate = true) => {
    const map = mapRef.current;
    if (!map || !visible.length) return;
    if (visible.length === 1) {
      map.flyTo({ center: [visible[0].lng, visible[0].lat], zoom: 13, pitch: is3d ? 45 : 0, duration: animate ? 1600 : 0 });
      return;
    }
    const b = visible.reduce((acc, p) => acc.extend([p.lng, p.lat]), new mapboxgl.LngLatBounds([visible[0].lng, visible[0].lat], [visible[0].lng, visible[0].lat]));
    map.fitBounds(b, { padding: 70, maxZoom: 14, pitch: 0, bearing: 0, duration: animate ? 1800 : 0 });
  };
  const fitKey = visible.map(p => p.id).join();
  useEffect(() => { fitAll(false); }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle3d = () => {
    const next = !is3d;
    setIs3d(next);
    try { localStorage.setItem(PREF_KEY, next ? '1' : '0'); } catch { /* private mode */ }
    const map = mapRef.current;
    if (!map) return;
    map.setConfigProperty('basemap', 'show3dObjects', next);
    map.easeTo({ pitch: next && map.getZoom() > 12 ? 60 : 0, bearing: next ? map.getBearing() : 0, duration: 800 });
  };

  if (failed || !mapboxToken()) return <MapView places={places} selected={selected} onSelect={onSelect} />;

  return (
    <div className={`${s.mapWrap} ${s.mbWrap}`}>
      <div ref={box} className={s.map} />
      <div className={s.mbTools}>
        <button type="button" className={s.mbBtn} onClick={toggle3d} aria-pressed={is3d} aria-label={is3d ? 'Switch to a flat map' : 'Switch to 3D'}>
          {is3d ? <><Square size={15} /> 2D</> : <><Box size={15} /> 3D</>}
        </button>
        <button type="button" className={s.mbBtn} onClick={() => { onSelect(null); fitAll(); }}>
          <Maximize size={15} /> Show all
        </button>
      </div>
      {hasWish && hasBeen && (
        <div className={s.mbShow} role="radiogroup" aria-label="Which places">
          {([['all', 'All'], ['been', 'Been'], ['wish', 'Want to go']] as [Show, string][]).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={show === k} className={`${s.mbShowBtn} ${show === k ? s.mbShowOn : ''} ${k === 'been' ? s.mbShowBeen : k === 'wish' ? s.mbShowWish : ''}`} onClick={() => setShow(k)}>
              {k !== 'all' && <span className={s.mbDot} />}{l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
