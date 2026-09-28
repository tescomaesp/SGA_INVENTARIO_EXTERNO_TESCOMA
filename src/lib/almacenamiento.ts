import { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

const cache = new Map<string, { url: string; caduca: number }>();
const DURACION = 60 * 60; // segundos

/** URL firmada y cacheada para un archivo de un bucket privado. */
export function useUrlFirmada(bucket: string, ruta: string | null | undefined) {
  const clave = ruta ? `${bucket}/${ruta}` : '';
  const [url, setUrl] = useState<string | null>(() => {
    const c = cache.get(clave);
    return c && c.caduca > Date.now() ? c.url : null;
  });

  useEffect(() => {
    if (!ruta) {
      setUrl(null);
      return;
    }
    const c = cache.get(clave);
    if (c && c.caduca > Date.now()) {
      setUrl(c.url);
      return;
    }
    let cancelado = false;
    supabase.storage
      .from(bucket)
      .createSignedUrl(ruta, DURACION)
      .then(({ data }) => {
        if (!data || cancelado) return;
        cache.set(clave, { url: data.signedUrl, caduca: Date.now() + (DURACION - 60) * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelado = true;
    };
  }, [bucket, ruta, clave]);

  return url;
}

/** Comprime una imagen en el navegador antes de subirla. */
export async function comprimirImagen(archivo: File, maxLado = 1600) {
  return imageCompression(archivo, {
    maxWidthOrHeight: maxLado,
    maxSizeMB: 0.8,
    fileType: 'image/webp',
    useWebWorker: true,
  });
}
