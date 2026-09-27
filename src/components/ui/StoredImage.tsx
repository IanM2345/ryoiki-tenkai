'use client';
import React, { useEffect, useState } from 'react';
import { signedUrl } from '@/lib/upload';

/** Resolves a stored image value (path, legacy signed URL, blob preview) and shows it. */
export function useImageUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(stored?.startsWith('blob:') ? stored : null);
  useEffect(() => {
    let alive = true;
    signedUrl(stored).then(u => { if (alive) setUrl(u); }, () => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [stored]);
  return url;
}

export default function StoredImage({
  src, alt, className, style, loading = 'lazy', fallback = null,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
  fallback?: React.ReactNode;
}) {
  const url = useImageUrl(src);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  if (!url) return <span className={className} style={{ ...style, display: 'block', background: 'var(--raised)' }} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={style} loading={loading} decoding="async" onError={() => setFailed(true)} />;
}
