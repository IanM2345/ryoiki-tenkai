/**
 * routing.ts — the browser side of Routes: plan a line through the stops, search for
 * places, find the best stop order, format distances, and build Google/Apple Maps links.
 *
 * Road routing, search and best order use Mapbox with the site's public token.
 * Without a token, or offline, everything still works with straight lines and estimates.
 */
import type { RouteMode, RouteStop, RouteLeg } from './db';

export interface LatLng { lat: number; lng: number }

export const MODES: { key: RouteMode; label: string; verb: string }[] = [
  { key: 'walk',    label: 'Walk',      verb: 'walk' },
  { key: 'cycle',   label: 'Cycle',     verb: 'cycle' },
  { key: 'drive',   label: 'Drive',     verb: 'drive' },
  { key: 'transit', label: 'Transit',   verb: 'trip' },
];

/** Rough average speeds (m/s) for estimates when there's no road route. */
const SPEED: Record<RouteMode, number> = { walk: 1.35, cycle: 4.2, drive: 8.5, transit: 5.5 };
/** Real paths wind; a straight line under-counts by about this much. */
const DETOUR = 1.25;

export function newStopId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export function emptyStop(): RouteStop {
  return { id: newStopId(), name: '', lat: null, lng: null };
}

export function hereStop(): RouteStop {
  return { id: newStopId(), name: 'Your location', lat: null, lng: null, here: true };
}

/** Metres between two points. */
export function distance(a: LatLng, b: LatLng): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateSeconds(metres: number, mode: RouteMode): number {
  return metres / SPEED[mode];
}

/** Where a stop actually is right now ("my location" needs the device position). */
export function stopPoint(s: RouteStop, here: LatLng | null): LatLng | null {
  if (s.here) return here;
  return s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null;
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '';
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '';
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ─── Mapbox ──────────────────────────────────────────────────
// Routing, search and best order all use the site's public Mapbox token, straight from the
// browser (that's what public tokens are for; restrict it to her site's address in Mapbox).

const MAPBOX = 'https://api.mapbox.com';
const PROFILE: Record<Exclude<RouteMode, 'transit'>, string> = { walk: 'mapbox/walking', cycle: 'mapbox/cycling', drive: 'mapbox/driving' };
const MAX_DIRECTIONS = 25;   // points per Directions request
const MAX_OPTIMIZE = 12;     // points per Optimization request

export function mapboxToken(): string | null {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || null;
}

const lngLat = (p: LatLng) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

// ─── Planning ────────────────────────────────────────────────

export interface PlannedRoute {
  geometry: [number, number][];
  legs: RouteLeg[];
  distance_m: number;
  duration_s: number;
  /** true = follows real roads; false = straight lines with estimates */
  roads: boolean;
  /** Why it's straight lines, when it is. */
  note?: string;
}

export function straightRoute(points: LatLng[], mode: RouteMode, note?: string): PlannedRoute {
  const legs = points.slice(1).map((p, i) => {
    const d = distance(points[i], p) * DETOUR;
    return { distance_m: Math.round(d), duration_s: Math.round(estimateSeconds(d, mode)) };
  });
  return {
    geometry: points.map(p => [p.lat, p.lng] as [number, number]),
    legs,
    distance_m: legs.reduce((a, l) => a + l.distance_m, 0),
    duration_s: legs.reduce((a, l) => a + l.duration_s, 0),
    roads: false,
    note,
  };
}

/** Keeps the saved line small: round to about 1 m and thin very long lines. */
function compactLine(coords: [number, number][]): [number, number][] {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  const step = Math.max(1, Math.ceil(coords.length / 3000));
  return coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map(([lng, lat]) => [r(lat), r(lng)]);
}

interface MbDirections {
  code: string;
  message?: string;
  routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number; legs: { distance: number; duration: number }[] }[];
}

function directionsProblem(status: number, json: MbDirections | null): string {
  if (status === 401 || status === 403) return 'The Mapbox token was refused, so these are straight lines. Check its URL restrictions in Mapbox.';
  if (status === 429) return 'Mapbox is busy right now, so these are straight lines for a moment.';
  if (json?.code === 'NoSegment') return "One of the stops isn't near a road or path. Try moving it a little.";
  if (json?.code === 'NoRoute') return "There's no way to get between these stops that way. Try another way of travelling.";
  return "Couldn't plan the roads, so these are straight lines for now.";
}

