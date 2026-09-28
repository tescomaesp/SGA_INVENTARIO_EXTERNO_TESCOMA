import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
}

/** Diálogo modal accesible basado en <dialog> nativo (gestiona foco y tecla Escape). */
export function Dialogo({ abierto, onCerrar, titulo, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onCancel={onCerrar}
      className="w-[min(34rem,calc(100vw-2rem))] rounded-md border border-linea bg-white p-0 text-tinta"
      aria-labelledby="dialogo-titulo"
    >
      <div className="flex items-center justify-between border-b border-linea px-5 py-3">
        <h2 id="dialogo-titulo" className="text-2xl">{titulo}</h2>
        <button onClick={onCerrar} className="rounded p-2 text-suave hover:bg-fondo" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}
