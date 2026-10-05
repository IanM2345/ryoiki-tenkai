'use client';
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import s from './routes.module.css';
import type { MapPoint, RouteMapProps } from './mapTypes';

export type { MapPoint } from './mapTypes';

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function esc(t: string) {
  return t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function stopIcon(p: MapPoint, colors: { start: string; stop: string; end: string; done: string; ink: string }) {
  const bg = p.visited ? colors.done : colors[p.kind];
  const size = p.next ? 34 : 28;
  const ring = p.next ? `box-shadow:0 0 0 4px color-mix(in oklab, ${bg} 35%, transparent),0 3px 8px rgba(0,0,0,.45);` : 'box-shadow:0 3px 8px rgba(0,0,0,.45);';
  const label = p.visited
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    : esc(p.label);
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:${p.kind === 'stop' ? '50%' : '10px'};background:${bg};color:${colors.ink};display:grid;place-items:center;font:700 ${p.next ? 15 : 13}px/1 var(--font);border:2px solid rgba(255,255,255,.85);${ring}">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/** Fits the map to the route whenever `fitKey` changes; follows her position in journey mode. */
function Framing({ points, line, fitKey, me, follow }: { points: MapPoint[]; line: [number, number][] | null; fitKey: string; me: { lat: number; lng: number } | null; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    const all: [number, number][] = [...points.map(p => [p.lat, p.lng] as [number, number]), ...(line ?? [])];
    if (me && follow) all.push([me.lat, me.lng]);
    if (!all.length) return;
    if (all.length === 1) map.setView(all[0], 14);
    else map.fitBounds(L.latLngBounds(all), { padding: [36, 36], maxZoom: 16 });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (follow && me) map.panTo([me.lat, me.lng], { animate: true });
  }, [follow, me, map]);
  // The map's box can change size (panel opening, phone rotating): keep tiles filled.
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function ClickCatcher({ onPick }: { onPick?: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: e => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function RouteMapFlat({ points, line, roads, places, picking, onPick, onAddPlace, me, meAccuracy, follow = false, fitKey, center }: RouteMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const light = typeof document !== 'undefined' && document.documentElement.dataset.scheme === 'light';
  const colors = useMemo(() => ({
    start: cssVar('--gr', '#22c55e'),
    stop: cssVar('--pu-l', '#a855f7'),
    end: cssVar('--or', '#ff8c00'),
    done: cssVar('--tx-d', '#6b6b7b'),
    ink: '#fff',
    line: cssVar('--or', '#ff8c00'),
    me: cssVar('--blue', '#3b82f6'),
    place: cssVar('--tx-m', '#9a9aa8'),
  }), []);

  const tiles = token
    ? {
        url: `https://api.mapbox.com/styles/v1/mapbox/${light ? 'light-v11' : 'navigation-night-v1'}/tiles/{z}/{x}/{y}?access_token=${token}`,
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        tileSize: 512, zoomOffset: -1,
      }
    : {
        url: `https://{s}.basemaps.cartocdn.com/${light ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
        tileSize: 256, zoomOffset: 0,
      };

  const extraPlaces = places.filter(p => p.lat != null && p.lng != null);

  return (
    <div className={`${s.mapBox} ${picking ? s.mapPicking : ''}`}>
      <MapContainer center={center} zoom={points.length ? 13 : 11} className={s.map} zoomControl>
        <TileLayer {...tiles} />
        <Framing points={points} line={line} fitKey={fitKey} me={me} follow={follow} />
        <ClickCatcher onPick={picking ? onPick : undefined} />

        {extraPlaces.map(p => (
          <CircleMarker
            key={p.id}
            center={[p.lat!, p.lng!]}
            radius={6}
            bubblingMouseEvents={false}
            pathOptions={{ color: colors.place, weight: 2, fillColor: p.wishlist ? colors.stop : colors.end, fillOpacity: .55 }}
            eventHandlers={picking ? { click: e => { L.DomEvent.stopPropagation(e); onAddPlace?.(p); } } : undefined}
          >
            {!picking && onAddPlace && (
              <Popup>
                <div className={s.popup}>
                  <strong>{p.name}</strong>
                  {p.address && <span>{p.address}</span>}
                  <button type="button" onClick={() => onAddPlace(p)}>Add to route</button>
                </div>
              </Popup>
            )}
          </CircleMarker>
        ))}

        {line && line.length > 1 && (
          <>
            <Polyline positions={line} pathOptions={{ color: '#000', opacity: .35, weight: 9, lineCap: 'round', lineJoin: 'round' }} />
            <Polyline positions={line} pathOptions={{ color: colors.line, weight: 5, lineCap: 'round', lineJoin: 'round', dashArray: roads ? undefined : '2 10' }} />
          </>
        )}

        {points.map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={stopIcon(p, colors)} zIndexOffset={p.next ? 1000 : p.kind === 'stop' ? 0 : 500}>
            <Popup><div className={s.popup}><strong>{p.name}</strong></div></Popup>
          </Marker>
        ))}

        {me && (
          <>
            {meAccuracy != null && meAccuracy > 15 && (
              <Circle center={[me.lat, me.lng]} radius={meAccuracy} pathOptions={{ color: colors.me, weight: 1, fillColor: colors.me, fillOpacity: .1 }} />
            )}
            <CircleMarker center={[me.lat, me.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: colors.me, fillOpacity: 1 }} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
