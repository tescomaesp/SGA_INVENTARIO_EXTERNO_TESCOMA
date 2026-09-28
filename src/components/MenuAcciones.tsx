import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export interface OpcionMenu {
  texto: string;
  icono?: ReactNode;
  peligro?: boolean;
  onClick: () => void;
}

/** Menú desplegable de acciones para un elemento (se cierra con clic fuera o Escape). */
export function MenuAcciones({ opciones, etiqueta, claro }: { opciones: OpcionMenu[]; etiqueta: string; claro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  if (!opciones.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded ${claro ? 'text-white hover:bg-white/15' : 'text-suave hover:bg-fondo hover:text-tinta'}`}
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {abierto && (
        <ul role="menu" className="absolute right-0 z-20 mt-1 min-w-[14rem] overflow-hidden rounded-md border border-linea bg-white py-1 text-tinta shadow-lg">
          {opciones.map((o) => (
            <li key={o.texto} role="none">
              <button
                role="menuitem"
                onClick={() => {
                  setAbierto(false);
                  o.onClick();
                }}
                className={`flex min-h-[44px] w-full items-center gap-3 px-4 text-left hover:bg-fondo ${o.peligro ? 'text-peligro' : ''}`}
              >
                {o.icono}
                {o.texto}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
