'use client';
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { DbPlace } from '@/lib/db';
import 'leaflet/dist/leaflet.css';
import s from './places.module.css';
import { directionsUrl } from '@/lib/geocode';

type PinnedPlace = DbPlace & { lat: number; lng: number };

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function pinIcon(color: string, active: boolean) {
  const size = active ? 34 : 28;
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="${size}" height="${size * 34 / 24}" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))">
      <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 34 12 34s12-13.2 12-22.1C24 5.3 18.6 0 12 0z" fill="${color}"/>
      <circle cx="12" cy="12" r="4.6" fill="#fff"/></svg>`,
    iconSize: [size, size * 34 / 24],
    iconAnchor: [size / 2, size * 34 / 24],
    popupAnchor: [0, -size * 34 / 24 + 4],
  });
}

/** Zooms to show every pin, and flies to the selected one. */
function Framing({ pinned, selected }: { pinned: PinnedPlace[]; selected: DbPlace | null }) {
  const map = useMap();
  const key = pinned.map(p => p.id).join();
  useEffect(() => {
    if (!pinned.length) return;
    if (pinned.length === 1) map.setView([pinned[0].lat, pinned[0].lng], 13);
    else map.fitBounds(L.latLngBounds(pinned.map(p => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 14 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected?.lat != null && selected?.lng != null) map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [selected, map]);
  return null;
}

export default function MapView({ places, selected, onSelect }: {
  places: DbPlace[];
  selected: DbPlace | null;
  onSelect: (p: DbPlace | null) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const light = typeof document !== 'undefined' && document.documentElement.dataset.scheme === 'light';
  const pinned = places.filter((p): p is PinnedPlace => p.lat != null && p.lng != null);
  const accent = useMemo(() => cssVar('--or', '#ff8c00'), []);
  const wish = useMemo(() => cssVar('--pu-l', '#a855f7'), []);
  const icons = useMemo(() => ({
    been: pinIcon(accent, false), beenActive: pinIcon(accent, true),
    wish: pinIcon(wish, false), wishActive: pinIcon(wish, true),
  }), [accent, wish]);
  const hasWish = pinned.some(p => p.wishlist);

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

  return (
    <div className={s.mapWrap}>
      <MapContainer center={pinned[0] ? [pinned[0].lat, pinned[0].lng] : [51.5074, -0.1278]} zoom={pinned.length ? 12 : 3} className={s.map} zoomControl>
        <TileLayer {...tiles} />
        <Framing pinned={pinned} selected={selected} />
        {pinned.map(p => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={p.wishlist ? (selected?.id === p.id ? icons.wishActive : icons.wish) : (selected?.id === p.id ? icons.beenActive : icons.been)}
            eventHandlers={{ click: () => onSelect(p) }}
          >
            <Popup>
              <div className={s.popup}>
                <strong>{p.name}</strong>
                {p.wishlist && <span className={s.popupWish}>On your bucket list</span>}
                {p.address && <span>{p.address}</span>}
                <a href={directionsUrl(p)} target="_blank" rel="noopener noreferrer">Get directions</a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {hasWish && (
        <div className={s.legend}>
          <span><span className={s.dotBeen} /> Been</span>
          <span><span className={s.dotWish} /> Want to go</span>
        </div>
      )}
    </div>
  );
}
