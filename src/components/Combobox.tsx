import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Loader2, Search } from 'lucide-react';

interface Props<T> {
  id?: string;
  valor: string;
  onCambio: (texto: string) => void;
  buscar: (texto: string) => Promise<T[]>;
  onElegir: (item: T) => void;
  clave: (item: T) => string;
  renderOpcion: (item: T) => ReactNode;
  /** Opción fija al final de la lista (p. ej. "Crear nuevo…"). */
  extra?: { contenido: ReactNode; onElegir: () => void } | null;
  placeholder?: string;
  minimo?: number;
  autoFocus?: boolean;
  etiquetaAria?: string;
}

/** Campo de texto con sugerencias (patrón combobox de WAI-ARIA), navegable con teclado. */
export function Combobox<T>({ id, valor, onCambio, buscar, onElegir, clave, renderOpcion, extra, placeholder, minimo = 1, autoFocus, etiquetaAria }: Props<T>) {
  const idLista = useId();
  const [items, setItems] = useState<T[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [cargando, setCargando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const peticion = useRef(0);

  useEffect(() => {
    const t = valor.trim();
    if (t.length < minimo) {
      setItems([]);
      return;
    }
    const n = ++peticion.current;
    setCargando(true);
    const temporizador = setTimeout(async () => {
      try {
        const r = await buscar(t);
        if (n === peticion.current) setItems(r);
      } finally {
        if (n === peticion.current) setCargando(false);
      }
    }, 250);
    return () => clearTimeout(temporizador);
  }, [valor, buscar, minimo]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => contenedor.current && !contenedor.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const total = items.length + (extra ? 1 : 0);
  const mostrar = abierto && valor.trim().length >= minimo && (total > 0 || cargando);

  const elegir = (i: number) => {
    if (i < items.length) onElegir(items[i]);
    else extra?.onElegir();
    setAbierto(false);
    setActivo(-1);
  };

  return (
    <div ref={contenedor} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
      <input
        id={id}
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={activo >= 0 ? `${idLista}-${activo}` : undefined}
        aria-label={etiquetaAria}
        autoComplete="off"
        autoFocus={autoFocus}
        className="entrada pl-9 pr-9"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => {
          onCambio(e.target.value);
          setAbierto(true);
          setActivo(-1);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAbierto(true);
            setActivo((a) => Math.min(a + 1, total - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActivo((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && mostrar && activo >= 0) {
            e.preventDefault();
            elegir(activo);
          } else if (e.key === 'Escape') {
            setAbierto(false);
          }
        }}
      />
      {cargando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-suave" aria-hidden />}
      {mostrar && (
        <ul id={idLista} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-md border border-linea bg-white py-1 shadow-lg">
          {items.map((it, i) => (
            <li
              key={clave(it)}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={activo === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(i)}
              className={`cursor-pointer px-3 py-2 ${activo === i ? 'bg-acero-claro' : 'hover:bg-fondo'}`}
            >
              {renderOpcion(it)}
            </li>
          ))}
          {extra && (
            <li
              id={`${idLista}-${items.length}`}
              role="option"
              aria-selected={activo === items.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(items.length)}
              className={`cursor-pointer border-t border-linea px-3 py-2.5 font-semibold text-acero ${activo === items.length ? 'bg-acero-claro' : 'hover:bg-fondo'}`}
            >
              {extra.contenido}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