/** One Directions request (up to 25 points). */
async function directions(mode: Exclude<RouteMode, 'transit'>, points: LatLng[], token: string): Promise<PlannedRoute | string> {
  const params = new URLSearchParams({ geometries: 'geojson', overview: 'full', steps: 'false', access_token: token });
  const res = await fetch(`${MAPBOX}/directions/v5/${PROFILE[mode]}/${points.map(lngLat).join(';')}?${params}`);
  const json = await res.json().catch(() => null) as MbDirections | null;
  const route = json?.routes?.[0];
  if (!res.ok || json?.code !== 'Ok' || !route) return directionsProblem(res.status, json);
  return {
    geometry: compactLine(route.geometry.coordinates),
    legs: route.legs.map(l => ({ distance_m: Math.round(l.distance), duration_s: Math.round(l.duration) })),
    distance_m: Math.round(route.distance),
    duration_s: Math.round(route.duration),
    roads: true,
  };
}

export async function planRoute(mode: RouteMode, points: LatLng[]): Promise<PlannedRoute> {
  if (points.length < 2) return straightRoute(points, mode);
  if (mode === 'transit') return straightRoute(points, mode, 'Buses and trains change through the day, so Google Maps plans the times. Use the directions buttons for each step.');
  const token = mapboxToken();
  if (!token) return straightRoute(points, mode, 'Road routing needs the Mapbox token, so these are straight lines and estimates.');
  try {
    // Long routes go in overlapping chunks of 25 points, stitched back together.
    const parts: PlannedRoute[] = [];
    for (let i = 0; i < points.length - 1; i += MAX_DIRECTIONS - 1) {
      const r = await directions(mode, points.slice(i, i + MAX_DIRECTIONS), token);
      if (typeof r === 'string') return straightRoute(points, mode, r);
      parts.push(r);
    }
    return {
      geometry: parts.flatMap((p, i) => (i ? p.geometry.slice(1) : p.geometry)),
      legs: parts.flatMap(p => p.legs),
      distance_m: parts.reduce((a, p) => a + p.distance_m, 0),
      duration_s: parts.reduce((a, p) => a + p.duration_s, 0),
      roads: true,
    };
  } catch {
    return straightRoute(points, mode, 'You seem to be offline, so these are straight lines for now.');
  }
}

// ─── Best order ──────────────────────────────────────────────

/** Order the middle stops so the trip is quickest. Start and end stay put. Returns indexes into `stops`. */
export async function bestOrder(mode: RouteMode, start: LatLng, end: LatLng, stops: LatLng[]): Promise<{ order: number[]; roads: boolean }> {
  const token = mapboxToken();
  if (token && mode !== 'transit' && stops.length + 2 <= MAX_OPTIMIZE) {
    try {
      const all = [start, ...stops, end];
      const params = new URLSearchParams({ source: 'first', destination: 'last', roundtrip: 'false', access_token: token });
      const res = await fetch(`${MAPBOX}/optimized-trips/v1/${PROFILE[mode]}/${all.map(lngLat).join(';')}?${params}`);
      const json = await res.json().catch(() => null) as { code?: string; waypoints?: { waypoint_index: number }[] } | null;
      if (res.ok && json?.code === 'Ok' && json.waypoints?.length === all.length) {
        // waypoint_index = where each given point ends up in the trip
        const order = stops.map((_, i) => i).sort((a, b) => json.waypoints![a + 1].waypoint_index - json.waypoints![b + 1].waypoint_index);
        return { order, roads: true };
      }
    } catch { /* fall through to the local version */ }
  }
  return { order: localBestOrder(start, end, stops), roads: false };
}

/** Nearest-neighbour, then 2-opt clean-up, on straight-line distance. Plenty for a day's stops. */
export function localBestOrder(start: LatLng, end: LatLng, stops: LatLng[]): number[] {
  const n = stops.length;
  if (n < 2) return stops.map((_, i) => i);
  const left = new Set(stops.map((_, i) => i));
  const order: number[] = [];
  let cur = start;
  while (left.size) {
    let best = -1, bestD = Infinity;
    for (const i of left) { const d = distance(cur, stops[i]); if (d < bestD) { bestD = d; best = i; } }
    order.push(best); left.delete(best); cur = stops[best];
  }
  const pt = (k: number) => (k < 0 ? start : k >= n ? end : stops[order[k]]);
  let improved = true, guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = distance(pt(i - 1), pt(i)) + distance(pt(j), pt(j + 1));
        const after = distance(pt(i - 1), pt(j)) + distance(pt(i), pt(j + 1));
        if (after + 1e-6 < before) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return order;
}

// ─── Search ──────────────────────────────────────────────────

export interface SearchResult { name: string; address: string | null; lat: number; lng: number }

interface MbFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; full_address?: string; place_formatted?: string; coordinates?: { latitude: number; longitude: number } };
}

/**
 * Search as she types: places, landmarks, cafes and addresses, nearest first.
 * Returns null when there's no Mapbox token; then the page offers a one-off search instead.
 */
