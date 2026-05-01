/**
 * lib/photoUrls.ts
 *
 * Helper für signed URLs aus privaten Storage-Buckets.
 * - Trainer (eingeloggt): clientseitig via supabase.storage.createSignedUrl
 * - Kundinnen (anon, mit Buchungscode): via /api/sign-photo-url Endpoint
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Bucket = 'progress-photos' | 'client-photos';

// In-Memory-Cache: signed URLs sind 1h gültig, wir cachen 50 Min
const CACHE_TTL_MS = 50 * 60 * 1000;
const cache = new Map<string, { url: string; expires: number }>();

/**
 * Extrahiert den Storage-Pfad aus einer gespeicherten URL oder gibt den Pfad direkt zurück.
 * Funktioniert für:
 *   - Alte Public-URLs: https://xxx.supabase.co/storage/v1/object/public/<bucket>/<path>
 *   - Neue reine Pfade: <path>
 */
export function extractStoragePath(urlOrPath: string, bucket: Bucket): string {
  if (!urlOrPath) return '';
  // Reiner Pfad (kein http)
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  // Public-URL → Pfad nach /<bucket>/ extrahieren
  const marker = `/${bucket}/`;
  const idx = urlOrPath.indexOf(marker);
  if (idx === -1) return urlOrPath; // fallback
  return urlOrPath.substring(idx + marker.length).split('?')[0];
}

/**
 * Holt eine signed URL für einen eingeloggten Trainer (clientseitig).
 */
async function getSignedUrlAsTrainer(bucket: Bucket, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message || 'Sign failed');
  return data.signedUrl;
}

/**
 * Holt eine signed URL für eine anonyme Kundin via Buchungscode (Backend-Endpoint).
 */
async function getSignedUrlAsClient(
  bucket: Bucket,
  path: string,
  bookingCode: string
): Promise<string> {
  const res = await fetch('/api/sign-photo-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, path, booking_code: bookingCode }),
  });
  if (!res.ok) throw new Error(`Sign endpoint failed: ${res.status}`);
  const json = await res.json();
  return json.signedUrl;
}

/**
 * React-Hook: gibt signed URL zurück (mit Cache + Loading/Error-State).
 * @param urlOrPath  Wert aus DB (alte Public-URL oder neuer Pfad)
 * @param bucket     'progress-photos' oder 'client-photos'
 * @param bookingCode  Falls gesetzt: anon-Modus via Backend. Sonst: Trainer-Modus.
 */
export function usePhotoUrl(
  urlOrPath: string | null | undefined,
  bucket: Bucket,
  bookingCode?: string
): { url: string | null; loading: boolean; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!urlOrPath) { setUrl(null); return; }
    const path = extractStoragePath(urlOrPath, bucket);
    if (!path) { setUrl(null); return; }

    const cacheKey = `${bucket}::${path}::${bookingCode || 'trainer'}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetcher = bookingCode
      ? getSignedUrlAsClient(bucket, path, bookingCode)
      : getSignedUrlAsTrainer(bucket, path);

    fetcher
      .then(signedUrl => {
        if (cancelled) return;
        cache.set(cacheKey, { url: signedUrl, expires: Date.now() + CACHE_TTL_MS });
        setUrl(signedUrl);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message);
        setUrl(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [urlOrPath, bucket, bookingCode]);

  return { url, loading, error };
}

/**
 * Komponente: <PhotoImg> — Wrapper um <img> mit automatischer signed URL.
 */
import React from 'react';

interface PhotoImgProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
  bucket: Bucket;
  bookingCode?: string;
  fallback?: React.ReactNode;
}

export const PhotoImg: React.FC<PhotoImgProps> = ({ src, bucket, bookingCode, fallback, ...imgProps }) => {
  const { url, loading, error } = usePhotoUrl(src, bucket, bookingCode);
  if (loading) return <div className={imgProps.className} style={{ background: 'rgba(0,0,0,0.05)' }} />;
  if (error || !url) return fallback ? <>{fallback}</> : null;
  return <img {...imgProps} src={url} />;
};
