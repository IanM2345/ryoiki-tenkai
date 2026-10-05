'use client';
import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, MousePointerClick, MapPin, Bookmark, Search, Loader2, X } from 'lucide-react';
import type { DbPlace, RouteStop } from '@/lib/db';
import { distance, fmtDistance, searchLive, searchOnce, mapboxToken, type LatLng, type SearchResult } from '@/lib/routing';
import s from './routes.module.css';

type Option =
  | { kind: 'here' }
  | { kind: 'map' }
  | { kind: 'place'; place: DbPlace }
  | { kind: 'result'; result: SearchResult }
  | { kind: 'search' };

function optionKey(o: Option, i: number) {
  return o.kind === 'place' ? `p-${o.place.id}` : o.kind === 'result' ? `r-${i}-${o.result.lat}` : o.kind;
}

/**
 * One box in the planner: type to search, or pick "Your location", a saved place, or a spot on the map.
 * The stop only changes when she picks something, so half-typed text never breaks the route.
 */
export default function StopField({ stop, placeholder, places, near, onChange, onPickOnMap, onClear, autoFocus }: {
  stop: RouteStop;
  placeholder: string;
  places: DbPlace[];
  near: LatLng | null;
  onChange: (s: RouteStop) => void;
  onPickOnMap: () => void;
  onClear?: () => void;
  autoFocus?: boolean;
}) {
  const shown = stop.here ? 'Your location' : stop.name;
  const [text, setText] = useState(shown);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Live search needs the Mapbox token; without it there's a Search button instead.
  const [live] = useState<boolean>(() => !!mapboxToken());
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follow outside changes (reorder, best order, another device) while she isn't typing here.
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    if (!open) setText(shown);
  }

  const q = text.trim();
  const typing = open && q !== shown && q.length > 0;

  // Search as she types (when the server has a routing key).
  useEffect(() => {
    if (!typing || q.length < 3 || live === false) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchLive(q, near, ctrl.signal);
        setResults(r ?? []);
      } catch { /* aborted: a newer search is on its way */ }
      finally { if (!ctrl.signal.aborted) setSearching(false); }
    }, 320);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, typing, live, near?.lat, near?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const ql = q.toLowerCase();
  const placeMatches = places
    .filter(p => p.lat != null && p.lng != null)
    .filter(p => !typing || `${p.name} ${p.address ?? ''}`.toLowerCase().includes(ql))
    .sort((a, b) => near ? distance(near, { lat: a.lat!, lng: a.lng! }) - distance(near, { lat: b.lat!, lng: b.lng! }) : 0)
    .slice(0, typing ? 4 : 5);

  const options: Option[] = [
    ...(!typing || 'your location'.includes(ql) || 'my location'.includes(ql) ? [{ kind: 'here' } as Option] : []),
    ...(!typing ? [{ kind: 'map' } as Option] : []),
    ...placeMatches.map(place => ({ kind: 'place', place }) as Option),
    // a search result that's one of her saved places (same name, same spot) only shows once
    ...results
      .filter(r => !placeMatches.some(p => p.name.trim().toLowerCase() === r.name.trim().toLowerCase() && distance(r, { lat: p.lat!, lng: p.lng! }) < 200))
      .map(result => ({ kind: 'result', result }) as Option),
    ...(typing && live === false && q.length >= 2 ? [{ kind: 'search' } as Option] : []),
  ];

  const close = () => { setOpen(false); setResults([]); setText(shown); setActive(0); };

  const choose = async (o: Option) => {
    clearTimeout(blurTimer.current);
    const keep = { id: stop.id, note: stop.note ?? null, link: stop.link ?? null };
    if (o.kind === 'search') {
      setSearching(true);
      const r = await searchOnce(q, near);
      setSearching(false);
      setResults(r);
      setActive(0);
      if (!r.length) setResults([]);
      inputRef.current?.focus();
      return;
    }
    let next: RouteStop | null = null;
    if (o.kind === 'here') next = { ...keep, name: 'Your location', lat: null, lng: null, here: true };
    if (o.kind === 'place') next = { ...keep, name: o.place.name, address: o.place.address, lat: o.place.lat, lng: o.place.lng, place_id: o.place.id };
    if (o.kind === 'result') next = { ...keep, name: o.result.name, address: o.result.address, lat: o.result.lat, lng: o.result.lng };
    setOpen(false); setResults([]); setActive(0);
    inputRef.current?.blur();
    clearTimeout(blurTimer.current); // the blur above would otherwise put the old text back
    if (o.kind === 'map') { setText(shown); onPickOnMap(); return; }
    if (next) { setText(next.here ? 'Your location' : next.name); onChange(next); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = options[active] ?? options[0];
      if (pick) choose(pick);
    } else if (e.key === 'Escape') { close(); inputRef.current?.blur(); }
  };

  const listId = `stop-opts-${stop.id}`;

  return (
    <div className={s.field}>
      <input
        ref={inputRef}
        className={`${s.fieldInput} ${stop.here ? s.fieldHere : ''}`}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
        onFocus={e => { clearTimeout(blurTimer.current); setOpen(true); setActive(0); e.currentTarget.select(); }}
        onBlur={() => { blurTimer.current = setTimeout(close, 150); }}
        onChange={e => { setText(e.target.value); setActive(0); if (!e.target.value.trim()) setResults([]); }}
        onKeyDown={onKey}
      />
      {searching && <Loader2 size={15} className={`${s.fieldSpin} ${s.spin}`} aria-hidden />}
      {!searching && onClear && (stop.name || stop.here) && (
        <button type="button" className={s.fieldClear} onClick={onClear} aria-label="Clear">
          <X size={14} strokeWidth={2.25} />
        </button>
      )}

      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className={s.drop} onPointerDown={e => e.preventDefault()}>
          {options.map((o, i) => (
            <li key={optionKey(o, i)} role="option" aria-selected={i === active}>
              <button type="button" className={`${s.dropItem} ${i === active ? s.dropOn : ''}`} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}>
                {o.kind === 'here' && <><span className={`${s.dropIcon} ${s.dropHere}`}><LocateFixed size={15} /></span><span className={s.dropText}><b>Your location</b><small>Wherever you are when you set off</small></span></>}
                {o.kind === 'map' && <><span className={s.dropIcon}><MousePointerClick size={15} /></span><span className={s.dropText}><b>Choose on map</b><small>Tap any spot</small></span></>}
                {o.kind === 'place' && (
                  <>
                    <span className={`${s.dropIcon} ${o.place.wishlist ? s.dropWish : s.dropPlace}`}>{o.place.wishlist ? <Bookmark size={14} /> : <MapPin size={15} />}</span>
                    <span className={s.dropText}>
                      <b>{o.place.name}</b>
                      <small>{[o.place.wishlist ? 'Bucket list' : 'Your places', near ? fmtDistance(distance(near, { lat: o.place.lat!, lng: o.place.lng! })) : null, o.place.address].filter(Boolean).join(' · ')}</small>
                    </span>
                  </>
                )}
                {o.kind === 'result' && (
                  <>
                    <span className={s.dropIcon}><MapPin size={15} /></span>
                    <span className={s.dropText}>
                      <b>{o.result.name}</b>
                      <small>{[near ? fmtDistance(distance(near, o.result)) : null, o.result.address].filter(Boolean).join(' · ')}</small>
                    </span>
                  </>
                )}
                {o.kind === 'search' && <><span className={s.dropIcon}><Search size={15} /></span><span className={s.dropText}><b>Search for &ldquo;{q}&rdquo;</b><small>Find addresses and landmarks</small></span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && typing && !searching && live === true && q.length >= 3 && options.length === 0 && (
        <div className={s.drop}><p className={s.dropEmpty}>Nothing found for that. Try a street or town name.</p></div>
      )}
    </div>
  );
}
