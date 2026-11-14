import type { ReactNode } from 'react';
import { Trash2, X } from 'lucide-react';
import { Boton } from './ui';

/** Barra fija inferior con el número de elementos seleccionados y la acción de eliminar. */
export function BarraSeleccion({ texto, onEliminar, onCancelar, extra }: { texto: string; onEliminar: () => void; onCancelar: () => void; extra?: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-peligro bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:left-64"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      role="region"
      aria-label="Elementos seleccionados"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <p className="mr-auto font-semibold" aria-live="polite">{texto}</p>
        {extra}
        <Boton variante="secundario" icono={<X className="h-4 w-4" />} onClick={onCancelar}>Quitar selección</Boton>
        <Boton variante="peligro" icono={<Trash2 className="h-4 w-4" />} onClick={onEliminar}>Eliminar</Boton>
      </div>
    </div>
  );
}
