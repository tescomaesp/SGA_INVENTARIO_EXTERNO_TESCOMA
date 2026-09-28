import { Entrada } from '@/components/ui';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';

interface Props {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  maximo?: number;
  error?: string;
}

/** Cantidad con botón para llevarse todo lo disponible. */
export function CampoCantidad({ id, valor, onCambio, maximo, error }: Props) {
  const n = leerCantidad(valor);
  const excede = maximo !== undefined && n !== null && n > maximo;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-semibold">
        Cantidad<span className="text-peligro" aria-hidden> *</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Entrada id={id} inputMode="decimal" value={valor} onChange={(e) => onCambio(e.target.value)} className="max-w-[10rem] font-rotulo text-2xl font-bold" aria-invalid={excede || !!error} />
        {maximo !== undefined && (
          <button type="button" onClick={() => onCambio(String(maximo).replace('.', ','))} className="min-h-[44px] rounded border border-linea bg-white px-3 font-semibold hover:bg-fondo">
            Todo ({formatearCantidad(maximo)})
          </button>
        )}
      </div>
      {excede ? (
        <p className="mt-1.5 text-sm text-peligro" role="alert">Solo hay {formatearCantidad(maximo!)} disponibles.</p>
      ) : error ? (
        <p className="mt-1.5 text-sm text-peligro" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
