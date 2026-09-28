import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

interface Props {
  id: string;
  archivo: File | null;
  onCambio: (f: File | null) => void;
  /** Foto ya guardada que se muestra si no se elige otra. */
  urlActual?: string | null;
}

/** Selector de foto: cámara en móvil/tablet o archivo en ordenador, con vista previa. */
export function CampoFoto({ id, archivo, onCambio, urlActual }: Props) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);

  useEffect(() => {
    if (!archivo) return setVista(null);
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const elegir = (f: File | undefined) => {
    if (f && f.type.startsWith('image/')) onCambio(f);
  };
  const imagen = vista ?? urlActual;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md border-2 border-dashed border-linea bg-fondo">
        {imagen ? (
          <img src={imagen} alt="Vista previa de la foto" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-suave">
            <ImagePlus className="h-8 w-8" aria-hidden />
          </div>
        )}
        {archivo && (
          <button type="button" onClick={() => onCambio(null)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-tinta shadow" aria-label="Quitar foto">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={camara} id={id} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={galeria} type="file" accept="image/*" className="sr-only" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" onClick={() => camara.current?.click()} className="inline-flex min-h-[44px] items-center gap-2 rounded border border-linea bg-white px-4 font-semibold hover:bg-fondo">
          <Camera className="h-4 w-4" aria-hidden />
          Hacer foto
        </button>
        <button type="button" onClick={() => galeria.current?.click()} className="inline-flex min-h-[44px] items-center gap-2 rounded px-4 font-semibold text-acero hover:bg-acero-claro">
          <ImagePlus className="h-4 w-4" aria-hidden />
          Elegir archivo
        </button>
      </div>
    </div>
  );
}
