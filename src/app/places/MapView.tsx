'use client';
import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { DbPlace } from '@/lib/db';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon paths in Next.js
const iconProto = L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown };
delete iconProto._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const orangeIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ff8c00"/>
      <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
    </svg>`
  )}`,
  iconSize:    [24, 36],
  iconAnchor:  [12, 36],
  popupAnchor: [0, -36],
});

type PinnedPlace = DbPlace & { lat: number; lng: number };

function FlyTo({ place }: { place: DbPlace | null }) {
  const map = useMap();
  useEffect(() => {
    if (place?.lat && place?.lng) {
      map.flyTo([place.lat, place.lng], 14, { duration: 1.2 });
    }
  }, [place, map]);
  return null;
}

function getDirectionsUrl(p: PinnedPlace): string {
  const query = encodeURIComponent(`${p.lat},${p.lng}`);
  const isApple =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) &&
    !('MSStream' in window);
  return isApple
    ? `maps://maps.apple.com/?daddr=${query}`
    : `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

interface MapViewProps {
  places:   DbPlace[];
  selected: DbPlace | null;
  onSelect: (p: DbPlace | null) => void;
  onAdd:    () => void;
}

export default function MapView({ places, selected, onSelect, onAdd }: MapViewProps) {
  const token    = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
  const pinned   = places.filter((p): p is PinnedPlace => p.lat != null && p.lng != null);
  const unpinned = places.filter(p => p.lat == null || p.lng == null);

  const centre: [number, number] = pinned.length > 0
    ? [pinned[0].lat, pinned[0].lng]
    : [48.8566, 2.3522]; // Paris as world default

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', margin:'10px 12px 0', borderRadius:12, border:'1px solid rgba(255,140,0,0.15)' }}>
      <MapContainer
        center={centre}
        zoom={pinned.length === 1 ? 13 : 4}
        style={{ flex:1, height:'100%', minHeight:500 }}
        zoomControl={true}
      >
        <TileLayer
          attribution='© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={`https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/tiles/{z}/{x}/{y}?access_token=${token}`}
          tileSize={512}
          zoomOffset={-1}
        />
        <FlyTo place={selected} />
        {pinned.map(p => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={orangeIcon}
            eventHandlers={{ click: () => onSelect(selected?.id === p.id ? null : p) }}
          >
            <Popup>
              <div style={{ fontFamily:'Comic Sans MS, cursive', minWidth:170 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>{p.name}</div>
                {p.address && <div style={{ fontSize:10, opacity:.65, marginBottom:8 }}>{p.address}</div>}
                {p.rating > 0 && (
                  <div style={{ marginBottom:8, fontSize:13 }}>
                    {'★'.repeat(p.rating)}{'☆'.repeat(5 - p.rating)}
                  </div>
                )}
                <a
                  href={getDirectionsUrl(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display:'inline-block', background:'#ff8c00', color:'#000', borderRadius:5, padding:'5px 12px', fontSize:11, fontWeight:700, textDecoration:'none' }}
                >
                  📍 Get Directions
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {unpinned.length > 0 && (
        <div style={{ padding:'6px 12px', background:'rgba(0,0,0,.5)', borderTop:'1px solid rgba(255,140,0,.1)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontFamily:'monospace', fontSize:8, color:'#8a7060', textTransform:'uppercase', letterSpacing:1 }}>Not on map yet:</span>
          {unpinned.map(p => (
            <span key={p.id} style={{ fontFamily:'monospace', fontSize:9, color:'#c4a882', background:'rgba(255,140,0,.08)', borderRadius:4, padding:'2px 7px' }}>{p.name}</span>
          ))}
          <button onClick={onAdd} style={{ marginLeft:'auto', fontFamily:'monospace', fontSize:8, background:'none', border:'1px solid rgba(255,140,0,.3)', color:'#ff8c00', borderRadius:4, padding:'2px 8px', cursor:'pointer' }}>+ Add place</button>
        </div>
      )}
    </div>
  );
}