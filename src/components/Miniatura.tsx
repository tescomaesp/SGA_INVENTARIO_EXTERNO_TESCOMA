import { ImageOff } from 'lucide-react';
import { useUrlFirmada } from '@/lib/almacenamiento';

/** Foto de producto (bucket privado) con hueco reservado mientras carga. */
export function Miniatura({ ruta, tamano = 48, className = '' }: { ruta: string | null | undefined; tamano?: number; className?: string }) {
  const url = useUrlFirmada('productos', ruta);
  const estilo = { width: tamano, height: tamano };
  if (!ruta) {
    return (
      <span style={estilo} className={`inline-flex shrink-0 items-center justify-center rounded bg-fondo text-suave ${className}`} aria-hidden>
        <ImageOff className="h-1/3 w-1/3" />
      </span>
    );
  }
  return url ? (
    <img src={url} alt="" style={estilo} loading="lazy" className={`shrink-0 rounded bg-fondo object-cover ${className}`} />
  ) : (
    <span style={estilo} className={`inline-block shrink-0 animate-pulse rounded bg-fondo ${className}`} aria-hidden />
  );
}
