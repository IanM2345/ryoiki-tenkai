/**
 * geocode.ts — free address → lat/lng using Nominatim (OpenStreetMap)
 * No API key needed. Rate limit: 1 req/sec — fine for personal use.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'yourworld-app' } }
    );
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/** Directions link: Apple Maps on Apple devices, Google Maps everywhere else. */
export function directionsUrl(p: { lat: number; lng: number }): string {
  const dest = `${p.lat},${p.lng}`;
  const apple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  return apple ? `https://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
