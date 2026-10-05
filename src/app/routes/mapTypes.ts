import type { DbPlace } from '@/lib/db';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;          // "A", "1", "2", "B"
  kind: 'start' | 'stop' | 'end';
  name: string;
  visited?: boolean;
  next?: boolean;
}

/** Shared by the 3D Mapbox map and the flat fallback map. */
export interface RouteMapProps {
  points: MapPoint[];
  line: [number, number][] | null;
  roads: boolean;
  places: DbPlace[];
  picking: boolean;
  onPick?: (p: { lat: number; lng: number }) => void;
  onAddPlace?: (p: DbPlace) => void;
  me: { lat: number; lng: number } | null;
  meAccuracy?: number | null;
  /** Journey mode: keep the camera on her, looking towards the next stop. */
  follow?: boolean;
  fitKey: string;
  center: [number, number];
}