export async function searchLive(q: string, near: LatLng | null, signal?: AbortSignal): Promise<SearchResult[] | null> {
  const token = mapboxToken();
  if (!token) return null;
  const params = new URLSearchParams({ q, limit: '6', auto_complete: 'true', language: 'en', access_token: token });
  if (near) params.set('proximity', `${near.lng.toFixed(4)},${near.lat.toFixed(4)}`);
  try {
    const res = await fetch(`${MAPBOX}/search/searchbox/v1/forward?${params}`, { signal });
    if (!res.ok) return [];
    const json = await res.json() as { features?: MbFeature[] };
    return (json.features ?? []).map(f => {
      const name = f.properties.name ?? q;
      const full = f.properties.full_address ?? f.properties.place_formatted ?? null;
      const address = full && full.startsWith(name) ? full.slice(name.length).replace(/^,\s*/, '') || null : full;
      const lng = f.properties.coordinates?.longitude ?? f.geometry.coordinates[0];
      const lat = f.properties.coordinates?.latitude ?? f.geometry.coordinates[1];
      return { name, address, lat, lng };
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return [];
  }
}

/** One-off search via OpenStreetMap (no key). Used when she presses Search, never per keystroke. */
export async function searchOnce(q: string, near: LatLng | null): Promise<SearchResult[]> {
  const params = new URLSearchParams({ format: 'json', q, limit: '6', addressdetails: '0' });
  if (near) {
    const d = 0.6; // prefer results within ~60 km
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json() as { lat: string; lon: string; display_name: string; name?: string }[];
    return data.map(r => {
      const name = r.name || r.display_name.split(',')[0];
      const rest = r.display_name.startsWith(name) ? r.display_name.slice(name.length).replace(/^,\s*/, '') : r.display_name;
      return { name, address: rest.split(',').slice(0, 3).join(',').trim() || null, lat: +r.lat, lng: +r.lon };
    });
  } catch {
    return [];
  }
}

// ─── Opening in a maps app ───────────────────────────────────

const GOOGLE_MODE: Record<RouteMode, string> = { walk: 'walking', cycle: 'bicycling', drive: 'driving', transit: 'transit' };
const APPLE_MODE: Record<RouteMode, string | null> = { walk: 'w', cycle: null, drive: 'd', transit: 'r' };
const GOOGLE_MAX_WAYPOINTS = 9;
const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** A whole route in Google Maps. `from` null = start from wherever she is. Transit can't take stops, so it goes to the first one. */
export function googleRouteUrl(from: LatLng | null, rest: LatLng[], mode: RouteMode): { url: string; capped: boolean } {
  const pts = mode === 'transit' ? rest.slice(0, 1) : rest;
  const dest = pts[pts.length - 1];
  const mids = pts.slice(0, -1);
  const capped = mids.length > GOOGLE_MAX_WAYPOINTS;
  const p = new URLSearchParams({ api: '1', destination: ll(dest), travelmode: GOOGLE_MODE[mode] });
  if (from) p.set('origin', ll(from));
  if (mids.length) p.set('waypoints', mids.slice(0, GOOGLE_MAX_WAYPOINTS).map(ll).join('|'));
  return { url: `https://www.google.com/maps/dir/?${p}`, capped };
}

/** One step in Google Maps. */
export function googleLegUrl(from: LatLng | null, to: LatLng, mode: RouteMode): string {
  return googleRouteUrl(from, [to], mode).url;
}

/** One step in Apple Maps (Apple Maps links take a single destination). */
export function appleLegUrl(from: LatLng | null, to: LatLng, mode: RouteMode): string {
  const p = new URLSearchParams({ daddr: ll(to) });
  if (from) p.set('saddr', ll(from));
  const flag = APPLE_MODE[mode];
  if (flag) p.set('dirflg', flag);
  return `https://maps.apple.com/?${p}`;
}

// ─── Device position ─────────────────────────────────────────

/** Current position, or a friendly error message. */
export function getPosition(): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error("This device can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED
        ? 'Location is blocked. Allow it in Settings to start from where you are.'
        : "Couldn't find your location.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

/** A route's name, or "To <last stop>" when she hasn't named it. */
export function routeTitle(r: { name?: string | null; stops?: RouteStop[] | null }): string {
  const name = r.name?.trim();
  if (name) return name;
  const stops = Array.isArray(r.stops) ? r.stops : [];
  const last = stops[stops.length - 1];
  const first = stops[0];
  if (last?.name && !last.here) return `To ${last.name}`;
  if (first?.name && !first.here) return `From ${first.name}`;
  return 'New route';
}

/** A random id for this browser, so a journey knows which device is in her pocket. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('yw-device');
    if (!id) { id = newStopId() + newStopId(); localStorage.setItem('yw-device', id); }
    return id;
  } catch {
    return 'this-device';
  }
}
