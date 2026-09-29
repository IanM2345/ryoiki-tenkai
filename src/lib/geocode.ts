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

/** lat/lng → a human address, via Nominatim reverse geocoding. Returns null on failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'yourworld-app' } }
    );
    const data = await res.json();
    if (!data) return null;
    const a = data.address ?? {};
    // Prefer a short, friendly label: place/road + town, not the full civic string.
    const near = a.amenity || a.shop || a.tourism || a.building || a.road || a.neighbourhood;
    const town = a.city || a.town || a.village || a.suburb || a.county;
    const parts = [near, town].filter(Boolean);
    return parts.length ? parts.join(', ') : (data.display_name ?? null);
  } catch {
    return null;
  }
}

export interface DetectedPlace { lat: number; lng: number; address: string | null; }

/**
 * Ask the browser for the current position, then reverse-geocode it.
 * Rejects with a friendly message the UI can show directly.
 */
export function detectLocation(): Promise<DetectedPlace> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error("This device can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const address = await reverseGeocode(lat, lng).catch(() => null);
        resolve({ lat, lng, address });
      },
      err => {
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location is blocked. Allow it in your browser to use this.'
          : err.code === err.TIMEOUT
            ? 'Finding your location took too long. Try again.'
            : "Couldn't find your location.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

/** Directions link: Apple Maps on Apple devices, Google Maps everywhere else. */
export function directionsUrl(p: { lat: number; lng: number }): string {
  const dest = `${p.lat},${p.lng}`;
  const apple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  return apple ? `https://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
